// Canvas owner: DPR handling, resize, RAF loop, background layer, FPS meter.

import { BG, MODE_TINT, rampRGBA } from "./palette.js";

const MAX_DPR = 2;

export class Renderer {
  constructor(canvas, settings, { onFps } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.settings = settings;
    this.onFps = onFps;
    this.onFrame = null;

    this.w = 1;
    this.h = 1;
    this.dpr = 1;
    this.mode = "spectrum";
    this.visualizers = new Map();

    this._last = 0;
    this._raf = 0;
    this._fps = 60;
    this._fpsTimer = 0;
    this._bgGrad = null;
    this._vignette = null;

    this._onResize = () => this.resize();
    window.addEventListener("resize", this._onResize);
    if (typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(canvas.parentElement);
    }
    this.resize();
  }

  register(name, vis) {
    this.visualizers.set(name, vis);
    vis.resize?.();
  }

  setMode(name) {
    if (name === this.mode) return;
    this.mode = name;
    this.visualizers.get(name)?.reset?.();
  }

  resize() {
    const host = this.canvas.parentElement;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    if (w === this.w && h === this.h && dpr === this.dpr) return;

    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    // Cached gradients — rebuilt only on resize.
    this._bgGrad = this.ctx.createLinearGradient(0, 0, 0, h);
    this._bgGrad.addColorStop(0, BG.top);
    this._bgGrad.addColorStop(1, BG.bottom);

    this._vignette = this.ctx.createRadialGradient(
      w / 2, h * 0.46, Math.min(w, h) * 0.36,
      w / 2, h * 0.5, Math.hypot(w, h) * 0.62
    );
    this._vignette.addColorStop(0, "rgba(2,3,7,0)");
    this._vignette.addColorStop(1, BG.vignette);

    for (const vis of this.visualizers.values()) vis.resize?.();
  }

  start() {
    this._last = performance.now();
    const loop = (now) => {
      this._raf = requestAnimationFrame(loop);
      this._tick(now);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this._raf);
  }

  _tick(now) {
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (!(dt > 0) || dt > 0.25) dt = 0.016; // hidden tab or clock hiccup

    this._fps += (1 / dt - this._fps) * 0.08;
    this._fpsTimer += dt;
    if (this._fpsTimer >= 0.25) {
      this._fpsTimer = 0;
      this.onFps?.(Math.round(this._fps));
    }

    this.onFrame?.(Math.min(dt, 0.05), now / 1000);
  }

  draw(frame, dt, t) {
    const { ctx, w, h, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._drawBackground(frame, t);

    const vis = this.visualizers.get(this.mode);
    if (vis) vis.draw(frame, dt, t);

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = this._vignette;
    ctx.fillRect(0, 0, w, h);
  }

  _drawBackground(frame, t) {
    const { ctx, w, h } = this;
    ctx.fillStyle = this._bgGrad;
    ctx.fillRect(0, 0, w, h);
    if (!frame) return;

    // Music-reactive ambient glow: brightness follows overall energy,
    // and beats add a soft pulse. Kept deliberately subtle — the
    // visualizer itself must stay the focus.
    const energy = frame.overall || 0;
    const pulse = frame.pulse || 0;
    const glow = (0.045 + energy * 0.11 + pulse * 0.13) * this.settings.get("intensity");
    if (glow <= 0.012) return;

    const tint = (t * 0.012 + (MODE_TINT[this.mode] ?? 0.3)) % 1;
    const r = Math.max(w, h) * (0.40 + 0.22 * energy);
    const g = ctx.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, r);
    g.addColorStop(0, rampRGBA(tint, Math.min(0.32, glow)));
    g.addColorStop(1, rampRGBA(tint, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}
