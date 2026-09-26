/* 层 [18] —— 「刚输入就撤销说没有内容可以撤销」：块外的字（v0.8.20 加）
 *
 * 用户原话：「还是不行，刚输入就撤销说没有内容可以撤销」
 *
 * 这一层为什么必须存在（前面几层为什么没能拦住它）：
 *   · _test-v0817-typing-undo.js 是**把逻辑抄一遍**跑（domTex 字符串代替 DOM）—— 抄错了照样绿；
 *   · _probe-undo.body.js（v0.8.18 那层）跑的是真组件，但块树是**手搓的假树**：
 *     只有 paragraph、文本就是 b.raw、没有原子（\cite → [1]）、没有标题、没有导言区、
 *     更没有「块外」——于是只有「在正文块里打字」这一种姿势被测到，
 *     而用户那一下恰恰是另一种姿势：**光标停在块外**（块与块之间的空隙 / 正文之后的留白 /
 *     页首那些只读渲染），敲的字块模型看不见 —— 撤销链里一条都没有。
 *   这一层把 wys 渲染出的真 HTML 交给 jsdom 真解析，用真节点当块树（原子 / 标题 / 编号 /
 *   块外空隙全是真的），并且多一个 __probe 出口能直接读那条历史 —— 于是「哪一下落进了
 *   没有记录的地方」一眼可见，不用靠想象。
 *
 * 跑法： node .setup/check-v0820-orphan.js
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const WS = path.join(__dirname, "..");
const DEPLOYED = "C:/Users/Administrator/.notrat/plugins/notrat-latex-plugin.json";
let fail = 0;
function ok(name, cond, extra) {
  if (cond) console.log("  ok    " + name);
  else { fail++; console.log("  FAIL  " + name + (extra !== undefined ? "\n        → " + extra : "")); }
}

/* ---------- 1. 行为级：真组件 + jsdom 真 DOM ----------
 * 组合法：_mkprobe-undo.js（harness 复用 + __probe 注入）→ 生成 _probe-undo-real.js → 跑 */
console.log("── 行为级：真组件 + 真 DOM（jsdom 解析 wys 产物）──");
const mk = spawnSync(process.execPath, [path.join(__dirname, "_mkprobe-undo.js")], { stdio: "inherit", cwd: WS });
if (mk.status !== 0) { console.log("  ✗ 探针组装失败"); fail++; }
else {
  const r = spawnSync(process.execPath, [path.join(__dirname, "_probe-undo-real.js")], { stdio: "inherit", cwd: WS });
  if (r.status !== 0) { fail++; console.log("  ✗ 行为级探针有红项（见上）"); }
}

/* ---------- 2. 源码指纹：这几件不许被改回去 ---------- */
console.log("\n── 源码指纹（逻辑不许回退）──");
let src = "";
try { src = fs.readFileSync(path.join(WS, "panels", "editor.tsx"), "utf8"); }
catch (e) { ok("editor.tsx 可读", false, e.message); }
if (src) {
  const marks = [
    ["块外字认得出（wysOrphanNodes）", "function wysOrphanNodes(root) {"],
    ["块外字收得住（wysFoldOrphans）", "function wysFoldOrphans(root) {"],
    ["落点算式是纯函数（可单测）", "function wysPickNearestBlock(cands, y) {"],
    ["类名按 token 精确比（indexOf 会误吞 wys-editroot）", 'list.indexOf(" " + k + " ") >= 0'],
    ["折叠收容集只含正文段落", "const WYS_FOLD_BLOCK = { paragraph: 1 };"],
    ["光标落点集含段落与标题", "const WYS_CARET_BLOCK = { paragraph: 1, heading: 1 };"],
    ["commitWys 落盘前先收块外字", "const folded = wysFoldOrphans(root);"],
    ["收了多少处要说给用户听", "处字原先落在正文块外，已并进最近的正文块"],
    ["点空白处把光标送进最近的正文块", "function caretToNearest(y) {"],
    ["点正文里不抢（划词引用要用）", 'if (t.closest(".wys-edit")) return;'],
    ["拿不到坐标就不抢这次点击", "if (!caretToNearest(e.clientY)) return;"],
    ["页首只读渲染区关掉可编辑性", 'class="wys-front-head" contenteditable="false"'],
    ["撤销撤不动时分清「没有历史」与「字不在块里」", "不在任何正文块里"],
  ];
  for (const [name, s2] of marks) ok(name, src.includes(s2));
  /* 反向断言：v1 自己踩过的坑不许回来 */
  ok("反面：类名判定不许再用 indexOf（会命中 wys-editroot）", !/has\("wys-edit"\)/.test(src) || src.indexOf("return cn.indexOf(k) >= 0") < 0);
  ok("反面：块外字不许被静默忽略（commitWys 里必须有折叠这一步）",
    src.indexOf("const folded = wysFoldOrphans(root);") < src.indexOf("const edits = [];"));
}

/* ---------- 3. 装机产物核对：发布出去的那份必须有这一改 ---------- */
console.log("\n── 装机产物核对 ──");
let prod = "";
try {
  const j = JSON.parse(fs.readFileSync(DEPLOYED, "utf8"));
  prod = String(j.contributions.editors[0].source || "").replace(/\r\n/g, "\n");
  console.log("  产物版本：" + j.version + "   编辑器源码长度：" + prod.length);
} catch (e) { ok("装机产物可读", false, e.message); }
if (prod) {
  const marks = [
    ["wysFoldOrphans 在产物里", "function wysFoldOrphans(root) {"],
    ["wysOrphanNodes 在产物里", "function wysOrphanNodes(root) {"],
    ["wysPickNearestBlock 在产物里", "function wysPickNearestBlock(cands, y) {"],
    ["caretToNearest 在产物里", "function caretToNearest(y) {"],
    ["块外字折叠接进了 commitWys", "const folded = wysFoldOrphans(root);"],
    ["光标落点集在产物里", "const WYS_CARET_BLOCK = { paragraph: 1, heading: 1 };"],
    ["页首只读渲染区关掉可编辑性", 'contenteditable="false">\';'],
    ["撤销提示已分清两种「撤不动」", "不在任何正文块里"],
  ];
  for (const [name, s3] of marks) ok(name, prod.includes(s3));
  ok("反面：产物里不许还留着「类名 indexOf 命中 wys-editroot」那版",
    prod.indexOf("if (typeof cn === \"string\") return cn.indexOf(k) >= 0;") < 0);
}

console.log("\n" + "=".repeat(64));
console.log(fail ? "✗ 这一层有 " + fail + " 项未通过" : "✓ 块外的字：认得 / 收得住 / 落点算得准（行为级 + 指纹 + 产物）");
process.exit(fail ? 1 : 0);
