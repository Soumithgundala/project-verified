import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './database.js';
import { DEFAULT_TENANT_ID } from '../utils/tenant.js';

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
            console.error(`Failed to parse ${filePath}: ${e.message}`);
        }
    }
    return null;
}

const tenantId = DEFAULT_TENANT_ID;
const tenantKey = (hash) => `${tenantId}:${hash}`;

console.log('Starting migration from JSON to SQLite...');

const migrate = db.transaction(() => {
    const indexData = loadJson(JSON_FILES.INDEX);
    if (indexData) {
        const stmt = db.prepare(`INSERT OR REPLACE INTO fingerprint_index
            (key_id, hash, doc_ids, tenant_id, created_at, updated_at, source_type, verification_status, retention_policy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        const now = new Date().toISOString();
        for (const [hash, docIds] of Object.entries(indexData)) {
            stmt.run(tenantKey(hash), hash, JSON.stringify(docIds), tenantId, now, now, 'trusted_corpus', 'verified', 'standard');
        }
        console.log(`Migrated ${Object.keys(indexData).length} hashes to fingerprint_index`);
    }

    const docsData = loadJson(JSON_FILES.DOCS);
    if (docsData) {
        const metaStmt = db.prepare(`INSERT OR REPLACE INTO file_metadata
            (doc_id, source_url, file_name, saved_at, fingerprint_count, tenant_id, created_at, updated_at, source_type, verification_status, retention_policy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        const posStmt = db.prepare(`INSERT INTO fingerprint_positions
            (doc_id, hash, start_pos, end_pos, tenant_id, created_at, updated_at, source_type, verification_status, retention_policy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

        db.prepare('DELETE FROM fingerprint_positions WHERE tenant_id = ?').run(tenantId);

        let docCount = 0;
        for (const [docId, doc] of Object.entries(docsData)) {
            const savedAt = doc.savedAt || new Date().toISOString();
            metaStmt.run(docId, doc.sourceUrl, doc.fileName, savedAt, doc.fingerprints?.length || 0, tenantId, savedAt, savedAt, 'trusted_corpus', 'verified', 'standard');
            if (doc.fingerprints) {
                for (const fp of doc.fingerprints) {
                    posStmt.run(docId, fp.hash, fp.startPos, fp.endPos, tenantId, savedAt, savedAt, 'trusted_corpus', 'verified', 'standard');
                }
            }
            docCount++;
        }
        console.log(`Migrated ${docCount} documents to file_metadata and fingerprint_positions`);
    }

    const astData = loadJson(JSON_FILES.AST_DB);
    if (astData) {
        const stmt = db.prepare(`INSERT OR REPLACE INTO ast_hash_db
            (key_id, hash, entries, tenant_id, created_at, updated_at, source_type, verification_status, retention_policy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        const now = new Date().toISOString();
        for (const [hash, entries] of Object.entries(astData)) {
            stmt.run(tenantKey(hash), hash, JSON.stringify(entries), tenantId, now, now, 'legacy_ast_hash', 'verified', 'standard');
        }
        console.log(`Migrated ${Object.keys(astData).length} hashes to ast_hash_db`);
    }

    const quarantineData = loadJson(JSON_FILES.QUARANTINE);
    if (quarantineData && Array.isArray(quarantineData)) {
        const metaStmt = db.prepare(`INSERT OR REPLACE INTO quarantine_queue
            (id, payload, tenant_id, created_at, updated_at, source_type, verification_status, retention_policy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
        const codeStmt = db.prepare(`INSERT OR REPLACE INTO quarantine_code
            (quarantine_id, raw_code, tenant_id, created_at, updated_at, source_type, verification_status, retention_policy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const item of quarantineData) {
            const { rawCode, ...metadata } = item;
            const queuedAt = item.queuedAt || new Date().toISOString();
            metaStmt.run(item.id, JSON.stringify(metadata), tenantId, queuedAt, queuedAt, 'quarantine', 'pending_review', 'quarantine');
            codeStmt.run(item.id, rawCode || '', tenantId, queuedAt, queuedAt, 'quarantine_raw_code', 'pending_review', 'quarantine');
        }
        console.log(`Migrated ${quarantineData.length} items to quarantine_queue and quarantine_code`);
    }

    const ignoredData = loadJson(JSON_FILES.IGNORED);
    if (ignoredData && Array.isArray(ignoredData)) {
        const stmt = db.prepare(`INSERT OR REPLACE INTO whitelisted_hashes
            (key_id, hash, reason, added_at, tenant_id, created_at, updated_at, source_type, verification_status, retention_policy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        const now = new Date().toISOString();
        for (const hash of ignoredData) {
            stmt.run(tenantKey(hash), hash, 'Migrated from JSON ignored list', now, tenantId, now, now, 'whitelist', 'verified', 'standard');
        }
        console.log(`Migrated ${ignoredData.length} hashes to whitelisted_hashes`);
    }
});

try {
    migrate();
    console.log('Migration complete.');
} catch (err) {
    console.error('Migration failed:', err.message);
}

