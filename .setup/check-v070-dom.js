/* v0.7.0 —— 真·DOM 往返验收（用装机包里那份代码 + jsdom 真 HTML 解析器）
 *
 * 验的是最要命的一条：**渲染 → DOM → 读回 → applyEdits 是否逐字节还原**。
 * 只要这条成立，「聚焦 / 失焦 / 敲几个字」就不可能丢字节；
 * 一旦它破了，用户敲一次字就会烧掉 \cite / \ref —— 正是方案 A 要防的丢稿事故。
 *
 * 运行： node .setup/check-v070-dom.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ws = "E:/notrat-latex-plugin";
const m = JSON.parse(fs.readFileSync("C:/Users/Administrator/.notrat/plugins/notrat-latex-plugin.json", "utf8"));
const src = m.contributions.editors[0].source;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok    " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "\n        → " + extra : "")); }
}

/* ---- 从装机包源码里切出「内核」与「就地编辑层」两段，在 vm 里求值 ---- */
const iK = src.indexOf("const WYS = (function () {");
const iKEnd = src.indexOf("\n})();", iK) + 6;
if (iK < 0 || iKEnd < 6) { console.error("✗ 装机包里找不到 WYS 内核"); process.exit(1); }
const kernel = src.slice(iK, iKEnd);

const iH = src.indexOf("function escAttr(s) {");
const iHEnd = src.indexOf("\nfunction esc(s) {", iH);
if (iH < 0 || iHEnd < 0) { console.error("✗ 装机包里找不到就地编辑层函数"); process.exit(1); }
const helpers = src.slice(iH, iHEnd);

/* ---- jsdom 提供真 document ---- */
const { JSDOM } = require(path.join(ws, "node_modules", "jsdom"));
const dom = new JSDOM("<!doctype html><html><body></body></html>");
const ctx = { document: dom.window.document, window: dom.window, console: console, Map: Map, parseInt: parseInt, String: String, Number: Number, RegExp: RegExp, JSON: JSON,
  /* v0.7.2：原子卡片用只读预览内核做富渲染，测试里也得给 */
  LPC: require(path.join(ws, "server", "preview-core.js")) };
vm.createContext(ctx);
vm.runInContext(kernel + "\n" + helpers + "\n; globalThis.__T = { WYS: WYS, wysInline: wysInline, wysDomToTex: wysDomToTex, wysRenderDoc: wysRenderDoc };", ctx);
const T = ctx.__T;
const W = T.WYS;
const sample = fs.readFileSync(path.join(ws, "samples", "sample.tex"), "utf8");

/* KaTeX 外观替身：故意返回多层嵌套 span，验证 walker 不会误下钻进原子内部 */
const renderMath = (tex) => '<span class="katex"><span class="katex-mathml">' + tex.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c])) + "</span></span>";

/* 取一个函数体的文本：从 `function NAME(` 到下一个同级 `\n  function ` 为止。
 * 为什么不数花括号：注释里就有 `\title{ … }` 这种括号，配对法会被注释带偏。
 * 为什么不用「函数开头 + N 个字符」：那测的是「这几句话离开头够不够近」，
 * 不是「这个函数到底做没做这件事」—— 函数一长就误报。 */
function funcText(source, name) {
  const k = source.indexOf("function " + name + "(");
  if (k < 0) return "";
  const nxt = source.indexOf("\n  function ", k + 10);
  return source.slice(k, nxt < 0 ? source.length : nxt);
}

