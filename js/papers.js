import {
  addDoc,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db } from "./firebase.js";
import { formatDate, formatPercent, requireAuth, showToast, wireLogout } from "./app.js";
import { builtInCatalogues, catalogueLabel } from "../data/catalogues.js";

const state = {
  user: null,
  catalogues: [],
  papers: [],
  attempts: [],
  selectedPaper: null,
  selectedSubjectIds: []
};

export async function loadCatalogue(uid = null) {
  const catalogues = builtInCatalogues.map(normalizeCatalogueRecord);
  if (!uid) return catalogues;
  const selectedIds = await loadSelectedSubjectIds(uid);
  return catalogues.filter((catalogue) => selectedIds.includes(catalogue.id));
}

export function loadAllBuiltInCatalogues() {
  return builtInCatalogues.map(normalizeCatalogueRecord);
}

export async function loadSelectedSubjectIds(uid) {
  const userSnap = await getDoc(doc(db, "users", uid));
  const selectedSubjects = userSnap.exists() ? userSnap.data().selectedSubjects : [];
  return Array.isArray(selectedSubjects) ? selectedSubjects.filter((id) => typeof id === "string") : [];
}

export async function saveSelectedSubjectIds(uid, selectedSubjectIds) {
  const uniqueIds = [...new Set(selectedSubjectIds)].filter((id) => builtInCatalogues.some((catalogue) => catalogue.id === id));
  await setDoc(doc(db, "users", uid), { selectedSubjects: uniqueIds }, { merge: true });
  return uniqueIds;
}

function normalizeCatalogueRecord(record) {
  const data = record.data || {};
  const syllabusCode = data.syllabusCode || data.code;
  const id = record.id || data.catalogueId;

  return {
    ...record,
    id,
    source: record.source || "built-in",
    data: {
      ...data,
      catalogueId: data.catalogueId || id,
      syllabusCode,
      code: syllabusCode
    },
    papers: (record.papers || data.papers || []).map((paper) => ({
      ...paper,
      board: data.board,
      subject: data.subject,
      syllabusCode,
      code: syllabusCode,
      qualification: data.qualification,
      route: data.route || paper.route || null,
      catalogueId: id,
      cataloguePath: id,
      catalogueSource: record.source || "built-in"
    }))
  };
}

export function flattenPapers(catalogues) {
  return catalogues.flatMap((catalogue) => catalogue.papers);
}

export async function loadAttempts(uid) {
  const attemptsRef = collection(db, "users", uid, "attempts");
  const snapshot = await getDocs(attemptsRef);
  return snapshot.docs
    .map((attemptDoc) => ({ id: attemptDoc.id, ...attemptDoc.data() }))
    .sort(compareAttempts);
}

export function attemptsForPaper(attempts, paperId) {
  return attempts
    .filter((attempt) => attempt.paperId === paperId)
    .sort(compareAttempts);
}

export function bestAttempt(attempts) {
  if (!attempts.length) return null;
  return attempts.reduce((best, attempt) => attempt.percentage > best.percentage ? attempt : best, attempts[0]);
}

export function attemptMillis(attempt) {
  const date = attempt.completedAt?.toDate ? attempt.completedAt.toDate() : new Date(attempt.completedAt);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function compareAttempts(a, b) {
  const timeDifference = attemptMillis(a) - attemptMillis(b);
  if (timeDifference !== 0) return timeDifference;

  const attemptDifference = (Number(a.attemptNumber) || 0) - (Number(b.attemptNumber) || 0);
  if (attemptDifference !== 0) return attemptDifference;

  return String(a.id || "").localeCompare(String(b.id || ""));
}

function populateFilters() {
  const catalogueSelect = document.querySelector("#filter-catalogue");
  if (catalogueSelect) {
    const selectedValue = catalogueSelect.value || "all";
    catalogueSelect.innerHTML = [
      `<option value="all">All catalogues</option>`,
      ...state.catalogues.map((catalogue) => {
        return `<option value="${catalogue.id}">${catalogueLabel(catalogue)}</option>`;
      })
    ].join("");
    catalogueSelect.value = [...catalogueSelect.options].some((option) => option.value === selectedValue) ? selectedValue : "all";
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

function componentLabel(paper) {
  return paper.board === "Edexcel" ? "Unit" : "Paper";
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
    return (filters.catalogue === "all" || paper.catalogueId === filters.catalogue)
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
          <p>${paper.board} ${paper.subject} ${paper.syllabusCode} ${paper.qualification}</p>
        </div>
        <span class="badge ${best ? "badge-good" : "badge-warn"}">${best ? "Completed" : "Not completed"}</span>
      </div>
      <div class="paper-meta">
        <div><span>Year</span><strong>${paper.year}</strong></div>
        <div><span>Session</span><strong>${paper.session}</strong></div>
        <div><span>Variant</span><strong>${paper.variant}</strong></div>
        <div><span>${componentLabel(paper)}</span><strong>${paper.paper}</strong></div>
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
  document.querySelector("#modal-paper-meta").textContent = `${paper.year} ${paper.session} Variant ${paper.variant} · ${componentLabel(paper)} ${paper.paper}`;
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
    catalogueId: paper.catalogueId,
    score,
    maximumMark: paper.maximumMark,
    percentage: Number(((score / paper.maximumMark) * 100).toFixed(3)),
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
  document.querySelector("#completion-modal .modal-close")?.addEventListener("click", () => document.querySelector("#completion-modal")?.close());
  document.querySelector("#close-history")?.addEventListener("click", () => document.querySelector("#history-modal")?.close());
}

async function initPapersPage(user) {
  state.user = user;
  wireLogout();
  wirePaperEvents();

  try {
    state.catalogues = await loadCatalogue(user.uid);
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
