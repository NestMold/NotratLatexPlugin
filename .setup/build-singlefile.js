/* 组装单文件插件包（v0.4.0 — 新贡献面全量内联）
 *
 * 内联范围（全部 contributions 里的 TSX 源码）：
 *   editors[].sourceFile      ← 注入 preview-core（LPC 占位注释）
 *   renderers[].sourceFile    ← 注入 preview-core（同一 LPC 占位）
 *   ui[].content.sourceFile   ← 面板组件
 *
 * ⚠ 防回归 1：mcpServers 必须数组形态 [{ id, name, transport, ... }]。
 *   对象形态会让宿主 enable() 里 for...of 抛 "object is not iterable"（0.2.3 事故）。
 * ⚠ 防回归 2：注入后源码绝不许残留 "module.exports" 语句——它会把宿主准备好的
 *   exports 对象整体覆盖成内核对象，宿主 interop 把它包成 {default: 对象}，
 *   编辑器加载报「default 应为 function，实际为 object」（0.3.0 事故）。
 *   因此导出改写正则必须 ^ 行首锚定（m 标志）：文件头注释里含
 *   「module.exports = {...}」示例字样，无锚点会先命中注释、漏掉真语句。
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

const ws = "E:/notrat-latex-plugin";
/* 版本以工作区 manifest.json 为准（写死会导致部署包版本与源码漂移） */
const VERSION = JSON.parse(fs.readFileSync(path.join(ws, "manifest.json"), "utf8")).version;

const editorSrc = fs.readFileSync(path.join(ws, "panels/editor.tsx"), "utf8");
let core = fs.readFileSync(path.join(ws, "server/preview-core.js"), "utf8");
const m = JSON.parse(fs.readFileSync(path.join(ws, "manifest.json"), "utf8"));

