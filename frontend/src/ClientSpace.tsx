import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Bot, Calculator, ChevronDown, Download, FileText, Info, Mail, Phone, Plus, Trash2, TriangleAlert,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { getJSON, postJSON } from "./api";
import ChatPanel from "./ChatPanel";
import { downloadDevis } from "./devisPdf";
import {
  COMPANY, fmt, formatPayback, newDevisReference,
  type ClientInfo, type Estimate, type SimulationOptions, type SimulationRequest,
} from "./simulation";

type ApplianceRow = { id: number; type: string; quantity: string; power_w: string; hours_per_day: string };
type FormState = {
  monthly_bill: string;
  building_type: string;
  city: string;
  tariff_mode: "flat" | "tiered";
  // Paramètres avancés : vides = valeurs par défaut.
  days_per_month: string;
  price_per_kwh: string;
  module_price: string;
  installation_price: string;
};

const inputClass = "mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-700 outline-none focus:border-blue-500";
const smallInput = "w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-700 outline-none focus:border-blue-500";
const labelClass = "block text-xs font-medium text-gray-500";
const cardClass = "rounded-3xl border border-gray-100 bg-white p-6 shadow-sm";

const WARNINGS: Record<string, string> = {
  appliances_capped_to_bill: "D'après vos appareils, la consommation dépasserait votre facture totale. Les consommations ont été ramenées au niveau de la facture : vérifiez les quantités, puissances et heures.",
  tiers_are_residential: "La grille par tranches est la grille résidentielle : pour un bâtiment professionnel, préférez le prix moyen ou saisissez le prix de votre facture.",
  custom_price_overrides_tiers: "Vous avez saisi un prix du kWh : il remplace la grille par tranches.",
  payback_beyond_horizon: "Le retour sur investissement dépasse 5 ans : commencez par les appareils les plus rentables du tableau ci-dessous.",
};

let nextId = 1;
const newRow = (type = "lighting"): ApplianceRow => ({ id: nextId++, type, quantity: "", power_w: "", hours_per_day: "" });
const num = (value: string) => {
  const cleaned = value.trim().replace(",", ".");
  return cleaned ? Number(cleaned) : undefined;
};

