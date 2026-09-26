/* 验收脚本 v0.6.1：对【已部署的单文件插件包】做静态体检
 *
 * 本版收敛目标（用户要求）：只保留「编辑器 + 大纲」，其余贡献面一律移除。
 * 因此除了常规结构检查，还要**反向断言**那些贡献面确实不存在了。
 *
 * 1) manifest 结构：id / version / type / manifestVersion / mcpServers 数组形态 / args 指向真实文件
 * 2) 白名单：contributions 只能有 editors + ui + settings；renderers / commands /
 *    promptSections / toolHooks / fileTreeMenus 必须缺席
 * 3) UI 面：有且仅有 1 个挂载位，location=outline，extensions=["tex"]
 * 4) 编辑器：extensions=["tex"]、dualView 二元中文、outlineTool 指向真在的工具
 * 5) 全部内联源码：不含 module.exports、含 default 导出、编辑器已注入 preview-core
 * 6) esbuild(tsx / automatic JSX) 真转译 —— 语法体检
 * 7) workspace 源码 ↔ 部署内联源码 逐字节一致（防「改了源码没重新打包」）
 * 8) MCP server 文件已同步到 ~/.notrat/tools/
 * 9) 冒烟：tools/list 8 个工具；latex_outline 双通路（面板 list 协议 / 宿主 level|text|anchor）
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
  if (cond) { pass++; console.log("  \u2713 " + msg); }
  else { fail++; console.log("  \u2717 " + msg + (extra ? "  \u2192 " + String(extra).split("\n")[0] : "")); }
}
function section(t) { console.log("\n== " + t + " =="); }

const m = JSON.parse(fs.readFileSync(PKG, "utf8"));
const c = m.contributions || {};

section("1. manifest 结构");
ok(m.id === "notrat-latex-plugin", "id = notrat-latex-plugin");
const wsManifest = JSON.parse(fs.readFileSync(path.join(WS, "manifest.json"), "utf8"));
ok(m.version === wsManifest.version, "部署包版本 = 工作区 manifest 版本（" + wsManifest.version + "）", m.version);
ok(m.manifestVersion === 2, "manifestVersion = 2");
ok(m.type === "plugin", "type = plugin");
ok(m.enabled === true, "enabled = true");
ok(Array.isArray(m.mcpServers), "mcpServers 是数组形态（对象形态会让宿主 enable() 崩）");
ok(m.mcpServers.length === 1 && m.mcpServers[0].id === "latex", "恰好 1 个 server：latex");
const srvArg = (m.mcpServers[0].args || [])[0] || "";
ok(fs.existsSync(srvArg), "server args 指向真实存在的文件", srvArg);
ok(!/\\/.test(srvArg), "server 路径已转正斜杠（Windows 反斜杠会被转义吞掉）", srvArg);

section("2. 贡献面白名单：只留编辑器 + 大纲");
const facets = Object.keys(c).sort();
ok(JSON.stringify(facets) === JSON.stringify(["editors", "fileTreeMenus", "settings", "ui"]), "contributions 仅 editors/fileTreeMenus/settings/ui", facets.join(","));
for (const gone of ["renderers", "commands", "promptSections", "toolHooks", "sidebar"]) {
  ok(!(gone in c), "已移除贡献面：" + gone);
}

section("3. UI 挂载位：有且仅有大纲（划词助手已按需求移除）");
ok(Array.isArray(c.ui) && c.ui.length === 1, "ui 恰好 1 项（不再有 right-panel 划词助手）", "实得 " + (c.ui || []).length);
const ou = (c.ui || [])[0] || {};
ok(ou.location === "outline", "location = outline（左侧大纲面板）", ou.location);
ok(JSON.stringify(ou.extensions) === JSON.stringify(["tex"]), 'extensions = ["tex"]（只在 .tex 上出现）', JSON.stringify(ou.extensions));
ok(!!(ou.content && ou.content.source), "大纲面板源码已内联");
ok(!ou.content || !ou.content.sourceFile, "sourceFile 已被 build 消费（不应残留）");
for (const bad of ["right-panel", "page", "widget", "activity-bar", "status-bar", "editor-tabs", "editor-header", "sidebar-input", "messages-top", "popup", "floating", "sidebar-toolbar"]) {
  ok(!(c.ui || []).some((u) => u.location === bad), "已移除挂载位：" + bad);
}

section("4. 编辑器声明");
ok(Array.isArray(c.editors) && c.editors.length === 1, "editors 恰好 1 项");
const ed = (c.editors || [])[0] || {};
ok(ed.id === "latex-editor", "editor id = latex-editor");
ok(JSON.stringify(ed.extensions) === JSON.stringify(["tex"]), '接管扩展名 ["tex"]');
ok(Array.isArray(ed.dualView) && ed.dualView.length === 2 && ed.dualView.every((x) => typeof x === "string" && x.trim()),
  'dualView 是 2 个非空字符串（["' + (ed.dualView || []).join('","') + '"]）');
ok(ed.dualView[0] === "可视化" && ed.dualView[1] === "源码", "dualView = [可视化, 源码]（第一个对应 props.mode=wysiwyg）");
ok(ed.outlineTool === "latex_outline", "outlineTool = latex_outline", ed.outlineTool);
ok(!!ed.source, "编辑器源码已内联");
const edSrc = ed.source || "";
ok(edSrc.includes('addEventListener("notrat-outline-navigate"'), "编辑器已监听 notrat-outline-navigate（宿主大纲点击 → 定位）");
ok(/d\.anchor/.test(edSrc), "监听里消费 detail.anchor");
ok(/pluginId/.test(edSrc), "监听里按 pluginId 过滤（不抢别家插件的大纲事件）");
ok(/props\.mode/.test(edSrc) && /onModeSwitch/.test(edSrc), "双视图走权威契约 props.mode / props.onModeSwitch");

section("4.5 fileTreeMenus：.tex 右键编译 / 校验");
const ftm = c.fileTreeMenus || [];
ok(Array.isArray(ftm) && ftm.length === 2, "fileTreeMenus 恰好 2 项", "实得 " + ftm.length);
ok(ftm.every((x) => JSON.stringify(x.extensions) === JSON.stringify(["tex"])), '菜单项都限定 extensions = ["tex"]');
ok(ftm.every((x) => !!x.tool), "菜单项都走 tool（直调 MCP 工具，args 自动带 filePath / fileName）");
ok(!ftm.some((x) => x.uiKey), "菜单项未使用 uiKey（因此不需要 page 挂载位）");
const srvSrc = fs.readFileSync(path.join(WS, "server", "index.js"), "utf8");
for (const x of ftm) ok(srvSrc.includes('name: "' + x.tool + '"'), "菜单 → 工具 " + x.tool + " 在 server 中有定义");
ok(srvSrc.includes("args.path || args.filePath"), "server 已兼容宿主注入的 filePath（否则右键会静默编译错文件）");
ok(ftm.some((x) => x.tool === "latex_compile"), "含编译项");
ok(ftm.some((x) => x.tool === "latex_validate"), "含校验项");

section("5. 内联源码静态体检");
const srcs = [["editors[0]", edSrc, true], ["ui[outline]", (ou.content || {}).source || "", false]];
for (const [label, src, needLpc] of srcs) {
  ok(!!src, label + " 源码存在");
  ok(!src.includes("module.exports"), label + " 无 module.exports 残留（0.3.0 事故根因）");
  ok(/export default/.test(src), label + " 含 default 导出");
  if (needLpc) ok(/const LPC = \{ renderPreview/.test(src), label + " 已注入 preview-core 预览内核");
}

section("6. esbuild 真转译");
const dir = path.join(WS, ".setup", "check-v052");
fs.mkdirSync(dir, { recursive: true });
const written = [];
for (const [label, src] of srcs) {
  const f = path.join(dir, label.replace(/[[\]]/g, "_") + ".tsx");
  fs.writeFileSync(f, src, "utf8");
  written.push(f);
}
try {
  cp.execFileSync(process.platform === "win32" ? "npx.cmd" : "npx",
    ["--no-install", "esbuild"].concat(written).concat([
      "--loader:.tsx=tsx", "--jsx=automatic", "--format=esm",
      "--outdir=" + dir + "-out", "--log-level=warning",
    ]),
    { cwd: WS, stdio: "pipe", shell: process.platform === "win32" });
  ok(true, written.length + " 份内联源码 esbuild(tsx / automatic JSX) 转译通过");
} catch (e) {
  ok(false, "esbuild 转译通过", (e.stderr && e.stderr.toString()) || e.message);
}

section("7. 工作区源码 ↔ 部署产物 字节一致");
{
  const core0 = fs.readFileSync(path.join(WS, "server", "preview-core.js"), "utf8");
  const core = core0.replace(/^module\.exports\s*=\s*\{[^}]*\};?[^\S\n]*$/m, "const LPC = { renderPreview: renderPreview, miniMath: miniMath };");
  const tok = "/*" + "__LPC__" + "*/";
  /* 与 build-singlefile.js 的 inline() **逐条对齐**：LPC 与 WYS 两个占位都要替换。
   * 之前只替了 LPC —— v0.7.0 引入 __WYS__ 之后这条断言就恒假了：
   * 它测的不再是「改了源码没重新打包」，而是「build 的内联规则是什么」。
   * 断言本意（防源码/产物漂移）不变，只是得用同一套转换来比。 */
  const wysRaw0 = fs.readFileSync(path.join(WS, "server", "wysiwyg.js"), "utf8");
  const wysBody0 = wysRaw0.replace(/^module\.exports\s*=\s*\{([^}]*)\};?[^\S\n]*$/m, "return {$1};");
  const wysSrc0 = "const WYS = (function () {\n" + wysBody0 + "\n})();";
  const tokW = "/*" + "__WYS__" + "*/";
  const inline = (s) => s.split(tok).join(core).split(tokW).join(wysSrc0);
  const wsEditor = inline(fs.readFileSync(path.join(WS, "panels", "editor.tsx"), "utf8"));
  const wsOutline = fs.readFileSync(path.join(WS, "panels", "outline.tsx"), "utf8");
  ok(edSrc === wsEditor, "editors[0].source ≡ panels/editor.tsx + preview-core（" + edSrc.length + " 字符）");
  ok((ou.content || {}).source === wsOutline, "ui[outline].source ≡ panels/outline.tsx（" + wsOutline.length + " 字符）");
  /* v0.6.1：这三条是「只有真跑才暴露」的行为修复，静态只钉实现特征，行为交给 test-nav.js */
  ok(/pendingReveal\.current = \{ ln: ln/.test(edSrc), "gotoLine 跳不成时挂 pendingReveal（等 DOM 就绪补跳）");
  ok(/if \(!ok\) return;/.test(edSrc), "只有真的跳了才回 ACK（回早了会让面板兜底失效）");
  ok(/function ackReveal\(ln, nonce\)/.test(edSrc), "ACK 统一走 ackReveal（补跳成后也能补发回执）");
  ok(!/outline\.length > 0/.test(edSrc), "编辑器内不再内嵌大纲列（宽 150 那一列已删）");
  ok(!/const outline = useMemo/.test(edSrc) && !/SEC_LV/.test(edSrc), "编辑器不再派生大纲数据（死代码已清）");
  const wsNav = fs.readFileSync(path.join(WS, "panels", "outline.tsx"), "utf8");
  ok(/RETRY_DELAYS = \[170, 700, 1500\]/.test(wsNav), "大纲面板兜底重试 3 拍（打开文件 + 挂载需要时间）");
  ok(/indexOf\(nonce\) !== 0/.test(wsNav), "回执按 nonce 前缀配对（重试轮次也能认出来）");
  const unusedSel = path.join(WS, "panels", "_unused", "selection.tsx");
  ok(fs.existsSync(unusedSel), "划词助手源码已归档 panels/_unused/（要接回只需加回 manifest 一条）");
  ok(fs.existsSync(unusedSel) && fs.readFileSync(unusedSel, "utf8").length > 5000, "归档内容完整（>5KB）");
  ok(!(c.ui || []).some((u) => u.location === "right-panel"), "部署包内确实没有 right-panel 划词助手");
}

