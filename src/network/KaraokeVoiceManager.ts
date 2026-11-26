import type * as pc from 'playcanvas';
import {
  MultiplayerManager,
  type RemotePlayerState,
  type RoomStatusSnapshot,
  type RtcSignalMessage,
} from './MultiplayerManager';
import { addRemoteIceCandidate, getVoiceRtcConfig, setVoiceRemoteDescription } from './voiceIce';
import { DebugLogger } from '../utils/debugLogger';

/**
 * Upgrades Opus SDP parameters to high-bitrate stereo Music Mode (128kbps)
 * so singing vocals + reverb/echo stay warm and clear instead of phone-call mono.
 */
function preferOpusMusicSdp(sdp?: string): string | undefined {
  if (!sdp) return sdp;
  const lines = sdp.split('\r\n');
  let opusPayload: string | null = null;
  for (const line of lines) {
    const m = line.match(/^a=rtpmap:(\d+)\s+opus\/48000/i);
    if (m) {
      opusPayload = m[1];
      break;
    }
  }
  if (!opusPayload) return sdp;

  const extraParams = 'stereo=1;sprop-stereo=1;maxaveragebitrate=128000;useinbandfec=1;usedtx=0';
  let patched = false;
  const out = lines.map((line) => {
    if (line.startsWith(`a=fmtp:${opusPayload} `)) {
      patched = true;
      const prefix = `a=fmtp:${opusPayload} `;
      const replaced = new Set(['stereo', 'sprop-stereo', 'maxaveragebitrate', 'useinbandfec', 'usedtx']);
      const retained = line.slice(prefix.length).split(';').map((param) => param.trim())
        .filter((param) => param && !replaced.has(param.split('=', 1)[0].toLowerCase()));
      return prefix + [...retained, extraParams].join(';');
    }
    return line;
  });

  if (!patched) {
    const idx = out.findIndex((l) => l.startsWith(`a=rtpmap:${opusPayload} `));
    if (idx >= 0) {
      out.splice(idx + 1, 0, `a=fmtp:${opusPayload} minptime=10;${extraParams}`);
    }
  }
  return out.join('\r\n');
}

interface SpatialVoiceSink {
  audioEl: HTMLAudioElement;
  source: MediaStreamAudioSourceNode | null;
  gain: GainNode | null;
  panner: PannerNode | null;
}

function toPerceptualVoiceGain(volRatio: number): number {
  const clamped = Math.max(0, Math.min(1.5, volRatio));
  if (clamped <= 0) return 0;
  return 0.45 * Math.pow(clamped, 2.0);
}

/**
 * Manages WebRTC P2P voice streaming over Supabase Realtime signaling (`rtc:signal`)
 * with 3D HRTF Spatial Audio (`PannerNode` + `AudioListener`) so audience members
 * hear the singer's voice from their exact 3D direction and distance.
 */
export class KaraokeVoiceManager {
  private static instance: KaraokeVoiceManager | null = null;

  static getInstance(): KaraokeVoiceManager {
    if (!KaraokeVoiceManager.instance) {
      KaraokeVoiceManager.instance = new KaraokeVoiceManager();
    }
    return KaraokeVoiceManager.instance;
  }

  private localStream: MediaStream | null = null;
  private isBroadcasting = false;
  private outgoingPeers = new Map<string, RTCPeerConnection>();

  private incomingPeers = new Map<string, RTCPeerConnection>();
  private negotiationIds = new WeakMap<RTCPeerConnection, string>();
  private earlyIce = new Map<string, { expiresAt: number; candidates: RTCIceCandidateInit[] }>();
  private incomingOffers = new WeakMap<RTCPeerConnection, string>();
  private voiceSinks = new Map<string, SpatialVoiceSink>();
  private spatialCtx: AudioContext | null = null;
  private listenerInitialized = false;
  private activeTurnId: string | undefined;
  private audienceMuted = false;
  private audienceVolume = toPerceptualVoiceGain(1.0);

