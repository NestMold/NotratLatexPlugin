/* v0.5.0：① 修正两个测试脚本里过期的断言 ② 版本号/描述同步
 *
 * 这三条断言过期了，而且都是"猜的契约"，这次去宿主端取证后按真实契约改：
 *
 * 1) dualView：旧断言要 editors[0].dualView === true（布尔）。
 *    宿主 components/Sidebar/PluginSidebarPanels.tsx#syncPluginEditors 里是：
 *      dualView: Array.isArray(Bn.dualView) && Bn.dualView.length === 2
 *                && Bn.dualView.every(di => typeof di === "string" && di.trim())
 *                ? [Bn.dualView[0], Bn.dualView[1]] : void 0
 *    → 必须是「两个非空字符串的数组」，传 true 只会得到 undefined（双视图静默失效）。
 *
 * 2) settings 占位符：旧断言要求 env 里再双写一套 ${settings:<组名>.<字段名>}（_ALT）。
 *    宿主这里（components/Sidebar/PluginSidebarPanels.tsx / registry 侧）：
 *      resolvePlaceholders 里 replace(/\$\{settings:([^}]+)\}/g, (_, k) => getValue(pluginId, k.trim()))
 *      而设置面板写值走 setValue(settings.key, field.key, value)
 *    → 键就是「字段名」，不含组名。写成 ${settings:latex.compiler} 只会解析成空串。
 *    所以正确形态只有主变量那一套，_ALT 那套纯属噪音，断言应反过来禁止它。
 *
 * 3) hostView：编辑器里的实际标识符是 hostMode（hostView 从没存在过）。
 */
const fs = require("fs");
const path = require("path");
const WS = "E:/notrat-latex-plugin";
const read = (p) => fs.readFileSync(path.join(WS, p), "utf8");
const write = (p, s) => fs.writeFileSync(path.join(WS, p), s);

function rep(p, from, to, label) {
  let s = read(p);
  if (s.indexOf(to) >= 0 && s.indexOf(from) < 0) return console.log("  = " + label + " 已是目标形态");
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(label + " 锚点不唯一(" + n + ")");
  write(p, s.replace(from, to));
  console.log("  ✓ " + label);
}

