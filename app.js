"use strict";

const PLANTS = Array.isArray(window.BOTANIC_PLANTS) ? window.BOTANIC_PLANTS : [];
const STORAGE_KEY = "ifapmeBotaniqueProgressV1";
const SETTINGS_KEY = "ifapmeBotaniqueSettingsV1";
const IMAGE_CACHE_KEY = "ifapmeBotaniqueImageCacheV2";
const imageCache = loadJson(IMAGE_CACHE_KEY, {});

const MODES = {
  discovery: { label: "Découverte", reveal: false },
  identification: { label: "Identification", reveal: true },
  latin: { label: "Noms latins", reveal: true },
  common: { label: "Noms communs", reveal: true },
  conservation: { label: "Conservation", reveal: true, detailedOnly: true },
  review: { label: "À revoir", reveal: false, reviewOnly: true }
};

const state = {
  progress: loadJson(STORAGE_KEY, {}),
  settings: loadJson(SETTINGS_KEY, { mode: "discovery" }),
  setupMode: "discovery",
  session: null,
  toastTimer: null,
  pointer: null
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

document.addEventListener("DOMContentLoaded", init);

function init() {
  if (!PLANTS.length) {
    document.body.innerHTML = '<main style="padding:2rem;font-family:sans-serif"><h1>Données indisponibles</h1><p>Le fichier de données n’a pas été chargé.</p></main>';
    return;
  }
  bindNavigation();
  renderModeOptions();
  bindSetup();
  bindSession();
  bindProgress();
  renderSourceCounters();
  renderProgressEverywhere();
  updateSetupSummary();
}

function bindNavigation() {
  document.addEventListener("click", event => {
    const target = event.target.closest("[data-view-target]");
    if (!target) return;
    showView(target.dataset.viewTarget);
  });
  $("#quick-start").addEventListener("click", () => openSetup("discovery"));
  $("#mode-grid").addEventListener("click", event => {
    const button = event.target.closest("[data-mode]");
    if (button) openSetup(button.dataset.mode);
  });
}

function showView(name) {
  $$(".view").forEach(view => view.classList.toggle("is-active", view.dataset.view === name));
  $$(".nav__button").forEach(button => button.classList.toggle("is-active", button.dataset.viewTarget === name));
  if (name === "progress") renderProgressPage();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openSetup(mode) {
  state.setupMode = MODES[mode] ? mode : "discovery";
  if (state.setupMode === "review") {
    $("#filter-detailed").checked = false;
  }
  renderModeOptions();
  syncModeConstraints();
  updateSetupSummary();
  showView("setup");
}

function renderModeOptions() {
  const container = $("#setup-mode-options");
  container.innerHTML = Object.entries(MODES).map(([key, value]) =>
    `<button type="button" data-setup-mode="${key}" aria-pressed="${String(state.setupMode === key)}">${escapeHtml(value.label)}</button>`
  ).join("");
  container.onclick = event => {
    const button = event.target.closest("[data-setup-mode]");
    if (!button) return;
    state.setupMode = button.dataset.setupMode;
    renderModeOptions();
    syncModeConstraints();
    updateSetupSummary();
  };
  $("#setup-title").textContent = `Mode ${MODES[state.setupMode].label}`;
}

function syncModeConstraints() {
  const detailed = $("#filter-detailed");
  if (MODES[state.setupMode].detailedOnly) {
    detailed.checked = true;
    detailed.disabled = true;
  } else {
    detailed.disabled = false;
  }
}

function bindSetup() {
  ["#filter-reference", "#filter-category", "#session-size", "#filter-detailed", "#filter-complementary"].forEach(selector => {
    $(selector).addEventListener("change", updateSetupSummary);
  });
  $("#session-form").addEventListener("submit", event => {
    event.preventDefault();
    startSession();
  });
}

function getSetupFilters() {
  return {
    reference: $("#filter-reference").value,
    category: $("#filter-category").value,
    detailed: $("#filter-detailed").checked || MODES[state.setupMode].detailedOnly,
    complementary: $("#filter-complementary").checked,
    size: $("#session-size").value
  };
}

function plantMatchesFilters(plant, filters, mode = state.setupMode) {
  const refs = plant.referentiels || [];
  const progress = getPlantProgress(plant.id);
  if (!filters.complementary && plant.horsReferentiel) return false;
  if (mode === "review" && progress.status !== "review") return false;
  if (filters.detailed && plant.niveauInformation === "referentiel_uniquement") return false;
  if (mode === "conservation" && !plant.tenueConservation) return false;

  if (filters.reference === "R05" && !refs.some(r => r.code === "R05")) return false;
  if (filters.reference === "R35" && !refs.some(r => r.code === "R35")) return false;
  if (filters.reference === "R35-obligatoire" && !refs.some(r => r.code === "R35" && r.statut === "obligatoire")) return false;
  if (filters.reference === "R35-facultatif" && !refs.some(r => r.code === "R35" && r.statut === "facultatif")) return false;

  if (filters.category !== "all" && !(plant.categories || []).includes(filters.category)) return false;
  return true;
}

function filteredPlants(filters = getSetupFilters(), mode = state.setupMode) {
  return PLANTS.filter(plant => plantMatchesFilters(plant, filters, mode));
}

function updateSetupSummary() {
  if (!$("#setup-summary")) return;
  const candidates = filteredPlants();
  const mode = MODES[state.setupMode];
  let message = `${candidates.length} végétal${candidates.length > 1 ? "ux" : ""} disponible${candidates.length > 1 ? "s" : ""} pour le mode ${mode.label}.`;
  if (state.setupMode === "review" && !candidates.length) message = "Aucun végétal n’est actuellement marqué « À revoir ».";
  if (state.setupMode === "conservation") message += " Les fiches sans données détaillées sont automatiquement exclues.";
  $("#setup-summary").textContent = message;
}

function startSession(override = null) {
  const mode = override?.mode || state.setupMode;
  const filters = override?.filters || getSetupFilters();
  let candidates = filteredPlants(filters, mode);
  if (!candidates.length) {
    showToast(mode === "review" ? "Aucune plante à revoir pour le moment." : "Aucun végétal ne correspond à ces filtres.");
    return;
  }
  const requestedSize = override?.size || filters.size;
  const limit = requestedSize === "all" ? candidates.length : Math.min(Number(requestedSize || 20), candidates.length);
  const queue = weightedSelection(candidates, limit);
  state.settings.mode = mode;
  saveJson(SETTINGS_KEY, state.settings);
  state.session = {
    mode,
    filters,
    queue,
    index: 0,
    revealed: !MODES[mode].reveal,
    known: 0,
    review: 0,
    streak: 0,
    maxStreak: 0,
    answeredIds: []
  };
  renderCurrentCard();
  showView("session");
}

function weightedSelection(items, limit) {
  return items
    .map(plant => ({ plant, key: -Math.log(Math.max(Math.random(), .000001)) / priorityWeight(plant) }))
    .sort((a,b) => a.key - b.key)
    .slice(0, limit)
    .map(item => item.plant);
}

function priorityWeight(plant) {
  const p = getPlantProgress(plant.id);
  if (p.status === "review") return 8 + Math.min(5, p.reviewCount || 0);
  if (!p.status || p.status === "unseen") return 4;
  return Math.max(.55, 2.2 - Math.min(1.5, (p.streak || 0) * .3) - Math.min(.6, (p.knownCount || 0) * .08));
}

function bindSession() {
  $("#exit-session").addEventListener("click", () => {
    if (state.session && state.session.index > 0 && !window.confirm("Quitter cette session en cours ? La progression déjà enregistrée sera conservée.")) return;
    state.session = null;
    showView("home");
  });
  $("#reveal-answer").addEventListener("click", revealAnswer);
  $("#toggle-details").addEventListener("click", toggleDetails);
  $("#close-plant-detail").addEventListener("click", closePlantDetails);
  $("#plant-detail-dialog").addEventListener("click", event => {
    if (event.target === $("#plant-detail-dialog")) closePlantDetails();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !$("#plant-detail-dialog").hidden) closePlantDetails();
  });
  $("#mark-review").addEventListener("click", () => answerCurrent("review"));
  $("#mark-known").addEventListener("click", () => answerCurrent("known"));

  const card = $("#plant-card");
  card.addEventListener("pointerdown", onPointerDown);
  card.addEventListener("pointermove", onPointerMove);
  card.addEventListener("pointerup", onPointerUp);
  card.addEventListener("pointercancel", onPointerCancel);
  card.addEventListener("keydown", event => {
    if (!state.session) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); answerCurrent("review"); }
    if (event.key === "ArrowRight") { event.preventDefault(); answerCurrent("known"); }
    if (event.key === "Enter" && MODES[state.session.mode].reveal && !state.session.revealed) revealAnswer();
  });

  $("#finish-review").addEventListener("click", () => {
    openSetup("review");
  });
  $("#finish-again").addEventListener("click", () => {
    const mode = state.settings.mode || "discovery";
    openSetup(mode);
  });
}

