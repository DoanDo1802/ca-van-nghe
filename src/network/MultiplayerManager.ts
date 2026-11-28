import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient, getSupabaseRestConfig } from './supabaseClient';
import { AdminService } from './AdminService';
import {
  getSavedAvatarColor,
  getSavedAvatarModel,
  saveAvatarColor,
  saveAvatarModel,
  type AvatarModelId,
} from '../utils/avatarColor';
import { DebugLogger } from '../utils/debugLogger';

export const PUBLIC_LOBBY_ROOM_ID = 'public-lobby';

export interface NetworkStageState {
  senderId?: string;
  sourceType: 'media' | 'youtube';
  mediaUrl: string;
  youtubeVideoId: string | null;
  title: string;
  isPlaying: boolean;
  isScreenOn: boolean;
  isMuted?: boolean;
  currentTime?: number;
  isLive?: boolean;
  updatedAt: number;
}

export interface KaraokeTurn {
  id: string;
  singerId: string;
}

export interface NetworkKaraokeState {
  turnId?: string;
  active: boolean;
  singerId: string;
  singerName: string;
  youtubeVideoId: string | null;
  title: string;
  isPlaying: boolean;
  currentTime?: number;
  musicVolume?: number;
  syncYouTubeAudio?: boolean;
  updatedAt: number;
}

export interface RtcSignalMessage {
  fromId: string;
  targetId: string;
  turnId?: string;
  negotiationId?: string;
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
  isHoldingMic?: boolean;
  isAdmin?: boolean;
  avatarColor?: string;
  avatarModel?: string;
  joinedAt: number;
  seq: number;
  chairStateSeq?: number;
}

export interface NetworkPingSnapshot {
  pingMs: number | null;
  status: 'good' | 'fair' | 'poor' | 'offline';
  source: 'realtime' | 'http' | 'none';
  updatedAt: number;
}

export interface RoomStatusSnapshot {
  connected: boolean;
  joiningOrInRoom: boolean;
  roomId: string;
  localPlayerId: string;
  localPlayerName: string;
  localIsAdmin: boolean;
  isHost: boolean;
  hostId: string | null;
  hostName: string | null;
  karaokeTurn: KaraokeTurn | null;
  playerCount: number;
  players: Array<{ id: string; name: string; isHost: boolean; isLocal: boolean; isAdmin: boolean }>;
}

interface PresencePayload {
  playerId: string;
  name: string;
  isAdmin?: boolean;
  avatarColor?: string;
  avatarModel?: string;
  joinedAt: number;
  chairId: string | null;
  isHoldingMic?: boolean;
  playerStateSeq?: number;
  stageState?: NetworkStageState;
  karaokeState?: NetworkKaraokeState;
  karaokeTurn?: KaraokeTurn | null;
  karaokeRequestId?: string;
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
  private desiredRoomActive = false;
  private roomSessionId = 0;
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private baseRoomId = 'ca-van-nghe-1';
  private sceneScopeId = '';
  private roomId = 'ca-van-nghe-1';
  private localPlayerId = `p_${Math.random().toString(36).slice(2, 10)}`;
  private readonly localDeviceId = AdminService.getOrCreateDeviceId();
  private localPlayerName = 'Khách';
  private localAvatarColor = getSavedAvatarColor();
  private localAvatarModel: AvatarModelId = getSavedAvatarModel();
  private localIsAdmin = false;
  private roomPassword = '';
  private lastJoinError = '';
  private roomHeartbeatTimer: number | null = null;
  private inFlightDbSyncs = new Set<Promise<void>>();
  private pendingCleanupPromise: Promise<void> | null = null;
  private lastKnownOtherDbPlayers = 0;
  private joinedAt = Date.now();
  private localChairId: string | null = null;
  private localHoldingMic = false;
  private hostStageState: NetworkStageState | null = null;
  private lastStageUpdateBySender = new Map<string, number>();
  private remoteKaraokeState: NetworkKaraokeState | null = null;
  private karaokeTurn: KaraokeTurn | null = null;
  private localKaraokeRequestId: string | null = null;
  private dismissedKaraokeRequests = new Set<string>();
  private karaokeRecovery: { turnId: string; deadline: number; timer: number } | null = null;
  private lastRemoteKaraokeTimestamp = -1;
  private localKaraokeState: NetworkKaraokeState | null = null;
  private hostId: string | null = null;
  private hostName: string | null = null;

  private pingMs: number | null = null;
  private pingSource: 'realtime' | 'http' | 'none' = 'none';
  private pingUpdatedAt = 0;
  private realtimeHeartbeatHooked = false;
  private initialPingTimer: number | null = null;
  private fallbackPingTimer: number | null = null;

  private remotePlayers = new Map<string, RemotePlayerState>();
  private presenceList: PresencePayload[] = [];
  private remoteLastBroadcastAt = new Map<string, number>();
  private pendingPresenceRemovals = new Map<string, number>();
  private speakingPeers = new Set<string>();
  private voicePolicy: RoomVoicePolicy = { mode: 'free', updatedBy: '', updatedAt: 0 };

  private lastBroadcastTime = 0;
  private lastSentSig = '';
  private localSeq = 0;

  private onRemoteStageCallback: ((state: NetworkStageState) => void) | null = null;
  private onStageSnapshotRequested: (() => void) | null = null;
  private onRemoteStageLiveSyncCallback: (() => void) | null = null;
  private onRemoteKaraokeCallback: ((state: NetworkKaraokeState) => void) | null = null;
  private onRtcSignalCallback: ((msg: RtcSignalMessage) => void) | null = null;
  private onVoiceSignalCallback: ((msg: RtcSignalMessage) => void) | null = null;

