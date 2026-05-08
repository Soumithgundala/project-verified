import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { DEFAULT_TENANT_ID } from '../utils/tenant.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', '.cache');
const DB_PATH = process.env.SQLITE_DB_PATH 
    ? path.resolve(__dirname, '..', process.env.SQLITE_DB_PATH)
    : path.join(CACHE_DIR, 'gitpulse.db');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

console.log(`🗄️  [Database] Connecting to SQLite at: ${DB_PATH}`);
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency and performance
db.pragma('journal_mode = WAL');

const CORE_METADATA_COLUMNS = [
    { name: 'tenant_id', type: 'TEXT', value: DEFAULT_TENANT_ID },
    { name: 'created_at', type: 'TEXT', value: () => new Date().toISOString() },
    { name: 'updated_at', type: 'TEXT', value: () => new Date().toISOString() },
    { name: 'source_type', type: 'TEXT', value: 'system' },
    { name: 'verification_status', type: 'TEXT', value: 'unverified' },
    { name: 'retention_policy', type: 'TEXT', value: 'standard' }
];

function tableColumns(tableName) {
    return new Set(db.prepare(`PRAGMA table_info(${tableName})`).all().map(column => column.name));
}

function addColumnIfMissing(tableName, columnName, columnType) {
    const columns = tableColumns(tableName);
    if (!columns.has(columnName)) {
        db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
    }
}

function backfillColumn(tableName, columnName, value) {
    const resolvedValue = typeof value === 'function' ? value() : value;
    db.prepare(`UPDATE ${tableName} SET ${columnName} = ? WHERE ${columnName} IS NULL OR ${columnName} = ''`)
      .run(resolvedValue);
}

function hardenCoreTable(tableName) {
    for (const column of CORE_METADATA_COLUMNS) {
        addColumnIfMissing(tableName, column.name, column.type);
        backfillColumn(tableName, column.name, column.value);
    }
}

