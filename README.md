# GitPulse — Forensic Code Integrity Engine

GitPulse is a production-grade, multi-tenant plagiarism detection and academic integrity verification platform. It uses **AST-based structural fingerprinting**, **Winnowing**, **IDF-weighted uniqueness scoring**, and **LLM semantic analysis** to detect plagiarism at the project level — not just the file level.

Unlike simple text-diff tools, GitPulse:
- Is **rename-proof** (ignores variable names, uses grammar structure)
- Is **reorder-resistant** (detects split and shuffled copies)
- Provides **line-level evidence** for courtroom-grade reporting
- Supports **human-in-the-loop override** with immutable audit logging
- Runs **multi-file cross-project aggregation** to catch subtle evasion

---

## System Architecture

```
┌──────────────────────────────────────────────────────────┐
│                        FRONTEND (React/Vite)              │
│  GitPulseDashboard.jsx  ·  ClassroomMatrix.jsx             │
│  GithubConnect.jsx  ·  GitPulseMVP.jsx                    │
└──────────────────────────┬───────────────────────────────┘
                           │ HTTP API
┌──────────────────────────▼───────────────────────────────┐
│                   EXPRESS SERVER (server/)                │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ ROUTES                                              │ │
│  │  repoRoutes.js    → GitHub repo analysis pipeline   │ │
│  │  documentRoutes.js → .docx report verification     │ │
│  │  adminRoutes.js   → Quarantine & corpus management  │ │
│  └──────────────┬──────────────────────────────────────┘ │
│                 │                                         │
│  ┌──────────────▼──────────────────────────────────────┐ │
│  │ CORE ENGINE (utils/)                                │ │
│  │                                                     │ │
│  │  parserInit.js    → Tree-sitter (AST parser)        │ │
│  │  astRadar.js      → File scoring + fingerprinting   │ │
│  │  fingerprintIndex.js → Dual-store DB + IDF lookup   │ │
│  │  astHashDb.js     → Exact-hash DB + quarantine      │ │
│  │  evidenceMapper.js → Segment merging + scoring      │ │
│  │  ai_wrapper.js    → Groq/Gemini/OpenAI cascade      │ │
│  │  diskCache.js     → Persistent JSON disk cache      │ │
│  │  ingestionQueue.js → Background job queue           │ │
│  │  submission.js    → Submission + override CRUD      │ │
│  │  tenant.js        → Multi-tenant API key resolver   │ │
│  │  urlUtils.js      → GitHub URL parser               │ │
│  └──────────────┬──────────────────────────────────────┘ │
│                 │                                         │
│  ┌──────────────▼──────────────────────────────────────┐ │
│  │ DATABASE (db/)    → SQLite via better-sqlite3       │ │
│  │  database.js      → Schema + migrations             │ │
│  │  migrate.js       → Manual migration runner         │ │
│  │  seedWhitelist.js → Boilerplate hash seeder         │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ JOBS (jobs/)                                        │ │
│  │  cleanupJob.js    → 6-hour TTL quarantine cleanup   │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ SCRIPTS (scripts/)                                  │ │
│  │  seedTutorials.js     → Seeds corpus from GitHub   │ │
│  │  calibrateEvidence.js → Tunes detection thresholds │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## Complete Request Flow

### Flow 1: Repository Integrity Analysis (`POST /api/link-repo`)

```
Client sends { githubUrl } 
    → resolveTenantId(req)        [identify which college]
    → parseGithubUrl(url)         [extract owner/repo]
    → GitHub API: fetch commits
    → Run Zhang-Shasha Tree Edit Distance on each commit pair
    → [CACHE CHECK] DiskCache.get(cacheKey)
    
    IF cache miss or new commits:
        → extractProjectFingerprints()   [astRadar.js]
            → Fetch repo file tree from GitHub API
            → Filter: exclude node_modules, dist, minified files
            → Download top 10 candidates
            → Score each file: (AST_nodes × 0.6) + (functions × 0.3) + (unique_tokens × 0.1)
            → Return top 5 logic-heavy files
        
        → For each file:
            → parser.parse(rawCode)           [parserInit.js]
            → generateStructuralHash(rootNode) → SHA-256 exact hash
            → lookupFingerprints([hash])       [astHashDb.js]
            → generateWinnowingFingerprints(rootNode, k=15, w=40, fileName)
                → AST traverse → normalized type sequence
                → Slide k-gram window → djb2 hash each gram
                → Winnowing: pick minimum hash per window
                → Return fingerprints with startLine/endLine/fileName
        
        → Aggregate all fingerprints across 5 files
        
        IF exact hash match found:
            → globalOriginality = "Exact Clone Detected" (100%)
        ELSE:
            → queryDualStore(allFingerprints)  [fingerprintIndex.js]
                → Lookup Winnowing hashes in fingerprint_index table
                → Compute IDF uniqueness per hash
                → Return best matching source + containment score
            
            IF containmentScore < 0.3 AND dominance < 0.4:
                → extractProjectFingerprints(offset=5, limit=5, lightweight=true)
                → Scan next 5 files (coverage-based expansion)
                → Re-run dual store query with expanded fingerprints
            
            IF winnowing match found:
                → globalOriginality = "Partial Clone Detected"
            ELSE:
                → huntGlobalClones(anchorString) → GitHub Code Search API
                → Strike 2: AST Showdown (node count comparison)
                → IF similarity > 90%: queueForCorpusReview()  [astHashDb.js]
        
        → generateLLMSummary(fileName, rawCode)  [ai_wrapper.js]
            → Groq (primary) → Gemini (fallback) → OpenAI (tertiary)
    
    → saveSubmission({ fingerprints, results, tenantId })  [submission.js]
    → DiskCache.set(cacheKey, result)
    → res.json({ submissionId, ...finalPayload })
