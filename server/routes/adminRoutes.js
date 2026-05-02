import express from 'express';
import crypto from 'crypto';
import { getQuarantineQueue, getQuarantineItem, removeFromQuarantine } from '../utils/astHashDb.js';
import { saveToDualStore } from '../utils/fingerprintIndex.js';
import { generateWinnowingFingerprints } from '../utils/astRadar.js';
import { parser, grammars, extensionMap } from '../utils/parserInit.js';
import db from '../db/database.js';
import { enqueueIngestion } from '../utils/ingestionQueue.js';
import { resolveTenantId } from '../utils/tenant.js';



const router = express.Router();

// GET /api/admin/quarantine
// Fetches all pending quarantined clones.
router.get('/quarantine', async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const queue = await getQuarantineQueue({ tenantId });
    res.json({ success: true, queue });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/admin/quarantine/:id/promote
// Parses the raw code, generates fingerprints, saves to Dual-Store, and removes from queue.
router.post('/quarantine/:id/promote', async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = resolveTenantId(req);
    const item = await getQuarantineItem(id, { tenantId });

    if (!item) {
      return res.status(404).json({ success: false, message: 'Quarantine item not found.' });
    }

    if (!parser) {
      return res.status(500).json({ success: false, message: 'AST Parser is not initialized.' });
    }

    const fileExt = Object.keys(extensionMap).find(ext => item.fileName.endsWith(ext)) || '.js';
    const langKey = extensionMap[fileExt];

    if (!grammars[langKey]) {
      return res.status(400).json({ success: false, message: `Unsupported file extension for AST parsing: ${fileExt}` });
    }

    parser.setLanguage(grammars[langKey]);
    const tree = parser.parse(item.rawCode);

    if (tree.rootNode.hasError) {
      return res.status(400).json({ success: false, message: 'Parser error on raw code. Invalid syntax.' });
    }

    const fingerprints = generateWinnowingFingerprints(tree.rootNode);
    if (!fingerprints || fingerprints.length === 0) {
      return res.status(400).json({ success: false, message: 'Could not generate winnowing fingerprints (file too small or noise only).' });
    }

    const jobId = await enqueueIngestion(async () => {
        await saveToDualStore(fingerprints, item.sourceUrl, item.fileName, {
          tenantId,
          sourceType: 'trusted_corpus',
          verificationStatus: 'verified',
          retentionPolicy: 'standard',
          trustedSource: true,
          sourceOrigin: 'admin_promote',
          exactHash: crypto.createHash('sha256').update(item.rawCode).digest('hex')
        });
        await removeFromQuarantine(id, { tenantId });
    }, `Promoting ${item.fileName} from ${item.sourceUrl}`, { tenantId });

    res.json({
      success: true,
      message: 'Item successfully queued for promotion to the trusted reference corpus.',
      jobId
    });


  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/admin/whitelist
// Lists all whitelisted boilerplate hashes.
router.get('/whitelist', async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const rows = db.prepare('SELECT hash, reason, added_at, source_type, verification_status, retention_policy FROM whitelisted_hashes WHERE tenant_id = ? ORDER BY added_at DESC').all(tenantId);
    res.json({ success: true, whitelist: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/admin/whitelist
// Adds a new hash to the boilerplate whitelist.
router.post('/whitelist', async (req, res) => {
  try {
    const { hash, reason } = req.body;
    const tenantId = resolveTenantId(req);
    if (!hash) return res.status(400).json({ success: false, message: 'Hash is required.' });
    const now = new Date().toISOString();

    db.prepare(`INSERT OR REPLACE INTO whitelisted_hashes
      (hash, reason, added_at, tenant_id, created_at, updated_at, source_type, verification_status, retention_policy)
      VALUES (?, ?, ?, ?, COALESCE((SELECT created_at FROM whitelisted_hashes WHERE tenant_id = ? AND hash = ?), ?), ?, ?, ?, ?)`)
      .run(hash, reason || 'Manual addition', now, tenantId, tenantId, hash, now, now, 'whitelist', 'verified', 'standard');

    res.json({ success: true, message: `Hash ${hash} whitelisted.` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/admin/whitelist/:hash
// Removes a hash from the whitelist.
router.delete('/whitelist/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    const tenantId = resolveTenantId(req);
    db.prepare('DELETE FROM whitelisted_hashes WHERE tenant_id = ? AND hash = ?').run(tenantId, hash);
    res.json({ success: true, message: `Hash ${hash} removed from whitelist.` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;

