// server/utils/ingestionQueue.js
import crypto from 'crypto';
import PQueue from 'p-queue';
import db from '../db/database.js';
import { DEFAULT_TENANT_ID } from './tenant.js';

// Create a queue with concurrency of 2.
// This prevents overwhelming the CPU/DB during massive bulk uploads.
// Note: Queue is best-effort until distributed queue is added. 
// If your server restarts, in-flight jobs are lost (unless rehydrated manually).
const queue = new PQueue({ concurrency: 2 });

function updateJob(jobId, patch) {
    const columns = Object.keys(patch);
    if (columns.length === 0) return;

    const assignments = columns.map(column => `${column} = ?`).join(', ');
    db.prepare(`UPDATE ingestion_jobs SET ${assignments}, updated_at = ? WHERE id = ?`)
      .run(...columns.map(column => patch[column]), new Date().toISOString(), jobId);
}

/**
 * Enqueues a task for background processing.
 * @param {Function} taskFn - An async function that performs the ingestion.
 * @param {string} description - A human-readable description for logging.
 */
export async function enqueueIngestion(taskFn, description = 'Unknown Task', options = {}) {
    const jobId = crypto.randomUUID();
    const tenantId = options.tenantId || DEFAULT_TENANT_ID;
    const now = new Date().toISOString();

    db.prepare(`INSERT INTO ingestion_jobs
        (id, description, status, queued_at, tenant_id, created_at, updated_at, source_type, verification_status, retention_policy)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(jobId, description, 'queued', now, tenantId, now, now, 'ingestion_queue', 'system', options.retentionPolicy || 'job_audit');

    console.log(`[Queue] Enqueued: ${description} (JobID: ${jobId})`);

    // We don't await queue.add here because callers should receive the durable job id immediately.
    queue.add(async () => {
        try {
            console.log(`[Queue] Starting: ${description} (JobID: ${jobId})`);
            updateJob(jobId, { status: 'running', started_at: new Date().toISOString() });
            await taskFn(jobId);
            updateJob(jobId, { status: 'completed', completed_at: new Date().toISOString(), error_message: null });
            console.log(`[Queue] Completed: ${description} (JobID: ${jobId})`);
        } catch (err) {
            updateJob(jobId, { status: 'failed', completed_at: new Date().toISOString(), error_message: err.message });
            console.error(`[Queue] Failed: ${description} (JobID: ${jobId}) - Error: ${err.message}`);
        }
    });

    return jobId;
}

/**
 * Returns the current status of the queue.
 */
export function getQueueStatus(options = {}) {
    const tenantId = options.tenantId || DEFAULT_TENANT_ID;
    const counts = db.prepare(`
        SELECT status, COUNT(*) as count
        FROM ingestion_jobs
        WHERE tenant_id = ?
        GROUP BY status
    `).all(tenantId);
    const byStatus = Object.fromEntries(counts.map(row => [row.status, row.count]));
    const recentJobs = db.prepare(`
        SELECT id, description, status, error_message, queued_at, started_at, completed_at, updated_at
        FROM ingestion_jobs
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 25
    `).all(tenantId);

    return {
        pending: queue.size,
        running: queue.pending,
        completed: byStatus.completed || 0,
        errors: byStatus.failed || 0,
        queued: byStatus.queued || 0,
        persistedRunning: byStatus.running || 0,
        isPaused: queue.isPaused,
        recentJobs
    };
}

export function getIngestionJob(jobId, options = {}) {
    const tenantId = options.tenantId || DEFAULT_TENANT_ID;
    return db.prepare(`
        SELECT id, description, status, error_message, queued_at, started_at, completed_at, updated_at
        FROM ingestion_jobs
        WHERE id = ? AND tenant_id = ?
    `).get(jobId, tenantId);
}

export default queue;

