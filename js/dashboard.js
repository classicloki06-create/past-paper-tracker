import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db } from "./firebase.js";
import { average, formatDate, formatPercent, groupBy, requireAuth, showToast, wireLogout } from "./app.js";
import { attemptsForPaper, bestAttempt, compareAttempts, flattenPapers, loadAttempts, loadCatalogue, attemptMillis } from "./papers.js";

const state = {
  user: null,
  catalogues: [],
  subjects: [],
  attempts: [],
  currentCatalogueId: sessionStorage.getItem("currentCatalogueId") || "",
  selectedCatalogue: null,
  selectedPaper: null,
  expandedYears: new Set(),
  lastActiveYear: null,
  pendingDeleteCatalogue: null
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

function renderSubjectCards() {
  state.currentCatalogueId = "";
  state.selectedCatalogue = null;
  state.selectedPaper = null;
  state.expandedYears = new Set();
  state.lastActiveYear = null;
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
          <span>${catalogue.data.qualification} · ${catalogue.data.syllabusCode}</span>
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

  if (state.currentCatalogueId !== catalogue.id) {
    state.expandedYears = new Set();
    state.lastActiveYear = null;
  }
  state.currentCatalogueId = catalogue.id;
  state.selectedCatalogue = catalogue;
  sessionStorage.setItem("currentCatalogueId", catalogue.id);

  const nextHash = `catalogue=${encodeURIComponent(catalogue.id)}`;
  if (window.location.hash.slice(1) !== nextHash) {
    history.replaceState(null, "", `#${nextHash}`);
  }

  renderSelectedSubject();
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
  document.querySelector("#subject-kicker").textContent = `${catalogue.data.board} ${catalogue.data.qualification} · ${catalogue.data.syllabusCode}`;
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
  document.querySelector("#dashboard-empty p").textContent = "Go back to subjects or import the catalogue again.";
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
  document.querySelector("#delete-subject-message").textContent = `This will remove the imported ${catalogue.data.subject} catalogue from your subject list.`;
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

    await deleteDoc(doc(db, "users", state.user.uid, "catalogues", catalogue.id));

    state.catalogues = state.catalogues.filter((item) => item.id !== catalogue.id);
    state.subjects = state.subjects.filter((item) => item.id !== catalogue.id);
    state.attempts = deleteScores
      ? state.attempts.filter((attempt) => !(attempt.catalogueId === catalogue.id))
      : state.attempts;

    if (state.currentCatalogueId === catalogue.id) {
      history.replaceState(null, "", window.location.pathname);
    }

    closeDeleteSubjectModals();
    renderSubjectCards();
    showToast(deleteScores ? "Subject and linked scores deleted." : "Subject deleted. Scores were kept.");
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

function renderChecklist(catalogue, subjectAttempts) {
  const checklist = document.querySelector("#paper-checklist");
  if (!checklist) return;

  if (!catalogue?.papers?.length) {
    checklist.innerHTML = `<section class="empty-state"><h2>No papers in this catalogue</h2><p>Import a catalogue that includes a papers array.</p></section>`;
    return;
  }

  const sortedPapers = sortPapersForChecklist(catalogue.papers);
  const years = groupBy(sortedPapers, (paper) => paper.year);
  const newestYear = Math.max(...Object.keys(years).map(Number));

  checklist.innerHTML = Object.entries(years)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([year, papers]) => {
      const yearNumber = Number(year);
      const shouldOpen = state.expandedYears.size
        ? state.expandedYears.has(String(year))
        : yearNumber === (state.lastActiveYear || newestYear);
      return `
      <details class="year-section" data-year="${year}" ${shouldOpen ? "open" : ""}>
        <summary>${year}</summary>
        ${renderSessionGroups(papers, subjectAttempts)}
      </details>
    `;
    }).join("");
}

function renderSessionGroups(papers, subjectAttempts) {
  const sessions = groupBy(papers, (paper) => paper.session);
  return Object.entries(sessions)
    .sort(([a], [b]) => sessionRank(a) - sessionRank(b) || a.localeCompare(b))
    .map(([session, sessionPapers]) => {
      const variants = groupBy(sessionPapers, (paper) => paper.variant);
      return `
        <section class="session-group">
          <h3>${session}</h3>
          ${Object.entries(variants)
            .sort(([a], [b]) => String(a).localeCompare(String(b), undefined, { numeric: true }))
            .map(([variant, variantPapers]) => `
              <div class="variant-group">
                <h4>Variant ${variant}</h4>
                ${variantPapers
                  .sort((a, b) => Number(a.paper) - Number(b.paper))
                  .map((paper) => renderChecklistPaper(paper, subjectAttempts))
                  .join("")}
              </div>
            `).join("")}
        </section>
      `;
    }).join("");
}

function renderChecklistPaper(paper, subjectAttempts) {
  const paperAttempts = attemptsForPaper(subjectAttempts, paper.id);
  const best = bestAttempt(paperAttempts);
  const attempted = paperAttempts.length > 0;
  return `
    <article class="checklist-paper">
      <button class="checklist-paper-main" data-complete="${paper.id}" type="button">
        <span class="checkmark" aria-hidden="true">${attempted ? "☑" : "☐"}</span>
        <span>
          <strong>Paper ${paper.paper}</strong>
          <em>${paper.name}</em>
        </span>
      </button>
      <div class="checklist-score">
        <strong>${attempted ? `${best.score}/${best.maximumMark}` : `${paper.maximumMark} marks`}</strong>
        <span>${attempted ? `${formatPercent(best.percentage)} · ${paperAttempts.length} attempt${paperAttempts.length === 1 ? "" : "s"}` : "Not attempted"}</span>
      </div>
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
  document.querySelector("#modal-paper-meta").textContent = `${paper.year} ${paper.session} Variant ${paper.variant} · Paper ${paper.paper}`;
  document.querySelector("#modal-title").textContent = `Paper ${paper.paper}`;
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
    state.lastActiveYear = paper.year;
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

  document.querySelector("#back-to-subjects")?.addEventListener("click", () => {
    history.replaceState(null, "", window.location.pathname);
    renderSubjectCards();
  });

  document.querySelector("#paper-checklist")?.addEventListener("click", (event) => {
    const completeId = event.target.closest("[data-complete]")?.dataset.complete;
    const historyId = event.target.closest("[data-history]")?.dataset.history;
    if (completeId) openCompletionModal(completeId);
    if (historyId) openHistoryModal(historyId);
  });
  document.querySelector("#paper-checklist")?.addEventListener("toggle", (event) => {
    const section = event.target.closest?.(".year-section");
    if (!section?.dataset.year) return;
    if (section.open) state.expandedYears.add(section.dataset.year);
    else state.expandedYears.delete(section.dataset.year);
  }, true);

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
    state.catalogues = await loadCatalogue(user.uid);
    state.subjects = state.catalogues.filter((catalogue) => catalogue.source === "imported");
    state.attempts = await loadAttempts(user.uid);

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
