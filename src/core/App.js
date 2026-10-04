// App — wires everything together: audio sources (file / demo), the render
// pipeline, player UI, settings, shortcuts, drag & drop and error handling.

import { Settings } from "./Settings.js";
import { Renderer } from "./Renderer.js";
import { AudioEngine } from "../audio/AudioEngine.js";
import { BeatDetector } from "../audio/BeatDetector.js";
import { DemoDriver } from "../audio/DemoDriver.js";
import { SpectrumVisualizer } from "../visualizers/SpectrumVisualizer.js";
import { CircleVisualizer } from "../visualizers/CircleVisualizer.js";
import { WaveVisualizer } from "../visualizers/WaveVisualizer.js";
import { ParticleVisualizer } from "../visualizers/ParticleVisualizer.js";
import { PlayerControls } from "../ui/PlayerControls.js";
import { SettingsPanel } from "../ui/SettingsPanel.js";
import { Toast } from "../ui/Toast.js";
import { installShortcuts } from "../ui/Shortcuts.js";

const $ = (id) => document.getElementById(id);

const AUDIO_EXT = /\.(mp3|wav|m4a|m4b|aac|flac|ogg|oga|opus|weba|webm|mp4|aiff?|wma)$/i;
const MODES = ["spectrum", "circle", "wave", "particles"];

// Guard against opening index.html via file:// — ES modules need http(s).
if (location.protocol === "file:") {
  const warn = document.createElement("div");
  warn.className = "protocol-warn";
  warn.innerHTML = `
    <div>
      <p style="margin:0 0 10px;font-size:17px;font-weight:600;color:#e9edf6">Sonic Canvas needs a local server</p>
      <p>Browsers block module scripts on <code>file://</code> pages.<br/>
      Run this from the project folder:</p>
      <p><code>python3 server.py</code></p>
    </div>`;
  document.body.appendChild(warn);
  throw new Error("Sonic Canvas must be served over http(s), not file://");
}

function softShape(v) {
  // gentle knee so loud passages stay lively without hard clipping
  return v <= 0.7 ? v : 0.7 + (v - 0.7) * 0.45;
}

export class App {
  constructor() {
    this.settings = new Settings();
    this.toast = new Toast($("toasts"));

    this.engine = new AudioEngine();
    this.demo = new DemoDriver();
    this.detector = new BeatDetector();
    this.source = this.demo; // welcome backdrop runs the demo in idle mode

    this.renderer = new Renderer($("stage-canvas"), this.settings, {
      onFps: (fps) => this._onFps(fps),
    });
    this.renderer.register("spectrum", new SpectrumVisualizer(this.renderer));
    this.renderer.register("circle", new CircleVisualizer(this.renderer));
    this.renderer.register("wave", new WaveVisualizer(this.renderer));
    this.renderer.register("particles", new ParticleVisualizer(this.renderer));
    this.renderer.onFrame = (dt, t) => this.tick(dt, t);

    this.controls = new PlayerControls({
      onToggle: () => this.togglePlay(),
      onRestart: () => this.restart(),
      onSeek: (t) => this.seek(t),
      onVolume: (v) => this.setVolume(v),
      onMuteToggle: () => this.toggleMute(),
    });

    // Keep the player UI in lockstep with the real <audio> element:
    // play/pause (including OS media keys and natural end), decode errors.
    this.engine.onPlayStateChange = (playing) => {
      if (this.source === this.engine) this.controls.setPlaying(playing);
    };
    this.engine.onEnded = () => {
      if (this.source !== this.engine) return;
      this.controls.setPlaying(false);
    };
    this.engine.onError = (message) => {
      if (this.source !== this.engine) return;
      this.controls.setPlaying(false);
      this.toast.error(message);
    };

    this.settingsPanel = new SettingsPanel(this.settings, {
      onReset: () => this.toast.show("Settings restored to defaults."),
    });
    this.settings.onChange(() => {
      this.engine.applySettings(this.settings);
      this._syncFpsChip();
    });
    this.engine.applySettings(this.settings);

    this._mode = "spectrum";
    this._uiTimer = 0;
    this._lastBpm = 0;
    this._volume = 0.85;
    this._muted = false;
    this._dragDepth = 0;

    this._wireUI();
    this._syncFpsChip();
    this.controls.setVolume(0.85);
    this.renderer.start();
  }

  // ---------------------------------------------------------------- UI

