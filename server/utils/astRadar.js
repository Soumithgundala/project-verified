// server/utils/astRadar.js
import crypto from 'crypto';
import axios from 'axios';

const GITHUB_API_BASE = 'https://api.github.com';
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// =================================================================
// PURE UTILITY: Generates a SHA-256 hash from a Tree-Sitter rootNode.
// Only encodes structural grammar types — ignores all variable names,
// strings, and whitespace. This makes it rename-proof.
// =================================================================
export function generateStructuralHash(rootNode) {
    let structureString = "";

    function traverse(node) {
        if (!node) return;
        // We only record the grammar rule type (e.g. 'if_statement', 'identifier')
        // We deliberately ignore node.text so renaming variables doesn't fool us
        structureString += node.type + ":";
        for (let i = 0; i < node.childCount; i++) {
            traverse(node.child(i));
        }
    }

    traverse(rootNode);
    return crypto.createHash('sha256').update(structureString).digest('hex');
}

// =================================================================
// RADAR: Finds the heaviest logic file in a repo and extracts:
//   - fileName: path of the most complex file
//   - rawCode:  the source code of that file
//   - anchorString: a mid-file line used for GitHub search
// =================================================================
export async function extractProjectFingerprint(owner, repo, latestSha, headers) {
    try {
        // 1. Get the repository file tree
        const treeResponse = await axios.get(
            `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${latestSha}?recursive=1`,
            { headers }
        );

        // 2. Filter out obvious junk (images, configs, node_modules)
        const validFiles = treeResponse.data.tree.filter(f =>
            f.type === 'blob' &&
            f.size > 200 &&
            (f.path.endsWith('.js') || f.path.endsWith('.jsx') ||
             f.path.endsWith('.ts') || f.path.endsWith('.tsx') ||
             f.path.endsWith('.py') || f.path.endsWith('.java')) &&
            !f.path.includes('node_modules') &&
            !f.path.includes('dist') &&
            !f.path.includes('build') &&
            !f.path.toLowerCase().includes('test')
        );

        if (validFiles.length === 0) return null;

        // 3. Download top 5 largest files and score by Logic Density
        const topCandidates = validFiles.sort((a, b) => b.size - a.size).slice(0, 5);
        let mostComplexFile = null;
        let highestLogicScore = -1;
        let targetRawCode = "";

        for (const file of topCandidates) {
            const fileData = await axios.get(file.url, { headers });
            const rawCode = Buffer.from(fileData.data.content, 'base64').toString('utf-8');

            // Proxy for Cyclomatic Complexity — count structural keywords
            const logicScore = (rawCode.match(/function|=>|if|for|while|switch|class|catch/g) || []).length;

            if (logicScore > highestLogicScore) {
                highestLogicScore = logicScore;
                mostComplexFile = file;
                targetRawCode = rawCode;
            }
        }

        if (!mostComplexFile) return null;

        // 4. Extract "Anchor String" for the GitHub global clone search
        const lines = targetRawCode
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 25 && !l.startsWith('import') && !l.startsWith('//'));
        const anchorString = lines.length > 0
            ? lines[Math.floor(lines.length / 2)].substring(0, 50)
            : null;

        return {
            fileName: mostComplexFile.path,
            rawCode: targetRawCode,
            anchorString
        };

    } catch (err) {
        console.error("Fingerprint Extraction Failed:", err.message);
        return null;
    }
}

