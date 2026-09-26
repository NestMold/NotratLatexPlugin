/* 层 [25] —— 行区间：段落一拆，它下面所有块的行号都得跟着挪（v0.8.27 加）
 *
 * 这一层是 v0.8.27「回车改成新建段落」带出来的**第二件事**，与 [24] 层是两个面：
 *   [24] 管「按一下回车，DOM 与源码变成什么」（动作对不对）；
 *   [25] 管「源码的行数变了之后，后面每一笔回写还写不写得对」（区间跟不跟得上）。
 *
 * 为什么必须单开一层：data-s / data-e 是**渲染那一刻**写上的，而 v0.8.26 之前那段设计
 * 一直靠着一条前提活着 —— **编辑期间行数不变**（回车只把光标送到新的一行、源码零改动；
 * 打字只改某一行的内容）。三处读回点（收尾 commitWys / 边打边 wysSyncLive / 渲染后的
 * 原文台账）全是按这条前提在 data-s..data-e 上 replace 的。
 *
 * 回车改成「新建段落」之后前提就没了：一个段落一拆，下面所有块的行号都得往后挪。
 * 不挪的后果不是「差一行」这种小事，而是**源码里凭空多出一份重复的正文**：
 *
 *   base（旧区间 [4..4]）:  4: 甲段落内容摆在这里
 *   第二笔的新文本三行:    4: 甲段落   5: (空)   6: 内容摆在这里续
 *   结果:                  4: 甲段落   5: (空)   6: 内容摆在这里续
 *                          7: (空)     8: 内容摆在这里        ← 上一笔留下的垃圾
 *
 * 这一层钉三件事：
 *   [A] 源码分寸：那颗纯函数在（wysShiftSpan）、落点函数在（wysShiftSpans）、
 *       **两处回写点都必须调它**（少一处，那条路就会开始吐重复正文）
 *   [B] 纯函数单测：真 applyEdits 跑一串「拆段 → 一笔一笔打字」，断言源码里不长重复；
 *       外加**反证**：按旧写法（不挪区间）跑同一串动作，必须真的重复 —— 否则这层白开
 *   [C] 装机产物核对
 *
 * 运行： node .setup/check-v0827-span.js
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

function fnBody(name) {
  const i = editorSrc.indexOf("function " + name + "(");
  if (i < 0) return null;
  const m = /\n  (?:async )?function [A-Za-z_$]/.exec(editorSrc.slice(i + 10));
  return m ? editorSrc.slice(i, i + 10 + m.index) : editorSrc.slice(i);
}
/* 只留**代码行**（注释里写着旧写法是好事，但「代码里还有没有这一条」是另一件事） */
function codeOf(text) {
  return String(text).split("\n").filter(function (line) {
    const s = line.trim();
    return !(s.indexOf("*") === 0 || s.indexOf("//") === 0 || s.indexOf("/*") === 0);
  }).join("\n");
}
function topFnBody(name) {
  const i = editorSrc.indexOf("function " + name + "(");
  if (i < 0) return null;
  const m = /\nfunction [A-Za-z_$]/.exec(editorSrc.slice(i + 10));
  return m ? editorSrc.slice(i, i + 10 + m.index) : editorSrc.slice(i);
}

/* ================= [A] 源码分寸 ================= */
console.log("\n[A] 行区间跟着回写一起挪（两处回写点都得调它）");
const segPure = topFnBody("wysShiftSpan");
ok("纯函数在（模块级 wysShiftSpan —— 可单测，不藏在组件里）", segPure != null);
ok("★ 「就是这一块」→ 终点按**新文本行数**重算（与 applyEdits 同一把尺子：按 \\n 切）",
  segPure != null && segPure.indexOf('split("\\n").length') >= 0
  && segPure.indexOf("if (es === s && ee === e) { own = k; continue; }") >= 0);
ok("★ 「编辑在它上面」→ 整体平移 delta",
  segPure != null && segPure.indexOf("if (ee < s) { delta += k - (ee - es + 1); continue; }") >= 0);
ok("★ 「编辑在它下面」→ 与它无关（continue，不参与平移）",
  segPure != null && segPure.indexOf("if (es > e) continue;") >= 0);
ok("★ 「区间交错」→ 一格都不挪（宁可少挪，绝不乱挪）",
  /if \(es > e\) continue;[^\n]*\n\s*return null;/.test(codeOf(segPure || "")),
  JSON.stringify(String(segPure || "").slice(-160)));
ok("★ 没有 delta 就不动（不多写一次属性，也不产生无谓的 DOM 变更）",
  segPure != null && segPure.indexOf("if (!delta) return null;") >= 0);

