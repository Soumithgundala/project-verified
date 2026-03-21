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

/**
 * Fetches the 'Verifiable Technical History' [cite: 7]
 * and generates a Concrete Syntax Tree for semantic reasoning [cite: 19]
 */
app.post('/api/link-repo', async (req, res) => {
  const { url } = req.body;

  try {
    const { owner, repo } = parseGithubUrl(url);

    // Fetch Commit History Metadata [cite: 11]
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

    // Extract the raw hunk
    const rawHunk = detailResponse.data.files[0]?.patch || "";

    // 3. Generate the CST dynamically from the GitHub diff
    let totalNodes = 0;
    let cstStructure = "No code patch found to parse.";

    if (parser && rawHunk) {
      const tree = parser.parse(rawHunk);
      totalNodes = tree.rootNode.descendantCount;
      cstStructure = tree.rootNode.toString(); // The LISP-like structure
    }

    res.json({
      success: true,
      repoInfo: { owner, repo },
      commits: historyData,
      latestDiff: rawHunk,
      semanticData: {
        nodeCount: totalNodes,
        cst: cstStructure.substring(0, 500) + '...' // Truncated for the response
      }
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