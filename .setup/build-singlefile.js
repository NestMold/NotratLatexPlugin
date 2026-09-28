/* 组装单文件插件包（v0.4.0 — 新贡献面全量内联）
 *
 * 内联范围（全部 contributions 里的 TSX 源码）：
 *   editors[].sourceFile      ← 注入 preview-core（LPC 占位注释）
 *   renderers[].sourceFile    ← 注入 preview-core（同一 LPC 占位）
 *   ui[].content.sourceFile   ← 面板组件
 *
 * ⚠ 防回归 1：mcpServers 必须数组形态 [{ id, name, transport, ... }]。
 *   对象形态会让宿主 enable() 里 for...of 抛 "object is not iterable"（0.2.3 事故）。
 * ⚠ 防回归 2：注入后源码绝不许残留 "module.exports" 语句——它会把宿主准备好的
 *   exports 对象整体覆盖成内核对象，宿主 interop 把它包成 {default: 对象}，
 *   编辑器加载报「default 应为 function，实际为 object」（0.3.0 事故）。
 *   因此导出改写正则必须 ^ 行首锚定（m 标志）：文件头注释里含
 *   「module.exports = {...}」示例字样，无锚点会先命中注释、漏掉真语句。
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

const ws = "E:/notrat-latex-plugin";
/* 版本以工作区 manifest.json 为准（写死会导致部署包版本与源码漂移） */
const VERSION = JSON.parse(fs.readFileSync(path.join(ws, "manifest.json"), "utf8")).version;

const editorSrc = fs.readFileSync(path.join(ws, "panels/editor.tsx"), "utf8");
let core = fs.readFileSync(path.join(ws, "server/preview-core.js"), "utf8");
const m = JSON.parse(fs.readFileSync(path.join(ws, "manifest.json"), "utf8"));

