/* 层 [11] —— 切视图往返：可视化 → 源码 → 回可视化，正文必须还在（v0.8.8 加）
 *
 * 为什么单开一层：
 *   这不是「代码长什么样」的问题，是**生命周期**问题 —— wysEditing 这个「DOM 就是权威」
 *   的相位标志，在预览层被**卸载**时无人复位（focusout 只在焦点真的移走时才来；
 *   Ctrl+/ 换档压根不动焦点，卸载更不产生它）。相位留在 true 的后果有两个：
 *     ① 回程新挂载的预览层被 paint 那道守卫饿死 → 一片空白（用户报的「切回来无法展示」）；
 *     ② 离场那次 commitWys() 直接早退 → 刚在预览里敲的字静默丢掉。
 *   静态抠源码看不出来（那几行每行都「对」），必须把组件真挂载起来往返切一次。
 *
 * 三段：
 *   [1] 真渲染（源码）：复用 test-nav.js 的挂载 harness（esbuild → 迷你 React → 假 DOM）
 *   [2] 真渲染（产物）：同一套断言，但把编辑器源码换成**装机产物里那一份** ——
 *       「源码修了、产物没重建」这种事故，只有拿产物真跑一遍才拦得住
 *   [3] 产物静态核对：四处修复的标记必须在发布出去的那份源码里
 *
 * 运行： node .setup/check-v087-roundtrip.js
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const DIR = __dirname;
const WS = path.join(DIR, "..");
const M = "C:/Users/Administrator/.notrat/plugins/notrat-latex-plugin.json";
let fail = 0;

/* ---------- harness 复用：test-nav.js 的 IIFE 之前那半截 ---------- */
const nav = fs.readFileSync(path.join(DIR, "test-nav.js"), "utf8");
const cut = nav.indexOf("\n(async function ()");
if (cut < 0) {
  console.error("✗ test-nav.js 结构变了：找不到 IIFE 起点 —— harness 复用不了（先修这一层）");
  process.exit(1);
}
const headSrc = nav.slice(0, cut);
const body = fs.readFileSync(path.join(DIR, "check-v087-roundtrip.body.js"), "utf8");

/* 产物里那份编辑器源码（单文件包内联的就是它） */
let artRaw = "";
try { artRaw = fs.readFileSync(M, "utf8"); } catch (e) {}
const artEditor = artRaw
  ? String((JSON.parse(artRaw).contributions.editors[0] || {}).source || "")
  : "";
const PROD = path.join(DIR, "_prod-editor.js");
if (artEditor) fs.writeFileSync(PROD, artEditor, "utf8");

function run(label, head, tmpName) {
  console.log("\n" + label);
  console.log("-".repeat(64));
  const tmp = path.join(DIR, tmpName);
  fs.writeFileSync(tmp, head + "\n" + body, "utf8");
  const r = spawnSync(process.execPath, [tmp], { stdio: "inherit", cwd: WS });
  if (r.status !== 0) fail++;
}

/* ---------- [1] 源码真渲染 ---------- */
run("[1] 真渲染 · 源码 panels/editor.tsx", headSrc, "_tmp-roundtrip-gate.js");

/* ---------- [2] 产物真渲染 ---------- */
if (!artEditor) {
  console.log("\n[2] 真渲染 · 装机产物");
  console.log("-".repeat(64));
  console.log("  FAIL  读不到装机产物：" + M + "（先 npm run build）");
  fail++;
} else {
  const SWAP = 'path.join(WS, "panels", "editor.tsx")';
  if (headSrc.indexOf(SWAP) < 0) {
    console.log("\n[2] 真渲染 · 装机产物");
    console.log("-".repeat(64));
    console.log("  FAIL  test-nav.js 里读源码那一行变了，产物替换点找不到：" + SWAP);
    fail++;
  } else {
    const headProd = headSrc.split(SWAP).join('path.join(WS, ".setup", "_prod-editor.js")');
    run("[2] 真渲染 · 装机产物（同一套断言，换源码）", headProd, "_tmp-roundtrip-gate-prod.js");
  }
}

/* ---------- [3] 产物静态核对 ---------- */
console.log("\n[3] 装机产物：四处修复的标记在不在发布出去的那份源码里");
console.log("-".repeat(64));
if (!artEditor) {
  console.log("  FAIL  产物不可读，跳过核对");
  fail++;
} else {
  const j = JSON.parse(artRaw);
  const prod = artEditor.replace(/\r\n/g, "\n");
  console.log("  产物版本：" + j.version + "   编辑器源码长度：" + prod.length);
  const marks = [
    ["goView 离场先收尾（调 leavePreview）", 'if (view === "preview" && v !== "preview") leavePreview();'],
    ["leavePreview 本体（复位相位 + commitWys）", "function leavePreview() {"],
    ["宿主 mode 下发：切离可视化侧同样收尾", 'if (v !== "preview" && view === "preview") leavePreview();'],
    ["paint 守卫：预览未挂载即复位相位", "if (!root) {\n      wysEditing.current = false;"],
  ];
  for (const [name, s] of marks) {
    const hit = prod.includes(s);
    if (!hit) fail++;
    console.log((hit ? "  ok    " : "  FAIL  ") + name);
  }
}

console.log("\n" + (fail === 0 ? "✓ 往返层全绿" : "✗ 往返层有 " + fail + " 处未通过"));
process.exit(fail === 0 ? 0 : 1);
