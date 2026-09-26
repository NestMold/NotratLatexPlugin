import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect, useCallback } from "react";
const AI_CONFIG_KEY = "notrat-ai-config";
const AI_CURRENT_PREFIX = "notrat-ai-current:";
function windowWorkspaceKey() {
  try {
    return (new URLSearchParams(window.location.search).get("workspace") || "").trim().toLowerCase().replace(/[^a-z0-9-_]/g, "_");
  } catch (e) {
    return "";
  }
}
function loadAIConfig() {
  try {
    const raw = localStorage.getItem(AI_CONFIG_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw);
    if (!cfg || !Array.isArray(cfg.providers) || cfg.providers.length === 0) return null;
    return cfg;
  } catch (e) {
    return null;
  }
}
function loadWindowSelection() {
  const key = windowWorkspaceKey();
  if (!key) return null;
  try {
    const raw = localStorage.getItem(AI_CURRENT_PREFIX + key);
    if (!raw) return null;
    const sel = JSON.parse(raw);
    if (!sel || typeof sel.providerId !== "string" || typeof sel.model !== "string") return null;
    return sel;
  } catch (e) {
    return null;
  }
}
function resolveProvider() {
  const cfg = loadAIConfig();
  if (!cfg) return null;
  let currentId = cfg.currentProvider;
  let providers = cfg.providers;
  const sel = loadWindowSelection();
  if (sel && providers.some((p2) => p2.id === sel.providerId)) {
    currentId = sel.providerId;
    if (sel.model) providers = providers.map((p2) => p2.id === sel.providerId ? { ...p2, model: sel.model } : p2);
  }
  const p = providers.filter((x) => x.id === currentId)[0] || providers[0];
  if (!p) return null;
  return { id: p.id, type: p.type, baseUrl: p.baseUrl, model: p.model, apiKey: p.apiKey };
}
async function streamChat(opts) {
  const { provider, system, user, signal, onDelta } = opts;
  const api = typeof window !== "undefined" ? window.electronAPI : null;
  const url = api && api.chat && api.chat.sseUrl;
  if (!url) throw new Error("\u5BBF\u4E3B AI \u7F51\u5173\u4E0D\u53EF\u7528\uFF08electronAPI.chat.sseUrl \u672A\u6CE8\u5165\uFF09");
  const messages = (system ? [{ role: "system", content: system }] : []).concat([
    { role: "user", content: user }
  ]);
  const res = await fetch(url + "/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      provider,
      messages,
      options: {
        temperature: 0.3,
        maxTokens: 4096,
        apiKey: provider.apiKey,
        skipEvolution: true
      }
    })
  });
  if (!res.ok) throw new Error("AI \u7F51\u5173\u8FD4\u56DE HTTP " + res.status);
  if (!res.body) throw new Error("AI \u7F51\u5173\u65E0\u6D41\u5F0F\u54CD\u5E94\u4F53");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let ev = "";
  let out = "";
  let errMsg = "";
  for (; ; ) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buf += dec.decode(chunk.value, { stream: true });
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (line.indexOf("event:") === 0) {
        ev = line.slice(6).trim();
        continue;
      }
      if (line.indexOf("data:") !== 0) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") {
        ev = "";
        continue;
      }
      let j = null;
      try {
        j = JSON.parse(payload);
      } catch (e) {
        ev = "";
        continue;
      }
      if (ev === "error" || j.error) {
        const e2 = j.error;
        errMsg = String(e2 && (e2.message || e2) || "AI \u8FD4\u56DE\u9519\u8BEF");
        ev = "";
        continue;
      }
      const piece = typeof j.content === "string" && j.content || typeof j.delta === "string" && j.delta || j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content || "";
      if (piece && typeof piece === "string") {
        out += piece;
        onDelta(out);
      }
      ev = "";
    }
  }
  if (!out && errMsg) throw new Error(errMsg);
  return out;
}
const SYS_BASE = "\u4F60\u662F\u79D1\u7814\u8BBA\u6587\u7684 LaTeX \u5199\u4F5C\u52A9\u624B\u3002\u7528\u6237\u4F1A\u7ED9\u4F60\u4E00\u6BB5\u4ECE .tex \u6E90\u6587\u4EF6\u91CC\u9009\u4E2D\u7684\u6587\u672C\u3002\n\u786C\u6027\u8981\u6C42\uFF1A\n1) \u539F\u6837\u4FDD\u7559\u6240\u6709 LaTeX \u547D\u4EE4\u3001\u73AF\u5883\u3001\u5B8F\uFF08\u5982 \\cite{} \\ref{} \\label{} \\textbf{} \u7B49\uFF09\u4E0E\u6570\u5B66\u516C\u5F0F\uFF08$...$\u3001\\begin{equation} \u7B49\uFF09\uFF0C\u4E0D\u5F97\u6539\u52A8\u3001\u4E0D\u5F97\u8F6C\u4E49\u3001\u4E0D\u5F97\u8865\u5168\uFF1B\n2) \u53EA\u8F93\u51FA\u5904\u7406\u540E\u7684\u6587\u672C\u672C\u8EAB\uFF0C\u4E0D\u8981\u8F93\u51FA\u4EFB\u4F55\u89E3\u91CA\u3001\u524D\u8A00\u3001\u7ED3\u8BED\u3001\u6807\u9898\u6216 Markdown \u4EE3\u7801\u56F4\u680F\uFF1B\n3) \u4E0D\u8981\u65B0\u589E\u6216\u5220\u9664\u5F15\u7528\u952E\uFF08\\cite \u91CC\u7684 key \u5FC5\u987B\u539F\u6837\u4FDD\u7559\uFF09\u3002";
const ACTIONS = [
  {
    id: "polish",
    label: "\u5B66\u672F\u6DA6\u8272",
    hint: "\u6539\u5199\u4E3A\u66F4\u4E25\u8C28\u7684\u5B66\u672F\u8868\u8FBE\uFF0C\u4FDD\u6301\u539F\u610F\u4E0E LaTeX \u7ED3\u6784",
    ask: "\u8BF7\u5BF9\u4E0B\u9762\u8FD9\u6BB5\u9009\u4E2D\u6587\u672C\u505A\u5B66\u672F\u6DA6\u8272\uFF0C\u4F7F\u5176\u66F4\u4E25\u8C28\u3001\u7B80\u6D01\u3001\u7B26\u5408\u671F\u520A\u8BBA\u6587\u8868\u8FBE\u4E60\u60EF\u3002\u4FDD\u6301\u8BED\u8A00\u4E0D\u53D8\uFF08\u4E2D\u6587\u4ECD\u662F\u4E2D\u6587\uFF0C\u82F1\u6587\u4ECD\u662F\u82F1\u6587\uFF09\u4E0E\u6240\u6709 LaTeX \u547D\u4EE4/\u516C\u5F0F\u539F\u6837\u3002\u53EA\u8F93\u51FA\u6539\u5199\u540E\u7684\u6587\u672C\u3002"
  },
  {
    id: "to-en",
    label: "\u4E2D\u8BD1\u82F1",
    hint: "\u7FFB\u8BD1\u6210\u5B66\u672F\u82F1\u6587\uFF0CLaTeX \u4E0E\u516C\u5F0F\u4E0D\u52A8",
    ask: "\u8BF7\u628A\u4E0B\u9762\u8FD9\u6BB5\u9009\u4E2D\u6587\u672C\u7FFB\u8BD1\u6210\u5730\u9053\u7684\u5B66\u672F\u82F1\u6587\u3002\u6240\u6709 LaTeX \u547D\u4EE4\u4E0E\u6570\u5B66\u516C\u5F0F\u5FC5\u987B\u539F\u6837\u4FDD\u7559\u3001\u4F4D\u7F6E\u4E0D\u53D8\u3002\u53EA\u8F93\u51FA\u8BD1\u6587\u3002"
  },
  {
    id: "to-zh",
    label: "\u82F1\u8BD1\u4E2D",
    hint: "\u7FFB\u8BD1\u6210\u4E2D\u6587\u5B66\u672F\u8868\u8FBE\uFF0CLaTeX \u4E0E\u516C\u5F0F\u4E0D\u52A8",
    ask: "\u8BF7\u628A\u4E0B\u9762\u8FD9\u6BB5\u9009\u4E2D\u6587\u672C\u7FFB\u8BD1\u6210\u4E2D\u6587\u5B66\u672F\u8868\u8FBE\u3002\u6240\u6709 LaTeX \u547D\u4EE4\u4E0E\u6570\u5B66\u516C\u5F0F\u5FC5\u987B\u539F\u6837\u4FDD\u7559\u3001\u4F4D\u7F6E\u4E0D\u53D8\u3002\u53EA\u8F93\u51FA\u8BD1\u6587\u3002"
  },
  {
    id: "explain-math",
    label: "\u89E3\u91CA\u516C\u5F0F",
    hint: "\u9010\u4E2A\u8BF4\u660E\u6570\u5B66\u7B26\u53F7\u4E0E\u516C\u5F0F\u6574\u4F53\u542B\u4E49",
    ask: "\u8BF7\u89E3\u91CA\u4E0B\u9762\u8FD9\u6BB5\u9009\u4E2D\u6587\u672C\u91CC\u7684\u6570\u5B66\u516C\u5F0F\uFF1A\u9010\u4E2A\u8BF4\u660E\u51FA\u73B0\u7684\u7B26\u53F7\u542B\u4E49\u3001\u516C\u5F0F\u5728\u505A\u7684\u4E8B\uFF0C\u4EE5\u53CA\u5B83\u5728\u8BBA\u6587\u4E2D\u7684\u5E38\u89C1\u7528\u9014\u3002\u7528\u4E2D\u6587\u56DE\u7B54\uFF0C\u53EF\u7B80\u77ED\u5206\u6BB5\uFF0C\u4E0D\u5FC5\u4FDD\u7559 LaTeX \u7ED3\u6784\u3002"
  },
  {
    id: "to-latex",
    label: "\u8F6C\u516C\u5F0F",
    hint: "\u628A\u81EA\u7136\u8BED\u8A00\u63CF\u8FF0\u8F6C\u6210 LaTeX \u6570\u5B66\u516C\u5F0F",
    ask: "\u8BF7\u628A\u4E0B\u9762\u8FD9\u6BB5\u9009\u4E2D\u6587\u672C\uFF08\u81EA\u7136\u8BED\u8A00\u63CF\u8FF0\uFF09\u8F6C\u5199\u6210\u89C4\u8303\u7684 LaTeX \u6570\u5B66\u516C\u5F0F\u3002\u4F18\u5148\u4F7F\u7528 amsmath \u63D0\u4F9B\u7684\u73AF\u5883\u4E0E\u547D\u4EE4\u3002\u53EA\u8F93\u51FA\u516C\u5F0F\u672C\u8EAB\uFF08\u542B\u5FC5\u8981\u7684 $ \u6216 \\begin{equation} \u5305\u88F9\uFF09\uFF0C\u4E0D\u8981\u89E3\u91CA\u3002"
  },
  {
    id: "tighten",
    label: "\u7CBE\u7B80",
    hint: "\u538B\u7F29\u5197\u4F59\u8868\u8FF0\uFF0C\u4FDD\u7559\u5168\u90E8\u4FE1\u606F\u4E0E\u5F15\u7528",
    ask: "\u8BF7\u5220\u51CF\u4E0B\u9762\u8FD9\u6BB5\u9009\u4E2D\u6587\u672C\u7684\u5197\u4F59\u4E0E\u91CD\u590D\u8868\u8FF0\uFF0C\u4F7F\u5176\u66F4\u7D27\u51D1\uFF0C\u4F46\u4E0D\u5F97\u4E22\u5931\u4EFB\u4F55\u4FE1\u606F\u3001\u4E0D\u5F97\u5220\u9664\u4EFB\u4F55 \\cite{} \u5F15\u7528\u3002\u4FDD\u6301\u8BED\u8A00\u4E0D\u53D8\uFF0C\u4FDD\u6301 LaTeX \u547D\u4EE4\u4E0E\u516C\u5F0F\u539F\u6837\u3002\u53EA\u8F93\u51FA\u7CBE\u7B80\u540E\u7684\u6587\u672C\u3002"
  },
  {
    id: "expand",
    label: "\u6269\u5199",
    hint: "\u8865\u5145\u8FC7\u6E21\u4E0E\u89E3\u91CA\uFF0C\u4F7F\u8BBA\u8BC1\u66F4\u5B8C\u6574",
    ask: "\u8BF7\u5728\u4FDD\u6301\u539F\u610F\u7684\u524D\u63D0\u4E0B\u9002\u5EA6\u6269\u5199\u4E0B\u9762\u8FD9\u6BB5\u9009\u4E2D\u6587\u672C\uFF0C\u8865\u5145\u5FC5\u8981\u7684\u8FC7\u6E21\u4E0E\u89E3\u91CA\uFF0C\u4F7F\u8BBA\u8BC1\u66F4\u5B8C\u6574\u3002\u4E0D\u8981\u7F16\u9020\u6570\u636E\u3001\u4E0D\u8981\u65B0\u589E\u5F15\u7528\u952E\u3002\u4FDD\u6301\u8BED\u8A00\u4E0D\u53D8\uFF0C\u4FDD\u6301 LaTeX \u547D\u4EE4\u4E0E\u516C\u5F0F\u539F\u6837\u3002\u53EA\u8F93\u51FA\u6269\u5199\u540E\u7684\u6587\u672C\u3002"
  }
];
const C = {
  error: "#ef4444",
  warning: "#f59e0b",
  ok: "#22c55e",
  info: "hsl(var(--muted-foreground))"
};
const S = {
  root: { padding: "10px 12px", fontSize: 12, color: "hsl(var(--foreground))" },
  card: {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 10,
    padding: "10px 12px",
    marginBottom: 10
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: "hsl(var(--muted-foreground))",
    marginBottom: 6,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  btn: {
    padding: "3px 9px",
    borderRadius: 6,
    fontSize: 11,
    cursor: "pointer",
    border: "1px solid hsl(var(--border))",
    background: "transparent",
    color: "hsl(var(--foreground))",
    margin: "0 4px 4px 0"
  },
  btnPrimary: {
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 11,
    cursor: "pointer",
    border: "1px solid hsl(var(--primary))",
    background: "hsl(var(--primary))",
    color: "hsl(var(--primary-foreground))"
  },
  btnOn: {
    padding: "3px 9px",
    borderRadius: 6,
    fontSize: 11,
    cursor: "pointer",
    border: "1px solid hsl(var(--primary))",
    background: "hsl(var(--primary))",
    color: "hsl(var(--primary-foreground))",
    margin: "0 4px 4px 0"
  },
  chip: {
    display: "inline-block",
    padding: "1px 7px",
    marginRight: 5,
    borderRadius: 999,
    fontSize: 10,
    border: "1px solid hsl(var(--border))",
    color: "hsl(var(--muted-foreground))",
    whiteSpace: "nowrap"
  },
  pre: {
    margin: 0,
    padding: "8px 9px",
    borderRadius: 8,
    background: "hsl(var(--muted))",
    border: "1px solid hsl(var(--border))",
    fontSize: 11.5,
    lineHeight: 1.6,
    fontFamily: "Consolas, 'Courier New', ui-monospace, monospace",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    maxHeight: 240,
    overflow: "auto"
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "5px 8px",
    borderRadius: 6,
    fontSize: 11.5,
    border: "1px solid hsl(var(--border))",
    background: "hsl(var(--background))",
    color: "hsl(var(--foreground))",
    outline: "none"
  },
  hint: { fontSize: 11, color: "hsl(var(--muted-foreground))", lineHeight: 1.7 }
};
function isLatexPath(p) {
  if (!p) return false;
  return /\.(tex|latex|ltx|bib|cls|sty|dtx|ins)$/i.test(String(p));
}
function truncationNote(text) {
  const m = String(text || "").match(/\[已截断,\s*原\s*(\d+)\s*字符\]/);
  return m ? m[1] : "";
}
function unwrapFence(s) {
  const t = String(s || "").trim();
  if (t.indexOf("```") === 0) {
    const lines = t.split(/\r?\n/);
    if (lines.length >= 2) {
      lines.shift();
      if (lines[lines.length - 1].trim() === "```") lines.pop();
      return lines.join("\n").trim();
    }
  }
  return t;
}
function baseName(p) {
  const s = String(p || "");
  const seg = s.split(/[\\/]/);
  return seg[seg.length - 1] || s;
}
function LatexSelectionPanel(props) {
  const ctx = props && props.ctx || null;
  const sel = ctx && ctx.selection || null;
  const ctxHasSelectionField = !!(ctx && Object.prototype.hasOwnProperty.call(ctx, "selection"));
  const [action, setAction] = useState("polish");
  const [custom, setCustom] = useState("");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [snap, setSnap] = useState(null);
  const abortRef = useRef(null);
  useEffect(function() {
    try {
      const raw = sessionStorage.getItem("notrat-latex-selection");
      if (raw) {
        const s = JSON.parse(raw);
        if (s && typeof s.out === "string") setOut(s.out);
        if (s && typeof s.action === "string") setAction(s.action);
      }
    } catch (e) {
    }
  }, []);
  useEffect(
    function() {
      try {
        sessionStorage.setItem("notrat-latex-selection", JSON.stringify({ out, action }));
      } catch (e) {
      }
    },
    [out, action]
  );
  useEffect(function() {
    return function() {
      if (abortRef.current) {
        try {
          abortRef.current.abort();
        } catch (e) {
        }
        abortRef.current = null;
      }
    };
  }, []);
  useEffect(
    function() {
      if (!toast) return void 0;
      const t = setTimeout(function() {
        setToast("");
      }, 2200);
      return function() {
        clearTimeout(t);
      };
    },
    [toast]
  );
  const stop = useCallback(function() {
    if (abortRef.current) {
      try {
        abortRef.current.abort();
      } catch (e) {
      }
      abortRef.current = null;
    }
    setBusy(false);
  }, []);
  const run = useCallback(
    async function(act) {
      const s = sel;
      if (!s || !s.text) {
        setErr("\u5F53\u524D\u6CA1\u6709\u5212\u8BCD\u5185\u5BB9");
        return;
      }
      const provider = resolveProvider();
      if (!provider) {
        setErr("\u8BFB\u4E0D\u5230\u5DF2\u914D\u7F6E\u7684 AI \u4F9B\u5E94\u5546\u3002\u8BF7\u5148\u5728 Notrat \u8BBE\u7F6E\u91CC\u914D\u597D\u4E00\u4E2A\u6A21\u578B\u4F9B\u5E94\u5546\u3002");
        return;
      }
      if (!provider.apiKey) {
        setErr("\u4F9B\u5E94\u5546\u300C" + (provider.id || "?") + "\u300D\u6CA1\u6709\u53EF\u7528\u7684 API Key\uFF0C\u8BF7\u5230\u8BBE\u7F6E\u91CC\u8865\u5168\u3002");
        return;
      }
      const instruction = act.id === "custom" ? String(custom || "").trim() : act.ask;
      if (!instruction) {
        setErr("\u8BF7\u5148\u586B\u5199\u81EA\u5B9A\u4E49\u6307\u4EE4");
        return;
      }
      setErr("");
      setBusy(true);
      setOut("");
      setSnap({ text: s.text, filePath: s.filePath, lineFrom: s.lineFrom, lineTo: s.lineTo });
      const parts = [];
      if (s.filePath) parts.push("\u6E90\u6587\u4EF6\uFF1A" + s.filePath);
      if (s.lineFrom != null) parts.push("\u884C\u53F7\uFF1A" + s.lineFrom + (s.lineTo != null ? "-" + s.lineTo : ""));
      if (parts.length) parts.push("");
      parts.push("\u9009\u4E2D\u6587\u672C\uFF1A");
      parts.push("```latex");
      parts.push(String(s.text));
      parts.push("```");
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      abortRef.current = ctrl;
      try {
        await streamChat({
          provider,
          system: SYS_BASE,
          user: instruction + "\n\n" + parts.join("\n"),
          signal: ctrl ? ctrl.signal : void 0,
          onDelta: function(acc) {
            setOut(acc);
          }
        });
      } catch (e) {
        const msg = String(e && e.message || e);
        if (!/abort/i.test(msg)) setErr(msg);
      } finally {
        abortRef.current = null;
        setBusy(false);
      }
    },
    [sel, custom]
  );
  function copy() {
    const t = unwrapFence(out);
    if (!t) return;
    try {
      navigator.clipboard.writeText(t);
      setToast("\u2713 \u5DF2\u590D\u5236");
    } catch (e) {
      setErr("\u590D\u5236\u5931\u8D25\uFF1A" + String(e && e.message || e));
    }
  }
  function quote() {
    const t = unwrapFence(out);
    if (!t) return;
    try {
      window.dispatchEvent(
        new CustomEvent("notrat-quote-to-chat", {
          detail: {
            text: t,
            source: "\u270D\uFE0F LaTeX \u5212\u8BCD" + (snap && snap.filePath ? " \xB7 " + baseName(snap.filePath) : ""),
            filePath: snap && snap.filePath || "",
            lineFrom: snap ? snap.lineFrom : void 0,
            lineTo: snap ? snap.lineTo : void 0
          }
        })
      );
      setToast("\u2713 \u5DF2\u5F15\u7528\u5230 AI \u5BF9\u8BDD");
    } catch (e) {
      setErr("\u5F15\u7528\u5931\u8D25\uFF1A" + String(e && e.message || e));
    }
  }
  if (!sel || !sel.text) {
    return /* @__PURE__ */ jsx("div", { style: S.root, children: /* @__PURE__ */ jsxs("div", { style: S.card, children: [
      /* @__PURE__ */ jsx("div", { style: S.cardTitle, children: /* @__PURE__ */ jsx("span", { children: "\u270D\uFE0F \u5212\u8BCD\u52A9\u624B" }) }),
      /* @__PURE__ */ jsxs("div", { style: S.hint, children: [
        !ctxHasSelectionField ? "\u5F53\u524D\u5BBF\u4E3B\u7248\u672C\u672A\u6CE8\u5165 ctx.selection\uFF0C\u5212\u8BCD\u52A9\u624B\u4E0D\u53EF\u7528\uFF08\u9700\u8F83\u65B0\u7684 Notrat \u5BA2\u6237\u7AEF\uFF09\u3002" : "\u5728 .tex \u6587\u4EF6\u91CC\u9009\u4E2D\u4E00\u6BB5\u6587\u5B57\uFF0C\u8FD9\u91CC\u5C31\u4F1A\u51FA\u73B0\u6DA6\u8272 / \u7FFB\u8BD1 / \u89E3\u91CA\u516C\u5F0F\u7B49\u52A8\u4F5C\u3002",
        /* @__PURE__ */ jsx("br", {}),
        /* @__PURE__ */ jsx("br", {}),
        /* @__PURE__ */ jsx("span", { style: { color: C.info }, children: "\u6CA1\u53CD\u5E94\uFF1F\u4E24\u79CD\u53EF\u80FD\uFF1A\u2460 \u8FD8\u6CA1\u9009\u4E2D\u6587\u5B57\uFF1B\u2461 \u5212\u8BCD\u5F15\u7528\u5C5E\u57FA\u7840\u7248\u53CA\u4EE5\u4E0A\u6743\u76CA\uFF0C\u7EAF\u51C0\u7248\u4E0D\u5305\u542B\u3002" })
      ] })
    ] }) });
  }
  const truncated = truncationNote(sel.text);
  const cur = ACTIONS.filter(function(a) {
    return a.id === action;
  })[0];
  return /* @__PURE__ */ jsxs("div", { style: S.root, children: [
    toast ? /* @__PURE__ */ jsx(
      "div",
      {
        style: {
          background: C.ok,
          color: "#fff",
          borderRadius: 6,
          padding: "4px 9px",
          fontSize: 11,
          marginBottom: 8
        },
        children: toast
      }
    ) : null,
    /* @__PURE__ */ jsxs("div", { style: S.card, children: [
      /* @__PURE__ */ jsxs("div", { style: S.cardTitle, children: [
        /* @__PURE__ */ jsx("span", { children: "\u270D\uFE0F \u5212\u8BCD\u52A9\u624B" }),
        /* @__PURE__ */ jsx("span", { style: { fontWeight: 400, fontSize: 10 }, children: busy ? /* @__PURE__ */ jsx("span", { style: { color: C.warning }, children: "\u751F\u6210\u4E2D\u2026" }) : /* @__PURE__ */ jsx("span", { style: { color: C.info }, children: "\u5C31\u7EEA" }) })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { marginBottom: 6 }, children: [
        /* @__PURE__ */ jsxs("span", { style: S.chip, children: [
          "\u{1F4C4} ",
          baseName(sel.filePath) || sel.source || "\u672A\u547D\u540D"
        ] }),
        sel.lineFrom != null ? /* @__PURE__ */ jsxs("span", { style: S.chip, children: [
          "L",
          sel.lineFrom,
          sel.lineTo != null && sel.lineTo !== sel.lineFrom ? "-" + sel.lineTo : ""
        ] }) : null,
        /* @__PURE__ */ jsxs("span", { style: S.chip, children: [
          String(sel.text).length,
          " \u5B57\u7B26"
        ] })
      ] }),
      !isLatexPath(sel.filePath) ? /* @__PURE__ */ jsx("div", { style: { ...S.hint, color: C.warning, marginBottom: 6 }, children: "\u26A0 \u5F53\u524D\u6587\u4EF6\u4E0D\u662F LaTeX \u7CFB\u540E\u7F00\uFF0C\u52A8\u4F5C\u63D0\u793A\u8BCD\u6309 LaTeX \u8BED\u5883\u7ED9\u51FA\uFF0C\u6548\u679C\u53EF\u80FD\u6253\u6298\u6263\u3002" }) : null,
      truncated ? /* @__PURE__ */ jsxs("div", { style: { ...S.hint, color: C.warning, marginBottom: 6 }, children: [
        "\u26A0 \u9009\u533A\u8FC7\u957F\u5DF2\u88AB\u5BBF\u4E3B\u622A\u65AD\uFF08\u539F\u6587 ",
        truncated,
        " \u5B57\u7B26\uFF09\uFF0C\u7ED3\u679C\u53EA\u8986\u76D6\u53EF\u7528\u7684\u524D\u4E00\u6BB5\u3002"
      ] }) : null,
      /* @__PURE__ */ jsx("div", { style: { ...S.pre, maxHeight: 120 }, children: sel.text })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: S.card, children: [
      /* @__PURE__ */ jsx("div", { style: S.cardTitle, children: /* @__PURE__ */ jsx("span", { children: "\u52A8\u4F5C" }) }),
      /* @__PURE__ */ jsxs("div", { children: [
        ACTIONS.map(function(a) {
          const on = a.id === action;
          return /* @__PURE__ */ jsx(
            "button",
            {
              title: a.hint,
              disabled: busy,
              onClick: function() {
                setAction(a.id);
                run(a);
              },
              style: on ? S.btnOn : S.btn,
              children: a.label
            },
            a.id
          );
        }),
        /* @__PURE__ */ jsx(
          "button",
          {
            title: "\u7528\u4F60\u81EA\u5DF1\u7684\u6307\u4EE4\u5904\u7406\u8FD9\u6BB5\u9009\u533A",
            disabled: busy,
            onClick: function() {
              setAction("custom");
            },
            style: action === "custom" ? S.btnOn : S.btn,
            children: "\u81EA\u5B9A\u4E49"
          }
        )
      ] }),
      action === "custom" ? /* @__PURE__ */ jsxs("div", { style: { marginTop: 6 }, children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            style: S.input,
            placeholder: "\u4F8B\u5982\uFF1A\u628A\u8FD9\u6BB5\u6539\u6210\u6295\u7A3F\u4FE1\u7684\u6B63\u5F0F\u53E3\u543B",
            value: custom,
            onChange: function(e) {
              setCustom(e.target.value);
            },
            onKeyDown: function(e) {
              if (e.key === "Enter" && !busy) run({ id: "custom" });
            }
          }
        ),
        /* @__PURE__ */ jsx("div", { style: { marginTop: 6 }, children: /* @__PURE__ */ jsx(
          "button",
          {
            disabled: busy || !String(custom || "").trim(),
            onClick: function() {
              run({ id: "custom" });
            },
            style: S.btnPrimary,
            children: "\u6267\u884C"
          }
        ) })
      ] }) : cur ? /* @__PURE__ */ jsx("div", { style: { ...S.hint, marginTop: 2 }, children: cur.hint }) : null
    ] }),
    err ? /* @__PURE__ */ jsxs("div", { style: { ...S.card, borderColor: C.error }, children: [
      /* @__PURE__ */ jsx("div", { style: { ...S.cardTitle, color: C.error }, children: /* @__PURE__ */ jsx("span", { children: "\u51FA\u9519\u4E86" }) }),
      /* @__PURE__ */ jsx("div", { style: { ...S.hint, color: C.error }, children: err })
    ] }) : null,
    out || busy ? /* @__PURE__ */ jsxs("div", { style: S.card, children: [
      /* @__PURE__ */ jsxs("div", { style: S.cardTitle, children: [
        /* @__PURE__ */ jsx("span", { children: "\u7ED3\u679C" }),
        /* @__PURE__ */ jsx("span", { children: busy ? /* @__PURE__ */ jsx("button", { onClick: stop, style: S.btn, children: "\u505C\u6B62" }) : null })
      ] }),
      /* @__PURE__ */ jsx("div", { style: S.pre, children: out || "\u2026" }),
      !busy && out ? /* @__PURE__ */ jsxs("div", { style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx("button", { onClick: quote, style: S.btnPrimary, children: "\u{1F4AC} \u5F15\u7528\u5230\u5BF9\u8BDD" }),
        /* @__PURE__ */ jsx("button", { onClick: copy, style: { ...S.btn, marginLeft: 6 }, children: "\u{1F4CB} \u590D\u5236" }),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: function() {
              setOut("");
              setErr("");
            },
            style: { ...S.btn, marginLeft: 6 },
            children: "\u21BA \u6E05\u7A7A"
          }
        )
      ] }) : null
    ] }) : null
  ] });
}
export {
  LatexSelectionPanel as default
};
