# Rapport de qualité des données — Botanique BOF

## Sources analysées

- `Liste de fleurs R05 & R35.docx`
- `Fiches Frans.docx`

Aucune connaissance botanique extérieure n'a été utilisée pour compléter les champs métier. Les rapprochements taxonomiques non explicitement supportés par les documents restent séparés et sont signalés ci-dessous.

## Comptages des référentiels

### R05

- Fleurs & plantes : **65** entrées source
- Verdures : **47** entrées source
- Total occurrences R05 : **112**
- `Eucalyptus` apparaît dans les deux catégories ; les deux occurrences sont conservées dans une même carte exacte avec deux entrées de référentiel.

### R35

- Fleurs obligatoires : **13**
- Fleurs facultatives : **9**
- Verdures obligatoires : **12**
- Verdures facultatives : **13**
- Total occurrences R35 : **47**
- `Monstera deliciosa` apparaît à la fois comme fleur facultative et comme verdure obligatoire ; les deux occurrences sont conservées.

## Fiches détaillées

- Occurrences de titres `FICHE` dans le document : **68**
- Numéros de fiches uniques : **58**
- Numéro absent dans la séquence 1–59 : **11**
- Fiches répétées : **6, 7, 8, 9, 10, 41, 42, 43, 44, 45**
- Le contenu botanique des répétitions **6–10 et 41–45** est identique ; la seconde occurrence de la fiche 45 contient en plus un texte conversationnel d'introduction vers les fiches suivantes. Une seule version botanique est conservée.
- Fiches détaillées uniques exploitées : **58**

## Résultat de l'intégration V1

- Cartes officielles distinctes après regroupement des doublons stricts de nom latin : **157**
- Fiche complémentaire hors référentiel : **1** (`Acacia dealbata / Mimosa`)
- Total de cartes dans `plants.json` : **158**
- Cartes officielles avec fiche détaillée associée : **61**
- Cartes officielles sans fiche détaillée : **96**
- Total de cartes détaillées en incluant la fiche complémentaire : **62**

### Rapprochements R35 retenus avec une fiche détaillée

Les rapprochements suivants ont été appliqués parce que le taxon R35 est explicitement présent dans le nom latin de la fiche :

- `Eucalyptus populus` ↔ fiche 22
- `Hydrangea paniculata` ↔ fiche 36
- `Paeonia lactiflora` ↔ fiche 47
- `Protea cynaroides` ↔ fiche 50
- `Zantedeschia aethiopica` ↔ fiche 59

## Correspondances ambiguës nécessitant validation humaine

- **Lilium (hybrides orientaux)** (R35) ↔ fiche 41 « Lilium » : fiche trop générique pour appliquer automatiquement les données aux hybrides orientaux.
- **Strelitzia nicolai** (R35) ↔ fiche 54 **Strelitzia reginae** : espèces différentes, aucune fusion.
- **Amaranthus hypochondriacus** (R35) ↔ fiche 4 **A. caudatus / A. cruentus** : espèces différentes, aucune fusion.
- **Banksia speciosa** (R35) ↔ fiche 9 « Banksia (plusieurs espèces) » : B. speciosa n’est pas explicitement citée.
- **Heliconia wagneriana** (R35) ↔ fiche 34 **H. rostrata / variétés** : pas de correspondance explicite.
- **Eucalyptus gunnii** (R35) ↔ fiche 22 **Eucalyptus cinerea, populus, parvifolia…** : E. gunnii n’est pas citée.
- **Asparagus setaceus** (R35) ↔ plusieurs Asparagus R05 : aucune fusion automatique.
- **Philodendron selloum** (R35) ↔ Philodendron xanadu / P. bipinnatifidum : entrées conservées séparément.
- **Aspidistra variegata** (R35) ↔ **Aspidistra elatior** (R05) : entrées conservées séparément.
- **Cordyline fruticosa “Red Sister”** (R35) ↔ **Cordyline australis** (R05) : entrées conservées séparément.
- **Moluccella laevis** (R05) ↔ fiche 44 « **Molucella laevis** » : variante orthographique signalée, association retenue via le titre/common name.
- **Zantedeschia** : la fiche 6 est générique (« Arum / Zantedeschia / Calla ») tandis que la fiche 59 vise explicitement **Zantedeschia aethiopica / hybrides**. Elles ne sont pas fusionnées en une seule source détaillée.

## Fiche complémentaire hors référentiel

- **Acacia dealbata / Mimosa** (fiche 1) ne correspond à aucune entrée R05/R35 repérée. Elle est classée `horsReferentiel: true` et exclue des sessions par défaut.

## Règles appliquées

- Pas de fusion automatique sur le seul genre botanique.
- Les noms R05/R35 sont conservés tels qu'ils apparaissent dans les référentiels.
- Les variantes trouvées dans les fiches détaillées sont conservées comme notes/alternatives.
- Les champs absents restent absents ; aucune chaîne vide n'est injectée pour simuler une information.
- Les données de conservation viennent uniquement de `Fiches Frans`.
- Les résumés « À retenir » sont générés uniquement à partir des couleurs, durée de tenue et précautions présentes dans la fiche source.
- Aucune donnée d'exposition, de sol, de culture au jardin, de hauteur ou d'entretien horticole n'est ajoutée.

## Images

La V1 technique utilise des placeholders lorsqu'aucune image n'a encore été validée. Le champ `image` est prévu dans la structure de données. L'ajout d'images doit faire l'objet d'un passage séparé de vérification : identité du végétal, URL exploitable, source enregistrée et droit/licence compatible avec la publication.


## Images — passe Wikimedia Commons V4

- Fiches détaillées détectées : **62**.
- Fiches détaillées avec photographie Wikimedia Commons intégrée : **61**.
- Fiches détaillées conservées avec placeholder : **1**.
- La source exacte de chaque image est enregistrée dans `image.sourceUrl` et récapitulée dans `image-sources.md`.
- Pour les entrées définies seulement au niveau du genre, la photo peut représenter une espèce explicitement citée dans la fiche détaillée ; le taxon photographié est conservé dans `image.taxonPhotographie`.
- **Eucalyptus populus** : aucune correspondance Commons suffisamment fiable n'a été retenue ; aucune correction taxonomique n'a été inventée.
