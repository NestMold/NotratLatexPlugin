
## v0.5.0 — 章节大纲面板重做（能点、成树、认编号、跟光标）

**动手前先看它到底长什么样**：去宿主包（`app.asar`）里确认了挂载位，`PluginOutlinePanels`
（`components/Sidebar/PluginUiHosts.tsx`）把插件面板塞进左侧「大纲」页签里，结构是：

```
<div className="p-3 pt-1 space-y-2 notrat-plugin-slot notrat-plugin-slot-outline">   ← 外层留白
  <div>插件面板</div>
  <Dismissable><PanelShell>…   ← PanelShell 已经给了卡片边框 + 图标标题行
```

所以 v1 那套「`height:100%` + 自己再画一行标题」是错的：高度百分比在 auto 高度容器里不生效，
自己那行标题又和 PanelShell 的标题行重复。v2 改成**自然高度 + 三行紧凑控制条**，不再自画标题。

### v1 的六个问题（逐条修掉）

| # | v1 症状 | v2 做法 |
|---|---|---|
| 1 | **行不可点**——`cursor: default`、没有 onClick，点章节毫无反应，等于一个只读目录 | 点任意行 → 源码滚过去并高亮闪烁；通道 `notrat-latex-reveal-line`，编辑器回 `…-ack` 回执 |
| 2 | 平铺列表，靠 padding 假装缩进；长论文一屏放不下，也看不出谁属于谁 | 按层级建**树**，逐节折叠（chevron），折叠状态**按文件**记在 sessionStorage |
| 3 | 编号是面板自己从 1 数的：`\section*` 也编号、book 类文档不认章号 | 编号函数认 `chapter`/`part`、认 `\section*`（不编号且不推进计数器）、book/report 下给 `1.2` / `1.2.3` 前缀 |
| 4 | 只有章节——解析器明明返回了图表公式和 TODO，面板全丢 | 图/表/公式（带 **caption + 编号 + `\label` + 起止行**）与 TODO/FIXME 进树，挂在「它前面那一节」下；三个开关可关 |
| 5 | 不知道你正在写哪一节 | 编辑器广播 `notrat-latex-cursor`，面板高亮该节、自动展开祖先、滚进视野（「跟随光标」可关） |
| 6 | 没有检索 | 过滤框：命中即展开祖先；Esc 清空 |

另外补了键盘导航（↑↓ 移动并跳转 / Enter / Home / End / Esc），以及一个「层级」下拉（仅顶层 / 1 / 2 / 3 / 全展开）。

### 顺带把解析器补全（`server/index.js`）

v1 的 `environments` 只有 `{name, line}`——面板能列出「🖼 图」，但拿不到图题，也没法点 `\label`。
新增 `collectFloats()`：按 `\begin`/`\end` 配对，补出

```json
{ "name": "figure", "line": 27, "endLine": 31, "caption": "模型整体结构", "label": "fig:model" }
```

未闭合的环境**照样进清单**（配对错误留给 `latex_validate` 去报，解析侧不吞信息）。

### 新增两条事件通道（`panels/editor.tsx` 侧同步实现）

| 通道 | 方向 | 用途 |
|---|---|---|
| `notrat-latex-reveal-line` | 面板 → 编辑器 | 滚到某行 + 高亮闪烁；**编辑器回 `notrat-latex-reveal-ack`** |
| `notrat-latex-cursor` / `…-ping` | 编辑器 → 面板 | 广播光标行；面板挂载时 ping 一次要当前值 |

**为什么要 ACK**：面板拿不到编辑器实例（官方 props 只有 `{serverId, pluginId, ctx, data, error, launch}`，
`ctx` 里只有 `workspace`），只能靠事件广播。ACK 让「点了一行」有确定的成败——**170 ms 没人接住**
就说明该 .tex 压根没在编辑器里打开，于是回落 `notrat-open-file` 让宿主打开它，隔一拍再补发一次。
用户点大纲一定有反应。

