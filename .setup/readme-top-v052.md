# Notrat LaTeX 助手（notrat-latex-plugin）

面向科研写作的 Notrat 插件：让 Notrat 真正"读懂" `.tex` 文件。

> **v0.5.2 起收敛为「编辑器 + 大纲」两件事。**
> 贡献面只留 `editors` + `ui@outline` + `settings`；之前的右侧面板、整页、编辑器工具条、标签栏徽章、
> 悬浮器、活动栏、状态栏、输入框提示、markdown 代码块渲染器、6 条对话命令、7 条文件树右键菜单、
> 编译前快照钩子全部下线（源码保留在 `panels/`，随时可重新注册）。详见文末 §v0.5.2。

## 功能

### 1. LaTeX 编辑器（接管 `.tex` 的编辑器贡献）

| 能力 | 说明 |
|---|---|
| 双视图 | 标题栏出现「可视化 \| 源码」开关——走宿主权威契约 `editors.dualView` + `props.mode` / `props.onModeSwitch`，只在打开 `.tex` 时出现 |
| 源码视图 | LaTeX 语法高亮 + 行号 + 当前行高亮 |
| 可视化视图 | Overleaf 式实时预览：标题/作者/日期、章节层级、KaTeX 公式（离线资产内嵌）、`\includegraphics` 真实图片、表格、题注与编号 |
| 分屏 | 左源码右预览，滚动联动 |
| 编译 | 面板内一键编译 PDF（默认 xelatex，设置里可换引擎；本机已装 Tectonic），错误行与日志回填到底部抽屉 |
| 校验 | 一键体检：重复 label、未定义 `\ref/\eqref`、`.bib` 缺失 `\cite`、`\begin/\end` 环境配对、TODO 清单 |
| 划词引用 | 选中文本 → 💬 钉进侧栏对话框（`notrat-quote-to-chat`，带文件名与行号徽章），同宿主原生「引用到聊天」同级 |

### 2. 章节大纲（`ui.location = "outline"`，只对 `.tex` 生效）

左侧大纲面板的**可点击章节树**：

- 树里有章/节/小节，还带 **图、表、公式的题注**（`\caption` 文本进树），编号自动生成（`2.1`、`图 1`、`表 1`、`式 (1)`）
- 点击条目 → 滚到源码对应行 + 该行闪烁一下（"跳过去了"要看得见）+ 回执 ACK
- **跟随光标**自动高亮"我正在写哪一节"
- 过滤框（按标题/编号/题注过滤，Esc 清空）、折叠展开、错误/警告徽章（点错直接定位到出问题的行）
- 页脚统计：节数 · 图 · 表 · 式 · 待办 · 字数
- 只在当前文件是 LaTeX 时出现（宿主给 `ui` 的 `extensions` 过滤；老宿主无此字段时由面板自己按活动文件隐藏）

### 3. MCP 工具（server 侧，共 8 个）

| 工具 | 说明 |
|------|------|
| `latex_parse` | 解析结构：文档类/宏包/标题作者/章节大纲/label/交叉引用/文献引用/图表公式/字数/TODO |
| `latex_validate` | 校验：重复 label、未定义 `\ref`、`.bib` 缺失 `\cite`、环境配对、TODO 清单 |
| `latex_outline` | 大纲（**双通路**：面板调用出 list 行协议；宿主内置大纲调用出 `level\|text\|anchor` 契约） |
| `latex_compile` | 编译 PDF（默认 xelatex，设置可换引擎/超时） |
| `latex_status` | 一行状态摘要（节数·图·表·式·引用·字数·错误数） |
| `latex_asset` | 内部资产：离线 KaTeX 包 / 图片 dataURI（预览用） |
| `latex_backup` | 源码快照到 `.latex-history/`（v0.5.2 起无自动钩子，需显式调用） |
| `latex_history` | 快照列表 / 恢复（恢复前自动另存当前版本） |

手动调用逃生口：`/plugin-run notrat-latex-plugin latex_parse {"path":"samples/sample.tex"}`

## 开发

```
manifest.json              插件清单（贡献面：editors + ui + settings）
server/index.js            MCP stdio server（纯 Node 零依赖）
server/contrib.js          解析/校验/大纲/快照内核 + 两套大纲输出协议
server/preview-core.js     可视化预览内核（构建期内联进编辑器源码）
panels/editor.tsx          → editors[latex-editor]
panels/outline.tsx         → ui[latex-outline @ outline]
```

**当前不在注册表里**（源码保留，需要时加回 `manifest.json` 的 `contributions` 即可）：
`panels/main.tsx`（右侧结构面板 / 整页）、`panels/editor-header.tsx`、`panels/editor-tabs.tsx`、
`panels/widget.tsx`、`panels/code-renderer.tsx`。

依赖与构建：

```bash
npm install                                  # 只依赖 katex（预览公式资源）

node .setup/build-singlefile.js              # 打包 → ~/.notrat/plugins/notrat-latex-plugin.json
                                             #      + ~/.notrat/tools/{latex-server.js,contrib.js,assets-katex.json}
node .setup/verify-v052.js                   # 验收（81 项，退出码 0/1）
node .setup/test-v052.js                     # MCP 冒烟：工具表 + 大纲双通路（21 项）
node .setup/test-outline-render.js           # 大纲面板渲染/交互（21 项）
```

本地直跑 server（不装插件也能测）：

```bash
node --check server/index.js
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"latex_parse","arguments":{"path":"samples/sample.tex"}}}' \
  | node server/index.js
```

## 安装（本地热加载）

本项目用**单文件包**形态（宿主 1.3.0+ 也支持目录型 zip 包）：

```bash
node .setup/build-singlefile.js
# → ~/.notrat/plugins/notrat-latex-plugin.json  （manifest + 内联 panels 源码）
# → ~/.notrat/tools/latex-server.js|contrib.js|assets-katex.json（单文件包没有 pluginDir）
```

写盘即热更新（chokidar 监听），无需重启 Notrat。改 `panels/*.tsx` 后**必须重新 build**，
否则跑的还是内联在部署包里的旧源码——`verify-v052.js` 第 7 节会逐字节比对拦住这种漂移。

> ⚠ 同一个 `id` 不要同时存在单文件包 `~/.notrat/plugins/notrat-latex-plugin.json`
> 与目录包 `~/.notrat/plugins/notrat-latex-plugin/`，扫描时会互相顶替。

## 已知边界

- 字数统计为近似值（CJK 字符 + 英文单词）。
- 引用校验覆盖 `\ref/\eqref/\autoref/\cref/\cite 家族`；`natbib/biblatex` 常见命令已覆盖，冷门引用命令可能漏识别。
- 编译依赖本机 TeX 发行版（Tectonic / TeX Live / MiKTeX）。交叉引用变化需二次编译（建议用 latexmk）。
- `editors[].outlineTool`、`notrat-outline-navigate`、`ui[].extensions` 这三项被本插件声明了，
  但**当前装机版宿主尚未实现**（`.setup/host/` 提取的包内无这三个字符串，`dualView` 有）——
  声明是无害的（旧宿主忽略），装上实现了这些契约的宿主版本后自动生效：
  宿主自带大纲会直接渲染 `latex_outline` 的输出，点击回抛 `notrat-outline-navigate`，
  编辑器按 `anchor` 定位；`ui[].extensions` 则让大纲面板只在 `.tex` 时出现（现在靠面板自己判断）。
- 自带大纲的**层级写法**：契约期望 `level|text|anchor`，level 从 1 起。
  本插件按真实文档层级输出（章/节=1、小节=2、小小节=3，`\part` 兜到 1），
  `anchor` 直接给源文件行号。

