/* eslint-env node */
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const GITHUB_API_BASE = "https://api.github.com";
// Headers will securely use your token if it exists in the .env file
const headers = process.env.GITHUB_TOKEN 
  ? { Authorization: `token ${process.env.GITHUB_TOKEN}` } 
  : {};

// Helper to extract owner and repo name from a URL
const parseGithubUrl = (url) => {
  const parts = url.replace('https://github.com/', '').split('/');
  return { owner: parts[0], repo: parts[1] };
};

/**
 * Fetches the 'Verifiable Technical History' [cite: 7]
 */
app.post('/api/link-repo', async (req, res) => {
  const { url } = req.body;
  
  try {
    const { owner, repo } = parseGithubUrl(url);

    // 1. Fetch Commit History Metadata [cite: 11]
    const commitsResponse = await axios.get(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits`, 
      { headers }
    );

    // 2. Fetch Detailed 'Hunks' for the latest commit [cite: 26]
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

    res.json({
      success: true,
      repoInfo: { owner, repo },
      commits: historyData,
      latestDiff: detailResponse.data.files[0]?.patch // The raw 'hunk' for analysis [cite: 26]
    });

  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Git-Pulse Engine running on port ${PORT}`));