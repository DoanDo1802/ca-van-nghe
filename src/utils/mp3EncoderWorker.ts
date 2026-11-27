import { StreamingMp3Encoder } from './mp3Encoder';

type Mp3WorkerMessage =
  | { type: 'init'; channels: 1 | 2; sampleRate: number; kbps?: number }
  | { type: 'encode'; left: Float32Array; right: Float32Array | null }
  | { type: 'finish' };

let session: StreamingMp3Encoder | null = null;

self.onmessage = (ev: MessageEvent<Mp3WorkerMessage>) => {
  try {
    const msg = ev.data;
    if (!msg) return;

    if (msg.type === 'init') {
      session = new StreamingMp3Encoder(msg.channels, msg.sampleRate, msg.kbps ?? 192);
      return;
    }

    if (msg.type === 'encode') {
      if (!session) {
        throw new Error('MP3 encoder session not initialized');
      }
      session.push(msg.left, msg.right);
      return;
    }

    if (msg.type === 'finish') {
      if (!session) {
        throw new Error('MP3 encoder session not initialized');
      }
      const { bytes, sampleRate, totalSamples } = session.finish();
      session = null;
      const buffer = bytes.buffer as ArrayBuffer;
      (self as unknown as { postMessage: (m: unknown, transfer: Transferable[]) => void }).postMessage(
        { type: 'done', buffer, sampleRate, totalSamples },
        [buffer]
      );
    }
  } catch (err) {
    session = null;
    self.postMessage({
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
