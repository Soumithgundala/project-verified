# src/components — React UI Components

All React components that build the GitPulse user interface. Components are split into two layers: **orchestrators** (manage data fetching and state) and **presenters** (pure display, receive data via props).

---

## Component Hierarchy

```
App.jsx
├── GithubConnect.jsx          ← User input: URL + document + consent
├── ClassroomMatrix.jsx        ← Bulk CSV batch analysis (professor view)
└── GitPulseMVP.jsx            ← Single-repo analysis orchestrator
    ├── GitPulse/GitPulseNavbar.jsx    ← Top action bar
    ├── GitPulse/GitPulseDashboard.jsx ← Main analysis dashboard
    ├── GitPulse/GitPulsePdfReport.jsx ← Hidden PDF layout
    └── GitPulse/GitPulseHelpModal.jsx ← Help overlay
```

---

## Component Documentation

### `GithubConnect.jsx`

**Role:** Landing screen. Collects the GitHub URL, optional `.docx` report, and DPDPA consent before triggering analysis.

**Props:**
- `onRepoLinked(payload)` — callback called when user clicks "Link Project History". Payload: `{ url, document }`.

**State:**
- `repoUrl` — controlled input
- `auditFile` — selected `.docx` File object (optional)
- `isConsented` — DPDPA checkbox
- `error` — validation message

**Validation:**
- URL must contain `github.com`
- Consent checkbox must be checked

**Key UI Elements:**
- GitHub URL input with `LinkIcon`
- Hidden `<input type="file">` triggered by a styled `<label>` (standard accessible file upload pattern)
- DPDPA consent checkbox with animated checkmark
- Error display with `Lock` icon

---

### `GitPulseMVP.jsx`

**Role:** Orchestrator for the single-repo analysis flow. Fires two parallel API calls, merges the results, and renders the dashboard.

**Props:**
- `linkedUrl` — GitHub URL to analyze
- `auditDocument` — optional `.docx` File (from GithubConnect)
- `onReset()` — callback to return to the landing screen
- `initialData` — pre-loaded data (used by ClassroomMatrix to skip the fetch)
- `isModalView` — boolean, true when rendered inside ClassroomMatrix modal

**Two parallel API calls (via `Promise.all`):**
```
POST /api/link-repo  { url: linkedUrl }
POST /api/audit-document  (formData with githubUrl + document)  ← only if auditDocument exists
```

Results are merged: `setData({ ...repoResult, ...auditResult })`.

**PDF Generation (`handleDownloadPDF`):**
Uses `html2pdf.js` to capture the hidden `<GitPulsePdfReport />` DOM node and export it as a PDF with `A4` layout and `scale: 2` canvas resolution.

The PDF template is always rendered in the DOM but hidden (`display: none`) unless `isPrinting` is true. The web dashboard is hidden during printing (`display: 'none'` when `isPrinting = true`).

**Filename format:** `ProjectVerified_Report_{repoName}_{YYYY-MM-DD}.pdf`

---

### `GitPulse/GitPulseDashboard.jsx`

**Role:** The main interactive analysis dashboard. Displays all forensic data in a responsive bento-grid layout.

**Props:**
- `data` — the full analysis result object from the API
- `isModalView` — boolean (adjusts margins when rendered in modal)
- `isAuthentic` — boolean (true if `data.analysis.status === 'Authentic'`)

**Key Sections:**

| Section | Data Source | Purpose |
|---|---|---|
| Hero Card | `data.analysis.rewardScore` | Shows integrity score (green if authentic, red if suspect) |
| Evolution Pulse Graph | `data.pulseData` | Recharts AreaChart of scores over recent commits |
| Mini Stat Cards | `data.analysis.oldNodeCount/newNodeCount/editDistance` | Zhang-Shasha distance metrics |
| Document Alignment Matrix | `data.matrix`, `data.alignmentScore` | Technology claim verification from `.docx` |
| Commit Clusters | `data.clusters` | Categorized by score: Authentic / Standard / Suspect |
| Verified History Log | `data.commits` | Full commit timeline |
| Contributor Forensics | `data.authorStats` | Per-author commit count and average score |
| Raw CST Fragment | `data.analysis.cst` | Terminal-style display of the Tree-sitter CST output |
| Semantic Intelligence | `data.intelligence.globalOriginality` | Global clone check result + AI summary |

