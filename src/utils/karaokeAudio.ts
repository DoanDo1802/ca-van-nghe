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
  private micBroadcastDest: MediaStreamAudioDestinationNode | null = null;
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
      this.musicGain.gain.value = 0.30;
      this.musicAnalyser = this.ctx.createAnalyser();
      this.musicAnalyser.fftSize = 128;
      this.musicGain.connect(this.musicAnalyser);
      this.musicAnalyser.connect(this.masterGain);
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

      // 1. Preamp Gain (high sensitivity)
      this.micGain = ctx.createGain();
      this.micGain.gain.value = micSensitivity;

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

      // 3. Vocal Compressor (evens out quiet & loud singing, prevents clipping)
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -24;
      comp.knee.value = 18;
      comp.ratio.value = 4.5;
      comp.attack.value = 0.004;
      comp.release.value = 0.16;

      this.micAnalyser = ctx.createAnalyser();
      this.micAnalyser.fftSize = 256;
      this.micAnalyser.smoothingTimeConstant = 0.75;

      // 4. Studio Vocal Chain: Make-up Boost + Dry + Warm Hall Reverb + Stereo Karaoke Echo
      const makeup = ctx.createGain();
      makeup.gain.value = 2.0;
      comp.connect(makeup);

      const dry = ctx.createGain();
      dry.gain.value = 1.05;

      const convolver = ctx.createConvolver();
      convolver.buffer = this.createReverbImpulse(ctx, 1.65, 2.5);
      const wet = ctx.createGain();
      wet.gain.value = echoAmount * 0.9;
      this.micWetGain = wet;

      const delay = ctx.createDelay(0.5);
      delay.delayTime.value = 0.18;
      const delayFilter = ctx.createBiquadFilter();
      delayFilter.type = 'lowpass';
      delayFilter.frequency.value = 2800;
      const delayFeedback = ctx.createGain();
      delayFeedback.gain.value = 0.28;
      const delayOut = ctx.createGain();
      delayOut.gain.value = echoAmount * 0.5;
      this.micDelayGain = delayOut;

      this.micSource.connect(hp);
      hp.connect(warmth);
      warmth.connect(presence);
      presence.connect(this.micGain);
      this.micGain.connect(comp);
      comp.connect(this.micAnalyser);

      const monitorGain = ctx.createGain();
      monitorGain.gain.value = this.localMonitorEnabled ? 1.0 : 0.0;
      monitorGain.connect(this.masterGain!);
      this.localMonitorGain = monitorGain;

      makeup.connect(dry);
      dry.connect(monitorGain);

      makeup.connect(convolver);
      convolver.connect(wet);
      wet.connect(monitorGain);

      makeup.connect(delay);
      delay.connect(delayFilter);
      delayFilter.connect(delayFeedback);
      delayFeedback.connect(delay);
      delayFilter.connect(delayOut);
      delayOut.connect(monitorGain);

      const broadcastDest = ctx.createMediaStreamDestination();
      dry.connect(broadcastDest);
      wet.connect(broadcastDest);
      delayOut.connect(broadcastDest);
      if (this.musicGain) {
        this.musicGain.connect(broadcastDest);
      }
      this.micBroadcastDest = broadcastDest;

      this.micNodes = [hp, warmth, presence, comp, makeup, dry, convolver, wet, delay, delayFilter, delayFeedback, delayOut, monitorGain, broadcastDest];
      return true;
    } catch {
      return false;
    }
  }

  disableMic(): void {
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
    if (this.musicGain && this.micBroadcastDest) {
      try {
        this.musicGain.disconnect(this.micBroadcastDest);
      } catch {
        // ignore
      }
    }
    this.localMonitorGain = null;
    this.micBroadcastDest = null;
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
    return this.micBroadcastDest?.stream ?? this.micStream;
  }

  isMicActive(): boolean {
    return this.micStream !== null;
  }

  setMusicVolume(v: number): void {
    if (this.musicGain) this.musicGain.gain.value = Math.max(0, Math.min(1, v));
  }

  setMicVolume(v: number): void {
    if (this.micGain) this.micGain.gain.value = Math.max(0.2, Math.min(7.0, v));
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
