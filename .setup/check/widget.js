import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from "react";
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
    boxSizing: "border-box"
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
    lineHeight: "16px"
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
    lineHeight: "16px"
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
    color: "hsl(var(--muted-foreground))"
  }
};
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
function LatexWidget(props) {
  const [file, setFile] = useState(function() {
    return pickFile(props);
  });
  const [status, setStatus] = useState("");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState("");
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
  const refresh = useCallback(
    async function() {
      try {
        const s = await callTool("latex_status", { path: file });
        setStatus(s);
        const m = s.match(/^📐\s+(\S+)/);
        if (m && (!file || file.split(/[\\/]/).pop() !== m[1])) {
          const r = await callTool("latex_parse", { path: file, format: "json" });
          const j = JSON.parse(r);
          if (j && j.file) setFile(j.file);
        }
      } catch (e) {
        setStatus(String(e && e.message || e));
      }
    },
    [callTool, file]
  );
  useEffect(
    function() {
      refresh();
    },
    [file]
  );
  async function run(tool, args) {
    setBusy(tool);
    try {
      setOut(await callTool(tool, args));
    } catch (e) {
      setOut("\u274C " + String(e && e.message || e));
    } finally {
      setBusy("");
      refresh();
    }
  }
  const fname = file ? String(file).split(/[\\/]/).pop() : "(\u81EA\u52A8\u53D1\u73B0\u4E3B\u6587\u4EF6)";
  return /* @__PURE__ */ jsxs("div", { style: S.root, children: [
    /* @__PURE__ */ jsxs("div", { style: S.head, children: [
      /* @__PURE__ */ jsx("span", { children: "\u{1F4D0}" }),
      /* @__PURE__ */ jsx("span", { style: S.name, title: file || "\u5168\u5DE5\u4F5C\u533A\u81EA\u52A8\u53D1\u73B0", children: fname })
    ] }),
    /* @__PURE__ */ jsx("div", { style: S.status, title: "\u70B9\u51FB\u5237\u65B0", onClick: refresh, children: status || "\u8BFB\u53D6\u72B6\u6001\u2026" }),
    /* @__PURE__ */ jsxs("div", { style: S.row, children: [
      /* @__PURE__ */ jsx("button", { style: S.primary, onClick: function() {
        run("latex_compile", { path: file });
      }, disabled: !!busy, children: busy === "latex_compile" ? "\u23F3 \u7F16\u8BD1\u2026" : "\u{1F528} \u7F16\u8BD1" }),
      /* @__PURE__ */ jsx("button", { style: S.btn, onClick: function() {
        run("latex_validate", { path: file });
      }, disabled: !!busy, children: busy === "latex_validate" ? "\u23F3" : "\u2705 \u6821\u9A8C" }),
      /* @__PURE__ */ jsx("button", { style: S.btn, onClick: function() {
        run("latex_backup", { path: file });
      }, disabled: !!busy, title: "\u628A\u6E90\u7801\u5FEB\u7167\u5230 .latex-history/", children: "\u{1F5C2} \u5FEB\u7167" }),
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
      )
    ] }),
    out ? /* @__PURE__ */ jsx("pre", { style: S.out, children: out }) : null
  ] });
}
export {
  LatexWidget as default
};
