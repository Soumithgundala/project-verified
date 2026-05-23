const fs = require('fs');
const path = require('path');

const parsers = [
    {
        name: 'tree-sitter-javascript.wasm',
        url: 'https://github.com/tree-sitter/tree-sitter-javascript/releases/latest/download/tree-sitter-javascript.wasm'
    },
    {
        name: 'tree-sitter-typescript.wasm',
        url: 'https://github.com/tree-sitter/tree-sitter-typescript/releases/latest/download/tree-sitter-typescript.wasm'
    },
    {
        name: 'tree-sitter-tsx.wasm',
        url: 'https://github.com/tree-sitter/tree-sitter-typescript/releases/latest/download/tree-sitter-tsx.wasm'
    },
    {
        name: 'tree-sitter-python.wasm',
        url: 'https://github.com/tree-sitter/tree-sitter-python/releases/latest/download/tree-sitter-python.wasm'
    },
    {
        name: 'tree-sitter-java.wasm',
        url: 'https://github.com/tree-sitter/tree-sitter-java/releases/latest/download/tree-sitter-java.wasm'
    },
    {
        name: 'tree-sitter-c.wasm',
        url: 'https://github.com/tree-sitter/tree-sitter-c/releases/latest/download/tree-sitter-c.wasm'
    }
];

console.log("Downloading Official WebAssembly Parsers from GitHub...");

async function downloadParsers() {
    for (const parser of parsers) {
        const filePath = path.join(__dirname, parser.name);

        try {
            console.log(`Fetching ${parser.name}...`);

            // Native fetch automatically handles redirects and binary data safely
            const response = await fetch(parser.url);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Convert response directly into a clean binary buffer
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Write synchronously to guarantee the file is saved properly
            fs.writeFileSync(filePath, buffer);

            console.log(`✅ Successfully downloaded: ${parser.name} (${(buffer.length / 1024).toFixed(2)} KB)`);
        } catch (err) {
            console.error(`❌ Error downloading ${parser.name}:`, err.message);
        }
    }
}

downloadParsers();