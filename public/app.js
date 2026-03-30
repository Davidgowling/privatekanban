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

// Disable a button and restore it after async work completes
function withLoading(button, asyncFn) {
  return async (...args) => {
    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = "…";
    try {
      await asyncFn(...args);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  };
}

// --------------------
// TOAST NOTIFICATIONS
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

  // Trigger entrance animation
  requestAnimationFrame(() => toast.classList.add("toast-visible"));

  setTimeout(() => {
    toast.classList.remove("toast-visible");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
  }, 3500);
}

// --------------------
// DOM BUILDERS
// Helper functions that create HTML elements for new boards, columns, and cards
// without requiring a page reload.
// --------------------

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

function buildCardEl(card) {
  const article = document.createElement("article");
  article.className = "card compact-card-item";
  article.draggable = true;
  article.dataset.cardId = card.id;
  article.dataset.columnId = card.column_id;

  if (card.color) {
    article.style.borderLeftColor = card.color;
    article.style.borderLeftWidth = "3px";
  }

  const titleEl = document.createElement("strong");
  titleEl.className = "card-title";
  titleEl.textContent = card.title;
  article.appendChild(titleEl);

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

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "small-button tiny-button edit-card";
  editBtn.textContent = "Edit";

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "small-button tiny-button danger delete-card";
  deleteBtn.textContent = "Delete";

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);
  article.appendChild(actions);

  wireCard(article);
  return article;
}

function buildColumnEl(column) {
  const div = document.createElement("div");
  div.className = "column compact-column";
  div.dataset.columnId = column.id;

  div.innerHTML = `
    <div class="column-header">
      <div class="column-title-wrap">
        <h3>${escHtml(column.name)}</h3>
        <button type="button" class="tiny-button secondary-button rename-column"
          data-column-id="${column.id}" data-column-name="${escHtml(column.name)}">Edit</button>
        <button type="button" class="tiny-button danger delete-column"
          data-column-id="${column.id}">X</button>
      </div>
      <span class="count">0</span>
    </div>
    <form class="add-card-form compact-form" data-column-id="${column.id}">
      <input type="text" name="title" placeholder="Add a card…" required />
      <textarea name="description" placeholder="Optional notes"></textarea>
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
        <button type="submit" class="tiny-button">Add</button>
      </div>
    </form>
    <div class="card-list" data-column-id="${column.id}"></div>
  `;

  wireColumnButtons(div);
  wireAddCardForm(div.querySelector(".add-card-form"));
  wireDragTarget(div.querySelector(".card-list"));
  return div;
}

function buildBoardEl(board) {
  const section = document.createElement("section");
  section.className = "board-section compact-section";
  section.dataset.boardId = board.id;

  const colCount = Math.max(board.columns.length, 1);

  section.innerHTML = `
    <div class="board-header board-header-flex">
      <div class="board-title-wrap">
        <h2 class="board-title">${escHtml(board.name)}</h2>
        <button type="button" class="tiny-button secondary-button rename-board"
          data-board-id="${board.id}" data-board-name="${escHtml(board.name)}">Rename</button>
        <button type="button" class="tiny-button danger delete-board"
          data-board-id="${board.id}">Delete</button>
      </div>
      <form class="add-column-form inline-form" data-board-id="${board.id}">
        <input type="text" name="name" placeholder="New column" required />
        <button type="submit" class="tiny-button">Add column</button>
      </form>
    </div>
    <div class="columns-grid compact-grid dynamic-grid"
      style="grid-template-columns: repeat(${colCount}, minmax(220px, 1fr));">
    </div>
  `;

  wireBoardButtons(section);
  wireAddColumnForm(section.querySelector(".add-column-form"));

  const grid = section.querySelector(".columns-grid");
  for (const col of board.columns) {
    grid.appendChild(buildColumnEl(col));
  }

  return section;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function updateColumnCount(columnEl) {
  const list = columnEl.querySelector(".card-list");
  const count = columnEl.querySelector(".count");
  if (list && count) count.textContent = list.querySelectorAll(".card").length;
}

// --------------------
// BOARD WIRING
// --------------------

function wireBoardButtons(boardEl) {
  const renameBtn = boardEl.querySelector(".rename-board");
  const deleteBtn = boardEl.querySelector(".delete-board");

  if (renameBtn) {
    renameBtn.addEventListener("click", withLoading(renameBtn, async () => {
      const boardId = renameBtn.dataset.boardId;
      const currentName = renameBtn.dataset.boardName;
      const newName = prompt("Rename board:", currentName);
      if (newName === null) return;
      if (!newName.trim()) { showToast("Board name cannot be empty."); return; }

      await postJSON(`/boards/${boardId}/update`, { name: newName.trim() });
      boardEl.querySelector(".board-title").textContent = newName.trim();
      renameBtn.dataset.boardName = newName.trim();
      showToast("Board renamed.", "success");
    }));
  }

  if (deleteBtn) {
    deleteBtn.addEventListener("click", withLoading(deleteBtn, async () => {
      const boardId = deleteBtn.dataset.boardId;
      if (!confirm("Delete this board and everything in it?")) return;

      await postJSON(`/boards/${boardId}/delete`);
      boardEl.remove();
      showToast("Board deleted.", "success");
    }));
  }
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

      const boardsWrap = document.querySelector(".boards-wrap");
      const newBoard = buildBoardEl(data.board);
      boardsWrap.appendChild(newBoard);
      showToast("Board created.", "success");
    } catch (err) {
      showToast(err.message);
    } finally {
      btn.disabled = false;
    }
  });
}

