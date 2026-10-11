"use strict";
/* =====================================================================
 * v0.9.13 补丁 —— 就地编辑浮层里的图没人补
 *
 * 三处，缺一不可：
 *   ① loadAssetsIn 收 done     —— 补图是异步的（要走一次 MCP），要能通知调用方
 *   ② loadPopAssets（新增）     —— 浮层走**同一条**资产通道，补完按新尺寸重摆位
 *   ③ 浮层摆位 effect 调它      —— 依赖带上 serverId（服务没起来时那一拍补不了）
 *
 * 为什么这么改，见 .setup/check/v0913-pop-assets.js 的抬头（那里有完整机制链）。
 *
 * 规矩（都是这个仓踩过的）：
 *   · 幂等：跑第二遍说「已经打过」并零改动退出；
 *   · 锚点：四处各自必须命中**恰好一次**才落盘 —— 任何一处对不上就整体不写，
 *     宁可没改，不可半改（半改的源码是最难查的一种）；
 *   · 行尾：先归一到 LF 再匹配，落盘时还原原行尾（历史上吃过「锚点按 LF 写、
 *     文件是全 CRLF、多行锚点一个都命不中」的亏）；
 *   · 用 split/join 精确替换，不用 slice 挪位置。
 *
 * 运行： node .setup/fix-v0913-pop-assets.js
 * =================================================================== */
const fs = require("fs");
const path = require("path");

const ws = "E:/notrat-latex-plugin";
const REL = "panels/editor.tsx";
const p = path.join(ws, REL);
const raw = fs.readFileSync(p, "utf8");
const eol = raw.indexOf("\r\n") >= 0 ? "\r\n" : "\n";
let src = raw.split("\r\n").join("\n");

function count(hay, needle) { return hay.split(needle).length - 1; }

/* ---------- 幂等哨兵：四处都打过 = 已完成 ---------- */
const MARKS = [
  /function loadAssetsIn\(root, done\)/,
  /const settle = function \(\) \{ pending--;/,
  /function loadPopAssets\(\) \{/,
  /loadPopAssets\(\);\n[\s\S]{0,200}?\}, \[atomEdit, serverId\]\);/,
];
const hit = MARKS.filter(function (re) { return re.test(src); }).length;
if (hit === MARKS.length) {
  console.log("已经打过（幂等）：" + REL + " 未改动");
  process.exit(0);
}
if (hit !== 0) {
  console.error("✗ 半打状态（哨兵 " + hit + "/" + MARKS.length + " 命中）：先人工确认，脚本不猜。");
  process.exit(1);
}

/* ---------- 四处补丁 ---------- */
const P1_FROM = [
  "  function loadAssetsIn(root) {",
  "    if (!root || !serverId) return;",
  "    const imgs = root.querySelectorAll(\"img[data-asset]:not([data-asset-queued])\");",
  "    for (let i = 0; i < imgs.length; i++) {",
].join("\n");

const P1_TO = [
  "  /* v0.9.13：加 done。补图是**异步**的（要走一次 MCP），而图到货会改容器尺寸 ——",
  "   * 调用方若是「按实测尺寸摆位」的浮层，必须等这一批全落地再摆一次；",
  "   * 早摆了就是拿「还没有图」那一版的高度钳的位置。 */",
  "  function loadAssetsIn(root, done) {",
  "    if (!root || !serverId) return;",
  "    const imgs = root.querySelectorAll(\"img[data-asset]:not([data-asset-queued])\");",
  "    /* 聚合而不是逐张回调：一批图里最后一张落地才算这一拍补完（否则会摆好几次） */",
  "    let pending = 0;",
  "    const settle = function () { pending--; if (pending <= 0 && done) done(); };",
  "    for (let i = 0; i < imgs.length; i++) {",
].join("\n");

