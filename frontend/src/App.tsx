import { useEffect, useState, type ComponentType } from "react";
import {
  Activity, AlertTriangle, BarChart3, Bot, Briefcase, FileText, Gauge, Home, LayoutDashboard, LogIn, LogOut,
  History, Settings, ShieldCheck, UserRound, Users, Wrench, RotateCcw, SlidersHorizontal, Calculator, TrendingUp,
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
import { useAuth } from './auth';
import { ROLE_LABELS, type Role } from './roles';
import { LogoMark } from './Logo';
import WelcomePage from './WelcomePage';
import { MyQuotes, ProfileForms } from './MySpace';
import ClientsPage from './ClientsPage';
import AuditPage from './AuditPage';
import AdvisorPage from './AdvisorPage';
import { AdminDashboard, ClientDashboard, CommercialDashboard, TechnicienDashboard } from './Dashboards';
import ProjectsPage from './ProjectsPage';
import UsersPage from './UsersPage';

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
type NavItem = { name: string; label?: string; icon: ComponentType<{ size?: number }>; roles: Role[] };
const STAFF: Role[] = ["commercial", "technicien", "admin"];
const CAMPUS: Role[] = ["technicien", "admin"];
// Deux interfaces : « Espace client » (invité, client) et « Administration » (commercial, technicien, administrateur).
// Chaque profil ne voit que ses pages ; le serveur vérifie aussi chaque accès.
const navigation: NavItem[] = [
  { name: "Tableau de bord", icon: Gauge, roles: ["client", ...STAFF] },
  { name: "Overview", label: "Accueil", icon: Home, roles: ["guest"] },
  { name: "Simulation", icon: Calculator, roles: ["guest", "client", "commercial", "admin"] },
  { name: "Mes devis", icon: FileText, roles: ["client"] },
  { name: "Conseiller IA", icon: Bot, roles: ["client"] },
  { name: "Dossiers clients", icon: Briefcase, roles: ["commercial", "admin"] },
  { name: "Clients", icon: Users, roles: ["commercial", "admin"] },
  { name: "Interventions", icon: Wrench, roles: ["technicien"] },
  { name: "Campus", icon: LayoutDashboard, roles: CAMPUS },
  { name: "Energy Analytics", icon: BarChart3, roles: CAMPUS },
  { name: "Alertes & Gaspillage", icon: AlertTriangle, roles: CAMPUS },
  { name: "Prévisions", icon: TrendingUp, roles: CAMPUS },
  { name: "AI Energy Agent", icon: Bot, roles: CAMPUS },
  { name: "Utilisateurs", icon: ShieldCheck, roles: ["admin"] },
  { name: "Journal d'activité", icon: History, roles: ["admin"] },
  // Client : son compte (profil, mot de passe) est dans « Paramètres ».
  { name: "Mon compte", icon: UserRound, roles: STAFF },
  { name: "Settings", label: "Paramètres", icon: Settings, roles: ["guest", "client", ...STAFF] },
];
const GUEST_KEY = "ensa-energyos-guest";
const HOME: Record<Role, string> = {
  guest: "Overview", client: "Tableau de bord", commercial: "Tableau de bord", technicien: "Tableau de bord", admin: "Tableau de bord",
};
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
  const { user, role, ready, logout } = useAuth();
  const [page, setPage] = useState(() => getSettings().startPage);
  // Écran d'accueil (logo + connexion) tant qu'un visiteur n'a ni compte ni choisi « Continuer sans compte ».
  const [guestMode, setGuestMode] = useState(() => {
    try { return sessionStorage.getItem(GUEST_KEY) === "1"; } catch { return false; }
  });
  const chooseGuest = (value: boolean) => {
    setGuestMode(value);
    try { if (value) sessionStorage.setItem(GUEST_KEY, "1"); else sessionStorage.removeItem(GUEST_KEY); } catch { /* indisponible */ }
  };
  const items = navigation.filter((item) => item.roles.includes(role));
  // "__home__" = juste après la connexion ; page non autorisée pour ce profil : retour à son accueil.
  const target = page === "__home__" ? HOME[role] : page;
  const current = items.find((i) => i.name === target) ?? items.find((i) => i.name === HOME[role])!;
  const staff = STAFF.includes(role);
  const signOut = () => { void logout(); chooseGuest(false); setPage("Overview"); };

  if (!ready) return <div className="p-10 text-gray-500">Chargement…</div>;
  if (!user && !guestMode) {
    return <WelcomePage onDone={() => setPage("__home__")} onGuest={() => { chooseGuest(true); setPage("Overview"); }} />;
  }

  const content = (
    <>
      {current.name === "Tableau de bord" && role === "client" && <ClientDashboard go={setPage} />}
      {current.name === "Tableau de bord" && role === "commercial" && <CommercialDashboard go={setPage} />}
      {current.name === "Tableau de bord" && role === "technicien" && <TechnicienDashboard go={setPage} />}
      {current.name === "Tableau de bord" && role === "admin" && <AdminDashboard go={setPage} />}
      {(current.name === "Overview" || current.name === "Campus") && <DataView selection={emptySelection} />}
      {current.name === "Energy Analytics" && <EnergyAnalytics />}
      {current.name === "AI Energy Agent" && <AIEnergyAgent />}
      {current.name === "Simulation" && <ClientSpace />}
      {current.name === "Alertes & Gaspillage" && <WasteAlerts />}
      {current.name === "Prévisions" && <Forecast />}
      {current.name === "Settings" && <SettingsPage />}
      {current.name === "Mes devis" && <MyQuotes onSimulate={() => setPage("Simulation")} />}
      {current.name === "Conseiller IA" && <AdvisorPage onSimulate={() => setPage("Simulation")} />}
      {(current.name === "Dossiers clients" || current.name === "Interventions") && <ProjectsPage />}
      {current.name === "Clients" && <ClientsPage />}
      {current.name === "Utilisateurs" && <UsersPage />}
      {current.name === "Journal d'activité" && <AuditPage />}
      {current.name === "Mon compte" && <ProfileForms />}
    </>
  );
  const title = current.label ?? current.name;
  const mobileNav = (dark: boolean) => (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {items.map((item) => (
        <button key={item.name} onClick={() => setPage(item.name)}
          className={`shrink-0 rounded-full px-4 py-2 text-sm ${current.name === item.name ? "bg-blue-600 text-white" : dark ? "bg-white/10 text-gray-300" : "bg-white text-gray-500 shadow-sm"}`}>
          {item.label ?? item.name}
        </button>
      ))}
    </div>
  );

  // ---------- Interface d'administration (commercial, technicien, administrateur) ----------
  if (staff && user) {
    return (
      <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-fg)]">
        <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-gray-950 p-5 text-gray-300 lg:flex">
          <div className="mb-8 flex items-center gap-3 px-1">
            <LogoMark size={38} />
            <div><p className="font-bold tracking-tight text-white">Energy<span className="text-emerald-300">OS</span></p>
              <p className="text-[11px] uppercase tracking-widest text-gray-500">Administration</p></div>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto">
            {items.map(({ name, label, icon: Icon }) => (
              <button key={name} onClick={() => setPage(name)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${current.name === name ? "bg-blue-600 font-semibold text-white" : "hover:bg-white/5 hover:text-white"}`}>
                <Icon size={17} />{label ?? name}
              </button>
            ))}
          </nav>
          <div className="mt-4 rounded-xl bg-white/5 p-3">
            <p className="truncate text-sm font-medium text-white">{user.name}</p>
            <p className="text-xs text-gray-500">{ROLE_LABELS[role]}</p>
            <button type="button" onClick={signOut} className="mt-3 inline-flex items-center gap-2 text-xs text-gray-400 hover:text-rose-400"><LogOut size={14} /> Se déconnecter</button>
          </div>
        </aside>
        <div className="sticky top-0 z-10 space-y-3 bg-gray-950 p-4 text-white lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><LogoMark size={30} /><p className="font-bold">Energy<span className="text-emerald-300">OS</span> <span className="text-xs font-normal text-gray-400">Administration</span></p></div>
            <button type="button" onClick={signOut} aria-label="Se déconnecter" className="rounded-full bg-white/10 p-2 text-gray-300"><LogOut size={16} /></button>
          </div>
          {mobileNav(true)}
        </div>
        <main className="p-6 lg:ml-64 lg:p-10">
          <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
            <div><p className="mb-1 text-sm text-gray-400">Administration · {ROLE_LABELS[role]}</p><h2 className="text-3xl font-semibold tracking-tight">{title}</h2></div>
            <span className="rounded-full border border-gray-200 bg-white px-4 py-2 text-xs text-gray-500">Données simulées · Shelly non connectés</span>
          </header>
          {content}
          <footer className="mt-10 text-center text-xs text-gray-400">EnergyOS Administration · ENSA Fès</footer>
        </main>
      </div>
    );
  }

  // ---------- Interface client (invité, client) : menu latéral clair ----------
  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-fg)]">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-gray-200 bg-white p-5 lg:flex">
        <div className="mb-8 flex items-center gap-3 px-1">
          <LogoMark size={38} />
          <div><p className="font-bold tracking-tight">Energy<span className="text-blue-600">OS</span></p>
            <p className="text-[11px] uppercase tracking-widest text-gray-400">Espace client</p></div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto">
          {items.map(({ name, label, icon: Icon }) => (
            <button key={name} onClick={() => setPage(name)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${current.name === name ? "bg-blue-50 font-semibold text-blue-600" : "text-gray-500 hover:bg-gray-100"}`}>
              <Icon size={17} />{label ?? name}
            </button>
          ))}
        </nav>
        {user ? (
          <div className="mt-4 rounded-xl bg-gray-50 p-3">
            <p className="truncate text-sm font-medium" title={user.name}>{user.name}</p>
            <p className="truncate text-xs text-gray-400" title={user.email}>{user.email}</p>
            <button type="button" onClick={signOut} className="mt-3 inline-flex items-center gap-2 text-xs text-gray-500 hover:text-rose-600"><LogOut size={14} /> Se déconnecter</button>
          </div>
        ) : (
          <div className="mt-4 rounded-xl bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-700">Vous êtes invité</p>
            <p className="mt-1 text-xs text-gray-500">Créez un compte pour enregistrer vos simulations et suivre votre projet.</p>
            <button type="button" onClick={() => chooseGuest(false)}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"><LogIn size={14} /> Se connecter</button>
          </div>
        )}
      </aside>
      <div className="sticky top-0 z-10 space-y-3 border-b border-gray-200 bg-white/95 p-4 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2"><LogoMark size={30} /><p className="font-bold">Energy<span className="text-blue-600">OS</span> <span className="text-xs font-normal text-gray-400">Espace client</span></p></div>
          {user ? (
            <button type="button" onClick={signOut} aria-label="Se déconnecter" className="rounded-full bg-gray-100 p-2 text-gray-500"><LogOut size={16} /></button>
          ) : (
            <button type="button" onClick={() => chooseGuest(false)} className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"><LogIn size={13} /> Se connecter</button>
          )}
        </div>
        {mobileNav(false)}
      </div>
      <main className="p-6 lg:ml-64 lg:p-10">
        <header className="mb-8">
          <p className="mb-1 text-sm text-gray-400">Espace client{user ? ` · ${user.name}` : " · Invité"}</p>
          <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
        </header>
        {content}
        <footer className="mt-10 text-center text-xs text-gray-400">EnergyOS · ENSA Fès · Simulation fondée sur des données simulées</footer>
      </main>
    </div>
  );
}

export default App;
