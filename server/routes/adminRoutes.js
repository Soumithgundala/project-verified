import express from 'express';
import { getQuarantineQueue, getQuarantineItem, removeFromQuarantine } from '../utils/astHashDb.js';
import { saveToDualStore } from '../utils/fingerprintIndex.js';
import { generateWinnowingFingerprints } from '../utils/astRadar.js';
import { parser, grammars, extensionMap } from '../utils/parserInit.js';

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

    const docId = await saveToDualStore(fingerprints, item.sourceUrl, item.fileName);
    await removeFromQuarantine(id);

    res.json({
      success: true,
      message: 'Item successfully promoted to the trusted reference corpus.',
      docId,
      fingerprintsCount: fingerprints.length
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/admin/quarantine/:id/reject
// Removes the item without promoting it.
router.delete('/quarantine/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    await removeFromQuarantine(id);
    res.json({ success: true, message: 'Item removed from quarantine.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