const P2_FROM = [
  "      img.setAttribute(\"data-asset-queued\", \"1\");   // 只排队一次，避免每拍重复发起",
  "      if (assetCache.current.has(p)) { img.src = assetCache.current.get(p); continue; }",
  "      /* v0.9.12：插图通道 —— 带 kind:image，无扩展名路径按图片优先补全（.tex 垫底） */",
  "      callTool(\"latex_asset\", { path: p, kind: \"image\" }).then(function (out) {",
  "        try {",
  "          const a = JSON.parse(out);",
  "          if (a && a.dataUri) { assetCache.current.set(p, a.dataUri); img.src = a.dataUri; return; }",
  "        } catch (e) { /* fallthrough */ }",
  "        degradeRasterImg(img);",
  "      }).catch(function () { degradeRasterImg(img); });",
].join("\n");

const P2_TO = [
  "      img.setAttribute(\"data-asset-queued\", \"1\");   // 只排队一次，避免每拍重复发起",
  "      if (assetCache.current.has(p)) { img.src = assetCache.current.get(p); continue; }",
  "      pending++;",
  "      /* v0.9.12：插图通道 —— 带 kind:image，无扩展名路径按图片优先补全（.tex 垫底） */",
  "      callTool(\"latex_asset\", { path: p, kind: \"image\" }).then(function (out) {",
  "        try {",
  "          const a = JSON.parse(out);",
  "          if (a && a.dataUri) { assetCache.current.set(p, a.dataUri); img.src = a.dataUri; settle(); return; }",
  "        } catch (e) { /* fallthrough */ }",
  "        degradeRasterImg(img);",
  "        settle();   // 降级也算「这一张落地了」—— 占位 div 同样会改浮层高度",
  "      }).catch(function () { degradeRasterImg(img); settle(); });",
].join("\n");

const P3_FROM = [
  "    img.parentNode.replaceChild(d, img);",
  "  }",
  "",
  "  /* ================= v0.9.12：绘图环境卡「点一下就地渲染」 =================",
].join("\n");

const P3_TO = [
  "    img.parentNode.replaceChild(d, img);",
  "  }",
  "",
  "  /* v0.9.13：就地编辑浮层里的图，走**同一条**资产通道。",
  "   *",
  "   * 浮层的 HTML 是 React 用 dangerouslySetInnerHTML 塞进去的（atomPvHtml），",
  "   * 而 .wys-pop 是 .pv-root 的**兄弟节点** —— 「每拍补一次」只补 pvRef 那一棵，",
  "   * 浮层这一棵从来没人管。内核发出的插图标签只有 data-asset、没有 src，",
  "   * 而浏览器对「无 src 的 img」画的是**不可用态**：显示 alt 文本，alt 就是那个路径。",
  "   * 于是同一块图：页面上是真的，点开就地编辑只剩一行文件名（figs/fig-five-dim.pdf）。",
  "   *",
  "   * 补完必须重摆一次：图进来了浮层才长到该有的高度，「贴下沿 / 翻上方」得拿新尺寸算。",
  "   * 三条路都要覆盖 ——",
  "   *   · 缓存命中：loadAssetsIn 同步写 src（不打 MCP），settle 不会被调用；",
  "   *   · 未命中：MCP 到货后 settle → refit；",
  "   *   · 而 <img> 拿到 src 之后还要解码才占位，所以每张图的 load / error 再摆一次。",
  "   * 监听只挂一次（data-popfit）；重摆是幂等的 —— fitPopup 只写 style，不触发布局循环。",
  "   * 锚点取 atomEditRef（**不是**闭包里的 atomEdit）：effect 闭包抓的是那一拍的旧值。",
  "   * 图这里**故意不调 gfxRestore**：浮层里的绘图卡回填已渲染的图是另一件事，见 CHANGELOG 文末。 */",
  "  function loadPopAssets() {",
  "    const pop = popRef.current;",
  "    const a = atomEditRef.current;",
  "    if (!pop || !a) return;",
  "    const anchor = { left: a.x, bottom: a.ayBottom == null ? a.y : a.ayBottom, top: a.ayTop };",
  "    const refit = function () { fitPopup(pop, anchor); };",
  "    loadAssetsIn(pop, refit);",
  "    const imgs = pop.querySelectorAll(\"img[data-asset]\");",
  "    for (let i = 0; i < imgs.length; i++) {",
  "      const im = imgs[i];",
  "      if (im.getAttribute(\"data-popfit\")) continue;   // 同一张图只挂一次，别随重摆累积",
  "      im.setAttribute(\"data-popfit\", \"1\");",
  "      im.addEventListener(\"load\", refit);",
  "      im.addEventListener(\"error\", refit);           // 降级成占位 div 也会改高度",
  "    }",
  "  }",
  "",
  "  /* ================= v0.9.12：绘图环境卡「点一下就地渲染」 =================",
].join("\n");

