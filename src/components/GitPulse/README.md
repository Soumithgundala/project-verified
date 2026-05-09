# src/components/GitPulse — Dashboard Sub-Components

This directory contains the four sub-components that together form the complete single-repo analysis view. They are all orchestrated by `GitPulseMVP.jsx` (one level up).

---

## `GitPulseDashboard.jsx`

The primary interactive UI. Renders a 12-column bento grid of forensic cards.

### Props

| Prop | Type | Description |
|---|---|---|
| `data` | `object` | Full merged API response (repo + audit results) |
| `isModalView` | `boolean` | When `true`, reduces top margin (used in ClassroomMatrix modal) |
| `isAuthentic` | `boolean` | Drives hero card color (green vs red) |

### Human Override State Machine

Initialized from `data.humanOverrides`:
```js
overrideState = {
  status: 'mark_plagiarism' | 'mark_acceptable' | null,
  ignoredSources: Set<string>,  // URLs that professor has dismissed
  saving: string | null,        // key of the action currently being saved
  error: string | null
}
```

`submitOverride(action, sourceUrl?)`:
1. Sets `saving` to prevent double-clicks
2. `POST /api/submissions/:submissionId/override`
3. On success: updates local state — `ignoredSources` grows, `status` changes
4. On failure: sets `error` message

> ⚠️ **Known Gap:** The `reason` field (mandatory on the backend) is not yet collected in this UI. The backend will return HTTP 400 until a reason input is added to the override flow. This must be resolved before pilot.

### Data Shape Expected

```js
data = {
  submissionId: "uuid",
  analysis: {
    rewardScore: 0.87,
    status: "Authentic",
    oldNodeCount: 1200, newNodeCount: 1450,
    editDistance: 250,
    cst: "program\n  function_declaration..."
  },
  pulseData: [{ name: "abc1234", score: 0.9 }, ...],
  clusters: {
    authentic: { label: "...", commits: [...] },
    standard:  { label: "...", commits: [...] },
    suspect:   { label: "...", commits: [...] }
  },
  commits: [{ sha, author, message, date }],
  authorStats: [{ name, commitCount, averageScore }],
  intelligence: {
    globalOriginality: {
      status: "Original" | "Exact Clone Detected" | "Partial Clone Detected",
      matches: ["https://github.com/..."],
      similarityScore: "94.2%"
    },
    llmSummary: "This project implements a REST API..."
  },
  humanOverrides: [{ overrideId, action, reason, reviewerId, createdAt }],
  // From audit-document endpoint (merged):
  matrix: [{ name: "react", status: "Verified ✓" }],
  alignmentScore: 85
}
```

---

## `GitPulsePdfReport.jsx`

A **print-only** component. Always rendered in the DOM but hidden (`display: none`) unless `isPrinting = true`. `html2pdf.js` renders it to a PDF when the download is triggered.

### Layout Structure (A4)

```
[GitPulse Logo]  [Repo Name]  [Scan Date]
─────────────────────────────────────────
Integrity Score: 0.87              AUTHENTIC
─────────────────────────────────────────
Commit History Table
  SHA | Author | Date | Score | Cluster
─────────────────────────────────────────
Contributor Summary
  Name | Commits | Avg Score
─────────────────────────────────────────
Global Origin Check
  Status: Original / Clone
  AST Match: 94.2%
─────────────────────────────────────────
AI Semantic Summary
  [LLM narrative text]
─────────────────────────────────────────
[Page footer: confidential / tenant info]
```

### Why a separate PDF component?

The web dashboard uses grid layouts and interactive elements that don't translate cleanly to PDF. The PDF component uses simple block/flex layouts and avoids any CSS that confuses `html2canvas` (no `overflow: hidden` on containers, no `position: sticky`).

---

## `GitPulseNavbar.jsx`

The action bar at the top of the analysis view.

### Props

| Prop | Type | Description |
|---|---|---|
| `isModalView` | `boolean` | Hides "Reset" button in modal view |
| `isPrinting` | `boolean` | Disables PDF button and shows spinner during export |
| `loading` | `boolean` | Disables PDF button while data is loading |
| `data` | `object` | Checked for null before enabling PDF button |
| `handleDownloadPDF` | `function` | Called on PDF button click |
| `setShowHelpModal` | `function` | Opens help overlay |
| `onReset` | `function` | Resets to landing screen |

### Button States

```
PDF Button:
  - Disabled if loading = true OR data = null OR isPrinting = true
  - Shows "Generating..." text during isPrinting

Reset Button:
  - Hidden entirely when isModalView = true
  - (ClassroomMatrix has its own close/navigation controls)
```

---

## `GitPulseHelpModal.jsx`

An overlay modal that explains the dashboard to non-technical users (professors and administrators).

### Props

| Prop | Type | Description |
|---|---|---|
| `show` | `boolean` | Controls visibility |
| `onClose` | `function` | Called when backdrop or close button is clicked |

### Content Sections

- **Integrity Score** — what the 0–1 score means and how it's computed
- **Evolution Pulse** — how to read the commit history graph
- **AST Nodes** — plain-English explanation of Tree-sitter node counts
- **Zhang-Shasha Distance** — why edit distance matters for authorship verification
- **Global Origin Check** — what "Exact Clone" vs "Partial Clone" means
- **Human Override** — how and when professors should use the manual review buttons

---

## Styling

Each component imports its CSS from `src/components/styles/GitPulse/`:

| Component | CSS File |
|---|---|
| `GitPulseDashboard.jsx` | `GitPulseDashboard.css` |
| `GitPulseMVP.jsx` | `GitPulseMVP.css` |

The PDF report and Help Modal use inline styles where needed to guarantee `html2pdf.js` compatibility and modal z-index stacking.
