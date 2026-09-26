<p align="center">
  <img src="assets/logo.png" alt="Notrat LaTeX 助手" width="96" height="96">
</p>

# Notrat LaTeX 助手

notrat-latex-plugin：一个面向科研写作的 Notrat 插件，让 Notrat 能直接打开、编辑 `.tex` 文件。

![version](https://img.shields.io/badge/version-0.9.3-blue.svg)
![license](https://img.shields.io/badge/license-MIT-green.svg)
![notrat](https://img.shields.io/badge/Notrat-%E2%89%A5%201.3.3-6f42c1.svg)
![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)
![deps](https://img.shields.io/badge/runtime%20deps-katex%20only-brightgreen.svg)

在 Notrat 里打开 `.tex`，左侧是可点击的章节树，中间的正文可以在可视化、源码、分屏三种视图之间切换。可视化视图里的正文和标题能直接改，改完只回写被改的那一块；工具栏的「⬇ 导出」产出 PDF 或自包含 HTML，公式已排版、图片内嵌，离线也能看。在文件树里右键 `.tex`，可以直接编译或校验引用。

---

## 目录

- [项目状态](#项目状态)
- [特性](#特性)
- [安装](#安装)
- [使用](#使用)
- [设置](#设置)
- [开发](#开发)
- [v0.9 改造现状](#v09-改造现状)
- [已知边界](#已知边界)
- [编译引擎](#编译引擎)
- [宿主契约踩坑](#宿主契约踩坑)
- [版本历史](#版本历史)
- [许可证](#许可证)

## 项目状态

| 项 | 值 |
| --- | --- |
| 当前版本 | 0.9.3（`manifest.json`） |
| 贡献面 | `editors`、`ui@outline`、`fileTreeMenus`、`settings` |
| 最低宿主 | Notrat 1.3.3（`notrat.minVersion`） |
| MCP server | `latex`，stdio 协议跑 `server/index.js`，纯 Node 零依赖，共 10 个工具 |
| 运行期依赖 | 仅 `katex`（可视化预览的离线公式资产） |
| 验收门 | 27 层，`npm run gate` 实测全绿（约 80s） |
| 许可 | MIT |

> 说明：README 的版本历史只记到 v0.8.27，manifest.json 已经是 0.9.3。v0.9 不是发新功能，
> 是在改撤销/重做的底层，把原先的三份内容、三套历史收敛成一份文档模型加一份事务日志。
> 进展和剩余工作见 [v0.9 改造现状](#v09-改造现状)。

## 特性

插件做三件事：接管 `.tex` 的编辑器、提供章节大纲、给文件树加右键菜单；另外带一组跑在 server 端的 MCP 工具。

### 编辑器

通过 `editors[latex-editor]` 接管 `.tex` 的编辑。语法高亮、KaTeX 公式、Overleaf 式的实时预览都在这里；
可视化视图里能直接改正文，分屏时两栏联动，编译、校验、导出、预览也从这里进。

| 能力 | 说明 |
| --- | --- |
| 视图档位 | 文件标签栏右侧的模式开关。新客户端按 `editors[].modes` 显示可视化、源码、分屏三档，第一项是默认档；当前装机版客户端只认 `editors[].dualView`，退化为可视化、源码两档，分屏用 `Ctrl+/` 切 |
| 源码视图 | LaTeX 语法高亮、行号、当前行高亮 |
| 可视化视图 | Overleaf 式实时预览：标题、作者、日期，章节层级，KaTeX 公式（离线资产内嵌），`\includegraphics` 显示真实图片，还有表格、题注与编号 |
| 就地编辑 | 可视化视图里正文与标题可直接改（v0.7.0）：失焦即写回源码，只替换被改块的行区间。公式、`\cite`、`\ref`、浮动体、参考文献是原子节点，内部改不动也删不掉。工具栏的「✏ 就地编辑」可切回只读预览 |
| 分屏 | 左源码右预览。滚动双向联动，滚哪栏另一栏都跟着走；内容也双向实时同步，在右栏打字，左栏源码当场跟着变 |
| 编译 | 面板内一键编译 PDF（默认 xelatex，设置里可换引擎，本机已装 Tectonic），错误行与日志回填到底部抽屉 |
| 校验 | 一键体检：重复 label、未定义的 `\ref/\eqref`、`.bib` 缺失的 `\cite`、`\begin/\end` 环境配对、TODO 清单 |
| 划词引用 | ~~选中文本，钉进侧栏对话框（`notrat-quote-to-chat`，带文件名与行号徽章）~~，v0.6.1 已下线，源码归档在 `panels/_unused/selection.tsx`，要接回只需加一条 manifest |
| 导出 | 工具栏「⬇ 导出」出 PDF（本机 TeX 引擎编译）或自包含的 HTML 单文件：公式已排版、图片内嵌为 dataURI、带 A4 打印样式，离线可看，也可以直接发给别人。落点可选文档旁、桌面或下载目录；产物比 `.tex` 新时直接复用，不白编一遍 |
| 预览 | 导出结果条里的「👁 预览」直接打开产物（用宿主内置的 PDF 阅读器或 HTML 预览器）。菜单里也有「预览 PDF / 预览 HTML」，没有产物就先导一次再开 |

#### 快捷键（Typora 键位 → LaTeX）

键位照 Typora 抄，动作落成 LaTeX，写论文不用重学一套肌肉记忆。有选区就包住选区，
没选区就插一个空模板、把光标放进 `{}` 里，这也是 Typora 的行为。

生效前提是源码或分屏视图，且焦点在源码输入框里。预览区是块级就地编辑，
往里塞 LaTeX 命令会被当成正文回写，所以那里一概不接管。工具栏的「＋ 插入」是等效入口，
菜单里每项都标着同样的键位。

匹配时先比 `e.key`，再用 `e.code`（物理键位）兜底，所以中文输入法开着、或键盘不是 US 布局，键位照旧可用。

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

章节层级改的是当前行，不是插一个空命令：光标在某行按 `Ctrl+2`，整行变成
`\subsection{原标题}`；如果它本来就是 `\section{标题}`，只换层级、保留标题，
`Ctrl+1` 到 `Ctrl+2` 就是降级，跟 Typora 一样，不用手删命令。

键位就算被宿主占用也不影响干活：工具栏「＋ 插入」菜单里每一项右侧都标着同样的键位，
点它效果完全一样（v0.8.6 起菜单按格式、环境、引用分组，鼠标划过有高亮）。

### 章节大纲

左侧大纲面板是一棵可点击的章节树（`ui[latex-outline @ outline]`，只对 `.tex` 生效）：

- 树里有章、节、小节，图、表、公式的题注（`\caption` 文本）也进树，编号自动生成（`2.1`、`图 1`、`表 1`、`式 (1)`）
- 点击条目会滚到源码对应行，该行闪一下（跳过去了要看得见），并回执 ACK
  - v0.6.1 修：以前在可视化视图下点条目没反应，源码 textarea 那时没挂载，跳转当拍直接
    返回，却照样回 ACK，于是面板以为跳成功、兜底也不触发。现在跳不成会把行号挂起来，
    等切到含源码的视图再补跳并补回执；文件没在编辑器里打开时，兜底重试从 1 拍加到 3 拍
  - 章节导航只有左侧这个面板：v0.6.1 起编辑器内不再内嵌大纲列，画面整块还给源码与预览
- 跟随光标，自动高亮正在写的那一节
- 过滤框按标题、编号、题注过滤，Esc 清空；可折叠展开；错误和警告带徽章，点一下直接定位到出问题的行
- 页脚统计节数、图、表、式、待办、字数
- 只在当前文件是 LaTeX 时出现（宿主给 `ui` 的 `extensions` 过滤；老宿主无此字段时由面板自己按活动文件隐藏）

### 文件树右键菜单

在左侧文件树右键任意 `.tex`，会看到「⚙️ LaTeX 编译」和「✅ LaTeX 校验引用」两项（`fileTreeMenus`），
直接调用本插件的 MCP 工具，`filePath` 由宿主自动注入。

> 实现要点：宿主注入的是 `filePath`，而各工具原先只认 `args.path`。不兼容的后果不是报错，
> 而是 `resolveInput(undefined)` 静默走「自动发现主 `.tex`」：右键 `test.tex` 会给你 `sample.tex` 的报告。
> v0.6.0 已给 5 个工具入口和 2 处快照入口统一加 `args.path || args.filePath` 归一，并加了回归断言。

### MCP 工具

server 侧共 10 个工具（`server/index.js`，stdio，纯 Node 零依赖）：

| 工具 | 说明 |
| --- | --- |
| `latex_parse` | 解析结构：文档类、宏包、标题作者、章节大纲、label、交叉引用、文献引用、图表公式、字数、TODO |
| `latex_validate` | 校验：重复 label、未定义 `\ref`、`.bib` 缺失 `\cite`、环境配对、TODO 清单 |
| `latex_outline` | 大纲，双通路：面板调用出 list 行协议，宿主内置大纲调用出 `level`、`text`、`anchor` 契约 |
| `latex_compile` | 编译 PDF（默认 xelatex，设置里可换引擎和超时） |
| `latex_status` | 一行状态摘要（节数、图、表、式、引用、字数、错误数） |
| `latex_asset` | 内部资产。`name=katex` 返回离线 KaTeX 包（JS、CSS、字体全部内嵌）；`path` 指向图片时返回 dataURI（png、jpg、gif、svg、webp、bmp 直读，pdf 和 eps 用本机 Ghostscript 或 pdftoppm 栅格化成 PNG，缓存在系统临时目录，转不动则由前端退回占位符）；`path` 指向 `.tex` 时返回 `{text, mtime, size}`，供多文件预览展开 |
| `latex_backup` | 源码快照到 `.latex-history/`（v0.5.2 起无自动钩子，需显式调用） |
| `latex_history` | 快照列表与恢复（恢复前自动另存当前版本） |
| `latex_export` | 导出产物。`format=pdf` 编译出 PDF（比 `.tex` 新则复用，`force` 强编）；`format=html` 出自包含 HTML。`dest` 可选 same、desktop、downloads、documents，`out` 指定完整路径。带 `body` 时用调用方渲染好的正文（保真），否则服务端内核渲染（公式近似排版，但体积小） |
| `latex_env` | 引擎自检，只探测，不编译、不写盘，返回 `{ok, engine, exe, tried, fellBack, installHint, ms}`。`ok:false` 表示本机没找到任何引擎，此时只有编译和导出 PDF 不可用。`action=ack` 记住「用户已知晓」，面板不再提示；`action=reset` 清探测缓存重探（刚装完引擎时用） |

手动调用逃生口（不用装插件也能跑）：

```bash
/plugin-run notrat-latex-plugin latex_parse {"path":"samples/sample.tex"}
```

## 安装

### 前置条件

| 需要 | 说明 |
| --- | --- |
| Notrat | ≥ 1.3.3（`notrat.minVersion`；插件用到 1.3.3 才进注册表的宿主契约） |
| Node.js | ≥ 18（MCP server 与构建、验收脚本都靠它） |
| TeX 发行版 | 可选。只有编译 PDF、导出 PDF 需要它；本机已装 Tectonic 0.17.0，插件会自动探测常见安装位置，无需配 PATH |

### 从插件面板安装

不碰命令行的话，走 Notrat 自己的插件面板。入口在「设置」左侧栏的「插件」，按你手里有什么分两条路。

手里是现成的插件包（zip 或单文件包），直接装：

1. 打开「设置」，左侧栏选「插件」。
2. 点「📦 安装插件包」，选中插件包文件。

![设置 → 插件面板，箭头所指即「安装插件包」入口](assets/install-plugin-panel.png)

3. 列表里出现「LaTeX 助手」，状态「已启用」，即安装完成。版本号直接显示在卡片上。
4. 打开任意 .tex 文件验证：编辑器被插件接管（可视化 / 源码 / 分屏三档），左侧出现「章节大纲」。到这一步就算装好了，装好后的样子见下图。

![装好后在 Notrat 里打开 .tex 的效果：可视化视图渲染公式与结构，左侧是章节大纲](assets/preview-installed.png)

自己打 zip 分发给别人时，包里只需要 manifest.json、panels/、server/、assets/ 这几样，node_modules 不用进去：katex 是构建期依赖，运行时用的是仓库里的 server/assets-katex.json（缺了这个文件，公式预览会退化到 miniMath 兜底，功能不丢）。

手里是 git 拉下来的源码目录：同样点「📦 安装插件包」，只是这回不选包文件，选源码目录里的 manifest.json。这是目录包形态，宿主按 manifest 里的 pluginDir 直接从这个目录加载，源码改完重载就生效。目录包不用先编译：server 是纯 Node 零依赖，公式资源 server/assets-katex.json（624K）已随仓库分发，npm install 只有跑测试和验收门才需要。

之后的升级走「检测更新」，不要了走卡片上的「卸载」。

### 从源码本地热加载

上面选 manifest 的目录包路线不需要这一节：源码目录本身就是插件目录。这一节服务的是单文件包形态（宿主 1.3.0 起也支持目录型 zip 包），想打出可分发的包、或者想让宿主吃构建产物时才用得上：

```bash
npm install                  # 只依赖 katex（预览公式资源）

node .setup/build-singlefile.js
```

产物：

```text
~/.notrat/plugins/notrat-latex-plugin.json          # manifest + 内联的 panels 源码
~/.notrat/tools/latex-server.js
~/.notrat/tools/contrib.js
~/.notrat/tools/export-html.js
~/.notrat/tools/preview-core.js
~/.notrat/tools/pdf-raster.js
~/.notrat/tools/assets-katex.json
```

> 单文件包没有 `pluginDir`，所以 server 依赖的模块要逐个拷过去，v0.8.4 就栽过这一条。

写盘即热更新（chokidar 监听），不用重启 Notrat。改了 `panels/*.tsx` 必须重新 build，
否则跑的还是内联在部署包里的旧源码，`verify-v052.js` 第 7 节会逐字节比对拦住这种漂移。

> 注意不要同时存在两种形态：同一个 `id` 若既有单文件包
> `~/.notrat/plugins/notrat-latex-plugin.json`，又有目录包
> `~/.notrat/plugins/notrat-latex-plugin/`，扫描时会互相顶替。

## 使用

### 切视图

编辑器顶栏没有视图按钮（v0.8.3 起下线，避免出现第二个入口），切换入口只剩文件标签栏右侧的模式开关。

- 新客户端按 `editors[].modes` 出三档：可视化、源码、分屏。顺序不是审美问题，
  N 态契约里第一项就是宿主给的默认档，所以可视化必须排最前。
- 当前装机版客户端只认 `editors[].dualView`，退化为可视化、源码两档，
  这时用 `Ctrl+/` 切到分屏。

### 就地编辑

可视化视图里正文与标题点哪改哪，失焦即写回源码，只替换被改块的行区间，没动过的字节逐字节保留。
公式、`\cite`、`\ref`、浮动体、参考文献是原子节点，内部改不动也删不掉，防止误伤。
工具栏的「✏ 就地编辑」可在可编辑与只读预览之间切。

### 章节导航

点左侧「章节大纲」里的条目，会滚到源码对应行，该行闪一下。
源码面板不在场时，跳转不会把你踢进分屏（v0.7.2 起跳转一律不动视图），
行号先挂起来，等切到含源码的视图再补跳。

### 编译与校验

- 编辑器面板内一键编译 PDF，错误行与日志回填到底部抽屉；
- 或在左侧文件树右键任意 `.tex`，选「⚙️ LaTeX 编译」或「✅ LaTeX 校验引用」。

### 导出与预览

工具栏「⬇ 导出」出 PDF 或自包含 HTML。落点可选文档旁、桌面或下载；
产物比 `.tex` 新时直接复用，不白编一遍。点结果条里的「👁 预览」直接打开产物，
复用宿主的 `notrat-open-file` 通道（`.pdf` 有内置阅读器，`.html` 有内置预览器）。
开的永远是刚导出的那个文件，不会预览一套、导出另一套。

### 没装 TeX 引擎?

首次打开 `.tex` 时若没探测到引擎，首屏提示一次，措辞明确只影响编译 PDF，
并给一条能直接粘的安装命令。点过「知道了」就不再弹（跨会话记在 `~/.notrat/notrat-latex-state.json`）。

> 探测不在插件启用时做：插件没有生命周期钩子，MCP 也没有推送通道，服务端探到了也说不出话。
> 所以挂在编辑器挂载，且只在没引擎时提示一次。改了引擎想重探，`latex_env` 带 `action=reset`。

## 设置

设置来自 `contributions.settings`，显示在设置面板的「LaTeX 设置」分组：

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `compiler` | text | 空 | 编译引擎，留空自动探测（本机实测为 `tectonic`） |
| `timeout` | number | 120 | 编译超时（秒） |
| `outlineDepth` | number | 2 | 大纲深度（0 章 / 1 节 / 2 小节 / 3 小小节） |

这三个字段以 `LATEX_COMPILER`、`LATEX_TIMEOUT`、`LATEX_OUTLINE_DEPTH` 注入 MCP server 进程。

> 契约：分组的 `key` 必须等于 `manifest.id`（`notrat-latex-plugin`），占位符只写纯字段名
> （`${settings:compiler}`）。写成 `${settings:组名.字段名}` 会让设置静默失效（见 [§宿主契约踩坑](#宿主契约踩坑)）。

## 开发

### 源码结构

```text
manifest.json              插件清单（贡献面：editors + ui + fileTreeMenus + settings）
server/index.js            MCP stdio server（纯 Node 零依赖，10 个工具）
server/contrib.js          解析/校验/大纲/快照内核 + 两套大纲输出协议
server/preview-core.js     可视化预览内核（构建期内联进编辑器源码；v0.8.4 起 server 侧也要它 —— 导出兜底渲染）
server/wysiwyg.js          块模型 + 块级回写内核（方案 A；构建期以 IIFE 内联进编辑器源码）
server/export-html.js      自包含 HTML 导出内核（PV_CSS 与编辑器同源，gate 第 10 层逐条比对）
server/pdf-raster.js       PDF/EPS 插图栅格化（v0.9.0；latex_asset 用，磁盘缓存）
panels/editor.tsx          → editors[latex-editor]
panels/outline.tsx         → ui[latex-outline @ outline]
```

v0.9 的地基已经落地，但接线程度不一，别会错意：

```text
server/docmodel.js         无损 CST 文档模型（v0.9 P1）—— 已完成并测试，但**还没被 UI 用上**
server/txlog.js            事务历史（v0.9 P2）—— 已内联进装机产物，已被 panels/editor.tsx 调用
server/corpus/             32 份合成边界语料 + 2 份真实 .tex（npm run corpus 生成/拾取）
docs/v0.9-docmodel-plan.md 改造方案（含「分区进度 / 还剩什么」）
```

下面这些当前不在注册表里，源码保留，需要时加回 `manifest.json` 的 `contributions` 即可：

```text
panels/main.tsx            右侧结构面板 / 整页
panels/editor-header.tsx
panels/editor-tabs.tsx
panels/widget.tsx
panels/code-renderer.tsx
panels/_unused/selection.tsx   划词助手（v0.6.1 下线）
```

### 构建与脚本

```bash
npm install

npm run build          # node .setup/build-singlefile.js   → 打包写盘（热更新）
npm run gate           # node .setup/gate-v070.js          ★ 一条命令跑完全部门禁层次，任何一层红了就退出非零
npm run test:core      # node server/wysiwyg.test.js       内核单测（块模型 / applyEdits 不变式 / 行内往返）
npm run test:docmodel  # node server/v09-docmodel.test.js  v0.9 P1 文档模型（63 项）
npm run test:txlog     # node server/v09-txlog.test.js     v0.9 P2 事务历史（84 项）
npm run test:multifile # node server/v09-multifile.test.js v0.9.1 多文件预览（8 项，**不在 gate 里**）
npm run v09            # node server/v09-baseline.test.js  ★ 现状体检（2 个靶子仍红 —— 退出码 1 是预期）
npm run corpus         # node server/corpus/_make.js       生成合成语料
```

### 验收门（`npm run gate`）

共 27 层，实测 `✓ 验收门全绿（27/27，用时 80.0s）`。层按 `steps` 数组里的执行顺序编号：

| # | 层 | 加于 |
| --- | --- | --- |
| 1 | TDZ 顺序哨兵：依赖数组先用后声明，esbuild 和 tsc 都不报，只能静态查 | 0.7.1 |
| 2 | 内核单测：块模型、`applyEdits` 不变式、行内往返（Node，无 DOM） | — |
| 3 | 无损 CST：`serialize(parse(s)) === s` 逐字节，跑全部语料（v0.9 P1） | v0.9 |
| 4 | 事务历史：coalesce、rebase、gaps（v0.9 P2） | v0.9 |
| 5 | 面板离线编译：按装机同规则内联后 esbuild 编译（含重名、`module.exports` 残留检查） | — |
| 6 | 真 DOM 往返：装机包里的代码加 jsdom 真解析器，零改动往返必须逐字节还原 | — |
| 7 | 样式一致性：就地编辑与只读预览 | 0.7.3 |
| 8 | 形态门禁：「在结果上编辑」的硬约束，不许再长出卡片壳或模式开关 | 0.8.0 |
| 9 | 模式契约：档位入口只剩宿主标签栏一处，喂两代 `props.mode` 断言落档与回写 id | 0.8.3 |
| 10 | 导出契约：唯一会往磁盘写文件的功能，管产物落点、自包含性、样式单一来源 | 0.8.4 |
| 11 | 引擎自检：没装 TeX 引擎时该弹才弹、只弹一次、说的是实话 | 0.8.5 |
| 12 | 格式快捷键：Typora 键位 → LaTeX；菜单右侧标的键位必须真的实现了 | 0.8.6 |
| 13 | 切视图往返：可视化 → 源码 → 回可视化，正文必须还在 | 0.8.8 |
| 14 | 焦点不掉：按钮不夺焦，切档、收起浮层后还能接着按键 | 0.8.9 · 0.8.10 |
| 15 | 能正常编辑：可视化档 Ctrl+1 设标题、回车换行、光标落进正文 | 0.8.11 |
| 16 | 可撤销：打完字撤得动、切档不丢历史、外部改动不清栈（txlog 接线） | 0.8.18 |
| 17 | 块外的字：光标停在块外时敲的字不许静默丢 | 0.8.20 |
| 18 | 撤销看得见：打完字 Ctrl+Z，屏幕与源码一起回去 | 0.8.21 |
| 19 | 代码与内容分道：`\maketitle` 不进预览，字写不进命令 | 0.8.22 |
| 20 | 结构改动后重画：已设为 `\section` 有时不生效 | 0.8.23 |
| 21 | 分屏两栏同步：滚动联动两个方向，回声不打架 | 0.8.24 |
| 22 | 分屏内容同步：右栏打字 → 左栏当场变 | 0.8.25 |
| 23 | 回车分层：Enter 新段落、Shift+Enter 段内换行 | 0.8.26 · 0.8.27 |
| 24 | 行区间：段落一拆，下面所有块的行号跟着挪 | 0.8.27 |
| 25 | 标题块跨多行：章节快捷键还能干活、取消层级不毁稿 | 0.8.28 |
| 26 | 光标几何与全选：点块末尾有光标，Ctrl+A 由插件自己说了算 | 0.8.29 |
| 27 | 端到端综合：大纲跳转、状态栏、格式键真派发（`test-nav.js`） | 0.8.9 收编 |

> 层号有两个体系，别混。各 check 脚本注释里引用的层号（如 `check-v0827-span.js` 自称「层 [25]」）
> 沿用 `gate-v070.js` 文件头注释的编号，而门禁真实执行顺序是 `steps` 数组。
> 两者在 v0.9 把第 3、4 层（docmodel、txlog）插进去之后就不再一一对应了。
> 文件头那份注释目前也已自身受损：`[13]` 出现两次（能正常编辑、端到端综合），
> 缺 `[14]`–`[17]`，止于 `[26]`。想知道第几层是什么，以 `steps` 数组为准。

单层重跑（红哪层跑哪层，按上表编号）：

```bash
node .setup/check-tdz.js                    # 1  TDZ 顺序哨兵
node server/wysiwyg.test.js                 # 2  内核单测
node server/v09-docmodel.test.js            # 3  无损 CST（v0.9 P1）
node server/v09-txlog.test.js               # 4  事务历史（v0.9 P2）
node .setup/check-v070-dom.js               # 6  真 DOM 往返（需 jsdom / esbuild）
node .setup/check-v073-style.js             # 7  样式一致性
node .setup/check-v080-flat.js              # 8  形态
node .setup/check-v083-mode-contract.js     # 9  档位顺序从装机 manifest 读，不写死
node .setup/check-v084-export.js            # 10 导出契约（真 server stdio）
node .setup/check-v085-env-banner.js        # 11 引擎自检（隔离 HOME + 假引擎造两个场景）
node .setup/check-v086-keys.js              # 12 格式快捷键（从装机产物抠表求值）
node .setup/check-v087-roundtrip.js         # 13 切视图往返
node .setup/check-v089-focus.js             # 14 焦点不掉
node .setup/check-v0811-edit.js             # 15 能正常编辑
node .setup/check-v0818-undo.js             # 16 可撤销
node .setup/check-v0824-split-sync.js       # 21 分屏两栏同步
node .setup/check-v0825-live-sync.js        # 22 分屏内容同步
node .setup/check-v0827-enter.js            # 23 回车分层
node .setup/check-v0827-span.js             # 24 行区间
node .setup/_test-v0828-headspan.js         # 25 标题块跨多行
node .setup/check-v0829-caret.js            # 26 光标几何 / 全选（真浏览器复验可选：NOTRAT_CARET_BROWSER=1）
node .setup/test-nav.js                     # 27 端到端综合
```

### 功能级验收（全部离线可跑，退出码 0/1）

```bash
node .setup/verify-v052.js          # 207 项（含下方三个子测试）
node .setup/test-v052.js            # MCP 冒烟：工具表 + 大纲双通路（24 项）
node .setup/test-activefile.js      # 活动文件桥（50 项）
node .setup/test-outline-render.js  # 大纲面板渲染 / 交互（21 项）
```

### 本地直跑 server（不装插件也能测）

```bash
node --check server/index.js
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"latex_parse","arguments":{"path":"samples/sample.tex"}}}' \
  | node server/index.js
```

## v0.9 改造现状

v0.9 不发新功能，专门修一件事的根：撤销不可预测。

现在有三处各自为政的当前内容：宿主 `props.content`、源码档 `textarea.value`、可视化档的
contenteditable DOM，配三套撤销历史，靠三个布尔标志（`wysEditing`、`wysSelfEdit`、`wysHistOp`）
互相打手势。布尔标志是边沿触发的便条，不是计数器，任何一个便条被错误的变化消费掉，
要么该重建没重建（DOM 与源码脱节），要么不该重建却重建（光标丢、视口跳）。
所以症状就是有时能撤、有时说没有可撤、有时撤到别处去。

方案 B 的做法是把三份内容合成一份文档，把三套历史合成一套事务日志，两个视图降级为纯渲染器。
方案原文见 [`docs/v0.9-docmodel-plan.md`](docs/v0.9-docmodel-plan.md)。

### 分期到哪一步了

| 期 | 内容 | 状态 | 代码 / 验收 |
| --- | --- | --- | --- |
| P0 基线 | 把「撤销不可预测」拍成可重放的失败用例 | 完成 | `server/v09-baseline.test.js` + `server/testkit.js` |
| P1 文档模型 | 无损 CST：`serialize(parse(s)) === s` | 完成 | `server/docmodel.js`（619 行）+ `server/v09-docmodel.test.js`（63 项） |
| P2 事务历史 | coalesce / rebase / gaps | 完成 | `server/txlog.js`（573 行）+ `server/v09-txlog.test.js`（84 项） |
| P3-1 历史接线 | 预览档撤销 / 重做改走 `TX.History` | 完成 | v0.8.18 · v0.8.19，验收 `check-v0818-undo.js` |
| P3-2 渲染层 | 删三个布尔标志，按 `node.id` 定点打补丁 | 未开始 | — |
| P3-3 打字合并 | 每键一条事务 + 400ms 封口 | 未开始 | — |
| P4 源码档 | A 档改 → B 档撤 | 未开始 | — |

### 靶子还剩 2 个

`npm run v09` 是现状体检，数的是改造前故意红的靶子：

```text
红线 6/6 全绿 · 靶子 9 已消灭 / 2 待消灭 · 退出码 1（**故意红**，不是坏了）
```

剩下两个都要 P3-2 接上渲染层才能验：

| 靶子 | 现状 |
| --- | --- |
| B2 内核不产出事务凭据 | `applyEdits` 只返回裸字符串，调用方拿不到改了哪些块，只能自己存整份快照 |
| B3 陈旧行号改错块 | 别处插了一行后，用记住的行号再编辑会改错地方，并留下幽灵文本 |

> 正因为还有靶子红着，`v09-baseline` 刻意不接进 `npm run gate`，接进去会把整条门禁一起拖红。
> 反过来，P1、P2 那两个纯模块测试是绿的，已经进门禁了（第 3、4 层）。

### 已经落地、但还没接线的东西

| 模块 | 在装机产物里？ | 被 UI 调用？ |
| --- | --- | --- |
| `server/docmodel.js` | 没内联 | 没用上 |
| `server/txlog.js` | 经 `/*__TX__*/` 内联 | `panels/editor.tsx`（撤销重做、外部改动 rebase） |
| `server/pdf-raster.js` | 拷进 `~/.notrat/tools/` | `latex_asset` 用 |

`docmodel.js` 目前是一栋只盖了地基的房子：无损 CST、`applyOps`、`reproject` 都写好并被 63 项测试盯着，
但渲染层还没吃它。构建脚本里没有 `/*__DOC__*/` 那条通路，`panels/editor.tsx` 里也没有一处引用。
所以现在打开的撤销走的是 txlog 那半条，另一半（按节点定点打补丁）还没来电。

### P 分期之外，v0.9.x 顺手做的

版本号是连着的，但内容不都在 P0–P5 这条线上：

- 0.9.0，PDF/EPS 插图栅格化（`server/pdf-raster.js`）：`\includegraphics{figs/x.pdf}` 以前在预览里
  只能出占位符，现在服务端用 Ghostscript 或 pdftoppm 转成 PNG，带磁盘缓存，源文件 mtime 变了
  自动失效，转不动就退回占位符，绝不阻塞渲染。顺带修了子图编号（`(a)(b)(c)` 每个 float 重排，
  `subfigure` 和 `\subfloat` 都认）和间距命令的参数泄漏（旧版会把 `3mm` 漏成裸文本）。
- 0.9.1，多文件预览：`\input`、`\include` 展开成子文件卡片（循环引用截断），`\tableofcontents`
  家族出占位卡，未知命令不再把命令名漏成正文。验收 `server/v09-multifile.test.js`（8 项），
  注意这一层不在门禁里，得手动跑 `npm run test:multifile`。
- 0.9.2，导出样式比对：改成比类名集合（wys 层的规则如 `.wys-inc-b .pv-ref` 不再误判）；
  子文件卡片的折叠状态在构建时就烘进 HTML。
- 0.9.3，换样例：仓库样例整篇换成新样例。一批测试原来钉死旧样例的具体字句
  （`sec:method`、`\sqrt{d_k}`、某句话），样例一换就整片红，现在改成按形态找
  （按源码行区间、按第一个带 label 的标题、按第一个 `\section` 之后的第一行正文）。

### 改造期的两条硬约束（后来人别踩）

1. 内联是三条通路：`/*__LPC__*/`、`/*__WYS__*/`、`/*__TX__*/`。`build-singlefile.js`、
   `.setup/check-v070.js` 和真渲染 harness（`test-nav.js`、`_probe-edit.js`）四处都要同步。
   漏掉 harness 那一处，被测对象就换成一份跑不起来的代码，而测试还会全绿
   （v0.8.11 漏内联 WYS 就是这么栽的）。
2. harness 只求值一次编辑器模块，真宿主同此语义。模块里的 `require("react")` 是转发器，
   共享模块级状态但 hook 状态各自独立。不这么做，「组件被卸载重挂」这条真实路径永远测不到。

### 语料：这才是最该补的

`server/corpus/` 现有 32 份合成边界语料（`npm run corpus` 生成：CRLF、BOM、末行无换行、
`verbatim` 里的 `%`、多行标题、短标题、`\end{document}` 之后的垃圾、行尾空格、连续空行、
嵌套环境、缺失结构、转义字符等等），外加仓库自带 2 份真实 `.tex`（`samples/sample.tex`
和一份计算机学报模板改编的真实论文）。

合成语料覆盖的是我想到的边界，真实语料覆盖的是我没想到的。方案 §7 要求 20 到 30 份真实 `.tex`，
现在只有 2 份，这是 v0.9 目前最大的缺口。

### 想自己复核

```bash
npm run gate            # 门禁 27 层全绿（约 80s）—— 含 P1 / P2 两层
npm run test:docmodel   # P1：63 项（含全部语料上 serialize(parse(s)) === s 逐字节）
npm run test:txlog      # P2：84 项（含随机交错 200 次 × 40 步，0 失败）
npm run test:multifile  # 0.9.1 多文件预览 8 项（不在门禁里）
npm run v09             # ★ 现状体检：6 红线绿 / 2 靶子仍红 —— 退出码 1 是**预期**
```

种子可复现任一次随机交错：`SEED=20260923 node server/v09-txlog.test.js --iters 1`。

## 已知边界

- 字数统计为近似值（CJK 字符 + 英文单词）。
- 引用校验覆盖 `\ref/\eqref/\autoref/\cref/\cite 家族`；`natbib/biblatex` 常见命令已覆盖，冷门引用命令可能漏识别。
- 编译依赖本机 TeX 发行版（Tectonic、TeX Live、MiKTeX）。交叉引用变化需要二次编译，建议用 latexmk。
- 格式快捷键只在源码或分屏视图生效，且焦点要在源码输入框里。预览区是块级就地编辑，
  往里塞 LaTeX 命令会被当成正文回写，所以那里不接管，菜单「＋ 插入」是等效入口。
- 快捷键挂在根节点的捕获阶段，比组件内部的键盘处理更早，但宿主若在自己的外层捕获同一组合键，
  宿主会先拿到那一下，此时菜单入口照旧可用。
  （查过装机版宿主：它注册的键位只有 `mod+s`、`mod+w`、`mod+shift+1..4`、`mod+shift+d/f/h/r` 等 14 条，
  `Ctrl+1` 不在其中；宿主自己的 Markdown 编辑器用 `Ctrl+1~6` 设标题，但那是它自己的编辑器实例，
  不抢 `.tex` 的源码框。所以这 20 条与宿主不重叠，真正会哑掉的是输入法组字中、非 US 布局这两种情形，
  v0.8.7 起用 `e.code` 兜底，已基本堵上。这也正是菜单里标键位的意义：键位是加速器，不是唯一通路。）
- 引擎探测（`latex_env`、首屏提示条）只检查引擎文件在不在（`fs.accessSync` 存在性检查），
  不实际运行一次。所以检测到引擎不等于编译一定成功：缺宏包、缺字体、引擎自身损坏
  都要到编译那一刻才暴露。反过来也成立，提示条说「未检测到」，并不否定你已经装好的东西。
- PDF/EPS 插图在预览和导出 HTML 里要经过本机栅格化（Ghostscript 或 pdftoppm）。
  两者都没装时这些插图退回占位符，编译成 PDF 后照旧可见，只是预览里看不到；
  不阻塞渲染，但也不出声。
- 多文件预览（`\input`、`\include`）只认同一工作区内的相对路径，且循环引用会截断而不是报错；
  `\tableofcontents` 家族在预览里是占位卡，真目录要编译后才有。
- `editors[].outlineTool`、`notrat-outline-navigate`、`ui[].extensions`：Notrat 1.3.3 起宿主已全部实现
  （本节原写「当前装机版尚未实现」，是拿过期快照下的结论，已在 v0.5.4 更正）。现状：
  - 宿主 `PluginOutlineItems` 用 `{fileName, filePath}` 调 `editors[].outlineTool` 指定的工具，
    返回交 `parseItems()` 渲染进左侧「大纲」页签；点击回抛 `notrat-outline-navigate`（detail 带 `anchor`）。
  - `ui[].extensions` 在 1.3.3 注册表里已保留（更早的构建会丢弃该字段）。
  - 返回形态是硬契约，必须能过宿主 `parseItems`；返回多行文本会被静默解析成 1 条（见 v0.5.3、v0.5.4）。
  - `notrat.minVersion` 写 1.3.3（v0.9.3 起，原为 1.3.0）：插件真的用到 1.3.3 才进注册表的
    `editors[].outlineTool`、`notrat-outline-navigate`、`ui[].extensions`（含 `extractToolText`），
    所以下限抬到 1.3.3，不再声明一个自己并不需要的 1.3.0。
  - 这个字段是声明，不是闸门：核验过运行中的宿主 `app.asar`，里面 42 处 `minVersion`
    全部来自第三方库（protobufjs、semver、TypeScript 的 `ScriptVersionCache`），
    没有一处读 `notrat.minVersion`。所以低于 1.3.3 的宿主照样加载插件，只是那些 1.3.3 契约不在位。
  - 契约是否在位用 `.setup/check/live-host-contract.js` 现场核对，不要信任何旧快照。
- 自带大纲的层级：level 从 1 起。本插件按真实文档层级输出（章、节为 1，小节 2，小小节 3，
  `\part` 兜到 1），`anchor` 直接给源文件行号。注意别把 `level`、`text`、`anchor`
  理解成返回一串多行文本，那是宿主 `parseItems` 的字符串分支，在 MCP 里够不到
  （见 v0.5.4 实验 A），必须用一条一项的数组形态。

## 编译引擎

本机已装 Tectonic 0.17.0（`~/.notrat/tools/bin/tectonic.exe`），插件设置里编译引擎默认就是 `tectonic`。
插件会自动探测常见安装位置，不需要配 PATH。

- Tectonic 首次编译新文档会按需下载宏包（缓存于 `%LOCALAPPDATA%\TectonicProject`），之后离线秒编。
- 已知限制：`biblatex`（backend=biber）文档需要独立安装 biber，且版本要和 bundle 内的
  biblatex（v3.17）严格匹配（biber 2.17）。SourceForge 的 biber Windows 包在受限网络下不好拿，
  要完整的 biblatex 支持建议改装 TeX Live（自带版本匹配的 biber）。
  演示样例已改用无外部依赖的 `thebibliography`。

## 宿主契约踩坑

宿主实现和 Wiki 文档有出入（0.2.4 实测）。照 Wiki 写不会报错，而是静默失效：

1. `mcpServers` 必须用数组形态 `[{ id, name, transport, command, args, env }]`，
   不要用 Wiki §1、§2 示例的对象形态 `{ latex: {...} }`。
   对象形态会让宿主 `enable()` 里 `for...of` 抛
   `object is not iterable (cannot read property Symbol(Symbol.iterator))`，
   表现为插件管理页点「启用」没反应、MCP server 永远不被 spawn、日志无明确报错
   （只有 Renderer:ERROR 一行 UnhandledRejection）。
2. `contributions.settings` 同样必须数组：
   `[{ key: "组名", title, fields: [{ key, label, type, default }] }]`，
   分组 `key` 必须等于 `manifest.id`，占位符只写纯字段名 `${settings:<字段名>}`。
   Wiki §3.3 说的 `${settings:组名.字段名}` 与宿主实现不符，照写会让设置静默失效（见 §v0.4.2）。
3. 佐证：notrat-broadcast、notrat-sync、notrat-flow 三个在跑的官方插件全是数组形态。

## 版本历史

完整版本历史拆到了 [`CHANGELOG.md`](CHANGELOG.md)（33 个版本节加版本速览，正文逐字保留）。

本 README 只留稳定事实（特性、安装、使用、边界）。哪个版本改了什么、为什么改、
踩了哪些坑、验了哪些断言，都在 CHANGELOG 里按写作顺序记着：

- 最近几版：v0.8.27（回车即新建段落）、v0.8.26（段末 `<br>` 是光标落脚点）、
  v0.8.25（分屏内容双向同步）、v0.8.24（分屏滚动双向联动）、v0.8.22（代码与内容分道）、
  v0.8.5（无引擎首屏提示）、v0.8.4（导出）
- 转折点：v0.7.0（可视化变成可编辑）、v0.6.1（摘掉划词助手、修点大纲不跳）、
  v0.5.2（收敛为编辑器加大纲）
- 早期：v0.3.0（Overleaf 式实时预览）

> CHANGELOG 还差 6 个版本没写：v0.8.28、v0.8.29、v0.9.0、v0.9.1、v0.9.2、v0.9.3。
> 这几版改了什么，暂时只能从代码与门禁层里读（v0.9 那三版见 [v0.9 改造现状](#v09-改造现状)）。

> 要接回划词助手，或想看在跑的官方插件怎么写 manifest，先翻 [CHANGELOG](CHANGELOG.md) 里的同名小节。

## 许可证

[MIT](manifest.json) © Notrat Community
