/* v0.6.1 README 同步：摘掉划词助手章节 + 记下跳转修复 + 更新验收数字 */
const fs = require("fs");
const p = "E:/notrat-latex-plugin/README.md";
let s = fs.readFileSync(p, "utf8");
let n = 0;
function rep(a, b, label) {
  const k = s.split(a).length - 1;
  if (k !== 1) { console.error("MISS(" + k + "): " + label); process.exit(1); }
  s = s.split(a).join(b);
  n++;
}
function cut(a, end, label) {
  const i = s.indexOf(a);
  if (i < 0) { console.error("MISS start: " + label); process.exit(1); }
  const j = s.indexOf(end, i + a.length);
  if (j < 0) { console.error("MISS end: " + label); process.exit(1); }
  s = s.slice(0, i) + s.slice(j);
  n++;
}

/* 1. 顶部 banner：四件事 → 三件事 */
rep(
  [
    '> **v0.6.0 起是「编辑器 + 大纲 + 划词助手 + 文件树右键」四件事。**',
    '> 贡献面 = `editors` + `ui@outline` + `ui@right-panel` + `fileTreeMenus` + `settings`。',
    '> v0.5.2 曾一度收敛到「编辑器 + 大纲」（整页、编辑器工具条、标签栏徽章、悬浮器、活动栏、状态栏、',
    '> 输入框提示、markdown 代码块渲染器、6 条对话命令、编译前快照钩子下线 —— 源码仍保留在 `panels/`，',
    '> 随时可重新注册）；v0.6.0 按需把**划词助手**（`right-panel`）与 **`.tex` 右键编译 / 校验**',
    '> （`fileTreeMenus`）接了回来。两版分别见文末 §v0.6.0 与 §v0.5.2。',
  ].join("\n"),
  [
    '> **v0.6.1 起是「编辑器 + 大纲 + 文件树右键」三件事。**',
    '> 贡献面 = `editors` + `ui@outline` + `fileTreeMenus` + `settings`。',
    '> v0.5.2 曾收敛到「编辑器 + 大纲」；v0.6.0 把划词助手（`right-panel`）与 `.tex` 右键编译 / 校验',
    '> （`fileTreeMenus`）接了回来；**v0.6.1 按需求摘掉划词助手**（源码归档在 `panels/_unused/selection.tsx`，',
    '> 要接回只需加一条 manifest），并修掉「点大纲不跳」、移除编辑器内嵌大纲。',
    '> 各版详见文末 §v0.6.1 / §v0.6.0 / §v0.5.2。',
  ].join("\n"),
  "banner"
);

/* 2. §2 大纲：补上跳转修复与「编辑器内不再有大纲」 */
rep(
  '- 点击条目 → 滚到源码对应行 + 该行闪烁一下（"跳过去了"要看得见）+ 回执 ACK',
  [
    '- 点击条目 → 滚到源码对应行 + 该行闪烁一下（"跳过去了"要看得见）+ 回执 ACK',
    '  - **v0.6.1 修**：以前在「可视化」视图下点条目**没反应** —— 源码 textarea 那时没挂载，跳转当拍直接',
    '    返回，却照样回 ACK，于是面板以为跳成功、兜底也不触发。现在跳不成会把行号挂起来，等切到含源码的',
    '    视图再补跳（并补回执）；文件没在编辑器里打开时的兜底重试从 1 拍加到 3 拍',
    '  - 章节导航**只有左侧这个面板**：v0.6.1 起编辑器内不再内嵌大纲列，画面整块还给源码与预览',
  ].join("\n"),
  "§2 大纲 bullets"
);

/* 3. 摘掉划词助手整节，并把后面两节编号前移 */
cut('### 3. 划词助手（`ui.location = "right-panel"`）', "### 4. 文件树右键菜单", "划词助手整节");
rep(
  '### 4. 文件树右键菜单（`fileTreeMenus`，只对 `.tex` 生效）',
  '### 3. 文件树右键菜单（`fileTreeMenus`，只对 `.tex` 生效）',
  "文件树菜单编号"
);
rep(
  '### 5. MCP 工具（server 侧，共 8 个）',
  '### 4. MCP 工具（server 侧，共 8 个）',
  "MCP 工具编号"
);

