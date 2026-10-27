# Pointeuse LPF

- Site statique publié sur GitHub Pages depuis `main` (l'appli Android affiche ce même site).
- Version : `APP_VERSION` dans `app.js` et dans `sw.js` (à garder identiques, une version par changement).
- Styles Tailwind **précompilés** dans `styles/tailwind.css` (plus de script `cdn.tailwindcss.com`, trop lent
  au démarrage). Après avoir ajouté des classes Tailwind dans le HTML ou le JS : `npm run css` et commiter
  `styles/tailwind.css`. Le workflow « Styles » le refait aussi automatiquement sur `main`.
  Ne pas construire de classes Tailwind par morceaux (`bg-${couleur}-500`) : elles ne seraient pas générées.