console.log("\n[1] 行内往返：wysInline → 真 HTML 解析 → wysDomToTex 逐字节还原");
const inlineCases = [
  "见~\\cite{vaswani2017} 与 \\ref{fig:model}。",
  "其中式~\\eqref{eq:attn} 中 $d_k$ 为键向量维度，$Q$、$K$、$V$ 分别为查询、键、值矩阵。",
  "\\textbf{粗体}与\\emph{斜体}混排，外加 \\texttt{等宽}。",
  "50\\% 是比例，其余不在注释里。",
  "转义字符：\\$ 美元 \\& 与号 \\_ 下划线 \\# 井号 \\{ 花括号 \\}。",
  "行尾注释 % 从这里开始全算注释 \\cite{nope}",
  "嵌套：\\textbf{外层 \\emph{内层} 收尾} 与 $a+b$。",
  "裸 HTML 风险：a < b & c > d",
  "引号风险：他说“你好”与 'single' 以及 \\cite{k}",
  "<script>alert(1)</script> 不该被当标签",
];
let bad = null;
for (let k = 0; k < inlineCases.length; k++) {
  const s = inlineCases[k];
  const d = dom.window.document.createElement("div");
  d.innerHTML = T.wysInline(s, renderMath);
  const back = T.wysDomToTex(d);
  if (back !== s) { bad = "case#" + k + "\n        原: " + JSON.stringify(s) + "\n        回: " + JSON.stringify(back); break; }
}
ok(inlineCases.length + " 组行内往返逐字节一致", bad === null, bad);
ok("<script> 未被当标签执行", (function () {
  const d = dom.window.document.createElement("div");
  d.innerHTML = T.wysInline("<script>alert(1)</script>", renderMath);
  return d.querySelector("script") === null;
})());

console.log("\n[2] 整篇渲染：块数与块模型一致");
const root = dom.window.document.createElement("div");
root.innerHTML = T.wysRenderDoc(sample, renderMath);
const doc = W.parseDoc(sample);
/* v0.7.4：这里不再写死块数 —— 形态演进一次就误报一次（旧版钉死 12 / 8，
 *   把 4 类隐形块挪进可编辑块之后就红了）。改成钉「分类契约」，它不随版本漂：
 *     · 有视觉结果的块（公式/浮动体/文献/代码/环境/列表/文本环境）→ 必须是原子卡片
 *     · 其余块（导言区/命令/注释/结尾 + 标题/正文）        → 必须是可编辑块
 *     · 两者之和 == 块模型总数                              → 不许有块被渲染丢掉 */
const ATOMIC_TYPES = ["math", "float", "bib", "code", "env", "list", "text-env"];
const atomics = doc.blocks.filter((b) => ATOMIC_TYPES.indexOf(b.type) >= 0);
const editables = doc.blocks.filter((b) => ATOMIC_TYPES.indexOf(b.type) < 0);
ok("可编辑块数一致（" + editables.length + "）", root.querySelectorAll(".wys-blk").length === editables.length,
  root.querySelectorAll(".wys-blk").length + " vs " + editables.length);
ok("原子块数一致（" + atomics.length + "）", root.querySelectorAll(".wys-atomblk").length === atomics.length,
  root.querySelectorAll(".wys-atomblk").length + " vs " + atomics.length);
ok("契约：有视觉结果的块一个都没被做成可直接编辑（反推 LaTeX 会烧稿）",
  Array.prototype.every.call(root.querySelectorAll(".wys-atomblk"), (el) => !el.querySelector(".wys-edit")),
  "原子块里冒出了 .wys-edit");
ok("契约：每个可编辑块都带 .wys-edit（否则 commitWys 收不到它的改动）",
  Array.prototype.every.call(root.querySelectorAll(".wys-blk"), (el) => !!el.querySelector(".wys-edit")),
  "有 .wys-blk 缺 .wys-edit");
ok("覆盖完整：可编辑块 + 原子块 == 块模型总数（" + doc.blocks.length + "）",
  root.querySelectorAll(".wys-blk").length + root.querySelectorAll(".wys-atomblk").length === doc.blocks.length,
  root.querySelectorAll(".wys-blk").length + " + " + root.querySelectorAll(".wys-atomblk").length + " vs " + doc.blocks.length);
ok("每张卡片都有 data-line（点一下能跳源码）", Array.prototype.every.call(root.querySelectorAll(".wys-card"), (el) => !!el.getAttribute("data-line")));

