import express from 'express';
import axios from 'axios';
import { analyzeRepositoryAST as generateLLMSummary } from '../utils/ai_wrapper.js';
import { extractProjectFingerprints, huntGlobalClones, generateStructuralHash, generateWinnowingFingerprints, getAstParserHealth, countSemanticNodes, sanitizeCst } from '../utils/astRadar.js';
import { lookupFingerprints, queueForCorpusReview } from '../utils/astHashDb.js';
import { queryDualStore, getDetailedMatches, getDocumentsMetadata } from '../utils/fingerprintIndex.js';
import repoCache from '../utils/diskCache.js';
import { parser, grammars, extensionMap, splitDiff } from '../utils/parserInit.js';
import { parseGithubUrl } from '../utils/urlUtils.js';
import { resolveTenantId } from '../utils/tenant.js';
import { buildProjectReport } from '../utils/evidenceMapper.js';
import { saveSubmission, getSubmission, saveReviewOverride, listReviewOverrides } from '../utils/submission.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

const GITHUB_API_BASE = "https://api.github.com";
const env = globalThis.process?.env || {};
const headers = env.GITHUB_TOKEN
  ? { Authorization: `token ${env.GITHUB_TOKEN}` }
  : {};

// parseGithubUrl is now in ../utils/urlUtils.js
export { parseGithubUrl };

const MODULE_VERSIONS = {
  commits:     4,
  llmSummary:  1,
  originality: 6,
};

function clampScore(value) {
  return Math.max(0, Math.min(1, value));
}

function computeFallbackIntegrityScore(fileMeta = {}) {
  const additions = Math.max(0, Number(fileMeta.additions) || 0);
  const deletions = Math.max(0, Number(fileMeta.deletions) || 0);
  const totalChanges = Math.max(additions + deletions, Number(fileMeta.changes) || 0);

  if (totalChanges <= 4) return 0.92;
  if (totalChanges <= 12) return 0.82;
  if (totalChanges <= 30) return 0.68;
  if (totalChanges <= 80) return 0.52;
  return 0.35;
}

function wrapJavaScriptFragment(code) {
  const source = code || '';
  if (!source.trim()) return source;
  if (/^\s*(import|export)\b/m.test(source)) return source;

  const openCurly = (source.match(/\{/g) || []).length;
  const closeCurly = (source.match(/\}/g) || []).length;
  const missingCurly = Math.max(0, openCurly - closeCurly);
  const padding = missingCurly > 0 ? `\n${'}\n'.repeat(missingCurly)}` : '';

  return `async function __gitpulse_fragment__() {\n${source}\n}${padding}`;
}

function maybeRecoverFragmentTree(parseSource, langKey) {
  const initialTree = parser.parse(parseSource);
  const initialHealth = getAstParserHealth(initialTree.rootNode);

  if (!initialHealth.isSeverelyCorrupt || !['javascript', 'typescript', 'tsx'].includes(langKey)) {
    return { tree: initialTree, health: initialHealth, recovered: false };
  }

  const wrappedTree = parser.parse(wrapJavaScriptFragment(parseSource));
  const wrappedHealth = getAstParserHealth(wrappedTree.rootNode);

  if (wrappedHealth.errorRatio < initialHealth.errorRatio) {
    return { tree: wrappedTree, health: wrappedHealth, recovered: true };
  }

  return { tree: initialTree, health: initialHealth, recovered: false };
}

