import type { CharacterManifest, CharacterManifestEntry } from '../../types/characterStudio';

export const DEFAULT_CHARACTER_MANIFEST: CharacterManifest = {
  version: '1.0.0',
  defaultCharacterId: 'default',
  characters: [
    {
      id: 'default',
      label: 'Nhân vật Mặc định',
      subtitle: 'Đổi màu trang phục tự do',
      url: '/models/Character.glb',
      filename: 'Character.glb',
      scale: 0.62,
      groundOffsetY: 0,
      facingYawOffset: 0,
      armPoseOffsetDeg: 0,
      tintable: true,
      isBuiltIn: true,
      originalPreset: {
        label: 'Nhân vật Mặc định',
        subtitle: 'Đổi màu trang phục tự do',
        url: '/models/Character.glb',
        filename: 'Character.glb',
        scale: 0.62,
        groundOffsetY: 0,
        facingYawOffset: 0,
        armPoseOffsetDeg: 0,
        tintable: true,
      },
    },
    {
      id: 'tyler',
      label: 'Tyler Baudelaire',
      subtitle: 'Trang phục gốc • Mixamo Rig',
      url: '/models/Tyler.glb',
      filename: 'Tyler.glb',
      scale: 0.4,
      groundOffsetY: 0,
      facingYawOffset: 180,
      armPoseOffsetDeg: 0,
      tintable: false,
      isBuiltIn: true,
      originalPreset: {
        label: 'Tyler Baudelaire',
        subtitle: 'Trang phục gốc • Mixamo Rig',
        url: '/models/Tyler.glb',
        filename: 'Tyler.glb',
        scale: 0.4,
        groundOffsetY: 0,
        facingYawOffset: 180,
        armPoseOffsetDeg: 0,
        tintable: false,
      },
    },
  ],
};

class CharacterRegistryService {
  private manifest: CharacterManifest = structuredClone(DEFAULT_CHARACTER_MANIFEST);
  private loaded = false;
  private loadPromise: Promise<CharacterManifest> | null = null;
  private listeners = new Set<(manifest: CharacterManifest) => void>();

  getManifestSync(): CharacterManifest {
    return this.manifest;
  }

  getCharactersSync(): CharacterManifestEntry[] {
    return this.manifest.characters;
  }

  getDefaultCharacterIdSync(): string {
    const defId = this.manifest.defaultCharacterId;
    if (this.manifest.characters.some((c) => c.id === defId)) {
      return defId;
    }
    return this.manifest.characters[0]?.id ?? 'default';
  }

  normalizeCharacterId(raw?: string | null): string {
    if (!raw || typeof raw !== 'string') {
      return this.getDefaultCharacterIdSync();
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      return this.getDefaultCharacterIdSync();
    }
    // Before async manifest finishes loading on cold boot, preserve valid-looking custom slug IDs
    if (!this.loaded && /^[a-zA-Z0-9_-]{1,64}$/.test(trimmed)) {
      return trimmed;
    }
    if (this.manifest.characters.some((c) => c.id === trimmed)) {
      return trimmed;
    }
    return this.getDefaultCharacterIdSync();
  }

  getCharacterPresetSync(characterId?: string | null): CharacterManifestEntry {
    const cleanId = characterId?.trim();
    if (cleanId) {
      const exact = this.manifest.characters.find((c) => c.id === cleanId);
      if (exact) return exact;
    }
    const defId = this.getDefaultCharacterIdSync();
    return (
      this.manifest.characters.find((c) => c.id === defId) ??
      this.manifest.characters[0] ??
      DEFAULT_CHARACTER_MANIFEST.characters[0]
    );
  }

  async ensureLoaded(forceReload = false): Promise<CharacterManifest> {
    if (this.loaded && !forceReload) {
      return this.manifest;
    }
    if (this.loadPromise && !forceReload) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      try {
        const bust = forceReload ? `?t=${Date.now()}` : '';
        const res = await fetch(`/characters/manifest.json${bust}`, {
          cache: forceReload ? 'no-store' : 'no-cache',
        });
        if (res.ok) {
          const data = (await res.json()) as Partial<CharacterManifest>;
          if (data && Array.isArray(data.characters) && data.characters.length > 0) {
            this.manifest = {
              version: data.version || '1.0.0',
              defaultCharacterId: data.defaultCharacterId || data.characters[0].id,
              characters: data.characters,
            };
          }
        }
      } catch {
        // Fallback to built-in default manifest if offline or missing
      } finally {
        this.loaded = true;
        this.loadPromise = null;
      }
      this.notifyListeners();
      return this.manifest;
    })();

    return this.loadPromise;
  }

  setManifestInMemory(next: CharacterManifest): void {
    this.manifest = structuredClone(next);
    this.loaded = true;
    this.notifyListeners();
  }

  subscribe(cb: (manifest: CharacterManifest) => void): () => void {
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
        new CustomEvent<CharacterManifest>('cavannghe:character-manifest-updated', {
          detail: this.manifest,
        })
      );
    }
  }
}

export const CharacterRegistry = new CharacterRegistryService();
