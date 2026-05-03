// server/utils/submission.js
import db from '../db/database.js';
import { DEFAULT_TENANT_ID } from './tenant.js';
import crypto from 'crypto';

/**
 * Saves a submission to the database.
 */
export async function saveSubmission(data) {
    const { owner, repo, sha, studentFingerprints, analysisResults, tenantId = DEFAULT_TENANT_ID } = data;
    const submissionId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
        INSERT INTO submissions (
            submission_id, owner, repo, sha, student_fingerprints, analysis_results, tenant_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        submissionId, owner, repo, sha, 
        JSON.stringify(studentFingerprints), 
        JSON.stringify(analysisResults), 
        tenantId, now, now
    );

    return submissionId;
}

/**
 * Retrieves a submission by ID.
 */
export async function getSubmission(submissionId, tenantId = DEFAULT_TENANT_ID) {
    const row = db.prepare('SELECT * FROM submissions WHERE submission_id = ? AND tenant_id = ?').get(submissionId, tenantId);
    if (!row) return null;

    return {
        ...row,
        studentFingerprints: JSON.parse(row.student_fingerprints),
        analysisResults: JSON.parse(row.analysis_results)
    };
}

/**
 * Lists submissions for a tenant.
 */
export async function listSubmissions(tenantId = DEFAULT_TENANT_ID) {
    return db.prepare('SELECT submission_id, owner, repo, sha, created_at FROM submissions WHERE tenant_id = ? ORDER BY created_at DESC').all(tenantId);
}
