// server/db/seedWhitelist.js
import db from './database.js';
import { DEFAULT_TENANT_ID } from '../utils/tenant.js';

const BOILERPLATE_DATA = [
    {
        hash: '22839405', // Example hash for React index.js boilerplate
        reason: 'React standard index.js boilerplate (CRA)'
    },
    {
        hash: '99283741', 
        reason: 'Express basic app listener template'
    },
    {
        hash: '55667788',
        reason: 'Vite React main.jsx boilerplate'
    }
    // In a real scenario, we'd run common files through the Winnowing algorithm 
    // and extract the resulting hashes to put here.
];

export async function seedWhitelist() {
    console.log('🌱 Seeding boilerplate whitelist...');
    
    const upsertStmt = db.prepare(`INSERT OR REPLACE INTO whitelisted_hashes
        (hash, reason, added_at, tenant_id, created_at, updated_at, source_type, verification_status, retention_policy)
        VALUES (?, ?, ?, ?, COALESCE((SELECT created_at FROM whitelisted_hashes WHERE tenant_id = ? AND hash = ?), ?), ?, ?, ?, ?)`);
    const now = new Date().toISOString();
    
    const runTransaction = db.transaction((items) => {
        let count = 0;
        for (const item of items) {
            upsertStmt.run(item.hash, item.reason, now, DEFAULT_TENANT_ID, DEFAULT_TENANT_ID, item.hash, now, now, 'whitelist', 'verified', 'standard');
            count++;
        }
        return count;
    });

    try {
        const count = runTransaction(BOILERPLATE_DATA);
        console.log(`✅ Successfully seeded ${count} boilerplate hashes.`);
    } catch (err) {
        console.error(`❌ Failed to seed whitelist: ${err.message}`);
    }
}

// Run if called directly
if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('seedWhitelist')) {
    seedWhitelist();
}
