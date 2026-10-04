// Particles — energy-driven particle field.
//
// All particles are pre-allocated once (zero per-frame allocation). Motion is
// continuous: a slow flow field keeps the cloud alive at silence, music energy
// scales speed/size/emission, and a detected beat applies a one-off radial
// impulse from the center — an explosion feel without per-frame randomness.

const MAX = 480;

import { rampRGBAq } from "../core/palette.js";

function rgba(t, a) {
  return rampRGBAq(t, Math.min(1, a));
}

export class ParticleVisualizer {
  constructor(manager) {
    this.m = manager;
    this.pool = new Array(MAX);
    for (let i = 0; i < MAX; i++) {
      this.pool[i] = {
        x: 0, y: 0, vx: 0, vy: 0, px: 0, py: 0,
        size: 1, hue: 0, life: 0, ttl: 1, seed: 0, alive: false,
      };
    }
    this._burst = 0;
    this.reset();
  }

  reset() {
    for (const p of this.pool) {
      this._spawnAmbient(p);
    }
    this._burst = 0;
  }

  onBeat(intensity) {
    const { w, h } = this.m;
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.hypot(w, h) / 2;
    const kick = 130 + 200 * Math.min(1.2, intensity);
    for (const p of this.pool) {
      if (!p.alive) continue;
      const dx = p.x - cx;
      const dy = p.y - cy;
      const d = Math.hypot(dx, dy) + 1;
      const falloff = Math.exp(-d / (R * 0.38)) + 0.12;
      const jitter = 0.82 + p.seed * 0.36;
      p.vx += (dx / d) * kick * falloff * jitter;
      p.vy += (dy / d) * kick * falloff * jitter;
    }
    this._burst = Math.min(2.5, this._burst + 0.8 + intensity);
  }

  draw(frame, dt, t) {
    const { ctx, w, h } = this.m;
    const { bass, mid, overall, pulse } = frame;
    const s = this.m.settings;
    const count = Math.min(MAX, Math.round(s.get("particles")));
    const intensity = s.get("intensity");

    const cx = w / 2;
    const cy = h / 2;
    const R = Math.hypot(w, h) / 2;
    const tint = (t * 0.01 + 0.76) % 1;

    const speedMul = (0.55 + overall * 1.7 + bass * 1.1) * intensity;
    const flow = 13 * (0.55 + mid * 1.3) * intensity;
    const damp = Math.exp(-dt * (1.15 + 0.7 * overall));
    const emit = (6 + overall * 34 + pulse * 26 + this._burst * 90) * intensity;
    this._burst *= Math.exp(-dt * 3.2);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";

    let toSpawn = emit * dt + this._burst * 4 * dt;

    for (let i = 0; i < count; i++) {
      const p = this.pool[i];
      if (!p.alive) {
        if (toSpawn >= 1) { this._spawnCenter(p, cx, cy, overall); toSpawn -= 1; }
        else { this._spawnAmbient(p, w, h); }
      }

      p.px = p.x;
      p.py = p.y;

      // Slow flow field — coherent drift, not per-frame noise.
      p.vx += Math.sin(p.y * 0.0042 + t * 0.5 + p.seed) * flow * dt;
      p.vy += Math.cos(p.x * 0.0038 - t * 0.43 + p.seed * 1.7) * flow * dt;

      // Soft spring keeps the cloud inside the frame.
      const dx = p.x - cx;
      const dy = p.y - cy;
      const d = Math.hypot(dx, dy);
      if (d > R * 0.58) {
        const pull = (d - R * 0.58) * 1.35 * dt;
        p.vx -= (dx / d) * pull;
        p.vy -= (dy / d) * pull;
      }

      p.vx *= damp;
      p.vy *= damp;
      p.x += p.vx * dt * speedMul;
      p.y += p.vy * dt * speedMul;

      // Wrap the edges so particles never pile up outside.
      if (p.x < -24) p.x = w + 24; else if (p.x > w + 24) p.x = -24;
      if (p.y < -24) p.y = h + 24; else if (p.y > h + 24) p.y = -24;

      p.life -= dt;
      if (p.life <= 0) {
        if (toSpawn >= 1 && overall > 0.1) { this._spawnCenter(p, cx, cy, overall); toSpawn -= 1; }
        else { this._spawnAmbient(p, w, h); }
        p.px = p.x;
        p.py = p.y;
      }

      const speed = Math.hypot(p.vx, p.vy) * speedMul;
      const sz = p.size * (1 + bass * 0.85) * intensity;
      const lifeK = Math.min(1, p.life / Math.min(0.5, p.ttl));
      const alpha = lifeK * (0.18 + Math.min(1, speed / 260) * 0.5 + overall * 0.22);
      if (alpha < 0.02) continue;

      ctx.strokeStyle = rgba(p.hue, alpha);
      ctx.lineWidth = sz;
      ctx.beginPath();
      ctx.moveTo(p.px, p.py);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

      if (sz > 2.1) {
        ctx.fillStyle = rgba(p.hue, alpha * 0.85);
        ctx.beginPath();
        ctx.arc(p.x, p.y, sz * 0.62, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  _spawnAmbient(p, w = this.m.w, h = this.m.h) {
    p.x = Math.random() * w;
    p.y = Math.random() * h;
    p.vx = (Math.random() - 0.5) * 26;
    p.vy = (Math.random() - 0.5) * 26;
    p.size = 0.9 + Math.random() * 1.8;
    p.hue = Math.random();
    p.ttl = 3.5 + Math.random() * 4;
    p.life = p.ttl;
    p.seed = Math.random() * 6.28;
    p.alive = true;
  }

  _spawnCenter(p, cx, cy, overall) {
    const ang = Math.random() * Math.PI * 2;
    const rad = 4 + Math.random() * 16;
    p.x = cx + Math.cos(ang) * rad;
    p.y = cy + Math.sin(ang) * rad;
    const sp = 36 + Math.random() * (90 + overall * 300);
    p.vx = Math.cos(ang) * sp;
    p.vy = Math.sin(ang) * sp;
    p.size = 1.2 + Math.random() * 2.4;
    p.hue = Math.random();
    p.ttl = 2 + Math.random() * 2.6;
    p.life = p.ttl;
    p.seed = Math.random() * 6.28;
    p.alive = true;
  }
}