const segApply = fnBody("wysShiftSpans");
ok("落点函数在（组件内 wysShiftSpans —— 把结果写回各块 DOM）", segApply != null);
ok("★ 行区间的**唯一权威**仍是 DOM 上的 data-s / data-e（不另存一份 state，避免两处对不上）",
  segApply != null && segApply.indexOf('setAttribute("data-s", String(nx[0]))') >= 0
  && segApply.indexOf('setAttribute("data-e", String(nx[1]))') >= 0);

const segLive = fnBody("wysSyncLive");
const segCommit = fnBody("commitWys");
ok("★ 边打边同步那条路调了它（每敲一个字都走这条路，区间一漂就整串错位）",
  segLive != null && segLive.indexOf("wysShiftSpans([{ startLine: s, endLine: e, newText: newText }])") >= 0);
ok("★ 收尾落盘那条路也调了它（失焦 / Ctrl+S / 切档 / 编译前都走这儿）",
  segCommit != null && segCommit.indexOf("wysShiftSpans(edits);") >= 0);
ok("★ 调用点在 applyEdits **之后**（写没落地就挪，区间会与源码对不上）",
  (function () {
    if (segLive == null || segCommit == null) return false;
    const a = segLive.indexOf("wysShiftSpans([{");
    const b = segLive.indexOf("wysOutSrc.current = next;");
    const c = segCommit.indexOf("wysShiftSpans(edits);");
    const d = segCommit.indexOf("let next;");
    return a > 0 && b > a && c > d;
  })());

/* ================= [B] 纯函数单测：真 applyEdits 跑一串输入 ================= */
console.log("\n── 单元级：真 applyEdits 跑「拆段 → 一笔一笔打字」+ 旧写法反证 ──");
const r = spawnSync(process.execPath, [path.join(__dirname, "_test-v0827-span.js")], { stdio: "inherit", cwd: ws });
ok("行区间单测全绿（含反证：不挪区间时必须真的重复）", r.status === 0, "退出码 " + r.status);

/* ================= [C] 装机产物核对 ================= */
console.log("\n[C] 装机产物核对（发布出去的那份必须有这一改）");
ok("产物版本与 manifest.json 一致（发布的就是源码这一版）",
  pkg.version === String(mf.version), "产物 " + pkg.version + " / manifest " + mf.version);
const marks = [
  ["纯函数 wysShiftSpan", "function wysShiftSpan(s, e, edits) {"],
  ["「就是这一块」那一条", "if (es === s && ee === e) { own = k; continue; }"],
  ["「在它上面」那一条", "if (ee < s) { delta += k - (ee - es + 1); continue; }"],
  ["「在它下面」那一条", "if (es > e) continue;"],
  /* 「交错」那条：紧跟 es > e 的 bare `return null` —— 按**代码行**查，注释怎么写都不影响 */
  ["「交错」那一条（一格都不挪）", "__INTERLEAVE__"],
  ["落点函数 wysShiftSpans", "function wysShiftSpans(edits) {"],
  ["写回 data-s / data-e", 'el.setAttribute("data-s", String(nx[0]));'],
  ["边打边那条路调了它", "wysShiftSpans([{ startLine: s, endLine: e, newText: newText }]);"],
  ["收尾那条路调了它", "wysShiftSpans(edits);"],
  /* 防回归：三处读回点仍然是同一把尺子（这次改动不许把读法拆成两套） */
  ["块级读回归一仍在（wysBlockTex）", "function wysBlockTex(root) {"],
  ["读回点仍走它（不直呼 wysDomToTex）", "const now = ownTex != null ? ownTex : wysBlockTex(anchor);"],
];
for (const [n, s2] of marks) {
  if (s2 === "__INTERLEAVE__") {
    ok(n, /if \(es > e\) continue;[^\n]*\n\s*return null;/.test(codeOf(src)));
    continue;
  }
  ok(n, src.indexOf(s2) >= 0);
}
ok("★ 产物里两处回写点都调了 wysShiftSpans（少一处，那条路就会吐重复正文）",
  (src.match(/wysShiftSpans\(/g) || []).length >= 3,
  "命中 " + (src.match(/wysShiftSpans\(/g) || []).length + " 处（1 定义 + 2 调用）");
ok("顺带防回归：wysDomToTex 的块级读回没人再直呼（只有定义 + wysBlockTex 内部那一次）",
  (function () {
    const code = src.split("\n").filter(function (line) {
      const s = line.trim();
      return !(s.indexOf("*") === 0 || s.indexOf("//") === 0 || s.indexOf("/*") === 0);
    }).join("\n");
    return (code.match(/wysDomToTex\(/g) || []).length === 2;
  })());

console.log("\n" + "=".repeat(64));
console.log(fail ? "✗ 这一层有 " + fail + " 项未通过（通过 " + pass + "）"
                 : "✓ 行区间：段落一拆，下面所有块的行号跟着挪（源码 + 单测 + 产物，共 " + pass + " 项）");
process.exit(fail ? 1 : 0);
