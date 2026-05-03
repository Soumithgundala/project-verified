// server/utils/fingerprintIndex.js
import crypto from 'crypto';
import db from '../db/database.js';
import { DEFAULT_TENANT_ID } from './tenant.js';

/**
 * Saves Winnowing fingerprints to the SQLite database.
 * Prevents duplicating identical documents.
 */
export async function saveToDualStore(fingerprints, sourceUrl, fileName, options = {}) {
    if (!fingerprints || fingerprints.length === 0) return null;

    const tenantId = options.tenantId || DEFAULT_TENANT_ID;
    const sourceType = options.sourceType || 'trusted_corpus';
    const verificationStatus = options.verificationStatus || 'verified';
    const retentionPolicy = options.retentionPolicy || 'standard';
    const exactHash = options.exactHash || null;
    const trustedSource = options.trustedSource ? 1 : 0;
    const sourceOrigin = options.sourceOrigin || 'unknown';

    const docId = crypto.randomUUID();
    const now = new Date().toISOString();

    const runTransaction = db.transaction((fps, sUrl, fName, dId, timestamp, eHash) => {
        // Dedup check inside transaction
        if (eHash) {
            const existing = db.prepare('SELECT doc_id FROM file_metadata WHERE tenant_id = ? AND exact_hash = ?').get(tenantId, eHash);
            if (existing) return existing.doc_id;
        } else {
            const existing = db.prepare('SELECT doc_id FROM file_metadata WHERE tenant_id = ? AND source_url = ? AND file_name = ?').get(tenantId, sUrl, fName);
            if (existing) return existing.doc_id;
        }

        // 1. Insert Metadata
        db.prepare(`INSERT INTO file_metadata
            (doc_id, source_url, file_name, saved_at, fingerprint_count, exact_hash, trusted_source, source_origin, tenant_id, created_at, updated_at, source_type, verification_status, retention_policy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(dId, sUrl, fName, timestamp, fps.length, eHash, trustedSource, sourceOrigin, tenantId, timestamp, timestamp, sourceType, verificationStatus, retentionPolicy);

        // 2. Insert Positions
        const posStmt = db.prepare(`INSERT INTO fingerprint_positions
            (doc_id, hash, start_pos, end_pos, start_line, end_line, tenant_id, created_at, updated_at, source_type, verification_status, retention_policy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const fp of fps) {
            posStmt.run(dId, fp.hash, fp.startPos, fp.endPos, fp.startLine, fp.endLine, tenantId, timestamp, timestamp, sourceType, verificationStatus, retentionPolicy);
        }

        // 3. Update Inverted Index
        const getIndexStmt = db.prepare('SELECT doc_ids FROM fingerprint_index WHERE tenant_id = ? AND hash = ?');
        const updateIndexStmt = db.prepare(`INSERT OR REPLACE INTO fingerprint_index
            (hash, doc_ids, tenant_id, created_at, updated_at, source_type, verification_status, retention_policy)
            VALUES (?, ?, ?, COALESCE((SELECT created_at FROM fingerprint_index WHERE tenant_id = ? AND hash = ?), ?), ?, ?, ?, ?)`);
        
        // Get whitelisted hashes to exclude them from the index
        const whitelisted = new Set(db.prepare('SELECT hash FROM whitelisted_hashes WHERE tenant_id = ?').all(tenantId).map(r => r.hash));

        for (const fp of fps) {
            if (whitelisted.has(fp.hash)) continue;

            const row = getIndexStmt.get(tenantId, fp.hash);
            let docIds = row ? JSON.parse(row.doc_ids) : [];
            
            if (!docIds.includes(dId)) {
                docIds.push(dId);
                updateIndexStmt.run(fp.hash, JSON.stringify(docIds), tenantId, tenantId, fp.hash, timestamp, timestamp, sourceType, verificationStatus, retentionPolicy);
            }
        }

        return dId;
    });

    try {
        const resultDocId = runTransaction(fingerprints, sourceUrl, fileName, docId, now, exactHash);
        if (resultDocId === docId) {
            console.log(`💾 [DualStore] Saved ${fingerprints.length} fingerprints for docId: ${docId}`);
        } else {
            console.log(`⏭️  [DualStore] Skipped deduplicated document: ${resultDocId}`);
        }
        return resultDocId;
    } catch (err) {
        console.error(`❌ [DualStore] Failed to save document: ${err.message}`);
        return null;
    }
}

/**
 * Calculates Containment Score against the entire corpus.
 * Returns the best candidate match, or null.
 */
export async function queryDualStore(studentFingerprints, options = {}) {
    if (!studentFingerprints || studentFingerprints.length === 0) return null;

    const tenantId = options.tenantId || DEFAULT_TENANT_ID;
    
    // Get whitelisted hashes to ignore them
    const whitelisted = new Set(db.prepare('SELECT hash FROM whitelisted_hashes WHERE tenant_id = ?').all(tenantId).map(r => r.hash));
    
    const candidateMatches = {}; // docId -> matchCount
    const getIndexStmt = db.prepare('SELECT doc_ids FROM fingerprint_index WHERE tenant_id = ? AND hash = ?');

    // 1. Candidate Retrieval via O(1) Inverted Index Lookups
    studentFingerprints.forEach(fp => {
        if (whitelisted.has(fp.hash)) return;

        const row = getIndexStmt.get(tenantId, fp.hash);
        if (row) {
            const docIds = JSON.parse(row.doc_ids);
            docIds.forEach(id => {
                candidateMatches[id] = (candidateMatches[id] || 0) + 1;
            });
        }
    });

    // 2. Threshold Filtering (Ignore docs matching < 5 fingerprints to avoid random collisions)
    const validDocIds = Object.keys(candidateMatches).filter(id => candidateMatches[id] >= 5);
    
    if (validDocIds.length === 0) return null;

    // 3. Containment Scoring
    const getMetaStmt = db.prepare('SELECT source_url, file_name FROM file_metadata WHERE tenant_id = ? AND doc_id = ?');
    
    const results = validDocIds.map(docId => {
        const matchedHashes = candidateMatches[docId];
        const totalStudentHashes = studentFingerprints.length;
        // Calculate raw containment
        const containmentScore = Math.min(100, (matchedHashes / totalStudentHashes) * 100);
        
        const docInfo = getMetaStmt.get(tenantId, docId);
        if (!docInfo) return null;

        return {
            docId,
            sourceUrl: docInfo.source_url,
            fileName: docInfo.file_name,
            matchedHashes,
            totalStudentHashes,
            containmentScore: parseFloat(containmentScore.toFixed(1))
        };
    }).filter(Boolean);

    if (results.length === 0) return null;

    // 4. Return the top match
    results.sort((a, b) => b.containmentScore - a.containmentScore);
    return results[0]; 
}

/**
 * Retrieves granular matches for all candidate documents to build an Evidence Map.
 * 
 * @param {Array} studentFingerprints - The student's fingerprints
 * @param {Object} options - Search options (tenantId, etc.)
 */
export async function getDetailedMatches(studentFingerprints, options = {}) {
    if (!studentFingerprints || studentFingerprints.length === 0) return {};

    const tenantId = options.tenantId || DEFAULT_TENANT_ID;
    
    // 1. Build fast lookup for student fingerprints
    const studentMap = new Map();
    const hashesToQuery = [];
    
    studentFingerprints.forEach(fp => {
        studentMap.set(fp.hash, fp);
        hashesToQuery.push(fp.hash);
    });

    if (hashesToQuery.length === 0) return {};

    // 2. Identify candidate documents (Threshold filtering) and Compute IDF Uniqueness
    const whitelisted = new Set(db.prepare('SELECT hash FROM whitelisted_hashes WHERE tenant_id = ?').all(tenantId).map(r => r.hash));
    
    // Get total docs for IDF calculation
    const totalDocsRow = db.prepare('SELECT COUNT(DISTINCT doc_id) as count FROM file_metadata WHERE tenant_id = ?').get(tenantId);
    const totalDocs = totalDocsRow ? Math.max(totalDocsRow.count, 1) : 1;

    const candidateMatches = {}; 
    const hashUniqueness = {}; // store IDF scores
    const getIndexStmt = db.prepare('SELECT doc_ids FROM fingerprint_index WHERE tenant_id = ? AND hash = ?');

    studentFingerprints.forEach(fp => {
        if (whitelisted.has(fp.hash)) return;
        const row = getIndexStmt.get(tenantId, fp.hash);
        if (row) {
            const docIds = JSON.parse(row.doc_ids);
            
            // Calculate IDF-style uniqueness
            const docFrequency = Math.max(docIds.length, 1);
            hashUniqueness[fp.hash] = Math.log(totalDocs / docFrequency);
            
            docIds.forEach(id => {
                candidateMatches[id] = (candidateMatches[id] || 0) + 1;
            });
        }
    });

    // Only consider documents with at least 5 matches to reduce noise
    const validDocIds = Object.keys(candidateMatches).filter(id => candidateMatches[id] >= 5);
    if (validDocIds.length === 0) return {};

    // 3. Fetch detailed positions for each valid document
    const matchesByDoc = {};
    const getPosStmt = db.prepare(`
        SELECT hash, start_pos, end_pos, start_line, end_line 
        FROM fingerprint_positions 
        WHERE tenant_id = ? AND doc_id = ? AND hash IN (${hashesToQuery.map(() => '?').join(',')})
    `);

    for (const docId of validDocIds) {
        const rows = getPosStmt.all(tenantId, docId, ...hashesToQuery);
        
        matchesByDoc[docId] = rows.map(row => {
            const studentFp = studentMap.get(row.hash);
            return {
                hash: row.hash,
                uniqueness: hashUniqueness[row.hash] || 0,
                studentStart: studentFp.startPos,
                studentEnd: studentFp.endPos,
                studentStartLine: studentFp.startLine,
                studentEndLine: studentFp.endLine,
                sourceStart: row.start_pos,
                sourceEnd: row.end_pos,
                sourceStartLine: row.start_line,
                sourceEndLine: row.end_line
            };
        });
    }

    return matchesByDoc;
}

/**
 * Fetches metadata for a list of document IDs.
 */
export async function getDocumentsMetadata(docIds, tenantId = DEFAULT_TENANT_ID) {
    if (!docIds || docIds.length === 0) return {};

    const placeholders = docIds.map(() => '?').join(',');
    const rows = db.prepare(`SELECT doc_id, source_url, file_name FROM file_metadata WHERE tenant_id = ? AND doc_id IN (${placeholders})`).all(tenantId, ...docIds);
    
    const meta = {};
    rows.forEach(r => {
        meta[r.doc_id] = { sourceUrl: r.source_url, fileName: r.file_name };
    });
    return meta;
}
