import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db } from "./firebase.js";
import { average, formatDate, formatPercent, groupBy, requireAuth, showToast, wireLogout } from "./app.js";
import {
  attemptsForPaper,
  bestAttempt,
  compareAttempts,
  flattenPapers,
  loadAllBuiltInCatalogues,
  loadAttempts,
  loadCatalogue,
  loadSelectedSubjectIds,
  saveSelectedSubjectIds,
  attemptMillis
} from "./papers.js";
import { catalogueLabel } from "../data/catalogues.js";

const state = {
  user: null,
  allCatalogues: [],
  catalogues: [],
  subjects: [],
  attempts: [],
  notes: [],
  selectedSubjectIds: [],
  currentCatalogueId: sessionStorage.getItem("currentCatalogueId") || "",
  selectedCatalogue: null,
  selectedPaper: null,
  pendingDeleteCatalogue: null,
  trackerNav: {
    year: null,
    session: "",
    variant: ""
  },
  selector: {
    board: "",
    qualification: "",
    subject: "",
    route: ""
  }
};

function paperIdCounts(catalogues = state.catalogues) {
  return flattenPapers(catalogues).reduce((counts, paper) => {
    counts[paper.id] = (counts[paper.id] || 0) + 1;
    return counts;
  }, {});
}

function attemptBelongsToCatalogue(attempt, catalogue, counts = paperIdCounts()) {
  if (!catalogue?.papers) return false;
  const paperIds = new Set(catalogue.papers.map((paper) => paper.id));
  if (attempt.catalogueId) return attempt.catalogueId === catalogue.id;
  return paperIds.has(attempt.paperId) && counts[attempt.paperId] === 1;
}

function attemptsForCatalogue(catalogue) {
  const counts = paperIdCounts();
  return state.attempts
    .filter((attempt) => attemptBelongsToCatalogue(attempt, catalogue, counts))
    .sort(compareAttempts);
}

async function loadNotes(uid) {
  const snapshot = await getDocs(collection(db, "users", uid, "notes"));
  return snapshot.docs.map((noteDoc) => ({ id: noteDoc.id, ...noteDoc.data() }));
}

function notesForPaper(paper) {
  return state.notes.filter((note) => note.catalogueId === paper.catalogueId && note.paperId === paper.id);
}

function buildAnalytics(catalogue) {
  const papers = catalogue?.papers || [];
  const paperIds = new Set(papers.map((paper) => paper.id));
  const attempts = attemptsForCatalogue(catalogue).filter((attempt) => paperIds.has(attempt.paperId));
  const validAttempts = attempts.filter((attempt) => Number.isFinite(attempt.percentage));
  const completedPaperIds = new Set(attempts.map((attempt) => attempt.paperId));
  const percentages = validAttempts.map((attempt) => attempt.percentage);
  const recent = [...validAttempts].sort((a, b) => attemptMillis(b) - attemptMillis(a)).slice(0, 5);
  const completion = papers.length ? (completedPaperIds.size / papers.length) * 100 : 0;

  const completedPapers = papers.map((paper) => {
    const paperAttempts = attemptsForPaper(validAttempts, paper.id);
    return {
      paper,
      attempts: paperAttempts,
      best: bestAttempt(paperAttempts),
      average: average(paperAttempts.map((attempt) => attempt.percentage))
    };
  }).filter((entry) => entry.attempts.length);

  const ranked = [...completedPapers].sort((a, b) => b.average - a.average);

  return {
    papers,
    attempts,
    totalPapers: papers.length,
    completedUnique: completedPaperIds.size,
    completion,
    totalAttempts: attempts.length,
    averageScore: average(percentages),
    best: percentages.length ? Math.max(...percentages) : 0,
    recentAverage: average(recent.map((attempt) => attempt.percentage)),
    bestPaper: ranked[0] || null,
    weakestPaper: ranked[ranked.length - 1] || null
  };
}

function resetSelector() {
  state.selector = { board: "", qualification: "", subject: "", route: "" };
}

function selectorStep() {
  if (!state.selector.board) return "board";
  if (!state.selector.qualification) return "qualification";
  if (!state.selector.subject) return "subject";
  if (routeChoices().length && !state.selector.route) return "route";
  return "confirm";
}

