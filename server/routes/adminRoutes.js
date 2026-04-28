import express from 'express';
import { getQuarantineQueue, getQuarantineItem, removeFromQuarantine } from '../utils/astHashDb.js';
import { saveToDualStore } from '../utils/fingerprintIndex.js';
import { generateWinnowingFingerprints } from '../utils/astRadar.js';
import { parser, grammars, extensionMap } from '../utils/parserInit.js';
import db from '../db/database.js';
import { enqueueIngestion } from '../utils/ingestionQueue.js';



const router = express.Router();

// GET /api/admin/quarantine
// Fetches all pending quarantined clones.
router.get('/quarantine', async (req, res) => {
  try {
    const queue = await getQuarantineQueue();
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
    const item = await getQuarantineItem(id);

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
        await saveToDualStore(fingerprints, item.sourceUrl, item.fileName);
        await removeFromQuarantine(id);
    }, `Promoting ${item.fileName} from ${item.sourceUrl}`);

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
    const rows = db.prepare('SELECT * FROM whitelisted_hashes ORDER BY added_at DESC').all();
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
    if (!hash) return res.status(400).json({ success: false, message: 'Hash is required.' });

    db.prepare('INSERT OR REPLACE INTO whitelisted_hashes (hash, reason, added_at) VALUES (?, ?, ?)')
      .run(hash, reason || 'Manual addition', new Date().toISOString());

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
    db.prepare('DELETE FROM whitelisted_hashes WHERE hash = ?').run(hash);
    res.json({ success: true, message: `Hash ${hash} removed from whitelist.` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;

