"use strict";
/* =====================================================================
 * 导出自包含 HTML（v0.8.4）
 *
 * 为什么要有它：
 *   编辑器里的预览只在 Notrat 里看得见；「导出」要的是**能拿出去**的东西 ——
 *   发给别人、离线打开、直接打印，都不依赖宿主、不依赖本机插件装没装。
 *
 * 正文来源两种，都能用：
 *   A. 面板传入的 body —— 编辑器里那份已经用 KaTeX 渲染好的正文（默认走这条，
 *      与用户屏幕上看到的逐字一致，且带上尚未保存的就地编辑改动）
 *   B. 服务端内核渲染 —— 面板不在场时（AI / 命令行调用）用 preview-core，
 *      公式退化成 miniMath 近似排版（好处是导出件零 JS 依赖）
 *
 * 图片一律内嵌成 dataURI：导出件离开工作区目录后仍然显示得出来。
 *
 * ⚠ PV_CSS 与 panels/editor.tsx 里那份是**同一份样式**，两处的 pv- 类名集合
 *   由 gate 第 [8] 层逐项比对 —— 只改一边会红，别绕过。
 * =================================================================== */

const fs = require("fs");
const path = require("path");
const TEXENC = require("./tex-encoding.js"); // v0.9.4 子文件读的编码嗅探