function computeIntegrityScore({ oldNodes, newNodes, oldHealth, newHealth, fileMeta = {} }) {
  const maxNodes = Math.max(oldNodes, newNodes, 1);
  const delta = Math.abs(newNodes - oldNodes);
  const positiveGrowth = Math.max(0, newNodes - oldNodes);
  const negativeGrowth = Math.max(0, oldNodes - newNodes);
  const growthRatio = positiveGrowth / maxNodes;
  const shrinkRatio = oldNodes > 0 ? negativeGrowth / oldNodes : 0;
  const sizeFactor = Math.min(1, maxNodes / 120);
  const smallChange = maxNodes < 30 && delta <= 8;
  const additions = Math.max(0, Number(fileMeta.additions) || 0);
  const deletions = Math.max(0, Number(fileMeta.deletions) || 0);
  const totalChanges = Math.max(additions + deletions, Number(fileMeta.changes) || 0);

  let score = 1 - (delta / maxNodes);
  score -= growthRatio * 0.35 * sizeFactor;
  score -= shrinkRatio * 0.12 * sizeFactor;

  if (smallChange) {
    score = Math.max(score, 0.85);
  } else if (maxNodes < 60 && delta <= 18) {
    score = Math.max(score, 0.7);
  }

  if (totalChanges <= 4) {
    score = Math.max(score, 0.94);
  } else if (totalChanges <= 10) {
    score = Math.max(score, 0.86);
  } else if (totalChanges <= 24) {
    score = Math.max(score, 0.76);
  } else if (totalChanges <= 50) {
    score = Math.max(score, 0.62);
  }

  if (additions <= 8 && deletions <= 4) {
    score = Math.max(score, 0.8);
  }

  if (deletions > 0 && additions <= 2 && newNodes <= oldNodes) {
    score = Math.max(score, 0.72);
  }

  if (oldHealth.hasErrors || newHealth.hasErrors) {
    score *= 0.92;
  }

  return clampScore(score);
}

function normalizeEvidenceVerdict(evidenceReport, analysisPayload = null) {
  if (!evidenceReport) return evidenceReport;

  const originalityStatus = analysisPayload?.intelligence?.globalOriginality?.status || '';
  const parserStatus = analysisPayload?.analysis?.parserDiagnostics?.status || '';
  const parserDegraded = [
    'severe_parse_failure',
    'degraded_line_fallback',
    'fragment_recovered',
    'partial_parse_used'
  ].includes(parserStatus) || String(analysisPayload?.analysis?.cst || '').includes('Parser degradation detected');

  if (evidenceReport.totalMatchedFingerprints === 0 && originalityStatus === 'Original' && !parserDegraded) {
    return {
      ...evidenceReport,
      plagiarismType: 'NO_MATCH',
      rejectionReason: 'No matching fingerprints were found, and the origin check also returned a clean no-match. This repository currently has no structural overlap evidence in the indexed corpus.'
    };
  }

  return evidenceReport;
}

function extractWinnowingForFiles(fingerprints) {
  const studentWinnowingFps = [];
  let hasParsingFailure = false;
  let localExactHashes = [];

  for (const fp of fingerprints || []) {
    let studentTree = null;
    let studentHash = null;

    if (parser) {
      const fileExt = Object.keys(extensionMap).find(ext => fp.fileName.endsWith(ext)) || '.js';
      const langKey = extensionMap[fileExt];
      if (grammars[langKey]) {
        parser.setLanguage(grammars[langKey]);
        studentTree = parser.parse(fp.rawCode);
        const parserHealth = getAstParserHealth(studentTree.rootNode);

        if (parserHealth.isSeverelyCorrupt) {
          logger.warn('ast_parser_severe_corruption', {
            fileName: fp.fileName,
            errorNodes: parserHealth.errorNodes,
            totalNodes: parserHealth.totalNodes,
            errorRatio: Number(parserHealth.errorRatio.toFixed(4))
          });
          hasParsingFailure = true;
        } else {
          studentHash = generateStructuralHash(studentTree.rootNode);
          logger.info('student_ast_hash', {
            fileName: fp.fileName,
            hashPrefix: studentHash.substring(0, 12),
            parserErrorRatio: Number(parserHealth.errorRatio.toFixed(4))
          });

          const fps = generateWinnowingFingerprints(studentTree.rootNode, 15, 40, fp.fileName);
          studentWinnowingFps.push(...fps);
        }
      }
    }

    if (studentHash) localExactHashes.push(studentHash);
  }

  return { studentWinnowingFps, hasParsingFailure, localExactHashes };
}

