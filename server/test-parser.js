const { Parser, Language } = require('web-tree-sitter');

async function test() {
  await Parser.init();
  const parser = new Parser();
  const Lang = await Language.load('tree-sitter-javascript.wasm');
  parser.setLanguage(Lang);

  const code = "\\ No newline at end of file\nconst x = 1;";
  const tree = parser.parse(code);
  console.log(tree.rootNode.toString());
}
test();
