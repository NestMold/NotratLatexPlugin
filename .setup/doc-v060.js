/* v0.6.0 README 同步：把「两件事」改成「四件事」，并追加变更章节 */
const fs = require("fs");
const p = "E:/notrat-latex-plugin/README.md";
let s = fs.readFileSync(p, "utf8");
let n = 0;
function rep(a, b, label) {
  if (!s.includes(a)) {
    console.error("MISS: " + label);
    process.exit(1);
  }
  s = s.split(a).join(b);
  n++;
}

/* ---------- 1. 顶部 banner ---------- */
rep(
  [
    "> **v0.5.2 起收敛为「编辑器 + 大纲」两件事。**",
    "> 贡献面只留 `editors` + `ui@outline` + `settings`；之前的右侧面板、整页、编辑器工具条、标签栏徽章、",
    "> 悬浮器、活动栏、状态栏、输入框提示、markdown 代码块渲染器、6 条对话命令、7 条文件树右键菜单、",
    "> 编译前快照钩子全部下线（源码保留在 `panels/`，随时可重新注册）。详见文末 §v0.5.2。",
  ].join("\n"),
  [
    "> **v0.6.0 起是「编辑器 + 大纲 + 划词助手 + 文件树右键」四件事。**",
    "> 贡献面 = `editors` + `ui@outline` + `ui@right-panel` + `fileTreeMenus` + `settings`。",
    "> v0.5.2 曾一度收敛到「编辑器 + 大纲」（整页、编辑器工具条、标签栏徽章、悬浮器、活动栏、状态栏、",
    "> 输入框提示、markdown 代码块渲染器、6 条对话命令、编译前快照钩子下线 —— 源码仍保留在 `panels/`，",
    "> 随时可重新注册）；v0.6.0 按需把**划词助手**（`right-panel`）与 **`.tex` 右键编译 / 校验**",
    "> （`fileTreeMenus`）接了回来。两版分别见文末 §v0.6.0 与 §v0.5.2。",
  ].join("\n"),
  "banner"
);

/* ---------- 2. 在「MCP 工具」前插入两个新功能节，并把编号 3 → 5 ---------- */
const sec3 = "### 3. MCP 工具（server 侧，共 8 个）";
const inserted = [
  '### 3. 划词助手（`ui.location = "right-panel"`）',
  "",
  "右侧停靠栏的**划词即响应**面板：在编辑器里选中一段文字，约 250ms 后面板自动载入选区，",
  "给出一排科研向动作。",
  "",
  "| 动作 | 说明 |",
  "|---|---|",
  "| 学术润色 | 改写为更严谨的期刊表达，保持语言不变 |",
  "| 中译英 / 英译中 | 学术翻译，LaTeX 命令与公式原位不动 |",
  "| 解释公式 | 逐个说明符号含义与公式用途 |",
  "| 转公式 | 自然语言描述 → 规范 LaTeX 数学公式（amsmath 优先） |",
  "| 精简 / 扩写 | 压冗余 / 补过渡，都不得增删 `\\cite` 键 |",
  "| 自定义 | 自己写指令，回车即跑 |",
  "",
  "- **硬约束写进系统提示词**：原样保留 LaTeX 命令/环境/公式，`\\cite` 键不增不删，只输出正文、不要围栏",
  "- SSE 流式输出、可随时中止；结果可「💬 引用到对话」（`notrat-quote-to-chat`，带文件名与行号徽章）或复制",
  "- 三处优雅降级：非 LaTeX 文件提示效果打折、超长选区提示被宿主截断、空态区分「没选区」与「权益不含」",
  "- **数据通路**：`window.electronAPI.chat.sseUrl` → 复用你在 Notrat 里已配好的供应商与密钥（不会再问你要一遍 Key）",
  "",
  "> ⚠️ 划词采集跟随宿主「划词引用」开关，属**基础版及以上权益**：纯净版恒为空，",
  "> 面板显示引导文案而非报错。另：本面板按真实宿主实现解析供应商 ——",
  "> `notrat-ai-current:<workspace>` **只存 `{providerId, model}`，不含 `apiKey`**，密钥仍取自",
  "> `notrat-ai-config.providers` 主表；开发文档 §6.1 的示例是简化版，照抄会拿到 `apiKey: undefined`。",
  "",
  '### 4. 文件树右键菜单（`fileTreeMenus`，只对 `.tex` 生效）',
  "",
  "在左侧文件树右键任意 `.tex` → 「⚙️ LaTeX 编译」/「✅ LaTeX 校验引用」，直接调用本插件 MCP 工具，",
  "`filePath` 由宿主自动注入。",
  "",
  "> 实现要点：宿主注入的是 `filePath`，而各工具原先只认 `args.path` —— 不兼容的后果不是报错，",
  "> 而是 `resolveInput(undefined)` 静默走「自动发现主 `.tex`」：**右键 `test.tex` 会给你 `sample.tex` 的报告**。",
  "> v0.6.0 已给 5 个工具入口 + 2 处快照入口统一加 `args.path || args.filePath` 归一，并加了回归断言。",
  "",
  "### 5. MCP 工具（server 侧，共 8 个）",
].join("\n");
rep(sec3, inserted, "功能节插入");