/* 4. 开发命令块 */
rep(
  [
    'node .setup/verify-v052.js                   # 验收（81 项，退出码 0/1）',
    'node .setup/test-v052.js                     # MCP 冒烟：工具表 + 大纲双通路（21 项）',
    'node .setup/test-outline-render.js           # 大纲面板渲染/交互（21 项）',
  ].join("\n"),
  [
    'node .setup/verify-v052.js                   # 验收（172 项，退出码 0/1；已含下方三个子测试）',
    'node .setup/test-v052.js                     # MCP 冒烟：工具表 + 大纲双通路（24 项）',
    'node .setup/test-nav.js                      # 点大纲 → 跳到对应行（真渲染编辑器，18 项）',
    'node .setup/test-activefile.js               # 活动文件桥（50 项）',
    'node .setup/test-outline-render.js           # 大纲面板渲染/交互（21 项）',
  ].join("\n"),
  "开发命令块"
);

/* 5. 测试清单表：修 53 → 50，并补 test-nav 一行 */
rep(
  '| `.setup/test-activefile.js` | 活动文件桥（生产者广播 + 消费者 hook + 各面板接线） | ✅ 53 项 |',
  [
    '| `.setup/test-activefile.js` | 活动文件桥（生产者广播 + 消费者 hook + 各面板接线） | ✅ 50 项（v0.6.1 起并进验收门） |',
    '| `.setup/test-nav.js`（**新增**） | 「点大纲 → 跳到对应行」**真渲染编辑器**：ACK 真伪 / 落点行号 / 选区偏移 / 切视图补跳 | ✅ 18 项（并进验收门） |',
  ].join("\n"),
  "测试清单表"
);
rep(
  '| `.setup/test-activefile.js`（53 项） | 事件桥回归（旧断言已按新契约更新） |',
  '| `.setup/test-activefile.js`（50 项） | 事件桥回归（旧断言已按新契约更新） |',
  "v0.5.3 表"
);