  _wireUI() {
    // Mode switching
    const modeButtons = [...document.querySelectorAll(".mode-btn")];
    const setMode = (name, { announce = true } = {}) => {
      if (!MODES.includes(name)) return;
      this._mode = name;
      this.renderer.setMode(name);
      for (const b of modeButtons) b.classList.toggle("is-active", b.dataset.mode === name);
      if (announce) {
        const hint = $("mode-hint");
        hint.textContent = name.toUpperCase();
        hint.classList.remove("is-shown");
        void hint.offsetWidth; // restart the CSS animation
        hint.classList.add("is-shown");
      }
    };
    this.setMode = setMode;
    modeButtons.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
    setMode("spectrum", { announce: false });

    // Header actions
    $("btn-upload").addEventListener("click", () => $("file-input").click());
    $("btn-choose").addEventListener("click", () => $("file-input").click());
    $("btn-demo").addEventListener("click", () => this.startDemo());
    $("btn-settings").addEventListener("click", () => this.settingsPanel.toggle());
    $("btn-fullscreen").addEventListener("click", () => this.toggleFullscreen());
    $("btn-saveframe").addEventListener("click", () => this.saveFrame());
    document.addEventListener("fullscreenchange", () => {
      document.body.classList.toggle("is-fullscreen", Boolean(document.fullscreenElement));
    });

    // File input
    $("file-input").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = ""; // allow re-selecting the same file
      if (file) this.loadFile(file);
    });

    // Drag & drop anywhere
    window.addEventListener("dragenter", (e) => {
      e.preventDefault();
      this._dragDepth++;
      document.body.classList.add("is-dragover");
    });
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("dragleave", (e) => {
      e.preventDefault();
      this._dragDepth = Math.max(0, this._dragDepth - 1);
      if (this._dragDepth === 0) document.body.classList.remove("is-dragover");
    });
    window.addEventListener("drop", (e) => {
      e.preventDefault();
      this._dragDepth = 0;
      document.body.classList.remove("is-dragover");
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) this.loadFile(file);
    });

    // Keyboard
    installShortcuts({
      onToggle: () => this.togglePlay(),
      onMode: (m) => this.setMode(m),
      onRestart: () => this.restart(),
      onFullscreen: () => this.toggleFullscreen(),
      onMute: () => this.toggleMute(),
    });
  }

  _syncFpsChip() {
    $("fps-chip").hidden = !this.settings.get("showFps");
  }

  _onFps(fps) {
    if (this.settings.get("showFps")) {
      $("fps-chip").textContent = `${fps} FPS`;
    }
  }

  // -------------------------------------------------------------- source

  get isActive() {
    return this.source !== this.demo || this.demo.playing;
  }

  async loadFile(file) {
    if (!this._isAudio(file)) {
      this.toast.error("That doesn't look like an audio file. Try MP3, WAV, M4A or FLAC.");
      return;
    }
    try {
      const duration = await this.engine.load(file);
      if (duration <= 0) {
        this.toast.error("Couldn't read the track length — the file may be corrupted.");
        return;
      }
      this.demo.pause();
      this.source = this.engine;
      this.detector.reset(); // fresh beat history for the new song
      this._afterLoad(file.name, duration, false);
      await this.engine.play();
    } catch (err) {
      this.source = this.source === this.engine ? this.demo : this.source;
      this.toast.error(err && err.message ? err.message : "This file could not be loaded.");
    }
  }

  startDemo() {
    this.demo.activate();
    this.source = this.demo;
    this.detector.reset();
    this._afterLoad("Midnight Circuit", this.demo.duration, true);
    this.toast.show("Demo mode — a generated track, no audio file needed.");
  }

  _afterLoad(name, duration, isDemo) {
    const title = isDemo ? name : name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || name;
    const sub = isDemo
      ? "Generated locally · 122 BPM"
      : "Local file · stays on your device";
    this.controls.setTrack(title, sub, { demo: isDemo });
    this.controls.setTime(0, duration);
    this.controls.setPlaying(true);
    this.controls.setEnabled(true);
    $("welcome").classList.add("is-hidden");
  }

  _isAudio(file) {
    if (file.type && file.type.startsWith("audio/")) return true;
    return AUDIO_EXT.test(file.name);
  }

  // ------------------------------------------------------------ transport

  togglePlay() {
    if (!this.isActive) return;
    if (this.source === this.engine) {
      this.engine.paused ? this.engine.play() : this.engine.pause();
    } else {
      this.demo.playing ? this.demo.pause() : this.demo.play();
      this.controls.setPlaying(this.demo.playing);
    }
  }

  restart() {
    if (!this.isActive) return;
    this.source.restart();
    this.detector.reset();
    if (this.source === this.engine) {
      this.engine.play();
    } else {
      this.demo.play();
      this.controls.setPlaying(true);
    }
  }

  seek(t) {
    if (!this.isActive) return;
    // A big jump lands in a different part of the song — beat history and
    // the tempo estimate from before the jump no longer apply.
    if (Math.abs(t - this.source.currentTime) > 3) this.detector.reset();
    this.source.seek(t);
  }

  setVolume(v) {
    this._volume = v;
    this._muted = v <= 0.001;
    this.engine.setVolume(v);
    this.controls.setMuted(this._muted);
  }

  toggleMute() {
    const next = this._muted ? (this._lastVolume || 0.85) : 0;
    if (!this._muted) this._lastVolume = this._volume;
    this.controls.setVolume(next);
    this.setVolume(next);
  }

  toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen().catch(() => {
        this.toast.error("Fullscreen was blocked by the browser.");
      });
    }
  }

  saveFrame() {
    try {
      $("stage-canvas").toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `sonic-canvas-${Date.now()}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        this.toast.success("Frame saved as PNG.");
      });
    } catch {
      this.toast.error("Couldn't export the canvas.");
    }
  }

  // ----------------------------------------------------------- main loop

  tick(dt, t) {
    const s = this.settings;
    const frame = this.source.getFrame(dt, s);

    // Central sensitivity shaping — one place, both sources.
    const k = s.get("sensitivity");
    frame.bass = Math.min(1, softShape(frame.bass * k));
    frame.mid = Math.min(1, softShape(frame.mid * k));
    frame.treble = Math.min(1, softShape(frame.treble * k));
    frame.overall = Math.min(1, softShape(frame.overall * k));

    const beat = this.detector.update(frame.bass, performance.now(), dt);
    frame.pulse = beat.pulse;
    if (beat.hit) {
      this.controls.flashBeat();
      this.renderer.visualizers.get(this._mode)?.onBeat?.(beat.intensity);
    }

    this.renderer.draw(frame, dt, t);

    // Player UI at ~10 Hz — plenty for time text, cheap for layout.
    this._uiTimer += dt;
    if (this._uiTimer >= 0.1) {
      this._uiTimer = 0;
      if (this.isActive) {
        this.controls.setTime(this.source.currentTime, this.source.duration);
      }
      if (this.detector.bpm !== this._lastBpm) {
        this._lastBpm = this.detector.bpm;
        this.controls.setBpm(this.detector.bpm);
      }
    }
  }
}
