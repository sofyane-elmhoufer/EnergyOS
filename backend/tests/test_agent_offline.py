import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
"""Tests de l'agent SANS appeler Groq (LLM simulé) : colonnes, boucle de correction, graphiques."""

from app.api import agent  # noqa: E402
from app.services.insights_service import waste_alerts  # noqa: E402


def scripted(responses):
    calls = []

    def fake(messages, max_tokens=0):
        calls.append(messages)
        return responses[min(len(calls) - 1, len(responses) - 1)]

    return fake, calls


def main():
    df, key = agent.get_active_df()
    base = agent.load_active_dataset()
    ref = waste_alerts(base, 30, 3)
    tot = round(df["Gaspillage_kWh"].sum(), 2)
    lunch = round(df[df["Creneau"] == "Pause de midi (12h30-14h30)"]["Gaspillage_kWh"].sum(), 2)
    page_lunch = next(s["waste_kwh"] for s in ref["by_slot"] if s["slot"] == "lunch")
    print("colonnes ajoutées :", [c for c in ("Gaspillage_kWh", "Creneau") if c in df.columns], "| lignes", len(df), len(base))
    assert len(df) == len(base), "la jointure a dupliqué des lignes"
    assert abs(tot - ref["summary"]["waste_kwh"]) < 0.01, (tot, ref["summary"]["waste_kwh"])
    assert abs(lunch - page_lunch) < 0.01, (lunch, page_lunch)
    print(f"OK gaspillage total {tot} = page Alertes ; pause de midi {lunch} = page Alertes")
    print("créneaux :", df["Creneau"].value_counts().to_dict())

    # 1) Graphique invalide (mauvaises clés) puis corrigé -> doit réessayer et renvoyer un graphique valide
    bad = "```python\nt = df.groupby('Etage')['Energie_kWh'].sum().reset_index()\nprint(t)\nchart = {'type':'bar','title':'x','x':'Etage','series':['Sans_kWh'],'data':t.to_dict('records')}\n```"
    good = "```python\nt = df.groupby('Etage')['Energie_kWh'].sum().reset_index().rename(columns={'Energie_kWh':'Énergie (kWh)'})\nprint(t)\nchart = {'type':'bar','title':'x','x':'Etage','series':['Énergie (kWh)'],'data':t.round(2).to_dict('records')}\n```"
    fake, calls = scripted([bad, good, "Réponse finale (voir le graphique ci-dessous)"])
    agent.llm_invoke = fake
    res = agent.ask_dataframe("Consommation par étage, fais un graphique", df, key)
    feedback = calls[1][-1][1]
    print("\nretour envoyé au LLM :", feedback[:160])
    assert "Sans_kWh" in feedback and res["chart"] and res["chart"]["series"] == ["Énergie (kWh)"], res
    assert all(isinstance(r["Énergie (kWh)"], float) for r in res["chart"]["data"])
    print("OK graphique invalide détecté puis corrigé :", res["chart"]["data"][:2])

    # 2) Graphique demandé mais absent -> le LLM est relancé pour le produire
    nochart = "```python\nprint(df['Energie_kWh'].sum())\n```"
    fake, calls = scripted([nochart, good, "Réponse"])
    agent.llm_invoke = fake
    res = agent.ask_dataframe("Trace une courbe de la consommation", df, key)
    assert res["chart"] is not None and "graphique" in calls[1][-1][1].lower()
    print("OK graphique manquant redemandé")

    # 3) Code tronqué (bloc jamais refermé) -> extract_code le récupère sans « ``` »
    cut = "```python\nprint(round(df['Gaspillage_kWh'].sum(), 2))\n"
    assert agent.extract_code(cut) == "print(round(df['Gaspillage_kWh'].sum(), 2))"
    print("OK code tronqué récupéré")

    # 4) Valeurs non numériques dans une série -> rejet avec explication
    strcode = "```python\nt = df.groupby('Etage')['Energie_kWh'].sum().reset_index()\nt['v'] = 'abc'\nprint(t)\nchart = {'type':'bar','title':'x','x':'Etage','series':['v'],'data':t.to_dict('records')}\n```"
    fake, calls = scripted([strcode, strcode, strcode, "Réponse sans graphique"])
    agent.llm_invoke = fake
    res = agent.ask_dataframe("graphique svp", df, key)
    assert res["chart"] is None and "nombres" in calls[1][-1][1], calls[1][-1][1]
    print("OK valeurs non numériques rejetées ; réponse texte conservée :", res["reply"][:40])

    # 5) Sans graphique demandé : la réponse finale ne doit pas parler de graphique
    fake, calls = scripted([nochart, "Total : 3 699 kWh"])
    agent.llm_invoke = fake
    res = agent.ask_dataframe("Consommation totale ?", df, key)
    assert "Aucun graphique n'est affiché" in calls[-1][0][1] and res["chart"] is None
    print("OK consigne « aucun graphique » transmise")
    # 6) Contrôle anti-hallucination sur l'exemple réel observé (RDC 769,84 au lieu de 767,93)
    output = "Etage Sans Avec\nRDC 767.93 527.97\n2ème 142.84 115.11\nRéduction % 31.25"
    assert agent.unsupported_numbers("RDC : 769,84 kWh puis 529,88 kWh", output) == ["769,84", "529,88"]
    assert agent.unsupported_numbers("RDC : 767,93 kWh, 527,97 kWh, soit 31,3 % (43 salles, 2026)", output) == []
    assert agent.unsupported_numbers("Total 2 192,45 kWh", "historique : 2 192,45 kWh") == []
    assert agent.unsupported_numbers("Total 2 192,45 kWh", "2192.449") == []
    print("OK détection des nombres inventés (et tolérance d'arrondi)")

    # 7) Réponse inventée puis corrigée -> la correction est gardée
    code_ok = "```python\nprint(round(df['Energie_kWh'].sum(), 2))\n```"
    total = round(float(df["Energie_kWh"].sum()), 2)
    fake, calls = scripted([code_ok, "Total : 1234,56 kWh", f"Total : {str(total).replace('.', ',')} kWh"])
    agent.llm_invoke = fake
    res = agent.ask_dataframe("Consommation totale ?", df, key)
    assert res["reply"].startswith("Total : ") and "1234,56" not in res["reply"] and "n'existent pas" in calls[2][-1][1]
    print("OK réponse inventée -> réécriture demandée et acceptée :", res["reply"])

    # 8) Toujours inventée après réécriture -> repli sur les résultats exacts
    fake, calls = scripted([code_ok, "Total : 1234,56 kWh", "Total : 9999,99 kWh"])
    agent.llm_invoke = fake
    res = agent.ask_dataframe("Consommation totale ?", df, key)
    assert "résultats exacts" in res["reply"] and str(total) in res["reply"], res["reply"]
    print("OK repli sur les résultats bruts quand l'IA s'entête")

    agent.sandbox.close()
    print("\nTOUS LES TESTS HORS-LIGNE RÉUSSIS")


if __name__ == "__main__":
    main()
