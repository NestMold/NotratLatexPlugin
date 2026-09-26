/* v0.8.4 补丁：modes 档位顺序、latex_export 工具、build 收录新模块
 * 每一步都断言命中次数 —— 命中数不对就整体不落盘（宁可炸在这里，也不写半截）。
 * 运行： node .setup/patch-v084-export.js
 */
const fs = require("fs");
const path = require("path");

const ws = "E:/notrat-latex-plugin";
const read = (p) => fs.readFileSync(path.join(ws, p), "utf8");
const write = (p, s) => fs.writeFileSync(path.join(ws, p), s);
let edits = 0;

function must(hay, needle, n, label) {
  const c = hay.split(needle).length - 1;
  if (c !== (n === undefined ? 1 : n)) {
    console.error("✗ " + label + "：期望命中 " + (n === undefined ? 1 : n) + " 次，实际 " + c + " 次");
    process.exit(1);
  }
  return c;
}
function rep(s, from, to, label) {
  must(s, from, 1, label);
  edits++;
  return s.split(from).join(to);
}

/* ============ 1) manifest.json：modes 顺序 → 可视化 | 源码 | 分屏 ============ */
{
  const p = "manifest.json";
  const raw = read(p);
  const m = JSON.parse(raw);
  const e = m.contributions.editors[0];
  const before = JSON.stringify(e.modes);
  e.modes = [
    { id: "visual", label: "可视化" },
    { id: "source", label: "源码" },
    { id: "split", label: "分屏" },
  ];
  /* 保留原文件的 2 空格缩进与末尾换行 */
  let out = JSON.stringify(m, null, 2) + "\n";
  write(p, out);
  console.log("✓ manifest.json modes: " + before + "\n                 →  " + JSON.stringify(e.modes));
  edits++;
}