function currentPlant() {
  return state.session?.queue[state.session.index] || null;
}

function renderCurrentCard() {
  const session = state.session;
  const plant = currentPlant();
  if (!session || !plant) return finishSession();

  session.revealed = !MODES[session.mode].reveal;
  const card = $("#plant-card");
  card.className = "plant-card";
  card.style.transform = "";
  card.style.opacity = "";
  renderImage(plant);
  renderBadges(plant);
  renderQuestionAndAnswer(plant);
  $("#toggle-details").innerHTML = 'Voir la fiche complète <span>↗</span>';
  updateSessionHeader();
  syncAnswerButtons();
  card.focus({ preventScroll: true });
}

function renderImage(plant) {
  const container = $("#plant-image");
  const name = displayName(plant);
  const image = plant.image;
  if (!image?.url || !String(image.url).startsWith("assets/images/")) {
    container.innerHTML = placeholderHtml(name, "Photo locale en préparation");
    return;
  }
  const sourceLink = image.sourceUrl
    ? `<a class="photo-credit" href="${escapeAttr(image.sourceUrl)}" target="_blank" rel="noopener noreferrer" title="Voir la source et la licence">Photo · ${escapeHtml(image.source || "Wikimedia Commons")}</a>`
    : "";
  const matchNote = image.matchNote ? `<span class="photo-match-note">${escapeHtml(image.matchNote)}</span>` : "";
  container.innerHTML = `<img src="${escapeAttr(image.url)}" alt="${escapeAttr(image.texteAlternatif || name)}" loading="eager">${sourceLink}${matchNote}`;
  const img = container.querySelector("img");
  img.addEventListener("error", () => {
    container.innerHTML = placeholderHtml(name, "Photo locale introuvable");
  }, { once: true });
}

