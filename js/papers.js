import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  where
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db } from "./firebase.js";
import { average, formatDate, formatPercent, requireAuth, showToast, wireLogout } from "./app.js";

const state = {
  user: null,
  catalogues: [],
  selectedCataloguePath: "all",
  papers: [],
  attempts: [],
  selectedPaper: null
};

export async function loadCatalogue() {
  const response = await fetch("data/catalogue.json");
  if (!response.ok) throw new Error("Could not load data/catalogue.json.");
  const manifest = await response.json();
  const catalogues = manifest.catalogues || [];

  const loaded = await Promise.all(catalogues.map(async (entry) => {
    const catalogueResponse = await fetch(entry.path);
    if (!catalogueResponse.ok) throw new Error(`Could not load ${entry.path}.`);
    const data = await catalogueResponse.json();
    return {
      ...entry,
      data,
      papers: (data.papers || []).map((paper) => ({
        ...paper,
        board: data.board,
        subject: data.subject,
        code: data.code,
        qualification: data.qualification,
        cataloguePath: entry.path
      }))
    };
  }));

  return loaded;
}

export function flattenPapers(catalogues) {
  return catalogues.flatMap((catalogue) => catalogue.papers);
}

export async function loadAttempts(uid) {
  const attemptsRef = collection(db, "users", uid, "attempts");
  const snapshot = await getDocs(query(attemptsRef, orderBy("completedAt", "asc")));
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export function attemptsForPaper(attempts, paperId) {
  return attempts
    .filter((attempt) => attempt.paperId === paperId)
    .sort((a, b) => attemptMillis(a) - attemptMillis(b));
}

export function bestAttempt(attempts) {
  if (!attempts.length) return null;
  return attempts.reduce((best, attempt) => attempt.percentage > best.percentage ? attempt : best, attempts[0]);
}

export function attemptMillis(attempt) {
  const date = attempt.completedAt?.toDate ? attempt.completedAt.toDate() : new Date(attempt.completedAt);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function populateFilters() {
  const catalogueSelect = document.querySelector("#filter-catalogue");
  if (catalogueSelect) {
    catalogueSelect.innerHTML = [
      `<option value="all">All catalogues</option>`,
      ...state.catalogues.map((catalogue) => {
        const label = `${catalogue.data.board} ${catalogue.data.subject} ${catalogue.data.code} ${catalogue.data.qualification}`;
        return `<option value="${catalogue.path}">${label}</option>`;
      })
    ].join("");
  }

  populateSelect("#filter-year", "All years", uniqueValues(state.papers.map((paper) => paper.year)).sort((a, b) => b - a));
  populateSelect("#filter-session", "All sessions", uniqueValues(state.papers.map((paper) => paper.session)));
  populateSelect("#filter-variant", "All variants", uniqueValues(state.papers.map((paper) => paper.variant)).sort());
  populateSelect("#filter-paper", "All papers", uniqueValues(state.papers.map((paper) => paper.paper)).sort((a, b) => a - b));
}

function populateSelect(selector, label, values) {
  const select = document.querySelector(selector);
  if (!select) return;
  select.innerHTML = `<option value="all">${label}</option>${values.map((value) => `<option value="${value}">${value}</option>`).join("")}`;
}

function uniqueValues(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ""))];
}

function filteredPapers() {
  const filters = {
    catalogue: document.querySelector("#filter-catalogue")?.value || "all",
    year: document.querySelector("#filter-year")?.value || "all",
    session: document.querySelector("#filter-session")?.value || "all",
    variant: document.querySelector("#filter-variant")?.value || "all",
    paper: document.querySelector("#filter-paper")?.value || "all",
    status: document.querySelector("#filter-status")?.value || "all"
  };

  return state.papers.filter((paper) => {
    const paperAttempts = attemptsForPaper(state.attempts, paper.id);
    const completed = paperAttempts.length > 0;
    return (filters.catalogue === "all" || paper.cataloguePath === filters.catalogue)
      && (filters.year === "all" || String(paper.year) === filters.year)
      && (filters.session === "all" || paper.session === filters.session)
      && (filters.variant === "all" || String(paper.variant) === filters.variant)
      && (filters.paper === "all" || String(paper.paper) === filters.paper)
      && (filters.status === "all" || (filters.status === "completed" ? completed : !completed));
  });
}

