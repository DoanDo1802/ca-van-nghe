import { Mp3Encoder } from '@breezystack/lamejs';

const MP3_FRAME_SIZE = 1152;
export const VALID_MPEG1_SAMPLE_RATES = [32000, 44100, 48000] as const;

function floatToInt16(sample: number): number {
  const clamped = sample < -1 ? -1 : sample > 1 ? 1 : sample;
  return clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
}

function fillInt16Chunk(
  src: Float32Array,
  offset: number,
  count: number,
  dst: Int16Array
): Int16Array {
  for (let i = 0; i < count; i++) {
    dst[i] = floatToInt16(src[offset + i]);
  }
  return count === dst.length ? dst : dst.subarray(0, count);
}

/**
 * Stateful streaming CBR MP3 encoder.
 * Accepts arbitrary-size Float32 PCM chunks, buffers exact 1152-sample MPEG frames,
 * and resamples non-MPEG-1 input rates (e.g. 96 kHz) cleanly to 48 kHz.
 */
export class StreamingMp3Encoder {
  readonly channels: 1 | 2;
  readonly inputSampleRate: number;
  readonly outputSampleRate: number;
  readonly kbps: number;

  private encoder: Mp3Encoder;
  private chunks: Uint8Array[] = [];
  private leftFrame = new Int16Array(MP3_FRAME_SIZE);
  private rightFrame: Int16Array | null;
  private frameOffset = 0;
  private totalOutputSamples = 0;
  private finished = false;

  // Linear streaming resampler state (used only when inputSampleRate is not 32k/44.1k/48k)
  private readonly needsResample: boolean;
  private readonly resampleStep: number;
  private resamplePos = 0;
  private prevL = 0;
  private prevR = 0;
  private hasPrev = false;

  constructor(channels: 1 | 2, inputSampleRate: number, kbps = 192) {
    this.channels = channels;
    this.inputSampleRate = inputSampleRate;
    this.kbps = kbps;

    const isMpeg1 = (VALID_MPEG1_SAMPLE_RATES as readonly number[]).includes(inputSampleRate);
    this.outputSampleRate = isMpeg1 ? inputSampleRate : 48000;
    this.needsResample = !isMpeg1;
    this.resampleStep = inputSampleRate / this.outputSampleRate;

    this.encoder = new Mp3Encoder(channels, this.outputSampleRate, kbps);
    this.rightFrame = channels === 2 ? new Int16Array(MP3_FRAME_SIZE) : null;
  }

  private pushSample(lFloat: number, rFloat: number): void {
    this.leftFrame[this.frameOffset] = floatToInt16(lFloat);
    if (this.rightFrame) {
      this.rightFrame[this.frameOffset] = floatToInt16(rFloat);
    }
    this.frameOffset++;
    this.totalOutputSamples++;

    if (this.frameOffset >= MP3_FRAME_SIZE) {
      this.encodeFrame(MP3_FRAME_SIZE);
      this.frameOffset = 0;
    }
  }

  private encodeFrame(count: number): void {
    const lSlice = count === MP3_FRAME_SIZE ? this.leftFrame : this.leftFrame.subarray(0, count);
    let encoded: Uint8Array;
    if (this.rightFrame) {
      const rSlice = count === MP3_FRAME_SIZE ? this.rightFrame : this.rightFrame.subarray(0, count);
      encoded = this.encoder.encodeBuffer(lSlice, rSlice);
    } else {
      encoded = this.encoder.encodeBuffer(lSlice);
    }
    if (encoded.length > 0) {
      this.chunks.push(encoded.slice());
    }
  }

