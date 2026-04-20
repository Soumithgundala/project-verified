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
 * Looks up structural hashes in the local clone database.
 * @param {string[]} fingerprints - Array of SHA-256 structural hashes or Winnowing integers
 * @returns {Array} - Array of matched database entries
 */
export async function lookupFingerprints(fingerprints) {
  const db = await loadDb();
  let matches = [];
  fingerprints.forEach(fp => {
    if (db[fp]) {
      matches = matches.concat(db[fp]);
    }
  });
  return matches;
}

/**
 * Saves new clone entries to the local database (The Genius Move).
 * @param {string[]} fingerprints - Array of hashes to save
 * @param {string} sourceUrl - The GitHub repo URL of the original source
 * @param {string} fileName - The file path that was matched
 */
export async function saveFingerprints(fingerprints, sourceUrl, fileName) {
  const db = await loadDb();
  let updated = false;

  fingerprints.forEach(fp => {
    if (!db[fp]) {
      db[fp] = [];
    }
    // Prevent duplicate URLs for the same fingerprint
    if (!db[fp].some(entry => entry.url === sourceUrl)) {
      db[fp].push({ url: sourceUrl, file: fileName, addedAt: new Date().toISOString() });
      updated = true;
    }
  });

  if (updated) {
    await persistDb();
    console.log(`💾 [AstHashDb] Saved clone fingerprints → ${sourceUrl}`);
  }
}
