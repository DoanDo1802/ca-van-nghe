import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabaseClient';

export interface NetworkStageState {
  sourceType: 'media' | 'youtube';
  mediaUrl: string;
  youtubeVideoId: string | null;
  title: string;
  isPlaying: boolean;
  isScreenOn: boolean;
  updatedAt: number;
}

export interface RemotePlayerState {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  anim: string;
  emote: string | null;
  isSitting: boolean;
  chairId: string | null;
  joinedAt: number;
  seq: number;
}

export interface RoomStatusSnapshot {
  connected: boolean;
  roomId: string;
  localPlayerId: string;
  localPlayerName: string;
  isHost: boolean;
  hostId: string | null;
  hostName: string | null;
  playerCount: number;
  players: Array<{ id: string; name: string; isHost: boolean; isLocal: boolean }>;
}

interface PresencePayload {
  playerId: string;
  name: string;
  joinedAt: number;
  chairId: string | null;
  stageState?: NetworkStageState;
}

const BROADCAST_INTERVAL_MS = 50; // 20 Hz when moving for smooth curves

/**
 * Singleton managing Supabase Realtime room connection (Presence + Broadcast).
 * - Host is elected deterministically by earliest `joinedAt` in Presence.
 * - Only Host can broadcast `stage:sync` updates; guests receive & apply them.
 */
export class MultiplayerManager {
  private static instance: MultiplayerManager | null = null;

  static getInstance(): MultiplayerManager {
    if (!MultiplayerManager.instance) {
      MultiplayerManager.instance = new MultiplayerManager();
    }
    return MultiplayerManager.instance;
  }

  private channel: RealtimeChannel | null = null;
  private connected = false;
  private roomId = 'ca-van-nghe-1';
  private localPlayerId = `p_${Math.random().toString(36).slice(2, 10)}`;
  private localPlayerName = 'Khách';
  private joinedAt = Date.now();
  private localChairId: string | null = null;
  private hostStageState: NetworkStageState | null = null;
  private hostId: string | null = null;
  private hostName: string | null = null;

  private remotePlayers = new Map<string, RemotePlayerState>();
  private presenceList: PresencePayload[] = [];

  private lastBroadcastTime = 0;
  private lastSentSig = '';
  private localSeq = 0;

  private onRemoteStageCallback: ((state: NetworkStageState) => void) | null = null;

  private constructor() {}

  setOnRemoteStage(cb: ((state: NetworkStageState) => void) | null): void {
    this.onRemoteStageCallback = cb;
  }

