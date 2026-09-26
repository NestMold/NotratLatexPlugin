import React, { useState, useEffect, useCallback } from "react";

/* =========================================================================
 * LaTeX 助手 — 悬浮器（新贡献面：location = "widget"）
 * 一个小卡片：状态行 + 编译 / 校验 / 快照 / 整页。
 * 可被用户右键「移动到…」拖到任意位置，样式钩子 .notrat-plugin-panel-notrat-latex-plugin
 * ========================================================================= */

const S = {
  root: {
    width: 248,
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    background: "hsl(var(--card))",
    color: "hsl(var(--foreground))",
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontSize: 11.5,
    padding: 8,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    boxSizing: "border-box",
  },
  head: { display: "flex", alignItems: "center", gap: 6 },
  name: { fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 },
  row: { display: "flex", gap: 5, flexWrap: "wrap" },
  btn: {
    border: "1px solid hsl(var(--border))",
    background: "hsl(var(--background))",
    color: "hsl(var(--foreground))",
    borderRadius: 5,
    padding: "2px 8px",
    fontSize: 11,
    cursor: "pointer",
    lineHeight: "16px",
  },
  primary: {
    border: "1px solid hsl(var(--primary))",
    background: "hsl(var(--primary))",
    color: "hsl(var(--primary-foreground))",
    borderRadius: 5,
    padding: "2px 9px",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    lineHeight: "16px",
  },
  status: { color: "hsl(var(--muted-foreground))", fontSize: 10.5, lineHeight: 1.6, wordBreak: "break-word" },
  out: {
    margin: 0,
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
    fontSize: 10,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    maxHeight: 132,
    overflow: "auto",
    borderTop: "1px dashed hsl(var(--border))",
    paddingTop: 5,
    color: "hsl(var(--muted-foreground))",
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

export default function LatexWidget(props) {
  const act = useActiveLatexFile();
  const [file, setFile] = useState(function () { return readActiveSnapshot(); });
  const [status, setStatus] = useState("");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState("");

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

  const refresh = useCallback(
    async function () {
      if (!file) { setStatus(""); return; }
      try {
        setStatus(await callTool("latex_status", { path: file }));
      } catch (e) {
        setStatus(String((e && e.message) || e));
      }
    },
    [callTool, file]
  );


  /* 跟随当前活动文件（面板拿不到 filePath，走活动文件桥） */
  useEffect(
    function () {
      setFile(act.ready ? act.path : "");
      setStatus("");
      setOut("");
    },
    [act.ready, act.path]
  );

  useEffect(
    function () {
      if (!file) return;
      refresh();
    },
    [file]
  );


  async function run(tool, args) {
    setBusy(tool);
    try {
      setOut(await callTool(tool, args));
    } catch (e) {
      setOut("❌ " + String((e && e.message) || e));
    } finally {
      setBusy("");
      refresh();
    }
  }

  /* 非 LaTeX 活动文件：收起按钮，只留一行说明 */
  if (act.ready && !act.path) {
    return (
      <div style={S.root}>
        <div style={S.head}>
          <span>📐</span>
          <span style={S.name}>LaTeX 助手</span>
        </div>
        <div style={S.status}>当前不是 LaTeX 文件，切到 .tex 后可编译 / 校验 / 快照。</div>
      </div>
    );
  }

  const fname = file ? String(file).split(/[\\/]/).pop() : "(自动发现主文件)";

  return (
    <div style={S.root}>
      <div style={S.head}>
        <span>📐</span>
        <span style={S.name} title={file || "全工作区自动发现"}>
          {fname}
        </span>
      </div>

      <div style={S.status} title="点击刷新" onClick={refresh}>
        {status || "读取状态…"}
      </div>

      <div style={S.row}>
        <button style={S.primary} onClick={function () { run("latex_compile", { path: file }); }} disabled={!!busy}>
          {busy === "latex_compile" ? "⏳ 编译…" : "🔨 编译"}
        </button>
        <button style={S.btn} onClick={function () { run("latex_validate", { path: file }); }} disabled={!!busy}>
          {busy === "latex_validate" ? "⏳" : "✅ 校验"}
        </button>
        <button style={S.btn} onClick={function () { run("latex_backup", { path: file }); }} disabled={!!busy} title="把源码快照到 .latex-history/">
          🗂 快照
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
      </div>

      {out ? <pre style={S.out}>{out}</pre> : null}
    </div>
  );
}
