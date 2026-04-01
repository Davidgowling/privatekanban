// --------------------
// UTILITIES
// --------------------

async function postJSON(url, payload = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    let message = "Request failed.";
    try { const d = await response.json(); message = d.error || message; } catch (_) {}
    throw new Error(message);
  }
  return response.json();
}

// --------------------
// TOASTS
// --------------------

function showToast(message, type = "error") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast-visible"));
  setTimeout(() => {
    toast.classList.remove("toast-visible");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
  }, 3500);
}

// --------------------
// HELPERS
// --------------------

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDueDate(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((date - today) / (1000 * 60 * 60 * 24));
  const label = date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  let cls = "due-badge";
  if (diff < 0) cls += " due-overdue";
  else if (diff <= 2) cls += " due-soon";
  return { label, cls };
}

function updateColumnCount(columnEl) {
  const count = columnEl.querySelector(".count");
  const list = columnEl.querySelector(".card-list");
  if (count && list) count.textContent = list.querySelectorAll(".card").length;
}

function rgbToHex(rgb) {
  const match = rgb.match(/\d+/g);
  if (!match || match.length < 3) return "";
  return "#" + match.slice(0, 3).map(n => Number(n).toString(16).padStart(2, "0")).join("");
}

// --------------------
// MODULE STATE
// --------------------

let editingCardEl = null;
let currentChecklistItems = [];
let draggingColumn = null;
let draggingBoard = null;

// --------------------
// HAMBURGER MENU
// --------------------

function wireMenu() {
  const trigger = document.getElementById("menuTrigger");
  const menu = document.getElementById("mainMenu");
  if (!trigger || !menu) return;

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target) && !trigger.contains(e.target)) {
      menu.classList.add("hidden");
      resetAddBoardForm();
    }
  });

  // Add board in menu
  const addBoardItem = document.getElementById("menuAddBoard");
  const addBoardForm = document.getElementById("menuAddBoardForm");
  const addBoardSubmit = document.getElementById("menuAddBoardSubmit");
  const addBoardCancel = document.getElementById("menuAddBoardCancel");
  const newBoardInput = document.getElementById("newBoardName");

  function resetAddBoardForm() {
    addBoardForm?.classList.add("hidden");
    addBoardItem?.classList.remove("hidden");
    if (newBoardInput) newBoardInput.value = "";
  }

  addBoardItem?.addEventListener("click", () => {
    addBoardItem.classList.add("hidden");
    addBoardForm?.classList.remove("hidden");
    newBoardInput?.focus();
  });

  addBoardCancel?.addEventListener("click", resetAddBoardForm);

  addBoardSubmit?.addEventListener("click", async () => {
    const name = newBoardInput?.value.trim();
    if (!name) return;
    addBoardSubmit.disabled = true;
    try {
      const data = await postJSON("/boards", { name });
      if (newBoardInput) newBoardInput.value = "";
      resetAddBoardForm();
      menu.classList.add("hidden");
      const wrap = document.querySelector(".boards-wrap");
      wrap.appendChild(buildBoardEl(data.board));
      showToast("Board created.", "success");
    } catch (err) { showToast(err.message); }
    finally { addBoardSubmit.disabled = false; }
  });

  newBoardInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addBoardSubmit?.click(); }
    if (e.key === "Escape") resetAddBoardForm();
  });

  // Archive
  document.getElementById("menuArchive")?.addEventListener("click", () => {
    menu.classList.add("hidden");
    openArchiveModal();
  });

  // Settings
  document.getElementById("menuSettings")?.addEventListener("click", () => {
    menu.classList.add("hidden");
    document.getElementById("settingsModal")?.classList.remove("hidden");
  });
}

// --------------------
// SETTINGS MODAL
// --------------------

function wireSettingsModal() {
  const modal = document.getElementById("settingsModal");
  if (!modal) return;

  document.getElementById("closeSettings")?.addEventListener("click", () => {
    modal.classList.add("hidden");
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) {
      modal.classList.add("hidden");
    }
  });

  document.getElementById("deleteAccountBtn")?.addEventListener("click", async () => {
    if (!confirm("Permanently delete your account and all data? This cannot be undone.")) return;
    if (!confirm("Are you sure? All your boards, columns and cards will be gone forever.")) return;
    try {
      await postJSON("/account/delete");
      window.location.href = "/login";
    } catch (err) { showToast(err.message); }
  });
}

