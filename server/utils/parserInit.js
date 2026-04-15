import { Parser, Language } from 'web-tree-sitter';

// 1. Global Parser Variable
export let parser = null;
export const grammars = {
  javascript: null,
  python: null,
  java: null,
  c: null
};

export const extensionMap = {
  '.js': 'javascript', '.jsx': 'javascript', '.ts': 'javascript', '.tsx': 'javascript',
  '.py': 'python',
  '.java': 'java',
  '.c': 'c', '.h': 'c'
};

// 2. Initialize Parser exactly once on server startup
export async function initGitPulseParser() {
  try {
    await Parser.init();
    parser = new Parser();

    // Load all the WASM files you placed in the root folder
    grammars.javascript = await Language.load('tree-sitter-javascript.wasm');
    grammars.python = await Language.load('tree-sitter-python.wasm');
    grammars.java = await Language.load('tree-sitter-java.wasm');
    grammars.c = await Language.load('tree-sitter-c.wasm');

    console.log("Polyglot Engine Active: JS, Python, Java, and C grammars loaded.");
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
