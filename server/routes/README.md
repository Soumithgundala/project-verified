# server/routes — HTTP API Layer

Three Express routers that expose the GitPulse engine over HTTP. Every route validates input, resolves the tenant, calls into `server/utils/`, and returns structured JSON.

---

## `repoRoutes.js` — Core Analysis Pipeline

The largest and most important route file. Handles repository analysis, evidence reports, and human override storage.

### `POST /api/link-repo`

**Purpose:** Full forensic analysis of a GitHub repository.

**Body:** `{ githubUrl: "https://github.com/owner/repo" }`

**Flow:**
1. `parseGithubUrl(githubUrl)` → extract `{ owner, repo }`
2. Fetch latest 10 commits from GitHub API
3. For each commit pair: parse diffs with `splitDiff()`, build AST trees, compute Zhang-Shasha Tree Edit Distance, normalize to a 0–1 score
4. Check `DiskCache` — if same SHA and module versions match, skip recomputation
5. `extractProjectFingerprints()` — score and download top 5 logic files
6. For each file:
   - Parse with Tree-sitter
   - `generateStructuralHash()` → Strike 1 exact lookup in `ast_hash_db`
   - `generateWinnowingFingerprints()` → collect project-wide fingerprints
7. `queryDualStore()` → fuzzy Winnowing match against corpus
8. If `projectContainment < 0.3`: trigger coverage-based expansion (scan files 6–10)
9. If no match: `huntGlobalClones()` → GitHub Code Search Strike 2
10. `generateLLMSummary()` → AI semantic analysis
11. `saveSubmission()` → persist forensic record
12. `DiskCache.set()` → cache result

**Response:**
```json
{ "success": true, "submissionId": "uuid", "commits": [...], "intelligence": {...}, "analysis": {...} }
```

---

### `GET /api/report/:submissionId`

**Purpose:** Build and return a full forensic evidence report for a past analysis.

**Flow:**
1. `getSubmission(submissionId)` → load stored fingerprints
2. `getDetailedMatches(studentFPs)` → get position data for all matched hashes
3. `getDocumentsMetadata(docIds)` → resolve sourceUrls, sourceOrigin per matched doc
4. `buildProjectReport(fps, matches, meta)` → full evidence report with segments, confidence, classification
5. `listReviewOverrides(submissionId)` → load human decisions
6. Filter `ignore_source` sources out of the evidence report
7. Apply `mark_plagiarism` / `mark_acceptable` overrides to `plagiarismType`

**Response:**
```json
{
  "evidenceReport": {
    "projectContainment": 78,
    "dominanceScore": 92,
    "plagiarismType": "FULL_CLONE",
    "sources": [{ "sourceUrl": "...", "containment": 72, "topSegments": [...] }]
  },
  "humanOverrides": [{ "action": "mark_plagiarism", "reason": "...", "reviewerId": "..." }]
}
```

---

### `POST /api/submissions/:submissionId/override`

**Purpose:** Record a professor's manual decision about a submission.

**Body:** `{ action, sourceUrl?, reason, reviewerId? }`

**Validation:**
- `action` must be one of: `mark_plagiarism`, `mark_acceptable`, `ignore_source`
- `sourceUrl` required when `action = "ignore_source"`
- `reason` is **required** — returns 400 if empty
- Submission must exist for this tenant

**Response:** `{ "success": true, "override": { overrideId, action, reason, ... } }`

---

## `documentRoutes.js` — Document Audit

### `POST /api/audit-document`

**Purpose:** Cross-reference a student's `.docx` project report against their GitHub repository to detect technology claim mismatches.

**Body (multipart/form-data):**
- `document` — `.docx` file (max 10MB)
- `githubUrl` — the repository to verify against

**Flow:**
1. `multer` validates MIME type and size
2. `cleanupExpiredUploadArchives()` — housekeeping
3. Log upload to `upload_archives` with TTL
4. `mammoth.extractRawText()` → strip Word formatting to plain text
5. **Fuzzy Window Slicer:** regex search for section headers ("Technologies Used", "Implementation", etc.) and extract ±6KB window around them
6. `normalizeTechClaims(textSlice)` → LLM extracts and normalizes claim list (e.g., `['react', 'node', 'flask']`)
7. Fetch latest SHA from GitHub
8. `verifyTechStack(owner, repo, sha, claims)` → scan repo files for each claimed import
9. `alignmentScore = verified / total × 100`
10. Update `upload_archives` with `verification_status = 'processed'`

**Response:**
```json
{ "alignmentScore": 85, "matrix": [{ "name": "react", "status": "Verified ✓" }], "claimsDetected": ["react", "node"] }
```

---

## `adminRoutes.js` — Corpus Management

### `GET /api/admin/quarantine`
Returns all pending quarantine items (metadata only, no raw code).

### `POST /api/admin/quarantine/:id/promote`
Promotes a quarantined clone into the trusted corpus:
1. `getQuarantineItem(id)` → fetch raw code + metadata
2. Parse with Tree-sitter, validate syntax
3. `generateWinnowingFingerprints()` → generate fingerprints
4. `enqueueIngestion(async () => { saveToDualStore(); removeFromQuarantine(); })` → background job
5. Returns `{ jobId }` immediately — check `/api/queue/status` for completion

### `GET /api/admin/whitelist`
Lists all boilerplate hashes currently whitelisted.

### `POST /api/admin/whitelist`
Adds a new hash to the whitelist. Body: `{ hash, reason }`.

### `DELETE /api/admin/whitelist/:hash`
Removes a hash from the whitelist.

---

## Shared Patterns

### Tenant Isolation
Every route calls `resolveTenantId(req)` as its first action. This key is passed to every DB function, ensuring all queries are scoped: `WHERE tenant_id = ?`.

### Error Handling
All routes are wrapped in `try/catch`. Errors return `{ success: false, message: err.message }` with appropriate HTTP status codes (400 for client errors, 404 for not found, 500 for server errors).

### Module Versions
`repoRoutes.js` defines `MODULE_VERSIONS` constants. When algorithm logic changes, bumping a version number automatically invalidates the disk cache for that module, forcing a recomputation on the next request.

---

## `documentRoutes.js` Additions

### `POST /api/documents/upload`

**Purpose:** Upload a PDF, persist it on disk, enqueue it for LaBSE vectorization, and return `202 Accepted`.

**Body (multipart/form-data):**
- `document` â€” `.pdf` file

**Flow:**
1. `multer` writes the file into `server/uploads/documents/<tenantId>/`
2. Insert a `document_ingestions` row with `status = 'pending'`
3. Push `{ filePath, documentId, tenantId }` onto the Redis/BullMQ queue
4. Mark the row `processing` and return the job id immediately

### `POST /api/internal/job-complete`

**Purpose:** Internal callback from the Python worker after ChromaDB persistence.

**Body:** `{ documentId, tenantId, status, errorMessage? }`

**Flow:**
1. Optional shared-secret header check via `X-Internal-Job-Token`
2. Update `document_ingestions.status`
3. Stamp `completed_at` for terminal statuses
4. Save any worker error message for debugging