// --------------------
// ARCHIVE MODAL
// --------------------

function openArchiveModal() {
  const modal = document.getElementById("archiveModal");
  const content = document.getElementById("archiveContent");
  if (!modal || !content) return;

  content.innerHTML = '<p class="loading-text">Loading…</p>';
  modal.classList.remove("hidden");

  fetch("/api/archive")
    .then(r => r.json())
    .then(data => {
      if (!data.cards || data.cards.length === 0) {
        content.innerHTML = '<p class="archive-empty">No archived cards.</p>';
        return;
      }

      // Group by board
      const byBoard = {};
      for (const card of data.cards) {
        if (!byBoard[card.board_id]) byBoard[card.board_id] = { name: card.board_name, cards: [] };
        byBoard[card.board_id].cards.push(card);
      }

      content.innerHTML = "";
      for (const group of Object.values(byBoard)) {
        const section = document.createElement("div");
        section.className = "archive-board-group";

        const heading = document.createElement("div");
        heading.className = "archive-board-name";
        heading.textContent = group.name;
        section.appendChild(heading);

        for (const card of group.cards) {
          const item = document.createElement("div");
          item.className = "archive-card-item";
          item.dataset.cardId = card.id;
          if (card.color) item.style.borderLeftColor = card.color;

          const info = document.createElement("div");
          info.className = "archive-card-info";
          info.innerHTML = `<strong>${escHtml(card.title)}</strong><span class="archive-card-col">in ${escHtml(card.column_name)}</span>`;

          const actions = document.createElement("div");
          actions.className = "archive-card-actions";

          const restoreBtn = document.createElement("button");
          restoreBtn.type = "button";
          restoreBtn.className = "flat-btn";
          restoreBtn.textContent = "Restore";
          restoreBtn.addEventListener("click", async () => {
            try {
              await postJSON(`/cards/${card.id}/restore`);
              item.remove();
              showToast("Card restored.", "success");
              // Reload so the card appears in the correct column
              setTimeout(() => window.location.reload(), 800);
            } catch (err) { showToast(err.message); }
          });

          const deleteBtn = document.createElement("button");
          deleteBtn.type = "button";
          deleteBtn.className = "flat-btn danger";
          deleteBtn.textContent = "Delete";
          deleteBtn.addEventListener("click", async () => {
            if (!confirm("Permanently delete this card? This cannot be undone.")) return;
            try {
              await postJSON(`/cards/${card.id}/delete`);
              item.remove();
              if (content.querySelectorAll(".archive-card-item").length === 0) {
                content.innerHTML = '<p class="archive-empty">No archived cards.</p>';
              }
              showToast("Card deleted.", "success");
            } catch (err) { showToast(err.message); }
          });

          actions.appendChild(restoreBtn);
          actions.appendChild(deleteBtn);
          item.appendChild(info);
          item.appendChild(actions);
          section.appendChild(item);
        }
        content.appendChild(section);
      }
    })
    .catch(() => {
      content.innerHTML = '<p class="archive-empty">Failed to load archive.</p>';
    });
}

function wireArchiveModal() {
  const modal = document.getElementById("archiveModal");
  if (!modal) return;

  document.getElementById("closeArchiveModal")?.addEventListener("click", () => {
    modal.classList.add("hidden");
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });
}

// --------------------
// DOM BUILDERS
// --------------------

function buildChecklistPreview(items) {
  const total = items.length;
  const done = items.filter(i => i.done).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const div = document.createElement("div");
  div.className = "card-checklist-preview";
  div.innerHTML = `
    <span class="checklist-mini-count">${done}/${total}</span>
    <div class="checklist-mini-bar">
      <div class="checklist-mini-fill" style="width:${pct}%;${pct === 100 ? "background:#22c55e" : ""}"></div>
    </div>
  `;
  return div;
}

