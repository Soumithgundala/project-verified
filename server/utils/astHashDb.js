// server/utils/astHashDb.js
import db from '../db/database.js';
import crypto from 'crypto';
import { DEFAULT_TENANT_ID } from './tenant.js';

/**
 * Looks up structural hashes in the local clone database.
 * @param {string[]} fingerprints - Array of SHA-256 structural hashes or Winnowing integers
 * @returns {Array} - Array of matched database entries
 */
export async function lookupFingerprints(fingerprints, options = {}) {
    const tenantId = options.tenantId || DEFAULT_TENANT_ID;
    const stmt = db.prepare('SELECT entries FROM ast_hash_db WHERE tenant_id = ? AND hash = ?');
    let matches = [];

    fingerprints.forEach(fp => {
        const row = stmt.get(tenantId, fp);
        if (row) {
            matches = matches.concat(JSON.parse(row.entries));
        }
    });
    return matches;
}

/**
 * Saves new clone entries to the local database.
 * @param {string[]} fingerprints - Array of hashes to save
 * @param {string} sourceUrl - The GitHub repo URL of the original source
 * @param {string} fileName - The file path that was matched
 */
export async function saveFingerprints(fingerprints, sourceUrl, fileName, options = {}) {
    const tenantId = options.tenantId || DEFAULT_TENANT_ID;
    const sourceType = options.sourceType || 'legacy_ast_hash';
    const verificationStatus = options.verificationStatus || 'verified';
    const retentionPolicy = options.retentionPolicy || 'standard';
    const getStmt = db.prepare('SELECT entries FROM ast_hash_db WHERE tenant_id = ? AND hash = ?');
    const upsertStmt = db.prepare(`INSERT OR REPLACE INTO ast_hash_db
        (hash, entries, tenant_id, created_at, updated_at, source_type, verification_status, retention_policy)
        VALUES (?, ?, ?, COALESCE((SELECT created_at FROM ast_hash_db WHERE tenant_id = ? AND hash = ?), ?), ?, ?, ?, ?)`);

    const runTransaction = db.transaction((fps, url, file) => {
        let updated = false;
        const now = new Date().toISOString();

        fps.forEach(fp => {
            const row = getStmt.get(tenantId, fp);
            let entries = row ? JSON.parse(row.entries) : [];

            // Prevent duplicate URLs for the same fingerprint
            if (!entries.some(entry => entry.url === url)) {
                entries.push({ url, file, addedAt: now });
                upsertStmt.run(fp, JSON.stringify(entries), tenantId, tenantId, fp, now, now, sourceType, verificationStatus, retentionPolicy);
                updated = true;
            }
        });
        return updated;
    });

    try {
        const updated = runTransaction(fingerprints, sourceUrl, fileName);
        if (updated) {
            console.log(`[AstHashDb] Saved clone fingerprints -> ${sourceUrl}`);
        }
    } catch (err) {
        console.error(`[AstHashDb] Failed to save fingerprints: ${err.message}`);
    }
}

/**
 * Places a global clone into the review queue for manual verification
 * before permanent ingestion into the trusted dataset.
 */
export async function queueForCorpusReview(reviewPayload, options = {}) {
    const id = crypto.randomUUID();
    const tenantId = options.tenantId || DEFAULT_TENANT_ID;
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
    const { rawCode, ...metadataPayload } = reviewPayload;
    const entry = {
        id,
        ...metadataPayload,
        queuedAt: now
    };

    try {
        const insertQuarantine = db.transaction(() => {
            db.prepare(`INSERT INTO quarantine_queue
                (id, payload, expires_at, tenant_id, created_at, updated_at, source_type, verification_status, retention_policy)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
              .run(id, JSON.stringify(entry), expiresAt, tenantId, now, now, 'quarantine', 'pending_review', 'quarantine');

            db.prepare(`INSERT INTO quarantine_code
                (quarantine_id, raw_code, expires_at, tenant_id, created_at, updated_at, source_type, verification_status, retention_policy)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
              .run(id, rawCode || '', expiresAt, tenantId, now, now, 'quarantine_raw_code', 'pending_review', 'quarantine');
        });

        insertQuarantine();
        console.log(`[Quarantine] Clone marked for admin review: ${reviewPayload.sourceUrl} (ID: ${id})`);
        return id;
    } catch (err) {
        console.error(`[Quarantine] Failed to queue item: ${err.message}`);
        return null;
    }
}

export async function getQuarantineQueue(options = {}) {
    const tenantId = options.tenantId || DEFAULT_TENANT_ID;
    try {
        const rows = db.prepare('SELECT payload FROM quarantine_queue WHERE tenant_id = ? ORDER BY created_at DESC').all(tenantId);
        return rows.map(r => JSON.parse(r.payload));
    } catch (err) {
        console.error(`[Quarantine] Failed to fetch queue: ${err.message}`);
        return [];
    }
}

export async function getQuarantineItem(id, options = {}) {
    const tenantId = options.tenantId || DEFAULT_TENANT_ID;
    try {
        const row = db.prepare(`
            SELECT q.payload, qc.raw_code
            FROM quarantine_queue q
            LEFT JOIN quarantine_code qc ON qc.quarantine_id = q.id AND qc.tenant_id = q.tenant_id
            WHERE q.id = ? AND q.tenant_id = ?
        `).get(id, tenantId);
        if (!row) return null;

        const payload = JSON.parse(row.payload);
        return { ...payload, rawCode: row.raw_code || payload.rawCode || '' };
    } catch (err) {
        console.error(`[Quarantine] Failed to fetch item: ${err.message}`);
        return null;
    }
}

export async function removeFromQuarantine(id, options = {}) {
    const tenantId = options.tenantId || DEFAULT_TENANT_ID;
    try {
        const remove = db.transaction(() => {
            db.prepare('DELETE FROM quarantine_code WHERE quarantine_id = ? AND tenant_id = ?').run(id, tenantId);
            db.prepare('DELETE FROM quarantine_queue WHERE id = ? AND tenant_id = ?').run(id, tenantId);
        });
        remove();
    } catch (err) {
        console.error(`[Quarantine] Failed to remove item: ${err.message}`);
    }
}

