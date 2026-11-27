// Journal d'activité (administrateur) : connexions, comptes, dossiers.
import { useEffect, useState } from "react";
import { History, RefreshCw } from "lucide-react";
import { getJSON } from "./api";

type AuditEntry = { id: number; created_at: string; actor_name: string; action: string; target: string; details: string; ip: string };

const ACTIONS: Record<string, { label: string; className: string }> = {
  "auth.login": { label: "Connexion", className: "bg-gray-100 text-gray-600" },
  "auth.failed": { label: "Connexion refusée", className: "bg-rose-50 text-rose-700" },
  "auth.register": { label: "Inscription", className: "bg-blue-50 text-blue-700" },
  "user.create": { label: "Compte créé", className: "bg-emerald-50 text-emerald-700" },
  "user.update": { label: "Compte modifié", className: "bg-amber-50 text-amber-800" },
  "user.logout": { label: "Déconnexion forcée", className: "bg-amber-50 text-amber-800" },
  "user.delete": { label: "Compte supprimé", className: "bg-rose-50 text-rose-700" },
  "project.status": { label: "Dossier : statut", className: "bg-violet-50 text-violet-700" },
  "project.delete": { label: "Dossier supprimé", className: "bg-rose-50 text-rose-700" },
};
const when = (iso: string) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState("");
  const [action, setAction] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getJSON<AuditEntry[]>(`/api/users/audit?limit=300${action ? `&action=${action}` : ""}`, controller.signal)
      .then((data) => { setEntries(data); setError(""); })
      .catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Erreur."); });
    return () => controller.abort();
  }, [action, reload]);

  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-gray-500"><History size={16} className="text-blue-600" /> Les 300 derniers événements (connexions, comptes, dossiers). Les mots de passe ne sont jamais enregistrés.</p>
        <div className="flex gap-2">
          <select aria-label="Filtrer par type d'événement" className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Tous les événements</option>
            {Object.entries(ACTIONS).map(([id, a]) => <option key={id} value={id}>{a.label}</option>)}
          </select>
          <button type="button" onClick={() => setReload((n) => n + 1)} aria-label="Actualiser" className="rounded-lg bg-gray-100 p-2 text-gray-500 hover:bg-gray-200"><RefreshCw size={16} /></button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {entries === null && !error && <p className="text-sm text-gray-400">Chargement…</p>}
      {entries?.length === 0 && <p className="text-sm text-gray-500">Aucun événement.</p>}
      {entries && entries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-gray-400"><tr><th className="py-2 pr-3">Date</th><th className="pr-3">Événement</th><th className="pr-3">Par</th><th className="pr-3">Concerne</th><th className="pr-3">Détails</th><th>IP</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((e) => {
                const a = ACTIONS[e.action] ?? { label: e.action, className: "bg-gray-100 text-gray-600" };
                return (
                  <tr key={e.id}>
                    <td className="py-2.5 pr-3 whitespace-nowrap text-gray-500">{when(e.created_at)}</td>
                    <td className="py-2.5 pr-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${a.className}`}>{a.label}</span></td>
                    <td className="py-2.5 pr-3">{e.actor_name || "—"}</td>
                    <td className="py-2.5 pr-3 text-gray-600">{e.target}</td>
                    <td className="py-2.5 pr-3 text-gray-500">{e.details}</td>
                    <td className="py-2.5 text-xs text-gray-400">{e.ip}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
