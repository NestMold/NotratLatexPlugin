/* v0.8.4 补丁（编辑器侧）：工具栏「⬇ 导出」菜单 + 导出结果条（预览 / 复制路径 / 换目录）
 *
 * ⚠ panels/editor.tsx 是**全 CRLF**：本脚本先归一到 LF（锚点按 LF 写），
 *   打完补丁再还原成 CRLF。否则多行锚点一个都匹配不上（第一次就栽在这）。
 *
 * 运行： node .setup/patch-v084-editor.js
 */
const fs = require("fs");
const path = require("path");

const ws = "E:/notrat-latex-plugin";
const P = path.join(ws, "panels/editor.tsx");
const raw = fs.readFileSync(P, "utf8");
const EOL = raw.indexOf("\r\n") >= 0 ? "\r\n" : "\n";
let s = raw.split("\r\n").join("\n");
let edits = 0;

function must(needle, n, label) {
  const c = s.split(needle).length - 1;
  if (c !== (n === undefined ? 1 : n)) {
    console.error("✗ " + label + "：期望 " + (n === undefined ? 1 : n) + " 次，实际 " + c);
    process.exit(1);
  }
}
function rep(from, to, label) {
  must(from, 1, label);
  s = s.split(from).join(to);
  edits++;
}
function after(anchor, add, label) {
  must(anchor, 1, label);
  s = s.replace(anchor, anchor + add);
  edits++;
}
function before(anchor, add, label) {
  must(anchor, 1, label);
  s = s.replace(anchor, add + anchor);
  edits++;
}

/* ============ 1) 头注释：版本 + 档位顺序 + 导出说明 ============ */
rep(
  " * LaTeX 编辑器 v0.8.3 — editors 贡献面（接管 .tex 文件）",
  " * LaTeX 编辑器 v0.8.4 — editors 贡献面（接管 .tex 文件）",
  "头注释版本"
);
rep(
  ' *     modes    = 可视化 / 分屏 / 源码    → 新客户端（modes 生效、dualView 被忽略）：\n *                                         props.mode = "visual" | "split" | "source"，并下发 props.modes',
  ' *     modes    = 可视化 / 源码 / 分屏    → 新客户端（modes 生效、dualView 被忽略）：\n *                                         props.mode = "visual" | "source" | "split"，并下发 props.modes\n *                                         （第一项 = 宿主默认档，所以「可视化」排最前）',
  "头注释档位顺序"
);
rep(
  " * 数据通路：window.electronAPI.mcp.callTool（主进程 IPC）+ window CustomEvent（与宿主自家编辑器同一引用通道）",
  ' * 导出（v0.8.4）：工具栏「⬇ 导出」→ MCP latex_export。\n *   PDF  = 本机 TeX 引擎编译出的产物；HTML = 自包含单文件（公式已排版、图片内嵌 dataURI、含 A4 打印样式）。\n *   预览走宿主的 notrat-open-file 通道（.pdf 有内置阅读器，.html 有内置预览器）——\n *   开的永远是**刚导出的那个文件**，不会出现「预览一套、导出另一套」。\n *   产物路径 / 换目录 / 重新生成都在底部「⬇ 导出」结果条里，不另造弹窗。\n * 数据通路：window.electronAPI.mcp.callTool（主进程 IPC）+ window CustomEvent（与宿主自家编辑器同一引用通道）',
  "头注释导出说明"
);

/* ============ 2) 视图契约注释里的档位顺序 ============ */
rep(
  ' *     新客户端  modes = 可视化 / 分屏 / 源码       → props.mode = "visual" | "split" | "source"',
  ' *     新客户端  modes = 可视化 / 源码 / 分屏       → props.mode = "visual" | "source" | "split"',
  "视图契约注释档位顺序"
);

