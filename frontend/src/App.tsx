import { useEffect, useState } from "react";
import {
  Activity, AlertTriangle, BarChart3, Bot, LayoutDashboard,
  Settings, Zap, RotateCcw, SlidersHorizontal, Calculator, TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis,
  Tooltip, Legend,
} from "recharts";
import "./index.css";
import AIEnergyAgent from './AIEnergyAgent';
import ClientSpace from './ClientSpace';
import Forecast from './Forecast';
import WasteAlerts from './WasteAlerts';
import { getJSON } from './api';
import SettingsPage from './SettingsPage';
import { getSettings } from './settings';

type KPIs = {
  without_shelly_kwh: number;
  with_shelly_kwh: number;
  saved_kwh: number;
  savings_percent: number | null;
  total_rooms: number;
  total_lamps: number;
  total_days: number;
  data_type: string;
};
type Daily = {
  date: string;
  without_shelly_kwh: number;
  with_shelly_kwh: number;
};
type AvailableFilters = {
  buildings: string[];
  floors: string[];
  rooms: string[];
  min_date: string;
  max_date: string;
  data_type: string;
};
type Selection = {
  building: string;
  floor: string;
  room: string;
  start_date: string;
  end_date: string;
};
const emptySelection: Selection = {
  building: "", floor: "", room: "", start_date: "", end_date: "",
};
const navigation = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Energy Analytics", icon: BarChart3 },
  { name: "Alertes & Gaspillage", icon: AlertTriangle },
  { name: "Prévisions", icon: TrendingUp },
  { name: "AI Energy Agent", icon: Bot },
  { name: "Simulation", icon: Calculator },
  { name: "Settings", icon: Settings },
];
const formatNumber = (value: number) =>
  value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function useEnergyData(selection: Selection) {
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [daily, setDaily] = useState<Daily[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    (Object.keys(selection) as (keyof Selection)[]).forEach((key) => {
      if (selection[key]) params.set(key, selection[key]);
    });
    const suffix = params.toString() ? `?${params.toString()}` : "";
    setLoading(true);
    setError("");
    Promise.all([
      getJSON<KPIs>(`/api/analytics/kpis${suffix}`, controller.signal),
      getJSON<{ daily: Daily[] }>(`/api/analytics/daily${suffix}`, controller.signal),
    ])
      .then(([kpiResult, dailyResult]) => {
        if (controller.signal.aborted) return;
        setKpis(kpiResult);
        setDaily(dailyResult.daily);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setKpis(null);
        setDaily([]);
        setError(err instanceof Error ? err.message : "Erreur inconnue.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [selection]);
  return { kpis, daily, loading, error };
}

function MetricCards({ kpis }: { kpis: KPIs }) {
  const cards = [
    { label: "Sans Shelly", value: `${formatNumber(kpis.without_shelly_kwh)} kWh`, color: "text-rose-500" },
    { label: "Avec Shelly", value: `${formatNumber(kpis.with_shelly_kwh)} kWh`, color: "text-blue-600" },
    { label: "Énergie économisée", value: `${formatNumber(kpis.saved_kwh)} kWh`, color: "text-emerald-600" },
    { label: "Taux d'économie", value: kpis.savings_percent === null ? "N/A" : `${formatNumber(kpis.savings_percent)} %`, color: "text-emerald-600" },
  ];
  return (
    <div className="mb-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition hover:shadow-md">
          <p className="mb-4 text-sm text-gray-400">{card.label}</p>
          <p className={`text-2xl font-semibold ${card.color}`}>{card.value}</p>
        </div>
      ))}
    </div>
  );
}

function ConsumptionChart({ daily }: { daily: Daily[] }) {
  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-7 shadow-sm">
      <div className="mb-8 flex items-center gap-3">
        <Activity className="text-blue-600" size={20} />
        <div>
          <h3 className="font-semibold">Consommation quotidienne</h3>
          <p className="text-xs text-gray-400">Éclairage manuel vs automatisé · simulation</p>
        </div>
      </div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={daily} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={25} />
            <YAxis tick={{ fontSize: 12 }} width={55} />
            <Tooltip formatter={(value, name) => [`${formatNumber(Number(value))} kWh`, String(name)]} />
            <Legend />
            <Line type="monotone" dataKey="without_shelly_kwh" name="Sans Shelly" stroke="#E76F6F" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="with_shelly_kwh" name="Avec Shelly" stroke="#007AFF" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function DataView({ selection }: { selection: Selection }) {
  const { kpis, daily, loading, error } = useEnergyData(selection);
  if (loading) return <div className="rounded-2xl bg-white p-8 text-gray-500">Chargement des données énergétiques…</div>;
  if (error) return (
    <div className="rounded-2xl bg-red-50 p-6 text-red-600" role="alert">
      {error}
      <p className="mt-2 text-sm">Vérifie les filtres sélectionnés et le serveur FastAPI sur le port 8000.</p>
    </div>
  );
  if (!kpis) return null;
  return (
    <>
      <MetricCards kpis={kpis} />
      <div className="mb-8 grid gap-5 sm:grid-cols-3">
        {[
          ["Espaces sélectionnés", kpis.total_rooms],
          ["Lampes", kpis.total_lamps],
          ["Jours analysés", kpis.total_days],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-400">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <ConsumptionChart daily={daily} />
    </>
  );
}

function EnergyAnalytics() {
  const [available, setAvailable] = useState<AvailableFilters | null>(null);
  const [filterError, setFilterError] = useState("");
  const [selection, setSelection] = useState<Selection>(emptySelection);

  useEffect(() => {
    const controller = new AbortController();
    getJSON<AvailableFilters>("/api/analytics/filters", controller.signal)
      .then((data) => { if (!controller.signal.aborted) setAvailable(data); })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setFilterError(err instanceof Error ? err.message : "Erreur de chargement des filtres.");
      });
    return () => controller.abort();
  }, []);

  const update = (key: keyof Selection, value: string) => {
    setSelection((current) => {
      const next = { ...current, [key]: value };
      // Réinitialisation des sélections dépendantes pour éviter les combinaisons obsolètes.
      if (key === "building") { next.floor = ""; next.room = ""; }
      if (key === "floor") next.room = "";
      return next;
    });
  };

  const selectClass = "mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-700 outline-none focus:border-blue-500";
  const fieldClass = "text-xs font-medium text-gray-500";
  const invalidDates = Boolean(selection.start_date && selection.end_date && selection.start_date > selection.end_date);

  return (
    <>
      <div className="mb-6 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <SlidersHorizontal size={20} className="text-blue-600" />
            <div>
              <h3 className="font-semibold">Filtres d'analyse</h3>
              <p className="text-xs text-gray-400">Les deux scénarios utilisent exactement la même sélection.</p>
            </div>
          </div>
          <button type="button" onClick={() => setSelection({ ...emptySelection })}
            className="inline-flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-2 text-sm text-gray-600 hover:bg-gray-200">
            <RotateCcw size={15} /> Réinitialiser
          </button>
        </div>
        {filterError && <p role="alert" className="mb-4 text-sm text-red-600">{filterError}</p>}
        {!available && !filterError && <p className="text-sm text-gray-400">Chargement des options…</p>}
        {available && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <label className={fieldClass}>Bâtiment
              <select className={selectClass} value={selection.building} onChange={(e) => update("building", e.target.value)}>
                <option value="">Tous les bâtiments</option>
                {available.buildings.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className={fieldClass}>Étage
              <select className={selectClass} value={selection.floor} onChange={(e) => update("floor", e.target.value)}>
                <option value="">Tous les étages</option>
                {available.floors.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className={fieldClass}>Salle
              <select className={selectClass} value={selection.room} onChange={(e) => update("room", e.target.value)}>
                <option value="">Toutes les salles</option>
                {available.rooms.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className={fieldClass}>Date de début
              <input type="date" className={selectClass} min={available.min_date} max={available.max_date}
                value={selection.start_date} onChange={(e) => update("start_date", e.target.value)} />
            </label>
            <label className={fieldClass}>Date de fin
              <input type="date" className={selectClass} min={available.min_date} max={available.max_date}
                value={selection.end_date} onChange={(e) => update("end_date", e.target.value)} />
            </label>
            <div className="flex items-end pb-3 text-xs text-gray-400">
              Période disponible : {available.min_date} → {available.max_date}
            </div>
          </div>
        )}
        {invalidDates && <p role="alert" className="mt-4 text-sm text-red-600">La date de début doit précéder la date de fin.</p>}
      </div>
      {available && !invalidDates && <DataView selection={selection} />}
    </>
  );
}

function App() {
  const [page, setPage] = useState(() => getSettings().startPage);
  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-fg)]">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-gray-200 bg-white p-6 lg:block">
        <div className="mb-12 flex items-center gap-3">
          <div className="rounded-xl bg-blue-600 p-2 text-white"><Zap size={22} /></div>
          <div><h1 className="font-bold tracking-tight">ENSA EnergyOS</h1><p className="text-xs text-gray-400">Smart Campus Platform</p></div>
        </div>
        <nav className="space-y-2">
          {navigation.map(({ name, icon: Icon }) => (
            <button key={name} onClick={() => setPage(name)}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition ${page === name ? "bg-blue-50 font-semibold text-blue-600" : "text-gray-500 hover:bg-gray-100"}`}>
              <Icon size={18} />{name}
            </button>
          ))}
        </nav>
        <div className="absolute bottom-6 left-6 right-6 rounded-xl bg-gray-50 p-4">
          <p className="text-xs font-medium text-gray-700">Simulation Environment</p>
          <p className="mt-1 text-xs text-gray-400">No physical Shelly devices connected</p>
        </div>
      </aside>
      <main className="p-6 lg:ml-64 lg:p-10">
        <header className="mb-10 flex items-center justify-between gap-4">
          <div><p className="mb-2 text-sm text-gray-400">ENSA Fès / Smart Campus</p><h2 className="text-3xl font-semibold tracking-tight">{page}</h2></div>
          <span className="rounded-full border border-gray-200 bg-white px-4 py-2 text-xs text-gray-500">Simulated Data</span>
        </header>
        <div className="mb-6 flex gap-2 overflow-x-auto lg:hidden">
          {navigation.map(({ name }) => (
            <button key={name} onClick={() => setPage(name)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm ${page === name ? "bg-blue-600 text-white" : "bg-white text-gray-500"}`}>
              {name}
            </button>
          ))}
        </div>
        {page === "Overview" && <DataView selection={emptySelection} />}
        {page === "Energy Analytics" && <EnergyAnalytics />}
        {page === "AI Energy Agent" && (
          <AIEnergyAgent />
        )}
        {page === "Simulation" && <ClientSpace />}
        {page === "Alertes & Gaspillage" && <WasteAlerts />}
        {page === "Prévisions" && <Forecast />}
        {page === "Settings" && <SettingsPage />}
        <footer className="mt-10 text-center text-xs text-gray-400">ENSA EnergyOS · Smart Campus Energy Management · Simulated Data</footer>
      </main>
    </div>
  );
}
export default App;
