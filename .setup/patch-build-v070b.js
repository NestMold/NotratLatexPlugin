/* v0.7.0b —— wysiwyg 内核改成 IIFE 内联
 *
 * 事故：preview-core 与 wysiwyg 各自都有 escHtml / readGroup / findEnvEnd，
 * 两份内联进同一个模块作用域 ⇒ esbuild 报
 *   "The symbol findEnvEnd has already been declared"（ECMAScript module 顶层不允许重名）。
 *   装机时同样会炸（编译期就挂），所以必须在内联层消掉，而不是去改内核里的函数名
 *   —— 改内核名会害得 server/ 侧单测与 Node 直用也要跟着漂移。
 *
 * 修法：把整个内核包进 IIFE，只在顶层留下 const WYS = (function(){...})();
 *   导出语句 module.exports = {..} 改写成 return {..}（同一行、无嵌套花括号）。
 *
 * 运行： node .setup/patch-build-v070b.js
 */
const fs = require("fs");

const f = "E:/notrat-latex-plugin/.setup/build-singlefile.js";
let src = fs.readFileSync(f, "utf8");

const OLD = 'let wysSrc = fs.readFileSync(path.join(ws, "server/wysiwyg.js"), "utf8");\n'
  + 'wysSrc = wysSrc.replace(\n'
  + '  /^module\\.exports\\s*=\\s*\\{[^}]*\\};?[^\\S\\n]*$/m,\n'
  + '  "const WYS = { parseDoc: parseDoc, applyEdits: applyEdits, parseInline: parseInline, segmentsToTex: segmentsToTex, headingTex: headingTex, escHtml: escHtml };"\n'
  + ');\n'
  + 'if (!/^const WYS = \\{ parseDoc/m.test(wysSrc)) {\n'
  + '  console.error("wysiwyg 导出语句改写失败（未找到行首的导出语句）");\n'
  + '  process.exit(1);\n'
  + '}';

const NEW = 'const wysRaw = fs.readFileSync(path.join(ws, "server/wysiwyg.js"), "utf8");\n'
  + '/* 导出语句 → return，然后整份包进 IIFE：\n'
  + ' *   内核里的 escHtml / readGroup / findEnvEnd 与 preview-core 同名，\n'
  + ' *   两份都摊在顶层会被 esbuild 判「已声明」（顶层不允许重名）。 */\n'
  + 'const wysBody = wysRaw.replace(/^module\\.exports\\s*=\\s*\\{([^}]*)\\};?[^\\S\\n]*$/m, "return {$1};");\n'
  + 'if (!/^return \\{/m.test(wysBody)) {\n'
  + '  console.error("wysiwyg 导出语句改写失败（未找到行首的导出语句）");\n'
  + '  process.exit(1);\n'
  + '}\n'
  + 'const wysSrc = "const WYS = (function () {\\n" + wysBody + "\\n})();";';

if (src.split(OLD).length - 1 !== 1) {
  console.error("✗ 锚点未命中（期望 1 次）—— build-singlefile.js 结构已变");
  process.exit(1);
}
src = src.split(OLD).join(NEW);

/* 日志里 wysSrc 仍可用 */
fs.writeFileSync(f, src);
console.log("✓ build-singlefile.js：WYS 改为 IIFE 内联");
