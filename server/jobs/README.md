# server/jobs — Background Scheduled Tasks

Scheduled jobs that run automatically in the background after server startup. They do not expose any HTTP endpoints.

---

## `cleanupJob.js`

**Purpose:** Automatically removes expired entries from the quarantine tables every 6 hours to prevent unbounded database growth.

### `startCleanupJob(intervalMs = 6h)`

Called by `server/index.js` immediately after the server starts listening:
```js
app.listen(PORT, async () => {
  await initGitPulseParser();
  startCleanupJob();   // ← called here
});
```

**What it deletes (every 6 hours):**
- Rows in `quarantine_code` where `expires_at < NOW()`
- Rows in `quarantine_queue` where `expires_at < NOW()`

**TTL:** Quarantine items expire after **30 days** from the time they were created (set in `astHashDb.js → queueForCorpusReview()`).

**Why both tables?** `quarantine_code` has `ON DELETE CASCADE` from `quarantine_queue`, so deleting from the queue is theoretically sufficient. However, both are deleted explicitly to be safe on databases where foreign key enforcement might not be enabled at the connection level.

**Failure handling:** Errors are logged but never crash the server. The next interval will retry.

---

## Scaling Note

This job uses `setInterval` — sufficient for a single-server pilot. When scaling to multiple server instances, this should be replaced with a distributed cron (e.g., a `BullMQ` scheduled job or an external cron trigger) to prevent every instance from running the cleanup simultaneously.
