// Toast — small transient notifications for errors and confirmations.

export class Toast {
  constructor(container) {
    this.container = container;
  }

  show(message, type = "info", ms = 3800) {
    while (this.container.children.length >= 3) {
      this.container.firstChild.remove();
    }
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = message;
    this.container.appendChild(el);
    setTimeout(() => {
      el.classList.add("is-leaving");
      el.addEventListener("animationend", () => el.remove(), { once: true });
    }, ms);
  }

  error(msg) { this.show(msg, "error", 5200); }
  success(msg) { this.show(msg, "success"); }
}
