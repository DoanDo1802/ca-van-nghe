export const MUSICAL_KEYS = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

export type MusicalKey = (typeof MUSICAL_KEYS)[number];

export type ScaleType =
  | 'minor'
  | 'major'
  | 'pentatonic_minor'
  | 'harmonic_minor'
  | 'dorian'
  | 'chromatic';

export interface ScaleDefinition {
  id: ScaleType;
  label: string;
  shortLabel: string;
  intervals: readonly number[];
}

export const SCALE_DEFINITIONS: Record<ScaleType, ScaleDefinition> = {
  minor: {
    id: 'minor',
    label: 'Thứ (Natural Minor)',
    shortLabel: 'Minor',
    intervals: [0, 2, 3, 5, 7, 8, 10],
  },
  major: {
    id: 'major',
    label: 'Trưởng (Major)',
    shortLabel: 'Major',
    intervals: [0, 2, 4, 5, 7, 9, 11],
  },
  pentatonic_minor: {
    id: 'pentatonic_minor',
    label: 'Ngũ cung Thứ (Rap Trap)',
    shortLabel: 'Pent. Minor',
    intervals: [0, 3, 5, 7, 10],
  },
  harmonic_minor: {
    id: 'harmonic_minor',
    label: 'Thứ Hòa Âm (Harmonic Minor)',
    shortLabel: 'Harm. Minor',
    intervals: [0, 2, 3, 5, 7, 8, 11],
  },
  dorian: {
    id: 'dorian',
    label: 'Dorian (R&B / Hip-Hop)',
    shortLabel: 'Dorian',
    intervals: [0, 2, 3, 5, 7, 9, 10],
  },
  chromatic: {
    id: 'chromatic',
    label: '12 Nốt (Chromatic)',
    shortLabel: 'Chromatic',
    intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  },
};

export interface AutoTuneConfig {
  enabled: boolean;
  autoMatchTone: boolean;
  key: MusicalKey;
  scale: ScaleType;
  retuneSpeedMs: number;
  humanize: number;
  formantPreserve: boolean;
  mix: number;
}

export const DEFAULT_AUTOTUNE_CONFIG: AutoTuneConfig = {
  enabled: false,
  autoMatchTone: false,
  key: 'C',
  scale: 'minor',
  retuneSpeedMs: 0,
  humanize: 0,
  formantPreserve: true,
  mix: 1.0,
};

export type AutoTunePresetId = 'hard_tune' | 'melodic_rap' | 'natural';

export interface AutoTunePreset {
  id: AutoTunePresetId;
  label: string;
  subtitle: string;
  config: Pick<AutoTuneConfig, 'retuneSpeedMs' | 'humanize' | 'formantPreserve' | 'mix'>;
}

export const AUTOTUNE_PRESETS: readonly AutoTunePreset[] = [
  {
    id: 'hard_tune',
    label: 'Hard-Tune',
    subtitle: 'Yeat / T-Pain',
    config: { retuneSpeedMs: 0, humanize: 0, formantPreserve: true, mix: 1.0 },
  },
  {
    id: 'melodic_rap',
    label: 'Melodic Rap',
    subtitle: 'Juice WRLD',
    config: { retuneSpeedMs: 18, humanize: 0.35, formantPreserve: true, mix: 1.0 },
  },
  {
    id: 'natural',
    label: 'Tự nhiên',
    subtitle: 'Pop / Smooth',
    config: { retuneSpeedMs: 45, humanize: 0.65, formantPreserve: true, mix: 1.0 },
  },
];

export interface AutoTuneTelemetry {
  voiced: boolean;
  detectedFreq: number;
  targetFreq: number;
  detectedNote: string;
  targetNote: string;
}

