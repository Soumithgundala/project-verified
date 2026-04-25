# GitPulse Strategic Roadmap: Transitioning to an Enterprise Platform

This roadmap tracks the evolution of GitPulse from a fragile "exact-match" MVP to a robust, self-learning "fuzzy-match" enterprise forensic engine. 

---

## Phase 1: The Forensic Foundation (Fuzzy Detection) - **[COMPLETED]**
*Goal: Replace "exact string matching" with structural fingerprinting to neutralize surface-level code plagiarism (e.g., variable renaming, code shifting).*

### Functions Completed:
- `generateWinnowingFingerprints(rootNode, k, w)`: Implemented the Positional Winnowing algorithm to generate fingerprint sequences including byte-positions (`startPos`, `endPos`).
- `getNormalizedType(node)`: Normalization layer added to strip comments, standardize identifiers (mapped to `VAR`), and canonicalize literals before hashing.
- `saveToDualStore(fingerprints, sourceUrl, fileName)`: Created the dual-store JSON architecture separating the Inverted Index for fast retrieval from the Document Store for evidence mapping.
- `queryDualStore(studentFingerprints)`: Containment Scorer implemented replacing Jaccard similarity. Accurately calculates exactly how much of a student's code is "contained" within a source (`containmentScore`).

---

## Phase 2: The Integrity Corpus (Self-Learning & Guardrails) - **[COMPLETED]**
*Goal: Build an "offline brain" allowing the system to get smarter while protecting the database from poisoning by unverified code.*

### Functions Completed:
- `queueForCorpusReview(...)`: Added to the "Two-Strike" logic so that new GitHub clones are sent to a Quarantine Queue instead of auto-ingesting.
- `seedTutorials.js`: Background script deployed to scrape and fingerprint popular YouTube tutorial repositories for specific assignments.
- `POST /api/admin/quarantine/:id/promote`: Admin promotion utility built for "Human-in-the-loop" review to parse, winnow, and promote quarantined code to the trusted reference corpus.
- `router.post('/link-repo')` (in `repoRoutes.js`): Updated Inverted Index Lookup. Prioritizes the local offline index (`queryDualStore`) for Strike 1 over the GitHub API (`huntGlobalClones`) for Strike 2.

---

## Phase 3: Infrastructure Scaling (Relational Transition) - **[TO DO]**
*Goal: Migrate away from JSON files to a professional database structure to handle multi-college onboarding without bottlenecks.*

### Functions To Do:
- `migrateToSQLite()`: Migrate the Inverted Index and Document Store into a relational SQLite database (tables: `fingerprint_index`, `file_metadata`, `fingerprint_positions`).
- `checkBoilerplateWhitelist(hash)`: Build a "Whitelisted Hashes" mechanism containing common framework boilerplate (e.g., React `index.js`, standard Express setups) to prevent false positives.
- `ingestDocumentWorker(job)`: Implement a worker queue (like BullMQ) to handle async document ingestion in the background to prevent UI freezing during large uploads.

---

## Phase 4: Auditability & Defense (The Evidence UI) - **[TO DO]**
*Goal: Turn raw scores into an explainable map of evidence that professors can use in disciplinary hearings.*

### Functions To Do:
- `buildEvidenceMap(studentFingerprints, sourceFingerprints)`: Correlate student byte-ranges with source byte-ranges for direct mapping.
- `<TurnitinViewer />`: Build a frontend React component to highlight copied code blocks side-by-side with the original source.
- `generateInterrogationQuestions(evidenceMap)`: Finalize the AI Viva interrogation module to generate context-aware questions based on specific Containment failures found in the Alignment Matrix.
- `GitPulsePdfReport.generatePdf(...)`: Enhance the existing PDF Audit Trail to include specific receipts (hashes and source URLs) for every flagged segment.

---

## Phase 5: SaaS Maturity (Scale & Multi-tenancy) - **[TO DO]**
*Goal: Prepare the product for wide-scale commercial release as a multi-tenant SaaS.*

### Functions To Do:
- `schema.sql` (Multi-tenant update): Update the database schema to isolate data between different colleges using a `tenant_id`.
- `handleGithubWebhook(event)`: Move from PAT to a GitHub App using webhooks to automatically scan code when a student pushes a commit.
- `calculateLSH(fingerprints)`: Implement Locality Sensitive Hashing (LSH) or MinHash to group similar files together and speed up candidate retrieval if the database scales to millions of fingerprints.
