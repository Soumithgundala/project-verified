#!/usr/bin/env node
// server/scripts/calibrateEvidence.js
// Run with: npm run calibrate:evidence
//
// Tests the evidence engine against a known ground-truth dataset and
// outputs precision, recall, and false positive/negative rates so you
// can tune the GP_* environment thresholds before pilot deployment.

import { buildProjectReport } from '../utils/evidenceMapper.js';

// ─── Ground Truth Dataset ───────────────────────────────────────────────────
// Add your own test cases here. Each entry represents one repo analysis run.
//
// studentFingerprints: simulate with an array of mock FP objects
// matchesByDoc: simulate the DB result for this scenario
// meta: source metadata (sourceOrigin matters for trust weighting)
// expected: the correct classification for this case

const GROUND_TRUTH = [
    {
        label: 'clean_1 — Original project, boilerplate only',
        expected: 'LOW_CONFIDENCE',
        studentFingerprints: Array.from({ length: 300 }, (_, i) => ({ hash: i, startPos: i * 20, endPos: i * 20 + 20, startLine: i + 1, endLine: i + 1, fileName: 'index.js' })),
        matchesByDoc: {
            'doc-boilerplate': Array.from({ length: 18 }, (_, i) => ({
                hash: i, uniqueness: 0.1, studentFileName: 'index.js',
                studentStart: i * 20, studentEnd: i * 20 + 20, studentStartLine: i + 1, studentEndLine: i + 1,
                sourceStart: i * 20, sourceEnd: i * 20 + 20, sourceStartLine: i + 1, sourceEndLine: i + 1,
            }))
        },
        meta: { 'doc-boilerplate': { sourceUrl: 'https://github.com/create-react-app', fileName: 'App.js', sourceOrigin: 'boilerplate' } }
    },
    {
        label: 'copied_1 — Full clone, single source',
        expected: 'FULL_CLONE',
        studentFingerprints: Array.from({ length: 200 }, (_, i) => ({ hash: i, startPos: i * 20, endPos: i * 20 + 20, startLine: i + 1, endLine: i + 1, fileName: 'index.js' })),
        matchesByDoc: {
            'doc-corpus-1': Array.from({ length: 175 }, (_, i) => ({
                hash: i, uniqueness: 8.5, studentFileName: 'index.js',
                studentStart: i * 20, studentEnd: i * 20 + 20, studentStartLine: i + 1, studentEndLine: i + 1,
                sourceStart: i * 20, sourceEnd: i * 20 + 20, sourceStartLine: i + 1, sourceEndLine: i + 1,
            }))
        },
        meta: { 'doc-corpus-1': { sourceUrl: 'https://github.com/victim/repo', fileName: 'index.js', sourceOrigin: 'verified_internal_corpus' } }
    },
    {
        label: 'mosaic_1 — Stitched from 3 sources',
        expected: 'MOSAIC',
        studentFingerprints: Array.from({ length: 300 }, (_, i) => ({ hash: i, startPos: i * 20, endPos: i * 20 + 20, startLine: i + 1, endLine: i + 1, fileName: 'index.js' })),
        matchesByDoc: {
            'doc-s1': Array.from({ length: 40 }, (_, i) => ({ hash: i, uniqueness: 7.0, studentFileName: 'index.js', studentStart: i * 20, studentEnd: i * 20 + 20, studentStartLine: i + 1, studentEndLine: i + 1, sourceStart: i * 20, sourceEnd: i * 20 + 20, sourceStartLine: i + 1, sourceEndLine: i + 1 })),
            'doc-s2': Array.from({ length: 35 }, (_, i) => ({ hash: i + 40, uniqueness: 6.5, studentFileName: 'index.js', studentStart: (i + 50) * 20, studentEnd: (i + 50) * 20 + 20, studentStartLine: i + 51, studentEndLine: i + 51, sourceStart: i * 20, sourceEnd: i * 20 + 20, sourceStartLine: i + 1, sourceEndLine: i + 1 })),
            'doc-s3': Array.from({ length: 30 }, (_, i) => ({ hash: i + 80, uniqueness: 5.5, studentFileName: 'index.js', studentStart: (i + 100) * 20, studentEnd: (i + 100) * 20 + 20, studentStartLine: i + 101, studentEndLine: i + 101, sourceStart: i * 20, sourceEnd: i * 20 + 20, sourceStartLine: i + 1, sourceEndLine: i + 1 })),
        },
        meta: {
            'doc-s1': { sourceUrl: 'https://github.com/source1/repo', fileName: 'auth.js', sourceOrigin: 'github_random' },
            'doc-s2': { sourceUrl: 'https://github.com/source2/repo', fileName: 'api.js', sourceOrigin: 'github_random' },
            'doc-s3': { sourceUrl: 'https://github.com/source3/repo', fileName: 'utils.js', sourceOrigin: 'github_random' },
        }
    },
    {
        label: 'partial_1 — Partial clone, moderate overlap',
        expected: 'PARTIAL_CLONE',
        studentFingerprints: Array.from({ length: 200 }, (_, i) => ({ hash: i, startPos: i * 20, endPos: i * 20 + 20, startLine: i + 1, endLine: i + 1, fileName: 'index.js' })),
        matchesByDoc: {
            'doc-partial': Array.from({ length: 90 }, (_, i) => ({
                hash: i, uniqueness: 5.0, studentFileName: 'index.js',
                studentStart: i * 20, studentEnd: i * 20 + 20, studentStartLine: i + 1, studentEndLine: i + 1,
                sourceStart: i * 20, sourceEnd: i * 20 + 20, sourceStartLine: i + 1, sourceEndLine: i + 1,
            }))
        },
        meta: { 'doc-partial': { sourceUrl: 'https://github.com/source/repo', fileName: 'index.js', sourceOrigin: 'tutorial_site' } }
    },
    {
        label: 'noise_1 — Small repo, 20 random matches',
        expected: 'LOW_CONFIDENCE',
        studentFingerprints: Array.from({ length: 50 }, (_, i) => ({ hash: i, startPos: i * 20, endPos: i * 20 + 20, startLine: i + 1, endLine: i + 1, fileName: 'index.js' })),
        matchesByDoc: {
            'doc-noise': Array.from({ length: 20 }, (_, i) => ({
                hash: i, uniqueness: 2.0, studentFileName: 'index.js',
                studentStart: i * 20, studentEnd: i * 20 + 20, studentStartLine: i + 1, studentEndLine: i + 1,
                sourceStart: i * 20, sourceEnd: i * 20 + 20, sourceStartLine: i + 1, sourceEndLine: i + 1,
            }))
        },
        meta: { 'doc-noise': { sourceUrl: 'https://github.com/random/repo', fileName: 'misc.js', sourceOrigin: 'github_random' } }
    }
];