function placeholderHtml(name, reason = "Image indisponible") {
  return `<div class="placeholder"><span class="placeholder__leaf" aria-hidden="true">❧</span><strong>${escapeHtml(reason)}</strong><small>${escapeHtml(name)}</small></div>`;
}

function renderBadges(plant) {
  const badges=[];
  const refs=plant.referentiels || [];
  if ((plant.categories || []).includes("fleur_plante")) badges.push('<span class="badge">Fleur / plante</span>');
  if ((plant.categories || []).includes("verdure")) badges.push('<span class="badge">Verdure</span>');
  if (plant.horsReferentiel) badges.push('<span class="badge badge--rose">Hors référentiel</span>');
  if (refs.some(r => r.code === "R05")) badges.push('<span class="badge badge--gold">R05</span>');
  if (refs.some(r => r.code === "R35")) badges.push('<span class="badge badge--gold">R35</span>');
  if (refs.some(r => r.code === "R35" && r.statut === "obligatoire")) badges.push('<span class="badge">Obligatoire</span>');
  if (refs.some(r => r.code === "R35" && r.statut === "facultatif")) badges.push('<span class="badge">Facultatif</span>');
  const p=getPlantProgress(plant.id);
  if (p.status === "known") badges.push('<span class="badge">Connue</span>');
  if (p.status === "review") badges.push('<span class="badge badge--rose">À revoir</span>');
  $("#plant-badges").innerHTML=badges.join("");
}