console.log("\n[3] ★ 零改动往返：DOM 读回 → applyEdits 必须逐字节还原整篇");
/* 完全复刻 editor.tsx commitWys 收集 edits 的那段逻辑（只是不过滤「未改动」） */
function collectEdits(root, doc) {
  const edits = [];
  const blks = root.querySelectorAll(".wys-blk");
  for (let i = 0; i < blks.length; i++) {
    const el = blks[i];
    const part = el.querySelector(".wys-edit");
    if (!part) continue;
    const s = parseInt(el.getAttribute("data-s"), 10);
    const e = parseInt(el.getAttribute("data-e"), 10);
    if (!(s >= 0) || !(e >= s)) continue;
    const now = T.wysDomToTex(part);
    if (el.getAttribute("data-type") === "heading") {
      edits.push({ startLine: s, endLine: e, newText: W.headingTex({ prefix: el.getAttribute("data-prefix") || "", suffix: el.getAttribute("data-suffix") || "" }, now) });
    } else {
      edits.push({ startLine: s, endLine: e, newText: now });
    }
  }
  return edits;
}
const allEdits = collectEdits(root, doc);
ok("收集到 " + allEdits.length + " 条块编辑", allEdits.length === editables.length);
const roundTrip = W.applyEdits(sample, allEdits);
ok("applyEdits(src, 全部块原样回写) === src", roundTrip === sample, (function () {
  if (roundTrip === sample) return "";
  const a = sample.split("\n"), b = roundTrip.split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return "首个差异 L" + (i + 1) + "\n        原: " + JSON.stringify(a[i]) + "\n        回: " + JSON.stringify(b[i]);
  }
  return "长度差 " + a.length + " vs " + b.length;
})());

console.log("\n[4] 模拟真实编辑：段首插字，原子 \cite 必须活下来");
/* v0.9.3：不再按渲染出来的字（"Transformer"）找段落 —— 改按**源码行区间**找第一处 \cite。
 * 断言的本意是「含原子 \cite 的段落能就地编辑且原子不被烧掉」，找的是哪一段不是被测对象。 */
const SAT_SRC = sample.split("\n");
const FIRST_CITE = (sample.match(/\\cite\{[^}]*\}/) || [""])[0];
const CITE_LINE = SAT_SRC.findIndex((l) => FIRST_CITE && l.indexOf(FIRST_CITE) >= 0);
const citeBlk = Array.prototype.find.call(root.querySelectorAll(".wys-blk"), (el) => {
  const s0 = parseInt(el.getAttribute("data-s"), 10), e0 = parseInt(el.getAttribute("data-e"), 10);
  return !!el.querySelector(".wys-edit") && CITE_LINE >= s0 && CITE_LINE <= e0;
});
ok("找到含 " + FIRST_CITE + " 的段落块", !!citeBlk);
if (citeBlk) {
  const part = citeBlk.querySelector(".wys-edit");
  part.insertBefore(dom.window.document.createTextNode("【已改】"), part.firstChild);
  const after = T.wysDomToTex(part);
  ok("插入的文字出现在读回结果里", after.indexOf("【已改】") === 0, JSON.stringify(after.slice(0, 40)));
  ok("同段 \\cite 原子原样存活", after.indexOf(FIRST_CITE) >= 0);
  const s = parseInt(citeBlk.getAttribute("data-s"), 10), e = parseInt(citeBlk.getAttribute("data-e"), 10);
  const out = W.applyEdits(sample, [{ startLine: s, endLine: e, newText: after }]);
  ok("回写后源码含新文字", out.indexOf("【已改】") >= 0);
  ok("回写后 " + FIRST_CITE + " 仍在", out.indexOf(FIRST_CITE) >= 0);
  const before = sample.split("\n"), afters = out.split("\n");
  let outside = true, where = "";
  for (let i = 0; i < before.length; i++) {
    if (i >= s && i <= e) continue;
    if (before[i] !== afters[i]) { outside = false; where = "L" + (i + 1); break; }
  }
  ok("改动只落在该块行区间（其余行逐字节不动）", outside, where);
}