```

### Flow 2: Evidence Report (`GET /api/report/:submissionId`)

```
Client requests report for submissionId
    → getSubmission(submissionId)          [submission.js]
    → getDetailedMatches(studentFPs)       [fingerprintIndex.js]
        → Query fingerprint_positions table for each hash
        → Compute IDF uniqueness per hash (log(totalDocs / docFreq))
        → Return matchesByDoc with full position data
    → getDocumentsMetadata(docIds)
        → Fetch sourceUrl, fileName, sourceOrigin per docId
    → buildProjectReport(fps, matchesByDoc, meta)  [evidenceMapper.js]
        → mergeSegments() per source, per file
        → filterNoise() (min 3 FPs, min 30 bytes)
        → computeConfidence() → density + length + uniqueness + coherence
        → calibrateConfidence() → human label
        → Source reputation weighting (trustWeight)
        → Dominance scoring
        → Triple-gate classification (absolute + relative + coherence)
    → listReviewOverrides(submissionId)    [submission.js]
    → Apply ignored sources filter
    → Apply human override to plagiarismType
    → res.json({ evidenceReport, humanOverrides })
```

### Flow 3: Human Override (`POST /api/submissions/:id/override`)

```
Professor clicks "Mark as plagiarism" + enters reason
    → Validate action ∈ { mark_plagiarism, mark_acceptable, ignore_source }
    → Validate reason is not empty (REQUIRED for audit)
    → getSubmission() — confirm submission exists
    → saveReviewOverride({ action, reason, reviewerId, tenantId })
        → Append-only INSERT to review_overrides
        → Never overwrites existing decisions
    → res.json({ override })
```

### Flow 4: Document Audit (`POST /api/audit-document`)

```
Professor uploads .docx + provides GitHub URL
    → multer: validate MIME type + size limit
    → mammoth.extractRawText() → strip formatting, get plain text
    → Fuzzy Window Slicer: find "Technologies Used" section ±6KB
    → normalizeTechClaims(textSlice) [ai_wrapper.js]
        → LLM extracts package names → ['react', 'node', 'flask']
    → verifyTechStack(owner, repo, sha, claims) [astRadar.js]
        → For each claimed library: check if imported anywhere in repo
        → Returns matrix: [{ name, status: 'Verified' | 'Missing' | 'Suspicious' }]
    → alignmentScore = verified / total × 100
    → res.json({ alignmentScore, matrix })
