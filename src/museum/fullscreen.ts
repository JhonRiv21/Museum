// Fullscreen toggle for the top-right HUD button. The button follows the
// browser's own fullscreen state, so leaving with Esc (or the OS gesture)
// updates it too instead of leaving the icon out of step.

type WebkitDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
};
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

const doc = document as WebkitDocument;

const isActive = () => Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);

export function bindFullscreen(button: HTMLButtonElement) {
  // iPhone Safari only allows fullscreen for <video>; hide the control rather
  // than offer one that does nothing.
  if (!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled)) {
    button.hidden = true;
    return;
  }

  const sync = () => {
    const on = isActive();
    button.setAttribute("aria-pressed", String(on));
    button.setAttribute("aria-label", on ? "Salir de pantalla completa" : "Pantalla completa");
    button.dataset.state = on ? "on" : "off";
  };

  button.addEventListener("click", async () => {
    try {
      if (isActive()) {
        await (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
      } else {
        const root = document.documentElement as WebkitElement;
        await (root.requestFullscreen?.() ?? root.webkitRequestFullscreen?.());
      }
    } catch (error) {
      // Refused (e.g. an iframe without allowfullscreen): keep the state honest.
      console.warn("Pantalla completa no disponible:", error);
    }
    sync();
  });

  document.addEventListener("fullscreenchange", sync);
  document.addEventListener("webkitfullscreenchange", sync);
  sync();
}
