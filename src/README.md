# src/ — React Frontend

Built with **React 19** and **Vite**. Communicates with the Express backend over HTTP at `localhost:5000`.

---

## Entry Points

| File | Role |
|---|---|
| `main.jsx` | Mounts `<App />` into `index.html` |
| `App.jsx` | Root component — manages global view state |
| `index.css` | Global CSS reset and base styles |
| `App.css` | App shell layout (navbar, footer, glass card) |

---

## `App.jsx` — View State Machine

`App.jsx` manages a two-mode state machine:

```
viewMode = 'single'                viewMode = 'bulk'
┌───────────────────────┐         ┌──────────────────────────┐
│ GithubConnect         │         │ ClassroomMatrix          │
│ (repo URL + doc upload)│         │ (CSV batch upload)       │
│          ↓            │         └──────────────────────────┘
│ GitPulseMVP           │
│ (analysis dashboard)  │
└───────────────────────┘
```

**State:**
- `repoLinked: boolean` — whether a repo URL has been submitted
- `repoUrl: string` — the GitHub URL to analyze
- `auditDocument: File | null` — optional `.docx` for cross-referencing
- `viewMode: 'single' | 'bulk'` — single repo or classroom batch mode

**Callbacks:**
- `handleConnectionSuccess(payload)` — called by `GithubConnect` when user submits. Transitions to analysis view.
- `handleReset()` — wipes all state and returns to the connection screen.

---

## Sub-directories

| Path | Purpose |
|---|---|
| `components/` | All React UI components |
| `components/GitPulse/` | Dashboard, PDF, Navbar, Help modal |
| `components/styles/` | Per-component CSS files |
| `assets/` | Static images and SVGs |

> See `src/components/README.md` for detailed component documentation.
