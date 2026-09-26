/* 层 [23] —— 「在分屏右栏（预览）里打字时，左栏源码要等我点开才更新」（v0.8.25 加）
 *
 * 用户原话：「我说的不是滚动，是**内容**不同步：在分屏右栏（预览）里打字时，
 *            左栏源码框要等我点开才更新，我想**边打边**看到源码变化。」
 *
 * 为什么必须新增一层（前面 22 层为什么都没拦住）：
 *   [22] 那一层问的是「两栏之间有没有联动」，但它对**内容**同步的判据是
 *   「右栏就地改完**失焦** → 左栏 textarea 跟着变」—— 失焦才同步，恰恰就是
 *   用户抱怨的那件事本身。门禁把「最后会写回去」当成了「同步」。
 *   而 [13]/[11] 那些层问的是「档位对不对」「切回来正文还在不在」。
 *   于是「打字**过程中**左栏是不是跟着动」从来没被问过。
 *
 * 这一层把三件事钉住：
 *   [A] 源码：预览层有 input 通路；实时同步只跟当前块、不弹提示、不记历史、
 *       不重建 DOM、落地前自检；基准是「本层最近写出去的源码」（连打两笔不丢第一笔）；
 *       收尾把整段编辑合成撤销链里**一步**；全部收尾点都走 commitWysSession
 *   [B] 行为（真组件 + jsdom 真 DOM）：不失焦就同步、左栏显示新源码、DOM 不重建、
 *       输入法组字中不写、一次 Ctrl+Z 退掉整串、连打两笔都不丢
 *   [C] 装机产物核对
 *
 * 运行： node .setup/check-v0825-live-sync.js
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ws = path.join(__dirname, "..");
const pkgPath = "C:/Users/Administrator/.notrat/plugins/notrat-latex-plugin.json";
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok    " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra !== undefined ? "\n        → " + extra : "")); }
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const src = String(pkg.contributions.editors[0].source || "");
const editorSrc = fs.readFileSync(path.join(ws, "panels", "editor.tsx"), "utf8");
const mf = JSON.parse(fs.readFileSync(path.join(ws, "manifest.json"), "utf8"));
console.log("  产物版本：" + pkg.version + " / manifest " + mf.version);

/* 取一个函数的整段（从 `function NAME(` 到下一个同缩进的函数声明）。
 * 不写死「下一个函数叫什么」—— 那种写法会在函数顺序调整时静默变空段，断言就全「过」了。 */
function fnBody(name) {
  const i = editorSrc.indexOf("function " + name + "(");
  if (i < 0) return null;
  const m = /\n  (?:async )?function [A-Za-z_$]/.exec(editorSrc.slice(i + 10));
  return m ? editorSrc.slice(i, i + 10 + m.index) : editorSrc.slice(i);
}

/* ================= [A] 源码：实时同步这条路，分寸比功能更重要 ================= */
console.log("\n[A] 预览层要有 input 通路，且同步只做「跟随」这一件事");

const segLive = fnBody("wysSyncLive");
const segInput = fnBody("onWysInput");
const segSession = fnBody("commitWysSession");
const segBaseSrc = fnBody("wysBaseSrc");
const segCommit = fnBody("commitWys");

ok("实时同步本体存在（wysSyncLive）", segLive != null);
ok("input 入口存在（onWysInput）", segInput != null);
ok("预览层挂了 onInput（没有它，「边打边」根本无从谈起）",
  editorSrc.indexOf("onInput={onWysInput}") >= 0);
ok("输入法组字结束也补一次（compositionend 不一定派 input）",
  editorSrc.indexOf("onCompositionEnd={onWysInput}") >= 0);

/* 分寸一：打字过程中**不许**弹提示、不许记历史、不许重建 DOM。
 * 这三条是「修过头」的典型姿势：顺手把 commitWys 挂到每次击键上，
 * 用户每敲一个字弹一次「✏ 已就地写回」、撤销栈里塞满逐字步骤、光标每改一处被铲平。 */
ok("★ 打字过程中不弹提示（每个字符弹一次「已就地写回」是本改最典型的翻车）",
  segLive != null && segLive.indexOf("setToast") < 0);
ok("★ 打字过程中不记历史（历史由收尾那一拍合成一步）",
  segLive != null && segLive.indexOf("wysPushTx") < 0);
