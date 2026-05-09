# server/scripts — Admin CLI Tools

Standalone Node.js scripts for seeding and calibrating the GitPulse forensic engine. Run manually by administrators, not by the HTTP server.

---

## `seedTutorials.js`

**Purpose:** Populate the trusted reference corpus with fingerprints from high-quality educational repositories.

**Run:**
```bash
node server/scripts/seedTutorials.js
```

**What it does:**
1. Defines a list of known, authoritative tutorial repositories (e.g., official framework docs, well-known MERN starter projects)
2. For each repo, calls `extractProjectFingerprints()` to download and score its top files
3. Parses each file with Tree-sitter
4. Calls `saveToDualStore()` to store Winnowing fingerprints in `fingerprint_index` and `fingerprint_positions`
5. Tags each entry with `sourceOrigin: 'verified_internal_corpus'` and `sourceType: 'trusted_corpus'`

**When to run:** Once after initial deployment, and whenever you want to add new reference repositories to improve detection coverage.

---

## `calibrateEvidence.js`

**Purpose:** Validate that the evidence engine's classification thresholds are correctly tuned. Outputs precision, recall, and false positive rate so you can adjust `GP_*` environment variables without guesswork.

**Run:**
```bash
npm run calibrate:evidence
# (from the project root — defined in package.json)
```

### Ground Truth Dataset (`GROUND_TRUTH` array)

Each test case contains:
```js
{
  label: "human-readable description",
  expected: "FULL_CLONE" | "MOSAIC" | "PARTIAL_CLONE" | "LOW_CONFIDENCE",
  studentFingerprints: [...],   // simulated student fingerprints
  matchesByDoc: { docId: [...] }, // simulated DB match results
  meta: { docId: { sourceUrl, fileName, sourceOrigin } }
}
```

**Built-in cases:**
| Label | Expected | Tests |
|---|---|---|
| `clean_1` | `LOW_CONFIDENCE` | Boilerplate-only matches are penalized |
| `copied_1` | `FULL_CLONE` | 175/200 FPs matched with high uniqueness |
| `mosaic_1` | `MOSAIC` | 3 sources each contributing ~35 FPs |
| `partial_1` | `PARTIAL_CLONE` | 90/200 FPs from a tutorial site |
| `noise_1` | `LOW_CONFIDENCE` | Small repo, only 20 matches, below relative threshold |

### How to add your own test cases

1. Add a new entry to `GROUND_TRUTH` with a real repo's data
2. Set `expected` to what you know the correct classification should be
3. Run `npm run calibrate:evidence`
4. If the classification is wrong, adjust the relevant `GP_*` env var and re-run

### Output

```
Repo                      Expected        Got             Containment%  Dominance%  Pass
────────────────────────────────────────────────────────────────────────────────────────
copied_1 — Full clone...  FULL_CLONE      FULL_CLONE      88%           100%         ✅

Accuracy:           80.0%
Precision:          100.0%   (of flagged cases, how many were real?)
Recall:             66.7%    (of real cases, how many did we catch?)
False Positive Rate:0.0%     (of innocent repos, how many were accused?)
```

### Tuning via Environment Variables

Set these in `server/.env` (no code changes needed):
```bash
GP_FULL_CLONE_CONTAINMENT=0.80    # lower to catch more clones
GP_FULL_CLONE_DOMINANCE=0.70      # lower to flag mosaic as full clone
GP_MOSAIC_MIN_SOURCES=3
GP_MOSAIC_MIN_SEGMENTS=8
GP_MOSAIC_SEGMENT_RATIO=0.2
GP_PARTIAL_CLONE_CONTAINMENT=0.40
```
