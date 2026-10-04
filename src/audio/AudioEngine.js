// AudioEngine — plays a local file through the Web Audio graph and produces
// a per-frame analysis object shared by all visualizers.
//
// Graph: <audio> → MediaElementSource → AnalyserNode → GainNode → destination
// The analyser sits BEFORE the gain, so lowering the volume never flattens
// the visuals. Only one AudioContext / AnalyserNode is ever created.

export class AudioEngine {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = "auto";

    this.ctx = null;
    this.analyser = null;
    this.gain = null;
    this.graphReady = false;

    this.hzPerBin = 44100 / 2048; // corrected once the context exists
    this.binCount = 1024;
    this.fftSize = 2048;

    this._volume = 0.85;
    this._fade = 1; // melts visuals toward zero while paused
    this._freq = new Uint8Array(this.binCount);
    this._wave = new Float32Array(this.fftSize);
    this._bandBins = null;
    this.sm = { bass: 0, mid: 0, treble: 0, overall: 0 };
    this._frame = {
      freq: this._freq,
      wave: this._wave,
      bass: 0, mid: 0, treble: 0, overall: 0, rms: 0,
      hzPerBin: this.hzPerBin,
      binCount: this.binCount,
      isDemo: false,
    };

    this.objectUrl = null;
    this._loading = false;
    this.onPlayStateChange = null;
    this.onEnded = null;
    this.onError = null;
    this.onMeta = null;

