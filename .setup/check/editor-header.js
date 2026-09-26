import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from "react";
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
    rowGap: 3
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
    whiteSpace: "nowrap"
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
    whiteSpace: "nowrap"
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
    paddingTop: 4
  }
};
const LATEX_EXT = /\.(tex|bib|cls|sty|ltx|latex)$/i;
function pickFile(props) {
  const p = props.launch && props.launch.params ? props.launch.params : null;
  const cand = p && (p.filePath || p.fileName) || props.filePath || props.file || "";
  if (cand) return String(cand);
  try {
    const s = JSON.parse(sessionStorage.getItem("notrat-latex-panel") || "{}");
    if (s && s.file) return String(s.file);
  } catch (e) {
  }
  return "";
}
function LatexEditorHeader(props) {
  const [file, setFile] = useState(function() {
    return pickFile(props);
  });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState("");
  const [out, setOut] = useState("");
  const [open, setOpen] = useState(false);
  const api = typeof window !== "undefined" ? window.electronAPI : null;
  const callTool = useCallback(
    async function(tool, args) {
      if (!api || !api.mcp || !api.mcp.callTool) throw new Error("electronAPI.mcp \u4E0D\u53EF\u7528\uFF08\u5BBF\u4E3B\u672A\u6CE8\u5165\uFF09");
      const r = await api.mcp.callTool(props.serverId, tool, args);
      if (!r || r.success === false) throw new Error(r && r.error || "\u5DE5\u5177\u8C03\u7528\u5931\u8D25");
      return (r.result && r.result.content ? r.result.content : []).map(function(c) {
        return c.text;
      }).join("\n");
    },
    [api, props.serverId]
  );
  useEffect(
    function() {
      const f = pickFile(props);
      if (f && f !== file) setFile(f);
    },
    [props.filePath, props.file]
  );
  const refreshStatus = useCallback(
    async function() {
      if (!LATEX_EXT.test(file || "")) return;
      try {
        setStatus(await callTool("latex_status", { path: file }));
      } catch (e) {
        setStatus(String(e && e.message || e));
      }
    },
    [callTool, file]
  );
  useEffect(
    function() {
      if (!LATEX_EXT.test(file || "")) return;
      refreshStatus();
      const t = setInterval(refreshStatus, 2e4);
      return function() {
        clearInterval(t);
      };
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
      setOut("\u274C " + String(e && e.message || e));
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
          detail: { text: out, source: "LaTeX \u8F93\u51FA \xB7 " + fname }
        })
      );
    } catch (e) {
    }
  }
  return /* @__PURE__ */ jsxs("div", { style: S.bar, children: [
    /* @__PURE__ */ jsxs("span", { style: { fontWeight: 700 }, children: [
      "\u{1F4D0} ",
      fname
    ] }),
    /* @__PURE__ */ jsx("button", { style: S.primary, onClick: function() {
      run("latex_compile", { path: file });
    }, disabled: !!busy, children: busy === "latex_compile" ? "\u23F3 \u7F16\u8BD1\u4E2D\u2026" : "\u{1F528} \u7F16\u8BD1" }),
    /* @__PURE__ */ jsx("button", { style: S.btn, onClick: function() {
      run("latex_validate", { path: file });
    }, disabled: !!busy, children: busy === "latex_validate" ? "\u23F3" : "\u2705 \u6821\u9A8C" }),
    /* @__PURE__ */ jsx("button", { style: S.btn, onClick: function() {
      run("latex_outline", { path: file });
    }, disabled: !!busy, title: "\u8F93\u51FA\u5927\u7EB2\uFF08\u542B\u884C\u53F7\uFF09", children: "\u{1F9ED} \u5927\u7EB2" }),
    /* @__PURE__ */ jsx(
      "button",
      {
        style: S.btn,
        title: "\u6253\u5F00 LaTeX \u7ED3\u6784\u6574\u9875",
        onClick: function() {
          try {
            window.dispatchEvent(
              new CustomEvent("notrat-open-plugin-page", {
                detail: { key: props.pluginId + ":latex-page", title: "LaTeX \u7ED3\u6784" }
              })
            );
          } catch (e) {
          }
        },
        children: "\u2922"
      }
    ),
    /* @__PURE__ */ jsx("span", { style: S.status, title: status, children: status || "\u2026" }),
    out ? /* @__PURE__ */ jsx("button", { style: S.btn, onClick: function() {
      setOpen(!open);
    }, children: open ? "\u25BE \u6536\u8D77\u8F93\u51FA" : "\u25B8 \u5C55\u5F00\u8F93\u51FA" }) : null,
    out ? /* @__PURE__ */ jsx("button", { style: S.btn, onClick: quoteOut, title: "\u628A\u8F93\u51FA\u9489\u5230\u5BF9\u8BDD\u8F93\u5165\u6846", children: "\u{1F4AC}" }) : null,
    out && open ? /* @__PURE__ */ jsx("pre", { style: S.out, children: out }) : null
  ] });
}
export {
  LatexEditorHeader as default
};