  push(left: Float32Array, right: Float32Array | null): void {
    if (this.finished || left.length === 0) return;
    const rArr = this.channels === 2 ? right ?? left : left;

    if (!this.needsResample) {
      let i = 0;
      const len = left.length;
      while (i < len) {
        const take = Math.min(MP3_FRAME_SIZE - this.frameOffset, len - i);
        for (let k = 0; k < take; k++) {
          this.leftFrame[this.frameOffset + k] = floatToInt16(left[i + k]);
        }
        if (this.rightFrame) {
          for (let k = 0; k < take; k++) {
            this.rightFrame[this.frameOffset + k] = floatToInt16(rArr[i + k]);
          }
        }
        this.frameOffset += take;
        this.totalOutputSamples += take;
        i += take;
        if (this.frameOffset >= MP3_FRAME_SIZE) {
          this.encodeFrame(MP3_FRAME_SIZE);
          this.frameOffset = 0;
        }
      }
      return;
    }

    // Streaming linear resampler across chunk boundaries
    const len = left.length;
    if (!this.hasPrev) {
      this.prevL = left[0];
      this.prevR = rArr[0];
      this.hasPrev = true;
      this.resamplePos = 0;
    }

    while (this.resamplePos < len) {
      const idx0 = Math.floor(this.resamplePos);
      const frac = this.resamplePos - idx0;
      const l0 = idx0 < 0 ? this.prevL : left[idx0];
      const l1 = idx0 + 1 < len ? left[idx0 + 1] : left[len - 1];
      const r0 = idx0 < 0 ? this.prevR : rArr[idx0];
      const r1 = idx0 + 1 < len ? rArr[idx0 + 1] : rArr[len - 1];
      this.pushSample(l0 + (l1 - l0) * frac, r0 + (r1 - r0) * frac);
      this.resamplePos += this.resampleStep;
    }

    this.prevL = left[len - 1];
    this.prevR = rArr[len - 1];
    this.resamplePos -= len;
  }

  finish(): { bytes: Uint8Array; sampleRate: number; totalSamples: number } {
    if (!this.finished) {
      this.finished = true;
      if (this.frameOffset > 0) {
        this.encodeFrame(this.frameOffset);
        this.frameOffset = 0;
      }
      const tail = this.encoder.flush();
      if (tail.length > 0) {
        this.chunks.push(tail.slice());
      }
    }
    return {
      bytes: mergeMp3Chunks(this.chunks),
      sampleRate: this.outputSampleRate,
      totalSamples: this.totalOutputSamples,
    };
  }
}

/**
 * Encodes floating-point PCM channels into 192 kbps CBR MP3 frames.
 */
export function encodePcmToMp3(
  left: Float32Array,
  right: Float32Array | null,
  sampleRate: number,
  kbps = 192
): Uint8Array[] {
  const channels = right ? 2 : 1;
  const encoder = new Mp3Encoder(channels, sampleRate, kbps);
  const chunks: Uint8Array[] = [];

  const leftBuf = new Int16Array(MP3_FRAME_SIZE);
  const rightBuf = right ? new Int16Array(MP3_FRAME_SIZE) : null;

  for (let i = 0; i < left.length; i += MP3_FRAME_SIZE) {
    const count = Math.min(MP3_FRAME_SIZE, left.length - i);
    const lChunk = fillInt16Chunk(left, i, count, leftBuf);
    let encoded: Uint8Array;
    if (right && rightBuf) {
      const rChunk = fillInt16Chunk(right, i, count, rightBuf);
      encoded = encoder.encodeBuffer(lChunk, rChunk);
    } else {
      encoded = encoder.encodeBuffer(lChunk);
    }
    if (encoded.length > 0) {
      chunks.push(encoded.slice());
    }
  }

  const tail = encoder.flush();
  if (tail.length > 0) {
    chunks.push(tail.slice());
  }

  return chunks;
}

export function mergeMp3Chunks(chunks: readonly Uint8Array[]): Uint8Array {
  let totalBytes = 0;
  for (let i = 0; i < chunks.length; i++) {
    totalBytes += chunks[i].byteLength;
  }
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (let i = 0; i < chunks.length; i++) {
    merged.set(chunks[i], offset);
    offset += chunks[i].byteLength;
  }
  return merged;
}

/**
 * Encodes floating-point PCM channels into a standard seekable 16-bit PCM WAV Blob.
 */
export function encodePcmToWav(
  left: Float32Array,
  right: Float32Array | null,
  sampleRate: number
): Blob {
  const numChannels = right ? 2 : 1;
  const numSamples = left.length;
  const dataBytes = numSamples * numChannels * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  let pos = 44;
  for (let i = 0; i < numSamples; i++) {
    view.setInt16(pos, floatToInt16(left[i]), true);
    pos += 2;
    if (right) {
      view.setInt16(pos, floatToInt16(right[i]), true);
      pos += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}