const P4_FROM = [
  "  useLayoutEffect(() => {",
  "    if (!atomEdit) return;",
  "    fitPopup(popRef.current, { left: atomEdit.x, bottom: atomEdit.ayBottom == null ? atomEdit.y : atomEdit.ayBottom, top: atomEdit.ayTop });",
  "  }, [atomEdit]);",
].join("\n");

const P4_TO = [
  "  useLayoutEffect(() => {",
  "    if (!atomEdit) return;",
  "    fitPopup(popRef.current, { left: atomEdit.x, bottom: atomEdit.ayBottom == null ? atomEdit.y : atomEdit.ayBottom, top: atomEdit.ayTop });",
  "    /* v0.9.13：浮层里的图也得有人补（.wys-pop 不在 pvRef 那棵树里）—— 见 loadPopAssets。",
  "     * 依赖带上 serverId：服务还没起来时这一拍补不了（loadAssetsIn 直接返回），",
  "     * 起来之后必须补上，否则「先开浮层、后起服务」就永久缺那一张图。 */",
  "    loadPopAssets();",
  "  }, [atomEdit, serverId]);",
].join("\n");

const PATCHES = [
  { name: "① loadAssetsIn 收 done + settle 聚合", from: P1_FROM, to: P1_TO },
  { name: "② pending++ / settle()（到货与降级两条路都要通知）", from: P2_FROM, to: P2_TO },
  { name: "③ 新增 loadPopAssets（浮层走同一条资产通道 + 补完重摆位）", from: P3_FROM, to: P3_TO },
  { name: "④ 浮层摆位 effect 每拍调 loadPopAssets，依赖加 serverId", from: P4_FROM, to: P4_TO },
];

let changed = 0;
for (const pt of PATCHES) {
  const n = count(src, pt.from);
  if (n !== 1) {
    console.error("✗ 锚点命中 " + n + " 次（要求恰好 1 次）：" + pt.name);
    console.error("  整体不落盘，文件保持原样。");
    process.exit(1);
  }
  if (count(src, pt.to) > 0) {
    console.error("✗ 替换文本已经存在（疑似打过但哨兵没命中）：" + pt.name);
    process.exit(1);
  }
  src = src.split(pt.from).join(pt.to);
  changed++;
  console.log("  ok   " + pt.name);
}

/* ---------- 落盘前自检 ---------- */
const MUST = [
  "function loadAssetsIn(root, done) {",
  "const settle = function () { pending--; if (pending <= 0 && done) done(); };",
  "function loadPopAssets() {",
  "loadAssetsIn(pop, refit);",
  "loadPopAssets();",
  "}, [atomEdit, serverId]);",
];
for (const m of MUST) {
  if (count(src, m) < 1) { console.error("✗ 自检失败，缺少：" + m); process.exit(1); }
}
if (count(src, "useLayoutEffect(") < 2) { console.error("✗ 自检失败：useLayoutEffect 少了一个（v0911 门禁会红）"); process.exit(1); }
if (!/ref=\{popRef\}/.test(src)) { console.error("✗ 自检失败：popRef 的 ref 没了"); process.exit(1); }

/* ---------- 还原行尾后写回 ---------- */
const out = eol === "\r\n" ? src.split("\n").join("\r\n") : src;
fs.writeFileSync(p, out, "utf8");
console.log("\n✓ 落盘 " + REL + "：打了 " + changed + " 处，行尾 " + (eol === "\r\n" ? "CRLF" : "LF") +
  "，字节 " + Buffer.byteLength(raw, "utf8") + " → " + Buffer.byteLength(out, "utf8"));
