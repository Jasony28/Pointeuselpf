# Publier Pointeuse LPF sur Google Play (Android)

L'appli Android est **compilée automatiquement par GitHub** : pas besoin d'ordinateur
avec Android Studio. Elle affiche le site en ligne (`https://jasony28.github.io/Pointeuselpf/`) :
**chaque mise à jour du site arrive dans l'appli sans republier sur le Play Store.**

On ne recompile que si le nom, l'icône ou l'écran de démarrage changent.

Tout ce qu'il faut pour la fiche Play Store est déjà dans le dépôt :

| Élément | Fichier |
|---|---|
| Icône 512 × 512 | `store/icone-512.png` |
| Bannière 1024 × 500 | `store/banniere-1024x500.png` |
| 6 captures d'écran téléphone (données de démonstration) | `store/captures/` |
| Politique de confidentialité | https://jasony28.github.io/Pointeuselpf/confidentialite.html |
| Page « suppression de compte » | https://jasony28.github.io/Pointeuselpf/confidentialite.html#suppression |

---

## 1. Le compte Google Play Console (une seule fois)

1. Va sur https://play.google.com/console et crée un compte développeur (**25 $, une seule fois**).
2. Google demande une pièce d'identité et vérifie l'adresse : compte quelques jours.
3. Type de compte :
   - **Personnel** : avant la mise en ligne publique, Google impose un **test fermé
     avec au moins 12 testeurs pendant 14 jours d'affilée**. Pour une appli d'équipe,
     on peut aussi rester en « test fermé » pour toujours : seuls les membres invités
     peuvent l'installer depuis le Play Store, et c'est souvent ce qu'on veut.
   - **Organisation** (entreprise) : pas de test obligatoire, mais il faut un numéro D-U-N-S.

## 2. Mettre la clé de signature dans GitHub (une seule fois)

La clé de signature t'a été envoyée à part. Elle n'est **jamais** dans le dépôt (il est public).
Garde le fichier `pointeuse-lpf-upload.jks` et ses mots de passe en lieu sûr (clé USB, coffre-fort de mots de passe) :
sans elle, plus de mise à jour possible de l'appli (Google peut la remplacer, mais c'est long).

Sur GitHub : dépôt **Pointeuselpf** → **Settings** → **Secrets and variables** → **Actions**
→ **New repository secret**, quatre fois :

| Nom du secret | Valeur |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | tout le contenu du fichier `pointeuse-lpf-upload.jks.base64.txt` |
| `ANDROID_KEYSTORE_PASSWORD` | le mot de passe de `secrets-a-copier.txt` |
| `ANDROID_KEY_ALIAS` | `pointeuse-lpf` |
| `ANDROID_KEY_PASSWORD` | le même mot de passe |

## 3. Compiler l'appli

1. Dépôt **Pointeuselpf** → onglet **Actions** → **Appli Android** → **Run workflow** (branche `main`).
2. Environ 10 minutes. En bas de la page du lancement, rubrique **Artifacts** : un fichier zip avec
   - `pointeuse-lpf-….aab` : **le fichier à envoyer sur le Play Store** ;
   - `pointeuse-lpf-….apk` : à installer directement sur un téléphone Android pour tester.

Sans les secrets de l'étape 2, les fichiers portent la mention **TEST** : ils sont signés avec une clé jetable,
bons pour essayer l'appli sur un téléphone, mais **refusés par le Play Store**.

## 4. Tester sur un téléphone avant d'envoyer

Envoie le `.apk` sur le téléphone (e-mail, Google Drive…), ouvre-le et accepte
« installer des applis de sources inconnues ». Vérifie : connexion, pointage, planning,
historique, liens Waze / Google Maps / e-mail, et l'export PDF ou CSV : dans l'appli, le fichier
s'ouvre dans le menu « Partager » du téléphone (enregistrer, e-mail, WhatsApp…).

## 5. Créer l'appli dans la Play Console

**Créer une application** → nom `Pointeuse LPF`, langue **français**, **Application**, **Gratuite**.