/* ============ 2) server/index.js：挂 EXPORT + 导出函数 + 工具 + dispatch ============ */
{
  const p = "server/index.js";
  let s = read(p);

  s = rep(
    s,
    'const CONTRIB = require("./contrib.js"); // v0.4.0 新贡献面支撑（引擎探测/大纲/状态/快照）',
    'const CONTRIB = require("./contrib.js"); // v0.4.0 新贡献面支撑（引擎探测/大纲/状态/快照）\nconst EXPORT = require("./export-html.js"); // v0.8.4 导出（自包含 HTML）',
    "index.js require EXPORT"
  );

  s = rep(s, 'const VERSION = "0.5.3";', 'const VERSION = "0.8.4"; // 构建时按 manifest.version 覆写', "index.js VERSION");

  /* ---- 导出实现：插在 MCP JSON-RPC 分节之前 ---- */
  const ANCHOR = "/* ------------------------------------------------------------------ */\n/* MCP JSON-RPC                                                         */";
  must(s, ANCHOR, 1, "MCP JSON-RPC 分节锚点");
  const IMPL = `/* ------------------------------------------------------------------ */
/* 导出（v0.8.4）：把 .tex 变成「能拿出去」的产物                        */
/* ------------------------------------------------------------------ */

/* 落点：same=文档旁（默认）/ desktop / downloads / documents */
function exportDir(dest, file) {
  const d = String(dest || "same").toLowerCase();
  const home = os.homedir();
  if (d === "desktop") return path.join(home, "Desktop");
  if (d === "downloads") return path.join(home, "Downloads");
  if (d === "documents") return path.join(home, "Documents");
  return path.dirname(file);
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {}
}

function statSize(p) {
  try {
    return fs.statSync(p).size;
  } catch (e) {
    return 0;
  }
}

function mtimeOf(p) {
  try {
    return fs.statSync(p).mtimeMs;
  } catch (e) {
    return 0;
  }
}

/** 导出 PDF：编译（除非产物已比 .tex 新）→ 必要时复制到目标目录 */
function exportPdf(file, args) {
  const base = path.basename(file).replace(/\\.tex$/i, "");
  const pdfNative = path.join(path.dirname(file), base + ".pdf");
  const upToDate = mtimeOf(pdfNative) > 0 && mtimeOf(pdfNative) >= mtimeOf(file);
  const mustCompile = args.force === true || !upToDate;
  return (mustCompile ? compileTex(file) : Promise.resolve("")).then((logText) => {
    if (!fs.existsSync(pdfNative)) {
      return JSON.stringify({
        ok: false,
        format: "pdf",
        message: "没有生成 PDF（看看下面的编译日志：多半是 TeX 引擎没装或源码有错）",
        log: logText || "",
      });
    }
    let outPath = pdfNative;
    const explicit = String(args.out || "").trim();
    const destDir = explicit ? path.dirname(path.resolve(explicit)) : exportDir(args.dest, file);
    const destName = explicit ? path.basename(path.resolve(explicit)) : base + ".pdf";
    if (path.resolve(destDir) !== path.resolve(path.dirname(file))) {
      ensureDir(destDir);
      const t = path.join(destDir, destName);
      try {
        fs.copyFileSync(pdfNative, t);
        outPath = t;
      } catch (e) {
        return JSON.stringify({ ok: false, format: "pdf", message: "复制到 " + t + " 失败：" + e.message, log: logText || "" });
      }
    }
    return JSON.stringify({
      ok: true,
      format: "pdf",
      outPath: outPath,
      bytes: statSize(outPath),
      reused: !mustCompile,
      sourcePath: pdfNative,
      log: logText || "",
    });
  });
}

/** 导出 HTML：正文用面板渲染好的那份（KaTeX 已排版）或服务端内核兜底 */
function exportHtml(file, args) {
  const base = path.basename(file).replace(/\\.tex$/i, "");
  let source = "";
  try {
    source = fs.readFileSync(file, "utf8");
  } catch (e) {
    source = "";
  }
  let body = "";
  let from = "editor";
  if (typeof args.body === "string" && args.body.trim()) {
    body = args.body;
  } else {
    from = "server";
    body = EXPORT.buildBodyHtml(source, path.dirname(file));
  }
  const inl = EXPORT.inlineImages(body);
  const usesKatex = /class="katex/.test(inl.html);
  const doc = EXPORT.buildDoc({
    title: String(args.title || "").trim() || EXPORT.guessTitle(source) || base,
    lang: process.env.NOTRAT_LOCALE === "en" ? "en" : "zh-CN",
    bodyHtml: inl.html,
    katexCss: usesKatex ? EXPORT.loadKatexCss(__dirname) : "",
  });
  const explicit = String(args.out || "").trim();
  const targetDir = explicit ? path.dirname(path.resolve(explicit)) : exportDir(args.dest, file);
  const outPath = explicit ? path.resolve(explicit) : path.join(targetDir, base + ".html");
  try {
    ensureDir(path.dirname(outPath));
    fs.writeFileSync(outPath, doc, "utf8");
  } catch (e) {
    return JSON.stringify({ ok: false, format: "html", message: "写入 " + outPath + " 失败：" + e.message });
  }
  return JSON.stringify({
    ok: true,
    format: "html",
    outPath: outPath,
    bytes: statSize(outPath),
    from: from,
    math: usesKatex ? "katex" : "mini",
    images: { inlined: inl.inlined.length, missing: inl.missing },
    theme: "light",
  });
}

`;
  s = s.split(ANCHOR).join(IMPL + ANCHOR);
  edits++;

  /* ---- 工具声明：紧跟 latex_compile 之后 ---- */
  const TOOL_ANCHOR = `  {
    name: "latex_asset",`;
  must(s, TOOL_ANCHOR, 1, "latex_asset 工具锚点");
  const TOOL = `  {
    name: "latex_export",
    description:
      "把 .tex 导出为可交付产物：format=pdf 用本机 TeX 引擎编译成 PDF（产物比 .tex 新则直接复用，force=true 强制重编）；format=html 生成自包含 HTML（公式已排版、图片内嵌 dataURI、含 A4 打印样式，离线可看、可直接分享）。产物默认落在 .tex 同目录，dest 换目录（desktop/downloads/documents），或用 out 指定完整路径。返回 JSON：{ok, format, outPath, bytes, reused|images, log}。",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: ".tex 文件路径（绝对或相对工作区）" },
        format: { type: "string", enum: ["pdf", "html"], description: "产物格式：pdf(编译) / html(自包含网页)" },
        dest: { type: "string", enum: ["same", "desktop", "downloads", "documents"], description: "落点：same=文档旁（默认）/ desktop / downloads / documents" },
        out: { type: "string", description: "显式产物路径（给了它就忽略 dest）" },
        force: { type: "boolean", description: "PDF：无视新鲜度检查，强制重新编译" },
        body: { type: "string", description: "（面板传入，无需手填）编辑器已渲染好的正文 HTML；不传则服务端内核渲染" },
        title: { type: "string", description: "导出页标题（不传则从 \\\\title{} 猜）" },
        ...WS_PARAM,
      },
    },
  },
`;
  s = s.split(TOOL_ANCHOR).join(TOOL + TOOL_ANCHOR);
  edits++;

  /* ---- dispatch：紧跟 latex_compile 分支之后 ---- */
  const DISP_ANCHOR = `    if (!file) throw new Error(\`未找到 .tex 文件（输入: \${input || "(自动发现)"}，工作区: \${ws || "无"}）\`);
    return compileTex(file);
  }
`;
  must(s, DISP_ANCHOR, 1, "latex_compile dispatch 锚点");
  const DISP = DISP_ANCHOR + `  if (name === "latex_export") {
    const input = args.path || args.filePath;
    const file = resolveInput(input, ws);
    if (!file) throw new Error(\`未找到 .tex 文件（输入: \${input || "(自动发现)"}，工作区: \${ws || "无"}）\`);
    const format = String(args.format || "pdf").toLowerCase();
    if (format === "pdf") return exportPdf(file, args);
    if (format === "html" || format === "htm") return exportHtml(file, args);
    throw new Error(\`latex_export 的 format 只支持 pdf / html（收到 "\${format}"）\`);
  }
`;
  s = s.split(DISP_ANCHOR).join(DISP);
  edits++;

  /* ---- 文件头工具清单补一行 ---- */
  s = rep(
    s,
    " *   latex_compile  调用本机 TeX 引擎编译（xelatex/pdflatex/lualatex/latexmk，设置项可配）",
    " *   latex_compile  调用本机 TeX 引擎编译（xelatex/pdflatex/lualatex/latexmk，设置项可配）\n *   latex_export   导出 PDF / 自包含 HTML（v0.8.4）",
    "index.js 头注释工具清单"
  );

  write(p, s);
  console.log("✓ server/index.js：require + 实现 + 工具 + dispatch（4 处）");
}

