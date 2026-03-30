require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const bcrypt = require("bcrypt");
const rateLimit = require("express-rate-limit");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

// --------------------
// CONSTANTS
// --------------------

const USERNAME_MAX = 50;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72; // bcrypt hard limit
const NAME_MAX = 100;
const TITLE_MAX = 255;
const DESC_MAX = 5000;

const DEFAULT_BOARDS = [
  { name: "Work", columns: ["Backlog", "This Week", "Waiting On", "Done"] },
  { name: "Home", columns: ["Backlog", "This Week", "Waiting On", "Done"] }
];

// --------------------
// MIDDLEWARE
// --------------------

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.set("trust proxy", 1);

app.use(
  session({
    store: new pgSession({
      pool: db.pool,
      tableName: "user_sessions",
      createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET || "change-this-in-env",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 14
    }
  })
);

// --------------------
// RATE LIMITERS
// --------------------

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again in 15 minutes." }
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Slow down." }
});

app.use("/login", authLimiter);
app.use("/signup", authLimiter);
app.use(["/boards", "/columns", "/cards", "/account"], apiLimiter);

// --------------------
// AUTH HELPERS
// --------------------

function requireAuth(req, res, next) {
  if (req.session && req.session.isAuthenticated && req.session.userId) {
    return next();
  }
  return res.redirect("/login");
}

// --------------------
// DATA HELPERS
// --------------------

async function ensureDefaultsForUser(userId) {
  const existing = await db.query(
    `SELECT id FROM boards WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  if (existing.rows.length > 0) return;

  for (let i = 0; i < DEFAULT_BOARDS.length; i++) {
    const board = DEFAULT_BOARDS[i];
    const boardInsert = await db.query(
      `INSERT INTO boards (user_id, name, position) VALUES ($1, $2, $3) RETURNING id`,
      [userId, board.name, i]
    );
    const boardId = boardInsert.rows[0].id;
    for (let j = 0; j < board.columns.length; j++) {
      await db.query(
        `INSERT INTO columns_kanban (board_id, name, position) VALUES ($1, $2, $3)`,
        [boardId, board.columns[j], j]
      );
    }
  }
}

// Replaces the old N+1 getBoardsWithCards — now 3 queries total regardless of data size
async function getBoardsWithCards(userId) {
  const boardsResult = await db.query(
    `SELECT id, name, position FROM boards WHERE user_id = $1 ORDER BY position, id`,
    [userId]
  );
  const boards = boardsResult.rows;
  if (boards.length === 0) return [];

  const boardIds = boards.map(b => b.id);

  const columnsResult = await db.query(
    `SELECT id, board_id, name, position
     FROM columns_kanban
     WHERE board_id = ANY($1)
     ORDER BY position, id`,
    [boardIds]
  );

  const columnIds = columnsResult.rows.map(c => c.id);

  let cards = [];
  if (columnIds.length > 0) {
    const cardsResult = await db.query(
      `SELECT id, column_id, title, description, position, due_date, color
       FROM cards
       WHERE column_id = ANY($1)
       ORDER BY position, id`,
      [columnIds]
    );
    cards = cardsResult.rows;
  }

  // Assemble in JS
  const cardsByColumn = {};
  for (const card of cards) {
    if (!cardsByColumn[card.column_id]) cardsByColumn[card.column_id] = [];
    cardsByColumn[card.column_id].push(card);
  }

  const columnsByBoard = {};
  for (const col of columnsResult.rows) {
    col.cards = cardsByColumn[col.id] || [];
    if (!columnsByBoard[col.board_id]) columnsByBoard[col.board_id] = [];
    columnsByBoard[col.board_id].push(col);
  }

  for (const board of boards) {
    board.columns = columnsByBoard[board.id] || [];
  }

  return boards;
}

// --------------------
// PAGES
// --------------------

app.get("/", requireAuth, async (req, res) => {
  try {
    const boards = await getBoardsWithCards(req.session.userId);
    res.render("index", { boards, currentUser: req.session.username });
  } catch (error) {
    console.error(error);
    res.status(500).send("Something went wrong loading the board.");
  }
});

app.get("/login", (req, res) => {
  if (req.session && req.session.isAuthenticated) return res.redirect("/");
  res.render("login", { loginError: null, signupError: null, signupSuccess: null });
});

// --------------------
// AUTH ROUTES
// --------------------

app.post("/signup", async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  const renderError = (signupError) =>
    res.status(400).render("login", { loginError: null, signupError, signupSuccess: null });

  if (!username || !password) return renderError("Username and password are required.");
  if (username.length > USERNAME_MAX) return renderError(`Username must be ${USERNAME_MAX} characters or fewer.`);
  if (password.length < PASSWORD_MIN) return renderError(`Password must be at least ${PASSWORD_MIN} characters.`);
  if (password.length > PASSWORD_MAX) return renderError(`Password must be ${PASSWORD_MAX} characters or fewer.`);

  try {
    const existing = await db.query("SELECT id FROM users WHERE username = $1", [username]);
    if (existing.rows.length > 0) return renderError("That username is already taken.");

    const passwordHash = await bcrypt.hash(password, 10);
    const insertResult = await db.query(
      `INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id`,
      [username, passwordHash]
    );

    await ensureDefaultsForUser(insertResult.rows[0].id);

    return res.render("login", {
      loginError: null,
      signupError: null,
      signupSuccess: "Account created. You can now sign in."
    });
  } catch (error) {
    console.error(error);
    return renderError("Signup failed. Please try again.");
  }
});

app.post("/login", async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  const renderError = (loginError) =>
    res.status(401).render("login", { loginError, signupError: null, signupSuccess: null });

  if (!username || !password) return renderError("Username and password are required.");

  try {
    const result = await db.query(
      `SELECT id, username, password_hash FROM users WHERE username = $1`,
      [username]
    );

    // Always run bcrypt even on no-match to prevent timing attacks
    const fakeHash = "$2b$10$invalidhashfortimingpurposesonly123456789012";
    const hash = result.rows.length > 0 ? result.rows[0].password_hash : fakeHash;
    const passwordOk = await bcrypt.compare(password, hash);

    if (result.rows.length === 0 || !passwordOk) {
      return renderError("Incorrect username or password.");
    }

    const user = result.rows[0];
    req.session.regenerate((err) => {
      if (err) return renderError("Login failed. Please try again.");
      req.session.isAuthenticated = true;
      req.session.userId = user.id;
      req.session.username = user.username;
      return res.redirect("/");
    });
  } catch (error) {
    console.error(error);
    return renderError("Login failed. Please try again.");
  }
});

app.post("/logout", requireAuth, (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// --------------------
// ACCOUNT
// --------------------

app.post("/account/delete", requireAuth, async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM users WHERE id = $1", [req.session.userId]);
    await client.query("COMMIT");
    req.session.destroy(() => res.json({ success: true }));
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ error: "Failed to delete account." });
  } finally {
    client.release();
  }
});

// --------------------
// BOARDS
// --------------------

app.post("/boards", requireAuth, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Board name is required." });
    if (name.length > NAME_MAX) return res.status(400).json({ error: `Board name must be ${NAME_MAX} characters or fewer.` });

    const nextPosResult = await db.query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM boards WHERE user_id = $1`,
      [req.session.userId]
    );

    const insertResult = await db.query(
      `INSERT INTO boards (user_id, name, position) VALUES ($1, $2, $3) RETURNING id, name, position`,
      [req.session.userId, name, Number(nextPosResult.rows[0].next_position)]
    );

    const boardId = insertResult.rows[0].id;
    const defaultColumns = ["Backlog", "This Week", "Done"];
    for (let i = 0; i < defaultColumns.length; i++) {
      await db.query(
        `INSERT INTO columns_kanban (board_id, name, position) VALUES ($1, $2, $3)`,
        [boardId, defaultColumns[i], i]
      );
    }

    // Return the full new board with empty columns so the frontend can render it
    const columnsResult = await db.query(
      `SELECT id, name, position FROM columns_kanban WHERE board_id = $1 ORDER BY position`,
      [boardId]
    );
    const board = insertResult.rows[0];
    board.columns = columnsResult.rows.map(c => ({ ...c, cards: [] }));

    res.json({ success: true, board });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create board." });
  }
});

