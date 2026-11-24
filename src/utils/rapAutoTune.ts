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
  key: MusicalKey;
  scale: ScaleType;
  retuneSpeedMs: number;
  formantPreserve: boolean;
  mix: number;
}

export const DEFAULT_AUTOTUNE_CONFIG: AutoTuneConfig = {
  enabled: false,
  key: 'C',
  scale: 'minor',
  retuneSpeedMs: 0,
  formantPreserve: true,
  mix: 1.0,
};

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
