import { Parser, Language } from 'web-tree-sitter';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function test() {
    await Parser.init();
    const parser = new Parser();
    const lang = await Language.load(join(__dirname, 'tree-sitter-javascript.wasm'));
    parser.setLanguage(lang);

    const code = `
    import React from 'react';
    function App(props: any): JSX.Element {
        let x: number = 5;
        return <div className="app">Hello World</div>;
    }
    `;

    const tree = parser.parse(code);
    console.log("TSX has error?", tree.rootNode.hasError);
}

test();