  private constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.sendUnloadCleanup());
      window.addEventListener('beforeunload', () => this.sendUnloadCleanup());
      window.addEventListener('online', () => this.handleForegroundRecovery());
      window.addEventListener('offline', () => {
        if (!this.desiredRoomActive) return;
        this.connected = false;
        this.clearPingTimers();
        this.resetPingState();
        this.emitRoomStatus();
      });
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.handleForegroundRecovery();
        }
      });
    }
  }

  private handleForegroundRecovery(): void {
    if (!this.desiredRoomActive) return;
    if (this.connected && this.channel) {
      DebugLogger.log('Multiplayer', `Foreground recovery: refreshing presence & DB heartbeat for room "${this.baseRoomId}"`);
      void this.trackLocalPresence();
      void this.syncSelfPlayerRow();
      if (this.isHost()) {
        void this.syncRoomRegistry();
      }
    } else if (this.reconnectTimer === null) {
      DebugLogger.warn('Multiplayer', `Foreground recovery: channel disconnected in room "${this.baseRoomId}", triggering immediate reconnect`);
      this.reconnectAttempt = 0;
      this.scheduleReconnect(this.roomSessionId, 150);
    }
  }

  private sendUnloadCleanup(): void {
    if (!this.desiredRoomActive || !this.baseRoomId) return;
    const cfg = getSupabaseRestConfig();
    if (!cfg) return;
    const headers = {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.anonKey}`,
      'Content-Type': 'application/json',
    };
    try {
      void fetch(`${cfg.url}/rest/v1/rpc/remove_room_player`, {
        method: 'POST',
        keepalive: true,
        headers,
        body: JSON.stringify({
          p_room_id: this.baseRoomId,
          p_player_id: this.localPlayerId,
        }),
      });

      const otherPresence = this.presenceList.filter((p) => p.playerId !== this.localPlayerId);
      const encodedRoomId = encodeURIComponent(this.baseRoomId);

      if (otherPresence.length === 0 && this.remotePlayers.size === 0 && this.lastKnownOtherDbPlayers === 0) {
        // Last player in room: delete empty room AND zero player_count via RPC in case RLS blocks DELETE
        void fetch(`${cfg.url}/rest/v1/active_rooms?room_id=eq.${encodedRoomId}`, {
          method: 'DELETE',
          keepalive: true,
          headers,
        });
        void fetch(`${cfg.url}/rest/v1/rpc/upsert_room_heartbeat`, {
          method: 'POST',
          keepalive: true,
          headers,
          body: JSON.stringify({
            p_room_id: this.baseRoomId,
            p_room_name: this.baseRoomId,
            p_host_name: this.hostName || this.localPlayerName,
            p_scene_id: this.sceneScopeId || 'ca-van-nghe-lobby',
            p_player_count: 0,
            p_has_password: false,
            p_password: null,
          }),
        });
      } else if (this.isHost() && otherPresence.length > 0) {
        // Host closing browser while others remain: immediately transfer host on DB
        const nextHost = otherPresence[0];
        const encodedNextHostId = encodeURIComponent(nextHost.playerId);
        void fetch(
          `${cfg.url}/rest/v1/room_players?room_id=eq.${encodedRoomId}&player_id=eq.${encodedNextHostId}`,
          {
            method: 'PATCH',
            keepalive: true,
            headers,
            body: JSON.stringify({ is_host: true }),
          }
        );
        void fetch(`${cfg.url}/rest/v1/rpc/upsert_room_heartbeat`, {
          method: 'POST',
          keepalive: true,
          headers,
          body: JSON.stringify({
            p_room_id: this.baseRoomId,
            p_room_name: this.baseRoomId,
            p_host_name: nextHost.name,
            p_scene_id: this.sceneScopeId || 'ca-van-nghe-lobby',
            p_player_count: otherPresence.length,
            p_has_password: Boolean(this.roomPassword),
            p_password: this.roomPassword?.trim() || null,
          }),
        });
      }
    } catch {
      // ignore unload network errors
    }
  }

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

  setLocalIsAdmin(isAdmin: boolean): void {
    this.localIsAdmin = isAdmin;
    this.emitRoomStatus();
  }

  setLocalPlayerName(name: string): void {
    const clean = name.trim();
    if (!clean) return;
    this.localPlayerName = clean;
    if (this.connected) {
      void this.trackLocalPresence();
    }
    this.emitRoomStatus();
  }

  getLocalAvatarColor(): string {
    return this.localAvatarColor;
  }

  setLocalAvatarColor(hexColor: string): void {
    this.localAvatarColor = saveAvatarColor(hexColor);
    this.lastSentSig = '';
    if (this.connected) {
      void this.trackLocalPresence();
    }
  }

  getLocalAvatarModel(): AvatarModelId {
    return this.localAvatarModel;
  }

  setLocalAvatarModel(modelId: string): void {
    this.localAvatarModel = saveAvatarModel(modelId);
    this.lastSentSig = '';
    if (this.connected) {
      void this.trackLocalPresence();
    }
  }

  async waitForPendingCleanup(): Promise<void> {
    if (this.pendingCleanupPromise) {
      await this.pendingCleanupPromise;
    }
  }

  private trackDbSync(promise: Promise<void>): Promise<void> {
    this.inFlightDbSyncs.add(promise);
    return promise.finally(() => {
      this.inFlightDbSyncs.delete(promise);
    });
  }

  getLastJoinError(): string {
    return this.lastJoinError;
  }

  async joinRoom(
    roomId: string,
    playerName: string,
    sceneId?: string,
    options?: { password?: string; bypassLimits?: boolean; isSceneSwitch?: boolean }
  ): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      DebugLogger.warn('Multiplayer', 'Cannot joinRoom: Supabase client is not configured');
      return false;
    }

    const targetRoomId = roomId.trim() || 'ca-van-nghe-1';
    const isSceneSwitch = Boolean(options?.isSceneSwitch) && targetRoomId === this.baseRoomId;
    const targetPassword =
      options?.password !== undefined
        ? options.password.trim()
        : isSceneSwitch
          ? this.roomPassword
          : '';
    const isAdminBypass = this.localIsAdmin && (options?.bypassLimits !== false);

    this.lastJoinError = '';
    if (!isSceneSwitch) {
      const check = await AdminService.checkCanJoinRoom(
        targetRoomId,
        targetPassword,
        isAdminBypass,
        this.localPlayerId,
        playerName,
        this.localDeviceId
      );
      if (!check.allowed) {
        this.lastJoinError = check.reason || 'Không thể tham gia phòng.';
        DebugLogger.warn('Multiplayer', `Join room "${targetRoomId}" denied: ${this.lastJoinError}`);
        return false;
      }
    }

    DebugLogger.log('Multiplayer', `Joining room "${targetRoomId}" (scene=${(sceneId ?? this.sceneScopeId) || 'default'}) as "${playerName.trim() || 'Khách'}"`);
    this.clearReconnectTimer();
    await this.leaveRoom({ preserveRoomMembership: isSceneSwitch });

    const sessionId = ++this.roomSessionId;
    this.desiredRoomActive = true;
    this.reconnectAttempt = 0;

    this.baseRoomId = targetRoomId;
    this.roomPassword = targetPassword;
    if (sceneId !== undefined) {
      this.sceneScopeId = sceneId;
    }
    this.roomId = this.baseRoomId;
    this.localPlayerName = playerName.trim() || 'Khách';
    this.joinedAt = Date.now();
    this.localChairId = null;
    this.localHoldingMic = false;
    this.remotePlayers.clear();
    this.presenceList = [];
    this.speakingPeers.clear();
    this.voicePolicy = { mode: 'free', updatedBy: '', updatedAt: 0 };
    this.lastKnownOtherDbPlayers = 0;

    // Start DB heartbeat immediately for non-lobby rooms so room & player stay alive
    // even if Realtime takes a moment or temporarily hiccups later.
    this.startRoomHeartbeat();

    const ok = await this.subscribeRoomChannel(sessionId, true);
    if (!ok && this.roomSessionId === sessionId) {
      await this.leaveRoom();
    }
    return ok;
  }

  private getChannelTopic(): string {
    return this.sceneScopeId
      ? `room:${this.baseRoomId}:${this.sceneScopeId}`
      : `room:${this.baseRoomId}`;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(sessionId: number, overrideDelayMs?: number): void {
    if (!this.desiredRoomActive || this.roomSessionId !== sessionId) return;
    if (this.reconnectTimer !== null) return;
    const delay =
      overrideDelayMs ?? Math.min(10_000, Math.round(1500 * Math.pow(1.6, this.reconnectAttempt)));
    this.reconnectAttempt = Math.min(this.reconnectAttempt + 1, 6);
    DebugLogger.warn(
      'Multiplayer',
      `Scheduling reconnect for "${this.getChannelTopic()}" in ${delay}ms (attempt #${this.reconnectAttempt})`
    );
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.desiredRoomActive || this.roomSessionId !== sessionId || this.connected) return;
      void this.subscribeRoomChannel(sessionId, false);
    }, delay);
  }

  private attachChannelListeners(channel: RealtimeChannel): void {
    channel.on('presence', { event: 'sync' }, () => {
      if (this.channel !== channel) return;
      this.handlePresenceSync(channel);
    });

    channel.on('broadcast', { event: 'player:state' }, ({ payload }) => {
      if (this.channel !== channel) return;
      this.handleRemotePlayerState(payload as RemotePlayerState);
    });

    channel.on('broadcast', { event: 'stage:sync' }, ({ payload }) => {
      if (this.channel !== channel) return;
      this.acceptStageState(payload as NetworkStageState);
    });

    channel.on('broadcast', { event: 'stage:request' }, () => {
      if (this.channel === channel && this.isHost()) this.onStageSnapshotRequested?.();
    });

    channel.on('broadcast', { event: 'stage:sync-live' }, () => {
      if (this.channel !== channel) return;
      this.onRemoteStageLiveSyncCallback?.();
    });

    channel.on('broadcast', { event: 'karaoke:sync' }, ({ payload }) => {
      if (this.channel !== channel) return;
      const k = payload as NetworkKaraokeState;
      if (!k || k.singerId === this.localPlayerId ||
          k.singerId !== this.karaokeTurn?.singerId || k.turnId !== this.karaokeTurn.id) return;
      if (!Number.isFinite(k.updatedAt) || k.updatedAt < this.lastRemoteKaraokeTimestamp) return;
      this.lastRemoteKaraokeTimestamp = k.updatedAt;
      this.touchRemoteBroadcast(k.singerId);
      this.remoteKaraokeState = k.active ? k : null;
      this.onRemoteKaraokeCallback?.(k);
    });

    channel.on('broadcast', { event: 'karaoke:volume' }, ({ payload }) => {
      if (this.channel !== channel) return;
      const data = payload as { singerId?: string; turnId?: string; musicVolume?: number } | undefined;
      if (
        !data ||
        !data.singerId ||
        data.singerId === this.localPlayerId ||
        data.singerId !== this.karaokeTurn?.singerId ||
        data.turnId !== this.karaokeTurn.id ||
        typeof data.musicVolume !== 'number'
      ) {
        return;
      }
      const clamped = Math.max(0, Math.min(100, Math.round(data.musicVolume)));
      this.touchRemoteBroadcast(data.singerId);
      if (this.remoteKaraokeState && this.remoteKaraokeState.singerId === data.singerId) {
        this.remoteKaraokeState = {
          ...this.remoteKaraokeState,
          musicVolume: clamped,
        };
      }
      window.dispatchEvent(
        new CustomEvent<{ singerId: string; musicVolume: number }>(
          'cavannghe:remote-karaoke-volume',
          { detail: { singerId: data.singerId, musicVolume: clamped } }
        )
      );
    });

    channel.on('broadcast', { event: 'rtc:signal' }, ({ payload }) => {
      if (this.channel !== channel) return;
      const msg = payload as RtcSignalMessage;
      if (!msg || msg.fromId === this.localPlayerId) return;
      if (msg.targetId !== '*' && msg.targetId !== this.localPlayerId) return;
      const turn = this.karaokeTurn;
      if (!turn || msg.turnId !== turn.id) return;
      if (msg.kind === 'offer' || msg.kind === 'bye') {
        if (msg.fromId !== turn.singerId) return;
      } else if (msg.kind === 'ready' || msg.kind === 'answer') {
        if (this.localPlayerId !== turn.singerId) return;
      } else if (msg.fromId !== turn.singerId && this.localPlayerId !== turn.singerId) return;
      this.touchRemoteBroadcast(msg.fromId);
      this.onRtcSignalCallback?.(msg);
    });

    channel.on('broadcast', { event: 'voice:signal' }, ({ payload }) => {
      if (this.channel !== channel) return;
      const msg = payload as RtcSignalMessage;
      if (!msg || msg.fromId === this.localPlayerId) return;
      if (msg.targetId !== '*' && msg.targetId !== this.localPlayerId) return;
      this.touchRemoteBroadcast(msg.fromId);
      this.onVoiceSignalCallback?.(msg);
    });

    channel.on('broadcast', { event: 'chat:message' }, ({ payload }) => {
      if (this.channel !== channel) return;
      const msg = payload as ChatMessage;
      if (!msg || !msg.text) return;
      if (msg.senderId && msg.senderId !== this.localPlayerId) {
        this.touchRemoteBroadcast(msg.senderId);
      }
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
      if (info.playerId !== this.localPlayerId) {
        this.touchRemoteBroadcast(info.playerId);
      }
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

    channel.on('broadcast', { event: 'admin:moderation' }, ({ payload }) => {
      if (this.channel !== channel) return;
      const mod = payload as {
        action: 'kick' | 'ban';
        targetPlayerId: string;
        hostPlayerId?: string;
        closeRoom?: boolean;
        targetPlayerName?: string;
        reason?: string;
      };
      if (!mod) return;
      const isRoomClosed = Boolean(mod.closeRoom || mod.targetPlayerId === '*');
      const isTarget = mod.targetPlayerId === this.localPlayerId;
      if (!isRoomClosed && !isTarget) return;

      if (isRoomClosed && mod.hostPlayerId !== this.localPlayerId) {
        this.lastJoinError = 'Phòng đã bị giải tán do Admin mời Chủ phòng ra khỏi phòng.';
      } else {
        this.lastJoinError =
          mod.action === 'ban'
            ? `Bạn đã bị Admin cấm vào phòng (${mod.reason || 'Vi phạm quy định'}).`
            : `Bạn đã bị Admin đá khỏi phòng (${mod.reason || 'Bị mời ra khỏi phòng'}).`;
      }
      void this.leaveRoom().then(() => {
        window.dispatchEvent(new CustomEvent('cavannghe:kicked', { detail: mod }));
      });
    });

    channel.on('broadcast', { event: 'stage:applause' }, ({ payload }) => {
      if (this.channel !== channel) return;
      const ev = payload as { playerId: string; playerName: string; x?: number; z?: number };
      if (!ev || ev.playerId === this.localPlayerId) return;
      this.touchRemoteBroadcast(ev.playerId);
      window.dispatchEvent(new CustomEvent('cavannghe:remote-applause', { detail: ev }));
    });
  }

  private async subscribeRoomChannel(sessionId: number, isInitialJoin: boolean): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (!supabase) return false;
    if (!this.desiredRoomActive || this.roomSessionId !== sessionId) return false;
    this.hookRealtimeHeartbeat();

    const prevChannel = this.channel;
    if (prevChannel) {
      this.channel = null;
      try {
        await supabase.removeChannel(prevChannel);
      } catch {
        // ignore cleanup error
      }
    }
    if (!this.desiredRoomActive || this.roomSessionId !== sessionId) return false;

    const channel = supabase.channel(this.getChannelTopic(), {
      config: {
        presence: { key: this.localPlayerId },
        broadcast: { self: false },
      },
    });
    this.attachChannelListeners(channel);
    this.channel = channel;

    return new Promise<boolean>((resolve) => {
      let settled = false;
      let hasSubscribed = !isInitialJoin;
      const finish = (ok: boolean) => {
        if (!settled) {
          settled = true;
          resolve(ok);
        }
      };

      channel.subscribe(async (status) => {
        if (this.roomSessionId !== sessionId || !this.desiredRoomActive || this.channel !== channel) {
          finish(false);
          return;
        }

        if (status === 'SUBSCRIBED') {
          const isReconnect = hasSubscribed && !isInitialJoin;
          hasSubscribed = true;
          if (isReconnect) {
            // Reset joinedAt on reconnect so a previously disconnected host does not reclaim host
            this.joinedAt = Date.now();
          }
          this.reconnectAttempt = 0;
          this.clearReconnectTimer();
          this.connected = true;
          DebugLogger.log(
            'Multiplayer',
            `${isReconnect ? 'Reconnected' : 'Connected'} to channel "${this.getChannelTopic()}"`
          );
          await this.trackLocalPresence();
          if (this.roomSessionId !== sessionId || !this.desiredRoomActive || this.channel !== channel) {
            finish(false);
            return;
          }
          if (this.roomHeartbeatTimer === null) {
            this.startRoomHeartbeat();
          }
          void this.syncSelfPlayerRow();
          if (this.isHost()) {
            void this.syncRoomRegistry();
          }
          if (this.localKaraokeState?.active) {
            void channel.send({
              type: 'broadcast',
              event: 'karaoke:sync',
              payload: { ...this.localKaraokeState, updatedAt: Date.now() },
            });
          }
          this.emitRoomStatus();
          this.requestStageResync();
          this.scheduleInitialPingProbe();
          window.dispatchEvent(new CustomEvent('cavannghe:channel-subscribed'));
          finish(true);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.connected = false;
          this.clearPingTimers();
          this.resetPingState();
          this.emitRoomStatus();

          if (this.channel === channel) {
            this.channel = null;
            void supabase.removeChannel(channel).catch(() => {});
          }

          if (!hasSubscribed) {
            DebugLogger.error(
              'Multiplayer',
              `Initial subscription failed for "${this.getChannelTopic()}" with status=${status}`
            );
            finish(false);
          } else {
            DebugLogger.warn(
              'Multiplayer',
              `Channel "${this.getChannelTopic()}" disconnected (${status}); keeping DB heartbeat alive & auto-reconnecting`
            );
            // Keep DB heartbeat & local states intact and auto-reconnect in the background
            this.scheduleReconnect(sessionId);
            finish(true);
          }
        }
      });
    });
  }

  async switchSceneRoom(sceneId: string): Promise<boolean> {
    const nextScope = sceneId.trim();
    if (this.sceneScopeId === nextScope) return true;
    if (!this.connected && !this.desiredRoomActive) {
      this.sceneScopeId = nextScope;
      return true;
    }
    return this.joinRoom(this.baseRoomId, this.localPlayerName, nextScope, {
      isSceneSwitch: true,
    });
  }

  async leaveRoom(options?: { preserveRoomMembership?: boolean }): Promise<void> {
    const preserveRoomMembership = Boolean(options?.preserveRoomMembership);
    const wasRoomActive = this.desiredRoomActive;
    const wasHost = this.isHost();
    this.roomSessionId += 1;
    this.desiredRoomActive = false;
    this.clearReconnectTimer();
    this.stopRoomHeartbeat();
    this.clearKaraokeRecovery();
    this.clearPingTimers();
    this.resetPingState();
    this.localHoldingMic = false;

    const ch = this.channel;
    const hadRemoteKaraoke = this.remoteKaraokeState;
    const otherPresence = this.presenceList.filter((p) => p.playerId !== this.localPlayerId);
    const nextPresenceHost = otherPresence[0] ?? null;
    const prevBaseRoomId = this.baseRoomId;
    const prevHostName = this.hostName || this.localPlayerName;
    const prevScene = this.sceneScopeId;
    const prevRoomPassword = this.roomPassword;

    if (ch || this.connected || wasRoomActive) {
      this.channel = null;
      this.connected = false;
      this.remotePlayers.clear();
      this.presenceList = [];
      for (const timer of this.pendingPresenceRemovals.values()) {
        window.clearTimeout(timer);
      }
      this.pendingPresenceRemovals.clear();
      this.remoteLastBroadcastAt.clear();
      this.hostId = null;
      this.hostName = null;
      this.hostStageState = null;
      this.lastStageUpdateBySender.clear();
      this.remoteKaraokeState = null;
      this.localKaraokeState = null;
      this.karaokeTurn = null;
      this.localKaraokeRequestId = null;
      this.dismissedKaraokeRequests.clear();
      this.lastRemoteKaraokeTimestamp = -1;
      this.speakingPeers.clear();
      this.voicePolicy = { mode: 'free', updatedBy: '', updatedAt: 0 };
      this.lastKnownOtherDbPlayers = 0;

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
      if (!preserveRoomMembership) {
        window.dispatchEvent(new CustomEvent('cavannghe:room-left'));
      }

      const runCleanup = (async () => {
        if (ch) {
          try {
            await ch.untrack();
          } catch {
            // ignore
          }
          try {
            const supabase = getSupabaseClient();
            if (supabase) {
              await supabase.removeChannel(ch);
            } else {
              await ch.unsubscribe();
            }
          } catch {
            // ignore
          }
        }

        if (prevBaseRoomId && !preserveRoomMembership) {
          DebugLogger.log('Multiplayer', `Left room "${prevBaseRoomId}" (scene=${prevScene || 'default'})`);
          if (this.inFlightDbSyncs.size > 0) {
            await Promise.race([
              Promise.allSettled([...this.inFlightDbSyncs]),
              new Promise<void>((resolve) => window.setTimeout(resolve, 1500)),
            ]);
          }
          await AdminService.removeRoomPlayer(prevBaseRoomId, this.localPlayerId);
          const remaining = await AdminService.fetchRoomPlayers(prevBaseRoomId);
          const remainingOthers = remaining.filter((p) => p.player_id !== this.localPlayerId);
          const rejoinedSameRoom = this.desiredRoomActive && this.baseRoomId === prevBaseRoomId;

          if (remainingOthers.length === 0 && !rejoinedSameRoom) {
            DebugLogger.log('Multiplayer', `Room "${prevBaseRoomId}" is empty; deleting room on DB`);
            await AdminService.deleteRoom(prevBaseRoomId, prevHostName, prevScene);
          } else if (wasHost && !rejoinedSameRoom) {
            const targetHost = nextPresenceHost
              ? { id: nextPresenceHost.playerId, name: nextPresenceHost.name }
              : remainingOthers[0]
                ? { id: remainingOthers[0].player_id, name: remainingOthers[0].player_name }
                : null;
            if (targetHost) {
              DebugLogger.log(
                'Multiplayer',
                `Host "${prevHostName}" left "${prevBaseRoomId}"; transferring DB host to "${targetHost.name}"`
              );
              await AdminService.transferRoomHost({
                roomId: prevBaseRoomId,
                newHostId: targetHost.id,
                newHostName: targetHost.name,
                sceneId: prevScene,
                playerCount: Math.max(1, otherPresence.length, remainingOthers.length),
                hasPassword: Boolean(prevRoomPassword),
                password: prevRoomPassword,
              });
            }
          }
        }
      })();

      if (!preserveRoomMembership) {
        const trackedCleanup: Promise<void> = runCleanup.finally(() => {
          if (this.pendingCleanupPromise === trackedCleanup) {
            this.pendingCleanupPromise = null;
          }
        });
        this.pendingCleanupPromise = trackedCleanup;
        await trackedCleanup;
      } else {
        await runCleanup;
      }
      this.emitRoomStatus();
    } else {
      await this.waitForPendingCleanup();
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  isHost(): boolean {
    if (!this.connected) {
      // Offline mode: local user controls stage; during transient reconnect in a room, keep last role
      if (!this.desiredRoomActive) return true;
      return this.hostId === this.localPlayerId;
    }
    return this.hostId === this.localPlayerId;
  }

  isLocalAdmin(): boolean {
    return this.localIsAdmin;
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

  hasLostChairClaim(chairId: string): boolean {
    return this.connected && [...this.remotePlayers.values()].some((player) =>
      player.chairId === chairId && player.id < this.localPlayerId
    );
  }

  getRoomStatus(): RoomStatusSnapshot {
    const players = this.presenceList.map((p) => ({
      id: p.playerId,
      name: p.name,
      isHost: p.playerId === this.hostId,
      isLocal: p.playerId === this.localPlayerId,
      isAdmin: Boolean(p.isAdmin),
    }));

    if (this.desiredRoomActive) {
      const seen = new Set(players.map((p) => p.id));
      if (!seen.has(this.localPlayerId)) {
        seen.add(this.localPlayerId);
        players.push({
          id: this.localPlayerId,
          name: this.localPlayerName,
          isHost: this.localPlayerId === this.hostId,
          isLocal: true,
          isAdmin: this.localIsAdmin,
        });
      }
      for (const rp of this.remotePlayers.values()) {
        if (!seen.has(rp.id)) {
          seen.add(rp.id);
          players.push({
            id: rp.id,
            name: rp.name,
            isHost: rp.id === this.hostId,
            isLocal: false,
            isAdmin: Boolean(rp.isAdmin),
          });
        }
      }
    }

    return {
      connected: this.connected,
      joiningOrInRoom: this.desiredRoomActive,
      roomId: this.roomId,
      localPlayerId: this.localPlayerId,
      localPlayerName: this.localPlayerName,
      localIsAdmin: this.localIsAdmin,
      isHost: this.isHost(),
      hostId: this.hostId,
      hostName: this.hostName,
      karaokeTurn: this.karaokeTurn,
      playerCount: Math.max(1, players.length),
      players,
    };
  }

  sendLocalPlayerState(
    state: {
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
      isHoldingMic?: boolean;
    },
    options?: { force?: boolean }
  ): void {
    if (!this.connected || !this.channel) return;

    const chairChanged = state.chairId !== this.localChairId;
    const nextHoldingMic = Boolean(state.isHoldingMic);
    const micChanged = nextHoldingMic !== this.localHoldingMic;
    const force = options?.force || chairChanged || micChanged;
    const now = performance.now();
    if (!force && now - this.lastBroadcastTime < BROADCAST_INTERVAL_MS) {
      return;
    }

    const vxVal = state.vx ?? 0;
    const vzVal = state.vz ?? 0;
    const sig = `${state.x.toFixed(2)},${state.y.toFixed(2)},${state.z.toFixed(2)},${vxVal.toFixed(1)},${vzVal.toFixed(1)},${state.yaw.toFixed(1)},${state.anim},${state.emote ?? ''},${state.isSitting ? 1 : 0},${state.chairId ?? ''},${nextHoldingMic ? 1 : 0},${this.localAvatarColor},${this.localAvatarModel}`;

    if (!force && sig === this.lastSentSig && now - this.lastBroadcastTime < 1500) {
      return;
    }

    this.lastBroadcastTime = now;
    this.lastSentSig = sig;
    this.localSeq += 1;
    if (chairChanged || micChanged) {
      if (chairChanged) this.localChairId = state.chairId;
      if (micChanged) this.localHoldingMic = nextHoldingMic;
      void this.trackLocalPresence();
    }

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
      isHoldingMic: nextHoldingMic,
      avatarColor: this.localAvatarColor,
      avatarModel: this.localAvatarModel,
      joinedAt: this.joinedAt,
      seq: this.localSeq,
    };

    void this.channel.send({
      type: 'broadcast',
      event: 'player:state',
      payload,
    });
  }

  setOnStageSnapshotRequested(callback: (() => void) | null): void {
    this.onStageSnapshotRequested = callback;
  }

  private acceptStageState(stage: NetworkStageState): void {
    if (!stage || !Number.isFinite(stage.updatedAt)) return;
    if (stage.senderId && this.hostId && stage.senderId !== this.hostId &&
        !this.presenceList.some((player) => player.playerId === stage.senderId && player.isAdmin)) return;
    const previousTime = stage.senderId
      ? this.lastStageUpdateBySender.get(stage.senderId)
      : this.hostStageState?.updatedAt;
    if (previousTime !== undefined && previousTime >= stage.updatedAt) return;
    if (stage.senderId) this.lastStageUpdateBySender.set(stage.senderId, stage.updatedAt);
    this.hostStageState = stage;
    this.onRemoteStageCallback?.(stage);
  }

  broadcastStageState(stage: NetworkStageState, options?: { updatePresence?: boolean }): void {
    if (this.connected && !this.isHost() && !this.localIsAdmin) return;
    const previousTime = this.lastStageUpdateBySender.get(this.localPlayerId) ?? 0;
    stage = { ...stage, senderId: this.localPlayerId, updatedAt: Math.max(stage.updatedAt, previousTime + 1) };
    this.lastStageUpdateBySender.set(this.localPlayerId, stage.updatedAt);
    this.hostStageState = stage;
    if (!this.connected || !this.channel || (!this.isHost() && !this.localIsAdmin)) return;

    void this.channel.send({
      type: 'broadcast',
      event: 'stage:sync',
      payload: stage,
    });
    if (options?.updatePresence !== false) {
      void this.trackLocalPresence();
    }
  }

  requestStageResync(): void {
    if (this.isHost()) return;
    if (this.hostStageState) this.onRemoteStageCallback?.(this.hostStageState);
    if (this.connected && this.channel) {
      void this.channel.send({ type: 'broadcast', event: 'stage:request', payload: {} });
    }
  }

  broadcastStageLiveSync(): void {
    if (!this.connected || !this.channel || (!this.isHost() && !this.localIsAdmin)) return;
    void this.channel.send({
      type: 'broadcast',
      event: 'stage:sync-live',
      payload: { updatedAt: Date.now() },
    });
  }

  getLocalPlayerName(): string {
    return this.localPlayerName;
  }

  requestKaraokeTurn(): boolean {
    if (!this.desiredRoomActive) return true;
    if (!this.connected || (this.karaokeTurn && this.karaokeTurn.singerId !== this.localPlayerId)) {
      return false;
    }
    if (this.localKaraokeRequestId) return true;

    this.localKaraokeRequestId = crypto.randomUUID();
    if (this.reconcileKaraokeTurn()) this.emitRoomStatus();
    void this.trackLocalPresence();
    return true;
  }

  releaseKaraokeTurn(): void {
    if (!this.localKaraokeRequestId) return;
    this.localKaraokeRequestId = null;
    if (this.reconcileKaraokeTurn()) this.emitRoomStatus();
    void this.trackLocalPresence();
  }

  removeKaraokeSinger(): void {
    if (!this.connected || !this.isHost() || !this.karaokeTurn) return;
    this.dismissedKaraokeRequests.add(this.karaokeTurn.id);
    if (this.reconcileKaraokeTurn()) this.emitRoomStatus();
    void this.trackLocalPresence();
  }

  private clearKaraokeRecovery(): void {
    if (this.karaokeRecovery) window.clearTimeout(this.karaokeRecovery.timer);
    this.karaokeRecovery = null;
  }

  private waitForSinger(turn: KaraokeTurn): boolean {
    if (turn.singerId === this.localPlayerId || this.dismissedKaraokeRequests.has(turn.id) ||
        this.presenceList.some((player) => player.playerId === turn.singerId)) return false;

    if (this.karaokeRecovery?.turnId !== turn.id) {
      this.clearKaraokeRecovery();
      const graceMs = 12000;
      const deadline = performance.now() + graceMs;
      const timer = window.setTimeout(() => {
        if (this.reconcileKaraokeTurn()) {
          this.emitRoomStatus();
          void this.trackLocalPresence();
        }
      }, graceMs);
      this.karaokeRecovery = { turnId: turn.id, deadline, timer };
    }
    return performance.now() < this.karaokeRecovery.deadline;
  }

  private reconcileKaraokeTurn(): boolean {
    if (!this.connected || !this.isHost()) return false;

    const requests = this.presenceList.flatMap(({ playerId, karaokeRequestId }) =>
      playerId !== this.localPlayerId && karaokeRequestId ? [{ id: karaokeRequestId, singerId: playerId }] : []
    );
    if (this.localKaraokeRequestId) {
      requests.push({ id: this.localKaraokeRequestId, singerId: this.localPlayerId });
    }
    if (this.karaokeTurn && this.waitForSinger(this.karaokeTurn)) return false;
    this.clearKaraokeRecovery();

    for (const id of this.dismissedKaraokeRequests) {
      if (!requests.some((request) => request.id === id)) this.dismissedKaraokeRequests.delete(id);
    }

    const eligible = requests.filter((request) => !this.dismissedKaraokeRequests.has(request.id));
    const winner = eligible.find((request) =>
      request.id === this.karaokeTurn?.id && request.singerId === this.karaokeTurn.singerId
    ) ?? eligible[0] ?? null;
    if (winner?.id === this.karaokeTurn?.id) return false;

    this.applyKaraokeTurn(winner);
    return true;
  }

  private applyKaraokeTurn(turn: KaraokeTurn | null): void {
    if (turn?.id === this.karaokeTurn?.id) return;
    this.clearKaraokeRecovery();
    this.karaokeTurn = turn;
    this.lastRemoteKaraokeTimestamp = -1;
    this.localKaraokeState = null;
    const previous = this.remoteKaraokeState;
    this.remoteKaraokeState = null;
    if (previous) this.onRemoteKaraokeCallback?.({ ...previous, active: false, isPlaying: false });
  }

  getRemoteKaraokeState(): NetworkKaraokeState | null {
    return this.remoteKaraokeState;
  }

  broadcastKaraokeState(
    partial: Omit<NetworkKaraokeState, 'singerId' | 'singerName' | 'updatedAt' | 'turnId'>,
    options?: { updatePresence?: boolean }
  ): void {
    if (this.desiredRoomActive && this.karaokeTurn?.singerId !== this.localPlayerId) return;
    const state: NetworkKaraokeState = {
      ...partial,
      turnId: this.karaokeTurn?.id,
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
    if (options?.updatePresence !== false) {
      void this.trackLocalPresence();
    }
  }

  broadcastKaraokeVolume(musicVolume: number, options?: { updatePresence?: boolean }): void {
    if (this.karaokeTurn?.singerId !== this.localPlayerId) return;
    const clamped = Math.max(0, Math.min(100, Math.round(musicVolume)));
    if (this.localKaraokeState) {
      this.localKaraokeState = {
        ...this.localKaraokeState,
        musicVolume: clamped,
      };
    }
    if (!this.connected || !this.channel) return;

    void this.channel.send({
      type: 'broadcast',
      event: 'karaoke:volume',
      payload: {
        singerId: this.localPlayerId,
        turnId: this.karaokeTurn.id,
        musicVolume: clamped,
      },
    });
    if (options?.updatePresence) {
      void this.trackLocalPresence();
    }
  }

  sendRtcSignal(msg: Omit<RtcSignalMessage, 'fromId'>): void {
    if (!this.connected || !this.channel || !this.karaokeTurn) return;
    const payload: RtcSignalMessage = {
      ...msg,
      turnId: this.karaokeTurn.id,
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

  broadcastApplause(x = 0, z = 0): void {
    if (!this.connected || !this.channel) return;
    void this.channel.send({
      type: 'broadcast',
      event: 'stage:applause',
      payload: {
        playerId: this.localPlayerId,
        playerName: this.localPlayerName,
        x,
        z,
        timestamp: Date.now(),
      },
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
      isAdmin: this.localIsAdmin,
      avatarColor: this.localAvatarColor,
      avatarModel: this.localAvatarModel,
      joinedAt: this.joinedAt,
      chairId: this.localChairId,
      isHoldingMic: this.localHoldingMic,
      playerStateSeq: this.localSeq,
      ...(this.isHost() && this.hostStageState ? { stageState: this.hostStageState } : {}),
      ...(this.isHost() && this.voicePolicy.updatedAt > 0 ? { voicePolicy: this.voicePolicy } : {}),
      ...(this.isHost() ? { karaokeTurn: this.karaokeTurn } : {}),
      ...(this.localKaraokeRequestId ? { karaokeRequestId: this.localKaraokeRequestId } : {}),
      ...(this.localKaraokeState ? { karaokeState: this.localKaraokeState } : {}),
    };
    try {
      await this.channel.track(payload);
    } catch (err) {
      DebugLogger.warn('Multiplayer', 'Failed to track local presence', err);
    }
  }

  private touchRemoteBroadcast(playerId: string): void {
    this.remoteLastBroadcastAt.set(playerId, Date.now());
    const pendingTimer = this.pendingPresenceRemovals.get(playerId);
    if (pendingTimer !== undefined) {
      window.clearTimeout(pendingTimer);
      this.pendingPresenceRemovals.delete(playerId);
    }
  }

  private schedulePresenceRemoval(channel: RealtimeChannel, playerId: string): void {
    if (this.pendingPresenceRemovals.has(playerId)) return;
    const graceMs = 12_000;
    const playerName = this.remotePlayers.get(playerId)?.name ?? playerId;
    DebugLogger.warn(
      'Multiplayer',
      `Remote player "${playerName}" (${playerId}) missing from Presence; starting ${graceMs / 1000}s grace timer`
    );
    const timer = window.setTimeout(() => {
      this.pendingPresenceRemovals.delete(playerId);
      if (this.channel !== channel) return;
      if (!this.connected) {
        this.schedulePresenceRemoval(channel, playerId);
        return;
      }
      if (this.presenceList.some((p) => p.playerId === playerId)) return;
      const lastSeen = this.remoteLastBroadcastAt.get(playerId) ?? 0;
      if (Date.now() - lastSeen < graceMs) {
        this.schedulePresenceRemoval(channel, playerId);
        return;
      }

      DebugLogger.warn(
        'Multiplayer',
        `Removing remote player "${playerName}" (${playerId}) after ${graceMs / 1000}s Presence & broadcast timeout`
      );
      this.remotePlayers.delete(playerId);
      if (this.isHost() && this.baseRoomId) {
        void AdminService.removeRoomPlayer(this.baseRoomId, playerId).then(() =>
          this.syncRoomRegistry()
        );
      }
      if (this.speakingPeers.delete(playerId)) {
        window.dispatchEvent(
          new CustomEvent<Set<string>>('cavannghe:voice-speaking', {
            detail: new Set(this.speakingPeers),
          })
        );
      }
      if (this.remoteKaraokeState && this.remoteKaraokeState.singerId === playerId) {
        DebugLogger.warn(
          'KaraokeSync',
          `Cleared active karaoke state because singer "${playerName}" timed out`
        );
        const cleared: NetworkKaraokeState = {
          ...this.remoteKaraokeState,
          active: false,
          isPlaying: false,
          updatedAt: Date.now(),
        };
        this.remoteKaraokeState = null;
        this.onRemoteKaraokeCallback?.(cleared);
      }
      this.emitRoomStatus();
    }, graceMs);
    this.pendingPresenceRemovals.set(playerId, timer);
  }

  private handlePresenceSync(channel: RealtimeChannel): void {
    const raw = channel.presenceState<PresencePayload>();
    const list: PresencePayload[] = [];
    for (const key of Object.keys(raw)) {
      const entries = raw[key];
      if (entries && entries.length > 0) {
        list.push(entries[entries.length - 1]);
      }
    }

    list.sort((a, b) => a.joinedAt - b.joinedAt || a.playerId.localeCompare(b.playerId));
    this.presenceList = list;

    const prevHostId = this.hostId;
    const host = list[0] ?? null;
    if (host) {
      this.hostId = host.playerId;
      this.hostName = host.name;
    } else if (!prevHostId || !this.remotePlayers.has(prevHostId)) {
      this.hostId = this.localPlayerId;
      this.hostName = this.localPlayerName;
    }

    if (host && host.playerId !== this.localPlayerId) {
      this.applyKaraokeTurn(host.karaokeTurn ?? null);
    }
    if (this.reconcileKaraokeTurn()) void this.trackLocalPresence();

    // If local player just became Host, restamp & publish stageState/voicePolicy in presence and immediately update DB
    if (prevHostId !== this.hostId && this.hostId === this.localPlayerId) {
      if (this.hostStageState) {
        const previousTime = this.lastStageUpdateBySender.get(this.localPlayerId) ?? 0;
        const nextUpdatedAt = Math.max(this.hostStageState.updatedAt, previousTime + 1);
        this.hostStageState = {
          ...this.hostStageState,
          senderId: this.localPlayerId,
          updatedAt: nextUpdatedAt,
        };
        this.lastStageUpdateBySender.set(this.localPlayerId, nextUpdatedAt);
      }
      if (this.hostStageState || this.voicePolicy.updatedAt > 0 || this.karaokeTurn) {
        void this.trackLocalPresence();
      }
      if (prevHostId && this.baseRoomId) {
        void AdminService.demoteRoomHost(this.baseRoomId, prevHostId);
      }
    }

    // If guest, sync stageState & voicePolicy from Host's presence when joining or when host changes
    if (host && host.playerId !== this.localPlayerId) {
      if (host.stageState) this.acceptStageState(host.stageState);
      if (host.voicePolicy && host.voicePolicy.updatedAt > this.voicePolicy.updatedAt) {
        this.voicePolicy = host.voicePolicy;
        window.dispatchEvent(
          new CustomEvent<RoomVoicePolicy>('cavannghe:voice-policy', { detail: host.voicePolicy })
        );
      }
    }

    const activeIds = new Set(list.map((p) => p.playerId));
    for (const id of activeIds) {
      const pendingTimer = this.pendingPresenceRemovals.get(id);
      if (pendingTimer !== undefined) {
        window.clearTimeout(pendingTimer);
        this.pendingPresenceRemovals.delete(id);
      }
    }
    for (const id of this.remotePlayers.keys()) {
      if (!activeIds.has(id)) {
        this.schedulePresenceRemoval(channel, id);
      }
    }

    // Sync active Karaoke singer state from presence for late joiners, or clear if singer truly left
    const activeSinger = list.find(
      (p) => p.playerId !== this.localPlayerId && p.playerId === this.karaokeTurn?.singerId &&
        p.karaokeState?.active && p.karaokeState.turnId === this.karaokeTurn.id
    );
    if (activeSinger?.karaokeState) {
      if (activeSinger.karaokeState.updatedAt > this.lastRemoteKaraokeTimestamp) {
        this.lastRemoteKaraokeTimestamp = activeSinger.karaokeState.updatedAt;
        this.remoteKaraokeState = activeSinger.karaokeState;
        this.onRemoteKaraokeCallback?.(activeSinger.karaokeState);
      }
    } else if (
      this.remoteKaraokeState &&
      !activeIds.has(this.remoteKaraokeState.singerId) &&
      !this.remotePlayers.has(this.remoteKaraokeState.singerId)
    ) {
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
        const chairSeq = p.playerStateSeq ?? 0;
        if (p.joinedAt === existing.joinedAt && chairSeq >= (existing.chairStateSeq ?? existing.seq)) {
          existing.chairId = p.chairId;
          existing.isHoldingMic = Boolean(p.isHoldingMic);
          existing.chairStateSeq = chairSeq;
        }
        existing.isAdmin = Boolean(p.isAdmin);
        if (p.avatarColor) existing.avatarColor = p.avatarColor;
        if (p.avatarModel) existing.avatarModel = p.avatarModel;
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
          isHoldingMic: Boolean(p.isHoldingMic),
          isAdmin: Boolean(p.isAdmin),
          avatarColor: p.avatarColor,
          avatarModel: p.avatarModel,
          joinedAt: p.joinedAt,
          seq: 0,
          chairStateSeq: p.playerStateSeq,
        });
      }
    }

    if (this.isHost()) {
      void this.syncRoomRegistry();
    }
    this.emitRoomStatus();
  }

  private startRoomHeartbeat(): void {
    this.stopRoomHeartbeat();
    if (!this.desiredRoomActive) return;
    const beat = () => {
      if (!this.desiredRoomActive) return;
      void this.syncSelfPlayerRow();
      if (this.isHost()) {
        void this.syncRoomRegistry();
      }
    };
    beat();
    this.roomHeartbeatTimer = window.setInterval(beat, 15_000);
  }

  private stopRoomHeartbeat(): void {
    if (this.roomHeartbeatTimer !== null) {
      window.clearInterval(this.roomHeartbeatTimer);
      this.roomHeartbeatTimer = null;
    }
  }

  private syncSelfPlayerRow(): Promise<void> {
    const sessionId = this.roomSessionId;
    const roomId = this.baseRoomId;
    if (!this.desiredRoomActive || !roomId) return Promise.resolve();
    const playerId = this.localPlayerId;
    const playerName = this.localPlayerName;
    const deviceId = this.localDeviceId;
    const sceneId = this.sceneScopeId || 'ca-van-nghe-lobby';
    const isHost = this.isHost();
    const isAdmin = this.localIsAdmin;

    return this.trackDbSync(
      (async () => {
        if (!this.desiredRoomActive || this.roomSessionId !== sessionId) return;
        await AdminService.upsertRoomPlayer({
          roomId,
          playerId,
          playerName,
          deviceId,
          sceneId,
          isHost,
          isAdmin,
        });
      })()
    );
  }

  private syncRoomRegistry(): Promise<void> {
    const sessionId = this.roomSessionId;
    const roomId = this.baseRoomId;
    if (!this.desiredRoomActive || !roomId) return Promise.resolve();
    const hostName = this.hostName || this.localPlayerName;
    const sceneId = this.sceneScopeId || 'ca-van-nghe-lobby';
    const password = this.roomPassword;

    return this.trackDbSync(
      (async () => {
        if (!this.desiredRoomActive || this.roomSessionId !== sessionId) return;
        await this.syncSelfPlayerRow();
        if (!this.desiredRoomActive || this.roomSessionId !== sessionId) return;
        const roomPlayers = await AdminService.fetchRoomPlayers(roomId);
        if (!this.desiredRoomActive || this.roomSessionId !== sessionId) return;
        this.lastKnownOtherDbPlayers = roomPlayers.filter(
          (p) => p.player_id !== this.localPlayerId
        ).length;
        const count = Math.max(
          1,
          roomPlayers.length,
          this.presenceList.length,
          this.remotePlayers.size + 1
        );
        await AdminService.upsertRoomHeartbeat({
          roomId,
          roomName: roomId,
          hostName,
          sceneId,
          playerCount: count,
          hasPassword: Boolean(password),
          password,
        });
      })()
    );
  }

  private handleRemotePlayerState(payload: RemotePlayerState): void {
    if (!payload || payload.id === this.localPlayerId) return;
    const existing = this.remotePlayers.get(payload.id);
    if (existing) {
      const sameSession = payload.joinedAt === undefined || payload.joinedAt === existing.joinedAt;
      if ((payload.joinedAt !== undefined && payload.joinedAt < existing.joinedAt) ||
          (sameSession && typeof payload.seq === 'number' && payload.seq <= existing.seq)) return;
    }
    this.touchRemoteBroadcast(payload.id);
    if (existing) {
      const sessionChanged = payload.joinedAt !== undefined && payload.joinedAt !== existing.joinedAt;
      existing.joinedAt = payload.joinedAt ?? existing.joinedAt;
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
      existing.isHoldingMic = Boolean(payload.isHoldingMic);
      const incomingSeq = payload.seq ?? existing.seq + 1;
      if (sessionChanged || incomingSeq >= (existing.chairStateSeq ?? existing.seq)) {
        existing.chairId = payload.chairId;
        existing.chairStateSeq = incomingSeq;
      }
      if (payload.avatarColor) existing.avatarColor = payload.avatarColor;
      if (payload.avatarModel) existing.avatarModel = payload.avatarModel;
      existing.seq = incomingSeq;
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

  getNetworkPing(): NetworkPingSnapshot {
    const status: NetworkPingSnapshot['status'] =
      this.pingMs === null
        ? 'offline'
        : this.pingMs < 80
          ? 'good'
          : this.pingMs <= 160
            ? 'fair'
            : 'poor';
    return {
      pingMs: this.pingMs,
      status,
      source: this.pingSource,
      updatedAt: this.pingUpdatedAt,
    };
  }

  private emitNetworkPing(): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent<NetworkPingSnapshot>('cavannghe:network-ping', {
        detail: this.getNetworkPing(),
      })
    );
  }

  private clearPingTimers(): void {
    if (this.initialPingTimer !== null) {
      window.clearTimeout(this.initialPingTimer);
      this.initialPingTimer = null;
    }
    if (this.fallbackPingTimer !== null) {
      window.clearTimeout(this.fallbackPingTimer);
      this.fallbackPingTimer = null;
    }
  }

  private resetPingState(): void {
    if (this.pingMs === null && this.pingSource === 'none') return;
    this.pingMs = null;
    this.pingSource = 'none';
    this.pingUpdatedAt = Date.now();
    this.emitNetworkPing();
  }

  private hookRealtimeHeartbeat(): void {
    if (this.realtimeHeartbeatHooked) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    this.realtimeHeartbeatHooked = true;
    supabase.realtime.onHeartbeat((status, latency) => {
      if (status === 'ok' && typeof latency === 'number' && Number.isFinite(latency)) {
        this.pingMs = Math.max(1, Math.round(latency));
        this.pingSource = 'realtime';
        this.pingUpdatedAt = Date.now();
        this.emitNetworkPing();
      } else if (
        (status === 'timeout' || status === 'error' || status === 'disconnected') &&
        !this.connected
      ) {
        this.resetPingState();
      }
    });
  }

  private async measureHttpPingOnce(): Promise<void> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const cfg = getSupabaseRestConfig();
    const start = performance.now();
    try {
      const res = cfg
        ? await fetch(`${cfg.url}/rest/v1/`, {
            method: 'HEAD',
            cache: 'no-store',
            headers: { apikey: cfg.anonKey },
          })
        : await fetch('/healthz', { method: 'GET', cache: 'no-store' });
      if (!res.ok && res.status >= 500) return;
      const rtt = Math.max(1, Math.round(performance.now() - start));
      this.pingMs = rtt;
      this.pingSource = 'http';
      this.pingUpdatedAt = Date.now();
      this.emitNetworkPing();
    } catch {
      // ignore transient probe errors
    }
  }

  private scheduleInitialPingProbe(): void {
    this.clearPingTimers();
    const supabase = getSupabaseClient();
    this.initialPingTimer = window.setTimeout(() => {
      this.initialPingTimer = null;
      if (!this.connected || !supabase) return;
      if (supabase.realtime.isConnected() && !supabase.realtime.pendingHeartbeatRef) {
        void supabase.realtime.sendHeartbeat();
      }
    }, 350);
    this.fallbackPingTimer = window.setTimeout(() => {
      this.fallbackPingTimer = null;
      if (this.connected && this.pingMs === null) {
        void this.measureHttpPingOnce();
      }
    }, 1800);
  }
}
