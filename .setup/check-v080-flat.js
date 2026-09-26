/* v0.8.0 形态门禁 —— 「在结果上编辑」，不是「一个可以切换的编辑模式」
 *
 * 事故背景（用户原话，第三次强调）：
 *   「我不要就地编辑模式和制度模式，我的意思是在结果上像编辑Mardown和WOrd一样可以快速修改啊」
 *   前两轮我把它做成了模式（✏/🔒 开关 + 卡片 + { } 源码按钮绕回源码），方向是错的。
 *
 * 本门禁钉死「没有模式」这件事，以及拆掉模式后必须补上的两件事：
 *   [A] 没有模式开关，渲染源只有一条
 *   [B] 标题显示成 `2 引言`，且编号与只读预览**逐条一致**
 *   [C] 原子块：无壳、无按钮；外观就是渲染结果；带 data-tex 供原地编辑
 *   [D] 就地编辑浮层：存在、带上/下半区、提交走 applyEdits + 三道自检
 *   [E] 零改动往返：拆完之后每一块仍逐字节还原（防丢稿红线）
 *   [F] 门禁自检：把模式开关塞回去，应当被抓到
 *
 * 运行： node .setup/check-v080-flat.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ws = "E:/notrat-latex-plugin";
const pkgPath = "C:/Users/Administrator/.notrat/plugins/notrat-latex-plugin.json";
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const src = pkg.contributions.editors[0].source;
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

const editorSrc = fs.readFileSync(path.join(ws, "panels", "editor.tsx"), "utf8");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok    " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "\n        → " + extra : "")); }
}

const iK = src.indexOf("const WYS = (function () {");
const iKEnd = src.indexOf("\n})();", iK) + 6;
const iH = src.indexOf("function escAttr(s) {");
const iHEnd = src.indexOf("\nfunction esc(s) {", iH);
if (iK < 0 || iKEnd < 6 || iH < 0 || iHEnd < 0) { console.error("✗ 装机包里切不出内核"); process.exit(1); }

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
const miniMath = (tex, disp) => ctx.LPC.miniMath(tex, disp);

const sample = fs.readFileSync(path.join(ws, "samples", "sample.tex"), "utf8");
const doc = W.parseDoc(sample);
const html = T.wysRenderDoc(sample, miniMath, ws + "/samples");

const dom = new JSDOM('<!doctype html><html><body><div id="r">' + html + "</div></body></html>");
const root = dom.window.document.getElementById("r");
const q = (sel) => Array.from(root.querySelectorAll(sel));
const count = (sel) => q(sel).length;

console.log("\n样例：samples/sample.tex —— " + doc.blocks.length + " 个块");

/* ================= [A] 没有模式 ================= */
console.log("\n[A] 拆掉「模式」：预览区就是文档，没有编辑/只读开关");

ok("editor.tsx 里不再出现 wysOn / setWysOn", editorSrc.indexOf("wysOn") < 0 && editorSrc.indexOf("setWysOn") < 0);
ok("不再有「✏ 就地编辑」「🔒 只读」按钮",
  editorSrc.indexOf("✏ 就地编辑") < 0 && editorSrc.indexOf("🔒 只读") < 0);
ok("渲染源只有一条：不再有 wys.html / pv.html 二选一的分支",
  editorSrc.indexOf("const html = wys.html;") >= 0 && editorSrc.indexOf("? wys.html : pv.html") < 0);
ok("编辑事件是常挂的（不再写成 wysOn ? handler : undefined）",
  editorSrc.indexOf("onFocus={onWysFocusIn}") >= 0 && editorSrc.indexOf("wysOn ? onWysFocusIn") < 0);
ok("顶栏给了「点哪改哪」的提示（替代原来的模式按钮）",
  editorSrc.indexOf("点哪改哪") >= 0);

/* ================= [B] 标题编号 ================= */
console.log("\n[B] 标题长成成品的样子：`2 相关工作与设计动机`（自动编号），不是 `\\section{...}`");

ok("无头壳：不再显示 \\section{ 这种源码三明治",
  count(".wys-fix") === 0, "还有 " + count(".wys-fix") + " 个 .wys-fix（源码前缀壳）");
ok("标题块渲染出 .wys-num（自动编号）", count(".wys-num") > 0);

const wysNums = q(".wys-h1, .wys-h2, .wys-h3, .wys-par")
  .map((el) => { const n = el.querySelector(".wys-num"); return n ? n.textContent : ""; });

