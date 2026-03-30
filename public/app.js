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
    try {
      const data = await response.json();
      message = data.error || message;
    } catch (_) {}
    throw new Error(message);
  }

  return response.json();
}

function withLoading(button, asyncFn) {
  return async (...args) => {
    button.disabled = true;
    const orig = button.textContent;
    button.textContent = "…";
    try { await asyncFn(...args); }
    finally { button.disabled = false; button.textContent = orig; }
  };
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
// DOM BUILDERS
// --------------------

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDueDate(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date - today) / (1000 * 60 * 60 * 24));
  const label = date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  let cls = "due-badge";
  if (diff < 0) cls += " due-overdue";
  else if (diff <= 2) cls += " due-soon";
  return { label, cls };
}

function updateColumnCount(columnEl) {
  const list = columnEl.querySelector(".card-list");
  const count = columnEl.querySelector(".count");
  if (list && count) count.textContent = list.querySelectorAll(".card").length;
}

function buildCardEl(card) {
  const article = document.createElement("article");
  article.className = "card";
  article.draggable = true;
  article.dataset.cardId = card.id;
  article.dataset.columnId = card.column_id;

  if (card.color) {
    article.style.borderLeftColor = card.color;
    article.style.borderLeftWidth = "3px";
  }

  const top = document.createElement("div");
  top.className = "card-top";

  const titleEl = document.createElement("strong");
  titleEl.className = "card-title";
  titleEl.textContent = card.title;

  const icons = document.createElement("div");
  icons.className = "card-icons";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "icon-btn edit-card";
  editBtn.title = "Edit card";
  editBtn.textContent = "✎";

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "icon-btn icon-btn-danger delete-card";
  deleteBtn.title = "Delete card";
  deleteBtn.textContent = "✕";

  icons.appendChild(editBtn);
  icons.appendChild(deleteBtn);
  top.appendChild(titleEl);
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
    <div class="column-header">
      <div class="column-title-wrap">
        <h3>${escHtml(column.name)}</h3>
        <button type="button" class="icon-btn rename-column" title="Rename column"
          data-column-id="${column.id}" data-column-name="${escHtml(column.name)}">&#9998;</button>
        <button type="button" class="icon-btn icon-btn-danger delete-column" title="Delete column"
          data-column-id="${column.id}">&#10005;</button>
      </div>
      <div class="column-header-right">
        <button type="button" class="icon-btn add-card-toggle" title="Add card">&#43;</button>
        <span class="count">0</span>
      </div>
    </div>
    <form class="add-card-form" data-column-id="${column.id}" style="display:none;">
      <input type="text" name="title" placeholder="Card title…" required />
      <textarea name="description" placeholder="Notes (optional)"></textarea>
      <div class="card-form-row">
        <input type="date" name="due_date" title="Due date" />
        <select name="color" title="Label colour">
          <option value="">No label</option>
          <option value="#ef4444">Red</option>
          <option value="#f97316">Orange</option>
          <option value="#eab308">Yellow</option>
          <option value="#22c55e">Green</option>
          <option value="#3b82f6">Blue</option>
          <option value="#a855f7">Purple</option>
        </select>
      </div>
      <div class="card-form-actions">
        <button type="submit" class="tiny-button">Add card</button>
        <button type="button" class="tiny-button secondary-button cancel-add-card">Cancel</button>
      </div>
    </form>
    <div class="card-list" data-column-id="${column.id}"></div>
  `;

  wireColumnButtons(div);
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
    <div class="board-header board-header-flex">
      <div class="board-title-wrap">
        <h2 class="board-title">${escHtml(board.name)}</h2>
        <button type="button" class="icon-btn rename-board" title="Rename board"
          data-board-id="${board.id}" data-board-name="${escHtml(board.name)}">&#9998;</button>
        <button type="button" class="icon-btn icon-btn-danger delete-board" title="Delete board"
          data-board-id="${board.id}">&#10005;</button>
      </div>
      <form class="add-column-form inline-form" data-board-id="${board.id}">
        <input type="text" name="name" placeholder="New column" required />
        <button type="submit" class="tiny-button">Add column</button>
      </form>
    </div>
    <div class="columns-grid dynamic-grid"
      style="grid-template-columns: repeat(${colCount}, minmax(240px, 1fr));">
    </div>
  `;

  wireBoardButtons(section);
  wireAddColumnForm(section.querySelector(".add-column-form"));

  const grid = section.querySelector(".columns-grid");
  for (const col of board.columns) grid.appendChild(buildColumnEl(col));
  return section;
}

// --------------------
// ADD CARD TOGGLE
// --------------------

function wireAddCardToggle(columnEl) {
  const toggleBtn = columnEl.querySelector(".add-card-toggle");
  const form = columnEl.querySelector(".add-card-form");
  const cancelBtn = columnEl.querySelector(".cancel-add-card");
  if (!toggleBtn || !form) return;

  toggleBtn.addEventListener("click", () => {
    const isHidden = form.style.display === "none" || form.style.display === "";
    form.style.display = isHidden ? "grid" : "none";
    if (isHidden) form.querySelector("input[name='title']").focus();
  });

  cancelBtn?.addEventListener("click", () => {
    form.style.display = "none";
    form.reset();
  });
}

// --------------------
// BOARD WIRING
// --------------------

