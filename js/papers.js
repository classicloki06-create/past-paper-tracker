import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db } from "./firebase.js";
import { formatDate, formatPercent, requireAuth, showToast, wireLogout } from "./app.js";

const state = {
  user: null,
  catalogues: [],
  papers: [],
  attempts: [],
  selectedPaper: null
};

export async function loadCatalogue(uid = null) {
  const response = await fetch("data/catalogue.json");
  if (!response.ok) throw new Error("Could not load data/catalogue.json.");
  const manifest = await response.json();
  const catalogues = manifest.catalogues || [];

  const staticCatalogues = await Promise.all(catalogues.map(async (entry) => {
    const catalogueResponse = await fetch(entry.path);
    if (!catalogueResponse.ok) throw new Error(`Could not load ${entry.path}.`);
    const data = await catalogueResponse.json();
    return normalizeCatalogueRecord({
      id: entry.path,
      source: "static",
      path: entry.path,
      data
    });
  }));

  if (!uid) return staticCatalogues;

  const importedCatalogues = await loadImportedCatalogues(uid);
  return [...staticCatalogues, ...importedCatalogues];
}

async function loadImportedCatalogues(uid) {
  const snapshot = await getDocs(collection(db, "users", uid, "catalogues"));
  return snapshot.docs
    .map((catalogueDoc) => normalizeCatalogueRecord({
      id: catalogueDoc.id,
      source: "imported",
      data: catalogueDoc.data()
    }))
    .sort((a, b) => catalogueLabel(a).localeCompare(catalogueLabel(b)));
}

