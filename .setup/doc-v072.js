/* v0.7.2 文档落库：manifest 版本 + README 顶部摘要 / 版本索引 / 文末复盘
 * 正文里的反引号用 @@ 占位，最后统一替换 —— 免得和模板字符串打架。 */
const fs = require("fs");
const path = require("path");

const ws = path.join(__dirname, "..");
const BT = String.fromCharCode(96);          // `
const code = (t) => BT + t + BT;

/* ---------- 1. 版本 ---------- */
const mf = path.join(ws, "manifest.json");
const m = JSON.parse(fs.readFileSync(mf, "utf8"));
if (m.version === "0.7.2") console.log("[=] manifest 已是 0.7.2");
else { console.log("[+] manifest " + m.version + " -> 0.7.2"); m.version = "0.7.2"; fs.writeFileSync(mf, JSON.stringify(m, null, 2) + "\n", "utf8"); }

const rm = path.join(ws, "README.md");
let doc = fs.readFileSync(rm, "utf8");
const eol = doc.includes("\r\n") ? "\r\n" : "\n";
if (eol === "\r\n") doc = doc.split("\r\n").join("\n");

/* ---------- 2. 顶部摘要 ---------- */
const sumAnchor = "> **v0.7.1：修一个「打开 " + BT + ".tex" + BT + " 就白屏」的 TDZ 崩溃**";
const summary = [
  "> **v0.7.2：三种视图都能就地编辑，不再「一编辑就掉进分屏」。**",
  "> 预览里点公式 / 图表卡片会被踢进分屏看源码 —— 根因是 " + code("gotoLine") + " 在源码面板不在场时直接",
  "> " + code("setView(\"split\")") + "。现在跳转一律不动视图（就在预览里滚过去闪一下），",
  "> 切视图只剩卡片上的「↗ 定位」这一条显式路径；原子卡片也从「LaTeX 原样堆在 " + code("<pre>") + " 里」",
  "> 改成用预览内核**富渲染**（公式是真公式、图表是真图表），源码按需展开。顶栏 14 个按钮精简到 6 个控件。",
  "> 详见 §v0.7.2。",
  ">",
  sumAnchor,
].join("\n");

if (doc.indexOf("v0.7.2：三种视图都能就地编辑") >= 0) console.log("[=] 顶部摘要已含 v0.7.2");
else if (doc.indexOf(sumAnchor) >= 0) { doc = doc.replace(sumAnchor, summary); console.log("[+] 顶部摘要已补 v0.7.2"); }
else { console.error("✗ 顶部摘要锚点未命中"); process.exit(1); }

/* ---------- 3. 版本索引 ---------- */
const idxFrom = "> 各版详见文末 §v0.7.1 /";
if (doc.indexOf("> 各版详见文末 §v0.7.2 /") >= 0) console.log("[=] 版本索引已含 v0.7.2");
else if (doc.indexOf(idxFrom) >= 0) { doc = doc.replace(idxFrom, "> 各版详见文末 §v0.7.2 / §v0.7.1 /"); console.log("[+] 版本索引已补 v0.7.2"); }
else { console.error("✗ 版本索引锚点未命中"); process.exit(1); }