// Initialize Tables
db.exec(`
    CREATE TABLE IF NOT EXISTS fingerprint_index (
        hash TEXT,
        doc_ids TEXT, -- JSON array of doc_ids
        tenant_id TEXT DEFAULT '${DEFAULT_TENANT_ID}',
        created_at TEXT,
        updated_at TEXT,
        source_type TEXT DEFAULT 'trusted_corpus',
        verification_status TEXT DEFAULT 'verified',
        retention_policy TEXT DEFAULT 'standard',
        PRIMARY KEY (tenant_id, hash)
    );

    CREATE TABLE IF NOT EXISTS file_metadata (
        doc_id TEXT PRIMARY KEY,
        source_url TEXT,
        file_name TEXT,
        saved_at TEXT,
        fingerprint_count INTEGER,
        exact_hash TEXT,
        trusted_source BOOLEAN DEFAULT 0,
        source_origin TEXT DEFAULT 'unknown',
        tenant_id TEXT DEFAULT '${DEFAULT_TENANT_ID}',
        created_at TEXT,
        updated_at TEXT,
        source_type TEXT DEFAULT 'trusted_corpus',
        verification_status TEXT DEFAULT 'verified',
        retention_policy TEXT DEFAULT 'standard'
    );

    CREATE TABLE IF NOT EXISTS fingerprint_positions (
        doc_id TEXT,
        hash TEXT,
        start_pos INTEGER,
        end_pos INTEGER,
        start_line INTEGER,
        end_line INTEGER,
        tenant_id TEXT DEFAULT '${DEFAULT_TENANT_ID}',
        created_at TEXT,
        updated_at TEXT,
        source_type TEXT DEFAULT 'trusted_corpus',
        verification_status TEXT DEFAULT 'verified',
        retention_policy TEXT DEFAULT 'standard'
    );
    CREATE INDEX IF NOT EXISTS idx_fp_pos_doc_id ON fingerprint_positions(doc_id);
    CREATE INDEX IF NOT EXISTS idx_fp_pos_hash ON fingerprint_positions(hash);

    CREATE TABLE IF NOT EXISTS ast_hash_db (
        hash TEXT,
        entries TEXT, -- JSON array of { url, file, addedAt }
        tenant_id TEXT DEFAULT '${DEFAULT_TENANT_ID}',
        created_at TEXT,
        updated_at TEXT,
        source_type TEXT DEFAULT 'legacy_ast_hash',
        verification_status TEXT DEFAULT 'verified',
        retention_policy TEXT DEFAULT 'standard',
        PRIMARY KEY (tenant_id, hash)
    );

    CREATE TABLE IF NOT EXISTS quarantine_queue (
        id TEXT PRIMARY KEY,
        payload TEXT, -- JSON object of review metadata only; raw code lives in quarantine_code
        expires_at TEXT,
        tenant_id TEXT DEFAULT '${DEFAULT_TENANT_ID}',
        created_at TEXT,
        updated_at TEXT,
        source_type TEXT DEFAULT 'quarantine',
        verification_status TEXT DEFAULT 'pending_review',
        retention_policy TEXT DEFAULT 'quarantine'
    );

    CREATE TABLE IF NOT EXISTS quarantine_code (
        quarantine_id TEXT PRIMARY KEY,
        raw_code TEXT,
        expires_at TEXT,
        tenant_id TEXT DEFAULT '${DEFAULT_TENANT_ID}',
        created_at TEXT,
        updated_at TEXT,
        source_type TEXT DEFAULT 'quarantine_raw_code',
        verification_status TEXT DEFAULT 'pending_review',
        retention_policy TEXT DEFAULT 'quarantine',
        FOREIGN KEY (quarantine_id) REFERENCES quarantine_queue(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS whitelisted_hashes (
        hash TEXT,
        reason TEXT,
        added_at TEXT,
        tenant_id TEXT DEFAULT '${DEFAULT_TENANT_ID}',
        created_at TEXT,
        updated_at TEXT,
        source_type TEXT DEFAULT 'whitelist',
        verification_status TEXT DEFAULT 'verified',
        retention_policy TEXT DEFAULT 'standard',
        PRIMARY KEY (tenant_id, hash)
    );

    CREATE TABLE IF NOT EXISTS ingestion_jobs (
        id TEXT PRIMARY KEY,
        description TEXT,
        status TEXT,
        error_message TEXT,
        queued_at TEXT,
        started_at TEXT,
        completed_at TEXT,
        tenant_id TEXT DEFAULT '${DEFAULT_TENANT_ID}',
        created_at TEXT,
        updated_at TEXT,
        source_type TEXT DEFAULT 'ingestion_queue',
        verification_status TEXT DEFAULT 'system',
        retention_policy TEXT DEFAULT 'job_audit'
    );

    CREATE TABLE IF NOT EXISTS upload_archives (
        id TEXT PRIMARY KEY,
        original_name TEXT,
        mime_type TEXT,
        size_bytes INTEGER,
        expires_at TEXT,
        cleaned_at TEXT,
        tenant_id TEXT DEFAULT '${DEFAULT_TENANT_ID}',
        created_at TEXT,
        updated_at TEXT,
        source_type TEXT DEFAULT 'document_upload',
        verification_status TEXT DEFAULT 'processed',
        retention_policy TEXT DEFAULT 'transient_upload'
    );

    CREATE TABLE IF NOT EXISTS submissions (
        submission_id TEXT PRIMARY KEY,
        owner TEXT,
        repo TEXT,
        sha TEXT,
        student_fingerprints TEXT, -- JSON string
        analysis_results TEXT, -- JSON string
        tenant_id TEXT DEFAULT '${DEFAULT_TENANT_ID}',
        created_at TEXT,
        updated_at TEXT,
        source_type TEXT DEFAULT 'submission',
        verification_status TEXT DEFAULT 'processed',
        retention_policy TEXT DEFAULT 'long_term'
    );

    CREATE TABLE IF NOT EXISTS review_overrides (
        override_id TEXT PRIMARY KEY,
        submission_id TEXT,
        action TEXT,
        source_url TEXT,
        reason TEXT NOT NULL,
        reviewer_id TEXT,
        tenant_id TEXT DEFAULT '${DEFAULT_TENANT_ID}',
        created_at TEXT,
        updated_at TEXT,
        source_type TEXT DEFAULT 'human_review',
        verification_status TEXT DEFAULT 'reviewed',
        retention_policy TEXT DEFAULT 'long_term',
        FOREIGN KEY (submission_id) REFERENCES submissions(submission_id) ON DELETE CASCADE
    );
`);