function renderPapers() {
  const list = document.querySelector("#papers-list");
  const empty = document.querySelector("#papers-empty");
  const summary = document.querySelector("#papers-summary");
  if (!list || !empty || !summary) return;

  const papers = filteredPapers();
  const completedCount = state.papers.filter((paper) => attemptsForPaper(state.attempts, paper.id).length).length;

  summary.classList.remove("hidden");
  summary.innerHTML = `<span>${papers.length} papers shown</span><span>${completedCount}/${state.papers.length} completed</span>`;

  list.innerHTML = "";
  empty.classList.toggle("hidden", papers.length > 0);

  papers.forEach((paper) => {
    const paperAttempts = attemptsForPaper(state.attempts, paper.id);
    const best = bestAttempt(paperAttempts);
    const card = document.createElement("article");
    card.className = "paper-card";
    card.innerHTML = `
      <div class="paper-card-header">
        <div class="paper-title">
          <h2>${paper.name}</h2>
          <p>${paper.board} ${paper.subject} ${paper.code} ${paper.qualification}</p>
        </div>
        <span class="badge ${best ? "badge-good" : "badge-warn"}">${best ? "Completed" : "Not completed"}</span>
      </div>
      <div class="paper-meta">
        <div><span>Year</span><strong>${paper.year}</strong></div>
        <div><span>Session</span><strong>${paper.session}</strong></div>
        <div><span>Variant</span><strong>${paper.variant}</strong></div>
        <div><span>Paper</span><strong>${paper.paper}</strong></div>
        <div><span>Type</span><strong>${paper.type}</strong></div>
        <div><span>Max marks</span><strong>${paper.maximumMark}</strong></div>
      </div>
      <div class="paper-meta">
        <div><span>Best score</span><strong>${best ? `${best.score}/${best.maximumMark} (${formatPercent(best.percentage)})` : "None"}</strong></div>
        <div><span>Attempts</span><strong>${paperAttempts.length}</strong></div>
        <div><span>Latest</span><strong>${paperAttempts.length ? formatDate(paperAttempts[paperAttempts.length - 1].completedAt) : "Not attempted"}</strong></div>
      </div>
      <div class="file-links">${renderFileLinks(paper.files)}</div>
      <div class="paper-actions">
        <button class="button button-primary" data-complete="${paper.id}" type="button">Complete</button>
        <button class="button button-secondary" data-history="${paper.id}" type="button" ${paperAttempts.length ? "" : "disabled"}>View History</button>
      </div>
    `;
    list.appendChild(card);
  });
}

function renderFileLinks(files = {}) {
  const entries = [
    ["Question paper", files.questionPaper],
    ["Mark scheme", files.markScheme],
    ["Examiner report", files.examinerReport]
  ];

  return entries.map(([label, href]) => href
    ? `<a href="${href}" target="_blank" rel="noopener">${label}</a>`
    : `<span>${label} unavailable</span>`
  ).join("");
}

function openCompletionModal(paperId) {
  const paper = state.papers.find((item) => item.id === paperId);
  const modal = document.querySelector("#completion-modal");
  if (!paper || !modal) return;

  state.selectedPaper = paper;
  document.querySelector("#modal-paper-meta").textContent = `${paper.year} ${paper.session} Variant ${paper.variant} · Paper ${paper.paper}`;
  document.querySelector("#modal-title").textContent = paper.name;
  document.querySelector("#maximum-mark-label").textContent = `/ ${paper.maximumMark}`;
  const scoreInput = document.querySelector("#score-input");
  scoreInput.value = "";
  scoreInput.max = paper.maximumMark;
  document.querySelector("#modal-message").textContent = "";
  modal.showModal();
  scoreInput.focus();
}

function openHistoryModal(paperId) {
  const paper = state.papers.find((item) => item.id === paperId);
  const attempts = attemptsForPaper(state.attempts, paperId);
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
  const score = Number(document.querySelector("#score-input").value);
  const message = document.querySelector("#modal-message");
  if (!paper) return;

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

  const paperAttempts = attemptsForPaper(state.attempts, paper.id);
  const attempt = {
    paperId: paper.id,
    score,
    maximumMark: paper.maximumMark,
    percentage: Number(((score / paper.maximumMark) * 100).toFixed(2)),
    completedAt: serverTimestamp(),
    attemptNumber: paperAttempts.length + 1
  };

  try {
    const attemptsRef = collection(db, "users", state.user.uid, "attempts");
    await addDoc(attemptsRef, attempt);
    state.attempts = await loadAttempts(state.user.uid);
    document.querySelector("#completion-modal").close();
    renderPapers();
    showToast("Attempt saved.");
  } catch (error) {
    message.textContent = "Could not save attempt. Check your Firebase setup and try again.";
  }
}

function wirePaperEvents() {
  document.querySelector("#papers-list")?.addEventListener("click", (event) => {
    const completeId = event.target.closest("[data-complete]")?.dataset.complete;
    const historyId = event.target.closest("[data-history]")?.dataset.history;
    if (completeId) openCompletionModal(completeId);
    if (historyId) openHistoryModal(historyId);
  });

  document.querySelectorAll(".filter-panel select").forEach((select) => {
    select.addEventListener("change", renderPapers);
  });

  document.querySelector("#completion-form")?.addEventListener("submit", saveAttempt);
  document.querySelector("#cancel-completion")?.addEventListener("click", () => document.querySelector("#completion-modal")?.close());
  document.querySelector(".modal-close")?.addEventListener("click", () => document.querySelector("#completion-modal")?.close());
  document.querySelector("#close-history")?.addEventListener("click", () => document.querySelector("#history-modal")?.close());
}

async function initPapersPage(user) {
  state.user = user;
  wireLogout();
  wirePaperEvents();

  try {
    state.catalogues = await loadCatalogue();
    state.papers = flattenPapers(state.catalogues);
    state.attempts = await loadAttempts(user.uid);
    populateFilters();
    renderPapers();
    document.querySelector("#papers-loading")?.classList.add("hidden");
  } catch (error) {
    document.querySelector("#papers-loading")?.classList.add("hidden");
    const errorBox = document.querySelector("#papers-error");
    errorBox.textContent = error.message || "Could not load papers.";
    errorBox.classList.remove("hidden");
  }
}

if (document.querySelector("#papers-list")) {
  requireAuth(initPapersPage);
}
