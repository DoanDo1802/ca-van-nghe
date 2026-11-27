import { StreamingMp3Encoder } from './mp3Encoder';

export interface KaraokeRecording {
  id: string;
  title: string;
  singerName: string;
  createdAt: number;
  durationMs: number;
  mimeType: string;
  extension: string;
  url: string;
  sizeBytes: number;
}

export interface KaraokeRecorderSnapshot {
  isRecording: boolean;
  isProcessing: boolean;
  recordingStartedAt: number | null;
  currentTitle: string;
  recordings: KaraokeRecording[];
}

export type KaraokeRecordingTarget =
  | MediaStream
  | {
      stream?: MediaStream;
      audioContext: AudioContext;
      sourceNode: AudioNode;
    };

const RECORDER_WORKLET_URL = '/worklets/pcm-recorder-processor.js';
const RECORDER_PROCESSOR_NAME = 'pcm-recorder-processor';
const MP3_BITRATE_KBPS = 192;

const loadedRecorderContexts = new WeakSet<AudioContext>();
const loadingRecorderPromises = new WeakMap<AudioContext, Promise<void>>();

async function ensureRecorderWorkletLoaded(ctx: AudioContext): Promise<void> {
  if (loadedRecorderContexts.has(ctx)) return;
  let pending = loadingRecorderPromises.get(ctx);
  if (!pending) {
    pending = ctx.audioWorklet.addModule(RECORDER_WORKLET_URL).then(() => {
      loadedRecorderContexts.add(ctx);
      loadingRecorderPromises.delete(ctx);
    });
    loadingRecorderPromises.set(ctx, pending);
  }
  try {
    await pending;
  } catch (err) {
    loadingRecorderPromises.delete(ctx);
    throw err;
  }
}

function sanitizeFilenamePart(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'karaoke'
  );
}

interface Mp3WorkerDonePayload {
  bytes: Uint8Array;
  sampleRate: number;
  totalSamples: number;
}

interface ActiveEncoderSession {
  push: (left: Float32Array, right: Float32Array | null, transfer?: boolean) => void;
  finish: () => Promise<Mp3WorkerDonePayload>;
  abort: () => void;
}

function createStreamingMp3Session(sampleRate: number, kbps = MP3_BITRATE_KBPS): ActiveEncoderSession {
  if (typeof Worker !== 'undefined') {
    try {
      const worker = new Worker(new URL('./mp3EncoderWorker.ts', import.meta.url), {
        type: 'module',
      });
      let workerFailed: Error | null = null;
      let doneResolver: ((res: Mp3WorkerDonePayload) => void) | null = null;
      let doneRejecter: ((err: Error) => void) | null = null;

      const terminate = () => {
        try {
          worker.terminate();
        } catch {
          // ignore
        }
      };

      worker.onmessage = (
        ev: MessageEvent<{
          type?: string;
          buffer?: ArrayBuffer;
          sampleRate?: number;
          totalSamples?: number;
          error?: string;
        }>
      ) => {
        const msg = ev.data;
        if (!msg) return;
        if (msg.type === 'done' && msg.buffer) {
          const resolve = doneResolver;
          doneResolver = null;
          doneRejecter = null;
          terminate();
          resolve?.({
            bytes: new Uint8Array(msg.buffer),
            sampleRate: msg.sampleRate ?? sampleRate,
            totalSamples: msg.totalSamples ?? 0,
          });
        } else if (msg.type === 'error') {
          const err = new Error(msg.error || 'MP3 worker error');
          workerFailed = err;
          const reject = doneRejecter;
          doneResolver = null;
          doneRejecter = null;
          terminate();
          reject?.(err);
        }
      };

      worker.onerror = (ev) => {
        const err = new Error(ev.message || 'MP3 worker failed');
        workerFailed = err;
        const reject = doneRejecter;
        doneResolver = null;
        doneRejecter = null;
        terminate();
        reject?.(err);
      };

      worker.postMessage({ type: 'init', channels: 2, sampleRate, kbps });

      return {
        push: (left, right, transfer = true) => {
          if (workerFailed) return;
          if (transfer) {
            const transfers: Transferable[] = [left.buffer];
            if (right) transfers.push(right.buffer);
            worker.postMessage({ type: 'encode', left, right }, transfers);
          } else {
            worker.postMessage({ type: 'encode', left, right });
          }
        },
        finish: () => {
          if (workerFailed) {
            terminate();
            return Promise.reject(workerFailed);
          }
          return new Promise<Mp3WorkerDonePayload>((resolve, reject) => {
            doneResolver = resolve;
            doneRejecter = reject;
            worker.postMessage({ type: 'finish' });
          });
        },
        abort: () => {
          doneResolver = null;
          doneRejecter = null;
          terminate();
        },
      };
    } catch {
      // Fall through to inline encoder
    }
  }

  const inline = new StreamingMp3Encoder(2, sampleRate, kbps);
  return {
    push: (left, right) => {
      inline.push(left, right);
    },
    finish: () => Promise.resolve(inline.finish()),
    abort: () => {},
  };
}

