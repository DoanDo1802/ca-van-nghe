import { addRemoteIceCandidate, getVoiceRtcConfig, setVoiceRemoteDescription } from './voiceIce';
import {
  MultiplayerManager,
  type RoomStatusSnapshot,
  type RoomVoicePolicy,
  type RtcSignalMessage,
} from './MultiplayerManager';

export type VoiceMicMode = 'ptt' | 'vad' | 'open';

export interface LobbyVoiceSnapshot {
  micReady: boolean;
  micError: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  isTransmitting: boolean;
  isForcedMutedByHost: boolean;
  pausedForKaraoke: boolean;
  micMode: VoiceMicMode;
  pttKey: string;
  pttHeld: boolean;
  vadThreshold: number;
  micLevel: number;
  incomingVolume: number;
  voicePolicy: RoomVoicePolicy;
  connectedPeerCount: number;
}

const STORAGE_MODE_KEY = 'cavannghe:voice-mic-mode';
const STORAGE_PTT_KEY = 'cavannghe:voice-ptt-key';
const STORAGE_VAD_KEY = 'cavannghe:voice-vad-threshold';
const STORAGE_VOL_KEY = 'cavannghe:voice-incoming-volume';

export function formatKeyCodeLabel(code: string): string {
  if (!code) return '?';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Space') return 'Space';
  if (code === 'AltLeft' || code === 'AltRight') return 'Alt';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'Backquote') return '`';
  if (code === 'CapsLock') return 'Caps';
  return code;
}

/**
 * Manages multi-party Lobby Voice Chat over WebRTC mesh (`voice:signal`),
 * supporting Open Mic, Push-to-Talk (PTT), and Voice Activity Detection (VAD),
 * plus Host-controlled room-wide mute policy (`free` vs `muted_all`).
 */
export class LobbyVoiceManager {
  private static instance: LobbyVoiceManager | null = null;

  static getInstance(): LobbyVoiceManager {
    if (!LobbyVoiceManager.instance) {
      LobbyVoiceManager.instance = new LobbyVoiceManager();
    }
    return LobbyVoiceManager.instance;
  }

  private initialized = false;
  private localStream: MediaStream | null = null;
  private micError: string | null = null;
  private isMuted = true;
  private isDeafened = false;
  private micMode: VoiceMicMode;
  private pttKey: string;
  private pttHeld = false;
  private pttReleaseTimer: number | null = null;
  private vadThreshold: number;
  private vadActiveUntil = 0;
  private incomingVolume: number;
  private pausedForKaraoke = false;
  private micLevel = 0;
  private lastTransmitting = false;

  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private vadBuf = new Uint8Array(256);
  private meterRaf: number | null = null;

  private peers = new Map<string, RTCPeerConnection>();
  private peerOps = new Map<string, Promise<void>>();
  private pendingRenegotiate = new Set<string>();
  private pendingMicPromise: Promise<boolean> | null = null;
  private remoteAudios = new Map<string, HTMLAudioElement>();
  private voicePolicy: RoomVoicePolicy = MultiplayerManager.getInstance().getVoicePolicy();

  private constructor() {
    const savedMode = localStorage.getItem(STORAGE_MODE_KEY);
    this.micMode =
      savedMode === 'ptt' || savedMode === 'vad' || savedMode === 'open' ? savedMode : 'ptt';
    this.pttKey = localStorage.getItem(STORAGE_PTT_KEY) || 'KeyB';
    const savedVad = Number(localStorage.getItem(STORAGE_VAD_KEY));
    this.vadThreshold =
      Number.isFinite(savedVad) && savedVad >= 0.005 && savedVad <= 0.25 ? savedVad : 0.03;
    const savedVol = Number(localStorage.getItem(STORAGE_VOL_KEY));
    this.incomingVolume =
      Number.isFinite(savedVol) && savedVol >= 0 && savedVol <= 1 ? savedVol : 0.85;
  }

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    const mp = MultiplayerManager.getInstance();
    this.voicePolicy = mp.getVoicePolicy();
    mp.setOnVoiceSignal((msg) => {
      void this.handleSignal(msg);
    });

