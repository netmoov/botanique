"use strict";

/* V7 — enrichissement depuis "listing R05 mars 2026 MODULE BOF 1 et 2". */
(function enrichFamiliesFromOfficialSource() {
  const plants = Array.isArray(window.BOTANIC_PLANTS) ? window.BOTANIC_PLANTS : [];
  const families = {
  "allium": "Amaryllidaceae / Liliaceae",
  "lilium-hybrides-orientaux": "Amaryllidaceae / Liliaceae",
  "anthurium-feuillage-anthurium-andraeanum": "Araceae",
  "anthurium-andraeanum": "Araceae",
  "monstera-deliciosa": "Araceae",
  "philodendron-selloum": "Araceae",
  "philodendron-xanadu": "Araceae",
  "philodendron-xanadu-philodendron-bipinnatifidum": "Araceae",
  "schefflera-arboricola": "Araliaceae",
  "hedera-helix": "Araliaceae",
  "fatsia-japonica": "Araliaceae",
  "densiflorus-asparagus-densiflorus": "Asparagaceae",
  "asparagus-plumosus": "Asparagaceae",
  "asparagus-sprengeri": "Asparagaceae",
  "asparagus-setaceus": "Asparagaceae",
  "aspidistra-elatior": "Asparagaceae",
  "aspidistra-variegata": "Asparagaceae",
  "dracaena-reflexa-song-of-india": "Asparagaceae",
  "dracaena-fragrans-massangeana": "Asparagaceae",
  "flexi-grass-chlorophytum-laxum-ornamental-grass": "Asparagaceae",
  "quercus-feuilles": "Fagaceae",
  "eucalyptus-gunnii": "Myrtaceae",
  "myrtus-communis": "Myrtaceae",
  "cortaderia-selloana": "Poaceae (Graminées)",
  "miscanthus-sinensis": "Poaceae (Graminées)",
  "ranunculus-asiaticus": "Ranunculaceae",
  "anemone-coronaria": "Ranunculaceae",
  "nigella-damascena": "Ranunculaceae",
  "rosa": "Rosaceae",
  "rosa-hybrida-garden-roses": "Rosaceae",
  "salix-caprea-feuillage-ou-rameaux-doux": "Salicaceae",
  "calathea-lutea-tiges-feuilles-structurelles": "Marantaceae",
  "ruscus-hypophyllum-ruscus-aculeatus": "Asparagaceae"
};
  const sourceDocument = "listing R05 mars 2026 MODULE BOF 1 et 2";
  const sourceLocation = "Liste des familles botaniques";

  for (const plant of plants) {
    const family = families[plant.id];
    if (!family) continue;

    plant.identification = plant.identification || {};
    if (!plant.identification.famille) plant.identification.famille = family;

    plant.sources = Array.isArray(plant.sources) ? plant.sources : [];
    if (!plant.sources.some(source => source.document === sourceDocument)) {
      plant.sources.push({ document: sourceDocument, ficheOuPage: sourceLocation });
    }

    if (plant.id === "ruscus-hypophyllum-ruscus-aculeatus") {
      plant.sourceNotes = Array.isArray(plant.sourceNotes) ? plant.sourceNotes : [];
      const note = "Le document des familles cite Ruscus dans la ligne Lauraceae tout en précisant que la classification actuelle le place souvent dans les Asparagaceae ; l’application retient Asparagaceae et conserve cette remarque.";
      if (!plant.sourceNotes.includes(note)) plant.sourceNotes.push(note);
    }
  }
})();
