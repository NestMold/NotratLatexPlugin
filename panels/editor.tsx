import React, { useState, useRef, useEffect, useMemo } from "react";
/*__LPC__*/
/*__WYS__*/
/*__TX__*/

/* v0.8.18：撤销历史按文件留住 —— 模块级。
 *
 * 为什么不能只放在组件里：宿主**切主区标签会卸载组件**（README 的宿主契约里写着），
 * 组件里的 ref 跟着没。于是「打完字 → 去源码档看一眼 → 切回来 → Ctrl+Z」这条
 * 最平常的路径，在真机上就是「组件重挂 + 历史空白」—— 用户看到的那句
 * 「预览档没有可撤销的改动」就是这么来的。
 *
 * 模块级 = 插件加载期间一直活着（宿主只求值一次模块），重挂之后能接上。
 * 上限 8 份文件：不按文件分家的话，A 的撤销链会被套到 B 上。
 * 步数上限 50：每一步存的都是整份源码，别拿内存换步数（与旧实现同一档）。 */
const WYS_HIST_BY_FILE = new Map();
const WYS_HIST_FILES_MAX = 8;
const WYS_HIST_STEPS_MAX = 50;
function wysHistFor(key, source) {
  let h = WYS_HIST_BY_FILE.get(key);
  if (!h) {
    h = new TX.History({ base: source, limit: WYS_HIST_STEPS_MAX });
    WYS_HIST_BY_FILE.set(key, h);
    while (WYS_HIST_BY_FILE.size > WYS_HIST_FILES_MAX) {
      const oldest = WYS_HIST_BY_FILE.keys().next().value;
      if (oldest === key) break;
      WYS_HIST_BY_FILE.delete(oldest);
    }
  } else if (h.state() !== source) {
    /* 面板被卸载期间这份文件被别处改过 —— 重映射过去。
     * 合不上的那几条会被丢掉并计入 gaps（接着就会弹给用户），绝不假装还能撤。 */
    try { h.rebase(h.state(), source); } catch (e) { }
  }
  return h;
}

/**
 * LaTeX 编辑器 v0.8.5 — editors 贡献面（接管 .tex 文件）
 * Overleaf 式分栏实时预览 + 划词引用到 Sidebar（notrat-quote-to-chat 第一方通道）
 * props: { pluginId, ctx, file, content, onChange, onSave, fileName, filePath,
 *          mode?, onModeSwitch?, modes?, setStatus }
 * 模式契约（v0.8.3）：视图入口**全部交给宿主标签栏**（标签 tab 右侧那排），编辑器不再自绘顶栏按钮。
 *   manifest 两个字段同时声明，跨客户端版本都可用：
 *     dualView = ["可视化","源码"]      → 旧客户端（只认 dualView）：props.mode = "wysiwyg" | "source"
 *     modes    = 可视化 / 源码 / 分屏    → 新客户端（modes 生效、dualView 被忽略）：
 *                                         props.mode = "visual" | "source" | "split"，并下发 props.modes
 *                                         （第一项 = 宿主默认档，所以「可视化」排最前）
 *   onModeSwitch(id) 是唯一回写通路；setStatus 恒有，mode / onModeSwitch / modes 只在声明了上述字段时注入。
 * 导出（v0.8.4）：工具栏「⬇ 导出」→ MCP latex_export。
 *   PDF  = 本机 TeX 引擎编译出的产物；HTML = 自包含单文件（公式已排版、图片内嵌 dataURI、含 A4 打印样式）。
 *   预览走宿主的 notrat-open-file 通道（.pdf 有内置阅读器，.html 有内置预览器）——
 *   开的永远是**刚导出的那个文件**，不会出现「预览一套、导出另一套」。
 *   产物路径 / 换目录 / 重新生成都在底部「⬇ 导出」结果条里，不另造弹窗。
 * 环境自检（v0.8.5）：挂载时探测本机 TeX 引擎（MCP latex_env），**没装才**显示一条可关的顶部提示条，
 *   并把「已提示」记在服务端（~/.notrat/notrat-latex-state.json）—— 只在「编译 PDF」这条路上会卡住。
 * 数据通路：window.electronAPI.mcp.callTool（主进程 IPC）+ window CustomEvent（与宿主自家编辑器同一引用通道）
 * 样式：内联 style + 主题 token，明暗主题自适应
 */

const FH = "20px"; // 行高（滚动同步与行跳转都依赖它）
const MONO = "Consolas, 'Courier New', ui-monospace, monospace";
const CLR = {
  cmd: "#38bdf8",
  math: "#f0abfc",
  brace: "#94a3b8",
  comment: "#71717a",
  esc: "#fbbf24",
  amp: "#fbbf24",
};

/* 预览区样式（pv-* 类，来自 preview-core 输出；明暗主题经 CSS 变量适配） */
const PV_CSS = `
.pv-root{color:hsl(var(--foreground));word-break:break-word}
.pv-root p{margin:0 0 10px}
.pv-title{text-align:center;margin:18px 0 26px}
.pv-title-main{font-size:22px;font-weight:700;line-height:1.4}
.pv-author{margin-top:8px;color:hsl(var(--muted-foreground))}
.pv-date{margin-top:2px;color:hsl(var(--muted-foreground));font-size:13px}
.pv-h1{font-size:20px;font-weight:700;margin:26px 0 10px;padding-bottom:4px;border-bottom:1px solid hsl(var(--border))}
.pv-h2{font-size:17px;font-weight:700;margin:22px 0 8px}
.pv-h3{font-size:15px;font-weight:700;margin:18px 0 6px}
.pv-par{font-weight:600;margin:14px 0 4px}
.pv-eq{margin:12px 0;text-align:center;position:relative;overflow-x:auto}
.pv-eqbody{display:inline-block;max-width:100%}
.pv-eqno{position:absolute;right:0;top:50%;transform:translateY(-50%);color:hsl(var(--muted-foreground));font-size:13px}
.pv-mini{font-family:Georgia,'Times New Roman',serif;font-style:italic;padding:0 2px}
.pv-tabwrap{overflow-x:auto;margin:10px 0}
.pv-tab{border-collapse:collapse;margin:8px auto;font-size:13.5px}
.pv-tab td{border:1px solid hsl(var(--border));padding:4px 14px}
.pv-hr td{border-top:2px solid hsl(var(--foreground)/.55)}
.pv-float{border:1px dashed hsl(var(--border));border-radius:10px;padding:14px;margin:16px 0;text-align:center;background:hsl(var(--muted)/.25)}
.pv-float figcaption{margin-top:8px;color:hsl(var(--muted-foreground));font-size:13px}
.pv-img{max-width:88%;border-radius:6px;margin:4px 0}
.pv-imgerr{outline:1px dashed #f59e0b}
.pv-imgna{background:hsl(var(--muted)/.5);padding:20px;color:hsl(var(--muted-foreground));border-radius:8px;font-size:13px}
.pv-inc{border:1px solid hsl(var(--border));border-left:3px solid hsl(var(--primary)/.55);border-radius:10px;margin:14px 0;overflow:hidden;background:hsl(var(--muted)/.14)}
.pv-inc-h{padding:6px 12px;font-size:12px;color:hsl(var(--muted-foreground));background:hsl(var(--muted)/.35);border-bottom:1px solid hsl(var(--border))}
.pv-inc-b{padding:10px 14px}
.pv-inc-b .pv-ref,.pv-inc-b .pv-cite{pointer-events:none}
.pv-inc-miss .pv-inc-b{color:hsl(var(--muted-foreground))}
.pv-sc{font-variant:small-caps;letter-spacing:.03em}
.pv-url{color:hsl(var(--primary));text-decoration:underline;text-underline-offset:2px;word-break:break-all}
.pv-marg{display:inline-block;max-width:240px;font-size:12px;line-height:1.5;color:hsl(var(--muted-foreground));background:hsl(var(--muted)/.45);border-radius:6px;padding:1px 8px;margin-left:6px;vertical-align:middle;text-align:left}
.pv-tocph{border:1px dashed hsl(var(--border));border-radius:10px;padding:16px;margin:16px 0;text-align:center;color:hsl(var(--muted-foreground));font-size:13px;background:hsl(var(--muted)/.25)}
.pv-tocmini{display:inline-block;margin:6px 0;padding:2px 10px;border-radius:999px;font-size:12px;color:hsl(var(--muted-foreground));background:hsl(var(--muted)/.5)}
.wys-inc{margin:8px 0 2px;border:1px solid hsl(var(--border));border-left:3px solid hsl(var(--primary)/.55);border-radius:10px;overflow:hidden;background:hsl(var(--muted)/.14)}
.wys-inc-h{padding:6px 12px;font-size:12px;color:hsl(var(--muted-foreground));background:hsl(var(--muted)/.35);border-bottom:1px solid hsl(var(--border));display:flex;justify-content:space-between;gap:8px;cursor:pointer;user-select:none}
.wys-inc-h:hover{color:hsl(var(--foreground))}
.wys-inc-f{display:inline-block;width:13px;opacity:.75}
.wys-inc.wys-inc-fold .wys-inc-b{display:none}
.wys-inc.wys-inc-fold .wys-inc-h{border-bottom:none}
.wys-inc-say{opacity:.75;font-weight:400}
.wys-inc-b{padding:10px 14px}
.wys-inc-b .pv-ref,.wys-inc-b .pv-cite{pointer-events:none}
.wys-inc-wait{padding:10px 14px;color:hsl(var(--muted-foreground));font-size:13px}
.pv-ref,.pv-cite{color:hsl(var(--primary));border-bottom:1px dotted hsl(var(--primary));cursor:pointer;font-size:.9em;padding:0 1px}
.pv-ref:hover,.pv-cite:hover{background:hsl(var(--primary)/.12);border-radius:3px}
.pv-bad{color:#ef4444;border-color:#ef4444}
.pv-fn{font-size:11px;color:hsl(var(--muted-foreground))}
.pv-bib{margin-top:22px;padding-top:10px;border-top:1px solid hsl(var(--border))}
.pv-bib-t{font-weight:700;margin-bottom:8px}
.pv-bibitem{padding-left:2.2em;text-indent:-2.2em;margin:4px 0;font-size:13px;line-height:1.7}
.pv-bibno{margin-right:8px;font-weight:600}
.pv-tt{background:hsl(var(--muted)/.6);padding:1px 5px;border-radius:4px;font-family:Consolas,monospace;font-size:.9em}
.pv-code{background:hsl(var(--muted)/.55);padding:10px 12px;border-radius:8px;overflow:auto;white-space:pre-wrap;font-family:Consolas,monospace;font-size:12.5px;line-height:1.6}
.pv-quote{border-left:3px solid hsl(var(--border));margin:12px 0;padding:2px 14px;color:hsl(var(--muted-foreground))}
.pv-abs{background:hsl(var(--muted)/.3);border:1px solid hsl(var(--border));border-radius:10px;padding:12px 16px;margin:16px 0}
.pv-abs-t{font-weight:700;margin-bottom:6px}
.pv-list{padding-left:1.8em;margin:0 0 10px}
.pv-list li{margin:4px 0}
.pv-list p{margin:2px 0}
.pv-center{text-align:center;margin:10px 0}
/* KaTeX 在暗色主题下继承前景色 */
.pv-root .katex{color:inherit;font-size:1.04em}
.pv-root .katex-display{margin:0}
`;

/* =====================================================================
 * 就地编辑层（v0.7.0 · 方案 A）
 *
 * 权威源仍然是 LaTeX 源码。本层只做两件事：
 *   1) 把 WYS.parseDoc 出的块渲染成「可编辑文本 + 原子节点」；
 *      v0.8.0：**就地编辑不是模式，是预览区唯一的形态**。
 *      预览区就是这份文档 —— 点正文就打字、点公式就在原地改，
 *      没有「进编辑态 / 出编辑态」，没有卡片，没有 { } 源码按钮。
 *      心智模型 = Word / Markdown，不是「一个可以切换成可编辑的只读视图」。
 *   2) 用户改完，用 WYS.applyEdits 只替换**被改过的那几块**的行区间。
 *
 * 红线：绝不从渲染结果反向重建整篇源码。
 *   \cite{vaswani2017} 渲染成 "[1]"、\ref{fig:model} 渲染成 "图 1" —— 都是有损的。
 *   一旦「HTML → LaTeX」，用户敲一次字就会烧掉 \cite / \ref / 宏定义。
 *   所以原子节点一律 contenteditable=false + data-tex，回写时原样吐出。
 * =================================================================== */
const WYS_CSS = `
/* v0.8.12：正文块**不再是一个个盒子**。整篇只有一个编辑宿主，块只是一段文字，
 * 不再是「一张卡片」。原来每块给 hover 底色 + focus 底色 + 底部内阴影 + 圆角外距，
 * 读起来像一摞卡片（用户原话「按块的格式感很重」）。
 * 现在只留一条极淡的 hover 提示「这里能点」，以及一丝 focus 底色 ——
 * 「我正在哪一段」交给光标自己说，不再画框。 */
.wys-blk{position:relative;border-radius:4px}
.wys-blk:hover{background:hsl(var(--muted)/.16)}
.wys-blk:focus-within{background:hsl(var(--primary)/.035)}
/* 唯一编辑宿主：焦点框不要（在整页上画个框太吵），光标本身就是「这里可编辑」的说明。
 * min-height 保证空文档 / 只剩导言区时仍然点得进去。 */
.wys-editroot{outline:none;min-height:120px}
.wys-editroot:focus,.wys-editroot:focus-visible{outline:none}
.wys-edit{outline:none;display:inline;white-space:pre-wrap;overflow-wrap:break-word;min-width:1em}
/* 以下 h1/h2/h3/par/p 的数值必须与 PV_CSS 的 .pv-h1/.pv-h2/.pv-h3 / .pv-par / .pv-root p 保持一致。
 * 两套 CSS 目前是「人工同步」的：改一边就要改另一边，门禁脚本 check-v073-style.js 会盯着。 */
.wys-h1{font-size:20px;font-weight:700;margin:26px 0 10px;padding-bottom:4px;border-bottom:1px solid hsl(var(--border))}
.wys-h2{font-size:17px;font-weight:700;margin:22px 0 8px}
.wys-h3{font-size:15px;font-weight:700;margin:18px 0 6px}
/* \subsubsection / \paragraph 这一档预览不升字号，只加粗（.pv-par） */
.wys-par{font-weight:600;margin:14px 0 4px}
.wys-p{margin:0 0 10px}
.wys-fix{color:hsl(var(--muted-foreground)/.7);font-family:Consolas,'Courier New',monospace;font-size:.85em;white-space:pre-wrap}
.wys-atom{border-radius:4px;padding:0 2px}
.wys-math{padding:0 1px}
.wys-cite,.wys-ref{color:hsl(var(--primary));border-bottom:1px dotted hsl(var(--primary));font-size:.9em}
.wys-cmt{color:#71717a;font-family:Consolas,monospace;font-size:.9em}
.wys-wrap{white-space:pre-wrap}
/* 原子块（公式 / 图 / 表 / 文献 / 环境）：外观就是**最终渲染结果**，没有卡片壳。
 * v0.7.4：常驻头部条 + 两个文字按钮全部撤掉 —— 工具条只在 hover / 选中时浮出，
 *          默认零视觉占用，整页看起来就是只读预览。 */
/* ---------- 原子块（公式 / 图 / 表 / 文献 / 环境）：外观就是最终渲染结果 ----------
 * v0.8.0：不套壳、不放按钮。点它在**原地**打开编辑器（见 .wys-pop）。
 *         hover 只留一条极淡的边，告诉用户「这里能点」—— 这也是 Word 的做法。 */
/* 注意别和行内原子 .wys-atom（\cite / 
ef / 行内公式，见文件前段）撞名：
 * 行内那种是**片段**，块级这种是**整块**，两者结构和提交路径都不同。 */
.wys-atomblk{position:relative;margin:14px 0;border-radius:8px;border:1px solid transparent;cursor:text;transition:border-color .12s ease,background .12s ease}
.wys-atomblk:hover{border-color:hsl(var(--border));background:hsl(var(--muted)/.14)}
.wys-atomblk.picked{border-color:hsl(var(--primary)/.6);background:hsl(var(--primary)/.05)}
.wys-atomblk-body{padding:2px 4px}
.wys-atomblk-body>:first-child{margin-top:0}
.wys-atomblk-body>:last-child{margin-bottom:0}
/* ---------- 导言区（页首）：渲染成成品的样子，不是一坨源码 ----------
 * 数值必须与 PV_CSS 的 .pv-title / .pv-title-main / .pv-author / .pv-date 逐项一致，
 * 否则同一份 .tex 在这层和「只读预览」里页首长两样（check-v080-flat.js 会逐项对账）。 */
.wys-front,.wys-front:hover,.wys-front:focus-within{background:transparent;box-shadow:none}
.wys-front-head{text-align:center;margin:18px 0 26px}
.wys-front-t{font-size:22px;font-weight:700;line-height:1.4}
.wys-front-a{margin-top:8px;color:hsl(var(--muted-foreground))}
.wys-front-d{margin-top:2px;color:hsl(var(--muted-foreground));font-size:13px}
/* 「一行一项」的就地编辑目标：渲染出来的是成品的样子，点一下在原地改它那一行。
 * 与正文块「点哪改哪」是同一套动作，区别是不开放 contenteditable ——
 * 标题里的 \LaTeX / \thanks 照样是有损渲染，直接敲会把命令烧掉。 */
.wys-fmline{cursor:text;border-radius:5px;transition:background .12s ease,box-shadow .12s ease}
.wys-fmline:hover{background:hsl(var(--muted)/.4);box-shadow:0 0 0 3px hsl(var(--muted)/.4)}
.wys-fmline.picked{background:hsl(var(--primary)/.08);box-shadow:0 0 0 3px hsl(var(--primary)/.14)}
.wys-front-meta{display:flex;flex-wrap:wrap;gap:5px;justify-content:center;align-items:center;margin:-12px 0 20px}
.wys-chip{display:inline-flex;align-items:center;gap:3px;padding:0 7px;border-radius:999px;border:1px solid hsl(var(--border));background:hsl(var(--muted)/.3);color:hsl(var(--muted-foreground));font-family:Consolas,'Courier New',monospace;font-size:11px;line-height:17px;white-space:nowrap}
.wys-chip b{color:hsl(var(--foreground)/.82);font-weight:600}
.wys-chip i{font-style:normal;opacity:.7}
/* 导言区整体源码：默认收起，落在页首下方 —— 上面没认领的行（\begin{document} 等）从这里改得到。 */
.wys-raw{margin:0 0 16px}
.wys-raw>summary{cursor:pointer;list-style:none;text-align:center;font-family:Consolas,monospace;font-size:11px;color:hsl(var(--muted-foreground));padding:1px 2px;border-radius:5px}
.wys-raw>summary::-webkit-details-marker{display:none}
.wys-raw>summary:hover{background:hsl(var(--muted)/.5);color:hsl(var(--foreground))}
.wys-raw .wys-edit{display:block;margin:6px 0;padding:6px 10px;border-left:2px solid hsl(var(--border));font-family:Consolas,'Courier New',monospace;font-size:12.5px;line-height:1.75;white-space:pre-wrap;color:hsl(var(--foreground)/.78)}

.wys-src{margin:0;padding:8px 10px;white-space:pre-wrap;overflow-wrap:break-word;font-family:Consolas,'Courier New',monospace;font-size:12.5px;line-height:1.6;color:hsl(var(--foreground)/.82);max-height:260px;overflow:auto;border-radius:6px;background:hsl(var(--muted)/.4)}
/* 标题的自动编号：与只读预览同构，不可编辑（改了标题文字它自己重算，跟 Word 一致） */
.wys-num{color:hsl(var(--muted-foreground));font-weight:600;margin-right:.45em;user-select:none}
/* ---------- 就地编辑浮层：在**原地**改公式 / 引用 / 图表，不跳源码视图 ---------- */
.wys-pop-dim{position:fixed;inset:0;z-index:59;background:transparent}
.wys-pop{position:fixed;z-index:60;width:min(540px,92vw);box-sizing:border-box;border:1px solid hsl(var(--border));border-radius:10px;background:hsl(var(--popover));box-shadow:0 14px 38px rgba(0,0,0,.34);padding:8px}
.wys-pop-pv{min-height:36px;display:flex;align-items:center;justify-content:center;padding:5px 8px;border-radius:6px;background:hsl(var(--muted)/.38);overflow:auto}
.wys-pop-pv>:first-child{margin-top:0}
.wys-pop-pv>:last-child{margin-bottom:0}
.wys-pop-ta{width:100%;box-sizing:border-box;margin-top:7px;border:1px solid hsl(var(--border));border-radius:6px;background:hsl(var(--background));color:hsl(var(--foreground));font-family:Consolas,'Courier New',monospace;font-size:12.5px;line-height:1.6;padding:6px 8px;outline:none;resize:vertical}
.wys-pop-ta:focus{border-color:hsl(var(--primary)/.6)}
.wys-pop-h{font-size:11px;color:hsl(var(--muted-foreground));padding:0 2px 5px;display:flex;align-items:center;gap:6px}
.wys-pop-h b{color:hsl(var(--foreground));font-weight:600}
.wys-pop-keys{margin-left:auto;font-family:Consolas,monospace;opacity:.75;white-space:nowrap}
/* 没有视觉结果的块 —— 注释 / 单条命令 / 文档结尾：不再各占一张卡片，直接排成小灰字。 */
.wys-note .wys-edit{color:#71717a;font-family:Consolas,'Courier New',monospace;font-size:12.5px;line-height:1.7}
.wys-cmd .wys-edit{color:hsl(var(--muted-foreground));font-family:Consolas,'Courier New',monospace;font-size:12px;line-height:1.7}
/* ---------- v0.8.22：结构 / 代码块 与 内容块「分道」 ----------
 * 用户原话：「预览还是有 \maketitle 和 \end{document} 这些代码」「无法区分代码和内容块」。
 * 只有一条规则：本身不是正文、却会原样写回源码的东西（注释 / 命令 / 文档结尾）走「代码道」——
 * 左侧一条竖线 + 一个类型标签；正文（标题 / 段落）干干净净不带这些。
 * 于是不用读文字，扫一眼就知道哪边是内容。
 * 整块是 contenteditable=false 的孤岛：点它开就地编辑器，不给光标落脚 ——
 * 以前光标能停进 \maketitle 那一行，敲的字会被写回命令行（用户原话「加内容块弄到了代码里面」）。 */
.wys-blk.wys-struct{padding:1px 0 1px 10px;border-left:2px solid hsl(var(--border));cursor:text}
.wys-blk.wys-struct:hover{border-left-color:hsl(var(--primary)/.5)}
.wys-blk.wys-struct.picked{border-left-color:hsl(var(--primary)/.75);background:hsl(var(--primary)/.05)}
.wys-krow{display:flex;align-items:baseline;gap:8px;min-width:0}
.wys-tag{flex:0 0 auto;font-size:10.5px;line-height:1.55;padding:0 5px;border-radius:4px;background:hsl(var(--muted)/.75);color:hsl(var(--muted-foreground));font-family:Consolas,'Courier New',monospace;user-select:none}
.wys-say{color:hsl(var(--muted-foreground));font-size:12px;line-height:1.7;white-space:pre-wrap;overflow-wrap:break-word}
/* 源码不常驻显示（点一下开就地编辑器看）。CSS 的 display 会盖掉 hidden 属性，这里显式钉住。 */
.wys-blk.wys-struct .wys-edit[hidden]{display:none}
/* 注释排成源码的字体（它本来就是写给作者看的注记） */
.wys-blk.wys-note .wys-say{font-family:Consolas,'Courier New',monospace;color:#71717a}
/* \maketitle：成品里它排的就是页首那一块 —— 这里说明白它在哪儿，不重复画一遍 */
.wys-blk.wys-mk .wys-say{color:hsl(var(--foreground)/.74)}
/* 文档结尾：一条虚线 + 一句「正文到此结束」。成品里它什么都不排版，编辑器里必须看得见边界。 */
.wys-blk.wys-end{margin-top:16px;border-top:1px dashed hsl(var(--border));border-left-style:dashed;padding-top:9px}
/* 导言区：默认收起成一行，要改再展开 */
.wys-fold{margin:4px 0}
.wys-fold>summary{cursor:pointer;list-style:none;font-family:Consolas,monospace;font-size:11.5px;color:hsl(var(--muted-foreground));padding:1px 2px;border-radius:5px}
.wys-fold>summary::-webkit-details-marker{display:none}
.wys-fold>summary::before{content:"▸ ";opacity:.7}
.wys-fold[open]>summary::before{content:"▾ "}
.wys-fold>summary:hover{background:hsl(var(--muted)/.5);color:hsl(var(--foreground))}
.wys-fold .wys-edit{display:block;margin:4px 0 6px;padding:6px 10px;border-left:2px solid hsl(var(--border));font-family:Consolas,'Courier New',monospace;font-size:12.5px;line-height:1.75;white-space:pre-wrap;color:hsl(var(--foreground)/.78)}
.wys-flash{animation:wysflash 1.1s ease-out}
@keyframes wysflash{from{background:hsl(var(--primary)/.22)}to{background:transparent}}
.wys-err{color:#ef4444;padding:10px;font-size:13px}
`;

/* 属性值转义：data-tex / data-prefix 里可能有引号与换行，必须走 escAttr 而不是 escHtml */
function escAttr(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* 行内片段 → HTML。
 *   text    → 纯文本（可编辑）
 *   math    → contenteditable=false + data-tex（KaTeX 渲染外观，TeX 原文随行携带）
 *   cmd     → \cite / \ref / \label / \footnote …（原子，显示参数内容）
 *   wrap    → \textbf{...} 外层原子（data-open 记下开符号，回写补 "}"），内层可编辑
 *   comment → 行内 % 注释（原子、置灰）
 * 互逆约束：wysDomToTex(wysInline(x)) === x */
function wysInline(text, renderMath) {
  let segs;
  try { segs = WYS.parseInline(text); } catch (e) { return WYS.escHtml(text); }
  let out = "";
  for (let i = 0; i < segs.length; i++) {
    const g = segs[i];
    if (!g) continue;
    if (g.t === "text") { out += WYS.escHtml(g.v); continue; }
    if (g.t === "comment") {
      out += '<span class="wys-atom wys-cmt" contenteditable="false" data-tex="' + escAttr(g.v) + '">' + WYS.escHtml(g.v) + "</span>";
      continue;
    }
    if (g.t === "math") {
      const bare = String(g.tex || "").replace(/^\$+|\$+$/g, "").replace(/^\\\(|\\\)$/g, "");
      let mh;
      try { mh = renderMath ? renderMath(bare, false) : WYS.escHtml(bare); }
      catch (e2) { mh = WYS.escHtml(bare); }
      out += '<span class="wys-atom wys-math" contenteditable="false" data-tex="' + escAttr(g.tex) + '" title="' + escAttr(g.tex) + '">' + mh + "</span>";
      continue;
    }
    if (g.t === "cmd") {
      const arg = /^\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?\{([^}]*)\}/.exec(String(g.tex || ""));
      const shown = arg ? arg[1] : String(g.tex || "");
      const kind = /^\\cite/i.test(String(g.tex || "")) ? "wys-cite" : "wys-ref";
      out += '<span class="wys-atom ' + kind + '" contenteditable="false" data-tex="' + escAttr(g.tex) + '" title="' + escAttr(g.tex) + '">' + WYS.escHtml(shown) + "</span>";
      continue;
    }
    if (g.t === "wrap") {
      out += '<span class="wys-wrap" data-open="' + escAttr(g.open) + '">' + wysInline(g.inner, renderMath) + "</span>";
      continue;
    }
    out += WYS.escHtml(String(g.v == null ? "" : g.v));
  }
  return out;
}

/* 反方向：DOM → LaTeX。原子带 data-tex 原样吐回；其余按 nodeValue 取回。 */
function wysDomToTex(root) {
  let out = "";
  function walk(node) {
    for (let n = node.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) { out += n.nodeValue; continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toLowerCase();
      if (tag === "br") { out += "\n"; continue; }
      const dt = n.getAttribute("data-tex");
      if (dt != null) { out += dt; continue; }
      /* v0.8.12：contenteditable=false 且**没有** data-tex 的节点是渲染装饰 ——
       * 标题前面那个自动编号 .wys-num 就是它。它不是源码的一部分，读回时必须跳过，
       * 否则改一次标题就会把「2」写进 \section{}。
       * 判据是「不是可编辑内容、也没有源码可吐」；带 data-tex 的原子走上面那条分支，不受影响。 */
      if (n.getAttribute("contenteditable") === "false") continue;
      const op = n.getAttribute("data-open");
      if (op != null) { out += op; walk(n); out += "}"; continue; }
      walk(n);
    }
  }
  walk(root);
  /* contentEditable 会塞不换行空格与零宽字符，必须归一再比对 */
  return out.replace(/\u00a0/g, " ").replace(/\u200b/g, "").replace(/\r\n?/g, "\n");
}

/* =====================================================================
 * v0.8.26：块级读回的收尾归一 —— 把段末那一串换行吃掉
 *
 * 用户原话：「换行这些特别不丝滑，不适合续写」。
 *
 * 段末的 <br> 是**光标落脚点**：按回车之后光标得停在新起的那一行上，不然用户看到的
 * 就是「按了回车光标还在原地」。但它**不是源码内容** —— 空行在块模型里根本不归属
 * 任何块（parseDoc 把空行排除在块外），段落块的原文按定义就不该以 \n 结尾。
 *
 * 不吃会怎样（这就是「不丝滑」的手感从哪里来的）：
 *   applyEdits 是「按 \n 切行」的 —— newText = "正文…\n" 切出来是 ["正文…", ""]
 *   两个元素，拿去替换原来那一行 ⇒ 源码里**凭空长出一个空行**。
 *   LaTeX 里空行 = 断段，于是：
 *     · 段末按一次回车 → 那一段后面多一个空行，重建后就是**两块**（段落被劈开）；
 *     · 连写十几行 → 源码里十几处空行，左栏（v0.8.25 起边打边同步）眼看着变花；
 *     · 「¶ 新段落」那两个 <br> 一次写出**两个**空行（文档说好的只有一个）。
 *
 * 为什么只吃一个（不是全吃干净）：第一个是落脚点，第二个起才是真内容 ——
 *   回车一下 = 0 字节改动（源码逐字节不动，撤销栈里也不留痕）；
 *   回车两下 = **恰好一个**空行 = 一个新段落（这也是「¶ 新段落」按下去该落的数）。
 * 与既有不变式的关系：wysDomToTex 本身一个字都没改（行内往返
 * wysDomToTex(wysInline(x)) === x 照旧），归一只发生在**块级读回**这一层。
 * ===================================================================== */
/* =====================================================================
 * v0.8.29：空落脚行的零宽占位 —— 「点块末尾看不到光标」的根因
 *
 * 症状（用户原话）：「鼠标点击到块末尾的时候没有看到光标呢」。
 *
 * 根因不是谁忘了设光标，而是**那个位置在浏览器里没有几何**。回车（Enter = 新段落）与
 * Shift+Enter（段内换行）都是在光标处插 <br>，再把光标 setStartAfter 到 <br> 后面。
 * 段末那串 <br> 是「落脚点」，可 <br> 之后**一个节点都没有**时，Chromium 算不出这一行的
 * 几何 —— 真 Chromium 探针实测（.setup/_probe-br-cdp.js，场景 C2/C4/C6）：
 *     Range.getBoundingClientRect() → {x:0, y:0, w:0, h:0}
 * 屏幕上一个光标都画不出来。中间那条空行同理：两个相邻 <br> 之间也是空的，点它一样没光标。
 *
 * 修法：每一条空落脚行都放一个零宽字符（U+200B）。
 *   · 零宽 —— 视觉上不存在，行高 / 缩进 / 对齐一个像素都不动；
 *   · wysDomToTex 本来就把 \u200b 归一化掉（见上面那行 return）—— **源码一个字节不多**：
 *     读回来「正文 + 空行」还是 "正文\n"，「正文 + 空行 + 新写的字」还是 "正文\n\n新写的字"。
 *
 * 只处理**尾随**的那一串 <br> / 占位：碰到任何真实内容就停 —— 正文中间的 <br> 一个不动。
 * 幂等：已经有占位的行不再补（连按回车不会越堆越多）。
 * 返回最靠后那个占位节点（调用方把光标停在它**里面**，那一条落脚行就有几何了）。
 * ===================================================================== */