export interface QuantizedPitchResult {
  detectedMidi: number;
  targetMidi: number;
  targetFreq: number;
  ratio: number;
  detectedNote: string;
  targetNote: string;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export function freqToMidi(freq: number): number {
  if (!Number.isFinite(freq) || freq <= 0) return 0;
  return 69 + 12 * Math.log2(freq / 440);
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiToNoteName(midi: number): string {
  if (!Number.isFinite(midi) || midi <= 0) return '--';
  const rounded = Math.round(midi);
  const pc = ((rounded % 12) + 12) % 12;
  const octave = Math.floor(rounded / 12) - 1;
  return `${NOTE_NAMES[pc]}${octave}`;
}

export function getRootKeyIndex(key: MusicalKey): number {
  const idx = MUSICAL_KEYS.indexOf(key);
  return idx >= 0 ? idx : 0;
}

export function quantizePitchToScale(
  freqHz: number,
  key: MusicalKey,
  scale: ScaleType
): QuantizedPitchResult {
  const midiFloat = freqToMidi(freqHz);
  const rounded = Math.round(midiFloat);
  const root = getRootKeyIndex(key);
  const intervals = SCALE_DEFINITIONS[scale]?.intervals ?? SCALE_DEFINITIONS.minor.intervals;
  const allowed = new Set(intervals.map((i) => (root + i) % 12));

  let bestMidi = rounded;
  let bestDist = Infinity;
  for (let offset = -12; offset <= 12; offset++) {
    const candidate = rounded + offset;
    const pc = ((candidate % 12) + 12) % 12;
    if (allowed.has(pc)) {
      const dist = Math.abs(candidate - midiFloat);
      if (dist < bestDist) {
        bestDist = dist;
        bestMidi = candidate;
      }
    }
  }

  const targetFreq = midiToFreq(bestMidi);
  const rawRatio = freqHz > 0 ? targetFreq / freqHz : 1.0;
  const ratio = Math.max(0.5, Math.min(2.0, rawRatio));

  return {
    detectedMidi: rounded,
    targetMidi: bestMidi,
    targetFreq,
    ratio,
    detectedNote: midiToNoteName(rounded),
    targetNote: midiToNoteName(bestMidi),
  };
}

const WORKLET_URL = '/worklets/rap-autotune-processor.js';
const WORKLET_PROCESSOR_NAME = 'rap-autotune-processor';
const loadedContexts = new WeakSet<AudioContext>();
const loadingPromises = new WeakMap<AudioContext, Promise<void>>();

async function ensureAutoTuneWorkletLoaded(ctx: AudioContext): Promise<void> {
  if (loadedContexts.has(ctx)) return;
  let pending = loadingPromises.get(ctx);
  if (!pending) {
    pending = ctx.audioWorklet.addModule(WORKLET_URL).then(() => {
      loadedContexts.add(ctx);
      loadingPromises.delete(ctx);
    });
    loadingPromises.set(ctx, pending);
  }
  try {
    await pending;
  } catch (err) {
    loadingPromises.delete(ctx);
    throw err;
  }
}

export function postAutoTuneConfig(node: AudioWorkletNode, config: AutoTuneConfig): void {
  const def = SCALE_DEFINITIONS[config.scale] ?? SCALE_DEFINITIONS.minor;
  node.port.postMessage({
    type: 'config',
    enabled: config.enabled,
    rootKey: getRootKeyIndex(config.key),
    scaleIntervals: [...def.intervals],
    retuneSpeedMs: Math.max(0, Math.min(100, config.retuneSpeedMs)),
    humanize: Math.max(0, Math.min(1, config.humanize ?? 0)),
    formantPreserve: config.formantPreserve,
    mix: Math.max(0, Math.min(1, config.mix)),
  });
}

export async function createRapAutoTuneNode(
  ctx: AudioContext,
  config: AutoTuneConfig
): Promise<AudioWorkletNode | null> {
  if (typeof AudioWorkletNode === 'undefined' || !ctx.audioWorklet) {
    return null;
  }
  try {
    await ensureAutoTuneWorkletLoaded(ctx);
    const node = new AudioWorkletNode(ctx, WORKLET_PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    postAutoTuneConfig(node, config);
    return node;
  } catch {
    return null;
  }
}

// Krumhansl-Kessler key-finding profiles (relative to tonic = 0)
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function pearsonCorrelation(a: Float64Array, b: readonly number[], shift: number): number {
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < 12; i++) {
    sumA += a[(i + shift) % 12];
    sumB += b[i];
  }
  const meanA = sumA / 12;
  const meanB = sumB / 12;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < 12; i++) {
    const da = a[(i + shift) % 12] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  return den > 1e-9 ? num / den : 0;
}

/**
 * Real-time musical key & scale (Major/Minor) detector using a decaying 12-bin
 * chromagram and Krumhansl-Schmuckler key-profile correlation with hysteresis.
 */
export class KeyToneMatcher {
  private chroma = new Float64Array(12);
  private sampleCount = 0;
  private locked = false;

  reset(): void {
    this.chroma.fill(0);
    this.sampleCount = 0;
    this.locked = false;
  }

  hasLock(): boolean {
    return this.locked;
  }

  // Tone detection relies exclusively on backing music spectrum (`feedSpectrum`)
  // so off-pitch vocal singing from the microphone never corrupts the detected key/scale.
  feedFreq(_freqHz: number, _weight = 0): void {
    return;
  }

  feedSpectrum(freqData: Uint8Array, sampleRate: number, fftSize: number): boolean {
    if (!freqData.length || sampleRate <= 0 || fftSize <= 0) return false;
    const binHz = sampleRate / fftSize;
    const minBin = Math.max(1, Math.floor(80 / binHz));
    const maxBin = Math.min(freqData.length - 1, Math.ceil(2000 / binHz));

    let frameEnergy = 0;
    const frameChroma = new Float64Array(12);
    for (let k = minBin; k <= maxBin; k++) {
      const mag = freqData[k] / 255;
      if (mag < 0.08) continue;
      const freq = k * binHz;
      const midi = Math.round(freqToMidi(freq));
      const pc = ((midi % 12) + 12) % 12;
      frameChroma[pc] += mag * mag;
      frameEnergy += mag * mag;
    }

    if (frameEnergy < 0.15) return false;

    for (let i = 0; i < 12; i++) {
      this.chroma[i] = this.chroma[i] * 0.94 + (frameChroma[i] / frameEnergy) * 2.0;
    }
    this.sampleCount += 1;
    return true;
  }

  estimate(
    currentKey: MusicalKey,
    currentScale: ScaleType
  ): { key: MusicalKey; scale: 'major' | 'minor'; confidence: number } | null {
    if (this.sampleCount < 14) return null;

    let bestKeyIdx = 0;
    let bestScale: 'major' | 'minor' = 'minor';
    let bestScore = -Infinity;

    const currentKeyIdx = getRootKeyIndex(currentKey);
    const currentIsMajorOrMinor = currentScale === 'major' || currentScale === 'minor';
    let currentScore = -Infinity;

    for (let k = 0; k < 12; k++) {
      const majScore = pearsonCorrelation(this.chroma, MAJOR_PROFILE, k);
      const minScore = pearsonCorrelation(this.chroma, MINOR_PROFILE, k);

      if (k === currentKeyIdx && currentScale === 'major') currentScore = majScore;
      if (k === currentKeyIdx && currentScale === 'minor') currentScore = minScore;

      if (majScore > bestScore) {
        bestScore = majScore;
        bestKeyIdx = k;
        bestScale = 'major';
      }
      if (minScore > bestScore) {
        bestScore = minScore;
        bestKeyIdx = k;
        bestScale = 'minor';
      }
    }

    if (bestScore < 0.32) return null;

    // Hysteresis: once locked, require a clear margin before switching keys
    if (this.locked && currentIsMajorOrMinor) {
      const isSame = bestKeyIdx === currentKeyIdx && bestScale === currentScale;
      if (!isSame && bestScore < currentScore + 0.08) {
        return null;
      }
    }

    this.locked = true;
    return {
      key: MUSICAL_KEYS[bestKeyIdx],
      scale: bestScale,
      confidence: bestScore,
    };
  }
}
