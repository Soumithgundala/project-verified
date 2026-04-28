// server/utils/ingestionQueue.js
import PQueue from 'p-queue';

// Create a queue with concurrency of 2. 
// This prevents overwhelming the CPU/DB during massive bulk uploads.
const queue = new PQueue({ concurrency: 2 });

let completedCount = 0;
let errorCount = 0;

/**
 * Enqueues a task for background processing.
 * @param {Function} taskFn - An async function that performs the ingestion.
 * @param {string} description - A human-readable description for logging.
 */
export async function enqueueIngestion(taskFn, description = 'Unknown Task') {
    const jobId = Math.random().toString(36).substring(7);
    
    console.log(`[Queue] Enqueued: ${description} (JobID: ${jobId})`);

    // We don't 'await' the queue.add call here because we want to return immediately to the caller.
    queue.add(async () => {
        try {
            console.log(`[Queue] Starting: ${description} (JobID: ${jobId})`);
            await taskFn();
            completedCount++;
            console.log(`[Queue] Completed: ${description} (JobID: ${jobId})`);
        } catch (err) {
            errorCount++;
            console.error(`[Queue] Failed: ${description} (JobID: ${jobId}) - Error: ${err.message}`);
        }
    });

    return jobId;
}

/**
 * Returns the current status of the queue.
 */
export function getQueueStatus() {
    return {
        pending: queue.size,
        running: queue.pending,
        completed: completedCount,
        errors: errorCount,
        isPaused: queue.isPaused
    };
}

export default queue;
