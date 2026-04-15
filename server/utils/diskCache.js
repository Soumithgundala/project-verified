// server/utils/diskCache.js
// A drop-in replacement for the in-memory Map that persists to disk.
// Survives nodemon restarts — same repo link won't be re-processed unless new commits exist.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR  = join(__dirname, '..', '.cache');
const CACHE_FILE = join(CACHE_DIR, 'repoCache.json');

class DiskCache {
    constructor() {
        // Ensure .cache/ directory exists
        if (!existsSync(CACHE_DIR)) {
            mkdirSync(CACHE_DIR, { recursive: true });
        }

        // Load whatever was saved from the last run
        this._data = {};
        if (existsSync(CACHE_FILE)) {
            try {
                const raw = readFileSync(CACHE_FILE, 'utf-8');
                this._data = JSON.parse(raw);
                const count = Object.keys(this._data).length;
                console.log(`📦 [DiskCache] Loaded ${count} cached repo(s) from disk.`);
            } catch (err) {
                console.warn('⚠️  [DiskCache] Corrupt cache file — starting fresh.', err.message);
                this._data = {};
            }
        } else {
            console.log('📦 [DiskCache] No existing cache found — starting fresh.');
        }
    }

    /** Returns the cached value or null (mirrors Map.get falsy behaviour) */
    get(key) {
        return this._data[key] ?? null;
    }

    /** Stores a value and immediately flushes to disk */
    set(key, value) {
        this._data[key] = value;
        this._flush();
        return this; // match Map fluent interface
    }

    /** Returns true if the key exists */
    has(key) {
        return Object.prototype.hasOwnProperty.call(this._data, key);
    }

    /** Deletes a single key and flushes */
    delete(key) {
        if (this.has(key)) {
            delete this._data[key];
            this._flush();
            return true;
        }
        return false;
    }

    /** Wipes all entries and flushes */
    clear() {
        this._data = {};
        this._flush();
    }

    /** Synchronous write — keeps this simple and safe in Express request handlers */
    _flush() {
        try {
            writeFileSync(CACHE_FILE, JSON.stringify(this._data, null, 2), 'utf-8');
        } catch (err) {
            console.error('❌ [DiskCache] Failed to write cache to disk:', err.message);
        }
    }
}

// Export a singleton — the whole server shares one cache instance
export default new DiskCache();
