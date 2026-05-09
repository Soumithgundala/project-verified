# server/utils — Core Forensic Engine

This directory contains every module of the GitPulse detection engine. Each file is a focused, single-responsibility module. They are orchestrated by the route handlers in `server/routes/`.

---

## Module Map

```
parserInit.js      → Initialize Tree-sitter AST parsers (JS, Python, Java, C)
astRadar.js        → File scoring, fingerprint generation, GitHub clone hunting
fingerprintIndex.js → Dual-store DB: read/write Winnowing fingerprints with IDF scoring
astHashDb.js       → Exact-hash DB + quarantine queue management
evidenceMapper.js  → Segment merging, scoring, classification, report building
ai_wrapper.js      → LLM cascade (Groq → Gemini → OpenAI)
diskCache.js       → Persistent JSON disk cache (survives restarts)
ingestionQueue.js  → Background job queue with p-queue
submission.js      → Submission CRUD + human override audit log
tenant.js          → Multi-tenant API key resolver
urlUtils.js        → GitHub URL parser
```

---

## `parserInit.js`

Initializes the Tree-sitter WebAssembly parser exactly once at server startup.

### Exports

#### `initGitPulseParser()` → `async`
Called by `server/index.js` at boot time. Loads four `.wasm` grammar files:
- `tree-sitter-javascript.wasm` — covers `.js`, `.jsx`, `.ts`, `.tsx`
- `tree-sitter-python.wasm`
- `tree-sitter-java.wasm`
- `tree-sitter-c.wasm` — covers `.c`, `.h`

#### `parser` (singleton)
The shared `web-tree-sitter` parser instance. All code that needs to parse uses this singleton by setting the language grammar before calling `.parse()`.

#### `grammars` (object)
```js
{ javascript: Language, python: Language, java: Language, c: Language }
```

#### `extensionMap` (object)
Maps file extensions to grammar keys:
```js
'.js' → 'javascript', '.py' → 'python', '.java' → 'java', '.c' → 'c'
```

#### `splitDiff(patch)` → `{ oldCode, newCode }`
Splits a GitHub unified diff patch into the old and new code blocks for AST comparison. Strips `+`, `-`, `@@` headers so Tree-sitter can parse clean code.

---

## `astRadar.js`

The intelligence core. Handles all GitHub API interactions, AST fingerprinting, and clone hunting.

### Exports

#### `generateStructuralHash(rootNode)` → `string` (SHA-256 hex)
Produces a rename-proof structural hash of an entire AST. Traverses every node and encodes **only the grammar type** (e.g., `if_statement:binary_expression:identifier`), ignoring all variable names and string values.

**Why it's rename-proof:** Two programs that differ only in variable names produce identical hashes.

#### `generateWinnowingFingerprints(rootNode, k=15, w=40, fileName)` → `Fingerprint[]`
The Winnowing algorithm. Breaks the AST into overlapping k-grams, hashes each, then slides a window of size `w` picking the minimum hash in each window.

**Step by step:**
1. `traverse(node)`: Walk the AST, apply `getNormalizedType()` to each node.
2. `getNormalizedType()`: Maps nodes to normalized tokens: identifiers → `VAR`, numbers → `NUM`, strings → `STR`, operators → `PLUS`/`EQ`/etc. Comments → `null` (skip).
3. Build k-grams: slide a window of `k` tokens, join types as `TYPE:TYPE:TYPE...`, djb2 hash the string.
4. Winnowing: slide window of `w` k-grams, keep minimum hash per window (right-most tie-break for stability).
5. Return unique fingerprints with `{ hash, startPos, endPos, startLine, endLine, fileName }`.

**`k=15`:** 15 AST nodes = roughly one logical statement. Too small = noise. Too large = misses partial copies.
**`w=40`:** Window of 40 k-grams before picking minimum. Controls fingerprint density.