### 工程教训（这条是真被测出来的）

第一版 v2 里 JSX 上挂了 `ref={bodyRef}`，但声明在改写时被漏掉了。
**esbuild 转译通过、宿主静态体检通过、纯逻辑单测全绿**，一渲染直接
`ReferenceError: bodyRef is not defined`——整个面板白屏。

教训：`esbuild 通过` 只证明语法合法，离「能渲染」还差得远。于是补了
`.setup/test-outline-render.js`：esbuild 转 CJS → 塞迷你 React → 假 window/sessionStorage →
**真起 MCP server 拿 JSON** → 渲染到稳定 → 断言树里出现什么 → **真的去点一行**看有没有派发事件。
这个测试当天就抓到了上面那个白屏 bug。

### 验收（全部离线可跑，退出码 0/1）

| 脚本 | 覆盖 | 结果 |
|---|---|---|
| `.setup/verify-v040.js` | 清单/贡献面/9 份内联源码 esbuild 转译/工具注册/工作区↔部署产物一致性 | ✅ 69 项 |
| `.setup/test-activefile.js` | 活动文件桥（生产者广播 + 消费者 hook + 各面板接线） | ✅ 53 项 |
| `.setup/test-outline-v2.js` | 大纲纯逻辑（编号/建树/过滤/折叠/活跃节）+ **跨文件通道名逐字一致** + 真样例建树 | ✅ 82 项 |
| `.setup/test-outline-render.js` | 大纲面板**真渲染** + 点击派发事件（行号/路径/nonce 全查） | ✅ 21 项 |

```bash
node .setup/build-singlefile.js      # 构建部署（~/.notrat/plugins + ~/.notrat/tools）
node .setup/verify-v040.js
node .setup/test-activefile.js
node .setup/test-outline-v2.js
node .setup/test-outline-render.js
```

**跨文件通道名一致性**这条值得单说：这类「靠 window 事件解耦」的设计，头号故障就是两个文件里
字符串拼得不一样（改了这边忘了那边），而且**编译期、运行期都不报错**——只是点了没反应。
所以测试直接从两份源码里各抠出 `const LATEX_REVEAL = "…"` 逐字比对。

### 顺手修正的过期断言（都是"猜的契约"，这次按宿主实现改）

| 断言 | 旧期望 | 真实契约（宿主源码位置） |
|---|---|---|
| `editors[].dualView` | `=== true`（布尔） | **双元素非空字符串数组**：`syncPluginEditors` 里 `Array.isArray(dualView) && length===2 && every(string)`；传布尔会被丢掉 → 双视图静默失效 |
| `${settings:}` 占位符 | 要求再双写一套 `_ALT`（带组名 `.字段`） | **只要裸字段名**：`resolvePlaceholders` 走 `getValue(pluginId, key)`，而设置面板写值走 `setValue(settings.key, field.key, value)` → `${settings:latex.compiler}` 只会解析成空串。现断言**禁止** `_ALT` 残留 |
| `hostView` | 编辑器里找 `hostView` | 实际标识符是 `hostMode`（`hostView` 从没存在过） |
| 部署包版本 | 写死 `"0.4.1"` | 改为与工作区 `manifest.json` 比对（写死导致测试长期红着没人管） |

### 已知边界（没动的）

- **编辑器内置的那条 150px 大纲列**（`panels/editor.tsx` 里的内部 `outline`）仍是平铺列表，
  只认 `chapter/section/subsection/subsubsection`，不认 `\section*`，也不含图表公式。它和侧栏面板
  是两个面：一个贴在编辑器里随时可见，一个在侧栏带检索/折叠/跳转。要不要合并成一套，等你决定。
- 树的跳转只在**同一个 .tex 内**生效；`\input` / `\include` 进来的子文件目前当独立文件看，
  没有把子文件内容拼进同一棵树。