/* ---------- 3. 追加 v0.6.0 章节 ---------- */
const tail = [
  "",
  "## v0.6.0 — 接回划词助手（`right-panel`）与 `.tex` 右键编译 / 校验",
  "",
  "### 新增两个贡献面",
  "",
  "| 贡献面 | 内容 |",
  "|---|---|",
  "| `ui@right-panel` | `latex-selection` 划词助手（`panels/selection.tsx`） |",
  '| `fileTreeMenus` | `latex-compile` / `latex-validate`，`extensions: ["tex"]`，直调 MCP 工具 |',
  "",
  "### 一处必须修的宿主契约差异（否则是「静默错误」而非报错）",
  "",
  "宿主 `fileTreeMenus` 点击时自动注入 `filePath` / `fileName`（Wiki §3.8），**不传 `path`**；",
  "而 `latex_parse` / `latex_validate` / `latex_compile` / `latex_status` / `latex_history` 原先只取",
  "`args.path`。`resolveInput(p)` 在 `p` 为空时会 `findMainTex(workspaceRoot)` —— 于是右键",
  "`test.tex` 会**静默**处理 `sample.tex`：不报错、不提示，只是结果不对。",
  "",
  "已给 5 个工具入口（throw 形式）与 2 处快照入口统一归一：",
  "",
  "```js",
  "const input = args.path || args.filePath;",
  "const file = resolveInput(input, ws);",
  "```",
  "",
  "实测对照（`samples/` 下同时有 `sample.tex` 与 `test.tex`）：",
  "",
  "```",
  "# A) 只带 filePath —— 宿主右键的真实入参",
  "📋 E:/notrat-latex-plugin/samples/test.tex",
  "🟡 L206 [unverified-citation] \\upcite{1} 未找到 .bib 文献库",
  "",
  "# B) 不带任何参数 —— 改造前的旧行为",
  "📋 E:\\notrat-latex-plugin\\samples\\sample.tex",
  "🔴 L18 [undefined-ref] \\ref{sec:intro} 引用了未定义的 label",
  "```",
  "",
  "编译通路同样实测：`latex_compile` 只带 `filePath` → `退出码: 0`，PDF 正常生成。",
  "",
  "### 划词助手：按**真实宿主实现**写，避开文档简化版",
  "",
  "- 划词采集跟随宿主「划词引用」开关，**纯净版恒为 `null`**（宿主源码明写「纯净版不包含划词引用」）——",
  "  面板把它当正常空态，不当异常。",
  "- 供应商解析走宿主真实链路：`notrat-ai-current:<workspace>` 只存 `{providerId, model}`，",
  "  密钥仍在 `notrat-ai-config.providers` 主表。",
  "- `ui[].extensions` 在宿主 `useUiByEffectiveLocation` 里**不生效**（只按 location 过滤；",
  "  全库只有 `editors` / `fileTreeMenus` 真做了后缀过滤）——所以面板自己在非 LaTeX 文件上降级提示，",
  "  不依赖 manifest 兜底。",
  "- AI 子调用带 `options.skipEvolution: true`（插件发起的调用，进化引擎不得改写本插件提示词）。",
  "- 卸载时 `abort()` 在途请求；结果存 `sessionStorage`（切主区标签会卸载组件）。",
  "",
  "### 验收：84 → 101 项",
  "",
  "上一轮的反向断言（「`ui` 有且仅有 1 个」、「`fileTreeMenus` 必须缺席」）按需放宽，",
  "但**放宽不等于放弃** —— 改为「正向断言新增面 + 仍反向断言其余 11 个挂载位缺席」：",
  "",
  "```",
  "node .setup/verify-v052.js   # 101 项（+17：fileTreeMenus 工具存在性 / filePath 兼容 /",
  "                             #        selection 源码内联 + 契约特征 + 字节一致）",
  "node .setup/test-v052.js     # 24 项（子测试，未受影响）",
  "```",
  "",
  "`verify-v052.js` 新增断言：",
  "",
  "- `fileTreeMenus` 恰好 2 项、都限定 `[\"tex\"]`、都走 `tool`（不用 `uiKey`，因此不需要 `page` 挂载位）",
  "- 菜单指向的 `latex_compile` / `latex_validate` **在 server 里确有定义**（防「菜单挂了个不存在的工具」）",
  "- `server/index.js` 含 `args.path || args.filePath`（防 filePath 兼容被回退）",
  "- 划词助手源码含 `ctx.selection` / `skipEvolution: true` / `notrat-quote-to-chat` 三个契约特征",
  "- `ui[selection].source ≡ panels/selection.tsx`（字节一致，防「改了源码没重新打包」）",
  "",
].join("\n");

s = s.replace(/\s*$/, "\n");
s = s + tail;

fs.writeFileSync(p, s);
console.log("✓ README 已同步：" + n + " 处替换 + 追加 v0.6.0 章节");
console.log("  行数:", s.split("\n").length, "| 字节:", Buffer.byteLength(s, "utf8"));
console.log("  含「四件事」:", s.includes("四件事"));
console.log("  含 §v0.6.0:", s.includes("## v0.6.0"));