```

### Flow 5: Admin Corpus Promotion (`POST /api/admin/quarantine/:id/promote`)

```
Admin reviews quarantined clone
    → getQuarantineItem(id) → fetch raw code + metadata
    → parser.parse(rawCode) → validate syntax
    → generateWinnowingFingerprints(rootNode)
    → enqueueIngestion(async () => {
          saveToDualStore(fingerprints, sourceUrl, fileName, {
              sourceType: 'trusted_corpus',
              verificationStatus: 'verified'
          })
          removeFromQuarantine(id)
      })
    → res.json({ jobId })
```

---

## Project Setup

### Prerequisites
- Node.js 18+
- A GitHub Personal Access Token
- (Optional) Groq, Gemini, or OpenAI API keys

### Installation

```bash
# Install frontend dependencies
npm install

# Install server dependencies
cd server && npm install && cd ..

# Copy environment template
cp server/.env.example server/.env
# Fill in GITHUB_TOKEN, GROQ_API_KEY, etc.
```

### Environment Variables (`server/.env`)

| Variable | Required | Description |
|---|---|---|
| `GITHUB_TOKEN` | Yes | GitHub PAT for API calls |
| `GROQ_API_KEY` | Yes | Primary LLM provider |
| `GEMINI_API_KEY` | No | Fallback LLM |
| `OPENAI_API_KEY` | No | Tertiary LLM fallback |
| `DEFAULT_TENANT_ID` | No | Default tenant (default: `'default'`) |
| `SQLITE_DB_PATH` | No | Custom DB path relative to server/ |
| `GP_FULL_CLONE_CONTAINMENT` | No | Classification threshold (default: `0.8`) |
| `GP_FULL_CLONE_DOMINANCE` | No | Dominance threshold (default: `0.7`) |
| `GP_MOSAIC_MIN_SOURCES` | No | Min sources for MOSAIC (default: `3`) |
| `GP_PARTIAL_CLONE_CONTAINMENT` | No | Partial clone threshold (default: `0.4`) |

### Running

```bash
# Start frontend dev server
npm run dev

# Start backend (from /server)
cd server && node index.js

# Seed the reference corpus (run once)
cd server && node scripts/seedTutorials.js

# Run calibration to validate thresholds
npm run calibrate:evidence
```

---

## Multi-Tenant Architecture

Every database row is partitioned by `tenant_id`. API keys in the `Authorization: Bearer <key>` header resolve to a tenant:

```
Bearer abc123 → college_A
Bearer xyz789 → college_B
(no key)      → default
```

This means different institutions share the same server but never see each other's data.

---

## Classification Labels

| Label | Meaning |
|---|---|
| `FULL_CLONE` | >80% containment, >70% from one source |
| `MOSAIC` | Stitched from 3+ sources, 8+ segments, ratio > 20% |
| `PARTIAL_CLONE` | >40% containment but lower dominance |
| `LOW_CONFIDENCE` | Fewer than 25 matches, <8% relative, no coherent block |
| `BOILERPLATE_HEAVY` | Primary source is known boilerplate (React template, etc.) |
| `HUMAN_CONFIRMED_PLAGIARISM` | Professor manually confirmed |
| `HUMAN_MARKED_ACCEPTABLE` | Professor cleared it (with reason on record) |

---

## Directories

| Path | Purpose |
|---|---|
| `server/` | Node.js/Express forensic backend |
| `server/db/` | SQLite schema, migrations, seeding |
| `server/routes/` | HTTP API endpoint handlers |
| `server/utils/` | Core forensic engine modules |
| `server/jobs/` | Background scheduled tasks |
| `server/scripts/` | Admin CLI tools |
| `src/` | React frontend |
| `src/components/` | React UI components |

> See the README.md inside each directory for detailed function-level documentation.