console.log("\n[5] 模拟标题编辑：\\label 与短标题必须保住");
const headBlk = Array.prototype.find.call(root.querySelectorAll(".wys-blk"), (el) => (el.getAttribute("data-type") === "heading") && el.getAttribute("data-suffix").indexOf("label") >= 0);
ok("找到带 \\label 的标题块", !!headBlk);
if (headBlk) {
  const part = headBlk.querySelector(".wys-edit");
  part.textContent = "改过的标题";
  const s = parseInt(headBlk.getAttribute("data-s"), 10), e = parseInt(headBlk.getAttribute("data-e"), 10);
  const now = T.wysDomToTex(part);
  const out = W.applyEdits(sample, [{ startLine: s, endLine: e, newText: W.headingTex({ prefix: headBlk.getAttribute("data-prefix") || "", suffix: headBlk.getAttribute("data-suffix") || "" }, now) }]);
  ok("标题文字已替换", out.indexOf("改过的标题") >= 0);
  /* v0.9.3：label 与命令前缀都从这一块自己的属性里取，不再写死 sec:method / \section */
  const HEAD_LABEL = (((headBlk.getAttribute("data-suffix") || "").match(/\\label\{[^}]*\}/) || [""])[0]);
  const HEAD_PREFIX = headBlk.getAttribute("data-prefix") || "";
  ok("\\label 保住（" + HEAD_LABEL + "）", HEAD_LABEL !== "" && out.indexOf(HEAD_LABEL) >= 0,
     out.split("\n").filter((l) => l.indexOf("改过的标题") >= 0).join(" | "));
  ok("标题命令前缀保住（" + HEAD_PREFIX + "）", HEAD_PREFIX !== "" && out.indexOf(HEAD_PREFIX + "改过的标题}") >= 0);
}

console.log("\n[6] XSS / HTML 注入防线：渲染出来的 HTML 里不得出现可执行标签");
const inj = T.wysRenderDoc(sample, renderMath) + T.wysInline("<img src=x onerror=alert(1)>", renderMath);
ok("无 <img onerror>", inj.indexOf("onerror") < 0 || inj.indexOf("&lt;img") >= 0);
ok("无 <script", inj.toLowerCase().indexOf("<script") < 0);


/* 公式环境的开头：用它判断「原子块里摆的是渲染结果还是源码」。
 * 原来定义在 [7] 段首，重写这一段时被一起删掉了 —— 门禁自己也得能被门禁跑。 */
const EQ_OPEN = "\\begin{equation}";
console.log("\n[7] v0.8.0：原子块 = 渲染结果 + 点一下就地编辑（不是卡片，也不是源码堆砌）");
const atoms = root.querySelectorAll(".wys-atomblk");
let eqAtom = null;
for (let ci = 0; ci < atoms.length; ci++) { if (atoms[ci].querySelector(".pv-eq")) { eqAtom = atoms[ci]; break; } }
ok("原子块里有富渲染出来的公式节点 .pv-eq", !!eqAtom);
ok("原子块外观就是渲染结果：正文里不再出现 LaTeX 源码字样",
  !!eqAtom && eqAtom.querySelector(".wys-atomblk-body").textContent.indexOf(EQ_OPEN) < 0,
  eqAtom ? eqAtom.querySelector(".wys-atomblk-body").textContent.slice(0, 80) : "");
ok("每个原子块都把自己那份 LaTeX 挂在 data-tex 上（就地编辑浮层靠它取源码）",
  Array.prototype.every.call(atoms, (el) => (el.getAttribute("data-tex") || "").length > 0),
  "有原子块缺 data-tex");
/* 注意别写成 ok(name, iife(), "")：那个 IIFE 返回的是**错误串**，
 * 空串是 falsy —— 于是「没差异」反而判红，且差异串被写死的 "" 吞掉。
 * 差异串要放到 extra 位置上。 */