**Human Override System:**
- Initialized from `data.humanOverrides` (list of past decisions from the DB)
- `submitOverride(action, sourceUrl)` → `POST /api/submissions/:submissionId/override`
- State: `overrideState.status` (current decision), `overrideState.ignoredSources` (Set of ignored URLs)
- Ignored sources are filtered from `visibleMatches` in real-time (no page reload needed)
- Three actions available when plagiarism is detected:
  - **"Mark as plagiarism"** → `action: 'mark_plagiarism'`
  - **"Mark as acceptable"** → `action: 'mark_acceptable'`
  - **Ban icon next to each URL** → `action: 'ignore_source'` with that specific `sourceUrl`

> **Note for future developers:** The `reason` field is currently not collected in the frontend UI. The backend requires it. A `<textarea>` for reason input must be added before pilot deployment. The API will return a 400 error without it.

---

### `GitPulse/GitPulsePdfReport.jsx`

**Role:** A hidden DOM element that mirrors the dashboard data in a print-optimized layout for `html2pdf.js` to capture.

This component renders at all times but is only visible when `isPrinting = true`. It produces a structured A4-formatted document with:
- Cover block with repo name and scan date
- Integrity score and status
- Commit history table
- Contributor forensics table
- Global originality finding
- AI semantic summary

---

### `GitPulse/GitPulseNavbar.jsx`

**Role:** Top action bar for the analysis view.

**Props:** `isModalView`, `isPrinting`, `setShowHelpModal`, `data`, `loading`, `handleDownloadPDF`, `onReset`

**Buttons:**
- **Download PDF** — calls `handleDownloadPDF()`. Disabled during loading or while `isPrinting`.
- **Help (?)** — opens `GitPulseHelpModal`
- **Reset** — calls `onReset()`. Hidden in modal view (ClassroomMatrix handles its own close).

---

### `GitPulse/GitPulseHelpModal.jsx`

**Role:** Overlay modal explaining what each dashboard section means to end users (educators).

**Props:** `show: boolean`, `onClose: function`

Rendered inside `GitPulseMVP` with a portal-style overlay. Appears on top of the dashboard when `showHelpModal = true`.

---

### `ClassroomMatrix.jsx`

**Role:** Bulk batch analysis tool. Allows a professor to upload a CSV of GitHub URLs and analyze all student projects simultaneously.

**Props:** `onReset()` — callback to return to the landing screen.

**Flow:**
1. Professor uploads a CSV file with one GitHub URL per row
2. `ClassroomMatrix` parses the CSV client-side
3. For each URL: fires `POST /api/link-repo` in parallel (with concurrency control)
4. Results are displayed in a sortable table with per-row integrity scores and status badges
5. Clicking any row opens that student's full `GitPulseMVP` dashboard in a modal

---

## Styles

CSS files are in `src/components/styles/`:

| File | Scopes to |
|---|---|
| `GitPulse/GitPulseDashboard.css` | Dashboard bento grid, cards, override buttons |
| `MatrixGrid.css` | ClassroomMatrix table layout |
| `MatrixPDF.css` | PDF export layout for batch reports |
| `MatrixShared.css` | Shared tokens for ClassroomMatrix |
| `MatrixWorkspace.css` | Workspace/modal panel layout |

All CSS is plain Vanilla CSS (no Tailwind, no CSS Modules). Utility class names are descriptive and scoped by component prefix (e.g., `.matrix-card`, `.hero-card`, `.review-action-button`).

---

## Data Flow Summary

```
User enters URL
  → GithubConnect calls onRepoLinked({ url, document })
    → App.jsx sets repoLinked = true, repoUrl, auditDocument
      → GitPulseMVP mounts, fires API calls
        → POST /api/link-repo → repoResult
        → POST /api/audit-document → auditResult (if document)
          → data = { ...repoResult, ...auditResult }
            → GitPulseDashboard renders all cards
            → GitPulsePdfReport renders hidden PDF layout
            → Professor clicks "Download PDF"
              → html2pdf captures GitPulsePdfReport DOM → saves .pdf
            → Professor clicks "Mark as plagiarism"
              → submitOverride('mark_plagiarism')
              → POST /api/submissions/:id/override
              → overrideState updated locally (no reload)
```
