import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect, useMemo } from "react";
const FH = "20px";
const MONO = "Consolas, 'Courier New', ui-monospace, monospace";
const CLR = {
  cmd: "#38bdf8",
  math: "#f0abfc",
  brace: "#94a3b8",
  comment: "#71717a",
  esc: "#fbbf24",
  amp: "#fbbf24"
};
const SEC_LV = { chapter: 0, section: 1, subsection: 2, subsubsection: 3 };
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
/* KaTeX \u5728\u6697\u8272\u4E3B\u9898\u4E0B\u7EE7\u627F\u524D\u666F\u8272 */
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
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === "%") {
      cut = i;
      break;
    }
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
  return { cjk, latin, total: cjk + latin };
}
function clampPos(x, y) {
  return {
    x: Math.max(8, Math.min(x || 100, (window.innerWidth || 1200) - 190)),
    y: Math.max(8, Math.min((y || 100) + 14, (window.innerHeight || 800) - 56))
  };
}
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
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--card))",
  color: "hsl(var(--foreground))",
  borderRadius: 6,
  padding: "2px 8px",
  fontSize: 12,
  cursor: "pointer",
  whiteSpace: "nowrap",
  lineHeight: "18px"
};
const tbtnP = { ...tbtn, background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" };
const LATEX_EV = "notrat-latex-active-file";
const LATEX_PING = "notrat-latex-active-ping";
const LATEX_STORE = "notrat-latex-active";
const LATEX_CURSOR = "notrat-latex-cursor";
const LATEX_CURSOR_PING = "notrat-latex-cursor-ping";
const LATEX_REVEAL = "notrat-latex-reveal-line";
const LATEX_REVEAL_ACK = "notrat-latex-reveal-ack";
let _activeOwner = null;
let _activeClearTimer = null;
function announceActiveFile(path, name, owner) {
  if (_activeClearTimer) {
    clearTimeout(_activeClearTimer);
    _activeClearTimer = null;
  }
  const detail = { path: String(path || ""), name: String(name || "") };
  _activeOwner = owner || null;
  try {
    sessionStorage.setItem(LATEX_STORE, JSON.stringify({ path: detail.path, name: detail.name, at: Date.now() }));
  } catch (e) {
  }
  try {
    window.dispatchEvent(new CustomEvent(LATEX_EV, { detail }));
  } catch (e) {
  }
}
function retractActiveFile(owner) {
  if (_activeClearTimer) clearTimeout(_activeClearTimer);
  _activeClearTimer = setTimeout(function() {
    _activeClearTimer = null;
    if (_activeOwner !== owner) return;
    _activeOwner = null;
    try {
      sessionStorage.removeItem(LATEX_STORE);
    } catch (e) {
    }
    try {
      window.dispatchEvent(new CustomEvent(LATEX_EV, { detail: { path: "", name: "" } }));
    } catch (e) {
    }
  }, 120);
}
function LatexEditor(props) {
  const content = props.content || "";
  const { onChange, onSave, filePath, fileName, pluginId } = props;
  const [serverId, setServerId] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [issues, setIssues] = useState(null);
  const [compileOut, setCompileOut] = useState("");
  const [bottomTab, setBottomTab] = useState("issues");
  const [bottomOpen, setBottomOpen] = useState(false);
  const [savedTick, setSavedTick] = useState(0);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [view, setView] = useState("split");
  const hostMode = props.mode !== void 0 ? props.mode : props.viewMode !== void 0 ? props.viewMode : props.dualViewMode !== void 0 ? props.dualViewMode : void 0;
  useEffect(() => {
    if (hostMode === void 0 || hostMode === null) return;
    const hv = String(hostMode).toLowerCase();
    if (hv === "wysiwyg" || /vis|preview|render|read|pdf/.test(hv)) setView("preview");
    else if (hv === "source" || /src|code|edit|write|text/.test(hv)) setView("src");
  }, [hostMode]);
  const goView = (v) => {
    setView(v);
    if (typeof props.onModeSwitch === "function") {
      if (v === "preview") props.onModeSwitch("wysiwyg");
      else if (v === "src") props.onModeSwitch("source");
    }
  };
  const [katexVer, setKatexVer] = useState(0);
  const [quote, setQuote] = useState(null);
  const [toast, setToast] = useState(null);
  const taRef = useRef(null);
  const preRef = useRef(null);
  const gutterRef = useRef(null);
  const pvRef = useRef(null);
  const bubbleRef = useRef(null);
  const pendingCursor = useRef(null);
  const katexOkRef = useRef(false);
  const assetCache = useRef(/* @__PURE__ */ new Map());
  const [flashLine, setFlashLine] = useState(0);
  const flashRef = useRef(null);
  const flashLineRef = useRef(0);
  const flashTimer = useRef(null);
  const gotoLineRef = useRef(null);
  useEffect(() => {
    const owner = {};
    const broadcast = () => announceActiveFile(filePath, fileName, owner);
    broadcast();
    window.addEventListener(LATEX_PING, broadcast);
    return () => {
      window.removeEventListener(LATEX_PING, broadcast);
      retractActiveFile(owner);
    };
  }, [filePath, fileName]);
  useEffect(() => {
    const push = () => {
      try {
        window.dispatchEvent(new CustomEvent(LATEX_CURSOR, { detail: { path: filePath || "", line: cursor.line, col: cursor.col } }));
      } catch (e) {
      }
    };
    push();
    window.addEventListener(LATEX_CURSOR_PING, push);
    return () => window.removeEventListener(LATEX_CURSOR_PING, push);
  }, [cursor.line, cursor.col, filePath]);
  useEffect(() => {
    function onReveal(e) {
      const d = e && e.detail || {};
      const target = String(d.path || "");
      if (target && !sameAsFile(target)) return;
      const ln = Math.max(1, Number(d.line) || 1);
      if (gotoLineRef.current) gotoLineRef.current(ln);
      try {
        window.dispatchEvent(new CustomEvent(LATEX_REVEAL_ACK, { detail: { path: filePath || "", line: ln, nonce: d.nonce || "" } }));
      } catch (e2) {
      }
    }
    window.addEventListener(LATEX_REVEAL, onReveal);
    return () => window.removeEventListener(LATEX_REVEAL, onReveal);
  }, [filePath]);
  useEffect(() => {
    gotoLineRef.current = gotoLine;
  });
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
      } catch (e) {
      }
    })();
    return () => {
      dead = true;
    };
  }, []);
  async function callTool(tool, args) {
    const api = window.electronAPI;
    if (!api || !api.mcp || !api.mcp.callTool) throw new Error("\u5BBF\u4E3B MCP \u901A\u9053\u4E0D\u53EF\u7528");
    const sid = serverId || "plugin-" + pluginId + "-latex";
    const r = await api.mcp.callTool(sid, tool, args);
    if (!r || r.success === false) throw new Error(r && r.error || "\u5DE5\u5177\u8C03\u7528\u5931\u8D25");
    return (r.result && r.result.content || []).map((c) => c.text).join("\n");
  }
  async function doCompile() {
    setBusy("compile");
    setErr("");
    setBottomTab("compile");
    setBottomOpen(true);
    try {
      setCompileOut(await callTool("latex_compile", { path: filePath }));
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy("");
    }
  }
  async function doValidate() {
    setBusy("validate");
    setErr("");
    setBottomTab("issues");
    setBottomOpen(true);
    try {
      const out = await callTool("latex_validate", { path: filePath, format: "json" });
      setIssues(JSON.parse(out));
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy("");
    }
  }
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
      } catch (e) {
      }
    })();
    return () => {
      dead = true;
    };
  }, [serverId]);
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
        } catch (e) {
          return LPC.miniMath(tex, disp);
        }
      };
    }
    return (tex, disp) => LPC.miniMath(tex, disp);
  }, [katexVer]);
  const pv = useMemo(() => {
    try {
      return LPC.renderPreview(content, { renderMath, baseDir });
    } catch (e) {
      return { html: '<p class="pv-bad">\u9884\u89C8\u6E32\u67D3\u5931\u8D25: ' + esc(String(e && e.message || e)) + "</p>" };
    }
  }, [content, renderMath, baseDir]);
  useEffect(() => {
    if (!pvRef.current || !serverId) return;
    const imgs = pvRef.current.querySelectorAll("img[data-asset]");
    let chain = Promise.resolve();
    imgs.forEach((img) => {
      const p = img.getAttribute("data-asset");
      if (!p) return;
      if (assetCache.current.has(p)) {
        img.src = assetCache.current.get(p);
        return;
      }
      chain = chain.then(async () => {
        try {
          const out = await callTool("latex_asset", { path: p });
          const a = JSON.parse(out);
          if (a && a.dataUri) {
            assetCache.current.set(p, a.dataUri);
            img.src = a.dataUri;
          }
        } catch (e) {
        }
      });
    });
  }, [pv.html, katexVer, serverId]);
  useEffect(() => {
    if (!quote) return;
    const onDown = (e) => {
      if (bubbleRef.current && !bubbleRef.current.contains(e.target)) setQuote(null);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setQuote(null);
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [quote]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  function lineAt(off) {
    return content.slice(0, off).split("\n").length;
  }
  function captureSrcQuote(e) {
    const ta = taRef.current;
    if (!ta) return;
    const s = ta.selectionStart, en = ta.selectionEnd;
    if (s === en) {
      setQuote(null);
      return;
    }
    const text = content.slice(s, en);
    if (!text.trim()) {
      setQuote(null);
      return;
    }
    const pos = clampPos(e.clientX, e.clientY);
    setQuote({ text, lineFrom: lineAt(s), lineTo: lineAt(en), x: pos.x, y: pos.y });
  }
  function captureSrcQuoteKb() {
    const ta = taRef.current;
    if (!ta) return;
    const s = ta.selectionStart, en = ta.selectionEnd;
    if (s === en) {
      setQuote(null);
      return;
    }
    const text = content.slice(s, en);
    if (!text.trim()) {
      setQuote(null);
      return;
    }
    const rect = ta.getBoundingClientRect();
    const pos = clampPos(rect.right - 200, rect.top + 30);
    setQuote({ text, lineFrom: lineAt(s), lineTo: lineAt(en), x: pos.x, y: pos.y });
  }
  function capturePvQuote() {
    let sel = null;
    try {
      sel = window.getSelection();
    } catch (e) {
    }
    const text = sel ? String(sel) : "";
    if (!text.trim()) {
      setQuote(null);
      return;
    }
    let a = null, b = null;
    if (sel) {
      a = nodeLine(sel.anchorNode);
      b = nodeLine(sel.focusNode);
    }
    const lo = a != null && b != null ? Math.min(a, b) : a != null ? a : b;
    const hi = a != null && b != null ? Math.max(a, b) : a != null ? a : b;
    let pos = { x: 100, y: 100 };
    try {
      pos = clampPos(window.event ? window.event.clientX : 100, window.event ? window.event.clientY : 100);
    } catch (e) {
    }
    setQuote({ text, lineFrom: lo, lineTo: hi, x: pos.x, y: pos.y });
  }
  async function doQuote() {
    const q = quote;
    if (!q) return;
    setQuote(null);
    const detail = {
      text: q.text,
      source: fileName || "LaTeX \u9009\u6BB5",
      filePath: filePath || "",
      lineFrom: q.lineFrom,
      lineTo: q.lineTo
    };
    try {
      const composer = document.querySelector("[data-sidebar-composer]");
      if (composer) {
        window.dispatchEvent(new CustomEvent("notrat-quote-to-chat", { detail }));
        setToast({ msg: "\u2713 \u5DF2\u5F15\u7528\u5230 AI \u5BF9\u8BDD\uFF08\u89C1\u4FA7\u680F\u5F15\u7528\u5361\u7247\uFF09" });
        return;
      }
    } catch (e) {
    }
    try {
      await navigator.clipboard.writeText(q.text);
      setToast({ msg: "\u{1F4CB} \u4FA7\u680F\u672A\u6253\u5F00\uFF0C\u9009\u4E2D\u6587\u672C\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F" });
    } catch (e) {
      setToast({ msg: "\u26A0 \u5F15\u7528\u5931\u8D25\uFF1A" + String(e && e.message || e) });
    }
  }
  function insert(text, back) {
    const ta = taRef.current;
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    onChange(content.slice(0, s) + text + content.slice(e));
    pendingCursor.current = s + text.length - (back || 0);
  }
  useEffect(() => {
    if (pendingCursor.current != null && taRef.current) {
      const p = pendingCursor.current;
      pendingCursor.current = null;
      taRef.current.focus();
      try {
        taRef.current.setSelectionRange(p, p);
      } catch (e) {
      }
    }
  }, [content]);
  function updateCursor() {
    const ta = taRef.current;
    if (!ta) return;
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
  function paintFlash(ln) {
    const el = flashRef.current, ta = taRef.current;
    if (!el || !ta) return;
    if (!ln) {
      el.style.opacity = "0";
      return;
    }
    el.style.top = 8 + (ln - 1) * 20 - ta.scrollTop + "px";
    el.style.opacity = "1";
  }
  function flashAt(ln) {
    flashLineRef.current = ln;
    setFlashLine(ln);
    paintFlash(ln);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(function() {
      flashTimer.current = null;
      flashLineRef.current = 0;
      setFlashLine(0);
      paintFlash(0);
    }, 1400);
  }
  function syncScroll() {
    const ta = taRef.current;
    if (!ta) return;
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop;
      preRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
    const pvEl = pvRef.current;
    if (pvEl && view === "split") {
      const ratio = ta.scrollTop / Math.max(1, ta.scrollHeight - ta.clientHeight);
      pvEl.scrollTop = ratio * Math.max(0, pvEl.scrollHeight - pvEl.clientHeight);
    }
    if (flashLineRef.current) paintFlash(flashLineRef.current);
  }
  function gotoLine(ln, opts) {
    if (view === "preview") setView("split");
    const ta = taRef.current;
    if (!ta) return;
    const lines2 = content.split("\n");
    let off = 0;
    for (let i = 0; i < ln - 1 && i < lines2.length; i++) off += lines2[i].length + 1;
    ta.focus();
    try {
      ta.setSelectionRange(off, off + (lines2[ln - 1] || "").length);
    } catch (e) {
    }
    ta.scrollTop = Math.max(0, (ln - 1) * 20 - ta.clientHeight / 3);
    syncScroll();
    updateCursor();
    if (!opts || opts.flash !== false) flashAt(ln);
  }
  function onPreviewClick(e) {
    try {
      const sel = window.getSelection();
      if (sel && String(sel).trim()) return;
    } catch (e2) {
    }
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
      if (onSave) {
        try {
          onSave();
          setSavedTick(Date.now());
        } catch (e2) {
        }
      }
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      insert("  ");
    }
  }
  const lines = useMemo(() => content.split("\n"), [content]);
  const highlighted = useMemo(() => lines.map(hlLine).join("\n") + "\n", [lines]);
  const outline = useMemo(() => {
    const arr = [];
    const re = /\\(chapter|section|subsection|subsubsection)\s*\{([^}]*)\}/g;
    let m;
    while (m = re.exec(content)) {
      let line = 1;
      for (let i = 0; i < m.index; i++) if (content[i] === "\n") line++;
      arr.push({ level: SEC_LV[m[1]] != null ? SEC_LV[m[1]] : 1, title: m[2], line });
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
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    margin: 0,
    border: "none",
    outline: "none",
    resize: "none",
    padding: "8px 12px",
    fontFamily: MONO,
    fontSize: 13,
    lineHeight: FH,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    overflow: "auto",
    background: "transparent",
    color: "transparent",
    caretColor: "hsl(var(--foreground))"
  };
  const preStyle = {
    position: "absolute",
    inset: 0,
    margin: 0,
    overflow: "hidden",
    padding: "8px 12px",
    fontFamily: MONO,
    fontSize: 13,
    lineHeight: FH,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    color: "hsl(var(--foreground))",
    pointerEvents: "none"
  };
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "hsl(var(--background))", color: "hsl(var(--foreground))" }, children: [
    /* @__PURE__ */ jsx("style", { dangerouslySetInnerHTML: { __html: PV_CSS } }),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderBottom: "1px solid hsl(var(--border))", flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx("button", { style: tbtn, onClick: doCompile, disabled: busy === "compile", children: busy === "compile" ? "\u23F3 \u7F16\u8BD1\u4E2D\u2026" : "\u{1F528} \u7F16\u8BD1" }),
      /* @__PURE__ */ jsx("button", { style: tbtn, onClick: doValidate, disabled: busy === "validate", children: busy === "validate" ? "\u23F3 \u6821\u9A8C\u4E2D\u2026" : "\u2705 \u6821\u9A8C" }),
      /* @__PURE__ */ jsx("span", { style: { width: 1, height: 16, background: "hsl(var(--border))", margin: "0 4px" } }),
      /* @__PURE__ */ jsx("button", { style: { ...tbtn, border: "none", background: "transparent", color: view === "src" ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))", fontWeight: view === "src" ? 700 : 400 }, onClick: () => goView("src"), children: "\u{1F4C4} \u6E90\u7801" }),
      /* @__PURE__ */ jsx("button", { style: { ...tbtn, border: "none", background: "transparent", color: view === "split" ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))", fontWeight: view === "split" ? 700 : 400 }, onClick: () => goView("split"), children: "\u29C9 \u5206\u5C4F" }),
      /* @__PURE__ */ jsx("button", { style: { ...tbtn, border: "none", background: "transparent", color: view === "preview" ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))", fontWeight: view === "preview" ? 700 : 400 }, onClick: () => goView("preview"), children: "\u{1F4D1} \u9884\u89C8" }),
      /* @__PURE__ */ jsx("span", { style: { width: 1, height: 16, background: "hsl(var(--border))", margin: "0 4px" } }),
      /* @__PURE__ */ jsx("button", { style: tbtn, onClick: () => insert("\\section{}", 1), children: "\xA7 section" }),
      /* @__PURE__ */ jsx("button", { style: tbtn, onClick: () => insert("\\subsection{}", 1), children: "\xA7\xA7 sub" }),
      /* @__PURE__ */ jsx("button", { style: tbtn, onClick: () => insert("\\begin{equation}\\label{eq:}\n  \n\\end{equation}", "\\end{equation}".length), children: "\u2211 \u516C\u5F0F" }),
      /* @__PURE__ */ jsx("button", { style: tbtn, onClick: () => insert("\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=.8\\linewidth]{}\n  \\caption{}\n  \\label{fig:}\n\\end{figure}", 0), children: "\u{1F5BC} \u56FE" }),
      /* @__PURE__ */ jsx("button", { style: tbtn, onClick: () => insert("\\begin{table}[htbp]\n  \\centering\n  \\begin{tabular}{lcc}\n    \\hline\n    & & \\\\\n    \\hline\n  \\end{tabular}\n  \\caption{}\n  \\label{tab:}\n\\end{table}", 0), children: "\u{1F4CA} \u8868" }),
      /* @__PURE__ */ jsx("button", { style: tbtn, onClick: () => insert("\\label{}", 1), children: "\u{1F3F7} label" }),
      /* @__PURE__ */ jsx("button", { style: tbtn, onClick: () => insert("\\ref{}", 1), children: "\u{1F517} ref" }),
      /* @__PURE__ */ jsx("button", { style: tbtn, onClick: () => insert("\\cite{}", 1), children: "\u{1F4DA} cite" }),
      /* @__PURE__ */ jsx("div", { style: { flex: 1 } }),
      /* @__PURE__ */ jsx("span", { style: { fontSize: 11, color: toolReady ? "hsl(var(--muted-foreground))" : "#f59e0b" }, children: toolReady ? katexOkRef.current ? "\u2699 \u5DE5\u5177\u5C31\u7EEA \xB7 \u2211 KaTeX" : "\u2699 \u5DE5\u5177\u5C31\u7EEA" : "\u2699 MCP \u672A\u8FDE\u63A5\uFF08\u89E3\u6790/\u7F16\u8BD1\u4E0D\u53EF\u7528\uFF09" })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { flex: 1, minHeight: 0, display: "flex" }, children: [
      outline.length > 0 && view !== "preview" ? /* @__PURE__ */ jsx("div", { style: { width: 150, overflowY: "auto", borderRight: "1px solid hsl(var(--border))", padding: "6px 4px", flexShrink: 0 }, children: outline.map((o, i) => /* @__PURE__ */ jsxs(
        "div",
        {
          onClick: () => gotoLine(o.line),
          style: {
            paddingLeft: 6 + o.level * 10,
            fontSize: 11.5,
            lineHeight: "20px",
            cursor: "pointer",
            color: o.level <= 1 ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            borderRadius: 4
          },
          onMouseEnter: (e) => {
            e.currentTarget.style.background = "hsl(var(--muted) / 0.5)";
          },
          onMouseLeave: (e) => {
            e.currentTarget.style.background = "transparent";
          },
          title: o.title,
          children: [
            o.level <= 1 ? "\xA7 " : "\xB7 ",
            o.title
          ]
        },
        i
      )) }) : null,
      showSrc ? /* @__PURE__ */ jsxs("div", { style: { flex: flexPart, minWidth: 0, display: "flex", position: "relative" }, children: [
        /* @__PURE__ */ jsx("div", { ref: gutterRef, style: {
          width: 34,
          overflow: "hidden",
          textAlign: "right",
          padding: "8px 6px 8px 0",
          fontFamily: MONO,
          fontSize: 13,
          lineHeight: FH,
          color: "hsl(var(--muted-foreground))",
          userSelect: "none",
          background: "hsl(var(--muted) / 0.3)",
          borderRight: "1px solid hsl(var(--border))",
          flexShrink: 0
        }, children: lines.map((_, i) => /* @__PURE__ */ jsx("div", { style: flashLine === i + 1 ? { color: "hsl(var(--primary))", fontWeight: 700, background: "hsl(var(--primary) / 0.14)" } : null, children: i + 1 }, i)) }),
        /* @__PURE__ */ jsxs("div", { style: { flex: 1, minWidth: 0, position: "relative" }, children: [
          /* @__PURE__ */ jsx("div", { ref: flashRef, style: {
            position: "absolute",
            left: 0,
            right: 0,
            height: 20,
            top: -999,
            background: "hsl(var(--primary) / 0.13)",
            borderLeft: "2px solid hsl(var(--primary))",
            pointerEvents: "none",
            opacity: 0,
            transition: "opacity .25s",
            zIndex: 1
          } }),
          /* @__PURE__ */ jsx("pre", { ref: preRef, style: preStyle, dangerouslySetInnerHTML: { __html: highlighted } }),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              ref: taRef,
              style: taStyle,
              value: content,
              spellCheck: false,
              onChange: (e) => {
                onChange(e.target.value);
                updateCursor();
                setQuote(null);
              },
              onScroll: syncScroll,
              onKeyDown,
              onClick: updateCursor,
              onKeyUp: (e) => {
                updateCursor();
                captureSrcQuoteKb();
              },
              onMouseUp: captureSrcQuote
            }
          )
        ] })
      ] }) : null,
      showPv ? /* @__PURE__ */ jsx("div", { style: {
        flex: flexPart,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderLeft: view === "split" && showSrc ? "1px solid hsl(var(--border))" : "none",
        background: "hsl(var(--card))"
      }, children: /* @__PURE__ */ jsx(
        "div",
        {
          ref: pvRef,
          className: "pv-root",
          onClick: onPreviewClick,
          onMouseUp: capturePvQuote,
          style: { flex: 1, overflowY: "auto", padding: "6px 22px 48px", fontSize: 14, lineHeight: 1.8, maxWidth: 860, margin: "0 auto", width: "100%" },
          dangerouslySetInnerHTML: { __html: pv.html }
        }
      ) }) : null
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { borderTop: "1px solid hsl(var(--border))" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "3px 10px" }, children: [
        /* @__PURE__ */ jsxs("button", { style: tbtn, onClick: () => setBottomOpen(!bottomOpen), children: [
          bottomOpen ? "\u25BE" : "\u25B8",
          " \u7ED3\u679C"
        ] }),
        /* @__PURE__ */ jsxs(
          "button",
          {
            style: { ...tbtn, border: "none", background: "transparent", color: bottomTab === "issues" ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" },
            onClick: () => {
              setBottomTab("issues");
              setBottomOpen(true);
            },
            children: [
              "\u2705 \u6821\u9A8C ",
              issues ? `(${issueCount})` : ""
            ]
          }
        ),
        /* @__PURE__ */ jsxs(
          "button",
          {
            style: { ...tbtn, border: "none", background: "transparent", color: bottomTab === "compile" ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" },
            onClick: () => {
              setBottomTab("compile");
              setBottomOpen(true);
            },
            children: [
              "\u{1F528} \u7F16\u8BD1 ",
              compileOut ? "\u2022" : ""
            ]
          }
        ),
        err ? /* @__PURE__ */ jsxs("span", { style: { fontSize: 11, color: "#ef4444" }, children: [
          "\u26A0 ",
          err
        ] }) : null
      ] }),
      bottomOpen ? /* @__PURE__ */ jsx("div", { style: { maxHeight: 180, overflowY: "auto", padding: "4px 12px 10px", fontSize: 12, lineHeight: 1.7 }, children: bottomTab === "issues" ? !issues ? /* @__PURE__ */ jsx("span", { style: { color: "hsl(var(--muted-foreground))" }, children: "\u5C1A\u672A\u6821\u9A8C\u2014\u2014\u70B9\u5DE5\u5177\u680F\u300C\u2705 \u6821\u9A8C\u300D\u3002" }) : issueCount === 0 ? /* @__PURE__ */ jsx("span", { style: { color: "#22c55e" }, children: "\u2705 \u672A\u53D1\u73B0\u95EE\u9898" }) : issues.issues.map((i, k) => /* @__PURE__ */ jsxs("div", { onClick: () => gotoLine(i.line), style: { cursor: "pointer" }, children: [
        /* @__PURE__ */ jsx("span", { style: { color: i.severity === "error" ? "#ef4444" : i.severity === "warning" ? "#f59e0b" : "#94a3b8" }, children: i.severity === "error" ? "\u{1F534}" : i.severity === "warning" ? "\u{1F7E1}" : "\u26AA" }),
        " ",
        /* @__PURE__ */ jsxs("span", { style: { color: "hsl(var(--muted-foreground))" }, children: [
          "L",
          i.line
        ] }),
        " ",
        i.message
      ] }, k)) : compileOut ? /* @__PURE__ */ jsx("pre", { style: { margin: 0, fontFamily: MONO, fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all" }, children: compileOut }) : /* @__PURE__ */ jsx("span", { style: { color: "hsl(var(--muted-foreground))" }, children: "\u5C1A\u672A\u7F16\u8BD1\u2014\u2014\u70B9\u5DE5\u5177\u680F\u300C\u{1F528} \u7F16\u8BD1\u300D\u3002" }) }) : null
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 14, alignItems: "center", padding: "2px 10px", borderTop: "1px solid hsl(var(--border))", fontSize: 11, color: "hsl(var(--muted-foreground))" }, children: [
      /* @__PURE__ */ jsxs("span", { children: [
        "Ln ",
        cursor.line,
        ", Col ",
        cursor.col
      ] }),
      /* @__PURE__ */ jsxs("span", { children: [
        lines.length,
        " \u884C"
      ] }),
      /* @__PURE__ */ jsxs("span", { children: [
        "\u4E2D\u6587 ",
        wc.cjk,
        " + \u82F1\u6587 ",
        wc.latin,
        " \u2248 ",
        wc.total,
        " \u5B57"
      ] }),
      savedTick ? /* @__PURE__ */ jsx("span", { style: { color: "#22c55e" }, children: "\u5DF2\u4FDD\u5B58 \u2713" }) : null,
      /* @__PURE__ */ jsx("div", { style: { flex: 1 } }),
      /* @__PURE__ */ jsx("span", { children: katexOkRef.current ? "\u2211 KaTeX" : "\u2211 \u7B80\u6613\u6E32\u67D3" }),
      /* @__PURE__ */ jsx("span", { children: fileName || "LaTeX" })
    ] }),
    quote ? /* @__PURE__ */ jsx("div", { ref: bubbleRef, style: { position: "fixed", left: quote.x, top: quote.y, zIndex: 60 }, children: /* @__PURE__ */ jsxs(
      "button",
      {
        onClick: doQuote,
        style: {
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "hsl(var(--primary))",
          color: "hsl(var(--primary-foreground))",
          border: "none",
          borderRadius: 8,
          padding: "5px 12px",
          fontSize: 12.5,
          cursor: "pointer",
          boxShadow: "0 6px 20px rgba(0,0,0,.28)",
          whiteSpace: "nowrap"
        },
        title: "\u628A\u9009\u4E2D\u6587\u672C\u4F5C\u4E3A\u5F15\u7528\u5361\u7247\u53D1\u5230 AI \u4FA7\u680F",
        children: [
          "\u{1F4AC} \u5F15\u7528\u5230\u5BF9\u8BDD",
          quote.lineFrom ? /* @__PURE__ */ jsxs("span", { style: { opacity: 0.75 }, children: [
            "L",
            quote.lineFrom,
            quote.lineTo && quote.lineTo !== quote.lineFrom ? "\u2013" + quote.lineTo : ""
          ] }) : null
        ]
      }
    ) }) : null,
    toast ? /* @__PURE__ */ jsx("div", { style: {
      position: "fixed",
      bottom: 64,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 70,
      background: "hsl(var(--popover))",
      color: "hsl(var(--popover-foreground))",
      border: "1px solid hsl(var(--border))",
      borderRadius: 8,
      padding: "6px 14px",
      fontSize: 12,
      boxShadow: "0 6px 20px rgba(0,0,0,.25)",
      whiteSpace: "nowrap"
    }, children: toast.msg }) : null
  ] });
}
export {
  LatexEditor as default
};