/* ---------- preview-core：末行 CJS 导出 → 内联常量 ---------- */
core = core.replace(
  /^module\.exports\s*=\s*\{[^}]*\};?[^\S\n]*$/m,
  "const LPC = { renderPreview: renderPreview, miniMath: miniMath };"
);
if (!/^const LPC = \{ renderPreview/m.test(core)) {
  console.error("preview-core 导出语句改写失败（未找到行首的导出语句）");
  process.exit(1);
}

/* ---------- wysiwyg 块模型内核：末行 CJS 导出 → 内联常量 ----------
 * 与 preview-core 同一条通路。导出对象内不得出现嵌套花括号（下面正则用 [^}]* 匹配）。
 * ⚠ 改写后不得残留 module.exports —— 那会把宿主 exports 覆盖成内核对象，
 *   编辑器报「default 应为 function，实际为 object」（0.3.0 事故）。 */
const wysRaw = fs.readFileSync(path.join(ws, "server/wysiwyg.js"), "utf8");
/* 导出语句 → return，然后整份包进 IIFE：
 *   内核里的 escHtml / readGroup / findEnvEnd 与 preview-core 同名，
 *   两份都摊在顶层会被 esbuild 判「已声明」（顶层不允许重名）。 */
const wysBody = wysRaw.replace(/^module\.exports\s*=\s*\{([^}]*)\};?[^\S\n]*$/m, "return {$1};");
if (!/^return \{/m.test(wysBody)) {
  console.error("wysiwyg 导出语句改写失败（未找到行首的导出语句）");
  process.exit(1);
}
const wysSrc = "const WYS = (function () {\n" + wysBody + "\n})();"

/* ---------- 事务历史内核（txlog.js）：与 preview-core / wysiwyg 同一条通路 ----------
 * 预览层的 commit / rebase / undo / redo 全在它里面。内联不进去，编辑器一碰历史就是
 * ReferenceError —— 而那个异常会被各处 try/catch 咽掉，看起来就像「撤销失灵」。
 * 与 wysiwyg 同样的约束：末行那条导出语句换成 return（正则用 [^}]* 匹配，
 * 导出对象里不许出现嵌套花括号），整份包 IIFE 后摊在顶层不重名。 */
const txRaw = fs.readFileSync(path.join(ws, "server/txlog.js"), "utf8");
const txBody = txRaw.replace(/^module\.exports\s*=\s*\{([^}]*)\};?[^\S\n]*$/m, "return {$1};");
if (!/^return \{/m.test(txBody)) {
  console.error("txlog 导出语句改写失败（未找到行首的导出语句）");
  process.exit(1);
}
const txSrc = "const TX = (function () {\n" + txBody + "\n})();";

/* ---------- 逐条内联贡献面源码 ---------- */
const LPC_TOKEN = "/*" + "__LPC__" + "*/";
const WYS_TOKEN = "/*" + "__WYS__" + "*/";
const TX_TOKEN = "/*" + "__TX__" + "*/";

function inline(src, label) {
  let out = src;
  if (out.split(LPC_TOKEN).length > 1) out = out.split(LPC_TOKEN).join(core);
  else console.warn("  ! " + label + " 未包含 LPC 占位注释（预览能力将不可用）");
  if (out.split(WYS_TOKEN).length > 1) out = out.split(WYS_TOKEN).join(wysSrc);
  else if (label.indexOf("editors[") === 0) console.warn("  ! " + label + " 未包含 WYS 占位注释（就地编辑不可用）");
  if (out.split(TX_TOKEN).length > 1) out = out.split(TX_TOKEN).join(txSrc);
  else if (label.indexOf("editors[") === 0) console.warn("  ! " + label + " 未包含 TX 占位注释（撤销历史不可用）");
  if (out.includes("module.exports")) {
    console.error("致命：" + label + " 注入后仍含 module.exports（会覆盖宿主 exports → default 变 object）");
    process.exit(1);
  }
  return out;
}

m.version = VERSION;
m.enabled = true;

let n = 0;
for (const e of m.contributions.editors || []) {
  if (!e.sourceFile) continue;
  const rel = e.sourceFile;
  e.source = inline(fs.readFileSync(path.join(ws, rel), "utf8"), "editors[" + e.id + "]");
  delete e.sourceFile;
  n++;
  console.log("  ✓ editors[" + e.id + "] ← " + rel + " (" + e.source.length + " 字符)");
}

for (const r of m.contributions.renderers || []) {
  if (!r.sourceFile) continue;
  const rel = r.sourceFile;
  r.source = inline(fs.readFileSync(path.join(ws, rel), "utf8"), "renderers[" + r.id + "]");
  delete r.sourceFile;
  n++;
  console.log("  ✓ renderers[" + r.id + "] ← " + rel + " (" + r.source.length + " 字符)");
}

for (const u of m.contributions.ui || []) {
  const c = u.content || {};
  if (!c.sourceFile) continue;
  const f = path.join(ws, c.sourceFile);
  let src = fs.readFileSync(f, "utf8");
  if (src.includes("module.exports")) {
    console.error("致命：UI 面板 " + u.id + " 源码含 module.exports");
    process.exit(1);
  }
  if (src.includes(LPC_TOKEN)) src = inline(src, "ui[" + u.id + "]");
  c.source = src;
  delete c.sourceFile;
  n++;
  console.log("  ✓ ui[" + u.id + "@" + u.location + "] ← " + u.content.source.length + " 字符");
}

/* ---------- KaTeX 离线资产 ---------- */
const kx = path.join(ws, "node_modules", "katex", "dist");
let hasKatex = false;
try {
  const js = fs.readFileSync(path.join(kx, "katex.min.js"), "utf8");
  let css = fs.readFileSync(path.join(kx, "katex.min.css"), "utf8");
  css = css.replace(/url\((fonts\/KaTeX_[A-Za-z-]+\.woff2)\)/g, (mm, rel) => {
    const f = path.join(kx, rel);
    if (!fs.existsSync(f)) return mm;
    return "url(data:font/woff2;base64," + fs.readFileSync(f).toString("base64") + ")";
  });
  fs.writeFileSync(path.join(ws, "server", "assets-katex.json"), JSON.stringify({ js: js, css: css }));
  hasKatex = true;
} catch (e) {
  console.warn("KaTeX 资产生成失败（预览将用 miniMath 兜底）:", e.message);
}

/* ---------- MCP server 落点：改用宿主运行时解析的占位符（v0.9.8 修） ----------
 * 【为什么不再写死绝对路径】
 *   旧实现：srv.args = [<构建机 home>/.notrat/tools/latex-server.js] —— os.homedir() 展开后的**字面量**。
 *   换机器 / 换用户名，这个路径就是死的 → node 起不来 → 该 server 提供的**全部工具**一起消失：
 *   latex_engine_install 报「未知工具」、latex_outline 返回空、首屏「没装引擎」提示条也不弹。
 *   而且全程没有任何报错：宿主对 mcp 启动失败只有 console.warn + 一条 packError，
 *   插件面板那次探测又是 try/catch 吞掉的（见 panels/editor.tsx「通道不可用：当作没事」）。
 *
 * 【现在的做法】
 *   用宿主自带的运行时占位符 ${pluginDir}。宿主 renderer 的 resolvePlaceholders() 里有
 *     .replace(/\$\{pluginDir\}/g, () => pluginDirFor(id))
 *   而 pluginDirFor(id) = <插件目录>/<插件 id>（运行时从 pluginsDirCache 取，与本机用户名无关）。
 *   ⇒ args 里不含用户名、不含盘符；同一个 manifest 两种安装形态都能用：
 *       · 目录包（zip）：<pluginDir>/server/index.js —— server/ 随 zip 分发（本来就跑得通）
 *       · 单文件包（json）：本脚本把 server/ 预置到 <pluginDir>/server/ 下
 *   另镜像一份到 ~/.notrat/tools/：老 manifest 与 .setup/ 里的开发者脚本还引用那个位置。
 *
 * 【断言】见文件末尾：args 不许含绝对路径 / sidecar 必须齐 / require 链必须闭合 /
 *   占位符必须有宿主证据（从装机版 app.asar 抠 renderer 实现，读不到则降级为提示）。
 */
if (!Array.isArray(m.mcpServers)) throw new Error("mcpServers 必须是数组形态（宿主 enable() for...of 会崩）");

const PLUGIN_ID = m.id;
/* 一个都不能漏：v0.9.0 +pdf-raster；v0.9.4 +tex-encoding；v0.9.6 +engine-install。
 * 漏一个 → index.js 顶层 require 抛 Cannot find module → server 整体起不来（同一个坑踩过两次）。 */
const REQUIRED_SERVER_FILES = ["index.js", "contrib.js", "export-html.js", "preview-core.js", "pdf-raster.js", "tex-encoding.js", "engine-install.js"];
const PORTABLE_SERVER_ARG = "${pluginDir}/server/index.js";

/** 单文件包的 server 落点 = <插件目录>/<插件 id>/server。纯函数：断言里用假 home 复算。 */
function sidecarDirFor(home, id) { return path.join(home, ".notrat", "plugins", id, "server"); }
/** 兼容镜像：老 manifest / 开发者脚本引用的位置。 */
function legacyToolsDirFor(home) { return path.join(home, ".notrat", "tools"); }

const bodies = {};
for (const f of REQUIRED_SERVER_FILES) {
  let body = fs.readFileSync(path.join(ws, "server", f), "utf8");
  if (f === "index.js") {
    if (!/^const VERSION = "[^"]*";/m.test(body)) {
      console.error("致命：server/index.js 里找不到 VERSION 常量，无法对齐版本号");
      process.exit(1);
    }
    body = body.replace(/^const VERSION = "[^"]*";.*$/m, 'const VERSION = "' + VERSION + '";');
  }
  bodies[f] = body;
}

