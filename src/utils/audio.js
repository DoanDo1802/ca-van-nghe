class SoundEffects {
  constructor() {
    this.ctx = null;
    this.lastFootstepTime = 0;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
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
}

export const soundEffects = new SoundEffects();