/* ============ 3) 工具栏下拉样式常量 ============ */
after(
  'const tbtnP = { ...tbtn, background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" };',
  `
/* 工具栏下拉（「⬇ 导出」）：右对齐，贴着按钮弹出 */
const tmenu = {
  position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 40, minWidth: 230,
  padding: 4, borderRadius: 8, border: "1px solid hsl(var(--border))",
  background: "hsl(var(--popover))", boxShadow: "0 8px 24px rgba(0,0,0,.25)",
};
const titem = {
  display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent",
  color: "hsl(var(--popover-foreground))", fontFamily: "inherit", fontSize: 12,
  padding: "5px 8px", borderRadius: 5, cursor: "pointer", whiteSpace: "nowrap",
};
const tsep = { height: 1, margin: "4px 6px", background: "hsl(var(--border))" };
const tcap = { padding: "4px 8px 2px", fontSize: 10.5, color: "hsl(var(--muted-foreground))" };`,
  "下拉样式常量"
);

/* ============ 4) state：导出菜单 + 最近产物 ============ */
after(
  "  const [toast, setToast] = useState(null); // {msg; undo?}",
  `
  /* v0.8.4：导出菜单 + 最近一次产物（预览入口认它，不靠猜磁盘上有没有） */
  const [exMenu, setExMenu] = useState(false);
  const exMenuRef = useRef(null);
  const [exportInfo, setExportInfo] = useState(null);`,
  "导出 state"
);

/* ============ 5) 导出的动作 ============ */
before(
  "  /* ---------- KaTeX 资产加载（离线包；失败自动 miniMath 兜底） ---------- */",
  `  /* ---------- 导出（v0.8.4）：PDF / 自包含 HTML，并给出预览入口 ---------- */
  function baseName(p) {
    const t = String(p || "");
    const i = Math.max(t.lastIndexOf("/"), t.lastIndexOf("\\\\"));
    return i >= 0 ? t.slice(i + 1) : t;
  }
  function fmtSize(n) {
    const b = Number(n) || 0;
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
    return (b / 1024 / 1024).toFixed(2) + " MB";
  }
  function imgCount(info) {
    return info && info.images && info.images.inlined ? info.images.inlined : 0;
  }
  /* 文档标题：写进导出页的 <title>（服务端还有一层 \\title{} 兜底） */
  function docTitle() {
    const m = /\\\\title\\s*(?:\\[[^\\]]*\\])?\\s*\\{([^{}]*)\\}/.exec(content || "");
    return m ? m[1].replace(/\\\\[a-zA-Z]+\\s*/g, "").trim() : "";
  }
  /* 预览：交给宿主打开产物（.pdf 内置阅读器 / .html 内置预览器）——
   * 同一份文件，所以「看到的」就是「导出的」，不会两处不同步。 */
  function openInHost(p) {
    if (!p) return;
    try {
      window.dispatchEvent(new CustomEvent("notrat-open-file", { detail: { path: p } }));
      setToast({ msg: "👁 已在 Notrat 中打开 " + baseName(p) });
    } catch (e) {
      setToast({ msg: "⚠ 打不开预览：用结果条里的「📋 复制路径」手动打开" });
    }
  }
  async function copyPath() {
    const p = exportInfo && exportInfo.outPath;
    if (!p) return;
    try {
      await navigator.clipboard.writeText(p);
      setToast({ msg: "📋 已复制产物路径" });
    } catch (e) {
      setToast({ msg: "⚠ 复制失败：" + p });
    }
  }
  /* 导出：先落盘（编译读的是磁盘文件，别拿旧内容糊弄用户）再调工具。
   * HTML 的正文用**编辑器这份**（KaTeX 已排版、含刚提交的就地编辑改动）；
   * 渲染不出来就不传 body，让服务端内核兜底（代价是公式退化为近似排版）。 */
  async function doExport(format, dest, opts) {
    const o = opts || {};
    const pending = commitWys();
    if (pending != null && onSave) { try { onSave(); } catch (e0) {} }
    setBusy("export"); setErr("");
    try {
      const a = { path: filePath, format: format, dest: dest || "same" };
      if (o.force) a.force = true;
      if (format === "html") {
        try {
          if (typeof LPC !== "undefined" && LPC && typeof LPC.renderPreview === "function") {
            a.body = LPC.renderPreview(content, { renderMath: renderMath, baseDir: baseDir }).html;
            const t = docTitle();
            if (t) a.title = t;
          }
        } catch (e1) { /* 交给服务端 */ }
      }
      const out = JSON.parse(await callTool("latex_export", a));
      setExportInfo(out);
      setBottomTab("export"); setBottomOpen(true);
      if (out && out.ok) setToast({ msg: "✅ 已导出 " + baseName(out.outPath) + "（" + fmtSize(out.bytes) + "）" });
      else setToast({ msg: "⚠ 导出未完成 —— 看底部「⬇ 导出」结果" });
      return out;
    } catch (e) {
      const msg = String((e && e.message) || e);
      setErr(msg);
      setExportInfo({ ok: false, format: format, message: msg });
      setBottomTab("export"); setBottomOpen(true);
      return null;
    } finally {
      setBusy("");
    }
  }
  /* 预览：已有产物直接开（不重编）；没有就先导一次再开 */
  async function doPreview(format) {
    let info = exportInfo && exportInfo.format === format && exportInfo.ok !== false ? exportInfo : null;
    if (!info) info = await doExport(format, "same");
    if (info && info.ok && info.outPath) openInHost(info.outPath);
    else setToast({ msg: "⚠ 还没有可预览的产物" });
  }

`,
  "导出动作函数"
);

