import express from 'express';
import axios from 'axios';
import multer from 'multer';
import mammoth from 'mammoth';
import { normalizeTechClaims } from '../utils/ai_wrapper.js';
import { verifyTechStack } from '../utils/astRadar.js';
import { parseGithubUrl } from './repoRoutes.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const GITHUB_API_BASE = "https://api.github.com";
const headers = process.env.GITHUB_TOKEN
  ? { Authorization: `token ${process.env.GITHUB_TOKEN}` }
  : {};

router.post('/audit-document', upload.single('document'), async (req, res) => {
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

    const verificationMatrix = await verifyTechStack(owner, repo, latestSha, claimsArray, headers);

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

export default router;
