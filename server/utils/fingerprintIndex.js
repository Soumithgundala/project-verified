// server/utils/fingerprintIndex.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.join(__dirname, '..', '.cache', '.fingerprint_index.json');
const DOCS_PATH = path.join(__dirname, '..', '.cache', '.fingerprint_docs.json');
const IGNORED_PATH = path.join(__dirname, '..', '.cache', '.ignored_fingerprints.json');

let invertedIndexCache = null; // hash -> [docId1, docId2]
let docStoreCache = null;      // docId -> { sourceUrl, fileName, fingerprints: [{hash, startPos, endPos}] }
let ignoredFingerprints = null; // Set of hashes to ignore

async function loadDualStore() {
    if (invertedIndexCache && docStoreCache && ignoredFingerprints) return;
    
    try {
        const indexData = await fs.readFile(INDEX_PATH, 'utf-8');
        invertedIndexCache = JSON.parse(indexData);
    } catch { invertedIndexCache = {}; }

    try {
        const docData = await fs.readFile(DOCS_PATH, 'utf-8');
        docStoreCache = JSON.parse(docData);
    } catch { docStoreCache = {}; }

    try {
        const ignoredData = await fs.readFile(IGNORED_PATH, 'utf-8');
        ignoredFingerprints = new Set(JSON.parse(ignoredData));
    } catch { ignoredFingerprints = new Set(); }
}

async function persistDualStore() {
    await fs.writeFile(INDEX_PATH, JSON.stringify(invertedIndexCache), 'utf-8');
    await fs.writeFile(DOCS_PATH, JSON.stringify(docStoreCache), 'utf-8');
}

/**
 * Saves Winnowing fingerprints to the Dual-Store database.
 * Prevents duplicating identical documents.
 */
export async function saveToDualStore(fingerprints, sourceUrl, fileName) {
    if (!fingerprints || fingerprints.length === 0) return null;
    await loadDualStore();
    
    // Check if document already exists
    const existingDoc = Object.values(docStoreCache).find(doc => doc.sourceUrl === sourceUrl && doc.fileName === fileName);
    if (existingDoc) return existingDoc.id;

    const docId = crypto.randomUUID();
    
    docStoreCache[docId] = {
        id: docId,
        sourceUrl,
        fileName,
        savedAt: new Date().toISOString(),
        fingerprints // Full object array with positions
    };

    fingerprints.forEach(fp => {
        if (ignoredFingerprints.has(fp.hash)) return; // Boilerplate exclusion
        
        if (!invertedIndexCache[fp.hash]) {
            invertedIndexCache[fp.hash] = [];
        }
        if (!invertedIndexCache[fp.hash].includes(docId)) {
            invertedIndexCache[fp.hash].push(docId);
        }
    });

    await persistDualStore();
    console.log(`💾 [DualStore] Saved ${fingerprints.length} fingerprints for docId: ${docId}`);
    return docId;
}

/**
 * Calculates Containment Score against the entire corpus.
 * Returns the best candidate match, or null.
 */
export async function queryDualStore(studentFingerprints) {
    if (!studentFingerprints || studentFingerprints.length === 0) return null;
    await loadDualStore();
    
    const candidateMatches = {}; // docId -> matchCount
    
    // 1. Candidate Retrieval via O(1) Inverted Index Lookups
    studentFingerprints.forEach(fp => {
        if (ignoredFingerprints.has(fp.hash)) return;

        const docIds = invertedIndexCache[fp.hash];
        if (docIds) {
            docIds.forEach(id => {
                candidateMatches[id] = (candidateMatches[id] || 0) + 1;
            });
        }
    });

    // 2. Threshold Filtering (Ignore docs matching < 5 fingerprints to avoid random collisions)
    const validDocIds = Object.keys(candidateMatches).filter(id => candidateMatches[id] >= 5);
    
    if (validDocIds.length === 0) return null;

    // 3. Containment Scoring
    const results = validDocIds.map(docId => {
        const matchedHashes = candidateMatches[docId];
        const totalStudentHashes = studentFingerprints.length;
        // Calculate raw containment
        const containmentScore = Math.min(100, (matchedHashes / totalStudentHashes) * 100);
        
        const docInfo = docStoreCache[docId];
        return {
            docId,
            sourceUrl: docInfo.sourceUrl,
            fileName: docInfo.fileName,
            matchedHashes,
            totalStudentHashes,
            containmentScore: parseFloat(containmentScore.toFixed(1))
        };
    });

    // 4. Return the top match
    results.sort((a, b) => b.containmentScore - a.containmentScore);
    return results[0]; 
}
