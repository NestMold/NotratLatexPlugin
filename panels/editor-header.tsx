import React, { useState, useEffect, useCallback } from "react";

/* =========================================================================
 * LaTeX 助手 — 编辑器顶部控制带（新贡献面：location = "editor-header"）
 * 只在 LaTeX 系文件（tex/bib/cls/sty）上显示；非 LaTeX 文件直接不渲染。
 * 能力：编译 / 校验 / 状态 / 引用到对话 / 打开整页
 * ========================================================================= */

const S = {
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 8px",
    borderBottom: "1px solid hsl(var(--border))",
    background: "hsl(var(--card))",
    color: "hsl(var(--foreground))",
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontSize: 11,
    flexWrap: "wrap",
    rowGap: 3,
  },
  btn: {
    border: "1px solid hsl(var(--border))",
    background: "hsl(var(--background))",
    color: "hsl(var(--foreground))",
    borderRadius: 5,
    padding: "2px 7px",
    fontSize: 11,
    cursor: "pointer",
    lineHeight: "16px",
    whiteSpace: "nowrap",
  },
  primary: {
    border: "1px solid hsl(var(--primary))",
    background: "hsl(var(--primary))",
    color: "hsl(var(--primary-foreground))",
    borderRadius: 5,
    padding: "2px 8px",
    fontSize: 11,
    cursor: "pointer",
    fontWeight: 600,
    lineHeight: "16px",
    whiteSpace: "nowrap",
  },
  status: { color: "hsl(var(--muted-foreground))", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 120 },
  out: {
    flexBasis: "100%",
    margin: 0,
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
    fontSize: 10.5,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    color: "hsl(var(--muted-foreground))",
    maxHeight: 120,
    overflow: "auto",
    borderTop: "1px dashed hsl(var(--border))",
    paddingTop: 4,
  },
};

/* =========================================================================
 * 活动文件桥（消费侧）
 * 面板拿不到活动文件（官方 props 无 filePath），上一版只能回落 sessionStorage 里
 * 上一份 .tex，导致「切到其它格式仍显示 LaTeX 大纲」。这里改为问编辑器：
 *   · notrat-latex-active-ping   面板挂载时问一次，编辑器同步回话
 *   · notrat-latex-active-file   编辑器 挂载/切文件/卸载 时广播
 *   · sessionStorage 快照        面板比事件晚挂载时的兜底（8s 内视为有效）
 * ========================================================================= */
const LATEX_EV = "notrat-latex-active-file";
const LATEX_PING = "notrat-latex-active-ping";
const LATEX_STORE = "notrat-latex-active";
const LATEX_EXT = /\.(tex|bib|cls|sty|ltx|latex)$/i;

function isLatexPath(p) {
  return LATEX_EXT.test(String(p || ""));
}

function readActiveSnapshot() {
  try {
    const s = JSON.parse(sessionStorage.getItem(LATEX_STORE) || "null");
    if (s && isLatexPath(s.path) && Date.now() - (Number(s.at) || 0) < 8000) return String(s.path);
  } catch (e) {}
  return "";
}

/* 返回 { ready, path }：ready=false 表示还在探测；path="" 表示当前不是 LaTeX 文件 */
function useActiveLatexFile() {
  const [state, setState] = useState(function () {
    const snap = readActiveSnapshot();
    return { ready: !!snap, path: snap };
  });
  useEffect(function () {
    let settled = false;
    function apply(p) {
      settled = true;
      setState({ ready: true, path: isLatexPath(p) ? String(p) : "" });
    }
    function onActive(e) { apply(e && e.detail ? e.detail.path : ""); }
    window.addEventListener(LATEX_EV, onActive);
    try { window.dispatchEvent(new CustomEvent(LATEX_PING)); } catch (e) {}
    const t = setTimeout(function () { if (!settled) apply(readActiveSnapshot()); }, 250);
    return function () {
      window.removeEventListener(LATEX_EV, onActive);
      clearTimeout(t);
    };
  }, []);
  return state;
}

