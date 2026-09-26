/* v0.8.1 效果验证：导言区渲染成页首 + 页首每一项都能就地改。
 *
 * 用户报的问题：「导言区没有正常渲染呢」
 * 本脚本把修完之后的真实渲染结果打出来，再逐一验证：
 *   A. 版面骨架（导言区现在是页首，不再是折叠的源码坨）
 *   B. 每一项的「前缀 + 正文 + 后缀」是否逐字节还原原行（内核 partsExact）
 *   C. 七种真实编辑 —— 每种都必须只动该动的行，块外零改动
 *   D. 自检不是摆设：故意把前缀改坏，partsExact 必须判红
 *
 * 运行： node .setup/demo-v081.js
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
vm.runInContext(
  src.slice(iK, iKEnd) + "\n" + src.slice(iH, iHEnd) +
  "\n; globalThis.__T = { WYS: WYS, wysRenderDoc: wysRenderDoc, wysDomToTex: wysDomToTex };",
  ctx
);
const T = ctx.__T;
const W = T.WYS;
const renderMath = (tex, disp) => ctx.LPC.miniMath(tex, disp);

const sample = fs.readFileSync(path.join(ws, "samples", "sample.tex"), "utf8");
const doc = W.parseDoc(sample);
const html = T.wysRenderDoc(sample, renderMath, ws + "/samples");
const D = new JSDOM('<!doctype html><html><body><div id="r">' + html + "</div></body></html>").window.document;
const root = D.getElementById("r");

const srcLines = sample.split("\n");
function clip(s, n) { return String(s || "").replace(/\s+/g, " ").trim().slice(0, n); }
function line(p) { return "  " + "─".repeat(72) + (p ? "  " + p : ""); }

console.log("=".repeat(78));
console.log("A. sample.tex 渲染出来的版面（v0.8.1）");
console.log("=".repeat(78));
console.log("   ★ = 直接打字     ◻ = 点一下在**原地**编辑     ▸ = 默认收起\n");

for (const el of root.children) {
  const cls = el.getAttribute("class") || "";
  const tag = el.tagName.toLowerCase();
  let mark = "★";
  if (tag === "details") mark = "▸";
  else if (cls.indexOf("wys-atomblk") >= 0) mark = "◻";

  if (cls.indexOf("wys-front") >= 0) {
    console.log("   " + mark + " 页首（导言区渲染结果）");
    const t = el.querySelector(".wys-front-t");
    const a = el.querySelector(".wys-front-a");
    if (t) console.log("        " + clip(t.textContent, 60) + "        ← 点它改 \\title");
    if (a) console.log("        " + clip(a.textContent, 60) + "        ← 点它改 \\author");
    const chips = Array.from(el.querySelectorAll(".wys-chip")).map((c) => clip(c.textContent, 20));
    if (chips.length) console.log("        [ " + chips.join(" ]  [ ") + " ]   ← 点标签改 \\documentclass / \\usepackage");
    const raw = el.querySelector(".wys-raw > summary");
    if (raw) console.log("        " + clip(raw.textContent, 60) + "     ← 展开可改到 \\begin{document} 等");
    continue;
  }
  const kind =
    /wys-note/.test(cls) ? "注释" : /wys-cmd/.test(cls) ? "命令" :
    /wys-h1/.test(cls) ? "标题1" : /wys-h2/.test(cls) ? "标题2" : /wys-h3/.test(cls) ? "标题3" :
    /wys-par/.test(cls) ? "标题4" : /wys-p\b/.test(cls) ? "正文" :
    cls.indexOf("wys-atomblk") >= 0 ? "原子块" : cls;
  const num = el.querySelector(".wys-num");
  const txt = el.querySelector(".wys-edit") ? clip(el.querySelector(".wys-edit").textContent, 42) : clip(el.textContent, 42);
  console.log("   " + mark + " " + (num ? "[" + num.textContent + "]" : "   ").padEnd(6) + kind.padEnd(7) + txt);
}

/* ------------------------------------------------------------------ */
console.log("\n" + "=".repeat(78));
console.log("B. 每一项「前缀 + 正文 + 后缀」是否逐字节还原原行（内核 partsExact）");
console.log("=".repeat(78));

const fml = Array.from(root.querySelectorAll(".wys-fmline"));
let bOK = 0, bBad = [];
for (const el of fml) {
  const s0 = parseInt(el.getAttribute("data-s"), 10), e0 = parseInt(el.getAttribute("data-e"), 10);
  const item = { prefix: el.getAttribute("data-prefix"), body: el.getAttribute("data-tex"), suffix: el.getAttribute("data-suffix") };
  const orig = srcLines.slice(s0, e0 + 1).join("\n");
  const good = W.partsExact(item, orig);
  if (good) bOK++; else bBad.push(el.getAttribute("data-fk"));
  console.log("   " + (good ? "✓" : "✗") + " " + String(el.getAttribute("data-what")).padEnd(4) +
    " L" + String(s0 + 1).padEnd(3) +
    JSON.stringify(item.prefix) + " + 正文 + " + JSON.stringify(item.suffix) + "  ==  " + JSON.stringify(orig));
}
console.log("\n   " + (bBad.length === 0 ? "✓ " + bOK + " 项全部逐字节还原" : "✗ 对不上：" + bBad.join(", ")));

