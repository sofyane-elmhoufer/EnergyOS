// Appels à l'API FastAPI.
// - Site web : via le proxy Vite (même origine, aucune URL absolue).
// - Application mobile (Capacitor) : VITE_API_BASE_URL indique l'adresse du serveur (voir MOBILE.md).
// Le jeton de session est envoyé dans l'en-tête Authorization ; aucun secret serveur côté navigateur.

import { Capacitor } from "@capacitor/core";

// Adresse de l'API :
// 1. VITE_API_BASE_URL si elle est définie au moment du build (serveur en ligne, ex : https://api.exemple.ma) ;
// 2. sinon, dans l'application mobile : le serveur de développement du Mac
//    (le simulateur iOS voit le Mac sur localhost, l'émulateur Android sur 10.0.2.2) ;
// 3. sinon (site web) : même origine, via le proxy Vite.
function apiBase(): string {
  const configured = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (configured) return configured.replace(/\/$/, "");
  if (Capacitor.isNativePlatform()) {
    return Capacitor.getPlatform() === "android" ? "http://10.0.2.2:8000" : "http://localhost:8000";
  }
  return "";
}

export const API_BASE = apiBase();
const TOKEN_KEY = "ensa-energyos-token";

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* stockage indisponible (navigation privée) : session limitée à l'onglet */ }
}

/** Événement émis quand le serveur refuse le jeton (session expirée) : l'interface se déconnecte. */
export const UNAUTHORIZED_EVENT = "ensa-unauthorized";

async function parse<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    if (response.status === 401 && getToken()) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    let detail = fallback;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch { /* réponse non JSON */ }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

const SERVER_DOWN = "Le serveur ne répond pas (FastAPI, port 8000).";

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

async function send<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(API_BASE + path, {
      method,
      headers: headers(body === undefined ? {} : { "Content-Type": "application/json" }),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new Error(SERVER_DOWN);
  }
  return parse<T>(response, SERVER_DOWN);
}

export const getJSON = <T>(path: string, signal?: AbortSignal) => send<T>("GET", path, undefined, signal);
export const postJSON = <T>(path: string, body: unknown, signal?: AbortSignal) => send<T>("POST", path, body, signal);
export const patchJSON = <T>(path: string, body: unknown) => send<T>("PATCH", path, body);
export const deleteJSON = <T>(path: string) => send<T>("DELETE", path);

export async function postForm<T>(path: string, form: FormData, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(API_BASE + path, { method: "POST", headers: headers(), body: form, signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new Error(SERVER_DOWN);
  }
  return parse<T>(response, SERVER_DOWN);
}

export const formatNumber = (value: number, digits = 2) =>
  value.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
