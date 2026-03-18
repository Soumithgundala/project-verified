/* eslint-env node */
// eslint-disable-next-line no-undef
require('dotenv').config();
import express, { json } from 'express';
import { get } from 'axios';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(json());

const GITHUB_API_BASE = "https://api.github.com";
// eslint-disable-next-line no-undef
const headers = { Authorization: `token ${process.env.GITHUB_TOKEN}` };

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
  const { owner, repo } = parseGithubUrl(url);

  try {
    // 1. Fetch Commit History Metadata [cite: 11]
    const commitsResponse = await get(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits`, 
      { headers }
    );

    // 2. Fetch Detailed 'Hunks' for the latest commit [cite: 26]
    // This allows us to see the specific lines added/removed
    const latestCommitSha = commitsResponse.data[0].sha;
    const detailResponse = await get(
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

// eslint-disable-next-line no-undef
app.listen(process.env.PORT, () => console.log(`Git-Pulse Engine running on ${process.env.PORT}`));