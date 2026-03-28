const fs = require('fs');
const path = require('path');
const axios = require('axios'); // We use your existing Axios package!

const parsers = [
    {
        name: 'tree-sitter-python.wasm',
        url: 'https://unpkg.com/tree-sitter-wasms/out/tree-sitter-python.wasm'
    },
    {
        name: 'tree-sitter-java.wasm',
        url: 'https://unpkg.com/tree-sitter-wasms/out/tree-sitter-java.wasm'
    },
    {
        name: 'tree-sitter-c.wasm',
        url: 'https://unpkg.com/tree-sitter-wasms/out/tree-sitter-c.wasm'
    }
];

console.log("Downloading Polyglot WebAssembly Parsers (Following Redirects)...");

async function downloadParsers() {
    for (const parser of parsers) {
        const filePath = path.join(__dirname, parser.name);

        try {
            // Axios automatically follows 302 redirects!
            const response = await axios({
                method: 'GET',
                url: parser.url,
                responseType: 'stream' // We are downloading binary files
            });

            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);

            // Wait for the file to finish writing
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            console.log(`✅ Successfully downloaded: ${parser.name}`);
        } catch (err) {
            console.error(`❌ Error downloading ${parser.name}:`, err.message);
        }
    }
}

downloadParsers();