function selectorCandidates() {
  return state.allCatalogues.filter((catalogue) => {
    return (!state.selector.board || catalogue.data.board === state.selector.board)
      && (!state.selector.qualification || catalogue.data.qualification === state.selector.qualification)
      && (!state.selector.subject || catalogue.data.subject === state.selector.subject);
  });
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function routeChoices() {
  return uniqueSorted(selectorCandidates().map((catalogue) => catalogue.data.route));
}

function selectedCatalogueChoice() {
  const candidates = selectorCandidates();
  const routes = routeChoices();
  return candidates.find((catalogue) => {
    if (routes.length) return catalogue.data.route === state.selector.route;
    return !catalogue.data.route;
  }) || null;
}

function renderSubjectSelector() {
  const step = selectorStep();
  const body = document.querySelector("#subject-selector-body");
  const addButton = document.querySelector("#add-selected-subject");
  if (!body || !addButton) return;

  const stepLabels = ["Board", "Level", "Subject", "Route"];
  document.querySelector("#selector-steps").innerHTML = stepLabels.map((label, index) => {
    const active = (step === "board" && index === 0)
      || (step === "qualification" && index === 1)
      || (step === "subject" && index === 2)
      || (step === "route" && index === 3)
      || (step === "confirm" && index === stepLabels.length - 1);
    const completed = [
      state.selector.board,
      state.selector.qualification,
      state.selector.subject,
      !routeChoices().length || state.selector.route
    ][index];
    return `<span class="${active ? "active" : ""} ${completed ? "done" : ""}">${index + 1}. ${label}</span>`;
  }).join("");

  const optionGroups = {
    board: {
      title: "Choose your exam board",
      values: ["CIE", "Edexcel"].filter((board) => state.allCatalogues.some((catalogue) => catalogue.data.board === board)),
      key: "board"
    },
    qualification: {
      title: "Choose your level",
      values: uniqueSorted(selectorCandidates().map((catalogue) => catalogue.data.qualification)),
      key: "qualification"
    },
    subject: {
      title: "Choose your subject",
      values: uniqueSorted(selectorCandidates().map((catalogue) => catalogue.data.subject)),
      key: "subject"
    },
    route: {
      title: "Choose your route",
      values: routeChoices(),
      key: "route"
    }
  };

  if (step === "confirm") {
    const catalogue = selectedCatalogueChoice();
    body.innerHTML = catalogue ? `
      <div class="selector-confirm">
        <span class="eyebrow">Ready to add</span>
        <strong>${catalogueLabel(catalogue)}</strong>
        <span>${catalogue.data.board} · ${catalogue.data.syllabusCode || "IAL"} · ${catalogue.papers.length} papers</span>
      </div>
    ` : `<p class="muted-text">Choose a valid catalogue to continue.</p>`;
    addButton.disabled = !catalogue;
    return;
  }

  const group = optionGroups[step];
  addButton.disabled = true;
  body.innerHTML = `
    <h3>${group.title}</h3>
    <div class="selector-options">
      ${group.values.map((value) => `
        <button class="selector-option" type="button" data-selector-key="${group.key}" data-selector-value="${value}">
          <strong>${value}</strong>
        </button>
      `).join("")}
    </div>
  `;
}

function openSubjectSelector() {
  resetSelector();
  renderSubjectSelector();
  document.querySelector("#subject-selector-modal")?.showModal();
}

async function addSelectedSubject() {
  const catalogue = selectedCatalogueChoice();
  if (!catalogue) return;

  if (state.selectedSubjectIds.includes(catalogue.id)) {
    document.querySelector("#subject-selector-modal")?.close();
    showToast("This subject is already in your tracker.");
    showSubject(catalogue.id);
    return;
  }

  try {
    state.selectedSubjectIds = await saveSelectedSubjectIds(state.user.uid, [...state.selectedSubjectIds, catalogue.id]);
    state.catalogues = loadAllBuiltInCatalogues().filter((item) => state.selectedSubjectIds.includes(item.id));
    state.subjects = state.catalogues;
    document.querySelector("#subject-selector-modal")?.close();
    renderSubjectCards();
    showToast("Subject added to your tracker.");
  } catch (error) {
    console.error("Failed to add subject:", error);
    showToast("Could not add this subject. Please try again.", "error");
  }
}

function renderSubjectCards() {
  state.currentCatalogueId = "";
  state.selectedCatalogue = null;
  state.selectedPaper = null;
  state.trackerNav = { year: null, session: "", variant: "" };
  sessionStorage.removeItem("currentCatalogueId");
  document.querySelector("#dashboard-title").textContent = "Choose a Subject";
  document.querySelector("#subject-selection").classList.remove("hidden");
  document.querySelector("#subject-view").classList.add("hidden");

  const grid = document.querySelector("#subject-grid");
  const empty = document.querySelector("#subjects-empty");
  if (!grid || !empty) return;

  if (!state.subjects.length) {
    grid.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  grid.innerHTML = state.subjects.map((catalogue) => {
    const analytics = buildAnalytics(catalogue);
    return `
      <article class="subject-card">
        <button class="subject-card-main" data-catalogue-id="${catalogue.id}" type="button">
          <span class="eyebrow">${catalogue.data.board}</span>
          <strong>${catalogue.data.subject}</strong>
          <span>${catalogue.data.qualification} · ${catalogue.data.syllabusCode || "IAL"}${catalogue.data.route ? ` · ${catalogue.data.route}` : ""}</span>
          <span>${analytics.completedUnique} / ${analytics.totalPapers} completed</span>
          <div class="progress-bar" aria-hidden="true"><span style="width: ${Math.min(analytics.completion, 100)}%"></span></div>
          <b>${formatPercent(analytics.completion)}</b>
        </button>
        <button class="subject-delete-button" data-delete-catalogue-id="${catalogue.id}" type="button">Delete</button>
      </article>
    `;
  }).join("");
}

function showSubject(catalogueId) {
  const catalogue = state.subjects.find((item) => item.id === catalogueId);
  if (!catalogue) {
    showMissingSubject();
    return;
  }

  if (state.currentCatalogueId !== catalogue.id) state.trackerNav = { year: null, session: "", variant: "" };
  state.currentCatalogueId = catalogue.id;
  state.selectedCatalogue = catalogue;
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const hashYear = Number(hashParams.get("year"));
  state.trackerNav = {
    year: Number.isFinite(hashYear) && hashYear > 0 ? hashYear : state.trackerNav.year,
    session: hashParams.get("session") || state.trackerNav.session || "",
    variant: hashParams.get("variant") || state.trackerNav.variant || ""
  };
  sessionStorage.setItem("currentCatalogueId", catalogue.id);
  updateSubjectHash();

  renderSelectedSubject();
}

function updateSubjectHash() {
  if (!state.currentCatalogueId) return;
  const nextParams = new URLSearchParams({ catalogue: state.currentCatalogueId });
  if (state.trackerNav.year) nextParams.set("year", state.trackerNav.year);
  if (state.trackerNav.session) nextParams.set("session", state.trackerNav.session);
  if (state.trackerNav.variant) nextParams.set("variant", state.trackerNav.variant);
  const nextHash = nextParams.toString();
  if (window.location.hash.slice(1) !== nextHash) history.replaceState(null, "", `#${nextHash}`);
}

function renderSelectedSubject() {
  const catalogue = state.selectedCatalogue || state.subjects.find((item) => item.id === state.currentCatalogueId);
  if (!catalogue) {
    showMissingSubject();
    return;
  }

  state.selectedCatalogue = catalogue;
  document.querySelector("#dashboard-title").textContent = catalogue.data.subject;
  document.querySelector("#subject-selection").classList.add("hidden");
  document.querySelector("#subject-view").classList.remove("hidden");
  document.querySelector("#subject-kicker").textContent = `${catalogue.data.board} ${catalogue.data.qualification} · ${catalogue.data.syllabusCode || "IAL"}${catalogue.data.route ? ` · ${catalogue.data.route}` : ""}`;
  document.querySelector("#subject-heading").textContent = `${catalogue.data.subject} Paper Checklist`;

  const analytics = buildAnalytics(catalogue);
  renderStats(analytics, catalogue);
  renderChecklist(catalogue, analytics.attempts);
}

function showMissingSubject() {
  state.currentCatalogueId = "";
  state.selectedCatalogue = null;
  state.selectedPaper = null;
  sessionStorage.removeItem("currentCatalogueId");
  document.querySelector("#dashboard-title").textContent = "Choose a Subject";
  document.querySelector("#subject-selection").classList.add("hidden");
  document.querySelector("#subject-view").classList.remove("hidden");
  document.querySelector("#subject-kicker").textContent = "";
  document.querySelector("#subject-heading").textContent = "Selected subject could not be found";
  document.querySelector("#stats-grid").innerHTML = "";
  document.querySelector("#insight-grid").innerHTML = "";
  document.querySelector("#dashboard-empty").classList.remove("hidden");
  document.querySelector("#dashboard-empty h2").textContent = "This subject is not available.";
  document.querySelector("#dashboard-empty p").textContent = "Go back to subjects and add it to your tracker again.";
  document.querySelector("#paper-checklist").innerHTML = "";
}

function renderStats(analytics, catalogue) {
  const stats = [
    [`${catalogue.data.subject} papers completed`, analytics.completedUnique],
    [`${catalogue.data.subject} total papers`, analytics.totalPapers],
    [`${catalogue.data.subject} completion`, formatPercent(analytics.completion)],
    [`${catalogue.data.subject} average`, formatPercent(analytics.averageScore)],
    [`${catalogue.data.subject} attempts`, analytics.totalAttempts]
  ];

  document.querySelector("#stats-grid").innerHTML = stats.map(([label, value]) => `
    <article class="stat-card">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `).join("");

  document.querySelector("#insight-grid").innerHTML = `
    <article class="insight-card"><span>Best score</span><strong>${formatPercent(analytics.best)}</strong></article>
    <article class="insight-card"><span>Recent average</span><strong>${formatPercent(analytics.recentAverage)}</strong></article>
    <article class="insight-card"><span>Best-performing paper</span><strong>${analytics.bestPaper ? analytics.bestPaper.paper.name : "Not enough data"}</strong></article>
    <article class="insight-card"><span>Weakest-performing paper</span><strong>${analytics.weakestPaper ? analytics.weakestPaper.paper.name : "Not enough data"}</strong></article>
  `;

  document.querySelector("#dashboard-empty").classList.toggle("hidden", analytics.totalAttempts > 0);
}

function subjectAttemptCount(catalogue) {
  return attemptsForCatalogue(catalogue).length;
}

function openDeleteSubjectModal(catalogueId) {
  const catalogue = state.subjects.find((item) => item.id === catalogueId);
  if (!catalogue) return;

  const count = subjectAttemptCount(catalogue);
  state.pendingDeleteCatalogue = catalogue;
  document.querySelector("#delete-subject-title").textContent = `Delete ${catalogue.data.subject} ${catalogue.data.qualification}?`;
  document.querySelector("#delete-subject-message").textContent = `This will remove ${catalogue.data.subject} from your subject list. The built-in catalogue will remain available to add again later.`;
  document.querySelector("#delete-subject-attempts").textContent = count
    ? `You have ${count} saved attempt${count === 1 ? "" : "s"} for this subject.`
    : "You do not have saved attempts for this subject.";
  document.querySelector("#delete-subject-modal")?.showModal();
}

function closeDeleteSubjectModals() {
  document.querySelector("#delete-subject-modal")?.close();
  document.querySelector("#delete-scores-confirm-modal")?.close();
  state.pendingDeleteCatalogue = null;
}

async function deleteSubject({ deleteScores }) {
  const catalogue = state.pendingDeleteCatalogue;
  if (!catalogue) return;

  try {
    const attemptsToDelete = deleteScores
      ? attemptsForCatalogue(catalogue).filter((attempt) => attempt.catalogueId === catalogue.id)
      : [];

    for (const attempt of attemptsToDelete) {
      await deleteDoc(doc(db, "users", state.user.uid, "attempts", attempt.id));
    }

    state.selectedSubjectIds = state.selectedSubjectIds.filter((id) => id !== catalogue.id);
    await saveSelectedSubjectIds(state.user.uid, state.selectedSubjectIds);

    state.catalogues = loadAllBuiltInCatalogues().filter((item) => state.selectedSubjectIds.includes(item.id));
    state.subjects = state.catalogues;
    state.attempts = deleteScores
      ? state.attempts.filter((attempt) => !(attempt.catalogueId === catalogue.id))
      : state.attempts;

    if (state.currentCatalogueId === catalogue.id) {
      history.replaceState(null, "", window.location.pathname);
    }

    closeDeleteSubjectModals();
    renderSubjectCards();
    showToast(deleteScores ? "Subject and linked scores deleted." : "Subject removed. Scores were kept.");
  } catch (error) {
    console.error("Failed to delete subject:", error);
    showToast("Could not delete subject. Please try again.", "error");
  }
}

function openDeleteScoresConfirmModal() {
  const catalogue = state.pendingDeleteCatalogue;
  if (!catalogue) return;
  const deleteCount = attemptsForCatalogue(catalogue).filter((attempt) => attempt.catalogueId === catalogue.id).length;
  document.querySelector("#delete-scores-title").textContent = `Delete ${catalogue.data.subject} scores permanently?`;
  document.querySelector("#delete-scores-message").textContent = `This will permanently delete ${deleteCount} saved score${deleteCount === 1 ? "" : "s"} linked to ${catalogue.data.subject} ${catalogue.data.qualification}. This cannot be undone.`;
  document.querySelector("#delete-subject-modal")?.close();
  document.querySelector("#delete-scores-confirm-modal")?.showModal();
}

function sessionRank(session) {
  const normalized = String(session).toLowerCase();
  if (normalized.includes("feb")) return 1;
  if (normalized.includes("may") || normalized.includes("jun")) return 2;
  if (normalized.includes("oct") || normalized.includes("nov")) return 3;
  return 4;
}

function sortPapersForChecklist(papers) {
  return [...papers].sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    const sessionDifference = sessionRank(a.session) - sessionRank(b.session) || String(a.session).localeCompare(String(b.session));
    if (sessionDifference !== 0) return sessionDifference;
    const variantDifference = String(a.variant).localeCompare(String(b.variant), undefined, { numeric: true });
    if (variantDifference !== 0) return variantDifference;
    return Number(a.paper) - Number(b.paper);
  });
}

