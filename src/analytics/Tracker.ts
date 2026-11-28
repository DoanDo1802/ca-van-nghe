import { getSupabaseClient, getSupabaseRestConfig } from '../network/supabaseClient';
import { AdminService } from '../network/AdminService';
import { DebugLogger } from '../utils/debugLogger';

export const ANALYTICS_EVENT = {
  SESSION_START: 1,
  AUTH_RESULT: 2,
  AVATAR_PICK: 3,
  ROOM_CREATE: 4,
  ROOM_JOIN: 5,
  ROOM_DENIED: 6,
  SCENE_SWITCH: 7,
  KARAOKE_SONG: 8,
  KARAOKE_SEARCH: 9,
  KARAOKE_BLOCKED: 10,
  KARAOKE_RECORD: 11,
  STAGE_MEDIA: 12,
  MIC_PERM: 13,
  VOICE_POLICY: 14,
  KICKED: 15,
  ERROR: 16,
  PERF_BAD: 17,
} as const;

export type AnalyticsEventCode = (typeof ANALYTICS_EVENT)[keyof typeof ANALYTICS_EVENT];

function encodeSceneId(sceneId?: string | null): number {
  if (!sceneId) return 0;
  if (sceneId.includes('lobby')) return 1;
  if (sceneId.includes('cinema')) return 2;
  if (sceneId.includes('tearoom')) return 3;
  return 0;
}

function sceneKey(sceneId?: string | null): 'lobby' | 'cinema' | 'tearoom' | null {
  if (!sceneId) return null;
  if (sceneId.includes('lobby')) return 'lobby';
  if (sceneId.includes('cinema')) return 'cinema';
  if (sceneId.includes('tearoom')) return 'tearoom';
  return null;
}

function hashString(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function detectPlatform(): 'mobile' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';
  const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;
  const ua = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  return coarse || ua ? 'mobile' : 'desktop';
}

function detectGpu(): string | undefined {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return undefined;
    const webgl = gl as WebGLRenderingContext;
    const dbg = webgl.getExtension('WEBGL_debug_renderer_info');
    if (!dbg) return undefined;
    const renderer = webgl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
    return typeof renderer === 'string' ? renderer.slice(0, 48) : undefined;
  } catch {
    return undefined;
  }
}

interface QueuedEvent {
  ts: string;
  n: number;
  sid: string;
  r?: string;
  sc: number;
  p: Record<string, unknown>;
}

const MAX_EVENTS_PER_SESSION = 60;
const MAX_SEARCHES_PER_SESSION = 10;
const MAX_ERRORS_PER_SESSION = 20;
const FLUSH_INTERVAL_MS = 30_000;
const SUMMARY_INTERVAL_MS = 5 * 60_000;

class TrackerImpl {
  private static instance: TrackerImpl | null = null;

  private readonly sessionId = generateUuid();
  private readonly deviceId = AdminService.getOrCreateDeviceId();
  private readonly platform = detectPlatform();
  private readonly startedAt = new Date().toISOString();

  private initialized = false;
  private level = 2; // 0=off, 1=summary only, 2=full
  private accountId: string | null = null;
  private isGuest = true;
  private currentRoomId: string | null = null;
  private currentSceneId = 'ca-van-nghe-lobby';

  private queue: QueuedEvent[] = [];
  private totalEventsSent = 0;
  private searchCount = 0;
  private errorCount = 0;
  private errorHashes = new Set<string>();

  private activeStartMs = Date.now();
  private activeAccumMs = 0;
  private isVisible = true;
  private sceneEnterMs = Date.now();
  private sceneLoadStartMs = Date.now();
  private sitStartMs: number | null = null;
  private firstLoadRecorded = false;

  // Aggregated session counters (Tier B)
  private sceneTimeSec: Record<'lobby' | 'cinema' | 'tearoom', number> = {
    lobby: 0,
    cinema: 0,
    tearoom: 0,
  };
  private sceneSwitches = 0;
  private fpsSamples: number[] = [];
  private pingSamples: number[] = [];
  private loadTimesMs: number[] = [];
  private chatCount = 0;
  private emoteCounts: Record<string, number> = {};
  private clapCount = 0;
  private sitCount = 0;
  private sitTimeSec = 0;
  private interactCounts: Record<string, number> = {};
  private micSec = 0;
  private speakSec = 0;
  private voiceOk = 0;
  private voiceFail = 0;
  private iceRelay = 0;
  private karaokeSongs = 0;
  private karaokeListenSec = 0;
  private cam1pSec = 0;
  private reconnectCount = 0;
  private gpuName: string | undefined;
  private deviceMem: number | undefined;