  async joinRoom(roomId: string, playerName: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (!supabase) return false;

    await this.leaveRoom();

    this.roomId = roomId.trim() || 'ca-van-nghe-1';
    this.localPlayerName = playerName.trim() || 'Khách';
    this.joinedAt = Date.now();
    this.localChairId = null;
    this.remotePlayers.clear();
    this.presenceList = [];

    const channel = supabase.channel(`room:${this.roomId}`, {
      config: {
        presence: { key: this.localPlayerId },
        broadcast: { self: false },
      },
    });

    channel.on('presence', { event: 'sync' }, () => {
      this.handlePresenceSync(channel);
    });

    channel.on('broadcast', { event: 'player:state' }, ({ payload }) => {
      this.handleRemotePlayerState(payload as RemotePlayerState);
    });

    channel.on('broadcast', { event: 'stage:sync' }, ({ payload }) => {
      if (this.isHost()) return;
      const stage = payload as NetworkStageState;
      if (stage) {
        this.hostStageState = stage;
        this.onRemoteStageCallback?.(stage);
      }
    });

    this.channel = channel;

    return new Promise<boolean>((resolve) => {
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          this.connected = true;
          await this.trackLocalPresence();
          this.emitRoomStatus();
          resolve(true);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.connected = false;
          this.emitRoomStatus();
          resolve(false);
        }
      });
    });
  }

  async leaveRoom(): Promise<void> {
    if (this.channel) {
      const ch = this.channel;
      this.channel = null;
      this.connected = false;
      this.remotePlayers.clear();
      this.presenceList = [];
      this.hostId = null;
      this.hostName = null;
      try {
        await ch.untrack();
      } catch {
        // ignore
      }
      try {
        await ch.unsubscribe();
      } catch {
        // ignore
      }
      this.emitRoomStatus();
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  isHost(): boolean {
    if (!this.connected) return true; // Offline mode: local user controls stage
    return this.hostId === this.localPlayerId;
  }

  getLocalPlayerId(): string {
    return this.localPlayerId;
  }

  getRemotePlayers(): Map<string, RemotePlayerState> {
    return this.remotePlayers;
  }

  isChairOccupiedByOther(chairId: string): boolean {
    for (const rp of this.remotePlayers.values()) {
      if (rp.chairId === chairId) return true;
    }
    return false;
  }

  getRoomStatus(): RoomStatusSnapshot {
    const players = this.presenceList.map((p) => ({
      id: p.playerId,
      name: p.name,
      isHost: p.playerId === this.hostId,
      isLocal: p.playerId === this.localPlayerId,
    }));

    return {
      connected: this.connected,
      roomId: this.roomId,
      localPlayerId: this.localPlayerId,
      localPlayerName: this.localPlayerName,
      isHost: this.isHost(),
      hostId: this.hostId,
      hostName: this.hostName,
      playerCount: Math.max(1, players.length),
      players,
    };
  }

  sendLocalPlayerState(state: {
    x: number;
    y: number;
    z: number;
    vx?: number;
    vz?: number;
    yaw: number;
    anim: string;
    emote: string | null;
    isSitting: boolean;
    chairId: string | null;
  }): void {
    if (!this.connected || !this.channel) return;

    if (state.chairId !== this.localChairId) {
      this.localChairId = state.chairId;
      void this.trackLocalPresence();
    }

    const now = performance.now();
    if (now - this.lastBroadcastTime < BROADCAST_INTERVAL_MS) {
      return;
    }

    const sig = `${state.x.toFixed(2)},${state.y.toFixed(2)},${state.z.toFixed(2)},${state.yaw.toFixed(1)},${state.anim},${state.emote ?? ''},${state.isSitting ? 1 : 0},${state.chairId ?? ''}`;

    if (sig === this.lastSentSig && now - this.lastBroadcastTime < 1500) {
      return;
    }

    this.lastBroadcastTime = now;
    this.lastSentSig = sig;
    this.localSeq += 1;

    const payload: RemotePlayerState = {
      id: this.localPlayerId,
      name: this.localPlayerName,
      x: Math.round(state.x * 1000) / 1000,
      y: Math.round(state.y * 1000) / 1000,
      z: Math.round(state.z * 1000) / 1000,
      vx: Math.round((state.vx ?? 0) * 100) / 100,
      vz: Math.round((state.vz ?? 0) * 100) / 100,
      yaw: Math.round(state.yaw * 100) / 100,
      anim: state.anim,
      emote: state.emote,
      isSitting: state.isSitting,
      chairId: state.chairId,
      joinedAt: this.joinedAt,
      seq: this.localSeq,
    };

    void this.channel.send({
      type: 'broadcast',
      event: 'player:state',
      payload,
    });
  }

  broadcastStageState(stage: NetworkStageState): void {
    this.hostStageState = stage;
    if (!this.connected || !this.channel || !this.isHost()) return;

    void this.channel.send({
      type: 'broadcast',
      event: 'stage:sync',
      payload: stage,
    });
    void this.trackLocalPresence();
  }

  requestStageResync(): void {
    if (this.hostStageState && !this.isHost()) {
      this.onRemoteStageCallback?.(this.hostStageState);
    }
  }

  private async trackLocalPresence(): Promise<void> {
    if (!this.channel || !this.connected) return;
    const payload: PresencePayload = {
      playerId: this.localPlayerId,
      name: this.localPlayerName,
      joinedAt: this.joinedAt,
      chairId: this.localChairId,
      ...(this.isHost() && this.hostStageState ? { stageState: this.hostStageState } : {}),
    };
    try {
      await this.channel.track(payload);
    } catch {
      // ignore transient track error
    }
  }

  private handlePresenceSync(channel: RealtimeChannel): void {
    const raw = channel.presenceState<PresencePayload>();
    const list: PresencePayload[] = [];
    for (const key of Object.keys(raw)) {
      const entries = raw[key];
      if (entries && entries.length > 0) {
        list.push(entries[0]);
      }
    }

    list.sort((a, b) => a.joinedAt - b.joinedAt || a.playerId.localeCompare(b.playerId));
    this.presenceList = list;

    const prevHostId = this.hostId;
    const host = list[0] ?? null;
    this.hostId = host?.playerId ?? this.localPlayerId;
    this.hostName = host?.name ?? this.localPlayerName;

    // If local player just became Host, publish stageState in presence
    if (prevHostId !== this.hostId && this.hostId === this.localPlayerId && this.hostStageState) {
      void this.trackLocalPresence();
    }

    // If guest, sync stageState from Host's presence when joining or when host changes
    if (host && host.playerId !== this.localPlayerId && host.stageState) {
      const prevTs = this.hostStageState?.updatedAt ?? 0;
      if (host.stageState.updatedAt > prevTs) {
        this.hostStageState = host.stageState;
        this.onRemoteStageCallback?.(host.stageState);
      }
    }

    const activeIds = new Set(list.map((p) => p.playerId));
    for (const id of this.remotePlayers.keys()) {
      if (!activeIds.has(id)) {
        this.remotePlayers.delete(id);
      }
    }

    for (const p of list) {
      if (p.playerId === this.localPlayerId) continue;
      const existing = this.remotePlayers.get(p.playerId);
      if (existing) {
        existing.name = p.name;
        existing.chairId = p.chairId;
      } else {
        this.remotePlayers.set(p.playerId, {
          id: p.playerId,
          name: p.name,
          x: 0,
          y: 0,
          z: 8,
          vx: 0,
          vz: 0,
          yaw: 180,
          anim: 'Idle_Loop',
          emote: null,
          isSitting: false,
          chairId: p.chairId,
          joinedAt: p.joinedAt,
          seq: 0,
        });
      }
    }

    this.emitRoomStatus();
  }

  private handleRemotePlayerState(payload: RemotePlayerState): void {
    if (!payload || payload.id === this.localPlayerId) return;
    const existing = this.remotePlayers.get(payload.id);
    if (existing) {
      existing.name = payload.name || existing.name;
      existing.x = payload.x;
      existing.y = payload.y;
      existing.z = payload.z;
      existing.vx = payload.vx ?? 0;
      existing.vz = payload.vz ?? 0;
      existing.yaw = payload.yaw;
      existing.anim = payload.anim;
      existing.emote = payload.emote;
      existing.isSitting = payload.isSitting;
      existing.chairId = payload.chairId;
      existing.seq = payload.seq ?? existing.seq + 1;
    } else {
      this.remotePlayers.set(payload.id, { ...payload });
    }
  }

  private emitRoomStatus(): void {
    window.dispatchEvent(
      new CustomEvent<RoomStatusSnapshot>('cavannghe:room-status', {
        detail: this.getRoomStatus(),
      })
    );
  }
}
