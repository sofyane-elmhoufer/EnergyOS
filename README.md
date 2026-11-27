# ENSA EnergyOS

Plateforme Smart Campus de suivi et de simulation de consommation electrique de l'ENSA Fes. Les donnees sont simulees ; les graphiques comparent les configurations avec et sans Shelly.

## Architecture

- `frontend/` : React, TypeScript, Vite, Tailwind CSS, Recharts, Lucide et React Router.
- `backend/app/api/` : routes FastAPI Analytics et datasets.
- `backend/app/services/` : chargement, validation, filtres et calculs energetiques.
- `backend/data/originals/` : dataset Excel original indispensable, a ne jamais modifier.
- `backend/data/versions/` et `metadata/` : archive et metadonnees existantes.
- `Start_ENSA_EnergyOS.bat` / `Start_ENSA_EnergyOS.ps1` : lancement local Windows.

Les requetes React passent toutes par le proxy Vite (aucune URL absolue). Vite ne transmet a FastAPI (`127.0.0.1:8000`) que les routes utilisees par l'interface : `analytics/(kpis|daily|filters|alerts|forecast)`, `simulation/(options|estimate|send-devis)`, `agent/(chat|chat-file|advice)`, `status`, ainsi que les comptes : `auth/(login|register|logout|me|password|roles)`, `users` et `projects`. Ne pas exposer les serveurs via `0.0.0.0`, un tunnel ou un proxy public. Copier `backend/.env.example` en `backend/.env` pour configurer la cle Groq de l'agent IA et, si besoin, le compte SMTP d'envoi des devis.

## Modules