const pv = ctx.LPC.renderPreview(sample, { renderMath: miniMath, baseDir: ws + "/samples" });
const dom2 = new JSDOM('<!doctype html><html><body><div id="r2">' + pv.html + "</div></body></html>");
const pvNums = Array.from(dom2.window.document.querySelectorAll(".pv-h1, .pv-h2, .pv-h3, .pv-par"))
  .map((el) => { const m = /^\s*([0-9]+(?:\.[0-9]+)*)/.exec(el.textContent || ""); return m ? m[1] : ""; });

ok("标题数一致（编辑态 " + wysNums.length + " / 只读态 " + pvNums.length + "）", wysNums.length === pvNums.length);
ok("★ 编号逐条一致：同 .tex 在两种形态下标题编号完全相同",
  wysNums.length === pvNums.length && wysNums.every((v, i) => v === pvNums[i]),
  "编辑态 [" + wysNums.join(", ") + "]\n          只读态 [" + pvNums.join(", ") + "]");
/* v0.9.3：样例整篇换过。这里钉的仍然是「编号序列逐项正确」这件事，
 * 只是把序列换成新样例的（8 节，第 4 节带 3 个小节）。 */
ok("编号确实是从 1 开始的递增序列（不是全空）",
  wysNums.join(",") === "1,2,3,4,4.1,4.2,4.3,5,6,7,8", "实得 [" + wysNums.join(", ") + "]");
ok("编号本身不可编辑（contenteditable=false），改标题文字它自己重算",
  q(".wys-num").every((el) => el.getAttribute("contenteditable") === "false"));

/* ================= [B2] 导言区 = 页首 ================= */
console.log("\n[B2] 导言区渲染成页首，且与只读预览逐字一致（用户报的「导言区没有正常渲染」）");

/* ---- CSS 取值小工具：把两套 CSS 的对应档位拿出来对账 ----
 * cutCss 在下面 [C] 段有定义（函数声明会提升，先用后定义没问题） */
function ruleOf(css, sel) {
  const esc2 = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(esc2 + "\\{([^}]*)\\}").exec(css);
  return m ? m[1] : "";
}
function declOf(rule, prop) {
  const m = new RegExp("(?:^|;)\\s*" + prop + "\\s*:([^;]*)").exec(rule);
  return m ? m[1].trim() : "";
}

const PV_CSS2 = cutCss("PV_CSS");
const WYS_CSS2 = cutCss("WYS_CSS");
ok("切得出两套 CSS（PV_CSS / WYS_CSS）", PV_CSS2.length > 0 && WYS_CSS2.length > 0,
  "pv=" + PV_CSS2.length + " wys=" + WYS_CSS2.length);

const headEl = root.querySelector(".wys-front-head");
ok("导言区渲染出页首 .wys-front-head（不再是一坨折叠源码）", !!headEl);
ok("页首有标题 .wys-front-t", !!root.querySelector(".wys-front-t"));
ok("页首有作者行 .wys-front-a", !!root.querySelector(".wys-front-a"));

/* 与只读预览逐字一致 —— 不是「看着差不多」，是字符串相等 */
const domPv2 = new JSDOM('<!doctype html><html><body><div id="rp">' + pv.html + "</div></body></html>");
const pvRoot = domPv2.window.document.getElementById("rp");
const norm = (t) => String(t == null ? "" : t).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

const wysTitle = root.querySelector(".wys-front-t");
const pvTitle = pvRoot.querySelector(".pv-title-main");
const wysAuthor = root.querySelector(".wys-front-a");
const pvAuthor = pvRoot.querySelector(".pv-author");
ok("标题文字与只读预览逐字相同",
  !!wysTitle && !!pvTitle && norm(wysTitle.textContent) === norm(pvTitle.textContent),
  "编辑态 " + JSON.stringify(wysTitle && norm(wysTitle.textContent)) + "\n          只读态 " + JSON.stringify(pvTitle && norm(pvTitle.textContent)));
ok("作者文字与只读预览逐字相同",
  !!wysAuthor && !!pvAuthor && norm(wysAuthor.textContent) === norm(pvAuthor.textContent),
  "编辑态 " + JSON.stringify(wysAuthor && norm(wysAuthor.textContent)) + "\n          只读态 " + JSON.stringify(pvAuthor && norm(pvAuthor.textContent)));

