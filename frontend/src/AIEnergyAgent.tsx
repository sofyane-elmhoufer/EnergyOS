import { ShieldCheck } from "lucide-react";
import ChatPanel from "./ChatPanel";
import { useSettings } from "./settings";

const SUGGESTIONS = [
  "Quelle salle gaspille le plus entre 12h30 et 14h30 ?",
  "Compare la consommation d'une petite salle TD et d'une salle TP",
  "Quel étage économise le plus grâce à Shelly ? Fais un graphique",
  "Consommation par jour de la semaine, avec et sans Shelly",
];

export default function AIEnergyAgent() {
  const { showSuggestions } = useSettings();
  return (
    <div className="mx-auto max-w-5xl">
      <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-5">
          <h3 className="font-semibold">Posez une question sur la consommation de l'ENSA Fès</h3>
          <p className="mt-1 text-xs text-gray-400">
            L'agent calcule la réponse sur les vraies données du dataset et peut tracer un graphique.
            Vous pouvez aussi joindre un fichier (Excel, CSV, Word) ou la photo d'une facture d'électricité.
          </p>
        </div>
        <ChatPanel
          endpoint="chat"
          allowFiles
          suggestions={showSuggestions ? SUGGESTIONS : []}
          placeholder="Ex : Quelle salle a consommé le plus d'énergie le week-end ?"
        />
        <p className="mt-4 flex gap-2 text-xs text-gray-400">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-600" />
          Le code généré par l'IA est vérifié puis exécuté dans un environnement isolé, sans accès aux fichiers ni au réseau.
          Les fichiers joints ne sont pas conservés.
        </p>
      </section>
    </div>
  );
}
