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

export interface NetworkKaraokeState {
  active: boolean;
  singerId: string;
  singerName: string;
  youtubeVideoId: string | null;
  title: string;
  isPlaying: boolean;
  updatedAt: number;
}

export interface RtcSignalMessage {
  fromId: string;
  targetId: string;
  kind: 'offer' | 'answer' | 'ice' | 'ready' | 'bye';
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  isHost: boolean;
  text: string;
  timestamp: number;
  kind?: 'chat' | 'system';
}

export type VoicePolicyMode = 'free' | 'muted_all';

export interface RoomVoicePolicy {
  mode: VoicePolicyMode;
  updatedBy: string;
  updatedAt: number;
}

export interface VoiceSpeakingPayload {
  playerId: string;
  speaking: boolean;
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
  karaokeState?: NetworkKaraokeState;
  voicePolicy?: RoomVoicePolicy;
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
  private baseRoomId = 'ca-van-nghe-1';
  private sceneScopeId = '';
  private roomId = 'ca-van-nghe-1';
  private localPlayerId = `p_${Math.random().toString(36).slice(2, 10)}`;
  private localPlayerName = 'Khách';
  private joinedAt = Date.now();
  private localChairId: string | null = null;
  private hostStageState: NetworkStageState | null = null;
  private remoteKaraokeState: NetworkKaraokeState | null = null;
  private localKaraokeState: NetworkKaraokeState | null = null;
  private hostId: string | null = null;
  private hostName: string | null = null;

  private remotePlayers = new Map<string, RemotePlayerState>();
  private presenceList: PresencePayload[] = [];
  private speakingPeers = new Set<string>();
  private voicePolicy: RoomVoicePolicy = { mode: 'free', updatedBy: '', updatedAt: 0 };

  private lastBroadcastTime = 0;
  private lastSentSig = '';
  private localSeq = 0;

  private onRemoteStageCallback: ((state: NetworkStageState) => void) | null = null;
  private onRemoteStageLiveSyncCallback: (() => void) | null = null;
  private onRemoteKaraokeCallback: ((state: NetworkKaraokeState) => void) | null = null;
  private onRtcSignalCallback: ((msg: RtcSignalMessage) => void) | null = null;
  private onVoiceSignalCallback: ((msg: RtcSignalMessage) => void) | null = null;

  private constructor() {}

  setOnRemoteStage(cb: ((state: NetworkStageState) => void) | null): void {
    this.onRemoteStageCallback = cb;
  }

  setOnRemoteStageLiveSync(cb: (() => void) | null): void {
    this.onRemoteStageLiveSyncCallback = cb;
  }

  setOnRemoteKaraoke(cb: ((state: NetworkKaraokeState) => void) | null): void {
    this.onRemoteKaraokeCallback = cb;
  }

  setOnRtcSignal(cb: ((msg: RtcSignalMessage) => void) | null): void {
    this.onRtcSignalCallback = cb;
  }

  setOnVoiceSignal(cb: ((msg: RtcSignalMessage) => void) | null): void {
    this.onVoiceSignalCallback = cb;
  }

