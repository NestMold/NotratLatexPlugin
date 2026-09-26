import React, { useState, useRef, useEffect, useMemo } from "react";
/*__LPC__*/

/**
 * LaTeX 编辑器 v0.3.2 — editors 贡献面（接管 .tex 文件）
 * Overleaf 式分栏实时预览 + 划词引用到 Sidebar（notrat-quote-to-chat 第一方通道）
 * props: { pluginId, ctx, file, content, onChange, onSave, fileName, filePath }
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
const SEC_LV = { chapter: 0, section: 1, subsection: 2, subsubsection: 3 };

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
    setView(v);
    if (typeof props.onModeSwitch === "function") {
      if (v === "preview") props.onModeSwitch("wysiwyg");
      else if (v === "src") props.onModeSwitch("source");
    }
  };
  const [katexVer, setKatexVer] = useState(0);
  const [quote, setQuote] = useState(null); // {text, lineFrom, lineTo, x, y}
  const [toast, setToast] = useState(null); // {msg}

  const taRef = useRef(null);
  const preRef = useRef(null);
  const gutterRef = useRef(null);
  const pvRef = useRef(null);
  const bubbleRef = useRef(null);
  const pendingCursor = useRef(null);
  const katexOkRef = useRef(false);
  const assetCache = useRef(new Map());
  /* 行定位闪烁："跳过去了"要看得见，否则用户不知道点没点中 */
  const [flashLine, setFlashLine] = useState(0);
  const flashRef = useRef(null);
  const flashLineRef = useRef(0);
  const flashTimer = useRef(null);
  const gotoLineRef = useRef(null);

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

  /* ---------- 行定位：面板点一行 -> 本编辑器滚过去 + 闪一下 + 回执 ---------- */
  useEffect(() => {
    function onReveal(e) {
      const d = (e && e.detail) || {};
      const target = String(d.path || "");
      if (target && !sameAsFile(target)) return; // 不是本文件，留给对应的编辑器实例
      const ln = Math.max(1, Number(d.line) || 1);
      if (gotoLineRef.current) gotoLineRef.current(ln);
      try {
        window.dispatchEvent(new CustomEvent(LATEX_REVEAL_ACK, { detail: { path: filePath || "", line: ln, nonce: d.nonce || "" } }));
      } catch (e2) {}
    }
    window.addEventListener(LATEX_REVEAL, onReveal);
    return () => window.removeEventListener(LATEX_REVEAL, onReveal);
  }, [filePath]);

  /* gotoLine 每次渲染都是新闭包，用 ref 保持监听里拿到的是最新那份 */
  useEffect(() => { gotoLineRef.current = gotoLine; });

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
    setBusy("compile"); setErr(""); setBottomTab("compile"); setBottomOpen(true);
    try { setCompileOut(await callTool("latex_compile", { path: filePath })); }
    catch (e) { setErr(String(e.message || e)); }
    finally { setBusy(""); }
  }

  async function doValidate() {
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
    const t = setTimeout(() => setToast(null), 2600);
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

  /* 行跳转：面板 / 内置大纲 / 预览点击都走这里。opts.flash=false 可关掉闪烁。 */
  function gotoLine(ln, opts) {
    if (view === "preview") setView("split");
    const ta = taRef.current; if (!ta) return;
    const lines = content.split("\n");
    let off = 0;
    for (let i = 0; i < ln - 1 && i < lines.length; i++) off += lines[i].length + 1;
    ta.focus();
    try { ta.setSelectionRange(off, off + (lines[ln - 1] || "").length); } catch (e) {}
    ta.scrollTop = Math.max(0, (ln - 1) * 20 - ta.clientHeight / 3);
    syncScroll(); updateCursor();
    if (!opts || opts.flash !== false) flashAt(ln);
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
  const outline = useMemo(() => {
    const arr = [];
    const re = /\\(chapter|section|subsection|subsubsection)\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(content))) {
      let line = 1;
      for (let i = 0; i < m.index; i++) if (content[i] === "\n") line++;
      arr.push({ level: SEC_LV[m[1]] != null ? SEC_LV[m[1]] : 1, title: m[2], line: line });
    }
    return arr;
  }, [content]);
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
      <style dangerouslySetInnerHTML={{ __html: PV_CSS }} />

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

      {/* 主体：大纲 + 源码 + 预览 */}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {outline.length > 0 && view !== "preview" ? (
          <div style={{ width: 150, overflowY: "auto", borderRight: "1px solid hsl(var(--border))", padding: "6px 4px", flexShrink: 0 }}>
            {outline.map((o, i) => (
              <div key={i} onClick={() => gotoLine(o.line)} style={{
                paddingLeft: 6 + o.level * 10, fontSize: 11.5, lineHeight: "20px",
                cursor: "pointer", color: o.level <= 1 ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", borderRadius: 4,
              }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "hsl(var(--muted) / 0.5)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                title={o.title}>
                {o.level <= 1 ? "§ " : "· "}{o.title}
              </div>
            ))}
          </div>
        ) : null}

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
              style={{ flex: 1, overflowY: "auto", padding: "6px 22px 48px", fontSize: 14, lineHeight: 1.8, maxWidth: 860, margin: "0 auto", width: "100%" }}
              dangerouslySetInnerHTML={{ __html: pv.html }}
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
          {toast.msg}
        </div>
      ) : null}
    </div>
  );
}