/* ------------------------------------------------------------------ */
console.log("\n" + "=".repeat(78));
console.log("C. 七种真实编辑 —— 每种都必须只动该动的行");
console.log("=".repeat(78));

function fresh() {
  const d = new JSDOM('<!doctype html><html><body><div id="r">' + html + "</div></body></html>").window.document;
  return d.getElementById("r");
}
function snapshot(r) {
  const m = new Map();
  for (const el of r.querySelectorAll(".wys-blk")) {
    const p = el.querySelector(".wys-edit");
    m.set(el.getAttribute("data-bid"), p ? T.wysDomToTex(p) : "");
  }
  return m;
}
function collect(r, base) {
  const edits = [];
  for (const el of r.querySelectorAll(".wys-blk")) {
    const part = el.querySelector(".wys-edit");
    if (!part) continue;
    const s0 = parseInt(el.getAttribute("data-s"), 10), e0 = parseInt(el.getAttribute("data-e"), 10);
    if (!(s0 >= 0) || !(e0 >= s0)) continue;
    const now = T.wysDomToTex(part);
    const orig = base.get(el.getAttribute("data-bid"));
    if (orig != null && now === orig) continue;
    if (el.getAttribute("data-type") === "heading") {
      edits.push({ startLine: s0, endLine: e0, newText: W.headingTex({ prefix: el.getAttribute("data-prefix") || "", suffix: el.getAttribute("data-suffix") || "" }, now) });
    } else {
      edits.push({ startLine: s0, endLine: e0, newText: now });
    }
  }
  return edits;
}
function chgLines(a, b) {
  const x = a.split("\n"), y = b.split("\n"), out = [];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) out.push(i + 1);
  return out;
}

const report = [];
function fmEdit(what, newBody) {
  const r = fresh();
  const el = r.querySelector('.wys-fmline[data-what="' + what + '"]');
  const s0 = parseInt(el.getAttribute("data-s"), 10), e0 = parseInt(el.getAttribute("data-e"), 10);
  const item = { prefix: el.getAttribute("data-prefix"), body: el.getAttribute("data-tex"), suffix: el.getAttribute("data-suffix") };
  const newText = W.partsJoin(item.prefix, newBody, item.suffix);
  const nx = W.applyEdits(sample, [{ startLine: s0, endLine: e0, newText: newText }]);
  const chg = chgLines(sample, nx);
  report.push({ t: "页首 · " + what, chg: chg });
  const want = s0 + 1;
  if (chg.length === 0) console.log("        ✗ 这一步压根没产生改动 —— 用例空转了（喂回去的值和原文一样？）");
  console.log("\n   " + what.padEnd(4) + " 「" + clip(item.body, 26) + "」 → 「" + clip(newBody, 26) + "」");
  console.log("        写回：" + JSON.stringify(item.prefix + newBody + item.suffix));
  console.log("        变动行：L" + chg.join(", L") + "    " +
    (chg.length === 1 && chg[0] === want ? "✓ 只动 L" + want + "，其余 " + (srcLines.length - 1) + " 行逐字节不动" : "✗ 外溢！"));
  return nx;
}

const afterTitle = fmEdit("标题", "基于深度学习的文本摘要研究（改名了）");
const afterAuthor = fmEdit("作者", "张三, 李四");
const afterCls = fmEdit("文档类", "article");   // 必须真的改一个值：喂回原值等于没测
const afterPkg = fmEdit("宏包", "amsmath,amssymb");

/* 正文打字 */
{
  const r = fresh(), base = snapshot(r);
  const p = Array.from(r.querySelectorAll(".wys-blk.wys-p")).find((el) => el.textContent.indexOf("自然语言处理") >= 0);
  const mark = D.createElement("span");
  mark.textContent = "（在这里补了一句）";
  p.querySelector(".wys-edit").appendChild(mark);
  const nx = W.applyEdits(sample, collect(r, base));
  const chg = chgLines(sample, nx);
  report.push({ t: "正文打字", chg: chg });
  console.log("\n   正文打字   「…抽取核心信息。」 → 「…抽取核心信息。（在这里补了一句）」");
  console.log("        变动行：L" + chg.join(", L") + "    " + (chg.length === 1 ? "✓ 只动 L" + chg[0] : "✗ 外溢！"));
}