function buildCardEl(card) {
  const article = document.createElement("article");
  article.className = "card";
  article.draggable = true;
  article.dataset.cardId = card.id;
  article.dataset.columnId = card.column_id;
  article.dataset.checklist = JSON.stringify(card.checklist || []);
  if (card.color) article.style.borderLeftColor = card.color;

  const top = document.createElement("div");
  top.className = "card-top";

  const title = document.createElement("strong");
  title.className = "card-title";
  title.textContent = card.title;

  const icons = document.createElement("div");
  icons.className = "card-icons";

  const editIc = document.createElement("i");
  editIc.className = "ic edit-card";
  editIc.title = "Edit";
  editIc.innerHTML = "&#9998;";

  const archiveIc = document.createElement("i");
  archiveIc.className = "ic archive-card";
  archiveIc.title = "Archive";
  archiveIc.innerHTML = "&#10005;";

  icons.appendChild(editIc);
  icons.appendChild(archiveIc);
  top.appendChild(title);
  top.appendChild(icons);
  article.appendChild(top);

  if (card.description) {
    const desc = document.createElement("p");
    desc.className = "card-desc";
    desc.textContent = card.description;
    article.appendChild(desc);
  }

  const checklist = card.checklist || [];
  if (checklist.length > 0) {
    article.appendChild(buildChecklistPreview(checklist));
  }

  if (card.due_date) {
    const info = formatDueDate(card.due_date);
    if (info) {
      const badge = document.createElement("span");
      badge.className = info.cls;
      badge.textContent = info.label;
      article.dataset.dueDate = card.due_date;
      article.appendChild(badge);
    }
  }

  wireCard(article);
  return article;
}

function buildColumnEl(column) {
  const div = document.createElement("div");
  div.className = "column";
  div.dataset.columnId = column.id;

  div.innerHTML = `
    <div class="col-header">
      <span class="drag-handle col-drag-handle" title="Drag to reorder">&#10303;</span>
      <span class="col-name">${escHtml(column.name)}</span>
      <div class="col-controls">
        <i class="ic rename-column" title="Rename" data-column-id="${column.id}" data-column-name="${escHtml(column.name)}">&#9998;</i>
        <i class="ic del delete-column" title="Delete" data-column-id="${column.id}">&#10005;</i>
        <i class="ic plus add-card-toggle" title="Add card">&#43;</i>
        <span class="count">0</span>
      </div>
    </div>
    <form class="add-card-form" data-column-id="${column.id}" style="display:none;">
      <input type="text" name="title" placeholder="Card title…" required />
      <textarea name="description" placeholder="Notes (optional)"></textarea>
      <div class="card-form-row">
        <input type="date" name="due_date" />
        <select name="color">
          <option value="">No label</option>
          <option value="#6366f1">Indigo</option>
          <option value="#a855f7">Violet</option>
          <option value="#ef4444">Red</option>
          <option value="#f97316">Orange</option>
          <option value="#eab308">Yellow</option>
          <option value="#22c55e">Green</option>
          <option value="#3b82f6">Blue</option>
        </select>
      </div>
      <div class="form-btns">
        <button type="submit" class="flat-btn">Add card</button>
        <button type="button" class="flat-btn muted cancel-add-card">Cancel</button>
      </div>
    </form>
    <div class="card-list" data-column-id="${column.id}"></div>
  `;

  wireColumnControls(div);
  wireColumnDrag(div);
  wireAddCardToggle(div);
  wireAddCardForm(div.querySelector(".add-card-form"));
  wireDragTarget(div.querySelector(".card-list"));
  return div;
}

function buildBoardEl(board) {
  const section = document.createElement("section");
  section.className = "board-section";
  section.dataset.boardId = board.id;
  const colCount = Math.max(board.columns.length, 1);

  section.innerHTML = `
    <div class="board-header">
      <div class="board-title-row">
        <span class="drag-handle board-drag-handle" title="Drag to reorder">&#10303;</span>
        <h2 class="board-title">${escHtml(board.name)}</h2>
        <i class="ic rename-board" title="Rename board" data-board-id="${board.id}" data-board-name="${escHtml(board.name)}">&#9998;</i>
        <i class="ic del delete-board" title="Delete board" data-board-id="${board.id}">&#10005;</i>
      </div>
      <form class="board-col-form" data-board-id="${board.id}">
        <input type="text" name="name" class="flat-input" placeholder="New column" required />
        <button type="submit" class="flat-btn">Add column</button>
      </form>
    </div>
    <div class="columns-grid" style="grid-template-columns: repeat(${colCount}, minmax(200px, 1fr));"></div>
  `;

  wireBoardControls(section);
  wireBoardDrag(section);
  wireAddColumnForm(section.querySelector(".board-col-form"));
  wireColumnDropTarget(section.querySelector(".columns-grid"));

  const grid = section.querySelector(".columns-grid");
  for (const col of board.columns) grid.appendChild(buildColumnEl(col));
  return section;
}