#### `extractProjectFingerprints(owner, repo, latestSha, headers, options)` → `FileSummary[]`
Multi-file project scanner. Returns the top N logic-heavy files from a repository.

**Flow:**
1. Fetch repo file tree via `GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1`
2. Filter: remove `node_modules`, `dist`, `build`, minified files, test files
3. Cap: files < 200 bytes or > 150KB are excluded
4. Download top `candidateLimit` (default: 10) files by byte size
5. Skip single-line files (minified catcher)
6. Score each file: `(AST_nodeCount × 0.6) + (functionCount × 0.3) + (uniqueTokens × 0.1)`
7. Return top `limit` (default: 5) files sorted by score

**Options:**
- `candidateLimit` — how many to download (default: 10)
- `limit` — how many to return (default: 5)
- `offset` — for coverage-based expansion scans (default: 0)
- `lightweight` — skip anchor string extraction (faster for expansion scans)

#### `huntGlobalClones(anchorString, owner, repo, headers, firstCommitDate)` → `{ status, matches, matchedCode }`
Strike 2 GitHub Code Search. Takes an anchor string (a distinctive line from the student's code) and searches GitHub globally for repositories containing it. Filters out the student's own repo. If a match predates the student's first commit, flags it as a potential source.

#### `verifyTechStack(owner, repo, latestSha, claims, headers)` → `MatrixItem[]`
Used by the document audit pipeline. For each technology claimed in the student's report (e.g., `['react', 'node', 'flask']`), searches the repository files for matching `import`, `require`, or `import()` statements.

Returns: `[{ name: 'react', status: 'Verified ✓' | 'Missing ✗' | 'Suspicious ?' }]`

---

## `fingerprintIndex.js`

The **Dual-Store** — the main Winnowing fingerprint database. Handles both writing (during corpus ingestion) and reading (during detection).

### Exports

#### `saveToDualStore(fingerprints, sourceUrl, fileName, options)` → `async`
Writes a set of Winnowing fingerprints into both storage structures:
1. **`fingerprint_index`**: Updates the hash → docIds inverted index (insert or append docId to existing list)
2. **`fingerprint_positions`**: Inserts the exact `start_pos`, `end_pos`, `start_line`, `end_line` of each hash within the source file
3. **`file_metadata`**: Upserts source document metadata (`sourceUrl`, `fileName`, `sourceOrigin`, etc.)

All three writes are wrapped in a **single SQLite transaction** for atomicity.

#### `queryDualStore(studentFingerprints, options)` → `{ sourceUrl, containmentScore }` | `null`
Fuzzy detection pass. Given the student's Winnowing fingerprints:
1. Batch-lookup all hashes in `fingerprint_index` in one query
2. For each matched hash, find which `docId`s it belongs to
3. Count how many student hashes each docId matched
4. Compute `containmentScore = matchedHashes / totalStudentHashes`
5. Return the best-matching source if score exceeds threshold

#### `getDetailedMatches(studentFingerprints, options)` → `matchesByDoc`
Used by the report endpoint. Returns the full position data for every matched fingerprint:
```js
{
  'docId-abc': [
    {
      hash, uniqueness,           // IDF-weighted
      studentFileName,            // which student file
      studentStart, studentEnd, studentStartLine, studentEndLine,
      sourceStart, sourceEnd, sourceStartLine, sourceEndLine
    }
  ]
}
```
**IDF Uniqueness calculation:**
```js
uniqueness = log(totalDocuments / documentFrequency)
// High value = rare hash = strong evidence
// Low value = common hash = weak evidence (potentially boilerplate)
```

#### `getDocumentsMetadata(docIds, tenantId)` → `{ [docId]: { sourceUrl, fileName, sourceOrigin } }`
Batch-fetches source metadata including `sourceOrigin` which drives the trust weighting system.

---

## `astHashDb.js`

Manages the **exact-hash lookup** (Strike 1) and the **quarantine system**.

### Exports

#### `lookupFingerprints(hashes, options)` → `Match[]`
Exact hash lookup in `ast_hash_db`. Each match returns `{ url, file, addedAt }`.

#### `saveFingerprints(fingerprints, sourceUrl, fileName, options)` → `async`
Upserts hashes into `ast_hash_db`. Prevents duplicate URL entries for the same hash. Wrapped in a SQLite transaction.

#### `queueForCorpusReview(payload, options)` → `id`
When Strike 2 finds a match with >90% AST similarity, instead of auto-ingesting, this function places the source into the quarantine system:
1. Splits `rawCode` from metadata (separate storage for security)
2. Inserts metadata into `quarantine_queue` with 30-day TTL
3. Inserts raw code into `quarantine_code`

Both inserts are in one transaction.

#### `getQuarantineQueue(options)` → `QueueItem[]`
Returns all pending quarantine items (metadata only, no raw code).

#### `getQuarantineItem(id, options)` → `QueueItem & { rawCode }`
Joins `quarantine_queue` and `quarantine_code` to return the full item for admin review.

#### `removeFromQuarantine(id, options)`
Deletes from both `quarantine_queue` and `quarantine_code` inside a transaction.

---

## `evidenceMapper.js`

The **forensic report builder**. Turns raw DB matches into human-readable, court-grade evidence segments.

### Flow of `buildProjectReport(studentFingerprints, matchesByDoc, documentsMetadata)`

```
For each source docId in matchesByDoc:
  1. mergeSegments(matches)
      → Group matches by studentFileName (no cross-file merging)
      → Sort by studentStart position
      → Calculate adaptive max gap (median distance × 2)
      → Merge adjacent matches if gap ≤ maxGap AND continuity ratio 0.7–1.3
      → Output: Segment { studentStart, end, startLine, endLine, sourceStart, end, startLine, endLine, fingerprintCount }

  2. filterNoise(segments)
      → Remove segments with < 3 fingerprints
      → Remove segments shorter than 30 bytes

  3. computeConfidence(segment)
      → density = min(1, fingerprintCount / expectedFPs)     weight: 25%
      → lengthScore = min(1, byteLength / 5000)              weight: 25%
      → uniquenessScore = min(1, avgIDF / 10)                weight: 50%
      → coherence = matched FPs / possible FPs in range      multiplier
      → finalScore = (0.25×density + 0.25×length + 0.50×uniqueness) × coherence

  4. calibrateConfidence(score, uniqueness)
      → score > 0.85 AND uniqueness > 0.7 → "Highly likely copied"
      → score > 0.65 → "Strong similarity"
      → score > 0.40 → "Suspicious"
      → else         → "Weak signal"

  5. validateSegmentMapping(segment)
      → Checks for inverted ranges (start > end)
      → Checks all matches are inside segment bounds
      → Returns { passed, warnings[] }

  6. Apply SOURCE_TRUST_WEIGHTS
      → previous_student_submission: 1.0
      → verified_internal_corpus:    1.0
      → tutorial_site:               0.8
      → github_random:               0.6
      → boilerplate:                 0.1
      → effectiveContainment = rawContainment × trustWeight

After all sources scored:
  7. Sort by effectiveContainment, keep top 3
  8. Dominance score = topSource.containment / sum(all containments)
  9. projectContainment = uniqueMatchedHashes / totalStudentHashes

  10. classifyPlagiarism():
      Gate 1: totalMatchedFPs < 25           → LOW_CONFIDENCE
      Gate 2: matched / total < 8%           → LOW_CONFIDENCE
      Gate 3: largestSegmentFPs < 8          → LOW_CONFIDENCE
      FULL_CLONE: containment > 80% AND dominance > 70%
      MOSAIC:     sources ≥ 3 AND segments ≥ 8 AND ratio > 20%
      PARTIAL_CLONE: containment > 40%
      else:       LOW_CONFIDENCE

  11. Compress for UI: top 5 segments per source, rest → otherMatches summary
```

---

## `ai_wrapper.js`

LLM cascade with automatic failover across three providers.

### `stripComments(code)`
Security fence. Removes all comments (JS `//`, `/* */`, Python `#`, `"""`) from code before sending to LLM to prevent prompt injection.

### `generateSummary(prompt)`
**Primary:** Groq (`llama-3.1-8b-instant`, temp 0.2) → fast and cheap
**Fallback:** Gemini (`gemini-3-flash-preview`)
**Tertiary:** OpenAI (`gpt-4o-mini`)

Throws only if all three fail.

### `analyzeRepositoryAST(repositoryName, astData)`
Strips comments, truncates to 8000 chars, sends to LLM for semantic analysis. Returns a narrative summary of what the code does.

### `normalizeTechClaims(textSlice)`
Sends a text slice from the student's project report. LLM extracts and normalizes technology names (e.g., "React.js" → "react"). Returns a flat JSON array of strings.

---

## `diskCache.js`

A persistent Map-like object backed by `server/.cache/repoCache.json`. Survives server restarts.

### API
- `get(key)` → cached value or `null`
- `set(key, value)` → stores and immediately writes to disk (`_flush()`)
- `has(key)` → boolean
- `delete(key)` → removes and flushes
- `clear()` → wipes all and flushes

Cache key format: `owner/repo` (e.g., `torvalds/linux`)

Each cached entry stores:
```js
{
  latestSha,
  commits:     { version, rawResults },
  llmSummary:  { version, data },
  originality: { version, data, studentWinnowingFps }
}
```

Module versions are bumped when algorithm logic changes to automatically invalidate stale cache entries.

---

## `ingestionQueue.js`

Background job queue using `p-queue` with concurrency limit of 2.

### `enqueueIngestion(taskFn, description, options)` → `jobId`
1. Generates a UUID job ID
2. Inserts a `queued` row into `ingestion_jobs`
3. Adds `taskFn` to the p-queue (non-blocking — returns jobId immediately)
4. When executed: updates status to `running` → `completed` | `failed`

**Why non-blocking:** The HTTP response is sent with the `jobId` immediately. The actual ingestion happens in the background. The client can poll `/api/queue/status` to check progress.

### `getQueueStatus(options)` → Queue statistics
Returns live counts from both the in-memory queue and the `ingestion_jobs` table.

### `getIngestionJob(jobId, options)` → Single job detail

---

## `submission.js`

CRUD and audit for forensic submission records.

### `saveSubmission(data)` → `submissionId`
Serializes and stores the complete analysis result (fingerprints + results) as a forensic record.

### `getSubmission(submissionId, tenantId)` → Submission
Retrieves and deserializes a submission. Returns `null` if not found or wrong tenant.

### `listSubmissions(tenantId)` → Summary[]
Returns all submission IDs, owners, repos, and timestamps for a tenant.

### `saveReviewOverride(data)` → Override record
**Critical constraints:**
- `reason` must not be empty — throws if missing
- Append-only: always INSERTs, never UPDATEs
- Stores `reviewer_id` for audit trail

### `listReviewOverrides(submissionId, tenantId)` → Override[]
Returns full audit history in chronological order (oldest first). The report endpoint uses this to apply human decisions on top of algorithmic classification.

---

## `tenant.js`

### `resolveTenantId(req)` → `string`
Reads `Authorization: Bearer <api_key>` from the request header. Maps the key to a tenant ID from the `API_KEYS` registry. Falls back to `DEFAULT_TENANT_ID` for local development.

To add a new college: add `"their_api_key": "college_name"` to the `API_KEYS` object.

---

## `urlUtils.js`

### `parseGithubUrl(url)` → `{ owner, repo }`
Strips `https://github.com/` and splits by `/`. Throws with a descriptive error if the URL is invalid or undefined. Extracted into a shared utility to prevent circular imports between route modules.
