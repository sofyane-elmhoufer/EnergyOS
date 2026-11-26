import { useEffect, useState } from "react";
import { AlertTriangle, CalendarRange, Clock, Flame, Info, RotateCcw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNumber, getJSON } from "./api";
import { getSettings, useSettings } from "./settings";

type SlotId = "lunch" | "evening" | "weekend" | "daytime";
type AlertEvent = {
  room: string; building: string; floor: string; start: string; end: string;
  duration_minutes: number; waste_kwh: number; cost: number; slot: SlotId; slot_label: string;
  severity: "haute" | "moyenne" | "faible";
};
type AlertsResponse = {
  price_per_kwh: number;
  slot: SlotId | null;
  slots: { id: SlotId; label: string }[];
  period: { start: string; end: string; days: number };
  summary: {
    events: number; high_events: number; rooms_affected: number; wasted_hours: number;
    waste_kwh: number; waste_cost: number; waste_share_percent: number | null;
  };
  by_slot: { slot: SlotId; label: string; waste_kwh: number; hours: number; cost: number; share_percent: number }[];
  by_room: { room: string; building: string; floor: string; events: number; waste_kwh: number; cost: number; hours: number }[];
  heatmap: { day: string; day_index: number; hour: number; waste_kwh: number; avg_rooms: number }[];
  events: AlertEvent[];
};
type Filters = { buildings: string[]; min_date: string; max_date: string };

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const SLOT_OPTIONS: { id: "" | SlotId; label: string }[] = [
  { id: "", label: "Tous les créneaux" },
  { id: "lunch", label: "Pause de midi (12h30-14h30)" },
  { id: "evening", label: "Soir et nuit (18h30-8h30)" },
  { id: "weekend", label: "Week-end" },
  { id: "daytime", label: "Pendant les séances" },
];
const SEVERITY = {
  haute: "bg-rose-100 text-rose-700",
  moyenne: "bg-amber-100 text-amber-700",
  faible: "bg-gray-100 text-gray-600",
};
const card = "rounded-3xl border border-gray-100 bg-white p-6 shadow-sm";
const field = "mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500";
const dt = (iso: string) => new Date(iso).toLocaleString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
const duration = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60}` : ""}` : `${min} min`);

