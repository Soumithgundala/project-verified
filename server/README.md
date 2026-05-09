# server/ — Backend Root

The Express.js server for the GitPulse forensic engine.

## Entry Point: `index.js`

The server boots in four steps:

```js
app.listen(PORT, async () => {
  await initGitPulseParser();  // Load 4 Tree-sitter .wasm grammars
  startCleanupJob();           // Start 6-hour quarantine TTL loop
});
```

### Routes registered at startup

| Mount Path | Router File | Handles |
|---|---|---|
| `/api` | `repoRoutes.js` | Repo analysis, reports, overrides |
| `/api` | `documentRoutes.js` | `.docx` document audits |
| `/api/admin` | `adminRoutes.js` | Quarantine, whitelist management |
| `/api/queue/status` | inline | Ingestion job status |

### `.wasm` Grammar Files

The four Tree-sitter grammar files (`tree-sitter-javascript.wasm`, `tree-sitter-python.wasm`, `tree-sitter-java.wasm`, `tree-sitter-c.wasm`) live here alongside `index.js` because `parserInit.js` resolves their paths relative to `__dirname` of the server root.

---

## `env.js`

Loads `server/.env` into `process.env` at the very first line of `index.js` (`import './env.js'`). This runs before any other module so all environment variables are available immediately during initialization (e.g., `database.js` reads `SQLITE_DB_PATH`, `ai_wrapper.js` reads `GROQ_API_KEY`).

---

## `package.json` (server)

The server has its own `package.json` separate from the frontend. Key dependencies:

| Package | Purpose |
|---|---|
| `express` | HTTP server framework |
| `better-sqlite3` | Synchronous SQLite (fast, no async overhead) |
| `web-tree-sitter` | WebAssembly-based AST parser |
| `axios` | GitHub API HTTP calls |
| `p-queue` | Background job concurrency control |
| `groq-sdk` | Primary LLM provider |
| `@google/genai` | Gemini fallback LLM |
| `openai` | Tertiary LLM fallback |
| `mammoth` | Extract text from `.docx` files |
| `multer` | Multipart file upload handling |

---

## `.cache/` Directory

Auto-created at startup. Contains:
- `gitpulse.db` — the SQLite database (all fingerprints, submissions, overrides)
- `repoCache.json` — the disk-persisted analysis cache (survives restarts)

**Do not commit `.cache/` to version control.** It is in `.gitignore`.

---

## Sub-directories

| Directory | Purpose |
|---|---|
| `db/` | Database schema, migrations, seeding |
| `routes/` | HTTP API endpoint handlers |
| `utils/` | Core forensic engine modules |
| `jobs/` | Background scheduled tasks |
| `scripts/` | Admin CLI tools |

> See the README inside each sub-directory for detailed documentation.