function renderQuestionAndAnswer(plant) {
  const mode=state.session.mode;
  const common=displayName(plant);
  const latin=plant.nomLatinPrincipal || "Nom latin non indiqué";
  const aliases=(plant.autresNomsCommuns || []).join(" · ");
  const question=$("#question-block");
  const answer=$("#answer-block");
  const reveal=$("#reveal-answer");

  answer.innerHTML="";
  reveal.hidden=!MODES[mode].reveal;
  reveal.textContent = mode === "latin" ? "Afficher le nom latin" : mode === "common" ? "Afficher le nom commun" : "Afficher la réponse";

  if (mode === "identification") {
    question.innerHTML='<p class="eyebrow">Identification</p><h2>Quel est ce végétal ?</h2><p>Observe l’image puis révèle la réponse.</p>';
  } else if (mode === "latin") {
    question.innerHTML=`<p class="eyebrow">Nom latin</p><h2>${escapeHtml(common)}</h2><p>Quel est son nom latin ?</p>`;
  } else if (mode === "common") {
    question.innerHTML=`<p class="eyebrow">Nom commun</p><h2><em>${escapeHtml(latin)}</em></h2><p>Quel nom est utilisé en fleuristerie ?</p>`;
  } else if (mode === "conservation") {
    question.innerHTML=`<p class="eyebrow">Conservation</p><h2>${escapeHtml(common)}</h2><p class="latin"><em>${escapeHtml(latin)}</em></p><p>Retrouve les besoins en eau, la tenue et les précautions avant de révéler.</p>`;
  } else {
    question.innerHTML=`<p class="eyebrow">${mode === "review" ? "À revoir" : "Découverte"}</p><h2>${escapeHtml(common)}</h2><p class="latin"><em>${escapeHtml(latin)}</em></p>${aliases ? `<p>${escapeHtml(aliases)}</p>` : ""}`;
    answer.innerHTML=renderQuickFacts(plant, mode === "review");
  }
}

function revealAnswer() {
  if (!state.session || state.session.revealed) return;
  state.session.revealed=true;
  const plant=currentPlant();
  const mode=state.session.mode;
  const common=displayName(plant);
  const latin=plant.nomLatinPrincipal || "Nom latin non indiqué";
  let html="";
  if (mode === "identification") {
    html=`<p class="eyebrow">Réponse</p><h2>${escapeHtml(common)}</h2><p class="latin"><em>${escapeHtml(latin)}</em></p>${renderQuickFacts(plant,true)}`;
  } else if (mode === "latin") {
    html=`<p class="eyebrow">Réponse</p><h2><em>${escapeHtml(latin)}</em></h2>${plant.autresNomsCommuns?.length ? `<p>${escapeHtml(plant.autresNomsCommuns.join(" · "))}</p>` : ""}`;
  } else if (mode === "common") {
    html=`<p class="eyebrow">Réponse</p><h2>${escapeHtml(common)}</h2>${plant.autresNomsCommuns?.length ? `<p>${escapeHtml(plant.autresNomsCommuns.join(" · "))}</p>` : ""}`;
  } else if (mode === "conservation") {
    html=`<p class="eyebrow">Réponse</p>${renderConservationSummary(plant)}`;
  }
  $("#answer-block").innerHTML=html;
  $("#reveal-answer").hidden=true;
  syncAnswerButtons();
}

function renderQuickFacts(plant, expanded=false) {
  const id=plant.identification || {};
  const tc=plant.tenueConservation || {};
  const facts=[];
  if (id.famille) facts.push(["Famille", id.famille]);
  if (id.couleurs?.length) facts.push(["Couleurs", id.couleurs.join(", ")]);
  if (id.saisonDisponibilite) facts.push(["Saison", id.saisonDisponibilite]);
  if (expanded && tc.dureeTenue) facts.push(["Tenue", tc.dureeTenue]);
  if (!facts.length) return '<p class="no-details">Informations détaillées non disponibles dans les documents fournis.</p>';
  return `<div class="detail-grid">${facts.slice(0, expanded ? 4 : 3).map(([k,v]) => `<div class="detail-item"><strong>${escapeHtml(k)}</strong><span>${escapeHtml(v)}</span></div>`).join("")}</div>`;
}

