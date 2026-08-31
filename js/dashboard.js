import {
  addDoc,
  collection,
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
  selectedCatalogue: null,
  selectedPaper: null
};

let charts = [];

function destroyCharts() {
  charts.forEach((chart) => chart.destroy());
  charts = [];
}

function catalogueLabel(catalogue) {
  return `${catalogue.data.subject} ${catalogue.data.qualification} · ${catalogue.data.syllabusCode}`;
}

function paperIdCounts(catalogues = state.catalogues) {
  return flattenPapers(catalogues).reduce((counts, paper) => {
    counts[paper.id] = (counts[paper.id] || 0) + 1;
    return counts;
  }, {});
}

function attemptBelongsToCatalogue(attempt, catalogue, counts = paperIdCounts()) {
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
  const papers = catalogue.papers;
  const paperIds = new Set(papers.map((paper) => paper.id));
  const attempts = attemptsForCatalogue(catalogue).filter((attempt) => paperIds.has(attempt.paperId));
  const validAttempts = attempts.filter((attempt) => Number.isFinite(attempt.percentage));
  const completedPaperIds = new Set(attempts.map((attempt) => attempt.paperId));
  const percentages = validAttempts.map((attempt) => attempt.percentage);
  const recent = [...validAttempts].sort((a, b) => attemptMillis(b) - attemptMillis(a)).slice(0, 5);
  const completion = papers.length ? (completedPaperIds.size / papers.length) * 100 : 0;

  const byPaperNumber = groupBy(validAttempts.map((attempt) => ({
    ...attempt,
    paperNumber: papers.find((paper) => paper.id === attempt.paperId)?.paper
  })).filter((attempt) => attempt.paperNumber), (attempt) => attempt.paperNumber);

  const paperAverages = Object.entries(byPaperNumber).map(([paperNumber, paperAttempts]) => ({
    paperNumber,
    average: average(paperAttempts.map((attempt) => attempt.percentage))
  })).sort((a, b) => Number(a.paperNumber) - Number(b.paperNumber));

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
    paperAverages,
    bestPaper: ranked[0] || null,
    weakestPaper: ranked[ranked.length - 1] || null,
    improvement: [...validAttempts].sort(compareAttempts).map((attempt) => ({
      ...attempt,
      paper: papers.find((paper) => paper.id === attempt.paperId)
    }))
  };
}

