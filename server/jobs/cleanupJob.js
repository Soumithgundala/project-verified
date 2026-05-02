// server/jobs/cleanupJob.js
import db from '../db/database.js';

export function startCleanupJob(intervalMs = 6 * 60 * 60 * 1000) {
    console.log(`🧹 [Cleanup Job] Initializing quarantine TTL cleanup job (interval: ${intervalMs}ms)`);

    setInterval(() => {
        try {
            console.log('🧹 [Cleanup Job] Running quarantine cleanup...');
            const result = db.transaction(() => {
                // Delete from quarantine_code and quarantine_queue where expires_at < now
                // quarantine_code has ON DELETE CASCADE from quarantine_queue, so deleting from queue is sufficient.
                // But let's delete from both explicitly to be safe if foreign keys aren't strictly enforced.
                const deleteCode = db.prepare(`DELETE FROM quarantine_code WHERE expires_at < datetime('now')`);
                const deleteQueue = db.prepare(`DELETE FROM quarantine_queue WHERE expires_at < datetime('now')`);

                const codeChanges = deleteCode.run().changes;
                const queueChanges = deleteQueue.run().changes;
                
                return queueChanges;
            })();

            if (result > 0) {
                console.log(`🧹 [Cleanup Job] Removed ${result} expired quarantine items.`);
            }
        } catch (err) {
            console.error(`❌ [Cleanup Job] Failed to run cleanup: ${err.message}`);
        }
    }, intervalMs);
}
