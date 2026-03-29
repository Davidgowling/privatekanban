require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcrypt");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

const DEFAULT_BOARDS = [
  {
    name: "Work",
    columns: ["Backlog", "This Week", "Waiting On", "Done"]
  },
  {
    name: "Home",
    columns: ["Backlog", "This Week", "Waiting On", "Done"]
  }
];

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "change-this-in-env",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false
    }
  })
);

function requireAuth(req, res, next) {
  if (req.session && req.session.isAuthenticated && req.session.userId) {
    return next();
  }
  return res.redirect("/login");
}

async function ensureDefaultsForUser(userId) {
  const existingBoards = await db.query(
    `SELECT id FROM boards WHERE user_id = $1 LIMIT 1`,
    [userId]
  );

  if (existingBoards.rows.length > 0) {
    return;
  }

  for (let i = 0; i < DEFAULT_BOARDS.length; i++) {
    const board = DEFAULT_BOARDS[i];

    const boardInsert = await db.query(
      `INSERT INTO boards (user_id, name, position)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [userId, board.name, i]
    );

    const boardId = boardInsert.rows[0].id;

    for (let j = 0; j < board.columns.length; j++) {
      await db.query(
        `INSERT INTO columns_kanban (board_id, name, position)
         VALUES ($1, $2, $3)`,
        [boardId, board.columns[j], j]
      );
    }
  }
}

async function getBoardsWithCards(userId) {
  const boardsResult = await db.query(
    `SELECT id, name, position
     FROM boards
     WHERE user_id = $1
     ORDER BY position, id`,
    [userId]
  );

  const boards = boardsResult.rows;

  for (const board of boards) {
    const columnsResult = await db.query(
      `SELECT id, name, position
       FROM columns_kanban
       WHERE board_id = $1
       ORDER BY position, id`,
      [board.id]
    );

    const columns = columnsResult.rows;

    for (const column of columns) {
      const cardsResult = await db.query(
        `SELECT id, title, description, position
         FROM cards
         WHERE column_id = $1
         ORDER BY position, id`,
        [column.id]
      );

      column.cards = cardsResult.rows;
    }

    board.columns = columns;
  }

  return boards;
}

app.get("/", requireAuth, async (req, res) => {
  try {
    const boards = await getBoardsWithCards(req.session.userId);

    res.render("index", {
      boards,
      currentUser: req.session.username
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Something went wrong loading the board.");
  }
});

app.get("/login", (req, res) => {
  if (req.session && req.session.isAuthenticated) {
    return res.redirect("/");
  }

  res.render("login", {
    loginError: null,
    signupError: null,
    signupSuccess: null
  });
});

app.post("/signup", async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "").trim();

  if (!username || !password) {
    return res.status(400).render("login", {
      loginError: null,
      signupError: "Username and password are required.",
      signupSuccess: null
    });
  }

  try {
    const existing = await db.query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );

    if (existing.rows.length > 0) {
      return res.status(400).render("login", {
        loginError: null,
        signupError: "That username already exists.",
        signupSuccess: null
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const insertResult = await db.query(
      `INSERT INTO users (username, password_hash)
       VALUES ($1, $2)
       RETURNING id, username`,
      [username, passwordHash]
    );

    const user = insertResult.rows[0];
    await ensureDefaultsForUser(user.id);

    return res.render("login", {
      loginError: null,
      signupError: null,
      signupSuccess: "Account created. You can now sign in."
    });
  } catch (error) {
    console.error(error);
    return res.status(500).render("login", {
      loginError: null,
      signupError: "Signup failed.",
      signupSuccess: null
    });
  }
});

app.post("/login", async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "").trim();

  if (!username || !password) {
    return res.status(400).render("login", {
      loginError: "Username and password are required.",
      signupError: null,
      signupSuccess: null
    });
  }

  try {
    const result = await db.query(
      `SELECT id, username, password_hash
       FROM users
       WHERE username = $1`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).render("login", {
        loginError: "Incorrect username or password.",
        signupError: null,
        signupSuccess: null
      });
    }

    const user = result.rows[0];
    const passwordOk = await bcrypt.compare(password, user.password_hash);

    if (!passwordOk) {
      return res.status(401).render("login", {
        loginError: "Incorrect username or password.",
        signupError: null,
        signupSuccess: null
      });
    }

    req.session.isAuthenticated = true;
    req.session.userId = user.id;
    req.session.username = user.username;

    return res.redirect("/");
  } catch (error) {
    console.error(error);
    return res.status(500).render("login", {
      loginError: "Login failed.",
      signupError: null,
      signupSuccess: null
    });
  }
});

app.post("/logout", requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

// --------------------
// BOARDS
// --------------------

app.post("/boards", requireAuth, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();

    if (!name) {
      return res.status(400).json({ error: "Board name is required." });
    }

    const nextPosResult = await db.query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_position
       FROM boards
       WHERE user_id = $1`,
      [req.session.userId]
    );

    const nextPosition = Number(nextPosResult.rows[0].next_position);

    const insertResult = await db.query(
      `INSERT INTO boards (user_id, name, position)
       VALUES ($1, $2, $3)
       RETURNING id, name, position`,
      [req.session.userId, name, nextPosition]
    );

    const boardId = insertResult.rows[0].id;

    const defaultColumns = ["Backlog", "This Week", "Done"];
    for (let i = 0; i < defaultColumns.length; i++) {
      await db.query(
        `INSERT INTO columns_kanban (board_id, name, position)
         VALUES ($1, $2, $3)`,
        [boardId, defaultColumns[i], i]
      );
    }

    res.json({ success: true, board: insertResult.rows[0] });
  } catch (error) {
    console.error(error);
    if (String(error.message || "").includes("duplicate")) {
      return res.status(400).json({ error: "Could not create board." });
    }
    res.status(500).json({ error: "Failed to create board." });
  }
});