function renderConservationSummary(plant) {
  const tc=plant.tenueConservation || {};
  const pp=plant.preparationPrecautions || {};
  const facts=[];
  if (tc.besoinEau) facts.push(["Eau",tc.besoinEau]);
  if (tc.dureeTenue) facts.push(["Tenue",tc.dureeTenue]);
  if (tc.comportementChaleur) facts.push(["Chaleur",tc.comportementChaleur]);
  if (tc.sensibiliteEthylene) facts.push(["Éthylène",tc.sensibiliteEthylene]);
  if (pp.temperatureStockage) facts.push(["Stockage",pp.temperatureStockage]);
  if (pp.manipulation) facts.push(["Précaution",pp.manipulation]);
  return facts.length ? `<div class="detail-grid">${facts.map(([k,v])=>`<div class="detail-item"><strong>${escapeHtml(k)}</strong><span>${escapeHtml(v)}</span></div>`).join("")}</div>` : '<p class="no-details">Informations de conservation non disponibles.</p>';
}

function buildDetailsHtml(plant) {
  const id=plant.identification || {};
  const tc=plant.tenueConservation || {};
  const pp=plant.preparationPrecautions || {};
  const sections=[];

  const idItems=[];
  addDetail(idItems,"Nom latin",plant.nomLatinPrincipal || "Non indiqué");
  if (plant.nomsLatinsAlternatifs?.length) addDetail(idItems,"Variantes latines",plant.nomsLatinsAlternatifs.join(" · "));
  addDetail(idItems,"Nom commun principal",plant.nomCommunPrincipal || "Non indiqué dans le référentiel");
  if (plant.autresNomsCommuns?.length) addDetail(idItems,"Autres noms",plant.autresNomsCommuns.join(" · "));
  if (plant.nomFleuristerie) addDetail(idItems,"Nom utilisé en fleuristerie",plant.nomFleuristerie);
  addDetail(idItems,"Catégorie",(plant.categories || []).map(c => c === "verdure" ? "Verdure" : "Fleur / plante").join(" · "));
  addDetail(idItems,"Famille",id.famille);
  addDetail(idItems,"Couleurs",id.couleurs?.join(", "));
  addDetail(idItems,"Saison / disponibilité",id.saisonDisponibilite);
  addDetail(idItems,"Origine",id.origine);
  addDetail(idItems,"Niveau de prix",id.niveauPrixTexte || id.niveauPrix);
  sections.push(detailSection("Identification",idItems));

  const tcItems=[];
  addDetail(tcItems,"Eau",tc.besoinEau);
  addDetail(tcItems,"Hydrophilie",tc.niveauHydrophilie);
  addDetail(tcItems,"Durée de tenue",tc.dureeTenue);
  addDetail(tcItems,"Chaleur",tc.comportementChaleur);
  addDetail(tcItems,"Déshydratation / fragilité",tc.deshydratationFragilite);
  addDetail(tcItems,"Éthylène",tc.sensibiliteEthylene);
  if (tcItems.length) sections.push(detailSection("Tenue & conservation",tcItems));

  const ppItems=[];
  addDetail(ppItems,"Manipulation",pp.manipulation);
  addDetail(ppItems,"Préparation de tige",pp.preparationTige);
  addDetail(ppItems,"Brumisation",pp.brumisation);
  addDetail(ppItems,"Bonne pratique",pp.bonnePratiqueSource);
  addDetail(ppItems,"Compatibilités",pp.compatibilites?.join(" · "));
  addDetail(ppItems,"Associations déconseillées",pp.associationsDeconseillees?.join(" · "));
  addDetail(ppItems,"Température",pp.temperatureStockage);
  addDetail(ppItems,"Transport",pp.transport);
  addDetail(ppItems,"Mise en eau / hydratation",pp.miseEnEauHydratation);
  if (ppItems.length) sections.push(detailSection("Préparation & précautions",ppItems));

  const refs=(plant.referentiels || []).map(r => `${r.code}${r.statut ? ` · ${capitalize(r.statut)}` : ""} · ${r.categorie === "verdure" ? "Verdure" : "Fleur / plante"}${r.nomLatinSource && r.nomLatinSource !== plant.nomLatinPrincipal ? ` · ${r.nomLatinSource}` : ""}`);
  if (refs.length) sections.push(`<section class="detail-section"><h3>Référentiel IFAPME</h3><ul class="retain-list">${refs.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul></section>`);
  else if (plant.horsReferentiel) sections.push('<section class="detail-section"><h3>Référentiel IFAPME</h3><p class="no-details">Fiche complémentaire hors référentiel. Elle est exclue des sessions par défaut.</p></section>');

  if (plant.resumePedagogique?.length) sections.push(`<section class="detail-section"><h3>À retenir</h3><ul class="retain-list">${plant.resumePedagogique.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul></section>`);
  if (plant.niveauInformation === "referentiel_uniquement") sections.push('<section class="detail-section"><h3>Données détaillées</h3><p class="no-details">Informations détaillées non disponibles dans les documents fournis. Cette carte reste utilisable pour la reconnaissance visuelle et l’apprentissage des noms.</p></section>');

  if (plant.image?.sourceUrl) {
    sections.push(`<section class="detail-section"><h3>Photographie</h3><p class="photo-source-detail"><a href="${escapeAttr(plant.image.sourceUrl)}" target="_blank" rel="noopener noreferrer">Source et licence Wikimedia Commons ↗</a>${plant.image.author ? `<br><small>Auteur : ${escapeHtml(plant.image.author)}</small>` : ""}${plant.image.license ? `<br><small>Licence : ${escapeHtml(plant.image.license)}</small>` : ""}</p></section>`);
  }
  if (plant.sourceNotes?.length) sections.push(`<section class="detail-section"><h3>Notes source</h3><ul class="retain-list">${plant.sourceNotes.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul></section>`);
  return sections.join("") || '<p class="no-details">Aucune information disponible pour cette fiche.</p>';
}