const dtDiff = (function () {
  const byBid = {};
  for (const b of doc.blocks) byBid[String(b.id)] = String(b.raw == null ? "" : b.raw);
  for (let i = 0; i < atoms.length; i++) {
    const got = atoms[i].getAttribute("data-tex");
    const exp = byBid[atoms[i].getAttribute("data-bid")];
    if (got !== exp) return "bid=" + atoms[i].getAttribute("data-bid") + "\n        期望 " + JSON.stringify(exp) + "\n        实得 " + JSON.stringify(got);
  }
  return "";
})();
ok("data-tex 与块模型里的 raw 逐字节一致（浮层打开时不该看到被转义/截断的源码）", dtDiff === "", dtDiff);
let rebaseOk = true, rebaseBad = "";
for (let ci = 0; ci < atoms.length; ci++) {
  const atomLn = parseInt(atoms[ci].getAttribute("data-line"), 10);
  const inner = atoms[ci].querySelectorAll(".wys-atomblk-body [data-line]");
  for (let j = 0; j < inner.length; j++) {
    const v = parseInt(inner[j].getAttribute("data-line"), 10);
    if (!(v >= atomLn)) { rebaseOk = false; rebaseBad = "原子块 L" + atomLn + " 里出现 data-line=" + v; }
  }
}
ok("原子块内富渲染的 data-line 已平移成绝对行号（都 >= 原子块起始行）", rebaseOk, rebaseBad);

console.log("\n[7b] v0.8.0：拆掉「模式」—— 预览区就是文档，没有编辑/只读开关");
const editorSrc2 = fs.readFileSync(path.join(ws, "panels", "editor.tsx"), "utf8");
ok("不再有 wysOn / setWysOn（编辑不再是模式）",
  editorSrc2.indexOf("wysOn") < 0 && editorSrc2.indexOf("setWysOn") < 0);
ok("不再有「✏ 就地编辑 / 🔒 只读」这个开关按钮",
  editorSrc2.indexOf("\u270f \u5c31\u5730\u7f16\u8f91") < 0 && editorSrc2.indexOf("\U0001f512 \u53ea\u8bfb") < 0);
ok("点原子块走 mousedown 就地开编辑器（等 click 会先 blur → 整层重建 → 浮层失效）",
  editorSrc2.indexOf(".wys-atomblk") >= 0 && editorSrc2.indexOf("function openAtom") >= 0);
ok("就地编辑器是浮层（上：实时渲染 / 下：LaTeX 源码），不跳源码视图",
  editorSrc2.indexOf("wys-pop-pv") >= 0 && editorSrc2.indexOf("wys-pop-ta") >= 0);
ok("浮层提交仍走 applyEdits 且带写回自检（空编辑集逐字节还原 / 结果仍可解析）", (function () {
  const seg = funcText(editorSrc2, "commitAtom");
  return seg.indexOf("applyEdits") >= 0 && seg.indexOf("空编辑集未逐字节还原") >= 0 && seg.indexOf("parseDoc") >= 0;
})());

console.log("\n[8] v0.7.2：预览里的跳转不再偷换视图（源码依据检查）");
const editorSrc = fs.readFileSync(path.join(ws, "panels", "editor.tsx"), "utf8");
ok("gotoLine 里没有「预览就切分屏」的老逻辑",
  editorSrc.indexOf(String.fromCharCode(34) + "preview" + String.fromCharCode(34) + ") setView(" + String.fromCharCode(34) + "split" + String.fromCharCode(34) + ")") < 0);
ok("存在预览内定位实现 revealInPreview", editorSrc.indexOf("function revealInPreview(") >= 0);
ok("切视图只剩「显式定位」这一条路（gotoSourceAt）", editorSrc.indexOf("function gotoSourceAt(") >= 0);
console.log("\n" + "-".repeat(52));
console.log(fail === 0 ? "全部通过：" + pass + " 项" : "通过 " + pass + " 项，失败 " + fail + " 项");
process.exit(fail === 0 ? 0 : 1);
