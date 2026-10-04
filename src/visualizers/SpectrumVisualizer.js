// Spectrum — classic bar spectrum, log-spaced, with mirrored reflection,
// falling peak caps and a beat-reactive baseline.

import { buildLogMap, barValue } from "./spectrumMap.js";
import { rampRGBA } from "../core/palette.js";

export class SpectrumVisualizer {
  constructor(manager) {
    this.m = manager;
    this._key = "";
    this._gradKey = "";
    this._barGrad = null;
    this._reflGrad = null;
    this.map = null;
    this.cur = null;
    this.peaks = null;
    this.count = 0;
  }

  resize() {
    this._key = ""; // force remap on any size change
  }

  reset() {
    if (this.cur) this.cur.fill(0);
    if (this.peaks) this.peaks.fill(0);
  }

  draw(frame, dt, t) {
    const { ctx, w, h } = this.m;
    const { freq, binCount, hzPerBin, overall, pulse } = frame;
    const intensity = this.m.settings.get("intensity");

    const count = Math.max(48, Math.min(112, Math.floor(w / 11)));
    const key = `${count}|${binCount}|${hzPerBin.toFixed(2)}`;
    if (key !== this._key) {
      this._key = key;
      this.count = count;
      this.map = buildLogMap(count, binCount, hzPerBin);
      this.cur = new Float32Array(count);
      this.peaks = new Float32Array(count);
    }

    const baseY = h * 0.68;
    const maxH = h * 0.5;
    const slot = w / count;
    const barW = Math.max(2, slot - Math.min(3.5, slot * 0.24));
    const attack = 1 - Math.exp(-dt * 34);
    const release = 1 - Math.exp(-dt * 8.5);
    const roundRect = typeof ctx.roundRect === "function";

    // Update bar heights: fast attack, slow musical release — no jitter.
    for (let i = 0; i < count; i++) {
      const v0 = barValue(freq, this.map.starts[i], this.map.ends[i]);
      // Gentle, near-flat compensation — enough to keep quiet highs visible
      // without masking the natural spectral tilt.
      const boost = 0.72 + 0.42 * Math.pow(i / count, 1.35);
      const shaped = Math.pow(Math.min(1, v0 * 1.35), 0.88);
      const target = Math.min(1, shaped * boost * (0.5 + overall * 1.1) * intensity);
      const c = this.cur[i];
      this.cur[i] = c + (target - c) * (target > c ? attack : release);
      const p = this.peaks[i];
      this.peaks[i] = this.cur[i] > p
        ? this.cur[i]
        : Math.max(0, p - dt * (0.09 + p * 0.42));
    }

    const tint = (t * 0.02 + 0.06) % 1;

    // Cached gradients — rebuilt only when width or the (slowly drifting)
    // quantized tint changes, never per frame.
    const gradKey = `${Math.round(tint * 120)}|${w}x${h}`;
    if (gradKey !== this._gradKey) {
      this._gradKey = gradKey;
      const barGrad = ctx.createLinearGradient(0, 0, w, 0);
      barGrad.addColorStop(0, rampRGBA(tint, 0.95));
      barGrad.addColorStop(0.55, rampRGBA((tint + 0.33) % 1, 0.95));
      barGrad.addColorStop(1, rampRGBA((tint + 0.66) % 1, 0.95));
      this._barGrad = barGrad;

      const reflGrad = ctx.createLinearGradient(0, baseY, 0, baseY + maxH * 0.34);
      reflGrad.addColorStop(0, rampRGBA((tint + 0.3) % 1, 0.2));
      reflGrad.addColorStop(1, rampRGBA((tint + 0.3) % 1, 0));
      this._reflGrad = reflGrad;
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // Reflections first so bars paint over them.
    ctx.fillStyle = this._reflGrad;
    for (let i = 0; i < count; i++) {
      const ch = this.cur[i] * maxH;
      if (ch < 1) continue;
      ctx.fillRect(i * slot + (slot - barW) / 2, baseY + 4, barW, ch * 0.32);
    }

    // Main bars.
    ctx.fillStyle = this._barGrad;
    for (let i = 0; i < count; i++) {
      const ch = this.cur[i] * maxH;
      if (ch < 0.5) continue;
      const x = i * slot + (slot - barW) / 2;
      const y = baseY - ch;
      if (roundRect) {
        ctx.beginPath();
        ctx.roundRect(x, y, barW, ch + 2, [Math.min(3, barW / 2), Math.min(3, barW / 2), 0, 0]);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, barW, ch + 2);
      }
    }

    // Peak caps with a soft glow.
    ctx.shadowColor = rampRGBA((tint + 0.4) % 1, 0.9);
    ctx.shadowBlur = 12;
    ctx.globalAlpha = 0.85;
    for (let i = 0; i < count; i++) {
      const pk = this.peaks[i];
      if (pk < 0.01) continue;
      ctx.fillStyle = "rgba(244,248,255,0.9)";
      ctx.fillRect(i * slot + (slot - barW) / 2, baseY - pk * maxH - 4, barW, 2);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // Baseline, flashing gently on beats.
    ctx.fillStyle = rampRGBA((tint + 0.2) % 1, 0.22 + pulse * 0.5);
    ctx.fillRect(0, baseY, w, 1.5);
    ctx.restore();
  }
}