const sidecarDir = sidecarDirFor(os.homedir(), PLUGIN_ID);
const legacyDir = legacyToolsDirFor(os.homedir());
fs.mkdirSync(sidecarDir, { recursive: true });
fs.mkdirSync(legacyDir, { recursive: true });
for (const f of REQUIRED_SERVER_FILES) {
  fs.writeFileSync(path.join(sidecarDir, f), bodies[f]);
  fs.writeFileSync(path.join(legacyDir, f === "index.js" ? "latex-server.js" : f), bodies[f]);
}
if (hasKatex) {
  fs.copyFileSync(path.join(ws, "server", "assets-katex.json"), path.join(sidecarDir, "assets-katex.json"));
  fs.copyFileSync(path.join(ws, "server", "assets-katex.json"), path.join(legacyDir, "assets-katex.json"));
}
console.log("  ✓ server/ × " + REQUIRED_SERVER_FILES.length + " + assets-katex.json → " + sidecarDir);
console.log("  ✓ 兼容镜像 → " + legacyDir);

const srv = m.mcpServers.find((s) => s.id === "latex") || m.mcpServers[0];
srv.args = [PORTABLE_SERVER_ARG];

/* ---------- 落盘 ---------- */
const out = path.join(os.homedir(), ".notrat", "plugins", PLUGIN_ID + ".json");
fs.writeFileSync(out, JSON.stringify(m, null, 2));
console.log("\nwritten " + out + "  " + (fs.statSync(out).size / 1024).toFixed(1) + "KB");
console.log("version:", m.version, "| 内联组件数:", n);
console.log("ui 挂载位:", m.contributions.ui.map((u) => u.id + "@" + u.location).join(", "));
console.log("editors:", m.contributions.editors.map((e) => e.id + " ext=" + e.extensions + " dualView=" + e.dualView).join("; "));
console.log("renderers:", (m.contributions.renderers || []).map((r) => r.id + "@" + r.nodeType).join("; "));
console.log("toolHooks:", (m.contributions.toolHooks || []).map((h) => h.on + ":" + h.toolPattern + "\u2192" + h.tool).join("; "));
console.log("mcpServers isArray:", Array.isArray(m.mcpServers), "\u2192", JSON.stringify(m.mcpServers.map((s) => ({ id: s.id, args: s.args }))));
console.log("katex assets:", hasKatex ? "打包成功" : "缺失(将用 miniMath 兜底)");
console.log("wysiwyg 内核:", wysSrc.length + " 字符（就地编辑层）");

