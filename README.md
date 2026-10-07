# Botanique BOF — V6

Application Web de révision botanique IFAPME.

## Photos locales

La V6 n'utilise plus Wikimedia Commons au moment où un apprenant ouvre une carte.

Le workflow GitHub Actions `.github/workflows/cache-plant-images.yml` exécute `tools/fetch_wikimedia_images.py` une seule fois après l'installation de cette version :

1. recherche/valide la photo Wikimedia configurée pour chaque végétal ;
2. télécharge les 158 photographies ;
3. les redimensionne et les convertit en WebP ;
4. les stocke dans `assets/images/` ;
5. remplace les URL distantes par des chemins locaux dans `data/plants.json` et `data/plants.js` ;
6. conserve auteur, licence et page source Wikimedia ;
7. committe automatiquement les images dans le dépôt.

Après ce premier traitement, les cartes utilisent uniquement des URLs locales comme :

```text
assets/images/alchemilla-mollis.webp
```

`image-sources.md` conserve les crédits et licences.

## Fiche complète

Le bouton **Voir la fiche complète** ouvre maintenant une fenêtre dédiée et scrollable. Elle affiche toujours l'identification et le référentiel. Quand une fiche Frans existe, elle ajoute les informations de tenue/conservation, préparation/précautions et le résumé « À retenir ». Lorsqu'une fiche Frans n'existe pas, l'interface l'indique explicitement sans inventer d'information.

## GitHub Pages

Le projet reste compatible avec un déploiement GitHub Pages depuis la branche `main` et le dossier `/ (root)`.
