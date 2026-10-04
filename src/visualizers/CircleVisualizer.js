// Circle — a breathing core with a radial spectrum, an inner waveform ring,
// treble detail ticks and expanding rings on every detected beat.

import { buildLogMap, barValue } from "./spectrumMap.js";
import { rampRGBA } from "../core/palette.js";

const HALF = 80;   // bars per side (mirrored → 160 radial points)
const RINGS = 6;   // pooled beat rings

export class CircleVisualizer {
  constructor(manager) {
    this.m = manager;
    this._key = "";
    this.map = null;
    this.cur = new Float32Array(HALF);
    this.rot = 0;
    this.rings = [];
    this._tickSeeds = new Float32Array(48);
    for (let i = 0; i < 48; i++) this._tickSeeds[i] = Math.random();
    for (let i = 0; i < RINGS; i++) this.rings.push({ r: 0, a: 0, i: 0 });
    this._ringIdx = 0;
  }

  resize() { this._key = ""; }

  reset() {
    this.cur.fill(0);
    for (const r of this.rings) r.a = 0;
  }

  onBeat(intensity) {
    const ring = this.rings[this._ringIdx++ % RINGS];
    ring.a = 0.9;
    ring.i = intensity;
    ring.r = this._lastBaseR ? this._lastBaseR + 2 : 60;
  }

  draw(frame, dt, t) {
    const { ctx, w, h } = this.m;
    const { freq, binCount, hzPerBin, bass, treble, overall, pulse, wave } = frame;
    const intensity = this.m.settings.get("intensity");

    const cx = w / 2;
    const cy = h * 0.5;
    const minDim = Math.min(w, h);
    const baseR = minDim * 0.155 * (1 + bass * 0.32 + pulse * 0.10);
    this._lastBaseR = baseR;
    this.rot += dt * (0.10 + overall * 0.5);

    const key = `${binCount}|${hzPerBin.toFixed(2)}`;
    if (key !== this._key) {
      this._key = key;
      this.map = buildLogMap(HALF, binCount, hzPerBin);
    }

    const attack = 1 - Math.exp(-dt * 30);
    const release = 1 - Math.exp(-dt * 8);
    for (let i = 0; i < HALF; i++) {
      const v0 = barValue(freq, this.map.starts[i], this.map.ends[i]);
      const boost = 0.72 + 0.42 * Math.pow(i / HALF, 1.35);
      const shaped = Math.pow(Math.min(1, v0 * 1.35), 0.88);
      const target = Math.min(1, shaped * boost * (0.5 + overall * 1.1) * intensity);
      const c = this.cur[i];
      this.cur[i] = c + (target - c) * (target > c ? attack : release);
    }

    const tint = (t * 0.015 + 0.4) % 1;
    const M = HALF * 2;

    ctx.save();

    // Expanding beat rings (behind everything).
    ctx.globalCompositeOperation = "lighter";
    for (const ring of this.rings) {
      if (ring.a <= 0) continue;
      ring.r += dt * minDim * 0.5 * (1 + ring.i * 0.4);
      ring.a -= dt * 1.5;
      if (ring.a <= 0) continue;
      ctx.beginPath();
      ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
      ctx.strokeStyle = rampRGBA(tint, ring.a * 0.45);
      ctx.lineWidth = 1 + ring.a * 1.6;
      ctx.stroke();
    }

    // Radial spectrum bars — mirrored for symmetry, batched into 5 color passes.
    const r0 = baseR + 4;
    const paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    for (let j = 0; j < M; j++) {
      const k = j < HALF ? j : M - 1 - j;
      const val = this.cur[k];
      const ang = -Math.PI / 2 + (j / M) * Math.PI * 2 + this.rot * 0.35;
      const len = 5 + val * minDim * 0.17 * (0.75 + 0.65 * intensity);
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const p = paths[Math.min(4, Math.floor(val * 5))];
      p.moveTo(cx + ca * r0, cy + sa * r0);
      p.lineTo(cx + ca * (r0 + len), cy + sa * (r0 + len));
    }
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    for (let b = 0; b < 5; b++) {
      ctx.strokeStyle = rampRGBA((tint + b * 0.07) % 1, 0.42 + b * 0.11);
      ctx.stroke(paths[b]);
    }

    // Treble detail ticks outside the bars.
    const tickR = baseR + minDim * 0.185;
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = rampRGBA((tint + 0.55) % 1, 0.22 + treble * 0.4);
    ctx.beginPath();
    for (let i = 0; i < 48; i++) {
      const ang = (i / 48) * Math.PI * 2 - this.rot * 0.6;
      const n = 0.5 + 0.5 * Math.sin(t * 2.6 + this._tickSeeds[i] * 6.28);
      const len = (1.5 + treble * 10 * n) * intensity;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      ctx.moveTo(cx + ca * tickR, cy + sa * tickR);
      ctx.lineTo(cx + ca * (tickR + len), cy + sa * (tickR + len));
    }
    ctx.stroke();

    // Inner disc.
    const disc = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR);
    disc.addColorStop(0, rampRGBA(tint, 0.05 + overall * 0.10));
    disc.addColorStop(0.78, rampRGBA(tint, 0.03));
    disc.addColorStop(1, rampRGBA(tint, 0.16 + bass * 0.14));
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
    ctx.fill();

    // Waveform ring inside the disc.
    ctx.beginPath();
    const pts = 96;
    const step = wave.length / pts;
    for (let p = 0; p <= pts; p++) {
      const idx = Math.floor((p % pts) * step);
      const ang = -Math.PI / 2 + (p / pts) * Math.PI * 2 - this.rot * 0.5;
      const r = baseR * 0.72 + wave[idx] * baseR * 0.38;
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      if (p === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = rampRGBA((tint + 0.5) % 1, 0.45 + overall * 0.3);
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Rim + beat pop ring.
    ctx.shadowColor = rampRGBA(tint, 0.9);
    ctx.shadowBlur = 10 + pulse * 16;
    ctx.strokeStyle = rampRGBA(tint, 0.5 + pulse * 0.45);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR + 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.restore();
  }
}
