/* eslint-env node */
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { Parser, Language } = require('web-tree-sitter');

const app = express();
app.use(cors());
app.use(express.json());

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

    console.log("Polyglot Engine Active: JS, Python, Java, and C grammars loaded.");
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
// THE INTELLIGENT CACHE
// Key: "owner/repo"
// Value: { latestSha: "abc123", rawResults: [...], payload: {...} }
// =================================================================
const repoCache = new Map();

app.post('/api/link-repo', async (req, res) => {
  const { url } = req.body;

  try {
    const { owner, repo } = parseGithubUrl(url);
    const cacheKey = `${owner}/${repo}`;

    // 1. Fetch the latest commits from GitHub (Lightweight API call)
    const commitsResponse = await axios.get(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits?per_page=30`,
      { headers }
    );
    const fetchedCommits = commitsResponse.data;

    if (!fetchedCommits || fetchedCommits.length === 0) {
      throw new Error("No commits found in this repository.");
    }

    const latestSha = fetchedCommits[0].sha;
    const cachedData = repoCache.get(cacheKey);

    // ==========================================
    // SCENARIO A: EXACT CACHE HIT (No new commits)
    // ==========================================
    if (cachedData && cachedData.latestSha === latestSha) {
      console.log(`🟢 [CACHE HIT] Instant load for ${cacheKey} (No new commits)`);
      return res.json({ success: true, ...cachedData.payload });
    }

    // ==========================================
    // SCENARIO B: DELTA UPDATE OR CACHE MISS
    // ==========================================
    let newCommitsToProcess = [];

    if (cachedData) {
      console.log(`🟡 [DELTA UPDATE] New commits detected for ${cacheKey}. Slicing new data...`);
      // Find only the commits that happened AFTER our last cached SHA
      for (const c of fetchedCommits) {
        if (c.sha === cachedData.latestSha) break; // Stop when we hit the known commit
        newCommitsToProcess.push(c);
      }
    } else {
      console.log(`🔴 [CACHE MISS] First time processing ${cacheKey}. Running full history...`);
      newCommitsToProcess = fetchedCommits;
    }

    // 2. Process ONLY the new commits through the WebAssembly Parser
    const newPulseDataResults = await Promise.all(newCommitsToProcess.map(async (c) => {
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
        let n1 = 0, n2 = 0, d = 0, r = 1;
        let cstStr = "No code patch found.";

        if (parser && rawHunk && sourceFile) {
          const fileExt = validExtensions.find(ext => sourceFile.filename.endsWith(ext));
          const langKey = extensionMap[fileExt];
          const targetGrammar = grammars[langKey];

          if (targetGrammar) {
            parser.setLanguage(targetGrammar);
            const { oldCode, newCode } = splitDiff(rawHunk);
            const treeOld = parser.parse(oldCode);
            const treeNew = parser.parse(newCode);

            n1 = treeOld.rootNode.descendantCount;
            n2 = treeNew.rootNode.descendantCount;
            d = Math.abs(n2 - n1);
            r = n2 > 0 ? Math.max(0, 1 - (d / n2)) : 1;
            cstStr = treeNew.rootNode.toString().substring(0, 500) + '...';
          }
        }

        return {
          sha: c.sha.substring(0, 7),
          score: parseFloat(r.toFixed(2)),
          date: c.commit.author.date,
          message: c.commit.message,
          author: c.commit.author.name,
          details: { n1, n2, d, cstStr }
        };
      } catch (err) {
        return null; // Skip if GitHub API fails on a specific file
      }
    }));

    const validNewResults = newPulseDataResults.filter(r => r !== null);

    // 3. MERGE: Combine newly parsed commits with previously cached commits
    let combinedResults = [];
    if (cachedData) {
      combinedResults = [...validNewResults, ...cachedData.rawResults];
      // Cap the history at 30 to prevent memory leaks over time
      combinedResults = combinedResults.slice(0, 30);
    } else {
      combinedResults = validNewResults;
    }

    // 4. RECALCULATE: Sort and Cluster the combined dataset
    const graphData = [...combinedResults].sort((a, b) => new Date(a.date) - new Date(b.date));
    const historyLog = [...combinedResults].sort((a, b) => new Date(b.date) - new Date(a.date));

    const clusters = {
      authentic: { label: "Steady Refactoring", color: "emerald", commits: [] },
      standard: { label: "Active Development", color: "blue", commits: [] },
      suspect: { label: "High-Velocity Dumps", color: "rose", commits: [] }
    };

    combinedResults.forEach(item => {
      if (item.score >= 0.85) clusters.authentic.commits.push(item);
      else if (item.score >= 0.45) clusters.standard.commits.push(item);
      else clusters.suspect.commits.push(item);
    });

    const latest = historyLog[0] || { details: { n1: 0, n2: 0, d: 0, cstStr: "" }, score: 1 };

    // 5. The Final Payload
    const finalPayload = {
      repoInfo: { owner, repo },
      commits: historyLog,
      pulseData: graphData.map(g => ({ name: g.sha, score: g.score })),
      clusters: clusters,
      analysis: {
        oldNodeCount: latest.details.n1,
        newNodeCount: latest.details.n2,
        editDistance: latest.details.d,
        rewardScore: latest.score,
        status: latest.score < 0.4 ? "Suspect (AI-Generated?)" : "Authentic",
        cst: latest.details.cstStr
      }
    };

    // 6. UPDATE THE CACHE
    repoCache.set(cacheKey, {
      latestSha: latestSha,
      rawResults: combinedResults, // Save the raw array for future merges
      payload: finalPayload        // Save the compiled payload for instant delivery
    });

    res.json({ success: true, ...finalPayload });

  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

const PORT = process.env.PORT || 5000;

// 4. Start the server AND initialize the parser
app.listen(PORT, async () => {
  console.log(`Git-Pulse Engine running on port ${PORT}`);
  await initGitPulseParser();
});