/* ---------- preview-core：末行 CJS 导出 → 内联常量 ---------- */
core = core.replace(
  /^module\.exports\s*=\s*\{[^}]*\};?[^\S\n]*$/m,
  "const LPC = { renderPreview: renderPreview, miniMath: miniMath };"
);
if (!/^const LPC = \{ renderPreview/m.test(core)) {
  console.error("preview-core 导出语句改写失败（未找到行首的导出语句）");
  process.exit(1);
}

/* ---------- wysiwyg 块模型内核：末行 CJS 导出 → 内联常量 ----------
 * 与 preview-core 同一条通路。导出对象内不得出现嵌套花括号（下面正则用 [^}]* 匹配）。
 * ⚠ 改写后不得残留 module.exports —— 那会把宿主 exports 覆盖成内核对象，
 *   编辑器报「default 应为 function，实际为 object」（0.3.0 事故）。 */
const wysRaw = fs.readFileSync(path.join(ws, "server/wysiwyg.js"), "utf8");
/* 导出语句 → return，然后整份包进 IIFE：
 *   内核里的 escHtml / readGroup / findEnvEnd 与 preview-core 同名，
 *   两份都摊在顶层会被 esbuild 判「已声明」（顶层不允许重名）。 */
const wysBody = wysRaw.replace(/^module\.exports\s*=\s*\{([^}]*)\};?[^\S\n]*$/m, "return {$1};");
if (!/^return \{/m.test(wysBody)) {
  console.error("wysiwyg 导出语句改写失败（未找到行首的导出语句）");
  process.exit(1);
}
const wysSrc = "const WYS = (function () {\n" + wysBody + "\n})();"

/* ---------- 事务历史内核（txlog.js）：与 preview-core / wysiwyg 同一条通路 ----------
 * 预览层的 commit / rebase / undo / redo 全在它里面。内联不进去，编辑器一碰历史就是
 * ReferenceError —— 而那个异常会被各处 try/catch 咽掉，看起来就像「撤销失灵」。
 * 与 wysiwyg 同样的约束：末行那条导出语句换成 return（正则用 [^}]* 匹配，
 * 导出对象里不许出现嵌套花括号），整份包 IIFE 后摊在顶层不重名。 */
const txRaw = fs.readFileSync(path.join(ws, "server/txlog.js"), "utf8");
const txBody = txRaw.replace(/^module\.exports\s*=\s*\{([^}]*)\};?[^\S\n]*$/m, "return {$1};");
if (!/^return \{/m.test(txBody)) {
  console.error("txlog 导出语句改写失败（未找到行首的导出语句）");
  process.exit(1);
}
const txSrc = "const TX = (function () {\n" + txBody + "\n})();";

/* ---------- 逐条内联贡献面源码 ---------- */
const LPC_TOKEN = "/*" + "__LPC__" + "*/";
const WYS_TOKEN = "/*" + "__WYS__" + "*/";
const TX_TOKEN = "/*" + "__TX__" + "*/";

function inline(src, label) {
  let out = src;
  if (out.split(LPC_TOKEN).length > 1) out = out.split(LPC_TOKEN).join(core);
  else console.warn("  ! " + label + " 未包含 LPC 占位注释（预览能力将不可用）");
  if (out.split(WYS_TOKEN).length > 1) out = out.split(WYS_TOKEN).join(wysSrc);
  else if (label.indexOf("editors[") === 0) console.warn("  ! " + label + " 未包含 WYS 占位注释（就地编辑不可用）");
  if (out.split(TX_TOKEN).length > 1) out = out.split(TX_TOKEN).join(txSrc);
  else if (label.indexOf("editors[") === 0) console.warn("  ! " + label + " 未包含 TX 占位注释（撤销历史不可用）");
  if (out.includes("module.exports")) {
    console.error("致命：" + label + " 注入后仍含 module.exports（会覆盖宿主 exports → default 变 object）");
    process.exit(1);
  }
  return out;
}

m.version = VERSION;
m.enabled = true;

let n = 0;
for (const e of m.contributions.editors || []) {
  if (!e.sourceFile) continue;
  const rel = e.sourceFile;
  e.source = inline(fs.readFileSync(path.join(ws, rel), "utf8"), "editors[" + e.id + "]");
  delete e.sourceFile;
  n++;
  console.log("  ✓ editors[" + e.id + "] ← " + rel + " (" + e.source.length + " 字符)");
}

for (const r of m.contributions.renderers || []) {
  if (!r.sourceFile) continue;
  const rel = r.sourceFile;
  r.source = inline(fs.readFileSync(path.join(ws, rel), "utf8"), "renderers[" + r.id + "]");
  delete r.sourceFile;
  n++;
  console.log("  ✓ renderers[" + r.id + "] ← " + rel + " (" + r.source.length + " 字符)");
}

for (const u of m.contributions.ui || []) {
  const c = u.content || {};
  if (!c.sourceFile) continue;
  const f = path.join(ws, c.sourceFile);
  let src = fs.readFileSync(f, "utf8");
  if (src.includes("module.exports")) {
    console.error("致命：UI 面板 " + u.id + " 源码含 module.exports");
    process.exit(1);
  }
  if (src.includes(LPC_TOKEN)) src = inline(src, "ui[" + u.id + "]");
  c.source = src;
  delete c.sourceFile;
  n++;
  console.log("  ✓ ui[" + u.id + "@" + u.location + "] ← " + u.content.source.length + " 字符");
}

/* ---------- KaTeX 离线资产 ---------- */
const kx = path.join(ws, "node_modules", "katex", "dist");
let hasKatex = false;
try {
  const js = fs.readFileSync(path.join(kx, "katex.min.js"), "utf8");
  let css = fs.readFileSync(path.join(kx, "katex.min.css"), "utf8");
  css = css.replace(/url\((fonts\/KaTeX_[A-Za-z-]+\.woff2)\)/g, (mm, rel) => {
    const f = path.join(kx, rel);
    if (!fs.existsSync(f)) return mm;
    return "url(data:font/woff2;base64," + fs.readFileSync(f).toString("base64") + ")";
  });
  fs.writeFileSync(path.join(ws, "server", "assets-katex.json"), JSON.stringify({ js: js, css: css }));
  hasKatex = true;
} catch (e) {
  console.warn("KaTeX 资产生成失败（预览将用 miniMath 兜底）:", e.message);
}

/* ---------- MCP server 落到 ~/.notrat/tools/（单文件包没有 pluginDir） ---------- */
if (!Array.isArray(m.mcpServers)) throw new Error("mcpServers 必须是数组形态（宿主 enable() for...of 会崩）");
const toolsDir = path.join(os.homedir(), ".notrat", "tools");
fs.mkdirSync(toolsDir, { recursive: true });
/* preview-core.js：v0.8.4 起 server 侧也要它（latex_export 的兜底渲染），必须一起带上 */
for (const f of ["index.js", "contrib.js", "export-html.js", "preview-core.js", "pdf-raster.js", "tex-encoding.js"]) { /* v0.9.0: +pdf-raster；v0.9.4: +tex-encoding（漏了 MCP server 起不来） */
  const dst = path.join(toolsDir, f === "index.js" ? "latex-server.js" : f);
  /* index.js 单独处理：把 server 里的 VERSION 常量对齐到 manifest.version（避免两处版本漂移） */
  let body = fs.readFileSync(path.join(ws, "server", f), "utf8");
  if (f === "index.js") {
    if (!/^const VERSION = "[^"]*";/m.test(body)) {
      console.error("致命：server/index.js 里找不到 VERSION 常量，无法对齐版本号");
      process.exit(1);
    }
    body = body.replace(/^const VERSION = "[^"]*";.*$/m, 'const VERSION = "' + VERSION + '";');
  }
  fs.writeFileSync(dst, body);
  console.log("  ✓ server/" + f + " → " + dst);
}
if (hasKatex) fs.copyFileSync(path.join(ws, "server", "assets-katex.json"), path.join(toolsDir, "assets-katex.json"));
const srv = m.mcpServers.find((s) => s.id === "latex") || m.mcpServers[0];
srv.args = [toolsDir.replace(/\\/g, "/") + "/latex-server.js"];

/* ---------- 落盘 ---------- */
const out = path.join(os.homedir(), ".notrat", "plugins", "notrat-latex-plugin.json");
fs.writeFileSync(out, JSON.stringify(m, null, 2));
console.log("\nwritten " + out + "  " + (fs.statSync(out).size / 1024).toFixed(1) + "KB");
console.log("version:", m.version, "| 内联组件数:", n);
console.log("ui 挂载位:", m.contributions.ui.map((u) => u.id + "@" + u.location).join(", "));
console.log("editors:", m.contributions.editors.map((e) => e.id + " ext=" + e.extensions + " dualView=" + e.dualView).join("; "));
console.log("renderers:", (m.contributions.renderers || []).map((r) => r.id + "@" + r.nodeType).join("; "));
console.log("toolHooks:", (m.contributions.toolHooks || []).map((h) => h.on + ":" + h.toolPattern + "→" + h.tool).join("; "));
console.log("mcpServers isArray:", Array.isArray(m.mcpServers), "→", JSON.stringify(m.mcpServers.map((s) => ({ id: s.id, args: s.args }))));
console.log("katex assets:", hasKatex ? "打包成功" : "缺失(将用 miniMath 兜底)");
console.log("wysiwyg 内核:", wysSrc.length + " 字符（就地编辑层）");
