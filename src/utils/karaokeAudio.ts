import {
  DEFAULT_AUTOTUNE_CONFIG,
  KeyToneMatcher,
  createRapAutoTuneNode,
  midiToNoteName,
  postAutoTuneConfig,
  type AutoTuneConfig,
  type AutoTuneTelemetry,
} from './rapAutoTune';

export interface KaraokeSong {
  id: string;
  title: string;
  artist: string;
  channel: string;
  views: string;
  durationLabel: string;
  category: 'Acoustic' | 'Trữ tình' | 'Sôi động' | 'YouTube';
  thumbnail: string;
  youtubeId: string;
}

export const KARAOKE_SONGS: KaraokeSong[] = [
  {
    id: 'N4KHx9VvAd4',
    youtubeId: 'N4KHx9VvAd4',
    title: 'KARAOKE ♫ MỘNG HOA SIM - THIÊN TÚ (BEAT CHUẨN)',
    artist: 'Thiên Tú',
    channel: 'OTM MUSIC ♪',
    views: '25 Tr lượt xem',
    durationLabel: '5:48',
    category: 'Trữ tình',
    thumbnail: 'https://i.ytimg.com/vi/N4KHx9VvAd4/hqdefault.jpg',
  },
  {
    id: '2GFHxOPZMYA',
    youtubeId: '2GFHxOPZMYA',
    title: 'Karaoke Tìm Lại Bầu Trời Tone Nam | Karaoke Beat',
    artist: 'Tuấn Hưng',
    channel: 'Karaoke 84',
    views: '14 Tr lượt xem',
    durationLabel: '5:58',
    category: 'Acoustic',
    thumbnail: 'https://i.ytimg.com/vi/2GFHxOPZMYA/hqdefault.jpg',
  },
  {
    id: 'Y2-EF_4zk4Q',
    youtubeId: 'Y2-EF_4zk4Q',
    title: 'Ngôi Sao Lẻ Loi Karaoke Tone Nam (Cm) - Beat Mới',
    artist: 'Lâm Beat',
    channel: 'Lâm Beat',
    views: '9,9 Tr lượt xem',
    durationLabel: '5:50',
    category: 'Sôi động',
    thumbnail: 'https://i.ytimg.com/vi/Y2-EF_4zk4Q/hqdefault.jpg',
  },
  {
    id: 'rPmI-LVo9BY',
    youtubeId: 'rPmI-LVo9BY',
    title: 'Tình Anh | Karaoke Tone Nam Beat Gốc Đình Dũng',
    artist: 'Đình Dũng',
    channel: 'QUÂN BEAT',
    views: '4,7 Tr lượt xem',
    durationLabel: '5:00',
    category: 'Acoustic',
    thumbnail: 'https://i.ytimg.com/vi/rPmI-LVo9BY/hqdefault.jpg',
  },
  {
    id: 'C6_23xMdPYo',
    youtubeId: 'C6_23xMdPYo',
    title: 'KARAOKE KHÔNG MÔN ĐĂNG HỘ ĐỐI - NGUYỄN VĨ',
    artist: 'Nguyễn Vĩ',
    channel: 'Hoàng Dũng Karaoke',
    views: '3,1 Tr lượt xem',
    durationLabel: '5:42',
    category: 'Trữ tình',
    thumbnail: 'https://i.ytimg.com/vi/C6_23xMdPYo/hqdefault.jpg',
  },
  {
    id: '8MrDefn5oMU',
    youtubeId: '8MrDefn5oMU',
    title: 'Karaoke Đến Khi Nào (Khắc Việt) - Tone Nữ Beat Hay Dễ Hát',
    artist: 'Khắc Việt',
    channel: 'Karaoke Hoàng Luân',
    views: '1,7 Tr lượt xem',
    durationLabel: '3:36',
    category: 'Sôi động',
    thumbnail: 'https://i.ytimg.com/vi/8MrDefn5oMU/hqdefault.jpg',
  },
];

class KaraokeAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private broadcastTabGain: GainNode | null = null;
  private broadcastTabSource: MediaStreamAudioSourceNode | null = null;
  private backingMusicVolume = 0.6;
  private musicAnalyser: AnalyserNode | null = null;
  private keyAnalyser: AnalyserNode | null = null;
  private keyFreqBuf: Uint8Array<ArrayBuffer> | null = null;
  private keyMatcher = new KeyToneMatcher();
  private keyPollTimer: number | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micGain: GainNode | null = null;
  private micWarmthEq: BiquadFilterNode | null = null;
  private micPresenceEq: BiquadFilterNode | null = null;
  private micWetGain: GainNode | null = null;
  private micDelayGain: GainNode | null = null;
  private micNodes: AudioNode[] = [];
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private autoTuneNode: AudioWorkletNode | null = null;
  private autoTuneConfig: AutoTuneConfig = { ...DEFAULT_AUTOTUNE_CONFIG };
  private autoTuneTelemetryListeners = new Set<(t: AutoTuneTelemetry) => void>();
  private autoTuneConfigListeners = new Set<(cfg: AutoTuneConfig) => void>();
  private micBroadcastDest: MediaStreamAudioDestinationNode | null = null;
  private broadcastLimiter: DynamicsCompressorNode | null = null;
  private micRecordBus: GainNode | null = null;
  private recordMicGain: GainNode | null = null;
  private localMonitorGain: GainNode | null = null;
  private localMonitorEnabled = false;
  private micRequestId = 0;

  private audioEl: HTMLAudioElement | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;
  private customObjectUrl: string | null = null;

  private isPlaying = false;

  private dataBuf = new Uint8Array(64);
  private micTimeBuf = new Uint8Array(256);

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1.0;

      // Protective master limiter so boosted vocals never clip
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -2;
      limiter.knee.value = 0;
      limiter.ratio.value = 14;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.08;
      this.masterGain.connect(limiter);
      limiter.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.backingMusicVolume;
      this.musicAnalyser = this.ctx.createAnalyser();
      this.musicAnalyser.fftSize = 128;
      this.musicGain.connect(this.musicAnalyser);
      this.musicAnalyser.connect(this.masterGain);

      this.keyAnalyser = this.ctx.createAnalyser();
      this.keyAnalyser.fftSize = 4096;
      this.keyAnalyser.smoothingTimeConstant = 0.65;
      this.keyFreqBuf = new Uint8Array(this.keyAnalyser.frequencyBinCount);
      this.musicGain.connect(this.keyAnalyser);

      this.micBroadcastDest = this.ctx.createMediaStreamDestination();
      const broadcastLimiter = this.ctx.createDynamicsCompressor();
      broadcastLimiter.threshold.value = -2;
      broadcastLimiter.knee.value = 0;
      broadcastLimiter.ratio.value = 12;
      broadcastLimiter.attack.value = 0.002;
      broadcastLimiter.release.value = 0.08;
      broadcastLimiter.connect(this.micBroadcastDest);
      this.broadcastLimiter = broadcastLimiter;

      this.broadcastTabGain = this.ctx.createGain();
      this.broadcastTabGain.gain.value = this.backingMusicVolume;
      this.musicGain.connect(broadcastLimiter);
      this.broadcastTabGain.connect(broadcastLimiter);

      this.micRecordBus = this.ctx.createGain();
      this.micRecordBus.gain.value = 1.0;
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private createReverbImpulse(ctx: AudioContext, duration = 1.6, decay = 2.4): AudioBuffer {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * duration);
    const impulse = ctx.createBuffer(2, length, rate);
    // Warm low-pass smoothing so reverb tail sounds like a real hall, not harsh hiss
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        lp = lp * 0.68 + white * 0.32;
        data[i] = lp * Math.pow(1 - i / length, decay);
      }
    }
    return impulse;
  }

  async listInputDevices(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === 'audioinput');
    } catch {
      return [];
    }
  }

  async enableMic(options: {
    deviceId?: string;
    echoCancellation?: boolean;
    echoAmount?: number;
    micSensitivity?: number;
    bassDb?: number;
    trebleDb?: number;
  } = {}): Promise<boolean> {
    const {
      deviceId,
      echoCancellation = true,
      echoAmount = 0.55,
      micSensitivity = 3.4,
      bassDb = 3.5,
      trebleDb = 4.5,
    } = options;
    const requestId = ++this.micRequestId;
    let stream: MediaStream | undefined;
    try {
      const ctx = this.ensureContext();
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation,
        noiseSuppression: false,
        autoGainControl: false,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      };
      stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      const autoTuneNode = await createRapAutoTuneNode(ctx, this.autoTuneConfig);
      if (requestId !== this.micRequestId) {
        autoTuneNode?.disconnect();
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      const source = ctx.createMediaStreamSource(stream);
      this.clearMic();
      this.micStream = stream;
      this.micSource = source;

      // 1. Fixed gentle Preamp Gain before EQ & Compressor
      const preamp = ctx.createGain();
      preamp.gain.value = 2.6;

      // 2. Vocal Sculpting EQ: High-pass (85Hz) + Warmth (220Hz) + Presence Clarity (3.2kHz)
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 85;

      const warmth = ctx.createBiquadFilter();
      warmth.type = 'peaking';
      warmth.frequency.value = 220;
      warmth.Q.value = 1.0;
      warmth.gain.value = bassDb;
      this.micWarmthEq = warmth;

      const presence = ctx.createBiquadFilter();
      presence.type = 'peaking';
      presence.frequency.value = 3200;
      presence.Q.value = 1.1;
      presence.gain.value = trebleDb;
      this.micPresenceEq = presence;

      // 3. Gentle Vocal Compressor (keeps dynamics natural instead of brickwall clipping)
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 16;
      comp.ratio.value = 3.0;
      comp.attack.value = 0.005;
      comp.release.value = 0.18;

      this.micAnalyser = ctx.createAnalyser();
      this.micAnalyser.fftSize = 256;
      this.micAnalyser.smoothingTimeConstant = 0.75;

      // 4. Post-Compressor Output Level (controlled by singer's Mic % slider) + Studio Reverb/Echo
      const makeup = ctx.createGain();
      makeup.gain.value = 1.15;
      comp.connect(makeup);

      this.micGain = ctx.createGain();
      this.micGain.gain.value = Math.max(0, Math.min(2.5, micSensitivity));
      makeup.connect(this.micGain);

      const dry = ctx.createGain();
      dry.gain.value = 0.95;

      const convolver = ctx.createConvolver();
      convolver.buffer = this.createReverbImpulse(ctx, 1.65, 2.5);
      const wet = ctx.createGain();
      wet.gain.value = echoAmount * 0.85;
      this.micWetGain = wet;

      const delay = ctx.createDelay(0.5);
      delay.delayTime.value = 0.18;
      const delayFilter = ctx.createBiquadFilter();
      delayFilter.type = 'lowpass';
      delayFilter.frequency.value = 2800;
      const delayFeedback = ctx.createGain();
      delayFeedback.gain.value = 0.28;
      const delayOut = ctx.createGain();
      delayOut.gain.value = echoAmount * 0.45;
      this.micDelayGain = delayOut;

      this.micSource.connect(hp);
      if (autoTuneNode) {
        autoTuneNode.port.onmessage = (ev: MessageEvent) => {
          const data = ev.data as {
            type?: string;
            voiced?: boolean;
            detectedFreq?: number;
            targetFreq?: number;
            detectedMidi?: number;
            targetMidi?: number;
          } | null;
          if (!data || data.type !== 'telemetry') return;
          const voiced = Boolean(data.voiced);
          const detectedFreq = voiced ? Number(data.detectedFreq) || 0 : 0;
          if (voiced && detectedFreq > 0 && this.autoTuneConfig.enabled && this.autoTuneConfig.autoMatchTone) {
            this.keyMatcher.feedFreq(detectedFreq, 1.0);
            this.applyAutoMatchedTone();
          }
          const telemetry: AutoTuneTelemetry = {
            voiced,
            detectedFreq,
            targetFreq: voiced ? Number(data.targetFreq) || 0 : 0,
            detectedNote: voiced ? midiToNoteName(Number(data.detectedMidi) || 0) : '--',
            targetNote: voiced ? midiToNoteName(Number(data.targetMidi) || 0) : '--',
          };
          for (const cb of this.autoTuneTelemetryListeners) {
            cb(telemetry);
          }
        };
        this.autoTuneNode = autoTuneNode;
        hp.connect(autoTuneNode);
        autoTuneNode.connect(warmth);
      } else {
        hp.connect(warmth);
      }
      warmth.connect(presence);
      presence.connect(preamp);
      preamp.connect(comp);
      this.micGain.connect(this.micAnalyser);

      const monitorGain = ctx.createGain();
      monitorGain.gain.value = this.isMonitorAudible() ? 1.0 : 0.0;
      monitorGain.connect(this.masterGain!);
      this.localMonitorGain = monitorGain;

      this.micGain.connect(dry);
      dry.connect(monitorGain);

      this.micGain.connect(convolver);
      convolver.connect(wet);
      wet.connect(monitorGain);

      this.micGain.connect(delay);
      delay.connect(delayFilter);
      delayFilter.connect(delayFeedback);
      delayFeedback.connect(delay);
      delayFilter.connect(delayOut);
      delayOut.connect(monitorGain);

      const broadcastDest =
        this.micBroadcastDest ?? ctx.createMediaStreamDestination();
      let broadcastInput: AudioNode = this.broadcastLimiter ?? broadcastDest;
      if (!this.broadcastLimiter) {
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -2;
        limiter.knee.value = 0;
        limiter.ratio.value = 12;
        limiter.attack.value = 0.002;
        limiter.release.value = 0.08;
        limiter.connect(broadcastDest);
        this.broadcastLimiter = limiter;
        broadcastInput = limiter;
      }
      if (!this.micBroadcastDest) this.musicGain?.connect(broadcastInput);
      this.micBroadcastDest = broadcastDest;
      dry.connect(broadcastInput);
      wet.connect(broadcastInput);
      delayOut.connect(broadcastInput);

      if (this.micRecordBus) {
        dry.connect(this.micRecordBus);
        wet.connect(this.micRecordBus);
        delayOut.connect(this.micRecordBus);
      }

      this.micNodes = [
        preamp,
        hp,
        ...(autoTuneNode ? [autoTuneNode] : []),
        warmth,
        presence,
        comp,
        makeup,
        dry,
        convolver,
        wet,
        delay,
        delayFilter,
        delayFeedback,
        delayOut,
        monitorGain,
      ];
      return true;
    } catch {
      if (stream && this.micStream === stream) this.clearMic();
      else stream?.getTracks().forEach((track) => track.stop());
      return false;
    }
  }

  hasLiveMic(): boolean {
    return this.micStream?.getAudioTracks().some((track) => track.readyState === 'live') ?? false;
  }

  disableMic(): void {
    this.micRequestId++;
    this.clearMic();
  }

  private clearMic(): void {
    if (this.autoTuneNode) {
      this.autoTuneNode.port.onmessage = null;
      this.autoTuneNode = null;
    }
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    if (this.micGain) {
      this.micGain.disconnect();
      this.micGain = null;
    }
    if (this.micAnalyser) {
      this.micAnalyser.disconnect();
      this.micAnalyser = null;
    }
    for (const node of this.micNodes) {
      try {
        node.disconnect();
      } catch {}
    }
    this.micNodes = [];
    this.micWarmthEq = null;
    this.micPresenceEq = null;
    this.micWetGain = null;
    this.micDelayGain = null;
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    this.localMonitorGain = null;
  }

  setLocalMonitor(enabled: boolean): void {
    this.localMonitorEnabled = enabled;
    this.syncLocalMonitor();
  }

  private isMonitorAudible(): boolean {
    return this.localMonitorEnabled && !this.broadcastTabSource;
  }

  private syncLocalMonitor(): void {
    const enabled = this.isMonitorAudible();
    if (this.localMonitorGain && this.ctx) {
      this.localMonitorGain.gain.setTargetAtTime(enabled ? 1.0 : 0.0, this.ctx.currentTime, 0.02);
    }
    if (this.recordMicGain && this.ctx) {
      // When local monitor is ON, tab audio capture already includes mic via ctx.destination.
      // Mute direct mic in the recording mix to prevent double-voice phasing.
      this.recordMicGain.gain.setTargetAtTime(enabled ? 0.0 : 1.0, this.ctx.currentTime, 0.02);
    }
  }

  isLocalMonitorEnabled(): boolean {
    return this.localMonitorEnabled;
  }

  setBroadcastTabAudio(stream: MediaStream | null): void {
    if (stream) {
      const ctx = this.ensureContext();
      const source = ctx.createMediaStreamSource(stream);
      source.connect(this.broadcastTabGain!);
      this.broadcastTabSource?.disconnect();
      this.broadcastTabSource = source;
    } else {
      if (!this.broadcastTabSource) return;
      this.broadcastTabSource.disconnect();
      this.broadcastTabSource = null;
    }
    this.syncLocalMonitor();
  }

  getBroadcastStream(): MediaStream | null {
    return this.micBroadcastDest?.stream ?? this.micStream;
  }

  /**
   * Builds a recording MediaStream combining the processed mic and any backing music.
   * When `tabAudioStream` is provided (captured via getDisplayMedia for YouTube),
   * it mixes tab audio with mic while avoiding mic doubling when local monitor is active.
   */
  createRecordingStream(
    tabAudioStream?: MediaStream | null
  ): { stream: MediaStream; cleanup: () => void } | null {
    if (!tabAudioStream || tabAudioStream.getAudioTracks().length === 0) {
      const broadcastStream = this.getBroadcastStream();
      if (!broadcastStream) return null;
      return { stream: broadcastStream, cleanup: () => {} };
    }

    const ctx = this.ensureContext();
    const recordDest = ctx.createMediaStreamDestination();
    const recordLimiter = ctx.createDynamicsCompressor();
    recordLimiter.threshold.value = -2;
    recordLimiter.knee.value = 0;
    recordLimiter.ratio.value = 12;
    recordLimiter.attack.value = 0.002;
    recordLimiter.release.value = 0.08;
    recordLimiter.connect(recordDest);

    const tabSource = ctx.createMediaStreamSource(tabAudioStream);
    const tabGain = ctx.createGain();
    tabGain.gain.value = 1.0;
    tabSource.connect(tabGain);
    tabGain.connect(recordLimiter);

    const recordMicGain = ctx.createGain();
    recordMicGain.gain.value = this.isMonitorAudible() ? 0.0 : 1.0;
    this.recordMicGain = recordMicGain;
    if (this.micRecordBus) {
      this.micRecordBus.connect(recordMicGain);
    }
    recordMicGain.connect(recordLimiter);

    const audioTrack = tabAudioStream.getAudioTracks()[0];
    const handleTabEnded = () => {
      if (this.recordMicGain && this.ctx) {
        this.recordMicGain.gain.setTargetAtTime(1.0, this.ctx.currentTime, 0.02);
      }
    };
    audioTrack?.addEventListener('ended', handleTabEnded);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      audioTrack?.removeEventListener('ended', handleTabEnded);
      if (this.recordMicGain === recordMicGain) {
        this.recordMicGain = null;
      }
      try {
        if (this.micRecordBus) {
          this.micRecordBus.disconnect(recordMicGain);
        }
      } catch {
        // ignore if already disconnected
      }
      try {
        tabSource.disconnect();
        tabGain.disconnect();
        recordMicGain.disconnect();
        recordLimiter.disconnect();
      } catch {
        // ignore
      }
      tabAudioStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
    };

    return { stream: recordDest.stream, cleanup };
  }

  isMicActive(): boolean {
    return this.micStream !== null;
  }

  setBackingMusicVolume(volume: number): void {
    this.backingMusicVolume = Math.max(0, Math.min(1, volume));
    if (!this.ctx) return;
    this.musicGain?.gain.setTargetAtTime(this.backingMusicVolume, this.ctx.currentTime, 0.03);
    this.broadcastTabGain?.gain.setTargetAtTime(this.backingMusicVolume, this.ctx.currentTime, 0.03);
  }

  setMicVolume(v: number): void {
    const clamped = Math.max(0, Math.min(2.5, v));
    if (this.micGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.micGain.gain.cancelScheduledValues(now);
      this.micGain.gain.setTargetAtTime(clamped, now, 0.02);
    } else if (this.micGain) {
      this.micGain.gain.value = clamped;
    }
  }

  setEchoAmount(v: number): void {
    const clamped = Math.max(0, Math.min(1, v));
    if (this.micWetGain) this.micWetGain.gain.value = clamped * 0.9;
    if (this.micDelayGain) this.micDelayGain.gain.value = clamped * 0.5;
  }

  setToneEQ(bassDb: number, trebleDb: number): void {
    if (this.micWarmthEq) this.micWarmthEq.gain.value = Math.max(-8, Math.min(10, bassDb));
    if (this.micPresenceEq) this.micPresenceEq.gain.value = Math.max(-8, Math.min(10, trebleDb));
  }

  private applyAutoMatchedTone(): void {
    if (!this.autoTuneConfig.enabled || !this.autoTuneConfig.autoMatchTone) return;
    const match = this.keyMatcher.estimate(this.autoTuneConfig.key, this.autoTuneConfig.scale);
    if (!match) return;
    if (match.key === this.autoTuneConfig.key && match.scale === this.autoTuneConfig.scale) return;

    this.autoTuneConfig = {
      ...this.autoTuneConfig,
      key: match.key,
      scale: match.scale,
    };
    if (this.autoTuneNode) {
      postAutoTuneConfig(this.autoTuneNode, this.autoTuneConfig);
    }
    const snapshot = this.getAutoTuneConfig();
    for (const cb of this.autoTuneConfigListeners) {
      cb(snapshot);
    }
  }

  private syncKeyPollTimer(): void {
    const shouldPoll = this.autoTuneConfig.enabled && this.autoTuneConfig.autoMatchTone;
    if (!shouldPoll) {
      if (this.keyPollTimer !== null) {
        clearInterval(this.keyPollTimer);
        this.keyPollTimer = null;
      }
      return;
    }
    if (this.keyPollTimer !== null) return;
    this.keyPollTimer = window.setInterval(() => {
      if (!this.isPlaying || !this.keyAnalyser || !this.keyFreqBuf || !this.ctx) return;
      this.keyAnalyser.getByteFrequencyData(this.keyFreqBuf);
      const fed = this.keyMatcher.feedSpectrum(
        this.keyFreqBuf,
        this.ctx.sampleRate,
        this.keyAnalyser.fftSize
      );
      if (fed) {
        this.applyAutoMatchedTone();
      }
    }, 200);
  }

  setAutoTuneConfig(partial: Partial<AutoTuneConfig>): AutoTuneConfig {
    const turningOnAutoMatch =
      partial.autoMatchTone === true && !this.autoTuneConfig.autoMatchTone;
    const turningOnAutoTune = partial.enabled === true && !this.autoTuneConfig.enabled;
    if (turningOnAutoMatch || (turningOnAutoTune && (partial.autoMatchTone ?? this.autoTuneConfig.autoMatchTone))) {
      this.keyMatcher.reset();
    }

    this.autoTuneConfig = {
      ...this.autoTuneConfig,
      ...partial,
      retuneSpeedMs: Math.max(0, Math.min(100, partial.retuneSpeedMs ?? this.autoTuneConfig.retuneSpeedMs)),
      mix: Math.max(0, Math.min(1, partial.mix ?? this.autoTuneConfig.mix)),
    };
    if (this.autoTuneNode) {
      postAutoTuneConfig(this.autoTuneNode, this.autoTuneConfig);
    }
    this.syncKeyPollTimer();
    if (!this.autoTuneConfig.enabled) {
      const cleared: AutoTuneTelemetry = {
        voiced: false,
        detectedFreq: 0,
        targetFreq: 0,
        detectedNote: '--',
        targetNote: '--',
      };
      for (const cb of this.autoTuneTelemetryListeners) {
        cb(cleared);
      }
    }
    const snapshot = this.getAutoTuneConfig();
    for (const cb of this.autoTuneConfigListeners) {
      cb(snapshot);
    }
    return snapshot;
  }

  getAutoTuneConfig(): AutoTuneConfig {
    return { ...this.autoTuneConfig };
  }

  isAutoTuneEnabled(): boolean {
    return this.autoTuneConfig.enabled;
  }

  isAutoMatchToneLocked(): boolean {
    return this.keyMatcher.hasLock();
  }

  subscribeAutoTuneConfig(cb: (cfg: AutoTuneConfig) => void): () => void {
    this.autoTuneConfigListeners.add(cb);
    return () => {
      this.autoTuneConfigListeners.delete(cb);
    };
  }

  subscribeAutoTuneTelemetry(cb: (t: AutoTuneTelemetry) => void): () => void {
    this.autoTuneTelemetryListeners.add(cb);
    return () => {
      this.autoTuneTelemetryListeners.delete(cb);
    };
  }

  unlockAudio(): void {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
  }

  loadCustomFile(file: File): string {
    const ctx = this.ensureContext();
    this.clearCustomFile();
    this.customObjectUrl = URL.createObjectURL(file);
    this.audioEl = new Audio();
    this.audioEl.src = this.customObjectUrl;
    this.mediaSource = ctx.createMediaElementSource(this.audioEl);
    this.mediaSource.connect(this.musicGain!);
    return file.name;
  }

  loadRemoteAudio(url: string, title: string): string {
    const ctx = this.ensureContext();
    this.clearCustomFile();
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    audio.src = url;
    this.audioEl = audio;
    this.mediaSource = ctx.createMediaElementSource(audio);
    this.mediaSource.connect(this.musicGain!);
    return title;
  }

  seekTo(seconds: number): void {
    if (!this.audioEl || !Number.isFinite(seconds)) return;
    try {
      this.audioEl.currentTime = Math.max(0, seconds);
    } catch {
      // ignore if audio metadata is not ready yet
    }
  }

  clearCustomFile(): void {
    this.stop();
    this.mediaSource?.disconnect();
    this.mediaSource = null;
    if (this.audioEl) {
      this.audioEl.removeAttribute('src');
      this.audioEl.load();
      this.audioEl = null;
    }
    if (this.customObjectUrl) {
      URL.revokeObjectURL(this.customObjectUrl);
      this.customObjectUrl = null;
    }
  }

  play(onEnded?: () => void, onPlayError = onEnded): void {
    const audio = this.audioEl;
    if (this.isPlaying || !audio) return;

    this.ensureContext();
    this.isPlaying = true;
    const finish = (callback: (() => void) | undefined) => {
      if (audio.onended !== onMediaEnded) return;
      audio.onended = null;
      this.isPlaying = false;
      callback?.();
    };
    const onMediaEnded = () => finish(onEnded);
    audio.onended = onMediaEnded;
    void audio.play().catch(() => finish(onPlayError));
  }

  pause(): void {
    if (!this.isPlaying || !this.audioEl) return;
    this.isPlaying = false;
    this.audioEl.onended = null;
    this.audioEl.pause();
  }

  stop(): void {
    this.isPlaying = false;
    if (this.audioEl) {
      this.audioEl.onended = null;
      this.audioEl.pause();
      this.audioEl.currentTime = 0;
    }
  }

  getCurrentTime(): number {
    return this.audioEl?.currentTime || 0;
  }

  getEnergy(): { music: number; mic: number } {
    let music = 0;
    let mic = 0;
    if (this.musicAnalyser) {
      this.musicAnalyser.getByteFrequencyData(this.dataBuf);
      let sum = 0;
      for (let i = 0; i < this.dataBuf.length; i++) sum += this.dataBuf[i];
      music = Math.min(1, sum / (this.dataBuf.length * 140));
    }
    if (this.micAnalyser) {
      this.micAnalyser.getByteTimeDomainData(this.micTimeBuf);
      let sumSq = 0;
      for (let i = 0; i < this.micTimeBuf.length; i++) {
        const norm = (this.micTimeBuf[i] - 128) / 128;
        sumSq += norm * norm;
      }
      const rms = Math.sqrt(sumSq / this.micTimeBuf.length);
      mic = Math.min(1, rms * 6.5);
    }
    return { music, mic };
  }

  dispose(): void {
    this.setBroadcastTabAudio(null);
    this.clearCustomFile();
    this.disableMic();
    if (this.keyPollTimer !== null) {
      clearInterval(this.keyPollTimer);
      this.keyPollTimer = null;
    }
    this.masterGain?.disconnect();
    this.masterGain = null;
    this.musicGain?.disconnect();
    this.musicGain = null;
    this.broadcastTabGain?.disconnect();
    this.broadcastTabGain = null;
    this.micBroadcastDest?.disconnect();
    this.micBroadcastDest = null;
    this.broadcastLimiter?.disconnect();
    this.broadcastLimiter = null;
    this.micRecordBus?.disconnect();
    this.micRecordBus = null;
    this.musicAnalyser?.disconnect();
    this.musicAnalyser = null;
    this.keyAnalyser?.disconnect();
    this.keyAnalyser = null;
    this.keyFreqBuf = null;
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

export const karaokeAudio = new KaraokeAudioEngine();