class KaraokeRecorderManager {
  private isRecording = false;
  private isStarting = false;
  private isProcessing = false;
  private recordingStartedAt: number | null = null;
  private currentTitle = '';
  private currentSingerName = '';
  private recordings: KaraokeRecording[] = [];
  private listeners = new Set<() => void>();
  private stopPromise: Promise<KaraokeRecording | null> | null = null;

  private audioCtx: AudioContext | null = null;
  private ownsAudioCtx = false;
  private sourceNode: AudioNode | null = null;
  private mediaSource: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private scriptNode: ScriptProcessorNode | null = null;
  private silentGain: GainNode | null = null;
  private encoderSession: ActiveEncoderSession | null = null;
  private flushWaiter: (() => void) | null = null;
  private onCleanup: (() => void) | null = null;

  private snapshot: KaraokeRecorderSnapshot = {
    isRecording: false,
    isProcessing: false,
    recordingStartedAt: null,
    currentTitle: '',
    recordings: [],
  };

  private emit(): void {
    this.snapshot = {
      isRecording: this.isRecording,
      isProcessing: this.isProcessing,
      recordingStartedAt: this.recordingStartedAt,
      currentTitle: this.currentTitle,
      recordings: [...this.recordings],
    };
    for (const listener of this.listeners) {
      listener();
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): KaraokeRecorderSnapshot => {
    return this.snapshot;
  };

  isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return Boolean(
      window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    );
  }

  private runCleanup(): void {
    const fn = this.onCleanup;
    this.onCleanup = null;
    if (fn) {
      try {
        fn();
      } catch {
        // ignore cleanup errors
      }
    }
  }

  private teardownAudioGraph(): void {
    const captureNode: AudioNode | null = this.workletNode ?? this.scriptNode;
    if (this.sourceNode && captureNode) {
      try {
        // Targeted disconnect: preserve other downstream connections (e.g. broadcast stream)
        this.sourceNode.disconnect(captureNode);
      } catch {
        // ignore if already disconnected
      }
    }
    if (this.workletNode) {
      try {
        this.workletNode.port.onmessage = null;
        this.workletNode.disconnect();
      } catch {
        // ignore
      }
      this.workletNode = null;
    }
    if (this.scriptNode) {
      try {
        this.scriptNode.onaudioprocess = null;
        this.scriptNode.disconnect();
      } catch {
        // ignore
      }
      this.scriptNode = null;
    }
    if (this.silentGain) {
      try {
        this.silentGain.disconnect();
      } catch {
        // ignore
      }
      this.silentGain = null;
    }
    if (this.mediaSource) {
      try {
        this.mediaSource.disconnect();
      } catch {
        // ignore
      }
      this.mediaSource = null;
    }
    this.sourceNode = null;

    if (this.ownsAudioCtx && this.audioCtx) {
      const ownedCtx = this.audioCtx;
      try {
        void ownedCtx.close();
      } catch {
        // ignore
      }
    }
    this.audioCtx = null;
    this.ownsAudioCtx = false;
  }