// --------------------
// ADD CARD TOGGLE
// --------------------

function wireAddCardToggle(columnEl) {
  const toggle = columnEl.querySelector(".add-card-toggle");
  const form = columnEl.querySelector(".add-card-form");
  const cancel = columnEl.querySelector(".cancel-add-card");
  if (!toggle || !form) return;

  toggle.addEventListener("click", () => {
    const isHidden = form.style.display === "none" || !form.style.display;
    form.style.display = isHidden ? "grid" : "none";
    if (isHidden) form.querySelector("input[name='title']").focus();
  });

  cancel?.addEventListener("click", () => {
    form.style.display = "none";
    form.reset();
  });
}

// --------------------
// BOARD CONTROLS + DRAG
// --------------------

function wireBoardControls(boardEl) {
  const renameIc = boardEl.querySelector(".rename-board");
  const deleteIc = boardEl.querySelector(".delete-board");

  renameIc?.addEventListener("click", async () => {
    const boardId = renameIc.dataset.boardId;
    const newName = prompt("Rename board:", renameIc.dataset.boardName);
    if (newName === null) return;
    if (!newName.trim()) { showToast("Board name cannot be empty."); return; }
    try {
      await postJSON(`/boards/${boardId}/update`, { name: newName.trim() });
      boardEl.querySelector(".board-title").textContent = newName.trim();
      renameIc.dataset.boardName = newName.trim();
      showToast("Board renamed.", "success");
    } catch (err) { showToast(err.message); }
  });

  deleteIc?.addEventListener("click", async () => {
    if (!confirm("Delete this board and everything in it?")) return;
    try {
      await postJSON(`/boards/${deleteIc.dataset.boardId}/delete`);
      boardEl.remove();
      showToast("Board deleted.", "success");
    } catch (err) { showToast(err.message); }
  });
}

