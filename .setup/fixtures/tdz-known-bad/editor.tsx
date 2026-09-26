import React, { useState, useRef, useEffect, useMemo } from "react";
/*__LPC__*/
/*__WYS__*/

/**
 * LaTeX 编辑器 v0.3.2 — editors 贡献面（接管 .tex 文件）
 * Overleaf 式分栏实时预览 + 划词引用到 Sidebar（notrat-quote-to-chat 第一方通道）
 * props: { pluginId, ctx, file, content, onChange, onSave, fileName, filePath,
 *          mode?, onModeSwitch?, setStatus }   // dualView 声明后才有 mode/onModeSwitch；setStatus 恒有
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
 *   2) 用户改完，用 WYS.applyEdits 只替换**被改过的那几块**的行区间。
 *
 * 红线：绝不从渲染结果反向重建整篇源码。
 *   \cite{vaswani2017} 渲染成 "[1]"、\ref{fig:model} 渲染成 "图 1" —— 都是有损的。
 *   一旦「HTML → LaTeX」，用户敲一次字就会烧掉 \cite / \ref / 宏定义。
 *   所以原子节点一律 contenteditable=false + data-tex，回写时原样吐出。
 * =================================================================== */
const WYS_CSS = `
.wys-blk{position:relative;border-radius:6px;margin:2px 0}
.wys-blk:hover{background:hsl(var(--muted)/.35)}
.wys-blk:focus-within{background:hsl(var(--primary)/.06);box-shadow:inset 0 -2px 0 hsl(var(--primary)/.55)}
.wys-edit{outline:none;display:inline;white-space:pre-wrap;overflow-wrap:break-word;min-width:1em}
.wys-h1{font-size:20px;font-weight:700;margin:26px 0 10px;padding-bottom:4px;border-bottom:1px solid hsl(var(--border))}
.wys-h2{font-size:17px;font-weight:700;margin:22px 0 8px}
.wys-h3{font-size:15px;font-weight:700;margin:18px 0 6px}
.wys-p{margin:0 0 10px}
.wys-fix{color:hsl(var(--muted-foreground)/.7);font-family:Consolas,'Courier New',monospace;font-size:.85em;white-space:pre-wrap}
.wys-atom{border-radius:4px;padding:0 2px}
.wys-math{padding:0 1px}
.wys-cite,.wys-ref{color:hsl(var(--primary));border-bottom:1px dotted hsl(var(--primary));font-size:.9em}
.wys-cmt{color:#71717a;font-family:Consolas,monospace;font-size:.9em}
.wys-wrap{white-space:pre-wrap}
.wys-card{border:1px dashed hsl(var(--border));border-radius:10px;padding:8px 12px;margin:12px 0;background:hsl(var(--muted)/.22);cursor:pointer}
.wys-card:hover{background:hsl(var(--muted)/.42);border-color:hsl(var(--primary)/.5)}
.wys-card-h{display:flex;justify-content:space-between;gap:10px;font-size:11.5px;color:hsl(var(--muted-foreground));margin-bottom:4px}
.wys-card-ln{font-family:Consolas,monospace;opacity:.8}
.wys-card-src{margin:0;white-space:pre-wrap;overflow-wrap:break-word;font-family:Consolas,'Courier New',monospace;font-size:12.5px;line-height:1.6;color:hsl(var(--foreground)/.82);max-height:260px;overflow:auto}
.wys-err{color:#ef4444;padding:10px;font-size:13px}
.wys-tag{color:hsl(var(--muted-foreground));font-size:11px;font-family:Consolas,monospace}
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
      const op = n.getAttribute("data-open");
      if (op != null) { out += op; walk(n); out += "}"; continue; }
      walk(n);
    }
  }
  walk(root);
  /* contentEditable 会塞不换行空格与零宽字符，必须归一再比对 */
  return out.replace(/\u00a0/g, " ").replace(/\u200b/g, "").replace(/\r\n?/g, "\n");
}

/* 整篇 → 就地编辑层 HTML。只渲染块模型给出的边界，绝不重新发明结构。 */
function wysRenderDoc(src, renderMath) {
  let doc;
  try { doc = WYS.parseDoc(src); }
  catch (e) { return '<div class="wys-err">块模型解析失败：' + WYS.escHtml(String((e && e.message) || e)) + "</div>"; }
  const out = [];
  const blocks = doc.blocks || [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const base = ' data-bid="' + b.id + '" data-s="' + b.startLine + '" data-e="' + b.endLine + '" data-type="' + escAttr(b.type) + '"';
    if (b.editable && (b.type === "heading" || b.type === "paragraph")) {
      if (b.type === "heading") {
        const lv = b.level <= 1 ? 1 : b.level === 2 ? 2 : 3;
        out.push(
          '<div class="wys-blk wys-h' + lv + '"' + base +
            ' data-prefix="' + escAttr(b.prefix) + '" data-suffix="' + escAttr(b.suffix) + '">' +
            '<span class="wys-fix" contenteditable="false">' + WYS.escHtml(b.prefix) + "</span>" +
            '<span class="wys-edit" contenteditable="true">' + wysInline(b.title, renderMath) + "</span>" +
            '<span class="wys-fix" contenteditable="false">' + WYS.escHtml(b.suffix) + "</span>" +
          "</div>"
        );
      } else {
        out.push(
          '<div class="wys-blk wys-p"' + base + ">" +
            '<span class="wys-edit" contenteditable="true">' + wysInline(b.raw, renderMath) + "</span>" +
          "</div>"
        );
      }
      continue;
    }
    /* 原子块：只读卡片。点一下走已有 onPreviewClick 的 data-line 通路跳源码 */
    const raw = String(b.raw == null ? "" : b.raw);
    const shown = raw.length > 800 ? raw.slice(0, 800) + "\n…（共 " + raw.split("\n").length + " 行，点开看源码）" : raw;
    out.push(
      '<div class="wys-card" data-line="' + (b.startLine + 1) + '"' + base + ">" +
        '<div class="wys-card-h"><span class="wys-tag">' + WYS.escHtml(b.label || b.type) + "</span>" +
          '<span class="wys-card-ln">L' + (b.startLine + 1) + (b.endLine > b.startLine ? "–" + (b.endLine + 1) : "") + "</span></div>" +
        '<pre class="wys-card-src">' + WYS.escHtml(shown) + "</pre>" +
      "</div>"
    );
  }
  return out.join("");
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
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [issues, setIssues] = useState(null);
  const [compileOut, setCompileOut] = useState("");
  const [bottomTab, setBottomTab] = useState("issues"); // issues | compile
  const [bottomOpen, setBottomOpen] = useState(false);
  const [savedTick, setSavedTick] = useState(0);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [view, setView] = useState("split"); // src | split | preview
  // 宿主「源码 / 可视化」双视图（manifest editors[].dualView = ["可视化","源码"]）
  // 权威契约：props.mode = "wysiwyg" | "source"，props.onModeSwitch(mode) 回写标题栏开关。
  // 旧版读 props.viewMode / props.dualViewMode —— 宿主从不注入这两个名字，且字面量 "wysiwyg"
  // 匹配不上旧正则 /vis|preview/，导致双视图完全失效。
  const hostMode =
    props.mode !== undefined ? props.mode
    : props.viewMode !== undefined ? props.viewMode
    : props.dualViewMode !== undefined ? props.dualViewMode
    : undefined;
  useEffect(() => {
    if (hostMode === undefined || hostMode === null) return;
    const hv = String(hostMode).toLowerCase();
    if (hv === "wysiwyg" || /vis|preview|render|read|pdf/.test(hv)) setView("preview");
    else if (hv === "source" || /src|code|edit|write|text/.test(hv)) setView("src");
  }, [hostMode]);
  /* 本编辑器三档视图 -> 宿主二态开关的回写（分屏无宿主对应态，不回写，避免抖动） */
  const goView = (v) => {
    /* 离开可视化视图前把改动落盘：否则切到源码视图会看到旧内容 */
    if (view === "preview" && v !== "preview") commitWys();
    setView(v);
    if (typeof props.onModeSwitch === "function") {
      if (v === "preview") props.onModeSwitch("wysiwyg");
      else if (v === "src") props.onModeSwitch("source");
    }
  };
  const [katexVer, setKatexVer] = useState(0);
  const [quote, setQuote] = useState(null); // {text, lineFrom, lineTo, x, y}
  const [toast, setToast] = useState(null); // {msg; undo?}
  /* 就地编辑开关：可视化视图默认开着；关掉退回只读预览 */
  const [wysOn, setWysOn] = useState(true);

  const taRef = useRef(null);
  const preRef = useRef(null);
  const gutterRef = useRef(null);
  const pvRef = useRef(null);
  const bubbleRef = useRef(null);
  const pendingCursor = useRef(null);
  /* v0.6.1：待补跳的行 —— 源码还没挂载时 gotoLine 跳不了，先存这里，DOM 就绪那一拍兑现 */
  const pendingReveal = useRef(null);
  const katexOkRef = useRef(false);
  const assetCache = useRef(new Map());
  /* 行定位闪烁："跳过去了"要看得见，否则用户不知道点没点中 */
  const [flashLine, setFlashLine] = useState(0);
  const flashRef = useRef(null);
  const flashLineRef = useRef(0);
  const flashTimer = useRef(null);
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
  const wysUndoRef = useRef(null);

  const wys = useMemo(() => {
    try { return { html: wysRenderDoc(content, renderMath) }; }
    catch (e) { return { html: '<div class="wys-err">就地编辑层渲染失败：' + esc(String((e && e.message) || e)) + "</div>" }; }
  }, [content, renderMath]);

  /* 提交：只回写被改过的块。返回新源码；无改动 / 自检不过返回 null。 */
  function commitWys() {
    if (!wysOn) return null;
    const root = pvRef.current;
    if (!root || wysEditing.current) return null;
    const blks = root.querySelectorAll(".wys-blk");
    if (!blks.length) return null;
    const edits = [];
    for (let i = 0; i < blks.length; i++) {
      const el = blks[i];
      const part = el.querySelector(".wys-edit");
      if (!part) continue;
      const s = parseInt(el.getAttribute("data-s"), 10);
      const e = parseInt(el.getAttribute("data-e"), 10);
      if (!(s >= 0) || !(e >= s)) continue;
      const now = wysDomToTex(part);
      const orig = wysOrigRef.current.get(el.getAttribute("data-bid"));
      if (orig != null && now === orig) continue;        // 没动过的块不进 edit 列表
      if (el.getAttribute("data-type") === "heading") {
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
    wysUndoRef.current = content;
    onChange(next);
    setToast({ msg: "✏ 已就地写回 " + edits.length + " 处改动", undo: true });
    return next;
  }

  function undoWys() {
    const prev = wysUndoRef.current;
    if (prev == null) return;
    wysUndoRef.current = null;
    wysEditing.current = false;
    onChange(prev);
    setToast({ msg: "↩ 已撤销本次就地编辑" });
  }

  function onWysFocusIn() { wysEditing.current = true; }
  function onWysFocusOut(e) {
    /* React 的 onBlur = focusout（冒泡）：焦点仍在层内就不算离开 */
    if (e.currentTarget && e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return;
    wysEditing.current = false;
    commitWys();
  }

  /* Enter = 块内换行（段内续行，合法 LaTeX）；不引入 <div> 污染块结构 */
  function onWysKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      commitWys();
      if (onSave) { try { onSave(); setSavedTick(Date.now()); } catch (e2) {} }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      try { document.execCommand("insertText", false, "\n"); } catch (e3) {}
    }
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
    let sec = 0, eq = 0, fig = 0, tab = 0, cite = 0, todo = 0;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      /* TODO/FIXME 本来就写在注释里 —— 必须先数再跳过整行注释 */
      if (/%.*\b(TODO|FIXME|XXX)\b/i.test(l)) todo++;
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
    return { sec: sec, eq: eq, fig: fig, tab: tab, cite: cite, todo: todo, words: countWords(content).total };
  }, [content]);

  useEffect(() => {
    if (typeof props.setStatus !== "function") return;
    if (!isActiveEditor) return; // 非活动实例保持沉默：宿主只认一个 owner，抢着推只会互相盖
    const items = [
      { id: "sec", text: "📑 " + stats.sec + " 节", title: "章节数（\\part / \\chapter / \\section / \\subsection / \\subsubsection）" },
      { id: "env", text: "∑" + stats.eq + " · 图" + stats.fig + " · 表" + stats.tab, title: "公式 / 图 / 表环境数" },
      { id: "cite", text: "🔖 " + stats.cite + " · ≈" + stats.words + " 字", title: "\\cite 引用数 · 近似字数（CJK 字 + 英文词）" },
    ];
    if (stats.todo) items.push({ id: "todo", text: "📌 " + stats.todo + " 待办", title: "源码注释里的 TODO / FIXME" });
    if (issues && issues.summary) {
      const sm = issues.summary;
      items.push({
        id: "issue",
        text: (sm.errors + sm.warnings > 0 ? "⚠ " : "✅ ") + sm.errors + " 错 / " + sm.warnings + " 警",
        title: "引用校验结果（点工具栏「校验」刷新）",
      });
    }
    if (view !== "src" && wysOn) items.push({ id: "wys", text: "✏ 就地编辑", title: "可视化视图可直接改正文与标题；失焦即写回源码，只替换被改的块" });
    items.push({ id: "pos", text: "Ln " + cursor.line + ", Col " + cursor.col, title: "光标位置" });
    try { props.setStatus(items.slice(0, 6)); } catch (e) {}
  }, [stats, cursor.line, cursor.col, issues, isActiveEditor, props.setStatus, view, wysOn]);

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
    gotoLineRef.current(p.ln, { flash: p.flash });
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

  async function doCompile() {
    /* 编译读的是磁盘文件：先提交 + 保存，别拿旧文件糊弄用户 */
    const pendingC = commitWys();
    if (pendingC != null && onSave) { try { onSave(); } catch (e0) {} }
    setBusy("compile"); setErr(""); setBottomTab("compile"); setBottomOpen(true);
    try { setCompileOut(await callTool("latex_compile", { path: filePath })); }
    catch (e) { setErr(String(e.message || e)); }
    finally { setBusy(""); }
  }

  async function doValidate() {
    const pendingV = commitWys();
    if (pendingV != null && onSave) { try { onSave(); } catch (e0) {} }
    setBusy("validate"); setErr(""); setBottomTab("issues"); setBottomOpen(true);
    try {
      const out = await callTool("latex_validate", { path: filePath, format: "json" });
      setIssues(JSON.parse(out));
    } catch (e) { setErr(String(e.message || e)); }
    finally { setBusy(""); }
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

  /* ---------- 实时预览 ---------- */
  const baseDir = useMemo(() => {
    const p = String(filePath || "");
    const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
    return i > 0 ? p.slice(0, i) : "";
  }, [filePath]);

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

  const pv = useMemo(() => {
    try {
      return LPC.renderPreview(content, { renderMath: renderMath, baseDir: baseDir });
    } catch (e) {
      return { html: '<p class="pv-bad">预览渲染失败: ' + esc(String((e && e.message) || e)) + "</p>" };
    }
  }, [content, renderMath, baseDir]);

  /* 预览内图片懒加载（走 MCP 读本地文件 → dataURI） */
  useEffect(() => {
    if (!pvRef.current || !serverId) return;
    const imgs = pvRef.current.querySelectorAll("img[data-asset]");
    let chain = Promise.resolve();
    imgs.forEach((img) => {
      const p = img.getAttribute("data-asset");
      if (!p) return;
      if (assetCache.current.has(p)) { img.src = assetCache.current.get(p); return; }
      chain = chain.then(async () => {
        try {
          const out = await callTool("latex_asset", { path: p });
          const a = JSON.parse(out);
          if (a && a.dataUri) { assetCache.current.set(p, a.dataUri); img.src = a.dataUri; }
        } catch (e) { /* 找不到图就留空 */ }
      });
    });
  }, [pv.html, katexVer, serverId]);

  /* ---------- 就地编辑层 innerHTML 同步 ----------
   * 无 deps：每拍都试，靠 root.__latexHtml 做幂等守卫（省掉无谓的 DOM 重建）。
   * ⚠ wysEditing.current 为真时直接返回 —— 编辑期间 DOM 是权威，回写会把光标顶到开头。 */
  useEffect(() => {
    const root = pvRef.current;
    if (!root) return;
    if (wysEditing.current) return;
    const html = wysOn ? wys.html : pv.html;
    if (root.__latexHtml === html) return;
    root.__latexHtml = html;
    root.innerHTML = html;
    /* 记下渲染时的原文：commit 靠它判断「这块到底动没动」 */
    const map = new Map();
    if (wysOn) {
      const blks = root.querySelectorAll(".wys-blk");
      for (let i = 0; i < blks.length; i++) {
        const p = blks[i].querySelector(".wys-edit");
        map.set(blks[i].getAttribute("data-bid"), p ? wysDomToTex(p) : "");
      }
    }
    wysOrigRef.current = map;
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

  /* toast 自动消失 */
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
  function insert(text, back) {
    const ta = taRef.current; if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    onChange(content.slice(0, s) + text + content.slice(e));
    pendingCursor.current = s + text.length - (back || 0);
  }

  useEffect(() => {
    if (pendingCursor.current != null && taRef.current) {
      const p = pendingCursor.current;
      pendingCursor.current = null;
      taRef.current.focus();
      try { taRef.current.setSelectionRange(p, p); } catch (e) {}
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

  function syncScroll() {
    const ta = taRef.current; if (!ta) return;
    if (preRef.current) { preRef.current.scrollTop = ta.scrollTop; preRef.current.scrollLeft = ta.scrollLeft; }
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
    const pvEl = pvRef.current;
    if (pvEl && view === "split") {
      const ratio = ta.scrollTop / Math.max(1, ta.scrollHeight - ta.clientHeight);
      pvEl.scrollTop = ratio * Math.max(0, pvEl.scrollHeight - pvEl.clientHeight);
    }
    if (flashLineRef.current) paintFlash(flashLineRef.current);
  }

  /* 行跳转：面板 / 内置大纲 / 预览点击都走这里。opts.flash=false 可关掉闪烁。
   *
   * v0.6.1 修「点大纲没反应」：可视化视图下 showSrc = false，源码 textarea 压根没挂载，
   * 而 setView("split") 是异步的 —— 当拍读 taRef 仍是 null。老实现这里直接 return，
   * 外面却照样回 ACK ⇒ 既不跳、面板又以为跳成功、兜底也不触发。
   * 现在：跳不了就返回 false 并把行号挂到 pendingReveal，等 DOM 就绪那一拍补跳。 */
  function gotoLine(ln, opts) {
    const ta = taRef.current;
    if (!ta) {
      pendingReveal.current = { ln: ln, flash: !opts || opts.flash !== false, ack: (opts && opts.ack) || null };
      if (view === "preview") setView("split");
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
    /* 有划选时点击预览 = 收尾选区，不做行跳转 */
    try {
      const sel = window.getSelection();
      if (sel && String(sel).trim()) return;
    } catch (e2) {}
    let el = e.target;
    while (el && el !== e.currentTarget) {
      if (el.getAttribute && el.getAttribute("data-line")) {
        gotoLine(parseInt(el.getAttribute("data-line"), 10) || 1);
        return;
      }
      el = el.parentNode;
    }
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "hsl(var(--background))", color: "hsl(var(--foreground))" }}>
      <style dangerouslySetInnerHTML={{ __html: PV_CSS + WYS_CSS }} />

      {/* 工具栏 */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderBottom: "1px solid hsl(var(--border))", flexWrap: "wrap" }}>
        <button style={tbtn} onClick={doCompile} disabled={busy === "compile"}>
          {busy === "compile" ? "⏳ 编译中…" : "🔨 编译"}
        </button>
        <button style={tbtn} onClick={doValidate} disabled={busy === "validate"}>
          {busy === "validate" ? "⏳ 校验中…" : "✅ 校验"}
        </button>
        <span style={{ width: 1, height: 16, background: "hsl(var(--border))", margin: "0 4px" }} />
        <button style={{ ...tbtn, border: "none", background: "transparent", color: view === "src" ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))", fontWeight: view === "src" ? 700 : 400 }} onClick={() => goView("src")}>📄 源码</button>
        <button style={{ ...tbtn, border: "none", background: "transparent", color: view === "split" ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))", fontWeight: view === "split" ? 700 : 400 }} onClick={() => goView("split")}>⧉ 分屏</button>
        <button style={{ ...tbtn, border: "none", background: "transparent", color: view === "preview" ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))", fontWeight: view === "preview" ? 700 : 400 }} onClick={() => goView("preview")}>📑 预览</button>
        <button
          style={{ ...tbtn, border: "none", background: "transparent", color: wysOn ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))", fontWeight: wysOn ? 700 : 400 }}
          onClick={() => { if (wysOn) commitWys(); setWysOn(!wysOn); }}
          title="可视化视图里直接改正文与标题；公式 / 引用 / 浮动体保持原子不可误伤，改完失焦即写回源码（只替换被改的块）"
        >{wysOn ? "✏ 就地编辑" : "🔒 只读预览"}</button>
        <span style={{ width: 1, height: 16, background: "hsl(var(--border))", margin: "0 4px" }} />
        <button style={tbtn} onClick={() => insert("\\section{}", 1)}>§ section</button>
        <button style={tbtn} onClick={() => insert("\\subsection{}", 1)}>§§ sub</button>
        <button style={tbtn} onClick={() => insert("\\begin{equation}\\label{eq:}\n  \n\\end{equation}", "\\end{equation}".length)}>∑ 公式</button>
        <button style={tbtn} onClick={() => insert("\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=.8\\linewidth]{}\n  \\caption{}\n  \\label{fig:}\n\\end{figure}", 0)}>🖼 图</button>
        <button style={tbtn} onClick={() => insert("\\begin{table}[htbp]\n  \\centering\n  \\begin{tabular}{lcc}\n    \\hline\n    & & \\\\\n    \\hline\n  \\end{tabular}\n  \\caption{}\n  \\label{tab:}\n\\end{table}", 0)}>📊 表</button>
        <button style={tbtn} onClick={() => insert("\\label{}", 1)}>🏷 label</button>
        <button style={tbtn} onClick={() => insert("\\ref{}", 1)}>🔗 ref</button>
        <button style={tbtn} onClick={() => insert("\\cite{}", 1)}>📚 cite</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: toolReady ? "hsl(var(--muted-foreground))" : "#f59e0b" }}>
          {toolReady ? (katexOkRef.current ? "⚙ 工具就绪 · ∑ KaTeX" : "⚙ 工具就绪") : "⚙ MCP 未连接（解析/编译不可用）"}
        </span>
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
          <div style={{
            flex: flexPart, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden",
            borderLeft: view === "split" && showSrc ? "1px solid hsl(var(--border))" : "none",
            background: "hsl(var(--card))",
          }}>
            <div
              ref={pvRef}
              className="pv-root"
              onClick={onPreviewClick}
              onMouseUp={capturePvQuote}
              onFocus={wysOn ? onWysFocusIn : undefined}
              onBlur={wysOn ? onWysFocusOut : undefined}
              onKeyDown={wysOn ? onWysKeyDown : undefined}
              onPaste={wysOn ? onWysPaste : undefined}
              contentEditable={false}
              suppressContentEditableWarning
              style={{ flex: 1, overflowY: "auto", padding: "6px 22px 48px", fontSize: 14, lineHeight: 1.8, maxWidth: 860, margin: "0 auto", width: "100%" }}
            />
          </div>
        ) : null}
      </div>

      {/* 底部结果面板 */}
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
          {err ? <span style={{ fontSize: 11, color: "#ef4444" }}>⚠ {err}</span> : null}
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

      {/* 状态栏 */}
      <div style={{ display: "flex", gap: 14, alignItems: "center", padding: "2px 10px", borderTop: "1px solid hsl(var(--border))", fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
        <span>Ln {cursor.line}, Col {cursor.col}</span>
        <span>{lines.length} 行</span>
        <span>中文 {wc.cjk} + 英文 {wc.latin} ≈ {wc.total} 字</span>
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
