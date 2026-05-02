import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import multer from 'multer';
import mammoth from 'mammoth';
import { normalizeTechClaims } from '../utils/ai_wrapper.js';
import { verifyTechStack } from '../utils/astRadar.js';
import { parseGithubUrl } from '../utils/urlUtils.js';
import db from '../db/database.js';
import { resolveTenantId } from '../utils/tenant.js';

const router = express.Router();
const MAX_DOCUMENT_UPLOAD_BYTES = Number(process.env.MAX_DOCUMENT_UPLOAD_BYTES || 10 * 1024 * 1024);
const UPLOAD_ARCHIVE_TTL_MS = Number(process.env.UPLOAD_ARCHIVE_TTL_MS || 60 * 60 * 1000);
const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_DOCUMENT_UPLOAD_BYTES,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_DOCUMENT_MIME_TYPES.has(file.mimetype) && !file.originalname.toLowerCase().endsWith('.docx')) {
      return cb(new Error('Only .docx report uploads are supported.'));
    }
    cb(null, true);
  }
});

function handleDocumentUpload(req, res, next) {
  upload.single('document')(req, res, err => {
    if (!err) return next();

    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? `Document upload exceeds the ${Math.round(MAX_DOCUMENT_UPLOAD_BYTES / (1024 * 1024))}MB limit.`
      : err.message;
    return res.status(status).json({ success: false, message });
  });
}

function cleanupExpiredUploadArchives() {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE upload_archives
    SET cleaned_at = ?, updated_at = ?
    WHERE cleaned_at IS NULL AND expires_at <= ?
  `).run(now, now, now);
}

const GITHUB_API_BASE = "https://api.github.com";
const headers = process.env.GITHUB_TOKEN
  ? { Authorization: `token ${process.env.GITHUB_TOKEN}` }
  : {};

router.post('/audit-document', handleDocumentUpload, async (req, res) => {
  let uploadId = null;
  let tenantId = resolveTenantId(req);
  try {
    const { githubUrl } = req.body;
    if (!githubUrl || !req.file) {
      return res.status(400).json({ success: false, message: "Missing githubUrl or document file." });
    }

    cleanupExpiredUploadArchives();
    uploadId = crypto.randomUUID();
    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + UPLOAD_ARCHIVE_TTL_MS).toISOString();
    db.prepare(`INSERT INTO upload_archives
      (id, original_name, mime_type, size_bytes, expires_at, tenant_id, created_at, updated_at, source_type, verification_status, retention_policy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(uploadId, req.file.originalname, req.file.mimetype, req.file.size, expiresAt, tenantId, nowIso, nowIso, 'document_upload', 'processing', 'transient_upload');

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

    const cleanedAt = new Date().toISOString();
    db.prepare(`
      UPDATE upload_archives
      SET verification_status = ?, cleaned_at = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `).run('processed', cleanedAt, cleanedAt, uploadId, tenantId);

    res.json({
      success: true,
      alignmentScore: score,
      matrix: verificationMatrix,
      claimsDetected: claimsArray
    });

  } catch (err) {
    if (uploadId) {
      const failedAt = new Date().toISOString();
      db.prepare(`
        UPDATE upload_archives
        SET verification_status = ?, cleaned_at = ?, updated_at = ?
        WHERE id = ? AND tenant_id = ?
      `).run('failed', failedAt, failedAt, uploadId, tenantId);
    }
    console.error("Audit Document Route Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
