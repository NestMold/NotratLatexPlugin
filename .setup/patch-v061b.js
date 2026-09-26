/* v0.6.1 验收断言同步（b）：
 *   · §3 从「大纲 + 划词助手」回到「有且仅有大纲」（划词助手按需求移除）
 *   · §5/§7 去掉划词助手的内联/字节断言
 *   · §7 新增：跳转修复特征 + 编辑器内大纲已移除 + 归档文件存在
 *   · §9 把 .setup/test-nav.js（真渲染行为测试）并入总分
 */
const fs = require("fs");
const path = require("path");
const WS = "E:/notrat-latex-plugin";

const p = path.join(WS, ".setup", "verify-v052.js");
let s = fs.readFileSync(p, "utf8");
let n = 0;

function rep(a, b, label) {
  const k = s.split(a).length - 1;
  if (k !== 1) { console.error("  ✗ 锚点命中 " + k + " 次（要求 1）：" + label); process.exit(1); }
  s = s.split(a).join(b);
  n++;
}
function cut(a, end, label) {
  const i = s.indexOf(a);
  if (i < 0) { console.error("  ✗ 起始锚点缺失：" + label); process.exit(1); }
  const j = s.indexOf(end, i + a.length);
  if (j < 0) { console.error("  ✗ 结束锚点缺失：" + label); process.exit(1); }
  s = s.slice(0, i) + s.slice(j);
  n++;
}

/* 1. 头部版本 */
rep("/* 验收脚本 v0.6.0：", "/* 验收脚本 v0.6.1：", "头部版本");

/* 2. §3：回到「有且仅有大纲」 */
cut(
  'section("3. UI 挂载位：大纲 + 划词助手");',
  "for (const bad of [",
  "§3 整段"
);
s = s.replace(
  "for (const bad of [",
  `section("3. UI 挂载位：有且仅有大纲（划词助手已按需求移除）");
ok(Array.isArray(c.ui) && c.ui.length === 1, "ui 恰好 1 项（不再有 right-panel 划词助手）", "实得 " + (c.ui || []).length);
const ou = (c.ui || [])[0] || {};
ok(ou.location === "outline", "location = outline（左侧大纲面板）", ou.location);
ok(JSON.stringify(ou.extensions) === JSON.stringify(["tex"]), 'extensions = ["tex"]（只在 .tex 上出现）', JSON.stringify(ou.extensions));
ok(!!(ou.content && ou.content.source), "大纲面板源码已内联");
ok(!ou.content || !ou.content.sourceFile, "sourceFile 已被 build 消费（不应残留）");
for (const bad of [`
);

/* 3. 反向断言名单加回 right-panel */
rep(
  'for (const bad of ["page", "widget", "activity-bar", "status-bar", "editor-tabs", "editor-header", "sidebar-input", "messages-top", "popup", "floating", "sidebar-toolbar"]) {\n  ok(!(c.ui || []).some((u) => u.location === bad), "未新增挂载位：" + bad);',
  'for (const bad of ["right-panel", "page", "widget", "activity-bar", "status-bar", "editor-tabs", "editor-header", "sidebar-input", "messages-top", "popup", "floating", "sidebar-toolbar"]) {\n  ok(!(c.ui || []).some((u) => u.location === bad), "已移除挂载位：" + bad);',
  "反向名单"
);

/* 4. §5 srcs 去掉划词助手 */
rep(
  'const srcs = [["editors[0]", edSrc, true], ["ui[outline]", (ou.content || {}).source || "", false], ["ui[selection]", (su.content || {}).source || "", false]];',
  'const srcs = [["editors[0]", edSrc, true], ["ui[outline]", (ou.content || {}).source || "", false]];',
  "§5 srcs"
);

