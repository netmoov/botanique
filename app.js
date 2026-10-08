"use strict";

const PLANTS = Array.isArray(window.BOTANIC_PLANTS) ? window.BOTANIC_PLANTS : [];
const STORAGE_KEY = "floreviewProgressV1";
const SETTINGS_KEY = "floreviewSettingsV1";

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
    const anchor = event.target.closest("[data-home-anchor]");
    if (anchor) {
      event.preventDefault();
      navigateToHomeAnchor(anchor.dataset.homeAnchor, true);
      return;
    }

    const target = event.target.closest("[data-view-target]");
    if (!target) return;
    showView(target.dataset.viewTarget);
  });

  window.addEventListener("hashchange", applyHashRoute);

  $("#quick-start").addEventListener("click", () => openSetup("discovery"));
  $("#mode-grid").addEventListener("click", event => {
    const button = event.target.closest("[data-mode]");
    if (button) openSetup(button.dataset.mode);
  });

  requestAnimationFrame(applyHashRoute);
}

function showView(name) {
  $$(".view").forEach(view => view.classList.toggle("is-active", view.dataset.view === name));
  $$(".nav__button").forEach(button => button.classList.toggle("is-active", button.dataset.viewTarget === name));
  $$(".nav__link").forEach(link => link.classList.remove("is-active"));
  if (name === "progress") renderProgressPage();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function navigateToHomeAnchor(anchorId, updateHash = false) {
  const target = document.getElementById(anchorId);
  if (!target) return;

  $$(".view").forEach(view => view.classList.toggle("is-active", view.dataset.view === "home"));
  $$(".nav__button").forEach(button => button.classList.toggle("is-active", button.dataset.viewTarget === "home" && anchorId === "home"));
  $$(".nav__link").forEach(link => link.classList.toggle("is-active", link.dataset.homeAnchor === anchorId));

  if (updateHash) {
    history.pushState(null, "", `#${anchorId}`);
  }

  requestAnimationFrame(() => {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function applyHashRoute() {
  const anchorId = location.hash.replace("#", "");
  if (["modes-revision", "collection-floreview", "about-floreview"].includes(anchorId)) {
    navigateToHomeAnchor(anchorId, false);
  }
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
  ["#filter-category", "#session-size", "#filter-detailed"].forEach(selector => {
    $(selector).addEventListener("change", updateSetupSummary);
  });
  $("#session-form").addEventListener("submit", event => {
    event.preventDefault();
    startSession();
  });
}

function getSetupFilters() {
  return {
    category: $("#filter-category").value,
    detailed: $("#filter-detailed").checked || MODES[state.setupMode].detailedOnly,
    size: $("#session-size").value
  };
}

function plantMatchesFilters(plant, filters, mode = state.setupMode) {
  const progress = getPlantProgress(plant.id);
  if (mode === "review" && progress.status !== "review") return false;
  if (filters.detailed && plant.niveauInformation === "referentiel_uniquement") return false;
  if (mode === "conservation" && !plant.tenueConservation) return false;
  if (filters.category !== "all" && plant.floreviewCategorie !== filters.category) return false;
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
  $("#reveal-answer").addEventListener("pointerdown", event => {
    event.stopPropagation();
  });
  $("#reveal-answer").addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    revealAnswer();
  });
  $("#toggle-details").addEventListener("click", toggleDetails);
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
  renderInlineDetails(plant);
  const detailsButton = $("#toggle-details");
  detailsButton.setAttribute("aria-expanded", "false");
  detailsButton.innerHTML = 'Voir la fiche complète <span aria-hidden="true">⌄</span>';
  $("#plant-details").hidden = true;
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
  badges.push(`<span class="badge">${escapeHtml(categoryLabel(plant))}</span>`);
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
    html=`<p class="eyebrow">Réponse</p><h2 class="recognition-latin"><strong><em>${escapeHtml(latin)}</em></strong></h2><p class="recognition-common">${escapeHtml(common)}</p>${plant.autresNomsCommuns?.length ? `<p class="recognition-aliases">${escapeHtml(plant.autresNomsCommuns.join(" · "))}</p>` : ""}${renderQuickFacts(plant,true)}`;
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
  if (!facts.length) return '<p class="no-details">Les informations de conservation et de préparation détaillées ne sont pas documentées dans les sources retenues.</p>';
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
  return facts.length ? `<div class="detail-grid">${facts.map(([k,v])=>`<div class="detail-item"><strong>${escapeHtml(k)}</strong><span>${escapeHtml(v)}</span></div>`).join("")}</div>` : '<p class="no-details">Informations de conservation non documentées dans les sources retenues.</p>';
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
  addDetail(idItems,"Catégorie Floreview",categoryLabel(plant));
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


  if (plant.resumePedagogique?.length) sections.push(`<section class="detail-section"><h3>À retenir</h3><ul class="retain-list">${plant.resumePedagogique.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul></section>`);
  if (plant.sources?.length) {
    const sourceLabels = [...new Set(
      plant.sources
        .map(source => [source.document, source.ficheOuPage].filter(Boolean).join(" — "))
        .filter(label => label && !/(R05|R35|IFAPME)/i.test(label))
    )];
    if (sourceLabels.length) {
      sections.push(`<section class="detail-section"><h3>Sources documentaires</h3><ul class="retain-list">${sourceLabels.map(label=>`<li>${escapeHtml(label)}</li>`).join("")}</ul></section>`);
    }
  }
  if (plant.niveauInformation === "referentiel_uniquement") sections.push('<section class="detail-section"><h3>Données détaillées</h3><p class="no-details">Les informations de conservation et de préparation détaillées ne sont pas documentées dans les sources retenues. Les données d’identification disponibles restent affichées ci-dessus.</p></section>');

  if (plant.image?.sourceUrl) {
    sections.push(`<section class="detail-section"><h3>Photographie</h3><p class="photo-source-detail"><a href="${escapeAttr(plant.image.sourceUrl)}" target="_blank" rel="noopener noreferrer">Source et licence Wikimedia Commons ↗</a>${plant.image.author ? `<br><small>Auteur : ${escapeHtml(plant.image.author)}</small>` : ""}${plant.image.license ? `<br><small>Licence : ${escapeHtml(plant.image.license)}</small>` : ""}</p></section>`);
  }
  const visibleNotes=(plant.sourceNotes || []).filter(note => !/(R05|R35|IFAPME|référentiel)/i.test(String(note)));
  if (visibleNotes.length) sections.push(`<section class="detail-section"><h3>Notes source</h3><ul class="retain-list">${visibleNotes.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul></section>`);
  return sections.join("") || '<p class="no-details">Aucune information disponible pour cette fiche.</p>';
}

function addDetail(items,label,value) { if (value !== undefined && value !== null && String(value).trim() !== "") items.push([label,String(value)]); }
function detailSection(title,items) {
  return `<section class="detail-section"><h3>${escapeHtml(title)}</h3><div class="detail-grid">${items.map(([k,v])=>`<div class="detail-item"><strong>${escapeHtml(k)}</strong><span>${escapeHtml(v)}</span></div>`).join("")}</div></section>`;
}

function renderInlineDetails(plant) {
  const content = $("#plant-details");
  if (!content || !plant) return;
  content.innerHTML = buildDetailsHtml(plant);
}

function toggleDetails() {
  const plant = currentPlant();
  const content = $("#plant-details");
  const button = $("#toggle-details");
  if (!plant || !content || !button) return;

  if (!content.innerHTML.trim()) renderInlineDetails(plant);

  const opening = content.hidden;
  content.hidden = !opening;
  button.setAttribute("aria-expanded", String(opening));
  button.innerHTML = opening
    ? 'Masquer la fiche complète <span aria-hidden="true">⌃</span>'
    : 'Voir la fiche complète <span aria-hidden="true">⌄</span>';

  if (opening) {
    requestAnimationFrame(() => {
      content.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
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

  // Ne jamais capturer le pointeur lorsqu'un élément interactif est cliqué.
  // Sinon la carte de swipe vole le clic au bouton « Afficher la réponse ».
  if (event.target.closest("button, a, input, select, textarea, label, [role='button']")) {
    state.pointer = null;
    return;
  }

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
  const collection=PLANTS;
  let seen=0,known=0,review=0;
  collection.forEach(plant=>{
    const p=getPlantProgress(plant.id);
    if ((p.seenCount||0)>0) seen++;
    if (p.status==="known") known++;
    if (p.status==="review") review++;
  });
  return { total:collection.length,seen,known,review,mastery:collection.length?Math.round(known/collection.length*100):0 };
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
  const flowers=PLANTS.filter(p=>p.floreviewCategorie==="fleurs_coupees");
  const plants=PLANTS.filter(p=>p.floreviewCategorie==="plantes");
  const foliage=PLANTS.filter(p=>p.floreviewCategorie==="feuillage");

  const items=[
    { count:PLANTS.length, label:"Tous les végétaux", icon:"✿", className:"all" },
    { count:flowers.length, label:"Fleurs coupées", icon:"❀", className:"flowers" },
    { count:plants.length, label:"Plantes", icon:"♧", className:"plants" },
    { count:foliage.length, label:"Feuillage", icon:"❧", className:"foliage" }
  ];

  $("#source-counters").innerHTML=items.map(item=>`
    <div class="collection-category collection-category--${item.className}">
      <span class="collection-category__icon" aria-hidden="true">${item.icon}</span>
      <div>
        <strong>${escapeHtml(item.label)}</strong>
        <span>${item.count} végétaux</span>
      </div>
    </div>
  `).join("");
}

function categoryLabel(plant) {
  return ({
    fleurs_coupees: "Fleur coupée",
    plantes: "Plante",
    feuillage: "Feuillage"
  })[plant.floreviewCategorie] || "Végétal";
}

function getPlantProgress(id) {
  return state.progress[id] || { status:"unseen", seenCount:0, knownCount:0, reviewCount:0, streak:0 };
}
function displayName(plant) { return plant.nomCommunPrincipal || plant.nomLatinPrincipal || "Végétal sans nom"; }
function sortByName(a,b) { return displayName(a).localeCompare(displayName(b),"fr",{sensitivity:"base"}); }

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
