// server/utils/astRadar.js
import axios from 'axios';

const GITHUB_API_BASE = 'https://api.github.com';
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function extractProjectFingerprint(owner, repo, latestSha, headers) {
    try {
        // 1. Get the repository file tree
        const treeResponse = await axios.get(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${latestSha}?recursive=1`, { headers });

        // 2. Filter out obvious junk (images, configs, node_modules)
        const validFiles = treeResponse.data.tree.filter(f =>
            f.type === 'blob' &&
            f.size > 200 && // Ignore tiny boilerplate files
            (f.path.endsWith('.js') || f.path.endsWith('.jsx') || f.path.endsWith('.ts') || f.path.endsWith('.tsx') || f.path.endsWith('.py') || f.path.endsWith('.java')) &&
            !f.path.includes('node_modules') &&
            !f.path.includes('dist') &&
            !f.path.includes('build') &&
            !f.path.toLowerCase().includes('test')
        );

        if (validFiles.length === 0) return null;

        // 3. Download the raw code for the top 5 largest files to analyze their "Logic Density"
        // (We limit to 5 to save GitHub API calls)
        const topCandidates = validFiles.sort((a, b) => b.size - a.size).slice(0, 5);
        let mostComplexFile = null;
        let highestLogicScore = -1;
        let targetRawCode = "";

        for (const file of topCandidates) {
            const fileData = await axios.get(file.url, { headers });
            const rawCode = Buffer.from(fileData.data.content, 'base64').toString('utf-8');

            // Calculate a "Logic Density Score" (Proxy for Cyclomatic Complexity)
            // We count structural keywords. A high count means heavy algorithmic logic.
            const logicScore = (rawCode.match(/function|=>|if|for|while|switch|class|catch/g) || []).length;

            if (logicScore > highestLogicScore) {
                highestLogicScore = logicScore;
                mostComplexFile = file;
                targetRawCode = rawCode;
            }
        }

        if (!mostComplexFile) return null;

        // 4. Extract the "Anchor String" for Global Search
        // We grab a line from the middle of the complex file to hunt for clones
        const lines = targetRawCode.split('\n').map(l => l.trim()).filter(l => l.length > 25 && !l.startsWith('import') && !l.startsWith('//'));
        const anchorString = lines.length > 0 ? lines[Math.floor(lines.length / 2)].substring(0, 50) : null;

        return {
            fileName: mostComplexFile.path,
            rawCode: targetRawCode,
            anchorString: anchorString
        };

    } catch (err) {
        console.error("Fingerprint Extraction Failed:", err.message);
        return null;
    }
}

async function huntGlobalClones(anchorString, owner, repo, headers, firstCommitDate) {
    if (!anchorString) return { status: 'Original', matchedCode: null };

    // console.log(`🌍 [AST Radar] Throttling 2.1s before searching GitHub for: "${anchorString}"`);
    await sleep(2100); // CRITICAL: Protects against GitHub 30/min Search API rate limit

    try {
        const dateFilter = firstCommitDate ? ` pushed:<${firstCommitDate.split('T')[0]}` : '';
        const searchQuery = encodeURIComponent(`"${anchorString}" -repo:${owner}/${repo}${dateFilter}`);
        const searchResponse = await axios.get(`${GITHUB_API_BASE}/search/code?q=${searchQuery}`, { headers });

        const matches = searchResponse.data.items;

        if (matches.length === 0) {
            return { status: 'Original', matches: [], message: "No clones found globally." };
        }

        const isBoilerplate = matches.length > 30; // If found in 30+ repos, it's a tutorial/template
        return {
            status: isBoilerplate ? 'Tutorial Boilerplate' : 'Direct Clone Detected',
            matches: matches.slice(0, 3).map(m => m.repository.html_url) // Return top 3 matched repo URLs
        };
    } catch (err) {
        console.error("Global Hunt Failed:", err.message);
        return { status: 'Search Error', matches: [] };
    }
}

export { extractProjectFingerprint, huntGlobalClones };