/* 点 [1] 改引用（行内原子：改 data-tex，不反推） */
{
  const r = fresh(), base = snapshot(r);
  const cite = r.querySelector(".wys-atom.wys-cite");
  const before = cite.getAttribute("data-tex");
  cite.setAttribute("data-tex", "\\cite{vaswani2017,devlin2019}");
  cite.setAttribute("title", "\\cite{vaswani2017,devlin2019}");
  const nx = W.applyEdits(sample, collect(r, base));
  const chg = chgLines(sample, nx);
  report.push({ t: "点 [1] 改引用", chg: chg });
  console.log("\n   点 [1] 改引用   " + before + " → " + cite.getAttribute("data-tex"));
  console.log("        显示仍是 [1]（有损渲染），但源码里改的是 {key} —— 没有从 [1] 反推");
  console.log("        变动行：L" + chg.join(", L") + "    " + (chg.length === 1 ? "✓ 只动含 \\cite 的那一行" : "✗ 外溢！"));
}

/* 点公式改公式（块级原子） */
{
  const blk = root.querySelector(".wys-atomblk[data-type='math']");
  const s0 = parseInt(blk.getAttribute("data-s"), 10), e0 = parseInt(blk.getAttribute("data-e"), 10);
  const oldTex = blk.getAttribute("data-tex");
  const nx = W.applyEdits(sample, [{ startLine: s0, endLine: e0, newText: oldTex.replace("\\sqrt{d_k}", "\\sqrt{d_{k}}") }]);
  const chg = chgLines(sample, nx);
  report.push({ t: "点公式改公式", chg: chg });
  const oob = [];
  const a = nx.split("\n"), b = sample.split("\n");
  for (let i = 0; i < a.length; i++) { if (i >= s0 && i <= e0) continue; if (a[i] !== b[i]) oob.push(i + 1); }
  console.log("\n   点公式改公式（L" + (s0 + 1) + "–" + (e0 + 1) + "）   \\sqrt{d_k} → \\sqrt{d_{k}}");
  console.log("        变动行：L" + chg.join(", L") + "    " + (chg.length === 1 ? "✓ 只动公式块内部" : "✗ 外溢！"));
  console.log("        块外零改动：" + (oob.length === 0 ? "✓" : "✗ L" + oob.join(", L")) + "；全篇 \\cite 完好：" + (nx.indexOf("\\cite{vaswani2017}") >= 0));
}

/* ------------------------------------------------------------------ */
console.log("\n" + "=".repeat(78));
console.log("汇总");
console.log("=".repeat(78));
console.log("   编辑动作                变动行         结论");
console.log("   " + "─".repeat(62));
for (const r of report) {
  const one = r.chg.length === 1;
  console.log("   " + r.t.padEnd(22) + ("L" + r.chg.join(", L")).padEnd(15) + (one ? "✓ 只动该行，块外零改动" : "⚠ 动了 " + r.chg.length + " 行"));
}
console.log("\n   " + (report.every((r) => r.chg.length === 1) ? "✓ 七种编辑全部只落在目标行" : "✗ 有编辑外溢"));

/* ------------------------------------------------------------------ */
console.log("\n" + "=".repeat(78));
console.log("D. 自检不是摆设：故意把前缀改坏，partsExact 必须判红");
console.log("=".repeat(78));

const t0el = fml[0];
const good = { prefix: t0el.getAttribute("data-prefix"), body: t0el.getAttribute("data-tex"), suffix: t0el.getAttribute("data-suffix") };
const origLine = srcLines.slice(parseInt(t0el.getAttribute("data-s"), 10), parseInt(t0el.getAttribute("data-e"), 10) + 1).join("\n");

const cases = [
  ["原样（没动过）", good, true],
  /* 注意前缀是 "\\title{" —— 结尾是花括号的**左**边，砍它得砍 "{" */
  ["前缀被吃掉结尾的 {", { prefix: good.prefix.replace(/\{$/, ""), body: good.body, suffix: good.suffix }, false],
  ["后缀被改成 }%", { prefix: good.prefix, body: good.body, suffix: good.suffix + "%" }, false],
  ["正文被塞进空格", { prefix: good.prefix, body: good.body + " ", suffix: good.suffix }, false],
  ["前缀后缀互换", { prefix: good.suffix, body: good.body, suffix: good.prefix }, false],
];
let dOK = true;
for (const c of cases) {
  const got = W.partsExact(c[1], origLine);
  const pass = got === c[2];
  if (!pass) dOK = false;
  console.log("   " + (pass ? "✓" : "✗") + " " + c[0].padEnd(22) + " partsExact = " + String(got).padEnd(6) + "（期望 " + c[2] + "）");
}
console.log("\n   " + (dOK ? "✓ 自检能拦住被改坏的前后缀 —— 提交前就会整处放弃，不会写出半个坏行" : "✗ 自检失灵"));

console.log("\n" + "=".repeat(78));
console.log((bBad.length === 0 && dOK && report.every((r) => r.chg.length === 1))
  ? "✓ 全部通过：导言区渲染成页首，每一项都能就地改，且只改它那一行"
  : "✗ 有未通过项");
console.log("=".repeat(78));
