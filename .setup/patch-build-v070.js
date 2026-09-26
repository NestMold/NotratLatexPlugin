/* v0.7.0 —— build-singlefile.js 增加 WYS 占位符内联（与 LPC 同一套路）
 * 运行： node .setup/patch-build-v070.js
 */
const fs = require("fs");
const path = require("path");

const f = "E:/notrat-latex-plugin/.setup/build-singlefile.js";
let src = fs.readFileSync(f, "utf8");
let done = 0;
function sub(label, anchor, repl) {
  const n = src.split(anchor).length - 1;
  if (n !== 1) { console.error("✗ [" + label + "] 命中 " + n + " 次（期望 1）"); process.exit(1); }
  src = src.split(anchor).join(repl); done++; console.log("  ✓ " + label);
}

/* 1. wysiwyg 导出改写 */
sub("01 wysiwyg 导出改写",
  'if (!/^const LPC = \\{ renderPreview/m.test(core)) {\n  console.error("preview-core 导出语句改写失败（未找到行首的导出语句）");\n  process.exit(1);\n}',
  'if (!/^const LPC = \\{ renderPreview/m.test(core)) {\n  console.error("preview-core 导出语句改写失败（未找到行首的导出语句）");\n  process.exit(1);\n}\n\n'
  + '/* ---------- wysiwyg 块模型内核：末行 CJS 导出 → 内联常量 ----------\n'
  + ' * 与 preview-core 同一条通路。导出对象内不得出现嵌套花括号（下面正则用 [^}]* 匹配）。\n'
  + ' * ⚠ 改写后不得残留 module.exports —— 那会把宿主 exports 覆盖成内核对象，\n'
  + ' *   编辑器报「default 应为 function，实际为 object」（0.3.0 事故）。 */\n'
  + 'let wysSrc = fs.readFileSync(path.join(ws, "server/wysiwyg.js"), "utf8");\n'
  + 'wysSrc = wysSrc.replace(\n'
  + '  /^module\\.exports\\s*=\\s*\\{[^}]*\\};?[^\\S\\n]*$/m,\n'
  + '  "const WYS = { parseDoc: parseDoc, applyEdits: applyEdits, parseInline: parseInline, segmentsToTex: segmentsToTex, headingTex: headingTex, escHtml: escHtml };"\n'
  + ');\n'
  + 'if (!/^const WYS = \\{ parseDoc/m.test(wysSrc)) {\n'
  + '  console.error("wysiwyg 导出语句改写失败（未找到行首的导出语句）");\n'
  + '  process.exit(1);\n'
  + '}');

/* 2. WYS token + inline() 支持双载荷 */
sub("02 WYS token",
  'const LPC_TOKEN = "/*" + "__LPC__" + "*/";',
  'const LPC_TOKEN = "/*" + "__LPC__" + "*/";\nconst WYS_TOKEN = "/*" + "__WYS__" + "*/";');

sub("03 inline 双载荷",
  'function inline(src, label) {\n'
  + '  const hit = src.split(LPC_TOKEN);\n'
  + '  if (hit.length === 1) {\n'
  + '    console.warn("  ! " + label + " 未包含 LPC 占位注释（预览能力将不可用）");\n'
  + '    return src;\n'
  + '  }\n'
  + '  const out = hit.join(core);\n'
  + '  if (out.includes("module.exports")) {\n'
  + '    console.error("致命：" + label + " 注入后仍含 module.exports（会覆盖宿主 exports → default 变 object）");\n'
  + '    process.exit(1);\n'
  + '  }\n'
  + '  return out;\n'
  + '}',
  'function inline(src, label) {\n'
  + '  let out = src;\n'
  + '  if (out.split(LPC_TOKEN).length > 1) out = out.split(LPC_TOKEN).join(core);\n'
  + '  else console.warn("  ! " + label + " 未包含 LPC 占位注释（预览能力将不可用）");\n'
  + '  if (out.split(WYS_TOKEN).length > 1) out = out.split(WYS_TOKEN).join(wysSrc);\n'
  + '  else if (label.indexOf("editors[") === 0) console.warn("  ! " + label + " 未包含 WYS 占位注释（就地编辑不可用）");\n'
  + '  if (out.includes("module.exports")) {\n'
  + '    console.error("致命：" + label + " 注入后仍含 module.exports（会覆盖宿主 exports → default 变 object）");\n'
  + '    process.exit(1);\n'
  + '  }\n'
  + '  return out;\n'
  + '}');

/* 3. 落盘日志补一行 */
sub("04 日志",
  'console.log("katex assets:", hasKatex ? "打包成功" : "缺失(将用 miniMath 兜底)");',
  'console.log("katex assets:", hasKatex ? "打包成功" : "缺失(将用 miniMath 兜底)");\n'
  + 'console.log("wysiwyg 内核:", wysSrc.length + " 字符（就地编辑层）");');

fs.writeFileSync(f, src);
console.log("\n✓ build-singlefile.js 已更新（" + done + " 处）");
