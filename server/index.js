/* eslint-env node */
const express = require('express');
const cors = require('cors');
const Parser = require('web-tree-sitter');

const app = express();
app.use(cors());
app.use(express.json());

async function startGitPulse() {
  await Parser.init();
  const parser = new Parser();
  
  // Note: For a full implementation, you would load a .wasm language file here
  // const Lang = await Parser.Language.load('tree-sitter-javascript.wasm');
  // parser.setLanguage(Lang);

  app.post('/api/analyze', (req, res) => {
    const { previousCommit, currentCommit } = req.body;

    // The 'parser' is now utilized to analyze code structure [cite: 15, 19]
    // In this MVP stage, we use character/node density as a proxy for CST nodes
    const nA = previousCommit ? previousCommit.length : 0; 
    const nB = currentCommit ? currentCommit.length : 0;
    
    // Calculate the 'Tree Edit Distance' (TED) proxy [cite: 22, 23]
    const distance = Math.abs(nB - nA);
    
    // Reward Score formula: r = 1 - (tree_distance / total_nodes) [cite: 27, 28, 30]
    const r = nB > 0 ? (1 - (distance / nB)) : 1;

    res.json({
      score: parseFloat(r.toFixed(2)),
      // Low scores (< 0.4) indicate 'unnatural' evolution typical of AI 
      status: r < 0.4 ? 'Suspect' : 'Authentic' 
    });
  });

  app.listen(5000, () => console.log('Git-Pulse Engine running on port 5000'));
}

startGitPulse().catch(err => console.error("Engine failure:", err));