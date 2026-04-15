import express from 'express';
import axios from 'axios';
import { analyzeRepositoryAST as generateLLMSummary } from '../utils/ai_wrapper.js';
import { extractProjectFingerprint, huntGlobalClones, generateStructuralHash } from '../utils/astRadar.js';
import { lookupAstHash, saveAstHash } from '../utils/astHashDb.js';
import repoCache from '../utils/diskCache.js';
import { parser, grammars, extensionMap, splitDiff } from '../utils/parserInit.js';

const router = express.Router();

const GITHUB_API_BASE = "https://api.github.com";
const headers = process.env.GITHUB_TOKEN
  ? { Authorization: `token ${process.env.GITHUB_TOKEN}` }
  : {};

export const parseGithubUrl = (url) => {
  const parts = url.replace('https://github.com/', '').split('/');
  return { owner: parts[0], repo: parts[1] };
};

const MODULE_VERSIONS = {
  commits:     1, 
  llmSummary:  1,
  originality: 3,
};

router.post('/link-repo', async (req, res) => {
  const { url } = req.body;

  try {
    const { owner, repo } = parseGithubUrl(url);
    const cacheKey = `${owner}/${repo}`;

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

          if (parser && rawHunk && sourceFile) {
            const fileExt     = validExtensions.find(ext => sourceFile.filename.endsWith(ext));
            const targetGrammar = grammars[extensionMap[fileExt]];
            if (targetGrammar) {
              parser.setLanguage(targetGrammar);
              const { oldCode, newCode } = splitDiff(rawHunk);
              const treeOld = parser.parse(oldCode);
              const treeNew = parser.parse(newCode);
              n1 = treeOld.rootNode.descendantCount;
              n2 = treeNew.rootNode.descendantCount;
              d  = Math.abs(n2 - n1);
              r  = n2 > 0 ? Math.max(0, 1 - (d / n2)) : 1;
              cstStr = treeNew.rootNode.toString().substring(0, 500) + '...';
            }
          }
          return {
            sha: c.sha.substring(0, 7), score: parseFloat(r.toFixed(2)),
            date: c.commit.author.date,  message: c.commit.message,
            author: c.commit.author.name, details: { n1, n2, d, cstStr }
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
      else if (item.score >= 0.45) clusters.standard.commits.push(item);
      else                         clusters.suspect.commits.push(item);
    });
    const latest = historyLog[0] || { details: { n1: 0, n2: 0, d: 0, cstStr: "" }, score: 1 };

    const llmVersionOk  = !shaChanged && cached?.llmSummary?.version  === MODULE_VERSIONS.llmSummary;
    const origVersionOk = !shaChanged && cached?.originality?.version === MODULE_VERSIONS.originality;
    const needsLLMRun   = !llmVersionOk;
    const needsOrigRun  = !origVersionOk;

    let llmSummary        = cached?.llmSummary?.data  ?? null;
    let globalOriginality = cached?.originality?.data ?? null;

    if (needsLLMRun || needsOrigRun) {
      const fingerprint = await extractProjectFingerprint(owner, repo, latestSha, headers);

      if (needsLLMRun) {
        console.log(`🔄 [RERUN] LLM Summary module for ${cacheKey}`);
        llmSummary = fingerprint
          ? await generateLLMSummary(fingerprint.fileName, fingerprint.rawCode)
          : { overall_logic_summary: "No substantial logic files found.", key_patterns: [], likely_source: "Unknown" };
      } else {
        console.log(`🟢 [CACHE] LLM Summary module valid for ${cacheKey}`);
      }

      if (needsOrigRun) {
        console.log(`🔄 [RERUN] Originality module (Two-Strike) for ${cacheKey}`);
        globalOriginality = { status: 'Original', matches: [], similarityScore: null };

        if (fingerprint) {
          let studentTree = null;
          let studentHash = null;

          if (parser) {
            const fileExt = Object.keys(extensionMap).find(ext => fingerprint.fileName.endsWith(ext)) || '.js';
            const langKey = extensionMap[fileExt];
            if (grammars[langKey]) {
              parser.setLanguage(grammars[langKey]);
              studentTree = parser.parse(fingerprint.rawCode);
              studentHash = generateStructuralHash(studentTree.rootNode);
              console.log(`🔑 [Strike 1] Student AST hash: ${studentHash.substring(0, 12)}...`);
            }
          }

          const localMatch = studentHash ? await lookupAstHash(studentHash) : null;

          if (localMatch) {
            console.log(`🎯 [STRIKE 1 HIT] Hash matched a known clone in local DB! → ${localMatch.sourceUrl}`);
            globalOriginality = {
              status: 'Local Clone Detected',
              matches: [localMatch.sourceUrl],
              similarityScore: '100.0%'
            };
          } else {
            console.log(`🔍 [STRIKE 1 MISS] No local match. Proceeding to GitHub Global Search...`);
            const firstCommitDate = fetchedCommits[fetchedCommits.length - 1]?.commit?.author?.date || null;
            const huntResult = await huntGlobalClones(
              fingerprint.anchorString, owner, repo, headers, firstCommitDate
            );

            globalOriginality.status  = huntResult.status;
            globalOriginality.matches = huntResult.matches;

            if (huntResult.matchedCode && parser && studentTree) {
              const fileExt = Object.keys(extensionMap).find(ext => fingerprint.fileName.endsWith(ext)) || '.js';
              const langKey = extensionMap[fileExt];
              if (grammars[langKey]) {
                parser.setLanguage(grammars[langKey]);
                const cloneTree = parser.parse(huntResult.matchedCode);

                const studentNodes = studentTree.rootNode.descendantCount;
                const cloneNodes   = cloneTree.rootNode.descendantCount;
                const distance     = Math.abs(studentNodes - cloneNodes);
                const maxNodes     = Math.max(studentNodes, cloneNodes);
                const similarity   = maxNodes > 0 ? ((1 - (distance / maxNodes)) * 100).toFixed(1) : 0;

                globalOriginality.similarityScore = `${similarity}%`;
                console.log(`⚖️  [Strike 2] AST Showdown: ${similarity}% structurally identical.`);

                if (parseFloat(similarity) > 90 && huntResult.matches.length > 0) {
                  const cloneHash = generateStructuralHash(cloneTree.rootNode);
                  await saveAstHash(cloneHash, huntResult.matches[0], fingerprint.fileName);
                  console.log(`💾 [GENIUS MOVE] Clone hash saved → future copies caught at Strike 1.`);
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
        status: latest.score < 0.4 ? "Suspect (AI-Generated?)" : "Authentic",
        cst: latest.details.cstStr
      }
    };

    repoCache.set(cacheKey, {
      latestSha,
      commits:     { version: MODULE_VERSIONS.commits,     rawResults: combinedResults },
      llmSummary:  { version: MODULE_VERSIONS.llmSummary,  data: llmSummary },
      originality: { version: MODULE_VERSIONS.originality, data: globalOriginality },
    });

    res.json({ success: true, ...finalPayload });

  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
