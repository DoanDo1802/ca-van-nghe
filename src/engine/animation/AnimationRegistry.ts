import type {
  AnimationClipEntry,
  AnimationManifest,
  CoreAnimSlotId,
  EmoteSliceEntry,
} from '../../types/characterStudio';

export const CORE_SLOT_STATE_NAMES: Record<CoreAnimSlotId, string> = {
  idle: 'Idle_Loop',
  walk: 'Walk_Loop',
  run: 'Running',
  jump: 'Jumping',
  jumpRun: 'JumpWhileRun',
  sit: 'Crouch_Idle_Loop',
  talk: 'Idle_Talking_Loop',
};

export const DEFAULT_ANIMATION_MANIFEST: AnimationManifest = {
  version: '1.0.0',
  slots: {
    idle: 'idle_loop',
    walk: 'walk_loop',
    run: 'running',
    jump: 'jumping',
    jumpRun: 'jump_while_run',
    sit: 'crouch_idle_loop',
    talk: 'idle_talking_loop',
  },
  defaultSlots: {
    idle: 'idle_loop',
    walk: 'walk_loop',
    run: 'running',
    jump: 'jumping',
    jumpRun: 'jump_while_run',
    sit: 'crouch_idle_loop',
    talk: 'idle_talking_loop',
  },
  emotes: [
    {
      id: 'sing',
      label: 'Hát',
      sublabel: 'Singing',
      accent: '#f43f5e',
      icon: 'mic',
      clipId: 'singing',
      isBuiltIn: true,
    },
    {
      id: 'samba',
      label: 'Nhảy Samba',
      sublabel: 'Samba Dancing',
      accent: '#f59e0b',
      icon: 'sparkles',
      clipId: 'samba_dancing',
      isBuiltIn: true,
    },
    {
      id: 'hiphop',
      label: 'Slide Hip Hop',
      sublabel: 'Hip Hop Dance',
      accent: '#38bdf8',
      icon: 'music',
      clipId: 'slide_hip_hop_dance',
      isBuiltIn: true,
    },
    {
      id: 'swing',
      label: 'Swing Dance',
      sublabel: 'Swing Dancing',
      accent: '#a855f7',
      icon: 'music',
      clipId: 'swing_dancing',
      isBuiltIn: true,
    },
    {
      id: 'wavehiphop',
      label: 'Wave Hip Hop',
      sublabel: 'Wave Hip Hop Dance',
      accent: '#10b981',
      icon: 'music',
      clipId: 'wave_hip_hop_dance',
      isBuiltIn: true,
    },
    {
      id: 'twerk',
      label: 'Dancing Twerk',
      sublabel: 'Dancing Twerk',
      accent: '#ec4899',
      icon: 'flame',
      clipId: 'dancing_twerk',
      isBuiltIn: true,
    },
  ],
  clips: [
    {
      id: 'idle_loop',
      name: 'Idle_Loop',
      url: '/animations/core_locomotion.glb',
      trackName: 'Idle_Loop',
      speed: 1,
      loop: true,
      inPlace: true,
      isBuiltIn: true,
    },
    {
      id: 'walk_loop',
      name: 'Walk_Loop',
      url: '/animations/core_locomotion.glb',
      trackName: 'Walk_Loop',
      speed: 1,
      loop: true,
      inPlace: true,
      isBuiltIn: true,
    },
    {
      id: 'running',
      name: 'Running',
      url: '/animations/core_locomotion.glb',
      trackName: 'Running',
      speed: 1,
      loop: true,
      inPlace: true,
      isBuiltIn: true,
    },
    {
      id: 'jumping',
      name: 'Jumping',
      url: '/animations/core_locomotion.glb',
      trackName: 'Jumping',
      speed: 1,
      loop: false,
      inPlace: true,
      isBuiltIn: true,
    },
    {
      id: 'jump_while_run',
      name: 'JumpWhileRun',
      url: '/animations/core_locomotion.glb',
      trackName: 'JumpWhileRun',
      speed: 1,
      loop: false,
      inPlace: true,
      isBuiltIn: true,
    },
    {
      id: 'crouch_idle_loop',
      name: 'Crouch_Idle_Loop',
      url: '/animations/core_locomotion.glb',
      trackName: 'Crouch_Idle_Loop',
      speed: 1,
      loop: true,
      inPlace: true,
      isBuiltIn: true,
    },
    {
      id: 'sitting_idle_loop',
      name: 'Sitting_Idle_Loop',
      url: '/animations/core_locomotion.glb',
      trackName: 'Sitting_Idle_Loop',
      speed: 1,
      loop: true,
      inPlace: true,
      isBuiltIn: true,
    },
    {
      id: 'idle_talking_loop',
      name: 'Idle_Talking_Loop',
      url: '/animations/core_locomotion.glb',
      trackName: 'Idle_Talking_Loop',
      speed: 1,
      loop: true,
      inPlace: true,
      isBuiltIn: true,
    },
    {
      id: 'dance_loop',
      name: 'Dance_Loop',
      url: '/animations/core_locomotion.glb',
      trackName: 'Dance_Loop',
      speed: 1,
      loop: true,
      inPlace: true,
      isBuiltIn: true,
    },
    {
      id: 'singing',
      name: 'Singing',
      url: '/animations/core_emotes.glb',
      trackName: 'Singing',
      speed: 1,
      loop: true,
      inPlace: true,
      isBuiltIn: true,
    },
    {
      id: 'samba_dancing',
      name: 'Samba_Dancing',
      url: '/animations/core_emotes.glb',
      trackName: 'Samba_Dancing',
      speed: 1,
      loop: true,
      inPlace: true,
      isBuiltIn: true,
    },
    {
      id: 'slide_hip_hop_dance',
      name: 'Slide_Hip_Hop_Dance',
      url: '/animations/core_emotes.glb',
      trackName: 'Slide_Hip_Hop_Dance',
      speed: 1,
      loop: true,
      inPlace: true,
      isBuiltIn: true,
    },
    {
      id: 'swing_dancing',
      name: 'Swing_Dancing',
      url: '/animations/core_emotes.glb',
      trackName: 'Swing_Dancing',
      speed: 1,
      loop: true,
      inPlace: true,
      isBuiltIn: true,
    },
    {
      id: 'wave_hip_hop_dance',
      name: 'Wave_Hip_Hop_Dance',
      url: '/animations/core_emotes.glb',
      trackName: 'Wave_Hip_Hop_Dance',
      speed: 1,
      loop: true,
      inPlace: true,
      isBuiltIn: true,
    },
    {
      id: 'dancing_twerk',
      name: 'Dancing_Twerk',
      url: '/animations/core_emotes.glb',
      trackName: 'Dancing_Twerk',
      speed: 1,
      loop: true,
      inPlace: true,
      isBuiltIn: true,
    },
  ],
};

