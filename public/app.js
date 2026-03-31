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

  // Close on outside click
  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target) && !trigger.contains(e.target)) {
      menu.classList.add("hidden");
      // Reset add board form
      document.getElementById("menuAddBoardForm")?.classList.add("hidden");
      document.getElementById("menuAddBoard")?.classList.remove("hidden");
    }
  });

  // Add board in menu
  const addBoardItem = document.getElementById("menuAddBoard");
  const addBoardForm = document.getElementById("menuAddBoardForm");
  const addBoardSubmit = document.getElementById("menuAddBoardSubmit");
  const addBoardCancel = document.getElementById("menuAddBoardCancel");
  const newBoardInput = document.getElementById("newBoardName");

  addBoardItem?.addEventListener("click", () => {
    addBoardItem.classList.add("hidden");
    addBoardForm?.classList.remove("hidden");
    newBoardInput?.focus();
  });

  addBoardCancel?.addEventListener("click", () => {
    addBoardForm?.classList.add("hidden");
    addBoardItem?.classList.remove("hidden");
    if (newBoardInput) newBoardInput.value = "";
  });

  addBoardSubmit?.addEventListener("click", async () => {
    const name = newBoardInput?.value.trim();
    if (!name) return;
    addBoardSubmit.disabled = true;
    try {
      const data = await postJSON("/boards", { name });
      if (newBoardInput) newBoardInput.value = "";
      addBoardForm?.classList.add("hidden");
      addBoardItem?.classList.remove("hidden");
      menu.classList.add("hidden");
      document.querySelector(".boards-wrap").appendChild(buildBoardEl(data.board));
      showToast("Board created.", "success");
    } catch (err) { showToast(err.message); }
    finally { addBoardSubmit.disabled = false; }
  });

  // Allow Enter key in board name input
  newBoardInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addBoardSubmit?.click(); }
    if (e.key === "Escape") { addBoardCancel?.click(); }
  });

  // Account deletion
  document.getElementById("deleteAccountBtn")?.addEventListener("click", async () => {
    menu.classList.add("hidden");
    if (!confirm("Permanently delete your account and all data? This cannot be undone.")) return;
    if (!confirm("Are you sure? Everything will be gone forever.")) return;
    try {
      await postJSON("/account/delete");
      window.location.href = "/login";
    } catch (err) { showToast(err.message); }
  });
}

// --------------------
// DOM BUILDERS
// --------------------

function buildCardEl(card) {
  const article = document.createElement("article");
  article.className = "card";
  article.draggable = true;
  article.dataset.cardId = card.id;
  article.dataset.columnId = card.column_id;
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

  const delIc = document.createElement("i");
  delIc.className = "ic del delete-card";
  delIc.title = "Delete";
  delIc.innerHTML = "&#10005;";

  icons.appendChild(editIc);
  icons.appendChild(delIc);
  top.appendChild(title);
  top.appendChild(icons);
  article.appendChild(top);

  if (card.description) {
    const desc = document.createElement("p");
    desc.className = "card-desc";
    desc.textContent = card.description;
    article.appendChild(desc);
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
  wireAddColumnForm(section.querySelector(".board-col-form"));

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
// BOARD CONTROLS
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

// --------------------
// COLUMN CONTROLS
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
      const grid = form.closest(".board-section").querySelector(".columns-grid");
      grid.appendChild(buildColumnEl(data.column));
      grid.style.gridTemplateColumns = `repeat(${grid.querySelectorAll(".column").length}, minmax(200px, 1fr))`;
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

  cardEl.querySelector(".delete-card")?.addEventListener("click", async () => {
    if (!confirm("Delete this card?")) return;
    try {
      await postJSON(`/cards/${cardEl.dataset.cardId}/delete`);
      const columnEl = cardEl.closest(".column");
      cardEl.remove();
      if (columnEl) updateColumnCount(columnEl);
      showToast("Card deleted.", "success");
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
// EDIT MODAL
// --------------------

function openEditModal(cardEl) {
  const modal = document.getElementById("editModal");
  if (!modal) return;
  document.getElementById("editCardId").value = cardEl.dataset.cardId;
  document.getElementById("editTitle").value = cardEl.querySelector(".card-title")?.textContent?.trim() || "";
  document.getElementById("editDescription").value = cardEl.querySelector(".card-desc")?.textContent?.trim() || "";
  const dueDateInput = document.getElementById("editDueDate");
  if (dueDateInput) dueDateInput.value = cardEl.dataset.dueDate || "";
  const colorSelect = document.getElementById("editColor");
  if (colorSelect) colorSelect.value = cardEl.style.borderLeftColor ? rgbToHex(cardEl.style.borderLeftColor) : "";
  modal.classList.remove("hidden");
  document.getElementById("editTitle").focus();
}

function wireEditModal() {
  const modal = document.getElementById("editModal");
  const editForm = document.getElementById("editCardForm");
  if (!modal || !editForm) return;

  document.getElementById("closeModal")?.addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) modal.classList.add("hidden");
  });

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

      const cardEl = document.querySelector(`.card[data-card-id="${cardId}"]`);
      if (cardEl) {
        cardEl.querySelector(".card-title").textContent = title;
        let desc = cardEl.querySelector(".card-desc");
        if (description) {
          if (!desc) { desc = document.createElement("p"); desc.className = "card-desc"; cardEl.insertBefore(desc, cardEl.querySelector(".due-badge")); }
          desc.textContent = description;
        } else if (desc) desc.remove();

        let badge = cardEl.querySelector(".due-badge");
        if (due_date) {
          const info = formatDueDate(due_date);
          if (info) {
            if (!badge) { badge = document.createElement("span"); cardEl.appendChild(badge); }
            badge.className = info.cls;
            badge.textContent = info.label;
            cardEl.dataset.dueDate = due_date;
          }
        } else if (badge) { badge.remove(); delete cardEl.dataset.dueDate; }

        cardEl.style.borderLeftColor = color || "";
      }

      modal.classList.add("hidden");
      showToast("Card saved.", "success");
    } catch (err) { showToast(err.message); }
    finally { btn.disabled = false; }
  });
}

// --------------------
// MOUSE DRAG AND DROP
// --------------------

function wireDragTarget(listEl) {
  listEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    const dragging = document.querySelector(".dragging");
    if (!dragging) return;
    const after = getDragAfterElement(listEl, e.clientY);
    if (after == null) listEl.appendChild(dragging);
    else listEl.insertBefore(dragging, after);
  });

  listEl.addEventListener("drop", async (e) => {
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
// TOUCH DRAG AND DROP
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
  document.querySelectorAll(".board-section").forEach(wireBoardControls);
  document.querySelectorAll(".board-col-form").forEach(wireAddColumnForm);
  document.querySelectorAll(".column").forEach(colEl => {
    wireColumnControls(colEl);
    wireAddCardToggle(colEl);
    wireDragTarget(colEl.querySelector(".card-list"));
  });
  document.querySelectorAll(".add-card-form").forEach(wireAddCardForm);
  document.querySelectorAll(".card").forEach(wireCard);
  wireEditModal();
}

initPage();