    this.audio.addEventListener("play", () => this.onPlayStateChange?.(true));
    this.audio.addEventListener("pause", () => this.onPlayStateChange?.(false));
    this.audio.addEventListener("ended", () => this.onEnded?.());
    this.audio.addEventListener("error", () => {
      // Load-time failures surface through load()'s rejection instead,
      // so the user never sees the same error twice.
      if (!this._loading) this.onError?.(describeMediaError(this.audio.error));
    });
    this.audio.addEventListener("loadedmetadata", () => this.onMeta?.());
  }

  // Must be called from a user gesture (browser autoplay policy).
  ensureGraph() {
    if (this.graphReady) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error("Web Audio is not supported in this browser.");

    this.ctx = new AC();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = this.fftSize;
    this.analyser.smoothingTimeConstant = 0.8;

    this.gain = this.ctx.createGain();
    this.gain.gain.value = this._volume;
    this.audio.volume = 1; // gain node owns volume from here on

    const source = this.ctx.createMediaElementSource(this.audio);
    source.connect(this.analyser);
    this.analyser.connect(this.gain);
    this.gain.connect(this.ctx.destination);

    this.binCount = this.analyser.frequencyBinCount;
    this.fftSize = this.analyser.fftSize;
    this.hzPerBin = this.ctx.sampleRate / this.fftSize;
    this._freq = new Uint8Array(this.binCount);
    this._wave = new Float32Array(this.fftSize);
    this._frame.freq = this._freq;
    this._frame.wave = this._wave;
    this._frame.hzPerBin = this.hzPerBin;
    this._frame.binCount = this.binCount;
    this._bandBins = null;
    this.graphReady = true;
  }

  applySettings(s) {
    if (this.analyser) {
      this.analyser.smoothingTimeConstant = 0.55 + 0.4 * s.get("smoothing");
    }
  }

  load(file) {
    this.ensureGraph();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(file);
    this.audio.src = this.objectUrl;
    this.audio.load();
    this._loading = true;

    return new Promise((resolve, reject) => {
      let settled = false;
      const ok = () => {
        if (settled) return;
        settled = true;
        this._loading = false;
        const d = this.audio.duration;
        resolve(Number.isFinite(d) ? d : 0);
      };
      const fail = (msg) => {
        if (settled) return;
        settled = true;
        this._loading = false;
        reject(new Error(msg));
      };
      this.audio.addEventListener("loadedmetadata", ok, { once: true });
      this.audio.addEventListener("error", () => fail(describeMediaError(this.audio.error)), { once: true });
      setTimeout(() => fail("Timed out while reading this file."), 15000);
    });
  }

  async play() {
    if (!this.graphReady) return;
    try {
      if (this.ctx.state !== "running") await this.ctx.resume();
    } catch {
      /* resume can fail transiently; play() below is the real gate */
    }
    if (this.audio.ended || (this.audio.duration > 0 && this.audio.currentTime >= this.audio.duration - 0.05)) {
      this.audio.currentTime = 0;
    }
    try {
      await this.audio.play();
    } catch (err) {
      if (err && err.name === "AbortError") return; // pause() raced with play()
      throw new Error("Playback was blocked — click the page and try again.");
    }
  }

  pause() {
    this.audio.pause();
  }

  seek(t) {
    if (!this.graphReady) return;
    const d = this.audio.duration || 0;
    this.audio.currentTime = Math.max(0, Math.min(d > 0 ? d - 0.01 : t, t));
  }

  restart() {
    this.seek(0);
  }

  setVolume(v) {
    this._volume = v;
    if (this.gain) {
      this.gain.gain.value = v;
    } else {
      this.audio.volume = v; // graph not built yet (no file loaded)
    }
  }

  get currentTime() { return this.graphReady ? this.audio.currentTime : 0; }
  get duration() { return this.graphReady && Number.isFinite(this.audio.duration) ? this.audio.duration : 0; }
  get paused() { return !this.graphReady || this.audio.paused; }

  // Per-frame analysis. Returns a stable frame object (no allocations).
  getFrame(dt, s) {
    if (!this.graphReady) return this._frame;
    const { analyser, _freq: freq, _wave: wave } = this;

    analyser.getByteFrequencyData(freq);
    if (typeof analyser.getFloatTimeDomainData === "function") {
      analyser.getFloatTimeDomainData(wave);
    } else {
      const bytes = new Uint8Array(wave.length); // legacy fallback path
      analyser.getByteTimeDomainData(bytes);
      for (let i = 0; i < wave.length; i++) wave[i] = (bytes[i] - 128) / 128;
    }

    // While paused, everything decays to silence instead of freezing abruptly.
    if (this.audio.paused) {
      this._fade = Math.max(0, this._fade - dt * 1.6);
    } else {
      this._fade = 1;
    }
    const fade = this._fade;

    if (!this._bandBins) this._bandBins = computeBandBins(this.hzPerBin, this.binCount);
    const { b0, b1, m0, m1, t0, t1 } = this._bandBins;

    const bass = zoneEnergy(freq, b0, b1, 0.92);
    const mid = zoneEnergy(freq, m0, m1, 1.0);
    const treble = zoneEnergy(freq, t0, t1, 1.25); // gentle lift — highs are quiet

    let rms = 0;
    for (let i = 0; i < wave.length; i++) rms += wave[i] * wave[i];
    rms = Math.sqrt(rms / wave.length);

    const k = 1 - Math.exp(-dt * 14); // extra band smoothing on top of the analyser's
    this.sm.bass += (bass * fade - this.sm.bass) * k;
    this.sm.mid += (mid * fade - this.sm.mid) * k;
    this.sm.treble += (treble * fade - this.sm.treble) * k;
    const overallRaw = Math.max(rms * 1.7 * fade, (this.sm.bass * 0.45 + this.sm.mid * 0.35 + this.sm.treble * 0.25) * 1.12);
    this.sm.overall += (Math.min(1, overallRaw) - this.sm.overall) * k;

    if (fade < 1) {
      for (let i = 0; i < freq.length; i++) freq[i] = freq[i] * fade;
      for (let i = 0; i < wave.length; i++) wave[i] = wave[i] * fade;
    }

    const f = this._frame;
    f.bass = this.sm.bass;
    f.mid = this.sm.mid;
    f.treble = this.sm.treble;
    f.overall = this.sm.overall;
    f.rms = rms * fade;
    return f;
  }

  dispose() {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
  }
}

function computeBandBins(hzPerBin, binCount) {
  const bin = (hz) => Math.max(1, Math.min(binCount - 1, Math.round(hz / hzPerBin)));
  const nyquist = hzPerBin * binCount;
  return {
    b0: bin(20), b1: bin(250),
    m0: bin(250), m1: bin(2000),
    t0: bin(2000), t1: Math.min(binCount - 1, Math.round(Math.min(16000, nyquist * 0.95) / hzPerBin)),
  };
}

function zoneEnergy(freq, from, to, gamma) {
  let sum = 0;
  const n = Math.max(1, to - from);
  for (let i = from; i < to; i++) sum += freq[i];
  const v = sum / n / 255;
  return Math.min(1, Math.pow(v, gamma));
}

function describeMediaError(err) {
  if (!err) return "This file could not be loaded.";
  switch (err.code) {
    case MediaError.MEDIA_ERR_DECODE:
      return "This file can't be decoded by your browser. Try MP3, WAV or M4A.";
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "This audio format is not supported by your browser.";
    case MediaError.MEDIA_ERR_NETWORK:
      return "The file could not be read from disk.";
    default:
      return "This file could not be loaded.";
  }
}
