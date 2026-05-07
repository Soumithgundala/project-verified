// server/utils/astRadar.js
import crypto from 'crypto';
import axios from 'axios';
import { parser, grammars, extensionMap } from './parserInit.js';

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
// FAST 32-BIT INTEGER HASH (djb2 variant)
// Used to convert our K-Grams into lightweight numbers for the DB
// =================================================================
function hashString(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return hash >>> 0; // Force to unsigned 32-bit integer
}

// =================================================================
// WINNOWING ALGORITHM (Fuzzy Structural Hashing)
// k = Noise Threshold (How many AST nodes make up a grammatical "sentence")
// w = Sliding Window (How many sentences we group before picking a fingerprint)
// =================================================================
export function generateWinnowingFingerprints(rootNode, k = 15, w = 4, fileName = "unknown") {
    const sequence = [];
    
    function getNormalizedType(node) {
        if (node.type === 'identifier' || node.type === 'property_identifier') return 'VAR';
        if (node.type === 'number') return 'NUM';
        if (node.type === 'string' || node.type === 'string_fragment') return 'STR';
        if (node.type === 'true' || node.type === 'false') return 'BOOL';
        
        const operatorMap = {
            '+': 'PLUS', '-': 'MINUS', '*': 'MUL', '/': 'DIV',
            '==': 'EQ', '===': 'EQ', '!=': 'NEQ', '!==': 'NEQ',
            '>': 'GT', '>=': 'GTE', '<': 'LT', '<=': 'LTE',
            '&&': 'AND', '||': 'OR', '!': 'NOT', '=': 'ASSIGN'
        };
        if (operatorMap[node.type]) return operatorMap[node.type];
        
        if (node.isNamed) {
            if (node.type === 'comment') return null;
            if (node.type.includes('function') || node.type.includes('method') || node.type.includes('arrow')) return 'FUNC';
            return node.type;
        }
        return null;
    }

    // 1. Traverse and record positions (Selective Normalization)
    function traverse(node) {
        if (!node) return;
        
        const normType = getNormalizedType(node);
        if (normType) {
            sequence.push({
                type: normType,
                start: node.startIndex, // Byte offset start
                end: node.endIndex,     // Byte offset end
                startLine: node.startPosition.row + 1, // 1-indexed
                endLine: node.endPosition.row + 1      // 1-indexed
            });
        }
        for (let i = 0; i < node.childCount; i++) {
            traverse(node.child(i));
        }
    }
    traverse(rootNode);

    if (sequence.length < k) return [];

    // 2. Generate K-Grams with Start/End boundaries
    const kGrams = [];
    for (let i = 0; i <= sequence.length - k; i++) {
        const chunkTypes = sequence.slice(i, i + k).map(n => n.type).join(':');
        kGrams.push({
            hash: hashString(chunkTypes),
            startPos: sequence[i].start,
            endPos: sequence[i + k - 1].end,
            startLine: sequence[i].startLine,
            endLine: sequence[i + k - 1].endLine,
            fileName: fileName
        });
    }

    // 3. Winnowing Window (Tie-breaker: pick the right-most minimum)
    const fingerprints = new Map(); // Use a Map to ensure unique hashes while keeping object data

    for (let i = 0; i <= kGrams.length - w; i++) {
        let minGram = kGrams[i];
        
        for (let j = i + 1; j < i + w; j++) {
            // Tie-breaker: <= ensures we pick the later occurrence in the window
            if (kGrams[j].hash <= minGram.hash) {
                minGram = kGrams[j];
            }
        }
        
        // Store in Map. If hash already exists, we keep the first occurrence 
        // (or you can choose to store an array of positions if it repeats)
        if (!fingerprints.has(minGram.hash)) {
            fingerprints.set(minGram.hash, minGram);
        }
    }

    // Return: [ { hash: 84729, startPos: 120, endPos: 450 }, ... ]
    return Array.from(fingerprints.values());
}

