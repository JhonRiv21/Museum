// Interface language. The choice is kept in localStorage; without one the
// browser language decides. Everything that shows text subscribes to changes,
// so switching mid-tour updates labels, signs and plates in place.

export type Lang = "es" | "en";
export type Localized<T> = Record<Lang, T>;

const STORAGE_KEY = "museum.lang";

const UI = {
  es: {
    title: "Museo virtual · Recorrido 3D por piezas reales",
    brand: "Museo",
    lobby: "Vestíbulo",
    hint: "Desplázate para recorrer · clic en una pieza para acercarte",
    langLabel: "Idioma",
    fullscreenOn: "Pantalla completa",
    fullscreenOff: "Salir de pantalla completa",
    showFacts: "Ver ficha",
    hideFacts: "Ocultar ficha",
    back: "← Volver",
    backLong: " al recorrido",
    navLabel: "Controles de navegación",
    forward: "Avanzar por el recorrido",
    backward: "Retroceder por el recorrido",
    zoomIn: "Acercar",
    zoomOut: "Alejar",
    authorship: "Autoría",
    developedBy: "Desarrollado por",
    portfolio: "Portafolio",
  },
  en: {
    title: "Virtual museum · A 3D tour of real pieces",
    brand: "Museum",
    lobby: "Lobby",
    hint: "Scroll to walk · click a piece to take a closer look",
    langLabel: "Language",
    fullscreenOn: "Full screen",
    fullscreenOff: "Exit full screen",
    showFacts: "Show label",
    hideFacts: "Hide label",
    back: "← Back",
    backLong: " to the tour",
    navLabel: "Navigation controls",
    forward: "Move forward",
    backward: "Move back",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    authorship: "Authorship",
    developedBy: "Developed by",
    portfolio: "Portfolio",
  },
} satisfies Localized<Record<string, string>>;

export type UIKey = keyof typeof UI.es;

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "es" || saved === "en") return saved;
  } catch {
    // Storage blocked (private mode, disabled site data): fall through.
  }
  return navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
}

let current: Lang = initialLang();
const listeners = new Set<(lang: Lang) => void>();

export const lang = () => current;
export const t = (key: UIKey) => UI[current][key];

export function onLangChange(listener: (lang: Lang) => void) {
  listeners.add(listener);
}

export function setLang(next: Lang) {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Not persisted, but the switch still applies for this visit.
  }
  applyStatic();
  for (const listener of listeners) listener(next);
}

// Static markup: data-i18n sets the text, data-i18n-aria the aria-label.
function applyStatic() {
  document.documentElement.lang = current;
  document.title = t("title");
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n as UIKey);
  }
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n-aria]")) {
    el.setAttribute("aria-label", t(el.dataset.i18nAria as UIKey));
  }
  for (const button of document.querySelectorAll<HTMLElement>("[data-lang]")) {
    button.setAttribute("aria-pressed", String(button.dataset.lang === current));
  }
}

export function bindLangSelector(group: HTMLElement) {
  group.addEventListener("click", (e) => {
    const button = (e.target as HTMLElement).closest<HTMLElement>("[data-lang]");
    if (button) setLang(button.dataset.lang as Lang);
  });
  applyStatic();
}
