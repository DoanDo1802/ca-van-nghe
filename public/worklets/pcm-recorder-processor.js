/**
 * PCM Recorder AudioWorkletProcessor
 * Captures live stereo Float32 PCM samples from the karaoke mix bus in 4096-sample chunks
 * and transfers them off the audio thread with zero decoding overhead.
 */

const CHUNK_SIZE = 4096;

class PcmRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.leftBuf = new Float32Array(CHUNK_SIZE);
    this.rightBuf = new Float32Array(CHUNK_SIZE);
    this.offset = 0;
    this.stopped = false;

    this.port.onmessage = (ev) => {
      const msg = ev.data;
      if (!msg || msg.type !== 'stop') return;
      this.stopped = true;
      if (this.offset > 0) {
        const leftPartial = this.leftBuf.slice(0, this.offset);
        const rightPartial = this.rightBuf.slice(0, this.offset);
        this.offset = 0;
        this.port.postMessage(
          { type: 'chunk', left: leftPartial, right: rightPartial },
          [leftPartial.buffer, rightPartial.buffer]
        );
      }
      this.port.postMessage({ type: 'flushed' });
    };
  }

  flushFullChunk() {
    const left = this.leftBuf;
    const right = this.rightBuf;
    this.leftBuf = new Float32Array(CHUNK_SIZE);
    this.rightBuf = new Float32Array(CHUNK_SIZE);
    this.offset = 0;
    this.port.postMessage({ type: 'chunk', left, right }, [left.buffer, right.buffer]);
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (output) {
      for (let c = 0; c < output.length; c++) {
        output[c].fill(0);
      }
    }

    if (this.stopped) {
      return false;
    }

    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    const ch0 = input[0];
    if (!ch0 || ch0.length === 0) {
      return true;
    }
    const ch1 = input.length > 1 && input[1] && input[1].length === ch0.length ? input[1] : ch0;

    let readPos = 0;
    const len = ch0.length;
    while (readPos < len) {
      const space = CHUNK_SIZE - this.offset;
      const copyCount = Math.min(space, len - readPos);
      this.leftBuf.set(ch0.subarray(readPos, readPos + copyCount), this.offset);
      this.rightBuf.set(ch1.subarray(readPos, readPos + copyCount), this.offset);
      this.offset += copyCount;
      readPos += copyCount;
      if (this.offset >= CHUNK_SIZE) {
        this.flushFullChunk();
      }
    }

    return true;
  }
}

registerProcessor('pcm-recorder-processor', PcmRecorderProcessor);
