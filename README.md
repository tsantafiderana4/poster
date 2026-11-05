# Poster Pro 2
Lien app: https://poster-pro-udmg.onrender.com/

Créer des posters prêts à imprimer : grilles d'images réglables, cadrage précis, export 300 DPI.

## Lancer

```
npm install
npm run dev        # http://localhost:5173  (ajoutez ?demo pour charger des images d'exemple)
npm run build      # version de production dans dist/
```

## Déployer sur Render (site statique)

- Build command : `npm install && npm run build`
- Publish directory : `dist`

## Installer et utiliser sans internet

Poster Pro est une application installable (PWA). Ouvrez le site une première fois avec internet, puis :

- **Ordinateur (Chrome / Edge)** : bouton « Installer l'app » en haut, ou icône d'installation dans la barre d'adresse.
- **Android (Chrome)** : menu ⋮ → « Installer l'application » / « Ajouter à l'écran d'accueil ».
- **iPhone / iPad (Safari)** : bouton Partager → « Sur l'écran d'accueil ».

Ensuite l'application fonctionne entièrement hors ligne : polices intégrées, export PDF, Word, PNG et JPEG,
posters et modèles enregistrés sur l'appareil. Les mises à jour s'installent automatiquement au retour d'internet.

## Fonctions

- Formats A4 → A1, 30×40 → 60×90 cm, carré, ou sur mesure (mm), portrait/paysage.
- Fonds perdus 3 ou 5 mm, ligne de coupe et zone de sécurité affichées, traits de coupe à l'export.
- 12 modèles de grille, grille régulière 1 à 8 × 1 à 8, fusion et division de cases, suppression de cases.
- Dans chaque case : glisser pour recadrer, molette pour zoomer, rotation, miroir, « remplir » ou « image entière »,
  luminosité, contraste, saturation, noir et blanc ; échange d'images entre cases (poignée ⇄).
- Clic sur une photo : barre d'outils rapide (zoom, rotation, miroir, remplir/entière, ratio photo, échange) et poignées
  sur les bords pour élargir ou réduire colonnes et lignes à la souris.
- Poignées sur les 4 côtés et les coins de la photo sélectionnée : côté intérieur = taille de la case, côté extérieur = marge.
- « Mes modèles » : enregistrer une grille (tailles, marges, bordures, fond, et en option format, textes et formes)
  pour la réutiliser ; ★ = modèle appliqué à chaque nouveau poster.
- Formes déplaçables : étoile « NEW », pastille, ruban, nœud, étiquette, bande d'angle découpée sur la photo
  (taille, rotation, couleurs, texte).
- Ratio par case (1:1, 4:5, 3:2, 16:9…, ratio de la photo ou personnalisé) et ratio de page personnalisé.
- Indicateur de résolution réelle (DPI) pour chaque image, avec alerte sous 150 DPI.
- Textes libres (8 polices, bandeau de couleur, ombre, interlettrage), aimantation au centre, thèmes.
- Export PDF à la taille exacte, Word (.docx, pleine page sans marges, jusqu'à 558 mm), PNG ou JPEG (100 / 150 / 300 DPI, résolution inscrite dans le fichier).
- Annuler/rétablir, sauvegarde automatique dans le navigateur, projet .json (images incluses).
