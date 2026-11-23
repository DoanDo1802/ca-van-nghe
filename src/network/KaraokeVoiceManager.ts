import type * as pc from 'playcanvas';
import {
  MultiplayerManager,
  type RemotePlayerState,
  type RoomStatusSnapshot,
  type RtcSignalMessage,
} from './MultiplayerManager';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

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
      const base = line
        .replace(/;?stereo=\d/g, '')
        .replace(/;?sprop-stereo=\d/g, '')
        .replace(/;?maxaveragebitrate=\d+/g, '')
        .replace(/;?usedtx=\d/g, '');
      return `${base};${extraParams}`;
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
  private voiceSinks = new Map<string, SpatialVoiceSink>();
  private spatialCtx: AudioContext | null = null;
  private listenerInitialized = false;
  private audienceMuted = false;
  private audienceVolume = 0.9;

  private constructor() {}

  initListener(): void {
    if (this.listenerInitialized) return;
    this.listenerInitialized = true;

    const mp = MultiplayerManager.getInstance();
    mp.setOnRtcSignal((msg) => {
      void this.handleSignal(msg);
    });

    window.addEventListener('cavannghe:room-status', this.onRoomStatus);
    window.addEventListener('pointerdown', this.onUserGesture, { passive: true });
    window.addEventListener('keydown', this.onUserGesture, { passive: true });

    if (mp.isConnected()) {
      mp.sendRtcSignal({ targetId: '*', kind: 'ready' });
    }
  }

  destroyListener(): void {
    if (!this.listenerInitialized) return;
    this.listenerInitialized = false;
    window.removeEventListener('cavannghe:room-status', this.onRoomStatus);
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
    this.stopBroadcasting();
    this.localStream = stream;
    this.isBroadcasting = true;

    const status = MultiplayerManager.getInstance().getRoomStatus();
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
    this.audienceVolume = Math.max(0, Math.min(1, vol));
    this.syncAllSinkGains();
  }

  /**
   * Called each frame from EditorEngine during Play Mode to update 3D AudioListener
   * from the active camera and each remote singer's PannerNode position.
   */
  updateSpatialAudio(
    cam: pc.Entity | null,
    remotePlayers: Map<string, RemotePlayerState>
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
      const rp = remotePlayers.get(peerId);
      const sx = rp ? rp.x : 16.8;
      const sy = rp ? rp.y + 1.65 : 1.8;
      const sz = rp ? rp.z : 2.8;
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
    }
    if (this.spatialCtx.state === 'suspended') {
      void this.spatialCtx.resume().catch(() => {});
    }
    return this.spatialCtx;
  }

  private syncAllSinkGains(): void {
    const targetGain = this.audienceMuted ? 0 : this.audienceVolume;
    for (const sink of this.voiceSinks.values()) {
      if (sink.gain && this.spatialCtx) {
        sink.gain.gain.setTargetAtTime(targetGain, this.spatialCtx.currentTime, 0.03);
      } else {
        sink.audioEl.muted = this.audienceMuted;
        sink.audioEl.volume = this.audienceVolume;
      }
    }
  }

  private onRoomStatus = (e: Event): void => {
    const status = (e as CustomEvent<RoomStatusSnapshot>).detail;
    if (!status) return;

    if (!status.connected) {
      if (this.isBroadcasting) {
        this.stopBroadcasting();
      }
      for (const id of [...this.incomingPeers.keys()]) {
        this.cleanupIncomingPeer(id);
      }
      for (const id of [...this.voiceSinks.keys()]) {
        this.cleanupIncomingPeer(id);
      }
      return;
    }

    const activeIds = new Set(status.players.filter((p) => !p.isLocal).map((p) => p.id));

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

  private async createOfferForPeer(peerId: string): Promise<void> {
    if (!this.isBroadcasting || !this.localStream) return;
    const old = this.outgoingPeers.get(peerId);
    if (old) old.close();

    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.outgoingPeers.set(peerId, pc);

    for (const track of this.localStream.getAudioTracks()) {
      pc.addTrack(track, this.localStream);
    }

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        MultiplayerManager.getInstance().sendRtcSignal({
          targetId: peerId,
          kind: 'ice',
          candidate: ev.candidate.toJSON(),
        });
      }
    };

    try {
      const offer = await pc.createOffer();
      const tunedOffer: RTCSessionDescriptionInit = {
        type: offer.type,
        sdp: preferOpusMusicSdp(offer.sdp),
      };
      await pc.setLocalDescription(tunedOffer);
      MultiplayerManager.getInstance().sendRtcSignal({
        targetId: peerId,
        kind: 'offer',
        sdp: pc.localDescription?.toJSON() ?? tunedOffer,
      });
    } catch {
      pc.close();
      this.outgoingPeers.delete(peerId);
    }
  }

  private async handleSignal(msg: RtcSignalMessage): Promise<void> {
    const mp = MultiplayerManager.getInstance();

    if (msg.kind === 'ready') {
      if (this.isBroadcasting && this.localStream) {
        void this.createOfferForPeer(msg.fromId);
      }
      return;
    }

    if (msg.kind === 'bye') {
      this.cleanupIncomingPeer(msg.fromId);
      return;
    }

    if (msg.kind === 'offer' && msg.sdp) {
      this.cleanupIncomingPeer(msg.fromId);
      const pc = new RTCPeerConnection(RTC_CONFIG);
      this.incomingPeers.set(msg.fromId, pc);

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          mp.sendRtcSignal({
            targetId: msg.fromId,
            kind: 'ice',
            candidate: ev.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (ev) => {
        const stream = ev.streams[0] ?? new MediaStream([ev.track]);
        this.attachSpatialSink(msg.fromId, stream);
      };

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const answer = await pc.createAnswer();
        const tunedAnswer: RTCSessionDescriptionInit = {
          type: answer.type,
          sdp: preferOpusMusicSdp(answer.sdp),
        };
        await pc.setLocalDescription(tunedAnswer);
        mp.sendRtcSignal({
          targetId: msg.fromId,
          kind: 'answer',
          sdp: pc.localDescription?.toJSON() ?? tunedAnswer,
        });
      } catch {
        this.cleanupIncomingPeer(msg.fromId);
      }
      return;
    }

    if (msg.kind === 'answer' && msg.sdp) {
      const pc = this.outgoingPeers.get(msg.fromId);
      if (pc && pc.signalingState !== 'stable') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        } catch {
          // ignore
        }
      }
      return;
    }

    if (msg.kind === 'ice' && msg.candidate) {
      const targetPc =
        this.incomingPeers.get(msg.fromId) ?? this.outgoingPeers.get(msg.fromId);
      if (targetPc) {
        try {
          await targetPc.addIceCandidate(new RTCIceCandidate(msg.candidate));
        } catch {
          // ignore
        }
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
      gain.gain.value = this.audienceMuted ? 0 : this.audienceVolume;

      panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 3.5;
      panner.maxDistance = 32.0;
      panner.rolloffFactor = 1.25;

      const rp = MultiplayerManager.getInstance().getRemotePlayers().get(peerId);
      panner.positionX.value = rp ? rp.x : 16.8;
      panner.positionY.value = rp ? rp.y + 1.65 : 1.8;
      panner.positionZ.value = rp ? rp.z : 2.8;

      source.connect(gain);
      gain.connect(panner);
      panner.connect(ctx.destination);

      // Mute raw <audio> output because audio plays through Web Audio HRTF PannerNode
      audioEl.muted = true;
    } catch {
      audioEl.muted = this.audienceMuted;
      audioEl.volume = this.audienceVolume;
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
