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
  recordingStartedAt: number | null;
  currentTitle: string;
  recordings: KaraokeRecording[];
}

function pickSupportedAudioMimeType(): { mimeType: string; extension: string } {
  if (typeof MediaRecorder === 'undefined') {
    return { mimeType: '', extension: 'webm' };
  }
  const candidates: Array<{ mimeType: string; extension: string }> = [
    { mimeType: 'audio/webm;codecs=opus', extension: 'webm' },
    { mimeType: 'audio/webm', extension: 'webm' },
    { mimeType: 'audio/mp4', extension: 'm4a' },
    { mimeType: 'audio/ogg;codecs=opus', extension: 'ogg' },
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c.mimeType)) {
        return c;
      }
    } catch {
      // ignore unsupported check errors
    }
  }
  return { mimeType: '', extension: 'webm' };
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

class KaraokeRecorderManager {
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private isRecording = false;
  private recordingStartedAt: number | null = null;
  private currentTitle = '';
  private currentSingerName = '';
  private currentMimeType = 'audio/webm';
  private currentExtension = 'webm';
  private recordings: KaraokeRecording[] = [];
  private listeners = new Set<() => void>();
  private stopResolvers: Array<(rec: KaraokeRecording | null) => void> = [];
  private onCleanup: (() => void) | null = null;
  private snapshot: KaraokeRecorderSnapshot = {
    isRecording: false,
    recordingStartedAt: null,
    currentTitle: '',
    recordings: [],
  };

  private emit(): void {
    this.snapshot = {
      isRecording: this.isRecording,
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
    return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined';
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

  start(
    stream: MediaStream,
    meta: { title: string; singerName: string },
    onCleanup?: () => void
  ): boolean {
    if (!this.isSupported() || this.isRecording) return false;
    if (!stream || stream.getAudioTracks().length === 0) return false;

    const { mimeType, extension } = pickSupportedAudioMimeType();
    try {
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      this.onCleanup = onCleanup ?? null;
      this.chunks = [];
      this.recorder = recorder;
      this.isRecording = true;
      this.recordingStartedAt = Date.now();
      this.currentTitle = meta.title.trim() || 'Bản thu Karaoke';
      this.currentSingerName = meta.singerName.trim() || 'Ca sĩ';
      this.currentMimeType = recorder.mimeType || mimeType || 'audio/webm';
      this.currentExtension = extension;

      recorder.ondataavailable = (ev: BlobEvent) => {
        if (ev.data && ev.data.size > 0) {
          this.chunks.push(ev.data);
        }
      };

      recorder.onstop = () => {
        const startedAt = this.recordingStartedAt ?? Date.now();
        const durationMs = Math.max(0, Date.now() - startedAt);
        const blob = new Blob(this.chunks, { type: this.currentMimeType });
        this.chunks = [];
        this.recorder = null;
        this.isRecording = false;
        this.recordingStartedAt = null;

        let created: KaraokeRecording | null = null;
        if (blob.size > 0) {
          created = {
            id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            title: this.currentTitle,
            singerName: this.currentSingerName,
            createdAt: Date.now(),
            durationMs,
            mimeType: this.currentMimeType,
            extension: this.currentExtension,
            url: URL.createObjectURL(blob),
            sizeBytes: blob.size,
          };
          this.recordings = [created, ...this.recordings];
        }

        this.currentTitle = '';
        this.runCleanup();
        this.emit();

        const resolvers = this.stopResolvers.splice(0, this.stopResolvers.length);
        for (const resolve of resolvers) {
          resolve(created);
        }
      };

      recorder.onerror = () => {
        this.isRecording = false;
        this.recordingStartedAt = null;
        this.recorder = null;
        this.chunks = [];
        this.currentTitle = '';
        this.runCleanup();
        this.emit();
        const resolvers = this.stopResolvers.splice(0, this.stopResolvers.length);
        for (const resolve of resolvers) {
          resolve(null);
        }
      };

      recorder.start(250);
      this.emit();
      return true;
    } catch {
      this.isRecording = false;
      this.recordingStartedAt = null;
      this.recorder = null;
      this.chunks = [];
      this.runCleanup();
      return false;
    }
  }

  stop(): Promise<KaraokeRecording | null> {
    if (!this.isRecording || !this.recorder) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      this.stopResolvers.push(resolve);
      try {
        if (this.recorder && this.recorder.state !== 'inactive') {
          this.recorder.stop();
        } else {
          const resolvers = this.stopResolvers.splice(0, this.stopResolvers.length);
          for (const r of resolvers) r(null);
        }
      } catch {
        const resolvers = this.stopResolvers.splice(0, this.stopResolvers.length);
        for (const r of resolvers) r(null);
      }
    });
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
