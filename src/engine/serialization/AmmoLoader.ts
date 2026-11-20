import * as pc from 'playcanvas';

export interface AmmoConfigOptions {
  glueUrl?: string;
  wasmUrl?: string;
  fallbackUrl?: string;
  timeoutMs?: number;
}

const DEFAULT_AMMO_CONFIG: Required<AmmoConfigOptions> = {
  glueUrl: '/ammo/ammo.wasm.js',
  wasmUrl: '/ammo/ammo.wasm.wasm',
  fallbackUrl: '/ammo/ammo.wasm.js',
  timeoutMs: 3000,
};

let ammoLoadPromise: Promise<boolean> | null = null;
let ammoLoaded = false;
let ammoConfigured = false;
let activeFailHandler: ((reason: string) => void) | null = null;

/**
 * Configures PlayCanvas WasmModule for Ammo.js without blocking synchronously.
 * Safe to call multiple times; only configures once.
 */
export function configureAmmo(options?: AmmoConfigOptions): void {
  if (ammoConfigured) return;
  ammoConfigured = true;

  const cfg = { ...DEFAULT_AMMO_CONFIG, ...options };
  pc.WasmModule.setConfig('Ammo', {
    glueUrl: cfg.glueUrl,
    wasmUrl: cfg.wasmUrl,
    fallbackUrl: cfg.fallbackUrl,
    errorHandler: (error: string) => {
      console.warn('[AmmoLoader] Failed to load Ammo.js WASM module:', error);
      activeFailHandler?.(error);
    },
  });
}

/**
 * Initializes the Ammo.js WASM physics module via PlayCanvas WasmModule.
 * Resolves to `true` when ready, or `false` with a console warning if loading fails.
 */
export function initAmmo(options?: AmmoConfigOptions): Promise<boolean> {
  if (ammoLoaded) {
    return Promise.resolve(true);
  }
  if (ammoLoadPromise) {
    return ammoLoadPromise;
  }

  configureAmmo(options);
  const timeoutMs = options?.timeoutMs ?? DEFAULT_AMMO_CONFIG.timeoutMs;

  ammoLoadPromise = new Promise<boolean>((resolve) => {
    let settled = false;

    const finish = (ok: boolean, reason?: string) => {
      if (settled) return;
      settled = true;
      activeFailHandler = null;
      window.clearTimeout(timer);
      ammoLoaded = ok;
      if (!ok) {
        ammoLoadPromise = null;
        console.warn(
          `[AmmoLoader] Physics disabled: ${reason ?? 'Ammo.js WASM failed to initialize.'}`
        );
      }
      resolve(ok);
    };

    activeFailHandler = (reason: string) => finish(false, reason);

    const timer = window.setTimeout(() => {
      finish(false, `Timed out after ${timeoutMs}ms waiting for Ammo.js WASM.`);
    }, timeoutMs);

    try {
      pc.WasmModule.getInstance('Ammo', (instance: unknown) => {
        if (instance) {
          finish(true);
        } else {
          finish(false, 'WasmModule.getInstance returned an empty Ammo instance.');
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      finish(false, msg);
    }
  });

  return ammoLoadPromise;
}

export function isAmmoLoaded(): boolean {
  return ammoLoaded;
}