// --------------------
// COLUMN WIRING
// --------------------

function wireColumnButtons(columnEl) {
  const renameBtn = columnEl.querySelector(".rename-column");
  const deleteBtn = columnEl.querySelector(".delete-column");

  if (renameBtn) {
    renameBtn.addEventListener("click", withLoading(renameBtn, async () => {
      const columnId = renameBtn.dataset.columnId;
      const currentName = renameBtn.dataset.columnName;
      const newName = prompt("Rename column:", currentName);
      if (newName === null) return;
      if (!newName.trim()) { showToast("Column name cannot be empty."); return; }

      await postJSON(`/columns/${columnId}/update`, { name: newName.trim() });
      columnEl.querySelector("h3").textContent = newName.trim();
      renameBtn.dataset.columnName = newName.trim();
      showToast("Column renamed.", "success");
    }));
  }

  if (deleteBtn) {
    deleteBtn.addEventListener("click", withLoading(deleteBtn, async () => {
      const columnId = deleteBtn.dataset.columnId;
      if (!confirm("Delete this column and all cards inside it?")) return;

      await postJSON(`/columns/${columnId}/delete`);
      const boardEl = columnEl.closest(".board-section");
      columnEl.remove();

      // Recount columns and update grid template
      if (boardEl) {
        const grid = boardEl.querySelector(".columns-grid");
        const remaining = grid.querySelectorAll(".column").length;
        grid.style.gridTemplateColumns = `repeat(${Math.max(remaining, 1)}, minmax(220px, 1fr))`;
      }
      showToast("Column deleted.", "success");
    }));
  }
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

      const boardEl = form.closest(".board-section");
      const grid = boardEl.querySelector(".columns-grid");
      grid.appendChild(buildColumnEl(data.column));

      const colCount = grid.querySelectorAll(".column").length;
      grid.style.gridTemplateColumns = `repeat(${colCount}, minmax(220px, 1fr))`;
      showToast("Column added.", "success");
    } catch (err) {
      showToast(err.message);
    } finally {
      btn.disabled = false;
    }
  });
}

// --------------------
// CARD WIRING
// --------------------

function wireCard(cardEl) {
  const editBtn = cardEl.querySelector(".edit-card");
  const deleteBtn = cardEl.querySelector(".delete-card");

  if (editBtn) {
    editBtn.addEventListener("click", () => openEditModal(cardEl));
  }

  if (deleteBtn) {
    deleteBtn.addEventListener("click", withLoading(deleteBtn, async () => {
      const cardId = cardEl.dataset.cardId;
      if (!confirm("Delete this card?")) return;

      await postJSON(`/cards/${cardId}/delete`);
      const columnEl = cardEl.closest(".column");
      cardEl.remove();
      if (columnEl) updateColumnCount(columnEl);
      showToast("Card deleted.", "success");
    }));
  }

  // Drag events
  cardEl.addEventListener("dragstart", () => {
    cardEl.classList.add("dragging");
  });
  cardEl.addEventListener("dragend", () => {
    cardEl.classList.remove("dragging");
  });
}

