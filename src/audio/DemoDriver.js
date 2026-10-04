// DemoDriver — a tiny procedural "track" so the visualizers run without any
// audio file. It models a song (intro → build → drop → break → drop) at
// 122 BPM and synthesizes band energies, an FFT-like spectrum and a waveform
// with the same shape as AudioEngine's output, so the rest of the app cannot
// tell the difference. No AudioContext is created — nothing is played aloud.

const BPM = 122;
const BEAT = 60 / BPM;
const LOOP_BARS = 64;
const DURATION = BEAT * 4 * LOOP_BARS;

const SCALE = [220, 261.63, 293.66, 329.63, 392, 440]; // A minor pentatonic
const ARP = [0, 2, 4, 5, 3, 4, 2, 1];

function sectionAt(bar) {
  bar %= LOOP_BARS;
  if (bar < 8)  return { kick: 0.75, hat: 0.45, snare: 0,    arp: 0,    pad: 0.55, bass: 0.5,  treb: 0.55, wobble: 0, transpose: 0,  riser: 0 };
  if (bar < 16) return { kick: 0.85, hat: 0.6,  snare: 0,    arp: 0.75, pad: 0.6,  bass: 0.65, treb: 0.65, wobble: 0, transpose: 0,  riser: (bar - 8) / 8 };
  if (bar < 40) return { kick: 1,    hat: 0.8,  snare: 0.9,  arp: 0.95, pad: 0.45, bass: 1,    treb: 1,    wobble: 1, transpose: 0,  riser: 0 };
  if (bar < 48) return { kick: 0,    hat: 0.22, snare: 0,    arp: 0.85, pad: 0.95, bass: 0.28, treb: 0.35, wobble: 0, transpose: -3, riser: 0 };
  return {         kick: 1,    hat: 0.85, snare: 0.9,  arp: 1,    pad: 0.5,  bass: 1,    treb: 1,    wobble: 1, transpose: 2,  riser: 0 };
}

function gauss(f, c, w) {
  const d = (f - c) / w;
  return Math.exp(-0.5 * d * d);
}

export class DemoDriver {
  constructor() {
    this.duration = DURATION;
    this.pos = 0;
    this.playing = false;
    this.idle = true; // gentle backdrop behind the welcome screen
    this.isDemo = true;

    this.binCount = 1024;
    this.hzPerBin = 44100 / 2048;
    this.fftSize = 2048;

    this._freq = new Uint8Array(this.binCount);
    this._wave = new Float32Array(this.fftSize);
    this._seeds = new Float32Array(this.binCount);
    for (let i = 0; i < this.binCount; i++) this._seeds[i] = Math.random();
    this.sm = { bass: 0, mid: 0, treble: 0, overall: 0 };
    this._frame = {
      freq: this._freq,
      wave: this._wave,
      bass: 0, mid: 0, treble: 0, overall: 0, rms: 0,
      hzPerBin: this.hzPerBin,
      binCount: this.binCount,
      isDemo: true,
    };
  }

  // Welcome backdrop → full demo experience.
  activate() {
    this.idle = false;
    this.playing = true;
  }

  play() { this.playing = true; }
  pause() { this.playing = false; }
  seek(t) { this.pos = Math.max(0, Math.min(this.duration - 0.01, t)); }
  restart() { this.pos = 0; }
  setVolume() { /* demo is silent — accepted, ignored */ }
  applySettings() { /* smoothing is read per-frame */ }

  get currentTime() { return this.pos; }
  get paused() { return !this.playing; }

  getFrame(dt, s) {
    if (this.idle || this.playing) {
      this.pos = (this.pos + dt * (this.idle ? 0.85 : 1)) % this.duration;
    }
    // Paused (and not the welcome backdrop): decay everything to silence,
    // mirroring how the real audio engine melts away when paused.
    const gate = this.idle || this.playing ? 1 : 0;

    const raw = this._synth(this.pos);
    const rate = 24 - 16 * s.get("smoothing");
    const k = 1 - Math.exp(-dt * rate);
    this.sm.bass += (raw.bass * gate - this.sm.bass) * k;
    this.sm.mid += (raw.mid * gate - this.sm.mid) * k;
    this.sm.treble += (raw.treble * gate - this.sm.treble) * k;
    this.sm.overall += (raw.overall * gate - this.sm.overall) * k;

    const f = this._frame;
    f.bass = this.sm.bass;
    f.mid = this.sm.mid;
    f.treble = this.sm.treble;
    f.overall = this.sm.overall;
    f.rms = this.sm.overall * 0.55;
    this._synthFreq(this.pos, f.bass, f.mid, f.treble, raw, gate);
    this._synthWave(this.pos, f.bass, f.mid, f.treble, gate);
    return f;
  }