  async joinRoom(roomId: string, playerName: string, sceneId?: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (!supabase) return false;

    await this.leaveRoom();

    this.baseRoomId = roomId.trim() || 'ca-van-nghe-1';
    if (sceneId !== undefined) {
      this.sceneScopeId = sceneId;
    }
    this.roomId = this.baseRoomId;
    this.localPlayerName = playerName.trim() || 'Khách';
    this.joinedAt = Date.now();
    this.localChairId = null;
    this.remotePlayers.clear();
    this.presenceList = [];
    this.speakingPeers.clear();
    this.voicePolicy = { mode: 'free', updatedBy: '', updatedAt: 0 };

    const channelTopic = this.sceneScopeId
      ? `room:${this.baseRoomId}:${this.sceneScopeId}`
      : `room:${this.baseRoomId}`;
    const channel = supabase.channel(channelTopic, {
      config: {
        presence: { key: this.localPlayerId },
        broadcast: { self: false },
      },
    });

    channel.on('presence', { event: 'sync' }, () => {
      if (this.channel !== channel) return;
      this.handlePresenceSync(channel);
    });

    channel.on('broadcast', { event: 'player:state' }, ({ payload }) => {
      if (this.channel !== channel) return;
      this.handleRemotePlayerState(payload as RemotePlayerState);
    });

    channel.on('broadcast', { event: 'stage:sync' }, ({ payload }) => {
      if (this.channel !== channel || this.isHost()) return;
      const stage = payload as NetworkStageState;
      if (stage) {
        this.hostStageState = stage;
        this.onRemoteStageCallback?.(stage);
      }
    });

    channel.on('broadcast', { event: 'stage:sync-live' }, () => {
      if (this.channel !== channel || this.isHost()) return;
      this.onRemoteStageLiveSyncCallback?.();
    });

    channel.on('broadcast', { event: 'karaoke:sync' }, ({ payload }) => {
      if (this.channel !== channel) return;
      const k = payload as NetworkKaraokeState;
      if (!k || k.singerId === this.localPlayerId) return;
      this.remoteKaraokeState = k.active ? k : null;
      this.onRemoteKaraokeCallback?.(k);
    });

    channel.on('broadcast', { event: 'rtc:signal' }, ({ payload }) => {
      if (this.channel !== channel) return;
      const msg = payload as RtcSignalMessage;
      if (!msg || msg.fromId === this.localPlayerId) return;
      if (msg.targetId !== '*' && msg.targetId !== this.localPlayerId) return;
      this.onRtcSignalCallback?.(msg);
    });

    channel.on('broadcast', { event: 'voice:signal' }, ({ payload }) => {
      if (this.channel !== channel) return;
      const msg = payload as RtcSignalMessage;
      if (!msg || msg.fromId === this.localPlayerId) return;
      if (msg.targetId !== '*' && msg.targetId !== this.localPlayerId) return;
      this.onVoiceSignalCallback?.(msg);
    });

    channel.on('broadcast', { event: 'chat:message' }, ({ payload }) => {
      if (this.channel !== channel) return;
      const msg = payload as ChatMessage;
      if (!msg || !msg.text) return;
      window.dispatchEvent(new CustomEvent<ChatMessage>('cavannghe:chat-message', { detail: msg }));
    });

    channel.on('broadcast', { event: 'voice:policy' }, ({ payload }) => {
      if (this.channel !== channel) return;
      const policy = payload as RoomVoicePolicy;
      if (!policy) return;
      if (this.hostId && policy.updatedBy !== this.hostId) return;
      if (policy.updatedAt >= this.voicePolicy.updatedAt) {
        this.voicePolicy = policy;
        window.dispatchEvent(
          new CustomEvent<RoomVoicePolicy>('cavannghe:voice-policy', { detail: policy })
        );
      }
    });

    channel.on('broadcast', { event: 'voice:speaking' }, ({ payload }) => {
      if (this.channel !== channel) return;
      const info = payload as VoiceSpeakingPayload;
      if (!info || !info.playerId) return;
      if (info.speaking) {
        this.speakingPeers.add(info.playerId);
      } else {
        this.speakingPeers.delete(info.playerId);
      }
      window.dispatchEvent(
        new CustomEvent<Set<string>>('cavannghe:voice-speaking', {
          detail: new Set(this.speakingPeers),
        })
      );
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

  async switchSceneRoom(sceneId: string): Promise<boolean> {
    const nextScope = sceneId.trim();
    if (this.sceneScopeId === nextScope) return true;
    this.sceneScopeId = nextScope;
    if (!this.connected) return true;
    return this.joinRoom(this.baseRoomId, this.localPlayerName, nextScope);
  }

  async leaveRoom(): Promise<void> {
    if (this.channel) {
      const ch = this.channel;
      const hadRemoteKaraoke = this.remoteKaraokeState;
      this.channel = null;
      this.connected = false;
      this.remotePlayers.clear();
      this.presenceList = [];
      this.hostId = null;
      this.hostName = null;
      this.hostStageState = null;
      this.remoteKaraokeState = null;
      this.localKaraokeState = null;
      this.speakingPeers.clear();
      this.voicePolicy = { mode: 'free', updatedBy: '', updatedAt: 0 };

      if (hadRemoteKaraoke) {
        this.onRemoteKaraokeCallback?.({
          ...hadRemoteKaraoke,
          active: false,
          isPlaying: false,
          updatedAt: Date.now(),
        });
      }

      window.dispatchEvent(
        new CustomEvent<Set<string>>('cavannghe:voice-speaking', {
          detail: new Set(),
        })
      );
      window.dispatchEvent(
        new CustomEvent<RoomVoicePolicy>('cavannghe:voice-policy', {
          detail: this.voicePolicy,
        })
      );
      window.dispatchEvent(new CustomEvent('cavannghe:room-left'));

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

  broadcastStageLiveSync(): void {
    if (!this.connected || !this.channel || !this.isHost()) return;
    void this.channel.send({
      type: 'broadcast',
      event: 'stage:sync-live',
      payload: { updatedAt: Date.now() },
    });
  }

  getLocalPlayerName(): string {
    return this.localPlayerName;
  }

  getRemoteKaraokeState(): NetworkKaraokeState | null {
    return this.remoteKaraokeState;
  }

  broadcastKaraokeState(
    partial: Omit<NetworkKaraokeState, 'singerId' | 'singerName' | 'updatedAt'>
  ): void {
    const state: NetworkKaraokeState = {
      ...partial,
      singerId: this.localPlayerId,
      singerName: this.localPlayerName,
      updatedAt: Date.now(),
    };
    this.localKaraokeState = state.active ? state : null;
    if (!this.connected || !this.channel) return;

    void this.channel.send({
      type: 'broadcast',
      event: 'karaoke:sync',
      payload: state,
    });
    void this.trackLocalPresence();
  }

  sendRtcSignal(msg: Omit<RtcSignalMessage, 'fromId'>): void {
    if (!this.connected || !this.channel) return;
    const payload: RtcSignalMessage = {
      ...msg,
      fromId: this.localPlayerId,
    };
    void this.channel.send({
      type: 'broadcast',
      event: 'rtc:signal',
      payload,
    });
  }

  sendVoiceSignal(msg: Omit<RtcSignalMessage, 'fromId'>): void {
    if (!this.connected || !this.channel) return;
    const payload: RtcSignalMessage = {
      ...msg,
      fromId: this.localPlayerId,
    };
    void this.channel.send({
      type: 'broadcast',
      event: 'voice:signal',
      payload,
    });
  }

  sendChatMessage(text: string): ChatMessage | null {
    const clean = text.trim().slice(0, 300);
    if (!clean) return null;

    const msg: ChatMessage = {
      id: `${this.localPlayerId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      senderId: this.localPlayerId,
      senderName: this.localPlayerName,
      isHost: this.isHost(),
      text: clean,
      timestamp: Date.now(),
      kind: 'chat',
    };

    window.dispatchEvent(new CustomEvent<ChatMessage>('cavannghe:chat-message', { detail: msg }));

    if (this.connected && this.channel) {
      void this.channel.send({
        type: 'broadcast',
        event: 'chat:message',
        payload: msg,
      });
    }
    return msg;
  }

  getVoicePolicy(): RoomVoicePolicy {
    return this.voicePolicy;
  }

  broadcastVoicePolicy(mode: VoicePolicyMode): boolean {
    if (!this.isHost()) return false;
    const policy: RoomVoicePolicy = {
      mode,
      updatedBy: this.localPlayerId,
      updatedAt: Date.now(),
    };
    this.voicePolicy = policy;
    window.dispatchEvent(
      new CustomEvent<RoomVoicePolicy>('cavannghe:voice-policy', { detail: policy })
    );

    if (this.connected && this.channel) {
      void this.channel.send({
        type: 'broadcast',
        event: 'voice:policy',
        payload: policy,
      });
      void this.trackLocalPresence();
    }
    return true;
  }

  broadcastVoiceSpeaking(speaking: boolean): void {
    if (speaking) {
      this.speakingPeers.add(this.localPlayerId);
    } else {
      this.speakingPeers.delete(this.localPlayerId);
    }
    window.dispatchEvent(
      new CustomEvent<Set<string>>('cavannghe:voice-speaking', {
        detail: new Set(this.speakingPeers),
      })
    );

    if (!this.connected || !this.channel) return;
    void this.channel.send({
      type: 'broadcast',
      event: 'voice:speaking',
      payload: { playerId: this.localPlayerId, speaking } satisfies VoiceSpeakingPayload,
    });
  }

  getSpeakingPeerIds(): Set<string> {
    return new Set(this.speakingPeers);
  }

  private async trackLocalPresence(): Promise<void> {
    if (!this.channel || !this.connected) return;
    const payload: PresencePayload = {
      playerId: this.localPlayerId,
      name: this.localPlayerName,
      joinedAt: this.joinedAt,
      chairId: this.localChairId,
      ...(this.isHost() && this.hostStageState ? { stageState: this.hostStageState } : {}),
      ...(this.isHost() && this.voicePolicy.updatedAt > 0 ? { voicePolicy: this.voicePolicy } : {}),
      ...(this.localKaraokeState ? { karaokeState: this.localKaraokeState } : {}),
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

    // If local player just became Host, publish stageState/voicePolicy in presence
    if (prevHostId !== this.hostId && this.hostId === this.localPlayerId && (this.hostStageState || this.voicePolicy.updatedAt > 0)) {
      void this.trackLocalPresence();
    }

    // If guest, sync stageState & voicePolicy from Host's presence when joining or when host changes
    if (host && host.playerId !== this.localPlayerId) {
      if (host.stageState) {
        const prevTs = this.hostStageState?.updatedAt ?? 0;
        if (host.stageState.updatedAt > prevTs) {
          this.hostStageState = host.stageState;
          this.onRemoteStageCallback?.(host.stageState);
        }
      }
      if (host.voicePolicy && host.voicePolicy.updatedAt > this.voicePolicy.updatedAt) {
        this.voicePolicy = host.voicePolicy;
        window.dispatchEvent(
          new CustomEvent<RoomVoicePolicy>('cavannghe:voice-policy', { detail: host.voicePolicy })
        );
      }
    }

    const activeIds = new Set(list.map((p) => p.playerId));
    for (const id of this.remotePlayers.keys()) {
      if (!activeIds.has(id)) {
        this.remotePlayers.delete(id);
      }
    }
    let speakingChanged = false;
    for (const id of [...this.speakingPeers]) {
      if (id !== this.localPlayerId && !activeIds.has(id)) {
        this.speakingPeers.delete(id);
        speakingChanged = true;
      }
    }
    if (speakingChanged) {
      window.dispatchEvent(
        new CustomEvent<Set<string>>('cavannghe:voice-speaking', {
          detail: new Set(this.speakingPeers),
        })
      );
    }

    // Sync active Karaoke singer state from presence for late joiners, or clear if singer left
    const activeSinger = list.find(
      (p) => p.playerId !== this.localPlayerId && p.karaokeState?.active
    );
    if (activeSinger?.karaokeState) {
      const prevTs = this.remoteKaraokeState?.updatedAt ?? 0;
      if (
        activeSinger.karaokeState.updatedAt > prevTs ||
        this.remoteKaraokeState?.singerId !== activeSinger.karaokeState.singerId
      ) {
        this.remoteKaraokeState = activeSinger.karaokeState;
        this.onRemoteKaraokeCallback?.(activeSinger.karaokeState);
      }
    } else if (this.remoteKaraokeState && !activeIds.has(this.remoteKaraokeState.singerId)) {
      const cleared: NetworkKaraokeState = {
        ...this.remoteKaraokeState,
        active: false,
        isPlaying: false,
        updatedAt: Date.now(),
      };
      this.remoteKaraokeState = null;
      this.onRemoteKaraokeCallback?.(cleared);
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
