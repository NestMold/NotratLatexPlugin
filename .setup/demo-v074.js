/* v0.7.4 效果预览：把 sample.tex 在「就地编辑」层渲染一遍，打印版面骨架，
 * 再真改一次注释块，验证 applyEdits 只动那一行、其它行逐字节不动。
 *
 * 运行： node .setup/demo-v074.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ws = "E:/notrat-latex-plugin";
const pkg = JSON.parse(fs.readFileSync("C:/Users/Administrator/.notrat/plugins/notrat-latex-plugin.json", "utf8"));
const src = pkg.contributions.editors[0].source;

const iK = src.indexOf("const WYS = (function () {");
const iKEnd = src.indexOf("\n})();", iK) + 6;
const iH = src.indexOf("function escAttr(s) {");
const iHEnd = src.indexOf("\nfunction esc(s) {", iH);
const { JSDOM } = require(path.join(ws, "node_modules", "jsdom"));
const dom0 = new JSDOM("<!doctype html><html><body></body></html>");
const ctx = {
  document: dom0.window.document, window: dom0.window, console,
  Map, parseInt, String, Number, RegExp, JSON,
  LPC: require(path.join(ws, "server", "preview-core.js")),
};
vm.createContext(ctx);
vm.runInContext(src.slice(iK, iKEnd) + "\n" + src.slice(iH, iHEnd) +
  "\n; globalThis.__T = { WYS: WYS, wysRenderDoc: wysRenderDoc, wysDomToTex: wysDomToTex };", ctx);
const T = ctx.__T;
const W = T.WYS;
const renderMath = (tex, disp) => ctx.LPC.miniMath(tex, disp);

const sample = fs.readFileSync(path.join(ws, "samples", "sample.tex"), "utf8");
const html = T.wysRenderDoc(sample, renderMath, ws + "/samples");

const dom = new JSDOM('<!doctype html><html><body><div id="r">' + html + "</div></body></html>");
const doc = dom.window.document;
const root = doc.getElementById("r");

console.log("=".repeat(74));
console.log("sample.tex 在「就地编辑」层的版面骨架（v0.7.4）");
console.log("=".repeat(74));
console.log("（★ = 可编辑且外观即正文；◻ = 原子块，hover 才出工具条；▸ = 默认收起）\n");

function clip(s, n) {
  return String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
}

for (const el of root.children) {
  const cls = el.getAttribute("class") || "";
  const tag = el.tagName.toLowerCase();
  let mark = "★";
  if (tag === "details") mark = "▸";
  else if (cls.indexOf("wys-card") >= 0) mark = "◻";
  const kind = /wys-fold/.test(cls) ? "导言区(折叠)"
    : /wys-note/.test(cls) ? "注释"
    : /wys-cmd/.test(cls) ? "命令"
    : /wys-h(\d)/.test(cls) ? ("标题 h" + /wys-h(\d)/.exec(cls)[1])
    : /wys-par/.test(cls) ? "第4档标题"
    : /wys-p\b/.test(cls) ? "正文段"
    : cls.indexOf("wys-card") >= 0 ? ((el.querySelector(".wys-bar-ln") || {}).textContent || "原子块").split(" · ")[0]
    : cls;
  console.log("  " + mark + " " + kind.padEnd(12) + clip(el.textContent, 46));
}

/* ---------------- 真实编辑：改注释块 ---------------- */
console.log("\n" + "=".repeat(74));
console.log("真实编辑探针：改那条 % TODO 注释，回写必须只动第 14 行");
console.log("=".repeat(74));

const note = root.querySelector(".wys-note .wys-edit");
console.log("  改前：" + JSON.stringify(note.textContent));
note.textContent = "% 已补齐 2023–2025 综述文献（v0.7.4 就地编辑）";
console.log("  改后：" + JSON.stringify(note.textContent));

const edits = [];
for (const el of root.querySelectorAll(".wys-blk")) {
  const part = el.querySelector(".wys-edit");
  if (!part) continue;
  const s = parseInt(el.getAttribute("data-s"), 10);
  const e = parseInt(el.getAttribute("data-e"), 10);
  const now = T.wysDomToTex(part);
  if (el.getAttribute("data-type") === "heading") {
    edits.push({ startLine: s, endLine: e, newText: W.headingTex({ prefix: el.getAttribute("data-prefix") || "", suffix: el.getAttribute("data-suffix") || "" }, now) });
  } else {
    edits.push({ startLine: s, endLine: e, newText: now });
  }
}
const next = W.applyEdits(sample, edits);
const a = sample.split("\n"), b = next.split("\n");
const changed = [];
for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) changed.push(i + 1);

console.log("\n  行数：" + a.length + " → " + b.length);
console.log("  变动行：" + (changed.length ? "L" + changed.join(", L") : "（无）"));
console.log("  L14 新内容：" + JSON.stringify(b[13]));
const othersSame = changed.length === 1 && changed[0] === 14;
console.log("\n  " + (othersSame ? "✓ 只有 L14 动了，其余 60 行逐字节不动" : "✗ 改动外溢！"));
console.log("  " + (next.indexOf("\\cite{vaswani2017}") >= 0 ? "✓ \\cite{vaswani2017} 完好" : "✗ \\cite 丢了"));
console.log("  " + (next.indexOf("\\label{sec:method}") >= 0 ? "✓ \\label{sec:method} 完好" : "✗ \\label 丢了"));
process.exit(othersSame ? 0 : 1);