function wireBoardDrag(boardEl) {
  const handle = boardEl.querySelector(".board-drag-handle");
  if (!handle) return;

  let fromHandle = false;

  handle.addEventListener("mousedown", () => {
    fromHandle = true;
    const onUp = () => { fromHandle = false; window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mouseup", onUp);
  });

  boardEl.addEventListener("dragstart", (e) => {
    if (!fromHandle) { e.preventDefault(); return; }
    fromHandle = false;
    draggingBoard = boardEl;
    e.dataTransfer.effectAllowed = "move";
    boardEl.classList.add("board-dragging");
    requestAnimationFrame(() => boardEl.style.opacity = "0.4");
  });

  boardEl.addEventListener("dragend", () => {
    fromHandle = false;
    draggingBoard = null;
    boardEl.classList.remove("board-dragging");
    boardEl.style.opacity = "";
    commitBoardReorder();
  });
}

function wireBoardsWrapDropTarget(wrap) {
  wrap.addEventListener("dragover", (e) => {
    if (!draggingBoard) return;
    e.preventDefault();
    const after = getBoardAfterElement(wrap, e.clientY);
    if (after == null) wrap.appendChild(draggingBoard);
    else wrap.insertBefore(draggingBoard, after);
  });
}

function getBoardAfterElement(wrap, y) {
  const boards = [...wrap.querySelectorAll(".board-section:not(.board-dragging)")];
  return boards.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function commitBoardReorder() {
  const wrap = document.querySelector(".boards-wrap");
  if (!wrap) return;
  const boards = [...wrap.querySelectorAll(".board-section")];
  const order = boards.map((b, i) => ({ id: Number(b.dataset.boardId), position: i }));
  try {
    await postJSON("/boards/reorder", { order });
  } catch (err) { showToast(err.message); }
}

// --------------------
// COLUMN CONTROLS + DRAG
// --------------------

function wireColumnControls(columnEl) {
  const renameIc = columnEl.querySelector(".rename-column");
  const deleteIc = columnEl.querySelector(".delete-column");

  renameIc?.addEventListener("click", async () => {
    const columnId = renameIc.dataset.columnId;
    const newName = prompt("Rename column:", renameIc.dataset.columnName);
    if (newName === null) return;
    if (!newName.trim()) { showToast("Column name cannot be empty."); return; }
    try {
      await postJSON(`/columns/${columnId}/update`, { name: newName.trim() });
      columnEl.querySelector(".col-name").textContent = newName.trim();
      renameIc.dataset.columnName = newName.trim();
      showToast("Column renamed.", "success");
    } catch (err) { showToast(err.message); }
  });

  deleteIc?.addEventListener("click", async () => {
    if (!confirm("Delete this column and all cards inside it?")) return;
    try {
      await postJSON(`/columns/${deleteIc.dataset.columnId}/delete`);
      const boardEl = columnEl.closest(".board-section");
      columnEl.remove();
      if (boardEl) {
        const grid = boardEl.querySelector(".columns-grid");
        const remaining = grid.querySelectorAll(".column").length;
        grid.style.gridTemplateColumns = `repeat(${Math.max(remaining, 1)}, minmax(200px, 1fr))`;
      }
      showToast("Column deleted.", "success");
    } catch (err) { showToast(err.message); }
  });
}

function wireColumnDrag(columnEl) {
  const handle = columnEl.querySelector(".col-drag-handle");
  if (!handle) return;

  let fromHandle = false;

  handle.addEventListener("mousedown", () => {
    fromHandle = true;
    const onUp = () => { fromHandle = false; window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mouseup", onUp);
  });

  columnEl.addEventListener("dragstart", (e) => {
    if (!fromHandle) { e.preventDefault(); return; }
    fromHandle = false;
    draggingColumn = columnEl;
    e.dataTransfer.effectAllowed = "move";
    columnEl.classList.add("col-dragging");
    requestAnimationFrame(() => columnEl.style.opacity = "0.4");
  });

  columnEl.addEventListener("dragend", () => {
    fromHandle = false;
    const grid = columnEl.closest(".columns-grid");
    draggingColumn = null;
    columnEl.classList.remove("col-dragging");
    columnEl.style.opacity = "";
    commitColumnReorder(grid);
  });
}

function wireColumnDropTarget(grid) {
  if (!grid) return;
  grid.addEventListener("dragover", (e) => {
    if (!draggingColumn) return;
    e.preventDefault();
    const after = getColumnAfterElement(grid, e.clientX);
    if (after == null) grid.appendChild(draggingColumn);
    else grid.insertBefore(draggingColumn, after);
  });
}

function getColumnAfterElement(grid, x) {
  const cols = [...grid.querySelectorAll(".column:not(.col-dragging)")];
  return cols.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = x - box.left - box.width / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function commitColumnReorder(grid) {
  if (!grid) return;
  const columns = [...grid.querySelectorAll(".column")];
  const order = columns.map((col, i) => ({ id: Number(col.dataset.columnId), position: i }));
  try {
    await postJSON("/columns/reorder", { order });
  } catch (err) { showToast(err.message); }
}

function wireAddColumnForm(form) {
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const boardId = form.dataset.boardId;
    const input = form.querySelector('input[name="name"]');
    const name = input.value.trim();
    if (!name) return;
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const data = await postJSON("/columns", { boardId, name });
      input.value = "";
      const boardSection = form.closest(".board-section");
      const grid = boardSection.querySelector(".columns-grid");
      const newCol = buildColumnEl(data.column);
      grid.appendChild(newCol);
      const count = grid.querySelectorAll(".column").length;
      grid.style.gridTemplateColumns = `repeat(${count}, minmax(200px, 1fr))`;
      showToast("Column added.", "success");
    } catch (err) { showToast(err.message); }
    finally { btn.disabled = false; }
  });
}

// --------------------
// CARD CONTROLS
// --------------------

function wireCard(cardEl) {
  cardEl.querySelector(".edit-card")?.addEventListener("click", () => openEditModal(cardEl));

  cardEl.querySelector(".archive-card")?.addEventListener("click", async () => {
    try {
      await postJSON(`/cards/${cardEl.dataset.cardId}/archive`);
      const columnEl = cardEl.closest(".column");
      cardEl.remove();
      if (columnEl) updateColumnCount(columnEl);
      showToast("Card archived.", "success");
    } catch (err) { showToast(err.message); }
  });

  cardEl.addEventListener("dragstart", () => cardEl.classList.add("dragging"));
  cardEl.addEventListener("dragend", () => cardEl.classList.remove("dragging"));
  wireTouchDrag(cardEl);
}

function wireAddCardForm(form) {
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const columnId = form.dataset.columnId;
    const formData = new FormData(form);
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const data = await postJSON("/cards", {
        columnId,
        title: formData.get("title"),
        description: formData.get("description"),
        due_date: formData.get("due_date") || null,
        color: formData.get("color") || null
      });
      form.reset();
      form.style.display = "none";
      const columnEl = form.closest(".column");
      columnEl.querySelector(".card-list").appendChild(buildCardEl(data.card));
      updateColumnCount(columnEl);
    } catch (err) { showToast(err.message); }
    finally { btn.disabled = false; }
  });
}

