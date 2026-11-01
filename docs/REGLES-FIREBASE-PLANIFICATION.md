> **Version complète prête à coller : `docs/firestore.rules`** (remplace toutes les règles d'un coup).
> Ce fichier-ci ne décrit que l'ajout minimal pour la planification.

# Règles Firebase à ajouter pour la planification automatique

À coller dans **Console Firebase → projet pointeuse-lpf → Firestore Database → Règles**,
à l'intérieur du bloc `match /databases/{database}/documents { ... }` existant, puis **Publier**.
(Ne remplace pas tes règles actuelles : ajoute seulement ces blocs.)

```
// Affinités : privées. L'employé lit/écrit les siennes ; l'admin les lit toutes.
match /affinites/{uid} {
  allow read: if request.auth != null && (request.auth.uid == uid
    || get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin');
  allow write: if request.auth != null && request.auth.uid == uid
    && request.resource.data.keys().hasOnly(['like', 'updatedAt'])
    && request.resource.data.like is list;
}
```

## À vérifier dans le bloc `match /users/{uid}` existant

L'employé doit pouvoir modifier **sur sa propre fiche** les champs :
`isDriver`, `skillsSelf`.
Si tes règles listent les champs autorisés (par exemple avec `hasOnly([...])` ou `affectedKeys()`),
ajoute ces deux noms. Les champs `skillsAdmin`, `role`, `contractHistory` doivent rester réservés à l'admin.

## Lecture des pointages par l'admin

L'admin doit pouvoir lire la collection `pointages` des 4 derniers mois (c'est déjà le cas
pour les rapports d'heures). Rien à changer normalement.

## Tester avant de publier

Dans la console : **Règles → Terrain de jeu des règles** : simuler une écriture de
`affinites/<ton uid>` connecté avec ton compte → doit être autorisée ; avec un autre uid → refusée.
