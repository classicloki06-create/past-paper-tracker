import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db } from "./firebase.js";
import { requireAuth, showToast, wireLogout } from "./app.js";
import { findCatalogue } from "../data/catalogues.js";

const params = new URLSearchParams(window.location.search);

const state = {
  user: null,
  catalogue: null,
  paper: null,
  notes: [],
  tool: "pen",
  strokeSize: 4,
  activeNoteId: "",
  pendingDeleteId: "",
  saveTimers: new Map(),
  canvases: new Map()
};

function componentLabel(paper) {
  return paper.board === "Edexcel" ? `Unit ${paper.paper}` : `Paper ${paper.paper}`;
}

function variantLabel(paper) {
  return paper.board === "Edexcel" ? String(paper.variant) : `Variant ${paper.variant}`;
}

function noteColour(type) {
  return {
    mistake: "#fff4b8",
    concept: "#dbeafe",
    remember: "#dcfce7",
    important: "#fee2e2"
  }[type] || "#fff4b8";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(message, error = false) {
  const status = document.querySelector("#notes-save-status");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", error);
}

function paperBackUrl() {
  const hash = new URLSearchParams({
    catalogue: state.catalogue.id,
    year: state.paper.year,
    session: state.paper.session,
    variant: state.paper.variant
  });
  return `dashboard.html#${hash.toString()}`;
}

function showError(message) {
  document.querySelector("#notes-loading")?.classList.add("hidden");
  const errorBox = document.querySelector("#notes-error");
  if (!errorBox) return;
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function normalizeNote(note) {
  const noteMode = note.noteMode || (note.drawingData && !note.text ? "drawing" : "text");
  const defaultWidth = noteMode === "drawing" ? 320 : 280;
  const defaultHeight = noteMode === "drawing" ? 300 : 220;
  const x = Number(note.x);
  const y = Number(note.y);
  const width = Number(note.width);
  const height = Number(note.height);

  return {
    ...note,
    text: "",
    drawingData: "",
    noteMode,
    x: Number.isFinite(x) ? Math.max(0, Math.min(x, 880)) : 24,
    y: Number.isFinite(y) ? Math.max(0, Math.min(y, 520)) : 24,
    width: Number.isFinite(width) ? Math.max(240, Math.min(width, 520)) : defaultWidth,
    height: Number.isFinite(height) ? Math.max(190, Math.min(height, 460)) : defaultHeight,
    noteType: note.noteType || "mistake",
    text: note.text || "",
    drawingData: note.drawingData || ""
  };
}

async function loadNotes() {
  const snapshot = await getDocs(collection(db, "users", state.user.uid, "notes"));
  state.notes = snapshot.docs
    .map((noteDoc) => normalizeNote({ id: noteDoc.id, ...noteDoc.data() }))
    .filter((note) => note.catalogueId === state.catalogue.id && note.paperId === state.paper.id)
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
}

function noteTemplate(note) {
  const isDrawing = note.noteMode === "drawing";
  return `
    <article class="sticky-note ${isDrawing ? "sticky-note-drawing" : "sticky-note-text"}" data-note-id="${note.id}" style="left:${note.x}px;top:${note.y}px;width:${note.width}px;height:${note.height}px;background:${noteColour(note.noteType)}">
      <div class="sticky-note-top" data-drag-note="${note.id}">
        <select data-note-type="${note.id}" aria-label="Note type">
          <option value="mistake" ${note.noteType === "mistake" ? "selected" : ""}>Mistake</option>
          <option value="concept" ${note.noteType === "concept" ? "selected" : ""}>Concept</option>
          <option value="remember" ${note.noteType === "remember" ? "selected" : ""}>Remember</option>
          <option value="important" ${note.noteType === "important" ? "selected" : ""}>Important</option>
        </select>
        <div class="sticky-note-actions">
          <button type="button" data-duplicate-note="${note.id}" aria-label="Duplicate note">Duplicate</button>
          <button type="button" data-delete-note="${note.id}" aria-label="Delete note">Delete</button>
        </div>
      </div>
      ${isDrawing
        ? `<canvas data-note-canvas="${note.id}" aria-label="Drawing area for note"></canvas>`
        : `<textarea data-note-text="${note.id}" aria-label="Sticky note text" placeholder="Write the mistake, concept, or reminder...">${escapeHtml(note.text)}</textarea>`}
      <span class="note-resize-handle" data-resize-note="${note.id}" aria-hidden="true"></span>
    </article>
  `;
}

function renderNotes() {
  const board = document.querySelector("#notes-board");
  const empty = document.querySelector("#notes-empty");
  if (!board || !empty) return;

  state.canvases.clear();
  if (!state.notes.length) {
    board.innerHTML = `
      <div class="notes-board-empty">
        <h2>No notes yet</h2>
        <p>Click New Note, then choose a typing note or a drawing note.</p>
        <button class="button button-primary" type="button" data-open-note-type>+ New Note</button>
      </div>
    `;
    empty.classList.add("hidden");
    updateToolbarVisibility();
    return;
  }

  board.innerHTML = state.notes.map(noteTemplate).join("");
  empty.classList.add("hidden");
  state.notes.filter((note) => note.noteMode === "drawing").forEach(setupCanvas);
  updateToolbarVisibility();
}

function noteById(noteId) {
  return state.notes.find((note) => note.id === noteId);
}

function debouncedSave(noteId, updates, delay = 650) {
  const note = noteById(noteId);
  if (!note) return;
  Object.assign(note, updates);
  setStatus("Saving...");
  clearTimeout(state.saveTimers.get(noteId));
  state.saveTimers.set(noteId, window.setTimeout(async () => {
    try {
      await updateDoc(doc(db, "users", state.user.uid, "notes", noteId), {
        ...updates,
        updatedAt: serverTimestamp()
      });
      setStatus("Saved");
    } catch (error) {
      console.error("Could not save note:", error);
      setStatus("Could not save note.", true);
    }
  }, delay));
}

function updateToolbarVisibility() {
  const toolbar = document.querySelector("#notes-toolbar");
  if (!toolbar) return;
  const activeNote = noteById(state.activeNoteId);
  toolbar.classList.toggle("hidden", activeNote?.noteMode !== "drawing");
}

function openNoteTypeModal() {
  const modal = document.querySelector("#note-type-modal");
  if (!modal) return;
  if (typeof modal.showModal === "function") modal.showModal();
  else modal.setAttribute("open", "");
}

function closeNoteTypeModal() {
  const modal = document.querySelector("#note-type-modal");
  if (!modal) return;
  if (typeof modal.close === "function") modal.close();
  else modal.removeAttribute("open");
}

function drawStoredImage(note, canvas, ctx) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!note.drawingData) return;
  const image = new Image();
  image.onload = () => ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.src = note.drawingData;
}