function addDetail(items,label,value) { if (value !== undefined && value !== null && String(value).trim() !== "") items.push([label,String(value)]); }
function detailSection(title,items) {
  return `<section class="detail-section"><h3>${escapeHtml(title)}</h3><div class="detail-grid">${items.map(([k,v])=>`<div class="detail-item"><strong>${escapeHtml(k)}</strong><span>${escapeHtml(v)}</span></div>`).join("")}</div></section>`;
}

function toggleDetails() {
  const plant = currentPlant();
  if (!plant) return;
  const overlay = $("#plant-detail-dialog");
  const content = $("#plant-detail-dialog-content");
  $("#plant-detail-title").textContent = `${displayName(plant)} · ${plant.nomLatinPrincipal || ""}`;
  content.innerHTML = buildDetailsHtml(plant);
  overlay.hidden = false;
  overlay.classList.add("is-open");
  document.body.classList.add("dialog-open");
  content.scrollTop = 0;
  requestAnimationFrame(() => $("#close-plant-detail")?.focus());
}

function closePlantDetails() {
  const overlay = $("#plant-detail-dialog");
  overlay.classList.remove("is-open");
  overlay.hidden = true;
  document.body.classList.remove("dialog-open");
  $("#toggle-details")?.focus({ preventScroll: true });
}

function syncAnswerButtons() {
  const blocked=state.session && MODES[state.session.mode].reveal && !state.session.revealed;
  $("#mark-review").disabled=Boolean(blocked);
  $("#mark-known").disabled=Boolean(blocked);
}

function answerCurrent(outcome, fromSwipe=false) {
  if (!state.session) return;
  if (MODES[state.session.mode].reveal && !state.session.revealed) {
    showToast("Révèle d’abord la réponse avant de classer la plante.");
    return resetCardTransform();
  }
  const plant=currentPlant();
  if (!plant) return;
  updatePlantProgress(plant.id,outcome);
  state.session.answeredIds.push(plant.id);
  if (outcome === "known") {
    state.session.known++;
    state.session.streak++;
    state.session.maxStreak=Math.max(state.session.maxStreak,state.session.streak);
  } else {
    state.session.review++;
    state.session.streak=0;
  }
  saveJson(STORAGE_KEY,state.progress);
  renderProgressEverywhere();
  animateAndAdvance(outcome,fromSwipe);
}