// --------------------
// CHECKLIST HELPERS
// --------------------

function updateChecklistProgress(items) {
  const total = items.length;
  const done = items.filter(i => i.done).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const progressText = document.getElementById("checklistProgressText");
  if (progressText) progressText.textContent = total > 0 ? `${done}/${total}` : "";

  const barOuter = document.getElementById("checklistBarOuter");
  if (barOuter) barOuter.classList.toggle("hidden", total === 0);

  const fill = document.getElementById("checklistBarFill");
  if (fill) {
    fill.style.width = `${pct}%`;
    fill.style.background = pct === 100 ? "#22c55e" : "#6366f1";
  }
}

function updateCardChecklistPreview(cardEl, items) {
  let preview = cardEl.querySelector(".card-checklist-preview");
  if (items.length === 0) {
    if (preview) preview.remove();
    return;
  }
  const total = items.length;
  const done = items.filter(i => i.done).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  if (!preview) {
    preview = document.createElement("div");
    preview.className = "card-checklist-preview";
    const badge = cardEl.querySelector(".due-badge");
    if (badge) cardEl.insertBefore(preview, badge);
    else cardEl.appendChild(preview);
  }
  preview.innerHTML = `
    <span class="checklist-mini-count">${done}/${total}</span>
    <div class="checklist-mini-bar">
      <div class="checklist-mini-fill" style="width:${pct}%;${pct === 100 ? "background:#22c55e" : ""}"></div>
    </div>
  `;
}

function syncChecklistToCard() {
  if (!editingCardEl) return;
  editingCardEl.dataset.checklist = JSON.stringify(currentChecklistItems);
  updateCardChecklistPreview(editingCardEl, currentChecklistItems);
}

function buildChecklistItemEl(item) {
  const div = document.createElement("div");
  div.className = "checklist-item";
  div.dataset.itemId = item.id;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = item.done;
  checkbox.className = "checklist-checkbox";

  const label = document.createElement("span");
  label.className = "checklist-item-text" + (item.done ? " done" : "");
  label.textContent = item.text;

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "checklist-del-btn";
  delBtn.innerHTML = "&#10005;";
  delBtn.title = "Remove";

  div.appendChild(checkbox);
  div.appendChild(label);
  div.appendChild(delBtn);

  checkbox.addEventListener("change", async () => {
    try {
      const data = await postJSON(`/checklist/${item.id}/toggle`);
      item.done = data.done;
      label.className = "checklist-item-text" + (item.done ? " done" : "");
      updateChecklistProgress(currentChecklistItems);
      syncChecklistToCard();
    } catch (err) {
      checkbox.checked = !checkbox.checked;
      showToast(err.message);
    }
  });

  delBtn.addEventListener("click", async () => {
    try {
      await postJSON(`/checklist/${item.id}/delete`);
      const idx = currentChecklistItems.findIndex(i => i.id === item.id);
      if (idx !== -1) currentChecklistItems.splice(idx, 1);
      div.remove();
      updateChecklistProgress(currentChecklistItems);
      syncChecklistToCard();
    } catch (err) { showToast(err.message); }
  });

  return div;
}

function renderChecklistItems(items) {
  const container = document.getElementById("checklistItems");
  if (!container) return;
  container.innerHTML = "";
  for (const item of items) {
    container.appendChild(buildChecklistItemEl(item));
  }
}

// --------------------
// EDIT MODAL
// --------------------

function openEditModal(cardEl) {
  const modal = document.getElementById("editModal");
  if (!modal) return;

  editingCardEl = cardEl;
  document.getElementById("editCardId").value = cardEl.dataset.cardId;
  document.getElementById("editTitle").value = cardEl.querySelector(".card-title")?.textContent?.trim() || "";
  document.getElementById("editDescription").value = cardEl.querySelector(".card-desc")?.textContent?.trim() || "";

  const dueDateInput = document.getElementById("editDueDate");
  if (dueDateInput) dueDateInput.value = cardEl.dataset.dueDate || "";

  const colorSelect = document.getElementById("editColor");
  if (colorSelect) colorSelect.value = cardEl.style.borderLeftColor ? rgbToHex(cardEl.style.borderLeftColor) : "";

  // Load checklist
  try {
    currentChecklistItems = JSON.parse(cardEl.dataset.checklist || "[]");
  } catch (_) {
    currentChecklistItems = [];
  }
  renderChecklistItems(currentChecklistItems);
  updateChecklistProgress(currentChecklistItems);

  // Clear add input
  const addInput = document.getElementById("newChecklistText");
  if (addInput) addInput.value = "";

  modal.classList.remove("hidden");
  document.getElementById("editTitle").focus();
}

