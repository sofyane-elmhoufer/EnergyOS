// Portefeuille clients (commercial, administrateur).
import { useEffect, useState } from "react";
import { ChevronRight, Mail, Phone, Search } from "lucide-react";
import { getJSON } from "./api";
import { StatusBadge } from "./MySpace";
import { day } from "./projects";
import { fmt } from "./simulation";
import UserDetail from "./UserDetail";

type ClientRow = {
  id: number; name: string; email: string; phone: string; company: string; active: boolean;
  created_at: string; last_login_at: string | null;
  projects: number; open_projects: number; installed: number; best_yearly_saving: number; last_status: string | null;
  last_simulation: { reference: string; created_at: string; building_label: string; city_label: string; monthly_bill: number; yearly_saved_cost: number } | null;
};

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    getJSON<ClientRow[]>("/api/users/clients").then(setClients).catch((e: unknown) => setError(e instanceof Error ? e.message : "Erreur."));
  }, [reload]);
  const q = query.trim().toLowerCase();
  const shown = (clients ?? []).filter((c) => !q || [c.name, c.email, c.company, c.phone].some((v) => v.toLowerCase().includes(q)));

  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">{clients ? `${clients.length} client${clients.length > 1 ? "s" : ""} inscrit${clients.length > 1 ? "s" : ""}` : "Chargement…"}</p>
        <div className="relative w-full max-w-xs">
          <Search size={15} className="absolute left-3 top-3 text-gray-400" />
          <input aria-label="Rechercher un client" className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500"
            placeholder="Nom, société, e-mail…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {clients && shown.length === 0 && <p className="text-sm text-gray-500">Aucun client.</p>}
      {shown.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-gray-400">
              <tr><th className="py-2 pr-3">Client</th><th className="pr-3">Contact</th><th className="pr-3 text-right">Dossiers</th>
                <th className="pr-3">Dernière simulation</th><th className="pr-3">Dernier statut</th><th className="pr-3">Inscrit le</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map((c) => (
                <tr key={c.id} onClick={() => setOpen(c.id)} className={`cursor-pointer hover:bg-gray-50 ${c.active ? "" : "opacity-50"}`}>
                  <td className="py-3 pr-3"><p className="font-medium">{c.name}</p>{c.company && <p className="text-xs text-gray-400">{c.company}</p>}</td>
                  <td className="py-3 pr-3 text-xs">
                    <a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-gray-600 hover:text-blue-600"><Mail size={12} /> {c.email}</a>
                    {c.phone && <a href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()} className="mt-1 flex items-center gap-1 text-gray-600 hover:text-blue-600"><Phone size={12} /> {c.phone}</a>}
                  </td>
                  <td className="py-3 pr-3 text-right">{c.projects}<p className="text-xs text-gray-400">{c.open_projects} en cours · {c.installed} installé{c.installed > 1 ? "s" : ""}</p></td>
                  <td className="py-3 pr-3">{c.last_simulation ? (
                    <><p>{c.last_simulation.building_label}, {c.last_simulation.city_label}</p>
                      <p className="text-xs text-gray-400">{day(c.last_simulation.created_at)} · <span className="text-emerald-600">{fmt(c.last_simulation.yearly_saved_cost, 0)} MAD/an</span></p></>
                  ) : <span className="text-xs text-gray-400">—</span>}</td>
                  <td className="py-3 pr-3">{c.last_status ? <StatusBadge status={c.last_status} /> : <span className="text-xs text-gray-400">Aucune simulation</span>}</td>
                  <td className="py-3 pr-3 text-gray-500">{day(c.created_at)}</td>
                  <td className="py-3 text-gray-300"><ChevronRight size={16} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-xs text-gray-400">Cliquez sur un client pour ouvrir sa fiche : coordonnées, toutes ses simulations et devis, suivi de ses dossiers.</p>
      {open !== null && <UserDetail userId={open} onClose={() => setOpen(null)} onChanged={() => setReload((n) => n + 1)} />}
    </section>
  );
}
