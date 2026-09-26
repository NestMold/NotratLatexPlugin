#!/usr/bin/env node
/**
 * v0.7.1 文档与版本落库：
 *   1) manifest.json 版本 0.7.0 -> 0.7.1
 *   2) README 顶部摘要补 v0.7.1 段，并把 §v0.7.1 加进索引
 *   3) README「故障实录（防复发）」补 0.7.0 事故条目
 *   4) README 文末追加 §v0.7.1 完整复盘
 * 幂等：已写过就跳过。
 */
const fs = require("fs");
const path = require("path");

const ws = path.join(__dirname, "..");
const mf = path.join(ws, "manifest.json");
const rm = path.join(ws, "README.md");

/* ---------- 1. 版本号 ---------- */
const m = JSON.parse(fs.readFileSync(mf, "utf8"));
if (m.version === "0.7.1") {
  console.log("[=] manifest.json 已是 0.7.1");
} else {
  console.log("[+] manifest.json 版本 " + m.version + " -> 0.7.1");
  m.version = "0.7.1";
  fs.writeFileSync(mf, JSON.stringify(m, null, 2) + "\n", "utf8");
}

let doc = fs.readFileSync(rm, "utf8");
const eol = doc.includes("\r\n") ? "\r\n" : "\n";
if (eol === "\r\n") doc = doc.split("\r\n").join("\n");

/* ---------- 2. 顶部摘要 ---------- */
const SUMMARY_ANCHOR = "未编辑的字节逐字节保留。内核在 `server/wysiwyg.js`，构建期以 IIFE 内联进编辑器源码。";
const SUMMARY_ADD = [
  ">",
  "> **v0.7.1：修一个「打开 `.tex` 就白屏」的 TDZ 崩溃**",
  "> （`Cannot access 'renderMath' before initialization`）——依赖数组渲染期立即求值，",
  "> 而 `const` 声明写在它后面。并新增「顺序哨兵」作为验收门第 [1] 层（esbuild/tsc 都不报此类错）。",
  "> 详见 §v0.7.1。",
].join("\n");

if (doc.includes("v0.7.1：修一个「打开 `.tex` 就白屏」的 TDZ 崩溃")) {
  console.log("[=] 顶部摘要已含 v0.7.1");
} else if (doc.includes(SUMMARY_ANCHOR)) {
  doc = doc.replace(SUMMARY_ANCHOR, SUMMARY_ANCHOR + "\n" + SUMMARY_ADD);
  console.log("[+] 顶部摘要已补 v0.7.1");
} else {
  console.error("✗ 顶部摘要锚点未找到");
  process.exit(1);
}

if (doc.includes("各版详见文末 §v0.7.1 /")) {
  console.log("[=] 版本索引已含 §v0.7.1");
} else if (doc.includes("各版详见文末 §v0.7.0 /")) {
  doc = doc.replace("各版详见文末 §v0.7.0 /", "各版详见文末 §v0.7.1 / §v0.7.0 /");
  console.log("[+] 版本索引已补 §v0.7.1");
} else {
  console.error("✗ 版本索引锚点未找到");
  process.exit(1);
}

/* ---------- 3. 故障实录 ---------- */
const INCIDENT_ANCHOR = "  检查 `typeof exports.default`。";
const INCIDENT_ADD = [
  "- **0.7.0**：`panels/editor.tsx` 的 `const wys = useMemo(..., [content, renderMath])` 写在",
  "  `const renderMath = useMemo(...)` **之前**（393 行用 / 705 行声明）→ 依赖数组渲染期立即求值",
  "  → 打开任意 `.tex` 直接白屏：`ReferenceError: Cannot access 'renderMath' before initialization`。",
  "  修复（0.7.1）：声明整块上移（依赖项 `katexVer` / `katexOkRef` 本就在上方，逻辑零改动）；",
  "  新增 `.setup/check-tdz.js` 顺序哨兵并作为验收门第 [1] 层。",
  "  **教训：esbuild / tsc 都不报 TDZ，「编译通过」对顺序错误零保证 —— 必须静态查。**",
].join("\n");

if (doc.includes("**教训：esbuild / tsc 都不报 TDZ")) {
  console.log("[=] 故障实录已含 0.7.0 条目");
} else if (doc.includes(INCIDENT_ANCHOR)) {
  doc = doc.replace(INCIDENT_ANCHOR, INCIDENT_ANCHOR + "\n" + INCIDENT_ADD);
  console.log("[+] 故障实录已补 0.7.0 条目");
} else {
  console.error("✗ 故障实录锚点未找到");
  process.exit(1);
}