  private flushTimer: number | null = null;
  private summaryTimer: number | null = null;
  private unsubLogger: (() => void) | null = null;
  private cleanupListeners: (() => void) | null = null;

  static getInstance(): TrackerImpl {
    if (!TrackerImpl.instance) {
      TrackerImpl.instance = new TrackerImpl();
    }
    return TrackerImpl.instance;
  }

  init(): void {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    const saved = AdminService.getSavedPlayerAccount();
    if (saved?.id) {
      this.accountId = saved.id;
      this.isGuest = false;
    }

    this.gpuName = detectGpu();
    const navMem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
    if (typeof navMem === 'number') this.deviceMem = navMem;

    void this.fetchConfig();
    this.attachListeners();

    this.track(ANALYTICS_EVENT.SESSION_START, {
      ref: document.referrer ? document.referrer.slice(0, 80) : undefined,
      new_dev: !localStorage.getItem('cavannghe:seen-before'),
      plat: this.platform,
    });
    try {
      localStorage.setItem('cavannghe:seen-before', '1');
    } catch {
      // ignore
    }

    this.flushTimer = window.setInterval(() => {
      void this.flush(false);
    }, FLUSH_INTERVAL_MS);

    this.summaryTimer = window.setInterval(() => {
      void this.flush(true);
    }, SUMMARY_INTERVAL_MS);
  }

