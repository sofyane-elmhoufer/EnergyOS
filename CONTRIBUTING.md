# Contribuer a ENSA EnergyOS

## Une branche par fonctionnalite

Se repartir les fichiers et fonctionnalites avant de commencer. Eviter les modifications simultanees de `frontend/src/App.tsx`. Garder les Pull Requests petites ; annoncer les changements de dependances et de dataset.

```powershell
git switch main
git pull --ff-only origin main
git switch -c feature/nom-fonctionnalite
# Modifier et verifier le projet
git status
git diff
git add chemin/du/fichier
git diff --cached
git commit -m "feat: decrire le changement"
git push -u origin feature/nom-fonctionnalite
```

Ouvrir une Pull Request vers `main`, decrire le resultat et les tests executes, demander une relecture. Ne pas pousser directement sur `main`. Le proprietaire configure une protection de branche ou un ruleset si le plan GitHub le permet : PR obligatoire, une approbation et interdiction du force push. Sans protection disponible, appliquer ces regles en equipe.

## Verifications avant fusion

- Executer `npm.cmd run lint` et `npm.cmd run build` dans `frontend`.
- Demarrer FastAPI et Vite ; verifier les trois routes Analytics et les filtres batiment, etage, salle et dates.
- Verifier que les modifications de datasets restent bloquees et que les serveurs restent sur l'interface locale.
- Comparer l'empreinte du dataset original avec celle du README.
- Examiner `git diff --cached` : aucun secret, cache ou environnement installe.
- Signaler les tests non executes. Ces controles sont manuels tant qu'aucune CI n'est configuree.

## Actualiser sa branche et resoudre les conflits

Commiter d'abord son travail, puis integrer `main` sans reecrire l'historique partage :

```powershell
git fetch origin
git merge origin/main
# En cas de conflit : examiner chaque fichier et garder le resultat voulu
git status
git add chemin/du/fichier-resolu
git commit
# Refaire les verifications
git push
```

Ne pas choisir automatiquement toute la version locale ou distante. Pour un conflit Excel, demander au responsable des donnees ; ne jamais fusionner ni remplacer l'original. Pour `package-lock.json`, se coordonner et regenerer avec npm seulement si necessaire, puis verifier `npm ci`. Aucun force push, `reset --hard` ou `clean -fd` sans accord explicite.

Apres fusion de la PR :

```powershell
git switch main
git pull --ff-only origin main
git branch -d feature/nom-fonctionnalite
```

## Acces au depot prive

Le proprietaire invite les collegues dans GitHub : depot > Settings > Collaborators (ou Collaborators and teams) > Add people. Pour une organisation, donner le role Write aux contributeurs et limiter les droits administrateur. Chaque collegue accepte son invitation puis clone le depot selon le README. Ne jamais partager un compte ou un jeton personnel.