/* ---------------- 1. verify-v040.js ---------------- */
{
  const p = ".setup/verify-v040.js";
  rep(
    p,
    'ok(m.version === "0.4.1", "version = 0.4.1", m.version);',
    [
      "/* 版本不再写死：以工作区 manifest.json 为准（写死过一次 0.4.1，结果测试一直红着没人管） */",
      'const wsVersion = JSON.parse(fs.readFileSync(path.join(WS, "manifest.json"), "utf8")).version;',
      'ok(m.version === wsVersion, "部署包版本 = 工作区 manifest 版本（" + wsVersion + "）", m.version);',
    ].join("\n"),
    "verify-v040：版本断言改成与工作区 manifest 对齐"
  );

  rep(
    p,
    'ok(c.editors && c.editors[0].dualView === true, "editors[0].dualView = true（源码/可视化双视图）");',
    [
      "/* 宿主真实契约：dualView 必须是两个非空字符串的数组（布尔会被丢掉 -> 双视图失效） */",
      "const dv = (c.editors && c.editors[0] && c.editors[0].dualView) || null;",
      'ok(Array.isArray(dv) && dv.length === 2 && dv.every(function (x) { return typeof x === "string" && x.trim(); }),',
      '   "editors[0].dualView = [标签1, 标签2]（宿主只认双元素字符串数组）", JSON.stringify(dv));',
    ].join("\n"),
    "verify-v040：dualView 断言改成宿主真实契约（双元素数组）"
  );

  rep(
    p,
    [
      "const envKeys = Object.keys(srv.env || {});",
      'const prim = envKeys.filter(function (k) { return !/_ALT$/.test(k); });',
      'const alts = envKeys.filter(function (k) { return /_ALT$/.test(k); });',
      'ok(prim.length === 5 && alts.length === 5, "env 双写声明 5 组（主 + _ALT）", envKeys.length + " 个变量");',
      "ok(",
      '  prim.every(function (k) { return /^\\$\\{settings:[a-zA-Z]+\\}$/.test(srv.env[k]); }),',
      '  "主变量形如 ${settings:<字段名>}（官方新文档写法）"',
      ");",
      "ok(",
      '  alts.every(function (k) { return /^\\$\\{settings:[a-zA-Z]+\\.[a-zA-Z]+\\}$/.test(srv.env[k]); }),',
      '  "_ALT 形如 ${settings:<组名>.<字段名>}（旧 Wiki 写法，双写兜底）"',
      ");",
    ].join("\n"),
    [
      "/* 宿主解析占位符：${settings:<字段名>} -> getValue(pluginId, 字段名)；",
      " * 设置面板写值 setValue(settings.key, field.key, value) -> 键是裸字段名。",
      " * 所以只认裸字段名形态，带组名的 ${settings:组.字段} 只会解析成空串（噪音，明确禁止）。 */",
      "const envKeys = Object.keys(srv.env || {});",
      'ok(envKeys.length === 5, "env 恰好 5 个变量", envKeys.join(", "));',
      "ok(",
      '  envKeys.every(function (k) { return /^\\$\\{settings:[a-zA-Z]+\\}$/.test(srv.env[k]); }),',
      '  "env 全部形如 ${settings:<字段名>}（裸字段名，宿主才解析得到）",',
      "  JSON.stringify(srv.env)",
      ");",
      'ok(!envKeys.some(function (k) { return /_ALT$/.test(k); }), "无 _ALT 双写残留（带组名的写法解析为空串）");',
    ].join("\n"),
    "verify-v040：settings 占位符断言改成宿主真实契约（裸字段名，禁止 _ALT）"
  );

  rep(
    p,
    'ok(fs.readFileSync(path.join(WS, "panels/editor.tsx"), "utf8").indexOf("hostView") > 0, "工作区编辑器含 dualView 视图联动补丁（hostView）");',
    'ok(fs.readFileSync(path.join(WS, "panels/editor.tsx"), "utf8").indexOf("hostMode") > 0, "工作区编辑器含 dualView 视图联动补丁（hostMode）");',
    "verify-v040：hostView -> hostMode（编辑器里的真实标识符）"
  );
}

/* ---------------- 2. test-activefile.js ---------------- */
{
  const p = ".setup/test-activefile.js";
  rep(
    p,
    'ok(pkg.version === "0.4.1", "部署包版本 = 0.4.1", pkg.version);',
    'ok(pkg.version === JSON.parse(fs.readFileSync(path.join(WS, "manifest.json"), "utf8")).version, "部署包版本 = 工作区 manifest 版本", pkg.version);',
    "test-activefile：版本断言改成与工作区 manifest 对齐"
  );
}

/* ---------------- 3. 版本号 + 描述 ---------------- */
{
  const p = "manifest.json";
  let s = read(p);
  const before = s;
  s = s.replace('"version": "0.4.2"', '"version": "0.5.0"');
  s = s.replace(
    /"description": "[^"]*"/,
    '"description": "科研写作向的 LaTeX 插件：.tex 由插件编辑器接管（源码/可视化双视图、语法高亮、编译、校验）；左侧「章节大纲」是可点击的章节树——图表公式带题注进树、点击跳回源码并高亮、跟随光标自动定位当前节、支持过滤与折叠；另有编辑器顶部控制带、标签栏徽章、悬浮器、状态栏、LaTeX 代码块渲染器与编译前自动快照。"'
  );
  if (s !== before) { write(p, s); console.log("  ✓ manifest.json -> 0.5.0 + 新描述"); }
}

{
  const p = ".setup/build-singlefile.js";
  let s = read(p);
  const before = s;
  s = s.replace('const VERSION = "0.4.2";', 'const VERSION = "0.5.0";');
  if (s !== before) { write(p, s); console.log("  ✓ build-singlefile.js VERSION -> 0.5.0"); }
}

console.log("\ndone");