function wireEditModal() {
  const modal = document.getElementById("editModal");
  const editForm = document.getElementById("editCardForm");
  if (!modal || !editForm) return;

  const closeModal = () => {
    modal.classList.add("hidden");
    editingCardEl = null;
    currentChecklistItems = [];
  };

  document.getElementById("closeModal")?.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
  });

  // Add checklist item
  const addChecklistBtn = document.getElementById("addChecklistBtn");
  const newChecklistText = document.getElementById("newChecklistText");

  const doAddChecklistItem = async () => {
    const text = newChecklistText?.value.trim();
    if (!text || !editingCardEl) return;
    const cardId = document.getElementById("editCardId").value;
    addChecklistBtn.disabled = true;
    try {
      const data = await postJSON(`/cards/${cardId}/checklist`, { text });
      if (newChecklistText) newChecklistText.value = "";
      currentChecklistItems.push(data.item);
      const container = document.getElementById("checklistItems");
      container?.appendChild(buildChecklistItemEl(data.item));
      updateChecklistProgress(currentChecklistItems);
      syncChecklistToCard();
    } catch (err) { showToast(err.message); }
    finally { addChecklistBtn.disabled = false; }
  };

  addChecklistBtn?.addEventListener("click", doAddChecklistItem);
  newChecklistText?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); doAddChecklistItem(); }
  });

  // Archive from modal
  document.getElementById("archiveFromModal")?.addEventListener("click", async () => {
    if (!editingCardEl) return;
    const cardId = document.getElementById("editCardId").value;
    try {
      await postJSON(`/cards/${cardId}/archive`);
      const columnEl = editingCardEl.closest(".column");
      editingCardEl.remove();
      if (columnEl) updateColumnCount(columnEl);
      closeModal();
      showToast("Card archived.", "success");
    } catch (err) { showToast(err.message); }
  });

  // Permanent delete from modal
  document.getElementById("deletePermFromModal")?.addEventListener("click", async () => {
    if (!confirm("Permanently delete this card? This cannot be undone.")) return;
    const cardId = document.getElementById("editCardId").value;
    try {
      await postJSON(`/cards/${cardId}/delete`);
      const columnEl = editingCardEl?.closest(".column");
      editingCardEl?.remove();
      if (columnEl) updateColumnCount(columnEl);
      closeModal();
      showToast("Card deleted.", "success");
    } catch (err) { showToast(err.message); }
  });

  // Save card
  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const cardId = document.getElementById("editCardId").value;
    const title = document.getElementById("editTitle").value;
    const description = document.getElementById("editDescription").value;
    const due_date = document.getElementById("editDueDate")?.value || null;
    const color = document.getElementById("editColor")?.value || null;

    const btn = editForm.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      await postJSON(`/cards/${cardId}/update`, { title, description, due_date, color });

      const cardEl = editingCardEl;
      if (cardEl) {
        cardEl.querySelector(".card-title").textContent = title;

        let desc = cardEl.querySelector(".card-desc");
        if (description) {
          if (!desc) {
            desc = document.createElement("p");
            desc.className = "card-desc";
            const anchor = cardEl.querySelector(".card-checklist-preview") || cardEl.querySelector(".due-badge");
            if (anchor) cardEl.insertBefore(desc, anchor);
            else cardEl.appendChild(desc);
          }
          desc.textContent = description;
        } else if (desc) {
          desc.remove();
        }

        let badge = cardEl.querySelector(".due-badge");
        if (due_date) {
          const info = formatDueDate(due_date);
          if (info) {
            if (!badge) { badge = document.createElement("span"); cardEl.appendChild(badge); }
            badge.className = info.cls;
            badge.textContent = info.label;
            cardEl.dataset.dueDate = due_date;
          }
        } else if (badge) {
          badge.remove();
          delete cardEl.dataset.dueDate;
        }

        cardEl.style.borderLeftColor = color || "";
      }

      closeModal();
      showToast("Card saved.", "success");
    } catch (err) { showToast(err.message); }
    finally { btn.disabled = false; }
  });
}

