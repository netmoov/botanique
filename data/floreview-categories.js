"use strict";

/*
  Organisation Floreview :
  - fleurs_coupees
  - plantes
  - feuillage

  Tous les végétaux restent dans la base. Les anciens statuts ne servent plus
  au filtrage ni à l'affichage.
*/
(function applyFloreviewCategories() {
  const plants = Array.isArray(window.BOTANIC_PLANTS) ? window.BOTANIC_PLANTS : [];
  const plantIds = new Set([
  "agave",
  "chrysalidocarpus-lutescens-dypsis-lutescens",
  "chamaerops-humilis",
  "cycas-revoluta",
  "pandanus",
  "cyperus-papyrus-cyperus-alternifolius",
  "rhapis-excelsa",
  "philodendron-xanadu",
  "alocasia-amazonica",
  "areca-palm-dypsis-lutescens",
  "caladium-bicolor",
  "cordyline-fruticosa-red-sister",
  "ctenanthe-setosa",
  "dracaena-fragrans-massangeana",
  "dracaena-reflexa-song-of-india",
  "monstera-deliciosa",
  "pandanus-variegatus",
  "philodendron-selloum",
  "philodendron-xanadu-philodendron-bipinnatifidum",
  "phoenix-roebelenii",
  "pilea-peperomioides",
  "schefflera-arboricola",
  "zamioculcas-zamiifolia",
  "strelitzia-nicolai"
]);
  const foliageOverrides = new Set([
  "eucalyptus-populus"
]);

  for (const plant of plants) {
    let category = "fleurs_coupees";

    if (plantIds.has(plant.id)) {
      category = "plantes";
    } else if (foliageOverrides.has(plant.id) || (plant.categories || []).includes("verdure")) {
      category = "feuillage";
    }

    plant.floreviewCategorie = category;

    // Nettoyage de l'ancienne organisation : elle n'est plus utilisée dans Floreview.
    delete plant.referentiels;
    delete plant.horsReferentiel;

    if (Array.isArray(plant.sources)) {
      plant.sources = plant.sources.filter(source => {
        const text = `${source.document || ""} ${source.ficheOuPage || ""}`;
        return !/(R05|R35|IFAPME)/i.test(text);
      });
    }

    if (Array.isArray(plant.sourceNotes)) {
      plant.sourceNotes = plant.sourceNotes.filter(note => !/(R05|R35|IFAPME|référentiel)/i.test(String(note)));
    }
  }
})();
