import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', '.cache');

const JSON_FILES = {
    INDEX: path.join(CACHE_DIR, '.fingerprint_index.json'),
    DOCS: path.join(CACHE_DIR, '.fingerprint_docs.json'),
    AST_DB: path.join(CACHE_DIR, '.ast_hash_db.json'),
    QUARANTINE: path.join(CACHE_DIR, '.quarantine_queue.json'),
    IGNORED: path.join(CACHE_DIR, '.ignored_fingerprints.json')
};

function loadJson(filePath) {
    if (fs.existsSync(filePath)) {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (e) {
            console.error(`❌ Failed to parse ${filePath}: ${e.message}`);
        }
    }
    return null;
}

console.log('🚀 Starting migration from JSON to SQLite...');

const migrate = db.transaction(() => {
    // 1. Migrate Fingerprint Index
    const indexData = loadJson(JSON_FILES.INDEX);
    if (indexData) {
        const stmt = db.prepare('INSERT OR REPLACE INTO fingerprint_index (hash, doc_ids) VALUES (?, ?)');
        for (const [hash, docIds] of Object.entries(indexData)) {
            stmt.run(hash, JSON.stringify(docIds));
        }
        console.log(`✅ Migrated ${Object.keys(indexData).length} hashes to fingerprint_index`);
    }

    // 2. Migrate Fingerprint Docs (Metadata & Positions)
    const docsData = loadJson(JSON_FILES.DOCS);
    if (docsData) {
        const metaStmt = db.prepare('INSERT OR REPLACE INTO file_metadata (doc_id, source_url, file_name, saved_at, fingerprint_count) VALUES (?, ?, ?, ?, ?)');
        const posStmt = db.prepare('INSERT INTO fingerprint_positions (doc_id, hash, start_pos, end_pos) VALUES (?, ?, ?, ?)');
        
        // Clear positions first since we are inserting fresh
        db.prepare('DELETE FROM fingerprint_positions').run();

        let docCount = 0;
        for (const [docId, doc] of Object.entries(docsData)) {
            metaStmt.run(docId, doc.sourceUrl, doc.fileName, doc.savedAt, doc.fingerprints?.length || 0);
            if (doc.fingerprints) {
                for (const fp of doc.fingerprints) {
                    posStmt.run(docId, fp.hash, fp.startPos, fp.endPos);
                }
            }
            docCount++;
        }
        console.log(`✅ Migrated ${docCount} documents to file_metadata and fingerprint_positions`);
    }

    // 3. Migrate AST Hash DB
    const astData = loadJson(JSON_FILES.AST_DB);
    if (astData) {
        const stmt = db.prepare('INSERT OR REPLACE INTO ast_hash_db (hash, entries) VALUES (?, ?)');
        for (const [hash, entries] of Object.entries(astData)) {
            stmt.run(hash, JSON.stringify(entries));
        }
        console.log(`✅ Migrated ${Object.keys(astData).length} hashes to ast_hash_db`);
    }

    // 4. Migrate Quarantine Queue
    const quarantineData = loadJson(JSON_FILES.QUARANTINE);
    if (quarantineData && Array.isArray(quarantineData)) {
        const stmt = db.prepare('INSERT OR REPLACE INTO quarantine_queue (id, payload) VALUES (?, ?)');
        for (const item of quarantineData) {
            stmt.run(item.id, JSON.stringify(item));
        }
        console.log(`✅ Migrated ${quarantineData.length} items to quarantine_queue`);
    }

    // 5. Migrate Ignored Fingerprints (Whitelist)
    const ignoredData = loadJson(JSON_FILES.IGNORED);
    if (ignoredData && Array.isArray(ignoredData)) {
        const stmt = db.prepare('INSERT OR REPLACE INTO whitelisted_hashes (hash, reason, added_at) VALUES (?, ?, ?)');
        const now = new Date().toISOString();
        for (const hash of ignoredData) {
            stmt.run(hash, 'Migrated from JSON ignored list', now);
        }
        console.log(`✅ Migrated ${ignoredData.length} hashes to whitelisted_hashes`);
    }
});

try {
    migrate();
    console.log('🎉 Migration complete!');
} catch (err) {
    console.error('❌ Migration failed:', err.message);
}