app.post("/boards/:id/update", requireAuth, async (req, res) => {
  try {
    const boardId = Number(req.params.id);
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Board name is required." });
    if (name.length > NAME_MAX) return res.status(400).json({ error: `Board name must be ${NAME_MAX} characters or fewer.` });

    const check = await db.query(
      `SELECT id FROM boards WHERE id = $1 AND user_id = $2`,
      [boardId, req.session.userId]
    );
    if (check.rows.length === 0) return res.status(403).json({ error: "Not allowed." });

    await db.query(`UPDATE boards SET name = $1 WHERE id = $2`, [name, boardId]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update board." });
  }
});

app.post("/boards/:id/delete", requireAuth, async (req, res) => {
  try {
    const boardId = Number(req.params.id);
    const check = await db.query(
      `SELECT id FROM boards WHERE id = $1 AND user_id = $2`,
      [boardId, req.session.userId]
    );
    if (check.rows.length === 0) return res.status(403).json({ error: "Not allowed." });

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
    if (!boardId || !name) return res.status(400).json({ error: "boardId and name are required." });
    if (name.length > NAME_MAX) return res.status(400).json({ error: `Column name must be ${NAME_MAX} characters or fewer.` });

    const check = await db.query(
      `SELECT id FROM boards WHERE id = $1 AND user_id = $2`,
      [boardId, req.session.userId]
    );
    if (check.rows.length === 0) return res.status(403).json({ error: "Not allowed." });

    const nextPosResult = await db.query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM columns_kanban WHERE board_id = $1`,
      [boardId]
    );

    const insertResult = await db.query(
      `INSERT INTO columns_kanban (board_id, name, position) VALUES ($1, $2, $3) RETURNING id, board_id, name, position`,
      [boardId, name, Number(nextPosResult.rows[0].next_position)]
    );

    res.json({ success: true, column: { ...insertResult.rows[0], cards: [] } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create column." });
  }
});

app.post("/columns/:id/update", requireAuth, async (req, res) => {
  try {
    const columnId = Number(req.params.id);
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Column name is required." });
    if (name.length > NAME_MAX) return res.status(400).json({ error: `Column name must be ${NAME_MAX} characters or fewer.` });

    const check = await db.query(
      `SELECT c.id FROM columns_kanban c JOIN boards b ON b.id = c.board_id WHERE c.id = $1 AND b.user_id = $2`,
      [columnId, req.session.userId]
    );
    if (check.rows.length === 0) return res.status(403).json({ error: "Not allowed." });

    await db.query(`UPDATE columns_kanban SET name = $1 WHERE id = $2`, [name, columnId]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update column." });
  }
});

app.post("/columns/:id/delete", requireAuth, async (req, res) => {
  try {
    const columnId = Number(req.params.id);
    const check = await db.query(
      `SELECT c.id FROM columns_kanban c JOIN boards b ON b.id = c.board_id WHERE c.id = $1 AND b.user_id = $2`,
      [columnId, req.session.userId]
    );
    if (check.rows.length === 0) return res.status(403).json({ error: "Not allowed." });

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
    const { columnId, title, description, due_date, color } = req.body;
    const cleanTitle = String(title || "").trim();
    const cleanDesc = String(description || "").slice(0, DESC_MAX);

    if (!columnId || !cleanTitle) return res.status(400).json({ error: "columnId and title are required." });
    if (cleanTitle.length > TITLE_MAX) return res.status(400).json({ error: `Title must be ${TITLE_MAX} characters or fewer.` });

    const check = await db.query(
      `SELECT c.id FROM columns_kanban c JOIN boards b ON b.id = c.board_id WHERE c.id = $1 AND b.user_id = $2`,
      [columnId, req.session.userId]
    );
    if (check.rows.length === 0) return res.status(403).json({ error: "Not allowed." });

    const nextPosResult = await db.query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM cards WHERE column_id = $1`,
      [columnId]
    );

    const insertResult = await db.query(
      `INSERT INTO cards (column_id, title, description, position, due_date, color, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id, column_id, title, description, position, due_date, color`,
      [columnId, cleanTitle, cleanDesc, Number(nextPosResult.rows[0].next_position), due_date || null, color || null]
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
    const description = String(req.body.description || "").slice(0, DESC_MAX);
    const due_date = req.body.due_date || null;
    const color = req.body.color || null;

    if (!title) return res.status(400).json({ error: "Title is required." });
    if (title.length > TITLE_MAX) return res.status(400).json({ error: `Title must be ${TITLE_MAX} characters or fewer.` });

    const check = await db.query(
      `SELECT ca.id FROM cards ca JOIN columns_kanban c ON c.id = ca.column_id JOIN boards b ON b.id = c.board_id WHERE ca.id = $1 AND b.user_id = $2`,
      [id, req.session.userId]
    );
    if (check.rows.length === 0) return res.status(403).json({ error: "Not allowed." });

    await db.query(
      `UPDATE cards SET title = $1, description = $2, due_date = $3, color = $4, updated_at = NOW() WHERE id = $5`,
      [title, description, due_date, color, id]
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
    const check = await db.query(
      `SELECT ca.id FROM cards ca JOIN columns_kanban c ON c.id = ca.column_id JOIN boards b ON b.id = c.board_id WHERE ca.id = $1 AND b.user_id = $2`,
      [id, req.session.userId]
    );
    if (check.rows.length === 0) return res.status(403).json({ error: "Not allowed." });

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
      return res.status(400).json({ error: "targetColumnId and newPosition are required." });
    }

    await client.query("BEGIN");

    const cardResult = await client.query(
      `SELECT ca.id, ca.column_id, ca.position FROM cards ca JOIN columns_kanban c ON c.id = ca.column_id JOIN boards b ON b.id = c.board_id WHERE ca.id = $1 AND b.user_id = $2`,
      [id, req.session.userId]
    );
    if (cardResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Card not found." });
    }

    const targetCheck = await client.query(
      `SELECT c.id FROM columns_kanban c JOIN boards b ON b.id = c.board_id WHERE c.id = $1 AND b.user_id = $2`,
      [targetColumnId, req.session.userId]
    );
    if (targetCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Not allowed." });
    }

    const { column_id: oldColumnId, position: oldPosition } = cardResult.rows[0];

    await client.query(
      `UPDATE cards SET position = position - 1, updated_at = NOW() WHERE column_id = $1 AND position > $2`,
      [oldColumnId, oldPosition]
    );
    await client.query(
      `UPDATE cards SET position = position + 1, updated_at = NOW() WHERE column_id = $1 AND position >= $2`,
      [targetColumnId, newPosition]
    );
    await client.query(
      `UPDATE cards SET column_id = $1, position = $2, updated_at = NOW() WHERE id = $3`,
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

// --------------------
// API
// --------------------

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
  console.log(`Kanban running on http://localhost:${PORT}`);
});