function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escAttr(s) {
  return esc(s).replace(/"/g, "&quot;");
}
/* 属性里的路径来自 preview-core 的 escHtml，读盘前得还原回去 */
function unesc(s) {
  return String(s || "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

const MIME = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".bmp": "image/bmp", ".ico": "image/x-icon",
  ".avif": "image/avif",
};

/* ---------- 主题变量（浅色）：导出件默认走打印友好的浅色 ----------
 * PV_CSS 里全是 hsl(var(--x))，所以这里必须给 **HSL 通道值**，不能给 hex。 */
const THEME_CSS = `:root{
  --background:0 0% 100%; --foreground:222 47% 11%;
  --card:0 0% 100%; --card-foreground:222 47% 11%;
  --muted:210 40% 96%; --muted-foreground:215 16% 47%;
  --border:214 32% 91%;
  --primary:221 83% 53%; --primary-foreground:210 40% 98%;
  --popover:0 0% 100%; --popover-foreground:222 47% 11%;
}
html,body{margin:0;padding:0;background:hsl(var(--background));color:hsl(var(--foreground))}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif;font-size:14px;line-height:1.8}
.pv-export{max-width:860px;margin:0 auto;padding:28px 22px 72px}
.pv-export a{color:hsl(var(--primary))}`;

/* ---------- 打印 ---------- */
const PRINT_CSS = `@media print{
  html,body{background:#fff}
  .pv-export{max-width:none;padding:0}
  .pv-float,.pv-eq,.pv-tab,.pv-bib{break-inside:avoid}
  .pv-ref,.pv-cite{border-bottom:none;color:inherit}
}
@page{size:A4;margin:18mm 16mm}`;

/* ---------- 预览样式（与 panels/editor.tsx#PV_CSS 同源） ---------- */
const PV_CSS = `
.pv-root{color:hsl(var(--foreground));word-break:break-word}
.pv-root p{margin:0 0 10px}
.pv-title{text-align:center;margin:18px 0 26px}
.pv-title-main{font-size:22px;font-weight:700;line-height:1.4}
.pv-author{margin-top:8px;color:hsl(var(--muted-foreground))}
.pv-date{margin-top:2px;color:hsl(var(--muted-foreground));font-size:13px}
.pv-h1{font-size:20px;font-weight:700;margin:26px 0 10px;padding-bottom:4px;border-bottom:1px solid hsl(var(--border))}
.pv-h2{font-size:17px;font-weight:700;margin:22px 0 8px}
.pv-h3{font-size:15px;font-weight:700;margin:18px 0 6px}
.pv-par{font-weight:600;margin:14px 0 4px}
.pv-eq{margin:12px 0;text-align:center;position:relative;overflow-x:auto}
.pv-eqbody{display:inline-block;max-width:100%}
.pv-eqno{position:absolute;right:0;top:50%;transform:translateY(-50%);color:hsl(var(--muted-foreground));font-size:13px}
.pv-mini{font-family:Georgia,'Times New Roman',serif;font-style:italic;padding:0 2px}
.pv-tabwrap{overflow-x:auto;margin:10px 0}
.pv-tab{border-collapse:collapse;margin:8px auto;font-size:13.5px}
.pv-tab td{border:1px solid hsl(var(--border));padding:4px 14px}
.pv-hr td{border-top:2px solid hsl(var(--foreground)/.55)}
.pv-float{border:1px dashed hsl(var(--border));border-radius:10px;padding:14px;margin:16px 0;text-align:center;background:hsl(var(--muted)/.25)}
.pv-float figcaption{margin-top:8px;color:hsl(var(--muted-foreground));font-size:13px}
.pv-img{max-width:88%;border-radius:6px;margin:4px 0}
.pv-imgerr{outline:1px dashed #f59e0b}
.pv-imgna{background:hsl(var(--muted)/.5);padding:20px;color:hsl(var(--muted-foreground));border-radius:8px;font-size:13px}
.pv-inc{border:1px solid hsl(var(--border));border-left:3px solid hsl(var(--primary)/.55);border-radius:10px;margin:14px 0;overflow:hidden;background:hsl(var(--muted)/.14)}
.pv-inc-h{padding:6px 12px;font-size:12px;color:hsl(var(--muted-foreground));background:hsl(var(--muted)/.35);border-bottom:1px solid hsl(var(--border))}
.pv-inc-b{padding:10px 14px}
.pv-inc-b .pv-ref,.pv-inc-b .pv-cite{pointer-events:none}
.pv-inc-miss .pv-inc-b{color:hsl(var(--muted-foreground))}
.pv-sc{font-variant:small-caps;letter-spacing:.03em}
.pv-url{color:hsl(var(--primary));text-decoration:underline;text-underline-offset:2px;word-break:break-all}
.pv-marg{display:inline-block;max-width:240px;font-size:12px;line-height:1.5;color:hsl(var(--muted-foreground));background:hsl(var(--muted)/.45);border-radius:6px;padding:1px 8px;margin-left:6px;vertical-align:middle;text-align:left}
.pv-tocph{border:1px dashed hsl(var(--border));border-radius:10px;padding:16px;margin:16px 0;text-align:center;color:hsl(var(--muted-foreground));font-size:13px;background:hsl(var(--muted)/.25)}
.pv-tocmini{display:inline-block;margin:6px 0;padding:2px 10px;border-radius:999px;font-size:12px;color:hsl(var(--muted-foreground));background:hsl(var(--muted)/.5)}
.pv-ref,.pv-cite{color:hsl(var(--primary));border-bottom:1px dotted hsl(var(--primary));cursor:pointer;font-size:.9em;padding:0 1px}
.pv-ref:hover,.pv-cite:hover{background:hsl(var(--primary)/.12);border-radius:3px}
.pv-bad{color:#ef4444;border-color:#ef4444}
.pv-fn{font-size:11px;color:hsl(var(--muted-foreground))}
.pv-bib{margin-top:22px;padding-top:10px;border-top:1px solid hsl(var(--border))}
.pv-bib-t{font-weight:700;margin-bottom:8px}
.pv-bibitem{padding-left:2.2em;text-indent:-2.2em;margin:4px 0;font-size:13px;line-height:1.7}
.pv-bibno{margin-right:8px;font-weight:600}
.pv-tt{background:hsl(var(--muted)/.6);padding:1px 5px;border-radius:4px;font-family:Consolas,monospace;font-size:.9em}
.pv-code{background:hsl(var(--muted)/.55);padding:10px 12px;border-radius:8px;overflow:auto;white-space:pre-wrap;font-family:Consolas,monospace;font-size:12.5px;line-height:1.6}
.pv-quote{border-left:3px solid hsl(var(--border));margin:12px 0;padding:2px 14px;color:hsl(var(--muted-foreground))}
.pv-abs{background:hsl(var(--muted)/.3);border:1px solid hsl(var(--border));border-radius:10px;padding:12px 16px;margin:16px 0}
.pv-abs-t{font-weight:700;margin-bottom:6px}
.pv-list{padding-left:1.8em;margin:0 0 10px}
.pv-list li{margin:4px 0}
.pv-list p{margin:2px 0}
.pv-center{text-align:center;margin:10px 0}
/* KaTeX 在暗色主题下继承前景色 */
.pv-root .katex{color:inherit;font-size:1.04em}
.pv-root .katex-display{margin:0}
`;

/* ------------------------------------------------------------------ */
/* 静态化：把只在「活着的编辑器」里才有意义的属性抹掉                    */
/* ------------------------------------------------------------------ */
function stripRuntimeAttrs(html) {
  return String(html || "")
    .replace(/\sdata-s="[^"]*"/g, "")
    .replace(/\sdata-e="[^"]*"/g, "")
    .replace(/\sdata-line="[^"]*"/g, "")
    .replace(/\sdata-tex="[^"]*"/g, "")
    .replace(/\scontenteditable="[^"]*"/gi, " contenteditable=\"false\"")
    .replace(/\sspellcheck="[^"]*"/gi, "")
    .replace(/\ssuppresscontenteditablewarning="[^"]*"/gi, "");
}

/* ------------------------------------------------------------------ */
/* 图片内嵌：<img data-asset="绝对路径"> → src="data:…"                  */
/* ------------------------------------------------------------------ */
function inlineImages(html, opts) {
  opts = opts || {};
  const maxBytes = opts.maxBytes || 8 * 1024 * 1024;
  const inlined = [];
  const missing = [];
  const out = String(html || "").replace(
    /<img\b([^>]*?)\sdata-asset="([^"]*)"([^>]*?)\/?>/g,
    function (m, pre, rawPath, post) {
      const file = unesc(rawPath);
      const base = path.basename(file);
      const mime = MIME[path.extname(file).toLowerCase()];
      let uri = "";
      if (mime) {
        try {
          const buf = fs.readFileSync(file);
          if (buf.length <= maxBytes) uri = "data:" + mime + ";base64," + buf.toString("base64");
          else missing.push(base + "（超过 " + Math.round(maxBytes / 1024 / 1024) + "MB）");
        } catch (e) {
          missing.push(base);
        }
      } else if (/\.(pdf|eps)$/i.test(file) || !path.extname(file)) {
        /* v0.9.0：pdf/eps（及无扩展名）→ 栅格化后内嵌；转不动走占位符。
         * 无扩展名时按 LaTeX 习惯补猜 .pdf/.eps。 */
        let target = file;
        if (!/\.(pdf|eps)$/i.test(target)) {
          for (const c of [".pdf", ".eps"]) {
            try { if (fs.statSync(file + c).isFile()) { target = file + c; break; } } catch {}
          }
        }
        let done = false;
        if (/\.(pdf|eps)$/i.test(target)) {
          try {
            try { fs.accessSync(target); } catch { throw new Error("文件不存在"); }
            const r = require("./pdf-raster.js").rasterPdfSync(target, { maxBytes: maxBytes });
            uri = "data:image/png;base64," + r.buf.toString("base64");
            done = true;
          } catch (e) {
            missing.push(base + "（PDF 栅格化失败：" + String(e && e.message || e).slice(0, 80) + "）");
            done = true;
          }
        }
        if (!done) missing.push(base + "（格式不支持）");
      } else {
        missing.push(base + "（格式不支持）");
      }
      if (!uri) {
        return '<div class="pv-imgna">🖼 ' + esc(base) + "（导出时没能读到这张图，请检查路径）</div>";
      }
      inlined.push(base);
      /* alt 兜底：原标签里已经有 alt 就不重复加 */
      const alt = /\balt=/.test(pre + post) ? "" : ' alt="' + escAttr(base) + '"';
      return "<img" + pre + ' src="' + uri + '"' + alt + " />";
    }
  );
  return { html: out, inlined: inlined, missing: missing };
}

