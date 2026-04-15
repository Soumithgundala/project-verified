/* eslint-env node */
import 'dotenv/config.js';
import express from 'express';
import axios from 'axios';
import cors from 'cors';
import { Parser, Language } from 'web-tree-sitter';

import { analyzeRepositoryAST as generateLLMSummary, normalizeTechClaims } from './utils/ai_wrapper.js';
import { extractProjectFingerprint, huntGlobalClones, generateStructuralHash, verifyTechStack } from './utils/astRadar.js';
import { lookupAstHash, saveAstHash } from './utils/astHashDb.js';
import repoCache from './utils/diskCache.js';

const app = express();
app.use(cors());
app.use(express.json());

import multer from 'multer';
import mammoth from 'mammoth';

const upload = multer({ storage: multer.memoryStorage() });

const GITHUB_API_BASE = "https://api.github.com";
const headers = process.env.GITHUB_TOKEN
  ? { Authorization: `token ${process.env.GITHUB_TOKEN}` }
  : {};

const parseGithubUrl = (url) => {
  const parts = url.replace('https://github.com/', '').split('/');
  return { owner: parts[0], repo: parts[1] };
};

// 1. Global Parser Variable
let parser = null;
const grammars = {
  javascript: null,
  python: null,
  java: null,
  c: null
};

const extensionMap = {
  '.js': 'javascript', '.jsx': 'javascript', '.ts': 'javascript', '.tsx': 'javascript',
  '.py': 'python',
  '.java': 'java',
  '.c': 'c', '.h': 'c'
};

// 2. Initialize Parser exactly once on server startup
async function initGitPulseParser() {
  try {
    await Parser.init();
    parser = new Parser();

    // Load all the WASM files you placed in the root folder
    grammars.javascript = await Language.load('tree-sitter-javascript.wasm');
    grammars.python = await Language.load('tree-sitter-python.wasm');
    grammars.java = await Language.load('tree-sitter-java.wasm');
    grammars.c = await Language.load('tree-sitter-c.wasm');

    // console.log("Polyglot Engine Active: JS, Python, Java, and C grammars loaded.");
  } catch (err) {
    console.error("Failed to load one or more WASM grammars. Check file paths.", err);
  }

  // Notice we use Language.load here instead of Parser.Language.load
  //   const Lang = await Language.load('tree-sitter-javascript.wasm');
  //   parser.setLanguage(Lang);

  //   console.log("CST Parser successfully loaded WebAssembly grammar.");
  // } catch (err) {
  //   console.error("Failed to load WASM grammar. Check file path.", err);
  // }
}
// Zhang sasha algo to check insertions, deletions and modifications
/**
 * Separates a Git Patch into 'Old' and 'New' code blocks
 * removes +, -, and @@ headers for clean CST parsing
 */
function splitDiff(patch) {
  const lines = patch.split('\n');
  let oldCode = "";
  let newCode = "";

  lines.forEach(line => {
    if (line.startsWith('-') && !line.startsWith('---')) {
      oldCode += line.substring(1) + '\n';
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      newCode += line.substring(1) + '\n';
    } else if (line.startsWith('\\') || line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@')) {
      // Ignore patch headers and "\ No newline at end of file" comments
      return;
    } else {
      // Keep context lines for both to maintain tree structure
      // Stripping the leading space character if it is a diff context line
      const contextLine = line.startsWith(' ') ? line.substring(1) : line;
      oldCode += contextLine + '\n';
      newCode += contextLine + '\n';
    }
  });

  return { oldCode, newCode };
}

/**
 * Fetches the 'Verifiable Technical History' [cite: 7]
 * and generates a Concrete Syntax Tree for semantic reasoning [cite: 19]
 */
// ... (Keep your existing imports, Tree-Sitter init, and helper functions)

// =================================================================
// THE INTELLIGENT CACHE  (disk-backed — survives nodemon restarts)
// Stored at: server/.cache/repoCache.json
//
// Each pipeline stage has its OWN version number.
// Only the stage whose version changed re-runs — everything else is served
// straight from cache. To invalidate a specific stage, bump ONLY its number:
//   MODULE_VERSIONS.commits     — re-parse AST / re-score every commit
//   MODULE_VERSIONS.llmSummary  — re-run LLM prompt on the repo fingerprint
//   MODULE_VERSIONS.originality — re-run GitHub global clone search
// =================================================================
const MODULE_VERSIONS = {
  commits:     1,  // bump if: scoring formula, AST logic, or clustering changes
  llmSummary:  1,  // bump if: LLM prompt template or model selection changes
  originality: 3,  // v3: two-strike system (local AST hash DB + GitHub fallback)
};