function Results({ estimate, request, client, reference }: {
  estimate: Estimate; request: SimulationRequest; client: ClientInfo; reference: string;
}) {
  const [pdfError, setPdfError] = useState("");
  const [generating, setGenerating] = useState(false);
  const { monthly, yearly, inputs, assumptions, investment, currency } = estimate;

  const cards = [
    { label: "Facture actuelle", value: `${fmt(monthly.bill_without_shelly)} ${currency}`, hint: "par mois, sans Shelly", color: "text-rose-500" },
    { label: "Facture avec Shelly", value: `${fmt(monthly.bill_with_shelly)} ${currency}`, hint: `-${fmt(monthly.bill_reduction_percent, 1)} % par mois`, color: "text-blue-600" },
    { label: "Économie annuelle", value: `${fmt(yearly.saved_cost)} ${currency}`, hint: `${fmt(yearly.saved_kwh, 0)} kWh évités par an`, color: "text-emerald-600" },
    { label: "Retour sur investissement", value: formatPayback(investment.payback_months), hint: `investissement ≈ ${fmt(investment.total, 0)} ${currency}`, color: "text-amber-600" },
  ];

  const months = investment.years * 12;
  const cashflow = useMemo(
    () => Array.from({ length: months + 1 }, (_, m) => ({ mois: m, gain: Math.round(monthly.saved_cost * m - investment.total) })),
    [months, monthly.saved_cost, investment.total],
  );
  const sorted = [...estimate.appliances].sort((a, b) => a.priority - b.priority);
  const consumption = sorted.map((a) => ({ name: a.label.split(" (")[0], sans: a.monthly_kwh, avec: a.monthly_kwh - a.saved_kwh }));

  const mailto = `mailto:${COMPANY.email}?subject=${encodeURIComponent(`Demande d'installation Shelly - ${reference}`)}&body=${encodeURIComponent(
    `Bonjour,\n\nSuite à ma simulation ${reference} (${inputs.building_label}, ${inputs.city_label}, `
    + `facture de ${fmt(inputs.monthly_bill)} ${currency}/mois, ${investment.modules} modules estimés), `
    + "je souhaite être recontacté pour une visite technique et un prix d'installation.\n\nCordialement,\n"
    + (client.name || ""),
  )}`;

  const handleDownload = async () => {
    setPdfError("");
    setGenerating(true);
    try {
      await downloadDevis(estimate, client, reference);
    } catch {
      setPdfError("La génération du PDF a échoué. Réessayez.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {estimate.warnings.map((code) => WARNINGS[code] && (
        <div key={code} className="flex gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800" role="alert">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" />
          <p>{WARNINGS[code]}</p>
        </div>
      ))}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <p className="mb-3 text-sm text-gray-400">{card.label}</p>
            <p className={`text-2xl font-semibold ${card.color}`}>{card.value}</p>
            <p className="mt-2 text-xs text-gray-400">{card.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className={cardClass}>
          <h3 className="font-semibold">Rentabilité sur {investment.years} ans</h3>
          <p className="mb-6 text-xs text-gray-400">
            Gain cumulé ({currency}) = économies - investissement. Gain net à {investment.years} ans :{" "}
            <strong className={investment.net_gain >= 0 ? "text-emerald-600" : "text-rose-500"}>{fmt(investment.net_gain, 0)} {currency}</strong>
            {investment.roi_percent !== null && ` (${fmt(investment.roi_percent, 0)} %)`}
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cashflow} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="mois" tick={{ fontSize: 11 }} ticks={[0, 12, 24, 36, 48, 60]} tickFormatter={(m) => `${m / 12} an${m > 12 ? "s" : ""}`} />
                <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v) => fmt(Number(v), 0)} />
                <Tooltip formatter={(v) => [`${fmt(Number(v), 0)} ${currency}`, "Gain cumulé"]} labelFormatter={(m) => `Mois ${m}`} />
                <ReferenceLine y={0} stroke="#9CA3AF" />
                <Line type="monotone" dataKey="gain" stroke="#10B981" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className={cardClass}>
          <h3 className="font-semibold">Consommation par appareil</h3>
          <p className="mb-6 text-xs text-gray-400">kWh par mois, avant / après Shelly</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={consumption} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                <YAxis tick={{ fontSize: 11 }} width={55} />
                <Tooltip formatter={(v, n) => [`${fmt(Number(v), 1)} kWh`, String(n)]} />
                <Legend />
                <Bar dataKey="sans" name="Sans Shelly" fill="#E76F6F" radius={[6, 6, 0, 0]} />
                <Bar dataKey="avec" name="Avec Shelly" fill="#007AFF" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className={cardClass}>
        <h3 className="font-semibold">Plan d'action recommandé</h3>
        <p className="mb-4 text-xs text-gray-400">Classé par rentabilité : équipez d'abord les appareils au retour sur investissement le plus court.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-gray-400">
              <tr>
                <th className="py-2 pr-3">#</th><th className="pr-3">Appareil</th><th className="pr-3 text-right">kWh/mois</th>
                <th className="pr-3 text-right">Économie</th><th className="pr-3 text-right">{currency}/mois</th>
                <th className="pr-3 text-right">Modules</th><th className="pr-3 text-right">Invest.</th><th className="text-right">Retour</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((a) => (
                <tr key={`${a.type}-${a.priority}`} className="align-top">
                  <td className="py-3 pr-3 font-semibold text-blue-600">{a.priority}</td>
                  <td className="py-3 pr-3">
                    <p className="font-medium">{a.label} × {a.quantity}</p>
                    <p className="text-xs text-gray-400">{a.action} <span className="text-gray-300">· {a.module}</span></p>
                  </td>
                  <td className="py-3 pr-3 text-right">{fmt(a.monthly_kwh, 0)}</td>
                  <td className="py-3 pr-3 text-right">{fmt(a.savings_percent, 0)} %{a.measured && <span title="Taux mesuré sur les données ENSA Fès" className="ml-1 text-emerald-600">★</span>}</td>
                  <td className="py-3 pr-3 text-right font-medium text-emerald-600">{fmt(a.saved_cost)}</td>
                  <td className="py-3 pr-3 text-right">{a.modules}</td>
                  <td className="py-3 pr-3 text-right">{fmt(a.investment, 0)}</td>
                  <td className="py-3 text-right">{formatPayback(a.payback_months)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 flex gap-2 text-xs text-gray-400">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>
            ★ Éclairage : taux de {fmt(assumptions.reference_savings_percent, 1)} % mesuré sur les données ENSA Fès (simulées), pondéré par {fmt(assumptions.savings_factor, 2)} pour « {inputs.building_label} ».
            Autres appareils : taux indicatifs. {inputs.tariff_mode === "tiered"
              ? `Tarif ONEE par tranches (TVA ${fmt((assumptions.tariff_tax_rate ?? 0) * 100, 0)} % incluse) : tranche ${monthly.tranche_without_shelly} sans Shelly`
                + (monthly.tranche_with_shelly !== monthly.tranche_without_shelly ? `, tranche ${monthly.tranche_with_shelly} avec Shelly (le prix de tous vos kWh baisse)` : ", même tranche avec Shelly")
                + ` ; chaque kWh économisé vaut en moyenne ${fmt(monthly.marginal_price_per_kwh ?? 0, 2)} ${currency}.`
              : `Prix retenu : ${fmt(inputs.price_per_kwh ?? 0, 2)} ${currency}/kWh (${inputs.distributor}, indicatif).`}
            {" "}Module : {fmt(inputs.module_price, 0)} {currency} + pose {fmt(inputs.installation_price, 0)} {currency} (indicatif). Les appareils déclarés représentent {fmt(monthly.covered_share_percent, 0)} % de la facture.
          </span>
        </p>
      </section>

      <section className={cardClass}>
        <h3 className="flex items-center gap-2 font-semibold"><Bot size={18} className="text-blue-600" /> Votre conseiller énergétique IA</h3>
        <p className="mb-4 text-xs text-gray-400">Posez vos questions sur cette simulation : l'IA s'appuie sur vos chiffres pour vous conseiller.</p>
        <ChatPanel
          endpoint="advice"
          extraBody={{ simulation: request }}
          placeholder="Ex : Par quoi dois-je commencer avec un budget de 2000 MAD ?"
          suggestions={[
            "Quel appareil dois-je équiper en premier ?",
            "Comment réduire encore ma facture ?",
            "Explique-moi le retour sur investissement",
            "Quels horaires programmer pour mes appareils ?",
          ]}
        />
      </section>

      <section className="rounded-3xl bg-blue-600 p-7 text-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="max-w-xl">
            <h3 className="flex items-center gap-2 text-lg font-semibold"><FileText size={20} /> Votre devis est prêt</h3>
            <p className="mt-2 text-sm text-blue-100">
              Référence {reference}. Téléchargez le récapitulatif de votre simulation, puis contactez-nous :
              le prix définitif est fixé ensemble après une visite technique de votre bâtiment.
            </p>
            <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-blue-100">
              <span className="inline-flex items-center gap-2"><Mail size={14} /> {COMPANY.email}</span>
              <span className="inline-flex items-center gap-2"><Phone size={14} /> {COMPANY.phone}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={handleDownload} disabled={generating}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60">
              <Download size={16} /> {generating ? "Génération…" : "Télécharger le devis (PDF)"}
            </button>
            <a href={mailto}
              className="inline-flex items-center gap-2 rounded-xl border border-white/60 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10">
              <Mail size={16} /> Nous contacter
            </a>
          </div>
        </div>
        {pdfError && <p role="alert" className="mt-4 text-sm text-amber-200">{pdfError}</p>}
      </section>
    </div>
  );
}

export default function ClientSpace() {
  const [options, setOptions] = useState<SimulationOptions | null>(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState<FormState>({
    monthly_bill: "", building_type: "office", city: "fes", tariff_mode: "flat",
    days_per_month: "", price_per_kwh: "", module_price: "", installation_price: "",
  });
  const [rows, setRows] = useState<ApplianceRow[]>(() => [newRow("lighting")]);
  const [client, setClient] = useState<ClientInfo>({ name: "", company: "", email: "", phone: "" });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [result, setResult] = useState<{ estimate: Estimate; request: SimulationRequest; reference: string; client: ClientInfo } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    getJSON<SimulationOptions>("/api/simulation/options", controller.signal)
      .then(setOptions)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setLoadError(err instanceof Error ? err.message : "Erreur de chargement.");
      });
    return () => controller.abort();
  }, []);

  const building = options?.building_types.find((item) => item.id === form.building_type);
  const city = options?.cities.find((item) => item.id === form.city);
  const defaultPrice = building && city ? city[building.tariff] : undefined;
  const typeOf = (id: string) => options?.appliance_types.find((t) => t.id === id);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const updateRow = (id: number, key: keyof ApplianceRow, value: string) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, [key]: value } : row)));
  const updateClient = (key: keyof ClientInfo, value: string) => setClient((current) => ({ ...current, [key]: value }));

  const onBuildingChange = (id: string) => {
    update("building_type", id);
    const b = options?.building_types.find((item) => item.id === id);
    update("tariff_mode", b?.tariff === "residential" ? "tiered" : "flat");
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const appliances = rows
      .filter((row) => row.quantity.trim())
      .map((row) => ({
        type: row.type,
        quantity: Math.round(num(row.quantity) ?? 0),
        power_w: num(row.power_w),
        hours_per_day: num(row.hours_per_day),
      }));
    if (appliances.length === 0) {
      setError("Ajoutez au moins un appareil avec sa quantité.");
      return;
    }
    const request: SimulationRequest = {
      monthly_bill: num(form.monthly_bill) ?? 0,
      building_type: form.building_type,
      city: form.city,
      tariff_mode: form.tariff_mode,
      appliances,
      price_per_kwh: num(form.price_per_kwh),
      days_per_month: num(form.days_per_month),
      module_price: num(form.module_price),
      installation_price: num(form.installation_price),
    };
    setSubmitting(true);
    try {
      const estimate = await postJSON<Estimate>("/api/simulation/estimate", request);
      setResult({ estimate, request, reference: newDevisReference(), client: { ...client } });
    } catch (err: unknown) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <div className="rounded-2xl bg-red-50 p-6 text-red-600" role="alert">
        {loadError}
        <p className="mt-2 text-sm">Vérifie que le serveur FastAPI tourne sur le port 8000.</p>
      </div>
    );
  }
  if (!options) return <div className="rounded-2xl bg-white p-8 text-gray-500">Chargement du simulateur…</div>;

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className={cardClass}>
        <div className="mb-6 flex items-center gap-3">
          <Calculator size={20} className="text-blue-600" />
          <div>
            <h3 className="font-semibold">Simulez vos économies avec Shelly</h3>
            <p className="text-xs text-gray-400">
              Décrivez votre bâtiment et vos appareils : nous estimons votre nouvelle facture, le retour sur investissement et vous remettons un devis PDF.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className={labelClass}>Type de bâtiment
            <select className={inputClass} value={form.building_type} onChange={(e) => onBuildingChange(e.target.value)}>
              {options.building_types.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label className={labelClass}>Ville
            <select className={inputClass} value={form.city} onChange={(e) => update("city", e.target.value)}>
              {options.cities.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label className={labelClass}>Facture d'électricité mensuelle ({options.currency})
            <input className={inputClass} type="number" inputMode="decimal" min="1" max="100000000" step="any" required
              placeholder="Ex : 1200" value={form.monthly_bill} onChange={(e) => update("monthly_bill", e.target.value)} />
          </label>
          <label className={labelClass}>Mode de tarification
            <select className={inputClass} value={form.tariff_mode} onChange={(e) => update("tariff_mode", e.target.value as FormState["tariff_mode"])}>
              <option value="flat">Prix moyen du kWh</option>
              <option value="tiered">Tranches résidentielles (ONEE)</option>
            </select>
          </label>
        </div>
        {building && (
          <p className="mt-3 flex gap-2 text-xs text-gray-500">
            <Info size={14} className="mt-0.5 shrink-0 text-blue-600" />
            <span>
              <strong>« {building.label} »</strong> fixe les valeurs par défaut : éclairage {building.hours_per_day} h/jour,
              {" "}{building.days_per_month} jours d'utilisation par mois, tarif {building.tariff === "residential" ? "résidentiel" : "professionnel"},
              {" "}et un coefficient de {fmt(building.savings_factor, 2)} appliqué au taux d'économie d'éclairage mesuré à l'ENSA
              ({fmt(options.reference_savings_percent, 1)} % → {fmt(options.reference_savings_percent * building.savings_factor, 1)} %).
              {building.savings_factor < 1 && " Le coefficient est plus faible car une partie de l'éclairage reste utile en permanence (couloirs, vitrines, chambres…)."}
            </span>
          </p>
        )}
        {city && form.tariff_mode === "flat" && (
          <p className="mt-2 text-xs text-gray-400">
            Distributeur : {city.distributor} · prix moyen retenu : {defaultPrice !== undefined ? fmt(defaultPrice, 2) : "—"} {options.currency}/kWh TTC
            (indicatif : saisissez le prix exact de votre facture dans les paramètres avancés).
          </p>
        )}
        {form.tariff_mode === "tiered" && (
          <div className="mt-3 rounded-2xl bg-gray-50 p-4 text-xs text-gray-600">
            <p className="mb-2 font-semibold text-gray-700">Comment fonctionnent les tranches ONEE (tarif résidentiel)</p>
            <div className="flex flex-wrap gap-2">
              {options.residential_tranches.map((t, i) => {
                const lower = i === 0 ? 0 : (options.residential_tranches[i - 1].up_to_kwh ?? 0) + 1;
                return (
                  <span key={i} className="rounded-lg bg-white px-2 py-1 shadow-sm">
                    {t.up_to_kwh === null ? `> ${lower - 1}` : `${lower}–${t.up_to_kwh}`} kWh : <strong>{fmt(t.price_ht, 4)}</strong> MAD HT
                  </span>
                );
              })}
            </div>
            <p className="mt-2">
              Jusqu'à {options.progressive_limit_kwh} kWh par mois, chaque tranche est payée à son prix. <strong>Au-delà de {options.progressive_limit_kwh} kWh,
              toute la consommation du mois est payée au prix de la tranche atteinte</strong> : descendre d'une tranche fait baisser le prix de tous les kWh.
              TVA {fmt(options.tariff_tax_rate * 100, 0)} % ajoutée ; redevances fixes non incluses.
              Source : grille officielle ONEE (vérifiez votre facture : certaines SRM appliquent une grille différente).
            </p>
          </div>
        )}

        <div className="mt-6">
          <p className="mb-2 text-sm font-semibold text-gray-700">Vos appareils</p>
          <div className="space-y-2">
            <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 text-xs text-gray-400 sm:grid">
              <span>Type</span><span>Quantité</span><span>Puissance (W)</span><span>Heures / jour</span><span className="w-9" />
            </div>
            {rows.map((row) => {
              const spec = typeOf(row.type);
              const defaultHours = spec?.hours_per_day ?? building?.hours_per_day;
              return (
                <div key={row.id} className="grid grid-cols-2 gap-2 rounded-xl bg-gray-50 p-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:bg-transparent sm:p-0">
                  <select aria-label="Type d'appareil" className={`${smallInput} col-span-2 sm:col-span-1`} value={row.type} onChange={(e) => updateRow(row.id, "type", e.target.value)}>
                    {options.appliance_types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                  <input aria-label="Quantité" className={smallInput} type="number" min="1" max="1000000" step="1" placeholder={`Nb de ${spec?.unit ?? "appareils"}s`}
                    value={row.quantity} onChange={(e) => updateRow(row.id, "quantity", e.target.value)} />
                  <input aria-label="Puissance en watts" className={smallInput} type="number" min="0.1" max="50000" step="any" placeholder={`${spec?.power_w ?? ""} W${row.type === "standby" ? " (veille)" : ""}`}
                    value={row.power_w} onChange={(e) => updateRow(row.id, "power_w", e.target.value)} />
                  <input aria-label="Heures par jour" className={smallInput} type="number" min="0.1" max="24" step="any" placeholder={`${defaultHours ?? ""} h`}
                    value={row.hours_per_day} onChange={(e) => updateRow(row.id, "hours_per_day", e.target.value)} />
                  <button type="button" aria-label="Retirer l'appareil" disabled={rows.length === 1}
                    onClick={() => setRows((current) => current.filter((r) => r.id !== row.id))}
                    className="justify-self-end rounded-lg p-2 text-gray-400 hover:text-rose-600 disabled:opacity-30">
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
          <button type="button" disabled={rows.length >= 30}
            onClick={() => setRows((current) => [...current, newRow(options.appliance_types.find((t) => !current.some((r) => r.type === t.id))?.id ?? "other")])}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-2 text-sm text-gray-600 hover:bg-gray-200">
            <Plus size={15} /> Ajouter un appareil
          </button>
          <p className="mt-2 text-xs text-gray-400">Laissez puissance et heures vides pour utiliser les valeurs typiques affichées en gris.</p>
          <details className="mt-3 rounded-2xl bg-gray-50 p-4 text-xs text-gray-600">
            <summary className="cursor-pointer font-semibold text-gray-700">D'où viennent ces valeurs ? Comment le calcul est fait</summary>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li><strong>Consommation d'un appareil</strong> = quantité × puissance (W) × heures par jour × jours par mois ÷ 1000 (en kWh). C'est un calcul exact <em>si</em> vous saisissez vos vraies valeurs (étiquette de l'appareil, notice).</li>
              <li><strong>Valeurs par défaut</strong> (en gris) : puissances <em>typiques</em> du marché (LED 18 W, climatiseur 1 200 W, chauffe-eau 1 500 W, veille 8 W…). Ce sont des moyennes, pas des mesures de votre bâtiment.</li>
              <li><strong>Économie sur l'éclairage</strong> : taux <em>mesuré</em> sur les données ENSA Fès ({fmt(options.reference_savings_percent, 1)} %, données simulées), ajusté selon le type de bâtiment.</li>
              <li><strong>Économie des autres appareils</strong> : hypothèses <em>indicatives</em> (climatiseur 20 %, chauffe-eau 25 %, radiateur 20 %, veille 90 %, ventilation 15 %, autre 10 %), à confirmer par des mesures.</li>
              <li><strong>La facture fait foi</strong> : si vos appareils dépassent la consommation de la facture, ils sont ramenés au niveau de la facture.</li>
              <li><strong>Investissement</strong> : modules × (prix du module + pose), valeurs indicatives modifiables dans les paramètres avancés.</li>
            </ul>
          </details>
        </div>

        <button type="button" onClick={() => setShowAdvanced((open) => !open)} aria-expanded={showAdvanced}
          className="mt-5 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800">
          <ChevronDown size={16} className={`transition ${showAdvanced ? "rotate-180" : ""}`} />
          Paramètres avancés et coordonnées (facultatif)
        </button>

        {showAdvanced && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <label className={labelClass}>Jours d'utilisation par mois
                <input className={inputClass} type="number" min="1" max="31" step="any"
                  placeholder={building ? String(building.days_per_month) : ""} value={form.days_per_month} onChange={(e) => update("days_per_month", e.target.value)} />
              </label>
              <label className={labelClass}>Prix du kWh sur votre facture ({options.currency})
                <input className={inputClass} type="number" min="0.01" max="100" step="any"
                  placeholder={defaultPrice !== undefined ? String(defaultPrice) : ""} value={form.price_per_kwh} onChange={(e) => update("price_per_kwh", e.target.value)} />
              </label>
              <label className={labelClass}>Prix d'un module Shelly ({options.currency})
                <input className={inputClass} type="number" min="0" max="100000" step="any"
                  placeholder={String(options.default_module_price)} value={form.module_price} onChange={(e) => update("module_price", e.target.value)} />
              </label>
              <label className={labelClass}>Pose par module ({options.currency})
                <input className={inputClass} type="number" min="0" max="100000" step="any"
                  placeholder={String(options.default_installation_price)} value={form.installation_price} onChange={(e) => update("installation_price", e.target.value)} />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <label className={labelClass}>Nom et prénom
                <input className={inputClass} type="text" autoComplete="name" maxLength={80}
                  value={client.name} onChange={(e) => updateClient("name", e.target.value)} />
              </label>
              <label className={labelClass}>Société / établissement
                <input className={inputClass} type="text" autoComplete="organization" maxLength={80}
                  value={client.company} onChange={(e) => updateClient("company", e.target.value)} />
              </label>
              <label className={labelClass}>E-mail
                <input className={inputClass} type="email" autoComplete="email" maxLength={80}
                  value={client.email} onChange={(e) => updateClient("email", e.target.value)} />
              </label>
              <label className={labelClass}>Téléphone
                <input className={inputClass} type="tel" autoComplete="tel" maxLength={30}
                  value={client.phone} onChange={(e) => updateClient("phone", e.target.value)} />
              </label>
            </div>
            <p className="text-xs text-gray-400">
              Vos coordonnées servent uniquement à personnaliser le devis PDF : elles restent dans votre navigateur et ne sont jamais envoyées au serveur.
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button type="submit" disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            <Calculator size={16} /> {submitting ? "Calcul en cours…" : "Lancer la simulation"}
          </button>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>
      </form>

      {result && <Results key={result.reference} estimate={result.estimate} request={result.request} client={result.client} reference={result.reference} />}
    </div>
  );
}
