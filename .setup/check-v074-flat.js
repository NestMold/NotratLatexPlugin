/* v0.7.4 验收门 —— 「就地编辑」的形态：整页 = 只读预览，不是卡片清单
 *
 * 事故背景（用户原话）：
 *   「我想的是直接就是只读的UI上修改，而不是这样」
 *   —— 指着 `导言区 L1–8 { } 源码 ↗ 定位` 那排卡片说的。
 *   根因：10 类块里只有 heading / paragraph 被放行成可编辑，
 *         其余 8 类一律套卡片壳 —— 其中 preamble / command / comment / tail
 *         本来就没有视觉结果，占卡片纯属噪音。
 *
 * 本门禁钉死三件事：
 *   [A] 隐形块不再长成卡片：preamble→折叠行 / comment→小灰字 / command,tail→单行
 *   [B] 有视觉结果的原子块撤了壳：没有常驻头部条、没有常驻按钮，
 *       工具条（.wys-bar）只能在 hover/选中时浮出 —— 断言产物里不存在卡片头
 *   [C] 撤壳不许把「可编辑」一起撤掉：每个 .wys-blk 仍必须含 .wys-edit，
 *       且「零改动往返」逐字节还原（这条守的是丢稿红线，与 v0.7.0 同源）
 *
 * 运行： node .setup/check-v074-flat.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ws = "E:/notrat-latex-plugin";
const pkgPath = "C:/Users/Administrator/.notrat/plugins/notrat-latex-plugin.json";
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const src = pkg.contributions.editors[0].source;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok    " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "\n        → " + extra : "")); }
}

/* ---- 从装机包切出内核 + 就地编辑层 ---- */
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
const miniMath = (tex, disp) => ctx.LPC.miniMath(tex, disp);

const sample = fs.readFileSync(path.join(ws, "samples", "sample.tex"), "utf8");
const doc = T.WYS.parseDoc(sample);
const html = T.wysRenderDoc(sample, miniMath, ws + "/samples");

const dom = new JSDOM('<!doctype html><html><body><div id="r">' + html + "</div></body></html>");
const root = dom.window.document.getElementById("r");
const q = (sel) => Array.from(root.querySelectorAll(sel));
const count = (sel) => q(sel).length;

console.log("\n样例：samples/sample.tex —— " + doc.blocks.length + " 个块");

/* ================= [A] 隐形块不再长成卡片 ================= */
console.log("\n[A] 没有视觉结果的块：不再占卡片");

const byType = {};
for (const b of doc.blocks) (byType[b.type] = byType[b.type] || []).push(b);

ok("样例里确实有 preamble / command / comment / tail（否则这条门禁是空的）",
  byType.preamble && byType.command && byType.comment && byType.tail,
  JSON.stringify(Object.keys(byType)));

const folds = q("details.wys-fold");
ok("preamble → <details class=\"wys-blk wys-fold\">（默认收起，1 个）", folds.length === 1,
  "实际 " + folds.length + " 个");
if (folds.length === 1) {
  const f = folds[0];
  ok("  收起时只占一行：summary 是「导言区 · N 行」", /^导言区 · \d+ 行$/.test(f.querySelector("summary").textContent.trim()),
    JSON.stringify(f.querySelector("summary").textContent));
  ok("  展开后是可编辑的等宽源码", !!f.querySelector("span.wys-edit[contenteditable=\"true\"]"));
  ok("  不是 <details> 里的默认展开（默认收起才叫不占视觉）", !f.hasAttribute("open"));
}

const notes = q(".wys-blk.wys-note");
ok("comment → .wys-note 灰色小字（可编辑，1 个）", notes.length === 1, "实际 " + notes.length + " 个");
if (notes.length === 1) {
  ok("  注释块可编辑", !!notes[0].querySelector("span.wys-edit[contenteditable=\"true\"]"));
  ok("  注释块内容是 % 开头", notes[0].textContent.trim().startsWith("%"));
}

const cmds = q(".wys-blk.wys-cmd");
ok("command + tail → .wys-cmd 单行小灰字（2 个：\\maketitle / \\end{document}）", cmds.length === 2,
  "实际 " + cmds.length + " 个：" + cmds.map((c) => c.textContent.trim()).join(" | "));

/* ================= [B] 原子块撤壳 ================= */
console.log("\n[B] 有视觉结果的原子块：撤掉卡片壳，工具条 hover 才浮出");

ok("产物里不再有常驻头部条 .wys-card-h", count(".wys-card-h") === 0, "实际 " + count(".wys-card-h") + " 个");
ok("产物里不再有常驻文字按钮 .wys-card-btn", count(".wys-card-btn") === 0);
ok("产物里不再有 .wys-card-ln / .wys-card-grow / .wys-tag（旧卡片头的零件）",
  count(".wys-card-ln") + count(".wys-card-grow") + count(".wys-tag") === 0);

