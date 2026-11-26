import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Bot, Check, Database, Monitor, Moon, Palette, RefreshCw, RotateCcw, Server, SlidersHorizontal, Sun, Wallet, XCircle,
} from "lucide-react";
import { formatNumber, getJSON } from "./api";
import {
  DEFAULT_SETTINGS, PAGES, resetSettings, updateSettings, useSettings, type Accent, type FontSize, type Theme,
} from "./settings";

type Status = {
  version: string;
  api: string;
  dataset: { start: string; end: string; days: number; rooms: number; rows: number; data_type: string };
  agent: { configured: boolean; model: string; reasoning_effort: string; rate_limit_per_minute: number };
  default_price_per_kwh: number;
  shelly_connected: boolean;
};

const card = "rounded-3xl border border-gray-100 bg-white p-6 shadow-sm";
const field = "mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-500";

const THEMES: { id: Theme; label: string; icon: typeof Sun; hint: string }[] = [
  { id: "light", label: "Clair", icon: Sun, hint: "Fond clair" },
  { id: "dark", label: "Sombre", icon: Moon, hint: "Repose les yeux" },
  { id: "system", label: "Système", icon: Monitor, hint: "Suit Windows" },
];
const ACCENTS: { id: Accent; label: string; color: string }[] = [
  { id: "blue", label: "Bleu", color: "#2563eb" },
  { id: "violet", label: "Violet", color: "#7c3aed" },
  { id: "teal", label: "Vert d'eau", color: "#0d9488" },
  { id: "orange", label: "Orange", color: "#ea580c" },
];
const SIZES: { id: FontSize; label: string }[] = [
  { id: "small", label: "Petit" },
  { id: "normal", label: "Normal" },
  { id: "large", label: "Grand" },
];
const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