  async start(
    target: KaraokeRecordingTarget,
    meta: { title: string; singerName: string },
    onCleanup?: () => void
  ): Promise<boolean> {
    if (!this.isSupported() || this.isRecording || this.isStarting || this.isProcessing) {
      return false;
    }

    const isStreamTarget = target instanceof MediaStream;
    if (isStreamTarget && target.getAudioTracks().length === 0) {
      return false;
    }

    this.isStarting = true;
    this.onCleanup = onCleanup ?? null;

    let ctx: AudioContext | null = null;
    let ownsCtx = false;
    let mediaSource: MediaStreamAudioSourceNode | null = null;
    let sourceNode: AudioNode;
    let session: ActiveEncoderSession | null = null;

    try {
      if (isStreamTarget) {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new AC({ sampleRate: 48000 });
        ownsCtx = true;
        mediaSource = ctx.createMediaStreamSource(target);
        sourceNode = mediaSource;
      } else {
        ctx = target.audioContext;
        ownsCtx = false;
        sourceNode = target.sourceNode;
      }

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      session = createStreamingMp3Session(ctx.sampleRate, MP3_BITRATE_KBPS);

      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      silentGain.connect(ctx.destination);

      this.audioCtx = ctx;
      this.ownsAudioCtx = ownsCtx;
      this.sourceNode = sourceNode;
      this.mediaSource = mediaSource;
      this.silentGain = silentGain;
      this.encoderSession = session;

      let attachedWorklet = false;
      if (typeof AudioWorkletNode !== 'undefined' && ctx.audioWorklet) {
        try {
          await ensureRecorderWorkletLoaded(ctx);
          const worklet = new AudioWorkletNode(ctx, RECORDER_PROCESSOR_NAME, {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2],
          });

          worklet.port.onmessage = (
            ev: MessageEvent<{ type?: string; left?: Float32Array; right?: Float32Array }>
          ) => {
            const msg = ev.data;
            if (!msg) return;
            if (msg.type === 'chunk' && msg.left) {
              this.encoderSession?.push(msg.left, msg.right ?? null, true);
            } else if (msg.type === 'flushed') {
              const waiter = this.flushWaiter;
              this.flushWaiter = null;
              waiter?.();
            }
          };

          sourceNode.connect(worklet);
          worklet.connect(silentGain);
          this.workletNode = worklet;
          attachedWorklet = true;
        } catch {
          attachedWorklet = false;
        }
      }

      if (!attachedWorklet) {
        // Fallback for contexts without AudioWorklet support
        const script = ctx.createScriptProcessor(4096, 2, 2);
        script.onaudioprocess = (ev) => {
          const out = ev.outputBuffer;
          for (let ch = 0; ch < out.numberOfChannels; ch++) {
            out.getChannelData(ch).fill(0);
          }
          if (!this.isRecording || !this.encoderSession) return;
          const inp = ev.inputBuffer;
          if (inp.numberOfChannels === 0) return;
          const left = new Float32Array(inp.getChannelData(0));
          const right =
            inp.numberOfChannels >= 2 ? new Float32Array(inp.getChannelData(1)) : null;
          this.encoderSession.push(left, right, true);
        };
        sourceNode.connect(script);
        script.connect(silentGain);
        this.scriptNode = script;
      }

      this.isStarting = false;
      this.isRecording = true;
      this.recordingStartedAt = Date.now();
      this.currentTitle = meta.title.trim() || 'Bản thu Karaoke';
      this.currentSingerName = meta.singerName.trim() || 'Ca sĩ';
      this.emit();
      return true;
    } catch {
      this.isStarting = false;
      this.isRecording = false;
      this.recordingStartedAt = null;
      this.currentTitle = '';
      this.flushWaiter = null;
      session?.abort();
      this.encoderSession = null;
      this.teardownAudioGraph();
      this.runCleanup();
      return false;
    }
  }

  stop(): Promise<KaraokeRecording | null> {
    if (this.stopPromise) {
      return this.stopPromise;
    }
    if (!this.isRecording) {
      return Promise.resolve(null);
    }

    const startedAt = this.recordingStartedAt ?? Date.now();
    const fallbackDurationMs = Math.max(0, Date.now() - startedAt);
    const title = this.currentTitle || 'Bản thu Karaoke';
    const singerName = this.currentSingerName || 'Ca sĩ';

    this.isRecording = false;
    this.isProcessing = true;
    this.recordingStartedAt = null;
    this.emit();

    const finishPromise = (async (): Promise<KaraokeRecording | null> => {
      try {
        if (this.workletNode) {
          await new Promise<void>((resolve) => {
            let settled = false;
            const done = () => {
              if (settled) return;
              settled = true;
              this.flushWaiter = null;
              window.clearTimeout(timer);
              resolve();
            };
            const timer = window.setTimeout(done, 300);
            this.flushWaiter = done;
            try {
              this.workletNode?.port.postMessage({ type: 'stop' });
            } catch {
              done();
            }
          });
        }

        this.teardownAudioGraph();
        this.runCleanup();

        const session = this.encoderSession;
        this.encoderSession = null;
        if (!session) return null;

        const { bytes, sampleRate, totalSamples } = await session.finish();
        if (bytes.byteLength === 0) return null;

        const mp3Blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/mpeg' });
        const encodedDurationMs =
          sampleRate > 0 ? Math.round((totalSamples / sampleRate) * 1000) : 0;
        const durationMs = Math.max(fallbackDurationMs, encodedDurationMs);

        const created: KaraokeRecording = {
          id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          title,
          singerName,
          createdAt: Date.now(),
          durationMs,
          mimeType: 'audio/mpeg',
          extension: 'mp3',
          url: URL.createObjectURL(mp3Blob),
          sizeBytes: mp3Blob.size,
        };
        this.recordings = [created, ...this.recordings];
        return created;
      } catch {
        this.encoderSession?.abort();
        this.encoderSession = null;
        this.teardownAudioGraph();
        this.runCleanup();
        return null;
      } finally {
        this.isProcessing = false;
        this.currentTitle = '';
        this.stopPromise = null;
        this.emit();
      }
    })();

    this.stopPromise = finishPromise;
    return finishPromise;
  }

  deleteRecording(id: string): void {
    const target = this.recordings.find((r) => r.id === id);
    if (target) {
      try {
        URL.revokeObjectURL(target.url);
      } catch {
        // ignore
      }
      this.recordings = this.recordings.filter((r) => r.id !== id);
      this.emit();
    }
  }

  downloadRecording(rec: KaraokeRecording): void {
    const slug = sanitizeFilenamePart(rec.title);
    const d = new Date(rec.createdAt);
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
      d.getDate()
    ).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(
      d.getMinutes()
    ).padStart(2, '0')}`;
    const a = document.createElement('a');
    a.href = rec.url;
    a.download = `ca-van-nghe-${slug}-${stamp}.${rec.extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

export const karaokeRecorder = new KaraokeRecorderManager();
