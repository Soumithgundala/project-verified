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

// 2. Initialize Parser exactly once on server startup
async function initGitPulseParser() {
  try {
    await Parser.init();
    parser = new Parser();

    // Notice we use Language.load here instead of Parser.Language.load
    const Lang = await Language.load('tree-sitter-javascript.wasm');
    parser.setLanguage(Lang);

    console.log("CST Parser successfully loaded WebAssembly grammar.");
  } catch (err) {
    console.error("Failed to load WASM grammar. Check file path.", err);
  }
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
    } else if (!line.startsWith('@@')) {
      // Keep context lines for both to maintain tree structure
      oldCode += line + '\n';
      newCode += line + '\n';
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

    // Fetch Commit History Metadata
    const commitsResponse = await axios.get(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits`,
      { headers }
    );

    // Fetch Detailed 'Hunks' for the latest commit 
    const latestCommitSha = commitsResponse.data[0].sha;
    const detailResponse = await axios.get(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits/${latestCommitSha}`,
      { headers }
    );

    const historyData = commitsResponse.data.slice(0, 5).map(c => ({
      sha: c.sha.substring(0, 7),
      message: c.commit.message,
      author: c.commit.author.name,
      date: c.commit.author.date
    }));

    const rawHunk = detailResponse.data.files[0]?.patch || "";

    // Semantic Analysis Block
    let analysis = {
      oldNodeCount: 0,
      newNodeCount: 0,
      editDistance: 0,
      rewardScore: 1,
      status: "Authentic",
      cst: ""
    };

    if (parser && rawHunk) {
      const { oldCode, newCode } = splitDiff(rawHunk);

      const treeOld = parser.parse(oldCode);
      const treeNew = parser.parse(newCode);

      const n1 = treeOld.rootNode.descendantCount;
      const n2 = treeNew.rootNode.descendantCount;

      // Zhang-Shasha Proxy: Node-level Edit Distance
      const d = Math.abs(n2 - n1);
      const r = n2 > 0 ? Math.max(0, 1 - (d / n2)) : 1;

      analysis = {
        oldNodeCount: n1,
        newNodeCount: n2,
        editDistance: d,
        rewardScore: parseFloat(r.toFixed(2)),
        status: r < 0.4 ? "Suspect (AI-Generated?)" : "Authentic",
        cst: treeNew.rootNode.toString().substring(0, 500) + '...'
      };
    }

    // Single consolidated response
    res.json({
      success: true,
      repoInfo: { owner, repo },
      commits: historyData,
      latestDiff: rawHunk,
      analysis: analysis
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