import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
const C = {
  error: "#ef4444",
  warning: "#f59e0b",
  info: "#94a3b8",
  ok: "#22c55e"
};
function Card({ title, children, right }) {
  return /* @__PURE__ */ jsxs(
    "div",
    {
      style: {
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        borderRadius: 10,
        padding: "10px 12px",
        marginBottom: 10
      },
      children: [
        /* @__PURE__ */ jsxs(
          "div",
          {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 6
            },
            children: [
              /* @__PURE__ */ jsx("div", { style: { fontSize: 12, fontWeight: 600, color: "hsl(var(--muted-foreground))" }, children: title }),
              right
            ]
          }
        ),
        children
      ]
    }
  );
}
function Chip({ children, tone }) {
  return /* @__PURE__ */ jsx(
    "span",
    {
      style: {
        display: "inline-block",
        padding: "1px 8px",
        margin: "2px 4px 2px 0",
        borderRadius: 999,
        fontSize: 11,
        border: "1px solid " + (tone || "hsl(var(--border))"),
        color: tone || "hsl(var(--foreground))",
        whiteSpace: "nowrap"
      },
      children
    }
  );
}
const btn = {
  padding: "4px 10px",
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--secondary))",
  color: "hsl(var(--secondary-foreground))",
  cursor: "pointer"
};
const btnPrimary = { ...btn, background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" };
function LatexPanel(props) {
  const [file, setFile] = useState("");
  const [busy, setBusy] = useState("");
  const [info, setInfo] = useState(null);
  const [val, setVal] = useState(null);
  const [err, setErr] = useState("");
  const api = typeof window !== "undefined" ? window.electronAPI : null;
  async function call(tool, args) {
    if (!api || !api.mcp || !api.mcp.callTool) throw new Error("electronAPI.mcp \u4E0D\u53EF\u7528\uFF08\u5BBF\u4E3B\u672A\u6CE8\u5165\uFF09");
    const r = await api.mcp.callTool(props.serverId, tool, args);
    if (!r || r.success === false) throw new Error(r && r.error || "\u5DE5\u5177\u8C03\u7528\u5931\u8D25");
    return (r.result && r.result.content ? r.result.content : []).map((c) => c.text).join("\n");
  }
  async function run(tool, args, then) {
    setBusy(tool);
    setErr("");
    try {
      const out = await call(tool, args);
      then(out);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy("");
    }
  }
  const doParse = () => run("latex_parse", { path: file, format: "json" }, (out) => {
    try {
      const j = JSON.parse(out);
      setInfo(j);
      if (j && j.file) setFile(j.file);
      try {
        sessionStorage.setItem("notrat-latex-panel", JSON.stringify({ file: j.file, info: j }));
      } catch {
      }
    } catch {
      setErr("\u89E3\u6790\u7ED3\u679C\u4E0D\u662F\u5408\u6CD5 JSON: " + out.slice(0, 200));
    }
  });
  const doValidate = () => run("latex_validate", { path: file, format: "json" }, (out) => {
    try {
      const j = JSON.parse(out);
      setVal(j);
      try {
        const s = JSON.parse(sessionStorage.getItem("notrat-latex-panel") || "{}");
        s.issues = j;
        sessionStorage.setItem("notrat-latex-panel", JSON.stringify(s));
      } catch {
      }
    } catch {
      setErr("\u6821\u9A8C\u7ED3\u679C\u4E0D\u662F\u5408\u6CD5 JSON: " + out.slice(0, 200));
    }
  });
  const doCompile = () => run("latex_compile", { path: file }, (out) => {
    try {
      window.dispatchEvent(
        new CustomEvent("notrat-quote-to-chat", { detail: { text: out, source: "\u{1F528} LaTeX \u7F16\u8BD1\u7ED3\u679C" } })
      );
    } catch {
    }
  });
  const quoteSummary = () => {
    if (!info) return;
    const parts = [];
    parts.push(`LaTeX \u7ED3\u6784\u901F\u89C8 \u2014 ${info.file}`);
    if (info.title) parts.push(`\u6807\u9898: ${info.title}`);
    if (info.sections && info.sections.length)
      parts.push(
        "\u7AE0\u8282: " + info.sections.map((s) => "  ".repeat(s.level) + s.title).join(" / ")
      );
    const fig2 = (info.environments || []).filter((e) => /^figure/.test(e.name)).length;
    const tab2 = (info.environments || []).filter((e) => /^table/.test(e.name)).length;
    const eq2 = (info.environments || []).filter((e) => /^(equation|align|gather|eqnarray|multline)$/.test(e.name)).length;
    parts.push(`\u56FE ${fig2} \xB7 \u8868 ${tab2} \xB7 \u516C\u5F0F\u73AF\u5883 ${eq2} \xB7 \u884C\u5185\u516C\u5F0F ~${info.inlineMath || 0}`);
    if (info.wordCount) parts.push(`\u5B57\u6570\u2248${info.wordCount.approxWords}\uFF08\u4E2D\u6587${info.wordCount.cjkChars}+\u82F1\u6587\u8BCD${info.wordCount.latinWords}\uFF09`);
    if (val && val.summary)
      parts.push(`\u6821\u9A8C: \u{1F534}${val.summary.errors} \u{1F7E1}${val.summary.warnings} \u26AA${val.summary.infos}`);
    try {
      window.dispatchEvent(
        new CustomEvent("notrat-quote-to-chat", { detail: { text: parts.join("\n"), source: "\u{1F4D0} LaTeX \u7ED3\u6784\u901F\u89C8" } })
      );
    } catch {
    }
  };
  const openPage = () => {
    try {
      window.dispatchEvent(
        new CustomEvent("notrat-open-plugin-page", { detail: { key: props.pluginId + ":latex-page", title: "LaTeX \u7ED3\u6784" } })
      );
    } catch {
    }
  };
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const saved = JSON.parse(sessionStorage.getItem("notrat-latex-panel") || "null");
        if (saved) {
          if (saved.file) setFile(saved.file);
          if (saved.info) setInfo(saved.info);
          if (saved.issues) setVal(saved.issues);
        }
      } catch {
      }
      if (!props.serverId || info) return;
      try {
        const out = await call("latex_parse", { format: "json" });
        const j = JSON.parse(out);
        if (!dead && j && j.file) {
          setFile(j.file);
          setInfo(j);
        }
      } catch {
      }
    })();
    return () => {
      dead = true;
    };
  }, []);
  const fig = info ? (info.environments || []).filter((e) => /^figure/.test(e.name)).length : 0;
  const tab = info ? (info.environments || []).filter((e) => /^table/.test(e.name)).length : 0;
  const eq = info ? (info.environments || []).filter((e) => /^(equation|align|gather|eqnarray|multline)$/.test(e.name)).length : 0;
  const sum = val && val.summary;
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, color: "hsl(var(--foreground))" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }, children: [
      /* @__PURE__ */ jsx("span", { style: { fontSize: 13, fontWeight: 700 }, children: "\u{1F4D0} LaTeX \u52A9\u624B" }),
      /* @__PURE__ */ jsx("span", { style: { fontSize: 11, color: "hsl(var(--muted-foreground))" }, children: "v0.1" }),
      /* @__PURE__ */ jsx("div", { style: { flex: 1 } }),
      /* @__PURE__ */ jsx("button", { style: btn, onClick: quoteSummary, title: "\u628A\u7ED3\u6784\u901F\u89C8\u9489\u8FDB\u804A\u5929\u8F93\u5165\u6846", children: "\u{1F4AC} \u5F15\u7528" }),
      /* @__PURE__ */ jsx("button", { style: btn, onClick: openPage, title: "\u5728\u4E3B\u533A\u6253\u5F00\u6574\u9875\u89C6\u56FE", children: "\u2922 \u6574\u9875" })
    ] }),
    /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: 6, marginBottom: 6 }, children: /* @__PURE__ */ jsx(
      "input",
      {
        value: file,
        onChange: (e) => setFile(e.target.value),
        placeholder: "\u7559\u7A7A = \u81EA\u52A8\u53D1\u73B0\u5DE5\u4F5C\u533A\u4E3B .tex",
        style: {
          flex: 1,
          minWidth: 0,
          fontSize: 12,
          padding: "4px 8px",
          borderRadius: 8,
          border: "1px solid hsl(var(--border))",
          background: "hsl(var(--background))",
          color: "hsl(var(--foreground))"
        }
      }
    ) }),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, marginBottom: 10 }, children: [
      /* @__PURE__ */ jsx("button", { style: btnPrimary, onClick: doParse, disabled: !!busy, children: busy === "latex_parse" ? "\u89E3\u6790\u4E2D\u2026" : "\u89E3\u6790" }),
      /* @__PURE__ */ jsx("button", { style: btn, onClick: doValidate, disabled: !!busy, children: busy === "latex_validate" ? "\u6821\u9A8C\u4E2D\u2026" : "\u6821\u9A8C" }),
      /* @__PURE__ */ jsx("button", { style: btn, onClick: doCompile, disabled: !!busy, children: busy === "latex_compile" ? "\u7F16\u8BD1\u4E2D\u2026" : "\u7F16\u8BD1" })
    ] }),
    err ? /* @__PURE__ */ jsx(
      "div",
      {
        style: {
          background: "hsl(var(--destructive) / 0.1)",
          border: "1px solid " + C.error,
          borderRadius: 8,
          padding: "6px 10px",
          fontSize: 12,
          color: C.error,
          marginBottom: 10,
          wordBreak: "break-all"
        },
        children: err
      }
    ) : null,
    /* @__PURE__ */ jsx("div", { style: { flex: 1, minHeight: 0, overflowY: "auto" }, children: !info ? /* @__PURE__ */ jsxs("div", { style: { fontSize: 12, color: "hsl(var(--muted-foreground))", lineHeight: 1.8 }, children: [
      "\u70B9\u51FB\u300C\u89E3\u6790\u300D\u8BFB\u53D6\u5F53\u524D\u5DE5\u4F5C\u533A\u7684 LaTeX \u6587\u4EF6\u7ED3\u6784\u3002",
      /* @__PURE__ */ jsx("br", {}),
      "\u4E5F\u53EF\u4EE5\u5728\u5DE6\u4FA7\u6587\u4EF6\u6811\u53F3\u952E .tex \u6587\u4EF6\u4F7F\u7528\u5FEB\u6377\u83DC\u5355\u3002"
    ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Card, { title: "\u6587\u6863\u4FE1\u606F", children: /* @__PURE__ */ jsxs("div", { style: { fontSize: 12, lineHeight: 1.7, wordBreak: "break-all" }, children: [
        /* @__PURE__ */ jsx("div", { style: { fontWeight: 600 }, children: info.title || "(\u65E0\u6807\u9898)" }),
        info.author ? /* @__PURE__ */ jsxs("div", { children: [
          "\u{1F464} ",
          info.author
        ] }) : null,
        /* @__PURE__ */ jsxs("div", { style: { color: "hsl(var(--muted-foreground))" }, children: [
          info.documentClass ? "\u6587\u6863\u7C7B " + info.documentClass : "",
          " \xB7 \u5B8F\u5305 ",
          (info.packages || []).length,
          " \u4E2A"
        ] }),
        (info.bibResources || []).length ? /* @__PURE__ */ jsxs("div", { style: { color: "hsl(var(--muted-foreground))" }, children: [
          "\u{1F4DA} ",
          info.bibResources.join(", ")
        ] }) : null
      ] }) }),
      /* @__PURE__ */ jsx(Card, { title: `\u7AE0\u8282\u7ED3\u6784 (${(info.sections || []).length})`, children: (info.sections || []).length ? info.sections.map((s, i) => /* @__PURE__ */ jsxs("div", { style: { fontSize: 12, lineHeight: 1.9, paddingLeft: s.level * 14 }, children: [
        /* @__PURE__ */ jsxs("span", { style: { color: "hsl(var(--muted-foreground))", marginRight: 6 }, children: [
          "L",
          s.line
        ] }),
        s.title
      ] }, i)) : /* @__PURE__ */ jsx("div", { style: { fontSize: 12, color: "hsl(var(--muted-foreground))" }, children: "\u672A\u53D1\u73B0\u7AE0\u8282\u547D\u4EE4" }) }),
      /* @__PURE__ */ jsx(Card, { title: "\u7EDF\u8BA1", children: /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsxs(Chip, { children: [
          "\u{1F5BC} \u56FE ",
          fig
        ] }),
        /* @__PURE__ */ jsxs(Chip, { children: [
          "\u{1F4CA} \u8868 ",
          tab
        ] }),
        /* @__PURE__ */ jsxs(Chip, { children: [
          "\u2211 \u516C\u5F0F\u73AF\u5883 ",
          eq
        ] }),
        /* @__PURE__ */ jsxs(Chip, { children: [
          "$ \u884C\u5185 ~",
          info.inlineMath || 0
        ] }),
        info.wordCount ? /* @__PURE__ */ jsxs(Chip, { children: [
          "\u{1F4AC} \u2248",
          info.wordCount.approxWords,
          " \u5B57"
        ] }) : null,
        /* @__PURE__ */ jsxs(Chip, { children: [
          "\u{1F3F7} \u6807\u7B7E ",
          (info.labels || []).length
        ] }),
        /* @__PURE__ */ jsxs(Chip, { children: [
          "\u{1F517} \u5F15\u7528 ",
          (info.refs || []).length
        ] }),
        /* @__PURE__ */ jsxs(Chip, { children: [
          "\u{1F4DA} \u6587\u732E ",
          (info.cites || []).length
        ] })
      ] }) }),
      sum ? /* @__PURE__ */ jsx(
        Card,
        {
          title: `\u6821\u9A8C \xB7 \u{1F534}${sum.errors} \u{1F7E1}${sum.warnings} \u26AA${sum.infos}`,
          right: /* @__PURE__ */ jsx("button", { style: btn, onClick: doValidate, children: "\u91CD\u65B0\u6821\u9A8C" }),
          children: sum.errors + sum.warnings + sum.infos === 0 ? /* @__PURE__ */ jsx("div", { style: { fontSize: 12, color: C.ok }, children: "\u2705 \u672A\u53D1\u73B0\u95EE\u9898" }) : /* @__PURE__ */ jsx("div", { style: { maxHeight: 220, overflowY: "auto" }, children: val.issues.map((i, k) => /* @__PURE__ */ jsxs("div", { style: { fontSize: 12, lineHeight: 1.6, marginBottom: 4 }, children: [
            /* @__PURE__ */ jsx("span", { style: { color: C[i.severity], fontWeight: 700 }, children: i.severity === "error" ? "\u{1F534}" : i.severity === "warning" ? "\u{1F7E1}" : "\u26AA" }),
            " ",
            /* @__PURE__ */ jsxs("span", { style: { color: "hsl(var(--muted-foreground))" }, children: [
              "L",
              i.line
            ] }),
            " ",
            i.message
          ] }, k)) })
        }
      ) : null
    ] }) })
  ] });
}
export {
  LatexPanel as default
};