    window.addEventListener('cavannghe:room-status', this.onRoomStatus);
    window.addEventListener('cavannghe:voice-policy', this.onVoicePolicy);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    window.addEventListener('pointerdown', this.onUserGesture, { passive: true });

    if (mp.isConnected()) {
      mp.sendVoiceSignal({ targetId: '*', kind: 'ready' });
    }
    this.emitState();
  }

  destroy(): void {
    if (!this.initialized) return;
    this.initialized = false;
    window.removeEventListener('cavannghe:room-status', this.onRoomStatus);
    window.removeEventListener('cavannghe:voice-policy', this.onVoicePolicy);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    window.removeEventListener('pointerdown', this.onUserGesture);

    MultiplayerManager.getInstance().setOnVoiceSignal(null);
    this.stopMeterLoop();
    if (this.pttReleaseTimer !== null) {
      clearTimeout(this.pttReleaseTimer);
      this.pttReleaseTimer = null;
    }

    for (const id of [...this.peers.keys()]) {
      this.cleanupPeer(id);
    }
    this.peerOps.clear();
    this.pendingRenegotiate.clear();
    this.pendingMicPromise = null;

    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    if (this.audioCtx) {
      void this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this.setTransmittingState(false);
  }

  async ensureMic(): Promise<boolean> {
    this.init();
    if (this.localStream) return true;
    if (this.pendingMicPromise) return this.pendingMicPromise;

    this.micError = null;
    let req!: Promise<boolean>;
    req = (async (): Promise<boolean> => {
      let stream: MediaStream | null = null;
      let createdCtx: AudioContext | null = null;
      let createdSource: MediaStreamAudioSourceNode | null = null;
      let createdAnalyser: AnalyserNode | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (!this.initialized) {
          stream.getTracks().forEach((t) => t.stop());
          return false;
        }
        for (const t of stream.getAudioTracks()) {
          t.enabled = false;
        }

        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        createdCtx = new AC({ latencyHint: 'interactive' });
        createdSource = createdCtx.createMediaStreamSource(stream);
        createdAnalyser = createdCtx.createAnalyser();
        createdAnalyser.fftSize = 256;
        createdAnalyser.smoothingTimeConstant = 0.6;
        createdSource.connect(createdAnalyser);

        this.localStream = stream;
        this.audioCtx = createdCtx;
        this.micSource = createdSource;
        this.analyser = createdAnalyser;

        this.startMeterLoop();
        this.attachLocalTracksToExistingPeers();
        this.syncMicTransmission();
        this.emitState();
        return true;
      } catch {
        createdSource?.disconnect();
        createdAnalyser?.disconnect();
        if (createdCtx) void createdCtx.close().catch(() => {});
        if (stream) stream.getTracks().forEach((t) => t.stop());
        this.localStream = null;
        this.micError = 'Chưa cấp quyền Micro trên trình duyệt';
        this.emitState();
        return false;
      } finally {
        if (this.pendingMicPromise === req) {
          this.pendingMicPromise = null;
        }
      }
    })();

    this.pendingMicPromise = req;
    return req;
  }

  async toggleMute(): Promise<void> {
    if (this.isMuted) {
      const ok = await this.ensureMic();
      if (!ok) return;
      this.isMuted = false;
    } else {
      this.isMuted = true;
    }
    this.syncMicTransmission();
    this.emitState();
  }

  async setMicMode(mode: VoiceMicMode): Promise<void> {
    this.micMode = mode;
    localStorage.setItem(STORAGE_MODE_KEY, mode);
    if (this.isMuted) {
      const ok = await this.ensureMic();
      if (ok) this.isMuted = false;
    }
    this.syncMicTransmission();
    this.emitState();
  }

  setPttKey(code: string): void {
    this.pttKey = code;
    localStorage.setItem(STORAGE_PTT_KEY, code);
    this.pttHeld = false;
    this.syncMicTransmission();
    this.emitState();
  }

  setVadThreshold(val: number): void {
    this.vadThreshold = Math.max(0.005, Math.min(0.25, val));
    localStorage.setItem(STORAGE_VAD_KEY, String(this.vadThreshold));
    this.emitState();
  }

  toggleDeafen(): void {
    this.isDeafened = !this.isDeafened;
    this.syncRemoteAudioVolumes();
    this.emitState();
  }

  setIncomingVolume(vol: number): void {
    this.incomingVolume = Math.max(0, Math.min(1, vol));
    localStorage.setItem(STORAGE_VOL_KEY, String(this.incomingVolume));
    this.syncRemoteAudioVolumes();
    this.emitState();
  }

  setPausedForKaraoke(paused: boolean): void {
    if (this.pausedForKaraoke === paused) return;
    this.pausedForKaraoke = paused;
    this.syncRemoteAudioVolumes();
    this.syncMicTransmission();
    this.emitState();
  }

  isForcedMutedByHost(): boolean {
    const mp = MultiplayerManager.getInstance();
    return this.voicePolicy.mode === 'muted_all' && !mp.isHost();
  }

  isCurrentlyTransmitting(): boolean {
    if (!this.localStream) return false;
    if (this.pausedForKaraoke) return false;
    if (this.isForcedMutedByHost()) return false;
    if (this.isMuted) return false;
    if (this.micMode === 'open') return true;
    if (this.micMode === 'ptt') return this.pttHeld;
    return performance.now() <= this.vadActiveUntil;
  }

  getSnapshot(): LobbyVoiceSnapshot {
    return {
      micReady: this.localStream !== null,
      micError: this.micError,
      isMuted: this.isMuted,
      isDeafened: this.isDeafened,
      isTransmitting: this.isCurrentlyTransmitting(),
      isForcedMutedByHost: this.isForcedMutedByHost(),
      pausedForKaraoke: this.pausedForKaraoke,
      micMode: this.micMode,
      pttKey: this.pttKey,
      pttHeld: this.pttHeld,
      vadThreshold: this.vadThreshold,
      micLevel: this.micLevel,
      incomingVolume: this.incomingVolume,
      voicePolicy: this.voicePolicy,
      connectedPeerCount: [...this.peers.values()].filter((pc) => pc.connectionState === 'connected').length,
    };
  }

  private syncMicTransmission(): void {
    const active = this.isCurrentlyTransmitting();
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = active;
      }
    }
    this.setTransmittingState(active);
  }

  private setTransmittingState(active: boolean): void {
    if (this.lastTransmitting === active) return;
    this.lastTransmitting = active;
    MultiplayerManager.getInstance().broadcastVoiceSpeaking(active);
  }

  private startMeterLoop(): void {
    if (this.meterRaf !== null) return;
    const tick = () => {
      if (!this.initialized) return;
      if (this.analyser && !this.isMuted && !this.pausedForKaraoke && !this.isForcedMutedByHost()) {
        this.analyser.getByteTimeDomainData(this.vadBuf);
        let sumSq = 0;
        for (let i = 0; i < this.vadBuf.length; i++) {
          const norm = (this.vadBuf[i] - 128) / 128;
          sumSq += norm * norm;
        }
        const rms = Math.sqrt(sumSq / this.vadBuf.length);
        this.micLevel = Math.min(1, rms * 5.5);

        if (this.micMode === 'vad') {
          const now = performance.now();
          if (rms >= this.vadThreshold) {
            this.vadActiveUntil = now + 450;
          }
          const shouldTransmit = now <= this.vadActiveUntil;
          if (shouldTransmit !== this.lastTransmitting) {
            this.syncMicTransmission();
            this.emitState();
          }
        }
      } else {
        this.micLevel = 0;
      }
      this.meterRaf = requestAnimationFrame(tick);
    };
    this.meterRaf = requestAnimationFrame(tick);
  }

  private stopMeterLoop(): void {
    if (this.meterRaf !== null) {
      cancelAnimationFrame(this.meterRaf);
      this.meterRaf = null;
    }
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const tag = (document.activeElement?.tagName ?? '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (this.micMode !== 'ptt' || e.code !== this.pttKey || e.repeat) return;

    if (this.pttReleaseTimer !== null) {
      clearTimeout(this.pttReleaseTimer);
      this.pttReleaseTimer = null;
    }
    if (this.isMuted && !this.localStream) {
      void this.ensureMic().then((ok) => {
        if (ok) {
          this.isMuted = false;
          this.pttHeld = true;
          this.syncMicTransmission();
          this.emitState();
        }
      });
      return;
    }
    if (this.isMuted && this.localStream) {
      this.isMuted = false;
    }
    this.pttHeld = true;
    this.syncMicTransmission();
    this.emitState();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (this.micMode !== 'ptt' || e.code !== this.pttKey) return;
    if (this.pttReleaseTimer !== null) clearTimeout(this.pttReleaseTimer);
    this.pttReleaseTimer = window.setTimeout(() => {
      this.pttHeld = false;
      this.syncMicTransmission();
      this.emitState();
    }, 150);
  };

  private onWindowBlur = (): void => {
    if (this.pttHeld) {
      this.pttHeld = false;
      this.syncMicTransmission();
      this.emitState();
    }
  };

  private onUserGesture = (): void => {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume().catch(() => {});
    }
    for (const audio of this.remoteAudios.values()) {
      if (audio.paused && audio.srcObject) {
        void audio.play().catch(() => {});
      }
    }
  };

  private onVoicePolicy = (e: Event): void => {
    const policy = (e as CustomEvent<RoomVoicePolicy>).detail;
    if (!policy) return;
    this.voicePolicy = policy;
    this.syncMicTransmission();
    this.emitState();
  };

  private onRoomStatus = (e: Event): void => {
    const status = (e as CustomEvent<RoomStatusSnapshot>).detail;
    if (!status) return;
    this.voicePolicy = MultiplayerManager.getInstance().getVoicePolicy();

    const activeIds = new Set(status.players.filter((p) => !p.isLocal).map((p) => p.id));
    for (const id of [...this.peers.keys()]) {
      if (!status.connected || !activeIds.has(id)) {
        this.cleanupPeer(id);
      }
    }

    if (status.connected) {
      for (const id of activeIds) {
        if (!this.peers.has(id) && status.localPlayerId < id) {
          void this.initiatePeer(id);
        }
      }
    }
    this.syncMicTransmission();
    this.emitState();
  };

  private attachLocalTracksToExistingPeers(): void {
    if (!this.localStream) return;
    for (const [peerId, pc] of this.peers.entries()) {
      const senders = pc.getSenders();
      let added = false;
      for (const track of this.localStream.getAudioTracks()) {
        if (!senders.some((s) => s.track?.id === track.id)) {
          pc.addTrack(track, this.localStream);
          added = true;
        }
      }
      if (added) {
        void this.renegotiatePeer(peerId, pc);
      }
    }
  }

  private enqueuePeerOp(peerId: string, op: () => Promise<void>): void {
    const prev = this.peerOps.get(peerId) ?? Promise.resolve();
    const next = prev.then(op, op).finally(() => {
      if (this.peerOps.get(peerId) === next) {
        this.peerOps.delete(peerId);
      }
    });
    this.peerOps.set(peerId, next);
  }

  private renegotiatePeer(peerId: string, pc: RTCPeerConnection, iceRestart = false): void {
    if (pc.signalingState !== 'stable') {
      this.pendingRenegotiate.add(peerId);
      return;
    }
    this.enqueuePeerOp(peerId, async () => {
      if (!this.initialized || this.peers.get(peerId) !== pc || pc.signalingState !== 'stable') return;
      try {
        if (iceRestart) {
          const config = await getVoiceRtcConfig();
          if (!this.initialized || this.peers.get(peerId) !== pc || pc.signalingState !== 'stable') return;
          pc.setConfiguration(config);
        }
        const offer = await pc.createOffer({ iceRestart });
        await pc.setLocalDescription(offer);
        if (this.peers.get(peerId) !== pc) return;
        MultiplayerManager.getInstance().sendVoiceSignal({
          targetId: peerId,
          kind: 'offer',
          sdp: pc.localDescription?.toJSON() ?? offer,
        });
      } catch {
        // ignore transient negotiation error
      }
    });
  }

  private createPeerConnection(peerId: string, config: RTCConfiguration): RTCPeerConnection {
    this.cleanupPeer(peerId);
    const pc = new RTCPeerConnection(config);
    this.peers.set(peerId, pc);

    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        pc.addTrack(track, this.localStream);
      }
    } else {
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    pc.onicecandidate = (ev) => {
      if (ev.candidate && this.peers.get(peerId) === pc) {
        MultiplayerManager.getInstance().sendVoiceSignal({
          targetId: peerId,
          kind: 'ice',
          candidate: ev.candidate.toJSON(),
        });
      }
    };

    pc.onsignalingstatechange = () => {
      if (
        this.peers.get(peerId) === pc &&
        pc.signalingState === 'stable' &&
        this.pendingRenegotiate.delete(peerId)
      ) {
        this.renegotiatePeer(peerId, pc, false);
      }
    };

    pc.ontrack = (ev) => {
      if (this.peers.get(peerId) !== pc) return;
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      this.attachRemoteAudio(peerId, stream);
    };

    let canRetry = true;
    pc.onconnectionstatechange = () => {
      if (this.peers.get(peerId) !== pc) return;
      if (pc.connectionState === 'connected') canRetry = true;
      this.emitState();
      if (pc.connectionState === 'closed') {
        this.cleanupPeer(peerId);
        this.emitState();
        return;
      }
      if (pc.connectionState !== 'failed') return;

      const mp = MultiplayerManager.getInstance();
      if (!canRetry) {
        this.cleanupPeer(peerId);
        this.emitState();
        return;
      }
      canRetry = false;

      if (mp.getLocalPlayerId() < peerId) {
        // The same peer that starts the call drives ICE restarts to avoid competing offers.
        window.setTimeout(() => {
          if (
            this.initialized &&
            this.peers.get(peerId) === pc &&
            pc.connectionState === 'failed' &&
            mp.isConnected()
          ) {
            this.renegotiatePeer(peerId, pc, true);
          }
        }, 1500);
      } else {
        window.setTimeout(() => {
          if (this.initialized && this.peers.get(peerId) === pc && pc.connectionState === 'failed') {
            this.cleanupPeer(peerId);
            this.emitState();
            if (mp.isConnected()) {
              mp.sendVoiceSignal({ targetId: peerId, kind: 'ready' });
            }
          }
        }, 4500);
      }
    };

    return pc;
  }

  private initiatePeer(peerId: string): void {
    this.enqueuePeerOp(peerId, async () => {
      const mp = MultiplayerManager.getInstance();
      if (!this.initialized || !mp.isConnected() || this.peers.has(peerId)) return;
      let pc: RTCPeerConnection | null = null;
      try {
        const config = await getVoiceRtcConfig();
        if (!this.initialized || !mp.isConnected() || this.peers.has(peerId)) return;
        pc = this.createPeerConnection(peerId, config);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (this.peers.get(peerId) !== pc) return;
        mp.sendVoiceSignal({
          targetId: peerId,
          kind: 'offer',
          sdp: pc.localDescription?.toJSON() ?? offer,
        });
      } catch {
        if (pc && this.peers.get(peerId) === pc) {
          this.cleanupPeer(peerId);
          this.emitState();
        }
      }
    });
  }

  private async handleSignal(msg: RtcSignalMessage): Promise<void> {
    const mp = MultiplayerManager.getInstance();
    const localId = mp.getLocalPlayerId();

    if (msg.kind === 'ready') {
      if (!this.peers.has(msg.fromId) && localId < msg.fromId) {
        this.initiatePeer(msg.fromId);
      }
      return;
    }

    if (msg.kind === 'bye') {
      this.cleanupPeer(msg.fromId);
      this.emitState();
      return;
    }

    if (msg.kind === 'offer' && msg.sdp) {
      const offerSdp = msg.sdp;
      this.enqueuePeerOp(msg.fromId, async () => {
        if (!this.initialized || !mp.isConnected()) return;
        const existing = this.peers.get(msg.fromId);
        let pc = existing;
        try {
          if (!existing || existing.connectionState === 'failed' || existing.connectionState === 'disconnected') {
            const config = await getVoiceRtcConfig();
            if (!this.initialized || !mp.isConnected()) return;
            if (!existing) {
              if (this.peers.has(msg.fromId)) return;
              pc = this.createPeerConnection(msg.fromId, config);
            } else {
              if (this.peers.get(msg.fromId) !== existing) return;
              existing.setConfiguration(config);
              pc = existing;
            }
          }
          if (!pc || this.peers.get(msg.fromId) !== pc) return;
          await setVoiceRemoteDescription(pc, offerSdp);
          if (this.localStream) {
            const senders = pc.getSenders();
            for (const track of this.localStream.getAudioTracks()) {
              if (!senders.some((s) => s.track?.id === track.id)) {
                pc.addTrack(track, this.localStream);
              }
            }
          }
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (this.peers.get(msg.fromId) !== pc) return;
          mp.sendVoiceSignal({
            targetId: msg.fromId,
            kind: 'answer',
            sdp: pc.localDescription?.toJSON() ?? answer,
          });
        } catch {
          if (pc && this.peers.get(msg.fromId) === pc) {
            this.cleanupPeer(msg.fromId);
            this.emitState();
          }
        }
      });
      return;
    }

    if (msg.kind === 'answer' && msg.sdp) {
      const answerSdp = msg.sdp;
      this.enqueuePeerOp(msg.fromId, async () => {
        const pc = this.peers.get(msg.fromId);
        if (pc && pc.signalingState !== 'stable') {
          try {
            await setVoiceRemoteDescription(pc, answerSdp);
          } catch {
            // ignore
          }
        }
      });
      return;
    }

    if (msg.kind === 'ice' && msg.candidate) {
      const pc = this.peers.get(msg.fromId);
      if (pc) {
        await addRemoteIceCandidate(pc, msg.candidate);
      }
    }
  }

  private attachRemoteAudio(peerId: string, stream: MediaStream): void {
    const old = this.remoteAudios.get(peerId);
    if (old) {
      old.pause();
      old.srcObject = null;
    }
    const audio = new Audio();
    audio.autoplay = true;
    (audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    audio.srcObject = stream;
    audio.muted = this.isDeafened || this.pausedForKaraoke;
    audio.volume = this.incomingVolume;
    void audio.play().catch(() => {});
    this.remoteAudios.set(peerId, audio);
  }

  private syncRemoteAudioVolumes(): void {
    for (const audio of this.remoteAudios.values()) {
      audio.muted = this.isDeafened || this.pausedForKaraoke;
      audio.volume = this.incomingVolume;
    }
  }

  private cleanupPeer(peerId: string): void {
    this.pendingRenegotiate.delete(peerId);
    const pc = this.peers.get(peerId);
    if (pc) {
      pc.close();
      this.peers.delete(peerId);
    }
    const audio = this.remoteAudios.get(peerId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      this.remoteAudios.delete(peerId);
    }
  }

  private emitState(): void {
    window.dispatchEvent(
      new CustomEvent<LobbyVoiceSnapshot>('cavannghe:lobby-voice-state', {
        detail: this.getSnapshot(),
      })
    );
  }
}
