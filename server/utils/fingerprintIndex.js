// server/utils/fingerprintIndex.js
import crypto from 'crypto';
import db from '../db/database.js';

/**
 * Saves Winnowing fingerprints to the SQLite database.
 * Prevents duplicating identical documents.
 */
export async function saveToDualStore(fingerprints, sourceUrl, fileName) {
    if (!fingerprints || fingerprints.length === 0) return null;

    // Check if document already exists
    const existing = db.prepare('SELECT doc_id FROM file_metadata WHERE source_url = ? AND file_name = ?').get(sourceUrl, fileName);
    if (existing) return existing.doc_id;

    const docId = crypto.randomUUID();
    const now = new Date().toISOString();

    const runTransaction = db.transaction((fps, sUrl, fName, dId, timestamp) => {
        // 1. Insert Metadata
        db.prepare('INSERT INTO file_metadata (doc_id, source_url, file_name, saved_at, fingerprint_count) VALUES (?, ?, ?, ?, ?)')
          .run(dId, sUrl, fName, timestamp, fps.length);

        // 2. Insert Positions
        const posStmt = db.prepare('INSERT INTO fingerprint_positions (doc_id, hash, start_pos, end_pos) VALUES (?, ?, ?, ?)');
        for (const fp of fps) {
            posStmt.run(dId, fp.hash, fp.startPos, fp.endPos);
        }

        // 3. Update Inverted Index
        const getIndexStmt = db.prepare('SELECT doc_ids FROM fingerprint_index WHERE hash = ?');
        const updateIndexStmt = db.prepare('INSERT OR REPLACE INTO fingerprint_index (hash, doc_ids) VALUES (?, ?)');
        
        // Get whitelisted hashes to exclude them from the index
        const whitelisted = new Set(db.prepare('SELECT hash FROM whitelisted_hashes').all().map(r => r.hash));

        for (const fp of fps) {
            if (whitelisted.has(fp.hash)) continue;

            const row = getIndexStmt.get(fp.hash);
            let docIds = row ? JSON.parse(row.doc_ids) : [];
            
            if (!docIds.includes(dId)) {
                docIds.push(dId);
                updateIndexStmt.run(fp.hash, JSON.stringify(docIds));
            }
        }
    });

    try {
        runTransaction(fingerprints, sourceUrl, fileName, docId, now);
        console.log(`💾 [DualStore] Saved ${fingerprints.length} fingerprints for docId: ${docId}`);
        return docId;
    } catch (err) {
        console.error(`❌ [DualStore] Failed to save document: ${err.message}`);
        return null;
    }
}

/**
 * Calculates Containment Score against the entire corpus.
 * Returns the best candidate match, or null.
 */
export async function queryDualStore(studentFingerprints) {
    if (!studentFingerprints || studentFingerprints.length === 0) return null;
    
    // Get whitelisted hashes to ignore them
    const whitelisted = new Set(db.prepare('SELECT hash FROM whitelisted_hashes').all().map(r => r.hash));
    
    const candidateMatches = {}; // docId -> matchCount
    const getIndexStmt = db.prepare('SELECT doc_ids FROM fingerprint_index WHERE hash = ?');

    // 1. Candidate Retrieval via O(1) Inverted Index Lookups
    studentFingerprints.forEach(fp => {
        if (whitelisted.has(fp.hash)) return;

        const row = getIndexStmt.get(fp.hash);
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
    const getMetaStmt = db.prepare('SELECT source_url, file_name FROM file_metadata WHERE doc_id = ?');
    
    const results = validDocIds.map(docId => {
        const matchedHashes = candidateMatches[docId];
        const totalStudentHashes = studentFingerprints.length;
        // Calculate raw containment
        const containmentScore = Math.min(100, (matchedHashes / totalStudentHashes) * 100);
        
        const docInfo = getMetaStmt.get(docId);
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