app.post('/api/link-repo', async (req, res) => {
  const { url } = req.body;

  try {
    const { owner, repo } = parseGithubUrl(url);
    const cacheKey = `${owner}/${repo}`;

    // ── Lightweight call: just enough to detect new commits ───────────────
    const commitsResponse = await axios.get(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits?per_page=30`,
      { headers }
    );
    const fetchedCommits = commitsResponse.data;
    if (!fetchedCommits?.length) throw new Error("No commits found in this repository.");

    const latestSha   = fetchedCommits[0].sha;
    const cached      = repoCache.get(cacheKey);
    const shaChanged  = !cached || cached.latestSha !== latestSha;

    // ── MODULE 1: COMMITS (AST parse → score → merge) ─────────────────────
    // Re-runs when: new commits arrived OR commits-module logic was bumped
    const commitsVersionOk = cached?.commits?.version === MODULE_VERSIONS.commits;
    const needsCommitsRun  = shaChanged || !commitsVersionOk;

    let combinedResults;

    if (!needsCommitsRun) {
      console.log(`🟢 [CACHE] Commits module valid for ${cacheKey}`);
      combinedResults = cached.commits.rawResults;

    } else {
      const reason = !cached ? 'first run' : shaChanged ? 'new commits' : 'logic version bumped';
      console.log(`🔄 [RERUN] Commits module for ${cacheKey} (${reason})`);

      // Delta: when SHA changed and we have prior data, only process truly new commits
      let toProcess = fetchedCommits; // default: full reprocess (version bump or first run)
      if (shaChanged && cached?.commits?.rawResults) {
        toProcess = [];
        for (const c of fetchedCommits) {
          if (c.sha === cached.latestSha) break;
          toProcess.push(c);
        }
        console.log(`🟡 [DELTA] ${toProcess.length} new commit(s) to process for ${cacheKey}`);
      }

      const newProcessed = await Promise.all(toProcess.map(async (c) => {
        try {
          const detail = await axios.get(
            `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits/${c.sha}`,
            { headers }
          );
          const validExtensions = Object.keys(extensionMap);
          const sourceFile = detail.data.files.find(f =>
            validExtensions.some(ext => f.filename?.endsWith(ext))
          );
          const rawHunk = sourceFile?.patch || "";
          let n1 = 0, n2 = 0, d = 0, r = 1, cstStr = "No code patch found.";

          if (parser && rawHunk && sourceFile) {
            const fileExt     = validExtensions.find(ext => sourceFile.filename.endsWith(ext));
            const targetGrammar = grammars[extensionMap[fileExt]];
            if (targetGrammar) {
              parser.setLanguage(targetGrammar);
              const { oldCode, newCode } = splitDiff(rawHunk);
              const treeOld = parser.parse(oldCode);
              const treeNew = parser.parse(newCode);
              n1 = treeOld.rootNode.descendantCount;
              n2 = treeNew.rootNode.descendantCount;
              d  = Math.abs(n2 - n1);
              r  = n2 > 0 ? Math.max(0, 1 - (d / n2)) : 1;
              cstStr = treeNew.rootNode.toString().substring(0, 500) + '...';
            }
          }
          return {
            sha: c.sha.substring(0, 7), score: parseFloat(r.toFixed(2)),
            date: c.commit.author.date,  message: c.commit.message,
            author: c.commit.author.name, details: { n1, n2, d, cstStr }
          };
        } catch { return null; }
      }));

      const validNew = newProcessed.filter(Boolean);
      // Merge with prior cache only on a delta update (new commits arrived)
      if (shaChanged && cached?.commits?.rawResults) {
        combinedResults = [...validNew, ...cached.commits.rawResults].slice(0, 30);
      } else {
        combinedResults = validNew;
      }
    }

    // ── Assemble graphs & clusters from combinedResults (always cheap) ──────
    const graphData  = [...combinedResults].sort((a, b) => new Date(a.date) - new Date(b.date));
    const historyLog = [...combinedResults].sort((a, b) => new Date(b.date) - new Date(a.date));

    const clusters = {
      authentic: { label: "Steady Refactoring",  color: "emerald", commits: [] },
      standard:  { label: "Active Development",  color: "blue",    commits: [] },
      suspect:   { label: "High-Velocity Dumps", color: "rose",    commits: [] },
    };
    combinedResults.forEach(item => {
      if      (item.score >= 0.85) clusters.authentic.commits.push(item);
      else if (item.score >= 0.45) clusters.standard.commits.push(item);
      else                         clusters.suspect.commits.push(item);
    });
    const latest = historyLog[0] || { details: { n1: 0, n2: 0, d: 0, cstStr: "" }, score: 1 };

    // ── MODULE 2 & 3: INTELLIGENCE (Two-Strike System) ─────────────────────
    // Strike 1: Local AST Hash DB lookup (~5ms, $0.00 cost)
    // Strike 2: GitHub Global Search API (only when Strike 1 misses)
    // The Genius Move: on a Strike 2 hit, save the clone's hash to local DB
    //                  so future copies are caught at Strike 1.
    const llmVersionOk  = !shaChanged && cached?.llmSummary?.version  === MODULE_VERSIONS.llmSummary;
    const origVersionOk = !shaChanged && cached?.originality?.version === MODULE_VERSIONS.originality;
    const needsLLMRun   = !llmVersionOk;
    const needsOrigRun  = !origVersionOk;

    let llmSummary        = cached?.llmSummary?.data  ?? null;
    let globalOriginality = cached?.originality?.data ?? null;

    if (needsLLMRun || needsOrigRun) {
      // Fetch fingerprint once — shared by both sub-modules if both need it
      const fingerprint = await extractProjectFingerprint(owner, repo, latestSha, headers);

      if (needsLLMRun) {
        console.log(`🔄 [RERUN] LLM Summary module for ${cacheKey}`);
        llmSummary = fingerprint
          ? await generateLLMSummary(fingerprint.fileName, fingerprint.rawCode)
          : { overall_logic_summary: "No substantial logic files found.", key_patterns: [], likely_source: "Unknown" };
      } else {
        console.log(`🟢 [CACHE] LLM Summary module valid for ${cacheKey}`);
      }

      if (needsOrigRun) {
        console.log(`🔄 [RERUN] Originality module (Two-Strike) for ${cacheKey}`);
        globalOriginality = { status: 'Original', matches: [], similarityScore: null };

        if (fingerprint) {
          // ── Parse the student's fingerprint file AST ─────────────────────
          let studentTree = null;
          let studentHash = null;

          if (parser) {
            const fileExt = Object.keys(extensionMap).find(ext => fingerprint.fileName.endsWith(ext)) || '.js';
            const langKey = extensionMap[fileExt];
            if (grammars[langKey]) {
              parser.setLanguage(grammars[langKey]);
              studentTree = parser.parse(fingerprint.rawCode);
              studentHash = generateStructuralHash(studentTree.rootNode);
              console.log(`🔑 [Strike 1] Student AST hash: ${studentHash.substring(0, 12)}...`);
            }
          }

          // ══════════════════════════════════════════════════════════════════
          // STRIKE 1: LOCAL DB LOOKUP (instant, free)
          // ══════════════════════════════════════════════════════════════════
          const localMatch = studentHash ? await lookupAstHash(studentHash) : null;

          if (localMatch) {
            console.log(`🎯 [STRIKE 1 HIT] Hash matched a known clone in local DB! → ${localMatch.sourceUrl}`);
            globalOriginality = {
              status: 'Local Clone Detected',
              matches: [localMatch.sourceUrl],
              similarityScore: '100.0%'
            };

          } else {
            // ══════════════════════════════════════════════════════════════
            // STRIKE 2: GITHUB GLOBAL SEARCH API (cold start fallback)
            // ══════════════════════════════════════════════════════════════
            console.log(`🔍 [STRIKE 1 MISS] No local match. Proceeding to GitHub Global Search...`);
            const firstCommitDate = fetchedCommits[fetchedCommits.length - 1]?.commit?.author?.date || null;
            const huntResult = await huntGlobalClones(
              fingerprint.anchorString, owner, repo, headers, firstCommitDate
            );

            globalOriginality.status  = huntResult.status;
            globalOriginality.matches = huntResult.matches;

            // AST Showdown: compare student tree vs matched clone tree
            if (huntResult.matchedCode && parser && studentTree) {
              const fileExt = Object.keys(extensionMap).find(ext => fingerprint.fileName.endsWith(ext)) || '.js';
              const langKey = extensionMap[fileExt];
              if (grammars[langKey]) {
                parser.setLanguage(grammars[langKey]);
                const cloneTree = parser.parse(huntResult.matchedCode);

                const studentNodes = studentTree.rootNode.descendantCount;
                const cloneNodes   = cloneTree.rootNode.descendantCount;
                const distance     = Math.abs(studentNodes - cloneNodes);
                const maxNodes     = Math.max(studentNodes, cloneNodes);
                const similarity   = maxNodes > 0 ? ((1 - (distance / maxNodes)) * 100).toFixed(1) : 0;

                globalOriginality.similarityScore = `${similarity}%`;
                console.log(`⚖️  [Strike 2] AST Showdown: ${similarity}% structurally identical.`);

                // ════════════════════════════════════════════════════════════
                // THE GENIUS MOVE: save clone's hash so future copies are
                // caught instantly at Strike 1 — zero GitHub API calls.
                // ════════════════════════════════════════════════════════════
                if (parseFloat(similarity) > 90 && huntResult.matches.length > 0) {
                  const cloneHash = generateStructuralHash(cloneTree.rootNode);
                  await saveAstHash(cloneHash, huntResult.matches[0], fingerprint.fileName);
                  console.log(`💾 [GENIUS MOVE] Clone hash saved → future copies caught at Strike 1.`);
                }
              }
            }
          }
        }
      } else {
        console.log(`🟢 [CACHE] Originality module valid for ${cacheKey}`);
      }
    } else {
      console.log(`🟢 [CACHE] Intelligence modules both valid for ${cacheKey}`);
    }

    // ── AUTHOR BREAKDOWN & GHOSTWRITER DETECTION ─────────────────────────
    // Groups all commits by author, calculates commit count and average
    // integrity score per contributor. Surfaces alt-accounts, ghostwriters,
    // and uneven team contribution in group projects.
    const authorMap = {};
    historyLog.forEach(c => {
      const authorName = c.author || "Unknown";
      if (!authorMap[authorName]) {
        authorMap[authorName] = { name: authorName, commitCount: 0, totalScore: 0, commits: [] };
      }
      authorMap[authorName].commitCount += 1;
      authorMap[authorName].totalScore  += c.score;
      authorMap[authorName].commits.push(c.sha);
    });
    const authorStats = Object.values(authorMap).map(a => ({
      name:         a.name,
      commitCount:  a.commitCount,
      averageScore: parseFloat((a.totalScore / a.commitCount).toFixed(2))
    })).sort((a, b) => b.commitCount - a.commitCount); // Most active first

    // ── Assemble final payload ─────────────────────────────────────────────
    const finalPayload = {
      repoInfo:  { owner, repo },
      commits:   historyLog,
      pulseData: graphData.map(g => ({ name: g.sha, score: g.score })),
      clusters,
      authorStats,
      intelligence: { globalOriginality, llmSummary },
      analysis: {
        oldNodeCount: latest.details.n1,
        newNodeCount: latest.details.n2,
        editDistance: latest.details.d,
        rewardScore:  latest.score,
        status: latest.score < 0.4 ? "Suspect (AI-Generated?)" : "Authentic",
        cst: latest.details.cstStr
      }
    };

    // ── Persist cache with per-module version stamps ───────────────────────
    repoCache.set(cacheKey, {
      latestSha,
      commits:     { version: MODULE_VERSIONS.commits,     rawResults: combinedResults },
      llmSummary:  { version: MODULE_VERSIONS.llmSummary,  data: llmSummary },
      originality: { version: MODULE_VERSIONS.originality, data: globalOriginality },
    });

    res.json({ success: true, ...finalPayload });

  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/audit-document', upload.single('document'), async (req, res) => {
  try {
    const { githubUrl } = req.body;
    if (!githubUrl || !req.file) {
      return res.status(400).json({ success: false, message: "Missing githubUrl or document file." });
    }

    const { owner, repo } = parseGithubUrl(githubUrl);
    
    // 1. Ingest document and extract all raw text ignoring bad formatting
    const result = await mammoth.extractRawText({ buffer: req.file.buffer });
    const fullText = result.value;

    // 2. Fuzzy Window Slicer
    let textSlice = "";
    // Regex looking for common tech stack section headers
    const anchorRegex = /(software requirements|technologies used|system analysis|implementation|tech stack|tools and technologies)/i;
    const match = fullText.match(anchorRegex);

    if (match) {
      const index = match.index;
      const start = Math.max(0, index - 2000);
      const end = Math.min(fullText.length, index + 4000);
      textSlice = fullText.substring(start, end);
    } else {
      // Fallback: Just take the first 6000 characters
      textSlice = fullText.substring(0, 6000);
    }

    // 3. Normalizing LLM Pass
    const claimsArray = await normalizeTechClaims(textSlice);

    // 4. Radar Verification Math
    // Let's get the latest commit sha for the repo to use in radar
    const commitsResponse = await axios.get(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits?per_page=1`,
      { headers }
    );
    const fetchedCommits = commitsResponse.data;
    if (!fetchedCommits?.length) throw new Error("No commits found in this repository.");
    const latestSha = fetchedCommits[0].sha;

    const verificationMatrix = await verifyTechStack(owner, repo, latestSha, claimsArray);

    // Calculate score
    const verifiedCount = verificationMatrix.filter(c => c.status.startsWith('Verified')).length;
    const totalCount = verificationMatrix.length;
    const score = totalCount > 0 ? Math.round((verifiedCount / totalCount) * 100) : 0;

    res.json({
      success: true,
      alignmentScore: score,
      matrix: verificationMatrix,
      claimsDetected: claimsArray
    });

  } catch (err) {
    console.error("Audit Document Route Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

const PORT = process.env.PORT || 5000;

// 4. Start the server AND initialize the parser
app.listen(PORT, async () => {
  console.log(`Git-Pulse Engine running on port ${PORT}`);
  await initGitPulseParser();
});