/* 6. 追加 v0.6.1 章节 */
s = s.replace(/\s*$/, "\n");
s += [
  "",
  "## v0.6.1 — 摘掉划词助手 / 修「点大纲不跳」/ 移除编辑器内大纲",
  "",
  "三件事，对应三条明确的需求反馈。",
  "",
  "### 1. 划词助手摘除（`ui@right-panel` 下线）",
  "",
  "- `manifest.json` 去掉 `latex-selection` 那条 `ui` 贡献；贡献面回到 `editors + ui@outline + fileTreeMenus + settings`",
  "- 源码**归档**到 `panels/_unused/selection.tsx`（不是删掉）：要接回只需把那条贡献加回 manifest 再打包",
  "- 部署包从 138KB 瘦到 114KB（内联组件 3 → 2）",
  "",
  "### 2. 「点大纲没跳过去」—— 真凶是异步 setState + 撒谎的回执",
  "",
  "现象：在**可视化**视图下点左侧大纲，编辑器毫无反应，也没有任何提示。",
  "",
  "根因（读代码只能猜到一半，真渲染才钉死）：",
  "",
  "```js",
  "// 老实现（panels/editor.tsx）",
  "function gotoLine(ln, opts) {",
  "  if (view === \"preview\") setView(\"split\");   // ← setState 是异步的，这一拍不会立刻重渲染",
  "  const ta = taRef.current; if (!ta) return;   // ← 可视化视图下源码 textarea 没挂载 ⇒ 直接 return",
  "  ...",
  "}",
  "// 上层 onReveal：不管 gotoLine 有没有真跳，都无条件回 ACK",
  "```",
  "",
  "宿主 `useEditorStore` 的默认 `editorMode` 就是 `\"wysiwyg\"`（`.setup/host/renderer.js` 里 `editorMode:\"wysiwyg\"`）",
  "⇒ 打开 `.tex` 默认落在可视化视图 ⇒ `showSrc = false` ⇒ 源码 textarea 根本没挂载。",
  "两件事叠加起来就是「不跳 + 面板以为跳成功 + 兜底不触发」。",
  "",
  "修法：",
  "",
  "1. `gotoLine` 跳不了时把行号挂到 `pendingReveal` 并**返回 `false`**；新增一个无 deps 的 `useEffect`",
  "   在 DOM 就绪的那一拍补跳；",
  "2. 回执只走 `ackReveal()`，且**只有真的跳了才回**（当拍跳成当拍回，补跳成由 flush 补回）；",
  "3. 面板侧兜底从 1 拍加到 3 拍（`RETRY_DELAYS = [170, 700, 1500]`）——「打开文件 → 编辑器挂载 →",
  "   监听就绪」需要时间，只补发一次常常又赶不上；回执配对改为按 nonce **前缀**匹配，重试轮次也能认。",
  "",
  "### 3. 编辑器内不再内嵌大纲",
  "",
  "删掉编辑器里那一列 150px 的章节列表，以及只服务它的 `outline` useMemo 与 `SEC_LV` 常量",
  "（画面整块还给源码与预览）。章节导航统一走左侧「章节大纲」面板。",
  "",
  "### 新增回归测试：`.setup/test-nav.js`（18 项，真渲染）",
  "",
  "这个 bug 属于「静态断言查不出来」的那一类，所以新写了一个**真渲染**测试：esbuild 转 CJS →",
  "迷你 React（带 ref 挂载 + effect cleanup + 渲染循环）→ 假 window/`sessionStorage` → 真渲染",
  "`panels/editor.tsx` → 派发 `notrat-latex-reveal-line` → 查 ACK 与 textarea 的落点。",
  "",
  "**先跑在修复前的代码上，4 项红**（ACK 撒谎 / 不滚动 / 不选中 / 不聚焦），修复后 18 项全绿：",
  "",
  "```",
  "── B. 可视化视图下点大纲（本文件 / 第 26 行）──",
  "  ✗ 跳不成时不回 ACK（老实现会撒谎回执 → 面板兜底失效）  → ACK 数=1",
  "── C. 切到含源码的视图后那一拍：应当补跳 + 补回执 ──",
  "  ✗ 滚动落点 = 第 26 行对应位置（366.7px）  → 0",
  "  ✗ 选区起点 = 第 26 行的字符偏移（589）  → null",
  "  ✗ 跳转时把焦点给了编辑区",
  "```",
  "",
  "测的落点是**真实算出来的行偏移**（第 26 行 = 589 字符处）与 `scrollTop = (26-1)*20 - clientHeight/3`，" ,
  "而不是「有没有调用过某个函数」—— 这样「跳到别的行」也会被抓出来。",
  "",
  "### 顺带清掉一处「恒红的旧断言」",
  "",
  "`.setup/test-activefile.js` 的部署产物段还在按「6 个 `ui` 挂载位都在包里」查，",
  "而贡献面自 v0.5.2 起就收敛了 —— 这 6 条从那时起恒红，README 却依然写「✅ 53 项」。",
  "已按实际部署的挂载位重写（并补一条「部署包里确实没有 right-panel」），同时把它与 `test-nav.js`",
  "一起并进 `verify-v052.js` 第 9 节 —— 以后腐烂会被验收门挡住，而不是等人发现。",
  "",
  "### 验收",
  "",
  "```",
  "node .setup/verify-v052.js   # 172 通过 / 0 失败（v0.6.0 时 101）",
  "                             # 顶层：结构 / 白名单 / UI 面 / 编辑器声明 / 内联体检 /",
  "                             #      esbuild 真转译 / 工作区↔部署产物字节一致 / server 同步",
  "                             # 子测试：test-v052(24) + test-nav(18) + test-activefile(50)",
  "```",
  "",
  "新增断言：`gotoLine` 跳不成挂 `pendingReveal` / 只有真跳了才回 ACK / ACK 走 `ackReveal` /",
  "编辑器内无大纲列与死代码 / 面板兜底 3 拍 + nonce 前缀配对 / `_unused/selection.tsx` 已归档 /",
  "部署包无 `right-panel`。",
  "",
].join("\n");

fs.writeFileSync(p, s);
console.log("✓ README 同步：" + n + " 处 + v0.6.1 章节");
console.log("  行数:", s.split("\n").length, "| 字节:", Buffer.byteLength(s, "utf8"));
console.log("  含「三件事」:", s.includes("三件事"), "| 含 §v0.6.1:", s.includes("## v0.6.1"), "| 仍提 right-panel 功能节:", s.includes("### 3. 划词助手"));