function renderSubjectCards() {
  destroyCharts();
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
      <button class="subject-card" data-catalogue-id="${catalogue.id}" type="button">
        <span class="eyebrow">${catalogue.data.board}</span>
        <strong>${catalogue.data.subject}</strong>
        <span>${catalogue.data.qualification} · ${catalogue.data.syllabusCode}</span>
        <span>${analytics.completedUnique} / ${analytics.totalPapers} completed</span>
        <div class="progress-bar" aria-hidden="true"><span style="width: ${Math.min(analytics.completion, 100)}%"></span></div>
        <b>${formatPercent(analytics.completion)}</b>
      </button>
    `;
  }).join("");
}

function showSubject(catalogueId) {
  const catalogue = state.subjects.find((item) => item.id === catalogueId);
  if (!catalogue) {
    renderSubjectCards();
    return;
  }

  state.selectedCatalogue = catalogue;
  window.location.hash = `catalogue=${encodeURIComponent(catalogue.id)}`;
  document.querySelector("#dashboard-title").textContent = catalogue.data.subject;
  document.querySelector("#subject-selection").classList.add("hidden");
  document.querySelector("#subject-view").classList.remove("hidden");
  document.querySelector("#subject-kicker").textContent = `${catalogue.data.board} ${catalogue.data.qualification} · ${catalogue.data.syllabusCode}`;
  document.querySelector("#subject-heading").textContent = `${catalogue.data.subject} Paper Checklist`;

  const analytics = buildAnalytics(catalogue);
  renderStats(analytics, catalogue);
  renderCharts(analytics);
  renderChecklist(catalogue, analytics.attempts);
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
  document.querySelector("#charts-grid").classList.toggle("hidden", analytics.totalAttempts === 0);
}

function renderCharts(analytics) {
  destroyCharts();
  const Chart = window.Chart;
  if (!Chart || !analytics.totalAttempts) return;

  const improvementContext = document.querySelector("#improvement-chart");
  const paperAverageContext = document.querySelector("#paper-average-chart");
  const completionContext = document.querySelector("#completion-chart");

  charts.push(new Chart(improvementContext, {
    type: "line",
    data: {
      labels: analytics.improvement.map((attempt) => new Date(attemptMillis(attempt)).toLocaleDateString()),
      datasets: [{
        label: "Score %",
        data: analytics.improvement.map((attempt) => ({
          x: new Date(attemptMillis(attempt)).toLocaleDateString(),
          y: attempt.percentage,
          attempt
        })),
        borderColor: "#1b6b68",
        backgroundColor: "rgba(27, 107, 104, 0.16)",
        tension: 0.32,
        fill: true
      }]
    },
    options: chartOptions({
      max: 100,
      tooltipLabel: (context) => {
        const attempt = context.raw.attempt;
        const paperName = attempt.paper?.name || attempt.paperId;
        const date = new Date(attemptMillis(attempt)).toLocaleDateString();
        return [
          paperName,
          `${attempt.score}/${attempt.maximumMark} · ${formatPercent(attempt.percentage)}`,
          date
        ];
      }
    })
  }));

  charts.push(new Chart(paperAverageContext, {
    type: "bar",
    data: {
      labels: analytics.paperAverages.map((item) => `Paper ${item.paperNumber}`),
      datasets: [{
        label: "Average %",
        data: analytics.paperAverages.map((item) => item.average),
        backgroundColor: "#d56a3f"
      }]
    },
    options: chartOptions({ max: 100 })
  }));

  charts.push(new Chart(completionContext, {
    type: "doughnut",
    data: {
      labels: ["Completed", "Remaining"],
      datasets: [{
        data: [analytics.completedUnique, Math.max(analytics.totalPapers - analytics.completedUnique, 0)],
        backgroundColor: ["#1b6b68", "#d9e2ec"]
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: "bottom"
        }
      }
    }
  }));
}

function chartOptions({ max, tooltipLabel = null }) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        max,
        ticks: {
          callback: (value) => `${value}%`
        }
      }
    },
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: tooltipLabel ? {
          label: tooltipLabel
        } : {}
      }
    }
  };
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

  const sortedPapers = sortPapersForChecklist(catalogue.papers);
  const years = groupBy(sortedPapers, (paper) => paper.year);
  const newestYear = Math.max(...Object.keys(years).map(Number));

  checklist.innerHTML = Object.entries(years)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([year, papers]) => `
      <details class="year-section" ${Number(year) === newestYear ? "open" : ""}>
        <summary>${year}</summary>
        ${renderSessionGroups(papers, subjectAttempts)}
      </details>
    `).join("");
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
  if (!paper || !modal) return;

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
  const attempts = attemptsForPaper(attemptsForCatalogue(state.selectedCatalogue), paperId);
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
  if (!paper || !state.selectedCatalogue) return;

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

  const paperAttempts = attemptsForPaper(attemptsForCatalogue(state.selectedCatalogue), paper.id);
  await addDoc(collection(db, "users", state.user.uid, "attempts"), {
    catalogueId: state.selectedCatalogue.id,
    paperId: paper.id,
    score,
    maximumMark: paper.maximumMark,
    percentage: Number(((score / paper.maximumMark) * 100).toFixed(3)),
    completedAt: serverTimestamp(),
    attemptNumber: paperAttempts.length + 1
  });

  state.attempts = await loadAttempts(state.user.uid);
  document.querySelector("#completion-modal").close();
  showSubject(state.selectedCatalogue.id);
  showToast("Attempt saved.");
}

function wireEvents() {
  document.querySelector("#subject-grid")?.addEventListener("click", (event) => {
    const catalogueId = event.target.closest("[data-catalogue-id]")?.dataset.catalogueId;
    if (catalogueId) showSubject(catalogueId);
  });

  document.querySelector("#back-to-subjects")?.addEventListener("click", () => {
    window.location.hash = "";
    state.selectedCatalogue = null;
    renderSubjectCards();
  });

  document.querySelector("#paper-checklist")?.addEventListener("click", (event) => {
    const completeId = event.target.closest("[data-complete]")?.dataset.complete;
    const historyId = event.target.closest("[data-history]")?.dataset.history;
    if (completeId) openCompletionModal(completeId);
    if (historyId) openHistoryModal(historyId);
  });

  document.querySelector("#completion-form")?.addEventListener("submit", async (event) => {
    try {
      await saveAttempt(event);
    } catch (error) {
      document.querySelector("#modal-message").textContent = "Could not save attempt. Check your Firebase setup and try again.";
    }
  });
  document.querySelector("#cancel-completion")?.addEventListener("click", () => document.querySelector("#completion-modal")?.close());
  document.querySelector("#cancel-completion-x")?.addEventListener("click", () => document.querySelector("#completion-modal")?.close());
  document.querySelector("#close-history")?.addEventListener("click", () => document.querySelector("#history-modal")?.close());

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

    const catalogueId = new URLSearchParams(window.location.hash.slice(1)).get("catalogue");
    if (catalogueId) showSubject(catalogueId);
    else renderSubjectCards();
  } catch (error) {
    document.querySelector("#dashboard-loading")?.classList.add("hidden");
    const errorBox = document.querySelector("#dashboard-error");
    errorBox.textContent = error.message || "Could not load dashboard.";
    errorBox.classList.remove("hidden");
  }
}

requireAuth(initDashboard);
