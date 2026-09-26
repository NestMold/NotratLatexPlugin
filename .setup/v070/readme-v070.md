
## v0.7.0 — 可视化视图变成可编辑（方案 A：块级外科手术）

### 需求

> 「目前不能够像 TipTap 一样编辑 latex 吗」

### 结论先说

**不能内联 TipTap，但也不需要。** 两条硬事实：

1. **宿主不给 TipTap。** 面板 / 编辑器的模块解析器是一个**写死的 7 项白名单**（装机版
   `dist/assets/index-*.js` 里的 `moduleMap`）：`react` / `react-dom` / `lucide-react` /
   `@/utils/cn` / `@/store` / `@/store/slices/componentOverride` / `@/utils/tokenEstimate`。
   `@tiptap/*` 与 `prosemirror-*` 一律运行时抛错。宿主**自己**确实是 TipTap（bundle 里有
   `tiptap-editor` / `prosemirror-model`），但那是宿主私有依赖，不在插件契约里。
2. **TipTap 解决的不是这里的问题。** 它的 doc 模型 ≠ LaTeX 源码。真上 TipTap，`\cite` / `\ref` /
   宏定义的**回写语义问题一点没省**——只是把「怎么接 contenteditable」换成了「怎么把 PM 节点映回 TeX」。
   换来的是 schema / undo / IME / 选区这些基础设施，代价是装机包再翻几倍。

所以走 **方案 A：块级外科手术**。内核 `server/wysiwyg.js` 在 v0.6.x 就写好了（29 项单测全绿），
但一直是**死代码——没有任何文件 require 它**。本版把它接上。

### 设计红线（为什么不做「HTML → LaTeX」全量重建）

> LaTeX 是编程语言，而预览渲染层是**有损**的——
> `\cite{vaswani2017}` → `[1]`，`\ref{fig:model}` → `图 1`，`\includegraphics` → 只剩占位文件名。
> 若由渲染结果反向生成源码，用户敲一次字就会烧掉 `\cite` / `\ref` / 宏定义——对论文作者等于丢稿。

于是内核只做一件事：**每个块记住自己的 `[startLine, endLine]`，只有用户真改过的块才用自己的新文本
替换自己的行区间；没改的块逐字节原样保留**（硬不变式 `applyEdits(src, []) === src`）。

### 三层实现

| 层 | 位置 | 职责 |
|---|---|---|
| 内核 | `server/wysiwyg.js`（零依赖，Browser / Node 双端） | `parseDoc` 出块模型；`applyEdits` 做行区间替换；`parseInline` / `segmentsToTex` 管行内原子；`headingTex` 保住 `*` / `[短标题]` / `\label` |
| 渲染 | `panels/editor.tsx` 的 `wysInline` / `wysRenderDoc` | `editable:true` 的块（**只有 heading / paragraph**）→ `contenteditable="true"`；行内 `\cite` / `\ref` / `$..$` → `contenteditable="false"` + `data-tex`；其余全部 → 只读原子卡片（点一下跳源码行） |
| 读回 | `panels/editor.tsx` 的 `wysDomToTex` | DOM → LaTeX：`data-tex` 原样吐出、`data-open` 记包裹命令（回写补 `}`）、文本按 `nodeValue` 取回、`\u00a0` 归一 |

### 三条不变式（缺一条就会丢稿）

1. **编辑期间 DOM 是权威** —— 绝不回写 `innerHTML`（`wysEditing` ref 守卫），否则每敲一个字光标就丢。
2. **只提交真正改过的块** —— 渲染时把每块原文记进 `wysOrigRef`，读回后逐块比对。
3. **提交前三道自检**，任何一条不过就**整批放弃**，不半途改坏文件：
   - `applyEdits(src, []) === src`（空编辑集逐字节还原）
   - `parseDoc(next)` 不抛（结果仍可解析）
   - `next !== content`（无改动不产生 diff）

提交时机：**失焦 / Ctrl+S / 切视图 / 编译前 / 校验前**（后两者还会顺手 `onSave()`——编译读的是磁盘文件，
不保存等于拿旧文件糊弄用户）。带撤销 toast（9 秒），一键回到编辑前。

### 踩到一个坑：两份内核顶层重名

`preview-core.js` 与 `wysiwyg.js` **都有** `escHtml` / `readGroup` / `findEnvEnd`。两份内联进同一个模块
作用域，esbuild 直接报：

```
The symbol "findEnvEnd" has already been declared
Duplicate top-level function declarations are not allowed in an ECMAScript module.
```

这是**编译期就炸**，装机后同样加载不了。修法不是去改内核里的函数名（那会连累 `server/` 侧单测与 Node
直用），而是**把整个 WYS 内核包进 IIFE**，顶层只留 `const WYS = (function(){...})();`
（`module.exports = {..}` 改写成 `return {..}`）。改的是内联层，内核一行没动。

### 验收（三层，一条命令 `npm run gate`）

```
[1] node server/wysiwyg.test.js       44 项  块模型 / applyEdits 不变式 / 行内往返 / 多块混合编辑 / 标题改多行
[2] node .setup/check-v070.js         编译   按装机同规则（LPC + WYS 双内联）esbuild 真转译 + 重名与 module.exports 残留检查
[3] node .setup/check-v070-dom.js     19 项  装机包里的代码 + jsdom 真 HTML 解析器 —— 真 DOM 往返
```

第 [3] 层是这次的关键，它验的是最要命的一条：

```
★ 零改动往返：渲染 → DOM → 读回 → applyEdits(src, 全部块原样回写) === src
```

只要这条成立，「聚焦 / 失焦 / 敲几个字」就**不可能丢字节**。附加断言：模拟段首插字后 `\cite` 原子原样
存活、改动只落在该块行区间（其余行逐字节不动）、标题改完 `\label{sec:method}` 仍在、渲染产物无
`<script>` / `onerror`（HTML 注入防线，10 组行内往返含 `< b & c >`、中文引号、`<script>` 用例）。

内核回归门从 29 项涨到 **44 项**（新增行内往返契约 / 多块混合编辑 / 标题改多行 / 提交路径三道自检）。

### 已知边界（就地编辑）

- **Enter 是块内换行**，不是新建段落 / 新章节——要加章节请用工具栏按钮或源码视图（v1 有意收窄，
  避免自动生成的结构破坏文档）。
- **原子节点可以整个删掉**（选中后删除 = 你确实不要这个 `\cite` 了），但改不到它内部。
- **跨块撤销**只有 toast 那个「↩ 撤销本次编辑」；宿主 `Ctrl+Z` 管不到编辑层内部（DOM 是权威期间
  不由宿主栈记账）。
- 粘贴**只收纯文本**，HTML 富文本一律丢弃（防止 HTML 进 `.tex`）。粘贴进来的 `\cite{..}` 会先当纯文本，
  提交重渲染后才变成原子。
- 只在**可视化**视图生效；源码视图行为完全不变。
