/**
 * Real-Time Hard-Tune Vocal Auto-Tune AudioWorkletProcessor (T-Pain / Rapper Style).
 *
 * Pipeline:
 * 1. Lock-free circular input buffer (zero allocations in process()).
 * 2. YIN pitch detection with parabolic interpolation and voiced/unvoiced gating.
 * 3. Instant musical scale quantization (supports 0ms retune speed).
 * 4. Pitch-synchronous TD-PSOLA synthesis with optional formant preservation.
 */

const DEFAULT_SCALE_INTERVALS = [0, 2, 3, 5, 7, 8, 10]; // Natural Minor (C Minor when rootKey=0)

function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

class RapAutoTuneProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    const sr = typeof sampleRate === 'number' && sampleRate > 0 ? sampleRate : 48000;
    this.sr = sr;

    // Vocal pitch detection range: ~78 Hz (low bass rap) to ~900 Hz
    this.minLag = Math.max(8, Math.floor(sr / 900));
    this.maxLag = Math.max(this.minLag + 16, Math.floor(sr / 78));
    this.yinWindow = this.maxLag;
    this.analysisSize = this.yinWindow + this.maxLag + 16;
    this.hopSize = 256;

    // Causal TD-PSOLA lookahead & output padding so every grain is complete before readout
    this.inLookahead = Math.ceil(this.maxLag * 1.25);
    this.outPad = this.maxLag + 8;
    this.totalDelay = this.inLookahead + this.outPad;

    this.bufSize = nextPow2(Math.max(4096, this.analysisSize * 2, this.totalDelay * 2 + 512));
    this.bufMask = this.bufSize - 1;

    // Pre-allocated typed arrays (zero allocations in process())
    this.inputRing = new Float32Array(this.bufSize);
    this.outRing = new Float32Array(this.bufSize);
    this.outNormRing = new Float32Array(this.bufSize);
    this.analysisBuf = new Float32Array(this.analysisSize);
    this.yinBuf = new Float32Array(this.maxLag + 1);

    // Scale pitch-class lookup table (12 semitones)
    this.allowedPitchClasses = new Uint8Array(12);
    this.rootKey = 0; // C
    this.scaleIntervals = DEFAULT_SCALE_INTERVALS.slice();
    this.rebuildScaleMask();

    // User configuration
    this.enabled = false;
    this.retuneSpeedMs = 0; // 0ms = T-Pain instant hard-tune
    this.formantPreserve = true;
    this.mix = 1.0;

    // Processing state
    this.writeIdx = 0;
    this.hopCounter = 0;
    this.synthCountdown = 0;
    this.analysisMark = 0;

    this.voiced = false;
    this.unvoicedHoldCount = 0;
    this.detectedFreq = 0;
    this.targetFreq = 0;
    this.detectedMidi = 0;
    this.targetMidi = 0;
    this.currentRatio = 1.0;
    this.targetRatio = 1.0;

    // Click-free enable/disable crossfade
    this.enableEnv = 0.0;
    this.warmupRemaining = 0;

    // Telemetry throttling (~15 Hz)
    this.telemetrySamples = 0;
    this.telemetryInterval = Math.max(1024, Math.round(sr / 15));

    this.port.onmessage = (ev) => {
      const msg = ev.data;
      if (!msg || msg.type !== 'config') return;

      const wasEnabled = this.enabled;
      if (typeof msg.enabled === 'boolean') {
        this.enabled = msg.enabled;
      }
      if (typeof msg.rootKey === 'number' && Number.isFinite(msg.rootKey)) {
        this.rootKey = ((Math.round(msg.rootKey) % 12) + 12) % 12;
      }
      if (Array.isArray(msg.scaleIntervals) && msg.scaleIntervals.length > 0) {
        this.scaleIntervals = msg.scaleIntervals.map((n) => ((Math.round(n) % 12) + 12) % 12);
      }
      if (typeof msg.retuneSpeedMs === 'number' && Number.isFinite(msg.retuneSpeedMs)) {
        this.retuneSpeedMs = clamp(msg.retuneSpeedMs, 0, 200);
      }
      if (typeof msg.formantPreserve === 'boolean') {
        this.formantPreserve = msg.formantPreserve;
      }
      if (typeof msg.mix === 'number' && Number.isFinite(msg.mix)) {
        this.mix = clamp(msg.mix, 0, 1);
      }
      this.rebuildScaleMask();

      if (!wasEnabled && this.enabled) {
        this.outRing.fill(0);
        this.outNormRing.fill(0);
        this.synthCountdown = 0;
        this.analysisMark = this.writeIdx - this.inLookahead;
        this.warmupRemaining = this.outPad + 16;
        this.voiced = false;
        this.currentRatio = 1.0;
        this.targetRatio = 1.0;
      }
    };
  }

  rebuildScaleMask() {
    this.allowedPitchClasses.fill(0);
    for (let i = 0; i < this.scaleIntervals.length; i++) {
      const pc = (this.rootKey + this.scaleIntervals[i]) % 12;
      this.allowedPitchClasses[pc] = 1;
    }
    // Safety fallback if empty
    let any = false;
    for (let i = 0; i < 12; i++) {
      if (this.allowedPitchClasses[i]) {
        any = true;
        break;
      }
    }
    if (!any) {
      this.allowedPitchClasses.fill(1);
    }
  }

  quantizeMidi(midiFloat) {
    const rounded = Math.round(midiFloat);
    let bestMidi = rounded;
    let bestDist = 1e9;
    // Search +/- 12 semitones around continuous MIDI pitch
    for (let offset = -12; offset <= 12; offset++) {
      const candidate = rounded + offset;
      const pc = ((candidate % 12) + 12) % 12;
      if (this.allowedPitchClasses[pc]) {
        const dist = Math.abs(candidate - midiFloat);
        if (dist < bestDist) {
          bestDist = dist;
          bestMidi = candidate;
        }
      }
    }
    return bestMidi;
  }

  detectPitchYIN() {
    const buf = this.analysisBuf;
    const size = this.analysisSize;
    const mask = this.bufMask;
    const startIdx = this.writeIdx - size;

    for (let i = 0; i < size; i++) {
      buf[i] = this.inputRing[(startIdx + i) & mask];
    }

    // RMS energy check on the latest yinWindow samples
    let sumSq = 0;
    const rmsStart = size - this.yinWindow;
    for (let i = rmsStart; i < size; i++) {
      const s = buf[i];
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / this.yinWindow);
    if (rms < 0.008) {
      this.markUnvoiced();
      return;
    }

    const W = this.yinWindow;
    const maxLag = this.maxLag;
    const minLag = this.minLag;
    const yin = this.yinBuf;

    yin[0] = 1.0;
    let runningSum = 0;

    for (let tau = 1; tau <= maxLag; tau++) {
      let diffSum = 0;
      for (let j = 0; j < W; j++) {
        const d = buf[j] - buf[j + tau];
        diffSum += d * d;
      }
      runningSum += diffSum;
      yin[tau] = runningSum > 1e-12 ? (diffSum * tau) / runningSum : 1.0;
    }

    // First local minimum below strict YIN threshold (0.18)
    let bestTau = -1;
    for (let tau = minLag; tau < maxLag; tau++) {
      if (yin[tau] < 0.18) {
        while (tau + 1 < maxLag && yin[tau + 1] < yin[tau]) {
          tau++;
        }
        bestTau = tau;
        break;
      }
    }

    // Soft fallback for breathy vocals (< 0.28)
    if (bestTau < 0) {
      let minVal = 1.0;
      let minIdx = -1;
      for (let tau = minLag; tau < maxLag; tau++) {
        if (yin[tau] < minVal) {
          minVal = yin[tau];
          minIdx = tau;
        }
      }
      if (minIdx >= 0 && minVal < 0.28) {
        bestTau = minIdx;
      }
    }

    if (bestTau < minLag || bestTau >= maxLag) {
      this.markUnvoiced();
      return;
    }

    // Parabolic interpolation for sub-sample frequency precision
    const s0 = yin[bestTau - 1];
    const s1 = yin[bestTau];
    const s2 = yin[bestTau + 1];
    const denom = 2 * (s0 - 2 * s1 + s2);
    let betterTau = bestTau;
    if (Math.abs(denom) > 1e-9) {
      const delta = clamp((s0 - s2) / denom, -0.5, 0.5);
      betterTau = bestTau + delta;
    }

    const freq = this.sr / betterTau;
    if (!Number.isFinite(freq) || freq < 72 || freq > 950) {
      this.markUnvoiced();
      return;
    }

    this.voiced = true;
    this.unvoicedHoldCount = 0;
    this.detectedFreq = freq;

    const midiFloat = 69 + 12 * Math.log2(freq / 440);
    const qMidi = this.quantizeMidi(midiFloat);
    const qFreq = 440 * Math.pow(2, (qMidi - 69) / 12);

    this.detectedMidi = Math.round(midiFloat);
    this.targetMidi = qMidi;
    this.targetFreq = qFreq;

    const rawRatio = clamp(qFreq / freq, 0.5, 2.0);
    this.targetRatio = rawRatio;

    if (this.retuneSpeedMs <= 0.5) {
      // Zero retune speed: immediate snap (T-Pain hard-tune)
      this.currentRatio = rawRatio;
    } else {
      const tauSec = this.retuneSpeedMs / 1000;
      const alpha = 1 - Math.exp(-this.hopSize / (this.sr * tauSec));
      this.currentRatio += (rawRatio - this.currentRatio) * alpha;
    }
  }

  markUnvoiced() {
    this.unvoicedHoldCount++;
    // Short 1-hop (~5ms) hold prevents micro-dropouts on sustained vowels
    if (this.unvoicedHoldCount >= 2) {
      this.voiced = false;
      this.detectedFreq = 0;
      this.targetFreq = 0;
      this.detectedMidi = 0;
      this.targetMidi = 0;
      this.targetRatio = 1.0;
      if (this.retuneSpeedMs <= 0.5) {
        this.currentRatio = 1.0;
      } else {
        this.currentRatio += (1.0 - this.currentRatio) * 0.35;
      }
    }
  }

  readInputLinear(pos) {
    const idx0 = Math.floor(pos);
    const frac = pos - idx0;
    const m = this.bufMask;
    const x0 = this.inputRing[idx0 & m];
    const x1 = this.inputRing[(idx0 + 1) & m];
    return x0 + (x1 - x0) * frac;
  }

  refinePitchMark(centerPos, period) {
    const searchRadius = Math.max(2, Math.floor(period * 0.14));
    const centerInt = Math.round(centerPos);
    const m = this.bufMask;
    let bestIdx = centerInt;
    let bestVal = -1e9;
    for (let d = -searchRadius; d <= searchRadius; d++) {
      const val = this.inputRing[(centerInt + d) & m];
      if (val > bestVal) {
        bestVal = val;
        bestIdx = centerInt + d;
      }
    }
    return centerPos + (bestIdx - centerPos) * 0.45;
  }

  placePsolaGrain() {
    const targetIn = this.writeIdx - this.inLookahead;
    const m = this.bufMask;
    const outCenter = this.writeIdx + this.outPad;

    if (!this.voiced || this.detectedFreq <= 0) {
      // Unvoiced / consonant pass-through via unity-summed OLA (exact time-aligned dry)
      const halfW = 256;
      const inCenter = targetIn;
      for (let k = -halfW; k <= halfW; k++) {
        const w = 0.5 * (1 + Math.cos((Math.PI * k) / halfW));
        const s = this.inputRing[(inCenter + k) & m];
        const oIdx = (outCenter + k) & m;
        this.outRing[oIdx] += s * w;
        this.outNormRing[oIdx] += w;
      }
      this.analysisMark = inCenter;
      this.synthCountdown += halfW;
      return;
    }

    const t0 = clamp(this.sr / this.detectedFreq, this.minLag, this.maxLag);
    const ratio = clamp(this.currentRatio, 0.5, 2.0);
    const t1 = clamp(t0 / ratio, this.minLag, this.maxLag);

    // Keep analysis pitch mark phase-locked within +/- T0 of targetIn
    if (Math.abs(targetIn - this.analysisMark) > 2.2 * t0) {
      this.analysisMark = this.refinePitchMark(targetIn, t0);
    } else {
      while (this.analysisMark < targetIn - 0.5 * t0) {
        this.analysisMark = this.refinePitchMark(this.analysisMark + t0, t0);
      }
      while (this.analysisMark > targetIn + 0.5 * t0) {
        this.analysisMark -= t0;
      }
    }

    // Clamp so analysisMark + maxLag never reads ahead of writeIdx
    const maxAllowedCenter = this.writeIdx - this.maxLag - 4;
    const minAllowedCenter = this.writeIdx - this.bufSize + this.maxLag + 32;
    const readCenter = clamp(this.analysisMark, minAllowedCenter, maxAllowedCenter);

    if (this.formantPreserve) {
      // Formant Preservation ON: extract grain at 1.0x rate (preserves vocal tract resonances)
      // Overlap at target synthesis period T1; widen slightly on large pitch drops to avoid gaps.
      const halfW = clamp(Math.round(Math.max(t0, t1 * 0.72)), this.minLag, this.maxLag);
      for (let k = -halfW; k <= halfW; k++) {
        const w = 0.5 * (1 + Math.cos((Math.PI * k) / halfW));
        const s = this.readInputLinear(readCenter + k);
        const oIdx = (outCenter + k) & m;
        this.outRing[oIdx] += s * w;
        this.outNormRing[oIdx] += w;
      }
    } else {
      // Formant Preservation OFF: resample inside grain by pitch ratio
      const halfW = clamp(Math.round(t1), this.minLag, this.maxLag);
      for (let k = -halfW; k <= halfW; k++) {
        const w = 0.5 * (1 + Math.cos((Math.PI * k) / halfW));
        const srcOffset = clamp(k * ratio, -this.maxLag, this.maxLag);
        const s = this.readInputLinear(readCenter + srcOffset);
        const oIdx = (outCenter + k) & m;
        this.outRing[oIdx] += s * w;
        this.outNormRing[oIdx] += w;
      }
    }

    this.synthCountdown += t1;
  }

  emitTelemetry() {
    this.port.postMessage({
      type: 'telemetry',
      voiced: this.voiced && this.enabled,
      detectedFreq: this.voiced ? this.detectedFreq : 0,
      targetFreq: this.voiced ? this.targetFreq : 0,
      detectedMidi: this.voiced ? this.detectedMidi : 0,
      targetMidi: this.voiced ? this.targetMidi : 0,
    });
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const outCh0 = output[0];
    const blockLen = outCh0.length;
    const inCh0 = input && input.length > 0 ? input[0] : null;

    if (!inCh0) {
      outCh0.fill(0);
      for (let c = 1; c < output.length; c++) output[c].fill(0);
      return true;
    }

    // Zero-latency direct bypass when disabled and crossfade finished
    if (!this.enabled && this.enableEnv <= 0) {
      for (let i = 0; i < blockLen; i++) {
        const s = inCh0[i];
        this.inputRing[this.writeIdx & this.bufMask] = s;
        outCh0[i] = s;
        this.writeIdx++;
      }
      for (let c = 1; c < output.length; c++) {
        output[c].set(outCh0);
      }
      return true;
    }

    const mask = this.bufMask;
    const envStep = 1 / Math.max(64, Math.round(this.sr * 0.012));

    for (let i = 0; i < blockLen; i++) {
      const rawIn = inCh0[i];
      this.inputRing[this.writeIdx & mask] = rawIn;

      this.hopCounter++;
      if (this.hopCounter >= this.hopSize) {
        this.hopCounter = 0;
        this.detectPitchYIN();
      }

      if (this.synthCountdown <= 0) {
        this.placePsolaGrain();
      }
      this.synthCountdown -= 1;

      // Read OLA accumulator at writeIdx and clear slot for future reuse
      const rIdx = this.writeIdx & mask;
      const acc = this.outRing[rIdx];
      const norm = this.outNormRing[rIdx];
      this.outRing[rIdx] = 0;
      this.outNormRing[rIdx] = 0;

      const dryDelayed = this.inputRing[(this.writeIdx - this.totalDelay) & mask];
      const wet = norm > 1e-4 ? acc / norm : dryDelayed;

      if (this.enabled) {
        if (this.warmupRemaining > 0) {
          this.warmupRemaining--;
        } else if (this.enableEnv < 1.0) {
          this.enableEnv = Math.min(1.0, this.enableEnv + envStep);
        }
      } else if (this.enableEnv > 0.0) {
        this.enableEnv = Math.max(0.0, this.enableEnv - envStep);
      }

      const effectiveMix = this.mix * this.enableEnv;
      // During warmup blend smoothly from rawIn; once active, dryDelayed and wet are phase-aligned
      const baseDry = this.warmupRemaining > 0 ? rawIn : dryDelayed;
      let sample = baseDry * (1 - effectiveMix) + wet * effectiveMix;
      if (!Number.isFinite(sample)) sample = 0;
      outCh0[i] = clamp(sample, -1.0, 1.0);

      this.writeIdx++;
      this.telemetrySamples++;
      if (this.telemetrySamples >= this.telemetryInterval) {
        this.telemetrySamples = 0;
        this.emitTelemetry();
      }
    }

    for (let c = 1; c < output.length; c++) {
      output[c].set(outCh0);
    }
    return true;
  }
}

registerProcessor('rap-autotune-processor', RapAutoTuneProcessor);