class AnimationRegistryService {
  private manifest: AnimationManifest = structuredClone(DEFAULT_ANIMATION_MANIFEST);
  private loaded = false;
  private loadPromise: Promise<AnimationManifest> | null = null;
  private listeners = new Set<(manifest: AnimationManifest) => void>();

  getManifestSync(): AnimationManifest {
    return this.manifest;
  }

  getEmotesSync(): EmoteSliceEntry[] {
    return this.manifest.emotes;
  }

  getClipsSync(): AnimationClipEntry[] {
    return this.manifest.clips;
  }

  getClipByIdSync(clipId: string): AnimationClipEntry | undefined {
    return this.manifest.clips.find(
      (c) => c.id === clipId || c.name === clipId
    );
  }

  /**
   * Resolves an emote ID (from RadialEmoteWheel or Settings) to the state name assigned on `pc.AnimComponent`.
   */
  resolveEmoteStateName(emoteId: string): string {
    const emote = this.manifest.emotes.find((e) => e.id === emoteId);
    if (emote) {
      const clip = this.getClipByIdSync(emote.clipId);
      if (clip) return clip.name;
      return emote.clipId;
    }
    const legacyMap: Record<string, string> = {
      sing: 'Singing',
      dance: 'Dance_Loop',
      samba: 'Samba_Dancing',
      hiphop: 'Slide_Hip_Hop_Dance',
      swing: 'Swing_Dancing',
      wavehiphop: 'Wave_Hip_Hop_Dance',
      twerk: 'Dancing_Twerk',
      talk: 'Idle_Talking_Loop',
      interact: 'Interact',
      crouch: 'Crouch_Idle_Loop',
    };
    return legacyMap[emoteId] ?? emoteId;
  }

  /**
   * Returns true if `stateName` is a stationary animation (idle, sit, emote) so RemotePlayerPool
   * doesn't extrapolate horizontal velocity during dance/idle states.
   */
  isStationaryState(stateName: string): boolean {
    if (
      stateName === CORE_SLOT_STATE_NAMES.walk ||
      stateName === CORE_SLOT_STATE_NAMES.run ||
      stateName === CORE_SLOT_STATE_NAMES.jump ||
      stateName === CORE_SLOT_STATE_NAMES.jumpRun
    ) {
      return false;
    }
    return true;
  }

  async ensureLoaded(forceReload = false): Promise<AnimationManifest> {
    if (this.loaded && !forceReload) {
      return this.manifest;
    }
    if (this.loadPromise && !forceReload) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      try {
        const bust = forceReload ? `?t=${Date.now()}` : '';
        const res = await fetch(`/animations/manifest.json${bust}`, {
          cache: forceReload ? 'no-store' : 'no-cache',
        });
        if (res.ok) {
          const data = (await res.json()) as Partial<AnimationManifest>;
          if (data && data.slots && Array.isArray(data.clips) && Array.isArray(data.emotes)) {
            this.manifest = {
              version: data.version || '1.0.0',
              slots: { ...DEFAULT_ANIMATION_MANIFEST.slots, ...data.slots },
              defaultSlots: data.defaultSlots ?? DEFAULT_ANIMATION_MANIFEST.defaultSlots,
              emotes: data.emotes,
              clips: data.clips,
            };
          }
        }
      } catch {
        // Fallback to built-in manifest
      } finally {
        this.loaded = true;
        this.loadPromise = null;
      }
      this.notifyListeners();
      return this.manifest;
    })();

    return this.loadPromise;
  }

  setManifestInMemory(next: AnimationManifest): void {
    this.manifest = structuredClone(next);
    this.loaded = true;
    this.notifyListeners();
  }

  subscribe(cb: (manifest: AnimationManifest) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notifyListeners(): void {
    for (const cb of this.listeners) {
      try {
        cb(this.manifest);
      } catch {
        // ignore listener errors
      }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<AnimationManifest>('cavannghe:animation-manifest-updated', {
          detail: this.manifest,
        })
      );
    }
  }
}

export const AnimationRegistry = new AnimationRegistryService();
