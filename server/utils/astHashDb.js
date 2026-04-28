// server/utils/astHashDb.js
import db from '../db/database.js';
import crypto from 'crypto';

/**
 * Looks up structural hashes in the local clone database.
 * @param {string[]} fingerprints - Array of SHA-256 structural hashes or Winnowing integers
 * @returns {Array} - Array of matched database entries
 */
export async function lookupFingerprints(fingerprints) {
    const stmt = db.prepare('SELECT entries FROM ast_hash_db WHERE hash = ?');
    let matches = [];
    
    fingerprints.forEach(fp => {
        const row = stmt.get(fp);
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
export async function saveFingerprints(fingerprints, sourceUrl, fileName) {
    const getStmt = db.prepare('SELECT entries FROM ast_hash_db WHERE hash = ?');
    const upsertStmt = db.prepare('INSERT OR REPLACE INTO ast_hash_db (hash, entries) VALUES (?, ?)');
    
    const runTransaction = db.transaction((fps, url, file) => {
        let updated = false;
        const now = new Date().toISOString();

        fps.forEach(fp => {
            const row = getStmt.get(fp);
            let entries = row ? JSON.parse(row.entries) : [];
            
            // Prevent duplicate URLs for the same fingerprint
            if (!entries.some(entry => entry.url === url)) {
                entries.push({ url, file, addedAt: now });
                upsertStmt.run(fp, JSON.stringify(entries));
                updated = true;
            }
        });
        return updated;
    });

    try {
        const updated = runTransaction(fingerprints, sourceUrl, fileName);
        if (updated) {
            console.log(`💾 [AstHashDb] Saved clone fingerprints → ${sourceUrl}`);
        }
    } catch (err) {
        console.error(`❌ [AstHashDb] Failed to save fingerprints: ${err.message}`);
    }
}

/**
 * Places a global clone into the review queue for manual verification
 * before permanent ingestion into the trusted dataset.
 */
export async function queueForCorpusReview(reviewPayload) {
    const id = crypto.randomUUID();
    const entry = {
        id,
        ...reviewPayload,
        queuedAt: new Date().toISOString()
    };
    
    try {
        db.prepare('INSERT INTO quarantine_queue (id, payload) VALUES (?, ?)')
          .run(id, JSON.stringify(entry));
        console.log(`⚠️ [Quarantine] Clone marked for admin review: ${reviewPayload.sourceUrl} (ID: ${id})`);
        return id;
    } catch (err) {
        console.error(`❌ [Quarantine] Failed to queue item: ${err.message}`);
        return null;
    }
}

export async function getQuarantineQueue() {
    try {
        const rows = db.prepare('SELECT payload FROM quarantine_queue').all();
        return rows.map(r => JSON.parse(r.payload));
    } catch (err) {
        console.error(`❌ [Quarantine] Failed to fetch queue: ${err.message}`);
        return [];
    }
}

export async function getQuarantineItem(id) {
    try {
        const row = db.prepare('SELECT payload FROM quarantine_queue WHERE id = ?').get(id);
        return row ? JSON.parse(row.payload) : null;
    } catch (err) {
        console.error(`❌ [Quarantine] Failed to fetch item: ${err.message}`);
        return null;
    }
}

export async function removeFromQuarantine(id) {
    try {
        db.prepare('DELETE FROM quarantine_queue WHERE id = ?').run(id);
    } catch (err) {
        console.error(`❌ [Quarantine] Failed to remove item: ${err.message}`);
    }
}
