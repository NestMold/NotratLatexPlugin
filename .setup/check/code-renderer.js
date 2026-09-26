import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import React, { useState, useEffect, useMemo } from "react";
const LPCX = typeof LPC === "undefined" ? null : LPC;
const PV_CSS = [
  ".pv-root{color:hsl(var(--foreground));word-break:break-word;font-size:13.5px;line-height:1.75}",
  ".pv-root p{margin:0 0 8px}",
  ".pv-title{text-align:center;margin:10px 0 16px}",
  ".pv-title-main{font-size:18px;font-weight:700}",
  ".pv-author,.pv-date{color:hsl(var(--muted-foreground));font-size:12px;margin-top:4px}",
  ".pv-h1{font-size:17px;font-weight:700;margin:18px 0 8px;padding-bottom:3px;border-bottom:1px solid hsl(var(--border))}",
  ".pv-h2{font-size:15px;font-weight:700;margin:14px 0 6px}",
  ".pv-h3{font-size:13.5px;font-weight:700;margin:12px 0 5px}",
  ".pv-eq{margin:10px 0;text-align:center;position:relative;overflow-x:auto}",
  ".pv-eqno{position:absolute;right:0;top:50%;transform:translateY(-50%);color:hsl(var(--muted-foreground));font-size:12px}",
  ".pv-mini{font-family:Georgia,'Times New Roman',serif;font-style:italic;padding:0 2px}",
  ".pv-tabwrap{overflow-x:auto;margin:8px 0}",
  ".pv-tab{border-collapse:collapse;margin:6px auto;font-size:12.5px}",
  ".pv-tab td{border:1px solid hsl(var(--border));padding:3px 10px}",
  ".pv-float{border:1px dashed hsl(var(--border));border-radius:8px;padding:10px;margin:12px 0;text-align:center;background:hsl(var(--muted)/.25)}",
  ".pv-float figcaption{margin-top:6px;color:hsl(var(--muted-foreground));font-size:12px}",
  ".pv-img{max-width:80%;border-radius:6px}",
  ".pv-imgna{background:hsl(var(--muted)/.5);padding:14px;color:hsl(var(--muted-foreground));border-radius:6px;font-size:12px}",
  ".pv-ref,.pv-cite{color:hsl(var(--primary));border-bottom:1px dotted hsl(var(--primary));font-size:.9em}",
  ".pv-list{padding-left:1.7em;margin:0 0 8px}",
  ".pv-list li{margin:3px 0}",
  ".pv-quote{border-left:3px solid hsl(var(--border));margin:10px 0;padding:2px 12px;color:hsl(var(--muted-foreground))}",
  ".pv-code{background:hsl(var(--muted)/.55);padding:8px 10px;border-radius:6px;overflow:auto;white-space:pre-wrap;font-family:Consolas,monospace;font-size:12px}",
  ".pv-bib{margin-top:14px;padding-top:8px;border-top:1px solid hsl(var(--border))}",
  ".pv-bibitem{padding-left:2em;text-indent:-2em;margin:3px 0;font-size:12.5px}",
  ".pv-root .katex{color:inherit;font-size:1.03em}",
  ".pv-root .katex-display{margin:0}"
].join("");
let katexTask = null;
function loadKatex(serverId) {
  if (typeof window !== "undefined" && window.katex) return Promise.resolve(true);
  if (katexTask) return katexTask;
  katexTask = (async function() {
    try {
      const api = typeof window !== "undefined" ? window.electronAPI : null;
      if (!api || !api.mcp || !api.mcp.callTool || !serverId) return false;
      const r = await api.mcp.callTool(serverId, "latex_asset", { name: "katex" });
      if (!r || r.success === false) return false;
      const txt = (r.result && r.result.content ? r.result.content : []).map(function(c) {
        return c.text;
      }).join("\n");
      const a = JSON.parse(txt);
      if (!a || !a.js || !a.css) return false;
      if (!document.getElementById("katex-css-latex-plugin")) {
        const st = document.createElement("style");
        st.id = "katex-css-latex-plugin";
        st.textContent = a.css;
        document.head.appendChild(st);
      }
      new Function(a.js)();
      return !!(window.katex && typeof window.katex.renderToString === "function");
    } catch (e) {
      return false;
    }
  })();
  return katexTask;
}
const S = {
  wrap: { margin: "8px 0", border: "1px solid hsl(var(--border))", borderRadius: 8, overflow: "hidden", background: "hsl(var(--card))" },
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 8px",
    borderBottom: "1px solid hsl(var(--border))",
    fontSize: 10.5,
    color: "hsl(var(--muted-foreground))",
    fontFamily: "system-ui, -apple-system, sans-serif"
  },
  tab: { border: "none", background: "transparent", color: "hsl(var(--muted-foreground))", cursor: "pointer", fontSize: 10.5, padding: "0 4px" },
  tabOn: { border: "none", background: "transparent", color: "hsl(var(--foreground))", cursor: "pointer", fontSize: 10.5, fontWeight: 700, padding: "0 4px" },
  body: { padding: "10px 12px" },
  pre: {
    margin: 0,
    padding: "10px 12px",
    overflow: "auto",
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
    fontSize: 12.5,
    lineHeight: 1.6,
    whiteSpace: "pre",
    background: "hsl(var(--muted)/.45)",
    color: "hsl(var(--foreground))",
    borderRadius: 6
  },
  note: { fontSize: 11, color: "hsl(var(--muted-foreground))", padding: "6px 12px" }
};
function LatexCodeBlock(props) {
  const code = String(
    props.code != null ? props.code : props.value != null ? props.value : props.content != null ? props.content : ""
  );
  const lang = String(
    props.lang || props.language || props.node && props.node.lang || props.info && props.info.lang || ""
  ).toLowerCase().trim();
  const isMath = /^(math|katex|latex-math|tex-math|amsmath)$/.test(lang);
  const isTex = /^(latex|tex|tex-latex|latex-tex|context|plaintex)$/.test(lang);
  const inline = !!(props.inline || props.inlineCode);
  const tooLong = code.length > 8e3;
  const [katexOk, setKatexOk] = useState(false);
  const [showSrc, setShowSrc] = useState(false);
  useEffect(
    function() {
      if (inline || tooLong || !isTex && !isMath) return;
      let dead = false;
      loadKatex(props.serverId).then(function(ok) {
        if (!dead) setKatexOk(!!ok);
      });
      return function() {
        dead = true;
      };
    },
    [code, lang, inline, tooLong, isTex, isMath, props.serverId]
  );
  useEffect(
    function() {
      if (!isTex && !isMath) return;
      if (document.getElementById("notrat-latex-pv-css")) return;
      const st = document.createElement("style");
      st.id = "notrat-latex-pv-css";
      st.textContent = PV_CSS;
      document.head.appendChild(st);
    },
    [isTex, isMath]
  );
  const renderMath = useMemo(
    function() {
      if (katexOk && typeof window !== "undefined" && window.katex) {
        return function(tex, disp) {
          try {
            return window.katex.renderToString(tex, { displayMode: !!disp, throwOnError: false, strict: "ignore" });
          } catch (e) {
            return LPCX ? LPCX.miniMath(tex, disp) : tex;
          }
        };
      }
      return function(tex, disp) {
        return LPCX ? LPCX.miniMath(tex, disp) : tex;
      };
    },
    [katexOk]
  );
  const preview = useMemo(
    function() {
      if (!isTex && !isMath || !LPCX || tooLong) return { html: "" };
      try {
        if (isMath) {
          const body = "\\begin{equation*}\n" + code + "\n\\end{equation*}";
          return LPCX.renderPreview(body, { renderMath, baseDir: "" });
        }
        return LPCX.renderPreview(code, { renderMath, baseDir: "" });
      } catch (e) {
        return { html: "" };
      }
    },
    [code, isTex, isMath, renderMath, tooLong]
  );
  if (!isTex && !isMath) {
    return React.createElement(
      "pre",
      { style: S.pre, className: "notrat-latex-code-passthrough" },
      React.createElement("code", null, code)
    );
  }
  const usable = !tooLong && !!(preview && preview.html);
  function quote() {
    try {
      window.dispatchEvent(
        new CustomEvent("notrat-quote-to-chat", {
          detail: { text: code, source: "LaTeX \u4EE3\u7801\u5757" }
        })
      );
    } catch (e) {
    }
  }
  return /* @__PURE__ */ jsxs("div", { style: S.wrap, children: [
    /* @__PURE__ */ jsxs("div", { style: S.bar, children: [
      /* @__PURE__ */ jsx("span", { children: isMath ? "\u2211 \u516C\u5F0F" : "\u{1F4D0} LaTeX" }),
      usable ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("button", { style: showSrc ? S.tab : S.tabOn, onClick: function() {
          setShowSrc(false);
        }, children: "\u9884\u89C8" }),
        /* @__PURE__ */ jsx("button", { style: showSrc ? S.tabOn : S.tab, onClick: function() {
          setShowSrc(true);
        }, children: "\u6E90\u7801" })
      ] }) : /* @__PURE__ */ jsxs("span", { children: [
        "\xB7 \u6E90\u7801\uFF08",
        tooLong ? "\u7247\u6BB5\u8FC7\u957F\uFF0C\u5DF2\u8DF3\u8FC7\u9884\u89C8" : "\u9884\u89C8\u4E0D\u53EF\u7528",
        "\uFF09"
      ] }),
      /* @__PURE__ */ jsx("span", { style: { flex: 1 } }),
      !katexOk && usable ? /* @__PURE__ */ jsx("span", { title: "KaTeX \u672A\u52A0\u8F7D\uFF0C\u4F7F\u7528\u7B80\u6613\u516C\u5F0F\u6E32\u67D3", children: "\u7B80\u6613\u6392\u7248" }) : null,
      /* @__PURE__ */ jsx("button", { style: S.tab, onClick: quote, title: "\u628A\u8FD9\u6BB5 LaTeX \u9489\u5230\u5BF9\u8BDD\u8F93\u5165\u6846", children: "\u{1F4AC}" })
    ] }),
    usable && !showSrc ? /* @__PURE__ */ jsx("div", { style: S.body, className: "pv-root", dangerouslySetInnerHTML: { __html: preview.html } }) : /* @__PURE__ */ jsx("pre", { style: { ...S.pre, borderRadius: 0 }, children: code })
  ] });
}
export {
  LatexCodeBlock as default
};
