/* 层 [22] —— 「分屏那里没有同步呢」（v0.8.24 加）
 *
 * 用户原话：「分屏那里没有同步呢」
 *
 * 为什么必须新增一层（前面 21 层为什么都没拦住）：
 *   [13] 那一层问的是「三种视图能不能编辑」、[7] 问的是「档位怎么切」，
 *   而「分屏」这个词在本项目里被断言过的只有**档位落对没落对**。
 *   「两栏之间有没有联动」从来没被问过 —— 于是「滚动联动」这条承诺
 *   （README 里写着，用户读到的是「两边一起动」）只有**一半**真的实现了：
 *   源码栏上挂着 onScroll，渲染层 pv-root 上从来一个都没挂。
 *   探针实测：滚右栏，ta.scrollTop 恒为 0。
 *
 * 这一层把三件事钉住：
 *   [A] 源码：两栏都挂了 onScroll；两个方向共用**同一个**比例公式（否则推来推去会漂）；
 *       gotoLine 那条显式驱动（不带 ev）仍走同一条路；textarea 老通路一字不动
 *   [B] 行为（真组件 + jsdom 真 DOM）：滚右栏左栏跟着走；回声不许推回另一栏；
 *       反例：可视化档里滚渲染层不炸、用户真的滚右栏必须接管
 *   [C] 装机产物核对
 *
 * 运行： node .setup/check-v0824-split-sync.js
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

/* ================= [A] 源码：两条通路都在，且共用一套换算 ================= */
console.log("\n[A] 两个方向都得有通路，换算必须是同一套");

const segFromPv = fnBody("syncScrollFromPv");
const segSrc = fnBody("syncScroll");
const segRatio = fnBody("ratioScroll");