/* ================================================================================
 * 验收断言（不通过就退出非零 —— 别把「换机器即静默全灭」的包发出去）
 *
 * 这组断言针对 v0.9.8 修掉的那类事故：mcpServers[].args 里混进构建机的绝对路径。
 * 宿主对 MCP 启动失败是**静默**的（mcp.start 抛错只 console.warn + 记 packError，
 * 插件面板那次探测又被 try/catch 吞掉），所以只能在构建期拦住。
 * ================================================================================ */
const { execFileSync } = require("child_process");
let FAIL = 0;
const AOK = (s) => console.log("  \u2713 " + s);
const ABAD = (s) => { FAIL++; console.error("  \u2717 " + s); };
const AWARN = (s) => console.log("  ! " + s);
/* 只认真正的盘符路径：https:// 里那个 "s:/" 前面是字母，不算（否则条条命中） */
const ABS_PATH_RE = /(?:^|[^A-Za-z0-9])[A-Za-z]:[\\/]/;

console.log("\n验收断言");

/* A. args 只许是可移植占位符：不许有盘符 / 用户名 / 构建机 home / 构建机私有落点 */
if (!(srv.args || []).length) ABAD("mcpServers.args 为空 —— server 根本不会被启动");
if (String(srv.args[0] || "") !== PORTABLE_SERVER_ARG) ABAD("args[0] 不是约定的可移植形态，实际：" + JSON.stringify(srv.args[0]));
else AOK("args[0] = " + PORTABLE_SERVER_ARG + "（宿主运行时解析）");
if (ABS_PATH_RE.test(String(srv.args[0])) || String(srv.args[0]).indexOf(os.homedir()) >= 0) {
  ABAD("args[0] 含构建机绝对路径 / home：" + JSON.stringify(srv.args[0]) + " —— 换机器即 Cannot find module，且宿主静默");
} else AOK("args[0] 无盘符、无用户名、无构建机 home");
if (/\.notrat[\\/]tools/.test(String(srv.args[0]))) ABAD("args[0] 指向 ~/.notrat/tools（构建机私有落点，别的机器上不存在）");
else AOK("args[0] 没指向 ~/.notrat/tools");

