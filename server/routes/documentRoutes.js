import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import mammoth from 'mammoth';
import { fileURLToPath } from 'url';
import { normalizeTechClaims } from '../utils/ai_wrapper.js';
import { verifyTechStack } from '../utils/astRadar.js';
import { parseGithubUrl } from '../utils/urlUtils.js';
import db from '../db/database.js';
import { plagiarismQueue } from '../utils/queue.js';
import { resolveTenantId } from '../utils/tenant.js';

const router = express.Router();
const MAX_DOCUMENT_UPLOAD_BYTES = Number(process.env.MAX_DOCUMENT_UPLOAD_BYTES || 10 * 1024 * 1024);
const UPLOAD_ARCHIVE_TTL_MS = Number(process.env.UPLOAD_ARCHIVE_TTL_MS || 60 * 60 * 1000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCUMENT_UPLOAD_ROOT = path.join(__dirname, '..', 'uploads', 'documents');
const INTERNAL_JOB_CALLBACK_SECRET = process.env.INTERNAL_JOB_CALLBACK_SECRET || '';
const PDF_MIME_TYPES = new Set(['application/pdf']);
const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

fs.mkdirSync(DOCUMENT_UPLOAD_ROOT, { recursive: true });

function sanitizeFileName(fileName) {
  return fileName.replace(/[^\w.-]+/g, '_');
}

function ensureTenantUploadDir(tenantId) {
  const uploadDir = path.join(DOCUMENT_UPLOAD_ROOT, tenantId || 'default');
  fs.mkdirSync(uploadDir, { recursive: true });
  return uploadDir;
}

function updateDocumentIngestion(documentId, tenantId, patch) {
  const normalizedPatch = { ...patch };
  if (normalizedPatch.status !== undefined && normalizedPatch.verification_status === undefined) {
    normalizedPatch.verification_status = normalizedPatch.status;
  }

  const entries = Object.entries(normalizedPatch).filter(([, value]) => value !== undefined);
  if (!entries.length) return;

  const assignments = entries.map(([column]) => `${column} = ?`).join(', ');
  const values = entries.map(([, value]) => value);
  db.prepare(`UPDATE document_ingestions SET ${assignments}, updated_at = ? WHERE id = ? AND tenant_id = ?`)
    .run(...values, new Date().toISOString(), documentId, tenantId);
}

function insertDocumentIngestion({ documentId, tenantId, filename, filePath, status, jobId = null, errorMessage = null, completedAt = null }) {
  const nowIso = new Date().toISOString();
  db.prepare(`INSERT INTO document_ingestions
    (id, filename, file_path, status, job_id, error_message, completed_at, tenant_id, created_at, updated_at, source_type, verification_status, retention_policy)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      documentId,
      filename,
      filePath,
      status,
      jobId,
      errorMessage,
      completedAt,
      tenantId,
      nowIso,
      nowIso,
      'document_upload',
      status,
      'transient_upload'
    );
}

function getDocumentIngestion(documentId, tenantId) {
  return db.prepare(`
    SELECT id, filename, file_path, status, job_id, error_message, completed_at, tenant_id, created_at, updated_at, plagiarism_report
    FROM document_ingestions
    WHERE id = ? AND tenant_id = ?
  `).get(documentId, tenantId);
}

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

const pdfAndDocxUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const tenantId = resolveTenantId(req);
      cb(null, ensureTenantUploadDir(tenantId));
    },
    filename: (req, file, cb) => {
      const documentId = crypto.randomUUID();
      req.documentUploadId = documentId;

      const originalExtension = path.extname(file.originalname || '').toLowerCase() || '.pdf';
      const baseName = sanitizeFileName(path.basename(file.originalname || 'document', path.extname(file.originalname || '')));
      cb(null, `${documentId}-${baseName || 'document'}${originalExtension}`);
    }
  }),
  limits: {
    fileSize: MAX_DOCUMENT_UPLOAD_BYTES,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext !== '.pdf' && ext !== '.docx') {
      return cb(new Error('Only PDF and DOCX files are supported.'));
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

function handlePdfAndDocxUpload(req, res, next) {
  pdfAndDocxUpload.single('document')(req, res, err => {
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

router.post('/documents/upload', handlePdfAndDocxUpload, async (req, res) => {
  const tenantId = resolveTenantId(req);
  const documentId = req.documentUploadId || crypto.randomUUID();

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Missing document file.' });
    }

    const isDocx = req.file.originalname.toLowerCase().endsWith('.docx');

    insertDocumentIngestion({
      documentId,
      tenantId,
      filename: req.file.originalname,
      filePath: isDocx ? '' : req.file.path,
      status: 'pending'
    });

    const jobData = {
      documentId,
      tenantId,
      filename: req.file.originalname
    };

    if (isDocx) {
      const buffer = fs.readFileSync(req.file.path);
      const result = await mammoth.extractRawText({ buffer });
      const fullText = result.value;
      const paragraphs = fullText.split(/\r?\n\r?\n/).map(p => p.trim()).filter(Boolean);
      jobData.paragraphs = paragraphs;

      // Clean up docx file from disk immediately
      await fs.promises.unlink(req.file.path).catch(() => {});
    } else {
      jobData.filePath = req.file.path;
    }

    const job = await plagiarismQueue.add(
      'extract-vectors',
      jobData,
      {
        jobId: documentId,
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        }
      }
    );

    updateDocumentIngestion(documentId, tenantId, {
      status: 'processing',
      job_id: job.id || documentId,
      error_message: null,
      completed_at: null
    });

    return res.status(202).json({
      success: true,
      message: 'Document queued for processing.',
      documentId,
      jobId: job.id || documentId,
      status: 'processing'
    });
  } catch (err) {
    if (req.file?.path) {
      await fs.promises.unlink(req.file.path).catch(() => {});
    }

    try {
      updateDocumentIngestion(documentId, tenantId, {
        status: 'failed',
        error_message: err.message,
        completed_at: new Date().toISOString()
      });
    } catch {
      // The upload should still fail even if the status update does not persist.
    }

    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/internal/job-complete', async (req, res) => {
  if (INTERNAL_JOB_CALLBACK_SECRET && req.get('x-internal-job-token') !== INTERNAL_JOB_CALLBACK_SECRET) {
    return res.status(401).json({ success: false, message: 'Unauthorized callback.' });
  }

  const { documentId, tenantId: bodyTenantId, status, errorMessage, plagiarismReport } = req.body || {};
  if (!documentId || !status) {
    return res.status(400).json({ success: false, message: 'documentId and status are required.' });
  }

  const tenantId = bodyTenantId || resolveTenantId(req);
  const normalizedStatus = ['completed', 'failed', 'processing', 'pending'].includes(status) ? status : null;
  if (!normalizedStatus) {
    return res.status(400).json({ success: false, message: 'Invalid status.' });
  }

  const documentRow = getDocumentIngestion(documentId, tenantId);
  if (!documentRow) {
    return res.status(404).json({ success: false, message: 'Document ingestion record not found.' });
  }

  const terminalStatus = normalizedStatus === 'completed' || normalizedStatus === 'failed';
  updateDocumentIngestion(documentId, tenantId, {
    status: normalizedStatus,
    error_message: normalizedStatus === 'failed' ? (errorMessage || 'Document processing failed.') : null,
    completed_at: terminalStatus ? new Date().toISOString() : documentRow.completed_at,
    plagiarism_report: plagiarismReport ? JSON.stringify(plagiarismReport) : null
  });

  if (terminalStatus && documentRow.file_path) {
    try {
      await fs.promises.unlink(documentRow.file_path);
    } catch {
      // If the file is already missing or cannot be deleted, it doesn't crash the server.
    }
  }

  return res.json({
    success: true,
    message: 'Document status updated.',
    documentId,
    status: normalizedStatus
  });
});

router.get('/documents/:documentId', async (req, res) => {
  const tenantId = resolveTenantId(req);
  const { documentId } = req.params;

  try {
    const documentRow = getDocumentIngestion(documentId, tenantId);
    if (!documentRow) {
      return res.status(404).json({ success: false, message: 'Document ingestion record not found.' });
    }

    const plagiarismReport = documentRow.plagiarism_report 
      ? JSON.parse(documentRow.plagiarism_report) 
      : null;

    return res.json({
      success: true,
      document: {
        id: documentRow.id,
        filename: documentRow.filename,
        status: documentRow.status,
        errorMessage: documentRow.error_message,
        completedAt: documentRow.completed_at,
        createdAt: documentRow.created_at,
        plagiarismReport
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

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

    const {
      matrix: verificationMatrix,
      semanticSubstitutionViolation,
      violationReason,
      semanticSubstitutionProofs
    } = await verifyTechStack(owner, repo, latestSha, claimsArray, headers);

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
      claimsDetected: claimsArray,
      semanticSubstitutionViolation,
      violationReason,
      semanticSubstitutionProofs
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