ok("★ 打字过程中不重建预览 DOM（DOM 是权威，重建 = 铲掉光标）",
  segLive != null && segLive.indexOf("wysSelfEdit.current = true") >= 0);
ok("打字过程中不调用收尾函数（否则递归 + 提示 + 历史一起炸）",
  segLive != null && segLive.indexOf("commitWys(") < 0);
ok("收尾函数也不反过来调实时同步（职责分离）",
  segCommit != null && segCommit.indexOf("wysSyncLive") < 0);

/* 分寸二：只跟「光标所在那一块」，并且落地前必须过内核自检 */
ok("只跟当前光标所在的那一块（不是每敲一个字扫全篇）",
  segLive != null && segLive.indexOf("currentWysBlock()") >= 0);
ok("落地前仍走内核自检（改完必须仍可解析 —— 与 commitWys 同一条红线）",
  segLive != null && segLive.indexOf("WYS.parseDoc(next)") >= 0);
ok("失败一律静默（跟随失败不许打断打字；落盘保障仍在收尾那一路）",
  segLive != null && segLive.indexOf("catch (err) { return; }") >= 0);

/* 分寸三：基准必须往前走。用 props.content 当基准的话，同一个 React 批次里
 * 连打两笔（宿主还没回传），第二笔会基于旧源码重算，把第一笔抹掉。 */
ok("基准 = 本层最近写出去的源码（wysOutSrc），不是滞后的 props.content",
  segBaseSrc != null && segBaseSrc.indexOf("wysOutSrc.current") >= 0);
ok("实时同步用的是这个基准", segLive != null && segLive.indexOf("wysBaseSrc()") >= 0);
ok("★ 连打两笔不丢第一笔（⑦ 行为级也钉了一遍）",
  segLive != null && segLive.indexOf("wysOutSrc.current = next") >= 0);

/* 分寸四：撤销。一次连续编辑 = 链里一步 —— 这一步的起点是「会话开始前那份源码」，
 * 不是「上一次同步落下的中途某一拍」。 */
ok("收尾包装存在（commitWysSession）", segSession != null);
ok("★ 收尾时把整段编辑合成一步（起点 = 会话开始前那份）",
  segSession != null && segSession.indexOf('wysPushTx(b0, cur, "打字")') >= 0);
ok("有净改动时返回当前源码（「编译 / 导出前先落盘」靠这个凭据）",
  segSession != null && segSession.indexOf("return cur;") >= 0);
ok("commitWys 记事务时用会话起点（用 content 只退得到中间某个字符）",
  segCommit != null && segCommit.indexOf("wysLiveBase.current != null ? wysLiveBase.current : content") >= 0);
ok("事务记完就销账（免得同一步被记两次）",
  segCommit != null && segCommit.indexOf("wysLiveBase.current = null;") >= 0);

/* 分寸五：全部收尾点都得走这个包装。少一处，那一条路上刚打的字就撤不掉。 */
const nSession = (editorSrc.match(/commitWysSession\(\)/g) || []).length;
const nBare = (editorSrc.match(/commitWys\(\);/g) || []).length;
ok("收尾调用点齐了（失焦 / 切档 / Ctrl+S / 编译 / 校验 / 导出 / 改层级 / 开原子浮层 / 行内原子，实际 " + nSession + " 处）",
  nSession >= 10, "commitWysSession() 出现 " + nSession + " 次");
ok("★ 裸 commitWys() 只剩它自己的内部那一次（漏一处 = 那条路上打的字撤不掉）",
  nBare === 1, "commitWys(); 出现 " + nBare + " 次");

/* 性能：打字期间不许重算整篇预览 HTML（大文档下每次击键几十毫秒） */
ok("★ 打字期间复用编辑开始前那份 HTML（否则每次击键重算整篇 + KaTeX）",
  editorSrc.indexOf("if (wysLiveBase.current != null && wysCacheRef.current) return wysCacheRef.current;") >= 0);

/* 输入法：组字中的半成品拼音不许写进源码 */
ok("输入法组字中不同步（半成品拼音写进源码既难看又难撤）",
  segInput != null && segInput.indexOf("isComposing") >= 0);
/* v0.8.26：排程本身从 onWysInput 里拆成了 queueWysLive（回车那条路也要用它 ——
 * 自己动 DOM 之后 UA 不会替我们派 input）。断的**事**没变：合并一次 + 句柄复位；
 * 只是现在住在 queueWysLive 里，onWysInput 负责叫它。 */
