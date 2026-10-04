// PlayerControls — binds the custom player bar: play/pause, restart, the
// draggable seek bar, time labels, volume, beat lamp and BPM readout.

const $ = (id) => document.getElementById(id);

function fmt(t) {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export class PlayerControls {
  constructor(handlers) {
    this.h = handlers;
    this.el = {
      bar: $("playerbar"),
      play: $("btn-play"),
      restart: $("btn-restart"),
      progress: $("progress"),
      fill: $("progress-fill"),
      thumb: $("progress-thumb"),
      tip: $("progress-tip"),
      cur: $("time-cur"),
      total: $("time-total"),
      title: $("track-title"),
      sub: $("track-sub"),
      badge: $("badge-demo"),
      mute: $("btn-mute"),
      vol: $("vol-range"),
      lamp: $("beat-lamp"),
      bpm: $("bpm-value"),
    };

    this._dragging = false;
    this._lastSeek = 0;
    this._duration = 0;
    this._lampTimer = 0;

    this.el.play.addEventListener("click", () => this.h.onToggle());
    this.el.restart.addEventListener("click", () => this.h.onRestart());
    this.el.mute.addEventListener("click", () => this.h.onMuteToggle());

    this.el.vol.addEventListener("input", () => {
      const v = Number(this.el.vol.value);
      this._paintVolume(v);
      this.h.onVolume(v);
    });

    const p = this.el.progress;
    p.addEventListener("pointerdown", (e) => this._onPointer(e, true));
    p.addEventListener("pointermove", (e) => this._onPointer(e, false));
    p.addEventListener("pointerup", (e) => this._onPointer(e, false, true));
    p.addEventListener("pointercancel", () => this._endDrag());
    p.addEventListener("pointerleave", () => {
      if (!this._dragging) this.el.tip.hidden = true;
    });
  }

  setEnabled(on) {
    this.el.bar.classList.toggle("is-disabled", !on);
  }

  setPlaying(on) {
    this.el.bar.classList.toggle("is-playing", on);
  }

  setTrack(title, sub, { demo = false } = {}) {
    this.el.title.textContent = title;
    this.el.sub.textContent = sub;
    this.el.badge.hidden = !demo;
  }

  setTime(cur, dur) {
    if (dur > 0) {
      this._duration = dur;
      const total = fmt(dur);
      if (this.el.total.textContent !== total) this.el.total.textContent = total;
    }
    if (this._dragging) return;
    const d = this._duration;
    this.el.cur.textContent = fmt(cur);
    if (d > 0) {
      const pct = Math.min(100, (cur / d) * 100);
      this.el.fill.style.width = `${pct}%`;
      this.el.thumb.style.left = `${pct}%`;
      this.el.progress.setAttribute("aria-valuenow", String(Math.round(pct)));
    }
  }

  setVolume(v) {
    this.el.vol.value = String(v);
    this._paintVolume(v);
  }

  _paintVolume(v) {
    this.el.vol.style.setProperty("--fill", `${Math.round(v * 100)}%`);
  }

  setMuted(on) {
    this.el.mute.classList.toggle("is-muted", on);
  }

  setBpm(bpm) {
    this.el.bpm.textContent = bpm > 0 ? `${bpm} BPM` : "— BPM";
  }

  flashBeat() {
    this.el.lamp.classList.add("on");
    clearTimeout(this._lampTimer);
    this._lampTimer = setTimeout(() => this.el.lamp.classList.remove("on"), 130);
  }

  // --- seek bar -------------------------------------------------------

  _posToTime(e) {
    const rect = this.el.progress.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return { ratio, time: ratio * this._duration };
  }

  _paintScrub(ratio, time) {
    const pct = ratio * 100;
    this.el.fill.style.width = `${pct}%`;
    this.el.thumb.style.left = `${pct}%`;
    this.el.cur.textContent = fmt(time);
  }

  _onPointer(e, start, end = false) {
    const { ratio, time } = this._posToTime(e);
    if (start) {
      this._dragging = true;
      this.el.progress.classList.add("is-scrubbing");
      this.el.progress.setPointerCapture(e.pointerId);
      this.el.tip.hidden = false;
    } else if (!this._dragging) {
      // hover preview only
      this.el.tip.hidden = false;
      this.el.tip.style.left = `${ratio * 100}%`;
      this.el.tip.textContent = fmt(time);
      return;
    }

    this._paintScrub(ratio, time);
    this.el.tip.style.left = `${ratio * 100}%`;
    this.el.tip.textContent = fmt(time);
    const now = performance.now();
    if (!end && now - this._lastSeek < 90) return; // throttle live seeks
    this._lastSeek = now;
    this.h.onSeek(time);

    if (end) this._endDrag();
  }

  _endDrag() {
    this._dragging = false;
    this.el.progress.classList.remove("is-scrubbing");
    this.el.tip.hidden = true;
  }
}