function resizeCanvasToNote(note, canvas, ctx) {
  const width = Math.max(220, note.width - 24);
  const height = Math.max(150, note.height - 72);
  canvas.width = width;
  canvas.height = height;
  drawStoredImage(note, canvas, ctx);
}

function pointerPosition(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height
  };
}

function pushUndo(noteId) {
  const canvasState = state.canvases.get(noteId);
  if (!canvasState) return;
  canvasState.undo.push(canvasState.canvas.toDataURL("image/png"));
  canvasState.redo = [];
}

function setupCanvas(note) {
  const canvas = document.querySelector(`[data-note-canvas="${CSS.escape(note.id)}"]`);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const canvasState = { canvas, ctx, drawing: false, undo: [], redo: [] };
  state.canvases.set(note.id, canvasState);
  resizeCanvasToNote(note, canvas, ctx);

  canvas.addEventListener("pointerdown", (event) => {
    state.activeNoteId = note.id;
    pushUndo(note.id);
    canvas.setPointerCapture(event.pointerId);
    canvasState.drawing = true;
    const point = pointerPosition(canvas, event);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!canvasState.drawing) return;
    const point = pointerPosition(canvas, event);
    ctx.globalCompositeOperation = state.tool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = state.tool === "highlighter" ? "rgba(213, 106, 63, 0.32)" : "#172033";
    ctx.lineWidth = state.tool === "eraser" ? state.strokeSize * 1.8 : state.strokeSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  });

  const finishDrawing = () => {
    if (!canvasState.drawing) return;
    canvasState.drawing = false;
    debouncedSave(note.id, { drawingData: canvas.toDataURL("image/png") }, 300);
  };

  canvas.addEventListener("pointerup", finishDrawing);
  canvas.addEventListener("pointercancel", finishDrawing);
}

