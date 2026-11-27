/**
 * Real-Time Hard-Tune Vocal Auto-Tune AudioWorkletProcessor (T-Pain / Rapper / Melodic Style).
 *
 * Pipeline:
 * 1. Lock-free circular input buffer + 2-pole 600 Hz Butterworth low-pass ring (zero allocations in process()).
 * 2. Stabilized YIN pitch detection with octave-jump guard, 3-hop median filter, and voiced/unvoiced hold.
 * 3. Musical scale quantization with note hysteresis (~62.5%) and sustained-note humanize.
 * 4. Waveform cross-correlation epoch-locked, sub-sample TD-PSOLA synthesis with optional formant
 *    preservation and smooth voiced/unvoiced crossfade.
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

function median3(a, b, c) {
  if (a > b) {
    if (b > c) return b;
    return a > c ? c : a;
  }
  if (a > c) return a;
  return b > c ? c : b;
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

    // Causal TD-PSOLA lookahead & output padding sized so 2.2 * T0 Hann windows & pitch marks never clamp
    this.maxHalfW = Math.ceil(this.maxLag * 1.15);
    this.inLookahead = this.maxHalfW + Math.ceil(this.maxLag * 0.7) + 48;
    this.outPad = this.maxHalfW + 32;
    this.totalDelay = this.inLookahead + this.outPad;

    this.bufSize = nextPow2(Math.max(4096, this.analysisSize * 2, this.totalDelay * 2 + 512));
    this.bufMask = this.bufSize - 1;

    // Pre-allocated typed arrays (zero allocations in process())
    this.inputRing = new Float32Array(this.bufSize);
    this.lpInputRing = new Float32Array(this.bufSize);
    this.outRing = new Float32Array(this.bufSize);
    this.outNormRing = new Float32Array(this.bufSize);
    this.analysisBuf = new Float32Array(this.analysisSize);
    this.yinBuf = new Float32Array(this.maxLag + 1);

    // 2-pole Butterworth 600 Hz low-pass biquad (-12 dB/oct) for phase-tracking & YIN
    const w0 = (2 * Math.PI * 600) / sr;
    const cosW0 = Math.cos(w0);
    const sinW0 = Math.sin(w0);
    const alphaLP = sinW0 / Math.SQRT2;
    const a0 = 1 + alphaLP;
    this.lpB0 = ((1 - cosW0) * 0.5) / a0;
    this.lpB1 = (1 - cosW0) / a0;
    this.lpB2 = this.lpB0;
    this.lpA1 = (-2 * cosW0) / a0;
    this.lpA2 = (1 - alphaLP) / a0;
    this.lpX1 = 0;
    this.lpX2 = 0;
    this.lpY1 = 0;
    this.lpY2 = 0;

    // Scale pitch-class lookup table (12 semitones)
    this.allowedPitchClasses = new Uint8Array(12);
    this.rootKey = 0; // C
    this.scaleIntervals = DEFAULT_SCALE_INTERVALS.slice();
    this.rebuildScaleMask();

    // User configuration
    this.enabled = false;
    this.retuneSpeedMs = 0; // 0ms = T-Pain instant hard-tune
    this.humanize = 0.0;
    this.formantPreserve = true;
    this.mix = 1.0;

    // Processing state
    this.writeIdx = 0;
    this.hopCounter = 0;
    this.synthCountdown = 0;
    this.analysisMark = 0;
    this.hasAnalysisMark = false;

    this.voiced = false;
    this.unvoicedHoldCount = 0;
    this.voicedEnv = 0.0;
    this.lastValidT0 = Math.round(sr / 180);

    this.detectedFreq = 0;
    this.targetFreq = 0;
    this.detectedMidi = 0;
    this.targetMidi = 0;
    this.currentRatio = 1.0;
    this.targetRatio = 1.0;

    // YIN stabilization state (octave-jump guard + 3-hop median filter)
    this.lastAcceptedFreq = 0;
    this.octaveJumpStreak = 0;
    this.freqHist0 = 0;
    this.freqHist1 = 0;
    this.freqHist2 = 0;
    this.freqHistCount = 0;

    // Quantizer hysteresis & sustained-note humanize state
    this.hasLockedMidi = false;
    this.lockedMidi = 0;
    this.prevTargetMidi = 0;
    this.noteHoldMs = 0;

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
      if (typeof msg.humanize === 'number' && Number.isFinite(msg.humanize)) {
        this.humanize = clamp(msg.humanize, 0, 1);
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
        this.hasAnalysisMark = false;
        this.warmupRemaining = this.outPad + 16;
        this.voiced = false;
        this.unvoicedHoldCount = 0;
        this.voicedEnv = 0.0;
        this.currentRatio = 1.0;
        this.targetRatio = 1.0;
        this.hasLockedMidi = false;
        this.lockedMidi = 0;
        this.prevTargetMidi = 0;
        this.noteHoldMs = 0;
        this.lastAcceptedFreq = 0;
        this.octaveJumpStreak = 0;
        this.freqHistCount = 0;
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
    if (this.hasLockedMidi) {
      const lockedPc = ((this.lockedMidi % 12) + 12) % 12;
      if (!this.allowedPitchClasses[lockedPc]) {
        this.hasLockedMidi = false;
        this.noteHoldMs = 0;
      }
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

    // Note hysteresis: require crossing ~62.5% of the interval before switching notes
    let resultMidi = bestMidi;
    if (this.hasLockedMidi && bestMidi !== this.lockedMidi) {
      const span = Math.abs(bestMidi - this.lockedMidi);
      const moved = Math.abs(midiFloat - this.lockedMidi);
      if (moved < span * 0.625) {
        resultMidi = this.lockedMidi;
      }
    }
    this.lockedMidi = resultMidi;
    this.hasLockedMidi = true;
    return resultMidi;
  }

  detectPitchYIN() {
    const buf = this.analysisBuf;
    const size = this.analysisSize;
    const mask = this.bufMask;
    const startIdx = this.writeIdx - size;

    // Copy LP-filtered signal for YIN pitch/phase estimation
    for (let i = 0; i < size; i++) {
      buf[i] = this.lpInputRing[(startIdx + i) & mask];
    }

    // Compute RMS energy from full-band inputRing aligned to the YIN analysis window center
    let sumSq = 0;
    const rawStart = this.writeIdx - this.analysisSize + Math.floor(this.maxLag * 0.5);
    for (let i = 0; i < this.yinWindow; i++) {
      const s = this.inputRing[(rawStart + i) & mask];
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

    // Tightened fallback (< 0.20) to reduce sub-harmonic (f0 / 2) false locks
    if (bestTau < 0) {
      let minVal = 1.0;
      let minIdx = -1;
      for (let tau = minLag; tau < maxLag; tau++) {
        if (yin[tau] < minVal) {
          minVal = yin[tau];
          minIdx = tau;
        }
      }
      if (minIdx >= 0 && minVal < 0.20) {
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

    let freq = this.sr / betterTau;
    if (!Number.isFinite(freq) || freq < 72 || freq > 950) {
      this.markUnvoiced();
      return;
    }

    // Octave Jump Guard: ignore isolated 1-2 hop octave jumps (0.45x-0.55x or 1.9x-2.1x)
    if (this.voiced && this.lastAcceptedFreq > 0) {
      const jumpRatio = freq / this.lastAcceptedFreq;
      if ((jumpRatio >= 0.45 && jumpRatio <= 0.55) || (jumpRatio >= 1.9 && jumpRatio <= 2.1)) {
        this.octaveJumpStreak++;
        if (this.octaveJumpStreak <= 2) {
          freq = this.lastAcceptedFreq;
        } else {
          this.lastAcceptedFreq = freq;
          this.octaveJumpStreak = 0;
        }
      } else {
        this.lastAcceptedFreq = freq;
        this.octaveJumpStreak = 0;
      }
    } else {
      this.lastAcceptedFreq = freq;
      this.octaveJumpStreak = 0;
    }

    // 3-hop Median Filter (zero allocation)
    this.freqHist0 = this.freqHist1;
    this.freqHist1 = this.freqHist2;
    this.freqHist2 = freq;
    if (this.freqHistCount < 3) this.freqHistCount++;
    const smoothedFreq =
      this.freqHistCount >= 3 ? median3(this.freqHist0, this.freqHist1, this.freqHist2) : freq;

    const wasVoiced = this.voiced;
    this.voiced = true;
    this.unvoicedHoldCount = 0;
    this.detectedFreq = smoothedFreq;
    this.lastValidT0 = clamp(this.sr / smoothedFreq, this.minLag, this.maxLag);

    if (!wasVoiced && this.voicedEnv <= 0) {
      this.synthCountdown = 0;
      this.analysisMark = this.refinePitchMark(this.writeIdx - this.inLookahead, this.lastValidT0);
      this.hasAnalysisMark = true;
    }

    const midiFloat = 69 + 12 * Math.log2(smoothedFreq / 440);
    const qMidi = this.quantizeMidi(midiFloat);
    const qFreq = 440 * Math.pow(2, (qMidi - 69) / 12);

    // Sustained-note humanize: gradually relax pitch pull on long held notes (> ~90ms)
    const hopMs = (this.hopSize / this.sr) * 1000;
    if (qMidi === this.prevTargetMidi) {
      this.noteHoldMs += hopMs;
    } else {
      this.noteHoldMs = 0;
      this.prevTargetMidi = qMidi;
    }

    let correctionStrength = 1.0;
    if (this.humanize > 0 && this.noteHoldMs > 90) {
      const holdFactor = clamp((this.noteHoldMs - 90) / 160, 0, 1);
      correctionStrength = 1.0 - this.humanize * 0.72 * holdFactor;
    }

    const effectiveTargetMidi = midiFloat + (qMidi - midiFloat) * correctionStrength;
    const effectiveTargetFreq = 440 * Math.pow(2, (effectiveTargetMidi - 69) / 12);

    this.detectedMidi = Math.round(midiFloat);
    this.targetMidi = qMidi;
    this.targetFreq = qFreq;

    const rawRatio = clamp(effectiveTargetFreq / smoothedFreq, 0.5, 2.0);
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
    // 5-hop (~27ms @ 48kHz) hold avoids micro-dropouts between sustained vowels
    if (this.unvoicedHoldCount >= 5) {
      this.voiced = false;
      this.detectedFreq = 0;
      this.targetFreq = 0;
      this.detectedMidi = 0;
      this.targetMidi = 0;
      this.targetRatio = 1.0;
      this.hasAnalysisMark = false;
      this.hasLockedMidi = false;
      this.noteHoldMs = 0;
      this.prevTargetMidi = 0;
      this.lastAcceptedFreq = 0;
      this.octaveJumpStreak = 0;
      this.freqHistCount = 0;
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
    // Initial lock / resync: strictly positive peak on 600 Hz Butterworth LP ring within +/-20%
    const searchRadius = Math.max(2, Math.floor(period * 0.2));
    const centerInt = Math.round(centerPos);
    const m = this.bufMask;
    let bestIdx = centerInt;
    let bestVal = -1e9;
    for (let d = -searchRadius; d <= searchRadius; d++) {
      const val = this.lpInputRing[(centerInt + d) & m];
      if (val > bestVal) {
        bestVal = val;
        bestIdx = centerInt + d;
      }
    }
    if (bestVal <= 0) {
      return centerPos;
    }
    if (bestIdx > centerInt - searchRadius && bestIdx < centerInt + searchRadius) {
      const s0 = this.lpInputRing[(bestIdx - 1) & m];
      const s1 = this.lpInputRing[bestIdx & m];
      const s2 = this.lpInputRing[(bestIdx + 1) & m];
      const denom = 2 * (s0 - 2 * s1 + s2);
      if (Math.abs(denom) > 1e-9) {
        const delta = clamp((s0 - s2) / denom, -0.5, 0.5);
        return bestIdx + delta;
      }
    }
    return bestIdx;
  }

  refinePitchMarkByCorrelation(prevMark, predicted, period) {
    // Lock candidate grain waveform directly against previous grain on inputRing (immune to H2/H3 peak-jumping)
    const searchR = Math.max(2, Math.floor(period * 0.12));
    const winHalf = Math.min(96, Math.max(16, Math.floor(period * 0.35)));
    const step = period > 220 ? 3 : period > 120 ? 2 : 1;
    const m = this.bufMask;
    const prevInt = Math.round(prevMark);
    const predInt = Math.round(predicted);

    let bestD = 0;
    let bestScore = -1e18;
    for (let d = -searchR; d <= searchR; d++) {
      let score = 0;
      const cand = predInt + d;
      for (let k = -winHalf; k <= winHalf; k += step) {
        score += this.inputRing[(prevInt + k) & m] * this.inputRing[(cand + k) & m];
      }
      if (score > bestScore) {
        bestScore = score;
        bestD = d;
      }
    }

    if (bestScore <= 1e-9) {
      return predicted;
    }

    let delta = 0;
    if (bestD > -searchR && bestD < searchR) {
      let sPrev = 0;
      let sCur = 0;
      let sNext = 0;
      const center = predInt + bestD;
      for (let k = -winHalf; k <= winHalf; k += step) {
        const pv = this.inputRing[(prevInt + k) & m];
        sPrev += pv * this.inputRing[(center - 1 + k) & m];
        sCur += pv * this.inputRing[(center + k) & m];
        sNext += pv * this.inputRing[(center + 1 + k) & m];
      }
      const denom = 2 * (sPrev - 2 * sCur + sNext);
      if (Math.abs(denom) > 1e-9) {
        delta = clamp((sPrev - sNext) / denom, -0.5, 0.5);
      }
    }

    return prevMark + (predInt + bestD + delta - prevInt);
  }

  placePsolaGrain() {
    const targetIn = this.writeIdx - this.inLookahead;
    const m = this.bufMask;
    const outCenter = this.writeIdx + this.outPad;

    const t0 =
      this.voiced && this.detectedFreq > 0
        ? clamp(this.sr / this.detectedFreq, this.minLag, this.maxLag)
        : this.lastValidT0;
    const ratio = clamp(this.currentRatio, 0.5, 2.0);
    const t1 = clamp(t0 / ratio, this.minLag, this.maxLag);

    // Keep analysis pitch mark phase-locked within +/- 0.5 * T0 of targetIn via correlation
    if (!this.hasAnalysisMark || Math.abs(targetIn - this.analysisMark) > 2.2 * t0) {
      this.analysisMark = this.refinePitchMark(targetIn, t0);
      this.hasAnalysisMark = true;
    } else {
      let guard = 0;
      while (this.analysisMark < targetIn - 0.5 * t0 && guard < 4) {
        this.analysisMark = this.refinePitchMarkByCorrelation(
          this.analysisMark,
          this.analysisMark + t0,
          t0
        );
        guard++;
      }
      guard = 0;
      while (this.analysisMark > targetIn + 0.5 * t0 && guard < 4) {
        this.analysisMark = this.refinePitchMarkByCorrelation(
          this.analysisMark,
          this.analysisMark - t0,
          t0
        );
        guard++;
      }
    }

    // Sub-sample fractional offset of synthesis mark relative to integer outCenter
    const frac = clamp(this.synthCountdown, -1.0, 0.0);

    // Hann window length 2.0 * T0 (widened to 2.2 * T0 when pitching down)
    const widthScale = ratio < 1.0 ? 1.1 : 1.0;
    const halfW = this.formantPreserve
      ? clamp(Math.round(t0 * widthScale), this.minLag, this.maxHalfW)
      : clamp(Math.round(t1 * widthScale), this.minLag, this.maxHalfW);

    // Clamp against actual grain halfW so readCenter + halfW never reads ahead of writeIdx
    const maxAllowedCenter = this.writeIdx - halfW - 4;
    const minAllowedCenter = this.writeIdx - this.bufSize + halfW + 32;
    const readCenter = clamp(this.analysisMark, minAllowedCenter, maxAllowedCenter);

    if (this.formantPreserve) {
      // Formant Preservation ON: extract clean grain from full-band inputRing at 1.0x rate
      for (let k = -halfW; k <= halfW; k++) {
        const u = (k - frac) / halfW;
        if (u <= -1 || u >= 1) continue;
        const w = 0.5 * (1 + Math.cos(Math.PI * u));
        const s = this.readInputLinear(readCenter + k - frac);
        const oIdx = (outCenter + k) & m;
        this.outRing[oIdx] += s * w;
        this.outNormRing[oIdx] += w;
      }
    } else {
      // Formant Preservation OFF: resample inside clean grain by pitch ratio
      for (let k = -halfW; k <= halfW; k++) {
        const u = (k - frac) / halfW;
        if (u <= -1 || u >= 1) continue;
        const w = 0.5 * (1 + Math.cos(Math.PI * u));
        const srcOffset = clamp((k - frac) * ratio, -this.maxHalfW, this.maxHalfW);
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

    const mask = this.bufMask;
    const lpB0 = this.lpB0;
    const lpB1 = this.lpB1;
    const lpB2 = this.lpB2;
    const lpA1 = this.lpA1;
    const lpA2 = this.lpA2;

    // Zero-latency direct bypass when disabled and crossfade finished (keep 2-pole LP ring warm)
    if (!this.enabled && this.enableEnv <= 0) {
      for (let i = 0; i < blockLen; i++) {
        const s = inCh0[i];
        const lp =
          lpB0 * s + lpB1 * this.lpX1 + lpB2 * this.lpX2 - lpA1 * this.lpY1 - lpA2 * this.lpY2;
        this.lpX2 = this.lpX1;
        this.lpX1 = s;
        this.lpY2 = this.lpY1;
        this.lpY1 = lp;
        const wIdx = this.writeIdx & mask;
        this.inputRing[wIdx] = s;
        this.lpInputRing[wIdx] = lp;
        outCh0[i] = s;
        this.writeIdx++;
      }
      for (let c = 1; c < output.length; c++) {
        output[c].set(outCh0);
      }
      return true;
    }

    const envStep = 1 / Math.max(64, Math.round(this.sr * 0.012));
    const voicedEnvStep = 1 / Math.max(32, Math.round(this.sr * 0.008));

    for (let i = 0; i < blockLen; i++) {
      const rawIn = inCh0[i];
      const lp =
        lpB0 * rawIn +
        lpB1 * this.lpX1 +
        lpB2 * this.lpX2 -
        lpA1 * this.lpY1 -
        lpA2 * this.lpY2;
      this.lpX2 = this.lpX1;
      this.lpX1 = rawIn;
      this.lpY2 = this.lpY1;
      this.lpY1 = lp;

      const wIdx = this.writeIdx & mask;
      this.inputRing[wIdx] = rawIn;
      this.lpInputRing[wIdx] = lp;

      this.hopCounter++;
      if (this.hopCounter >= this.hopSize) {
        this.hopCounter = 0;
        this.detectPitchYIN();
      }

      if (this.voiced || this.voicedEnv > 0) {
        if (this.synthCountdown <= 0) {
          if (this.synthCountdown < -this.lastValidT0) {
            this.synthCountdown = 0;
          }
          this.placePsolaGrain();
        }
        this.synthCountdown -= 1;
      } else {
        this.synthCountdown = 0;
      }

      // Read OLA accumulator at writeIdx and clear slot for future reuse
      const rIdx = this.writeIdx & mask;
      const acc = this.outRing[rIdx];
      const norm = this.outNormRing[rIdx];
      this.outRing[rIdx] = 0;
      this.outNormRing[rIdx] = 0;

      const dryDelayed = this.inputRing[(this.writeIdx - this.totalDelay) & mask];
      const psolaOut = norm > 1e-4 ? acc / norm : acc;

      // Smooth 8ms crossfade between TD-PSOLA (voiced) and time-aligned dry pass-through (unvoiced)
      if (this.voiced) {
        if (norm > 1e-4 && this.voicedEnv < 1.0) {
          this.voicedEnv = Math.min(1.0, this.voicedEnv + voicedEnvStep);
        }
      } else if (this.voicedEnv > 0.0) {
        this.voicedEnv = Math.max(0.0, this.voicedEnv - voicedEnvStep);
      }

      const wet = dryDelayed * (1 - this.voicedEnv) + psolaOut * this.voicedEnv;

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
      if (!Number.isFinite(sample)) {
        sample = 0;
      } else if (sample > 0.9) {
        sample = 0.9 + 0.1 * Math.tanh((sample - 0.9) * 10);
      } else if (sample < -0.9) {
        sample = -0.9 + 0.1 * Math.tanh((sample + 0.9) * 10);
      }
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
