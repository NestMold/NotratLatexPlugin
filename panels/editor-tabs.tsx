import React, { useState, useEffect, useCallback } from "react";

/* =========================================================================
 * LaTeX 助手 — 标签栏徽章（新贡献面：location = "editor-tabs"）
 * 编辑器标签栏上的一个极简指示器：当前 .tex 的错误/警告计数，点击即校验。
 * 非 LaTeX 文件不渲染，避免污染其他标签。
 * ========================================================================= */

const S = {
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    border: "1px solid hsl(var(--border))",
    background: "hsl(var(--card))",
    color: "hsl(var(--muted-foreground))",
    borderRadius: 10,
    padding: "0 7px",
    height: 18,
    fontSize: 10.5,
    lineHeight: "16px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
  err: { borderColor: "hsl(var(--destructive))", color: "hsl(var(--destructive))" },
  run: { borderColor: "hsl(var(--primary))", color: "hsl(var(--primary))" },
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

export default function LatexTabBadge(props) {
  const act = useActiveLatexFile();
  const [file, setFile] = useState(function () { return readActiveSnapshot(); });
  const [sum, setSum] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const api = typeof window !== "undefined" ? window.electronAPI : null;

  const check = useCallback(async function () {
    if (!api || !api.mcp || !api.mcp.callTool) {
      setErr(true);
      return;
    }
    setBusy(true);
    setErr(false);
    try {
      const r = await api.mcp.callTool(props.serverId, "latex_validate", { path: file, format: "json" });
      if (!r || r.success === false) throw new Error((r && r.error) || "调用失败");
      const txt = (r.result && r.result.content ? r.result.content : []).map(function (c) { return c.text; }).join("\n");
      setSum(JSON.parse(txt).summary || null);
    } catch (e) {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }, [api, props.serverId, file]);

  useEffect(
    function () {
      if (LATEX_EXT.test(file || "")) check();
    },
    [file, check]
  );

  /* 跟随当前活动文件（非 LaTeX 时下面 return null，徽章不渲染） */
  useEffect(
    function () {
      setFile(act.ready ? act.path : "");
    },
    [act.ready, act.path]
  );


  if (!LATEX_EXT.test(file || "")) return null;

  const bad = sum ? sum.errors + sum.warnings : 0;
  const style = err || (sum && sum.errors > 0) ? { ...S.chip, ...S.err } : busy ? { ...S.chip, ...S.run } : S.chip;
  const label = busy ? "⏳ LaTeX" : err ? "⚠ LaTeX" : !sum ? "LaTeX" : bad > 0 ? "⚠ " + sum.errors + " / " + sum.warnings : "✅ LaTeX";

  return (
    <span
      style={style}
      onClick={check}
      title={
        sum
          ? "LaTeX 校验：错误 " + sum.errors + " · 警告 " + sum.warnings + " · 提示 " + sum.infos + "（点击重新校验）"
          : "点击校验当前 LaTeX 文件"
      }
    >
      {label}
    </span>
  );
}
