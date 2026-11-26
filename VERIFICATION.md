# Verification du 10 novembre 2026

## Verifications executees

- `python -m pip check` : aucune dependance installee incoherente.
- `npm.cmd run lint` : succes avec un avertissement existant `react(set-state-in-effect)` dans `frontend/src/App.tsx:83`.
- `npm.cmd run build` : succes ; avertissement Vite sur un bundle JavaScript de 602,54 kB avant compression.
- Demarrage HTTP reel de FastAPI/Uvicorn sans reload et Vite sur 127.0.0.1 : succes.
- GET `/api/analytics/kpis`, `/daily`, `/filters` : 200, en direct et via le proxy Vite.
- Filtres batiment, etage, salle, debut, fin, puis combinaison des cinq : resultats conformes au sous-ensemble du dataset pour KPI et daily.
- Filtre sans resultat : 404 ; plage de dates inversee : 422.
- POST upload et activation de dataset : 403 par le middleware, sans modification de donnees.
- Original Excel : empreinte SHA-256 identique avant et apres les tests, voir README.
- Syntaxe du script PowerShell : valide.
- Exclusions Git des environnements, `.env` et sauvegardes : verifiees.
- Recherche textuelle des signatures courantes de jetons et cles privees : aucune correspondance dans les fichiers source inspectes. Cette recherche n'est pas une garantie exhaustive et ne couvre pas le contenu interne des classeurs.

Le premier essai API a depasse 15 secondes au chargement initial de l'Excel. Le second, avec un delai de 120 secondes, a reussi. Les serveurs crees pour les tests API ont ete arretes.

## Non execute

- Installation dans un environnement vierge ou sur un second PC ; disponibilite des versions sur les registres non certifiee.
- Verification visuelle et clics dans le navigateur : les filtres ont ete testes par HTTP.
- Creation du depot distant, invitation de collaborateurs et push : en attente de confirmation.
- Configuration de protection de branche et CI automatisee.

## Etat Git et preservation

Depot local initialise sur `main`, sans commit ni remote. Aucun fichier applicatif ni calcul energetique modifie. Les deux classeurs et les metadonnees existantes sont conserves. Le lanceur BAT precedent est sauvegarde sous `Start_ENSA_EnergyOS.bat.preparation.bak` (ignore par Git). Aucun `.env.example` artificiel ajoute : le fonctionnement actuel ne necessite pas de `.env`.

## Test final du lanceur

Cycle complet du lanceur PowerShell corrige : demarrage backend, lecture KPI, demarrage Vite et arret par Entree reussis (code de sortie 0). La sonde initiale utilise la route legere / puis une seule requete KPI pour eviter des lectures Excel concurrentes. L'arret cible uniquement les arbres des processus crees par le lanceur, y compris les enfants du Python virtuel Windows. Le premier essai du lanceur a ete interrompu apres identification de ce probleme, puis corrige et reteste.
