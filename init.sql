DROP TABLE IF EXISTS cards;
DROP TABLE IF EXISTS columns_kanban;
DROP TABLE IF EXISTS boards;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE boards (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE TABLE columns_kanban (
  id SERIAL PRIMARY KEY,
  board_id INT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(board_id, name)
);

CREATE TABLE cards (
  id SERIAL PRIMARY KEY,
  column_id INT NOT NULL REFERENCES columns_kanban(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  position INT NOT NULL DEFAULT 0,
  due_date DATE,
  color VARCHAR(20),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_boards_user_id ON boards(user_id);
CREATE INDEX idx_columns_board_id ON columns_kanban(board_id);
CREATE INDEX idx_cards_column_id ON cards(column_id);