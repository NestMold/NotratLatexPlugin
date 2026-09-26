import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from "react";
const S = {
  root: {
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontSize: 12,
    color: "hsl(var(--foreground))",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden"
  },
  head: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 8px",
    borderBottom: "1px solid hsl(var(--border))",
    flexShrink: 0
  },
  title: { fontWeight: 600, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 },
  btn: {
    border: "1px solid hsl(var(--border))",
    background: "hsl(var(--card))",
    color: "hsl(var(--foreground))",
    borderRadius: 5,
    padding: "1px 6px",
    fontSize: 11,
    cursor: "pointer",
    lineHeight: "16px",
    whiteSpace: "nowrap"
  },
  body: { flex: 1, overflowY: "auto", padding: "4px 0" },
  row: {
    display: "flex",
    alignItems: "baseline",
    gap: 6,
    padding: "2px 8px 2px 4px",
    cursor: "default",
    borderRadius: 4
  },
  num: { color: "hsl(var(--muted-foreground))", fontVariantNumeric: "tabular-nums", fontSize: 11, flexShrink: 0 },
  txt: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  ln: { color: "hsl(var(--muted-foreground))", fontSize: 10, opacity: 0.7, flexShrink: 0 },
  badge: { fontSize: 10, padding: "0 4px", borderRadius: 4, border: "1px solid hsl(var(--border))", flexShrink: 0 },
  empty: { padding: 12, color: "hsl(var(--muted-foreground))", fontSize: 11, lineHeight: 1.7 },
  err: { margin: 8, padding: 8, borderRadius: 6, border: "1px solid hsl(var(--destructive))", color: "hsl(var(--destructive))", fontSize: 11, whiteSpace: "pre-wrap" }
};
const LEVEL_STYLE = [
  { fontWeight: 700, size: 12.5, indent: 0 },
  { fontWeight: 700, size: 12, indent: 0 },
  { fontWeight: 500, size: 11.5, indent: 12 },
  { fontWeight: 400, size: 11, indent: 24 }
];
function sectionNumbers(sections) {
  const c = [0, 0, 0, 0];
  return sections.map(function(s) {
    const lv = Math.max(0, Math.min(3, Number(s.level) || 0));
    c[lv]++;
    for (let k = lv + 1; k < 4; k++) c[k] = 0;
    if (lv === 0) return "\u7B2C" + c[0] + "\u90E8\u5206";
    if (lv === 1) return String(c[1]);
    if (lv === 2) return c[1] + "." + c[2];
    return c[1] + "." + c[2] + "." + c[3];
  });
}
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
function LatexOutline(props) {
  const [file, setFile] = useState(function() {
    return pickFile(props);
  });
  const [info, setInfo] = useState(null);
  const [issues, setIssues] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(-1);
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
  const load = useCallback(
    async function() {
      if (!api || !api.mcp || !api.mcp.callTool) {
        setErr("electronAPI.mcp \u4E0D\u53EF\u7528\uFF08\u5BBF\u4E3B\u672A\u6CE8\u5165\uFF09");
        return;
      }
      setBusy(true);
      setErr("");
      try {
        const parseOut = await callTool("latex_parse", { path: file, format: "json" });
        const parsed = JSON.parse(parseOut);
        setInfo(parsed);
        if (parsed && parsed.file && parsed.file !== file) setFile(parsed.file);
        try {
          sessionStorage.setItem("notrat-latex-panel", JSON.stringify({ file: parsed.file, info: parsed }));
        } catch (e) {
        }
        const valOut = await callTool("latex_validate", { path: parsed.file || file, format: "json" });
        setIssues(JSON.parse(valOut));
      } catch (e) {
        setErr(String(e && e.message || e));
      } finally {
        setBusy(false);
      }
    },
    [api, callTool, file]
  );
  useEffect(
    function() {
      load();
    },
    [props.ctx && props.ctx.workspace ? props.ctx.workspace.path : ""]
  );
  const sections = info && info.sections || [];
  const nums = sectionNumbers(sections);
  const issueLines = {};
  (issues && issues.issues || []).forEach(function(it) {
    if (!issueLines[it.line]) issueLines[it.line] = [];
    issueLines[it.line].push(it);
  });
  const sum = issues && issues.summary || { errors: 0, warnings: 0, infos: 0 };
  const fname = file ? String(file).split(/[\\/]/).pop() : "(\u81EA\u52A8\u53D1\u73B0)";
  function quote(s, num) {
    const text = "\\" + s.cmd + "{" + (s.title || "") + "}  \uFF08" + num + "\uFF0C" + fname + " \u7B2C " + s.line + " \u884C\uFF09";
    try {
      window.dispatchEvent(
        new CustomEvent("notrat-quote-to-chat", {
          detail: { text, source: fname, lineFrom: s.line, lineTo: s.line }
        })
      );
    } catch (e) {
    }
  }
  return /* @__PURE__ */ jsxs("div", { style: S.root, children: [
    /* @__PURE__ */ jsxs("div", { style: S.head, children: [
      /* @__PURE__ */ jsx("span", { style: { fontSize: 13 }, children: "\u{1F9ED}" }),
      /* @__PURE__ */ jsx("span", { style: S.title, title: file || "\u81EA\u52A8\u53D1\u73B0\u4E3B .tex", children: fname }),
      sum.errors + sum.warnings > 0 ? /* @__PURE__ */ jsxs("span", { style: { ...S.badge, color: "hsl(var(--destructive))", borderColor: "hsl(var(--destructive))" }, title: "\u9519\u8BEF / \u8B66\u544A", children: [
        "\u26A0 ",
        sum.errors,
        "/",
        sum.warnings
      ] }) : issues ? /* @__PURE__ */ jsx("span", { style: { ...S.badge, color: "hsl(var(--muted-foreground))" }, title: "\u6821\u9A8C\u901A\u8FC7", children: "\u2705" }) : null,
      /* @__PURE__ */ jsx("button", { style: S.btn, onClick: load, disabled: busy, title: "\u91CD\u65B0\u89E3\u6790", children: busy ? "\u23F3" : "\u21BB" })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: S.body, children: [
      err ? /* @__PURE__ */ jsx("div", { style: S.err, children: err }) : null,
      !err && !info ? /* @__PURE__ */ jsx("div", { style: S.empty, children: busy ? "\u6B63\u5728\u89E3\u6790\u2026" : "\u6253\u5F00\u4E00\u4E2A .tex \u6587\u4EF6\uFF0C\u6216\u628A .tex \u62D6\u8FDB\u5DE5\u4F5C\u533A\u540E\u70B9 \u21BB\u3002" }) : null,
      !err && info && sections.length === 0 ? /* @__PURE__ */ jsx("div", { style: S.empty, children: "\u672A\u53D1\u73B0 \\section / \\chapter \u7B49\u7AE0\u8282\u547D\u4EE4\u3002" }) : null,
      sections.map(function(s, i) {
        const lv = Math.max(0, Math.min(3, Number(s.level) || 0));
        const st = LEVEL_STYLE[lv];
        const marks = issueLines[s.line] || [];
        const hasErr = marks.some(function(m) {
          return m.severity === "error";
        });
        const hasWarn = marks.some(function(m) {
          return m.severity === "warning";
        });
        return /* @__PURE__ */ jsxs(
          "div",
          {
            style: {
              ...S.row,
              paddingLeft: 8 + st.indent,
              background: hover === i ? "hsl(var(--accent))" : "transparent"
            },
            onMouseEnter: function() {
              setHover(i);
            },
            onMouseLeave: function() {
              setHover(-1);
            },
            title: marks[0] && marks[0].message || s.title,
            children: [
              /* @__PURE__ */ jsx("span", { style: { ...S.num, minWidth: lv === 0 ? 46 : 24 }, children: nums[i] }),
              /* @__PURE__ */ jsx("span", { style: { ...S.txt, fontWeight: st.fontWeight, fontSize: st.size }, children: s.title || "(\u65E0\u6807\u9898)" }),
              hasErr ? /* @__PURE__ */ jsx("span", { style: { ...S.badge, color: "hsl(var(--destructive))", borderColor: "hsl(var(--destructive))" }, children: "\u9519" }) : hasWarn ? /* @__PURE__ */ jsx("span", { style: { ...S.badge, color: "hsl(var(--muted-foreground))" }, children: "\u8B66" }) : null,
              hover === i ? /* @__PURE__ */ jsx(
                "button",
                {
                  style: { ...S.btn, padding: "0 4px" },
                  title: "\u5F15\u7528\u8FD9\u4E00\u6BB5\u5230\u5BF9\u8BDD",
                  onClick: function(e) {
                    e.stopPropagation();
                    quote(s, nums[i]);
                  },
                  children: "\u{1F4AC}"
                }
              ) : null,
              /* @__PURE__ */ jsx("span", { style: S.ln, children: s.line })
            ]
          },
          s.line + "-" + i
        );
      })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { ...S.head, borderTop: "1px solid hsl(var(--border))", borderBottom: "none", flexShrink: 0 }, children: [
      /* @__PURE__ */ jsx("span", { style: { color: "hsl(var(--muted-foreground))", fontSize: 10, flex: 1 }, children: info ? sections.length + " \u8282 \xB7 " + (info.environments || []).length + " \u6D6E\u52A8\u4F53 \xB7 " + (info.wordCount ? "\u2248" + info.wordCount.approxWords + " \u5B57" : "-") : "\u2014" }),
      /* @__PURE__ */ jsx(
        "button",
        {
          style: S.btn,
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
          children: "\u2922 \u6574\u9875"
        }
      )
    ] })
  ] });
}
export {
  LatexOutline as default
};
