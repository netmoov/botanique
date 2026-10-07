# Botanique BOF · Révision IFAPME

Application Web statique de révision botanique, conçue pour GitHub Pages et utilisable sur smartphone, tablette et ordinateur.

## Lancer l'application

La version publiée fonctionne directement depuis GitHub Pages. Pour un test local, ouvrir `index.html` suffit car l'application charge les données depuis `data/plants.js`.

## Structure

```text
botanique/
├── index.html
├── style.css
├── app.js
├── data/
│   ├── plants.js
│   └── plants.json
├── data-quality-report.md
├── final-report.md
└── README.md
```

## Données

La base est construite uniquement à partir de :

- `Liste de fleurs R05 & R35.docx` pour le périmètre officiel, les catégories et statuts ;
- `Fiches Frans.docx` pour les informations détaillées de conservation et de préparation.

Les rapprochements ambigus ne sont pas imposés automatiquement. Voir `data-quality-report.md`.

## Progression

La progression est stockée dans `localStorage` sous la clé :

```text
ifapmeBotaniqueProgressV1
```

Elle reste donc locale au navigateur et à l'appareil utilisés.

## Images

La structure accepte pour chaque carte :

```json
{
  "image": {
    "url": "...",
    "source": "...",
    "texteAlternatif": "..."
  }
}
```

La V1 affiche volontairement un placeholder tant qu'une photographie correcte et publiable n'a pas été validée. Cela évite d'associer une mauvaise image ou d'utiliser une ressource dont le droit de réutilisation n'est pas clair.

## Déploiement dans le dépôt existant

Le dossier peut être placé dans le dépôt `netmoov/table-et-vaisselle` sous :

```text
botanique/
```

L'application sera alors accessible à l'adresse :

```text
https://netmoov.github.io/table-et-vaisselle/botanique/
```

Cela permet de conserver l'application actuelle à la racine sans l'écraser.