async function createNote(noteMode = "text", base = {}) {
  const isDrawing = noteMode === "drawing";
  const note = normalizeNote({
    catalogueId: state.catalogue.id,
    paperId: state.paper.id,
    year: state.paper.year,
    session: state.paper.session,
    variant: state.paper.variant,
    paper: state.paper.paper,
    text: "",
    drawingData: "",
    x: 32 + state.notes.length * 18,
    y: 32 + state.notes.length * 18,
    width: isDrawing ? 340 : 280,
    height: isDrawing ? 300 : 220,
    noteMode,
    noteType: "mistake",
    ...base,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  try {
    const noteRef = await addDoc(collection(db, "users", state.user.uid, "notes"), note);
    state.notes.push({ ...note, id: noteRef.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    state.activeNoteId = noteRef.id;
    renderNotes();
    setStatus("Saved");
  } catch (error) {
    console.error("Could not create note:", error);
    showToast("Could not create note.", "error");
  }
}

function duplicateNote(noteId) {
  const note = noteById(noteId);
  if (!note) return;
  createNote(note.noteMode, {
    text: note.text,
    drawingData: note.drawingData,
    noteType: note.noteType,
    x: note.x + 24,
    y: note.y + 24,
    width: note.width,
    height: note.height
  });
}

async function deletePendingNote() {
  const noteId = state.pendingDeleteId;
  if (!noteId) return;
  try {
    await deleteDoc(doc(db, "users", state.user.uid, "notes", noteId));
    state.notes = state.notes.filter((note) => note.id !== noteId);
    state.pendingDeleteId = "";
    document.querySelector("#delete-note-modal")?.close();
    renderNotes();
    showToast("Note deleted.");
  } catch (error) {
    console.error("Could not delete note:", error);
    showToast("Could not delete note.", "error");
  }
}

function undoDrawing() {
  const canvasState = state.canvases.get(state.activeNoteId);
  if (noteById(state.activeNoteId)?.noteMode !== "drawing") return;
  if (!canvasState?.undo.length) return;
  canvasState.redo.push(canvasState.canvas.toDataURL("image/png"));
  const previous = canvasState.undo.pop();
  const note = noteById(state.activeNoteId);
  if (!note) return;
  note.drawingData = previous;
  drawStoredImage(note, canvasState.canvas, canvasState.ctx);
  debouncedSave(note.id, { drawingData: previous }, 300);
}

function redoDrawing() {
  const canvasState = state.canvases.get(state.activeNoteId);
  if (noteById(state.activeNoteId)?.noteMode !== "drawing") return;
  if (!canvasState?.redo.length) return;
  canvasState.undo.push(canvasState.canvas.toDataURL("image/png"));
  const next = canvasState.redo.pop();
  const note = noteById(state.activeNoteId);
  if (!note) return;
  note.drawingData = next;
  drawStoredImage(note, canvasState.canvas, canvasState.ctx);
  debouncedSave(note.id, { drawingData: next }, 300);
}

function clearDrawing() {
  const canvasState = state.canvases.get(state.activeNoteId);
  const note = noteById(state.activeNoteId);
  if (note?.noteMode !== "drawing") return;
  if (!canvasState || !note) return;
  pushUndo(note.id);
  canvasState.ctx.clearRect(0, 0, canvasState.canvas.width, canvasState.canvas.height);
  debouncedSave(note.id, { drawingData: "" }, 300);
}

function beginMove(event, noteId) {
  const note = noteById(noteId);
  const card = event.target.closest(".sticky-note");
  if (!note || !card) return;
  state.activeNoteId = noteId;
  updateToolbarVisibility();
  const startX = event.clientX;
  const startY = event.clientY;
  const originalX = note.x;
  const originalY = note.y;
  card.setPointerCapture(event.pointerId);

  const move = (moveEvent) => {
    note.x = Math.max(0, originalX + moveEvent.clientX - startX);
    note.y = Math.max(0, originalY + moveEvent.clientY - startY);
    card.style.left = `${note.x}px`;
    card.style.top = `${note.y}px`;
  };
  const end = () => {
    card.removeEventListener("pointermove", move);
    card.removeEventListener("pointerup", end);
    card.removeEventListener("pointercancel", end);
    debouncedSave(noteId, { x: note.x, y: note.y }, 250);
  };

  card.addEventListener("pointermove", move);
  card.addEventListener("pointerup", end);
  card.addEventListener("pointercancel", end);
}

function beginResize(event, noteId) {
  event.stopPropagation();
  const note = noteById(noteId);
  const card = event.target.closest(".sticky-note");
  const canvasState = state.canvases.get(noteId);
  if (!note || !card) return;
  state.activeNoteId = noteId;
  updateToolbarVisibility();
  const startX = event.clientX;
  const startY = event.clientY;
  const originalWidth = note.width;
  const originalHeight = note.height;
  card.setPointerCapture(event.pointerId);

  const move = (moveEvent) => {
    note.width = Math.max(240, originalWidth + moveEvent.clientX - startX);
    note.height = Math.max(240, originalHeight + moveEvent.clientY - startY);
    card.style.width = `${note.width}px`;
    card.style.height = `${note.height}px`;
    if (canvasState) resizeCanvasToNote(note, canvasState.canvas, canvasState.ctx);
  };
  const end = () => {
    card.removeEventListener("pointermove", move);
    card.removeEventListener("pointerup", end);
    card.removeEventListener("pointercancel", end);
    const updates = { width: note.width, height: note.height };
    if (canvasState) updates.drawingData = canvasState.canvas.toDataURL("image/png");
    debouncedSave(noteId, updates, 250);
  };

  card.addEventListener("pointermove", move);
  card.addEventListener("pointerup", end);
  card.addEventListener("pointercancel", end);
}

function wireEvents() {
  wireLogout();
  document.querySelector("#new-note-button")?.addEventListener("click", openNoteTypeModal);
  document.querySelector("#cancel-note-type")?.addEventListener("click", closeNoteTypeModal);
  document.querySelector("#cancel-note-type-x")?.addEventListener("click", closeNoteTypeModal);
  document.querySelector("#note-type-modal")?.addEventListener("click", (event) => {
    const mode = event.target.closest("[data-create-note-mode]")?.dataset.createNoteMode;
    if (!mode) return;
    closeNoteTypeModal();
    createNote(mode);
  });
  document.querySelector("#stroke-size")?.addEventListener("input", (event) => {
    state.strokeSize = Number(event.target.value) || 4;
  });
  document.querySelector(".notes-toolbar")?.addEventListener("click", (event) => {
    const tool = event.target.closest("[data-tool]")?.dataset.tool;
    if (tool) {
      state.tool = tool;
      document.querySelectorAll("[data-tool]").forEach((button) => button.classList.toggle("active", button.dataset.tool === tool));
    }
  });
  document.querySelector("#undo-drawing")?.addEventListener("click", undoDrawing);
  document.querySelector("#redo-drawing")?.addEventListener("click", redoDrawing);
  document.querySelector("#clear-drawing")?.addEventListener("click", clearDrawing);
  document.querySelector("#cancel-delete-note")?.addEventListener("click", () => document.querySelector("#delete-note-modal")?.close());
  document.querySelector("#cancel-delete-note-x")?.addEventListener("click", () => document.querySelector("#delete-note-modal")?.close());
  document.querySelector("#confirm-delete-note")?.addEventListener("click", deletePendingNote);

  document.querySelector("#notes-board")?.addEventListener("input", (event) => {
    const noteId = event.target.closest("[data-note-text]")?.dataset.noteText;
    if (noteId) debouncedSave(noteId, { text: event.target.value });
  });
  document.querySelector("#notes-board")?.addEventListener("change", (event) => {
    const noteId = event.target.closest("[data-note-type]")?.dataset.noteType;
    const note = noteById(noteId);
    if (!note) return;
    note.noteType = event.target.value;
    event.target.closest(".sticky-note").style.background = noteColour(note.noteType);
    debouncedSave(noteId, { noteType: note.noteType }, 250);
  });
  document.querySelector("#notes-board")?.addEventListener("click", (event) => {
    if (event.target.closest("[data-open-note-type]")) {
      openNoteTypeModal();
      return;
    }

    const noteId = event.target.closest(".sticky-note")?.dataset.noteId;
    if (noteId) {
      state.activeNoteId = noteId;
      updateToolbarVisibility();
    }
    const deleteId = event.target.closest("[data-delete-note]")?.dataset.deleteNote;
    if (deleteId) {
      state.pendingDeleteId = deleteId;
      document.querySelector("#delete-note-modal")?.showModal();
      return;
    }
    const duplicateId = event.target.closest("[data-duplicate-note]")?.dataset.duplicateNote;
    if (duplicateId) duplicateNote(duplicateId);
  });
  document.querySelector("#notes-board")?.addEventListener("pointerdown", (event) => {
    const dragId = event.target.closest("[data-drag-note]")?.dataset.dragNote;
    const resizeId = event.target.closest("[data-resize-note]")?.dataset.resizeNote;
    if (resizeId) beginResize(event, resizeId);
    else if (dragId && event.target.matches(".sticky-note-top")) beginMove(event, dragId);
  });
}

async function initNotes(user) {
  state.user = user;
  wireEvents();

  const catalogueId = params.get("catalogueId");
  const paperId = params.get("paperId");
  state.catalogue = findCatalogue(catalogueId);
  state.paper = state.catalogue?.papers.find((paper) => paper.id === paperId) || null;

  if (!state.catalogue || !state.paper) {
    showError("This paper could not be found.");
    return;
  }

  document.querySelector("#back-to-paper").href = paperBackUrl();
  document.querySelector("#notes-subject-meta").textContent = `${state.catalogue.data.subject} · ${state.catalogue.data.qualification} · ${state.catalogue.data.syllabusCode || "IAL"}`;
  document.querySelector("#notes-paper-meta").textContent = `${state.paper.year} · ${state.paper.session} · ${variantLabel(state.paper)} · ${componentLabel(state.paper)}`;

  try {
    await loadNotes();
    document.querySelector("#notes-loading")?.classList.add("hidden");
    document.querySelector("#notes-workspace")?.classList.remove("hidden");
    renderNotes();
  } catch (error) {
    console.error("Could not load notes:", error);
    showError("Could not load notes.");
  }
}

requireAuth(initNotes);