function Section({ icon: Icon, title, subtitle, children }: { icon: typeof Sun; title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className={card}>
      <div className="mb-5 flex items-center gap-3">
        <Icon size={20} className="text-blue-600" />
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-xs text-gray-400">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 py-2.5 text-sm last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

function StatusBadge({ ok, okText, koText }: { ok: boolean; okText: string; koText: string }) {
  return ok
    ? <span className="inline-flex items-center gap-1 text-emerald-600"><Check size={15} /> {okText}</span>
    : <span className="inline-flex items-center gap-1 text-rose-500"><XCircle size={15} /> {koText}</span>;
}

export default function SettingsPage() {
  const settings = useSettings();
  const [saved, setSaved] = useState(false);
  const [priceInput, setPriceInput] = useState(settings.pricePerKwh !== null ? String(settings.pricePerKwh) : "");
  const [priceError, setPriceError] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState("");
  const [checking, setChecking] = useState(false);

  const save = (patch: Parameters<typeof updateSettings>[0]) => {
    updateSettings(patch);
    setSaved(true);
  };
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 1800);
    return () => clearTimeout(timer);
  }, [saved, settings]);

  const checkStatus = useCallback(async () => {
    setChecking(true);
    setStatusError("");
    try {
      setStatus(await getJSON<Status>("/api/status"));
    } catch (err: unknown) {
      setStatus(null);
      setStatusError(err instanceof Error ? err.message : "Serveur injoignable.");
    } finally {
      setChecking(false);
    }
  }, []);
  useEffect(() => { void checkStatus(); }, [checkStatus]);

  const applyPrice = () => {
    const raw = priceInput.trim().replace(",", ".");
    if (!raw) {
      setPriceError("");
      save({ pricePerKwh: null });
      return;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0.1 || value > 10) {
      setPriceError("Entrez un prix entre 0,1 et 10 MAD/kWh (ou laissez vide pour le tarif par défaut).");
      return;
    }
    setPriceError("");
    save({ pricePerKwh: Math.round(value * 10000) / 10000 });
  };

  const choice = (active: boolean) =>
    `flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${active ? "border-blue-600 bg-blue-50 font-semibold text-blue-600" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">Les paramètres sont enregistrés automatiquement dans ce navigateur.</p>
        <span className={`inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 transition ${saved ? "opacity-100" : "opacity-0"}`} aria-live="polite">
          <Check size={13} /> Enregistré
        </span>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section icon={Palette} title="Apparence" subtitle="Thème, couleur principale et taille du texte">
          <p className="mb-2 text-xs font-medium text-gray-500">Thème</p>
          <div className="flex gap-2">
            {THEMES.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" onClick={() => save({ theme: id })} className={choice(settings.theme === id)} aria-pressed={settings.theme === id}>
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>

          <p className="mb-2 mt-5 text-xs font-medium text-gray-500">Couleur principale</p>
          <div className="flex flex-wrap gap-3">
            {ACCENTS.map(({ id, label, color }) => (
              <button key={id} type="button" onClick={() => save({ accent: id })} aria-pressed={settings.accent === id}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${settings.accent === id ? "border-gray-400 font-semibold" : "border-gray-200 text-gray-500"}`}>
                <span className="grid h-5 w-5 place-items-center rounded-full text-white" style={{ backgroundColor: color }}>
                  {settings.accent === id && <Check size={12} />}
                </span>
                {label}
              </button>
            ))}
          </div>

          <p className="mb-2 mt-5 text-xs font-medium text-gray-500">Taille du texte</p>
          <div className="flex gap-2">
            {SIZES.map(({ id, label }) => (
              <button key={id} type="button" onClick={() => save({ fontSize: id })} className={choice(settings.fontSize === id)} aria-pressed={settings.fontSize === id}>
                {label}
              </button>
            ))}
          </div>
        </Section>

        <Section icon={SlidersHorizontal} title="Préférences" subtitle="Valeurs utilisées à l'ouverture des pages">
          <label className="block text-xs font-medium text-gray-500">Page affichée au démarrage
            <select className={field} value={settings.startPage} onChange={(e) => save({ startPage: e.target.value })}>
              {PAGES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="mt-4 block text-xs font-medium text-gray-500">Durée minimale d'une alerte (page Alertes)
            <select className={field} value={settings.alertMinDuration} onChange={(e) => save({ alertMinDuration: Number(e.target.value) })}>
              {[30, 60, 120, 180, 600].map((m) => <option key={m} value={m}>≥ {m >= 60 ? `${m / 60} h` : `${m} min`}</option>)}
            </select>
          </label>
          <label className="mt-4 block text-xs font-medium text-gray-500">Horizon des prévisions (page Prévisions)
            <select className={field} value={settings.forecastHorizon} onChange={(e) => save({ forecastHorizon: Number(e.target.value) })}>
              {[14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} jours</option>)}
            </select>
          </label>
          <label className="mt-4 flex items-center justify-between gap-3 text-sm text-gray-600">
            Afficher les questions suggérées de l'agent IA
            <input type="checkbox" className="h-5 w-5 accent-blue-600" checked={settings.showSuggestions}
              onChange={(e) => save({ showSuggestions: e.target.checked })} />
          </label>
        </Section>

        <Section icon={Wallet} title="Calculs" subtitle="Tarif utilisé pour convertir les kWh en dirhams">
          <label className="block text-xs font-medium text-gray-500">Prix du kWh de l'ENSA (MAD/kWh)
            <div className="mt-2 flex gap-2">
              <input className={field.replace("mt-2 ", "")} type="number" min="0.1" max="10" step="0.01" inputMode="decimal"
                placeholder={status ? `${formatNumber(status.default_price_per_kwh)} (par défaut)` : "Par défaut"}
                value={priceInput} onChange={(e) => setPriceInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") applyPrice(); }} />
              <button type="button" onClick={applyPrice}
                className="shrink-0 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">Appliquer</button>
            </div>
          </label>
          {priceError && <p role="alert" className="mt-2 text-xs text-red-600">{priceError}</p>}
          <p className="mt-3 text-xs text-gray-400">
            Utilisé pour le coût du gaspillage (Alertes) et les économies en MAD (Prévisions).
            Actuellement : <strong className="text-gray-600">{settings.pricePerKwh !== null ? `${formatNumber(settings.pricePerKwh)} MAD/kWh (personnalisé)` : `tarif par défaut${status ? ` (${formatNumber(status.default_price_per_kwh)} MAD/kWh)` : ""}`}</strong>.
            La page Simulation garde son propre tarif, propre à chaque client.
          </p>
        </Section>

        <Section icon={Server} title="État du système" subtitle="Vérification en direct du serveur, des données et de l'agent IA">
          {statusError && <p role="alert" className="mb-3 text-sm text-red-600">{statusError}</p>}
          {status && (
            <div>
              <Row label="Serveur API"><StatusBadge ok={status.api === "ok"} okText="Connecté" koText="Erreur" /></Row>
              <Row label="Données"><span className="inline-flex items-center gap-1"><Database size={14} className="text-gray-400" /> {day(status.dataset.start)} → {day(status.dataset.end)}</span></Row>
              <Row label="Contenu">{status.dataset.rooms} salles · {status.dataset.days} jours · {status.dataset.rows.toLocaleString("fr-FR")} mesures ({status.dataset.data_type === "simulated" ? "simulées" : "réelles"})</Row>
              <Row label="Modules Shelly"><StatusBadge ok={status.shelly_connected} okText="Connectés" koText="Non connectés (simulation)" /></Row>
              <Row label="Agent IA"><span className="inline-flex items-center gap-2"><Bot size={14} className="text-gray-400" /><StatusBadge ok={status.agent.configured} okText="Clé configurée" koText="Clé absente (backend/.env)" /></span></Row>
              <Row label="Modèle IA">{status.agent.model} · raisonnement {status.agent.reasoning_effort}</Row>
              <Row label="Limite de questions">{status.agent.rate_limit_per_minute} par minute</Row>
              <Row label="Version">ENSA EnergyOS {status.version}</Row>
            </div>
          )}
          <button type="button" onClick={() => void checkStatus()} disabled={checking}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 disabled:opacity-60">
            <RefreshCw size={15} className={checking ? "animate-spin" : ""} /> {checking ? "Vérification…" : "Vérifier à nouveau"}
          </button>
        </Section>
      </div>

      <section className={`${card} flex flex-wrap items-center justify-between gap-4`}>
        <div>
          <h3 className="font-semibold">Réinitialiser</h3>
          <p className="text-xs text-gray-400">Remet tous les paramètres à leurs valeurs par défaut (thème clair, bleu, taille normale, tarif par défaut…).</p>
        </div>
        <button type="button"
          onClick={() => { resetSettings(); setPriceInput(""); setPriceError(""); setSaved(true); }}
          disabled={JSON.stringify(settings) === JSON.stringify(DEFAULT_SETTINGS)}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40">
          <RotateCcw size={15} /> Réinitialiser les paramètres
        </button>
      </section>
    </div>
  );
}