const segQueue = fnBody("queueWysLive");
ok("● 排程本体存在（queueWysLive）—— 打字与回车共用同一次排程",
  segQueue != null && segQueue.indexOf("requestAnimationFrame") >= 0);
ok("● rAF 句柄用完就复位（否则第一帧之后再也不会同步）",
  segQueue != null && segQueue.indexOf("wysLiveRaf.current = 0") >= 0);
ok("● 打字那条路走的是同一个排程（不各写一份）",
  segInput != null && segInput.indexOf("queueWysLive();") >= 0);

/* 会话中断：预览层卸载了就清掉起点（免得下次收尾补出一条跨越卸载的撤销步） */
ok("预览层卸载时清掉打字会话起点",
  editorSrc.indexOf("wysLiveBase.current = null;\n      return;") >= 0);
/* 外部改动：基准跟着走（否则下一笔同步会把外部那次改动盖回去） */
ok("外部改动进来时实时同步的基准跟着走",
  editorSrc.indexOf("if (wysOutSrc.current !== content) wysOutSrc.current = content;") >= 0);

/* ================= [B] 行为：真组件 + jsdom 真 DOM ================= */
console.log("\n── 行为级：真组件 + jsdom 真 DOM ──");
const mk1 = spawnSync(process.execPath, [path.join(__dirname, "_mkprobe-undo.js")], { stdio: "pipe", cwd: ws });
if (mk1.status !== 0) { ok("探针 harness 可组装", false, String(mk1.stderr || "").slice(0, 300)); }
else {
  const mk2 = spawnSync(process.execPath, [path.join(__dirname, "_mkprobe-v0825.js")], { stdio: "pipe", cwd: ws });
  if (mk2.status !== 0) { ok("v0825 探针可组装", false, String(mk2.stdout || "") + String(mk2.stderr || "").slice(0, 300)); }
  else {
    const r = spawnSync(process.execPath, [path.join(__dirname, "_probe-v0825.js")], { stdio: "inherit", cwd: ws });
    ok("行为级探针全绿（不失焦就同步 + 左栏当场变 + DOM 不重建 + 输入法 + 撤销一步 + 连打两笔）",
      r.status === 0, "退出码 " + r.status);
  }
}

/* ================= [C] 装机产物核对 ================= */
console.log("\n[C] 装机产物核对（发布出去的那份必须有这一改）");
ok("产物版本与 manifest.json 一致（发布的就是源码这一版）", pkg.version === String(mf.version), "产物 " + pkg.version + " / manifest " + mf.version);
const marks = [
  ["实时同步本体 wysSyncLive", "function wysSyncLive() {"],
  ["input 入口 onWysInput", "function onWysInput(e) {"],
  ["收尾包装 commitWysSession", "function commitWysSession() {"],
  ["基准助手 wysBaseSrc", "function wysBaseSrc() {"],
  ["预览层挂载点", "onInput={onWysInput}"],
  ["组字结束挂载点", "onCompositionEnd={onWysInput}"],
  ["打字期间复用 HTML", "if (wysLiveBase.current != null && wysCacheRef.current) return wysCacheRef.current;"],
  ["事务起点 = 会话起点", "wysPushTx(wysLiveBase.current != null ? wysLiveBase.current : content, next"],
];
for (const [n, s2] of marks) ok(n, src.indexOf(s2) >= 0);
ok("产物里裸 commitWys() 也只剩一处（与源码同一条判据）",
  (src.match(/commitWys\(\);/g) || []).length === 1,
  "实际 " + (src.match(/commitWys\(\);/g) || []).length + " 处");
ok("顺带防回归：onScroll 仍是两处（[22] 那条滚动联动没被这次改动带坏）",
  (src.match(/onScroll=\{/g) || []).length === 2,
  "实际 " + (src.match(/onScroll=\{/g) || []).length + " 处");

console.log("\n" + "=".repeat(64));
console.log(fail ? "✗ 这一层有 " + fail + " 项未通过（通过 " + pass + "）"
                 : "✓ 分屏内容同步：右栏打字 → 左栏当场变（源码 + 行为 + 产物，共 " + pass + " 项）");
process.exit(fail ? 1 : 0);