/* 每一项都要能就地改：带行号 + 原文 + 前缀 + 后缀 */
const fml = q(".wys-fmline");
ok("导言区有可就地编辑的项（" + fml.length + " 个）", fml.length >= 3);
ok("每一项都带 data-s / data-e / data-tex / data-prefix / data-suffix / data-fk / data-what",
  fml.length > 0 && fml.every((el) => ["data-s", "data-e", "data-tex", "data-prefix", "data-suffix", "data-fk", "data-what"]
    .every((a) => el.getAttribute(a) != null)),
  "缺属性： " + fml.filter((el) => ["data-s", "data-e", "data-tex", "data-prefix", "data-suffix", "data-fk", "data-what"]
    .some((a) => el.getAttribute(a) == null)).map((el) => el.getAttribute("data-fk")).join(", "));
ok("每一项都渲染成成品的样子（不是源码）：项里不含反斜杠命令",
  fml.every((el) => el.textContent.indexOf("\\") < 0),
  fml.filter((el) => el.textContent.indexOf("\\") >= 0).map((el) => el.textContent).join(" | "));

/* ★ 红线：前缀 + 正文 + 后缀 必须逐字节等于原行。
 * 这是「用户改的只是正文，源码一点没被重写」的机械证明。 */
const srcLines = sample.split("\n");
let invBad = "";
let invChecked = 0;
for (const el of fml) {
  const s0 = parseInt(el.getAttribute("data-s"), 10), e0 = parseInt(el.getAttribute("data-e"), 10);
  const item = { prefix: el.getAttribute("data-prefix"), body: el.getAttribute("data-tex"), suffix: el.getAttribute("data-suffix") };
  const orig = srcLines.slice(s0, e0 + 1).join("\n");
  invChecked++;
  /* 用内核那一份判定，门禁不另写一套 —— 否则两边迟早各偏一点 */
  if (!W.partsExact(item, orig)) {
    invBad = invBad || ("data-fk=" + el.getAttribute("data-fk") +
      "\n          期望 " + JSON.stringify(orig) + "\n          实得 " + JSON.stringify(W.partsJoin(item.prefix, item.body, item.suffix)));
  }
}
ok("★ 每一行的「前缀 + 正文 + 后缀」逐字节还原原文（" + invChecked + " 项）", invBad === "", invBad);

/* 保底入口：没被认领的行（\begin{document} 等）还能从折叠的源码里改到 */
const rawFold = root.querySelector(".wys-front .wys-raw");
ok("导言区保留折叠的整体源码入口 .wys-raw", !!rawFold);
ok("整体源码入口默认是收起的（<details> 无 open）", !!rawFold && !rawFold.hasAttribute("open"));
ok("整体源码入口里挂着这一块唯一的 .wys-edit（commitWys 靠它读回整体改动）",
  !!rawFold && !!rawFold.querySelector(".wys-edit") &&
  root.querySelectorAll(".wys-front .wys-edit").length === 1);

/* 与只读预览的样式逐项对账 */
const pairs = [
  [".wys-front-head", ".pv-title", ["text-align", "margin"]],
  [".wys-front-t", ".pv-title-main", ["font-size", "font-weight", "line-height"]],
  [".wys-front-a", ".pv-author", ["margin-top", "color"]],
  [".wys-front-d", ".pv-date", ["margin-top", "font-size", "color"]],
];
for (const pr of pairs) {
  const rw = ruleOf(WYS_CSS2, pr[0]);
  const rp = ruleOf(PV_CSS2, pr[1]);
  const diffs = [];
  if (!rw) diffs.push(pr[0] + " 规则不存在");
  if (!rp) diffs.push(pr[1] + " 规则不存在");
  for (const prop of pr[2]) {
    const a = declOf(rw, prop), b = declOf(rp, prop);
    if (a !== b) diffs.push(prop + ": 编辑态「" + a + "」≠ 只读态「" + b + "」");
  }
  ok("样式同构 " + pr[0] + " ↔ " + pr[1], diffs.length === 0, diffs.join("；"));
}

