import { useEffect, useMemo, useState } from "react";
import { Target, TrendingUp } from "lucide-react";
import {
  Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { formatNumber, getJSON } from "./api";
import { getSettings, useSettings } from "./settings";

type Point = { date: string; without_shelly_kwh: number; with_shelly_kwh: number };
type ForecastPoint = Point & { without_range: [number, number]; with_range: [number, number] };
type ForecastResponse = {
  method: string;
  price_per_kwh: number;
  horizon_days: number;
  weeks_per_year: number;
  history: Point[];
  forecast: ForecastPoint[];
  backtest: { test_days: number; wape_without_percent: number | null; wape_with_percent: number | null } | null;
  summary: {
    month_label: string; month_without_kwh: number; month_with_kwh: number; month_saved_kwh: number; month_saved_cost: number;
    horizon_saved_kwh: number; horizon_saved_cost: number;
    year_without_kwh: number; year_with_kwh: number; year_saved_kwh: number; year_saved_cost: number;
  };
};

const card = "rounded-3xl border border-gray-100 bg-white p-6 shadow-sm";

export default function Forecast() {
  const price = useSettings().pricePerKwh;
  const [horizon, setHorizon] = useState(() => getSettings().forecastHorizon);
  const [weeks, setWeeks] = useState(40);
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ horizon_days: String(horizon), weeks_per_year: String(weeks) });
    if (price !== null) params.set("price_per_kwh", String(price));
    setError("");
    getJSON<ForecastResponse>(`/api/analytics/forecast?${params}`, controller.signal)
      .then(setData)
      .catch((err: unknown) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Erreur."); });
    return () => controller.abort();
  }, [horizon, weeks, price]);

  const chartData = useMemo(() => {
    if (!data) return [];
    const history = data.history.map((p) => ({ date: p.date, reel_sans: p.without_shelly_kwh, reel_avec: p.with_shelly_kwh }));
    const last = data.history[data.history.length - 1];
    // Le dernier point réel sert de départ aux courbes de prévision (continuité visuelle).
    history[history.length - 1] = { ...history[history.length - 1], prev_sans: last.without_shelly_kwh, prev_avec: last.with_shelly_kwh } as typeof history[number];
    const future = data.forecast.map((p) => ({
      date: p.date, prev_sans: p.without_shelly_kwh, prev_avec: p.with_shelly_kwh,
      bande_sans: p.without_range, bande_avec: p.with_range,
    }));
    return [...history, ...future];
  }, [data]);

  const select = "rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500";
  const wape = data?.backtest?.wape_without_percent;

  return (
    <div className="space-y-6">
      <div className={`${card} flex flex-wrap items-center justify-between gap-4`}>
        <div className="flex items-center gap-3">
          <TrendingUp size={20} className="text-blue-600" />
          <div>
            <h3 className="font-semibold">Prévisions de consommation</h3>
            <p className="text-xs text-gray-400">{data?.method ?? "Profil moyen par jour de la semaine"} · données simulées</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select className={select} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} aria-label="Horizon">
            {[14, 30, 60, 90].map((d) => <option key={d} value={d}>Prévoir {d} jours</option>)}
          </select>
          <label className="flex items-center gap-2 text-xs text-gray-500">
            Semaines de cours / an
            <input type="number" min={1} max={52} value={weeks} className={`${select} w-20`}
              onChange={(e) => { const v = Number(e.target.value); if (v >= 1 && v <= 52) setWeeks(v); }} />
          </label>
        </div>
      </div>

      {error && <div className="rounded-2xl bg-red-50 p-6 text-red-600" role="alert">{error}</div>}
      {!data && !error && <div className="rounded-2xl bg-white p-8 text-gray-500">Calcul des prévisions…</div>}

      {data && (
        <>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: `Fin du mois (${data.summary.month_label})`, value: `${formatNumber(data.summary.month_saved_kwh, 0)} kWh`, hint: `économisés ≈ ${formatNumber(data.summary.month_saved_cost, 0)} MAD (réel + prévision)`, color: "text-emerald-600" },
              { label: `Sur les ${data.horizon_days} prochains jours`, value: `${formatNumber(data.summary.horizon_saved_kwh, 0)} kWh`, hint: `économisés ≈ ${formatNumber(data.summary.horizon_saved_cost, 0)} MAD`, color: "text-emerald-600" },
              { label: `Projection annuelle (${data.weeks_per_year} sem.)`, value: `${formatNumber(data.summary.year_saved_cost, 0)} MAD`, hint: `${formatNumber(data.summary.year_without_kwh, 0)} → ${formatNumber(data.summary.year_with_kwh, 0)} kWh`, color: "text-blue-600" },
              { label: "Précision du modèle", value: wape !== null && wape !== undefined ? `${formatNumber(100 - wape, 1)} %` : "N/A", hint: data.backtest ? `testée sur les ${data.backtest.test_days} derniers jours réels (WAPE ${formatNumber(wape ?? 0, 1)} %)` : "historique trop court", color: "text-gray-800" },
            ].map((c) => (
              <div key={c.label} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <p className="mb-3 text-sm text-gray-400">{c.label}</p>
                <p className={`text-2xl font-semibold ${c.color}`}>{c.value}</p>
                <p className="mt-2 text-xs text-gray-400">{c.hint}</p>
              </div>
            ))}
          </div>

          <section className={card}>
            <h3 className="font-semibold">Consommation journalière : réel et prévision</h3>
            <p className="mb-6 text-xs text-gray-400">Traits pleins = données, pointillés = prévision, zone colorée = fourchette min / max observée pour ce jour de la semaine</p>
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={30} />
                  <YAxis tick={{ fontSize: 12 }} width={55} />
                  <Tooltip formatter={(v, n) => [Array.isArray(v) ? `${formatNumber(Number(v[0]))} – ${formatNumber(Number(v[1]))} kWh` : `${formatNumber(Number(v))} kWh`, String(n)]} />
                  <Legend />
                  <Area dataKey="bande_sans" name="Fourchette sans Shelly" stroke="none" fill="#E76F6F" fillOpacity={0.15} legendType="none" />
                  <Area dataKey="bande_avec" name="Fourchette avec Shelly" stroke="none" fill="#007AFF" fillOpacity={0.15} legendType="none" />
                  <Line dataKey="reel_sans" name="Sans Shelly (réel)" stroke="#E76F6F" strokeWidth={3} dot={false} />
                  <Line dataKey="reel_avec" name="Avec Shelly (réel)" stroke="#007AFF" strokeWidth={3} dot={false} />
                  <Line dataKey="prev_sans" name="Sans Shelly (prévision)" stroke="#E76F6F" strokeWidth={2} strokeDasharray="6 4" dot={false} />
                  <Line dataKey="prev_avec" name="Avec Shelly (prévision)" stroke="#007AFF" strokeWidth={2} strokeDasharray="6 4" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-4 flex gap-2 text-xs text-gray-400">
              <Target size={14} className="mt-0.5 shrink-0" />
              Hypothèse : chaque jour à venir ressemble à la moyenne des mêmes jours de la semaine observés. Les vacances et jours fériés ne sont pas modélisés ;
              la projection annuelle suppose {data.weeks_per_year} semaines d'activité au rythme d'octobre. Coût à {formatNumber(data.price_per_kwh)} MAD/kWh (indicatif).
            </p>
          </section>
        </>
      )}
    </div>
  );
}
