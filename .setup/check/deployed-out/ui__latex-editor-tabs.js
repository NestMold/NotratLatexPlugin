import { jsx } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from "react";
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
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
  },
  err: { borderColor: "hsl(var(--destructive))", color: "hsl(var(--destructive))" },
  run: { borderColor: "hsl(var(--primary))", color: "hsl(var(--primary))" }
};
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
    if (s && isLatexPath(s.path) && Date.now() - (Number(s.at) || 0) < 8e3) return String(s.path);
  } catch (e) {
  }
  return "";
}
function useActiveLatexFile() {
  const [state, setState] = useState(function() {
    const snap = readActiveSnapshot();
    return { ready: !!snap, path: snap };
  });
  useEffect(function() {
    let settled = false;
    function apply(p) {
      settled = true;
      setState({ ready: true, path: isLatexPath(p) ? String(p) : "" });
    }
    function onActive(e) {
      apply(e && e.detail ? e.detail.path : "");
    }
    window.addEventListener(LATEX_EV, onActive);
    try {
      window.dispatchEvent(new CustomEvent(LATEX_PING));
    } catch (e) {
    }
    const t = setTimeout(function() {
      if (!settled) apply(readActiveSnapshot());
    }, 250);
    return function() {
      window.removeEventListener(LATEX_EV, onActive);
      clearTimeout(t);
    };
  }, []);
  return state;
}
function LatexTabBadge(props) {
  const act = useActiveLatexFile();
  const [file, setFile] = useState(function() {
    return readActiveSnapshot();
  });
  const [sum, setSum] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const api = typeof window !== "undefined" ? window.electronAPI : null;
  const check = useCallback(async function() {
    if (!api || !api.mcp || !api.mcp.callTool) {
      setErr(true);
      return;
    }
    setBusy(true);
    setErr(false);
    try {
      const r = await api.mcp.callTool(props.serverId, "latex_validate", { path: file, format: "json" });
      if (!r || r.success === false) throw new Error(r && r.error || "\u8C03\u7528\u5931\u8D25");
      const txt = (r.result && r.result.content ? r.result.content : []).map(function(c) {
        return c.text;
      }).join("\n");
      setSum(JSON.parse(txt).summary || null);
    } catch (e) {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }, [api, props.serverId, file]);
  useEffect(
    function() {
      if (LATEX_EXT.test(file || "")) check();
    },
    [file, check]
  );
  useEffect(
    function() {
      setFile(act.ready ? act.path : "");
    },
    [act.ready, act.path]
  );
  if (!LATEX_EXT.test(file || "")) return null;
  const bad = sum ? sum.errors + sum.warnings : 0;
  const style = err || sum && sum.errors > 0 ? { ...S.chip, ...S.err } : busy ? { ...S.chip, ...S.run } : S.chip;
  const label = busy ? "\u23F3 LaTeX" : err ? "\u26A0 LaTeX" : !sum ? "LaTeX" : bad > 0 ? "\u26A0 " + sum.errors + " / " + sum.warnings : "\u2705 LaTeX";
  return /* @__PURE__ */ jsx(
    "span",
    {
      style,
      onClick: check,
      title: sum ? "LaTeX \u6821\u9A8C\uFF1A\u9519\u8BEF " + sum.errors + " \xB7 \u8B66\u544A " + sum.warnings + " \xB7 \u63D0\u793A " + sum.infos + "\uFF08\u70B9\u51FB\u91CD\u65B0\u6821\u9A8C\uFF09" : "\u70B9\u51FB\u6821\u9A8C\u5F53\u524D LaTeX \u6587\u4EF6",
      children: label
    }
  );
}
export {
  LatexTabBadge as default
};