  // --- musical model -------------------------------------------------

  _synth(pos) {
    const bt = pos / BEAT;          // beats
    const bar = Math.floor(bt / 4); // bar index
    const sec = sectionAt(bar);
    const beatPh = bt % 1;
    const e8 = bt * 2;              // eighth notes
    const ePh = e8 % 1;
    const eIdx = Math.floor(e8);

    const kickEnv = sec.kick > 0 ? Math.exp(-beatPh * 6.5) * sec.kick : 0;
    const beatInBar = Math.floor(bt) % 4;
    const snareEnv = beatInBar % 2 === 1 ? Math.exp(-beatPh * 10) * sec.snare : 0;
    const hatEnv = Math.exp(-ePh * 22) * sec.hat * (eIdx % 2 ? 1 : 0.55);
    const note = SCALE[ARP[eIdx % 8]] * Math.pow(2, sec.transpose / 12) * (bar % LOOP_BARS >= 48 ? 2 : 1);
    const arpEnv = Math.exp(-ePh * 4.5) * sec.arp;
    const pad = sec.pad * (0.75 + 0.25 * Math.sin(pos * 0.5));
    const riser = sec.riser > 0 ? sec.riser * sec.riser : 0;

    // sidechain pump — everything ducks just before each kick lands
    const duck = sec.kick > 0 ? 0.55 + 0.45 * kickEnv : 1;

    const bass = Math.min(1,
      kickEnv * 0.92 +
      0.12 * sec.bass * (1 + 0.5 * Math.sin(pos * 2.1)) +
      sec.wobble * 0.2 * Math.abs(Math.sin(pos * Math.PI * 2 * 1.9))
    );
    const mid = Math.min(1, (arpEnv * 0.62 + pad * 0.24 + snareEnv * 0.28) * duck);
    const treble = Math.min(1, (hatEnv * 0.72 + snareEnv * 0.5 + riser * 0.55 + 0.045) * (0.6 + 0.4 * duck));
    const overall = Math.min(1, 0.45 * bass + 0.33 * mid + 0.28 * treble);

    return { bass, mid, treble, overall, note, kickEnv, snareEnv, hatEnv, riser, pad };
  }

  _synthFreq(pos, bass, mid, treble, raw, gate) {
    const t = pos;
    const freq = this._freq;
    const seeds = this._seeds;
    const hz = this.hzPerBin;
    const note = raw.note;
    if (gate <= 0) {
      freq.fill(0);
      return;
    }
    for (let b = 1; b < freq.length; b++) {
      const f = b * hz;
      let v =
        bass * 1.55 * gauss(f, 52, 40) +
        bass * 0.65 * gauss(f, 104, 28) +
        mid * 1.25 * gauss(f, note, note * 0.1 + 16) +
        mid * 0.6 * gauss(f, note * 2, note * 0.16 + 28) +
        raw.pad * 0.3 * Math.exp(-f / 700) +
        raw.snareEnv * 0.3 * gauss(f, 2400, 900) +
        treble * (0.55 * Math.exp(-f / 9000) + 0.38 * gauss(f, 6600, 1900)) *
          (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(b * 1.7 + t * 21 + seeds[b] * 6.28))) +
        0.012;
      v *= 0.9 + 0.1 * Math.sin(b * 0.37 + t * 7);
      freq[b] = Math.max(0, Math.min(255, v * 255));
    }
    freq[0] = 0;
  }

  _synthWave(pos, bass, mid, treble, gate) {
    const wave = this._wave;
    if (gate <= 0) {
      wave.fill(0);
      return;
    }
    const N = wave.length;
    const k = (Math.PI * 2 * 4) / N; // 4 cycles across the buffer
    const t = pos;
    const nz = Math.sin(t * 13.7) * 0.5 + Math.sin(t * 7.3 + 1.7) * 0.5;
    for (let i = 0; i < N; i++) {
      const ph = i * k;
      let y =
        bass * 0.46 * Math.sin(ph + 2.6 * bass) +
        mid * 0.3 * Math.sin(ph * 2.5 + 1.3 + 0.5 * Math.sin(t * 0.8)) +
        mid * 0.2 * Math.sin(ph * 4.02 + t * 0.6) +
        treble * 0.12 * Math.sin(ph * 8.1 + t * 2.2) +
        treble * 0.05 * nz * Math.sin(ph * 0.9 + i);
      wave[i] = y * 0.92;
    }
  }
}
