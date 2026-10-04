// Keyboard shortcuts. Ignored while typing in inputs or with modifier keys,
// so browser and OS combos keep working.

export function installShortcuts(handlers) {
  window.addEventListener("keydown", (e) => {
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    switch (e.key) {
      case " ":
        e.preventDefault();
        if (!e.repeat) handlers.onToggle();
        break;
      case "1": handlers.onMode("spectrum"); break;
      case "2": handlers.onMode("circle"); break;
      case "3": handlers.onMode("wave"); break;
      case "4": handlers.onMode("particles"); break;
      case "r":
      case "R":
        handlers.onRestart();
        break;
      case "f":
      case "F":
        handlers.onFullscreen();
        break;
      case "m":
      case "M":
        handlers.onMute();
        break;
    }
  });
}
