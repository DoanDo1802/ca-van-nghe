import {
  DEFAULT_AUTOTUNE_CONFIG,
  createRapAutoTuneNode,
  midiToNoteName,
  postAutoTuneConfig,
  type AutoTuneConfig,
  type AutoTuneTelemetry,
} from './rapAutoTune';

export interface LyricLine {
  time: number; // seconds
  text: string;
}

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
  bpm?: number;
  duration?: number;
  chords?: number[][];
  lyrics?: LyricLine[];
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
  private broadcastMusicGain: GainNode | null = null;
  private audienceMusicVol = 0.6;
  private musicAnalyser: AnalyserNode | null = null;
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
  private micBroadcastDest: MediaStreamAudioDestinationNode | null = null;
  private broadcastLimiter: DynamicsCompressorNode | null = null;
  private localMonitorGain: GainNode | null = null;
  private localMonitorEnabled = true;

  private audioEl: HTMLAudioElement | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;
  private customObjectUrl: string | null = null;

  private seqTimer: number | null = null;
  private isPlaying = false;
  private useCustomFile = false;
  private currentSong: KaraokeSong = KARAOKE_SONGS[0];
  private startPerf = 0;
  private pausedOffset = 0;
  private chordStep = 0;

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
      this.musicGain.gain.value = 0.35;
      this.musicAnalyser = this.ctx.createAnalyser();
      this.musicAnalyser.fftSize = 128;
      this.musicGain.connect(this.musicAnalyser);
      this.musicAnalyser.connect(this.masterGain);

      this.micBroadcastDest = this.ctx.createMediaStreamDestination();
      const broadcastLimiter = this.ctx.createDynamicsCompressor();
      broadcastLimiter.threshold.value = -2;
      broadcastLimiter.knee.value = 0;
      broadcastLimiter.ratio.value = 12;
      broadcastLimiter.attack.value = 0.002;
      broadcastLimiter.release.value = 0.08;
      broadcastLimiter.connect(this.micBroadcastDest);
      this.broadcastLimiter = broadcastLimiter;

      this.broadcastMusicGain = this.ctx.createGain();
      this.broadcastMusicGain.gain.value = this.audienceMusicVol;
      this.musicGain.connect(this.broadcastMusicGain);
      this.broadcastMusicGain.connect(broadcastLimiter);
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
    try {
      const ctx = this.ensureContext();
      if (this.micStream) {
        this.disableMic();
      }
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation,
        noiseSuppression: false,
        autoGainControl: false,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      };
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      this.micStream = stream;
      this.micSource = ctx.createMediaStreamSource(stream);

      const autoTuneNode = await createRapAutoTuneNode(ctx, this.autoTuneConfig);
      if (this.micStream !== stream) {
        autoTuneNode?.disconnect();
        return false;
      }

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
          const telemetry: AutoTuneTelemetry = {
            voiced,
            detectedFreq: voiced ? Number(data.detectedFreq) || 0 : 0,
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
      monitorGain.gain.value = this.localMonitorEnabled ? 1.0 : 0.0;
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
      if (!this.micBroadcastDest && this.musicGain) {
        if (!this.broadcastMusicGain) {
          this.broadcastMusicGain = ctx.createGain();
          this.broadcastMusicGain.gain.value = this.audienceMusicVol;
        }
        this.musicGain.connect(this.broadcastMusicGain);
        this.broadcastMusicGain.connect(broadcastInput);
      }
      this.micBroadcastDest = broadcastDest;
      dry.connect(broadcastInput);
      wet.connect(broadcastInput);
      delayOut.connect(broadcastInput);

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
      return false;
    }
  }

  disableMic(): void {
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
    if (this.localMonitorGain && this.ctx) {
      this.localMonitorGain.gain.setTargetAtTime(enabled ? 1.0 : 0.0, this.ctx.currentTime, 0.02);
    }
  }

  isLocalMonitorEnabled(): boolean {
    return this.localMonitorEnabled;
  }

  getBroadcastStream(): MediaStream | null {
    if (!this.micBroadcastDest && this.useCustomFile) {
      this.ensureContext();
    }
    return this.micBroadcastDest?.stream ?? this.micStream;
  }

  isMicActive(): boolean {
    return this.micStream !== null;
  }

  setMusicVolume(v: number): void {
    if (this.musicGain) this.musicGain.gain.value = Math.max(0, Math.min(1, v));
  }

  setAudienceMusicVolume(v: number): void {
    const clamped = Math.max(0, Math.min(1, v));
    this.audienceMusicVol = clamped;
    if (this.broadcastMusicGain && this.ctx) {
      this.broadcastMusicGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.03);
    } else if (this.broadcastMusicGain) {
      this.broadcastMusicGain.gain.value = clamped;
    }
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

  setAutoTuneConfig(partial: Partial<AutoTuneConfig>): AutoTuneConfig {
    this.autoTuneConfig = {
      ...this.autoTuneConfig,
      ...partial,
      retuneSpeedMs: Math.max(0, Math.min(100, partial.retuneSpeedMs ?? this.autoTuneConfig.retuneSpeedMs)),
      mix: Math.max(0, Math.min(1, partial.mix ?? this.autoTuneConfig.mix)),
    };
    if (this.autoTuneNode) {
      postAutoTuneConfig(this.autoTuneNode, this.autoTuneConfig);
    }
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
    return this.getAutoTuneConfig();
  }

  getAutoTuneConfig(): AutoTuneConfig {
    return { ...this.autoTuneConfig };
  }

  isAutoTuneEnabled(): boolean {
    return this.autoTuneConfig.enabled;
  }

  subscribeAutoTuneTelemetry(cb: (t: AutoTuneTelemetry) => void): () => void {
    this.autoTuneTelemetryListeners.add(cb);
    return () => {
      this.autoTuneTelemetryListeners.delete(cb);
    };
  }

  loadCustomFile(file: File): string {
    const ctx = this.ensureContext();
    this.stop();
    if (this.customObjectUrl) URL.revokeObjectURL(this.customObjectUrl);
    this.customObjectUrl = URL.createObjectURL(file);

    if (!this.audioEl) {
      this.audioEl = new Audio();
      this.audioEl.crossOrigin = 'anonymous';
      this.mediaSource = ctx.createMediaElementSource(this.audioEl);
      this.mediaSource.connect(this.musicGain!);
    }
    this.audioEl.src = this.customObjectUrl;
    this.useCustomFile = true;
    return file.name;
  }

  selectBuiltInSong(song: KaraokeSong): void {
    this.stop();
    this.useCustomFile = false;
    this.currentSong = song;
  }

  play(onEnded?: () => void): void {
    const ctx = this.ensureContext();
    if (this.isPlaying) return;
    this.isPlaying = true;

    if (this.useCustomFile && this.audioEl) {
      this.audioEl.onended = () => {
        this.isPlaying = false;
        onEnded?.();
      };
      void this.audioEl.play();
      return;
    }

    if (!this.currentSong.chords || !this.currentSong.bpm) {
      return;
    }

    this.startPerf = performance.now() - this.pausedOffset * 1000;
    const beatMs = (60 / this.currentSong.bpm) * 1000;

    const triggerBeat = () => {
      if (!this.isPlaying || !this.ctx || !this.musicGain || !this.currentSong.chords) return;
      const elapsed = this.getCurrentTime();
      if (elapsed >= (this.currentSong.duration ?? 30)) {
        this.stop();
        onEnded?.();
        return;
      }

      const chordIdx = Math.floor(this.chordStep / 4) % this.currentSong.chords.length;
      const chord = this.currentSong.chords[chordIdx];
      const now = ctx.currentTime;

      // Kick / soft bass on beat 0 & 2
      if (this.chordStep % 2 === 0) {
        const bass = ctx.createOscillator();
        const bassGain = ctx.createGain();
        bass.type = 'triangle';
        bass.frequency.setValueAtTime(chord[0] * 0.5, now);
        bassGain.gain.setValueAtTime(0.24, now);
        bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        bass.connect(bassGain);
        bassGain.connect(this.musicGain);
        bass.start(now);
        bass.stop(now + 0.38);
      }

      // Acoustic strum / arpeggio on each beat
      const notesToPlay = this.chordStep % 4 === 0 ? chord : [chord[this.chordStep % chord.length]];
      notesToPlay.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        const t0 = now + idx * 0.03;
        osc.frequency.setValueAtTime(freq, t0);
        g.gain.setValueAtTime(0.001, t0);
        g.gain.linearRampToValueAtTime(0.11, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.65);
        osc.connect(g);
        g.connect(this.musicGain!);
        osc.start(t0);
        osc.stop(t0 + 0.7);
      });

      this.chordStep += 1;
    };

    triggerBeat();
    this.seqTimer = window.setInterval(triggerBeat, beatMs);
  }

  pause(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.useCustomFile && this.audioEl) {
      this.audioEl.pause();
    } else {
      this.pausedOffset = this.getCurrentTime();
      if (this.seqTimer !== null) {
        clearInterval(this.seqTimer);
        this.seqTimer = null;
      }
    }
  }

  stop(): void {
    this.isPlaying = false;
    this.pausedOffset = 0;
    this.chordStep = 0;
    if (this.seqTimer !== null) {
      clearInterval(this.seqTimer);
      this.seqTimer = null;
    }
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.currentTime = 0;
    }
  }

  getCurrentTime(): number {
    if (this.useCustomFile && this.audioEl) {
      return this.audioEl.currentTime || 0;
    }
    if (!this.isPlaying) return this.pausedOffset;
    return (performance.now() - this.startPerf) / 1000;
  }

  getDuration(): number {
    if (this.useCustomFile && this.audioEl && Number.isFinite(this.audioEl.duration)) {
      return this.audioEl.duration;
    }
    return this.currentSong.duration ?? 0;
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
    this.stop();
    this.disableMic();
    if (this.customObjectUrl) {
      URL.revokeObjectURL(this.customObjectUrl);
      this.customObjectUrl = null;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}

export const karaokeAudio = new KaraokeAudioEngine();