export default function LatexEditorHeader(props) {
  const act = useActiveLatexFile();
  const [file, setFile] = useState(function () { return readActiveSnapshot(); });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState("");
  const [out, setOut] = useState("");
  const [open, setOpen] = useState(false);

  const api = typeof window !== "undefined" ? window.electronAPI : null;

  const callTool = useCallback(
    async function (tool, args) {
      if (!api || !api.mcp || !api.mcp.callTool) throw new Error("electronAPI.mcp 不可用（宿主未注入）");
      const r = await api.mcp.callTool(props.serverId, tool, args);
      if (!r || r.success === false) throw new Error((r && r.error) || "工具调用失败");
      return (r.result && r.result.content ? r.result.content : []).map(function (c) { return c.text; }).join("\n");
    },
    [api, props.serverId]
  );

  /* 跟随当前活动文件（面板拿不到 filePath，走活动文件桥） */
  useEffect(
    function () {
      setFile(act.ready ? act.path : "");
      setStatus("");
    },
    [act.ready, act.path]
  );


  const refreshStatus = useCallback(
    async function () {
      if (!LATEX_EXT.test(file || "")) return;
      try {
        setStatus(await callTool("latex_status", { path: file }));
      } catch (e) {
        setStatus(String((e && e.message) || e));
      }
    },
    [callTool, file]
  );

  useEffect(
    function () {
      if (!LATEX_EXT.test(file || "")) return;
      refreshStatus();
      const t = setInterval(refreshStatus, 20000);
      return function () { clearInterval(t); };
    },
    [file, refreshStatus]
  );

  async function run(tool, args) {
    setBusy(tool);
    setOut("");
    setOpen(true);
    try {
      setOut(await callTool(tool, args));
    } catch (e) {
      setOut("❌ " + String((e && e.message) || e));
    } finally {
      setBusy("");
      refreshStatus();
    }
  }

  if (!LATEX_EXT.test(file || "")) return null;

  const fname = String(file || "").split(/[\\/]/).pop();

  function quoteOut() {
    try {
      window.dispatchEvent(
        new CustomEvent("notrat-quote-to-chat", {
          detail: { text: out, source: "LaTeX 输出 · " + fname },
        })
      );
    } catch (e) {}
  }

  return (
    <div style={S.bar}>
      <span style={{ fontWeight: 700 }}>📐 {fname}</span>
      <button style={S.primary} onClick={function () { run("latex_compile", { path: file }); }} disabled={!!busy}>
        {busy === "latex_compile" ? "⏳ 编译中…" : "🔨 编译"}
      </button>
      <button style={S.btn} onClick={function () { run("latex_validate", { path: file }); }} disabled={!!busy}>
        {busy === "latex_validate" ? "⏳" : "✅ 校验"}
      </button>
      <button style={S.btn} onClick={function () { run("latex_outline", { path: file }); }} disabled={!!busy} title="输出大纲（含行号）">
        🧭 大纲
      </button>
      <button
        style={S.btn}
        title="打开 LaTeX 结构整页"
        onClick={function () {
          try {
            window.dispatchEvent(
              new CustomEvent("notrat-open-plugin-page", {
                detail: { key: props.pluginId + ":latex-page", title: "LaTeX 结构" },
              })
            );
          } catch (e) {}
        }}
      >
        ⤢
      </button>
      <span style={S.status} title={status}>
        {status || "…"}
      </span>
      {out ? (
        <button style={S.btn} onClick={function () { setOpen(!open); }}>
          {open ? "▾ 收起输出" : "▸ 展开输出"}
        </button>
      ) : null}
      {out ? (
        <button style={S.btn} onClick={quoteOut} title="把输出钉到对话输入框">
          💬
        </button>
      ) : null}
      {out && open ? <pre style={S.out}>{out}</pre> : null}
    </div>
  );
}