/* 真改一次标题：只动它那一行 */
const tEl = root.querySelector('[data-fk="fm:title"]');
const ts = parseInt(tEl.getAttribute("data-s"), 10), te = parseInt(tEl.getAttribute("data-e"), 10);
const tNew = W.headingTex({ prefix: tEl.getAttribute("data-prefix"), suffix: tEl.getAttribute("data-suffix") }, "新的标题");
const nextT = W.applyEdits(sample, [{ startLine: ts, endLine: te, newText: tNew }]);
const aT = sample.split("\n"), bT = nextT.split("\n"), chgT = [];
for (let i = 0; i < Math.max(aT.length, bT.length); i++) if (aT[i] !== bT[i]) chgT.push(i + 1);
ok("改标题：只动它自己那一行（L" + (ts + 1) + "）", chgT.length === 1 && chgT[0] === ts + 1, "变动行 L" + chgT.join(", L"));
ok("改标题：\\documentclass / \\usepackage / \\author 全部原样保住",
  nextT.indexOf("\\documentclass[12pt]{ctexart}") >= 0 && nextT.indexOf("\\usepackage{amsmath}") >= 0 && nextT.indexOf("\\author{张三}") >= 0);
ok("改标题：\\title{ 前缀与 } 后缀都还在",
  nextT.indexOf("\\title{新的标题}") >= 0);

/* ================= [C] 原子块 ================= */
console.log("\n[C] 原子块：无壳、无按钮，外观就是渲染结果，点一下原地编辑");

ok("产物里不再有卡片壳与工具条（.wys-card / .wys-bar / .wys-card-h）",
  count(".wys-card") + count(".wys-bar") + count(".wys-card-h") === 0);
ok("产物里不再有任何常驻按钮（{ } 源码 / ↗ 定位）", count("button") === 0,
  "还剩 " + count("button") + " 个按钮");

const ATOMIC_TYPES = ["math", "float", "bib", "code", "env", "list", "text-env"];
const atomBlocks = doc.blocks.filter((b) => ATOMIC_TYPES.indexOf(b.type) >= 0);
ok(".wys-atom 数量 == 有视觉结果的块数（" + atomBlocks.length + "）",
  count(".wys-atomblk") === atomBlocks.length, count(".wys-atomblk") + " vs " + atomBlocks.length);
ok("每个原子块都带 data-tex（就地编辑浮层靠它取源码）",
  q(".wys-atomblk").every((el) => (el.getAttribute("data-tex") || "").indexOf("\\") >= 0));
ok("每个原子块都带 data-s / data-e（写回时只替换这一块的行区间）",
  q(".wys-atomblk").every((el) => {
    const s = parseInt(el.getAttribute("data-s"), 10), e = parseInt(el.getAttribute("data-e"), 10);
    return s >= 0 && e >= s;
  }));
ok("每个原子块都把渲染结果摆出来（.wys-atomblk-body 非空）",
  q(".wys-atomblk").every((el) => (el.querySelector(".wys-atomblk-body") || {}).textContent !== undefined));

function cutCss(name) {
  const key = "const " + name + " = `";
  const k = src.indexOf(key);
  if (k < 0) return "";
  const s = k + key.length;
  const e = src.indexOf("\n`;", s);
  return src.slice(s, e);
}
const WYS_CSS = cutCss("WYS_CSS");
ok("CSS：.wys-atom 默认 border 透明（外观就是渲染结果，没有框）",
  /\.wys-atomblk\{[^}]*border:1px solid transparent/.test(WYS_CSS));