const WYS_ZWSP = "\u200b";
function wysEnsureLandingLine(el) {
  if (!el || !el.ownerDocument) return null;
  const doc = el.ownerDocument;
  const isBr = function (n) {
    return !!(n && n.nodeType === 1 && n.tagName && n.tagName.toLowerCase() === "br");
  };
  const isZw = function (n) {
    return !!(n && n.nodeType === 3 && String(n.nodeValue) === WYS_ZWSP);
  };
  let lastZw = null;
  for (let n = el.lastChild; n; n = n.previousSibling) {
    if (isZw(n)) { if (!lastZw) lastZw = n; continue; }   // 这一行已经有占位：好的
    if (isBr(n)) {
      const next = n.nextSibling;
      /* <br> 后面什么都没有（块末那条空行）或紧跟着另一个 <br>（中间那条空行）→ 补占位 */
      if (!next || isBr(next)) {
        const zw = doc.createTextNode(WYS_ZWSP);
        el.insertBefore(zw, next);
        if (!lastZw) lastZw = zw;
      }
      continue;
    }
    break;                                                 // 碰到真实内容：尾随串到此为止
  }
  return lastZw;
}

function wysBlockTex(root) {
  return wysDomToTex(root).replace(/\n$/, "");
}

/* =====================================================================
 * v0.8.27：块的行区间会「长大」—— 段落一拆，行数就变
 *
 * data-s / data-e 是**渲染那一刻**写上的（parseDoc 给的 startLine / endLine）。
 * 在这之前它们一直够用，因为那段设计刻意维持着一条前提：**编辑期间行数不变** ——
 * 回车只把光标送到新的一行（源码逐字节不动），打字只改某一行的内容。
 * 收尾回写（commitWys）/ 边打边回写（wysSyncLive）/ 渲染后的原文台账三处，
 * 全是按这条前提在 data-s..data-e 上 replace 的。
 *
 * 回车改成「新建段落」之后，这条前提就没了：**一个段落一拆，它下面所有块的行号
 * 都得往后挪**。不挪的后果很具体（下面的写法要防的就是它）—— 下一笔回写仍按旧区间
 * replace，而 newText 比旧区间多一行，多出来那一行盖不住旧内容：
 *
 *   base（旧区间 [4..4]）:  4: 第一段正      5: 文在这里
 *   新文本（三行）:        4: 第一段正      5: (空)      6: 文在这里续
 *   结果:                  4: 第一段正      5: (空)      6: 文在这里续
 *                          7: (空)          8: 文在这里              ← 上一笔留下的垃圾
 *
 * 所以每一笔**成功回写**之后，按这笔编辑的实际效果把所有块的行区间平移一次。
 * 下面是那颗纯函数（可单测）：给一个块自己的 [s,e] 与这批编辑，算它的新区间。
 *   · 编辑就是这个块自己（区间完全相等）→ 起点不变，终点 = 起点 + 新文本行数 - 1
 *   · 编辑整段落在块上面（endLine < s）→ 整体平移 delta
 *   · 编辑整段落在块下面（startLine > e）→ 与它无关
 *   · 区间交错（编辑从块中间切过去）→ 一格都不挪 —— 宁可少挪，也绝不乱挪
 * 返回 null = 这一个块不用动。
 * 行数与 applyEdits 同一把尺子（按 "\n" 切），不另立一套算法。
 * ===================================================================== */
function wysShiftSpan(s, e, edits) {
  if (!(s >= 0) || !(e >= s) || !edits || !edits.length) return null;
  let delta = 0, own = null;
  for (let i = 0; i < edits.length; i++) {
    const ed = edits[i] || {};
    const es = ed.startLine | 0;
    const ee = (ed.endLine == null ? es : ed.endLine) | 0;
    const k = String(ed.newText == null ? "" : ed.newText).split("\n").length;
    if (es === s && ee === e) { own = k; continue; }          // 就是这一块：终点按新文本重算
    if (ee < s) { delta += k - (ee - es + 1); continue; }     // 整段在它上面：整体平移
    if (es > e) continue;                                     // 整段在它下面：与它无关
    return null;                                              // 交错：不猜，一格都不挪
  }
  if (own != null) return [s, s + own - 1];
  if (!delta) return null;
  return [s + delta, e + delta];
}

/* 导言区里「一行一项」的可点元素（标题 / 作者 / 日期 / 文档类 / 宏包）。
 * 渲染出来的是**成品的样子**；点一下开就地编辑器改这一行 —— 与正文块「点哪改哪」同一套动作。
 * 之所以不开放 contenteditable：这些内容照样是有损渲染（\LaTeX / \thanks 之类），
 * 让用户直接敲就会把命令烧掉。改的始终是那一行的「正文」，前缀（\title{ / \usepackage{）
 * 与后缀（}）原样带回；提交时还有一条自检，要求「前缀 + 原正文 + 后缀」逐字节等于原行。 */
function wysFmLine(it, what, key, cls, inner) {
  return '<span class="wys-fmline' + (cls ? " " + cls : "") + '" contenteditable="false"' +
    ' data-fk="' + escAttr(key) + '"' +
    ' data-s="' + it.s + '" data-e="' + it.e + '"' +
    ' data-tex="' + escAttr(it.body) + '"' +
    ' data-prefix="' + escAttr(it.prefix) + '"' +
    ' data-suffix="' + escAttr(it.suffix) + '"' +
    ' data-what="' + escAttr(what) + '"' +
    ' title="' + escAttr(it.prefix + it.body + it.suffix) + '">' + inner + "</span>";
}

/* 整篇 → 就地编辑层 HTML。只渲染块模型给出的边界，绝不重新发明结构。 */
/* 原子块的「富预览」：把块原文交给只读预览那一套内核，拿回渲染结果而不是源码。
 * 用户原话：就地编辑是「在预览的情况下直接编辑」，不是「由源代码展示出来」。
 * 片段渲染出来的 data-line 是**片段内相对行号**，整体平移到块起始行，行号语义保持一致。
 * 兜底：块太大（>2 万字符）或富渲染抛错 → 退回源码 <pre>，绝不因此炸掉整篇。 */
/* =====================================================================
 * v0.8.20：块外的字 —— 「刚输入就撤销说没有内容可以撤销」的第二个成因
 *
 * 预览层整篇只有一个编辑宿主（.wys-editroot）。宿主的**空白处**（块与块之间的空隙、
 * 正文之后的留白、页首那些只读渲染）照样落得了光标；在那儿敲的字，DOM 里看得见，
 * 但 commitWys 是「按 .wys-blk 读」的 —— 块模型里一个字都不记：
 *   · 撤销链里没有它 → Ctrl+Z 只会说「预览层还没有记下任何改动」（字明明是刚敲的）
 *   · 下一拍 innerHTML 重建（切档 / 宿主回传 / 任何结构性动作）就把它静默吃掉
 * 所以这里补三件：认得出、收得住、落点算得准。
 *   wysOrphanNodes(root)   —— 哪些字不在任何会被写回源码的地方
 *   wysFoldOrphans(root)   —— 并进最近的正文块（宁可位置差一点，绝不静默丢字）
 *   wysPickNearestBlock()  —— 点空白处时光标该落到哪一块（纯函数，可单测）
 * =================================================================== */

/* 整块读回源码的块类型：块里的字（不管在不在 .wys-edit 里）都会被写回。
 * 逐字对齐 commitWys 的读法（它读 anchor = 整块，导言区例外 —— 只认 .wys-edit）。 */
const WYS_WHOLE_BLOCK = { paragraph: 1, heading: 1, comment: 1, command: 1, tail: 1 };
/* 能当「块外字的收容所」的类型：**只有正文段落**。
 *   · 命令块 / 尾块（\maketitle / \end{document}）绝不能收 —— 并进 \end{document} 后面
 *     等于让这些字从排版结果里消失；
 *   · 标题也不能收 —— 并进 \section{…} 的标题里，等于把一段话塞进标题（语义全错）。
 * 没有段落可归时宁可一个字节都不动，由提示条明说 —— 绝不静默丢字，也绝不乱塞。 */
const WYS_FOLD_BLOCK = { paragraph: 1 };
/* 点空白处时允许落光标的类型：段落 + 标题。
 * 与折叠的收容集分开：折叠只能进段落（并进 \section{…} 的标题里等于把一段话塞进标题），
 * 但**点**标题旁边的空白，用户多半就是想改那个标题 —— 落进去，敲的字进的是标题主体，能撤。 */
const WYS_CARET_BLOCK = { paragraph: 1, heading: 1 };
/* v0.8.22：回写时**直接取块自己的 data-tex** 的类型 —— 注释 / 命令 / 文档结尾。
 * 这三类在可视化档里是「渲染出来给人看」的结构块（\maketitle 渲染成一句说明、
 * \end{document} 渲染成一条结束线），内部 DOM **全是渲染结果**。
 * 靠遍历 DOM 拼源码等于把渲染结果当源码写回去 —— 所以这里明确：data-tex 是唯一权威。
 * 安全性：这三类块在 parseDoc 里永远是「一行 / 一条命令」，没有行内原子可被就地改过
 * （改动都走 .wys-pop → commitAtom → applyEdits），取 data-tex 不会漏掉任何改动。 */
const WYS_TEX_BLOCK = { comment: 1, command: 1, tail: 1 };

/* 不会被写回源码的地方：只读装饰。
 * 行内原子（\cite → [1]）带 data-tex；富渲染卡片带 contenteditable="false"；
 * .wys-edit 是合法正文本身；.wys-num 是自动编号（标题前面那个「2」，不是源码）。
 * 富渲染的容器（原子卡片 / 就地编辑浮层 / 源码兜底块）一并排除 —— 里面的文字是**渲染结果**
 * （表格里的 40.1、图注、KaTeX 的符号），把它们当「块外字」搬进正文会毁掉渲染。 */
function wysDecoration(el) {
  if (!el || !el.getAttribute) return true;
  if (el.getAttribute("data-tex") != null) return true;
  if (el.getAttribute("contenteditable") === "false") return true;
  /* 类名必须**按 token 精确**比。
   * ⚠ 这里踩过一次：indexOf("wys-edit") 会命中 "wys-editroot" —— 那是整篇唯一的编辑宿主，
   *   结果宿主被当成装饰、整棵子树跳过，块外字一处也认不出来（探针实测：折叠与实话提示全哑）。 */
  const cn = el.className;
  const list = (typeof cn === "string")
    ? (" " + cn.replace(/\s+/g, " ").trim() + " ")
    : null;
  const has = function (k) {
    if (list != null) return list.indexOf(" " + k + " ") >= 0;
    return !!(cn && typeof cn.contains === "function" && cn.contains(k));
  };
  return has("wys-edit") || has("wys-num") || has("wys-atom")
    || has("wys-atomblk") || has("wys-pop") || has("wys-src");
}

/* root 里「不在任何会被写回的地方」的文本节点（纯空白不算）。 */
function wysOrphanNodes(root) {
  const out = [];
  if (!root || typeof root.firstChild === "undefined") return out;
  (function walk(node, inWhole) {
    for (let n = node.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) {
        if (!inWhole && String(n.nodeValue == null ? "" : n.nodeValue).trim()) out.push(n);
        continue;
      }
      if (n.nodeType !== 1) continue;
      if (!inWhole && wysDecoration(n)) continue;
      let whole = inWhole;
      const ty = n.getAttribute ? n.getAttribute("data-type") : null;
      if (ty && WYS_WHOLE_BLOCK[ty]) whole = true;
      walk(n, whole);
    }
  })(root, false);
  return out;
}

/* 块外的字并进最近的正文块。返回搬了几处（0 = 没得搬，什么都不动）。
 * 顺序：整棵树按文档序走，记住「上一个正文块」；它后面出现的块外字就归它；
 * 一个正文块都还没出现（字打在整篇最前面）就归第一个正文块。
 * 原子卡片的渲染结果、.wys-edit、行内原子都不参与 —— 见 wysDecoration。 */
function wysFoldOrphans(root) {
  if (!root || typeof root.firstChild === "undefined") return 0;
  const entries = [];
  const blocks = [];
  let cur = null;
  (function walk(node) {
    for (let n = node.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) {
        if (String(n.nodeValue == null ? "" : n.nodeValue).trim()) entries.push({ node: n, t: cur });
        continue;
      }
      if (n.nodeType !== 1) continue;
      if (wysDecoration(n)) continue;
      const ty = n.getAttribute ? n.getAttribute("data-type") : null;
      if (ty && n.querySelector) {
        const e = n.querySelector(".wys-edit");
        if (WYS_WHOLE_BLOCK[ty]) {
          /* 整块读回的类型：里面的字本来就会进源码 —— 不搬，也不再往下走（免得把里面当块外字） */
          if (e && WYS_FOLD_BLOCK[ty]) { cur = e; blocks.push(e); }
          continue;
        }
        if (ty !== "preamble") continue;   // 原子块（公式 / 图 / 表 / 参考文献 / 环境）：只读渲染
      }
      walk(n);
    }
  })(root);
  if (!entries.length) return 0;
  const fb = blocks.length ? blocks[0] : null;
  let moved = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const t = e.t || fb;
    if (!t || typeof t.appendChild !== "function") continue;
    if (!String(e.node.nodeValue == null ? "" : e.node.nodeValue).trim()) continue;
    try {
      t.appendChild(e.node);             // 连节点一起搬：文本原样，不重拼
      moved += 1;
    } catch (err) { }
  }
  return moved;
}

/* 点空白处时，光标该落进哪一块。cands = [{ el, top, bottom, mid }]，y = 点击的纵坐标。
 * 取「竖直距离最近」的那一块（块内距离算 0）：点在它上半 → 落块首，下半 → 落块尾。
 * 纯函数：不碰 DOM，好单测。找不到就 null（调用方据此什么都不做）。 */
function wysPickNearestBlock(cands, y) {
  if (!cands || !cands.length) return null;
  const yy = (typeof y === "number" && isFinite(y)) ? y : null;
  let best = null, bestD = Infinity;
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    if (!c || !c.el) continue;
    const cy = yy == null ? c.mid : yy;
    const d = cy < c.top ? c.top - cy : (cy > c.bottom ? cy - c.bottom : 0);
    if (d < bestD) { bestD = d; best = c; }
  }
  if (!best) return null;
  const cy = yy == null ? best.mid : yy;
  return { el: best.el, atEnd: cy >= best.mid };
}

function richBlockHtml(raw, renderMath, baseDir, startLine) {
  const src = String(raw == null ? "" : raw);
  if (!src) return "";
  const fallback = '<pre class="wys-src">' + WYS.escHtml(src) + "</pre>";
  if (src.length > 20000) return fallback;
  /* LPC 在内联进编辑器时才存在；单测里没注入就走兜底（不抛） */
  if (typeof LPC === "undefined" || !LPC || typeof LPC.renderPreview !== "function") return fallback;
  let html = "";
  try { html = LPC.renderPreview(src, { renderMath: renderMath, baseDir: baseDir || "", docHeader: false }).html; }
  catch (e) { html = ""; }
  if (!html) return fallback;
  let min = Infinity;
  const re = /data-line="(\d+)"/g;
  let m;
  while ((m = re.exec(html))) { const v = parseInt(m[1], 10); if (v < min) min = v; }
  if (min !== Infinity && min !== startLine) {
    /* 卡片自己的 data-line 是 1 基（startLine + 1），内层也要对齐成 1 基绝对行号 */
    const shift = (startLine + 1) - min;
    html = html.replace(/data-line="(\d+)"/g, function (s2, n) { return 'data-line="' + (parseInt(n, 10) + shift) + '"'; });
  }
  return html;
}

/* v0.8.22：命令块在成品里的意思 —— 给用户看的一句人话。
 * 没收录的命令退回显示命令本身（见 wysRenderDoc）：不猜语义、不假装认识它。 */
const WYS_CMD_SAY = {
  maketitle: "把页首的标题 / 作者 / 日期排进正文（页首已在上方按成品渲染）",
  tableofcontents: "在此自动生成目录",
  listoffigures: "在此自动生成图目录",
  listoftables: "在此自动生成表目录",
  newpage: "在此分页",
  clearpage: "在此分页（清空当前页）",
  cleardoublepage: "在此分页（奇偶对齐）",
  appendix: "以下为附录",
  frontmatter: "以下为前置部分（页码转罗马数字）",
  mainmatter: "以下为正文部分",
  backmatter: "以下为后置部分",
  bibliography: "在此生成参考文献表",
  printbibliography: "在此生成参考文献表",
  addbibresource: "登记参考文献库文件",
  setcounter: "设置计数器",
  vspace: "在此留出竖直空白",
  hspace: "在此留出水平空白",
  noindent: "这一段不缩进",
  centering: "以下内容居中",
  includegraphics: "在此插入图片",
  input: "在此引入另一个文件",
  include: "在此引入另一个文件",
};

/* ---------- v0.9.1 多文件预览（\input / \include） ----------
 * 路径解析与 TeX 一致：相对主文件目录；无扩展名补 .tex；统一成正斜杠。 */
function resolveIncPath(name, dir) {
  const n = String(name || "").trim().replace(/^["']|["']$/g, "");
  if (!n) return "";
  let p = n;
  const isAbs = /^[a-zA-Z]:[\\/]/.test(n) || n.slice(0, 2) === "\\\\" || n.charAt(0) === "/";
  if (!isAbs && dir) p = String(dir).replace(/[\\/]+$/, "") + "/" + n;
  if (!/\.[a-zA-Z0-9]+$/.test(p)) p += ".tex";
  return p.replace(/\\/g, "/");
}
/* v0.9.2：子文件卡片的折叠状态（会话级，key = 子文件绝对路径）。
 * 放模块级而非 ref：可视化 / 源码 / 分屏来回切、面板重挂，折叠意图都不该丢；
 * wys.html 每次重算都会来读它，折叠因此能「焊」在重建后的 DOM 上。 */
const INC_FOLDED = new Set();
function incFoldHas(abs) { return INC_FOLDED.has(abs); }
function incFoldToggle(abs) {
  if (INC_FOLDED.has(abs)) INC_FOLDED.delete(abs);
  else INC_FOLDED.add(abs);
  return INC_FOLDED.has(abs);
}

/* wys 层的文件卡片。内容塞进 command 块（整块 contenteditable=false）里展示，
 * 回写链路零改动：commit 只读隐藏 .wys-edit 的 data-tex（原始 \input 行），卡片纯展示。
 * 未命中缓存 → 占位卡带 data-inc-pending，loadInputsIn 异步取（latex_asset .tex 文本通道）。 */
function wysIncCard(raw, renderMath, baseDir, inc) {
  const mm = /\\(?:input|include)\s*\{([^}]*)\}/.exec(String(raw || ""));
  const name = mm ? mm[1].trim() : "";
  if (!name || !inc || !inc.resolvePath) return "";
  const abs = inc.resolvePath(name);
  if (!abs) return "";
  const label = name + (/\.[a-zA-Z0-9]+$/.test(name) ? "" : ".tex");
  const hit = inc.cache ? inc.cache.get(abs) : null;
  if (!hit || typeof hit.content !== "string")
    return '<div class="wys-inc wys-inc-wait" contenteditable="false" data-inc-pending="' + escAttr(abs) + '">📄 ' + WYS.escHtml(label) + '<span class="wys-inc-say">　子文件加载中…</span></div>';
  let inner = "";
  if (typeof LPC === "undefined" || !LPC || typeof LPC.renderPreview !== "function")
    inner = '<div class="pv-imgna">预览内核不可用</div>';
  else {
    try { inner = LPC.renderPreview(hit.content, { renderMath: renderMath, baseDir: baseDir, docHeader: false, inputResolver: inc.resolve }).html; }
    catch (e) { inner = '<div class="pv-imgna">子文件渲染失败：' + WYS.escHtml(String((e && e.message) || e)) + "</div>"; }
  }
  const lines = hit.content.split("\n").length;
  /* v0.9.2：折叠状态在**构建时**就烘进 HTML（class / 箭头 / 右侧文案都按 Set 来），
   * 点击时再就地改 DOM + 同步 Set —— 两条路写同一份状态，重建前后不会闪。 */
  const folded = incFoldHas(abs);
  return '<div class="wys-inc' + (folded ? " wys-inc-fold" : "") + '" contenteditable="false" data-inc="' + escAttr(abs) + '" data-lines="' + lines + '">' +
    '<div class="wys-inc-h" title="点击收起 / 展开这个子文件（点正文部分仍打开命令编辑）"><span><span class="wys-inc-f">' + (folded ? "▸" : "▾") + "</span> 📄 " + WYS.escHtml(label) + '</span><span class="wys-inc-say">' + lines + " 行 · " + (folded ? "已收起" : "已合并预览") + "</span></div>" +
    '<div class="wys-inc-b">' + inner + "</div></div>";
}

function wysRenderDoc(src, renderMath, baseDir, inc) {
  let doc;
  try { doc = WYS.parseDoc(src); }
  catch (e) { return '<div class="wys-err">块模型解析失败：' + WYS.escHtml(String((e && e.message) || e)) + "</div>"; }
  const out = [];
  const blocks = doc.blocks || [];
  /* 标题编号与只读预览同构：既然是在结果上编辑，标题就得长 `2 引言` 的样子，
   * 而不是 `\section{引言}` —— 后者一眼就让人知道「我还在看源码」。 */
  const nums = WYS.headingNumbers ? WYS.headingNumbers(blocks) : new Map();
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const base = ' data-bid="' + b.id + '" data-s="' + b.startLine + '" data-e="' + b.endLine + '" data-type="' + escAttr(b.type) + '"';
    if (b.editable && (b.type === "heading" || b.type === "paragraph")) {
      if (b.type === "heading") {
        /* 层级必须与只读预览内核**逐级同构**，否则同一份 .tex 在两种模式下标题差一号。
         * preview-core.js: lv = Math.min(HEAD_LV[name] + 1, 4)
         *   HEAD_LV = { chapter:0, section:1, subsection:2, subsubsection:3, paragraph:4 }
         *   → chapter=1 / section=2 / subsection=3 / subsubsection=4
         * wysiwyg 的 b.level 用的是同一张表，所以这里同样 +1、同样 clamp 到 4，
         * 第 4 档退化成粗体段落（.wys-par ↔ .pv-par），不升字号。 */
        const lv = Math.min((b.level || 0) + 1, 4);
        const hCls = lv <= 3 ? " wys-h" + lv : " wys-par";
        /* data-prefix / data-suffix 仍原样带着（回写靠它保住 \section* / [短标题] / \label），
         * 但**不再显示出来** —— 显示的是自动编号 + 标题文字，就是成品的那个样子。 */
        const hnum = nums.get(b.id) || "";
        out.push(
          '<div class="wys-blk' + hCls + '"' + base +
            ' data-prefix="' + escAttr(b.prefix) + '" data-suffix="' + escAttr(b.suffix) + '">' +
            (hnum ? '<span class="wys-num" contenteditable="false">' + WYS.escHtml(hnum) + "</span>" : "") +
            '<span class="wys-edit">' + wysInline(b.title, renderMath) + "</span>" +
          "</div>"
        );
      } else {
        out.push(
          '<div class="wys-blk wys-p"' + base + ">" +
            '<span class="wys-edit">' + wysInline(b.raw, renderMath) + "</span>" +
          "</div>"
        );
      }
      continue;
    }
    /* ---------- v0.8.22：结构块（注释 / 命令 / 文档结尾）走「代码道」 ----------
     * 用户报的三件事都落在这一支上：
     *   ①「预览还是有 \maketitle 和 \end{document} 这些代码呢」——
     *      以前这里直接显示源码行。但这两个在成品里不是文字，是**结构**：
     *      \maketitle 把页首的标题 / 作者排进正文（页首已经在上面的导言区块里按成品
     *      渲染过了，这里再画一遍标题就是重复），\end{document} 表示正文到此结束。
     *      现在一律渲染成「类型标签 + 一句人话」，源码不再常驻显示 ——
     *      点一下开就地编辑器，上半部分照旧看得见源码、改得到源码。
     *   ②「无法区分代码和内容块」——
     *      结构块带类型标签（注释 / 命令 / 结束）+ 左侧一条竖线；正文（标题 / 段落）
     *      不带这些。不用读文字，扫一眼就知道哪边是内容。
     *   ③「我想要加内容块，貌似弄到了代码里面」——
     *      整块 contenteditable=false 的孤岛。以前这三类是「可编辑的一行小灰字」，
     *      光标能停进 \maketitle 里，在那儿敲的字会被整块读回、写进命令行 ——
     *      那是全文**唯一**一处能把正文写进命令的入口。现在点它开就地编辑器
     *      （与公式块同一套 .wys-pop），光标再也落不进去。
     * 回写：块自己的 data-tex 是唯一权威（内部全是渲染结果，绝不参与拼源码）—— 见 WYS_TEX_BLOCK。 */
    if (b.type === "comment" || b.type === "command" || b.type === "tail") {
      const raw = String(b.raw == null ? "" : b.raw);
      const cls = b.type === "comment" ? "wys-note" : "wys-cmd";
      let tag = "命令";
      let say = "";
      let extra = "";
      if (b.type === "comment") {
        tag = "注释";
        /* 显示注释的正文：% 是记法，标签已经说明它是注释，不必再顶一个 % 让人出戏 */
        say = raw.replace(/^[ \t]*%+[ \t]?/gm, "");
      } else if (b.type === "tail") {
        tag = "结束";
        say = "正文到此结束 —— 这一行以下的内容不参与排版";
        extra = " wys-end";
      } else {
        say = WYS_CMD_SAY[b.kind] || ("LaTeX 命令 \\" + String(b.kind || ""));
        if (b.kind === "maketitle") extra = " wys-mk";
      }
      /* v0.9.1：\input/\include 命令块 → 挂子文件内容卡片（缓存未命中先出占位，异步补） */
      let incHtml = "";
      if ((b.kind === "input" || b.kind === "include") && inc) incHtml = wysIncCard(raw, renderMath, baseDir, inc);
      out.push(
        /* contenteditable=false：整块是只读孤岛 —— 点它走 openAtom（见 onPreviewMouseDown），
         * 光标永远落不进这里的源码行。里面那个 .wys-edit 是**唯一**携带 data-tex 的节点，
         * 其余（.wys-tag / .wys-say）都是 contenteditable=false 且无 data-tex 的装饰。 */
        '<div class="wys-blk wys-struct ' + cls + extra + '"' + base +
          ' contenteditable="false" data-key="blk:' + b.id + '" data-tex="' + escAttr(raw) + '">' +
          '<span class="wys-krow">' +
            '<span class="wys-tag" contenteditable="false">' + tag + "</span>" +
            '<span class="wys-say" contenteditable="false">' + WYS.escHtml(say) + "</span>" +
          "</span>" + incHtml +
          '<span class="wys-edit" contenteditable="false" data-tex="' + escAttr(raw) + '" hidden>' + WYS.escHtml(raw) + "</span>" +
        "</div>"
      );
      continue;
    }
    /* ---------- 导言区：渲染成成品的页首，不是一坨源码 ----------
     * 用户报的问题：「导言区没有正常渲染呢」。
     * 根因：这里以前只把 L1–8 原文塞进一个折叠的 <details>，而只读预览把同一份 .tex
     * 渲染成了页首（\title → 大字标题、\author → 作者行）。于是「就地编辑」这一层
     * 没有页首，标题躺在源码里 —— 这正是「没渲染」，也正是两种形态对不上的地方。
     * 现在：标题 / 作者 / 日期渲染成页首，\documentclass / \usepackage 渲染成小标签，
     * 每一项都点得开、在**原地**改它那一行；整体源码留一个折叠兜底入口。 */
    if (b.type === "preamble") {
      const raw0 = String(b.raw == null ? "" : b.raw);
      const fm = WYS.parsePreamble ? WYS.parsePreamble(raw0, b.startLine) : null;
      let inner = "";
      if (fm) {
        if (fm.title || fm.author || fm.date) {
          /* v0.8.20：页首是**渲染结果**（标题 / 作者 / 日期），点某项才开就地编辑器。
           * 这个容器本身不是编辑区：光标停进来敲的字没有归属，块模型看不见。
           * 关掉它的可编辑性 —— 点仍然点得开（点在 .wys-fmline 上照旧进 openAtom）。 */
          inner += '<div class="wys-front-head" contenteditable="false">';
          if (fm.title) inner += '<div class="wys-front-t">' + wysFmLine(fm.title, "标题", "fm:title", "", wysInline(fm.title.body, renderMath)) + "</div>";
          if (fm.author) inner += '<div class="wys-front-a">' + wysFmLine(fm.author, "作者", "fm:author", "", wysInline(fm.author.body, renderMath)) + "</div>";
          if (fm.date) inner += '<div class="wys-front-d">' + wysFmLine(fm.date, "日期", "fm:date", "", wysInline(fm.date.body, renderMath)) + "</div>";
          inner += "</div>";
        }
        const chips = [];
        if (fm.cls) {
          chips.push(wysFmLine(fm.cls, "文档类", "fm:cls", "wys-chip",
            "<b>" + WYS.escHtml(fm.cls.body) + "</b>" + (fm.cls.opt ? " <i>· " + WYS.escHtml(fm.cls.opt) + "</i>" : "")));
        }
        for (let pi = 0; pi < fm.pkgs.length; pi++) {
          chips.push(wysFmLine(fm.pkgs[pi], "宏包", "fm:pkg:" + pi, "wys-chip",
            WYS.escHtml(fm.pkgs[pi].name || fm.pkgs[pi].body)));
        }
        if (chips.length) inner += '<div class="wys-front-meta" contenteditable="false">' + chips.join("") + "</div>";
      }
      /* 兜底入口：上面没认领的行（\begin{document}、少见的导言区命令）仍从这里改得到。
       * 它同时是这一块**唯一**的 .wys-edit —— commitWys 就靠它读回「整体改动」。 */
      inner += '<details class="wys-raw"><summary contenteditable="false">⋯ 导言区源码 · ' + (b.endLine - b.startLine + 1) + " 行</summary>" +
        '<span class="wys-edit">' + WYS.escHtml(raw0) + "</span></details>";
      out.push('<div class="wys-blk wys-front"' + base + ">" + inner + "</div>");
      continue;
    }
    /* ---------- 有视觉结果的原子块：渲染结果直接落版，点一下在原地编辑 ----------
     * 公式 / 浮动体 / 参考文献 / 代码环境 … 一律用预览内核渲染成富结果，**不套任何壳**。
     *
     * 为什么块内部仍然是只读的（不直接 contenteditable）：
     *   \cite{vaswani2017} 渲染成 "[1]"，\ref{fig:model} 渲染成 "图 1" —— 都是有损的。
     *   允许从渲染结果反推 LaTeX，用户敲一次字就会把 \cite / \label 烧成 "[1]"。
     *   所以这里给的不是「可编辑的渲染文本」，而是「点开一个就地编辑器」（见 .wys-pop）：
     *   上面照旧实时渲染给你看，下面改的始终是真正的 LaTeX。这就是「在结果上编辑」
     *   对有损渲染的答案 —— 位置在结果上，改的是源码，且不用离开预览。 */
    const raw = String(b.raw == null ? "" : b.raw);
    out.push(
      /* contenteditable=false：v0.8.12 起外层是一个大编辑宿主，富渲染结果（表格 / 图 /
       * 公式）不显式关掉就会被当成可编辑文本，敲一下就毁掉渲染结构。 */
      '<div class="wys-atomblk" contenteditable="false" data-line="' + (b.startLine + 1) + '"' + base +
        ' data-key="blk:' + b.id + '" data-tex="' + escAttr(raw) + '">' +
        '<div class="wys-atomblk-body">' + richBlockHtml(raw, renderMath, baseDir, b.startLine) + "</div>" +
      "</div>"
    );
  }
  /* ---------- v0.8.12：整篇正文只留**一个**编辑宿主 ----------
   * 以前每一块（每个 .wys-edit）自己挂 contenteditable，彼此互不相通：
   * 光标在块里走到头就出不去（方向键、继续打字都跨不过块边界），想改下一行只能再用鼠标点一次 ——
   * 用户读作「每一行都会失去焦点」。合成一个宿主之后，块之间天然连通：
   * 上下键、Home/End、跨行连续输入全部由浏览器原生处理。
   * 有损渲染的原子（\cite → [1]、\ref → 图 1）仍然是 contenteditable=false 的孤岛，
   * 回写路径一个字没变 —— commitWys 照旧按 .wys-blk 读、按行区间写。
   * spellcheck 关掉：LaTeX 源码不是自然语言，红波浪线只会添乱。 */
  return '<div class="wys-editroot" contenteditable="true" spellcheck="false"' +
    ' autocorrect="off" autocapitalize="off">' + out.join("") + "</div>";
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function hlLine(line) {
  let cut = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\") { i++; continue; }
    if (ch === "%") { cut = i; break; }
  }
  const code = cut >= 0 ? line.slice(0, cut) : line;
  const comment = cut >= 0 ? line.slice(cut) : "";
  let h = esc(code);
  h = h.replace(/(\\[a-zA-Z@]+\*?)/g, '<span style="color:' + CLR.cmd + '">$1</span>');
  h = h.replace(/(\\[^a-zA-Z\\])/g, '<span style="color:' + CLR.esc + '">$1</span>');
  h = h.replace(/(\$[^$]*\$)/g, '<span style="color:' + CLR.math + '">$1</span>');
  h = h.replace(/(\{|\})/g, '<span style="color:' + CLR.brace + '">$1</span>');
  h = h.replace(/(&amp;)/g, '<span style="color:' + CLR.amp + '">$1</span>');
  if (comment) h += '<span style="color:' + CLR.comment + '">' + esc(comment) + "</span>";
  return h || "&nbsp;";
}