// =================================================================
// SEARCH: GitHub Code Search API — the Strike 2 fallback.
// Also downloads the raw code of the #1 match so the caller can
// run AST comparison and execute The Genius Move.
// =================================================================
export async function huntGlobalClones(anchorString, owner, repo, headers, firstCommitDate) {
    if (!anchorString) return { status: 'Original', matches: [], matchedCode: null };

    console.log(`🌍 [Strike 2] Throttling 2.1s before GitHub search...`);
    await sleep(2100); // CRITICAL: protects against GitHub's 30/min search rate limit

    try {
        const dateFilter = firstCommitDate ? ` pushed:<${firstCommitDate.split('T')[0]}` : '';
        const searchQuery = encodeURIComponent(`"${anchorString}" -repo:${owner}/${repo}${dateFilter}`);
        const searchResponse = await axios.get(
            `${GITHUB_API_BASE}/search/code?q=${searchQuery}`,
            { headers }
        );

        const matches = searchResponse.data.items;

        if (matches.length === 0) {
            return { status: 'Original', matches: [], matchedCode: null, message: "No prior clones found globally." };
        }

        const isBoilerplate = matches.length > 30;

        // Download the top match's raw code so the caller can hash it (The Genius Move)
        let matchedRawCode = null;
        try {
            const matchData = await axios.get(matches[0].url, { headers });
            matchedRawCode = Buffer.from(matchData.data.content, 'base64').toString('utf-8');
            console.log(`📥 [Strike 2] Downloaded matched file for AST comparison.`);
        } catch (err) {
            console.error("Could not download matched file for AST comparison:", err.message);
        }

        return {
            status: isBoilerplate ? 'Tutorial Boilerplate' : 'Direct Clone Detected',
            matches: matches.slice(0, 3).map(m => m.repository.html_url),
            matchedCode: matchedRawCode
        };

    } catch (err) {
        console.error("Global Hunt Failed:", err.message);
        return { status: 'Search Error', matches: [], matchedCode: null };
    }
}

// =================================================================
// VERIFICATION: Cross-reference LLM-extracted claims against the actual repo
// =================================================================
export async function verifyTechStack(owner, repo, latestSha, claimsArray) {
    if (!claimsArray || claimsArray.length === 0) return [];
    const lowerClaims = claimsArray.map(c => c.toLowerCase());
    const results = lowerClaims.map(claim => ({ name: claim, status: 'Missing in Code' }));

    let combinedConfigText = "";

    try {
        // Try to fetch package.json
        const pkgRes = await axios.get(`${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/package.json?ref=${latestSha}`, { headers, validateStatus: () => true });
        if (pkgRes.status === 200 && pkgRes.data && pkgRes.data.content) {
            combinedConfigText += Buffer.from(pkgRes.data.content, 'base64').toString('utf-8').toLowerCase();
        }

        // Try to fetch requirements.txt
        const reqRes = await axios.get(`${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/requirements.txt?ref=${latestSha}`, { headers, validateStatus: () => true });
        if (reqRes.status === 200 && reqRes.data && reqRes.data.content) {
            combinedConfigText += Buffer.from(reqRes.data.content, 'base64').toString('utf-8').toLowerCase();
        }

        // Try to fetch Pipfile
        const pipRes = await axios.get(`${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/Pipfile?ref=${latestSha}`, { headers, validateStatus: () => true });
        if (pipRes.status === 200 && pipRes.data && pipRes.data.content) {
            combinedConfigText += Buffer.from(pipRes.data.content, 'base64').toString('utf-8').toLowerCase();
        }

        // 1. Dependency Check
        results.forEach(item => {
            // Very simple substring checking in the stringified config files. 
            // Better check: regex bounding to avoid substring matches like "act" in "react"
            // But since claims are normalized, includes() is a good first start. 
            // We can look for `"react"` or `react==`
            if (combinedConfigText.includes(`"${item}"`) || combinedConfigText.includes(`${item}==`) || combinedConfigText.includes(`${item}>=`)) {
                item.status = 'Verified';
            }
        });

        // 2. API / Logic Deep Scan Fallback (for claims not found in config)
        const unverified = results.filter(r => r.status === 'Missing in Code');
        if (unverified.length > 0) {
            // Get the heaviest logic file's rawCode to check for API keys or libraries loaded dynamically
            const fingerprint = await extractProjectFingerprint(owner, repo, latestSha, headers);
            if (fingerprint && fingerprint.rawCode) {
                const lowerRawCode = fingerprint.rawCode.toLowerCase();
                unverified.forEach(item => {
                    // Check if the claim string appears in the logic code (e.g. fetch('xeno-canto'), import x from 'tensorflow')
                    if (lowerRawCode.includes(item.name)) {
                        item.status = 'Verified (In Logic)';
                    }
                });
            }
        }

    } catch (err) {
        console.error("Verification Math Failed:", err.message);
    }

    return results;
}