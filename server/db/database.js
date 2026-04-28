import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

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

// Initialize Tables
db.exec(`
    CREATE TABLE IF NOT EXISTS fingerprint_index (
        hash TEXT PRIMARY KEY,
        doc_ids TEXT -- JSON array of doc_ids
    );

    CREATE TABLE IF NOT EXISTS file_metadata (
        doc_id TEXT PRIMARY KEY,
        source_url TEXT,
        file_name TEXT,
        saved_at TEXT,
        fingerprint_count INTEGER
    );

    CREATE TABLE IF NOT EXISTS fingerprint_positions (
        doc_id TEXT,
        hash TEXT,
        start_pos INTEGER,
        end_pos INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_fp_pos_doc_id ON fingerprint_positions(doc_id);
    CREATE INDEX IF NOT EXISTS idx_fp_pos_hash ON fingerprint_positions(hash);

    CREATE TABLE IF NOT EXISTS ast_hash_db (
        hash TEXT PRIMARY KEY,
        entries TEXT -- JSON array of { url, file, addedAt }
    );

    CREATE TABLE IF NOT EXISTS quarantine_queue (
        id TEXT PRIMARY KEY,
        payload TEXT -- JSON object of the full review item
    );

    CREATE TABLE IF NOT EXISTS whitelisted_hashes (
        hash TEXT PRIMARY KEY,
        reason TEXT,
        added_at TEXT
    );
`);

export default db;