function wireBoardButtons(boardEl) {
  const renameBtn = boardEl.querySelector(".rename-board");
  const deleteBtn = boardEl.querySelector(".delete-board");

  renameBtn?.addEventListener("click", async () => {
    const boardId = renameBtn.dataset.boardId;
    const newName = prompt("Rename board:", renameBtn.dataset.boardName);
    if (newName === null) return;
    if (!newName.trim()) { showToast("Board name cannot be empty."); return; }
    try {
      await postJSON(`/boards/${boardId}/update`, { name: newName.trim() });
      boardEl.querySelector(".board-title").textContent = newName.trim();
      renameBtn.dataset.boardName = newName.trim();
      showToast("Board renamed.", "success");
    } catch (err) { showToast(err.message); }
  });

  deleteBtn?.addEventListener("click", async () => {
    if (!confirm("Delete this board and everything in it?")) return;
    try {
      await postJSON(`/boards/${deleteBtn.dataset.boardId}/delete`);
      boardEl.remove();
      showToast("Board deleted.", "success");
    } catch (err) { showToast(err.message); }
  });
}

function wireAddBoardForm() {
  const form = document.getElementById("addBoardForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("newBoardName");
    const name = input.value.trim();
    if (!name) return;
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const data = await postJSON("/boards", { name });
      input.value = "";
      document.querySelector(".boards-wrap").appendChild(buildBoardEl(data.board));
      showToast("Board created.", "success");
    } catch (err) { showToast(err.message); }
    finally { btn.disabled = false; }
  });
}

// --------------------
// COLUMN WIRING
// --------------------

function wireColumnButtons(columnEl) {
  const renameBtn = columnEl.querySelector(".rename-column");
  const deleteBtn = columnEl.querySelector(".delete-column");

  renameBtn?.addEventListener("click", async () => {
    const columnId = renameBtn.dataset.columnId;
    const newName = prompt("Rename column:", renameBtn.dataset.columnName);
    if (newName === null) return;
    if (!newName.trim()) { showToast("Column name cannot be empty."); return; }
    try {
      await postJSON(`/columns/${columnId}/update`, { name: newName.trim() });
      columnEl.querySelector("h3").textContent = newName.trim();
      renameBtn.dataset.columnName = newName.trim();
      showToast("Column renamed.", "success");
    } catch (err) { showToast(err.message); }
  });

  deleteBtn?.addEventListener("click", async () => {
    if (!confirm("Delete this column and all cards inside it?")) return;
    try {
      await postJSON(`/columns/${deleteBtn.dataset.columnId}/delete`);
      const boardEl = columnEl.closest(".board-section");
      columnEl.remove();
      if (boardEl) {
        const grid = boardEl.querySelector(".columns-grid");
        const remaining = grid.querySelectorAll(".column").length;
        grid.style.gridTemplateColumns = `repeat(${Math.max(remaining, 1)}, minmax(240px, 1fr))`;
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
      grid.style.gridTemplateColumns = `repeat(${grid.querySelectorAll(".column").length}, minmax(240px, 1fr))`;
      showToast("Column added.", "success");
    } catch (err) { showToast(err.message); }
    finally { btn.disabled = false; }
  });
}

// --------------------
// CARD WIRING
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

function rgbToHex(rgb) {
  const match = rgb.match(/\d+/g);
  if (!match || match.length < 3) return "";
  return "#" + match.slice(0, 3).map(n => Number(n).toString(16).padStart(2, "0")).join("");
}

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
    btn.textContent = "Saving…";
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

        if (color) { cardEl.style.borderLeftColor = color; cardEl.style.borderLeftWidth = "3px"; }
        else { cardEl.style.borderLeftColor = ""; cardEl.style.borderLeftWidth = ""; }
      }

      modal.classList.add("hidden");
      showToast("Card saved.", "success");
    } catch (err) { showToast(err.message); }
    finally { btn.disabled = false; btn.textContent = "Save"; }
  });
}

// --------------------
// DRAG AND DROP
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

  listEl.addEventListener("drop", async () => {
    const dragging = document.querySelector(".dragging");
    if (!dragging) return;
    const targetColumnId = listEl.dataset.columnId;
    const cards = [...listEl.querySelectorAll(".card")];
    const newPosition = cards.findIndex(c => c.dataset.cardId === dragging.dataset.cardId);
    try {
      await postJSON(`/cards/${dragging.dataset.cardId}/move`, { targetColumnId, newPosition });
      dragging.dataset.columnId = targetColumnId;
      document.querySelectorAll(".column").forEach(updateColumnCount);
    } catch (err) { showToast(err.message); }
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

// --------------------
// ACCOUNT DELETION
// --------------------

function wireDeleteAccount() {
  document.getElementById("deleteAccountBtn")?.addEventListener("click", async () => {
    if (!confirm("Permanently delete your account and all data? This cannot be undone.")) return;
    if (!confirm("Are you sure? Everything will be gone forever.")) return;
    try {
      await postJSON("/account/delete");
      window.location.href = "/login";
    } catch (err) { showToast(err.message); }
  });
}

// --------------------
// INIT
// --------------------

function initPage() {
  wireAddBoardForm();
  document.querySelectorAll(".board-section").forEach(wireBoardButtons);
  document.querySelectorAll(".add-column-form").forEach(wireAddColumnForm);
  document.querySelectorAll(".column").forEach(colEl => {
    wireColumnButtons(colEl);
    wireAddCardToggle(colEl);
    wireDragTarget(colEl.querySelector(".card-list"));
  });
  document.querySelectorAll(".add-card-form").forEach(wireAddCardForm);
  document.querySelectorAll(".card").forEach(wireCard);
  wireEditModal();
  wireDeleteAccount();
}

initPage();