function updatePlantProgress(id,outcome) {
  const old=getPlantProgress(id);
  const next={...old};
  next.seenCount=(old.seenCount||0)+1;
  next.lastSeenAt=new Date().toISOString();
  if (outcome === "known") {
    next.status="known";
    next.knownCount=(old.knownCount||0)+1;
    next.streak=(old.streak||0)+1;
  } else {
    next.status="review";
    next.reviewCount=(old.reviewCount||0)+1;
    next.streak=0;
  }
  state.progress[id]=next;
}

function animateAndAdvance(outcome) {
  const card=$("#plant-card");
  card.classList.add(outcome === "known" ? "fly-right" : "fly-left");
  window.setTimeout(() => {
    state.session.index++;
    if (state.session.index >= state.session.queue.length) finishSession();
    else renderCurrentCard();
  }, 220);
}

function updateSessionHeader() {
  const s=state.session;
  if (!s) return;
  $("#session-label").textContent=MODES[s.mode].label;
  $("#session-counter").textContent=`${s.index + 1} / ${s.queue.length}`;
  $("#session-progress-bar").style.width=`${Math.round((s.index/s.queue.length)*100)}%`;
  $("#session-streak").textContent=`${s.streak} série${s.streak>1?"s":""}`;
}

function finishSession() {
  const s=state.session;
  if (!s) return showView("home");
  const total=s.known+s.review;
  const mastery=total ? Math.round((s.known/total)*100) : 0;
  $("#finish-stats").innerHTML=[
    [total,"révisées"],[s.known,"connues"],[s.review,"à revoir"],[`${mastery}%`,"maîtrise"],[s.maxStreak,"meilleure série"]
  ].map(([v,l])=>`<div class="finish-stat"><strong>${escapeHtml(String(v))}</strong><span>${escapeHtml(l)}</span></div>`).join("");
  $("#finish-review").disabled = !Object.values(state.progress).some(p=>p.status==="review");
  state.session=null;
  showView("finish");
}

function onPointerDown(event) {
  if (!state.session || event.pointerType === "mouse" && event.button !== 0) return;
  state.pointer={id:event.pointerId,startX:event.clientX,currentX:event.clientX};
  event.currentTarget.setPointerCapture?.(event.pointerId);
  event.currentTarget.classList.add("is-dragging");
}
function onPointerMove(event) {
  if (!state.pointer || state.pointer.id !== event.pointerId) return;
  state.pointer.currentX=event.clientX;
  const dx=event.clientX-state.pointer.startX;
  const card=$("#plant-card");
  card.style.transform=`translateX(${dx}px) rotate(${dx/24}deg)`;
  const intensity=Math.min(1,Math.abs(dx)/120);
  $(".swipe-stamp--known").style.opacity=dx>0?String(intensity):"0";
  $(".swipe-stamp--review").style.opacity=dx<0?String(intensity):"0";
}
function onPointerUp(event) {
  if (!state.pointer || state.pointer.id !== event.pointerId) return;
  const dx=state.pointer.currentX-state.pointer.startX;
  state.pointer=null;
  $("#plant-card").classList.remove("is-dragging");
  clearStamps();
  if (Math.abs(dx) >= 105) answerCurrent(dx>0?"known":"review",true);
  else resetCardTransform();
}
function onPointerCancel() { state.pointer=null; clearStamps(); resetCardTransform(); }
function resetCardTransform() { const c=$("#plant-card"); c.style.transform=""; c.classList.remove("is-dragging"); clearStamps(); }
function clearStamps() { $$(".swipe-stamp").forEach(x=>x.style.opacity="0"); }

function bindProgress() {
  $("#reset-progress").addEventListener("click", () => {
    if (!window.confirm("Réinitialiser définitivement toute la progression enregistrée dans ce navigateur ?")) return;
    state.progress={};
    localStorage.removeItem(STORAGE_KEY);
    renderProgressEverywhere();
    renderProgressPage();
    showToast("Progression réinitialisée.");
  });
  $("#progress-review-start").addEventListener("click",()=>openSetup("review"));
}