  private constructor() {}

  initListener(): void {
    if (this.listenerInitialized) return;
    this.listenerInitialized = true;

    const mp = MultiplayerManager.getInstance();
    mp.setOnRtcSignal((msg) => {
      void this.handleSignal(msg);
    });

    window.addEventListener('cavannghe:room-status', this.onRoomStatus);
    window.addEventListener('cavannghe:room-left', this.onRoomLeft);
    window.addEventListener('cavannghe:channel-subscribed', this.onChannelSubscribed);
    window.addEventListener('pointerdown', this.onUserGesture, { passive: true });
    window.addEventListener('keydown', this.onUserGesture, { passive: true });

    this.activeTurnId = mp.getRoomStatus().karaokeTurn?.id;
    if (mp.isConnected()) {
      mp.sendRtcSignal({ targetId: '*', kind: 'ready' });
    }
  }

  destroyListener(): void {
    if (!this.listenerInitialized) return;
    this.listenerInitialized = false;
    this.earlyIce.clear();
    window.removeEventListener('cavannghe:room-status', this.onRoomStatus);
    window.removeEventListener('cavannghe:room-left', this.onRoomLeft);
    window.removeEventListener('cavannghe:channel-subscribed', this.onChannelSubscribed);
    window.removeEventListener('pointerdown', this.onUserGesture);
    window.removeEventListener('keydown', this.onUserGesture);
    MultiplayerManager.getInstance().setOnRtcSignal(null);
    this.stopBroadcasting();
    for (const id of [...this.incomingPeers.keys()]) {
      this.cleanupIncomingPeer(id);
    }
    if (this.spatialCtx) {
      void this.spatialCtx.close().catch(() => {});
      this.spatialCtx = null;
    }
  }

  startBroadcasting(stream: MediaStream): void {
    this.initListener();
    if (this.isBroadcasting && this.localStream === stream) return;
    this.stopBroadcasting();
    this.localStream = stream;
    this.isBroadcasting = true;

    const status = MultiplayerManager.getInstance().getRoomStatus();
    DebugLogger.log(
      'KaraokeVoice',
      `Started voice broadcast (connected=${status.connected}, peers=${status.players.filter((p) => !p.isLocal).length})`
    );
    if (!status.connected) return;
    for (const player of status.players) {
      if (!player.isLocal) {
        void this.createOfferForPeer(player.id);
      }
    }
  }

  stopBroadcasting(): void {
    if (this.isBroadcasting) {
      MultiplayerManager.getInstance().sendRtcSignal({ targetId: '*', kind: 'bye' });
    }
    this.isBroadcasting = false;
    this.localStream = null;
    for (const pc of this.outgoingPeers.values()) {
      pc.close();
    }
    this.outgoingPeers.clear();
  }

  setAudienceMuted(muted: boolean): void {
    this.audienceMuted = muted;
    this.syncAllSinkGains();
  }

  setAudienceVolume(vol: number): void {
    this.audienceVolume = toPerceptualVoiceGain(vol);
    this.syncAllSinkGains();
  }

  /**
   * Called each frame from EditorEngine during Play Mode to update 3D AudioListener
   * from the active camera and each remote singer's PannerNode position.
   */
  updateSpatialAudio(
    cam: pc.Entity | null,
    remotePlayers: Map<string, RemotePlayerState>,
    getRenderedPosition: (playerId: string) => pc.Vec3 | undefined
  ): void {
    if (this.voiceSinks.size === 0 || !this.spatialCtx || this.spatialCtx.state !== 'running') {
      return;
    }

    if (cam) {
      const pos = cam.getPosition();
      const fwd = cam.forward;
      const up = cam.up;
      const listener = this.spatialCtx.listener;
      if (listener.positionX) {
        listener.positionX.value = pos.x;
        listener.positionY.value = pos.y;
        listener.positionZ.value = pos.z;
        listener.forwardX.value = fwd.x;
        listener.forwardY.value = fwd.y;
        listener.forwardZ.value = fwd.z;
        listener.upX.value = up.x;
        listener.upY.value = up.y;
        listener.upZ.value = up.z;
      }
    }

    for (const [peerId, sink] of this.voiceSinks.entries()) {
      if (!sink.panner) continue;
      const rp = getRenderedPosition(peerId) ?? remotePlayers.get(peerId);
      const sx = rp ? rp.x : 0;
      const sy = rp ? rp.y + 1.65 : 1.8;
      const sz = rp ? rp.z : -8.5;
      if (sink.panner.positionX) {
        sink.panner.positionX.value = sx;
        sink.panner.positionY.value = sy;
        sink.panner.positionZ.value = sz;
      }
    }
  }

