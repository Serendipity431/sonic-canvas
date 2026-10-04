// BeatDetector — onset detection on the bass band.
//
// A beat fires when the current bass energy clearly exceeds the recent moving
// average, is still rising, and a cooldown has elapsed. `pulse` decays after
// every hit and is what visualizers read for "impact".

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Common musical tempo band. Estimates outside it are almost always
// half-time / double-time locks, so they get folded back in.
const BPM_MIN = 75;
const BPM_MAX = 160;

export class BeatDetector {
  constructor() {
    this.pulse = 0;
    this.bpm = 0;
    this._hist = new Float32Array(64); // ~1s of bass energy at 60fps
    this._idx = 0;
    this._filled = 0;
    this._lastBeat = -1e9;
    this._prev = 0;
    this._iv = []; // recent beat intervals, for the tempo estimate
    this._result = { hit: false, pulse: 0, intensity: 0 };
  }

  // Clears everything a previous song left behind: history, tempo estimate,
  // pulse and intervals. Call on track change, demo start and big seeks.
  reset() {
    this._hist.fill(0);
    this._idx = 0;
    this._filled = 0;
    this._lastBeat = -1e9;
    this._prev = 0;
    this._iv = [];
    this.pulse = 0;
    this.bpm = 0;
  }

  update(bass, nowMs, dt) {
    this.pulse = Math.max(0, this.pulse - dt * 2.6);
    const r = this._result;
    r.hit = false;
    r.intensity = 0;
    r.pulse = this.pulse;

    const h = this._hist;
    let sum = 0;
    for (let i = 0; i < this._filled; i++) sum += h[i];
    const avg = this._filled ? sum / this._filled : 0;

    const cooldown = 260; // ms — one hit per drum hit, not per frame
    if (
      this._filled >= 24 &&
      bass > 0.06 &&                  // ignore silence
      bass > avg * 1.26 &&            // clearly above the recent average
      bass > this._prev - 0.015 &&    // rising edge (allows tiny dips)
      nowMs - this._lastBeat > cooldown
    ) {
      const intensity = Math.max(0, Math.min(1.4, ((bass - avg) / (avg + 1e-4)) * 0.9));
      this.pulse = Math.min(1, 0.55 + intensity * 0.55);
      r.hit = true;
      r.intensity = intensity;
      r.pulse = this.pulse;

      const gap = nowMs - this._lastBeat;
      if (this._lastBeat > 0 && gap < 2000) {
        this._iv.push(gap);
        if (this._iv.length > 12) this._iv.shift();
        if (this._iv.length >= 4) this._estimateBpm();
      }
      this._lastBeat = nowMs;
    }

    this._prev = bass;
    h[this._idx] = bass;
    this._idx = (this._idx + 1) % h.length;
    if (this._filled < h.length) this._filled++;

    return r;
  }

  // Tempo estimate with octave-error control:
  // 1) if nearly as many half-period gaps exist as median-period ones, the
  //    detector is skipping beats — trust the shorter period instead;
  // 2) fold the result into BPM_MIN..BPM_MAX, so a half/double-time lock
  //    (e.g. a ~100 BPM track reading as 200) self-corrects.
  _estimateBpm() {
    const iv = this._iv;
    const m = median(iv);
    const near = (x, ref) => Math.abs(x - ref) <= ref * 0.12;
    const half = m / 2;
    let halfCount = 0;
    let medCount = 0;
    for (const d of iv) {
      if (near(d, half)) halfCount++;
      else if (near(d, m)) medCount++;
    }
    const period = halfCount > medCount ? half : m;
    let bpm = 60000 / period;
    while (bpm < BPM_MIN) bpm *= 2;
    while (bpm >= BPM_MAX) bpm /= 2;
    this.bpm = Math.round(bpm);
  }
}
