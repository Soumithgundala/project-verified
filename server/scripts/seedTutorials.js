// server/scripts/seedTutorials.js
import axios from 'axios';
import { parser, grammars, extensionMap } from '../utils/parserInit.js';
import { generateStructuralHash } from '../utils/astRadar.js';
import { saveFingerprints } from '../utils/astHashDb.js';

// Setup environment variables if .env exists
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const headers = GITHUB_TOKEN ? { Authorization: `token ${GITHUB_TOKEN}` } : {};

async function seedDatabase(searchQuery) {
    console.log(`🌱 Seeding database with top tutorials for: "${searchQuery}"`);

    try {
        // 1. Find the top 10 most starred repositories matching the tutorial query
        const searchRes = await axios.get(
            `https://api.github.com/search/repositories?q=${encodeURIComponent(searchQuery)}+tutorial&sort=stars&order=desc&per_page=10`,
            { headers }
        );

        const repos = searchRes.data.items;
        console.log(`Found ${repos.length} high-risk repositories.`);

        for (const repo of repos) {
            console.log(`Processing: ${repo.full_name}...`);
            
            // 2. Fetch the default branch tree
            const treeRes = await axios.get(
                `https://api.github.com/repos/${repo.full_name}/git/trees/${repo.default_branch}?recursive=1`,
                { headers }
            );

            // 3. Find large logic files (.js, .py, etc.)
            const logicFiles = treeRes.data.tree.filter(f => 
                f.type === 'blob' && f.size > 500 && f.size < 150000 &&
                (f.path.endsWith('.js') || f.path.endsWith('.jsx') || f.path.endsWith('.ts') || f.path.endsWith('.tsx') || f.path.endsWith('.py') || f.path.endsWith('.java'))
            ).slice(0, 5); // Just take the top 5 heaviest files to save API calls

            // 4. Download, Parse, and Store
            for (const file of logicFiles) {
                try {
                    const fileData = await axios.get(file.url, { headers });
                    const rawCode = Buffer.from(fileData.data.content, 'base64').toString('utf-8');

                    let fileExt = '.js';
                    const parts = file.path.split('.');
                    if (parts.length > 1) fileExt = '.' + parts.pop();

                    const langKey = extensionMap[fileExt];
                    if (!langKey || !grammars[langKey]) continue;

                    if (parser) {
                        parser.setLanguage(grammars[langKey]);
                        
                        const tree = parser.parse(rawCode);
                        if (!tree.rootNode.hasError()) {
                            // Extract hash (Will be swapped to Winnowing later)
                            const fileHash = generateStructuralHash(tree.rootNode);
                            
                            // Save to local offline database
                            await saveFingerprints([fileHash], repo.html_url, file.path);
                        }
                    }
                } catch (fileErr) {
                    console.log(`[!] Error processing file ${file.path}: ${fileErr.message}`);
                }
            }
            // Sleep to respect GitHub rate limits
            await new Promise(r => setTimeout(r, 2000)); 
        }

        console.log(`✅ Seeding complete. Your offline index is now smarter.`);

    } catch (err) {
        console.error("Seeding failed:", err.message);
    }
}

// Accept command line arguments: node server/scripts/seedTutorials.js "react firebase auth"
const query = process.argv.slice(2).join(' ');
if (query) seedDatabase(query);
else console.log("Please provide a search query.");