- **Overview / Energy Analytics** : KPI et courbes avec / sans Shelly, filtres.
- **Alertes & Gaspillage** : detection des creneaux ou les lampes restent allumees inutilement (pause de midi, soir, week-end), carte de chaleur jour x heure, classement des salles, alertes par severite.
- **Previsions** : prevision journaliere par profil de jour de semaine, fourchette min / max, projection fin de mois et annuelle, precision mesuree sur les 7 derniers jours.
- **AI Energy Agent** : conversation avec historique, graphiques generes, fichiers joints (Excel, CSV, Word, photo de facture).
- **Espace Client** : inventaire d'appareils (eclairage, climatisation, chauffe-eau, veille...), tarif moyen ou par tranches, retour sur investissement, plan d'action classe par rentabilite, conseiller IA, devis PDF telechargeable et envoye automatiquement par e-mail quand le client a saisi son adresse (compte SMTP a configurer dans `backend/.env`, par exemple Gmail avec un mot de passe d'application).

- **Comptes et profils** : connexion, inscription des clients, 5 profils (voir ci-dessous), espace client, suivi des dossiers, gestion des utilisateurs.
- **Application mobile** : Android et iOS avec Capacitor, a partir du meme code (voir [MOBILE.md](MOBILE.md)).
- **Modules Shelly reels** : non connectes pour l'instant (donnees simulees) ; integration prevue a la reception du materiel.

## Comptes et profils

Le site a deux interfaces : l'**Espace client** (invite, client ; menu lateral clair) et l'**Administration** (commercial, technicien, administrateur ; menu lateral sombre). Chaque profil a son propre tableau de bord et ne voit que ses pages.

| Profil | Interface | Pages |
|---|---|---|
| Invite (sans compte) | Espace client | Accueil (vitrine du campus), Simulation et devis PDF, Parametres |
| Client | Espace client | Tableau de bord (suivi de son projet etape par etape), Simulation (enregistree automatiquement), Mes devis, Conseiller IA (repond a partir de ses simulations enregistrees), Parametres (dont son compte : profil et mot de passe) |
| Commercial | Administration | Tableau de bord (a contacter, en negociation, signes, taux de transformation), Dossiers clients, Clients (avec fiche client : simulations, devis, suivi), Simulation, Mon compte |
| Technicien | Administration | Tableau de bord (interventions, campus, etat du systeme), Interventions, Campus, Energy Analytics, Alertes & Gaspillage, Previsions, AI Energy Agent, Mon compte |
| Administrateur | Administration | Tout : tableau de bord global (dernieres simulations, activite recente, derniers inscrits), dossiers (dont suppression), clients avec fiche complete (coordonnees, toutes les simulations et devis, suivi, activite du compte), donnees du campus, agent IA, Utilisateurs (creation, modification complete dont e-mail, profil, mot de passe, deconnexion de tous les appareils, desactivation, suppression definitive, export CSV), Journal d'activite (connexions, echecs de connexion, actions sur les comptes et les dossiers) |

Les clients creent leur compte eux-memes ; les comptes commercial, technicien et administrateur sont crees par un administrateur. Chaque droit est verifie par le serveur (`backend/app/auth.py`, `backend/app/roles.py`), pas seulement par l'interface.

Les comptes et dossiers sont stockes dans `backend/data/app.db` (SQLite, cree automatiquement, jamais versionne).

**Premier administrateur** : renseigner dans `backend/.env` puis demarrer le backend ; le compte est cree automatiquement s'il n'existe encore aucun administrateur (aucun mot de passe par defaut n'est code en dur) :

```
ENSA_ADMIN_EMAIL=admin@votre-domaine.ma
ENSA_ADMIN_PASSWORD=un-mot-de-passe-solide
ENSA_ADMIN_NAME=Votre Nom
```

Autre possibilite, en ligne de commande, depuis la racine :

```powershell
& ./backend/.venv/Scripts/python.exe backend/scripts/create_user.py
```

Pour une demonstration, `backend/scripts/seed_demo_accounts.py` cree un compte par profil avec des mots de passe aleatoires ecrits dans `backend/data/comptes_demo.txt` (non versionne).

## Definitions importantes

- **Periode des donnees** : du 1er au 21 octobre 2026 (donnees simulees). Une periode hors de cet intervalle affiche un message explicite.
- **Gaspillage** : pas de capteur de presence. L'occupation vient de l'emploi du temps programme dans Shelly (seances 8h30-12h30 et 14h30-18h30 en semaine). Un pas de 30 min est un gaspillage quand la salle est ON en manuel et OFF avec Shelly. Chaque pas est classe selon son heure : pause de midi (12h30-14h30), soir et nuit (18h30-8h30), week-end, pendant les seances.
- **Previsions** : pas de machine learning. Profil moyen par jour de la semaine, fourchette min / max observee, precision mesuree sur les 7 derniers jours (backtest).
- **Tarif ONEE** : grille residentielle officielle, progressive jusqu'a 150 kWh/mois puis selective (toute la consommation au prix de la tranche atteinte), TVA 18 %, redevances fixes ignorees.
- **Agent IA** : l'offre gratuite Groq autorise 200 000 tokens par 24 h glissantes, soit une vingtaine de questions (environ 8 000 tokens par question). Au-dela, l'interface affiche un message clair. `GROQ_REASONING_EFFORT` (low / medium / high) regle le compromis precision / consommation ; `low` s'est trompe pendant les tests.

## Tests

Depuis la racine :

```powershell
& ./backend/.venv/Scripts/python.exe backend/tests/test_sandbox.py
& ./backend/.venv/Scripts/python.exe backend/tests/test_tariff.py
& ./backend/.venv/Scripts/python.exe backend/tests/test_agent_offline.py
& ./backend/.venv/Scripts/python.exe backend/tests/test_email_offline.py
& ./backend/.venv/Scripts/python.exe backend/tests/test_accounts_offline.py
```

Ces tests n'utilisent ni Groq ni de vrai serveur e-mail. `backend/tests/live_agent_check.py` interroge le vrai agent (serveur lance) et compare ses reponses aux calculs pandas : il consomme environ 100 000 tokens, a lancer seulement quand le quota le permet.

## Securite

- **Comptes** : mots de passe haches avec scrypt (sel aleatoire), jetons de session aleatoires dont seule l'empreinte SHA-256 est stockee, expiration apres 7 jours, sessions fermees au changement de mot de passe, de profil ou a la desactivation ; meme message d'erreur que l'e-mail existe ou non ; 10 tentatives de connexion / min / IP (`ENSA_LOGIN_RATE_PER_MINUTE`) ; requetes SQL parametrees ; au moins un administrateur actif garanti ; l'inscription publique ne cree que des comptes client.

- **Agent IA** : le code pandas ecrit par le LLM n'est jamais execute dans le serveur. Il passe par `backend/app/services/sandbox.py` : validation AST (aucun import, aucun attribut `_prive`, aucune fonction d'ecriture de fichier, `pd` limite a une liste blanche), builtins restreints, puis execution dans un processus separe tue au bout de 15 s.
- **Prompt injection** : questions, historique et documents sont traites comme des donnees ; la cle API reste cote serveur.
- **Fichiers joints** : 8 Mo max, type verifie par signature (pas seulement l'extension), protection zip bomb, `defusedxml` contre les attaques XML, limites de lignes et colonnes, aucun fichier conserve.
- **E-mail du devis** : `POST /api/simulation/send-devis` verifie l'adresse, la reference et la signature du PDF (300 Ko max), recalcule le resume cote serveur, limite a 3 envois / min / IP (`ENSA_EMAIL_RATE_PER_MINUTE`) ; aucune donnee conservee ; identifiants SMTP uniquement dans `backend/.env`.
- **API** : lecture seule sauf une liste blanche de `POST` sans effet de bord ; routes datasets bloquees (`ENSA_DEMO_MODE`) et identifiants valides (pas de traversee de repertoires) ; `TrustedHostMiddleware` (DNS rebinding) ; CORS restreint ; en-tetes de securite (CSP, `X-Frame-Options`, `nosniff`...) ; limite de debit (10 questions IA / min / IP par defaut) ; taille des requetes bornee ; schemas Pydantic stricts (`extra="forbid"`) ; erreurs internes journalisees mais jamais renvoyees au client ; documentation Swagger desactivee par defaut (`ENSA_ENABLE_DOCS=true` en local).
- **Avant une mise en ligne publique** : servir le frontend compile derriere HTTPS avec une CSP stricte, placer l'API derriere un reverse proxy de confiance (la limite de debit par IP voit sinon une seule adresse), et ajouter une authentification si des donnees deviennent modifiables.

## Installation Windows (PowerShell)

Installer Git, Python et Node.js avec npm. Environnement observe lors de la preparation : Python 3.14.7, Node 26.13.0, npm 11.20.0. La compatibilite avec d'autres versions n'est pas encore certifiee.

```powershell
git clone https://github.com/sofyane-elmhoufer/EnergyOS.git
cd EnergyOS
py -3.14 -m venv backend/.venv
& ./backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
cd frontend
npm.cmd ci
cd ..
./Start_ENSA_EnergyOS.bat
```

Si le depot est prive, l'acces doit etre accorde par son proprietaire. Utiliser Git Credential Manager ou SSH ; ne jamais placer de jeton dans les fichiers ou l'URL du remote. Le dossier `.venv` est propre a chaque PC et ne doit pas etre copie entre machines.

Le lanceur refuse les ports deja occupes, attend la disponibilite des deux services et ecrit les journaux dans `logs/`. Il lance Uvicorn sans `--reload` et Vite sur l'interface locale. Appuyer sur Entree dans le lanceur pour arreter les deux processus qu'il a crees. Ne pas fermer brutalement cette fenetre. En cas de port occupe, identifier le processus avant toute intervention ; le lanceur ne tue aucun service preexistant.

## Lancement manuel et diagnostic

Terminal backend, depuis la racine :

```powershell
& ./backend/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Terminal frontend :

```powershell
cd frontend
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Ouvrir `http://localhost:5173/`. Arreter chaque serveur manuel avec Ctrl+C. `npm run preview` n'est pas configure comme serveur complet avec proxy API.

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/analytics/kpis
Invoke-RestMethod http://127.0.0.1:8000/api/analytics/daily
Invoke-RestMethod http://127.0.0.1:8000/api/analytics/filters
cd frontend
npm.cmd run lint
npm.cmd run build
```

Les routes KPI et daily acceptent `building`, `floor`, `room`, `start_date`, `end_date`. Les dates suivent `YYYY-MM-DD`. Un filtre sans resultat retourne 404 ; une plage de dates inversee retourne 422. Verifier aussi les filtres dans Energy Analytics avant une demonstration.

## Dataset et reproductibilite

Conserver dans Git le fichier `backend/data/originals/ENSA_Fes_Comparaison_Eclairage_Complet.xlsx`, les sources, `package-lock.json` et `requirements.txt`. Ne pas ouvrir puis enregistrer l'original pour le tester. L'archive existante est conservee. La selection locale `active.json` est ignoree ; un clone neuf utilise l'original.

Empreinte SHA-256 de reference de l'original :

`C81EC30E070B69D4227FE7ABA05E25BC995E9D9F7004FDF812D111A0A9BDDC38`

```powershell
Get-FileHash backend/data/originals/ENSA_Fes_Comparaison_Eclairage_Complet.xlsx -Algorithm SHA256
```

L'installation sur un second PC doit etre validee avec un clone neuf, `pip install`, `npm ci`, les trois routes et les filtres. Les versions epinglees ne remplacent pas cette verification.

## Collaboration

Voir [CONTRIBUTING.md](CONTRIBUTING.md). `main` contient le code stable ; chaque changement passe par une branche et une Pull Request relue. Ne jamais committer de secrets, d'environnement virtuel ou de dependances installees.