  private ensureSpatialContext(): AudioContext {
    if (!this.spatialCtx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.spatialCtx = new AC({ latencyHint: 'interactive' });
      this.spatialCtx.onstatechange = () => {
        this.syncAllSinkGains();
      };
    }
    if (this.spatialCtx.state === 'suspended') {
      void this.spatialCtx.resume().catch(() => {});
    }
    return this.spatialCtx;
  }

  private syncAllSinkGains(): void {
    const targetGain = this.audienceMuted ? 0 : this.audienceVolume;
    const ctxRunning = Boolean(this.spatialCtx && this.spatialCtx.state === 'running');
    for (const sink of this.voiceSinks.values()) {
      if (sink.gain && ctxRunning && this.spatialCtx) {
        sink.audioEl.muted = true;
        const now = this.spatialCtx.currentTime;
        sink.gain.gain.cancelScheduledValues(now);
        sink.gain.gain.setTargetAtTime(targetGain, now, 0.02);
      } else {
        if (sink.gain) sink.gain.gain.value = 0;
        sink.audioEl.muted = this.audienceMuted;
        sink.audioEl.volume = Math.min(1, Math.max(0, this.audienceVolume));
      }
    }
  }

  private onRoomLeft = (): void => {
    this.earlyIce.clear();
    this.stopBroadcasting();
    for (const id of [...this.incomingPeers.keys()]) {
      this.cleanupIncomingPeer(id);
    }
    for (const id of [...this.voiceSinks.keys()]) {
      this.cleanupIncomingPeer(id);
    }
  };

  private onRoomStatus = (e: Event): void => {
    const status = (e as CustomEvent<RoomStatusSnapshot>).detail;
    if (!status) return;

    const turnId = status.karaokeTurn?.id;
    if (turnId !== this.activeTurnId) {
      this.activeTurnId = turnId;
      this.earlyIce.clear();
      this.stopBroadcasting();
      for (const id of this.incomingPeers.keys()) this.cleanupIncomingPeer(id);
      if (status.connected && turnId && status.karaokeTurn?.singerId !== status.localPlayerId) {
        MultiplayerManager.getInstance().sendRtcSignal({ targetId: '*', kind: 'ready' });
      }
    }

    if (!status.connected) {
      DebugLogger.warn('KaraokeVoice', 'Channel disconnected transiently; pausing outgoing WebRTC peers until reconnect');
      // Close transient RTCPeerConnections but keep localStream/isBroadcasting intact so voice resumes on reconnect
      for (const pc of this.outgoingPeers.values()) {
        pc.close();
      }
      this.outgoingPeers.clear();
      return;
    }

    const activeIds = new Set(status.players.filter((p) => !p.isLocal).map((p) => p.id));
    for (const id of MultiplayerManager.getInstance().getRemotePlayers().keys()) {
      activeIds.add(id);
    }

    for (const [id, pc] of this.outgoingPeers.entries()) {
      if (!activeIds.has(id)) {
        pc.close();
        this.outgoingPeers.delete(id);
      }
    }
    for (const [id] of this.incomingPeers.entries()) {
      if (!activeIds.has(id)) {
        this.cleanupIncomingPeer(id);
      }
    }

    if (this.isBroadcasting && this.localStream && status.connected) {
      for (const id of activeIds) {
        if (!this.outgoingPeers.has(id)) {
          void this.createOfferForPeer(id);
        }
      }
    }
  };