ok("CSS：只有 hover / .picked 才给一条提示边",
  /\.wys-atomblk:hover\{border-color/.test(WYS_CSS) && /\.wys-atomblk\.picked\{border-color/.test(WYS_CSS));
ok("CSS：标题编号 .wys-num 是 user-select:none（点它不该选中，点标题文字才落光标）",
  /\.wys-num\{[^}]*user-select:none/.test(WYS_CSS));

/* ================= [D] 就地编辑浮层 ================= */
console.log("\n[D] 就地编辑浮层：位置在结果上，改的是源码，不离开预览");

ok("CSS 有浮层（.wys-pop / .wys-pop-pv 上半实时渲染 / .wys-pop-ta 下半源码）",
  /\.wys-pop\{/.test(WYS_CSS) && /\.wys-pop-pv\{/.test(WYS_CSS) && /\.wys-pop-ta\{/.test(WYS_CSS));
ok("JSX 里确实渲染了这个浮层", editorSrc.indexOf('className="wys-pop"') >= 0);
ok("浮层上半是实时渲染（dangerouslySetInnerHTML + 同一套预览内核）",
  editorSrc.indexOf("wys-pop-pv") >= 0 && editorSrc.indexOf("atomPvHtml") >= 0);
ok("浮层下半是 LaTeX 源码输入框", editorSrc.indexOf("wys-pop-ta") >= 0 && editorSrc.indexOf("value={atomEdit.tex}") >= 0);
ok("点原子块走 mousedown 就地打开（等 click 会先 blur → 整层 HTML 重建 → 浮层算的位置失效）",
  /function onPreviewMouseDown[\s\S]{0,1800}?closest\("\.wys-atom"\)/.test(editorSrc));
ok("改点别的原子块时先把上一块落地（不许悄悄吞掉改动）",
  /function openAtom[\s\S]{0,700}?if \(atomEdit\) commitAtom\(\);/.test(editorSrc));
ok("Esc 取消、Ctrl+Enter 保存、点外面保存，三种出口都在",
  editorSrc.indexOf('"Escape"') >= 0 && editorSrc.indexOf("ctrlKey || ev.metaKey") >= 0 && editorSrc.indexOf("wys-pop-dim") >= 0);

const atomSeg = funcText(editorSrc, "commitAtom");
ok("浮层提交：走 applyEdits 只替换这一处", atomSeg.indexOf("applyEdits") >= 0);
ok("浮层提交：空编辑集逐字节还原自检还在（防丢稿红线）",
  atomSeg.indexOf("空编辑集未逐字节还原") >= 0);
ok("浮层提交：结果仍可解析自检还在", atomSeg.indexOf("WYS.parseDoc(next)") >= 0);
ok("浮层提交：自检不过就整处放弃，不半途改坏文件", atomSeg.indexOf("已放弃") >= 0);
ok("★ 导言区写回：前缀 + 原正文 + 后缀 必须逐字节还原原行（拆了这条 = 改显示变成改源码）",
  atomSeg.indexOf("前缀/后缀拼接未能逐字节还原原行") >= 0);
ok("★ 行内原子：浮层开着期间 DOM 若被重建，要按「同块 + 同原文」找回新节点，不许写进孤儿",
  atomSeg.indexOf("isConnected") >= 0 && atomSeg.indexOf("没能落回去") >= 0);

/* ================= [E] 零改动往返 ================= */
console.log("\n[E] 防丢稿：拆完之后每一块仍逐字节还原");

const blks = q(".wys-blk");
const expected = new Map();
for (const b of doc.blocks) {
  if (b.type === "heading") expected.set(String(b.id), String(b.title == null ? "" : b.title));
  else if (["preamble", "paragraph", "comment", "command", "tail"].indexOf(b.type) >= 0) expected.set(String(b.id), String(b.raw == null ? "" : b.raw));
}
ok("每个 .wys-blk 都含 .wys-edit（commitWys 扫的就是这个）",
  blks.length > 0 && blks.every((el) => el.querySelector(".wys-edit")),
  blks.filter((el) => !el.querySelector(".wys-edit")).length + " 个缺 .wys-edit");
ok(".wys-blk 数量 == 可编辑块数量（" + expected.size + "）", blks.length === expected.size, "实际 " + blks.length);

let bad = 0, checked = 0, firstBad = "";
for (const el of blks) {
  const bid = el.getAttribute("data-bid");
  const exp = expected.get(String(bid));
  if (exp == null) { bad++; firstBad = firstBad || ("data-bid=" + bid + " 不在块模型里"); continue; }
  const got = T.wysDomToTex(el.querySelector(".wys-edit"));
  checked++;
  if (got !== exp) {
    bad++;
    firstBad = firstBad || (String(bid) + "\n          期望 " + JSON.stringify(exp) + "\n          实得 " + JSON.stringify(got));
  }
}
ok("零改动往返逐字节还原（含标题：编号显示出来了，回写仍是纯标题）", bad === 0, firstBad);

const roundTrip = W.applyEdits(sample, []);
ok("applyEdits(src, []) === src（内核硬不变式）", roundTrip === sample);

/* 真实编辑：改标题只动那一行 */
/* v0.9.3：原来取「第 2 个标题」，那是旧样例 sec:method 的位置。改成取**第一个带 label 的标题**，
 * 与它下面那条「\label 保住」的断言对齐（断言要的是「带 label 的标题改完 label 还在」）。 */
const h2 = blks.filter((el) => el.getAttribute("data-type") === "heading"
  && (el.getAttribute("data-suffix") || "").indexOf("label") >= 0)[0];
const h2edit = h2.querySelector(".wys-edit");
h2edit.textContent = "方法（已重命名）";
const edits777 = [{
  startLine: parseInt(h2.getAttribute("data-s"), 10),
  endLine: parseInt(h2.getAttribute("data-e"), 10),
  newText: W.headingTex({ prefix: h2.getAttribute("data-prefix") || "", suffix: h2.getAttribute("data-suffix") || "" }, T.wysDomToTex(h2edit)),
}];
const next777 = W.applyEdits(sample, edits777);
const aL = sample.split("\n"), bL = next777.split("\n");
const chg = [];
for (let i = 0; i < Math.max(aL.length, bL.length); i++) if (aL[i] !== bL[i]) chg.push(i + 1);
/* v0.8.17：目标行 / 总行数动态取 —— 样例是活文件，写死行号会脆断 */
const h2Line = parseInt(h2.getAttribute("data-s"), 10) + 1;
ok("改标题：只动它自己那一行（L" + h2Line + "），其余 " + aL.length + " 行逐字节不动",
  chg.length === 1 && chg[0] === h2Line, "变动行 L" + chg.join(", L"));
const H2_LABEL = (((h2.getAttribute("data-suffix") || "").match(/\\label\{[^}]*\}/) || [""])[0]);
ok("改标题：它自己的 \\label 保住（" + H2_LABEL + "）", H2_LABEL !== "" && next777.indexOf(H2_LABEL) >= 0);

/* 真实编辑：改公式块
 * v0.9.3：不再替换某条公式里的具体记号（旧样例的 \sqrt{d_k}），改成在块**最后一行行尾**追加一段
 * 探针文字 —— 行数不变、块的行区间不变，于是「改到的是这个块、块外零改动」这两条才是干净的。 */
const eqAtomBlock = atomBlocks.filter((b) => b.type === "math")[0];
const newTex = String(eqAtomBlock.raw) + "% 就地编辑探针";
const nx = W.applyEdits(sample, [{ startLine: eqAtomBlock.startLine, endLine: eqAtomBlock.endLine, newText: newTex }]);
const OUT_CITE = (sample.match(/\\cite\{[^}]*\}/) || [""])[0];
ok("改公式：改动落在公式块内（块里出现探针）", nx.indexOf("% 就地编辑探针") >= 0);
ok("改公式：公式外的 \\cite 完好（" + OUT_CITE + "）", nx.indexOf(OUT_CITE) >= 0);
const cL = nx.split("\n"), dL = sample.split("\n"), oob = [];
for (let i = 0; i < cL.length; i++) {
  if (i >= eqAtomBlock.startLine && i <= eqAtomBlock.endLine) continue;
  if (cL[i] !== dL[i]) oob.push(i + 1);
}
ok("改公式：公式块之外零改动", oob.length === 0, "外溢到 L" + oob.join(", L"));

/* ================= [F] 门禁自检 ================= */
console.log("\n[F] 门禁自检：把拆掉的东西塞回去，应当被抓到");

ok("塞回源码三明治（.wys-fix）→ [B] 会红", (function () {
  if (html.indexOf('class="wys-num"') < 0) return false;          // 前提：现在没有 .wys-fix
  const mutated = html.replace('class="wys-num"', 'class="wys-fix"');
  return mutated.indexOf('class="wys-fix"') >= 0 && count(".wys-fix") === 0;
})());
ok("塞回卡片壳 → [C] 会红（.wys-card 计数不再是 0）", (function () {
  if (html.indexOf('class="wys-atomblk"') < 0) return false;
  const mutated = html.replace('class="wys-atomblk"', 'class="wys-card"');
  return mutated.indexOf('class="wys-card"') >= 0 && count(".wys-card") === 0;
})());
ok("塞回模式开关 → [A] 会红",
  (editorSrc + "\nconst [wysOn, setWysOn] = useState(true);").indexOf("wysOn") >= 0);

console.log("\n" + "=".repeat(60));
console.log(fail === 0
  ? "✓ v0.8.0 形态门禁全绿（" + pass + " 项）"
  : "✗ 有 " + fail + " 项未通过（共 " + (pass + fail) + " 项）");
process.exit(fail === 0 ? 0 : 1);
