/* eslint-env node */
import './env.js';

import express from 'express';
import cors from 'cors';
import { initGitPulseParser } from './utils/parserInit.js';

import repoRoutes from './routes/repoRoutes.js';
import documentRoutes from './routes/documentRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', repoRoutes);
app.use('/api', documentRoutes);
app.use('/api/admin', adminRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`Git-Pulse Engine running on port ${PORT}`);
  await initGitPulseParser();
});
