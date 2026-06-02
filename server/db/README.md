# server/db — Database Layer

SQLite persistence backbone for the forensic engine using `better-sqlite3`.

## Files

| File | Purpose |
|---|---|
| `database.js` | Schema, migrations, singleton DB export |
| `migrate.js` | Manual structural migration runner |
| `seedWhitelist.js` | Boilerplate hash seeder |

---

## Tables

### `fingerprint_index`
Winnowing inverted index: `(tenant_id, hash) → doc_ids JSON[]`
- O(1) lookup: given a student hash, find which corpus documents contain it.

### `file_metadata`
One row per ingested corpus document:
- `doc_id`, `source_url`, `file_name`, `exact_hash`, `source_origin` (`verified_internal_corpus` | `boilerplate` | `github_random`)
- Used by evidence mapper to resolve `docId → sourceUrl + fileName` for report links.

### `fingerprint_positions`
Position of each Winnowing hash within its source file:
- `(doc_id, hash, start_pos, end_pos, start_line, end_line, tenant_id)`
- `start_line/end_line` are 1-indexed from the Tree-sitter AST.
- Enables line-level highlighting in the Turnitin-style UI.

### `ast_hash_db`
Exact-hash lookup table for Strike 1:
- `(tenant_id, hash) → entries JSON[]` (each entry: `{ url, file, addedAt }`)
- Whole-file SHA-256 structural hash. An instant match = "Exact Clone Detected."

### `whitelisted_hashes`
Hashes to permanently ignore (boilerplate patterns):
- `(tenant_id, hash, reason, added_at)`
- Populated by `seedWhitelist.js`. Prevents common React/Express patterns from inflating scores.

### `quarantine_queue`
Metadata for clones pending admin review:
- `(id, payload JSON, expires_at)` — 30-day TTL.
- Nothing enters the trusted corpus until an admin promotes it.

### `quarantine_code`
Raw source code for quarantined items (separate for security):
- `(quarantine_id, raw_code, expires_at)`
- `CASCADE DELETE` from `quarantine_queue` — deleting the queue entry removes the code too.

### `ingestion_jobs`
Background job audit log:
- `(id, description, status, started_at, completed_at, error_message)`
- Status: `queued → running → completed | failed`

### `upload_archives`
Audit trail for every `.docx` document upload:
- `(id, original_name, mime_type, size_bytes, expires_at, verification_status)`

### `document_ingestions`
Tracks PDF uploads that move through the Redis/BullMQ vectorization pipeline:
- `(id, filename, file_path, status, job_id, error_message, completed_at)`
- `status` values: `pending`, `processing`, `completed`, `failed`

### `submissions`
Full forensic record of each repository analysis:
- `(submission_id, owner, repo, sha, student_fingerprints JSON, analysis_results JSON, tenant_id)`
- The `/api/report/:submissionId` endpoint reads this to reconstruct evidence reports.

### `review_overrides`
Immutable append-only human decision log:
```sql
override_id TEXT PRIMARY KEY
submission_id TEXT  -- FK → submissions ON DELETE CASCADE
action TEXT         -- 'mark_plagiarism' | 'mark_acceptable' | 'ignore_source'
reason TEXT NOT NULL -- mandatory explanation
reviewer_id TEXT    -- who made the decision
```
- `reason NOT NULL` forces accountability. Never updated, only inserted.

---

## Key Internal Functions

### `addColumnIfMissing(table, column, type)`
Reads current schema, only runs `ALTER TABLE ADD COLUMN` if column is absent. Safe to call on every startup.

### `hardenCoreTable(tableName)`
Backfills audit metadata (`source_type`, `verification_status`, `retention_policy`, `tenant_id`) on rows created before these columns existed.

### `migrateTenantKeyedHashTable(tableName, createSql, copySql)`
Heavy migration for the fingerprint tables. Renames old table to `_legacy`, creates new composite-key table, copies all data, drops legacy. Only runs if old `key_id` column is detected.

---

## Setup

```bash
# Seeds boilerplate whitelist (run once)
node server/db/seedWhitelist.js

# Custom DB path (in server/.env)
SQLITE_DB_PATH=../data/production.db
```