// ─── Evaluation Engine ───────────────────────────────────────────────────────

const results = [];
let tp = 0, fp = 0, tn = 0, fn = 0;
const POSITIVE_TYPES = new Set(['FULL_CLONE', 'MOSAIC', 'PARTIAL_CLONE']);

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  GitPulse Evidence Engine — Calibration Run');
console.log('══════════════════════════════════════════════════════════════\n');
console.log(`${'Repo'.padEnd(45)} ${'Expected'.padEnd(20)} ${'Got'.padEnd(20)} ${'Containment%'.padEnd(14)} ${'Dominance%'.padEnd(12)} Pass`);
console.log('─'.repeat(120));

for (const tc of GROUND_TRUTH) {
    const report = buildProjectReport(tc.studentFingerprints, tc.matchesByDoc, tc.meta);
    const got = report.plagiarismType;
    const pass = got === tc.expected;

    const isExpectedPositive = POSITIVE_TYPES.has(tc.expected);
    const isGotPositive = POSITIVE_TYPES.has(got);

    if (isExpectedPositive && isGotPositive) tp++;
    else if (!isExpectedPositive && isGotPositive) fp++;
    else if (!isExpectedPositive && !isGotPositive) tn++;
    else fn++;

    results.push({ label: tc.label, expected: tc.expected, got, containment: report.projectContainment, dominance: report.dominanceScore, pass });

    const status = pass ? '✅' : '❌';
    console.log(`${tc.label.substring(0, 44).padEnd(45)} ${tc.expected.padEnd(20)} ${got.padEnd(20)} ${String(report.projectContainment + '%').padEnd(14)} ${String(report.dominanceScore + '%').padEnd(12)} ${status}`);
}

// ─── Precision / Recall Report ───────────────────────────────────────────────
const precision = tp + fp > 0 ? (tp / (tp + fp)) : 0;
const recall = tp + fn > 0 ? (tp / (tp + fn)) : 0;
const fpr = fp + tn > 0 ? (fp / (fp + tn)) : 0;
const accuracy = (tp + tn) / GROUND_TRUTH.length;

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  Calibration Metrics');
console.log('══════════════════════════════════════════════════════════════');
console.log(`  Accuracy:           ${(accuracy * 100).toFixed(1)}%`);
console.log(`  Precision:          ${(precision * 100).toFixed(1)}%  (of flagged cases, how many were real?)`);
console.log(`  Recall:             ${(recall * 100).toFixed(1)}%  (of real cases, how many did we catch?)`);
console.log(`  False Positive Rate:${(fpr * 100).toFixed(1)}%  (of innocent repos, how many were accused?)`);
console.log(`  TP: ${tp}  FP: ${fp}  TN: ${tn}  FN: ${fn}`);
console.log('\n  Tune thresholds using GP_* env vars in server/.env:');
console.log('    GP_FULL_CLONE_CONTAINMENT=0.8');
console.log('    GP_FULL_CLONE_DOMINANCE=0.7');
console.log('    GP_MOSAIC_MIN_SOURCES=3');
console.log('    GP_PARTIAL_CLONE_CONTAINMENT=0.4');
console.log('══════════════════════════════════════════════════════════════\n');