Puis la liste « Configurer votre application » :

- **Règles de confidentialité** : `https://jasony28.github.io/Pointeuselpf/confidentialite.html`
- **Accès à l'application** : « Tout ou partie de l'application est soumise à des restrictions ».
  Donne à Google **un compte de test déjà approuvé** (e-mail + mot de passe) : crée un compte
  « Test Google » dans l'appli et approuve-le dans Admin → Équipe. Sans ça, l'appli est refusée.
- **Annonces** : non.
- **Classification du contenu** : questionnaire ; catégorie « Utilitaire / productivité », réponses « non » partout.
- **Public cible** : 18 ans et plus.
- **Appli d'actualités / gouvernementale / financière / santé** : non.
- **Sécurité des données** : voir la section 7.
- **Catégorie** : Entreprise. **E-mail de contact** : celui du support.

## 6. Fiche du Play Store (textes prêts à copier)

**Nom (30 caractères max.)**
```
Pointeuse LPF
```

**Description courte (80 caractères max.)**
```
Pointage, planning, trajets et congés de l'équipe des Petites Fées.
```

**Description complète**
```
Pointeuse LPF est l'application de l'équipe des Petites Fées (Marche-en-Famenne).

POUR CHAQUE MEMBRE DE L'ÉQUIPE
• Pointer le début et la fin du travail en un geste, avec les pauses
• Voir son planning de la semaine et les chantiers du jour
• Infos chantiers : adresse, codes d'accès, consignes, itinéraire Waze ou Google Maps
• Historique des heures et des kilomètres, calculés automatiquement
• Demandes de congé et messagerie avec l'équipe
• Mode sombre et choix des couleurs

POUR LES RESPONSABLES
• Planification de la semaine par glisser-déposer
• Qui travaille en ce moment, en direct
• Rapports d'heures et de trajets, export PDF
• Gestion des chantiers, de l'équipe et des congés

L'application est réservée aux membres de l'équipe : un compte doit être approuvé par un responsable.
```

## 7. Sécurité des données (réponses au formulaire)

- L'appli collecte des données : **oui**. Chiffrées pendant le transfert : **oui**.
- Les utilisateurs peuvent demander la suppression : **oui**,
  URL : `https://jasony28.github.io/Pointeuselpf/confidentialite.html#suppression`
- Données **partagées** avec des tiers : **non** (Firebase et Mapbox sont des prestataires, pas du partage).

Données collectées (toutes « Fonctionnalité de l'appli » et « Gestion du compte », **pas** de publicité ni d'analyse) :

| Catégorie Google | Type | Obligatoire ? |
|---|---|---|
| Informations personnelles | Nom, Adresse e-mail | Oui |
| Informations personnelles | Numéro de téléphone, Adresse, Autres informations (registre national) | Non (fiche employé) |
| Informations financières | Autres informations financières (IBAN) | Non (fiche employé) |
| Messages | Autres messages dans l'appli | Non |
| Activité dans l'appli | Autre contenu généré par l'utilisateur (pointages, notes, congés) | Oui |
| Infos et performances de l'appli | Journaux de plantage, Diagnostics | Oui |

Position : **non collectée** (les kilomètres viennent de l'adresse des chantiers, pas du GPS du téléphone).

## 8. Envoyer l'appli

1. **Tests → Test interne** (jusqu'à 100 personnes, sans validation de Google) : crée une version,
   envoie le `.aab`, accepte la **signature d'application par Google Play**.
   Ajoute les adresses e-mail des testeurs, puis partage le lien d'installation.
2. Quand tout va bien : **Test fermé** (ou **Production** si ton compte le permet), même `.aab`.
3. Pour une nouvelle version de l'appli Android (nouvelle icône…) : relance l'étape 3
   (le numéro de version augmente tout seul) et envoie le nouveau `.aab`.

## À savoir

- Hors connexion, l'appli s'ouvre quand même (dernière version gardée en mémoire).
- L'identifiant de l'appli est `be.lespetitesfees.pointeuse` : il ne pourra plus jamais changer.