function componentLabel(paper) {
  return paper.board === "Edexcel" ? `Unit ${paper.paper}` : `Paper ${paper.paper}`;
}

function itemNoun(catalogue, count = 2) {
  const noun = catalogue.data.board === "Edexcel" ? "unit" : "paper";
  return `${noun}${count === 1 ? "" : "s"}`;
}

function variantLabel(catalogue, variant) {
  return catalogue.data.board === "Edexcel" ? String(variant) : `Variant ${variant}`;
}

function seriesHeading(catalogue) {
  return catalogue.data.board === "Edexcel" ? "Choose Examination Series" : "Choose Examination Series";
}

function variantHeading(catalogue) {
  return catalogue.data.board === "Edexcel" ? "Choose Unit Group" : "Choose Variant";
}

function uniqueSortedPapers(papers, key, sorter = null) {
  const values = [...new Set(papers.map((paper) => paper[key]).filter((value) => value !== undefined && value !== null && value !== ""))];
  return sorter ? values.sort(sorter) : values.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

function navFilteredPapers(catalogue) {
  return sortPapersForChecklist(catalogue.papers).filter((paper) => {
    return (!state.trackerNav.year || Number(paper.year) === Number(state.trackerNav.year))
      && (!state.trackerNav.session || paper.session === state.trackerNav.session)
      && (!state.trackerNav.variant || String(paper.variant) === String(state.trackerNav.variant));
  });
}

function renderBreadcrumbs(catalogue) {
  const crumbs = [
    { label: "Subjects", action: "subjects" },
    { label: catalogue.data.subject, action: "subject" }
  ];
  if (catalogue.data.qualification) crumbs.push({ label: catalogue.data.qualification, action: "subject" });
  if (state.trackerNav.year) crumbs.push({ label: state.trackerNav.year, action: "year" });
  if (state.trackerNav.session) crumbs.push({ label: state.trackerNav.session, action: "session" });
  if (state.trackerNav.variant) crumbs.push({ label: variantLabel(catalogue, state.trackerNav.variant), action: "variant" });

  return `
    <nav class="tracker-breadcrumbs" aria-label="Paper browser location">
      ${crumbs.map((crumb, index) => index === crumbs.length - 1
        ? `<span>${crumb.label}</span>`
        : `<button type="button" data-nav-back="${crumb.action}">${crumb.label}</button>`
      ).join("<b>/</b>")}
    </nav>
  `;
}

function renderChoiceGrid({ title, subtitle, choices }) {
  return `
    <section class="tracker-step">
      <div>
        <p class="eyebrow">${subtitle}</p>
        <h3>${title}</h3>
      </div>
      <div class="tracker-choice-grid">
        ${choices.map((choice) => `
          <button class="tracker-choice" type="button" data-nav-${choice.key}="${choice.value}">
            <strong>${choice.label}</strong>
            ${choice.meta ? `<span>${choice.meta}</span>` : ""}
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function renderChecklist(catalogue, subjectAttempts) {
  const checklist = document.querySelector("#paper-checklist");
  if (!checklist) return;

  if (!catalogue?.papers?.length) {
    checklist.innerHTML = `<section class="empty-state"><h2>No papers in this subject yet</h2><p>This built-in subject does not currently include paper data.</p></section>`;
    return;
  }

  const yearChoices = uniqueSortedPapers(catalogue.papers, "year", (a, b) => Number(b) - Number(a));
  const yearPapers = navFilteredPapers(catalogue);
  let content = "";

  if (!state.trackerNav.year) {
    content = renderChoiceGrid({
      title: "Choose Year",
      subtitle: "Step 1",
      choices: yearChoices.map((year) => {
        const count = catalogue.papers.filter((paper) => Number(paper.year) === Number(year)).length;
        return { key: "year", value: year, label: year, meta: `${count} ${itemNoun(catalogue, count)}` };
      })
    });
  } else if (!state.trackerNav.session) {
    const papersForYear = catalogue.papers.filter((paper) => Number(paper.year) === Number(state.trackerNav.year));
    const sessions = uniqueSortedPapers(papersForYear, "session", (a, b) => sessionRank(a) - sessionRank(b) || String(a).localeCompare(String(b)));
    content = renderChoiceGrid({
      title: seriesHeading(catalogue),
      subtitle: "Step 2",
      choices: sessions.map((session) => {
        const count = papersForYear.filter((paper) => paper.session === session).length;
        return { key: "session", value: session, label: session, meta: `${count} ${itemNoun(catalogue, count)}` };
      })
    });
  } else if (!state.trackerNav.variant) {
    const papersForSeries = catalogue.papers.filter((paper) => Number(paper.year) === Number(state.trackerNav.year) && paper.session === state.trackerNav.session);
    const variants = uniqueSortedPapers(papersForSeries, "variant");
    content = renderChoiceGrid({
      title: variantHeading(catalogue),
      subtitle: "Step 3",
      choices: variants.map((variant) => {
        const count = papersForSeries.filter((paper) => String(paper.variant) === String(variant)).length;
        return { key: "variant", value: variant, label: variantLabel(catalogue, variant), meta: `${count} ${itemNoun(catalogue, count)}` };
      })
    });
  } else {
    content = `
      <section class="tracker-step">
        <div>
          <p class="eyebrow">Step 4</p>
          <h3>${state.trackerNav.year} · ${state.trackerNav.session} · ${variantLabel(catalogue, state.trackerNav.variant)}</h3>
        </div>
        <div class="tracker-paper-list">
          ${yearPapers
            .sort((a, b) => Number(a.paper) - Number(b.paper))
            .map((paper) => renderChecklistPaper(paper, subjectAttempts))
            .join("")}
        </div>
      </section>
    `;
  }

  checklist.innerHTML = `${renderBreadcrumbs(catalogue)}${content}`;
}

function renderChecklistPaper(paper, subjectAttempts) {
  const paperAttempts = attemptsForPaper(subjectAttempts, paper.id);
  const best = bestAttempt(paperAttempts);
  const attempted = paperAttempts.length > 0;
  const notes = notesForPaper(paper);
  const notesUrl = `notes.html?catalogueId=${encodeURIComponent(paper.catalogueId)}&paperId=${encodeURIComponent(paper.id)}`;
  return `
    <article class="checklist-paper">
      <button class="checklist-paper-main" data-complete="${paper.id}" type="button">
        <span class="checkmark" aria-hidden="true">${attempted ? "☑" : "☐"}</span>
        <span>
          <strong>${componentLabel(paper)}</strong>
          <em>${paper.name}</em>
          ${notes.length ? `<small>${notes.length} note${notes.length === 1 ? "" : "s"}</small>` : ""}
        </span>
      </button>
      <div class="checklist-score">
        <strong>${attempted ? `${best.score}/${best.maximumMark}` : `${paper.maximumMark} marks`}</strong>
        <span>${attempted ? `${formatPercent(best.percentage)} · ${paperAttempts.length} attempt${paperAttempts.length === 1 ? "" : "s"}` : "Not attempted"}</span>
      </div>
      <button class="button button-primary" data-complete="${paper.id}" type="button">Open</button>
      <a class="button button-secondary" href="${notesUrl}">Notes</a>
      ${attempted ? `<button class="button button-secondary" data-history="${paper.id}" type="button">History</button>` : ""}
    </article>
  `;
}

function openCompletionModal(paperId) {
  const paper = state.selectedCatalogue?.papers.find((item) => item.id === paperId);
  const modal = document.querySelector("#completion-modal");
  if (!paper || !modal) {
    showToast("Could not open this paper. Please reselect the subject.", "error");
    return;
  }

  state.selectedPaper = paper;
  document.querySelector("#modal-paper-meta").textContent = `${paper.year} ${paper.session} Variant ${paper.variant} · ${componentLabel(paper)}`;
  document.querySelector("#modal-title").textContent = componentLabel(paper);
  document.querySelector("#maximum-mark-label").textContent = `/ ${paper.maximumMark}`;
  const scoreInput = document.querySelector("#score-input");
  scoreInput.value = "";
  scoreInput.max = paper.maximumMark;
  document.querySelector("#modal-message").textContent = "";
  modal.showModal();
  scoreInput.focus();
}

function openHistoryModal(paperId) {
  const paper = state.selectedCatalogue?.papers.find((item) => item.id === paperId);
  const attempts = state.selectedCatalogue ? attemptsForPaper(attemptsForCatalogue(state.selectedCatalogue), paperId) : [];
  const modal = document.querySelector("#history-modal");
  if (!paper || !modal) return;

  document.querySelector("#history-meta").textContent = `${paper.name} · ${paper.year} ${paper.session}`;
  document.querySelector("#history-list").innerHTML = attempts.map((attempt) => `
    <div class="history-row">
      <div>
        <strong>Attempt ${attempt.attemptNumber}</strong>
        <span>${formatDate(attempt.completedAt)}</span>
      </div>
      <strong>${attempt.score}/${attempt.maximumMark} · ${formatPercent(attempt.percentage)}</strong>
    </div>
  `).join("");
  modal.showModal();
}

async function saveAttempt(event) {
  event.preventDefault();
  const paper = state.selectedPaper;
  const message = document.querySelector("#modal-message");
  const score = Number(document.querySelector("#score-input").value);
  const catalogue = state.selectedCatalogue || state.subjects.find((item) => item.id === state.currentCatalogueId);

  if (!paper || !catalogue) {
    message.textContent = "Could not find the selected subject. Please go back and choose the subject again.";
    return;
  }

  if (!Number.isFinite(score)) {
    message.textContent = "Enter a numeric score.";
    return;
  }
  if (score < 0) {
    message.textContent = "Score cannot be below 0.";
    return;
  }
  if (score > paper.maximumMark) {
    message.textContent = `Score cannot exceed ${paper.maximumMark}.`;
    return;
  }

  const paperAttempts = attemptsForPaper(attemptsForCatalogue(catalogue), paper.id);
  const attempt = {
    catalogueId: catalogue.id,
    paperId: paper.id,
    score,
    maximumMark: paper.maximumMark,
    percentage: Number(((score / paper.maximumMark) * 100).toFixed(3)),
    completedAt: serverTimestamp(),
    attemptNumber: paperAttempts.length + 1
  };

  try {
    const attemptRef = await addDoc(collection(db, "users", state.user.uid, "attempts"), attempt);
    state.attempts = [...state.attempts, {
      ...attempt,
      id: attemptRef.id,
      completedAt: new Date().toISOString()
    }].sort(compareAttempts);
    state.currentCatalogueId = catalogue.id;
    state.selectedCatalogue = catalogue;
    state.trackerNav = {
      year: paper.year,
      session: paper.session,
      variant: String(paper.variant)
    };
    sessionStorage.setItem("currentCatalogueId", catalogue.id);
    document.querySelector("#completion-modal").close();
    renderSelectedSubject();
    showToast("Attempt saved.");
  } catch (error) {
    console.error("Failed to save attempt:", error);
    message.textContent = "Could not save your score. Please try again.";
  }
}

function wireEvents() {
  document.querySelector("#subject-grid")?.addEventListener("click", (event) => {
    const deleteId = event.target.closest("[data-delete-catalogue-id]")?.dataset.deleteCatalogueId;
    if (deleteId) {
      openDeleteSubjectModal(deleteId);
      return;
    }

    const catalogueId = event.target.closest("[data-catalogue-id]")?.dataset.catalogueId;
    if (catalogueId) showSubject(catalogueId);
  });

  document.querySelector("#select-subject-button")?.addEventListener("click", openSubjectSelector);
  document.querySelector("#select-subject-empty")?.addEventListener("click", openSubjectSelector);
  document.querySelector("#cancel-subject-selector")?.addEventListener("click", () => document.querySelector("#subject-selector-modal")?.close());
  document.querySelector("#cancel-subject-selector-x")?.addEventListener("click", () => document.querySelector("#subject-selector-modal")?.close());
  document.querySelector("#add-selected-subject")?.addEventListener("click", addSelectedSubject);
  document.querySelector("#subject-selector-body")?.addEventListener("click", (event) => {
    const option = event.target.closest("[data-selector-key]");
    if (!option) return;
    const { selectorKey, selectorValue } = option.dataset;
    state.selector[selectorKey] = selectorValue;
    if (selectorKey === "board") {
      state.selector.qualification = "";
      state.selector.subject = "";
      state.selector.route = "";
    }
    if (selectorKey === "qualification") {
      state.selector.subject = "";
      state.selector.route = "";
    }
    if (selectorKey === "subject") {
      state.selector.route = "";
    }
    renderSubjectSelector();
  });

  document.querySelector("#back-to-subjects")?.addEventListener("click", () => {
    history.replaceState(null, "", window.location.pathname);
    renderSubjectCards();
  });

  document.querySelector("#paper-checklist")?.addEventListener("click", (event) => {
    const navBack = event.target.closest("[data-nav-back]")?.dataset.navBack;
    if (navBack) {
      if (navBack === "subjects") {
        history.replaceState(null, "", window.location.pathname);
        renderSubjectCards();
        return;
      }
      if (navBack === "subject") state.trackerNav = { year: null, session: "", variant: "" };
      if (navBack === "year") state.trackerNav = { year: state.trackerNav.year, session: "", variant: "" };
      if (navBack === "session") state.trackerNav = { year: state.trackerNav.year, session: state.trackerNav.session, variant: "" };
      updateSubjectHash();
      renderSelectedSubject();
      return;
    }

    const year = event.target.closest("[data-nav-year]")?.dataset.navYear;
    if (year) {
      state.trackerNav = { year: Number(year), session: "", variant: "" };
      updateSubjectHash();
      renderSelectedSubject();
      return;
    }

    const session = event.target.closest("[data-nav-session]")?.dataset.navSession;
    if (session) {
      state.trackerNav = { year: state.trackerNav.year, session, variant: "" };
      updateSubjectHash();
      renderSelectedSubject();
      return;
    }

    const variant = event.target.closest("[data-nav-variant]")?.dataset.navVariant;
    if (variant) {
      state.trackerNav = { year: state.trackerNav.year, session: state.trackerNav.session, variant };
      updateSubjectHash();
      renderSelectedSubject();
      return;
    }

    const completeId = event.target.closest("[data-complete]")?.dataset.complete;
    const historyId = event.target.closest("[data-history]")?.dataset.history;
    if (completeId) openCompletionModal(completeId);
    if (historyId) openHistoryModal(historyId);
  });

  document.querySelector("#completion-form")?.addEventListener("submit", saveAttempt);
  document.querySelector("#cancel-completion")?.addEventListener("click", () => document.querySelector("#completion-modal")?.close());
  document.querySelector("#cancel-completion-x")?.addEventListener("click", () => document.querySelector("#completion-modal")?.close());
  document.querySelector("#close-history")?.addEventListener("click", () => document.querySelector("#history-modal")?.close());
  document.querySelector("#cancel-delete-subject")?.addEventListener("click", closeDeleteSubjectModals);
  document.querySelector("#cancel-delete-subject-x")?.addEventListener("click", closeDeleteSubjectModals);
  document.querySelector("#delete-subject-keep-scores")?.addEventListener("click", () => deleteSubject({ deleteScores: false }));
  document.querySelector("#delete-subject-with-scores")?.addEventListener("click", openDeleteScoresConfirmModal);
  document.querySelector("#cancel-delete-scores")?.addEventListener("click", closeDeleteSubjectModals);
  document.querySelector("#cancel-delete-scores-x")?.addEventListener("click", closeDeleteSubjectModals);
  document.querySelector("#confirm-delete-scores")?.addEventListener("click", () => deleteSubject({ deleteScores: true }));

  window.addEventListener("hashchange", () => {
    const catalogueId = new URLSearchParams(window.location.hash.slice(1)).get("catalogue");
    if (catalogueId) showSubject(catalogueId);
    else renderSubjectCards();
  });
}

async function initDashboard(user) {
  state.user = user;
  wireLogout();
  wireEvents();

  try {
    state.allCatalogues = loadAllBuiltInCatalogues();
    state.selectedSubjectIds = await loadSelectedSubjectIds(user.uid);
    state.catalogues = await loadCatalogue(user.uid);
    state.subjects = state.catalogues;
    state.attempts = await loadAttempts(user.uid);
    state.notes = await loadNotes(user.uid);

    document.querySelector("#dashboard-loading")?.classList.add("hidden");
    document.querySelector("#dashboard-content")?.classList.remove("hidden");

    const catalogueId = new URLSearchParams(window.location.hash.slice(1)).get("catalogue") || state.currentCatalogueId;
    if (catalogueId) showSubject(catalogueId);
    else renderSubjectCards();
  } catch (error) {
    console.error("Failed to load dashboard:", error);
    document.querySelector("#dashboard-loading")?.classList.add("hidden");
    const errorBox = document.querySelector("#dashboard-error");
    errorBox.textContent = error.message || "Could not load dashboard.";
    errorBox.classList.remove("hidden");
  }
}

requireAuth(initDashboard);