ok("渲染层 → 源码栏 那条通路存在（syncScrollFromPv）", segFromPv != null);
ok("比例换算只有一处定义（ratioScroll）", segRatio != null);
const nRatio = (editorSrc.match(/ratioScroll\(/g) || []).length;
ok("两个方向共用同一个换算公式（推过去、推回来落同一个点，才不会一点点漂）",
  nRatio >= 3, "ratioScroll 出现 " + nRatio + " 次（1 次定义 + 2 次调用才是两个方向都在用）");
ok("源码栏 → 渲染层 那条老通路还在（没被这次改动换掉）",
  segSrc != null && segSrc.indexOf("pvEl.scrollTop = y;") >= 0 && segSrc.indexOf('view === "split"') >= 0);
ok("老通路只认分屏档（纯预览档没有第二栏可推）",
  segSrc != null && segSrc.indexOf('if (pvEl && view === "split") {') >= 0);

/* 新通路的分寸：只在分屏档动作；源码栏不在场就早退（不许拿 null 去写 scrollTop） */
ok("新通路只在分屏档动作（纯可视化档里源码栏根本没挂载）",
  segFromPv != null && segFromPv.indexOf('view !== "split"') >= 0);
ok("新通路先挡「没有源码栏」再动手（早退，不是拿 null 写 scrollTop）",
  segFromPv != null && segFromPv.indexOf("const ta = taRef.current; if (!ta) return;") >= 0);

/* 回声台账：双向联动最容易出的毛病是 A 推 B、B 又推回 A 来回打架。
 * 判据必须是「位置对得上」而不是「计时器到点就别管了」—— 后者会把真实的用户滚动也吞掉。 */
const segEcho = segFromPv == null ? null : segFromPv;
ok("回声判据 = 位置对得上 + 就在刚才（不是「到点就别管了」）",
  segEcho != null && segEcho.indexOf("Math.abs(pvEl.scrollTop - echo.pv) < 1") >= 0
  && segEcho.indexOf("Date.now() - echo.at < 350") >= 0);
ok("回声认出来之后立刻销账（否则残留条目会吞掉一次真实的用户滚动）",
  segEcho != null && segEcho.indexOf("echo.pv = -1;") >= 0);
ok("替源码栏写位置之前先记台账（顺序断言）",
  segEcho != null && segEcho.indexOf("echo.src = y;") >= 0
  && segEcho.indexOf("echo.src = y;") < segEcho.indexOf("ta.scrollTop = y;"));
ok("源码栏那一侧也认回声（渲染层推过来的那一下不许再推回去）",
  segSrc != null && segSrc.indexOf("Math.abs(ta.scrollTop - echo.src) < 1") >= 0);
ok("显式驱动（gotoLine：不带 ev）不走回声判据，且把残留回声一笔勾销",
  segSrc != null && segSrc.indexOf("if (!ev) {") >= 0 && segSrc.indexOf("scrollEcho.current.src = -1;") >= 0);

/* 高亮层 / 行号槽跟着源码栏一起搬 —— 它们与 textarea 共用同一个滚动位置 */
ok("高亮层与行号槽在反方向也一起搬（否则「字在动、背景高亮没动」）",
  segEcho != null && segEcho.indexOf("preRef.current.scrollTop = y;") >= 0
  && segEcho.indexOf("gutterRef.current.scrollTop = y;") >= 0);
ok("闪烁层（行定位高亮）也跟着重画",
  segEcho != null && segEcho.indexOf("paintFlash(flashLineRef.current)") >= 0);

/* 反面：滚动联动只许动**滚动位置**，别的什么都不许碰。
 * 这三条是这一改最容易「修过头」的地方 —— 顺手把光标或文档也带上，就从「联动」变成「捣乱」。 */
const segCommitWys = fnBody("commitWys");
ok("反面：打字落地那条路（commitWys）里不许出现滚动逻辑（两件事互不相干）",
  segCommitWys != null && segCommitWys.indexOf("syncScrollFromPv") < 0 && segCommitWys.indexOf("ratioScroll") < 0);
ok("反面：滚动**绝不许改文档** —— 新通路里不许出现 onChange（滚一下不能变成一次编辑）",
  segFromPv != null && segFromPv.indexOf("onChange") < 0);
ok("反面：滚动不许动光标 / 焦点（联动不是「把光标搬过去」，那会打断正在打的字）",
  segFromPv != null && segFromPv.indexOf("focus()") < 0
  && segFromPv.indexOf("selectionStart") < 0 && segFromPv.indexOf("setSelectionRange") < 0);

/* 挂载点：两栏各一个 onScroll，缺哪个都不算「联动」 */
ok("渲染层 pv-root 挂了 onScroll", editorSrc.indexOf('className="pv-root"\n              onScroll={syncScrollFromPv}') >= 0);
ok("源码 textarea 那条老挂法一字没动", editorSrc.indexOf("onScroll={syncScroll}") >= 0);
ok("两条通路各自绑对了对象（别把新通路挂到 textarea 上，那是对着镜子推）",
  editorSrc.indexOf('className="pv-root"\n              onScroll={syncScrollFromPv}') >= 0
  && editorSrc.indexOf("onScroll={syncScroll}\n                onKeyDown={onKeyDown}") >= 0);

/* ================= [B] 行为：真组件 + jsdom 真 DOM ================= */
console.log("\n── 行为级：真组件 + jsdom 真 DOM ──");
const mk1 = spawnSync(process.execPath, [path.join(__dirname, "_mkprobe-undo.js")], { stdio: "pipe", cwd: ws });
if (mk1.status !== 0) { ok("探针 harness 可组装", false, String(mk1.stderr || "").slice(0, 300)); }
else {
  const mk2 = spawnSync(process.execPath, [path.join(__dirname, "_mkprobe-v0824.js")], { stdio: "pipe", cwd: ws });
  if (mk2.status !== 0) { ok("v0824 探针可组装", false, String(mk2.stdout || "") + String(mk2.stderr || "").slice(0, 300)); }
  else {
    const r = spawnSync(process.execPath, [path.join(__dirname, "_probe-v0824.js")], { stdio: "inherit", cwd: ws });
    ok("行为级探针全绿（内容两向 + 滚动两向 + 回声 + 三条反例）", r.status === 0, "退出码 " + r.status);
  }
}

/* ================= [C] 装机产物核对 ================= */
console.log("\n[C] 装机产物核对（发布出去的那份必须有这一改）");
ok("产物版本与 manifest.json 一致（发布的就是源码这一版）", pkg.version === String(mf.version), "产物 " + pkg.version + " / manifest " + mf.version);
const marks = [
  ["回声台账 scrollEcho", "const scrollEcho = useRef({ src: -1, pv: -1, at: 0 });"],
  ["比例换算助手 ratioScroll", "function ratioScroll(el, r) {"],
  ["新通路函数", "function syncScrollFromPv() {"],
  ["渲染层挂载点", "onScroll={syncScrollFromPv}"],
  ["源码栏老挂载点", "onScroll={syncScroll}"],
];
for (const [n, s2] of marks) ok(n, src.indexOf(s2) >= 0);
ok("产物里 onScroll 恰好两处（两栏各一，多出来的那一处就是挂错了地方）",
  (src.match(/onScroll=\{/g) || []).length === 2,
  "实际 " + (src.match(/onScroll=\{/g) || []).length + " 处：" + JSON.stringify(src.match(/onScroll=\{[A-Za-z]+\}/g)));

console.log("\n" + "=".repeat(64));
console.log(fail ? "✗ 这一层有 " + fail + " 项未通过（通过 " + pass + "）"
                 : "✓ 分屏两栏同步：滚动联动的两个方向 + 回声不打架（源码 + 行为 + 产物，共 " + pass + " 项）");
process.exit(fail ? 1 : 0);
