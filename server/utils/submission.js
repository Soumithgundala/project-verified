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

/**
 * Saves a human review override.
 * IMMUTABLE — every decision is appended, never overwritten.
 * Professors MUST supply a reason for auditability.
 *
 * @param {object} data
 * @param {string} data.submissionId  - The submission being reviewed
 * @param {string} data.action        - 'mark_plagiarism' | 'mark_acceptable' | 'ignore_source'
 * @param {string} [data.sourceUrl]   - Required when action = 'ignore_source'
 * @param {string} data.reason        - REQUIRED. Mandatory explanation for the override.
 * @param {string} [data.reviewerId]  - Optional. The reviewer's user ID for audit trail.
 * @param {string} [data.tenantId]
 */
export async function saveReviewOverride(data) {
    const {
        submissionId,
        action,
        sourceUrl = null,
        reason,
        reviewerId = null,
        tenantId = DEFAULT_TENANT_ID
    } = data;

    if (!reason || reason.trim().length === 0) {
        throw new Error('A reason is required for all review overrides. This is mandatory for auditability.');
    }

    const overrideId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
        INSERT INTO review_overrides (
            override_id, submission_id, action, source_url, reason, reviewer_id, tenant_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(overrideId, submissionId, action, sourceUrl, reason.trim(), reviewerId, tenantId, now, now);

    return {
        overrideId,
        submissionId,
        action,
        sourceUrl,
        reason: reason.trim(),
        reviewerId,
        createdAt: now
    };
}

/**
 * Lists all review overrides for a submission (append-only, full audit history).
 */
export async function listReviewOverrides(submissionId, tenantId = DEFAULT_TENANT_ID) {
    return db.prepare(`
        SELECT override_id, submission_id, action, source_url, reason, reviewer_id, created_at
        FROM review_overrides
        WHERE submission_id = ? AND tenant_id = ?
        ORDER BY created_at ASC
    `).all(submissionId, tenantId).map(row => ({
        overrideId: row.override_id,
        submissionId: row.submission_id,
        action: row.action,
        sourceUrl: row.source_url,
        reason: row.reason,
        reviewerId: row.reviewer_id,
        createdAt: row.created_at
    }));
}
