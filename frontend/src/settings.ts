// Paramètres de l'interface, enregistrés dans ce navigateur (localStorage).
// Aucune donnée personnelle : seulement des préférences d'affichage et de calcul.
import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";
export type Accent = "blue" | "violet" | "teal" | "orange";
export type FontSize = "small" | "normal" | "large";

export type Settings = {
  theme: Theme;
  accent: Accent;
  fontSize: FontSize;
  startPage: string;
  pricePerKwh: number | null; // null = tarif par défaut du serveur
  alertMinDuration: number;
  forecastHorizon: number;
  showSuggestions: boolean;
};

export const PAGES = [
  "Overview", "Energy Analytics", "Alertes & Gaspillage", "Prévisions", "AI Energy Agent", "Simulation", "Settings",
];

export const DEFAULT_SETTINGS: Settings = {
  theme: "light",
  accent: "blue",
  fontSize: "normal",
  startPage: "Overview",
  pricePerKwh: null,
  alertMinDuration: 60,
  forecastHorizon: 30,
  showSuggestions: true,
};

const KEY = "ensa-energyos-settings";
const listeners = new Set<() => void>();

const pick = <T,>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/** Relit et VALIDE ce qui est stocké : une valeur corrompue ou modifiée à la main redevient la valeur par défaut. */
function load(): Settings {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {};
  } catch { /* stockage indisponible (navigation privée...) : valeurs par défaut */ }
  const d = DEFAULT_SETTINGS;
  const price = typeof raw.pricePerKwh === "number" && raw.pricePerKwh >= 0.1 && raw.pricePerKwh <= 10 ? raw.pricePerKwh : null;
  return {
    theme: pick(raw.theme, ["light", "dark", "system"] as const, d.theme),
    accent: pick(raw.accent, ["blue", "violet", "teal", "orange"] as const, d.accent),
    fontSize: pick(raw.fontSize, ["small", "normal", "large"] as const, d.fontSize),
    startPage: pick(raw.startPage, PAGES, d.startPage),
    pricePerKwh: price,
    alertMinDuration: pick(raw.alertMinDuration, [30, 60, 120, 180, 600], d.alertMinDuration),
    forecastHorizon: pick(raw.forecastHorizon, [14, 30, 60, 90], d.forecastHorizon),
    showSuggestions: typeof raw.showSuggestions === "boolean" ? raw.showSuggestions : d.showSuggestions,
  };
}

let current: Settings = load();

const darkQuery = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

/** Applique thème, couleur et taille du texte à toute l'application. */
export function applyAppearance(s: Settings = current) {
  const root = document.documentElement;
  const dark = s.theme === "dark" || (s.theme === "system" && Boolean(darkQuery?.matches));
  root.classList.toggle("dark", dark);
  root.dataset.accent = s.accent;
  root.dataset.fontSize = s.fontSize;
}

darkQuery?.addEventListener("change", () => { if (current.theme === "system") applyAppearance(); });

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch { /* stockage indisponible : le réglage reste valable pour cette session */ }
  applyAppearance();
  listeners.forEach((listener) => listener());
}

export function resetSettings() {
  try { localStorage.removeItem(KEY); } catch { /* ignoré */ }
  updateSettings({ ...DEFAULT_SETTINGS });
}

export function getSettings(): Settings {
  return current;
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => current,
  );
}