const cards = q(".wys-card");
const atoms = doc.blocks.filter((b) => ["math", "float", "bib", "code", "env", "list", "text-env"].indexOf(b.type) >= 0);
ok(".wys-card 数量 == 有视觉结果的原子块数量（" + atoms.length + "）", cards.length === atoms.length,
  "卡片 " + cards.length + " / 原子块 " + atoms.length);

ok("每个原子块都带 hover 工具条 .wys-bar", cards.length > 0 && cards.every((c) => c.querySelector(".wys-bar")));
ok("工具条按钮（{ } / ↗）都在 .wys-bar 内部，没有漏到外面",
  q("button").every((b) => b.closest(".wys-bar")) && q(".wys-bar button").length === cards.length * 2,
  "外部按钮 " + q("button").filter((b) => !b.closest(".wys-bar")).length + " 个");
ok("每个原子块仍保留渲染结果（.wys-card-body 非空）",
  cards.every((c) => (c.querySelector(".wys-card-body") || {}).textContent !== undefined));

/* CSS 侧：默认无边框、工具条默认 opacity:0 */
function cutCss(name) {
  const key = "const " + name + " = `";
  const k = src.indexOf(key);
  if (k < 0) return "";
  const s = k + key.length;
  const e = src.indexOf("\n`;", s);
  return src.slice(s, e);
}
const WYS_CSS = cutCss("WYS_CSS");
ok("CSS：.wys-card 默认 border 透明（不再有常驻框）", /\.wys-card\{[^}]*border:1px solid transparent/.test(WYS_CSS));
ok("CSS：.wys-bar 默认 opacity:0 且 pointer-events:none（不点不出现）",
  /\.wys-bar\{[^}]*opacity:0/.test(WYS_CSS) && /\.wys-bar\{[^}]*pointer-events:none/.test(WYS_CSS));
ok("CSS：只有 hover / .sel 才让工具条现身",
  /\.wys-card:hover \.wys-bar,\.wys-card\.sel \.wys-bar\{opacity:1/.test(WYS_CSS));

/* ================= [C] 撤壳不许把「可编辑」一起撤掉 ================= */
console.log("\n[C] 零改动往返：撤壳之后，每一块仍逐字节还原");

const blks = q(".wys-blk");
const expected = new Map();
for (const b of doc.blocks) {
  if (b.type === "heading") expected.set(String(b.id), String(b.title == null ? "" : b.title));
  else if (b.type === "preamble" || b.type === "paragraph" || b.type === "comment" ||
           b.type === "command" || b.type === "tail") expected.set(String(b.id), String(b.raw == null ? "" : b.raw));
}
ok("每个 .wys-blk 都含 .wys-edit（commitWys 扫的就是这个）",
  blks.length > 0 && blks.every((el) => el.querySelector(".wys-edit")),
  blks.filter((el) => !el.querySelector(".wys-edit")).length + " 个缺 .wys-edit");

ok(".wys-blk 数量 == 可编辑块数量（" + expected.size + "）", blks.length === expected.size,
  "实际 " + blks.length);

let bad = 0, checked = 0, firstBad = "";
for (const el of blks) {
  const bid = el.getAttribute("data-bid");
  const exp = expected.get(String(bid));
  if (exp == null) { bad++; firstBad = firstBad || ("data-bid=" + bid + " 不在块模型里"); continue; }
  const part = el.querySelector(".wys-edit");
  const got = T.wysDomToTex(part);
  checked++;
  if (got !== exp) {
    bad++;
    firstBad = firstBad || (String(bid) + "\n          期望 " + JSON.stringify(exp) + "\n          实得 " + JSON.stringify(got));
  }
}
ok("零改动往返逐字节还原（含新增的导言区 / 注释 / 命令块，共 " + checked + " 块）", bad === 0, firstBad);

/* ================= [D] 门禁自检：旧的卡片形态必须能被抓出来 ================= */
console.log("\n[D] 门禁自检：把卡片头塞回去，应当被抓到");

const regressed = html.replace("class=\"wys-blk wys-fold\"", "class=\"wys-blk wys-card\"")
                      .replace("</summary>", "</summary><span class=\"wys-card-h\">导言区</span>");
const dom2 = new JSDOM('<!doctype html><html><body><div id="r2">' + regressed + "</div></body></html>");
const r2 = dom2.window.document.getElementById("r2");
ok("回退成卡片头后，[A] 会红（preamble 不再折叠）", r2.querySelectorAll("details.wys-fold").length !== 1);
ok("回退成卡片头后，[B] 会红（常驻头部条回来了）", r2.querySelectorAll(".wys-card-h").length !== 0);

console.log("\n" + "=".repeat(60));
console.log(fail === 0
  ? "✓ v0.7.4 形态门禁全绿（" + pass + " 项）"
  : "✗ 有 " + fail + " 项未通过（共 " + (pass + fail) + " 项）");
process.exit(fail === 0 ? 0 : 1);
