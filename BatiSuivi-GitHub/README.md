# BatiSuivi — Manual 3D Architecture Studio

Application web de saisie et de suivi manuel de l'avancement des travaux d'un bâtiment, avec vue 3D par étage et export PDF synthétique.

## Mode d'emploi

1. **Projet** — saisissez le nom du projet.
2. **Bloc** — ajoutez un bloc (ex. `Bloc 01`).
3. **Génération rapide** — indiquez le nombre d'étages (10 = `RDC` + 9 étages) et le nombre d'appartements par étage, puis validez.
   - Crée les étages `RDC, 1, 2, …` et les appartements `A1, A2, …` en une seule fois.
   - Ajoute automatiquement un **Espace commun** au centre de chaque étage s'il n'existe pas.
   - Relancer la génération ne supprime rien : seuls les éléments manquants sont ajoutés.
4. **Espace commun** — local technique (escalier, ascenseur, palier) affiché comme une carte pleine largeur au milieu de l'étage, et comme un **petit bloc rectangulaire au centre du bâtiment** en 3D, avec deux appartements à gauche et deux à droite.
   - Ajout possible sur n'importe quel étage via le bouton **Espace commun**.
   - Les travaux et pourcentages s'y saisissent comme dans un appartement ; il compte dans la moyenne de l'étage et du bloc.
5. **Appartement** — ajoutez le travail : **nom + avancement (%)** uniquement.
   - Aucune surface, quantité ou longueur : le pourcentage est saisi directement (clavier, `+5 / −5`, ou boutons `0 / 25 / 50 / 75 / 100`).
   - **Suggestions automatiques** : dès la première lettre, les noms de travaux s'affichent (ex. `m` → `Maçonnerie`), en apprenant des noms déjà saisis dans le projet.
   - Pas de division `CE / CES` : une seule liste de travaux, entièrement libre.
6. **Couleurs** selon l'avancement : vert = 100 %, orange = en cours, rouge = 0 %, gris = non saisi.
7. **Barre supérieure fixe** — navigation entre appartements (`‹` / `›`), taux courant et indicateur de sauvegarde automatique.
8. **Générer 3D** — vue du bâtiment complet ou d'un étage seul (rotation / zoom à la souris), avec l'espace commun au centre.
9. **Générer PDF** — deux pages :
   - **Page 1** : le bâtiment sous 5 angles (perspective + **façade + arrière** + côtés gauche/droit), avec la légende des couleurs et le taux global.
   - **Page 2** : tableau des taux par appartement et par étage + tableau des **travaux réellement saisis** (en couleurs).

Les données sont enregistrées localement dans le navigateur (`localStorage`) ; les anciennes versions sont converties automatiquement en pourcentage seul (surface et ancienne catégorie ignorées).

## Développement

```sh
npm i
npm run dev      # http://localhost:5173
npm test         # taux, suggestions, espaces communs, génération rapide
npm run build
```

Stack : React 19, TypeScript, TanStack Router/Start, Vite, Tailwind v4, Three.js (react-three-fiber), jsPDF.

This project was built with [Lovable](https://lovable.dev/projects/b7b7e510-24df-4568-bc47-7cfcbd0cc54d).