// --------------------
// MOUSE DRAG AND DROP (CARDS)
// --------------------

function wireDragTarget(listEl) {
  listEl.addEventListener("dragover", (e) => {
    if (draggingColumn || draggingBoard) return;
    e.preventDefault();
    const dragging = document.querySelector(".dragging");
    if (!dragging) return;
    const after = getDragAfterElement(listEl, e.clientY);
    if (after == null) listEl.appendChild(dragging);
    else listEl.insertBefore(dragging, after);
  });

  listEl.addEventListener("drop", async (e) => {
    if (draggingColumn || draggingBoard) return;
    e.preventDefault();
    const dragging = document.querySelector(".dragging");
    if (!dragging) return;
    await commitCardMove(dragging, listEl);
  });
}

function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll(".card:not(.dragging)")];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function commitCardMove(cardEl, listEl) {
  const targetColumnId = listEl.dataset.columnId;
  const cards = [...listEl.querySelectorAll(".card")];
  const newPosition = cards.findIndex(c => c.dataset.cardId === cardEl.dataset.cardId);
  try {
    await postJSON(`/cards/${cardEl.dataset.cardId}/move`, { targetColumnId, newPosition });
    cardEl.dataset.columnId = targetColumnId;
    document.querySelectorAll(".column").forEach(updateColumnCount);
  } catch (err) { showToast(err.message); }
}

// --------------------
// TOUCH DRAG AND DROP (CARDS)
// --------------------

function wireTouchDrag(cardEl) {
  let touchClone = null;
  let lastList = null;
  let offsetX = 0;
  let offsetY = 0;

  cardEl.addEventListener("touchstart", (e) => {
    const touch = e.touches[0];
    const rect = cardEl.getBoundingClientRect();
    offsetX = touch.clientX - rect.left;
    offsetY = touch.clientY - rect.top;

    touchClone = cardEl.cloneNode(true);
    touchClone.style.cssText = `
      position:fixed; width:${rect.width}px;
      left:${rect.left}px; top:${rect.top}px;
      opacity:0.85; pointer-events:none; z-index:9999;
      box-shadow:0 8px 24px rgba(30,27,75,0.18);
      border-radius:5px; background:#fff;
      transform:rotate(1deg);
    `;
    document.body.appendChild(touchClone);
    cardEl.classList.add("dragging");
  }, { passive: true });

  cardEl.addEventListener("touchmove", (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    touchClone.style.left = `${touch.clientX - offsetX}px`;
    touchClone.style.top = `${touch.clientY - offsetY}px`;

    touchClone.style.display = "none";
    const elBelow = document.elementFromPoint(touch.clientX, touch.clientY);
    touchClone.style.display = "";

    const list = elBelow?.closest(".card-list");
    if (!list) return;
    lastList = list;

    const after = getDragAfterElement(list, touch.clientY);
    if (after == null) list.appendChild(cardEl);
    else list.insertBefore(cardEl, after);
  }, { passive: false });

  cardEl.addEventListener("touchend", async () => {
    cardEl.classList.remove("dragging");
    if (touchClone) { touchClone.remove(); touchClone = null; }
    if (lastList) { await commitCardMove(cardEl, lastList); lastList = null; }
  });
}

// --------------------
// INIT
// --------------------

function initPage() {
  wireMenu();
  wireSettingsModal();
  wireArchiveModal();
  wireEditModal();

  const wrap = document.querySelector(".boards-wrap");
  if (wrap) wireBoardsWrapDropTarget(wrap);

  document.querySelectorAll(".board-section").forEach(boardEl => {
    wireBoardControls(boardEl);
    wireBoardDrag(boardEl);
    wireColumnDropTarget(boardEl.querySelector(".columns-grid"));
  });

  document.querySelectorAll(".board-col-form").forEach(wireAddColumnForm);

  document.querySelectorAll(".column").forEach(colEl => {
    wireColumnControls(colEl);
    wireColumnDrag(colEl);
    wireAddCardToggle(colEl);
    wireDragTarget(colEl.querySelector(".card-list"));
  });

  document.querySelectorAll(".add-card-form").forEach(wireAddCardForm);
  document.querySelectorAll(".card").forEach(wireCard);
}

initPage();
