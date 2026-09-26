/* 验收脚本：对【已部署的单文件插件包】做静态体检
 *
 * 1) manifest 结构：id/version/type/manifestVersion、mcpServers 数组形态、args 指向真实文件
 * 2) 新贡献面是否齐全：dualView / outline / editor-header / editor-tabs / widget /
 *    status-bar / activity-bar / sidebar-input / renderers / toolHooks
 * 3) 全部内联源码（editors / renderers / ui）：
 *    · 不含 module.exports（0.3.0 事故根因）
 *    · 编辑器/渲染器含 LPC 预览内核
 *    · 批量交给 esbuild(tsx, automatic JSX) 真转译 —— 语法体检
 * 4) MCP server 侧文件是否已同步到 ~/.notrat/tools/
 * 5) 冒烟：tools/list 必须列出 8 个工具
 * 6) 工作区源码 ↔ 部署产物 字节一致性
 *
 * ⚠ 结尾用 process.exitCode 而非 process.exit()：后者在管道/重定向下会截断未 flush 的 stdout。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const HOME = os.homedir();
const PKG = path.join(HOME, ".notrat", "plugins", "notrat-latex-plugin.json");
const TOOLS = path.join(HOME, ".notrat", "tools");
const WS = "E:/notrat-latex-plugin";

let pass = 0;
let fail = 0;
function ok(cond, msg, extra) {
  if (cond) {
    pass++;
    console.log("  \u2713 " + msg);
  } else {
    fail++;
    console.log("  \u2717 " + msg + (extra ? "  \u2192 " + String(extra).split("\n")[0] : ""));
  }
}

console.log("== 1. manifest 结构 ==");
const m = JSON.parse(fs.readFileSync(PKG, "utf8"));
ok(m.id === "notrat-latex-plugin", "id = notrat-latex-plugin");
/* 版本不再写死：以工作区 manifest.json 为准（写死过一次 0.4.1，结果测试一直红着没人管） */
const wsVersion = JSON.parse(fs.readFileSync(path.join(WS, "manifest.json"), "utf8")).version;
ok(m.version === wsVersion, "部署包版本 = 工作区 manifest 版本（" + wsVersion + "）", m.version);
ok(m.manifestVersion === 2, "manifestVersion = 2");
ok(m.type === "plugin", "type = plugin");
ok(Array.isArray(m.mcpServers), "mcpServers 是数组形态（防 0.2.3 事故）");
const srv = m.mcpServers[0];
ok(!!srv && srv.transport === "stdio" && /latex-server\.js$/.test(srv.args[0]), "server args 指向 latex-server.js");
ok(fs.existsSync(srv.args[0]), "server 脚本文件存在", srv.args[0]);
/* 宿主解析占位符：${settings:<字段名>} -> getValue(pluginId, 字段名)；
 * 设置面板写值 setValue(settings.key, field.key, value) -> 键是裸字段名。
 * 所以只认裸字段名形态，带组名的 ${settings:组.字段} 只会解析成空串（噪音，明确禁止）。 */
const envKeys = Object.keys(srv.env || {});
ok(envKeys.length === 5, "env 恰好 5 个变量", envKeys.join(", "));
ok(
  envKeys.every(function (k) { return /^\$\{settings:[a-zA-Z]+\}$/.test(srv.env[k]); }),
  "env 全部形如 ${settings:<字段名>}（裸字段名，宿主才解析得到）",
  JSON.stringify(srv.env)
);
ok(!envKeys.some(function (k) { return /_ALT$/.test(k); }), "无 _ALT 双写残留（带组名的写法解析为空串）");

console.log("\n== 2. 新贡献面齐备 ==");
const c = m.contributions;
const locs = (c.ui || []).map(function (u) { return u.location; });
["right-panel", "page", "outline", "editor-header", "editor-tabs", "widget", "status-bar", "activity-bar", "sidebar-input"].forEach(function (L) {
  ok(locs.indexOf(L) >= 0, 'ui.location "' + L + '" 已挂载');
});
/* 宿主真实契约：dualView 必须是两个非空字符串的数组（布尔会被丢掉 -> 双视图失效） */
const dv = (c.editors && c.editors[0] && c.editors[0].dualView) || null;
ok(Array.isArray(dv) && dv.length === 2 && dv.every(function (x) { return typeof x === "string" && x.trim(); }),
   "editors[0].dualView = [标签1, 标签2]（宿主只认双元素字符串数组）", JSON.stringify(dv));
ok(Array.isArray(c.renderers) && c.renderers[0].nodeType === "markdown/code", "renderers: markdown/code 已声明");
ok(Array.isArray(c.toolHooks) && c.toolHooks[0].on === "pre" && c.toolHooks[0].toolPattern === "latex_compile", "toolHooks: 编译前 pre 钩子");
ok((c.commands || []).length === 6, "6 条 slash 命令", String((c.commands || []).length));
ok((c.commands || []).every(function (x) { return !!x.name && !!x.tool; }), "命令均带 name + tool（新命名规范）");
ok((c.fileTreeMenus || []).some(function (x) { return x.folders === true; }), "FileTree 菜单覆盖文件夹（folders: true）");
ok((c.fileTreeMenus || []).some(function (x) { return !!x.uiKey; }), "FileTree 菜单可打开整页面板（uiKey）");
ok((c.settings || []).length === 1 && (c.settings[0].fields || []).length === 5, "设置面板 5 个字段");
ok(!/sourceFile/.test(JSON.stringify(m)), "部署 manifest 无残留 sourceFile（全部已内联）");

