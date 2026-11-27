# Application mobile EnergyOS (Android et iOS)

L'application mobile est construite avec **Capacitor** (gratuit, open source) : elle embarque le site React compilé
dans une vraie application Android et iOS, publiable sur le Google Play Store et l'App Store. Un seul code à maintenir :
toute modification du site se retrouve dans l'application après `npm run mobile:sync`.

- Identifiant de l'application : `ma.ensa.energyos`
- Projets natifs : `frontend/android/` (Android Studio) et `frontend/ios/` (Xcode)
- Configuration : `frontend/capacitor.config.ts`

## Prérequis (gratuits)

| Plateforme | Outil | Remarque |
|---|---|---|
| iOS | Xcode (Mac App Store) | Mac obligatoire. Simulateur iPhone inclus. |
| Android | Android Studio (developer.android.com/studio) | Mac, Windows ou Linux. Installe le SDK Android, Java 21 et l'émulateur. |

## Lancer l'application en développement

1. Démarrer le backend (voir README) sur le port 8000.
2. Depuis `frontend/` :

```bash
npm run mobile:ios        # compile le site, synchronise, ouvre Xcode
npm run mobile:android    # compile le site, synchronise, ouvre Android Studio
```

3. Dans Xcode ou Android Studio, choisir un simulateur / émulateur et cliquer sur ▶ (Run).

En développement, l'application appelle l'API du poste de travail :
- simulateur iOS : `http://localhost:8000` ;
- émulateur Android : `http://10.0.2.2:8000` (adresse du PC vue depuis l'émulateur).

Ces adresses, l'origine `capacitor://localhost` / `http://localhost` (CORS) et l'hôte `10.0.2.2` sont déjà autorisés
par défaut dans `backend/app/security.py`.

## Tester sur un vrai téléphone ou publier

Un vrai téléphone ne peut pas joindre `localhost` : il faut un serveur accessible.

1. Déployer le backend sur un serveur **en HTTPS** (par exemple `https://api.energyos.ma`).
2. Dans `backend/.env` du serveur :
   ```
   ENSA_ALLOWED_HOSTS=api.energyos.ma
   ENSA_ALLOWED_ORIGINS=https://energyos.ma,capacitor://localhost,http://localhost
   ```
3. Compiler l'application avec l'adresse du serveur :
   ```bash
   VITE_API_BASE_URL=https://api.energyos.ma npm run mobile:sync
   ```
4. Dans `capacitor.config.ts`, supprimer `androidScheme: "http"` et `cleartext: true` (inutiles en HTTPS), puis
   dans `ios/App/App/Info.plist`, supprimer la clé `NSAppTransportSecurity` (autorisation HTTP locale de développement).

## Publication sur les stores

- **Google Play** : compte développeur 25 USD (paiement unique). Android Studio → *Build > Generate Signed App Bundle*.
- **App Store** : Apple Developer Program 99 USD par an. Xcode → *Product > Archive*, puis envoi vers App Store Connect.

La création des applications et les tests sur simulateur restent entièrement gratuits ; seuls les comptes de
publication sur les stores sont payants.

## Icônes et écran de démarrage

Remplacer les icônes par défaut avec l'outil officiel :

```bash
npm install -D @capacitor/assets
# placer assets/icon.png (1024x1024) et assets/splash.png (2732x2732) dans frontend/
npx capacitor-assets generate
```
