// server/utils/astHashDb.js
// Ultra-fast in-memory AST Hash Database, backed by a JSON file on disk.
// Survives server restarts. Every entry is a permanent plagiarism record.

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', '.cache', '.ast_hash_db.json');

let memoryCache = null; // In-memory map for 5ms lookups

async function loadDb() {
  if (memoryCache) return memoryCache;
  try {
    const data = await fs.readFile(DB_PATH, 'utf-8');
    memoryCache = JSON.parse(data);
    const count = Object.keys(memoryCache).length;
    console.log(`🗄️  [AstHashDb] Loaded ${count} AST hash(es) from local clone database.`);
  } catch (err) {
    // If file doesn't exist yet, start fresh
    memoryCache = {};
    console.log('🗄️  [AstHashDb] No existing clone database found — starting fresh.');
  }
  return memoryCache;
}

async function persistDb() {
  if (!memoryCache) return;
  await fs.writeFile(DB_PATH, JSON.stringify(memoryCache, null, 2), 'utf-8');
}

/**
 * Looks up a structural hash in the local clone database.
 * @param {string} hash - SHA-256 structural hash of the AST
 * @returns {{ sourceUrl: string, fileName: string, savedAt: string } | null}
 */
export async function lookupAstHash(hash) {
  const db = await loadDb();
  return db[hash] || null;
}

/**
 * Saves a new clone entry to the local database (The Genius Move).
 * Only saves if the hash is not already known.
 * @param {string} hash - SHA-256 structural hash of the matched clone's AST
 * @param {string} sourceUrl - The GitHub repo URL of the original source
 * @param {string} fileName - The file path that was matched
 */
export async function saveAstHash(hash, sourceUrl, fileName) {
  const db = await loadDb();
  if (!db[hash]) {
    db[hash] = {
      sourceUrl,
      fileName,
      savedAt: new Date().toISOString()
    };
    await persistDb();
    console.log(`💾 [AstHashDb] Saved new clone fingerprint → ${sourceUrl}`);
  }
}
