// Shared color system. A single tri-color ramp drives every visualizer so the
// app stays cohesive; lookups are pre-quantized to avoid per-frame string churn.

const STOPS = [
  [34, 211, 238],   // cyan
  [129, 140, 248],  // indigo
  [232, 121, 249],  // fuchsia
];

const N = 49;
const RAMP = [];
const RAMP_RGB = [];

(function buildRamp() {
  for (let i = 0; i < N; i++) {
    const t = (i / (N - 1)) * (STOPS.length - 1);
    const s = Math.min(STOPS.length - 2, Math.floor(t));
    const f = t - s;
    const a = STOPS[s];
    const b = STOPS[s + 1];
    const r = Math.round(a[0] + (b[0] - a[0]) * f);
    const g = Math.round(a[1] + (b[1] - a[1]) * f);
    const bl = Math.round(a[2] + (b[2] - a[2]) * f);
    RAMP_RGB.push([r, g, bl]);
    RAMP.push(`rgb(${r},${g},${bl})`);
  }
})();

function quantize(t) {
  const x = Number.isFinite(t) ? t : 0;
  return Math.max(0, Math.min(N - 1, Math.round(x * (N - 1))));
}

export function rampColor(t) {
  return RAMP[quantize(t)];
}

export function rampRGB(t) {
  return RAMP_RGB[quantize(t)];
}

export function rampRGBA(t, a) {
  const [r, g, b] = RAMP_RGB[quantize(t)];
  return `rgba(${r},${g},${b},${a})`;
}

// Allocation-free variant for hot per-particle paths: color strings are
// quantized and cached, so steady state creates zero new strings per frame.
const _rgbaCache = new Map();
export function rampRGBAq(t, a) {
  const ti = quantize(t);
  const ai = Math.max(0, Math.min(24, Math.round(a * 24)));
  const key = ti * 25 + ai;
  let s = _rgbaCache.get(key);
  if (s === undefined) {
    const [r, g, b] = RAMP_RGB[ti];
    s = `rgba(${r},${g},${b},${(ai / 24).toFixed(3)})`;
    _rgbaCache.set(key, s);
  }
  return s;
}

// Per-mode offset into the ramp, so each mode leans toward its own slice of
// the same palette without introducing new colors.
export const MODE_TINT = {
  spectrum: 0.06,
  circle: 0.40,
  wave: 0.22,
  particles: 0.76,
};

export const BG = {
  top: "#04060b",
  bottom: "#0a101d",
  vignette: "rgba(2,3,7,0.62)",
};