/* 5. §7 字节一致：去掉划词助手，补上 v0.6.1 的修复特征 */
rep(
  '  const wsSelection = fs.readFileSync(path.join(WS, "panels", "selection.tsx"), "utf8");\n  ok((su.content || {}).source === wsSelection, "ui[selection].source ≡ panels/selection.tsx（" + wsSelection.length + " 字符）");',
  [
    '  /* v0.6.1：这三条是「只有真跑才暴露」的行为修复，静态只钉实现特征，行为交给 test-nav.js */',
    '  ok(/pendingReveal\\.current = \\{ ln: ln/.test(edSrc), "gotoLine 跳不成时挂 pendingReveal（等 DOM 就绪补跳）");',
    '  ok(/if \\(!ok\\) return;/.test(edSrc), "只有真的跳了才回 ACK（回早了会让面板兜底失效）");',
    '  ok(/function ackReveal\\(ln, nonce\\)/.test(edSrc), "ACK 统一走 ackReveal（补跳成后也能补发回执）");',
    '  ok(!/outline\\.length > 0/.test(edSrc), "编辑器内不再内嵌大纲列（宽 150 那一列已删）");',
    '  ok(!/const outline = useMemo/.test(edSrc) && !/SEC_LV/.test(edSrc), "编辑器不再派生大纲数据（死代码已清）");',
    '  const wsNav = fs.readFileSync(path.join(WS, "panels", "outline.tsx"), "utf8");',
    '  ok(/RETRY_DELAYS = \\[170, 700, 1500\\]/.test(wsNav), "大纲面板兜底重试 3 拍（打开文件 + 挂载需要时间）");',
    '  ok(/indexOf\\(nonce\\) !== 0/.test(wsNav), "回执按 nonce 前缀配对（重试轮次也能认出来）");',
    '  const unusedSel = path.join(WS, "panels", "_unused", "selection.tsx");',
    '  ok(fs.existsSync(unusedSel), "划词助手源码已归档 panels/_unused/（要接回只需加回 manifest 一条）");',
    '  ok(fs.existsSync(unusedSel) && fs.readFileSync(unusedSel, "utf8").length > 5000, "归档内容完整（>5KB）");',
    '  ok(!(c.ui || []).some((u) => u.location === "right-panel"), "部署包内确实没有 right-panel 划词助手");',
  ].join("\n"),
  "§7 修复特征"
);

/* 6. §9 并入 test-nav.js（真渲染行为测试） */
rep(
  '  if (mm) { pass += Number(mm[1]); fail += Number(mm[2]); console.log("  （子测试 " + mm[1] + " 通过 / " + mm[2] + " 失败，已并入总分）"); }\n}',
  [
    '  if (mm) { pass += Number(mm[1]); fail += Number(mm[2]); console.log("  （子测试 " + mm[1] + " 通过 / " + mm[2] + " 失败，已并入总分）"); }',
    '',
    '  /* v0.6.1 新增：跳转链路不是静态能验的，得真渲染 editor.tsx 派发事件看行为 */',
    '  const resNav = cp.spawnSync("node", [path.join(WS, ".setup", "test-nav.js")], { cwd: WS, encoding: "utf8", timeout: 120000 });',
    '  const outNav = (resNav.stdout || "") + (resNav.stderr || "");',
    '  const mNav = /全部通过：(\\d+) 项/.exec(outNav);',
    '  const fNav = /❌ (\\d+) 项未通过/.exec(outNav);',
    '  ok(resNav.status === 0 && mNav, "test-nav.js 全绿（点大纲 → 跳到对应行，真渲染）", mNav ? outNav.split("\\n").slice(-4).join(" | ") : outNav.slice(-400));',
    '  if (mNav) { pass += Number(mNav[1]); fail += Number(fNav ? fNav[1] : 0); console.log("  （子测试 " + mNav[1] + " 通过 / " + (fNav ? fNav[1] : 0) + " 失败，已并入总分）"); }',
    '}',
  ].join("\n"),
  "§9 test-nav"
);

fs.writeFileSync(p, s);
console.log("  ✓ verify-v052.js：已应用 " + n + " 处断言变更");
if (/su\.content|ui\[selection\]|划词助手源码已内联/.test(s)) {
  console.error("  ✗ 仍有划词助手残留断言");
  process.exit(1);
}