/* ---------- 4. 文末复盘 ---------- */
const SECTION = [
  "",
  "## v0.7.2 — 三种视图都能就地编辑 / 不再「一编辑就掉进分屏」/ 顶栏底栏精简",
  "",
  "### 用户反馈（原话）",
  "",
  "1. 进行编辑的时候还是会进入到分栏里面",
  "2. 这几种模式应该都支持",
  "3. 就地编辑文档意思是在预览的情况下直接编辑，而不是由源代码展示出来",
  "4. 顶部和底部的很多功能可以去掉，优化UI",
  "",
  "### 根因：反馈 1 和 3 是同一个 bug",
  "",
  "`gotoLine()` 在源码 textarea 没挂载时**直接切分屏**：",
  "",
  "```js",
  "// 旧（0.7.1 及之前）",
  "function gotoLine(ln, opts) {",
  "  const ta = taRef.current;",
  "  if (!ta) {",
  "    pendingReveal.current = { ln: ln, ... };",
  "    if (view === \"preview\") setView(\"split\");   // ← 「一编辑就掉进分栏」就是这一行",
  "    return false;",
  "  }",
  "  ...",
  "}",
  "```",
  "",
  "而就地编辑层里**每张原子卡片都带** `data-line`（点一下跳源码），`onPreviewClick` 又是",
  "「点带 `data-line` 的节点就跳源码」——于是在预览里点一下公式 / 图表卡片，就被踢进分屏看见源码。",
  "这正是反馈 3 说的「由源代码展示出来」。",
  "",
  "再加一层：卡片此前把块的 LaTeX **原样塞进** `<pre class=\"wys-card-src\">`（超过 800 字符还截断），",
  "所谓「就地编辑」看到的全是源码，确实不像在预览里编辑。",
  "",
  "### 改法（逐条对反馈）",
  "",
  "| 反馈 | 改动 |",
  "|---|---|",
  "| 1 编辑进分栏 | `gotoLine` 不再切视图：源码面板不在场时**在预览里滚过去闪一下**（返回 `true`，照常回 ACK）。切视图只剩卡片上的「↗ 定位」这一条显式路径（`gotoSourceAt`） |",
  "| 2 几种模式都支持 | 三档视图都在；宿主标题栏切回「可视化」时按 `lastPvView` 还原（分屏 / 预览），不再一律拍回预览；分屏也回写 `wysiwyg`，标题栏开关不再骗人 |",
  "| 3 就地编辑 = 预览里改 | 原子卡片改用只读预览内核**富渲染**（公式是真公式、图表是真图表、参考文献是真列表），源码收进卡片右上角「{ } 源码」按需展开 |",
  "| 4 UI 精简 | 顶栏 14 个按钮 → 视图分段控件 + 就地编辑开关 + 「＋ 插入」菜单 + 编译 / 校验 + 一个状态点；底栏改成「有结果才出现」；状态栏去掉行数与中英拆分 |",
  "",
  "### 几处关键实现",
  "",
  "**1. 卡片富渲染 + 行号平移**",
  "",
  "```js",
  "function richBlockHtml(raw, renderMath, baseDir, startLine) {",
  "  // 把块原文交给 LPC.renderPreview —— 与只读预览同一套内核，所见即所得",
  "  let html = LPC.renderPreview(src, { renderMath, baseDir }).html;",
  "  // 片段渲染出来的 data-line 是「片段内相对行号」，整体平移成 1 基绝对行号（与卡片自身一致）",
  "  html = html.replace(/data-line=\"(\\\\d+)\"/g, (s, n) => 'data-line=\"' + (parseInt(n, 10) + shift) + '\"');",
  "}",
  "```",
  "",
  "> 第一版平移写成了 `startLine - min`（0 基），DOM 验收立刻抓到「卡片 L55 里出现 data-line=54」，",
  "> 改成 `(startLine + 1) - min` 才对上卡片的 1 基约定。**这条是验收门抓出来的，不是想出来的。**",
  "",
  "兜底：块 >2 万字符或富渲染抛错 → 退回源码 `<pre style=\"display:block\">`，绝不因此炸掉整篇。",
  "",
  "**2. 卡片工具条走 mousedown，不走 click**",
  "",
  "若等 `click`：焦点先从正在编辑的块上掉下来 → `blur` → `commitWys` → `onChange` → 整层 `innerHTML` 重建",
  "→ 按钮连同它的事件一起没了，**点了没反应**。所以在 `mousedown` 阶段处理 + `preventDefault()` 保住焦点。",
  "",
  "**3. `baseDir` 上移到 `wys` 之前**",
  "",
  "卡片要按 `baseDir` 解析图，于是 `baseDir` 又进了 `wys` 的依赖数组 —— 依赖数组是**渲染期立即求值**的，",
  "声明写在后面就是 0.7.0 那个 TDZ 事故重演。这次是**顺序哨兵先拦住**，才没重演。",
  "",
  "**4. 图片懒加载改成「每拍补一次未排队的图」**",
  "",
  "富渲染的卡片里也有 `<img data-asset>`，原来只在 `pv.html` 变化时跑会漏掉它们（切「就地编辑」开关时 `pv.html` 没变）。",
  "现在注入后统一 `loadAssetsIn(root)`，拿到的 dataURI 进 `assetCache`，DOM 重建也能同步命中。",
  "",
  "### 验收",
  "",
  "验收门仍是四层，`npm run gate` 一条命令：",
  "",
  "```",
  "[1] TDZ 顺序哨兵    ✓ 自检通过 + 36 项依赖全部有序",
  "[2] 内核单测        ✓ 44 项",
  "[3] 面板离线编译     ✓",
  "[4] 真 DOM 往返     ✓ 27 项（v0.7.2 新增 9 项）",
  "```",
  "",
  "新增的 9 项专盯这次改动：",
  "",
  "- 卡片里有富渲染出来的 `.pv-eq`（公式真的被渲染了）",
  "- 卡片同时保留源码 `pre.wys-card-src`，可随时切回",
  "- 默认视图是富预览：卡片正文里**不再出现** LaTeX 源码字样",
  "- 每张卡片都有「源码」「定位」两个显式出口",
  "- 卡片内富渲染的 `data-line` 已平移成绝对行号（≥ 卡片起始行）",
  "- `gotoLine` 里没有「预览就切分屏」的老逻辑；`revealInPreview` / `gotoSourceAt` 存在",
  "",
  "### 已知边界",
  "",
  "- 卡片内**嵌套**节点的行号可能偏 1（preview-core 对不同节点用了不同基准，只整体平移一层）。",
  "  只影响「划词引用」带出的行号提示，不影响编辑与回写。",
  "- 「＋ 插入」菜单只在源码 / 分屏出现 —— 纯预览视图里没有 textarea，插了也落不到光标处。",
  "- Enter 仍是块内换行；跨块撤销仍只有 toast 那一次（与 v0.7.0 一致）。",
  "",
].join("\n");

if (doc.indexOf("## v0.7.2 — 三种视图都能就地编辑") >= 0) console.log("[=] 文末复盘已存在");
else { doc = doc.replace(/\s*$/, "\n") + SECTION; console.log("[+] 文末复盘已追加"); }

doc = doc.split("@@").join(BT);
fs.writeFileSync(rm, doc.split("\n").join(eol), "utf8");
console.log("done");