/* ---------- 4. 文末复盘 ---------- */
const SECTION = [
  "",
  "## v0.7.1 — 修 TDZ 崩溃：`Cannot access 'renderMath' before initialization`",
  "",
  "### 现象",
  "",
  "0.7.0 装机后，**打开任意 `.tex` 文件编辑器直接白屏**，控制台抛：",
  "",
  "```",
  "ReferenceError: Cannot access 'renderMath' before initialization",
  "```",
  "",
  "### 根因",
  "",
  "`panels/editor.tsx` 里，两处都在**同一个组件函数体**内：",
  "",
  "```tsx",
  "const wys = useMemo(() => {",
  "  try { return { html: wysRenderDoc(content, renderMath) }; }   // 405 行",
  "  catch (e) { /* ... */ }",
  "}, [content, renderMath]);                                      // ← 依赖数组",
  "// ... 中间隔着近 300 行 ...",
  "const renderMath = useMemo(() => {",
  "  if (katexOkRef.current && window.katex) { /* KaTeX 分支 */ }",
  "  return (tex, disp) => LPC.miniMath(tex, disp);",
  "}, [katexVer]);                                                 // 394 行（修复后）",
  "```",
  "",
  "`renderMath` 用 `const` 声明 → 存在**暂时性死区（TDZ）**。组件函数体自上而下同步执行，",
  "第 405 行的依赖数组是**渲染期立即求值**的（只有 `useMemo` 的工厂函数体才是延迟执行），",
  "执行到那一行时 `renderMath` 尚未初始化 → 抛错，整个编辑器挂掉。",
  "",
  "**关键：炸的是依赖数组，不是回调体。** 若 `renderMath` 只在工厂函数内部被引用，",
  "`useMemo` 可能要等到「该 memo 真的需要重算」才跑，反而可能侥幸不炸 ——",
  "这正是这个 bug 容易写出来、也容易漏测的原因。",
  "",
  "### 为什么编译期查不出来",
  "",
  "`esbuild` / `tsc` 都**不报**这个错：它不是语法错，也不是类型错 ——",
  "类型上 `renderMath` 完全合法，只是**初始化时机**不对。",
  "",
  "0.7.0 的三层验收门（内核单测 / 面板离线编译 / 真 DOM 往返）当时**全绿**，线上照样白屏。",
  "**「编译通过」对这类顺序问题零保证。**",
  "",
  "### 修法",
  "",
  "把 `renderMath` 的 `useMemo` 声明整块上移到 `wys` 之前。上移前已核对依赖项：",
  "`katexVer`（`useState`，359 行）与 `katexOkRef`（`useRef`，373 行）**都在目标点之前**，",
  "因此**无需改动任何逻辑**，纯顺序调整。",
  "",
  "修复脚本存档 `.setup/fix-tdz-rendermath.js`（幂等，带锚点断言与「块外不得再有引用」安全检查）。",
  "",
  "### 防复发：新增「顺序哨兵」",
  "",
  "新增 **`.setup/check-tdz.js`**，并作为验收门**第 [1] 层**（最先跑，fail fast）：",
  "",
  "对每个 hooks 依赖数组 `[a, b, c]` 里的标识符 `X`：",
  "",
  "| 情形 | 判定 |",
  "|---|---|",
  "| 本文件有**同时或更早**的声明 | ok |",
  "| 本文件只有**更晚**的声明 | ✗ TDZ（运行时会炸） |",
  "| 本文件没有该声明（props / import / 全局） | 跳过，不猜 |",
  "| `function` 声明 | 天然提升，不参与判定 |",
  "",
  "哨兵**自带自检**（否则等于没有）：",
  "",
  "- 喂修复前的坏文件 → 必须报警。实测命中「使用行 396 → 声明行 705」，退出码 1。",
  "- 扫修复后的真源码 → 必须全绿。实测 7 个面板 / 36 项依赖全部有序，退出码 0。",
  "",
  "### 验收",
  "",
  "验收门从三层变四层，`npm run gate` 一条命令跑完：",
  "",
  "```",
  "[1] TDZ 顺序哨兵    ✓ 36 项依赖全部有序",
  "[2] 内核单测        ✓ 44 项",
  "[3] 面板离线编译     ✓",
  "[4] 真 DOM 往返     ✓ 19 项",
  "```",
  "",
  "产物级复核（直接读装机 JSON，不信任「我改过了」）：",
  "",
  "```",
  "renderMath 声明位置: 59892",
  "wys 使用位置:        60308   ✓ 声明先于使用",
  "wys 依赖数组位置:    60523   ✓ 在声明之后",
  "```",
  "",
].join("\n");

if (doc.includes("## v0.7.1 — 修 TDZ 崩溃")) {
  console.log("[=] 文末复盘已存在");
} else {
  doc = doc.replace(/\s*$/, "\n") + SECTION;
  console.log("[+] 文末复盘已追加");
}

fs.writeFileSync(rm, doc.split("\n").join(eol), "utf8");
console.log("done");