function wireAddCardForm(form) {
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const columnId = form.dataset.columnId;
    const formData = new FormData(form);
    const title = formData.get("title");
    const description = formData.get("description");
    const due_date = formData.get("due_date") || null;
    const color = formData.get("color") || null;

    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const data = await postJSON("/cards", { columnId, title, description, due_date, color });
      form.reset();

      const columnEl = form.closest(".column");
      const list = columnEl.querySelector(".card-list");
      list.appendChild(buildCardEl(data.card));
      updateColumnCount(columnEl);
    } catch (err) {
      showToast(err.message);
    } finally {
      btn.disabled = false;
    }
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

  // Pre-fill due date
  const badge = cardEl.querySelector(".due-badge");
  const dueDateInput = document.getElementById("editDueDate");
  if (dueDateInput) dueDateInput.value = cardEl.dataset.dueDate || "";

  // Pre-fill colour
  const colorSelect = document.getElementById("editColor");
  if (colorSelect) {
    const borderColor = cardEl.style.borderLeftColor;
    colorSelect.value = borderColor ? rgbToHex(borderColor) : "";
  }

  modal.classList.remove("hidden");
  document.getElementById("editTitle").focus();
}

function rgbToHex(rgb) {
  const match = rgb.match(/\d+/g);
  if (!match || match.length < 3) return "";
  return "#" + match.slice(0, 3).map(n => Number(n).toString(16).padStart(2, "0")).join("");
}

function wireEditModal() {
  const modal = document.getElementById("editModal");
  const closeModal = document.getElementById("closeModal");
  const editForm = document.getElementById("editCardForm");
  if (!modal || !editForm) return;

  closeModal?.addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) {
      modal.classList.add("hidden");
    }
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

      // Update card in place without a reload
      const cardEl = document.querySelector(`.card[data-card-id="${cardId}"]`);
      if (cardEl) {
        cardEl.querySelector(".card-title").textContent = title;

        let desc = cardEl.querySelector(".card-desc");
        if (description) {
          if (!desc) {
            desc = document.createElement("p");
            desc.className = "card-desc";
            cardEl.insertBefore(desc, cardEl.querySelector(".due-badge") || cardEl.querySelector(".card-actions"));
          }
          desc.textContent = description;
        } else if (desc) {
          desc.remove();
        }

        // Update due date badge
        let badge = cardEl.querySelector(".due-badge");
        if (due_date) {
          const info = formatDueDate(due_date);
          if (info) {
            if (!badge) {
              badge = document.createElement("span");
              cardEl.insertBefore(badge, cardEl.querySelector(".card-actions"));
            }
            badge.className = info.cls;
            badge.textContent = info.label;
            cardEl.dataset.dueDate = due_date;
          }
        } else if (badge) {
          badge.remove();
          delete cardEl.dataset.dueDate;
        }

        // Update colour strip
        if (color) {
          cardEl.style.borderLeftColor = color;
          cardEl.style.borderLeftWidth = "3px";
        } else {
          cardEl.style.borderLeftColor = "";
          cardEl.style.borderLeftWidth = "";
        }
      }

      modal.classList.add("hidden");
      showToast("Card saved.", "success");
    } catch (err) {
      showToast(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Save";
    }
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
    if (after == null) {
      listEl.appendChild(dragging);
    } else {
      listEl.insertBefore(dragging, after);
    }
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

      // Update counts on both affected columns
      document.querySelectorAll(".column").forEach(updateColumnCount);
    } catch (err) {
      showToast(err.message);
    }
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
  const btn = document.getElementById("deleteAccountBtn");
  if (!btn) return;

  btn.addEventListener("click", withLoading(btn, async () => {
    if (!confirm("Permanently delete your account and all data? This cannot be undone.")) return;
    if (!confirm("Are you sure? All your boards, columns, and cards will be gone forever.")) return;

    await postJSON("/account/delete");
    window.location.href = "/login";
  }));
}

// --------------------
// INIT — wire up everything already in the server-rendered HTML
// --------------------

function initPage() {
  wireAddBoardForm();

  document.querySelectorAll(".board-section").forEach(wireBoardButtons);
  document.querySelectorAll(".add-column-form").forEach(wireAddColumnForm);

  document.querySelectorAll(".column").forEach(colEl => {
    wireColumnButtons(colEl);
    wireDragTarget(colEl.querySelector(".card-list"));
  });

  document.querySelectorAll(".add-card-form").forEach(wireAddCardForm);
  document.querySelectorAll(".card").forEach(wireCard);

  wireEditModal();
  wireDeleteAccount();
}

initPage();