console.log("\n== 3. 内联源码静态体检 ==");
const sources = [];
(c.editors || []).forEach(function (e) { sources.push(["editors__" + e.id, e.source, true]); });
(c.renderers || []).forEach(function (r) { sources.push(["renderers__" + r.id, r.source, true]); });
(c.ui || []).forEach(function (u) {
  if (u.content && u.content.source) sources.push(["ui__" + u.id, u.content.source, false]);
});
ok(sources.length === 9, "共 9 份内联源码（1 编辑器 + 1 渲染器 + 7 面板）", String(sources.length));

const dir = path.join(WS, ".setup/check/deployed");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const written = [];
for (let i = 0; i < sources.length; i++) {
  const label = sources[i][0];
  const src = sources[i][1];
  const needLpc = sources[i][2];
  if (typeof src !== "string" || !src) {
    ok(false, label + " 内联源码存在（疑似 sourceFile 未内联：部署包被目录态 manifest.json 覆盖过）", "source=" + typeof src + " | 修复: node .setup/build-singlefile.js");
    continue;
  }
  ok(!src.includes("module.exports"), label + " 无 module.exports 残留");
  ok(/export default/.test(src), label + " 含 default 导出");
  if (needLpc) ok(/const LPC = \{ renderPreview/.test(src), label + " 已注入 preview-core 内核");
  const f = path.join(dir, label + ".tsx");
  fs.writeFileSync(f, src, "utf8");
  written.push(f);
}
try {
  const args = ["--no-install", "esbuild"].concat(written).concat([
    "--loader:.tsx=tsx",
    "--jsx=automatic",
    "--format=esm",
    "--outdir=" + dir + "-out",
    "--log-level=warning",
  ]);
  cp.execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", args, {
    cwd: WS,
    stdio: "pipe",
    shell: process.platform === "win32",
  });
  ok(true, "9 份内联源码 esbuild(tsx / automatic JSX) 批量转译通过");
} catch (e) {
  ok(false, "9 份内联源码 esbuild 批量转译通过", (e.stderr && e.stderr.toString()) || e.message);
}

console.log("\n== 4. MCP server 侧文件 ==");
ok(fs.existsSync(path.join(TOOLS, "latex-server.js")), "~/.notrat/tools/latex-server.js 已同步");
ok(fs.existsSync(path.join(TOOLS, "contrib.js")), "~/.notrat/tools/contrib.js 已同步（v0.4.0 新增）");
ok(fs.existsSync(path.join(TOOLS, "assets-katex.json")), "~/.notrat/tools/assets-katex.json 已同步");
const serverSrc = fs.readFileSync(path.join(TOOLS, "latex-server.js"), "utf8");
ok(/require\("\.\/contrib\.js"\)/.test(serverSrc), "server 已 require contrib.js");
ok(/CONTRIB\.envReal\("LATEX_COMPILER"\)/.test(serverSrc), "编译器读取走 envReal（双写兼容 + 未替换占位符回落）");
ok(!/module\.exports/.test(serverSrc), "server 无 module.exports");

console.log("\n== 5. 冒烟：tools/list ==");
const reqs =
  JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } }) +
  "\n" +
  JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) +
  "\n";
const out = cp.execFileSync("node", [path.join(TOOLS, "latex-server.js")], { input: reqs, encoding: "utf8" });
const lines = out.trim().split("\n").map(function (l) { return JSON.parse(l); });
const t2 = lines.filter(function (x) { return x.id === 2; })[0];
const names = ((t2 && t2.result && t2.result.tools) || []).map(function (t) { return t.name; });
ok(names.length === 8, "工具数 = 8", names.join(", "));
["latex_parse", "latex_validate", "latex_compile", "latex_asset", "latex_outline", "latex_status", "latex_backup", "latex_history"].forEach(function (w) {
  ok(names.indexOf(w) >= 0, "工具 " + w + " 已注册");
});

console.log("\n== 6. 工作区源码 ↔ 部署产物 ==");
ok(fs.readFileSync(path.join(WS, "server/index.js"), "utf8") === serverSrc, "server/index.js 与部署 latex-server.js 字节一致");
ok(
  fs.readFileSync(path.join(WS, "server/contrib.js"), "utf8") === fs.readFileSync(path.join(TOOLS, "contrib.js"), "utf8"),
  "contrib.js 与部署副本字节一致"
);
ok(fs.readFileSync(path.join(WS, "panels/editor.tsx"), "utf8").indexOf("hostMode") > 0, "工作区编辑器含 dualView 视图联动补丁（hostMode）");
ok(typeof require(path.join(WS, "server/contrib.js")).envReal === "function", "contrib.js 导出 envReal");

console.log("\n" + (fail === 0 ? "\u2705 全部通过：" + pass + " 项" : "\u274c " + fail + " 项未通过（共 " + (pass + fail) + " 项）"));
process.exitCode = fail ? 1 : 0;