/* ------------------------------------------------------------------ */
/* 服务端内核渲染（面板不在场时的兜底：公式走 miniMath）                  */
/* ------------------------------------------------------------------ */
function buildBodyHtml(source, baseDir) {
  const core = require("./preview-core.js");
  /* v0.9.1：导出 HTML 也展开 \input/\include —— 服务端有 fs，直接同步解析。
   * 规则与 TeX 一致：相对主文件目录；无扩展名补 .tex；找不到 → 静态占位卡。 */
  const r = core.renderPreview(String(source || ""), {
    baseDir: baseDir || "",
    inputResolver: function (name, dir) {
      const n = String(name || "").trim().replace(/^["']|["']$/g, "");
      if (!n) return null;
      let f = n;
      const isAbs = /^[a-zA-Z]:[\\/]/.test(n) || n.slice(0, 2) === "\\\\" || n.charAt(0) === "/";
      if (!isAbs && dir) f = String(dir).replace(/[\\/]+$/, "") + "/" + n;
      if (!/\.[a-zA-Z0-9]+$/.test(f)) f += ".tex";
      try {
        if (fs.statSync(f).isFile()) return { path: f, content: TEXENC.readTexSource(f) };
      } catch (e) { /* fallthrough */ }
      return { path: f };
    },
  });
  return (r && r.html) || "";
}

/* 从 \title{...} 猜一个标题（面板没传 title 时的兜底） */
function guessTitle(source) {
  const s = String(source || "");
  const m = /\\title\s*(?:\[[^\]]*\])?\s*\{/.exec(s);
  if (!m) return "";
  const start = m.index + m[0].length;
  let depth = 1;           // 已经站在「{」里面了，从 1 起算
  let end = s.length;
  for (let j = start; j < s.length; j++) {
    const c = s[j];
    if (c === "\\") { j++; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (!depth) { end = j; break; } }
  }
  return s
    .slice(start, end)
    .replace(/\\[a-zA-Z]+\s*/g, "")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------ */
/* 组装整页文档                                                        */
/* ------------------------------------------------------------------ */
function buildDoc(o) {
  o = o || {};
  const title = o.title ? String(o.title) : "LaTeX 导出";
  const lang = o.lang === "en" ? "en" : "zh-CN";
  const body = stripRuntimeAttrs(o.bodyHtml || "");
  const parts = [
    "<!DOCTYPE html>",
    '<html lang="' + escAttr(lang) + '">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '<meta name="generator" content="Notrat LaTeX 助手" />',
    "<title>" + esc(title) + "</title>",
    "<style>",
    THEME_CSS,
    "</style>",
  ];
  /* 正文里真有 KaTeX 标记才带它的样式（服务端 miniMath 渲染的正文不需要） */
  if (o.katexCss) {
    parts.push("<style>");
    parts.push(String(o.katexCss));
    parts.push("</style>");
  }
  parts.push("<style>");
  parts.push(PV_CSS);
  parts.push("</style>");
  parts.push("<style>");
  parts.push(PRINT_CSS);
  parts.push("</style>");
  parts.push("</head>");
  parts.push("<body>");
  parts.push('<main class="pv-root pv-export">');
  parts.push(body);
  parts.push("</main>");
  parts.push("</body>");
  parts.push("</html>");
  return parts.join("\n");
}

/* 读同目录的 KaTeX 离线资产（CSS 已把字体内嵌成 dataURI） */
function loadKatexCss(dir) {
  const base = dir || __dirname;
  for (const f of [path.join(base, "assets-katex.json"), path.join(base, "server", "assets-katex.json")]) {
    try {
      const j = JSON.parse(fs.readFileSync(f, "utf8"));
      if (j && j.css) return j.css;
    } catch (e) { /* 没打包就走 miniMath */ }
  }
  return "";
}

module.exports = {
  buildDoc: buildDoc,
  buildBodyHtml: buildBodyHtml,
  inlineImages: inlineImages,
  stripRuntimeAttrs: stripRuntimeAttrs,
  guessTitle: guessTitle,
  loadKatexCss: loadKatexCss,
  PV_CSS: PV_CSS,
  THEME_CSS: THEME_CSS,
  PRINT_CSS: PRINT_CSS,
};