router.post('/link-repo', async (req, res) => {
  const url = req.body.url || req.body.repoUrl;
  const tenantId = resolveTenantId(req);
  const correlationId = req.correlationId;
  const startedAt = Date.now();

  if (!url) {
    return res.status(400).json({ success: false, message: 'Repository URL is required.' });
  }

  try {
    const { owner, repo } = parseGithubUrl(url);
    const cacheKey = `${tenantId}:${owner}/${repo}`;
    logger.info('plagiarism_scan_started', { correlationId, tenantId, repo: `${owner}/${repo}` });

    // ── Lightweight call: just enough to detect new commits ───────────────
    const commitsResponse = await axios.get(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits?per_page=30`,
      { headers }
    );
    const fetchedCommits = commitsResponse.data;
    if (!fetchedCommits?.length) throw new Error("No commits found in this repository.");

    const latestSha   = fetchedCommits[0].sha;
    const cached      = repoCache.get(cacheKey);
    const shaChanged  = !cached || cached.latestSha !== latestSha;

    // ── MODULE 1: COMMITS (AST parse → score → merge) ─────────────────────
    const commitsVersionOk = cached?.commits?.version === MODULE_VERSIONS.commits;
    const needsCommitsRun  = shaChanged || !commitsVersionOk;

    let combinedResults;

    if (!needsCommitsRun) {
      console.log(`🟢 [CACHE] Commits module valid for ${cacheKey}`);
      combinedResults = cached.commits.rawResults;
    } else {
      const reason = !cached ? 'first run' : shaChanged ? 'new commits' : 'logic version bumped';
      console.log(`🔄 [RERUN] Commits module for ${cacheKey} (${reason})`);

      let toProcess = fetchedCommits; 
      if (shaChanged && cached?.commits?.rawResults) {
        toProcess = [];
        for (const c of fetchedCommits) {
          if (c.sha === cached.latestSha) break;
          toProcess.push(c);
        }
        console.log(`🟡 [DELTA] ${toProcess.length} new commit(s) to process for ${cacheKey}`);
      }

      const newProcessed = await Promise.all(toProcess.map(async (c) => {
        try {
          const detail = await axios.get(
            `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits/${c.sha}`,
            { headers }
          );
          const validExtensions = Object.keys(extensionMap);
          const sourceFile = detail.data.files.find(f =>
            validExtensions.some(ext => f.filename?.endsWith(ext))
          );
          const rawHunk = sourceFile?.patch || "";
          let n1 = 0, n2 = 0, d = 0, r = 1, cstStr = "No code patch found.";
          let parserDiagnostics = {
            status: rawHunk && sourceFile ? 'not_parsed' : 'no_code_patch',
            fileName: sourceFile?.filename || null,
            oldErrorRatio: 0,
            newErrorRatio: 0,
            oldErrorNodes: 0,
            newErrorNodes: 0,
            usedFragmentRecovery: false
          };

          if (parser && rawHunk && sourceFile) {
            const fileExt     = validExtensions.find(ext => sourceFile.filename.endsWith(ext));
            const targetGrammar = grammars[extensionMap[fileExt]];
            if (targetGrammar) {
              parser.setLanguage(targetGrammar);
              const { oldCode, newCode } = splitDiff(rawHunk);
              const oldParse = maybeRecoverFragmentTree(oldCode, extensionMap[fileExt]);
              const newParse = maybeRecoverFragmentTree(newCode, extensionMap[fileExt]);
              const treeOld = oldParse.tree;
              const treeNew = newParse.tree;
              const oldHealth = oldParse.health;
              const newHealth = newParse.health;
              n1 = countSemanticNodes(treeOld.rootNode);
              n2 = countSemanticNodes(treeNew.rootNode);
              d  = Math.abs(n2 - n1);
              parserDiagnostics = {
                status: oldParse.recovered || newParse.recovered ? 'fragment_recovered' : 'clean',
                fileName: sourceFile.filename,
                oldErrorRatio: Number(oldHealth.errorRatio.toFixed(4)),
                newErrorRatio: Number(newHealth.errorRatio.toFixed(4)),
                oldErrorNodes: oldHealth.errorNodes,
                newErrorNodes: newHealth.errorNodes,
                usedFragmentRecovery: oldParse.recovered || newParse.recovered
              };

              if (oldHealth.isSeverelyCorrupt || newHealth.isSeverelyCorrupt) {
                  logger.warn('ast_parser_measurement_aborted', {
                    correlationId,
                    tenantId,
                    commitSha: c.sha,
                    fileName: sourceFile.filename,
                    oldErrorRatio: Number(oldHealth.errorRatio.toFixed(4)),
                    newErrorRatio: Number(newHealth.errorRatio.toFixed(4)),
                    oldErrorNodes: oldHealth.errorNodes,
                    newErrorNodes: newHealth.errorNodes
                  });
                  r = computeFallbackIntegrityScore(sourceFile);
                  parserDiagnostics.status = 'degraded_line_fallback';
                  cstStr = `Parser degradation detected. Structural diff fragment could not be parsed cleanly, so the score fell back to line-change heuristics instead of a zeroed AST score. Old error ratio: ${parserDiagnostics.oldErrorRatio}; New error ratio: ${parserDiagnostics.newErrorRatio}.`;
              } else {
                  r = computeIntegrityScore({
                    oldNodes: n1,
                    newNodes: n2,
                    oldHealth,
                    newHealth,
                    fileMeta: sourceFile
                  });
                  cstStr = sanitizeCst(treeNew.rootNode);
                  if (oldHealth.hasErrors || newHealth.hasErrors) {
                    parserDiagnostics.status = 'partial_parse_used';
                    logger.warn('ast_parser_partial_parse_used', {
                      correlationId,
                      tenantId,
                      commitSha: c.sha,
                      fileName: sourceFile.filename,
                      oldErrorRatio: Number(oldHealth.errorRatio.toFixed(4)),
                      newErrorRatio: Number(newHealth.errorRatio.toFixed(4))
                    });
                  }
              }
            }
          }
          return {
            sha: c.sha.substring(0, 7), score: parseFloat(r.toFixed(2)),
            date: c.commit.author.date,  message: c.commit.message,
            author: c.commit.author.name, details: { n1, n2, d, cstStr, parserDiagnostics }
          };
        } catch { return null; }
      }));

      const validNew = newProcessed.filter(Boolean);
      if (shaChanged && cached?.commits?.rawResults) {
        combinedResults = [...validNew, ...cached.commits.rawResults].slice(0, 30);
      } else {
        combinedResults = validNew;
      }
    }

    const graphData  = [...combinedResults].sort((a, b) => new Date(a.date) - new Date(b.date));
    const historyLog = [...combinedResults].sort((a, b) => new Date(b.date) - new Date(a.date));

    const clusters = {
      authentic: { label: "Steady Refactoring",  color: "emerald", commits: [] },
      standard:  { label: "Active Development",  color: "blue",    commits: [] },
      suspect:   { label: "High-Velocity Dumps", color: "rose",    commits: [] },
    };
    combinedResults.forEach(item => {
      if      (item.score >= 0.85) clusters.authentic.commits.push(item);
      else if (item.score >= 0.3) clusters.standard.commits.push(item);
      else                         clusters.suspect.commits.push(item);
    });
    const latest = historyLog[0] || { details: { n1: 0, n2: 0, d: 0, cstStr: "" }, score: 1 };

    const llmVersionOk  = !shaChanged && cached?.llmSummary?.version  === MODULE_VERSIONS.llmSummary;
    const origVersionOk = !shaChanged && cached?.originality?.version === MODULE_VERSIONS.originality;
    const needsLLMRun   = !llmVersionOk;
    const needsOrigRun  = !origVersionOk;

    let llmSummary        = cached?.llmSummary?.data  ?? null;
    let globalOriginality = cached?.originality?.data ?? null;
    let studentWinnowingFps = cached?.originality?.studentWinnowingFps ?? [];

    if (needsLLMRun || needsOrigRun) {
      const fingerprints = await extractProjectFingerprints(owner, repo, latestSha, headers);
      const mainFingerprint = fingerprints && fingerprints.length > 0 ? fingerprints[0] : null;

      if (needsLLMRun) {
        console.log(`🔄 [RERUN] LLM Summary module for ${cacheKey}`);
        llmSummary = mainFingerprint
          ? await generateLLMSummary(mainFingerprint.fileName, mainFingerprint.rawCode)
          : { overall_logic_summary: "No substantial logic files found.", key_patterns: [], likely_source: "Unknown" };
      } else {
        console.log(`🟢 [CACHE] LLM Summary module valid for ${cacheKey}`);
      }

      if (needsOrigRun) {
        console.log(`🔄 [RERUN] Originality module (Two-Strike) for ${cacheKey}`);
        globalOriginality = { status: 'Original', matches: [], similarityScore: null };

        if (fingerprints && fingerprints.length > 0) {
          let hasParsingFailure = false;
          let localExactMatches = [];
          studentWinnowingFps = [];
          
          for (const fp of fingerprints) {
            let studentTree = null;
            let studentHash = null;

            if (parser) {
              const fileExt = Object.keys(extensionMap).find(ext => fp.fileName.endsWith(ext)) || '.js';
              const langKey = extensionMap[fileExt];
              if (grammars[langKey]) {
                parser.setLanguage(grammars[langKey]);
                studentTree = parser.parse(fp.rawCode);
                const parserHealth = getAstParserHealth(studentTree.rootNode);
                
                if (parserHealth.isSeverelyCorrupt) {
                    logger.warn('ast_parser_severe_corruption', {
                      correlationId,
                      tenantId,
                      fileName: fp.fileName,
                      errorNodes: parserHealth.errorNodes,
                      totalNodes: parserHealth.totalNodes,
                      errorRatio: Number(parserHealth.errorRatio.toFixed(4))
                    });
                    hasParsingFailure = true;
                } else {
                    studentHash = generateStructuralHash(studentTree.rootNode);
                    console.log(`🔑 [Strike 1] Student AST hash for ${fp.fileName}: ${studentHash.substring(0, 12)}...`);
                    
                    const fps = generateWinnowingFingerprints(studentTree.rootNode, 15, 40, fp.fileName);
                    studentWinnowingFps.push(...fps);
                }
              }
            }

            if (studentHash) {
                const matches = await lookupFingerprints([studentHash], { tenantId });
                localExactMatches.push(...matches);
            }
          }

          if (hasParsingFailure && localExactMatches.length === 0) {
             globalOriginality.status = 'Parsing Failure - Minified/Invalid Syntax';
          }

          if (localExactMatches.length > 0) {
            console.log(`🎯 [EXACT HIT] Caught instantly in offline DB!`);
            globalOriginality = {
              status: 'Exact Clone Detected',
              matches: [...new Set(localExactMatches.map(m => m.url))],
              similarityScore: '100.0%'
            };
          } else {
            console.log(`🔍 [EXACT MISS] Falling back to Fuzzy Winnowing check...`);
            let winnowingMatch = null;

            if (studentWinnowingFps.length > 0) {
                winnowingMatch = await queryDualStore(studentWinnowingFps, { tenantId });
            }

            const projectContainment = winnowingMatch ? winnowingMatch.containmentScore / 100 : 0;
            if (projectContainment < 0.3) {
                console.log(`[LIGHT SCAN] Project containment below 30%. Scanning next 5 logic files.`);
                const fallbackFingerprints = await extractProjectFingerprints(owner, repo, latestSha, headers, {
                  candidateLimit: 15,
                  offset: 5,
                  limit: 5,
                  lightweight: true
                });

                if (fallbackFingerprints && fallbackFingerprints.length > 0) {
                  const fallbackExtraction = extractWinnowingForFiles(fallbackFingerprints);
                  hasParsingFailure = hasParsingFailure || fallbackExtraction.hasParsingFailure;
                  studentWinnowingFps.push(...fallbackExtraction.studentWinnowingFps);

                  for (const studentHash of fallbackExtraction.localExactHashes) {
                    const matches = await lookupFingerprints([studentHash], { tenantId });
                    localExactMatches.push(...matches);
                  }

                  if (localExactMatches.length > 0) {
                    console.log(`[EXACT HIT] Caught in lightweight fallback scan.`);
                    globalOriginality = {
                      status: 'Exact Clone Detected',
                      matches: [...new Set(localExactMatches.map(m => m.url))],
                      similarityScore: '100.0%'
                    };
                  } else if (studentWinnowingFps.length > 0) {
                    winnowingMatch = await queryDualStore(studentWinnowingFps, { tenantId });
                  }
                }
            }

            if (globalOriginality.status === 'Exact Clone Detected') {
                // Resolved by the lightweight fallback exact-hash pass.
            } else if (winnowingMatch) {
                console.log(`🧩 [WINNOWING HIT] Found partial containment clone: ${winnowingMatch.sourceUrl}`);
                globalOriginality = {
                    status: 'Partial Clone Detected',
                    matches: [winnowingMatch.sourceUrl],
                    similarityScore: `${winnowingMatch.containmentScore}%`
                };
            } else if (mainFingerprint) {
                console.log(`🔍 [WINNOWING MISS] Querying GitHub API...`);
                const firstCommitDate = fetchedCommits[fetchedCommits.length - 1]?.commit?.author?.date || null;
                const huntResult = await huntGlobalClones(
                  mainFingerprint.anchorString, owner, repo, headers, firstCommitDate
                );

                globalOriginality.status  = huntResult.status;
                globalOriginality.matches = huntResult.matches;

                if (huntResult.matchedCode && parser) {
                  const fileExt = Object.keys(extensionMap).find(ext => mainFingerprint.fileName.endsWith(ext)) || '.js';
                  const langKey = extensionMap[fileExt];
                  if (grammars[langKey]) {
                    parser.setLanguage(grammars[langKey]);
                    const studentTree = parser.parse(mainFingerprint.rawCode);
                    const cloneTree = parser.parse(huntResult.matchedCode);

                    const studentNodes = studentTree.rootNode.descendantCount;
                    const cloneNodes   = cloneTree.rootNode.descendantCount;
                    const distance     = Math.abs(studentNodes - cloneNodes);
                    const maxNodes     = Math.max(studentNodes, cloneNodes);
                    const similarity   = maxNodes > 0 ? ((1 - (distance / maxNodes)) * 100).toFixed(1) : 0;

                    globalOriginality.similarityScore = `${similarity}%`;
                    console.log(`⚖️  [Strike 2] AST Showdown: ${similarity}% structurally identical.`);

                    if (parseFloat(similarity) > 90 && huntResult.matches.length > 0) {
                      console.log(`🛡️ [QUARANTINE] Sending clone to review queue. Awaiting manual approval before corpus ingestion.`);
                      await queueForCorpusReview({
                        sourceUrl: huntResult.matches[0],
                        fileName: mainFingerprint.fileName,
                        rawCode: huntResult.matchedCode,
                        status: "Pending Admin Approval"
                      }, { tenantId });
                      globalOriginality.status = 'Global Clone (Unverified Source)';
                    }
                  }
                }
            }
          }

        }
      } else {
        console.log(`🟢 [CACHE] Originality module valid for ${cacheKey}`);
      }
    } else {
      console.log(`🟢 [CACHE] Intelligence modules both valid for ${cacheKey}`);
    }

    const authorMap = {};
    historyLog.forEach(c => {
      const authorName = c.author || "Unknown";
      if (!authorMap[authorName]) {
        authorMap[authorName] = { name: authorName, commitCount: 0, totalScore: 0, commits: [] };
      }
      authorMap[authorName].commitCount += 1;
      authorMap[authorName].totalScore  += c.score;
      authorMap[authorName].commits.push(c.sha);
    });
    const authorStats = Object.values(authorMap).map(a => ({
      name:         a.name,
      commitCount:  a.commitCount,
      averageScore: parseFloat((a.totalScore / a.commitCount).toFixed(2))
    })).sort((a, b) => b.commitCount - a.commitCount);

    const finalPayload = {
      repoInfo:  { owner, repo },
      commits:   historyLog,
      pulseData: graphData.map(g => ({ name: g.sha, score: g.score })),
      clusters,
      authorStats,
      intelligence: { globalOriginality, llmSummary },
      analysis: {
        oldNodeCount: latest.details.n1,
        newNodeCount: latest.details.n2,
        editDistance: latest.details.d,
        rewardScore:  latest.score,
        status: latest.score < 0.3 ? "Suspect (AI-Generated?)" : "Authentic",
        cst: latest.details.cstStr,
        parserDiagnostics: latest.details.parserDiagnostics || null
      }
    };

    repoCache.set(cacheKey, {
      latestSha,
      commits:     { version: MODULE_VERSIONS.commits,     rawResults: combinedResults },
      llmSummary:  { version: MODULE_VERSIONS.llmSummary,  data: llmSummary },
      originality: { version: MODULE_VERSIONS.originality, data: globalOriginality, studentWinnowingFps },
    });

    const submissionId = await saveSubmission({
        owner, repo, sha: latestSha,
        studentFingerprints: studentWinnowingFps,
        analysisResults: finalPayload,
        tenantId
    });

    const matchesByDoc = await getDetailedMatches(studentWinnowingFps, { tenantId });
    const docIds = Object.keys(matchesByDoc);
    const meta = await getDocumentsMetadata(docIds, tenantId);
    const evidenceReport = normalizeEvidenceVerdict(
      buildProjectReport(studentWinnowingFps, matchesByDoc, meta),
      finalPayload
    );

    logger.info('plagiarism_scan_completed', {
      correlationId,
      tenantId,
      submissionId,
      repo: `${owner}/${repo}`,
      containment: evidenceReport.projectContainment,
      duration_ms: Date.now() - startedAt
    });

    res.json({ success: true, submissionId, correlationId, ...finalPayload, evidenceReport, humanOverrides: [] });

  } catch (error) {
    logger.error('plagiarism_scan_failed', {
      correlationId,
      tenantId,
      message: error.message,
      duration_ms: Date.now() - startedAt
    });
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/report/:submissionId', async (req, res) => {
    const { submissionId } = req.params;
    const tenantId = resolveTenantId(req);

    try {
        const submission = await getSubmission(submissionId, tenantId);
        if (!submission) {
            return res.status(404).json({ success: false, message: 'Submission not found.' });
        }

        // 1. Get detailed matches for evidence mapping
        const matchesByDoc = await getDetailedMatches(submission.studentFingerprints, { tenantId });
        
        // 2. Fetch metadata for all matched documents
        const docIds = Object.keys(matchesByDoc);
        const meta = await getDocumentsMetadata(docIds, tenantId);

        // 3. Build the project-level evidence report
        const evidenceReport = normalizeEvidenceVerdict(
            buildProjectReport(submission.studentFingerprints, matchesByDoc, meta),
            submission.analysisResults
        );
        const humanOverrides = await listReviewOverrides(submissionId, tenantId);
        const ignoredSources = new Set(
            humanOverrides
                .filter(override => override.action === 'ignore_source' && override.sourceUrl)
                .map(override => override.sourceUrl)
        );
        if (ignoredSources.size > 0) {
            evidenceReport.sources = evidenceReport.sources.filter(source => !ignoredSources.has(source.sourceUrl));
        }

        const latestSubmissionOverride = [...humanOverrides].reverse().find(override =>
            override.action === 'mark_plagiarism' || override.action === 'mark_acceptable'
        );
        if (latestSubmissionOverride) {
            evidenceReport.humanOverride = latestSubmissionOverride;
            evidenceReport.plagiarismType = latestSubmissionOverride.action === 'mark_plagiarism'
                ? 'HUMAN_CONFIRMED_PLAGIARISM'
                : 'HUMAN_MARKED_ACCEPTABLE';
        }

        res.json({
            success: true,
            submissionId,
            repoInfo: { owner: submission.owner, repo: submission.repo, sha: submission.sha },
            analysis: submission.analysisResults,
            evidenceReport,
            humanOverrides
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/submissions/:submissionId/override', async (req, res) => {
    const { submissionId } = req.params;
    const tenantId = resolveTenantId(req);
    const { action, sourceUrl = null, reason = null, reviewerId = null } = req.body || {};
    const validActions = new Set(['mark_plagiarism', 'mark_acceptable', 'ignore_source']);

    try {
        if (!validActions.has(action)) {
            return res.status(400).json({ success: false, message: 'Invalid override action.' });
        }
        if (action === 'ignore_source' && !sourceUrl) {
            return res.status(400).json({ success: false, message: 'sourceUrl is required when ignoring a source.' });
        }
        if (!reason || reason.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'A reason is required for all overrides. Please explain your decision.' });
        }

        const submission = await getSubmission(submissionId, tenantId);
        if (!submission) {
            return res.status(404).json({ success: false, message: 'Submission not found.' });
        }

        const override = await saveReviewOverride({ submissionId, action, sourceUrl, reason, reviewerId, tenantId });
        res.json({ success: true, override });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;
