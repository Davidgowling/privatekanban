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

function wireAddBoardForm() {
  const form = document.getElementById("addBoardForm");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const input = document.getElementById("newBoardName");
    const name = input.value.trim();

    if (!name) return;

    try {
      await postJSON("/boards", { name });
      window.location.reload();
    } catch (error) {
      alert(error.message);
    }
  });
}

function wireRenameBoardButtons() {
  document.querySelectorAll(".rename-board").forEach((button) => {
    button.addEventListener("click", async () => {
      const boardId = button.dataset.boardId;
      const currentName = button.dataset.boardName;
      const newName = prompt("Rename board:", currentName);

      if (newName === null) return;
      if (!newName.trim()) {
        alert("Board name cannot be empty.");
        return;
      }

      try {
        await postJSON(`/boards/${boardId}/update`, { name: newName.trim() });
        window.location.reload();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function wireDeleteBoardButtons() {
  document.querySelectorAll(".delete-board").forEach((button) => {
    button.addEventListener("click", async () => {
      const boardId = button.dataset.boardId;

      if (!confirm("Delete this board and everything in it?")) return;

      try {
        await postJSON(`/boards/${boardId}/delete`);
        window.location.reload();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function wireAddColumnForms() {
  document.querySelectorAll(".add-column-form").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const boardId = form.dataset.boardId;
      const input = form.querySelector('input[name="name"]');
      const name = input.value.trim();

      if (!name) return;

      try {
        await postJSON("/columns", { boardId, name });
        window.location.reload();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function wireRenameColumnButtons() {
  document.querySelectorAll(".rename-column").forEach((button) => {
    button.addEventListener("click", async () => {
      const columnId = button.dataset.columnId;
      const currentName = button.dataset.columnName;
      const newName = prompt("Rename column:", currentName);

      if (newName === null) return;
      if (!newName.trim()) {
        alert("Column name cannot be empty.");
        return;
      }

      try {
        await postJSON(`/columns/${columnId}/update`, { name: newName.trim() });
        window.location.reload();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function wireDeleteColumnButtons() {
  document.querySelectorAll(".delete-column").forEach((button) => {
    button.addEventListener("click", async () => {
      const columnId = button.dataset.columnId;

      if (!confirm("Delete this column and all cards inside it?")) return;

      try {
        await postJSON(`/columns/${columnId}/delete`);
        window.location.reload();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function wireAddCardForms() {
  document.querySelectorAll(".add-card-form").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const columnId = form.dataset.columnId;
      const formData = new FormData(form);
      const title = formData.get("title");
      const description = formData.get("description");

      try {
        await postJSON("/cards", { columnId, title, description });
        window.location.reload();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function wireDeleteButtons() {
  document.querySelectorAll(".delete-card").forEach((button) => {
    button.addEventListener("click", async () => {
      const card = button.closest(".card");
      const cardId = card.dataset.cardId;

      if (!confirm("Delete this card?")) return;

      try {
        await postJSON(`/cards/${cardId}/delete`);
        window.location.reload();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function wireEditModal() {
  const modal = document.getElementById("editModal");
  const closeModal = document.getElementById("closeModal");
  const editForm = document.getElementById("editCardForm");
  const editCardId = document.getElementById("editCardId");
  const editTitle = document.getElementById("editTitle");
  const editDescription = document.getElementById("editDescription");

  document.querySelectorAll(".edit-card").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".card");
      editCardId.value = card.dataset.cardId;
      editTitle.value = card.querySelector(".card-title")?.textContent?.trim() || "";
      editDescription.value = card.querySelector(".card-desc")?.textContent?.trim() || "";
      modal.classList.remove("hidden");
    });
  });

  closeModal.addEventListener("click", () => {
    modal.classList.add("hidden");
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      modal.classList.add("hidden");
    }
  });

  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      await postJSON(`/cards/${editCardId.value}/update`, {
        title: editTitle.value,
        description: editDescription.value
      });
      window.location.reload();
    } catch (error) {
      alert(error.message);
    }
  });
}

function wireDragAndDrop() {
  let draggedCard = null;

  document.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("dragstart", () => {
      draggedCard = card;
      card.classList.add("dragging");
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      draggedCard = null;
    });
  });

  document.querySelectorAll(".card-list").forEach((list) => {
    list.addEventListener("dragover", (event) => {
      event.preventDefault();

      const afterElement = getDragAfterElement(list, event.clientY);
      const currentDragging = document.querySelector(".dragging");
      if (!currentDragging) return;

      if (afterElement == null) {
        list.appendChild(currentDragging);
      } else {
        list.insertBefore(currentDragging, afterElement);
      }
    });

    list.addEventListener("drop", async () => {
      if (!draggedCard) return;

      const targetColumnId = list.dataset.columnId;
      const cards = [...list.querySelectorAll(".card")];
      const newPosition = cards.findIndex(
        (c) => c.dataset.cardId === draggedCard.dataset.cardId
      );

      try {
        await postJSON(`/cards/${draggedCard.dataset.cardId}/move`, {
          targetColumnId,
          newPosition
        });
        window.location.reload();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll(".card:not(.dragging)")];

  return draggableElements.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;

      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }

      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY }
  ).element;
}

wireAddBoardForm();
wireRenameBoardButtons();
wireDeleteBoardButtons();
wireAddColumnForms();
wireRenameColumnButtons();
wireDeleteColumnButtons();
wireAddCardForms();
wireDeleteButtons();
wireEditModal();
wireDragAndDrop();