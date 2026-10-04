// SettingsPanel — binds the settings UI to the Settings store.
// Every change applies live; Reset restores defaults and re-syncs the form.

const $ = (id) => document.getElementById(id);

const SLIDERS = [
  { key: "sensitivity", rng: "rng-sensitivity", out: "out-sensitivity", fmt: (v) => v.toFixed(2) },
  { key: "smoothing", rng: "rng-smoothing", out: "out-smoothing", fmt: (v) => v.toFixed(2) },
  { key: "particles", rng: "rng-particles", out: "out-particles", fmt: (v) => String(Math.round(v)) },
  { key: "intensity", rng: "rng-intensity", out: "out-intensity", fmt: (v) => v.toFixed(2) },
];

export class SettingsPanel {
  constructor(settings, { onReset }) {
    this.s = settings;
    this.panel = $("settings-panel");
    this.fpsToggle = $("tgl-fps");

    this._bindings = SLIDERS.map(({ key, rng, out, fmt }) => {
      const input = $(rng);
      const output = $(out);
      input.addEventListener("input", () => {
        const v = Number(input.value);
        output.textContent = fmt(v);
        this._paint(input);
        this.s.set(key, v);
      });
      return { key, input, output, fmt };
    });

    this.fpsToggle.addEventListener("change", () => {
      this.s.set("showFps", this.fpsToggle.checked);
    });

    $("btn-reset-settings").addEventListener("click", () => {
      this.s.reset();
      onReset?.();
    });

    $("btn-close-settings").addEventListener("click", () => this.close());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isOpen) this.close();
    });

    // External changes (e.g. Reset) re-sync every control.
    settings.onChange((key) => {
      if (key === null) this.refresh();
    });
    this.refresh();
  }

  get isOpen() {
    return this.panel.classList.contains("is-open");
  }

  open() {
    this.panel.classList.add("is-open");
    this.panel.setAttribute("aria-hidden", "false");
  }

  close() {
    this.panel.classList.remove("is-open");
    this.panel.setAttribute("aria-hidden", "true");
  }

  toggle() {
    this.isOpen ? this.close() : this.open();
  }

  refresh() {
    for (const { key, input, output, fmt } of this._bindings) {
      const v = this.s.get(key);
      input.value = String(v);
      output.textContent = fmt(v);
      this._paint(input);
    }
    this.fpsToggle.checked = this.s.get("showFps");
  }

  _paint(input) {
    const min = Number(input.min);
    const max = Number(input.max);
    const v = Number(input.value);
    const pct = ((v - min) / (max - min)) * 100;
    input.style.setProperty("--fill", `${pct}%`);
  }
}