/* ============ 6) 导出菜单：点别处 / Esc 关掉 ============ */
after(
  "  }, [menu]);\n\n  /* toast 自动消失 */",
  `
  /* 「⬇ 导出」菜单：点别处 / Esc 关掉 */
  useEffect(() => {
    if (!exMenu) return;
    function onDown(e) { if (exMenuRef.current && !exMenuRef.current.contains(e.target)) setExMenu(false); }
    function onKey(e) { if (e.key === "Escape") setExMenu(false); }
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [exMenu]);
`,
  "导出菜单关闭副作用"
);

/* ============ 7) 工具栏：导出菜单按钮 ============ */
after(
  `        <button style={{ ...tbtn, border: "none", background: "transparent" }} onClick={doValidate} disabled={busy === "validate"} title="校验 ref / cite / label（MCP latex_validate）">
          {busy === "validate" ? "⏳" : "✅"} 校验
        </button>
`,
  `
        <div ref={exMenuRef} style={{ position: "relative" }}>
          <button
            style={{ ...tbtn, border: "none", background: "transparent" }}
            onClick={() => setExMenu(!exMenu)}
            disabled={busy === "export"}
            title="导出 PDF / 自包含 HTML，并可预览（MCP latex_export）"
          >
            {busy === "export" ? "⏳" : "⬇"} 导出 {exMenu ? "▴" : "▾"}
          </button>
          {exMenu ? (
            <div style={tmenu}>
              <div style={tcap}>预览（不重编，秒开）</div>
              <button style={titem} onClick={() => { setExMenu(false); doPreview("pdf"); }}>👁 预览 PDF</button>
              <button style={titem} onClick={() => { setExMenu(false); doPreview("html"); }}>👁 预览 HTML</button>
              <div style={tsep} />
              <div style={tcap}>导出到文档旁</div>
              <button style={titem} onClick={() => { setExMenu(false); doExport("pdf", "same"); }}>📄 PDF（编译生成）</button>
              <button style={titem} onClick={() => { setExMenu(false); doExport("html", "same"); }}>🌐 HTML（自包含 · 可分享 / 打印）</button>
              <div style={tsep} />
              <div style={tcap}>导出到桌面</div>
              <button style={titem} onClick={() => { setExMenu(false); doExport("pdf", "desktop"); }}>📄 PDF → 桌面</button>
              <button style={titem} onClick={() => { setExMenu(false); doExport("html", "desktop"); }}>🌐 HTML → 桌面</button>
            </div>
          ) : null}
        </div>
`,
  "工具栏导出菜单"
);