function progressSummary() {
  const official=PLANTS.filter(p=>!p.horsReferentiel);
  let seen=0,known=0,review=0;
  official.forEach(plant=>{
    const p=getPlantProgress(plant.id);
    if ((p.seenCount||0)>0) seen++;
    if (p.status==="known") known++;
    if (p.status==="review") review++;
  });
  return { total:official.length,seen,known,review,mastery:official.length?Math.round(known/official.length*100):0 };
}

function renderProgressEverywhere() {
  const s=progressSummary();
  $("#home-mastery").textContent=`${s.mastery}%`;
  $("#home-mastery-ring").style.setProperty("--progress",`${s.mastery*3.6}deg`);
  $("#home-known").textContent=s.known;
  $("#home-review").textContent=s.review;
  $("#home-seen").textContent=s.seen;
}

function renderProgressPage() {
  const s=progressSummary();
  const stats=[[s.total,"total"],[s.seen,"déjà vues"],[s.known,"connues"],[s.review,"à revoir"],[`${s.mastery}%`,"maîtrise"]];
  $("#progress-stats").innerHTML=stats.map(([v,l])=>`<div class="progress-stat"><strong>${escapeHtml(String(v))}</strong><span>${escapeHtml(l)}</span></div>`).join("");
  $("#progress-bar-large").style.width=`${s.mastery}%`;
  $("#progress-review-start").disabled=s.review===0;
  const reviewPlants=PLANTS.filter(p=>getPlantProgress(p.id).status==="review").sort(sortByName);
  const knownPlants=PLANTS.filter(p=>getPlantProgress(p.id).status==="known").sort(sortByName);
  $("#review-count-badge").textContent=reviewPlants.length;
  $("#known-count-badge").textContent=knownPlants.length;
  $("#review-list").innerHTML=renderPlantList(reviewPlants,"Aucun végétal à revoir.");
  $("#known-list").innerHTML=renderPlantList(knownPlants,"Aucun végétal classé comme connu.");
}

function renderPlantList(plants,emptyText) {
  if (!plants.length) return `<div class="empty-list">${escapeHtml(emptyText)}</div>`;
  return plants.map(plant=>{
    const p=getPlantProgress(plant.id);
    return `<div class="plant-list-item"><div><strong>${escapeHtml(displayName(plant))}</strong><span><em>${escapeHtml(plant.nomLatinPrincipal||"")}</em></span></div><span>${p.seenCount||0} vue${(p.seenCount||0)>1?"s":""}</span></div>`;
  }).join("");
}

function renderSourceCounters() {
  const official=PLANTS.filter(p=>!p.horsReferentiel);
  const detailed=PLANTS.filter(p=>p.niveauInformation!=="referentiel_uniquement");
  const r05=official.filter(p=>(p.referentiels||[]).some(r=>r.code==="R05"));
  const r35=official.filter(p=>(p.referentiels||[]).some(r=>r.code==="R35"));
  $("#source-counters").innerHTML=[
    [official.length,"fiches officielles"],[r05.length,"entrées/carte R05"],[r35.length,"entrées/carte R35"],[detailed.length,"cartes enrichies"]
  ].map(([v,l])=>`<div class="source-counter"><strong>${v}</strong><span>${escapeHtml(l)}</span></div>`).join("");
}

function getPlantProgress(id) {
  return state.progress[id] || { status:"unseen", seenCount:0, knownCount:0, reviewCount:0, streak:0 };
}
function displayName(plant) { return plant.nomCommunPrincipal || plant.nomLatinPrincipal || "Végétal sans nom"; }
function sortByName(a,b) { return displayName(a).localeCompare(displayName(b),"fr",{sensitivity:"base"}); }
function capitalize(s) { return s ? s.charAt(0).toUpperCase()+s.slice(1) : ""; }

function showToast(message) {
  const toast=$("#toast");
  clearTimeout(state.toastTimer);
  toast.textContent=message;
  toast.classList.add("is-visible");
  state.toastTimer=setTimeout(()=>toast.classList.remove("is-visible"),2600);
}

function loadJson(key,fallback) {
  try { const raw=localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}
function saveJson(key,value) { localStorage.setItem(key,JSON.stringify(value)); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function escapeAttr(value) { return escapeHtml(value); }
