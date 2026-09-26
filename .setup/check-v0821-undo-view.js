/* 层 [19] —— 「撤销看得见」：打完字 Ctrl+Z，屏幕与源码必须**一起**回去（v0.8.21 加）
 *
 * 用户原话：「已撤销但是没有效果呢，没有撤销上去」
 *
 * 为什么前面几层撤销测试全是绿的，用户还是看到「没效果」：
 *   它们查的都是 **onChange 收到的源码对不对** —— 源码是对的（逐字节回到打字前），
 *   所以一路全绿。可用户看的是**屏幕**：刚敲的字在 Ctrl+Z 之后还留在 DOM 里，
 *   他读作「撤销没有效果」。这个断言以前一层都没有。
 *
 * 更狠的是它的二阶伤害：DOM 里那份陈旧的打字还在，用户顺手点走（失焦）→ commitWys
 *   把它写回源码 —— **撤销被静默吃掉**；再接着打字，撤掉的字也会顺路回来。
 *
 * 这一层把「屏幕」当被测对象：
 *   ⑭ 打字 → Ctrl+Z：源码回去 ✓ **且屏幕上不再有刚敲的字**（旧版红在这条）
 *   ⑮ 撤销后再失焦：不许把撤掉的字写回来（旧版红）
 *   ⑯ 撤销后接着打字再失焦：撤掉的字不许跟着回来（旧版红）
 *
 * harness 复用 `_probe-edit.js` 前半段（同一份，不复制）。与 `_probe-undo-real.js` 的关键区别：
 *   那一层的 wire() 没有把 `innerHTML` 接到 jsdom —— 而同步层重建画面写的正是它，
 *   于是「画面有没有重建」在那一层里根本不可观测（重建与否读出来的都是老 DOM）。
 *   这一层把 innerHTML / textContent 都接上，重建第一次成为可断言的事。
 *
 * 运行： node .setup/check-v0821-undo-view.js
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

console.log("── 行为级：真组件 + jsdom 真 DOM + 真事件（屏幕 / 源码 / 历史一起看）──");
const bodyFile = path.join(DIR, "_probe-undo-view.body.js");
if (!fs.existsSync(bodyFile)) {
  console.error("✗ 缺少 " + bodyFile + "（由 .setup/_mkbody-undo-view.py 生成）");
  process.exit(1);
}
/* 先组装再跑：组装的输入是**当前源码**，保证这一层测的不是一份陈旧的拼装结果 */
const mk = spawnSync(process.execPath, [path.join(DIR, "_mkprobe-undo-view.js")], { stdio: "inherit", cwd: WS });
if (mk.status !== 0) { fail++; console.log("  FAIL  探针组装失败（_mkprobe-undo-view.js）"); }
const run = spawnSync(process.execPath, [path.join(DIR, "_probe-undo-view.js")], { stdio: "inherit", cwd: WS });
if (run.status !== 0) fail++;

/* ---------- 产物核对：装机产物里也必须有这两个台账（防「源码改了、产物没重建」） ---------- */
console.log("\n── 产物核对 ──");
let prod = "";
let ver = "";
try {
  const j = JSON.parse(fs.readFileSync(DEPLOYED, "utf8"));
  ver = String(j.version || "");
  prod = String(j.contributions.editors[0].source || "").replace(/\r\n/g, "\n");
  console.log("  产物版本：" + ver + "   编辑器源码长度：" + prod.length);
} catch (e) {
  ok("装机产物可读", false, e.message);
}
if (prod) {
  /* 版本断言不写死某一个号：它要守的不变式是「装机产物不落后于这一改、且与 manifest 一致」。
   * （写死 0.8.21 的后果实测过：0.8.22 一发布这层就红 —— 红的是断言本身，不是产品。） */
  const mf = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
  function vnum(v) { return String(v).split(".").map(function (x) { return parseInt(x, 10) || 0; }); }
  function vge(a, b) {
    const A = vnum(a), B = vnum(b);
    for (let i = 0; i < Math.max(A.length, B.length); i++) {
      if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) > (B[i] || 0);
    }
    return true;
  }
  ok("产物版本 ≥ 0.8.21（这一改之后）", vge(ver, "0.8.21"), "实际 " + ver);
  ok("产物版本与 manifest.json 一致（没发布错版本）", ver === String(mf.version), "产物 " + ver + " / manifest " + mf.version);
  /* ① 新台账存在 */
  ok("产物有 wysDomSrc 台账（屏幕对应哪份源码）", prod.indexOf("const wysDomSrc = useRef(null);") >= 0);
  /* ② 守卫是「html 或源码对不上就重建」 */
  ok("产物守卫两头都查：html 与源码", prod.indexOf("if (root.__latexHtml !== html || wysDomSrc.current !== content) {") >= 0);
  /* ③ commitWys 写回当拍就记台账（中间那帧可能被 React 批处理吃掉） */
  /* v0.8.25：事务的 before 不再是 content，而是「这次打字会话开始前那份源码」——
   * 预览层打字已经边打边写回，content 可能只是中途某一拍。断的还是同一件事：
   * 记事务与「当拍记台账」必须连在一起。 */
  ok("产物 commitWys 当拍记台账", /wysPushTx\(wysLiveBase\.current != null \? wysLiveBase\.current : content, next, "打字"\);[\s\S]{0,900}?wysDomSrc\.current = next;/.test(prod));
  /* ④ 反向断言：旧的「只比 html」守卫不许再出现 —— 它正是「画面不重建」的成因 */
  ok("反向：旧的单条件守卫已消失", !/if \(root\.__latexHtml !== html\) \{/.test(prod));
  /* ⑤ 标志先消费：selfEdit 的读取必须排在守卫之前 */
  const iFlag = prod.indexOf("const selfEdit = wysSelfEdit.current;");
  const iGuard = prod.indexOf("if (root.__latexHtml !== html || wysDomSrc.current !== content) {");
  ok("标志先消费（读在守卫之前，短路也不残留）", iFlag >= 0 && iGuard >= 0 && iFlag < iGuard,
     "selfEdit@" + iFlag + " guard@" + iGuard);
  /* ⑥ 反向断言：标志读取不许再留在守卫里面（旧位置） */
  ok("反向：守卫内不再读 selfEdit/histOp",
     !/if \(root\.__latexHtml !== html \|\| wysDomSrc\.current !== content\) \{[\s\S]{0,200}?const histOp = wysHistOp\.current;/.test(prod));
}

console.log("\n" + "=".repeat(60));
console.log(fail ? "✗ 本层失败 " + fail + " 项" : "✓ 本层全绿");
process.exit(fail ? 1 : 0);