function Heatmap({ cells }: { cells: AlertsResponse["heatmap"] }) {
  const max = Math.max(...cells.map((c) => c.waste_kwh), 0.001);
  const cell = (d: number, h: number) => cells.find((c) => c.day_index === d && c.hour === h);
  return (
    <>
      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-[40px_repeat(24,minmax(0,1fr))] gap-[3px] text-[10px] text-gray-400">
          <span />
          {Array.from({ length: 24 }, (_, h) => <span key={h} className="text-center">{h % 3 === 0 ? `${h}h` : ""}</span>)}
          {DAYS.map((label, d) => (
            <div key={label} className="contents">
              <span className="flex items-center">{label}</span>
              {Array.from({ length: 24 }, (_, h) => {
                const c = cell(d, h);
                const v = c?.waste_kwh ?? 0;
                // Échelle racine carrée : les faibles valeurs (nuit) restent visibles à côté du pic de midi.
                const intensity = v > 0 ? 0.15 + 0.85 * Math.sqrt(v / max) : 0;
                return (
                  <div key={h}
                    title={`${label} ${h}h-${h + 1}h : ${formatNumber(v, 2)} kWh gaspillés · ${formatNumber(c?.avg_rooms ?? 0, 1)} salles allumées inutilement en moyenne`}
                    className="h-6 rounded-[4px]"
                    style={{ backgroundColor: v > 0 ? `rgba(225, 29, 72, ${intensity})` : "var(--color-gray-100)" }} />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-400">
        <span>Faible</span>
        <div className="h-2 w-32 rounded-full" style={{ background: "linear-gradient(90deg, rgba(225,29,72,0.15), rgba(225,29,72,1))" }} />
        <span>Fort ({formatNumber(max, 1)} kWh)</span>
        <span className="ml-2">· Survolez une case pour le nombre de salles concernées</span>
      </div>
    </>
  );
}

export default function WasteAlerts() {
  const [filters, setFilters] = useState<Filters | null>(null);
  const [building, setBuilding] = useState("");
  const [slot, setSlot] = useState<"" | SlotId>("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const settings = useSettings();
  const price = settings.pricePerKwh;
  const [minDuration, setMinDuration] = useState(() => getSettings().alertMinDuration);
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    getJSON<Filters>("/api/analytics/filters", controller.signal).then(setFilters).catch(() => {});
    return () => controller.abort();
  }, []);

  const invalidDates = Boolean(start && end && start > end);

  useEffect(() => {
    if (invalidDates) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ min_duration_minutes: String(minDuration), limit: "30" });
    if (building) params.set("building", building);
    if (slot) params.set("slot", slot);
    if (start) params.set("start_date", start);
    if (end) params.set("end_date", end);
    if (price !== null) params.set("price_per_kwh", String(price));
    setLoading(true);
    setError("");
    getJSON<AlertsResponse>(`/api/analytics/alerts?${params}`, controller.signal)
      .then((result) => { setData(result); setLoading(false); })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setData(null);
        setLoading(false);
        setError(err instanceof Error ? err.message : "Erreur.");
      });
    return () => controller.abort();
  }, [minDuration, building, slot, start, end, invalidDates, price]);

  const reset = () => { setBuilding(""); setSlot(""); setStart(""); setEnd(""); setMinDuration(getSettings().alertMinDuration); };
  const slotLabel = SLOT_OPTIONS.find((o) => o.id === slot)?.label ?? "";
  const periodText = data
    ? `du ${day(data.period.start)} au ${day(data.period.end)} (${data.period.days} jour${data.period.days > 1 ? "s" : ""})${slot ? ` · ${slotLabel}` : ""}${building ? ` · ${building}` : ""}`
    : "";

  return (
    <div className="space-y-6">
      <div className={card}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} className="text-rose-500" />
            <div>
              <h3 className="font-semibold">Alertes de gaspillage</h3>
              <p className="text-xs text-gray-400">Lampes allumées en mode manuel alors que Shelly les aurait éteintes (données simulées).</p>
            </div>
          </div>
          <button type="button" onClick={reset}
            className="inline-flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-2 text-sm text-gray-600 hover:bg-gray-200">
            <RotateCcw size={15} /> Réinitialiser
          </button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <label className="text-xs font-medium text-gray-500">Date de début
            <input type="date" className={field} min={filters?.min_date} max={filters?.max_date} value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="text-xs font-medium text-gray-500">Date de fin
            <input type="date" className={field} min={filters?.min_date} max={filters?.max_date} value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <label className="text-xs font-medium text-gray-500">Créneau horaire
            <select className={field} value={slot} onChange={(e) => setSlot(e.target.value as "" | SlotId)}>
              {SLOT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-gray-500">Bâtiment
            <select className={field} value={building} onChange={(e) => setBuilding(e.target.value)}>
              <option value="">Tous les bâtiments</option>
              {filters?.buildings.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-gray-500">Durée minimale d'une alerte
            <select className={field} value={minDuration} onChange={(e) => setMinDuration(Number(e.target.value))}>
              {[30, 60, 120, 180, 600].map((m) => <option key={m} value={m}>≥ {duration(m)}</option>)}
            </select>
          </label>
        </div>
        {filters && (
          <p className="mt-3 flex items-center gap-2 text-xs text-gray-400">
            <CalendarRange size={14} /> Données disponibles du {day(filters.min_date)} au {day(filters.max_date)}.
            Shelly n'étant pas encore connecté, aucune mesure n'existe en dehors de cette période.
          </p>
        )}
        {invalidDates && <p role="alert" className="mt-3 text-sm text-red-600">La date de début doit précéder la date de fin.</p>}
      </div>

      {error && <div className="rounded-2xl bg-amber-50 p-6 text-sm text-amber-800" role="alert">{error}</div>}
      {loading && !error && <div className="rounded-2xl bg-white p-8 text-gray-500">Analyse du gaspillage…</div>}

      {data && !error && !invalidDates && (
        <>
          <p className="rounded-2xl bg-blue-50 px-5 py-3 text-sm text-blue-800">
            <strong>Période analysée :</strong> {periodText}. Tous les chiffres ci-dessous portent sur cette sélection.
          </p>

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Énergie gaspillée", value: `${formatNumber(data.summary.waste_kwh)} kWh`, hint: data.summary.waste_share_percent !== null ? `${formatNumber(data.summary.waste_share_percent, 1)} % de la consommation manuelle` : "", color: "text-rose-500" },
              { label: "Coût du gaspillage", value: `${formatNumber(data.summary.waste_cost)} MAD`, hint: `à ${formatNumber(data.price_per_kwh)} MAD/kWh (${settings.pricePerKwh !== null ? "tarif choisi dans Settings" : "tarif indicatif, modifiable dans Settings"})`, color: "text-rose-500" },
              { label: "Alertes détectées", value: String(data.summary.events), hint: `dont ${data.summary.high_events} de sévérité haute (≥ 3 h)`, color: "text-amber-600" },
              { label: "Heures d'éclairage inutile", value: `${formatNumber(data.summary.wasted_hours, 0)} h`, hint: `cumulées sur ${data.summary.rooms_affected} salles`, color: "text-gray-800" },
            ].map((c) => (
              <div key={c.label} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <p className="mb-3 text-sm text-gray-400">{c.label}</p>
                <p className={`text-2xl font-semibold ${c.color}`}>{c.value}</p>
                <p className="mt-2 text-xs text-gray-400">{c.hint}</p>
              </div>
            ))}
          </div>

          {data.summary.events === 0 && data.summary.waste_kwh === 0 && (
            <div className="rounded-2xl bg-emerald-50 p-5 text-sm text-emerald-800">Aucun gaspillage détecté pour cette sélection.</div>
          )}

          <section className={card}>
            <h3 className="flex items-center gap-2 font-semibold"><Flame size={18} className="text-rose-500" /> Carte de chaleur du gaspillage</h3>
            <p className="mb-5 text-xs text-gray-400">kWh gaspillés par jour de la semaine et par heure, cumulés sur la période</p>
            <Heatmap cells={data.heatmap} />
            {(() => {
              const avg = (hours: number[]) => {
                const cells = data.heatmap.filter((c) => c.day_index < 5 && hours.includes(c.hour));
                // Moyenne sur les 5 jours de semaine (les jours sans gaspillage comptent pour 0).
                return cells.length ? cells.reduce((sum, c) => sum + c.avg_rooms, 0) / (5 * hours.length) : 0;
              };
              const lunch = avg([13]);
              const evening = avg([20, 21, 22]);
              const lunchSlot = data.by_slot.find((s) => s.slot === "lunch");
              const eveningSlot = data.by_slot.find((s) => s.slot === "evening");
              if (!lunch || !evening || !lunchSlot || !eveningSlot) return null;
              return (
                <p className="mt-4 flex gap-2 text-xs text-gray-500">
                  <Info size={14} className="mt-0.5 shrink-0 text-blue-600" />
                  <span>
                    <strong>Lecture :</strong> à la pause de midi, environ {formatNumber(lunch, 0)} salles restent allumées en même temps, mais pendant 2 heures seulement :
                    les cases sont très foncées. Le soir, environ {formatNumber(evening, 0)} salles restent allumées, mais de 18h30 jusqu'au lendemain 8h30 :
                    chaque case est plus claire, mais au total le soir et la nuit gaspillent {formatNumber(eveningSlot.waste_kwh, 0)} kWh
                    contre {formatNumber(lunchSlot.waste_kwh, 0)} kWh pour la pause de midi.
                  </span>
                </p>
              );
            })()}
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className={card}>
              <h3 className="font-semibold">Gaspillage par créneau</h3>
              <p className="mb-5 text-xs text-gray-400">kWh gaspillés sur la période, chaque demi-heure étant classée selon son heure</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.by_slot} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v, _n, item) => [`${formatNumber(Number(v))} kWh · ${formatNumber(item.payload.share_percent, 1)} % · ${formatNumber(item.payload.hours, 0)} h`, "Gaspillage"]} />
                    <Bar dataKey="waste_kwh" radius={[0, 6, 6, 0]}>
                      {data.by_slot.map((s) => <Cell key={s.slot} fill={!slot || slot === s.slot ? "#E76F6F" : "#F3C4C4"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-3 flex gap-2 text-xs text-gray-500">
                <Info size={14} className="mt-0.5 shrink-0 text-blue-600" />
                <span>
                  Il n'y a pas de capteur de présence dans les données. L'occupation vient de l'emploi du temps programmé dans Shelly :
                  séances de 8h30 à 12h30 et de 14h30 à 18h30 en semaine. Une salle allumée en dehors de ces séances est comptée comme gaspillage.
                </span>
              </p>
            </section>

            <section className={card}>
              <h3 className="font-semibold">Salles qui gaspillent le plus</h3>
              <p className="mb-4 text-xs text-gray-400">Top 10 sur la période sélectionnée : salles à équiper en priorité</p>
              {data.by_room.length === 0 ? <p className="text-sm text-gray-400">Aucune salle pour cette sélection.</p> : (
                <ol className="divide-y divide-gray-100 text-sm">
                  {data.by_room.map((r, i) => (
                    <li key={r.room} className="flex items-center justify-between gap-3 py-2">
                      <span><span className="mr-2 font-semibold text-gray-400">{i + 1}.</span>{r.room} <span className="text-xs text-gray-400">· {r.floor}</span></span>
                      <span className="text-right text-xs text-gray-500">
                        <strong className="text-sm text-rose-500">{formatNumber(r.waste_kwh, 1)} kWh</strong> · {formatNumber(r.cost, 0)} MAD · {formatNumber(r.hours, 0)} h allumée inutilement
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          <section className={card}>
            <h3 className="flex items-center gap-2 font-semibold"><Clock size={18} className="text-amber-600" /> Alertes les plus coûteuses</h3>
            <p className="mb-4 text-xs text-gray-400">
              Une alerte = une salle restée allumée sans interruption en dehors des séances (au moins {duration(minDuration)}).
              Avec des modules Shelly connectés, chacune déclencherait une extinction automatique.
            </p>
            {data.events.length === 0 ? <p className="text-sm text-gray-400">Aucune alerte pour cette sélection.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-gray-400">
                    <tr><th className="py-2 pr-3">Sévérité</th><th className="pr-3">Salle</th><th className="pr-3">Début</th><th className="pr-3">Fin</th><th className="pr-3">Durée</th><th className="pr-3">Créneau principal</th><th className="pr-3 text-right">kWh</th><th className="text-right">MAD</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.events.map((e) => (
                      <tr key={`${e.room}-${e.start}`}>
                        <td className="py-2 pr-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY[e.severity]}`}>{e.severity}</span></td>
                        <td className="pr-3">{e.room}</td>
                        <td className="pr-3 text-gray-500">{dt(e.start)}</td>
                        <td className="pr-3 text-gray-500">{dt(e.end)}</td>
                        <td className="pr-3">{duration(e.duration_minutes)}</td>
                        <td className="pr-3 text-xs text-gray-500">{e.slot_label}</td>
                        <td className="pr-3 text-right">{formatNumber(e.waste_kwh)}</td>
                        <td className="text-right">{formatNumber(e.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