app.post("/boards/:id/update", requireAuth, async (req, res) => {
  try {
    const boardId = Number(req.params.id);
    const name = String(req.body.name || "").trim();

    if (!name) {
      return res.status(400).json({ error: "Board name is required." });
    }

    const ownershipCheck = await db.query(
      `SELECT id
       FROM boards
       WHERE id = $1 AND user_id = $2`,
      [boardId, req.session.userId]
    );

    if (ownershipCheck.rows.length === 0) {
      return res.status(403).json({ error: "Not allowed." });
    }

    await db.query(
      `UPDATE boards
       SET name = $1
       WHERE id = $2`,
      [name, boardId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update board." });
  }
});

app.post("/boards/:id/delete", requireAuth, async (req, res) => {
  try {
    const boardId = Number(req.params.id);

    const ownershipCheck = await db.query(
      `SELECT id
       FROM boards
       WHERE id = $1 AND user_id = $2`,
      [boardId, req.session.userId]
    );

    if (ownershipCheck.rows.length === 0) {
      return res.status(403).json({ error: "Not allowed." });
    }

    await db.query(`DELETE FROM boards WHERE id = $1`, [boardId]);

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete board." });
  }
});

// --------------------
// COLUMNS
// --------------------

app.post("/columns", requireAuth, async (req, res) => {
  try {
    const boardId = Number(req.body.boardId);
    const name = String(req.body.name || "").trim();

    if (!boardId || !name) {
      return res.status(400).json({ error: "boardId and name are required." });
    }

    const ownershipCheck = await db.query(
      `SELECT id
       FROM boards
       WHERE id = $1 AND user_id = $2`,
      [boardId, req.session.userId]
    );

    if (ownershipCheck.rows.length === 0) {
      return res.status(403).json({ error: "Not allowed." });
    }

    const nextPosResult = await db.query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_position
       FROM columns_kanban
       WHERE board_id = $1`,
      [boardId]
    );

    const nextPosition = Number(nextPosResult.rows[0].next_position);

    const insertResult = await db.query(
      `INSERT INTO columns_kanban (board_id, name, position)
       VALUES ($1, $2, $3)
       RETURNING id, board_id, name, position`,
      [boardId, name, nextPosition]
    );

    res.json({ success: true, column: insertResult.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create column." });
  }
});

app.post("/columns/:id/update", requireAuth, async (req, res) => {
  try {
    const columnId = Number(req.params.id);
    const name = String(req.body.name || "").trim();

    if (!name) {
      return res.status(400).json({ error: "Column name is required." });
    }

    const ownershipCheck = await db.query(
      `SELECT c.id
       FROM columns_kanban c
       JOIN boards b ON b.id = c.board_id
       WHERE c.id = $1 AND b.user_id = $2`,
      [columnId, req.session.userId]
    );

    if (ownershipCheck.rows.length === 0) {
      return res.status(403).json({ error: "Not allowed." });
    }

    await db.query(
      `UPDATE columns_kanban
       SET name = $1
       WHERE id = $2`,
      [name, columnId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update column." });
  }
});

app.post("/columns/:id/delete", requireAuth, async (req, res) => {
  try {
    const columnId = Number(req.params.id);

    const ownershipCheck = await db.query(
      `SELECT c.id
       FROM columns_kanban c
       JOIN boards b ON b.id = c.board_id
       WHERE c.id = $1 AND b.user_id = $2`,
      [columnId, req.session.userId]
    );

    if (ownershipCheck.rows.length === 0) {
      return res.status(403).json({ error: "Not allowed." });
    }

    await db.query(`DELETE FROM columns_kanban WHERE id = $1`, [columnId]);

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete column." });
  }
});

// --------------------
// CARDS
// --------------------

app.post("/cards", requireAuth, async (req, res) => {
  try {
    const { columnId, title, description } = req.body;

    if (!columnId || !String(title || "").trim()) {
      return res.status(400).json({ error: "columnId and title are required." });
    }

    const ownershipCheck = await db.query(
      `SELECT c.id
       FROM columns_kanban c
       JOIN boards b ON b.id = c.board_id
       WHERE c.id = $1 AND b.user_id = $2`,
      [columnId, req.session.userId]
    );

    if (ownershipCheck.rows.length === 0) {
      return res.status(403).json({ error: "Not allowed." });
    }

    const nextPosResult = await db.query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_position
       FROM cards
       WHERE column_id = $1`,
      [columnId]
    );

    const nextPosition = Number(nextPosResult.rows[0].next_position);

    const insertResult = await db.query(
      `INSERT INTO cards (column_id, title, description, position, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, column_id, title, description, position`,
      [columnId, String(title).trim(), description || "", nextPosition]
    );

    res.json({ success: true, card: insertResult.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create card." });
  }
});

app.post("/cards/:id/update", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "");

    if (!title) {
      return res.status(400).json({ error: "Title is required." });
    }

    const ownershipCheck = await db.query(
      `SELECT ca.id
       FROM cards ca
       JOIN columns_kanban c ON c.id = ca.column_id
       JOIN boards b ON b.id = c.board_id
       WHERE ca.id = $1 AND b.user_id = $2`,
      [id, req.session.userId]
    );

    if (ownershipCheck.rows.length === 0) {
      return res.status(403).json({ error: "Not allowed." });
    }

    await db.query(
      `UPDATE cards
       SET title = $1,
           description = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [title, description, id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update card." });
  }
});

app.post("/cards/:id/delete", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const ownershipCheck = await db.query(
      `SELECT ca.id
       FROM cards ca
       JOIN columns_kanban c ON c.id = ca.column_id
       JOIN boards b ON b.id = c.board_id
       WHERE ca.id = $1 AND b.user_id = $2`,
      [id, req.session.userId]
    );

    if (ownershipCheck.rows.length === 0) {
      return res.status(403).json({ error: "Not allowed." });
    }

    await db.query("DELETE FROM cards WHERE id = $1", [id]);

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete card." });
  }
});

app.post("/cards/:id/move", requireAuth, async (req, res) => {
  const client = await db.pool.connect();

  try {
    const { id } = req.params;
    const targetColumnId = Number(req.body.targetColumnId);
    const newPosition = Number(req.body.newPosition);

    if (!targetColumnId || Number.isNaN(newPosition)) {
      return res
        .status(400)
        .json({ error: "targetColumnId and newPosition are required." });
    }

    await client.query("BEGIN");

    const cardResult = await client.query(
      `SELECT ca.id, ca.column_id, ca.position
       FROM cards ca
       JOIN columns_kanban c ON c.id = ca.column_id
       JOIN boards b ON b.id = c.board_id
       WHERE ca.id = $1 AND b.user_id = $2`,
      [id, req.session.userId]
    );

    if (cardResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Card not found." });
    }

    const targetColumnCheck = await client.query(
      `SELECT c.id
       FROM columns_kanban c
       JOIN boards b ON b.id = c.board_id
       WHERE c.id = $1 AND b.user_id = $2`,
      [targetColumnId, req.session.userId]
    );

    if (targetColumnCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Not allowed." });
    }

    const card = cardResult.rows[0];
    const oldColumnId = card.column_id;
    const oldPosition = card.position;

    await client.query(
      `UPDATE cards
       SET position = position - 1,
           updated_at = NOW()
       WHERE column_id = $1 AND position > $2`,
      [oldColumnId, oldPosition]
    );

    await client.query(
      `UPDATE cards
       SET position = position + 1,
           updated_at = NOW()
       WHERE column_id = $1 AND position >= $2`,
      [targetColumnId, newPosition]
    );

    await client.query(
      `UPDATE cards
       SET column_id = $1,
           position = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [targetColumnId, newPosition, id]
    );

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ error: "Failed to move card." });
  } finally {
    client.release();
  }
});

app.get("/api/boards", requireAuth, async (req, res) => {
  try {
    const boards = await getBoardsWithCards(req.session.userId);
    res.json({ boards });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch boards." });
  }
});

app.listen(PORT, () => {
  console.log(`Private Kanban running on http://localhost:${PORT}`);
});