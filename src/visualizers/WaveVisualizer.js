// Wave — layered, mirrored live waveform. Three copies of the same signal at
// different smoothing lag produce trailing echoes; edges fade out via a
// horizontal alpha gradient so the composition feels framed, not cropped.

import { rampRGBA } from "../core/palette.js";

const P = 176;

export class WaveVisualizer {
  constructor(manager) {
    this.m = manager;
    this.s1 = new Float32Array(P);
    this.s2 = new Float32Array(P);
    this.s3 = new Float32Array(P);
    this._gradKey = "";
    this._grads = null;
  }

  resize() {}
  reset() {
    this.s1.fill(0);
    this.s2.fill(0);
    this.s3.fill(0);
  }

  draw(frame, dt, t) {
    const { ctx, w, h } = this.m;
    const { wave, overall, pulse } = frame;
    const intensity = this.m.settings.get("intensity");

    // Sample + per-layer smoothing (each layer lags a bit more than the last).
    const step = Math.max(1, Math.floor(wave.length / P));
    const k1 = Math.min(1, dt * 15);
    const k2 = Math.min(1, dt * 7);
    const k3 = Math.min(1, dt * 3.2);
    for (let i = 0; i < P; i++) {
      const raw = wave[Math.min(wave.length - 1, i * step)];
      this.s1[i] += (raw - this.s1[i]) * k1;
      this.s2[i] += (raw - this.s2[i]) * k2;
      this.s3[i] += (raw - this.s3[i]) * k3;
    }

    const cy = h * 0.5;
    const amp = h * 0.17 * (0.5 + overall * 0.95 + pulse * 0.5) * intensity;
    const tint = (t * 0.015 + 0.22) % 1;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineJoin = "round";

    const buildPath = (arr, yScale) => {
      const path = new Path2D();
      for (let i = 0; i < P; i++) {
        const x = (i / (P - 1)) * w;
        const y = cy + arr[i] * amp * yScale;
        if (i === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      }
      return path;
    };

    const layers = [
      { arr: this.s3, tint: (tint + 0.62) % 1, alpha: 0.3, width: 1.4, scale: 1.55 },
      { arr: this.s2, tint: (tint + 0.3) % 1, alpha: 0.45, width: 1.8, scale: 1.22 },
      { arr: this.s1, tint, alpha: 0.95, width: 2.6, scale: 1.0 },
    ];

    // Edge-fade gradients cached per (quantized tint, size) — no per-frame
    // gradient allocation in steady state.
    const gradKey = `${Math.round(tint * 120)}|${w}x${h}`;
    if (gradKey !== this._gradKey) {
      this._gradKey = gradKey;
      this._grads = layers.map((L) => {
        const g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, rampRGBA(L.tint, 0));
        g.addColorStop(0.12, rampRGBA(L.tint, L.alpha));
        g.addColorStop(0.88, rampRGBA(L.tint, L.alpha));
        g.addColorStop(1, rampRGBA(L.tint, 0));
        return g;
      });
    }

    for (let li = 0; li < layers.length; li++) {
      const L = layers[li];
      const path = buildPath(L.arr, L.scale);
      ctx.strokeStyle = this._grads[li];
      ctx.lineWidth = L.width;
      ctx.stroke(path);
      // Mirror pass.
      ctx.save();
      ctx.translate(0, cy * 2);
      ctx.scale(1, -1);
      ctx.globalAlpha = 0.55;
      ctx.stroke(path);
      ctx.restore();
    }

    // Center hairline, brightening on beats.
    const line = ctx.createLinearGradient(0, 0, w, 0);
    line.addColorStop(0, rampRGBA(tint, 0));
    line.addColorStop(0.5, rampRGBA(tint, 0.14 + pulse * 0.4));
    line.addColorStop(1, rampRGBA(tint, 0));
    ctx.fillStyle = line;
    ctx.fillRect(0, cy - 0.75, w, 1.5);

    ctx.restore();
  }
}
