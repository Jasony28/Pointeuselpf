# Publier Pointeuse LPF sur l'App Store (iPhone)

L'application web est emballée avec **Capacitor** : c'est le même code, mais installable
en un clic depuis l'App Store. Les fichiers sont déjà prêts dans ce dossier
(`package.json`, `capacitor.config.json`, `scripts/build-www.mjs`).

Apple impose que la dernière étape (compiler l'appli) se fasse **sur un Mac**.

---

## Ce qu'il te faut

| Élément | Où | Coût |
|---|---|---|
| Un Mac (récent) avec **Xcode** | App Store du Mac, gratuit | — |
| **Node.js 20 ou plus** | https://nodejs.org (version LTS) | gratuit |
| Un compte **Apple Developer** | https://developer.apple.com/programs/ | 99 $ / an |
| Une image **1024 × 1024 px** du logo (PNG, sans transparence) | — | — |

---

## 1. Préparer le projet (une seule fois)

1. Copie tout le dossier `Pointeuselpf-main` sur le Mac.
2. Ouvre le **Terminal** dans ce dossier, puis :

```bash
npm install
npm run ios:init
```

Ça crée le dossier `ios/` (le projet Xcode).

3. Icône de l'appli : place ton logo 1024 × 1024 dans `assets/icon.png`, puis :

```bash
npx @capacitor/assets generate --ios
```

## 2. Ouvrir et tester sur ton iPhone

```bash
npm run ios
```

Xcode s'ouvre. Ensuite :

1. Clique sur **App** (à gauche) → onglet **Signing & Capabilities**.
2. **Team** : choisis ton compte Apple Developer.
3. Branche ton iPhone au Mac, sélectionne-le en haut, clique sur **▶ (Run)**.

L'appli s'installe sur ton iPhone : vérifie la connexion, le pointage, le planning.

## 3. Publier

1. Sur https://appstoreconnect.apple.com → **Mes apps** → **+** → Nouvelle app
   - Identifiant du bundle : `be.lespetitesfees.pointeuse`
2. Dans Xcode : menu **Product → Archive**, puis **Distribute App → App Store Connect**.
3. Sur App Store Connect : remplis la fiche (captures d'écran, description, confidentialité :
   l'appli collecte le nom et l'e-mail des employés pour le pointage).

### Appli réservée à tes employés (recommandé)

Tu n'es pas obligé de la rendre publique :

- **TestFlight** (le plus simple) : tu invites tes employés par e-mail, ils installent
  l'appli « TestFlight » puis la tienne. Chaque version reste valable 90 jours.
- **Distribution non répertoriée** (« Unlisted App ») : l'appli est sur l'App Store
  mais seulement accessible par un lien que tu donnes à tes employés.
  Demande sur https://developer.apple.com/contact/request/unlisted-app/

> ⚠️ Apple peut refuser une appli publique qui « n'est qu'un site web emballé »
> (règle 4.2). Une appli d'entreprise réservée aux employés (TestFlight ou non
> répertoriée) passe en général sans problème.

## 4. Mettre à jour l'appli plus tard

Après chaque modification du code :

```bash
npm run ios
```

Puis dans Xcode : augmente le numéro de **Version / Build**, **Product → Archive** → envoie.

---

## Android (Google Play), en bonus

Même principe avec **Android Studio** (fonctionne aussi sur Windows), compte Google Play
à 25 $ une seule fois :

```bash
npm install
npm run android:init
npm run android
```

Sur Android, l'installation directe depuis le site (bouton « Installer » dans les
Paramètres) fonctionne déjà sans passer par le Play Store.