// =================================================================
// RADAR: Finds the heaviest logic file in a repo and extracts:
//   - rawCode:  the source code of that file
//   - anchorString: a mid-file line used for GitHub search
// =================================================================
export async function extractProjectFingerprints(owner, repo, latestSha, headers, options = {}) {
    try {
        const {
            candidateLimit = 10,
            limit = 5,
            offset = 0,
            lightweight = false
        } = options;

        // 1. Get the repository file tree
        const treeResponse = await axios.get(
            `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${latestSha}?recursive=1`,
            { headers }
        );

        // 2. Aggressive Blast Radius Filter (Blacklist toxic/minified content)
        const excludedDirs = ['node_modules', 'dist', 'build', 'public', 'static', 'out', 'vendor'];
        const validFiles = treeResponse.data.tree.filter(f => {
            if (f.type !== 'blob' || f.size <= 200) return false;
            // Cap at ~150KB. Humans rarely write single files larger than this.
            if (f.size > 153600) return false; 

            const lowerPath = f.path.toLowerCase();
            
            // Check Blacklisted Directories
            if (excludedDirs.some(dir => lowerPath.includes(`/${dir}/`) || lowerPath.startsWith(`${dir}/`))) return false;

            // Check Blacklisted File Patterns (bundles, chunks, minified)
            if (lowerPath.endsWith('.min.js') || 
                lowerPath.endsWith('-bundle.js') || 
                lowerPath.includes('chunk-') || 
                lowerPath.includes('test')) {
                return false;
            }

            // Allow only standard logic extensions
            return (
                lowerPath.endsWith('.js') || lowerPath.endsWith('.jsx') ||
                lowerPath.endsWith('.ts') || lowerPath.endsWith('.tsx') ||
                lowerPath.endsWith('.py') || lowerPath.endsWith('.java')
            );
        });

        if (validFiles.length === 0) return null;

        // 3. Download candidate files to score them properly
        const topCandidates = validFiles.sort((a, b) => b.size - a.size).slice(0, candidateLimit);
        const scoredFiles = [];

        for (const file of topCandidates) {
            const fileData = await axios.get(file.url, { headers });
            const rawCode = Buffer.from(fileData.data.content, 'base64').toString('utf-8');

            // --- MINIFIED SINGLE-LINE CATCHER ---
            const lines = rawCode.split('\n');
            if (lines.length < 5 && rawCode.length > 5000) {
                 console.log(`[!] Skipping ${file.path} - Detected minified single-line code.`);
                 continue;
            }

            let fileScore = 0;
            let anchorString = null;

            if (parser) {
                const fileExt = Object.keys(extensionMap).find(ext => file.path.endsWith(ext)) || '.js';
                const langKey = extensionMap[fileExt];
                if (grammars[langKey]) {
                    parser.setLanguage(grammars[langKey]);
                    const tree = parser.parse(rawCode);
                    if (!tree.rootNode.hasError) {
                        const nodeCount = tree.rootNode.descendantCount;
                        const functionCount = (rawCode.match(/function|=>|class|def |class /g) || []).length;
                        const words = rawCode.match(/\b\w+\b/g) || [];
                        const uniqueTokens = new Set(words).size;
                        
                        fileScore = (nodeCount * 0.6) + (functionCount * 0.3) + (uniqueTokens * 0.1);
                    }
                }
            } else {
                 fileScore = (rawCode.match(/function|=>|if|for|while|switch|class|catch/g) || []).length * 100;
            }

            if (!lightweight) {
                // Extract "Anchor String" for GitHub global clone search (fallback)
                const codeLines = rawCode.split('\n').map(l => l.trim()).filter(l => l.length > 25 && !l.startsWith('import') && !l.startsWith('//'));
                anchorString = codeLines.length > 0 ? codeLines[Math.floor(codeLines.length / 2)].substring(0, 50) : null;
            }

            scoredFiles.push({
                fileName: file.path,
                rawCode: rawCode,
                anchorString,
                fileScore
            });
        }

        // 4. Return requested window sorted by robust fileScore
        scoredFiles.sort((a, b) => b.fileScore - a.fileScore);
        return scoredFiles.slice(offset, offset + limit);

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
export async function verifyTechStack(owner, repo, latestSha, claimsArray, headers) {
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

        // CREATE A SUPER-NORMALIZED CONFIG STRING (Strips spaces, hyphens, underscores)
        const superNormalizedConfig = combinedConfigText.replace(/[-_ ]/g, '');

        // 1. Dependency Check
        results.forEach(item => {
            // Strip the same characters from the LLM's claim
            const superItem = item.name.replace(/[-_ ]/g, '');

            // Now "xeno-canto" and "xenocanto" will both become "xenocanto" and match perfectly!
            // We check for common package.json/requirements.txt formats:
            if (
                superNormalizedConfig.includes(`"${superItem}"`) || 
                superNormalizedConfig.includes(`${superItem}==`) || 
                superNormalizedConfig.includes(`${superItem}>=`) ||
                superNormalizedConfig.includes(superItem) // Broad fallback
            ) {
                item.status = 'Verified';
            }
        });

        // 2. API / Logic Deep Scan Fallback (for claims not found in config)
        const unverified = results.filter(r => r.status === 'Missing in Code');
        if (unverified.length > 0) {
            try {
                // Get the heaviest logic file's rawCode to check for API keys or libraries loaded dynamically
                const fingerprint = await extractProjectFingerprint(owner, repo, latestSha, headers);
                
                if (fingerprint && fingerprint.rawCode) {
                    const lowerRawCode = fingerprint.rawCode.toLowerCase();
                    unverified.forEach(item => {
                        // Check if the claim string appears in the logic code
                        if (lowerRawCode.includes(item.name)) {
                            item.status = 'Verified (In Logic)';
                        }
                    });
                } else {
                    // Extract failed or returned nothing (e.g. all files filtered out / minified)
                    console.warn(`[!] Skipping deep scan for ${repo} - no valid logic files or minified bundles found.`);
                    unverified.forEach(item => item.status = 'Parsing Failure - Minified/Invalid Syntax');
                }
            } catch (fallbackErr) {
                console.error("Deep Scan Fallback Failed:", fallbackErr.message);
                unverified.forEach(item => item.status = 'Parsing Failure - Minified/Invalid Syntax');
            }
        }

    } catch (err) {
        // This catch block protects the entire config fetching process.
        // It should rarely be hit since Github API errors are caught or swallowed.
        console.error("Verification Math Failed:", err.message);
    }

    return results;
}