function normalizeCatalogueRecord(record) {
  const data = record.data;
  const syllabusCode = data.syllabusCode || data.code;

  return {
    ...record,
    data: {
      ...data,
      syllabusCode,
      code: syllabusCode
    },
    papers: (data.papers || []).map((paper) => ({
      ...paper,
      board: data.board,
      subject: data.subject,
      syllabusCode,
      code: syllabusCode,
      qualification: data.qualification,
      catalogueId: record.id,
      cataloguePath: record.path || record.id,
      catalogueSource: record.source
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

function catalogueLabel(catalogue) {
  return `${catalogue.data.board} ${catalogue.data.subject} ${catalogue.data.syllabusCode} ${catalogue.data.qualification}`;
}

function populateFilters() {
  const catalogueSelect = document.querySelector("#filter-catalogue");
  if (catalogueSelect) {
    const selectedValue = catalogueSelect.value || "all";
    catalogueSelect.innerHTML = [
      `<option value="all">All catalogues</option>`,
      ...state.catalogues.map((catalogue) => {
        const suffix = catalogue.source === "imported" ? " (imported)" : "";
        return `<option value="${catalogue.id}">${catalogueLabel(catalogue)}${suffix}</option>`;
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

function renderImportedCatalogues() {
  const container = document.querySelector("#imported-catalogues");
  if (!container) return;

  const imported = state.catalogues.filter((catalogue) => catalogue.source === "imported");
  if (!imported.length) {
    container.innerHTML = `<p class="muted-text">No imported catalogues yet.</p>`;
    return;
  }

  container.innerHTML = imported.map((catalogue) => `
    <article class="imported-catalogue">
      <div>
        <strong>${catalogue.data.subject}</strong>
        <span>${catalogue.data.board} · ${catalogue.data.qualification} · ${catalogue.data.syllabusCode} · ${catalogue.papers.length} papers</span>
      </div>
      <button class="button button-secondary" data-remove-catalogue="${catalogue.id}" type="button">Remove</button>
    </article>
  `).join("");
}

function validateCatalogue(data, existingPaperIds = new Set()) {
  const errors = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return ["JSON must contain one catalogue object."];
  }

  const syllabusCode = data.syllabusCode || data.code;
  [
    ["board", data.board],
    ["subject", data.subject],
    ["syllabusCode or code", syllabusCode],
    ["qualification", data.qualification]
  ].forEach(([field, value]) => {
    if (typeof value !== "string" || !value.trim()) errors.push(`Missing or invalid catalogue field: ${field}.`);
  });

  if (!Array.isArray(data.papers)) {
    errors.push("Missing or invalid catalogue field: papers must be an array.");
    return errors;
  }

  const paperIds = new Set();
  data.papers.forEach((paper, index) => {
    const label = `papers[${index}]`;
    if (!paper || typeof paper !== "object" || Array.isArray(paper)) {
      errors.push(`${label} must be an object.`);
      return;
    }

    if (typeof paper.id !== "string" || !paper.id.trim()) errors.push(`${label}.id is required.`);
    if (paper.id && paperIds.has(paper.id)) errors.push(`${label}.id duplicates another paper in this import.`);
    if (paper.id && existingPaperIds.has(paper.id)) errors.push(`${label}.id already exists in another loaded catalogue.`);
    if (paper.id) paperIds.add(paper.id);

    if (!Number.isFinite(Number(paper.year))) errors.push(`${label}.year must be a number.`);
    if (typeof paper.session !== "string" || !paper.session.trim()) errors.push(`${label}.session is required.`);
    if (paper.variant === undefined || paper.variant === null || String(paper.variant).trim() === "") errors.push(`${label}.variant is required.`);
    if (!Number.isFinite(Number(paper.paper))) errors.push(`${label}.paper must be a number.`);
    if (typeof paper.name !== "string" || !paper.name.trim()) errors.push(`${label}.name is required.`);
    if (typeof paper.type !== "string" || !paper.type.trim()) errors.push(`${label}.type is required.`);
    if (!Number.isFinite(Number(paper.maximumMark)) || Number(paper.maximumMark) <= 0) errors.push(`${label}.maximumMark must be greater than 0.`);
    if (paper.files !== undefined && (typeof paper.files !== "object" || Array.isArray(paper.files) || paper.files === null)) {
      errors.push(`${label}.files must be an object when provided.`);
    }
  });

  return errors;
}

function sanitizeCatalogue(data) {
  const syllabusCode = String(data.syllabusCode || data.code).trim();
  return {
    board: String(data.board).trim(),
    subject: String(data.subject).trim(),
    syllabusCode,
    code: syllabusCode,
    qualification: String(data.qualification).trim(),
    papers: data.papers.map((paper) => ({
      id: String(paper.id).trim(),
      year: Number(paper.year),
      session: String(paper.session).trim(),
      sessionCode: paper.sessionCode ? String(paper.sessionCode).trim() : "",
      variant: String(paper.variant).trim(),
      paper: Number(paper.paper),
      name: String(paper.name).trim(),
      type: String(paper.type).trim(),
      maximumMark: Number(paper.maximumMark),
      files: {
        questionPaper: String(paper.files?.questionPaper || ""),
        markScheme: String(paper.files?.markScheme || ""),
        examinerReport: String(paper.files?.examinerReport || "")
      }
    }))
  };
}

async function handleJsonImport(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  const result = document.querySelector("#import-result");
  result.classList.remove("hidden", "success");
  result.textContent = "Reading JSON...";

  try {
    const parsed = JSON.parse(await file.text());
    const existingPaperIds = new Set(state.papers.map((paper) => paper.id));
    const errors = validateCatalogue(parsed, existingPaperIds);

    if (errors.length) {
      result.innerHTML = `<strong>Import failed</strong><ul>${errors.map((error) => `<li>${error}</li>`).join("")}</ul>`;
      return;
    }

    const catalogue = sanitizeCatalogue(parsed);
    await addDoc(collection(db, "users", state.user.uid, "catalogues"), {
      ...catalogue,
      importedBy: state.user.uid,
      importedAt: serverTimestamp()
    });

    state.catalogues = await loadCatalogue(state.user.uid);
    state.papers = flattenPapers(state.catalogues);
    populateFilters();
    renderImportedCatalogues();
    renderPapers();
    result.classList.add("success");
    result.innerHTML = `
      <strong>Successfully imported</strong>
      <dl>
        <div><dt>Subject</dt><dd>${catalogue.subject}</dd></div>
        <div><dt>Level</dt><dd>${catalogue.qualification}</dd></div>
        <div><dt>Syllabus</dt><dd>${catalogue.syllabusCode}</dd></div>
        <div><dt>Papers</dt><dd>${catalogue.papers.length}</dd></div>
      </dl>
    `;
    showToast("Catalogue imported.");
  } catch (error) {
    const message = error instanceof SyntaxError
      ? "The selected file is not valid JSON."
      : "Could not import this catalogue. Please check your Firebase rules and try again.";
    result.innerHTML = `<strong>Import failed</strong><p>${message}</p>`;
  }
}

async function removeCatalogue(catalogueId) {
  const catalogue = state.catalogues.find((item) => item.id === catalogueId && item.source === "imported");
  if (!catalogue) return;

  const confirmed = window.confirm(`Remove ${catalogue.data.subject} ${catalogue.data.qualification} ${catalogue.data.syllabusCode}? Historical attempts will not be deleted.`);
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "users", state.user.uid, "catalogues", catalogueId));
    state.catalogues = await loadCatalogue(state.user.uid);
    state.papers = flattenPapers(state.catalogues);
    populateFilters();
    renderImportedCatalogues();
    renderPapers();
    showToast("Catalogue removed. Attempts were kept.");
  } catch (error) {
    showToast("Could not remove catalogue. Check your Firebase rules and try again.", "error");
  }
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
  document.querySelector("#json-import-input")?.addEventListener("change", handleJsonImport);
  document.querySelector("#imported-catalogues")?.addEventListener("click", (event) => {
    const catalogueId = event.target.closest("[data-remove-catalogue]")?.dataset.removeCatalogue;
    if (catalogueId) removeCatalogue(catalogueId);
  });
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
    renderImportedCatalogues();
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
