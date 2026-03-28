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
app.post('/api/link-repo', async (req, res) => {
  const { url } = req.body;

  try {
    const { owner, repo } = parseGithubUrl(url);

    // 1. Fetch the full commit history (up to 30 for performance)
    const commitsResponse = await axios.get(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits?per_page=30`,
      { headers }
    );

    const allCommits = commitsResponse.data;

    // 2. Map-Reduce: Process all commits in parallel for speed
    const pulseDataResults = await Promise.all(allCommits.map(async (c) => {
      try {
        const detail = await axios.get(
          `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits/${c.sha}`,
          { headers }
        );

        // Filter for source code files only
        const validExtensions = ['.js', '.jsx', '.ts', '.tsx'];
        const sourceFile = detail.data.files.find(f =>
          validExtensions.some(ext => f.filename?.endsWith(ext))
        );

        const rawHunk = sourceFile?.patch || "";
        let n1 = 0, n2 = 0, d = 0, r = 1;
        let cstStr = "No code patch found.";

        if (parser && rawHunk && sourceFile) {
          const fileExt = validExtensions.find(ext => sourceFile.filename.endsWith(ext));

          // 2. Look up the language (e.g., 'python')
          const langKey = extensionMap[fileExt];

          // 3. Get the loaded WASM grammar
          const targetGrammar = grammars[langKey];

          if (targetGrammar) {
            // 4. SWITCH THE PARSER'S BRAIN TO THE NEW LANGUAGE
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
          else {
            cstStr = `Grammar for ${langKey} not loaded on server.`;
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
        return null; // Skip failed fetches
      }
    }));

    // Clean up results and sort by date (Oldest -> Newest for the Graph)
    const validResults = pulseDataResults.filter(r => r !== null);
    const clusters = {
      authentic: { label: "Steady Refactoring", color: "emerald", commits: [] },
      standard: { label: "Active Development", color: "blue", commits: [] },
      suspect: { label: "High-Velocity Dumps", color: "rose", commits: [] }
    };

    validResults.forEach(item => {
      if (item.score >= 0.85) {
        clusters.authentic.commits.push(item);
      } else if (item.score >= 0.45) {
        clusters.standard.commits.push(item);
      } else {
        clusters.suspect.commits.push(item);
      }
    });

    const graphData = [...validResults].sort((a, b) => new Date(a.date) - new Date(b.date));

    // Newest first for the History Log
    const historyLog = [...validResults].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Add fallback if repository had zero commits or zero valid source files
    if (historyLog.length === 0) {
      return res.json({
        success: true,
        repoInfo: { owner, repo },
        commits: [],
        pulseData: [],
        analysis: { oldNodeCount: 0, newNodeCount: 0, editDistance: 0, rewardScore: 0, status: "Unknown", cst: "No valid data" },
        clusters: clusters
      });
    }

    const latest = historyLog[0];

    res.json({
      success: true,
      repoInfo: { owner, repo },
      commits: historyLog,
      pulseData: graphData.map(g => ({ name: g.sha, score: g.score })),
      analysis: {
        oldNodeCount: latest.details.n1,
        newNodeCount: latest.details.n2,
        editDistance: latest.details.d,
        rewardScore: latest.score,
        status: latest.score < 0.4 ? "Suspect (AI-Generated?)" : "Authentic",
        cst: latest.details.cstStr || "Full History Analyzed."
      },
      clusters: clusters
    });

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