/* ============ 8) 工具栏注释补一句 ============ */
rep(
  "       *   留下的（宿主不管的）：＋插入 / 编译 / 校验 / MCP 状态点。 */",
  "       *   留下的（宿主不管的）：＋插入 / 编译 / 校验 / 导出 / MCP 状态点。 */",
  "工具栏注释"
);

/* ============ 9) 结果条：出现条件 + 多一个「导出」Tab ============ */
rep(
  '      {issues || compileOut || err ? (\n      <div style={{ borderTop: "1px solid hsl(var(--border))" }}>',
  '      {issues || compileOut || err || exportInfo ? (\n      <div style={{ borderTop: "1px solid hsl(var(--border))" }}>',
  "结果条出现条件"
);
after(
  '            🔨 编译 {compileOut ? "•" : ""}\n          </button>\n',
  `          {exportInfo ? (
            <button
              style={{ ...tbtn, border: "none", background: "transparent", color: bottomTab === "export" ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}
              onClick={() => { setBottomTab("export"); setBottomOpen(true); }}
            >
              ⬇ 导出 {exportInfo.ok === false ? "⚠" : "•"}
            </button>
          ) : null}
`,
  "结果条导出 Tab"
);

/* ============ 10) 结果条内容：导出分支 ============ */
rep(
  "            ) : (\n              compileOut ? (\n",
  `            ) : bottomTab === "export" ? (
              exportInfo ? (
                <div>
                  {exportInfo.ok === false ? (
                    <span style={{ color: "#ef4444" }}>⚠ {exportInfo.message || "导出失败"}</span>
                  ) : (
                    <div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                        <span style={{ color: "#22c55e" }}>✅ 已导出 {String(exportInfo.format || "").toUpperCase()}</span>
                        <span style={{ color: "hsl(var(--muted-foreground))" }}>
                          {fmtSize(exportInfo.bytes)}
                          {exportInfo.format === "html" ? " · 公式" + (exportInfo.math === "katex" ? " KaTeX 排版" : " 近似排版") + " · 内嵌图 " + imgCount(exportInfo) + " 张" : ""}
                          {exportInfo.reused ? " · 产物已是最新，未重编" : ""}
                          {exportInfo.from === "server" ? " · 正文由服务端内核渲染" : ""}
                        </span>
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 11, wordBreak: "break-all", color: "hsl(var(--muted-foreground))" }}>{exportInfo.outPath}</div>
                      {exportInfo.images && exportInfo.images.missing && exportInfo.images.missing.length ? (
                        <div style={{ color: "#f59e0b" }}>🖼 有 {exportInfo.images.missing.length} 张图没能内嵌：{exportInfo.images.missing.join("、")}</div>
                      ) : null}
                      <div style={{ marginTop: 5, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button style={tbtn} onClick={() => openInHost(exportInfo.outPath)}>👁 预览</button>
                        <button style={tbtn} onClick={copyPath}>📋 复制路径</button>
                        <button style={tbtn} onClick={() => doExport(exportInfo.format, "desktop")}>🖥 再导一份到桌面</button>
                        <button style={tbtn} onClick={() => doExport(exportInfo.format, "downloads")}>📥 再导一份到下载</button>
                        <button style={tbtn} onClick={() => doExport(exportInfo.format, "same", { force: true })}>🔄 重新生成</button>
                      </div>
                    </div>
                  )}
                  {exportInfo.log ? (
                    <pre style={{ margin: "8px 0 0", fontFamily: MONO, fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 110, overflowY: "auto" }}>{exportInfo.log}</pre>
                  ) : null}
                </div>
              ) : (
                <span style={{ color: "hsl(var(--muted-foreground))" }}>还没有导出过 —— 点工具栏「⬇ 导出」。</span>
              )
            ) : (
              compileOut ? (
`,
  "结果条导出分支"
);

const out = EOL === "\r\n" ? s.split("\n").join("\r\n") : s;
fs.writeFileSync(P, out);
console.log("✓ panels/editor.tsx：完成 " + edits + " 处编辑（" + out.length + " 字符，EOL=" + (EOL === "\r\n" ? "CRLF" : "LF") + "）");