/* B. 产物机器中立：mcpServers 段一律不许出现盘符路径（整份产物若有，只提示不拦） */
if (ABS_PATH_RE.test(JSON.stringify(m.mcpServers))) ABAD("mcpServers 段里出现盘符路径");
else AOK("mcpServers 段无盘符路径");
const whole = JSON.stringify(m, null, 2);
const elsewhere = [];
{
  const re = /(?:^|[^A-Za-z0-9])[A-Za-z]:[\\/]/g;
  let mm2;
  while ((mm2 = re.exec(whole)) && elsewhere.length < 5) elsewhere.push(JSON.stringify(whole.slice(Math.max(0, mm2.index - 60), mm2.index + 25)));
}
if (elsewhere.length) AWARN("产物其它位置还有盘符路径 " + elsewhere.length + " 处（只提示不拦，逐条列出上下文）：\n      " + elsewhere.join("\n      "));
else AOK("整份产物无盘符路径");

/* C. sidecar 完整 + require 链闭合（这一条专治「漏拷模块导致 server 起不来」） */
const missSide = REQUIRED_SERVER_FILES.filter((f) => !fs.existsSync(path.join(sidecarDir, f)));
if (missSide.length) ABAD("sidecar 缺文件：" + missSide.join(", "));
else AOK("sidecar 齐 " + REQUIRED_SERVER_FILES.length + " 个模块");
if (hasKatex && !fs.existsSync(path.join(sidecarDir, "assets-katex.json"))) ABAD("sidecar 缺 assets-katex.json（latex_asset 会哑）");
else if (hasKatex) AOK("sidecar 含 assets-katex.json");
const reqs = [...new Set((bodies["index.js"].match(/require\("\.\/([^"]+)"\)/g) || []).map((s) => s.replace(/require\("\.\//, "").replace(/"\)$/, "")))];
const missReq = reqs.filter((f) => !fs.existsSync(path.join(sidecarDir, f)));
if (missReq.length) ABAD("index.js 的 require 链断了，缺：" + missReq.join(", ") + " —— 这正是 v0.9.4 / v0.9.6 两次事故");
else AOK("index.js 的 " + reqs.length + " 条 ./ 依赖全部落位（" + reqs.join(", ") + "）");
const sideVer = (bodies["index.js"].match(/^const VERSION = "([^"]*)";/m) || [])[1];
if (sideVer !== m.version) ABAD("sidecar 的 VERSION=" + sideVer + " 与 manifest " + m.version + " 不一致");
else AOK("sidecar VERSION 与 manifest 对齐（" + sideVer + "）");

/* D. 落点必须与宿主公式同形（否则 args 解析出来还是找不到） */
const norm = sidecarDir.replace(/\\/g, "/");
if (norm.endsWith("/.notrat/plugins/" + PLUGIN_ID + "/server")) AOK("sidecar 落点 = <插件目录>/<插件 id>/server（与宿主 pluginDirFor 公式同形）");
else ABAD("sidecar 落点 " + norm + " 与宿主公式 <插件目录>/<插件 id>/server 不同形");
/* 可移植性：落点跟着 home 走（证明它由 home 推导，不是字面量） */
const fakeHomes = ["C:/Users/alice", "D:/home/bob", "/home/carol"];
const fakeDirs = fakeHomes.map((h) => sidecarDirFor(h, PLUGIN_ID).replace(/\\/g, "/"));
const allTracked = fakeDirs.every((d, i) => d.indexOf(fakeHomes[i].replace(/\\/g, "/")) === 0 && d.endsWith("/" + PLUGIN_ID + "/server"));
if (!allTracked || new Set(fakeDirs).size !== fakeDirs.length) ABAD("sidecar 落点没有跟着 home 推导：" + fakeDirs.join(" | "));
else AOK("落点随 home 推导（换机器跟着变）：" + fakeDirs[0]);

/* E. 宿主证据：${pluginDir} 真的会被解析（从装机版 app.asar 的 renderer 里抠实现）
 *    读不到 asar（CI / 没装 Notrat 的机器）就只提示，不拦构建。 */
function hostEvidence() {
  const asar = process.env.NOTRAT_ASAR || "D:/Notrat/resources/app.asar";
  const asarJs = path.join(__dirname, "asar.js");
  if (!fs.existsSync(asar) || !fs.existsSync(asarJs)) return { ok: false, why: "本机没有 Notrat 装机包（app.asar），跳过占位符取证" };
  try {
    const html = execFileSync(process.execPath, [asarJs, "cat", asar, "dist/index.html"], { encoding: "utf8", maxBuffer: 1 << 28 });
    const mm = html.match(/src="\.?\/?(assets\/[^"]+\.js)"/);
    if (!mm) return { ok: false, why: "asar 里找不到 renderer bundle" };
    const tmp = path.join(os.tmpdir(), "notrat-host-renderer-" + process.pid + ".js");
    execFileSync(process.execPath, [asarJs, "save", asar, "dist/" + mm[1], tmp], { stdio: "ignore" });
    const src = fs.readFileSync(tmp, "utf8");
    try { fs.unlinkSync(tmp); } catch (e) {}
    const at = src.indexOf("function pluginDirFor(");
    if (at < 0) return { ok: false, why: "renderer 里找不到 pluginDirFor（宿主改过？）" };
    const win = src.slice(at, at + 1200);   /* 该函数紧邻 resolvePlaceholders，一起看 */
    return {
      ok: true,
      /* 宿主 renderer 里是正则字面量 /\$\{pluginDir\}/g —— 源码文本为转义的 pluginDir\} */
      replaced: win.indexOf("pluginDirFor(") >= 0 && win.indexOf("pluginDir\\}") >= 0,
      fromCache: win.indexOf("pluginsDirCache") >= 0,
      appendsId: /\/\$\{[A-Za-z_$][\w$]*\}/.test(win),
    };
  } catch (e) { return { ok: false, why: "读 asar 失败：" + (e && e.message) }; }
}
const ev = hostEvidence();
if (!ev.ok) AWARN("跳过宿主取证：" + ev.why);
else {
  ev.replaced ? AOK("宿主 renderer 确有 ${pluginDir} → pluginDirFor() 的替换")
              : ABAD("宿主 renderer 里找不到 ${pluginDir} 的替换 —— 这个占位符可能不被解析，别用");
  ev.fromCache ? AOK("pluginDirFor() 从 pluginsDirCache 取插件目录（运行时算，与本机用户名无关）")
               : ABAD("pluginDirFor() 形态不符（未见 pluginsDirCache），须重新核对宿主");
  ev.appendsId ? AOK("宿主公式以 <插件目录>/<插件 id> 结尾，与落点一致")
               : AWARN("宿主公式尾部形态未确认，建议人工核对一次");
}

if (FAIL) { console.error("\n构建失败：" + FAIL + " 条断言未通过 —— 修好再发，别让它带着静默故障出厂。"); process.exit(1); }
console.log("\n断言全通过（" + (ev.ok ? "含宿主取证" : "宿主取证已跳过") + "）。");