  private async fetchConfig(): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    try {
      const { data } = await supabase.rpc('get_analytics_config');
      const lvl = Number((data as { level?: number } | null)?.level);
      if (lvl === 0 || lvl === 1 || lvl === 2) {
        this.level = lvl;
      }
    } catch {
      // keep default level 2
    }
  }

  setIdentity(accountId: string | null, isGuest: boolean): void {
    this.accountId = accountId;
    this.isGuest = isGuest;
  }

  setRoomContext(roomId: string | null, sceneId?: string): void {
    this.currentRoomId = roomId;
    if (sceneId) {
      this.onSceneChanged(sceneId);
    }
  }

  onSceneLoadStart(): void {
    this.sceneLoadStartMs = Date.now();
  }

  onSceneLoadComplete(sceneId: string): void {
    const ms = Math.max(0, Math.min(120_000, Date.now() - this.sceneLoadStartMs));
    this.loadTimesMs.push(ms);
    if (!this.firstLoadRecorded) {
      this.firstLoadRecorded = true;
      if (ms > 15_000) {
        this.track(ANALYTICS_EVENT.PERF_BAD, { ld: ms, gpu: this.gpuName });
      }
    }
    this.onSceneChanged(sceneId);
  }

  private onSceneChanged(nextSceneId: string): void {
    const now = Date.now();
    const prevKey = sceneKey(this.currentSceneId);
    if (prevKey) {
      this.sceneTimeSec[prevKey] += Math.round((now - this.sceneEnterMs) / 1000);
    }
    if (nextSceneId !== this.currentSceneId) {
      this.sceneSwitches += 1;
    }
    this.currentSceneId = nextSceneId;
    this.sceneEnterMs = now;
  }

  recordFps(fps: number): void {
    if (fps > 0 && fps <= 240 && this.fpsSamples.length < 240) {
      this.fpsSamples.push(Math.round(fps));
    }
  }

  recordPing(pingMs: number): void {
    if (pingMs >= 0 && pingMs < 10_000 && this.pingSamples.length < 240) {
      this.pingSamples.push(Math.round(pingMs));
    }
  }

  incChat(): void {
    this.chatCount += 1;
  }

  incClap(): void {
    this.clapCount += 1;
  }

  incEmote(emoteId: string): void {
    const key = emoteId.slice(0, 24);
    this.emoteCounts[key] = (this.emoteCounts[key] ?? 0) + 1;
  }

  incReconnect(): void {
    this.reconnectCount += 1;
  }

  incKaraokeSong(): void {
    this.karaokeSongs += 1;
  }

  addKaraokeListenSec(sec: number): void {
    if (sec > 0) this.karaokeListenSec += Math.round(sec);
  }

  addVoiceStats(opts: { micSec?: number; speakSec?: number; ok?: number; fail?: number; relay?: number }): void {
    if (opts.micSec) this.micSec += Math.round(opts.micSec);
    if (opts.speakSec) this.speakSec += Math.round(opts.speakSec);
    if (opts.ok) this.voiceOk += opts.ok;
    if (opts.fail) this.voiceFail += opts.fail;
    if (opts.relay) this.iceRelay += opts.relay;
  }

  track(n: AnalyticsEventCode, props: Record<string, unknown> = {}): void {
    if (this.level < 2) return;
    if (this.totalEventsSent + this.queue.length >= MAX_EVENTS_PER_SESSION) return;

    if (n === ANALYTICS_EVENT.KARAOKE_SEARCH) {
      if (this.searchCount >= MAX_SEARCHES_PER_SESSION) return;
      this.searchCount += 1;
    }

    if (n === ANALYTICS_EVENT.ERROR) {
      if (this.errorCount >= MAX_ERRORS_PER_SESSION) return;
      const hash = String(props.h ?? '');
      if (hash && this.errorHashes.has(hash)) return;
      if (hash) this.errorHashes.add(hash);
      this.errorCount += 1;
    }

    // Strip undefined values
    const cleanProps: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) {
      if (v !== undefined && v !== null && v !== '') {
        cleanProps[k] = v;
      }
    }

    this.queue.push({
      ts: new Date().toISOString(),
      n,
      sid: this.sessionId,
      r: this.currentRoomId ?? undefined,
      sc: encodeSceneId(this.currentSceneId),
      p: cleanProps,
    });

    if (this.queue.length >= 20) {
      void this.flush(false);
    }
  }

  private buildSummary(): Record<string, unknown> {
    const now = Date.now();
    const activeMs = this.activeAccumMs + (this.isVisible ? now - this.activeStartMs : 0);

    // Snapshot scene time up to now without mutating
    const sc = { ...this.sceneTimeSec };
    const curKey = sceneKey(this.currentSceneId);
    if (curKey) {
      sc[curKey] += Math.round((now - this.sceneEnterMs) / 1000);
    }

    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    const pct = (arr: number[], p: number) => {
      if (!arr.length) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
      return sorted[idx];
    };

    const extraSitSec = this.sitStartMs ? Math.round((now - this.sitStartMs) / 1000) : 0;

    return {
      session_id: this.sessionId,
      account_id: this.accountId,
      is_guest: this.isGuest,
      platform: this.platform,
      started_at: this.startedAt,
      ended_at: new Date(now).toISOString(),
      active_s: Math.round(activeMs / 1000),
      s: {
        sc,
        sw: this.sceneSwitches,
        fps: this.fpsSamples.length ? [avg(this.fpsSamples), pct(this.fpsSamples, 0.05)] : undefined,
        png: this.pingSamples.length ? [avg(this.pingSamples), pct(this.pingSamples, 0.95)] : undefined,
        ld: this.loadTimesMs.length ? [this.loadTimesMs[0], avg(this.loadTimesMs)] : undefined,
        chat: this.chatCount,
        emo: Object.keys(this.emoteCounts).length ? this.emoteCounts : undefined,
        clap: this.clapCount,
        sit: this.sitCount,
        sit_s: this.sitTimeSec + extraSitSec,
        int: Object.keys(this.interactCounts).length ? this.interactCounts : undefined,
        mic_s: this.micSec,
        spk_s: this.speakSec,
        v_ok: this.voiceOk,
        v_fail: this.voiceFail,
        ice_relay: this.iceRelay,
        k_songs: this.karaokeSongs,
        k_listen_s: this.karaokeListenSec,
        cam1p: this.cam1pSec,
        err: this.errorCount,
        rc: this.reconnectCount,
        gpu: this.gpuName,
        mem: this.deviceMem,
      },
    };
  }

  async flush(includeSummary = true, useKeepalive = false): Promise<void> {
    if (this.level === 0) return;
    if (!includeSummary && this.queue.length === 0) return;

    const batch = this.queue.splice(0, 30);
    this.totalEventsSent += batch.length;
    const summary = includeSummary ? this.buildSummary() : null;

    if (useKeepalive) {
      const cfg = getSupabaseRestConfig();
      if (!cfg) return;
      try {
        void fetch(`${cfg.url}/rest/v1/rpc/track_batch`, {
          method: 'POST',
          keepalive: true,
          headers: {
            apikey: cfg.anonKey,
            Authorization: `Bearer ${cfg.anonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            p_device_id: this.deviceId,
            p_summary: summary,
            p_events: batch,
          }),
        });
      } catch {
        // ignore unload fetch errors
      }
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) return;
    try {
      await supabase.rpc('track_batch', {
        p_device_id: this.deviceId,
        p_summary: summary,
        p_events: batch,
      });
    } catch {
      // ignore telemetry network failures
    }
  }

  private attachListeners(): void {
    // Capture client errors from DebugLogger
    this.unsubLogger = DebugLogger.subscribe((entry) => {
      if (entry.level !== 'error') return;
      const src = (entry.source || 'Client').slice(0, 40);
      const msg = (entry.message || '').slice(0, 200);
      const h = hashString(`${src}:${msg.slice(0, 80)}`);
      this.track(ANALYTICS_EVENT.ERROR, { h, src, msg, cnt: 1 });
    }, false);

    const onVisibility = () => {
      const now = Date.now();
      if (document.visibilityState === 'hidden') {
        if (this.isVisible) {
          this.activeAccumMs += now - this.activeStartMs;
          this.isVisible = false;
        }
        void this.flush(true, true);
      } else {
        this.activeStartMs = now;
        this.isVisible = true;
      }
    };

    const onPageHide = () => {
      void this.flush(true, true);
    };

    const onInteract = (e: Event) => {
      const detail = (e as CustomEvent<{ type?: string } | undefined>).detail;
      const t = (detail?.type || 'object').slice(0, 20);
      this.interactCounts[t] = (this.interactCounts[t] ?? 0) + 1;
    };

    const onSit = () => {
      this.sitCount += 1;
      if (!this.sitStartMs) this.sitStartMs = Date.now();
    };

    const onStandUp = () => {
      if (this.sitStartMs) {
        this.sitTimeSec += Math.round((Date.now() - this.sitStartMs) / 1000);
        this.sitStartMs = null;
      }
    };

    const onEmote = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (typeof id === 'string' && id) this.incEmote(id);
    };

    const onKaraokeBlocked = () => {
      this.track(ANALYTICS_EVENT.KARAOKE_BLOCKED, { reason: 'busy_or_unready' });
    };

    const onLoadScene = (e: Event) => {
      const sceneId = (e as CustomEvent<string>).detail;
      if (typeof sceneId === 'string') {
        this.onSceneLoadStart();
      }
    };

    const onNetworkPing = (e: Event) => {
      const detail = (e as CustomEvent<{ pingMs?: number } | undefined>).detail;
      if (typeof detail?.pingMs === 'number') {
        this.recordPing(detail.pingMs);
      }
    };

    // Lightweight FPS sampler (samples 1 second every 5 seconds while tab is visible)
    let fpsFrames = 0;
    let fpsLast = performance.now();
    let fpsRaf = 0;
    const sampleFps = (now: number) => {
      if (this.isVisible) {
        fpsFrames += 1;
        const elapsed = now - fpsLast;
        if (elapsed >= 2000) {
          this.recordFps((fpsFrames * 1000) / elapsed);
          fpsFrames = 0;
          fpsLast = now;
        }
      } else {
        fpsFrames = 0;
        fpsLast = now;
      }
      fpsRaf = window.requestAnimationFrame(sampleFps);
    };
    fpsRaf = window.requestAnimationFrame(sampleFps);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('cavannghe:interact', onInteract);
    window.addEventListener('cavannghe:sit', onSit);
    window.addEventListener('cavannghe:stand-up', onStandUp);
    window.addEventListener('cavannghe:emote', onEmote);
    window.addEventListener('cavannghe:karaoke-unavailable', onKaraokeBlocked);
    window.addEventListener('cavannghe:load-scene', onLoadScene);
    window.addEventListener('cavannghe:network-ping', onNetworkPing);

    this.cleanupListeners = () => {
      window.cancelAnimationFrame(fpsRaf);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('cavannghe:interact', onInteract);
      window.removeEventListener('cavannghe:sit', onSit);
      window.removeEventListener('cavannghe:stand-up', onStandUp);
      window.removeEventListener('cavannghe:emote', onEmote);
      window.removeEventListener('cavannghe:karaoke-unavailable', onKaraokeBlocked);
      window.removeEventListener('cavannghe:load-scene', onLoadScene);
      window.removeEventListener('cavannghe:network-ping', onNetworkPing);
    };
  }

  destroy(): void {
    if (this.flushTimer !== null) window.clearInterval(this.flushTimer);
    if (this.summaryTimer !== null) window.clearInterval(this.summaryTimer);
    this.unsubLogger?.();
    this.cleanupListeners?.();
    this.initialized = false;
  }
}

export const Tracker = TrackerImpl.getInstance();
