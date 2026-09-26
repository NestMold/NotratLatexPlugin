/* 层 [16] —— 撤销历史：打完字撤得动 / 切档不丢 / 外部改动不清栈（v0.8.18 加）
 *
 * 用户原话：「我输入了内容再撤回，提示我预览档没有撤回的」
 *
 * 为什么这一层必须是**行为级**（真渲染 + 真派发事件），而不是源码字符串断言：
 *   v0.8.17 已经在「模拟组件状态」的层面证明过「打字后 Ctrl+Z 有东西可撤」，
 *   那份模拟是绿的；可真机上一条最平常的路径（打完字去源码档看一眼再切回来）
 *   会把历史整条清掉 —— 模拟里没有「切档重挂」这一段，所以它测不到。
 *   于是这里跑真组件：装假块树 → 派发 focus / keydown / blur → 读 toast 与落盘源码。
 *
 * 七条场景：
 *   1 打字 → Ctrl+Z                      （v0.8.17 的承诺：撤掉的正是刚打的字）
 *   2 打字 → 失焦提交 → Ctrl+Z
 *   3 打字 → 切源码档再切回 → Ctrl+Z      （预览层卸载重挂 → __latexHtml 归零）
 *   4 打字 → 宿主在别的块上改一处 → Ctrl+Z（外部改动走 rebase：不清栈、外部改动保住）
 *   5 点进去但没敲字 → Ctrl+Z             （不许凭空多撤）
 *   6 撤到底再 Ctrl+Z                     （说「到底了」，不是「这一档没得撤」）
 *   7 打字 → 切走主区标签（组件被宿主卸载）再回来 → Ctrl+Z（历史留在模块级，活过重挂）
 *
 * 运行： node .setup/check-v0818-undo.js
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const DIR = __dirname;
const WS = path.join(DIR, "..");
const DEPLOYED = "C:/Users/Administrator/.notrat/plugins/notrat-latex-plugin.json";
let fail = 0;
function ok(name, cond, extra) {
  if (cond) console.log("  ok    " + name);
  else { fail++; console.log("  FAIL  " + name + (extra !== undefined ? "\n        → " + extra : "")); }
}

/* ---------- 组合：test-nav.js 的 harness 头 + 场景探针 ---------- */
const nav = fs.readFileSync(path.join(DIR, "test-nav.js"), "utf8");
const cut = nav.indexOf("\n(async function ()");
if (cut < 0) {
  console.error("✗ test-nav.js 结构变了：找不到 IIFE 起点 —— harness 复用不了（先修这一层）");
  process.exit(1);
}
const body = fs.readFileSync(path.join(DIR, "_probe-undo.body.js"), "utf8");
const tmp = path.join(DIR, "_tmp-check-v0818.js");
fs.writeFileSync(tmp, nav.slice(0, cut) + "\n/* ---------- 探针 ---------- */\n" + body, "utf8");

console.log("── 行为级：真组件 + 真事件 ──");
const r = spawnSync(process.execPath, [tmp], { stdio: "inherit", cwd: WS });
if (r.status !== 0) fail++;

/* ---------- 产物核对：发布出去的那份里，历史必须是 txlog 那套 ─---------
 * 少量指纹，只用来防「源码改了、产物没重建」这类漂移；行为断言在上面那一段。 */
console.log("\n── 产物核对 ──");
let prod = "";
try {
  const j = JSON.parse(fs.readFileSync(DEPLOYED, "utf8"));
  prod = String(j.contributions.editors[0].source || "").replace(/\r\n/g, "\n");
  console.log("  产物版本：" + j.version + "   编辑器源码长度：" + prod.length);
} catch (e) {
  ok("装机产物可读", false, e.message);
}
if (prod) {
  const marks = [
    ["TX（txlog）内核已内联（缺了它历史在产物里就是 ReferenceError）", "const TX = (function () {"],
    ["History 类在产物里", "class History {"],
    ["rebase / describeGaps 在产物里", "describeGaps() {"],
    ["预览层用的是 TX.History", "wysHistFor(k, content)"],
    ["历史按文件留在模块级（活过「切主区标签 → 卸载重挂」）", "const WYS_HIST_BY_FILE = new Map();"],
    ["最多留 8 份文件的历史（不按文件分家会把 A 的链套到 B 上）", "WYS_HIST_FILES_MAX = 8"],
    ["步数上限 50（每一步存的都是整份源码，别拿内存换步数）", "limit: WYS_HIST_STEPS_MAX"],
    ["落改动 = commit 一条真事务", "function wysPushTx(before, after, label) {"],
    ["撤销前先落地未落盘的打字（v0.8.17 的承诺不许回退）", "function wysCommitPending() {"],
    ["撤销取 History 的凭据", "const tx = hist.undo();"],
    ["重做取 History 的凭据", "const tx = hist.redo();"],
    ["外部改动 → rebase 重映射", "const res = h0.rebase(prevSrc, content);"],
    ["gaps 弹给用户（丢了步数不静默）", "describeGaps()"], 
    ["认领历史时按路径分家（撤销链不许跨文件）", "wysHistRef.current = k"],
    ["取不到路径就不进历史表（两篇文档的撤销链不许串）", "function wysHistKey() {"],
  ];
  for (const [name, s] of marks) ok(name, prod.includes(s));

  /* 反向：旧写法（判「这拍谁写的」→ 清空历史）不许再出现在代码里 */
  const codeOnly = prod.split("\n").filter(function (line) {
    const s = line.trim();
    return !(s.indexOf("*") === 0 || s.indexOf("//") === 0 || s.indexOf("/*") === 0);
  }).join("\n");
  const banned = [
    ["代码里不许再「误判一次就清空历史」", "wysUndoRef.current = [];"],
    ["不许再自己维护 redo 栈（改由 History 的游标负责）", "wysRedoRef.current.push("],
    ["内联后不许残留 module.exports（0.3.0 事故）", "module.exports"],
  ];
  for (const [name, s] of banned) ok(name, !codeOnly.includes(s));
}

console.log("\n" + (fail === 0
  ? "✓ 撤销历史这一层全绿"
  : "✗ 撤销历史这一层有 " + fail + " 处未通过"));
process.exit(fail === 0 ? 0 : 1);
