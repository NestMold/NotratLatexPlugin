<p align="center">
  <img src="assets/logo.png" alt="Notrat LaTeX 助手" width="96" height="96">
</p>

# Notrat LaTeX 助手

> 让 Notrat 直接打开、编辑、编译 `.tex` 的科研写作插件。
> A research-writing LaTeX plugin for the Notrat app: WYSIWYG-style `.tex` editing with outline navigation, compile, and export.

[![version](https://img.shields.io/badge/version-0.9.3-blue.svg)](https://github.com/NestMold/NotratLatexPlugin/releases/latest)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
![notrat](https://img.shields.io/badge/Notrat-%E2%89%A5%201.3.3-6f42c1.svg)
![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)
![deps](https://img.shields.io/badge/runtime%20deps-katex%20only-brightgreen.svg)

在 Notrat 里打开 `.tex`：左侧是可点击的章节树，中间的正文可以在**可视化、源码、分屏**三种视图之间切换。可视化视图里的正文和标题能直接改，改完只回写被改的那一块；工具栏的「⬇ 导出」产出 PDF 或自包含 HTML，公式已排版、图片内嵌，离线也能看。在文件树里右键 `.tex`，可以直接编译或校验引用。

<p align="center">
  <img src="assets/preview-installed.png" alt="在 Notrat 里打开 .tex 的效果：可视化视图渲染公式与结构，左侧是章节大纲" width="720">
</p>

## 目录

- [功能特性](#功能特性)
- [安装](#安装)
- [快速开始](#快速开始)
- [配置](#配置)
- [MCP 工具](#mcp-工具)
- [开发](#开发)
- [路线图](#路线图)
- [已知边界与 FAQ](#已知边界与-faq)
- [参与贡献](#参与贡献)
- [许可证](#许可证)

## 功能特性

| 能力 | 说明 |
| --- | --- |
| 三档视图 | 可视化 / 源码 / 分屏，切换入口在文件标签栏右侧的模式开关；老客户端退化为两档，`Ctrl+/` 切分屏 |
| 源码视图 | LaTeX 语法高亮、行号、当前行高亮 |
| 可视化视图 | Overleaf 式实时预览：标题、作者、日期，章节层级，KaTeX 公式（离线资产内嵌），`\includegraphics` 显示真实图片，还有表格、题注与编号 |
| 就地编辑 | 可视化视图里正文与标题点哪改哪，失焦即写回源码，只替换被改块的行区间，没动过的字节逐字节保留。公式、`\cite`、`\ref`、浮动体、参考文献是原子节点，内部改不动也删不掉 |
| 分屏联动 | 左源码右预览，滚动双向联动；内容双向实时同步，在右栏打字，左栏源码当场跟着变 |
| 章节大纲 | 可点击的章节树：章、节、小节与图表公式题注（编号自动生成），点击跳到源码对应行，跟随光标高亮，支持过滤与折叠，页脚统计字数；主文件里只有 `\input` 时会把子文件章节一并列出来（条目后标来源文件） |
| 编译 | 面板内一键编译 PDF，错误行与日志回填到底部抽屉；引擎自动探测（Tectonic、TeX Live、MiKTeX） |
| 引用校验 | 一键体检：重复 label、未定义的 `\ref/\eqref`、`.bib` 缺失的 `\cite`、`\begin/\end` 环境配对、TODO 清单 |
| 导出 | PDF 或自包含 HTML 单文件（公式已排版、图片内嵌为 dataURI、带 A4 打印样式），离线可看；产物比 `.tex` 新时直接复用 |
| 文件树右键 | 任意 `.tex` 右键「LaTeX 编译」/「校验引用」 |
| Typora 键位 | 20 条格式快捷键，写论文不用重学肌肉记忆（见[下方速查表](#快捷键速查)） |
| MCP 工具 | 10 个 server 端工具，AI 助手可直接调用（见 [MCP 工具](#mcp-工具)） |

### 快捷键速查

键位照 Typora 抄，动作落成 LaTeX。有选区就包住选区，没选区就插一个空模板、把光标放进 `{}` 里。生效前提是源码或分屏视图且焦点在源码输入框里；先比 `e.key`，再用 `e.code`（物理键位）兜底，中文输入法开着、或键盘不是 US 布局，键位照旧可用。

<details>
<summary><strong>展开完整键位表（20 条）</strong></summary>

| 快捷键 | 动作 | 落成什么 |
| --- | --- | --- |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+U` | 加粗 / 斜体 / 下划线 | `\textbf{}` / `\textit{}` / `\underline{}` |
| `Ctrl+K` | 链接 | `\href{}{}`，有选区时选区当显示文本，光标停在 URL 处 |
| `Ctrl+M` | 行内公式 | `$...$` |
| `Ctrl+Shift+M` | 公式块 | `equation` 环境 |
| `Ctrl+T` | 表格 | `table` + `tabular` 骨架 |
| `` Ctrl+Shift+` `` | 行内代码 | `\texttt{}` |
| `Ctrl+Shift+K` | 代码块 | `verbatim` 环境 |
| `Ctrl+Shift+Q` | 引用块 | `quote` 环境 |
| `Ctrl+Shift+U` / `Ctrl+Shift+O` | 无序 / 有序列表 | `itemize` / `enumerate` |
| `Ctrl+Shift+I` | 插图 | `figure` + `\includegraphics` |
| `Ctrl+Shift+L` | 标签 | `\label{}` |
| `Ctrl+1` … `Ctrl+5` | 章节层级 1–5 | `\section` → `\subsection` → `\subsubsection` → `\paragraph` → `\subparagraph` |
| `Ctrl+0` | 变回正文 | 去掉行首的章节命令 |
| `Ctrl+S` | 保存 | — |
| `Ctrl+/` | 切视图 | 源码与可视化侧互切（分屏或纯可视化） |
| `Tab` | 缩进两空格 | — |

章节层级改的是当前行：光标在某行按 `Ctrl+2`，整行变成 `\subsection{原标题}`；如果它本来就是 `\section{标题}`，只换层级、保留标题，跟 Typora 一样降级不用手删命令。

键位就算被宿主占用也不影响干活：工具栏「＋ 插入」菜单里每一项右侧都标着同样的键位，点它效果完全一样。

</details>

## 安装

### 前置条件

| 需要 | 说明 |
| --- | --- |
|  Notrat | ≥ 1.3.3 |
| Node.js | ≥ 18（MCP server 与构建、验收脚本都靠它） |
| TeX 发行版 | 可选。只有编译 PDF、导出 PDF 需要；插件会自动探测 Tectonic、TeX Live、MiKTeX 的常见安装位置，无需配 PATH |

### 方式一：插件面板安装（推荐）

不碰命令行，直接用 Notrat 自带的插件面板：

1. 下载 [最新 Release](https://github.com/NestMold/NotratLatexPlugin/releases/latest) 里的 `notrat-latex-plugin-x.y.z.zip`；
2. 打开 Notrat「设置」→ 左侧栏「插件」→ 点「📦 安装插件包」，选中这个 zip；

   ![设置 → 插件面板，箭头所指即「安装插件包」入口](assets/install-plugin-panel.png)

3. 列表里出现「LaTeX 助手」、状态「已启用」，即安装完成；
4. 打开任意 `.tex` 验证：编辑器被插件接管（三档视图），左侧出现「章节大纲」。

之后的升级走面板里的「检测更新」，不要了走卡片上的「卸载」。

### 方式二：从源码安装

```bash
git clone https://github.com/NestMold/NotratLatexPlugin.git
```

同样走「📦 安装插件包」，只是不选 zip，选源码目录里的 `manifest.json`。这是目录包形态：宿主直接从这个目录加载，源码改完重载就生效。目录包**不用先编译**——server 是纯 Node 零依赖，公式资源 `server/assets-katex.json` 已随仓库分发，`npm install` 只有跑测试和验收门才需要。

想打出可分发的单文件包：

```bash
npm install
npm run build      # 产物写盘即热更新，详见 docs/DEVELOPMENT.md
```

> 自己打 zip 分发时，包里只需要 `manifest.json`、`panels/`、`server/`、`assets/`，`node_modules` 不用进去：katex 是构建期依赖，运行时用的是 `server/assets-katex.json`。
>
> 注意不要同时存在两种形态：同一个插件 id 若既有单文件包又有目录包，扫描时会互相顶替。

## 快速开始

### 切视图

编辑器顶栏没有视图按钮，切换入口只有文件标签栏右侧的模式开关：新客户端按 `editors[].modes` 出可视化、源码、分屏三档（第一项是默认档）；老客户端只认 `dualView`，退化为可视化、源码两档，这时用 `Ctrl+/` 切到分屏。

### 就地编辑

可视化视图里正文与标题点哪改哪，失焦即写回源码，只替换被改块的行区间。公式、`\cite`、`\ref`、浮动体、参考文献是原子节点，内部改不动也删不掉，防止误伤。工具栏的「✏ 就地编辑」可在可编辑与只读预览之间切。

### 章节导航

点左侧「章节大纲」里的条目，会滚到源码对应行，该行闪一下。源码面板不在场时，跳转不会把你踢进分屏，行号先挂起来，等切到含源码的视图再补跳。

### 编译与校验

- 编辑器面板内一键编译 PDF，错误行与日志回填到底部抽屉；
- 或在左侧文件树右键任意 `.tex`，选「⚙️ LaTeX 编译」或「✅ LaTeX 校验引用」。

### 导出与预览

工具栏「⬇ 导出」出 PDF 或自包含 HTML，落点可选文档旁、桌面或下载目录；产物比 `.tex` 新时直接复用，不白编一遍。点结果条里的「👁 预览」直接打开产物（`.pdf` 有内置阅读器，`.html` 有内置预览器）。

### 没装 TeX 引擎？

首次打开 `.tex` 时若没探测到引擎，首屏提示一次，措辞明确只影响编译 PDF，并给一条能直接粘的安装命令；点过「知道了」就不再弹。没引擎时**只有编译和导出 PDF 不可用**，编辑器、大纲、预览、HTML 导出照常。

## 配置

设置在 Notrat 设置面板的「LaTeX 设置」分组：

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `compiler` | text | 空 | 编译引擎，留空自动探测（Tectonic / XeLaTeX / LaTeXMK 等） |
| `timeout` | number | 120 | 编译超时（秒） |
| `outlineDepth` | number | 2 | 大纲深度（0 章 / 1 节 / 2 小节 / 3 小小节） |

这三个字段以 `LATEX_COMPILER`、`LATEX_TIMEOUT`、`LATEX_OUTLINE_DEPTH` 环境变量注入 MCP server 进程。

## MCP 工具

server 侧共 10 个工具（stdio，纯 Node 零依赖），Notrat 的 AI 助手可直接调用：

| 工具 | 说明 |
| --- | --- |
| `latex_parse` | 解析结构：文档类、宏包、标题作者、章节大纲、label、交叉引用、文献引用、图表公式、字数、TODO |
| `latex_validate` | 校验：重复 label、未定义 `\ref`、`.bib` 缺失 `\cite`、环境配对、TODO 清单 |
| `latex_outline` | 大纲，双通路：面板调用出 list 行协议，宿主内置大纲调用出 `level`、`text`、`anchor` 契约；自动展开 `\input`/`\include` 的子文件章节（anchor 落在父文件那条 `\input` 的行号上） |
| `latex_compile` | 编译 PDF（默认 xelatex，设置里可换引擎和超时） |
| `latex_status` | 一行状态摘要（节数、图、表、式、引用、字数、错误数） |
| `latex_asset` | 内部资产：KaTeX 离线包、图片转 dataURI（pdf/eps 走本机栅格化）、`.tex` 文件读取 |
| `latex_backup` | 源码快照到 `.latex-history/`（需显式调用；按**字节**存，UTF-16 文件也逐字节无损） |
| `latex_history` | 快照列表与恢复（恢复前自动另存当前版本；按**字节**原样写回，恢复前后 sha256 一致） |
| `latex_export` | 导出 PDF / 自包含 HTML，落点可选 same、desktop、downloads、documents |
| `latex_env` | 引擎自检：探测不编译；`action=reset` 清缓存重探（刚装完引擎时用） |

不装插件也能手动跑：

```bash
/plugin-run notrat-latex-plugin latex_parse {"path":"samples/sample.tex"}
```

## 开发

```bash
npm install        # 只依赖 katex（预览公式资源）
npm run gate       # ★ 验收门 29 层，全绿约 80s，任何一层红了退出非零
npm run test:core  # 内核单测
npm run build      # 打单文件包（热更新）
```

源码结构、验收门 27 层明细、单层重跑、功能级验收与单文件包构建，见 **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**。

技术栈：面板是 React（TSX，宿主内联加载），server 是纯 Node 零依赖（MCP stdio），构建用 esbuild，测试全部离线可跑（jsdom 做真 DOM 往返）。

## 路线图

当前主线是 **v0.9：重做撤销 / 重做的底层**——把三份内容、三套历史收敛成一份文档模型（无损 CST）加一份事务日志，让撤销从「有时能撤」变成「随时可预测」。

| 期 | 内容 | 状态 |
| --- | --- | --- |
| P0–P2 | 基线用例 / 文档模型 / 事务历史 | ✅ 完成（63 + 84 项测试） |
| P3-1 | 预览档撤销接线 | ✅ 完成 |
| P3-2 / P3-3 | 渲染层定点补丁 / 打字合并 | ⬜ 未开始 |
| P4 | 源码档切换到新内核 | ⬜ 未开始 |

分期明细、剩余靶子与复核方法见 **[docs/v0.9-status.md](docs/v0.9-status.md)**。

## 已知边界与 FAQ

- **字数统计为近似值**（CJK 字符 + 英文单词）。
- **引用校验**覆盖 `\ref/\eqref/\autoref/\cref/\cite` 家族；natbib/biblatex 常见命令已覆盖，冷门引用命令可能漏识别。
- **交叉引用变化需要二次编译**（LaTeX 的固有行为），建议用 latexmk。
- **格式快捷键只在源码或分屏视图生效**，且焦点要在源码输入框里；可视化区用「＋ 插入」菜单，效果等同。
- **引擎探测只查文件在不在，不实际运行**：检测到引擎不等于编译一定成功（缺宏包、缺字体要到编译那一刻才暴露）；提示「未检测到」也不否定你装好的东西。
- **PDF/EPS 插图**在预览和导出 HTML 里要经本机栅格化（Ghostscript 或 pdftoppm）；两者都没装时这些插图退回占位符，编译成 PDF 后照旧可见。
- **多文件预览**（`\input`、`\include`）只认同一工作区内的相对路径，循环引用会截断而不是报错；`\tableofcontents` 在预览里是占位卡，真目录要编译后才有。
- **大纲与结构解析也会展开 `\input`/`\include`**（限 8 层、最多 64 个文件，循环自动截断）；子文件章节的编号与主文件连续，但**子文件里的 label / 引用不参与校验** —— 引用校验仍以当前打开的那个文件为准。
- **文件编码按 BOM + 字节分布嗅探**（UTF-8 / UTF-16LE / UTF-16BE），所以「文件存成 UTF-16 就解析不出章节」这类事不会再发生；GBK 文件的中文可能显示乱码，但命令与结构照样解析（插件只读，不会替你改编码）。
- **biblatex（biber 后端）**：Tectonic 用户需独立安装版本严格匹配的 biber（详见下），要完整 biblatex 支持建议用 TeX Live；演示样例已改用无外部依赖的 `thebibliography`。

<details>
<summary><strong>编译引擎说明（Tectonic）</strong></summary>

插件会自动探测常见安装位置，不需要配 PATH。以 Tectonic 为例：

- 首次编译新文档会按需下载宏包（缓存在 `%LOCALAPPDATA%\TectonicProject`），之后离线秒编；
- 已知限制：`biblatex`（backend=biber）文档需要独立安装 biber，且版本要和 bundle 内的 biblatex（v3.17）严格匹配（biber 2.17）。SourceForge 的 biber Windows 包在受限网络下不好拿，要完整的 biblatex 支持建议改装 TeX Live（自带版本匹配的 biber）。

</details>

> 面向 Notrat 插件开发者的宿主契约坑（`mcpServers` 数组形态、settings 占位符、大纲契约等），见 **[docs/host-contract-pitfalls.md](docs/host-contract-pitfalls.md)**。

## 参与贡献

欢迎 Issue 和 PR：

- **真实 `.tex` 语料**是最缺的——合成语料覆盖想得到的边界，真实论文才覆盖想不到的（详见 [docs/v0.9-status.md](docs/v0.9-status.md)「语料」一节）。欢迎投递可公开的论文源码（脱敏后）；
- 改代码前先跑 `npm run gate`，PR 请保证 29 层全绿；
- 提 Issue 请附最小复现 `.tex` 与 Notrat 版本号。

## 许可证

[MIT](LICENSE) © Notrat Community

完整版本历史见 **[CHANGELOG.md](CHANGELOG.md)**（33 个版本节 + 版本速览）。
