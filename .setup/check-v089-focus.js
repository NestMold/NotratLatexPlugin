/* 层 [12] —— Ctrl+/ 连续往返：切过去还能切回来（不碰鼠标）（v0.8.9 加）
 *
 * 为什么单开一层：
 *   Ctrl+/ 与格式快捷键的监听**故意**挂在编辑器根节点上（多开 .tex 时只有拿到焦点的实例
 *   能收到，不会两边各翻一次）。而切档是**把带焦点的那个子树整个卸载** —— 浏览器把
 *   activeElement 扔回 <body>，而 <body> 不是根节点的子孙，于是 keydown 再也到不了那两个
 *   监听器。「第一次能切、切完就切不动」的根因就在这里，而它跟"代码长什么样"无关：
 *   每行都写得对，问题出在**焦点在哪**这个运行时状态上 —— 只能把组件挂起来、连着切几轮才看得见。
 *
 * 这一层依赖 harness 的一处真实化改动（test-nav.js 的 attachRefs）：
 *   带焦点的节点被移除时把 document.activeElement 置空 —— 与浏览器一致。
 *   少了它，假 DOM 里「卸载」永远不表现为失焦，这个 bug 会被整套绿色用例掩盖。
 *
 * 三段：
 *   [1] 真渲染（源码）
 *   [2] 真渲染（产物）：同一套断言，换成装机产物里那份编辑器源码
 *   [3] 产物静态核对：tabIndex 与焦点回拉 effect 的标记必须在发布出去的那份源码里
 *
 * 运行： node .setup/check-v089-focus.js
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const DIR = __dirname;
const WS = path.join(DIR, "..");
const M = "C:/Users/Administrator/.notrat/plugins/notrat-latex-plugin.json";
let fail = 0;

/* ---------- harness 复用 ---------- */
const nav = fs.readFileSync(path.join(DIR, "test-nav.js"), "utf8");
const cut = nav.indexOf("\n(async function ()");
if (cut < 0) {
  console.error("✗ test-nav.js 结构变了：找不到 IIFE 起点 —— harness 复用不了（先修这一层）");
  process.exit(1);
}
const headSrc = nav.slice(0, cut);

/* 探针体 = 单一来源；只把结尾的「红了也算成功」（复现工具语义）换成门禁语义 */
const PROBE_TAIL = "  process.exitCode = 0;   // 探针是复现工具：红了才算复现成功，不据此判失败";
let body = fs.readFileSync(path.join(DIR, "_probe-focus.body.js"), "utf8");
if (body.indexOf(PROBE_TAIL) < 0) {
  console.error("✗ 探针体结尾变了：找不到「红了也算成功」那一行 —— 门禁语义无法切换");
  process.exit(1);
}
body = body.split(PROBE_TAIL).join("  process.exitCode = fail ? 1 : 0;");

/* ---------- 装机产物里那份编辑器源码 ---------- */
let artRaw = "";
try { artRaw = fs.readFileSync(M, "utf8"); } catch (e) {}
const artEditor = artRaw
  ? String((JSON.parse(artRaw).contributions.editors[0] || {}).source || "")
  : "";
if (artEditor) fs.writeFileSync(path.join(DIR, "_prod-editor.js"), artEditor, "utf8");

function run(label, head, tmpName) {
  console.log("\n" + label);
  console.log("-".repeat(64));
  const tmp = path.join(DIR, tmpName);
  fs.writeFileSync(tmp, head + "\n" + body, "utf8");
  const r = spawnSync(process.execPath, [tmp], { stdio: "inherit", cwd: WS });
  if (r.status !== 0) fail++;
}

/* ---------- [1] 源码 ---------- */
run("[1] 真渲染 · 源码 panels/editor.tsx", headSrc, "_tmp-focus-gate.js");

/* ---------- [2] 产物 ---------- */
const SWAP = 'path.join(WS, "panels", "editor.tsx")';
if (!artEditor) {
  console.log("\n[2] 真渲染 · 装机产物");
  console.log("-".repeat(64));
  console.log("  FAIL  读不到装机产物：" + M + "（先 npm run build）");
  fail++;
} else if (headSrc.indexOf(SWAP) < 0) {
  console.log("\n[2] 真渲染 · 装机产物");
  console.log("-".repeat(64));
  console.log("  FAIL  test-nav.js 里读源码那一行变了，产物替换点找不到：" + SWAP);
  fail++;
} else {
  const headProd = headSrc.split(SWAP).join('path.join(WS, ".setup", "_prod-editor.js")');
  run("[2] 真渲染 · 装机产物（同一套断言，换源码）", headProd, "_tmp-focus-gate-prod.js");
}

/* ---------- [3] 产物静态核对 ---------- */
console.log("\n[3] 装机产物：焦点修复的标记在不在发布出去的那份源码里");
console.log("-".repeat(64));
if (!artEditor) {
  console.log("  FAIL  产物不可读，跳过核对");
  fail++;
} else {
  const j = JSON.parse(artRaw);
  const prod = artEditor.replace(/\r\n/g, "\n");
  console.log("  产物版本：" + j.version + "   编辑器源码长度：" + prod.length);
  const marks = [
    ["根节点可编程聚焦（tabIndex={-1}）", "tabIndex={-1}"],
    ["焦点守卫的相位键（改名 + 从 view 换成 focusGuardKey）", "const focusGuardRef = useRef(focusGuardKey);"],
    ["只在焦点掉到文档外沿时才拉", "if (ae && ae !== d.body && ae !== d.documentElement) return;"],
    ["源码档落到 textarea", 'try { ta.focus(); return; } catch (e) {}'],
    ["可视化侧落到根节点", 'try { root.focus(); } catch (e) {}'],
    /* 防「修过头」：这几条是既有的、不能被这次改动带坏的行为 */
    ["v0.8.8 往返修复仍在", "if (!root) {\n      wysEditing.current = false;"],
    ["监听仍挂在根节点（不是 window）", 'root.addEventListener("keydown", onCtrlSlash, true);'],
    /* v0.8.10：另一半 —— 焦点被按钮夺走（点工具栏之后编辑器"死"了） */
    ["根节点捕获 mousedown 守卫", 'root.addEventListener("mousedown", onRootMouseDown, true);'],
    ["只在点的是按钮时才拦", 'if (!t.closest("button")) return;'],
    ["守卫键覆盖就地编辑浮层", 'view + "|" + (atomEdit ? "atom" : "")'],
    ["守卫键覆盖划词气泡与导出菜单", '"|" + (quote ? "quote" : "") + "|" + (exMenu ? "exMenu" : "")'],
  ];
  for (const [name, s] of marks) {
    const hit = prod.includes(s);
    if (!hit) fail++;
    console.log((hit ? "  ok    " : "  FAIL  ") + name);
  }
}

console.log("\n" + (fail === 0 ? "✓ 焦点层全绿" : "✗ 焦点层有 " + fail + " 处未通过"));
process.exit(fail === 0 ? 0 : 1);