function countWords(text) {
  const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const latin = (text.match(/[a-zA-Z]+/g) || []).length;
  return { cjk: cjk, latin: latin, total: cjk + latin };
}

/* 划词引用气泡定位：钳制在视口内 */
function clampPos(x, y) {
  return {
    x: Math.max(8, Math.min(x || 100, (window.innerWidth || 1200) - 190)),
    y: Math.max(8, Math.min((y || 100) + 14, (window.innerHeight || 800) - 56)),
  };
}

/* 预览节点向上找 data-line（块级行号锚点） */
function nodeLine(node) {
  let el = node && node.nodeType === 1 ? node : node && node.parentElement;
  while (el && el.getAttribute) {
    const v = el.getAttribute("data-line");
    if (v) return parseInt(v, 10) || null;
    el = el.parentElement;
  }
  return null;
}

const tbtn = {
  border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--foreground))",
  borderRadius: 6, padding: "2px 8px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", lineHeight: "18px",
};
const tbtnP = { ...tbtn, background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" };
/* 工具栏下拉（「⬇ 导出」）：右对齐，贴着按钮弹出 */
const tmenu = {
  position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 40, minWidth: 230,
  padding: 4, borderRadius: 8, border: "1px solid hsl(var(--border))",
  background: "hsl(var(--popover))", boxShadow: "0 8px 24px rgba(0,0,0,.25)",
};
const titem = {
  display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent",
  color: "hsl(var(--popover-foreground))", fontFamily: "inherit", fontSize: 12,
  padding: "5px 8px", borderRadius: 5, cursor: "pointer", whiteSpace: "nowrap",
};
const tsep = { height: 1, margin: "4px 6px", background: "hsl(var(--border))" };
const tcap = { padding: "4px 8px 2px", fontSize: 10.5, color: "hsl(var(--muted-foreground))" };
/* ---------- 视图（本编辑器内部三档）----------
 *   src     = 源码（textarea + 高亮层）
 *   split   = 分屏（左源码 / 右渲染）
 *   preview = 可视化（在渲染结果上就地编辑 —— 也就是 manifest 里那一档「可视化」）
 *
 * ⚠ v0.8.3：编辑器**不再自带视图按钮**。顶栏那排「📄 源码 / ⧉ 分屏 / 📑 预览」分段控件已删，
 *   档位入口统一由宿主标签栏的模式开关承担（同一件事两处并存只会互相打架）。
 *   宿主读 manifest 的 editors[] 声明，两代契约本编辑器都认：
 *     旧客户端  dualView = ["可视化","源码"]      → props.mode = "wysiwyg" | "source"
 *     新客户端  modes = 可视化 / 源码 / 分屏       → props.mode = "visual" | "source" | "split"
 *   （已在装机版宿主 app.asar 里取证：无 editors[].modes 解析代码，故 dualView 必须同时保留。） */
const MODE2VIEW = {
  source: "src", src: "src", code: "src", text: "src", edit: "src",
  split: "split", dual: "split", both: "split",
  visual: "preview", wysiwyg: "preview", preview: "preview", render: "preview",
};
/* 内部分档 → 回写宿主的模式 id（两代契约各一张表） */
const VIEW2MODE_DUAL = { src: "source", split: "wysiwyg", preview: "wysiwyg" }; // 只有二态：分屏归可视化侧
const VIEW2MODE_N = { src: "source", split: "split", preview: "visual" };       // 三态：分屏是独立档位
/* ---------- v0.8.6 编辑器自身控件的样式（菜单 / 键位提示 / 分组标题） ----------
 * 为什么不并进 PV_CSS / WYS_CSS：那两个描述的是**文档**长什么样，check-v073-style.js
 * 会拿它们和导出产物逐条对账；这里是**编辑器控件**的样式，混进去只会让对账语义变脏。
 * 也没用 transition: all —— 高频交互元素上的全属性过渡是输入卡顿的常见来源。 */
const UI_CSS = `
.lx-mh{padding:5px 8px 3px;font-size:10.5px;color:hsl(var(--muted-foreground));letter-spacing:.06em}
.lx-mi{display:flex;align-items:center;justify-content:space-between;gap:14px;width:100%;text-align:left;border:none;background:transparent;color:hsl(var(--popover-foreground));font-family:inherit;font-size:12px;padding:5px 8px;border-radius:5px;cursor:pointer}
.lx-mi:hover{background:hsl(var(--primary)/.14)}
.lx-kbd{font-family:Consolas,'Courier New',monospace;font-size:10.5px;line-height:16px;color:hsl(var(--muted-foreground));border:1px solid hsl(var(--border));border-radius:4px;padding:0 4px;white-space:nowrap;flex:none}
`;

/* 常用结构插入（v0.7.2 把 8 个按钮收成 1 个；v0.8.6 加分组 + 键位提示）
 * 结构：[标签, 插入文本, 光标回退, 键位提示, 分组]。
 * 键位提示是**照实抄**自下面的 FMT 表 —— 菜单和快捷键指向同一批动作，
 * 免得出现「菜单说 Ctrl+T、实际按了没反应」这种自相矛盾（check-v086-keys.js 会盯着）。 */
const INSERT_GROUPS = ["格式", "环境", "引用"];
const TPL_FIG = "\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=.8\\linewidth]{}\n  \\caption{}\n  \\label{fig:}\n\\end{figure}";
const TPL_TAB = "\\begin{table}[htbp]\n  \\centering\n  \\begin{tabular}{lcc}\n    \\hline\n    & & \\\\\n    \\hline\n  \\end{tabular}\n  \\caption{}\n  \\label{tab:}\n\\end{table}";
const INSERTS = [
  ["§ 章节", "\\section{}", 1, "Ctrl+1", "格式"],
  ["§ 小节", "\\subsection{}", 1, "Ctrl+2", "格式"],
  ["¶ 三级小节", "\\subsubsection{}", 1, "Ctrl+3", "格式"],
  ["∑ 行内公式", "$", 1, "Ctrl+M", "格式"],
  ["∑ 公式环境", "\\begin{equation}\\label{eq:}\n  \n\\end{equation}", "\\end{equation}".length, "Ctrl+Shift+M", "环境"],
  ["🖼 图", TPL_FIG, 0, "Ctrl+Shift+I", "环境"],
  ["📊 表", TPL_TAB, 0, "Ctrl+T", "环境"],
  ["📝 代码块", "\\begin{verbatim}\n\n\\end{verbatim}", 0, "Ctrl+Shift+K", "环境"],
  ["💬 引用块", "\\begin{quote}\n\n\\end{quote}", 0, "Ctrl+Shift+Q", "环境"],
  ["• 无序列表", "\\begin{itemize}\n  \\item \n\\end{itemize}", 0, "Ctrl+Shift+U", "环境"],
  ["1. 有序列表", "\\begin{enumerate}\n  \\item \n\\end{enumerate}", 0, "Ctrl+Shift+O", "环境"],
  ["🏷 标签", "\\label{}", 1, "Ctrl+Shift+L", "引用"],
  ["🔗 交叉引用", "\\ref{}", 1, "", "引用"],
  ["📚 文献引用", "\\cite{}", 1, "", "引用"],
];

/* ==========================================================================
 * v0.8.6：Typora 风格格式快捷键
 *
 * 键位**照 Typora 的来**，动作落成 LaTeX —— 这样「肌肉记忆」是同一套：
 *   Ctrl+B / I / U      加粗 / 斜体 / 下划线
 *   Ctrl+K              链接（href）
 *   Ctrl+M              行内公式（Typora 的 Ctrl+M 就是行内公式）
 *   Ctrl+Shift+M        公式块
 *   Ctrl+T              表格
 *   Ctrl+1..5 / Ctrl+0  章节层级 / 变回正文（Typora 用同一组键设标题）
 *   Ctrl+Shift+`        行内代码（\texttt）
 *   Ctrl+Shift+K        代码块      Ctrl+Shift+Q  引用块
 *   Ctrl+Shift+U / O    无序 / 有序列表
 *   Ctrl+Shift+I        插图
 *
 * 两种执行形态：
 *   e / s —— 模板插入。e = 无选区时用，s = 有选区时用（没写 s 就共用 e）。
 *            \u0000 = 选区内容的位置，\u0002 = 光标落点（都没写则光标落在末尾）。
 *   head  —— 章节层级。有选区就包住；没选区把**当前整行**换成 \section{...}，
 *            该行原本已是章节命令时**只换层级、保留标题**（Typora 的 Ctrl+1→Ctrl+2 就是这样）。
 *
 * 只在「源码 / 分屏」且焦点在源码 textarea 时接管（见 onFmtKey）。预览区是块级就地编辑，
 * 往里塞 LaTeX 命令会被当成正文回写 —— 那里一概不碰。
 * 反引号那一项用 code 匹配：Shift 会把它变成 ~，key 不可靠。
 * ======================================================================== */
const FMT = [
  { k: "b", shift: false, name: "加粗",     e: "\\textbf{\u0000}",    s: "\\textbf{\u0000}\u0002" },
  { k: "i", shift: false, name: "斜体",     e: "\\textit{\u0000}",    s: "\\textit{\u0000}\u0002" },
  { k: "u", shift: false, name: "下划线",   e: "\\underline{\u0000}", s: "\\underline{\u0000}\u0002" },
  { k: "k", shift: false, name: "链接",     e: "\\href{\u0000}{}",    s: "\\href{\u0002}{\u0000}" },
  { k: "m", shift: false, name: "行内公式", e: "$\u0000$",            s: "$\u0000$\u0002" },
  { k: "t", shift: false, name: "表格",     e: TPL_TAB },
  { k: "`", code: "Backquote", shift: true, name: "行内代码", e: "\\texttt{\u0000}", s: "\\texttt{\u0000}\u0002" },
  { k: "m", shift: true, name: "公式块",    e: "\\begin{equation}\n  \u0000\n\\end{equation}" },
  { k: "k", shift: true, name: "代码块",    e: "\\begin{verbatim}\n\u0000\n\\end{verbatim}" },
  { k: "q", shift: true, name: "引用块",    e: "\\begin{quote}\n  \u0000\n\\end{quote}" },
  { k: "i", shift: true, name: "插图",      e: TPL_FIG },
  { k: "u", shift: true, name: "无序列表",  e: "\\begin{itemize}\n  \\item \u0000\n\\end{itemize}" },
  { k: "o", shift: true, name: "有序列表",  e: "\\begin{enumerate}\n  \\item \u0000\n\\end{enumerate}" },
  { k: "l", shift: true, name: "标签",      e: "\\label{\u0000}", s: "\\label{\u0000}\u0002" },
  { k: "1", shift: false, name: "一级标题", head: "section" },
  { k: "2", shift: false, name: "二级标题", head: "subsection" },
  { k: "3", shift: false, name: "三级标题", head: "subsubsection" },
  { k: "4", shift: false, name: "四级标题", head: "paragraph" },
  { k: "5", shift: false, name: "五级标题", head: "subparagraph" },
  { k: "0", shift: false, name: "正文",     head: "" },
];

const SEL_MARK = "\u0000";    // 选区内容落点
const CARET_MARK = "\u0002";  // 光标落点

/** 模板展开 → { text, caret }。两个标记都摘掉之后再算偏移，避免边改边算。 */
function expandTpl(tpl, sel) {
  const iS = tpl.indexOf(SEL_MARK);
  const iC = tpl.indexOf(CARET_MARK);
  if (iS < 0 && iC < 0) return { text: tpl, caret: tpl.length };
  if (iS < 0) return { text: tpl.slice(0, iC) + tpl.slice(iC + 1), caret: iC };
  if (iC < 0) return { text: tpl.slice(0, iS) + sel + tpl.slice(iS + 1), caret: iS + sel.length };
  if (iS < iC) {
    return {
      text: tpl.slice(0, iS) + sel + tpl.slice(iS + 1, iC) + tpl.slice(iC + 1),
      caret: iS + sel.length + (iC - iS - 1),
    };
  }
  return {
    text: tpl.slice(0, iC) + tpl.slice(iC + 1, iS) + sel + tpl.slice(iS + 1),
    caret: iC,
  };
}

/* v0.8.7：物理键位 → 该键在 US 布局上的字符（KeyB / Digit1 …）。applyFmt 的第二判据：
 * 中文输入法组字中，Ctrl+字母 会被报成 e.key === "Process"；FR-AZERTY 的数字行未按
 * Shift 时是 & é " ' ( à。这两种情况下只看 e.key 的写法会「有些键位能用、有些按下去
 * 没反应」（矩阵探针实测：20 条只剩 7 条）。e.code 与输入法 / 布局无关 —— 但**先比
 * e.key**：US 英文下 e.key 本来就命中，兜底只是给「本来会哑掉的那一半」多一条通路。 */
const physOf = (ch) =>
  /^[a-z]$/.test(ch) ? "Key" + ch.toUpperCase()
  : /^[0-9]$/.test(ch) ? "Digit" + ch
  : "";

/* 行首已存在的章节命令（用于标题升降级：只换命令、保留标题文本） */
/* v0.8.28：块类型 → 人话。回报「这一块不能改」时要说清是哪一块，
 * 而不是笼统一句「多行公式 / 环境等」（用户明明站在一行标题上，看了只会更糊涂）。 */
const WYS_BLK_SAY = {
  preamble: "导言区", heading: "标题", paragraph: "正文", math: "公式",
  float: "图表浮动体", bib: "参考文献", list: "列表", "text-env": "文本环境",
  env: "环境", code: "代码 / 原样", comment: "注释", command: "命令", tail: "文档结尾",
};

/* v0.8.28：把「\section*[短标题]{标题}」里**命令名之后**的部分剥成纯标题文字。
 * 只认平衡花括号、且花括号后面不许再剩任何东西 —— 贪婪正则在这里会要命：
 * /^\s*\\(?:section|...)\*?\s*\{([\s\S]*)\}\s*$/ 对 `\section{标题}\label{sec:y}` 会一路
 * 吃到最后一个 }（回溯），第 1 组拿到 `标题} \label{sec:y`；拿它当标题写回去，
 * 源码就是一行坏 LaTeX（标题里冒出 }、\label 丢了左括号）。
 * 返回 null = 后面还挂着别的东西（\label / \index / \thanks…）—— 别猜，明说。 */
function headStripClean(s) {
  let i = 0;
  const n = s.length;
  while (i < n && (s.charAt(i) === " " || s.charAt(i) === "\t")) i++;
  if (s.charAt(i) === "[") {                     /* 可选短标题 [..] */
    const j = s.indexOf("]", i);
    if (j < 0) return null;
    i = j + 1;
    while (i < n && (s.charAt(i) === " " || s.charAt(i) === "\t")) i++;
  }
  if (s.charAt(i) !== "{") return null;
  let depth = 0;
  for (let k = i; k < n; k++) {
    const c = s.charAt(k);
    if (c === "\\") { k++; continue; }           /* \{ \} 是转义，不算括号 */
    if (c === "{") { depth++; continue; }
    if (c === "}") {
      depth--;
      if (depth < 0) return null;
      if (depth === 0) return s.slice(k + 1).trim() === "" ? s.slice(i + 1, k) : null;
    }
  }
  return null;
}

/* v0.8.28：把一个块占的多个物理行并成一行。
 * LaTeX 里单换行 = 空格、空行才分段 —— 所以「一行正文 / 一行标题拆成几行写」并成一行是无损的。
 * 折行处的行尾注释并成一行后无处安放，剥掉（不剥会把注释后面的内容一起注掉）。 */
function mergeWysLines(lines, s, e) {
  const parts = [];
  for (let li = s; li <= e; li++) {
    let ln = lines[li] == null ? "" : lines[li];
    const cj = ln.indexOf("%");
    if (cj >= 0) ln = ln.slice(0, cj);
    ln = ln.trim();
    if (ln) parts.push(ln);
  }
  return parts.join(" ");
}

const HEAD_RE = /^\s*\\(?:part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*\{([\s\S]*)\}\s*$/;
/* v0.8.14：带命令名 / 星号捕获的同一张表 —— toggle（同层级再按一次=取消）要用它 */
const HEAD_M_RE = /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)\s*\{([\s\S]*)\}\s*$/;

/* =========================================================================
 * 活动文件广播（生产者侧）
 * 宿主只把 filePath 交给 editors 贡献面；ui 面板拿不到（官方 props 只有
 * { serverId, pluginId, ctx, data, dataError, launch }，ctx 里只有 workspace）。
 * 面板过去只能读 sessionStorage 里上一份 .tex -> 切到别的格式仍显示 LaTeX 大纲。
 * 这里在「挂载 / 切文件 / 卸载」三处广播当前活动文件，面板据此显示或收起。
 * ========================================================================= */
const LATEX_EV = "notrat-latex-active-file";
const LATEX_PING = "notrat-latex-active-ping";
const LATEX_STORE = "notrat-latex-active";
/* v0.5.0 新增两条通道：
 *   notrat-latex-cursor    编辑器 -> 面板：光标行，面板据此高亮"正在写的那一节"
 *   notrat-latex-reveal-line 面板 -> 编辑器：滚到某行并闪一下（AC K 回执让面板知道有人接住）
 */
const LATEX_CURSOR = "notrat-latex-cursor";
const LATEX_CURSOR_PING = "notrat-latex-cursor-ping";
const LATEX_REVEAL = "notrat-latex-reveal-line";
const LATEX_REVEAL_ACK = "notrat-latex-reveal-ack";

let _activeOwner = null;
let _activeClearTimer = null;

function announceActiveFile(path, name, owner) {
  if (_activeClearTimer) { clearTimeout(_activeClearTimer); _activeClearTimer = null; }
  const detail = { path: String(path || ""), name: String(name || "") };
  _activeOwner = owner || null;
  try { sessionStorage.setItem(LATEX_STORE, JSON.stringify({ path: detail.path, name: detail.name, at: Date.now() })); } catch (e) {}
  try { window.dispatchEvent(new CustomEvent(LATEX_EV, { detail: detail })); } catch (e) {}
}

/* .tex -> .tex 切换时宿主换 key 重挂载：旧实例先卸载、新实例随后挂载，
 * 所以卸载只「延迟清场」；若期间已被新实例接管（_activeOwner 变了）就取消清理。 */
function retractActiveFile(owner) {
  if (_activeClearTimer) clearTimeout(_activeClearTimer);
  _activeClearTimer = setTimeout(function () {
    _activeClearTimer = null;
    if (_activeOwner !== owner) return;
    _activeOwner = null;
    try { sessionStorage.removeItem(LATEX_STORE); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent(LATEX_EV, { detail: { path: "", name: "" } })); } catch (e) {}
  }, 120);
}

