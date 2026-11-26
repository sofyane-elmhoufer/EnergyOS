// Appels à l'API FastAPI via le proxy Vite (même origine : aucune URL absolue, aucun secret côté navigateur).

async function parse<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
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

export async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  return parse<T>(response, SERVER_DOWN);
}

export async function postJSON<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  return parse<T>(response, SERVER_DOWN);
}

export async function postForm<T>(path: string, form: FormData, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { method: "POST", body: form, signal });
  return parse<T>(response, SERVER_DOWN);
}

export const formatNumber = (value: number, digits = 2) =>
  value.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