section("8. MCP server 侧文件同步");
for (const f of ["latex-server.js", "contrib.js", "assets-katex.json"]) {
  ok(fs.existsSync(path.join(TOOLS, f)), "~/.notrat/tools/" + f + " 已同步");
}
/* build 会把 index.js 的 VERSION 常量对齐到 manifest.version（顺带抹掉行尾注释），
 * 所以这里必须**先施加同一条改写**再逐字节比 —— 否则测的是「build 改了什么」，
 * 而不是「源码同步过去没有」。 */
const verAlign = (s) => s.replace(/^const VERSION = "[^"]*";.*$/m, 'const VERSION = "' + wsManifest.version + '";');
ok(verAlign(fs.readFileSync(path.join(TOOLS, "latex-server.js"), "utf8")) === verAlign(fs.readFileSync(path.join(WS, "server", "index.js"), "utf8")),
  "latex-server.js ≡ server/index.js（字节一致，已对齐 build 的版本号改写）");
ok(fs.readFileSync(path.join(TOOLS, "contrib.js"), "utf8") === fs.readFileSync(path.join(WS, "server", "contrib.js"), "utf8"),
  "tools/contrib.js ≡ server/contrib.js（字节一致）");

section("9. 冒烟：工具表 + 大纲双通路");
{
  const res = cp.spawnSync("node", [path.join(WS, ".setup", "test-v052.js")], {
    cwd: WS, env: { ...process.env, WS_ROOT: WS }, encoding: "utf8", timeout: 60000,
  });
  const out = (res.stdout || "") + (res.stderr || "");
  const mm = /结果: (\d+) 通过 \/ (\d+) 失败/.exec(out);
  ok(res.status === 0 && mm, "test-v052.js 全绿", mm ? out.split("\n").slice(-8).join(" | ") : out.slice(0, 300));
  if (mm) { pass += Number(mm[1]); fail += Number(mm[2]); console.log("  （子测试 " + mm[1] + " 通过 / " + mm[2] + " 失败，已并入总分）"); }

  /* v0.6.1 新增：跳转链路不是静态能验的，得真渲染 editor.tsx 派发事件看行为 */
  const resNav = cp.spawnSync("node", [path.join(WS, ".setup", "test-nav.js")], { cwd: WS, encoding: "utf8", timeout: 120000 });
  const outNav = (resNav.stdout || "") + (resNav.stderr || "");
  const mNav = /全部通过：(\d+) 项/.exec(outNav);
  const fNav = /❌ (\d+) 项未通过/.exec(outNav);
  ok(resNav.status === 0 && mNav, "test-nav.js 全绿（点大纲 → 跳到对应行，真渲染）", mNav ? outNav.split("\n").slice(-4).join(" | ") : outNav.slice(-400));
  if (mNav) { pass += Number(mNav[1]); fail += Number(fNav ? fNav[1] : 0); console.log("  （子测试 " + mNav[1] + " 通过 / " + (fNav ? fNav[1] : 0) + " 失败，已并入总分）"); }

  /* 活动文件桥（生产者广播 + 消费面板接线），v0.6.1 起并进门里防它再次腐烂 */
  const resAf = cp.spawnSync("node", [path.join(WS, ".setup", "test-activefile.js")], { cwd: WS, encoding: "utf8", timeout: 120000 });
  const outAf = (resAf.stdout || "") + (resAf.stderr || "");
  const mAf = /全部通过：(\d+) 项/.exec(outAf);
  const fAf = /❌ (\d+) 项未通过/.exec(outAf);
  ok(resAf.status === 0 && mAf, "test-activefile.js 全绿（活动文件桥）", mAf ? outAf.split("\n").slice(-3).join(" | ") : outAf.slice(-400));
  if (mAf) { pass += Number(mAf[1]); fail += Number(fAf ? fAf[1] : 0); console.log("  （子测试 " + mAf[1] + " 通过 / " + (fAf ? fAf[1] : 0) + " 失败，已并入总分）"); }
}

console.log("\n=== 验收结果: " + pass + " 通过 / " + fail + " 失败 ===");
console.log("部署包: " + PKG + "  " + (fs.statSync(PKG).size / 1024).toFixed(1) + "KB");
process.exitCode = fail ? 1 : 0;