  private onChannelSubscribed = (): void => {
    const mp = MultiplayerManager.getInstance();
    if (this.listenerInitialized && mp.isConnected()) {
      mp.sendRtcSignal({ targetId: '*', kind: 'ready' });
    }
  };

  private onUserGesture = (): void => {
    if (this.spatialCtx && this.spatialCtx.state === 'suspended') {
      void this.spatialCtx.resume().catch(() => {});
    }
    for (const sink of this.voiceSinks.values()) {
      if (sink.audioEl.paused && sink.audioEl.srcObject) {
        void sink.audioEl.play().catch(() => {});
      }
    }
  };

  private async createOfferForPeer(peerId: string, isRetry = false): Promise<void> {
    if (!this.isBroadcasting || !this.localStream) return;
    const mp = MultiplayerManager.getInstance();
    const status = mp.getRoomStatus();
    if (!status.connected || status.karaokeTurn?.singerId !== status.localPlayerId) return;
    const old = this.outgoingPeers.get(peerId);
    if (old) old.close();

    const pc = new RTCPeerConnection();
    this.outgoingPeers.set(peerId, pc);
    const negotiationId = crypto.randomUUID();
    this.negotiationIds.set(pc, negotiationId);

    for (const track of this.localStream.getAudioTracks()) {
      pc.addTrack(track, this.localStream);
    }

    pc.onicecandidate = (ev) => {
      if (ev.candidate && this.outgoingPeers.get(peerId) === pc) {
        MultiplayerManager.getInstance().sendRtcSignal({
          targetId: peerId,
          kind: 'ice',
          negotiationId,
          candidate: ev.candidate.toJSON(),
        });
      }
    };

    let canRetry = !isRetry;
    pc.onconnectionstatechange = () => {
      if (this.outgoingPeers.get(peerId) !== pc) return;
      if (pc.connectionState === 'connected') canRetry = true;
      if (pc.connectionState !== 'failed' || !canRetry) return;
      canRetry = false;
      window.setTimeout(() => {
        if (this.outgoingPeers.get(peerId) === pc && pc.connectionState === 'failed' &&
            MultiplayerManager.getInstance().isConnected()) {
          void this.createOfferForPeer(peerId, true);
        }
      }, 1500);
    };

    try {
      const config = await getVoiceRtcConfig();
      if (this.outgoingPeers.get(peerId) !== pc) return;
      pc.setConfiguration(config);
      const offer = await pc.createOffer();
      const tunedOffer: RTCSessionDescriptionInit = {
        type: offer.type,
        sdp: preferOpusMusicSdp(offer.sdp),
      };
      await pc.setLocalDescription(tunedOffer);
      if (this.outgoingPeers.get(peerId) !== pc) return;
      MultiplayerManager.getInstance().sendRtcSignal({
        targetId: peerId,
        kind: 'offer',
        negotiationId,
        sdp: pc.localDescription?.toJSON() ?? tunedOffer,
      });
    } catch (err) {
      if (this.outgoingPeers.get(peerId) !== pc) return;
      DebugLogger.error('KaraokeVoice', `Failed to create WebRTC offer for peer ${peerId}`, err);
      pc.close();
      this.outgoingPeers.delete(peerId);
    }
  }

  private iceKey(msg: RtcSignalMessage): string {
    return JSON.stringify([msg.turnId, msg.fromId, msg.negotiationId]);
  }