export default function LatexEditor(props) {
  const content = props.content || "";
  const { onChange, onSave, filePath, fileName, pluginId } = props;

  const [serverId, setServerId] = useState("");

  /* v0.8.5 环境自检：没装 TeX 引擎时**只影响「编译 PDF」**这一条路，所以提示条必须把这句话
   * 说在前面，否则用户第一反应是「插件坏了」。engineNote=null 表示不显示提示条。 */
  const [engineNote, setEngineNote] = useState(null);
  const engineProbedRef = useRef(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [issues, setIssues] = useState(null);
  const [compileOut, setCompileOut] = useState("");
  const [bottomTab, setBottomTab] = useState("issues"); // issues | compile
  const [bottomOpen, setBottomOpen] = useState(false);
  const [savedTick, setSavedTick] = useState(0);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  /* 宿主下发的模式表：只有声明了 modes 且客户端认识它时才有（当前装机版宿主：空）。 */
  const hostModeIds = Array.isArray(props.modes)
    ? props.modes.map((m) => (m && m.id != null ? String(m.id) : "")).filter(Boolean)
    : [];
  const nMode = hostModeIds.length >= 2;   // true = 宿主走 N 态契约（modes），false = 旧的双态契约
  /* 宿主模式 id -> 内部分档。两代字面量都认（"wysiwyg"/"source" 与 "visual"/"split"/"source"），
   * 认不出就返回 null = 这一拍不动视图（绝不瞎猜着换档）。 */
  const viewOf = (m) => {
    if (m === undefined || m === null) return null;
    const k = String(m).toLowerCase();
    if (MODE2VIEW[k]) return MODE2VIEW[k];
    if (/split|dual|both/.test(k)) return "split";
    if (/vis|preview|render|read|pdf/.test(k)) return "preview";
    if (/src|code|edit|write|text/.test(k)) return "src";
    return null;
  };
  /* 首帧就落在宿主说的那一档（宿主没下发 = 默认分屏，维持老行为） */
  const [view, setView] = useState(() => viewOf(props.mode) || "split"); // src | split | preview
  /* 可视化侧上次挑的是「预览」还是「分屏」—— 旧的双态契约下，「源码」切回「可视化」按这个还原
   * （新契约里分屏是独立档位，用不上这把记忆） */
  /* v0.8.7：初值必须是 null（=「还没记忆」）。填 "split" 的话，宿主下发的可视化档
   * 在 mount 那一拍会被误判成「上次停在分屏」→ 首屏直接落分屏。
   * onCtrlSlash 那边读它有 `|| "split"` 兜底，null 不会漏。 */
  const lastPvView = useRef(null);
  /* props.mode = 宿主下发的权威值（live）；props.viewMode / props.dualViewMode 是历史上的错名字，
   * 宿主从不注入，留着只作极旧包的兜底，别当契约用。 */
  const hostMode =
    props.mode !== undefined ? props.mode
    : props.viewMode !== undefined ? props.viewMode
    : props.dualViewMode !== undefined ? props.dualViewMode
    : undefined;
  useEffect(() => {
    const v = viewOf(hostMode);
    if (!v) return;
    /* v0.8.8：宿主开关把视图切离可视化侧时也要主动收尾 —— 宿主工具条上的分段按钮常
     *   preventDefault 掉 mousedown（为了保住编辑器选区），那样连 focusout 都不会来。
     *   这里的 view 是**本拍渲染时**的值（setView 还没生效），正好是「切之前在哪一档」。 */
    if (v !== "preview" && view === "preview") leavePreview();
    /* 旧契约的「可视化」是笼统的一侧（分屏 / 纯预览都算）：**先按记忆还原、再更新记忆**。
     * v0.8.7 修：原实现把 lastPvView 的赋值写在判断之前 —— 这一拍就把它覆盖成 "preview"，
     * 判断永远不成立。症状：「分屏 →（宿主开关 / Ctrl+/）源码 → 回可视化」掉进纯预览，
     * 而且从此再也回不到分屏（记忆已被污染）。顺序反过来即可；新契约（nMode，分屏是
     * 独立档位）不受影响 —— 探针里 A 组复现、E 组（modes）本来就是好的。 */
    if (!nMode && v === "preview" && lastPvView.current === "split") { setView("split"); return; }
    if (v !== "src") lastPvView.current = v;
    setView(v);
  }, [hostMode]);
  /* 回写宿主标签栏开关 —— props.onModeSwitch 是唯一通路；没注入就静默跳过 */
  const writeHostMode = (v) => {
    if (typeof props.onModeSwitch !== "function") return;
    const id = (nMode ? VIEW2MODE_N : VIEW2MODE_DUAL)[v];
    if (id) props.onModeSwitch(id);
  };
  /* 切档：宿主开关（props.mode 下发）与内部入口（Ctrl+/、卡片「去源码」、行跳转兜底）都汇到这里 */
  const goView = (v) => {
    if (v !== "src" && v !== "split" && v !== "preview") return;
    /* 离开可视化视图前把改动落盘：否则切到源码视图会看到旧内容。
     * ⚠ v0.8.8：必须**先复位就地编辑相位、再提交**。commitWys() 一见相位为 true 就立刻早退
     *   （那是为了打字期间不重建 DOM、不顶掉光标），而「在预览里敲了字 → 去源码看看」这条路
     *   相位正是 true —— 刚敲的字一个字都没写回，随预览卸载一起没了。 */
    if (view === "preview" && v !== "preview") leavePreview();
    if (v !== "src") lastPvView.current = v;   // 记住可视化侧的选择（预览 / 分屏）
    setView(v);
    writeHostMode(v);   // 新契约：分屏独立回写 "split"；旧契约：归到可视化侧，开关不骗人
  };
  const [katexVer, setKatexVer] = useState(0);
  /* v0.9.1：子文件内容加载完成 → bump 重渲（KaTeX 同款异步套路） */
  const [incVer, setIncVer] = useState(0);
  const [quote, setQuote] = useState(null); // {text, lineFrom, lineTo, x, y}
  const [toast, setToast] = useState(null); // {msg; undo?}
  /* v0.8.4：导出菜单 + 最近一次产物（预览入口认它，不靠猜磁盘上有没有） */
  const [exMenu, setExMenu] = useState(false);
  const exMenuRef = useRef(null);
  const [exportInfo, setExportInfo] = useState(null);
  /* ---------- v0.8.0：就地编辑**不是模式** ----------
   * 预览区就是文档本身：点正文打字、点公式在原地改。没有「进编辑态 / 出编辑态」。
   * 原来那个 ✏/🔒 开关已经删掉 —— 它把「编辑」做成了模式的开关，方向是错的。
   * 下面是原子块的就地编辑器：点一下在被点的那一块旁边浮出来。 */
  const [atomEdit, setAtomEdit] = useState(null); // {bid,s,e,tex,orig,x,y}
  const atomPickedRef = useRef(null);

  /* ---------- Ctrl+/ 切视图（对齐宿主 Markdown 编辑器） ----------
   * 宿主实现（TipTapEditor）：window 捕获阶段监听，(ctrl|meta)+"/"、不带 shift/alt，
   * 命中即 preventDefault，然后 wysiwyg ⇄ source 二态对翻。
   *
   * 本编辑器内部是三档（源码 / 分屏 / 可视化），按宿主那套语义映射（两代契约都走这条）：
   *   当前在「源码」        → 回可视化侧上次停的地方（分屏或预览，默认分屏）
   *   当前在「分屏 / 预览」 → 去「源码」
   *
   * 回写不另造通路：统一调 goView —— 它内含 commitWys()（离开可视化前把改动落盘）
   * 与 writeHostMode → props.onModeSwitch(...)（回写宿主标签栏的模式开关）。
   * v0.8.3 起编辑器内已无视图按钮，这条快捷键是「不碰鼠标也能换档」的入口。
   *
   * ⚠ 监听挂在**本编辑器根节点**上，而不是像宿主那样挂 window：
   *   多开 .tex 时只有拿到焦点的那个实例能收到事件，天然不会两边各翻一次（翻两次=没翻）；
   *   也不必依赖「活动文件桥」判定 owner —— 那条桥是异步广播，首个事件到达前人人自认活动。
   *
   * 监听只订阅一次，所以下面用 ref 取「最新闭包」：
   *   goViewRef   —— goView 读的是当拍的 view / commitWys / props.onModeSwitch
   *   viewRef     —— 判断「现在在哪一档」必须是最新值，否则切过一次方向就反了
   *   atomEditRef —— 就地编辑浮层开着时不切（见下）
   * 不把 goView 塞进依赖数组：它是每次渲染新建的函数，订阅会在每次按键时解绑重挂。 */
  const goViewRef = useRef(null);
  const viewRef = useRef(view);
  const atomEditRef = useRef(null);
  /* v0.8.6：格式化快捷键的执行函数。root 捕获层的订阅只挂一次（deps=[]），
   * 直接闭包会把第一次渲染的 content / onChange 锁死 —— 必须走 ref 拿最新那个。 */
  const fmtRef = useRef(null);
  /* v0.8.11：可视化档的格式动作。跟 fmtRef 同一个理由走 ref —— 订阅只挂一次（deps=[]），
   * 直接闭包会把第一次渲染的 content / onChange 锁死。 */
  const fmtWysRef = useRef(null);
  goViewRef.current = goView;
  viewRef.current = view;
  atomEditRef.current = atomEdit;

  const rootRef = useRef(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    function onCtrlSlash(e) {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      /* v0.8.7：e.key 不可靠时按物理键位兜底（输入法组字中会把 key 报成 "Process"）。
       * 上面那行已经挡掉 Shift，所以 Ctrl+Shift+Slash 不会被误收。 */
      if (e.key !== "/" && e.code !== "Slash") return;
      /* 就地编辑浮层开着：这一下先别切。浮层渲染在根节点下、不在预览容器里，
       * 切视图不会把它卸载，它会连同那块遮罩孤零零浮在源码之上。
       * 让用户先 Esc / 点外面收掉，比替他做决定安全。 */
      if (atomEditRef.current) return;
      e.preventDefault();
      e.stopPropagation();   // 别再让底下的 textarea / 预览吃到这一下
      const gv = goViewRef.current;
      if (typeof gv !== "function") return;
      gv(viewRef.current === "src" ? (lastPvView.current || "split") : "src");   // 三档对翻：源码 ⇄ 可视化侧（分屏 / 纯可视化）
    }
    /* v0.8.6：格式快捷键。与 Ctrl+/ 同一层（捕获阶段、挂在根节点上），
     * 但**先自己判断该不该管**，不该管的原样放行 —— 见下面几行 return。 */
    function onFmtKey(e) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = (e.key || "").toLowerCase();
      if (e.key === "Tab" || k === "s" || e.key === "/") return;   // 让位：缩进 / 保存 / 切视图
      const ta = taRef.current;
      if (ta && document.activeElement === ta) {
        /* 源码 / 分屏：作用对象是 textarea 里的选区 —— 原来那条路，没动 */
        const fn = fmtRef.current;
        if (typeof fn !== "function") return;
        if (!fn(e)) return;   // 没命中这一套键位 → 放行，不拦
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      /* ---------- v0.8.11：可视化档 ----------
       * 以前这里直接 return。用户在这一档按 Ctrl+1，既没反应、又没有任何提示 ——
       * 读起来就是「快捷键是坏的」。而这一档恰恰是插件**默认打开**的那一档：
       * 宿主默认 editorMode = "wysiwyg" → viewOf("wysiwyg") = "preview"。
       * taRef.current 为 null 就是「textarea 没挂载」＝纯可视化档（分屏档它是非空的），
       * 于是改由预览层接手：作用对象从「textarea 里的选区」换成「光标此刻落在哪一块」。 */
      if (ta || viewRef.current !== "preview") return;
      const fw = fmtWysRef.current;
      if (typeof fw !== "function") return;
      if (!fw(e)) return;   // 光标不在任何可编辑块上（人可能在宿主搜索框里）→ 放行，不抢
      e.preventDefault();
      e.stopPropagation();
    }
    /* ---------- v0.8.10：点点工具栏，别把焦点从编辑器拿走 ----------
     * 浏览器默认行为：mousedown 落到 <button> 上，焦点就交给它。焦点一旦停在按钮上：
     *   · Ctrl+/ 还收得到（按钮是根节点的子孙），可是
     *   · 格式快捷键要求 document.activeElement === 源码 textarea ⇒ 全部失灵；
     *   · 最直接的感受是「继续打字也不进编辑器」。
     * 于是用户看到的现象就是：点一下「🔨 编译」或「⬇ 导出」，编辑器好像死了，
     * 得先用鼠标在正文上点一下才活过来 —— 跟 Ctrl+/ 切档后切不回来是同一个病根（焦点跑了）。
     *
     * 只在「被点的确实是 <button>」时拦：
     *   · 点预览区 / 源码 textarea 时必须放行 —— 那边要靠 mousedown 放光标、建编辑态；
     *   · preventDefault 只吃掉「夺焦」这一项默认行为，click 事件与 document 上
     *     「点别处收起浮层」那些监听照常，不受影响。
     * 用捕获阶段挂在根节点上：一个监听把全编辑器 25 个按钮一并管住，以后新加按钮也不用记得加。 */
    function onRootMouseDown(e) {
      const t = e && e.target;
      if (!t || typeof t.closest !== "function") return;
      if (!t.closest("button")) return;        // 不是按钮（正文 / 预览 / 输入框）→ 放行
      if (e.preventDefault) e.preventDefault();
    }
    /* ---------- v0.8.29：Ctrl+A 由本插件自己接管 ----------
     * 症状（用户原话）：「在编辑器内无法全选呢」。
     *
     * 查过的事实（不是猜的）：
     *   · 本插件没有任何一处拦 Ctrl+A（onCtrlSlash / onFmtKey / onWysKeyDown 都不认这个键）；
     *   · 真 Chromium 探针里，焦点落在编辑宿主上时原生 Ctrl+A 本来能全选（selLen = 整篇）。
     *   ⇒ 也就是说「能全选」这件事**依赖焦点恰好落在 .wys-editroot 上**。而本层有两个可编辑面
     *     （可视化档的唯一编辑宿主 / 源码档的 textarea），焦点还可能停在只读孤岛（原子卡片 /
     *     结构块）、块间空隙、乃至容器自己身上 —— 那些时刻原生 SelectAll 就落空，读起来就是
     *     「编辑器里全选不了」。宿主那一层另有若干 Ctrl+A 监听（文件树 / 画布那套），
     *     虽然都不在编辑器的祖先链上，但没必要把自己的行为押在别人身上。
     *
     * 与其赌「焦点恰好对」，不如自己定义：**Ctrl+A = 这一栏的全部内容**。
     *   · 可视化档 → 选整篇（那个唯一的编辑宿主 .wys-editroot）
     *   · 源码 / 分屏档（焦点在 textarea 上）→ textarea 全文
     *   · 就地编辑浮层开着 → 让浮层的 textarea 自己全选（那是它的文本框，不插手）
     *   · 焦点压根不在本编辑器里（人在宿主搜索框 / 侧栏）→ 一律不碰，绝不抢宿主的 Ctrl+A
     * 挂在 window 的**捕获阶段**：比宿主那层任何监听都早，谁也吃不掉。
     * 自己没做成（没有 Range / 没有 Selection）就**放行**，让原生兜底 ——
     * 宁可让原生去试，也不许把 Ctrl+A 变成一个什么都不发生的空动作。 */
    function onSelectAllKey(e) {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      const k = (e.key || "").toLowerCase();
      if (k !== "a" && e.code !== "KeyA") return;
      if (atomEditRef.current) return;                      // 浮层开着：那是它的文本框
      const root0 = rootRef.current;
      const d0 = typeof document === "undefined" ? null : document;
      if (!root0 || !d0) return;
      const ae = d0.activeElement;
      const sel0 = d0.getSelection ? d0.getSelection() : null;
      const anc = sel0 && sel0.anchorNode ? sel0.anchorNode : null;
      const inRoot = !!((ae && root0.contains && root0.contains(ae)) ||
                        (anc && root0.contains && root0.contains(anc)));
      if (!inRoot) return;                                  // 焦点不在本编辑器 → 不抢
      let done = false;
      const ta0 = taRef.current;
      if (ta0 && ae === ta0) {
        try { ta0.focus(); if (ta0.select) ta0.select(); done = true; } catch (err) { done = false; }
      } else {
        const host0 = root0.querySelector ? root0.querySelector(".wys-editroot") : null;
        if (host0) {
          try {
            if (host0.focus) host0.focus();
            if (d0.createRange) {
              const rng0 = d0.createRange();
              rng0.selectNodeContents(host0);
              const sel1 = d0.getSelection ? d0.getSelection() : null;
              if (sel1) {
                if (sel1.removeAllRanges) sel1.removeAllRanges();
                if (sel1.addRange) sel1.addRange(rng0);
                done = true;
              }
            }
          } catch (err) { done = false; }
        }
      }
      if (!done) return;                                    // 没做成 → 放行原生，别吞掉这一下
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();           // 宿主那一层别再把它当自己的键
    }
    root.addEventListener("keydown", onCtrlSlash, true);   // 捕获阶段，先于组件内部的 onKeyDown
    root.addEventListener("keydown", onFmtKey, true);      // v0.8.6 格式快捷键
    window.addEventListener("keydown", onSelectAllKey, true);   // v0.8.29：Ctrl+A 自持（比宿主更早）
    root.addEventListener("mousedown", onRootMouseDown, true);   // v0.8.10 按钮不夺焦
    return () => {
      root.removeEventListener("keydown", onCtrlSlash, true);
      root.removeEventListener("keydown", onFmtKey, true);
      window.removeEventListener("keydown", onSelectAllKey, true);
      root.removeEventListener("mousedown", onRootMouseDown, true);
    };
  }, []);

  /* 「＋ 插入」菜单（v0.7.2 把 8 个插入按钮收成 1 个） */
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);

  const taRef = useRef(null);
  const preRef = useRef(null);
  const gutterRef = useRef(null);
  const pvRef = useRef(null);
  const bubbleRef = useRef(null);

  /* ---------- v0.8.9 起：焦点守卫（v0.8.10 泛化到全部瞬态 UI） ----------
   * 症状：按一次 Ctrl+/（或 Esc 关掉就地编辑浮层）之后，编辑器好像"死了" —— 快捷键没反应、
   *   继续打字也不进去，得先用鼠标在正文上点一下才活过来。
   *
   * 根因：Ctrl+/ 与格式快捷键的监听**故意**挂在根节点上（多开 .tex 时只有拿到焦点的实例
   *   能收到，不会两边各翻一次）。而「切档」和「收起浮层」都是**把带焦点的那个子树整个卸载**：
   *   预览层的 .pv-root / 源码 textarea / 就地编辑浮层的输入框从文档里消失，浏览器把
   *   activeElement 扔回 <body>。之后 keydown 的事件目标是 <body>，它不是根节点的子孙
   *   ⇒ 捕获列表里根本没有根节点 ⇒ 挂在根上的两个监听器一个都收不到。
   *
   * 修法：焦点「悬空」时把它拉回编辑器内部。只在悬空时拉，这一条同时排除了三种不该碰的情况：
   *     · 焦点还在编辑器子树里（分屏 ⇄ 可视化这一路预览层没卸载）→ 动它就是顶掉正在打字的光标；
   *     · 焦点在宿主自己的控件上（搜索框、面板输入框）→ 那是用户正在用的东西，绝不抢；
   *     · 焦点在工具栏按钮上 → 由上面那道 mousedown 守卫从源头堵住，不靠这里事后抢回来
   *       （事后抢会跟"用 Tab 走到按钮再按空格"这种正常键盘操作打架）。
   * 拉到哪：源码档进 textarea（接着就能打字，格式快捷键也认它）；可视化侧进根节点本身
   *   （不落进 .pv-root —— 那会触发 onWysFocusIn，把「点一下才编辑」悄悄变成「切过来就编辑」）。
   *
   * 键里为什么是这四个：凡是「收起后可能让焦点悬空」的瞬态 UI 都得在。漏一个，那条路径上的
   * 快捷键就会**静默**失效 —— 用户只会说「这编辑器偶尔抽风」。
   * menu（＋插入）不在其中，理由不是「菜单项会自己把焦点放回来」——insert() **不 focus**，
   * 它只设 pendingCursor，焦点是 [content] effect 里补的，还依赖宿主把 onChange 回写进
   * props.content 那条回路。真正的原因是：点它的按钮已经被 mousedown 守卫拦下不夺焦，
   * 收起菜单时焦点本来就没跑。依据写准，免得以后照着这句话去改。 */
  const focusGuardKey = view + "|" + (atomEdit ? "atom" : "") + "|" + (quote ? "quote" : "") + "|" + (exMenu ? "exMenu" : "");
  const focusGuardRef = useRef(focusGuardKey);
  useEffect(() => {
    if (focusGuardRef.current === focusGuardKey) return;   // 首次挂载 / 同状态重渲染：不动焦点
    focusGuardRef.current = focusGuardKey;
    const root = rootRef.current;
    if (!root) return;
    const d = typeof document === "undefined" ? null : document;
    if (!d) return;
    const ae = d.activeElement;
    if (ae && ae !== d.body && ae !== d.documentElement) return;   // 焦点还在某处 → 不碰
    if (view === "src") {
      const ta = taRef.current;
      if (ta && typeof ta.focus === "function") { try { ta.focus(); return; } catch (e) {} }
    } else if (view === "preview") {
      /* ---------- v0.8.11：可视化档把光标送进**第一块能写字的正文**，而不是外层容器 ----------
       * v0.8.9 在可视化侧一律 `root.focus()`，注释写明是「不落进 .pv-root，免得把
       * 『点一下才编辑』悄悄变成『切过来就编辑』」。代价很实在：root 是个**不可编辑的容器**，
       * 焦点落在它身上时用户切过来直接打字，一个字都进不去 —— 必须先拿鼠标在正文上点一下。
       * 用户报的「无法正常编辑添加」就是这一步摩擦。
       * 推迟一拍：这个 effect 排在 paint 之前，此刻 .pv-root 里还没有内容，
       * 当场查 .wys-edit 一定是空手而归。
       * 所以分两步走：先**同步**把焦点收回容器（这一步只为「焦点别悬空」—— root 上那两个
       * keydown 全靠它，用户在这一刻按键不至于掉在 <body> 上），下一拍再把光标送进正文块。 */
      try { root.focus(); } catch (e) {}
      setTimeout(function () {
        const r2 = rootRef.current;
        if (!r2) return;
        const d = typeof document === "undefined" ? null : document;
        if (d) {
          const ae = d.activeElement;
          /* 这一拍里用户已经点到别处去了（宿主搜索框之类）→ 绝不抢他的焦点 */
          if (ae && ae !== d.body && ae !== d.documentElement && ae !== r2) return;
        }
        const first = firstEditableIn(r2);
        if (first && typeof first.focus === "function") {
          try { first.focus(); } catch (e) {}
          /* v0.8.12：宿主拿到焦点之后，光标默认落在整篇**开头**（而且常常落在导言区那些
           * 不可编辑的项旁边）。把它送到第一块正文的末尾 —— 切过来就能接着写，
           * 不用先拿鼠标点一下。整段包在 try 里：夹具的假 DOM 没有 Range 也不能因此炸掉。 */
          try { wysCaretToStart(first); } catch (e) {}
          return;
        }
        try { r2.focus(); } catch (e) {}   // 这篇没有可写正文块 → 退回老行为，至少快捷键还收得到
      }, 0);
      return;
    }
    try { root.focus(); } catch (e) {}
  }, [focusGuardKey]);
  const pendingCursor = useRef(null);
  /* v0.8.6：格式快捷键回填用的区间；见下面那个 [content] effect */
  const pendingRange = useRef(null);
  /* v0.6.1：待补跳的行 —— 源码还没挂载时 gotoLine 跳不了，先存这里，DOM 就绪那一拍兑现 */
  const pendingReveal = useRef(null);
  const katexOkRef = useRef(false);
  const assetCache = useRef(new Map());
  /* v0.9.1 多文件展开：子文件文本缓存（abs → {content, mtime, at}）。
   * at = 取回时刻：2s 新鲜度窗口内不重校；失败进 incFail（30s 冷却）；incInflight 去重。 */
  const inputCache = useRef(new Map());
  const incInflight = useRef(new Map());
  const incFail = useRef(new Map());
  /* 行定位闪烁："跳过去了"要看得见，否则用户不知道点没点中 */
  const [flashLine, setFlashLine] = useState(0);
  const flashRef = useRef(null);
  const flashLineRef = useRef(0);
  const flashTimer = useRef(null);
  /* v0.8.24：分屏滚动联动的**回声台账**（用户原话「分屏那里没有同步呢」）。
   * 双向联动最容易出的毛病是「A 推 B、B 又推回 A」两栏来回打架、画面发抖。
   * 判据刻意不用「计时器到点就别管了」这种糊涂账，而是**位置对得上**：
   * 凡是我们替对方写进去的位置都记在这儿（连时间戳），等那一栏自己报上来的 scroll
   * 正好等于这个位置、且就在刚才（350ms 内）→ 认作回声，放行。
   * 两栏用的是同一个比例公式，推过去再推回来落在同一个点上 —— 天然幂等，不会漂。 */
  const scrollEcho = useRef({ src: -1, pv: -1, at: 0 });
  const gotoLineRef = useRef(null);
  /* ---------- 就地编辑层（v0.7.0 · 方案 A）----------
   * 权威源 = LaTeX 源码。可视化视图里只有 heading / paragraph 变成可编辑块，
   * 改完用 WYS.applyEdits 只替换被改块的行区间；公式 / 浮动体 / 参考文献保持原子卡片。
   * 三条不变式：
   *   ① 编辑期间 DOM 是权威 —— 绝不回写 innerHTML，否则每敲一个字光标就丢；
   *   ② 只提交真正改过的块（渲染时记下原文当基准）；
   *   ③ 提交前跑内核自检，任何一条不过就整批放弃，绝不半途改坏文件。
   */
  const wysEditing = useRef(false);
  const wysOrigRef = useRef(new Map());
  /* v0.8.18：历史交给 txlog（v0.9 P2 那块地基），不再是「一串整份源码快照」。
   * 每条事务自带字节级的 before/after 与「改了哪一块」的凭据，于是：
   *   · 外部改动落在别的块上 → rebase 把历史**重映射**过去，完整保留（旧版整条清空）；
   *   · 只有真冲突（外部动了同一处）才丢那一条，gaps++ 并且弹出来（不静默）；
   *   · 「还能不能撤」由 History 回答，不再靠布尔标志互相打手势
   *     —— 旧版误判一次（切档卸载重挂 / 外部改动）就把用户历史清光。
   * 惰性建：base 必须是打开这份文件时的源码。 */
  const wysHistRef = useRef(null);
  /* 这份文件在历史表里的键。取不到路径就**不进表** ——
   * 宁可少存一步，也不许两篇文档共用一条撤销链（Ctrl+Z 撤到别的文件上去）。 */
  function wysHistKey() {
    return String(filePath || (props.file && props.file.path) || fileName || "");
  }
  function wysHist() {
    if (!wysHistRef.current) {
      const k = wysHistKey();
      wysHistRef.current = k
        ? wysHistFor(k, content)
        : new TX.History({ base: content, limit: WYS_HIST_STEPS_MAX });
    }
    return wysHistRef.current;
  }
  /* 这一拍的 content 变化来自 undoWys / redoWys 自己 —— 同步层别把它当「外部改动」去 rebase */
  const wysHistOp = useRef(false);
  /* 上一拍 DOM 是照着哪份源码渲染的；外部改动进来时，它就是 rebase 的「改动前」。
   * null = 还没渲染过（首帧不参与 rebase 判定）。 */
  const wysRenderedSrc = useRef(null);
  /* v0.8.21：屏幕**现在是照着哪份源码**画的。与 wysRenderedSrc 是两件事：
   * 后者只在「同步层真的重建过」那一拍更新，打字期间（本 effect 早退）它停在
   * 打字前那份；而这一栏由 commitWys 在写回**当拍**就记好 —— 因为那一拍 DOM
   * 已经是新源码的样子，只是中间那一帧可能被 React 批处理吃掉（撤销就是这种：
   * commit 与 undo 在同一次事件里），effect 见不到 content=新源码 那一帧。
   * 少了它，撤销时 html 与 __latexHtml 相等 → 幂等守卫生效 → 画面不重建
   * （用户读作「已撤销但是没有效果」）。 */
  const wysDomSrc = useRef(null);
  /* v0.8.12：这一次 content 变化是不是「本层自己提交的」。是 → 同步层不重建 DOM。
   * 与 wysEditing 的分工：wysEditing 管「用户正在打字」（编辑期间 DOM 是权威）；
   * 这个是「刚写完那一拍」—— 用户手已经离开编辑区、但 DOM 还是他刚敲进去的那份。 */
  const wysSelfEdit = useRef(false);

  /* ---------- v0.8.25：预览层打字 → 源码「边打边」同步 ----------
   * 用户原话：「在分屏右栏（预览）里打字时，左栏源码框要等我点开才更新，
   *            我想边打边看到源码变化」。
   * 旧行为：打字期间只有 DOM 在变（不变式①「编辑期间 DOM 是权威」），源码要等
   * 失焦 / Ctrl+S / 切档才 commitWys 落地 —— 左栏 textarea 受控于 props.content，
   * 于是打字全程停在旧内容上，「点一下左栏」＝blur＝才刷新。
   * 三条硬约束（缺一条就出事故）：
   *   ① 基准用「本层最近写出去的源码」（wysOutSrc），不能用 props.content ——
   *      同一个 React 批次里连打两笔时 props 还没回来，第二笔基于旧基准会把第一笔抹掉。
   *   ② 打字期间绝不重建预览 DOM（DOM 就是权威），靠 wysSelfEdit 那面旗子放行。
   *   ③ 一次连续编辑 = 撤销链里**一步**：会话起点记在 wysLiveBase，收尾时才入栈。 */
  const wysOutSrc = useRef(null);     // 本层最近写出去的源码（实时同步与 commit 共用的基准）
  const wysLiveBase = useRef(null);   // 打字会话的起点源码；null = 没有进行中的会话
  const wysLiveRaf = useRef(0);       // 同一帧里的多次 input 合并成一次同步
  /* 打字期间**不再重算整篇预览 HTML**：实时同步之后 content 每敲一个字就变一次，
   * wys 那个 useMemo 会跟着把整篇（含 KaTeX）重渲染一遍 —— 大文档下就是几十毫秒
   * 砸在每一次击键上；而这段时间预览 DOM 本来就是权威（同步层也会早退、不重建），
   * 算出来没人用。直接复用编辑开始前那一份。 */
  const wysCacheRef = useRef(null);


  const renderMath = useMemo(() => {
    if (katexOkRef.current && typeof window !== "undefined" && window.katex) {
      return (tex, disp) => {
        try {
          return window.katex.renderToString(tex, { displayMode: !!disp, throwOnError: false, strict: "ignore" });
        } catch (e) { return LPC.miniMath(tex, disp); }
      };
    }
    return (tex, disp) => LPC.miniMath(tex, disp);
  }, [katexVer]);

  /* 图片基目录：原子卡片现在跟着源码一起富渲染（图 / 表 / 公式），得先有它。
   * ⚠ 必须在 wys 之前声明：依赖数组是渲染期立即求值的，写在后面就是 TDZ
   *   （0.7.0 的 renderMath 白屏事故同款）。 */
  const baseDir = useMemo(() => {
    const p = String(filePath || "");
    const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
    return i > 0 ? p.slice(0, i) : "";
  }, [filePath]);

  /* v0.9.1：子文件解析器（同步查缓存；miss 返回 {path} 让预览内核出 pending 占位） */
  const incApi = useMemo(() => ({
    resolvePath: function (name) { return resolveIncPath(name, baseDir); },
    resolve: function (name) {
      const abs = resolveIncPath(name, baseDir);
      if (!abs) return null;
      const hit = inputCache.current.get(abs);
      return hit ? { path: abs, content: hit.content } : { path: abs };
    },
    cache: inputCache.current,
  }), [baseDir]);
  const wys = useMemo(() => {
    /* v0.8.25：正在打字（有进行中的实时同步会话）→ 直接复用编辑开始前那一份 HTML。
     * 见 wysCacheRef 的注释：这段时间 DOM 才是权威，重算是白烧。 */
    if (wysLiveBase.current != null && wysCacheRef.current) return wysCacheRef.current;
    let out;
    try { out = { html: wysRenderDoc(content, renderMath, baseDir, incApi) }; }
    catch (e) { out = { html: '<div class="wys-err">就地编辑层渲染失败：' + esc(String((e && e.message) || e)) + "</div>" }; }
    wysCacheRef.current = out;
    return out;
  }, [content, renderMath, baseDir, incApi, incVer]);

  /* 浮层上半部分的实时渲染：跟原子块本身用的是同一套预览内核，
   * 所以「你看到的」和「点确定后落版的」是同一张图，不会出现改完变样。 */
  const atomPvHtml = useMemo(() => {
    if (!atomEdit) return "";
    try {
      return LPC.renderPreview(atomEdit.tex, { renderMath: renderMath, baseDir: baseDir, docHeader: false }).html;
    } catch (e) {
      return '<span style="color:#ef4444;font-size:12px">这一块暂时渲染不出来，但源码仍可编辑</span>';
    }
  }, [atomEdit, renderMath, baseDir]);

  /* v0.8.27：一笔回写落地后，把所有块的行区间跟着挪（算法见模块级的 wysShiftSpan）。
   * 行区间的**唯一权威**仍是 DOM 上的 data-s / data-e（三处读回点都读它，不各存一份）——
   * 这里就地把它改对，读回那边一个字都不用动。
   * 挪早挪晚都不行：必须在「下一笔回写」之前，也不该早于 applyEdits 成功（写没落地就挪，
   * 区间会与源码对不上）。 */
  function wysShiftSpans(edits) {
    const root = pvRef.current;
    if (!root || !root.querySelectorAll || !edits || !edits.length) return;
    const blks = root.querySelectorAll(".wys-blk");
    for (let i = 0; i < blks.length; i++) {
      const el = blks[i];
      const s = parseInt(el.getAttribute("data-s"), 10);
      const e = parseInt(el.getAttribute("data-e"), 10);
      const nx = wysShiftSpan(s, e, edits);
      if (!nx) continue;
      el.setAttribute("data-s", String(nx[0]));
      el.setAttribute("data-e", String(nx[1]));
    }
  }

  /* 提交：只回写被改过的块。返回新源码；无改动 / 自检不过返回 null。 */
  function commitWys() {
    const root = pvRef.current;
    if (!root || wysEditing.current) return null;
    const blks = root.querySelectorAll(".wys-blk");
    if (!blks.length) return null;
    /* v0.8.20：先把「块外的字」收进正文块，再算 edits。
     * 不收的话这些字既进不了源码、也进不了撤销链 —— 用户读作「我刚敲的字没了 / 撤销说没有」。
     * 搬到哪一块是确定的（最近的正文块），不猜语义；搬完照常走后面那套自检。 */
    const folded = wysFoldOrphans(root);
    const edits = [];
    for (let i = 0; i < blks.length; i++) {
      const el = blks[i];
      const part = el.querySelector(".wys-edit");
      if (!part) continue;
      const s = parseInt(el.getAttribute("data-s"), 10);
      const e = parseInt(el.getAttribute("data-e"), 10);
      if (!(s >= 0) || !(e >= s)) continue;
      /* v0.8.12：合成一个编辑宿主之后，光标可以落在块内、.wys-edit 之外（比如标题编号左边），
       * 那儿敲的字只有读**整块**才接得住 —— 否则用户看得见、一落地就没了（最坏的一种错）。
       * 导言区例外：那是「一行一项 + 一个兜底入口」的复合块，读整块会把标题/作者/宏包一起吞进来，
       * 它照旧只认那一个 .wys-edit 兜底入口。 */
      const anchor = (el.getAttribute("data-type") === "preamble") ? part : el;
      /* v0.8.22：结构块（注释 / 命令 / 文档结尾）直接取块自己的 data-tex —— 见 WYS_TEX_BLOCK。 */
      const ownTex = WYS_TEX_BLOCK[el.getAttribute("data-type")] ? el.getAttribute("data-tex") : null;
      /* v0.8.26：块级读回走 wysBlockTex（吃掉段末那个落脚换行）—— 三个读回点必须同一把尺子 */
      const now = ownTex != null ? ownTex : wysBlockTex(anchor);
      const orig = wysOrigRef.current.get(el.getAttribute("data-bid"));
      if (orig != null && now === orig) continue;        // 没动过的块不进 edit 列表
      if (el.getAttribute("data-type") === "heading") {
        /* 标题被改空 —— 通常是跨块退格把文字并进了邻块。写 \section{} 既不是用户想要的，
         * 也会让这篇文从此多一个空标题；宁可不改并说一声。 */
        if (!String(now).trim()) {
          setToast({ msg: "⚠ 这一块的标题被清空了，已跳过 —— 标题不能是空的" });
          continue;
        }
        /* headingTex 只换标题主体，保住 *、[短标题]、\label */
        edits.push({
          startLine: s, endLine: e,
          newText: WYS.headingTex(
            { prefix: el.getAttribute("data-prefix") || "", suffix: el.getAttribute("data-suffix") || "" },
            now
          ),
        });
      } else {
        edits.push({ startLine: s, endLine: e, newText: now });
      }
    }
    if (!edits.length) return null;
    let next;
    try {
      /* 自检 1：空编辑集必须逐字节还原（内核硬不变式） */
      if (WYS.applyEdits(content, []) !== content) throw new Error("空编辑集未逐字节还原");
      next = WYS.applyEdits(content, edits);
      /* 自检 2：回写结果必须仍可解析 */
      WYS.parseDoc(next);
    } catch (err) {
      setToast({ msg: "⚠ 就地回写自检未通过，已放弃本次修改：" + String((err && err.message) || err) });
      return null;
    }
    if (next === content) return null;
    /* v0.8.27：这笔回写可能改了行数（段落一拆就 +1）—— 块的行区间跟着挪。 */
    wysShiftSpans(edits);
    /* v0.8.25：实时同步可能已经把前面的字写进源码了（props.content 还是旧的闭包值，
     * 但该块在源码里早就更新过），那这串字的**起点**就不是 content，而是这次打字会话
     * 开始前那一份 —— 用会话起点，Ctrl+Z 才一次退掉整串（否则只退到中间某个字符）。 */
    wysPushTx(wysLiveBase.current != null ? wysLiveBase.current : content, next, "打字");
    wysLiveBase.current = null;
    wysOutSrc.current = next;
    /* v0.8.21：屏幕此刻就是 `next` 的样子（字是用户刚敲的），台账当拍就记上 ——
     * 中间那一帧 onChange 可能被 React 批处理吃掉（撤销就是这种：commit 与 undo 在同
     * 一次事件里），effect 见不到 content=next，台账不记就与屏幕脱节，撤销时会被
     * 幂等守卫短路掉（画面不重建 = 用户读作「已撤销但是没有效果」）。 */
    wysDomSrc.current = next;
    /* v0.8.12：告诉同步层「这次 content 变化是本层自己写上去的」——
     * DOM 已经是权威，别再拿 html 覆一遍（覆一遍就是把光标铲掉）。 */
    wysSelfEdit.current = true;
    onChange(next);
    setToast({
      msg: "✏ 已就地写回 " + edits.length + " 处改动"
        + (folded ? "（其中 " + folded + " 处字原先落在正文块外，已并进最近的正文块）" : ""),
      undo: true,
    });
    return next;
  }

  /* v0.8.18：预览层改动的统一落点 —— 落盘前记一条**真事务**。
   * before 必须与历史当前状态首尾相接，否则链会断（txlog 的 checkChain 会红）：
   * 同一次事件里刚提交过打字时，props.content 还是旧的闭包值，中间就夹着一层 ——
   * 先把历史重映射到这一步的基准上，再落。 */
  function wysPushTx(before, after, label) {
    const hist = wysHist();
    if (before !== hist.state()) hist.rebase(hist.state(), before);
    return hist.commit({ before: before, after: after, label: label || "编辑", at: Date.now() });
  }
  /* 当前这份文档在**历史眼里**的样子。基准一律取它，不取 props.content ——
   * 后者在同一次事件里刚提交过打字时还是旧的，拿它当基准会把刚打的字抹掉。 */
  function wysBase() {
    const hist = wysHist();
    return hist.state();
  }

  /* v0.8.25：实时同步与 commitWys 必须用**同一个基准**，否则同一个 React 批次里连打
   * 两笔，第二笔基于滞后的 props.content 重算会把第一笔抹掉。基准 = 本层最近一次写出去
   * 的源码（wysOutSrc）；还没有过就用 props.content。 */
  function wysBaseSrc() {
    return wysOutSrc.current != null ? wysOutSrc.current : content;
  }

  /* v0.8.25：预览层打字是**边打边**写回源码的（见 wysSyncLive），于是收尾时裸 commitWys
   * 往往算出「没有新变化」直接返回 null —— 可那一串字必须能在 Ctrl+Z 里撤掉、
   * 「编译 / 导出前先落盘」也必须把它带上。这个包装补两件事：
   *   ① 把整段打字会话合成撤销链里的**一步**（起点 = 会话开始前那份源码）；
   *   ② 有净改动就返回当前源码 —— 调用方拿非 null 当「有东西要落盘」的凭据。
   * 返回 null 的语义与 commitWys 一致：确实什么都没变。 */
  function commitWysSession() {
    const b0 = wysLiveBase.current;
    const out = commitWys();
    wysLiveBase.current = null;
    if (out != null) { wysOutSrc.current = out; return out; }
    const cur = wysBaseSrc();
    if (b0 != null && b0 !== cur) {
      wysPushTx(b0, cur, "打字");
      return cur;
    }
    return null;
  }

  /* v0.8.25：把「光标所在那一块」的 DOM 文本**当场**写回源码。
   * 与 commitWys 的分工：commitWys 是收尾（扫全部块、记历史、弹提示、自检后整批落盘），
   * 这里只是过程中的轻量跟随 —— 只跟当前这一块，不弹提示、不记历史（历史在收尾时由
   * 一次 commitWysSession 落成一步）。
   * 失败一律静默：这是「顺手同步」，绝不许因为它挡了用户打字；
   * 真正的落盘保障仍在 commitWys（失焦 / Ctrl+S / 切档 / 编译前都会走一次）。 */
  function wysSyncLive() {
    const root = pvRef.current;
    if (!root || !wysEditing.current) return;
    const blk = currentWysBlock();
    if (!blk) return;                                   // 光标在块外空白处：那类字由收尾时的折叠兜底
    const s = parseInt(blk.getAttribute("data-s"), 10);
    const e = parseInt(blk.getAttribute("data-e"), 10);
    if (!(s >= 0) || !(e >= s)) return;
    const type = blk.getAttribute("data-type") || "";
    const part = blk.querySelector(".wys-edit");
    if (!part) return;
    /* 读法与 commitWys 逐字一致：导言区只认那一个兜底入口，其余读整块；
     * 注释 / 命令 / 文档结尾三类直接取块自己的 data-tex（它们的 DOM 全是渲染结果）。 */
    const anchor = type === "preamble" ? part : blk;
    const ownTex = WYS_TEX_BLOCK[type] ? blk.getAttribute("data-tex") : null;
    /* v0.8.26：与 commitWys 逐字一致（含这层归一）—— 两边读法一漂，块就会被误判成「改过」 */
    const now = ownTex != null ? ownTex : wysBlockTex(anchor);
    const orig = wysOrigRef.current.get(blk.getAttribute("data-bid"));
    if (orig != null && now === orig) return;           // 这一块没动（只是光标路过它）
    /* 标题被清空：与 commitWys 同一条规矩 —— 不许写出空标题（那是跨块退格的中间态） */
    if (type === "heading" && !String(now).trim()) return;
    const base = wysBaseSrc();
    let next;
    let newText;
    try {
      newText = type === "heading"
        ? WYS.headingTex(
            { prefix: blk.getAttribute("data-prefix") || "", suffix: blk.getAttribute("data-suffix") || "" },
            now
          )
        : now;
      next = WYS.applyEdits(base, [{ startLine: s, endLine: e, newText: newText }]);
      WYS.parseDoc(next);                               // 自检：落地前必须仍可解析
    } catch (err) { return; }                           // 静默：这只是跟随，不是落盘
    if (next === base) return;
    if (wysLiveBase.current == null) wysLiveBase.current = base;   // 会话起点 = 编辑前那份源码
    /* v0.8.27：行数一变，块的行区间当场跟着挪（见 wysShiftSpans）——「边打边同步」这条路
     * 每敲一个字就走一次，区间要是留在上一次的位置，这一串字就会越写越错位。 */
    wysShiftSpans([{ startLine: s, endLine: e, newText: newText }]);
    wysOutSrc.current = next;
    /* 屏幕此刻就是 next 的样子（字是用户刚敲的），台账当拍记上 —— 与 commitWys 同理：
     * 中间那一帧 onChange 可能被 React 批处理吃掉。 */
    wysDomSrc.current = next;
    /* 告诉同步层「这次 content 变化是本层自己写上去的」—— DOM 已经是权威，
     * 别再拿 html 覆一遍（覆一遍就是把光标连同焦点一起铲掉）。 */
    wysSelfEdit.current = true;
    onChange(next);
  }

  /* v0.8.25：预览层的 input 通路 = 打字实时同步的入口。
   * 同一帧里的多次输入合并成一次（rAF），但**最后一笔一定落地** ——
   * 这正是用户要的「边打边看到」（而不是「打完才看到」）。 */
  function onWysInput(e) {
    /* 输入法组字中（拼音还没落定）先别同步：半成品拼音写进源码既难看又难撤。
     * 组字结束那一拍会再派一次 input（isComposing 已为 false），那时照常同步。 */
    if (e && (e.isComposing || (e.nativeEvent && e.nativeEvent.isComposing))) return;
    if (!wysEditing.current) return;
    queueWysLive();
  }
  /* 排一次「跟着写回」。同一帧里的多次输入合并成一次（rAF），最后一笔一定落地。
   * v0.8.26：回车那条路（insertSoftBreak）插完 <br> 也调它 ——
   * UA 只在自己执行编辑命令时派 input；我们自己动 DOM 就得自己喊这一声，
   * 不喊就是「字看得见、源码不动」，正是 v0.8.25 修掉的那个毛病。 */
  function queueWysLive() {
    if (wysLiveRaf.current) return;
    const run = function () {
      wysLiveRaf.current = 0;
      try { wysSyncLive(); } catch (err) { /* 跟随失败不打断打字 */ }
    };
    wysLiveRaf.current = (typeof requestAnimationFrame === "function")
      ? requestAnimationFrame(run)
      : setTimeout(run, 16);
  }
  /* v0.8.23：凡是「不是用户就地打字」写上去的源码变化，落盘前都要把这面旗子放平。
   *
   * wysSelfEdit 的语义只有一个：这次 onChange 是**用户在本层打字**造的 —— DOM 才是权威，
   * 别拿 html 覆一遍（覆一遍会把光标连同焦点一起铲掉）。
   * 但同一次事件里前面可能刚 commitWys 过：打完字立刻 Ctrl+1（commitWys → applyHeadWys）、
   * 打完字立刻 Ctrl+Z（wysCommitPending → undoWys）都是这种姿势，而 React 会把两次
   * onChange 合成一拍 —— 同步层只看到一次变化，那面旗子还是 true，于是**跳过重画**：
   * 源码已经变了（\section 合并好了 / 撤销退回去了），屏幕却停在原处。
   * 用户读作「✓ 已设为「\section」… 没有生效」「已撤销但是没有效果」。
   * （这一层之前 21 层门禁全绿也拦不住 —— 它们测的都是「源码写对没写对」，
   *   没有一层问过「用户看见的还是不是同一个东西」。探针 .setup/_probe-v0823.js 钉的就是它。）
   *
   * 所以结构性 / 撤销类改动统一调它：DOM 不再是权威，屏幕必须照着新源码重画。
   * 顺带把光标回接那条路打开（同步层里 keepCaret = selfEdit ? null : snapshot）。 */
  function wysPaintFromSrc() { wysSelfEdit.current = false; }

  /* v0.8.18：挂载 / 换文件时认领历史。
   * 换文件 → 认领的是**那份文件自己的**历史（按路径分家，A 的链不会套到 B 上）；
   * 重挂（切主区标签回来）→ 认领回原来那条，于是「切走再回来还能撤」。
   * 认领时如果文件被别处改过，wysHistFor 会先 rebase 一次，绝不清栈。 */
  useEffect(() => {
    const k = wysHistKey();
    wysHistRef.current = k
      ? wysHistFor(k, props.content || "")
      : new TX.History({ base: props.content || "", limit: WYS_HIST_STEPS_MAX });
    wysRenderedSrc.current = props.content || "";
  }, [filePath, fileName]);
  /* v0.8.17：undo / redo 入口先落地「还没写回源码的打字」。
   * v0.8.15 的栈只记已落盘的预览层操作，而正文打字要等焦点离开 / Ctrl+S 才 commit ——
   * 刚打完字就 Ctrl+Z，栈里没有这步：要么弹「没有可撤销的改动」（字明明是刚打的），
   * 要么撤掉更早的旧步骤、还把没落盘的字一并丢掉。用户读作：撤销坏了。
   * 现在先 commit 成一步历史再撤 —— 撤掉的正好是「刚才这串字」。 */
  function wysCommitPending() {
    if (!wysEditing.current) return null;
    wysEditing.current = false;
    const committed = commitWysSession();
    /* 撤销 / 重做走「整份源码还原 + DOM 重建」：必须把 commitWys 留下的 selfEdit
     * 复位掉 —— 不然同步层拿 selfEdit 当「DOM 是权威」跳过重建，DOM 里还是刚打的字、
     * 源码已经退回去，两边脱节（焦点一走 commitWys 又把陈旧 DOM 盖回来，v0.8.14 同款）。 */
    wysSelfEdit.current = false;
    return committed;
  }
  /* v0.8.18：撤销 / 重做只向 History 要「凭据」，改不改由这一层决定（txlog 红线①）。
   * 重做链不用自己压 —— 游标一退，那一步本来就在栈里等着。 */
  function undoWys() {
    wysCommitPending();                 // v0.8.17：还没落盘的打字先落成一条事务
    const hist = wysHist();
    const tx = hist.undo();
    if (!tx) return false;
    wysHistOp.current = true;
    /* v0.8.23：撤销是「整份源码还原」，DOM 里那份字必须撤下。打字那一路 wysCommitPending
     * 自己已经放过旗子（v0.8.15）；这里再放一次，管的是「同一次事件里别处刚 commitWys 过」
     * 的情形（比如改完整块原子紧接着撤销）—— 旗子一漏，屏幕就留在原地，用户读作「撤销没反应」。 */
    wysPaintFromSrc();
    onChange(tx.before);                // undo 的凭据就是「要撤到的那份源码」
    const left = hist.depth;
    setToast({
      msg: "↩ 已撤销" + (tx.label ? "「" + tx.label + "」" : "") + (left ? "（还可撤 " + left + " 步）" : "（到底了）"),
      undo: left > 0,
    });
    return true;
  }
  function redoWys() {
    /* 有没落地的打字：先落地（落盘 = 新事务入栈，redo 链按标准语义作废）。
     * 落完多半已无可重做 → 返回 false，commitWys 的「已写回」提示还在，不误报。 */
    wysCommitPending();
    const hist = wysHist();
    const tx = hist.redo();
    if (!tx) return false;
    wysHistOp.current = true;
    /* v0.8.23：重做与撤销同一条路 —— 源码整份换过，DOM 里的字必须跟着换（旗子一漏，
     * 用户按重做只看到「没反应」）。 */
    wysPaintFromSrc();
    onChange(tx.after);
    setToast({
      msg: "↪ 已重做" + (tx.label ? "「" + tx.label + "」" : "") + (hist.future ? "（还可重做 " + hist.future + " 步）" : "（到头了）"),
      undo: true,
    });
    return true;
  }
  /* 撤不动时说清楚「为什么」—— 「已经撤到底了」与「这一档压根还没有历史」是两件事，
   * 混在一句里，刚打完字的用户只会读成「我白打了」（这正是用户报上来的那句）。 */
  function wysNoUndoMsg() {
    const hist = wysHist();
    if (hist.canRedo()) return "↩ 已经撤到这一步了，没有更早的改动（Ctrl+Y 可以往回来）";
    /* v0.8.20：先分清「这一档还没有历史」与「刚敲的字根本不在块里」。
     * 后者说「预览层还没有记下任何改动」是错的 —— 它记过，是那些字没有归属。
     * 混在一句里，用户只会读成「我白打了」（这正是用户报上来的那句）。 */
    let orph = [];
    try { orph = wysOrphanNodes(pvRef.current); } catch (e) { orph = []; }
    if (orph.length) return "⚠ 刚敲的字不在任何正文块里（落在块与块之间的空隙 / 页首那种只读渲染上），撤销链里没有它 —— 撤销前会先把它并进最近的正文块；要改正文，请点进正文里写";
    return "⚠ 预览档没有可撤销的改动 —— 预览层还没有记下任何改动（打字 / 就地写回 / Ctrl+1..5 都会记进来）。在源码档里敲的字由源码档自己撤（那边 Ctrl+Z）";
  }
  function wysNoRedoMsg() {
    const hist = wysHist();
    if (hist.canUndo()) return "↪ 已经是最新一步了，没有可重做的（Ctrl+Z 可以往回撤）";
    return "⚠ 预览档没有可重做的改动 —— 先撤销一步，或在预览层里改点东西";
  }

  function onWysFocusIn() { wysEditing.current = true; }
  function onWysFocusOut(e) {
    /* React 的 onBlur = focusout（冒泡）：焦点仍在层内就不算离开 */
    if (e.currentTarget && e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return;
    wysEditing.current = false;
    commitWysSession();
  }

  /* v0.8.8：主动收尾「就地编辑」相位 —— 复位 + 把改动落盘。
   * 与 onWysFocusOut 做的是同一件事，区别在**不依赖焦点事件**：
   *   · Ctrl+/ 换档是键盘事件，焦点压根不动 → 不会有 focusout；
   *   · 预览层是被**卸载**掉的（切到源码档）→ 卸载也不产生 focusout。
   * 不收尾的后果有两个，用户都读成「切一下东西就丢了」：
   *   ① 相位留在 true → 回程新挂载的预览层被 paint 那道守卫饿死 → 整片空白；
   *   ② 相位为 true 时 commitWys() 直接早退 → 刚在预览里敲的字没写回文件。 */
  function leavePreview() {
    if (!wysEditing.current) return;
    wysEditing.current = false;
    commitWysSession();
  }

  /* Enter = 块内换行（段内续行，合法 LaTeX）；不引入 <div> 污染块结构 */
  function onWysKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      commitWysSession();
      if (onSave) { try { onSave(); setSavedTick(Date.now()); } catch (e2) {} }
      return;
    }
    /* v0.8.15：预览层的撤销 / 重做走源码级栈（v0.8.18 起换成 TX.History），
     * 提示条 ↩ 与 Ctrl+Z 同一条通路。contenteditable 的原生 Ctrl+Z 回退的是
     * React 重渲染**前**的 DOM 快照 —— 放行一次 DOM 就与源码脱节，焦点一走
     * commitWys 把陈旧文本盖回源码（v0.8.14 实测事故），所以这里必须拦。
     * 没得撤 ≠ 出错：撤不动时把「到底了」与「这一档还没有历史」分开说清楚。 */
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")) {
      e.preventDefault();
      if (e.shiftKey || e.key.toLowerCase() === "y") {
        if (!redoWys()) setToast({ msg: wysNoRedoMsg() });
        return;
      }
      if (!undoWys()) setToast({ msg: wysNoUndoMsg() });
      return;
    }
    /* v0.8.27：回车 = **新建段落**，段内换行改用 Shift+回车。
     * 用户原话：「把回车改成新建段落：回车落一个空行 = 新段落，段内换行改用 Shift+Enter」。
     * 两个动作对调，落点仍由我们定死（v0.8.26 立下的规矩：不许再赌浏览器 / execCommand）：
     *   Enter       → 插**两个** <br> = 一个空行 = 一个**新段落**
     *   Shift+Enter → 插**一个** <br> = 单换行（LaTeX 里就是空格）= **段内续行**
     * LaTeX 的规矩本来就是「空行才分段、单换行只是空格」；以前回车是段内换行、想分段得
     * 连按两下（还得知道 LaTeX 这条规矩才猜得到），与所有人的手感都反着。 */
    if (e.key === "Enter" && !e.altKey && !e.metaKey) {
      /* ⚠ 只认**裸回车**与 Shift+回车：Alt/Cmd+回车 不是我们的（那是别的意思，
       * 旧实现一并吞掉，一并吞掉就是「越界」—— [13] 层那条「不越界」现在由它来钉）。 */
      /* v0.8.26：组字中的回车是「确认候选词」，不是「换行」。
       * 中文输入法下 Chromium 会把这一下 keydown 派到页面上（keyCode 229 / isComposing），
       * 我们的回车分支正好会 preventDefault + 插 <br> —— 用户读作「打个字按回车，
       * 行被换了、候选词也没了」（同一条 guard 也用在实时同步那侧，见 onWysInput）。 */
      if (e.isComposing || e.keyCode === 229) return;
      e.preventDefault();          // 交给我们：不接管的话浏览器会自己插 <div> / <br>
      /* v0.8.26：不再走 document.execCommand("insertHTML", false, "<br>")。三条理由：
       *   ① 它是**命令式**的：光标最后落在 <br> 前还是后由实现说了算 ——
       *      用户按回车看到的就是「光标没到新行 / 有时又跳回去」，这就是「不丝滑」的来源之一；
       *   ② 它顺手把原生撤销栈当「粘贴」处理（v0.8.15 拦过的同一条路）；
       *   ③ jsdom 里根本没有 execCommand —— 这条路 23 层门禁**一次都没跑过**，
       *      于是「段末按回车会在源码里长出空行」（见 wysBlockTex）这种错一直没人问。
       * 现在自己动 Range：插 <br>、光标显式 setStartAfter、再自己喊一声实时同步。 */
      if (e.shiftKey) { if (insertSoftBreak()) queueWysLive(); return; }   // 段内换行
      if (insertParaBreak()) queueWysLive();                                // 新建段落
      return;
    }
  }

  /* v0.8.26：光标处插一个 <br>（段内换行，合法 LaTeX），光标停在它后面 —— 由我们定死，
   * 不交给浏览器猜。返回 true = 真的插了（调用方据此决定要不要喊同步）。
   * 只认那个唯一的编辑宿主（.wys-editroot）：光标落在**只读孤岛**上（原子卡片的渲染结果 /
   * 结构块 / 标题编号）时一个字都不许动 —— 那儿的 DOM 是渲染结果，塞一个 <br> 就是敲坏它。
   * 光标压根不在预览层里（人在宿主搜索框里）同样什么都不做：回车不是我们的。 */
  function insertSoftBreak() {
    try {
      const sel = (typeof window !== "undefined" && window.getSelection) ? window.getSelection() : null;
      if (!sel || !sel.rangeCount) return false;
      const range = sel.getRangeAt(0);
      if (!range || !range.startContainer) return false;
      const start = range.startContainer;
      let el = start.nodeType === 1 ? start : start.parentNode;
      while (el && el.nodeType === 1) {
        if (el.getAttribute && el.getAttribute("contenteditable") === "false") return false;
        if (el.classList && el.classList.contains("wys-editroot")) break;
        el = el.parentNode;
      }
      if (!el || !el.classList || !el.classList.contains("wys-editroot")) return false;
      const doc = start.ownerDocument || (typeof document !== "undefined" ? document : null);
      if (!doc || !doc.createElement) return false;
      if (range.collapsed === false && range.deleteContents) range.deleteContents();
      const br = doc.createElement("br");
      range.insertNode(br);
      /* v0.8.29：<br> 后面必须留一个零宽占位 —— 不然新起这条空行在 Chromium 里没有几何，
       * 光标算不出来（rect = 0,0,0,0），用户看到的就是「按了 Shift+Enter 光标不见了」。 */
      const zw1 = doc.createTextNode(WYS_ZWSP);
      if (br.parentNode) br.parentNode.insertBefore(zw1, br.nextSibling);
      range.setStart(zw1, 1);      // 落点自己定：占位里面 = 新起那一行的行首
      range.collapse(true);
      if (sel.removeAllRanges) sel.removeAllRanges();
      if (sel.addRange) sel.addRange(range);
      return true;
    } catch (err) { return false; }
  }

  /* v0.8.27：光标处插**两个** <br> = 一个空行 = 新起一个段落，光标停在新段落的行首。
   * 与 insertSoftBreak 共用同一套护栏，只有「插几个」不同：
   *   · 只认那个唯一的编辑宿主（.wys-editroot）—— 只读孤岛（原子卡片的渲染结果 / 结构块 /
   *     标题编号）上一个字都不许动：那儿的 DOM 是渲染结果，塞一个 <br> 就是敲坏它；
   *   · 光标压根不在预览层里（人在宿主搜索框里）同样什么都不做：回车不是我们的；
   *   · 已经站在一条空段落上（左边紧挨着两个 <br>）就不再补 —— LaTeX 里**空段落不存在**，
   *     再补只会往源码里多塞空行（左栏眼看着变花，就是 v0.8.26 收拾掉的那条老毛病）。
   * ⚠ 为什么不直接往源码里插一个空行：空行**不是块**（parseDoc 把空行排除在块外），
   *   插完光标无处可落，用户看到的是一行空气 —— 那是个假动作。
   *   DOM 里这两个 <br> 既是落脚点、也是可读回的内容：块级读回把它读成 "\n\n"，
   *   再吃掉段末那一个落脚换行（wysBlockTex），落盘就是**恰好一个空行** = 恰好一个新段落。
   * 与「¶ 新段落」按钮同一个数（那个按钮是鼠标入口，这里是键盘入口）。 */
  function insertParaBreak() {
    try {
      const sel = (typeof window !== "undefined" && window.getSelection) ? window.getSelection() : null;
      if (!sel || !sel.rangeCount) return false;
      const range = sel.getRangeAt(0);
      if (!range || !range.startContainer) return false;
      const start = range.startContainer;
      let el = start.nodeType === 1 ? start : start.parentNode;
      while (el && el.nodeType === 1) {
        if (el.getAttribute && el.getAttribute("contenteditable") === "false") return false;
        if (el.classList && el.classList.contains("wys-editroot")) break;
        el = el.parentNode;
      }
      if (!el || !el.classList || !el.classList.contains("wys-editroot")) return false;
      const doc = start.ownerDocument || (typeof document !== "undefined" ? document : null);
      if (!doc || !doc.createElement) return false;
      if (range.collapsed === false && range.deleteContents) range.deleteContents();
      if (wysCaretOnEmptyLine(range)) return false;   // 已经在空段落上，再补就是往源码里多塞空行
      const br = doc.createElement("br");
      range.insertNode(br);
      /* v0.8.29：两条空落脚行各配一个零宽占位（理由见 wysEnsureLandingLine 的长注释）。
       * 少了它们：中间那条空行点不出光标，最末那条（**回车后光标就停在这儿**）也画不出光标
       * —— 用户读作「按了回车光标没了 / 点块末尾没光标」。 */
      const zw1 = doc.createTextNode(WYS_ZWSP);
      if (br.parentNode) br.parentNode.insertBefore(zw1, br.nextSibling);
      range.setStart(zw1, 1);      // 落点自己定：第一个 <br> 之后（占位里面）
      const br2 = doc.createElement("br");
      range.insertNode(br2);
      const zw2 = doc.createTextNode(WYS_ZWSP);
      if (br2.parentNode) br2.parentNode.insertBefore(zw2, br2.nextSibling);
      range.setStart(zw2, 1);      // 新段落的行首（按了回车光标就该停在这儿）
      range.collapse(true);
      if (sel.removeAllRanges) sel.removeAllRanges();
      if (sel.addRange) sel.addRange(range);
      return true;
    } catch (err) { return false; }
  }

  /* v0.8.27：光标左边紧挨着的是不是**两个** <br>（= 已经站在一条空段落上了）。
   * 只看紧挨着的那两个节点：用户一旦挪过光标，这个判据自然失效 —— 那时插就对了。 */
  function wysCaretOnEmptyLine(range) {
    try {
      if (!range || !range.collapsed) return false;
      const c = range.startContainer;
      const off = range.startOffset | 0;
      const isBr = function (n) { return !!(n && n.nodeType === 1 && n.tagName && n.tagName.toLowerCase() === "br"); };
      /* v0.8.29：占位（零宽字符）不算节点 —— 落脚行现在每行都带一个，判据必须跳过它们，
       * 否则「已经站在空段落上」永远判不出来（回车会一直往源码里堆空行）。
       * 两种落点都要认得出：光标停在容器里（老的写法）、停在占位**里面**（v0.8.29 之后
       * 回车就落在这儿 —— 占位是一格的文本节点，offset 为 1）。 */
      const isZw = function (n) {
        return !!(n && n.nodeType === 3 && String(n.nodeValue) === WYS_ZWSP);
      };
      let anchor = null;
      if (c && c.nodeType === 3) {
        if (isZw(c)) anchor = c;                     // 光标在占位里面（回车之后就是这儿）
        else if (off === 0) anchor = c;              // 光标在这个文本节点之前
        else return false;                           // 光标停在字中间：左边是字，不是空行
      } else if (c && c.nodeType === 1) {
        anchor = c.childNodes[off - 1] || null;
      } else {
        return false;
      }
      /* 从 anchor 往前跳过占位，取最近的两个实义节点 */
      const two = [];
      for (let n = anchor; n && two.length < 2; n = n.previousSibling) {
        if (isZw(n)) continue;
        two.push(n);
      }
      return two.length === 2 && isBr(two[0]) && isBr(two[1]);
    } catch (e) { return false; }
  }

  /* 粘贴只收纯文本：HTML 富文本进 .tex 源码就是灾难 */
  function onWysPaste(e) {
    e.preventDefault();
    let t = "";
    try { t = (e.clipboardData || window.clipboardData).getData("text/plain") || ""; } catch (e2) {}
    if (t) { try { document.execCommand("insertText", false, t); } catch (e3) {} }
  }

  /* ---------- 面板桥：把「当前活动 .tex」广播给拿不到 filePath 的面板 ---------- */
  useEffect(() => {
    const owner = {}; // 本次挂载的归属令牌：ping 应答与卸载清场都认它
    const broadcast = () => announceActiveFile(filePath, fileName, owner);
    broadcast();
    window.addEventListener(LATEX_PING, broadcast);
    return () => {
      window.removeEventListener(LATEX_PING, broadcast);
      retractActiveFile(owner);
    };
  }, [filePath, fileName]);

  /* ---------- 光标广播：面板靠它高亮"我正在写哪一节" ---------- */
  useEffect(() => {
    const push = () => {
      try {
        window.dispatchEvent(new CustomEvent(LATEX_CURSOR, { detail: { path: filePath || "", line: cursor.line, col: cursor.col } }));
      } catch (e) {}
    };
    push();
    window.addEventListener(LATEX_CURSOR_PING, push);
    return () => window.removeEventListener(LATEX_CURSOR_PING, push);
  }, [cursor.line, cursor.col, filePath]);

  /* ---------- 状态栏（v0.6.2 新贡献面：props.setStatus） ----------
   * 宿主契约（装机版 PluginEditorHost / usePluginEditorStatusStore）：
   *   setStatus([{ id, text, title? }])  —— 只收数组；MAX_ITEMS=6 / MAX_TEXT=80 由宿主截断；
   *   按 id+text+title 去重，内容不变不重渲；组件卸载宿主自动 clear(ownerId)。
   * ⚠ ownerId 按「编辑器贡献」记账而不是按文件：多开 .tex 会互相盖，
   *   所以只在「本实例是当前活动编辑器」时才推（活动身份复用本插件已有的活动文件桥）。
   */
  const [isActiveEditor, setIsActiveEditor] = useState(true);
  useEffect(() => {
    function onActive(e) {
      const p = String((e && e.detail && e.detail.path) || "");
      setIsActiveEditor(!p || !filePath || sameAsFile(p));
    }
    window.addEventListener(LATEX_EV, onActive);
    return () => window.removeEventListener(LATEX_EV, onActive);
  }, [filePath]);

  /* 本地统计：状态栏每键都要更新，绝不能挂 MCP 往返 */
  const stats = useMemo(() => {
    const lines = content.split("\n");
    let sec = 0, eq = 0, fig = 0, tab = 0, cite = 0;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/^\s*%/.test(l)) continue;
      if (/\\(part|chapter|section|subsection|subsubsection)\*?\s*\{/.test(l)) sec++;
      if (/\\begin\{(equation|align|gather|eqnarray|multline|displaymath)\*?\}/.test(l)) eq++;
      if (/\\begin\{figure\*?\}/.test(l)) fig++;
      if (/\\begin\{table\*?\}/.test(l)) tab++;
      if (/\\cite[a-zA-Z]*\s*\{/.test(l)) {
        const hits = l.match(/\\cite[a-zA-Z]*\s*\{[^}]*\}/g) || [];
        for (let k = 0; k < hits.length; k++) cite += hits[k].replace(/^[^{]*\{|\}$/g, "").split(",").filter(Boolean).length;
      }
    }
    return { sec: sec, eq: eq, fig: fig, tab: tab, cite: cite, words: countWords(content).total };
  }, [content]);

  useEffect(() => {
    if (typeof props.setStatus !== "function") return;
    if (!isActiveEditor) return; // 非活动实例保持沉默：宿主只认一个 owner，抢着推只会互相盖
    const items = [
      { id: "sec", text: "📑 " + stats.sec + " 节", title: "章节数（\\part / \\chapter / \\section / \\subsection / \\subsubsection）" },
      { id: "env", text: "∑" + stats.eq + " · 图" + stats.fig + " · 表" + stats.tab, title: "公式 / 图 / 表环境数" },
      { id: "cite", text: "🔖 " + stats.cite + " · ≈" + stats.words + " 字", title: "\\cite 引用数 · 近似字数（CJK 字 + 英文词）" },
    ];
    /* v0.8.2：不再推「待办」。这里只数本文件的注释，而且只展示、点不动；
     * 左侧「章节大纲」面板已经用 MCP latex_parse 的 todos 把 TODO/FIXME 做成
     * 可点击的树节点（点一下直接跳到那一行）。同一件事说两遍，留下的该是能用的那个。 */
    if (issues && issues.summary) {
      const sm = issues.summary;
      items.push({
        id: "issue",
        text: (sm.errors + sm.warnings > 0 ? "⚠ " : "✅ ") + sm.errors + " 错 / " + sm.warnings + " 警",
        title: "引用校验结果（点工具栏「校验」刷新）",
      });
    }
    /* v0.8.2：不再往宿主状态栏塞「Ln / Col」。
     * 编辑器自己的底栏已经常驻显示光标位置，两处读的是同一份 cursor state，
     * 值必然相等 —— 上下并排就是同一个数字说两遍。
     *
     * 顺带把 cursor.line / cursor.col 从依赖数组摘掉：光标每动一格都会重跑这个 effect，
     * 推的内容却一字未变。宿主按 id+text+title 去重不会重渲，但每次按键白跑一趟 setStatus
     * 没有意义。现在只在 stats / issues / 视图真的变了才推。
     *
     * items 是**优先级数组**：越靠前越重要，满了先丢后面的（宿主另有 MAX_ITEMS=6）。
     * 摘掉 pos 后最多 4 条（sec / env / cite / issue?），离截断边界还有余量。
     * ⚠ 以后再加条目请往**前**放；直接 append 在末尾，一旦超过 6 条会被静默丢弃。 */
    try { props.setStatus(items.slice(0, 6)); } catch (e) {}
  }, [stats, issues, isActiveEditor, props.setStatus, view]);

  /* ---------- 行定位：面板点一行 -> 本编辑器滚过去 + 闪一下 + 回执 ---------- */
  useEffect(() => {
    function onReveal(e) {
      const d = (e && e.detail) || {};
      const target = String(d.path || "");
      if (target && !sameAsFile(target)) return; // 不是本文件，留给对应的编辑器实例
      const ln = Math.max(1, Number(d.line) || 1);
      const ok = gotoLineRef.current ? gotoLineRef.current(ln, { ack: { nonce: d.nonce || "" } }) : false;
      // v0.6.1：跳不成（可视化视图下 textarea 还没挂载）不回 ACK —— 回早了会让面板的兜底
      //（打开文件 + 重发）失效，用户就成了「点了没反应」。当拍跳成由这里回执，补跳成由 flush 补发。
      if (!ok) return;
      ackReveal(ln, d.nonce);
    }
    window.addEventListener(LATEX_REVEAL, onReveal);
    return () => window.removeEventListener(LATEX_REVEAL, onReveal);
  }, [filePath]);

  /* gotoLine 每次渲染都是新闭包，用 ref 保持监听里拿到的是最新那份 */
  useEffect(() => { gotoLineRef.current = gotoLine; });

  /* 补跳：视图切过去 / textarea 挂载之后的那一拍，把 pendingReveal 兑现（并补回执）。
   * 无 deps = 每拍都试；DOM 还没就绪就下次再试，pendingReveal 为空时立刻返回。 */
  useEffect(() => {
    const p = pendingReveal.current;
    if (!p || !taRef.current) return;
    pendingReveal.current = null;
    gotoLineRef.current(p.ln, { flash: p.flash, source: !!p.source });
    if (p.ack) ackReveal(p.ln, p.ack.nonce);
  });

  /* ---------- 宿主内置大纲点击 → 定位 ----------
   * 契约（docs §3.7）：editors[].outlineTool 声明的工具喂给宿主大纲面板，
   * 用户点条目 → 编辑器收到 notrat-outline-navigate，detail={pluginId,editorId,anchor,item}。
   * 与自家面板的 LATEX_REVEAL 通路并存（老宿主不发这个事件，监听空转无害）。
   */
  useEffect(() => {
    function onHostOutline(e) {
      const d = (e && e.detail) || {};
      if (d.pluginId && d.pluginId !== pluginId) return; // 别的插件的大纲，不接
      /* 不按 d.editorId 过滤：宿主传的是注册表 id（plugin-editor:<贡献key>），不是 manifest 里的
       * "latex-editor" —— 早先按字面量比过，会把自家事件全挡在门外，别再加回来。
       * pluginId 这一层已经足够：宿主大纲只在「本编辑器接管当前文件」时才用我们的条目。 */
      const ln = resolveOutlineLine(d, content);
      if (!ln) {
        setToast({ msg: "⚠ 这条大纲没能定位到源码行（锚点不是行号，标题也没匹配上）" });
        return;
      }
      if (!gotoLineRef.current) return;
      gotoLineRef.current(ln);
    }
    window.addEventListener("notrat-outline-navigate", onHostOutline);
    return () => window.removeEventListener("notrat-outline-navigate", onHostOutline);
  }, [pluginId, content]);

  /* ---------- MCP 工具通路 ---------- */
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const api = window.electronAPI;
        if (!api || !api.mcp || !api.mcp.listActiveServers) return;
        const servers = await api.mcp.listActiveServers();
        const mine = (servers || []).find(
          (s) => s && typeof s.id === "string" && s.id.indexOf("plugin-" + pluginId + "-") === 0
        );
        if (!dead && mine) setServerId(mine.id);
      } catch (e) {}
    })();
    return () => { dead = true; };
  }, []);

  async function callTool(tool, args) {
    const api = window.electronAPI;
    if (!api || !api.mcp || !api.mcp.callTool) throw new Error("宿主 MCP 通道不可用");
    const sid = serverId || "plugin-" + pluginId + "-latex";
    const r = await api.mcp.callTool(sid, tool, args);
    if (!r || r.success === false) throw new Error((r && r.error) || "工具调用失败");
    return ((r.result && r.result.content) || []).map((c) => c.text).join("\n");
  }

  /* ---------- v0.8.5：首屏探测 TeX 引擎 ----------
   * 为什么探测挂在这里，而不是「插件启用时」：插件没有生命周期钩子（manifest 的
   * contributions 里没有 activate/main），宿主也不转发 MCP 的 notifications ——
   * 服务端就算探到了，也没有通道说给界面听。编辑器挂载（= 第一次打开 .tex）是这个
   * 契约下唯一能主动开口的时机。
   * 只在**没引擎**时提示，且只提示一次：同一实例用 ref 占位（切档 / 重渲不再问一遍），
   * 跨会话由服务端状态文件记账（用户点过「知道了」就不再弹）。
   * 提示条刻意不做成常驻控件 —— 跟底栏「有结果才出现」同一条原则（v0.8.4 刚精简过工具栏）。 */
  useEffect(() => {
    if (!serverId || engineProbedRef.current) return;
    engineProbedRef.current = true;   // 先占位：一个实例只探一次
    let dead = false;
    (async () => {
      try {
        const info = JSON.parse(await callTool("latex_env", {}));
        if (dead || !info || info.ok || info.ack) return;   // 有引擎 / 已提示过 → 不打扰
        setEngineNote(info);
      } catch (e) {}   // 老版 server 没这个工具 / 通道不可用：当作没事，绝不因此报错
    })();
    return () => { dead = true; };
  }, [serverId]);

  /* 关掉提示条 = 记住「这台机器上别再弹」。ack 失败也无所谓：最坏下次再提示一遍。 */
  function dismissEngineNote() {
    setEngineNote(null);
    try { callTool("latex_env", { action: "ack" }); } catch (e) {}
  }

  /* 刚装完引擎的人会点这个：清服务端缓存重探一次，成了就撤掉提示条并回一句。 */
  async function recheckEngine() {
    setBusy("env");
    try {
      const info = JSON.parse(await callTool("latex_env", { action: "reset" }));
      if (info && info.ok) {
        setEngineNote(null);
        setToast({ msg: "✅ 已检测到 TeX 引擎：" + info.engine });
      } else {
        setEngineNote(info);
        setToast({ msg: "仍未检测到 TeX 引擎" });
      }
    } catch (e) {
      setToast({ msg: "重新检测失败：" + String(e.message || e) });
    } finally { setBusy(""); }
  }

  async function doCompile() {
    /* 编译读的是磁盘文件：先提交 + 保存，别拿旧文件糊弄用户 */
    const pendingC = commitWysSession();
    if (pendingC != null && onSave) { try { onSave(); } catch (e0) {} }
    setBusy("compile"); setErr(""); setBottomTab("compile"); setBottomOpen(true);
    try { setCompileOut(await callTool("latex_compile", { path: filePath })); }
    catch (e) { setErr(String(e.message || e)); }
    finally { setBusy(""); }
  }

  async function doValidate() {
    const pendingV = commitWysSession();
    if (pendingV != null && onSave) { try { onSave(); } catch (e0) {} }
    setBusy("validate"); setErr(""); setBottomTab("issues"); setBottomOpen(true);
    try {
      const out = await callTool("latex_validate", { path: filePath, format: "json" });
      setIssues(JSON.parse(out));
    } catch (e) { setErr(String(e.message || e)); }
    finally { setBusy(""); }
  }

  /* ---------- 导出（v0.8.4）：PDF / 自包含 HTML，并给出预览入口 ---------- */
  function baseName(p) {
    const t = String(p || "");
    const i = Math.max(t.lastIndexOf("/"), t.lastIndexOf("\\"));
    return i >= 0 ? t.slice(i + 1) : t;
  }
  function fmtSize(n) {
    const b = Number(n) || 0;
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
    return (b / 1024 / 1024).toFixed(2) + " MB";
  }
  function imgCount(info) {
    return info && info.images && info.images.inlined ? info.images.inlined : 0;
  }
  /* 文档标题：写进导出页的 <title>（服务端还有一层 \title{} 兜底） */
  function docTitle() {
    const m = /\\title\s*(?:\[[^\]]*\])?\s*\{([^{}]*)\}/.exec(content || "");
    return m ? m[1].replace(/\\[a-zA-Z]+\s*/g, "").trim() : "";
  }
  /* 预览：交给宿主打开产物（.pdf 内置阅读器 / .html 内置预览器）——
   * 同一份文件，所以「看到的」就是「导出的」，不会两处不同步。 */
  function openInHost(p) {
    if (!p) return;
    try {
      window.dispatchEvent(new CustomEvent("notrat-open-file", { detail: { path: p } }));
      setToast({ msg: "👁 已在 Notrat 中打开 " + baseName(p) });
    } catch (e) {
      setToast({ msg: "⚠ 打不开预览：用结果条里的「📋 复制路径」手动打开" });
    }
  }
  async function copyPath() {
    const p = exportInfo && exportInfo.outPath;
    if (!p) return;
    try {
      await navigator.clipboard.writeText(p);
      setToast({ msg: "📋 已复制产物路径" });
    } catch (e) {
      setToast({ msg: "⚠ 复制失败：" + p });
    }
  }
  /* 导出：先落盘（编译读的是磁盘文件，别拿旧内容糊弄用户）再调工具。
   * HTML 的正文用**编辑器这份**（KaTeX 已排版、含刚提交的就地编辑改动）；
   * 渲染不出来就不传 body，让服务端内核兜底（代价是公式退化为近似排版）。 */
  async function doExport(format, dest, opts) {
    const o = opts || {};
    const pending = commitWysSession();
    if (pending != null && onSave) { try { onSave(); } catch (e0) {} }
    setBusy("export"); setErr("");
    try {
      const a = { path: filePath, format: format, dest: dest || "same" };
      if (o.force) a.force = true;
      if (format === "html") {
        try {
          if (typeof LPC !== "undefined" && LPC && typeof LPC.renderPreview === "function") {
            a.body = LPC.renderPreview(content, { renderMath: renderMath, baseDir: baseDir }).html;
            const t = docTitle();
            if (t) a.title = t;
          }
        } catch (e1) { /* 交给服务端 */ }
      }
      const out = JSON.parse(await callTool("latex_export", a));
      setExportInfo(out);
      setBottomTab("export"); setBottomOpen(true);
      if (out && out.ok) setToast({ msg: "✅ 已导出 " + baseName(out.outPath) + "（" + fmtSize(out.bytes) + "）" });
      else setToast({ msg: "⚠ 导出未完成 —— 看底部「⬇ 导出」结果" });
      return out;
    } catch (e) {
      const msg = String((e && e.message) || e);
      setErr(msg);
      setExportInfo({ ok: false, format: format, message: msg });
      setBottomTab("export"); setBottomOpen(true);
      return null;
    } finally {
      setBusy("");
    }
  }
  /* 预览：已有产物直接开（不重编）；没有就先导一次再开 */
  async function doPreview(format) {
    let info = exportInfo && exportInfo.format === format && exportInfo.ok !== false ? exportInfo : null;
    if (!info) info = await doExport(format, "same");
    if (info && info.ok && info.outPath) openInHost(info.outPath);
    else setToast({ msg: "⚠ 还没有可预览的产物" });
  }

  /* ---------- KaTeX 资产加载（离线包；失败自动 miniMath 兜底） ---------- */
  useEffect(() => {
    if (!serverId || katexOkRef.current) return;
    let dead = false;
    (async () => {
      try {
        const out = await callTool("latex_asset", { name: "katex" });
        const a = JSON.parse(out);
        if (!a || !a.js || !a.css) return;
        if (!document.getElementById("katex-css-latex-plugin")) {
          const st = document.createElement("style");
          st.id = "katex-css-latex-plugin";
          st.textContent = a.css;
          document.head.appendChild(st);
        }
        new Function(a.js)();
        const k = window.katex;
        if (k && typeof k.renderToString === "function" && !dead) {
          katexOkRef.current = true;
          setKatexVer((v) => v + 1);
        }
      } catch (e) { /* CSP/离线 → miniMath 兜底 */ }
    })();
    return () => { dead = true; };
  }, [serverId]);

  /* ---------- 实时预览（baseDir 已上移到 wys 之前声明，避免 TDZ）---------- */


  /* 预览 / 富渲染卡片里的图片懒加载（走 MCP 读本地文件 → dataURI）。
   * v0.7.2：改成「每拍补一次还没排队的图」—— 就地编辑层里也有图（卡片是富渲染的），
   * 只在 pv.html 变化时跑会漏掉它们；拿到的 dataURI 进 assetCache，DOM 重建后同步命中。 */
  function loadAssetsIn(root) {
    if (!root || !serverId) return;
    const imgs = root.querySelectorAll("img[data-asset]:not([data-asset-queued])");
    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i];
      const p = img.getAttribute("data-asset");
      if (!p) continue;
      img.setAttribute("data-asset-queued", "1");   // 只排队一次，避免每拍重复发起
      if (assetCache.current.has(p)) { img.src = assetCache.current.get(p); continue; }
      callTool("latex_asset", { path: p }).then(function (out) {
        try {
          const a = JSON.parse(out);
          if (a && a.dataUri) { assetCache.current.set(p, a.dataUri); img.src = a.dataUri; return; }
        } catch (e) { /* fallthrough */ }
        degradeRasterImg(img);
      }).catch(function () { degradeRasterImg(img); });
    }
  }

  /* v0.9.0：栅格 img（data-raster，pdf/eps/无扩展名）转不出来 → 换回
   * 「编译 PDF 后可见」占位 div。普通 img 缺文件维持原样（不扩行为）。 */
  function degradeRasterImg(img) {
    if (!img || !img.parentNode || !img.hasAttribute("data-raster")) return;
    const d = document.createElement("div");
    d.className = "pv-imgna";
    d.textContent = "🖼 " + (img.getAttribute("alt") || "插图") + "（该格式不在预览中渲染，编译 PDF 后可见）";
    img.parentNode.replaceChild(d, img);
  }

  /* v0.9.1：子文件加载（latex_asset 的 .tex 文本通道）。
   * - pending 卡（没内容）：立刻取；失败 30s 冷却，不重复打 MCP
   * - 已加载卡（data-inc）：2s 新鲜度窗口，超时重校 —— 子文件改了 ≤2s+一拍就跟进
   * - in-flight 去重：同一文件同时只发一次；内容真变了才 bump incVer 重渲 */
  function loadInputsIn(root) {
    if (!root || !serverId) return;
    const now = Date.now();
    const els = root.querySelectorAll("[data-inc-pending],[data-inc]");
    for (let i = 0; i < els.length; i++) {
      const abs = els[i].getAttribute("data-inc-pending") || els[i].getAttribute("data-inc");
      if (!abs) continue;
      const hit = inputCache.current.get(abs);
      if (hit && now - hit.at < 2000) continue;
      if (incInflight.current.has(abs)) continue;
      if (!hit) {
        const f = incFail.current.get(abs);
        if (f && now - f < 30000) continue;
      }
      incInflight.current.set(abs, true);
      callTool("latex_asset", { path: abs }).then(function (out) {
        const a = JSON.parse(out);
        if (!a || typeof a.text !== "string") throw new Error("bad payload");
        const old = inputCache.current.get(abs);
        inputCache.current.set(abs, { content: a.text, mtime: a.mtime || 0, at: Date.now() });
        incFail.current.delete(abs);
        if (!old || old.content !== a.text) setIncVer(function (v) { return v + 1; });
      }).catch(function () { if (!hit) incFail.current.set(abs, Date.now()); }).then(function () { incInflight.current.delete(abs); });
    }
  }

  /* ---------- 就地编辑层 innerHTML 同步 ----------
   * 无 deps：每拍都试，靠 root.__latexHtml 做幂等守卫（省掉无谓的 DOM 重建）。
   * ⚠ wysEditing.current 为真时直接返回 —— 编辑期间 DOM 是权威，回写会把光标顶到开头。 */
  useEffect(() => {
    const root = pvRef.current;
    /* v0.8.8：预览没挂载 ⇒「DOM 就是权威」这个相位不可能成立（DOM 都没了），就地复位。
     *   这是「切到源码再切回来、正文一片空白」的根因：相位留在 true 时，下面那道守卫会让
     *   **新挂载**的预览节点永远等不到首次回写 —— 用户看到的是一个空壳。 */
    if (!root) {
      wysEditing.current = false;
      /* v0.8.25：预览层都没了，打字会话也就不存在了 —— 起点留着会在下一次收尾时
       * 补出一条跨了「预览卸载」的撤销步（基准还是旧源码），宁可少一步也不许错一步。 */
      wysLiveBase.current = null;
      return;
    }
    /* v0.8.25：外部改动（宿主 / 源码档 / 大纲 / 撤销）一到，实时同步的基准就得跟着走 ——
     * 否则下一笔还基于旧源码算，会把外部那次改动盖回去。 */
    if (wysOutSrc.current !== content) wysOutSrc.current = content;
    if (wysEditing.current) return;
    const html = wys.html;
    /* v0.8.21：两个标志**一律先消费**，不再读在幂等守卫里面 ——
     * 守卫一短路（下面这条修的就是这种情形），标志就留到下一拍，
     * 那一拍的外部改动会被误判成「本层自己写的」→ 历史不 rebase，静默错位。 */
    const selfEdit = wysSelfEdit.current;
    wysSelfEdit.current = false;
    const histOp = wysHistOp.current;
    wysHistOp.current = false;
    /* v0.8.21：幂等守卫不能只比 html 字符串，还得问「屏幕现在是照着哪份源码画的」。
     * 打字期间 DOM 是权威（本 effect 在 wysEditing 那一行就早退了），__latexHtml 与
     * wysDomSrc 都还是打字**前**那份；撤销把源码退回打字前 → html 与 __latexHtml
     * 恰好相等 → 旧版整段跳过：文件改回去了、屏幕没动（用户原话：已撤销但是没有效果）。
     * 更坏的是 DOM 里那份陈旧的打字还在 —— 下一次失焦就 commitWys 把它写回源码，
     * 撤销被静默吃掉（探针 .setup/_probe-undo-view.js ⑭⑮⑯ 三条全中）。
     * 台账语义：__latexHtml =「屏幕对应哪份 html」，wysDomSrc =「屏幕对应哪份源码」，
     * 两个都对上才敢不重建。 */
    if (root.__latexHtml !== html || wysDomSrc.current !== content) {
      root.__latexHtml = html;
      wysDomSrc.current = content;
      /* v0.8.12：这次 content 变化如果是**本层自己**提交上去的，DOM 已经是权威
       * （用户就是在这儿打的字），再拿 html 覆一遍只会把光标连同焦点一起铲掉 ——
       * 用户读作「每改一行就丢焦点」。只重拍原文快照，不重建。
       * 从别处来的改动（宿主 / 大纲 / 撤销 / 撤销重做）照旧重建 ——
       * 但重建前先把光标的位置记下来，建完接回去（见 wysCaretRestore）。 */
      /* v0.8.18：源码被别处改掉了（宿主 / 同步 / 源码档 / 大纲）——
       * 把历史**重映射**到新版本上，而不是整条清空。
       * 旧版这里是 `if (!selfEdit && !histOp) 清栈`：判的是「这拍谁写的」。
       * 预览层卸载重挂（切档来回、宿主重挂面板）也走进来，于是「字还在、历史没了」——
       * Ctrl+Z 只说「没有可撤销的改动」，用户读作「我明明刚打了字」。
       * 现在的判据是「源码真的变了没有」：没变（切档 / 重挂）就什么都不做，历史原样留着。 */
      const prevSrc = wysRenderedSrc.current;
      wysRenderedSrc.current = content;
      if (!histOp && prevSrc !== null && prevSrc !== content) {
        const h0 = wysHist();
        /* state 已经等于新内容 = 本层自己写上去的（selfEdit 那一拍）→ 不是外部改动 */
        if (h0.state() !== content) {
          const res = h0.rebase(prevSrc, content);
          /* 红线：gaps 必须被呈现。真冲突丢了步数就得说出来，不许静默变少。 */
          if (res.dropped) setToast({ msg: "⚠ " + h0.describeGaps() });
        }
      }
      const keepCaret = selfEdit ? null : wysCaretSnapshot(root);
      if (!selfEdit) root.innerHTML = html;
      /* 记下渲染时的原文：commit 靠它判断「这块到底动没动」 */
      const map = new Map();
      const blks = root.querySelectorAll(".wys-blk");
      for (let i = 0; i < blks.length; i++) {
        const p = blks[i].querySelector(".wys-edit");
        /* v0.8.26：台账与上面两个读回点同一把尺子（否则「段末一个 <br>」会被算成改动） */
        map.set(blks[i].getAttribute("data-bid"), p ? wysBlockTex(p) : "");
      }
      wysOrigRef.current = map;
      /* 重建把光标铲平了 → 接回原来那一块的原来位置。没有这一步，
       * 凡是「结构性」的动作（Ctrl+1 改层级、宿主改内容、撤销）都会让用户重新点一遍。 */
      if (!selfEdit && keepCaret) wysCaretRestore(root, keepCaret);
      /* 就地编辑器开着时，DOM 一重建，原来那个节点就成了孤儿。
       * 按稳定 key 把新节点找回来重新标出来 —— 否则「我正在改这一项」的高亮会凭空消失。 */
      if (atomEdit && atomEdit.key) {
        const again = root.querySelector('[data-fk="' + atomEdit.key + '"], [data-key="' + atomEdit.key + '"]');
        if (again) pickAtom(again);
      }
    }
    /* 图每拍补一次：富渲染的卡片里也会有 img[data-asset] */
    loadAssetsIn(root);
    /* v0.9.1：子文件卡片每拍补一次（缓存/冷却在 loadInputsIn 内部把关，不会打爆 MCP） */
    loadInputsIn(root);
  });

  /* ---------- 划词引用到 Sidebar ---------- */
  /* 引用气泡出现期间：点击气泡外 / 按 Esc 关闭 */
  useEffect(() => {
    if (!quote) return;
    const onDown = (e) => {
      if (bubbleRef.current && !bubbleRef.current.contains(e.target)) setQuote(null);
    };
    const onKey = (e) => { if (e.key === "Escape") setQuote(null); };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [quote]);

  /* 「＋ 插入」菜单：点别处 / Esc 关掉 */
  useEffect(() => {
    if (!menu) return;
    function onDown(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false); }
    function onKey(e) { if (e.key === "Escape") setMenu(false); }
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  /* toast 自动消失 */
  /* 「⬇ 导出」菜单：点别处 / Esc 关掉 */
  useEffect(() => {
    if (!exMenu) return;
    function onDown(e) { if (exMenuRef.current && !exMenuRef.current.contains(e.target)) setExMenu(false); }
    function onKey(e) { if (e.key === "Escape") setExMenu(false); }
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [exMenu]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 9000 : 2600);
    return () => clearTimeout(t);
  }, [toast]);

  function lineAt(off) {
    return content.slice(0, off).split("\n").length;
  }

  /* 源码区：鼠标划选 */
  function captureSrcQuote(e) {
    const ta = taRef.current; if (!ta) return;
    const s = ta.selectionStart, en = ta.selectionEnd;
    if (s === en) { setQuote(null); return; }
    const text = content.slice(s, en);
    if (!text.trim()) { setQuote(null); return; }
    const pos = clampPos(e.clientX, e.clientY);
    setQuote({ text: text, lineFrom: lineAt(s), lineTo: lineAt(en), x: pos.x, y: pos.y });
  }

  /* 源码区：键盘划选（shift+方向键）——气泡放在源码面板右上 */
  function captureSrcQuoteKb() {
    const ta = taRef.current; if (!ta) return;
    const s = ta.selectionStart, en = ta.selectionEnd;
    if (s === en) { setQuote(null); return; }
    const text = content.slice(s, en);
    if (!text.trim()) { setQuote(null); return; }
    const rect = ta.getBoundingClientRect();
    const pos = clampPos(rect.right - 200, rect.top + 30);
    setQuote({ text: text, lineFrom: lineAt(s), lineTo: lineAt(en), x: pos.x, y: pos.y });
  }

  /* 预览区：划选（行号取选区两端最近的 data-line 块锚点） */
  function capturePvQuote() {
    let sel = null;
    try { sel = window.getSelection(); } catch (e) {}
    const text = sel ? String(sel) : "";
    if (!text.trim()) { setQuote(null); return; }
    let a = null, b = null;
    if (sel) { a = nodeLine(sel.anchorNode); b = nodeLine(sel.focusNode); }
    const lo = (a != null && b != null) ? Math.min(a, b) : (a != null ? a : b);
    const hi = (a != null && b != null) ? Math.max(a, b) : (a != null ? a : b);
    let pos = { x: 100, y: 100 };
    try { pos = clampPos(window.event ? window.event.clientX : 100, window.event ? window.event.clientY : 100); } catch (e) {}
    setQuote({ text: text, lineFrom: lo, lineTo: hi, x: pos.x, y: pos.y });
  }

  /* 投递：优先宿主第一方通道（与宿主自家编辑器同一事件 → 侧栏紫色引用卡片），侧栏未开则降级剪贴板 */
  async function doQuote() {
    const q = quote; if (!q) return;
    setQuote(null);
    const detail = {
      text: q.text,
      source: fileName || "LaTeX 选段",
      filePath: filePath || "",
      lineFrom: q.lineFrom,
      lineTo: q.lineTo,
    };
    try {
      const composer = document.querySelector("[data-sidebar-composer]");
      if (composer) {
        window.dispatchEvent(new CustomEvent("notrat-quote-to-chat", { detail: detail }));
        setToast({ msg: "✓ 已引用到 AI 对话（见侧栏引用卡片）" });
        return;
      }
    } catch (e) {}
    try {
      await navigator.clipboard.writeText(q.text);
      setToast({ msg: "📋 侧栏未打开，选中文本已复制到剪贴板" });
    } catch (e) {
      setToast({ msg: "⚠ 引用失败：" + String((e && e.message) || e) });
    }
  }

  /* ---------- 编辑行为 ---------- */
  /* v0.8.6：把「就地改这几个字」和「按快捷键」收敛到同一处 —— 两者都是
   * 「换掉选区那段文本，再把光标放到该去的地方」，区别只是文本从哪来。 */

  /** 写回源码 + 安排光标落点（格式快捷键与章节层级的唯一出口）。
   *  v0.8.7：内容「改了等于没改」时**不要**走 onChange —— React 对同一个字符串会 bail out，
   *  依赖 [content] 的回填 effect 也就不会跑，光标留在原地，用户看到的是「按了没反应」。
   *  这种当拍直接把光标放好（在已是 \section{} 的行上再按 Ctrl+1 走的就是这条路）。 */
  function writeSrc(next, caret) {
    if (next === content) {
      const ta = taRef.current;
      if (ta) { ta.focus(); try { ta.setSelectionRange(caret, caret); } catch (e) {} }
      return;
    }
    onChange(next);
    pendingRange.current = [caret, caret];
  }

  /** 章节层级：有选区包住；没选区改当前整行。原本已是章节命令 → 只换层级、保留标题。
   *  v0.8.7 修三处（全部有探针复现，见 .setup/_probe-interact.js）：
   *   ① 行尾注释先剥出来、原样放回 —— 否则 HEAD_RE 的 \s*$ 匹配不上，整行（含注释）
   *      会被当成标题包进去：`\section{\subsection{模型结构} % TODO: 改名}`；
   *   ② 以 \ 开头却不是章节命令的行（\documentclass / \usepackage / \begin）**不接管** ——
   *      包成 `\section{\documentclass[12pt]{ctexart}}` 是纯粹的破坏，用户没一个想要的；
   *   ③ 落点先算好再走 writeSrc（内容没变时当场归位，理由见上）。 */
  function applyHead(cmd) {
    const ta = taRef.current; if (!ta) return;
    const s0 = ta.selectionStart, e0 = ta.selectionEnd;
    if (e0 > s0) {
      const sel = content.slice(s0, e0);
      const ins = cmd ? "\\" + cmd + "{" + sel + "}" : sel;
      writeSrc(content.slice(0, s0) + ins + content.slice(e0), s0 + ins.length);
      return;
    }
    const ls = content.lastIndexOf("\n", s0 - 1) + 1;
    let le = content.indexOf("\n", s0);
    if (le < 0) le = content.length;
    const raw = content.slice(ls, le);
    /* ① 剥行尾注释：% 及其后面原样留出，不参与标题 */
    const ci = raw.indexOf("%");
    const body = ci >= 0 ? raw.slice(0, ci) : raw;
    const tail = ci >= 0 ? raw.slice(ci) : "";
    const mm = HEAD_M_RE.exec(body);
    if (mm && mm[1] === cmd) {
      /* v0.8.14 toggle：同一层级再按一次 = 取消层级，还原为正文（标题文字保留）。
       * v0.8.28：标题文字改走 headStripClean（平衡花括号）而不是 mm[3] —— 贪婪正则对
       * `\section{标题}\label{sec:y}` 取出来的「标题」是 `标题} \label{sec:y`，
       * 写回源码就是一行坏 LaTeX。不干净就明说，不猜。 */
      const rlS = /^(\s*)\\(?:part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)/.exec(body);
      const strippedS = rlS ? headStripClean(body.slice(rlS[0].length)) : null;
      if (strippedS == null) {
        setToast({ msg: "⚠ 这一行标题后面还挂着别的东西（\\label 之类），取消层级会把它变成正文 —— 先把 \\label 挪走再取消" });
        return;
      }
      const ins = strippedS + (tail ? " " : "");   /* % 前垫回被 \s*$ 吃掉的空格 */
      writeSrc(content.slice(0, ls) + ins + tail + content.slice(le), ls + ins.length);
      return;
    }
    const m = HEAD_RE.exec(body);
    if (m) {
      /* 已是章节命令：只换层级、保留标题；尾部注释也原样留着 */
      const ins = (cmd ? "\\" + cmd + "{" + m[1] + "}" : m[1]) + (tail ? " " : "");
      writeSrc(content.slice(0, ls) + ins + tail + content.slice(le), ls + (cmd ? ins.length - 1 - (tail ? 1 : 0) : ins.length));
      return;
    }
    const t = body.trim();
    /* ② 以 \ 开头 → 不是正文，拒绝接管（明说，别默默毁掉导言区） */
    if (t !== "" && t.charAt(0) === "\\") {
      setToast({ msg: "⚠ 这一行以 \\ 开头（不是正文），章节快捷键不接管 —— 先把光标放到正文行上" });
      return;
    }
    /* ③ 空行 / 正文行：整行换成章节命令 */
    const ins = cmd ? "\\" + cmd + "{" + t + "}" : t;
    writeSrc(content.slice(0, ls) + ins + tail + content.slice(le), ls + (cmd ? ins.length - 1 : ins.length));
  }

  /**
   * 格式快捷键的统一入口。命中返回 true（由调用方 preventDefault）。
   * 只处理「源码 / 分屏」里的 textarea —— 调用方已保证焦点在那儿。
   */
  function applyFmt(e) {
    const k = (e.key || "").toLowerCase();
    const code = e.code || "";
    let hit = null;
    for (let i = 0; i < FMT.length; i++) {
      const f = FMT[i];
      if (!!f.shift !== !!e.shiftKey) continue;
      /* 反引号那条只有 code（Shift 会把它变成 ~，key 不可靠），照旧单独走 */
      if (f.code) { if (code === f.code) { hit = f; break; } continue; }
      if (k === f.k) { hit = f; break; }
      /* v0.8.7：e.key 不可靠（输入法 / 非 US 布局）时按物理键位再比一次 */
      if (code && code === physOf(f.k)) { hit = f; break; }
    }
    if (!hit) return false;
    if (hit.head != null) { applyHead(hit.head); return true; }
    const ta = taRef.current;
    if (!ta) return false;
    const s0 = ta.selectionStart, e0 = ta.selectionEnd;
    const hasSel = e0 > s0;
    const tpl = (hasSel && hit.s) ? hit.s : hit.e;
    if (!tpl) return false;
    const ex = expandTpl(tpl, hasSel ? content.slice(s0, e0) : "");
    writeSrc(content.slice(0, s0) + ex.text + content.slice(e0), s0 + ex.caret);   // 选区收起、落在该在的地方
    return true;
  }

  fmtRef.current = applyFmt;   // 交给 root 捕获层（它在 useEffect 里只挂一次）

  /* ===== v0.8.11：可视化档的格式快捷键 =====
   * 作用对象不是「textarea 里的选区」，而是「光标此刻落在哪一块」。
   *
   * 只接管**标题类**（Ctrl+1~5 / Ctrl+0）。理由：
   *   这一类改的是**整块的身份**（正文 ⇄ 章节命令），用块自己的 data-s 定位源码行
   *   就能无损改掉，而块本身知道自己的 startLine —— 不需要从 DOM 反推偏移。
   *   模板类（Ctrl+B 插 	extbf{} 这种）在可视化档做不了：预览层的内容是 wysInline
   *   **有损渲染**过的（\cite 已经变成了一个原子节点），DOM 里的选区映射不回源码偏移，
   *   硬做就是把 \cite 烧成纯文本 —— 那是最不能犯的错（丢引用）。
   *   所以模板类在可视化档明确提示一次「这个键要在源码档用」，而不是静默失灵。 */
  const fmtWysWarnedRef = useRef(false);
  function applyFmtWys(e) {
    const k = (e.key || "").toLowerCase();
    let hit = null;
    for (let i = 0; i < FMT.length; i++) {
      const f = FMT[i];
      if (!!f.shift !== !!e.shiftKey) continue;
      if (f.code) { if ((e.code || "") === f.code) { hit = f; break; } continue; }
      if (k === f.k) { hit = f; break; }
      if (e.code && e.code === physOf(f.k)) { hit = f; break; }   // v0.8.7 的物理键位兜底，同一套
    }
    if (!hit) return false;
    if (hit.head == null) {
      if (!fmtWysWarnedRef.current) {
        fmtWysWarnedRef.current = true;
        setToast({ msg: "「" + hit.name + "」要在源码 / 分屏档的正文上用（可视化档里这块是有损渲染，直接改会烧掉 \\cite 这类命令）" });
      }
      return true;   // 命中了 —— 只是不做。别漏给宿主，否则它会当自己的快捷键处理
    }
    return applyHeadWys(hit.head);
  }

  /* 光标此刻落在哪一块上。找不到就返回 null —— 调用方据此放行，绝不抢键。 */
  function currentWysBlock() {
    const root = pvRef.current;
    if (!root) return null;
    let n = null;
    try {
      const sel = (typeof window !== "undefined" && window.getSelection) ? window.getSelection() : null;
      n = sel && sel.anchorNode ? sel.anchorNode : null;
    } catch (e) { n = null; }
    if (!n) return null;
    let el = n.nodeType === 1 ? n : n.parentNode;
    if (!el || typeof root.contains !== "function" || !root.contains(el)) return null;   // 焦点根本不在预览层里
    while (el && el !== root) {
      if (el.classList && el.classList.contains("wys-blk")) return el;
      el = el.parentNode;
    }
    return null;
  }

  /* 可视化档：把「光标所在的那一块」设成 / 改掉章节层级。
   * 刻意不碰 DOM 上的 data-prefix，而是去改源码 —— 因为真正要护住的是
   * 「\section* / [短标题] / \label 一字不丢」，走源码行比走 DOM 属性直白，
   * 也能原样复用源码档那条「这一行以 \ 开头就拒绝接管」的护栏。 */
  function applyHeadWys(cmd) {
    const blk = currentWysBlock();
    if (!blk) return false;
    const s = parseInt(blk.getAttribute("data-s"), 10);
    const e = parseInt(blk.getAttribute("data-e"), 10);
    if (!(s >= 0) || !(e >= s)) return false;
    /* 先把正在打字的正文落地：DOM 才是权威，此刻的 content 还是旧的。
     * 落地拿到的新源码，才是下面按行号改的基准。 */
    let base = content;
    if (wysEditing.current) {
      wysEditing.current = false;
      const c = commitWysSession();
      if (c) base = c;
    }
    /* v0.8.13：段落块允许多物理行。LaTeX 里一个段落常拆成几个源码行写
     * （单换行=空格，空行才分段），可视化档把整段聚成一个块 —— 用户眼里
     * 是「一行段落」，data-s..data-e 却跨着 3 个物理行，旧版在这里一票拒绝，
     * 就出现了「明明只有一行，却说我有 3 行」。现在：段落块把整段并成一行
     * 再转层级（join(" ") 在 LaTeX 语义下无损）；非段落的多行块（公式 /
     * 环境 / 浮动体）依旧拒绝 —— 那些本来就不是「一行正文」。 */
    const TY = blk.getAttribute("data-type") || "";
    const isPara = TY === "paragraph";
    const isHead = TY === "heading";
    const lines = base.split("\n");
    let endLine = s;
    let body = "";
    let tail = "";
    if (s !== e) {
      /* v0.8.28：不再是「非段落一律拒绝」。标题块（heading）是章节快捷键的第一号对象，
       * 之前把它与公式 / 环境一起挡在门外，用户在标题上按 Ctrl+1 听到的是
       * 「跨 N 行（多行公式 / 环境等）」—— 解释与事实不符。现在：
       *   · heading 换层级 → 只改开头那个命令名，* / [短标题] / {标题} / \label 一字不动，
       *     而且**只写回第一行** ⇒ 「这一块跨几行」对换层级毫无影响；
       *   · heading 取消层级 → 整块并成一行后剥掉命令；后面还挂着 \label 之类就明确拒绝；
       *   · paragraph → 整块并成一行（LaTeX 语义无损）；
       *   · 其余（公式 / 浮动体 / 参考文献 / 环境 / 注释 / 命令…）确实不能改，
       *     回报时把**是哪一块、哪几行、长什么样**一并说清楚。 */
      if (!isPara && !isHead) {
        const snip = String(lines[s] == null ? "" : lines[s]).trim().slice(0, 26);
        setToast({ msg: "⚠ 光标不在正文里 —— 这一块是「" + (WYS_BLK_SAY[TY] || "结构块") + "」（源码第 " +
          (s + 1) + "–" + (e + 1) + " 行" + (snip ? "：" + snip : "") + "）。章节快捷键只改正文 / 标题，点到正文上再用" });
        return true;
      }
      if (isHead) {
        /* 第一行单独看：命令名一定在这一块的第一行开头（parseDoc 就是按它切块边界的）。 */
        const ls = lines[s] == null ? "" : lines[s];
        const ci = ls.indexOf("%");
        const lsBody = ci >= 0 ? ls.slice(0, ci) : ls;
        const lsTail = ci >= 0 ? ls.slice(ci) : "";
        const lead = /^(\s*)\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)/.exec(lsBody);
        if (!lead) {
          setToast({ msg: "⚠ 这一块标题的开头没认出章节命令，已跳过（源码第 " + (s + 1) + "–" + (e + 1) + " 行）" });
          return true;
        }
        const same = !!cmd && lead[2] === cmd;      // 同层级再按一次 = 取消层级（与单行路径同一套 toggle）
        let hText = "";
        let hMerge = false;                          // 是否要把整块并成一行写回
        if (cmd && !same) {
          hText = lead[1] + "\\" + cmd + lead[3] + lsBody.slice(lead[0].length) + lsTail;
        } else {
          const whole = mergeWysLines(lines, s, e);
          const rl2 = /^(\s*)\\(?:part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)/.exec(whole);
          const stripped = rl2 ? headStripClean(whole.slice(rl2[0].length)) : null;
          if (stripped == null) {
            setToast({ msg: "⚠ 这一块标题后面还挂着别的东西（\\label 之类），取消层级会把它变成正文 —— 先把 \\label 挪走再取消" });
            return true;
          }
          hText = stripped;
          hMerge = true;
        }
        let hOut;
        try {
          hOut = WYS.applyEdits(base, [{ startLine: s, endLine: hMerge ? e : s, newText: hText }]);
          WYS.parseDoc(hOut);                       // 自检：改完仍必须可解析
        } catch (err) {
          setToast({ msg: "⚠ 改标题自检未通过，已放弃本次修改：" + String((err && err.message) || err) });
          return true;
        }
        if (hOut !== base) {
          wysPushTx(base, hOut, (cmd && !same) ? "设为 \\" + cmd : "取消章节层级");
          wysPaintFromSrc();
          onChange(hOut);
          setToast({ msg: (cmd && !same)
            ? "✓ 已设为「\\" + cmd + "」" + (s !== e ? "（标题跨 " + (e - s + 1) + " 行：只换开头的命令名，其余原样）" : "")
            : "✓ 已取消章节层级（标题跨 " + (e - s + 1) + " 行，已并成一行）", undo: true });
        }
        return true;
      }
      endLine = e;
      body = mergeWysLines(lines, s, e);
    } else {
      const rawLine = lines[s] == null ? "" : lines[s];
      const ci = rawLine.indexOf("%");
      body = ci >= 0 ? rawLine.slice(0, ci) : rawLine;
      tail = ci >= 0 ? rawLine.slice(ci) : "";       // 行尾注释原样留着
    }
    const mm = HEAD_M_RE.exec(body);
    let next, undone = false;
    if (mm && mm[1] === cmd) {
      /* v0.8.14 toggle：同一层级再按一次 = 取消层级，还原为正文（\section* 也算同层级）。
       * v0.8.28：标题文字改走 headStripClean（平衡花括号）而不是 mm[3] —— 贪婪正则对
       * `\section{标题}\label{sec:y}` 取出来的「标题」是 `标题} \label{sec:y`。 */
      const rlT = /^(\s*)\\(?:part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)/.exec(body);
      const strippedT = rlT ? headStripClean(body.slice(rlT[0].length)) : null;
      if (strippedT == null) {
        setToast({ msg: "⚠ 这一行标题后面还挂着别的东西（\\label 之类），取消层级会把它变成正文 —— 先把 \\label 挪走再取消" });
        return true;
      }
      next = strippedT + (tail ? " " : "");
      undone = true;
    } else {
      const m = HEAD_RE.exec(body);
      if (m) {
        next = (cmd ? "\\" + cmd + "{" + m[1] + "}" : m[1]) + (tail ? " " : "");   // 已是章节命令：只换层级、保留标题
      } else {
        const t = body.trim();
        /* v0.8.16：段落块以行内命令开头（\textbf{…} / \LaTeX{} / 自定义宏）不再是拒绝理由 ——
         * parseDoc 里能落到 paragraph 的以 \ 开头内容必是行内标记（结构命令在
         * startsStructure / 命令块那几关就被截走了），包成章节命令是合法 LaTeX。
         * 命令块（\maketitle 等）不是段落，依旧拒绝。 */
        if (t !== "" && t.charAt(0) === "\\" && !isPara) {
          setToast({ msg: "⚠ 这一行以 \\ 开头（不是正文），章节快捷键不接管 —— 先把光标放到正文行上" });
          return true;
        }
        next = cmd ? "\\" + cmd + "{" + t + "}" : t;
      }
    }
    let out;
    try {
      out = WYS.applyEdits(base, [{ startLine: s, endLine: endLine, newText: next + tail }]);
      WYS.parseDoc(out);                                  // 自检：改完仍必须可解析
    } catch (err) {
      setToast({ msg: "⚠ 改标题自检未通过，已放弃本次修改：" + String((err && err.message) || err) });
      return true;
    }
    if (out !== base) {
      wysPushTx(base, out, cmd ? "设为 \\" + cmd : "取消章节层级");   // v0.8.15：层级切换同样可撤销
      wysPaintFromSrc();     // v0.8.23：改的是整块的身份，DOM 不再是权威 —— 屏幕重画（见该函数注释）
      onChange(out);
      setToast({ msg: undone
        ? "✓ 已取消章节层级（原「\\" + cmd + (mm[2] || "") + "」）"
        : "✓ 已设为" + (cmd ? "「\\" + cmd + "」" : "正文") + (endLine !== s ? "（源码 " + (endLine - s + 1) + " 行并成一行，段落语义不变）" : ""), undo: true });
    }
    return true;
  }

  /* 可视化档里第一块「能直接写字」的元素。刻意只要正文 / 标题块，跳过注释、命令、
   * 以及导言区那些折叠起来的项 —— 把光标扔进一个折叠的 <details> 里，用户会看到
   * 页面莫名其妙滚一下，然后光标不见了。 */
  function firstEditableIn(root) {
    if (!root || typeof root.querySelector !== "function") return null;
    /* v0.8.12：正文现在只有一个宿主，直接给它 —— 光标进去就能在块之间自由流动。 */
    const host = root.querySelector(".wys-editroot");
    if (host) return host;
    /* 兜底：老渲染 / 夹具（按块找第一个可写的 .wys-edit）。
     * ⚠ 这里还修了一个真机上一直存在的 bug：原文是 root.querySelector(".pv-root")，
     *   而真机上 pvRef 那个 div **自己就带着 .pv-root**，querySelector 不查自身 ⇒ 永远返回 null，
     *   于是「切到可视化档把光标送进正文」在真机上一次都没生效过（夹具里多套了一层 .pv-root，
     *   门禁因此一直绿着）。先认自己。 */
    const pv = (root.classList && root.classList.contains("pv-root")) ? root : root.querySelector(".pv-root");
    if (!pv || typeof pv.querySelectorAll !== "function") return null;
    const list = pv.querySelectorAll(".wys-p > .wys-edit, .wys-h1 > .wys-edit, .wys-h2 > .wys-edit, .wys-h3 > .wys-edit, .wys-par > .wys-edit");
    for (let i = 0; i < list.length; i++) return list[i];
    return null;
  }
  /* ---------- v0.8.12：光标的三件小事 ----------
   * 为什么要它们：整个「就地编辑」只有**一次** DOM 重建的机会（从别处来的改动），
   * 而重建会把 activeElement 扔回 <body>、把选择区间的节点变成孤儿。
   * 记位置用「块 id + 块内文本偏移」而不是节点引用 —— 节点引用建完就作废，
   * 偏移量对得上就行。三件都只碰 DOM / Selection，出错一律静默（夹具里没有 Range）。 */

  /* 记：光标现在在哪一块的哪个字符位置（不在这层里 → null） */
  function wysCaretSnapshot(root) {
    try {
      const d = typeof document === "undefined" ? null : document;
      if (!d || !root) return null;
      const ae = d.activeElement;
      if (!ae || !root.contains || !root.contains(ae)) return null;
      const sel = d.getSelection ? d.getSelection() : null;
      if (!sel || !sel.anchorNode || (root.contains && !root.contains(sel.anchorNode))) return null;
      let el = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentNode;
      while (el && el !== root) {
        if (el.classList && el.classList.contains("wys-blk")) break;
        el = el.parentNode;
      }
      if (!el || el === root || !el.getAttribute) return null;
      const part = el.querySelector(".wys-edit") || el;
      const rg = d.createRange();
      rg.setStart(part, 0);
      rg.setEnd(sel.anchorNode, sel.anchorOffset);
      return { bid: el.getAttribute("data-bid"), offset: String(rg).length };
    } catch (e) { return null; }
  }

  /* 接回：按块 id 找到新节点，逐文本节点推进到记下的偏移 */
  function wysCaretRestore(root, keep) {
    try {
      const d = typeof document === "undefined" ? null : document;
      if (!d || !root || !keep || keep.bid == null) return;
      const blk = root.querySelector('.wys-blk[data-bid="' + keep.bid + '"]');
      const part = blk && blk.querySelector(".wys-edit");
      if (!part) return;
      let left = keep.offset;
      /* ⚠ NodeFilter.SHOW_TEXT = 4，不是 3！写 3（ELEMENT|ATTRIBUTE）时 walker 只吐元素节点，
       * n.nodeValue 是 null，null.length 当场抛 TypeError、被下面的 catch 静默吞掉 ——
       * 回接从来没成功过：凡是走「重建 + 回接」的路径（Ctrl+1~6 改层级 / 宿主改内容 / 撤销），
       * 光标必丢，用户读作「一按快捷键就失焦」。
       * 原子岛（contenteditable=false 的 span）不必特意跳：快照侧 Range.toString() 与
       * 回接侧的文本节点推进都把岛内文本算进去，两边口径一致，偏移对得上。 */
      const walker = d.createTreeWalker(part, 4 /* NodeFilter.SHOW_TEXT */, null);
      let node = null, off = 0;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (left <= n.nodeValue.length) { node = n; off = left; break; }
        left -= n.nodeValue.length;
      }
      if (!node) return;
      const rg = d.createRange();
      rg.setStart(node, off);
      rg.collapse(true);
      const sl = d.getSelection ? d.getSelection() : null;
      if (!sl) return;
      sl.removeAllRanges();
      sl.addRange(rg);
      const host = part.closest ? part.closest(".wys-editroot") : null;
      if (host && typeof host.focus === "function") { try { host.focus(); } catch (e) {} }
    } catch (e) {}
  }

  /* 切到可视化档那一拍：把光标送到第一块正文的**末尾**（宿主 focus 默认落在整篇开头） */
  function wysCaretToStart(host) {
    const d = typeof document === "undefined" ? null : document;
    if (!d || !host || !host.querySelector) return;
    if (!(host.classList && host.classList.contains("wys-editroot"))) return;   // 只对唯一宿主做
    const pe = host.querySelector(".wys-h1 > .wys-edit, .wys-h2 > .wys-edit, .wys-h3 > .wys-edit, .wys-p > .wys-edit, .wys-par > .wys-edit");
    if (!pe || !pe.firstChild) return;
    const rg = d.createRange();
    rg.selectNodeContents(pe);
    rg.collapse(false);                  // 收在末尾
    const sl = d.getSelection ? d.getSelection() : null;
    if (!sl) return;
    sl.removeAllRanges();
    sl.addRange(rg);
  }

  fmtWysRef.current = applyFmtWys;

  /* ---------- v0.8.22：「＋ 新段落」 ----------
   * 用户原话：「我想要加内容块」。
   *
   * 可视化档以前没有任何「加一段」的入口：只有在某个段落末尾连按两下回车
   * （LaTeX 里单换行 = 空格、空行才分段）才长得出新段落 —— 谁都猜不到。
   * v0.8.27 起键盘那条路已经顺过来了（回车就是新建段落、段内换行改 Shift+回车），
   * 这个按钮留给鼠标：点一下 = 在光标所在段落下面新起一段。
   * 用户于是自然会去正文下方点一下再敲字，而那儿要么是块与块之间的空隙
   * （字没有归属，见 wysFoldOrphans），要么正撞上 \end{document} 那一行。
   *
   * 为什么不往源码里插一个空行：**空行不是块**（parseDoc 把空行排除在块外），
   * 插完光标无处可落，用户看到的是一行空气 —— 那是个假动作。
   * 真正的做法是在段落块末尾补两个 <br>：DOM 里有落脚点、光标就停在新起的那一行上，
   * 边打字边成型；一落盘，块级读回把段末**一个**落脚换行吃掉（见 wysBlockTex），
   * 剩下那一个才是内容 —— 于是这里落的是**恰好一个**空行 = **一个**新段落。
   * ⚠ 这里以前写着「读成 \n\n → 空行」并声称「源码零改动、零污染」：
   *   读回不做归一的那会儿，"…\n\n" 按 \n 切出来是 ["…", "", ""]，一次落**两个**空段；
   *   同一条算式也让「段末按一下回车」凭空长出一个空行（= 用户报的「换行不丝滑」）。
   *   归一之后：点一下 = 一个空行（点了就是这个意思）；连点两下不会堆出两个空段。
   */
  function addParagraph() {
    const ta = taRef.current;
    const inSrc = !!(ta && typeof document !== "undefined" && document.activeElement === ta);
    /* 源码 / 分屏且焦点在源码框：那儿「新段落」就是插一个空行，最直接 */
    if (inSrc) {
      const s0 = ta.selectionStart, e0 = ta.selectionEnd;
      const ins = "\n\n";
      onChange(content.slice(0, s0) + ins + content.slice(e0));
      pendingCursor.current = s0 + ins.length;
      setToast({ msg: "✓ 已插入空行 —— LaTeX 里空行就是分段，接着往下写就行" });
      return;
    }
    const root = pvRef.current;
    if (!root || typeof root.querySelectorAll !== "function") {
      setToast({ msg: "⚠ 这一档没有可落笔的正文区 —— 切到可视化 / 分屏档，或在源码里直接写" });
      return;
    }
    /* 目标 = 光标所在的段落；光标不在段落里（停在标题上 / 停在空白处）→ 取正文最后一段。
     * 绝不往标题里塞 <br>：那是把换行写进 \section{…} 的标题。 */
    const cur = currentWysBlock();
    let target = (cur && cur.getAttribute && cur.getAttribute("data-type") === "paragraph") ? cur : null;
    if (!target) {
      const ps = root.querySelectorAll('.wys-blk[data-type="paragraph"]');
      if (!ps || !ps.length) {
        setToast({ msg: "⚠ 这篇还没有正文段落可落脚 —— 先在标题下面写出第一段，再在这儿新起一段" });
        return;
      }
      target = ps[ps.length - 1];
    }
    const bid = target.getAttribute("data-bid");
    /* 先把正在打字的正文落盘：DOM 是权威，不落盘的话下面这一拍的重排会把刚敲的字冲掉 */
    flushTextEdits();
    /* 落盘之后 DOM 可能已重建（同一个块的行号会变、bid 一般不变）—— 按 bid 把节点找回来 */
    let blk = null;
    if (bid != null && pvRef.current && pvRef.current.querySelector) {
      blk = pvRef.current.querySelector('.wys-blk[data-bid="' + bid + '"]');
    }
    if (!blk) blk = target;
    const part = blk.querySelector ? blk.querySelector(".wys-edit") : null;
    if (!part || part.isConnected === false) {
      setToast({ msg: "⚠ 这一块刚被重排过，没找到落笔处 —— 请再点一次这个按钮" });
      return;
    }
    /* 末尾已经有两个以上 <br> 就不再补（连点两下按钮不该堆出两个空段） */
    let nbr = 0;
    for (let c = part.lastChild; c; c = c.previousSibling) {
      /* v0.8.29：占位（零宽字符）不算节点 —— 落脚行现在每行都带一个，数 <br> 时得跳过 */
      if (c.nodeType === 3 && String(c.nodeValue) === WYS_ZWSP) continue;
      if (c.nodeType === 1 && c.tagName && c.tagName.toLowerCase() === "br") { nbr++; continue; }
      break;
    }
    const need = Math.max(0, 2 - nbr);
    for (let i = 0; i < need; i++) {
      try { part.appendChild(part.ownerDocument.createElement("br")); } catch (e) { break; }
    }
    /* 光标放到块尾（也就是新起的那一行），并把编辑宿主聚焦 —— 接着就能直接打字 */
    try {
      const d = part.ownerDocument || (typeof document === "undefined" ? null : document);
      const ed = part.closest ? part.closest(".wys-editroot") : null;
      if (ed && ed.focus) ed.focus();
      if (d && d.createRange) {
        const rng = d.createRange();
        const zw = wysEnsureLandingLine(part);   // v0.8.29：补齐空落脚行，光标才有几何
        if (zw && zw.parentNode) { rng.setStart(zw, 1); rng.collapse(true); }
        else { rng.selectNodeContents(part); rng.collapse(false); }
        const sel = d.getSelection ? d.getSelection() : null;
        if (sel) {
          if (sel.removeAllRanges) sel.removeAllRanges();
          if (sel.addRange) sel.addRange(rng);
        }
      }
    } catch (e) { /* 夹具里没有 Range：静默 —— 光标没落上也不改任何字节 */ }
    /* 焦点真的落到块里了才算「正在打字」：只有这时才把编辑相位立起来。
     * 不无脑置 true —— 万一没拿到焦点，相位会永远卡在 true，之后 commitWys 一直早退。 */
    try {
      const ae = (typeof document === "undefined") ? null : document.activeElement;
      if (ae && blk.contains && blk.contains(ae)) wysEditing.current = true;
    } catch (e) {}
    setToast({ msg: "✓ 已在下方新起一段 —— 直接输入就是新段落（LaTeX 里空行就是分段）" });
  }

  function insert(text, back) {
    const ta = taRef.current; if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    onChange(content.slice(0, s) + text + content.slice(e));
    pendingCursor.current = s + text.length - (back || 0);
  }

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    /* 区间优先（格式快捷键 / 章节层级走这条）：一次把光标放到指定位。
     * 两个 ref 同时有值时以区间为准，并顺手清掉另一个 —— 否则它会在下一拍
     * 把光标又拽回旧位置。 */
    if (pendingRange.current) {
      const r = pendingRange.current;
      pendingRange.current = null;
      pendingCursor.current = null;
      ta.focus();
      try { ta.setSelectionRange(r[0], r[1]); } catch (e) {}
      return;
    }
    if (pendingCursor.current != null) {
      const p = pendingCursor.current;
      pendingCursor.current = null;
      ta.focus();
      try { ta.setSelectionRange(p, p); } catch (e) {}
    }
  }, [content]);

  function updateCursor() {
    const ta = taRef.current; if (!ta) return;
    const upto = content.slice(0, ta.selectionStart);
    const nl = upto.split("\n");
    setCursor({ line: nl.length, col: nl[nl.length - 1].length + 1 });
  }

  /* ================= 大纲锚点 → 行号（模块级纯函数） =================
   *
   * 宿主只保证回抛 detail={pluginId,editorId,anchor,item}，anchor 的语义是
   * 「outlineTool 返回什么就回传什么」，而且缺失时会**退化成条目标题文本**
   * （见 PluginOutlineItems：const anchor = item.anchor ?? item.text）。
   *
   * 旧实现 「Math.max(1, Number(d.anchor) || 0)」 对非数字锚点会静默得 1 —— 这就是
   * 「怎么点都跳第 1 行」的直接原因。现在宁可不跳（并明说），也不跳错地方。
   */

  /** 标题 → 行号：去掉自动编号后在各 \section 家族命令里回查。 */
  function lineOfSectionTitle(content, raw) {
    const base = String(raw == null ? "" : raw).replace(/\s+/g, " ").trim();
    if (!base) return 0;
    const wants = [base];
    const stripped = base.replace(/^\s*(?:\d+(?:\.\d+)*|[A-Z](?:\.\d+)*|第\s*\d+\s*部分)[\s.、·]+/, "").trim();
    if (stripped && stripped !== base) wants.push(stripped);
    const lines = String(content || "").split("\n");
    const re = /\\(part|chapter|section|subsection|subsubsection)\*?\s*\{([^}]*)\}/;
    let loose = 0;
    for (let i = 0; i < lines.length; i++) {
      const m = re.exec(lines[i]);
      if (!m) continue;
      const title = m[2].replace(/\s+/g, " ").trim();
      for (let k = 0; k < wants.length; k++) {
        if (title === wants[k]) return i + 1;
        if (!loose && wants[k].length >= 2 && (title.indexOf(wants[k]) >= 0 || wants[k].indexOf(title) >= 0)) loose = i + 1;
      }
    }
    return loose;
  }

  /** detail → 行号。数字锚点优先；否则按标题回查；都没有返回 0（**不返回 1**）。 */
  function resolveOutlineLine(detail, content) {
    const d = detail || {};
    const item = d.item || {};
    const cands = [d.anchor, item.anchor, item.line, item.lineNumber];
    for (let i = 0; i < cands.length; i++) {
      const raw = cands[i];
      if (raw == null || raw === "") continue;
      const str = String(raw).trim();
      if (!/^\d+$/.test(str)) continue; // 只认纯数字行号：文本锚点绝不 Number() 后瞎跳
      const n = parseInt(str, 10);
      if (Number.isFinite(n) && n >= 1) return n;
    }
    return lineOfSectionTitle(content, d.anchor != null ? d.anchor : item.text);
  }

  function sameAsFile(p) {
    if (!p) return true;
    const a = String(p).replace(/\\/g, "/").toLowerCase();
    const b = String(filePath || "").replace(/\\/g, "/").toLowerCase();
    return a === b;
  }

  /* 闪烁层跟着 textarea 的 scrollTop 走：不引 state，避免滚动时整棵树重渲染 */
  function paintFlash(ln) {
    const el = flashRef.current, ta = taRef.current;
    if (!el || !ta) return;
    if (!ln) { el.style.opacity = "0"; return; }
    el.style.top = 8 + (ln - 1) * 20 - ta.scrollTop + "px";
    el.style.opacity = "1";
  }

  function flashAt(ln) {
    flashLineRef.current = ln;
    setFlashLine(ln);
    paintFlash(ln);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(function () {
      flashTimer.current = null;
      flashLineRef.current = 0;
      setFlashLine(0);
      paintFlash(0);
    }, 1400);
  }

  /* 比例 → 目标栏的像素位置。两栏总高不同（源码按行、预览按排版），只能按比例对。
   * 刻意用「同一个公式」而不是各自一套：推过去再推回来落回同一个点，才不会一点点漂走。 */
  function ratioScroll(el, r) {
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    return Math.max(0, Math.min(max, r * max));
  }

  /* 源码栏 → 高亮层 / 行号槽 / 渲染层。
   * 带 ev 的是 textarea 自己的 onScroll；不带 ev 的是 gotoLine 显式驱动的
   * （大纲跳转：源码已经滚到位，让其余几栏跟上）。两者语义不同，所以分开判：
   * 显式驱动那一拍，「源码是权威」，把台账里可能残留的回声一笔勾销，
   * 免得恰好位置相同而被自己吞掉一次同步。 */
  function syncScroll(ev) {
    const ta = taRef.current; if (!ta) return;
    if (!ev) {
      scrollEcho.current.src = -1;
    } else {
      const echo = scrollEcho.current;
      /* 这一下是我们自己刚替源码栏写进去的（渲染层推过来的回声）→ 放行，别再推回去 */
      if (echo.src >= 0 && Math.abs(ta.scrollTop - echo.src) < 1 && Date.now() - echo.at < 350) {
        echo.src = -1;
        return;
      }
    }
    if (preRef.current) { preRef.current.scrollTop = ta.scrollTop; preRef.current.scrollLeft = ta.scrollLeft; }
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
    const pvEl = pvRef.current;
    if (pvEl && view === "split") {
      const ratio = ta.scrollTop / Math.max(1, ta.scrollHeight - ta.clientHeight);
      const y = ratioScroll(pvEl, ratio);
      scrollEcho.current.pv = y; scrollEcho.current.at = Date.now();
      pvEl.scrollTop = y;
    }
    if (flashLineRef.current) paintFlash(flashLineRef.current);
  }

  /* 渲染层 → 源码栏（v0.8.24 补上的反方向）。
   * 分屏里两栏并排，用户在**右栏**用鼠标滚 —— 而此前只有一个 onScroll，挂在左栏 textarea 上，
   * 所以右栏怎么滚左栏都不动。README 承诺的是「滚动联动」，用户读到的是「两边一起动」。
   * 只在分屏档动作：纯可视化档里源码框根本没挂载（taRef 为 null），这里自然早退。 */
  function syncScrollFromPv() {
    const pvEl = pvRef.current; if (!pvEl || view !== "split") return;
    const ta = taRef.current; if (!ta) return;
    const echo = scrollEcho.current;
    /* 这一下是我们自己刚写进去的（源码栏推过来的回声）→ 放行，否则两栏互相推、画面发抖 */
    if (echo.pv >= 0 && Math.abs(pvEl.scrollTop - echo.pv) < 1 && Date.now() - echo.at < 350) {
      echo.pv = -1;
      return;
    }
    const ratio = pvEl.scrollTop / Math.max(1, pvEl.scrollHeight - pvEl.clientHeight);
    const y = ratioScroll(ta, ratio);
    echo.src = y; echo.at = Date.now();
    ta.scrollTop = y;
    /* 高亮层 / 行号槽跟着源码栏走 —— 它们与 textarea 是同一个滚动位置，
     * 不一起搬就会出现「字在动、背景高亮没动」的错位。 */
    if (preRef.current) { preRef.current.scrollTop = y; preRef.current.scrollLeft = ta.scrollLeft; }
    if (gutterRef.current) gutterRef.current.scrollTop = y;
    if (flashLineRef.current) paintFlash(flashLineRef.current);
  }

  /* ---------- 预览内定位（v0.7.2）----------
   * 就地编辑时点一下公式卡片就被踢进分屏看见源码，是用户明确抱怨的行为。
   * 现在：源码 textarea 没挂载时，**视图一律不动**，在预览里滚到那一块闪一下就算跳到了。
   * 只有「显式要求源码」（卡片上的 ↗ 定位）才会切视图。 */
  function flashPreview(el) {
    if (!el) return;
    el.classList.remove("wys-flash");
    void el.offsetWidth;              // 强制回流，保证连点两次动画也会重放
    el.classList.add("wys-flash");
    setTimeout(function () { el.classList.remove("wys-flash"); }, 1200);
  }

  function revealInPreview(ln, flash) {
    const root = pvRef.current;
    if (!root) return false;
    /* .wys-blk 只有 data-s（0 基起始行）；.wys-atom 有 data-line（1 基）。统一成 1 基再比。 */
    const cands = root.querySelectorAll("[data-line],[data-s]");
    let best = null, bestLn = -1;
    for (let i = 0; i < cands.length; i++) {
      const el = cands[i];
      const v = el.getAttribute("data-line");
      const n = v != null ? parseInt(v, 10) : (parseInt(el.getAttribute("data-s"), 10) + 1);
      if (!(n >= 1) || n > ln) continue;
      if (n > bestLn) { bestLn = n; best = el; }
    }
    if (!best) return false;
    try { best.scrollIntoView({ block: "center", behavior: "smooth" }); }
    catch (e) { try { best.scrollIntoView(); } catch (e2) {} }
    if (flash !== false) flashPreview(best);
    return true;
  }

  /* 显式「去源码里看这一块」——唯一会切视图的入口 */
  function gotoSourceAt(ln) {
    if (taRef.current) { gotoLine(ln, { source: true }); return; }
    pendingReveal.current = { ln: ln, flash: true, ack: null, source: true };
    setView("split");   // 卡片按钮只存在于预览面板，所以这里必然是从预览切过去
    writeHostMode("split");   // v0.8.3：档位指示只剩标签栏这一处，内部切档必须同步，别让它显示假的
  }

  /* 高亮「正在被编辑的那一个原子块」。 */
  function pickAtom(el) {
    const root = pvRef.current;
    if (root) {
      const prev = root.querySelectorAll(".wys-atomblk.picked, .wys-fmline.picked");
      for (let pi = 0; pi < prev.length; pi++) if (prev[pi] !== el) prev[pi].classList.remove("picked");
    }
    if (el && el.classList) el.classList.add("picked");
    atomPickedRef.current = el || null;
  }

  /* 点原子 → 在**原地**打开就地编辑器。分两种，别混：
   *   行内原子 .wys-atom    —— \cite{key} / \ref{lab} / 行内公式，是**片段**
   *   块级原子 .wys-atomblk —— 公式环境 / 浮动体 / 参考文献，是**整块**
   * 行内要先判：块级原子的渲染结果里也可能含行内原子（比如图 caption 里的 \ref），
   * 那种情况下用户点的是那个 \ref，不是整个浮动体。
   *
   * 为什么挂在 mousedown 而不是 click：等 click 的话，焦点会先从正在编辑的正文块上
   * 掉下来 → blur → commitWys → 整层 innerHTML 重建 → 被点的那块已经不是同一个
   * DOM 节点了，浮层算出来的位置也跟着失效。 */
  function onPreviewMouseDown(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest(".wys-pop")) return;          // 浮层内部的点击不归这里管
    /* v0.9.2：文件卡头部点击 = 收起 / 展开。整卡 contenteditable=false，折叠是纯 UI
     * （只动 class / 箭头 / 文案），commit 读的 data-tex 原子不动 —— 回写链路零感知。
     * 只拦**已加载**卡（有 data-inc）；嵌套的 pv-inc 头部类名不同，自然落空 ——
     * 那种点击照旧落到 .wys-struct 的 openAtom（编辑外层 \input 命令）。 */
    const incH = t.closest(".wys-inc-h");
    if (incH) {
      const incCard = incH.closest(".wys-inc");
      const abs = incCard ? incCard.getAttribute("data-inc") : "";
      if (incCard && abs) {
        e.preventDefault();   // 不夺焦点：正在打字时也能折，不会触发 blur→commit→重建
        const folded = incFoldToggle(abs);
        incCard.classList.toggle("wys-inc-fold", folded);
        const f = incCard.querySelector(".wys-inc-f");
        if (f) f.textContent = folded ? "▸" : "▾";
        const say = incCard.querySelector(".wys-inc-say");
        if (say) say.textContent = (incCard.getAttribute("data-lines") || "?") + " 行 · " + (folded ? "已收起" : "已合并预览");
      }
      return;   // 头部点击永远不落到 openAtom
    }
    /* 导言区的项排在最前面：标题里本身就可能含 \cite / \LaTeX 这类行内原子，
     * 那种情况下用户点的是**整行**（\title{…}），不是标题里的某一个命令。 */
    const fm = t.closest(".wys-fmline");
    if (fm) { e.preventDefault(); openAtom(fm); return; }
    const inline = t.closest(".wys-atom");
    if (inline) { e.preventDefault(); openInline(inline); return; }
    const blk = t.closest(".wys-atomblk");
    if (blk) { e.preventDefault(); openAtom(blk); return; }
    /* v0.8.22：结构块（注释 / 命令 / 文档结尾）—— 整块是只读孤岛，点它就地编辑。
     * 以前这三块是可编辑的，光标能停进 \maketitle 那一行，敲的字被写进命令行
     * （用户原话「我想要加内容块，貌似弄到了代码里面」）。现在与公式块同一套动作。 */
    const st = t.closest(".wys-struct");
    if (st) { e.preventDefault(); openAtom(st); return; }
    /* v0.8.20：以上都不是 —— 这一下点在「块与块之间的空隙 / 正文之后的留白 / 页首的只读渲染」上。
     * 旧版什么都不做，光标于是停在**不属于任何块**的位置；在那儿敲的字块模型看不见，
     * Ctrl+Z 只会说「预览层还没有记下任何改动」（用户原话：刚输入就撤销说没有内容可以撤销），
     * 而且下一拍重建就把它静默吃掉。现在把光标送进最近的正文块 ——
     * 与 Word 一样：点正文下方，光标落在最后一段末尾，敲的字就是那一段的字。 */
    /* v0.8.29：这一下可能点在**空落脚行**上（段末那串 <br> 之后 / 两条 <br> 之间）。
     * 那一行要是没有任何节点，Chromium 就点不出光标（真的量过：rect = 0,0,0,0）。
     * 所以先把落脚行的零宽占位补齐，再按老规矩把这一下交回浏览器 —— 光标这时才画得出来。 */
    const caretHost = t.closest(".wys-blk");
    if (caretHost) {
      const ty0 = caretHost.getAttribute("data-type");
      if (ty0 && WYS_CARET_BLOCK[ty0]) {
        try { wysEnsureLandingLine(caretHost.querySelector(".wys-edit")); } catch (e0) {}
      }
    }
    if (t.closest(".wys-edit")) return;        // 点在正文里：交给浏览器（选区 / 划词引用都要它）
    const host = t.closest(".wys-blk");
    if (host) {
      /* 整块读回的类型：落在这块里（哪怕不在 .wys-edit 上）也会进源码 —— 不夺它的默认行为。
       * v0.8.22：这里只剩**正文类**（段落 / 标题）。注释 / 命令 / 尾块已经在上面的
       * .wys-struct 那一道被拦走，根本走不到这里；留这条是第二道保险 ——
       * 哪怕以后有人给结构块去掉 .wys-struct 类，光标也绝不会落进行会被写回源码的地方。 */
      const ty = host.getAttribute("data-type");
      if (ty && WYS_CARET_BLOCK[ty] && host.querySelector(".wys-edit")) return;
    }
    if (!caretToNearest(e.clientY)) return;    // 没有正文块可落：什么都不做，也不抢默认行为
    e.preventDefault();
  }

  /* 把光标送进「竖直距离最近」的正文块（块首 / 块尾由点击位置决定）。
   * 失败一律返回 false —— 调用方据此放行默认行为，绝不吞掉一次点击。 */
  function caretToNearest(y) {
    const root = pvRef.current;
    if (!root || typeof root.querySelectorAll !== "function") return false;
    let blks;
    try { blks = root.querySelectorAll(".wys-blk"); } catch (err) { return false; }
    if (!blks || !blks.length) return false;
    const cands = [];
    for (let i = 0; i < blks.length; i++) {
      const b = blks[i];
      const ty = b.getAttribute ? b.getAttribute("data-type") : null;
      if (!ty || !WYS_CARET_BLOCK[ty]) continue;            // 只落「会被写回源码」的块（段落 / 标题）
      const e2 = b.querySelector ? b.querySelector(".wys-edit") : null;
      if (!e2) continue;
      let r = null;
      try { r = b.getBoundingClientRect ? b.getBoundingClientRect() : null; } catch (err) { r = null; }
      if (!r) continue;
      cands.push({ el: e2, top: r.top, bottom: r.bottom, mid: r.top + (r.bottom - r.top) / 2 });
    }
    const pick = wysPickNearestBlock(cands, y);
    if (!pick) return false;
    /* 先把编辑宿主聚焦（无焦点时设选区会被浏览器丢掉），再把光标按范围放进去 */
    try {
      const ed = pick.el.closest ? pick.el.closest(".wys-editroot") : null;
      if (ed && ed.focus) ed.focus();
    } catch (err) { }
    try {
      if (!document.createRange) return false;
      const rng = document.createRange();
      if (pick.atEnd) {
        /* v0.8.29：块尾先把空落脚行补齐，再把光标停在**占位里面**。
         * 老写法 selectNodeContents + collapse(false) 会停在所有子节点之后 —— 那正是
         * 没有几何的位置（实测 rect = 0,0,0,0），用户看到的就是「点了块末尾没光标」。 */
        const zw = wysEnsureLandingLine(pick.el);
        if (zw && zw.parentNode) { rng.setStart(zw, 1); rng.collapse(true); }
        else { rng.selectNodeContents(pick.el); rng.collapse(false); }
      } else {
        rng.selectNodeContents(pick.el);
        rng.collapse(true);
      }
      const sel = window.getSelection ? window.getSelection() : null;
      if (!sel) return false;
      if (sel.removeAllRanges) sel.removeAllRanges();
      sel.addRange(rng);
    } catch (err) { return false; }
    return true;
  }

  /* 行内原子（[1] / 图 1 / 行内公式）的就地编辑。
   * 提交路径不同：不替换整块，只改这个节点的 data-tex 属性 —— 见 commitAtom。 */
  function openInline(el) {
    const tex = el.getAttribute("data-tex") || "";
    if (!tex) return;
    if (atomEdit && atomEdit.node === el) return;
    if (atomEdit) commitAtom();
    const r = el.getBoundingClientRect();
    const W = typeof window === "undefined" ? 1200 : window.innerWidth;
    const H = typeof window === "undefined" ? 800 : window.innerHeight;
    const host = el.closest ? el.closest(".wys-blk") : null;
    setAtomEdit({
      mode: "inline", node: el, tex: tex, orig: tex, s: -1, e: -1,
      blkS: host ? host.getAttribute("data-s") : null,
      x: Math.max(8, Math.min(r.left, W - 556)),
      y: Math.max(8, Math.min(r.bottom + 6, H - 220)),
    });
  }

  /* 一个就地编辑目标的身份。**不能拿 DOM 节点当身份**：DOM 一重建节点就换人了，
   * 同一个目标会被当成新的，浮层会莫名其妙地重开、高亮会消失。 */
  function keyOf(el) {
    const fk = el.getAttribute("data-fk");
    if (fk) return fk;
    const dk = el.getAttribute("data-key");
    return dk || ("bid:" + el.getAttribute("data-bid"));
  }

  /* 此时此地读一份「编辑目标」的快照。必须在动手之前读 —— 下面一落地，DOM 就重建了。 */
  function specOf(el) {
    const s0 = parseInt(el.getAttribute("data-s"), 10);
    const e0 = parseInt(el.getAttribute("data-e"), 10);
    if (!(s0 >= 0) || !(e0 >= s0)) return null;
    const r = el.getBoundingClientRect();
    return {
      s: s0, e: e0,
      tex: el.getAttribute("data-tex") || "",
      prefix: el.getAttribute("data-prefix"),
      suffix: el.getAttribute("data-suffix"),
      what: el.getAttribute("data-what") || "",
      x: r.left, y: r.bottom + 6,
    };
  }

  /* preventDefault 挡掉了 blur，正在打字的正文块还没回写；而 applyEdits 是拿 content 算的。
   * 不先把正文落地就开浮层，两边行号会错位 —— 那是最容易丢稿的一种错位。 */
  function flushTextEdits() {
    if (!wysEditing.current) return;
    wysEditing.current = false;
    commitWysSession();
  }

  /* 打开某一处就地编辑器（原子块 / 导言区的某一项）。改点别处时先把上一处落地。 */
  function openAtom(el) {
    const key = keyOf(el);
    if (atomEdit && atomEdit.key === key) return;   // 已经开着它了
    const sp = specOf(el);
    if (!sp) return;
    if (atomEdit) commitAtom();                     // 上一处先提交，别丢
    flushTextEdits();                               // 正在打字的正文块也先落地
    pickAtom(el);
    const W = typeof window === "undefined" ? 1200 : window.innerWidth;
    const H = typeof window === "undefined" ? 800 : window.innerHeight;
    setAtomEdit({
      mode: "block", key: key, el: el, s: sp.s, e: sp.e, tex: sp.tex, orig: sp.tex,
      prefix: sp.prefix, suffix: sp.suffix, what: sp.what,
      x: Math.max(8, Math.min(sp.x, W - 556)),
      y: Math.max(8, Math.min(sp.y, H - 220)),
    });
  }

  /* 提交原子编辑。两条路径：
   *   行内 → 只改该节点的 data-tex，再走常规的块提交（wysDomToTex 遇到带 data-tex 的
   *          节点就原样吐出该属性，所以改属性 == 改这一块的回写结果，不需要重算偏移，
   *          也不会碰到块里别的原子）。
   *   块级 → 走 applyEdits 只替换**这一块的行区间**，三道自检一条不少。
   * 显示不在这里手动改：onChange 之后整层会用新源码重渲染，所见即所得。 */
  function commitAtom() {
    const a = atomEdit;
    if (!a) return;
    if (atomPickedRef.current) { try { atomPickedRef.current.classList.remove("picked"); } catch (e0) {} }
    atomPickedRef.current = null;
    if (a.tex === a.orig) { setAtomEdit(null); return; }

    if (a.mode === "inline") {
      setAtomEdit(null);
      let node = a.node;
      /* 浮层开着的这段时间里 DOM 可能被重建过（比如焦点一离开正文就触发了 commitWys）。
       * 那时原节点已经成了孤儿，往孤儿身上写 data-tex 等于把这次修改丢进黑洞。
       * 按「同一个块 + 同一段原文」把新节点找回来；找不到就明说，绝不假装改成功了。 */
      if (node && !node.isConnected) {
        const root2 = pvRef.current;
        const host = root2 && a.blkS != null ? root2.querySelector('.wys-blk[data-s="' + a.blkS + '"]') : null;
        const all = host ? host.querySelectorAll(".wys-atom") : [];
        node = null;
        for (let i = 0; i < all.length; i++) {
          if (all[i].getAttribute("data-tex") === a.orig) { node = all[i]; break; }
        }
      }
      if (!node || !node.setAttribute) {
        setToast({ msg: "⚠ 这一段在编辑期间被重排过，没能落回去 —— 请再点一次它" });
        return;
      }
      node.setAttribute("data-tex", a.tex);
      node.setAttribute("title", a.tex);
      /* v0.8.23：行内原子的**外观**（KaTeX 排出来的那个式子 / [1] 那个引用号）是从 data-tex
       * 渲染出来的。只改属性不重画，用户看到的是旧式子 —— 所以写回成功后照样重画。 */
      if (commitWysSession()) wysPaintFromSrc();   // 读回时 data-tex 已是新值 → 只改动所在的那一块
      return;
    }

    let next;
    /* v0.8.18：基准取「历史眼里的当前文档」。这一拍前面刚 flushTextEdits() 把正文打字
     * 落了盘，闭包里的 content 还是打字前的旧值 —— 拿它当基准会把刚打的字抹掉。 */
    const base0 = wysBase();
    try {
      if (WYS.applyEdits(base0, []) !== base0) throw new Error("空编辑集未逐字节还原");
      /* 导言区那几项改的只是「正文」，写回时要拼回前缀与后缀（\title{ … }）。
       * 自检：前缀 + **原正文** + 后缀 必须逐字节等于原行 —— 否则「改显示」就变成「改源码」了。 */
      let newText = a.tex;
      if (a.prefix != null || a.suffix != null) {
        const origText = base0.split("\n").slice(a.s, a.e + 1).join("\n");
        if (!WYS.partsExact({ prefix: a.prefix, body: a.orig, suffix: a.suffix }, origText)) {
          throw new Error("前缀/后缀拼接未能逐字节还原原行");
        }
        newText = WYS.partsJoin(a.prefix, a.tex, a.suffix);
      }
      next = WYS.applyEdits(base0, [{ startLine: a.s, endLine: a.e, newText: newText }]);
      WYS.parseDoc(next);
    } catch (err) {
      setToast({ msg: "⚠ 这一处的写回没过自检，已放弃：" + String((err && err.message) || err) });
      setAtomEdit(null);
      return;
    }
    wysPushTx(base0, next, a.what ? "改写" + a.what : "改写这一块");
    wysPaintFromSrc();     // v0.8.23：改写的是源码块，渲染结果（表格 / 图 / 公式）必须跟着重画
    onChange(next);
    setToast({ msg: "✏ 已就地改写" + (a.what ? a.what : "这一块") + "（L" + (a.s + 1) + (a.e > a.s ? "–" + (a.e + 1) : "") + "）", undo: true });
    setAtomEdit(null);
  }

  /* 行跳转：面板 / 内置大纲 / 预览点击都走这里。opts.flash=false 可关掉闪烁。
   *
   * v0.6.1 修「点大纲没反应」：可视化视图下 showSrc = false，源码 textarea 压根没挂载，
   * 而 setView("split") 是异步的 —— 当拍读 taRef 仍是 null。老实现这里直接 return，
   * 外面却照样回 ACK ⇒ 既不跳、面板又以为跳成功、兜底也不触发。
   * v0.7.2：跳不了也**不再偷偷切分屏** —— 在预览里滚过去闪一下（视作跳到了，照常回 ACK），
   * 只有 opts.source（用户点了「↗ 定位」）才允许切视图。 */
  function gotoLine(ln, opts) {
    const wantSrc = !!(opts && opts.source);
    const ta = taRef.current;
    if (!ta) {
      /* 源码 textarea 没挂载（预览视图；或刚切分屏的第一帧）。
       * 只要不是显式要源码，就在预览里兑现定位 —— 视图不动。 */
      /* 只有「预览就是唯一画布」才就地滚动；分屏里源码在场，照旧把光标送过去 */
      if (!wantSrc && view === "preview" && revealInPreview(ln, !opts || opts.flash !== false)) return true;
      pendingReveal.current = { ln: ln, flash: !opts || opts.flash !== false, ack: (opts && opts.ack) || null, source: wantSrc };
      if (wantSrc && view !== "split" && view !== "src") { setView("split"); writeHostMode("split"); }
      return false;
    }
    const lines = content.split("\n");
    let off = 0;
    for (let i = 0; i < ln - 1 && i < lines.length; i++) off += lines[i].length + 1;
    ta.focus();
    try { ta.setSelectionRange(off, off + (lines[ln - 1] || "").length); } catch (e) {}
    ta.scrollTop = Math.max(0, (ln - 1) * 20 - ta.clientHeight / 3);
    syncScroll(); updateCursor();
    if (!opts || opts.flash !== false) flashAt(ln);
    return true;
  }

  /* 回执：告诉面板「这一跳有人接住了」，面板才不再走兜底（打开文件 + 重发）。
   * v0.6.1 之前是「无条件回」，跳没跳成都不管 —— 那才是这个 bug 能藏这么久的原因。 */
  function ackReveal(ln, nonce) {
    try {
      window.dispatchEvent(new CustomEvent(LATEX_REVEAL_ACK, { detail: { path: filePath || "", line: ln, nonce: nonce || "" } }));
    } catch (e) {}
  }

  function onPreviewClick(e) {
    const t = e.target;
    /* 卡片工具条的按钮自己处理（切源码 / 显式定位），别被行跳转抢走 */
    if (t && t.closest && t.closest("[data-act]")) return;
    /* 有划选时点击预览 = 收尾选区，不做行跳转 */
    try {
      const sel = window.getSelection();
      if (sel && String(sel).trim()) return;
    } catch (e2) {}
    /* 点正文 / 标题 = 就地放光标写字。点原子块 = 在原地打开它的编辑器（mousedown 已接管）。
     * 两种都不动视图、不跳源码 —— 这就是「在结果上编辑」。 */
    if (t && t.closest && (t.closest(".wys-fmline") || t.closest(".wys-atom") || t.closest(".wys-atomblk"))) return;
    pickAtom(null);
  }

  function onKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (onSave) { try { onSave(); setSavedTick(Date.now()); } catch (e2) {} }
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      insert("  ");
    }
  }

  /* ---------- 派生数据 ---------- */
  const lines = useMemo(() => content.split("\n"), [content]);
  const highlighted = useMemo(() => lines.map(hlLine).join("\n") + "\n", [lines]);
  const wc = useMemo(() => countWords(content), [content]);
  const issueCount = issues ? issues.summary.errors + issues.summary.warnings + issues.summary.infos : 0;
  const toolReady = !!serverId;
  const showSrc = view !== "preview";
  const showPv = view !== "src";
  const flexPart = view === "split" ? "1 1 50%" : "1 1 100%";

  const taStyle = {
    position: "absolute", inset: 0, width: "100%", height: "100%",
    margin: 0, border: "none", outline: "none", resize: "none",
    padding: "8px 12px", fontFamily: MONO, fontSize: 13, lineHeight: FH,
    whiteSpace: "pre-wrap", overflowWrap: "break-word", overflow: "auto",
    background: "transparent", color: "transparent", caretColor: "hsl(var(--foreground))",
  };
  const preStyle = {
    position: "absolute", inset: 0, margin: 0, overflow: "hidden",
    padding: "8px 12px", fontFamily: MONO, fontSize: 13, lineHeight: FH,
    whiteSpace: "pre-wrap", overflowWrap: "break-word",
    color: "hsl(var(--foreground))", pointerEvents: "none",
  };

  return (
    /* v0.8.9：根节点必须可聚焦 —— Ctrl+/ 与格式快捷键的监听挂在这个节点上（见下面那个 effect）。
     * 切档会把带焦点的子树（预览层 / 源码 textarea）整个卸载，浏览器于是把 activeElement 扔回
     * <body>，而 <body> 不是本节点的子孙 ⇒ 之后的按键再也到不了那两个监听器：
     * 「切得过去、切不回来」的根因就在这里。tabIndex={-1} = 可编程聚焦，但不进 Tab 序列；
     * outline:none 去掉聚焦环（它是给按键用的落点，不是给人 Tab 过去的控件）。 */
    <div
      ref={rootRef}
      tabIndex={-1}
      style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, outline: "none", background: "hsl(var(--background))", color: "hsl(var(--foreground))" }}>
      <style dangerouslySetInnerHTML={{ __html: PV_CSS + WYS_CSS + UI_CSS }} />

      {/* 首屏引擎提示条（v0.8.5）：只在「没装 TeX 引擎」时出现，可关 + 记住。
       *   不是常驻控件：没装引擎只影响「编译 / 导出 PDF」，其余功能全正常 —— 这句话必须写在
       *   提示条里，否则用户会拿「插件坏了」这个错结论去排查。 */}
      {engineNote ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "5px 10px", fontSize: 12, lineHeight: 1.6, background: "hsl(38 92% 50% / .12)", borderBottom: "1px solid hsl(38 92% 50% / .4)" }}>
          <span>⚠ 未检测到 TeX 引擎，<b>只影响「编译 / 导出 PDF」</b>；编辑、大纲、引用校验、公式预览、导出 HTML 都正常。</span>
          <span style={{ color: "hsl(var(--muted-foreground))" }}>
            装好即用、无需配 PATH：<code style={{ fontFamily: MONO }}>{engineNote.installHint || "winget install MiKTeX.MiKTeX"}</code>
          </span>
          <div style={{ flex: 1 }} />
          <button style={tbtn} onClick={recheckEngine} disabled={busy === "env"} title="清掉缓存重新探测（刚装完引擎时点它）">
            {busy === "env" ? "⏳" : "🔄"} 重新检测
          </button>
          <button style={{ ...tbtn, border: "none", background: "transparent" }} onClick={dismissEngineNote} title="记住了：这台机器上不再提示">
            知道了
          </button>
        </div>
      ) : null}

      {/* 工具栏（v0.8.3：视图切换搬去宿主标签栏的模式开关，这里只剩文档级动作）
       *   删掉的是「📄 源码 / ⧉ 分屏 / 📑 预览」那排分段按钮 —— 档位是同一件事，
       *   宿主标签栏已经有一份权威的（就是标签 tab 旁边那排），编辑器内再画一份只会互相打架。
       *   留下的（宿主不管的）：＋插入 / 编译 / 校验 / 导出 / MCP 状态点。 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderBottom: "1px solid hsl(var(--border))", flexWrap: "wrap" }}>
        {view !== "src" ? (
          <span style={{ fontSize: 11.5, color: "hsl(var(--muted-foreground))", whiteSpace: "nowrap" }}>
            ✏ 点哪改哪 · 公式点一下原地编辑
          </span>
        ) : null}

        {view !== "preview" ? (
          <div ref={menuRef} style={{ position: "relative" }}>
            <button style={tbtn} onClick={() => setMenu(!menu)} title="插入常用结构（右侧标注的快捷键，在源码 / 分屏视图生效）">＋ 插入 {menu ? "▴" : "▾"}</button>
            {menu ? (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 40, minWidth: 224, maxHeight: 430, overflowY: "auto", padding: 4, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", boxShadow: "0 8px 24px rgba(0,0,0,.25)" }}>
                {INSERT_GROUPS.map((g) => {
                  const rows = INSERTS.filter((it) => it[4] === g);
                  if (!rows.length) return null;
                  return (
                    <div key={g}>
                      <div className="lx-mh">{g}</div>
                      {rows.map((it) => (
                        <button key={it[0]} className="lx-mi" onClick={() => { insert(it[1], it[2]); setMenu(false); }}>
                          <span>{it[0]}</span>
                          {it[3] ? <span className="lx-kbd">{it[3]}</span> : null}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* v0.8.22：可视化档以前**没有**任何「加一段」的入口 —— 用户原话「我想要加内容块」。
            最小的一步给到：在光标所在段落下面新起一段（原理见 addParagraph）。 */}
        {view !== "src" ? (
          <button style={tbtn} onClick={addParagraph} title="在光标所在段落下面新起一段（可视化档里等同在段落末尾按一下回车）">¶ 新段落</button>
        ) : null}

        <div style={{ flex: 1 }} />

        <button style={{ ...tbtn, border: "none", background: "transparent" }} onClick={doCompile} disabled={busy === "compile"} title="编译当前 .tex（MCP latex_compile）">
          {busy === "compile" ? "⏳" : "🔨"} 编译
        </button>
        <button style={{ ...tbtn, border: "none", background: "transparent" }} onClick={doValidate} disabled={busy === "validate"} title="校验 ref / cite / label（MCP latex_validate）">
          {busy === "validate" ? "⏳" : "✅"} 校验
        </button>

        <div ref={exMenuRef} style={{ position: "relative" }}>
          <button
            style={{ ...tbtn, border: "none", background: "transparent" }}
            onClick={() => setExMenu(!exMenu)}
            disabled={busy === "export"}
            title="导出 PDF / 自包含 HTML，并可预览（MCP latex_export）"
          >
            {busy === "export" ? "⏳" : "⬇"} 导出 {exMenu ? "▴" : "▾"}
          </button>
          {exMenu ? (
            <div style={tmenu}>
              <div style={tcap}>预览（不重编，秒开）</div>
              <button style={titem} onClick={() => { setExMenu(false); doPreview("pdf"); }}>👁 预览 PDF</button>
              <button style={titem} onClick={() => { setExMenu(false); doPreview("html"); }}>👁 预览 HTML</button>
              <div style={tsep} />
              <div style={tcap}>导出到文档旁</div>
              <button style={titem} onClick={() => { setExMenu(false); doExport("pdf", "same"); }}>📄 PDF（编译生成）</button>
              <button style={titem} onClick={() => { setExMenu(false); doExport("html", "same"); }}>🌐 HTML（自包含 · 可分享 / 打印）</button>
              <div style={tsep} />
              <div style={tcap}>导出到桌面</div>
              <button style={titem} onClick={() => { setExMenu(false); doExport("pdf", "desktop"); }}>📄 PDF → 桌面</button>
              <button style={titem} onClick={() => { setExMenu(false); doExport("html", "desktop"); }}>🌐 HTML → 桌面</button>
            </div>
          ) : null}
        </div>
        <span
          title={toolReady ? (katexOkRef.current ? "MCP 工具就绪 · 公式用 KaTeX 渲染" : "MCP 工具就绪 · 公式走内置简易渲染") : "MCP 未连接：解析 / 编译不可用"}
          style={{ fontSize: 11, color: toolReady ? "hsl(var(--muted-foreground))" : "#f59e0b" }}
        >{toolReady ? (katexOkRef.current ? "⚙ ✓" : "⚙") : "⚙ 未连接"}</span>
      </div>

      {/* 主体：源码 + 预览（v0.6.1 起编辑器内不再内嵌大纲，章节导航统一走左侧「章节大纲」面板） */}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>

        {showSrc ? (
          <div style={{ flex: flexPart, minWidth: 0, display: "flex", position: "relative" }}>
            <div ref={gutterRef} style={{
              width: 34, overflow: "hidden", textAlign: "right", padding: "8px 6px 8px 0",
              fontFamily: MONO, fontSize: 13, lineHeight: FH,
              color: "hsl(var(--muted-foreground))", userSelect: "none",
              background: "hsl(var(--muted) / 0.3)", borderRight: "1px solid hsl(var(--border))",
              flexShrink: 0,
            }}>
              {lines.map((_, i) => (
                <div key={i} style={flashLine === i + 1 ? { color: "hsl(var(--primary))", fontWeight: 700, background: "hsl(var(--primary) / 0.14)" } : null}>{i + 1}</div>
              ))}
            </div>
            <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
              {/* 定位闪烁层：top 由 paintFlash 跟着 scrollTop 算，pointerEvents 关掉不挡输入 */}
              <div ref={flashRef} style={{
                position: "absolute", left: 0, right: 0, height: 20, top: -999,
                background: "hsl(var(--primary) / 0.13)", borderLeft: "2px solid hsl(var(--primary))",
                pointerEvents: "none", opacity: 0, transition: "opacity .25s", zIndex: 1,
              }} />
              <pre ref={preRef} style={preStyle} dangerouslySetInnerHTML={{ __html: highlighted }} />
              <textarea
                ref={taRef}
                style={taStyle}
                value={content}
                spellCheck={false}
                onChange={(e) => { onChange(e.target.value); updateCursor(); setQuote(null); }}
                onScroll={syncScroll}
                onKeyDown={onKeyDown}
                onClick={updateCursor}
                onKeyUp={(e) => { updateCursor(); captureSrcQuoteKb(); }}
                onMouseUp={captureSrcQuote}
              />
            </div>
          </div>
        ) : null}

        {showPv ? (
          <div
            /* v0.8.29：文档列有 maxWidth（860）居中，两侧那两条灰边**不在** .pv-root 里 ——
             * 以前点那儿一点反应都没有（没有光标、也没人管）。现在照样送光标进最近的正文块：
             * 与 v0.8.20「点空白处落光标」同一条规矩。pv-root 里面的事仍由它自己那份处理，
             * 这里只兜「它管不到的地方」。 */
            onMouseDown={(ev) => {
              const r0 = pvRef.current;
              if (r0 && r0.contains && ev.target && r0.contains(ev.target)) return;
              onPreviewMouseDown(ev);
            }}
            style={{
            flex: flexPart, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden",
            borderLeft: view === "split" && showSrc ? "1px solid hsl(var(--border))" : "none",
            background: "hsl(var(--card))",
          }}>
            <div
              ref={pvRef}
              className="pv-root"
              onScroll={syncScrollFromPv}
              onClick={onPreviewClick}
              onMouseDown={onPreviewMouseDown}
              onMouseUp={capturePvQuote}
              onFocus={onWysFocusIn}
              onBlur={onWysFocusOut}
              onInput={onWysInput}
              onCompositionEnd={onWysInput}
              onKeyDown={onWysKeyDown}
              onPaste={onWysPaste}
              contentEditable={false}
              suppressContentEditableWarning
              style={{ flex: 1, overflowY: "auto", padding: "6px 22px 48px", fontSize: 14, lineHeight: 1.8, maxWidth: 860, margin: "0 auto", width: "100%" }}
            />
          </div>
        ) : null}
      </div>

      {/* 原子块的就地编辑器：浮在被点的那一块旁边。
       * 上面 = 实时渲染（改一个字就重画一次，所见即所得）；下面 = 真正的 LaTeX。
       * 这是「在结果上编辑」对有损渲染节点的答案：位置在结果上，改的是源码，不离开预览。 */}
      {atomEdit ? (
        <div>
          <div
            className="wys-pop-dim"
            onMouseDown={(ev) => { ev.preventDefault(); commitAtom(); }}
          />
          <div className="wys-pop" style={{ left: atomEdit.x, top: atomEdit.y }}>
            <div className="wys-pop-h">
              <b>{atomEdit.mode === "inline" ? "就地编辑引用" : (atomEdit.what ? "就地编辑 · " + atomEdit.what : "就地编辑这一块")}</b>
              <span>{atomEdit.mode === "inline" ? "改完这段立刻生效" : "L" + (atomEdit.s + 1) + (atomEdit.e > atomEdit.s ? "–" + (atomEdit.e + 1) : "")}</span>
              <span className="wys-pop-keys">Esc 取消 · Ctrl+Enter 保存 · 点外面保存</span>
            </div>
            <div className="wys-pop-pv" dangerouslySetInnerHTML={{ __html: atomPvHtml }} />
            <textarea
              className="wys-pop-ta"
              autoFocus
              spellCheck={false}
              rows={Math.min(14, Math.max(3, atomEdit.tex.split("\n").length + 1))}
              value={atomEdit.tex}
              onChange={(ev) => setAtomEdit({ ...atomEdit, tex: ev.target.value })}
              onKeyDown={(ev) => {
                ev.stopPropagation();
                if (ev.key === "Escape") { ev.preventDefault(); setAtomEdit(null); }
                else if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); commitAtom(); }
              }}
            />
          </div>
        </div>
      ) : null}

      {/* 底部结果面板：v0.7.2 起「有结果才出现」—— 常驻的三按钮条太吵 */}
      {issues || compileOut || err || exportInfo ? (
      <div style={{ borderTop: "1px solid hsl(var(--border))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 10px" }}>
          <button style={tbtn} onClick={() => setBottomOpen(!bottomOpen)}>
            {bottomOpen ? "▾" : "▸"} 结果
          </button>
          <button
            style={{ ...tbtn, border: "none", background: "transparent", color: bottomTab === "issues" ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}
            onClick={() => { setBottomTab("issues"); setBottomOpen(true); }}
          >
            ✅ 校验 {issues ? `(${issueCount})` : ""}
          </button>
          <button
            style={{ ...tbtn, border: "none", background: "transparent", color: bottomTab === "compile" ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}
            onClick={() => { setBottomTab("compile"); setBottomOpen(true); }}
          >
            🔨 编译 {compileOut ? "•" : ""}
          </button>
          {exportInfo ? (
            <button
              style={{ ...tbtn, border: "none", background: "transparent", color: bottomTab === "export" ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}
              onClick={() => { setBottomTab("export"); setBottomOpen(true); }}
            >
              ⬇ 导出 {exportInfo.ok === false ? "⚠" : "•"}
            </button>
          ) : null}
          {err ? <span style={{ fontSize: 11, color: "#ef4444" }}>⚠ {err}</span> : null}
          <div style={{ flex: 1 }} />
          <button style={{ ...tbtn, border: "none", background: "transparent", color: "hsl(var(--muted-foreground))" }} onClick={() => setBottomOpen(false)} title="收起结果">✕</button>
        </div>
        {bottomOpen ? (
          <div style={{ maxHeight: 180, overflowY: "auto", padding: "4px 12px 10px", fontSize: 12, lineHeight: 1.7 }}>
            {bottomTab === "issues" ? (
              !issues ? (
                <span style={{ color: "hsl(var(--muted-foreground))" }}>尚未校验——点工具栏「✅ 校验」。</span>
              ) : issueCount === 0 ? (
                <span style={{ color: "#22c55e" }}>✅ 未发现问题</span>
              ) : (
                issues.issues.map((i, k) => (
                  <div key={k} onClick={() => gotoLine(i.line)} style={{ cursor: "pointer" }}>
                    <span style={{ color: i.severity === "error" ? "#ef4444" : i.severity === "warning" ? "#f59e0b" : "#94a3b8" }}>
                      {i.severity === "error" ? "🔴" : i.severity === "warning" ? "🟡" : "⚪"}
                    </span>{" "}
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>L{i.line}</span> {i.message}
                  </div>
                ))
              )
            ) : bottomTab === "export" ? (
              exportInfo ? (
                <div>
                  {exportInfo.ok === false ? (
                    <span style={{ color: "#ef4444" }}>⚠ {exportInfo.message || "导出失败"}</span>
                  ) : (
                    <div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                        <span style={{ color: "#22c55e" }}>✅ 已导出 {String(exportInfo.format || "").toUpperCase()}</span>
                        <span style={{ color: "hsl(var(--muted-foreground))" }}>
                          {fmtSize(exportInfo.bytes)}
                          {exportInfo.format === "html" ? " · 公式" + (exportInfo.math === "katex" ? " KaTeX 排版" : " 近似排版") + " · 内嵌图 " + imgCount(exportInfo) + " 张" : ""}
                          {exportInfo.reused ? " · 产物已是最新，未重编" : ""}
                          {exportInfo.from === "server" ? " · 正文由服务端内核渲染" : ""}
                        </span>
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 11, wordBreak: "break-all", color: "hsl(var(--muted-foreground))" }}>{exportInfo.outPath}</div>
                      {exportInfo.images && exportInfo.images.missing && exportInfo.images.missing.length ? (
                        <div style={{ color: "#f59e0b" }}>🖼 有 {exportInfo.images.missing.length} 张图没能内嵌：{exportInfo.images.missing.join("、")}</div>
                      ) : null}
                      <div style={{ marginTop: 5, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button style={tbtn} onClick={() => openInHost(exportInfo.outPath)}>👁 预览</button>
                        <button style={tbtn} onClick={copyPath}>📋 复制路径</button>
                        <button style={tbtn} onClick={() => doExport(exportInfo.format, "desktop")}>🖥 再导一份到桌面</button>
                        <button style={tbtn} onClick={() => doExport(exportInfo.format, "downloads")}>📥 再导一份到下载</button>
                        <button style={tbtn} onClick={() => doExport(exportInfo.format, "same", { force: true })}>🔄 重新生成</button>
                      </div>
                    </div>
                  )}
                  {exportInfo.log ? (
                    <pre style={{ margin: "8px 0 0", fontFamily: MONO, fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 110, overflowY: "auto" }}>{exportInfo.log}</pre>
                  ) : null}
                </div>
              ) : (
                <span style={{ color: "hsl(var(--muted-foreground))" }}>还没有导出过 —— 点工具栏「⬇ 导出」。</span>
              )
            ) : (
              compileOut ? (
                <pre style={{ margin: 0, fontFamily: MONO, fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{compileOut}</pre>
              ) : (
                <span style={{ color: "hsl(var(--muted-foreground))" }}>尚未编译——点工具栏「🔨 编译」。</span>
              )
            )}
          </div>
        ) : null}
      </div>
      ) : null}

      {/* 状态栏：只留每拍真的会看的（v0.7.2 去掉行数、中英拆分这些噪音） */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "2px 10px", borderTop: "1px solid hsl(var(--border))", fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
        <span>Ln {cursor.line}, Col {cursor.col}</span>
        <span>≈ {wc.total} 字</span>
        {savedTick ? <span style={{ color: "#22c55e" }}>已保存 ✓</span> : null}
        <div style={{ flex: 1 }} />
        <span>{katexOkRef.current ? "∑ KaTeX" : "∑ 简易渲染"}</span>
        <span>{fileName || "LaTeX"}</span>
      </div>

      {/* 划词引用气泡 */}
      {quote ? (
        <div ref={bubbleRef} style={{ position: "fixed", left: quote.x, top: quote.y, zIndex: 60 }}>
          <button
            onClick={doQuote}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))",
              border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 12.5,
              cursor: "pointer", boxShadow: "0 6px 20px rgba(0,0,0,.28)", whiteSpace: "nowrap",
            }}
            title="把选中文本作为引用卡片发到 AI 侧栏"
          >
            💬 引用到对话{quote.lineFrom ? <span style={{ opacity: 0.75 }}>L{quote.lineFrom}{quote.lineTo && quote.lineTo !== quote.lineFrom ? "–" + quote.lineTo : ""}</span> : null}
          </button>
        </div>
      ) : null}

      {/* toast 提示 */}
      {toast ? (
        <div style={{
          position: "fixed", bottom: 64, left: "50%", transform: "translateX(-50%)", zIndex: 70,
          background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))",
          border: "1px solid hsl(var(--border))", borderRadius: 8, padding: "6px 14px",
          fontSize: 12, boxShadow: "0 6px 20px rgba(0,0,0,.25)", whiteSpace: "nowrap",
        }}>
          <span>{toast.msg}</span>
          {toast.undo ? (
            <button
              onClick={undoWys}
              style={{
                marginLeft: 10, border: "1px solid hsl(var(--border))", borderRadius: 6,
                background: "transparent", color: "hsl(var(--primary))",
                fontSize: 11.5, padding: "1px 8px", cursor: "pointer",
              }}
            >↩ 撤销</button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
