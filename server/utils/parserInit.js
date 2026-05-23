import { Parser, Language } from 'web-tree-sitter';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 1. Global Parser Variable
export let parser = null;
export const grammars = {
  javascript: null,
  typescript: null,
  tsx: null,
  python: null,
  java: null,
  c: null
};

export const extensionMap = {
  '.js': 'javascript', '.jsx': 'javascript', '.ts': 'typescript', '.tsx': 'tsx',
  '.py': 'python',
  '.java': 'java',
  '.c': 'c', '.h': 'c'
};

async function loadGrammar(relativePath, fallbackKey = null) {
  const absolutePath = join(__dirname, '..', relativePath);
  if (!existsSync(absolutePath)) {
    if (fallbackKey && grammars[fallbackKey]) {
      console.warn(`Grammar file missing: ${relativePath}. Falling back to '${fallbackKey}'.`);
      return grammars[fallbackKey];
    }
    throw new Error(`Grammar file missing: ${absolutePath}`);
  }

  return Language.load(absolutePath);
}

// 2. Initialize Parser exactly once on server startup
export async function initGitPulseParser() {
  try {
    await Parser.init();
    parser = new Parser();

    // Load all the WASM files you placed in the root folder
    grammars.javascript = await loadGrammar('tree-sitter-javascript.wasm');
    grammars.typescript = await loadGrammar('tree-sitter-typescript.wasm', 'javascript');
    grammars.tsx = await loadGrammar('tree-sitter-tsx.wasm', 'typescript');
    grammars.python = await loadGrammar('tree-sitter-python.wasm');
    grammars.java = await loadGrammar('tree-sitter-java.wasm');
    grammars.c = await loadGrammar('tree-sitter-c.wasm');

    console.log("Polyglot Engine Active: JS, TS, TSX, Python, Java, and C grammars loaded.");
  } catch (err) {
    console.error("Failed to load one or more WASM grammars. Check file paths.", err);
  }
}

/**
 * Separates a Git Patch into 'Old' and 'New' code blocks
 * removes +, -, and @@ headers for clean CST parsing
 */
export function splitDiff(patch) {
  const lines = patch.split('\n');
  let oldCode = "";
  let newCode = "";

  lines.forEach(line => {
    if (line.startsWith('-') && !line.startsWith('---')) {
      oldCode += line.substring(1) + '\n';
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      newCode += line.substring(1) + '\n';
    } else if (line.startsWith('\\') || line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@')) {
      // Ignore patch headers and "\ No newline at end of file" comments
      return;
    } else {
      // Keep context lines for both to maintain tree structure
      // Stripping the leading space character if it is a diff context line
      const contextLine = line.startsWith(' ') ? line.substring(1) : line;
      oldCode += contextLine + '\n';
      newCode += contextLine + '\n';
    }
  });

  return { oldCode, newCode };
}
