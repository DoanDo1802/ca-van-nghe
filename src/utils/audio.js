// Warm Ambient Lo-Fi Jazz Synthesizer & Procedural Foley Sound FX
// Generates lush Rhodes jazz chords + footsteps + sitting sound effects using Web Audio API

class AmbientLoungeAudio {
  constructor() {
    this.ctx = null;
    this.isPlaying = false;
    this.timer = null;
    this.currentChord = 0;
    this.lastFootstepTime = 0;
    this.duckFactor = 1.0;
    this.busGain = null;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
      this.busGain = this.ctx.createGain();
      this.busGain.gain.value = this.duckFactor;
      this.busGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setDucked(ducked) {
    this.duckFactor = ducked ? 0.12 : 1.0;
    if (this.ctx && this.busGain) {
      this.busGain.gain.setTargetAtTime(this.duckFactor, this.ctx.currentTime, 0.25);
    }
  }

  // Jazz chord progressions in Hz (Emaj9 -> C#m9 -> F#m9 -> B13)
  chords = [
    [164.81, 246.94, 311.13, 370.00, 493.88], // Emaj9
    [138.59, 207.65, 277.18, 329.63, 440.00], // C#m9
    [185.00, 277.18, 329.63, 440.00, 523.25], // F#m9
    [123.47, 196.00, 277.18, 369.99, 493.88]  // B13
  ];

  playChord(notes) {
    if (!this.ctx || !this.isPlaying) return;

    const now = this.ctx.currentTime;
    const masterGain = this.ctx.createGain();
    masterGain.gain.setValueAtTime(0.08, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(650, now);
    filter.Q.setValueAtTime(1.2, now);

    masterGain.connect(filter);
    filter.connect(this.busGain || this.ctx.destination);

    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      const vibrato = this.ctx.createOscillator();
      const vibratoGain = this.ctx.createGain();
      vibrato.frequency.value = 4.5;
      vibratoGain.gain.value = 1.2;
      vibrato.connect(osc.frequency);
      vibrato.start(now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.8 + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 5.5);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + 6.0);
      vibrato.stop(now + 6.0);
    });
  }

  // Soft wooden floor footstep sound effect
  playFootstep(isRunning = false) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastFootstepTime < (isRunning ? 0.28 : 0.44)) return;
    this.lastFootstepTime = now;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isRunning ? 95 : 80, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.08);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, now);

    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  // Sit-down / Stand-up rustle sound effect
  playSitSound() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.2);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(320, now);

    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.23);
  }

  // Jump swoosh / spring sound effect
  playJumpSound() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.15);

    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.19);
  }

  // Layered applause / clap sound effect with optional stereo pan & distance gain
  playClapSound(pan = 0, distanceGain = 1.0) {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const clampedGain = Math.max(0.05, Math.min(1.0, distanceGain));
    const panner =
      typeof this.ctx.createStereoPanner === 'function' ? this.ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), now);
      panner.connect(this.ctx.destination);
    }
    const dest = panner || this.ctx.destination;

    // 4 quick layered noise claps to feel like real lounge applause
    for (let i = 0; i < 4; i++) {
      const t = now + i * 0.11 + Math.random() * 0.03;
      const bufSize = Math.floor(this.ctx.sampleRate * 0.07);
      const buffer = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let j = 0; j < bufSize; j++) {
        data[j] = (Math.random() * 2 - 1) * Math.exp(-j / (bufSize * 0.28));
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;

      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1100 + Math.random() * 500, t);
      bp.Q.setValueAtTime(1.4, t);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.18 * clampedGain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.075);

      src.connect(bp);
      bp.connect(g);
      g.connect(dest);
      src.start(t);
    }
  }

  start() {
    this.init();
    this.isPlaying = true;

    const playNext = () => {
      if (!this.isPlaying) return;
      this.playChord(this.chords[this.currentChord]);
      this.currentChord = (this.currentChord + 1) % this.chords.length;
      this.timer = setTimeout(playNext, 4500);
    };

    playNext();
  }

  stop() {
    this.isPlaying = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  toggle() {
    if (this.isPlaying) {
      this.stop();
      return false;
    } else {
      this.start();
      return true;
    }
  }
}

export const loungeAudio = new AmbientLoungeAudio();