function migrateTenantKeyedHashTable(tableName, createSql, copySql) {
    const columns = tableColumns(tableName);
    // If it doesn't have key_id, it is already migrated to composite PK
    if (!columns.has('key_id')) return;

    db.exec(`ALTER TABLE ${tableName} RENAME TO ${tableName}_legacy`);
    db.exec(createSql);
    db.exec(copySql);
    db.exec(`DROP TABLE ${tableName}_legacy`);
}

migrateTenantKeyedHashTable(
    'fingerprint_index',
    `CREATE TABLE fingerprint_index (
        hash TEXT,
        doc_ids TEXT,
        tenant_id TEXT DEFAULT '${DEFAULT_TENANT_ID}',
        created_at TEXT,
        updated_at TEXT,
        source_type TEXT DEFAULT 'trusted_corpus',
        verification_status TEXT DEFAULT 'verified',
        retention_policy TEXT DEFAULT 'standard',
        PRIMARY KEY (tenant_id, hash)
    )`,
    `INSERT OR IGNORE INTO fingerprint_index
        (hash, doc_ids, tenant_id, created_at, updated_at, source_type, verification_status, retention_policy)
     SELECT hash, doc_ids, tenant_id, created_at, updated_at, source_type, verification_status, retention_policy
     FROM fingerprint_index_legacy`
);

migrateTenantKeyedHashTable(
    'ast_hash_db',
    `CREATE TABLE ast_hash_db (
        hash TEXT,
        entries TEXT,
        tenant_id TEXT DEFAULT '${DEFAULT_TENANT_ID}',
        created_at TEXT,
        updated_at TEXT,
        source_type TEXT DEFAULT 'legacy_ast_hash',
        verification_status TEXT DEFAULT 'verified',
        retention_policy TEXT DEFAULT 'standard',
        PRIMARY KEY (tenant_id, hash)
    )`,
    `INSERT OR IGNORE INTO ast_hash_db
        (hash, entries, tenant_id, created_at, updated_at, source_type, verification_status, retention_policy)
     SELECT hash, entries, tenant_id, created_at, updated_at, source_type, verification_status, retention_policy
     FROM ast_hash_db_legacy`
);

migrateTenantKeyedHashTable(
    'whitelisted_hashes',
    `CREATE TABLE whitelisted_hashes (
        hash TEXT,
        reason TEXT,
        added_at TEXT,
        tenant_id TEXT DEFAULT '${DEFAULT_TENANT_ID}',
        created_at TEXT,
        updated_at TEXT,
        source_type TEXT DEFAULT 'whitelist',
        verification_status TEXT DEFAULT 'verified',
        retention_policy TEXT DEFAULT 'standard',
        PRIMARY KEY (tenant_id, hash)
    )`,
    `INSERT OR IGNORE INTO whitelisted_hashes
        (hash, reason, added_at, tenant_id, created_at, updated_at, source_type, verification_status, retention_policy)
     SELECT hash, reason, added_at, tenant_id, created_at, updated_at, source_type, verification_status, retention_policy
     FROM whitelisted_hashes_legacy`
);