  private rememberEarlyIce(msg: RtcSignalMessage, candidate: RTCIceCandidateInit): void {
    const now = performance.now();
    for (const [key, entry] of this.earlyIce) {
      if (entry.expiresAt <= now) this.earlyIce.delete(key);
    }
    const key = this.iceKey(msg);
    const entry = this.earlyIce.get(key);
    if (entry) {
      if (entry.candidates.length < 64) entry.candidates.push(candidate);
    } else if (this.earlyIce.size < 64) {
      this.earlyIce.set(key, { expiresAt: now + 15000, candidates: [candidate] });
    }
  }

  private async handleSignal(msg: RtcSignalMessage): Promise<void> {
    const mp = MultiplayerManager.getInstance();

    if (msg.kind === 'ready') {
      const peer = this.outgoingPeers.get(msg.fromId);
      if (this.isBroadcasting && this.localStream && (!peer || peer.connectionState === 'failed')) {
        void this.createOfferForPeer(msg.fromId);
      } else if (peer?.signalingState === 'have-local-offer' && peer.localDescription) {
        mp.sendRtcSignal({
          targetId: msg.fromId, kind: 'offer', negotiationId: this.negotiationIds.get(peer),
          sdp: peer.localDescription.toJSON(),
        });
      }
      return;
    }

    if (msg.kind === 'bye') {
      this.earlyIce.clear();
      this.cleanupIncomingPeer(msg.fromId);
      return;
    }

    if (msg.kind === 'offer' && msg.sdp) {
      const existing = this.incomingPeers.get(msg.fromId);
      if (existing && (msg.negotiationId
        ? this.negotiationIds.get(existing) === msg.negotiationId
        : this.incomingOffers.get(existing) === msg.sdp.sdp)) {
        const answer = existing.localDescription;
        if (answer) mp.sendRtcSignal({
          targetId: msg.fromId, kind: 'answer', negotiationId: msg.negotiationId, sdp: answer.toJSON(),
        });
        return;
      }
      this.cleanupIncomingPeer(msg.fromId);
      const pc = new RTCPeerConnection();
      this.incomingPeers.set(msg.fromId, pc);
      if (msg.negotiationId) this.negotiationIds.set(pc, msg.negotiationId);
      const iceKey = this.iceKey(msg);
      const earlyIce = this.earlyIce.get(iceKey);
      this.earlyIce.delete(iceKey);
      if (earlyIce && earlyIce.expiresAt > performance.now()) {
        for (const candidate of earlyIce.candidates) await addRemoteIceCandidate(pc, candidate);
      }
      if (msg.sdp.sdp) this.incomingOffers.set(pc, msg.sdp.sdp);

      pc.onicecandidate = (ev) => {
        if (ev.candidate && this.incomingPeers.get(msg.fromId) === pc) {
          mp.sendRtcSignal({
            targetId: msg.fromId,
            kind: 'ice',
            negotiationId: msg.negotiationId,
            candidate: ev.candidate.toJSON(),
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (this.incomingPeers.get(msg.fromId) === pc && pc.connectionState === 'failed') {
          this.cleanupIncomingPeer(msg.fromId);
          if (mp.isConnected() && this.activeTurnId) {
            mp.sendRtcSignal({ targetId: msg.fromId, kind: 'ready' });
          }
        }
      };

      pc.ontrack = (ev) => {
        if (this.incomingPeers.get(msg.fromId) !== pc) return;
        const stream = ev.streams[0] ?? new MediaStream([ev.track]);
        this.attachSpatialSink(msg.fromId, stream);
      };

      try {
        const config = await getVoiceRtcConfig();
        if (this.incomingPeers.get(msg.fromId) !== pc) return;
        pc.setConfiguration(config);
        await setVoiceRemoteDescription(pc, msg.sdp);
        const answer = await pc.createAnswer();
        const tunedAnswer: RTCSessionDescriptionInit = {
          type: answer.type,
          sdp: preferOpusMusicSdp(answer.sdp),
        };
        await pc.setLocalDescription(tunedAnswer);
        if (this.incomingPeers.get(msg.fromId) !== pc) return;
        mp.sendRtcSignal({
          targetId: msg.fromId,
          kind: 'answer',
          negotiationId: msg.negotiationId,
          sdp: pc.localDescription?.toJSON() ?? tunedAnswer,
        });
      } catch (err) {
        if (this.incomingPeers.get(msg.fromId) !== pc) return;
        DebugLogger.error('KaraokeVoice', `Failed to handle WebRTC offer from peer ${msg.fromId}`, err);
        this.cleanupIncomingPeer(msg.fromId);
      }
      return;
    }

    if (msg.kind === 'answer' && msg.sdp) {
      const pc = this.outgoingPeers.get(msg.fromId);
      if (pc && pc.signalingState !== 'stable' &&
          (!msg.negotiationId || this.negotiationIds.get(pc) === msg.negotiationId)) {
        try {
          await setVoiceRemoteDescription(pc, msg.sdp);
        } catch {
          // ignore
        }
      }
      return;
    }

    if (msg.kind === 'ice' && msg.candidate) {
      const targetPc =
        this.incomingPeers.get(msg.fromId) ?? this.outgoingPeers.get(msg.fromId);
      if (targetPc && (!msg.negotiationId || this.negotiationIds.get(targetPc) === msg.negotiationId)) {
        await addRemoteIceCandidate(targetPc, msg.candidate);
      } else {
        this.rememberEarlyIce(msg, msg.candidate);
      }
    }
  }

  private attachSpatialSink(peerId: string, stream: MediaStream): void {
    this.cleanupSink(peerId);

    // Muted <audio> element keeps Chrome decoding the remote WebRTC MediaStream
    const audioEl = new Audio();
    audioEl.autoplay = true;
    (audioEl as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    audioEl.srcObject = stream;

    let source: MediaStreamAudioSourceNode | null = null;
    let gain: GainNode | null = null;
    let panner: PannerNode | null = null;

    try {
      const ctx = this.ensureSpatialContext();
      source = ctx.createMediaStreamSource(stream);
      gain = ctx.createGain();
      const ctxRunning = ctx.state === 'running';
      gain.gain.value = ctxRunning ? (this.audienceMuted ? 0 : this.audienceVolume) : 0;

      panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 6.0;
      panner.maxDistance = 38.0;
      panner.rolloffFactor = 0.55;

      const rp = MultiplayerManager.getInstance().getRemotePlayers().get(peerId);
      panner.positionX.value = rp ? rp.x : 0;
      panner.positionY.value = rp ? rp.y + 1.65 : 1.8;
      panner.positionZ.value = rp ? rp.z : -8.5;

      source.connect(gain);
      gain.connect(panner);
      panner.connect(ctx.destination);

      // Keep <audio> unmuted as fallback until Web Audio AudioContext is actively running
      if (ctxRunning) {
        audioEl.muted = true;
      } else {
        audioEl.muted = this.audienceMuted;
        audioEl.volume = Math.min(1, Math.max(0, this.audienceVolume));
      }
    } catch {
      audioEl.muted = this.audienceMuted;
      audioEl.volume = Math.min(1, Math.max(0, this.audienceVolume));
    }

    void audioEl.play().catch(() => {});
    this.voiceSinks.set(peerId, { audioEl, source, gain, panner });
  }

  private cleanupSink(peerId: string): void {
    const sink = this.voiceSinks.get(peerId);
    if (!sink) return;
    try {
      sink.source?.disconnect();
      sink.gain?.disconnect();
      sink.panner?.disconnect();
    } catch {
      // ignore
    }
    sink.audioEl.pause();
    sink.audioEl.srcObject = null;
    this.voiceSinks.delete(peerId);
  }

  private cleanupIncomingPeer(peerId: string): void {
    const pc = this.incomingPeers.get(peerId);
    if (pc) {
      pc.close();
      this.incomingPeers.delete(peerId);
    }
    this.cleanupSink(peerId);
  }
}
