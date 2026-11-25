# Fiches de contrôle (v4.17.0)

Une fiche « Les Petites Fées de Marche / Contrôle journalier » par chantier et par passage. Une personne
de l'équipe la remplit sur place, à tour de rôle ; elle part au client avec le mail « Nettoyage effectué ».

## Côté pointeuse (fait)

- **Réglage** : Admin → Chantiers → modifier → bloc « Fiche de contrôle » : modèle **A1** (autres locaux
  professionnels), **A2** (espaces communs) ou **B1** (bureaux), zone écrite sur la fiche, lignes hors prestation
  (cochées S.O. d'office). Enregistré dans `chantiers/{id}.ficheControle = { modele, zone, horsPrestation }`.
  Le « Type de lieu » du chantier propose un modèle (Bureau → B1), mais le choix reste à l'admin : rien dans la
  pointeuse ne dit de façon sûre si un lieu est un bureau, des espaces communs ou une boutique.
- **Rotation** : au début du pointage, la personne est inscrite sur `fichesControle/{chantierId}_{AAAA-MM-JJ}`.
  Parmi les personnes présentes, la fiche va à celle qui l'a remplie il y a le plus longtemps sur ce chantier
  (`fichesRotation/{chantierId}.derniers`). Dès que la personne ouvre la fiche, elle ne change plus de main
  (sauf « Je la remplis à sa place » par un collègue).
- **Sortie** : la personne désignée ne peut pas arrêter son pointage tant que la fiche n'est pas validée.
  Les collègues ne sont pas bloqués. Hors ligne, la fiche est gardée et envoyée au retour du réseau.
- **Admin** : page « Fiches de contrôle » (fiches du jour, puis chaque chantier avec toutes ses fiches en
  détail, aperçu et PDF) ; résumé et alertes « Point à revoir » sur le tableau de bord.
- **PDF** : `assets/fiches/{A1,A2,B1}.pdf` sont les PDF d'origine. `remplirPdf()` (modules/fiches-controle.js,
  sans dépendance Firebase) remplit leurs champs avec pdf-lib puis les aplatit : le client reçoit exactement la
  fiche d'origine, cochée.
- **Règles Firestore** : bloc 14 de `docs/firestore.rules`, à publier dans la console Firebase.

### Document `fichesControle/{chantierId}_{AAAA-MM-JJ}`

| Champ | Contenu |
|---|---|
| `chantierId`, `chantierName`, `date` | chantier et jour du passage |
| `modele`, `zone`, `horsPrestation` | copiés du chantier à la première arrivée |
| `presents`, `presentsUid` | qui a pointé, dans l'ordre d'arrivée |
| `responsableNom`, `responsableUid` | qui remplit la fiche |
| `statut` | `a_remplir`, `en_cours`, `validee` |
| `reponses` | `{ "1": "F" \| "R" \| "S", … }` (Fait, À revoir, S.O.) |
| `observations`, `personnePrevenue`, `aCorrigerAvant` (AAAA-MM-JJ), `heure` (HH:MM), `valideeLe` | saisie |
| `envoyeeLe`, `envoyeeA` | **à écrire par l'appli Les Petites Fées** après l'envoi au client |

## Côté appli Les Petites Fées (à faire dans son dépôt)

Le mail « Nettoyage effectué » est envoyé le soir par `scripts/automation.ts` (`notifyDone`).

1. **Retrouver la fiche du passage** : dans `validateFromPointages` (`scripts/lib/pointeuse.ts`), noter
   `pointeuseChantierId: c.id` sur la mission passée en « DONE ». La fiche est
   `fichesControle/${pointeuseChantierId}_${mission.date}` dans la base de la pointeuse (`initPointeuse()`).
2. **Remplir le PDF** : copier `modules/fiches-controle.js` (pur JavaScript) et `assets/fiches/*.pdf` dans le
   dépôt, ajouter `pdf-lib` (`npm i pdf-lib`), puis :
   ```ts
   import * as PDFLib from "pdf-lib";
   import { readFileSync } from "node:fs";
   import { remplirPdf, nomFichierPdf } from "./fiches-controle.js";
   const pdf = await remplirPdf(PDFLib, readFileSync(`scripts/fiches/${fiche.modele}.pdf`), fiche);
   const attachment = { filename: nomFichierPdf(fiche), content: Buffer.from(pdf), contentType: "application/pdf" };
   ```
3. **Joindre au mail** : `send()` (`scripts/lib/mailer.ts`) accepte un paramètre `attachments` transmis à
   `transport.sendMail({ …, attachments })`. Ajouter dans le mail la ligne « La fiche de contrôle remplie sur
   place est jointe à cet e-mail. »
4. **Envoyer aussi hors gîtes** : `notifyDone` n'envoie aujourd'hui que pour les gîtes. Garder un passage
   « bureau / appartement / autre » quand une fiche validée existe pour lui.
5. **Noter l'envoi** : après un envoi réussi, `pt.doc(id).update({ envoyeeLe: new Date().toISOString(), envoyeeA: email })`.
   La page admin de la pointeuse affiche alors « Envoyée au client ».
