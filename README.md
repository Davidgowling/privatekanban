# Private Kanban Starter

A simple private Kanban app designed for:

- 2 boards: **Work** and **Home**
- 4 columns on each board: **Backlog**, **This Week**, **Waiting On**, **Done**
- Drag and drop cards
- Postgres database (works with **Neon**)
- Simple single-user login
- Easy local setup and later deployment to Railway

## Setup

Install packages:

```bash
npm install
```

Copy the example environment file:

```bash
cp .env.example .env
```

Update `.env` with your Neon connection string and your chosen username/password.

Run the SQL in `init.sql` in Neon SQL Editor.

Start the app:

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

## Notes

- If the database is empty, the app auto-creates the **Work** and **Home** boards and the four default columns.
- This is a clean starter, not a finished SaaS product.
- You can deploy the same code to Railway later and keep Neon as the database.