/* ============ 3) build-singlefile.js：收录 export-html.js + 版本回写 ============ */
{
  const p = ".setup/build-singlefile.js";
  let s = read(p);

  s = rep(
    s,
    `for (const f of ["index.js", "contrib.js"]) {
  fs.copyFileSync(path.join(ws, "server", f), path.join(toolsDir, f === "index.js" ? "latex-server.js" : "contrib.js"));
  console.log("  ✓ server/" + f + " → " + toolsDir);
}`,
    `for (const f of ["index.js", "contrib.js", "export-html.js"]) {
  const dst = path.join(toolsDir, f === "index.js" ? "latex-server.js" : f);
  /* index.js 单独处理：把 server 里的 VERSION 常量对齐到 manifest.version（避免两处版本漂移） */
  let body = fs.readFileSync(path.join(ws, "server", f), "utf8");
  if (f === "index.js") {
    if (!/^const VERSION = "[^"]*";/m.test(body)) {
      console.error("致命：server/index.js 里找不到 VERSION 常量，无法对齐版本号");
      process.exit(1);
    }
    body = body.replace(/^const VERSION = "[^"]*";.*$/m, 'const VERSION = "' + VERSION + '";');
  }
  fs.writeFileSync(dst, body);
  console.log("  ✓ server/" + f + " → " + dst);
}`,
    "build 收录 export-html.js"
  );

  write(p, s);
  console.log("✓ .setup/build-singlefile.js：copy 清单 + VERSION 对齐");
}

console.log("\n完成，共 " + edits + " 处编辑。");
