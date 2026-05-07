import fs from 'fs';
import { getSubmission } from '../utils/submission.js';
import { getDetailedMatches, getDocumentsMetadata } from '../utils/fingerprintIndex.js';
import { buildProjectReport } from '../utils/evidenceMapper.js';
import { DEFAULT_TENANT_ID } from '../utils/tenant.js';

const currentProcess = globalThis.process;
const datasetPath = currentProcess?.argv?.[2];

if (!datasetPath) {
    console.error('Usage: node server/scripts/calibrateEvidence.js path/to/ground-truth.json');
    console.error('Expected JSON: [{ "submissionId": "...", "label": "clean|copied|modified_clone|mosaic" }]');
    currentProcess?.exit(1);
}

const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
const rows = [];

for (const item of dataset) {
    const tenantId = item.tenantId || DEFAULT_TENANT_ID;
    const submission = await getSubmission(item.submissionId, tenantId);
    if (!submission) {
        rows.push({
            submissionId: item.submissionId,
            label: item.label,
            error: 'Submission not found'
        });
        continue;
    }

    const matchesByDoc = await getDetailedMatches(submission.studentFingerprints, { tenantId });
    const docIds = Object.keys(matchesByDoc);
    const meta = await getDocumentsMetadata(docIds, tenantId);
    const report = buildProjectReport(submission.studentFingerprints, matchesByDoc, meta);

    rows.push({
        submissionId: item.submissionId,
        label: item.label,
        repo: `${submission.owner}/${submission.repo}`,
        containment: report.projectContainment,
        dominance: report.dominanceScore,
        matchedFingerprints: report.totalMatchedFingerprints,
        classification: report.plagiarismType,
        sources: report.sources.length
    });
}

console.table(rows);