[
    'fingerprint_index',
    'file_metadata',
    'fingerprint_positions',
    'ast_hash_db',
    'quarantine_queue',
    'quarantine_code',
    'whitelisted_hashes',
    'ingestion_jobs',
    'upload_archives',
    'submissions',
    'review_overrides'
].forEach(hardenCoreTable);

// Ensure new columns exist on older tables
addColumnIfMissing('file_metadata', 'exact_hash', 'TEXT');
addColumnIfMissing('file_metadata', 'trusted_source', 'BOOLEAN DEFAULT 0');
addColumnIfMissing('file_metadata', 'source_origin', 'TEXT DEFAULT "unknown"');
addColumnIfMissing('quarantine_queue', 'expires_at', 'TEXT');
addColumnIfMissing('quarantine_code', 'expires_at', 'TEXT');
addColumnIfMissing('fingerprint_positions', 'start_line', 'INTEGER');
addColumnIfMissing('fingerprint_positions', 'end_line', 'INTEGER');
addColumnIfMissing('review_overrides', 'reviewer_id', 'TEXT');

function separateLegacyQuarantineCode() {
    const rows = db.prepare('SELECT id, payload, tenant_id, created_at FROM quarantine_queue').all();
    const insertCode = db.prepare(`INSERT OR IGNORE INTO quarantine_code
        (quarantine_id, raw_code, tenant_id, created_at, updated_at, source_type, verification_status, retention_policy)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const updatePayload = db.prepare('UPDATE quarantine_queue SET payload = ?, updated_at = ? WHERE id = ? AND tenant_id = ?');

    const runMigration = db.transaction(() => {
        for (const row of rows) {
            if (!row.payload) continue;
            let payload;
            try {
                payload = JSON.parse(row.payload);
            } catch {
                continue;
            }

            if (!Object.prototype.hasOwnProperty.call(payload, 'rawCode')) continue;

            const now = new Date().toISOString();
            const { rawCode, ...metadata } = payload;
            insertCode.run(row.id, rawCode || '', row.tenant_id || DEFAULT_TENANT_ID, row.created_at || now, now, 'quarantine_raw_code', 'pending_review', 'quarantine');
            updatePayload.run(JSON.stringify(metadata), now, row.id, row.tenant_id || DEFAULT_TENANT_ID);
        }
    });

    runMigration();
}

separateLegacyQuarantineCode();

db.exec(`
    CREATE INDEX IF NOT EXISTS idx_hash_lookup ON fingerprint_index(hash);
    CREATE INDEX IF NOT EXISTS idx_doc_tenant ON file_metadata(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_exact_hash ON file_metadata(tenant_id, exact_hash);
    CREATE INDEX IF NOT EXISTS idx_quarantine_expires ON quarantine_code(expires_at);

    CREATE INDEX IF NOT EXISTS idx_file_metadata_tenant_source ON file_metadata(tenant_id, source_url, file_name);
    CREATE INDEX IF NOT EXISTS idx_fp_pos_tenant_hash ON fingerprint_positions(tenant_id, hash);
    CREATE INDEX IF NOT EXISTS idx_ast_hash_tenant_hash ON ast_hash_db(tenant_id, hash);
    CREATE INDEX IF NOT EXISTS idx_quarantine_tenant_status ON quarantine_queue(tenant_id, verification_status);
    CREATE INDEX IF NOT EXISTS idx_whitelist_tenant_hash ON whitelisted_hashes(tenant_id, hash);
    CREATE INDEX IF NOT EXISTS idx_jobs_tenant_status ON ingestion_jobs(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_upload_archives_expires_at ON upload_archives(expires_at);
    CREATE INDEX IF NOT EXISTS idx_submissions_tenant_repo ON submissions(tenant_id, owner, repo);
    CREATE INDEX IF NOT EXISTS idx_review_overrides_submission ON review_overrides(tenant_id, submission_id);
`);

export default db;
