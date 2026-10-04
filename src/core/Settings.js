// Settings store with localStorage persistence.
// Values are read live by the render pipeline; changes apply instantly.

const KEY = "sonic-canvas.settings.v1";

export const DEFAULT_SETTINGS = Object.freeze({
  sensitivity: 1.0,   // multiplies analysed band energies
  smoothing: 0.6,     // 0..1, mapped onto analyser + demo smoothing
  particles: 240,     // active particle count
  intensity: 1.0,     // global visual gain
  showFps: false,
});

const RANGES = {
  sensitivity: [0.4, 2],
  smoothing: [0, 1],
  particles: [80, 480],
  intensity: [0.5, 1.6],
};

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export class Settings {
  constructor() {
    this.values = { ...DEFAULT_SETTINGS };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        for (const k of Object.keys(DEFAULT_SETTINGS)) {
          if (k in saved && typeof saved[k] === typeof DEFAULT_SETTINGS[k]) {
            this.values[k] = saved[k];
          }
        }
      }
    } catch {
      // storage unavailable (private mode etc.) — defaults are fine
    }
    for (const [k, [lo, hi]] of Object.entries(RANGES)) {
      this.values[k] = clamp(Number(this.values[k]) || DEFAULT_SETTINGS[k], lo, hi);
    }
    this.values.showFps = Boolean(this.values.showFps);
    this.listeners = new Set();
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    if (this.values[key] === value) return;
    const [lo, hi] = RANGES[key] || [-Infinity, Infinity];
    this.values[key] = clamp(value, lo, hi);
    this._persist();
    this._emit(key);
  }

  reset() {
    this.values = { ...DEFAULT_SETTINGS };
    this._persist();
    // null key = full refresh, so UI can re-sync every control
    this._emit(null);
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.values));
    } catch {
      /* non-fatal */
    }
  }

  _emit(key) {
    for (const fn of this.listeners) fn(key, this.values);
  }
}
