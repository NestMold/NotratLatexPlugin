/* v0.6.0 补丁：fileTreeMenus 通路 + 验收断言放宽
 *
 * 【为什么必须改 server】
 * 宿主 fileTreeMenus 点击时自动注入 filePath / fileName（§3.8），**不传 path**。
 * 而 latex_parse / latex_validate / latex_compile / latex_status / latex_history
 * 都只取 args.path —— 不兼容的后果不是报错，而是 resolveInput(undefined) 静默
 * 走「自动发现主 .tex」：右键 test.tex，结果编译了 sample.tex。必须显式兼容。
 *
 * 【为什么必须改 verify】
 * verify-v052.js 里有一条上一轮收敛时写死的反向断言：
 *   contributions 只允许 editors + ui + settings（fileTreeMenus 必须缺席）
 *   ui 面「有且仅有 1 个」（right-panel 必须缺席）
 * 本轮按用户要求新增这两个贡献面，断言需同步放宽 —— 但放宽不等于放弃：
 * 改为「正向断言新增面 + 仍反向断言其余挂载位缺席」。
 */
const fs = require("fs");
const path = require("path");
const WS = "E:/notrat-latex-plugin";

/* ================= 1. server/index.js：filePath 兼容 ================= */
{
  const p = path.join(WS, "server", "index.js");
  let s = fs.readFileSync(p, "utf8");

  // 5 处工具入口（4 空格缩进，throw 形式）
  const A =
    "    const file = resolveInput(args.path, ws);\n" +
    '    if (!file) throw new Error(`未找到 .tex 文件（输入: ${args.path || "(自动发现)"}，工作区: ${ws || "无"}）`);';
  const B =
    "    const input = args.path || args.filePath;\n" +
    "    const file = resolveInput(input, ws);\n" +
    '    if (!file) throw new Error(`未找到 .tex 文件（输入: ${input || "(自动发现)"}，工作区: ${ws || "无"}）`);';

  // 1 处 backup（6 空格缩进，不抛错）
  const C = "      const file = resolveInput(args.path, ws);";
  const D = "      const file = resolveInput(args.path || args.filePath, ws);";

  let nA = 0;
  let nC = 0;
  while (s.includes(A)) {
    s = s.replace(A, B);
    nA++;
  }
  while (s.includes(C)) {
    s = s.replace(C, D);
    nC++;
  }

  if (nA === 0 && nC === 0) {
    console.log("  ! server/index.js 已是 filePath 兼容（幂等，跳过）");
  } else if (nA + nC < 5) {
    console.error("  ✗ 替换数量异常：只命中 " + (nA + nC) + " 处（预期 >= 5），已中止，文件未写盘");
    process.exit(1);
  } else {
    fs.writeFileSync(p, s);
    console.log("  ✓ server/index.js：throw 形式工具入口 ×" + nA + "、backup 快照 ×" + nC + " 已加 filePath 兼容");
  }
}

/* ================= 2. verify-v052.js：断言同步 ================= */
{
  const p = path.join(WS, ".setup", "verify-v052.js");
  let s = fs.readFileSync(p, "utf8");
  let n = 0;
  function rep(a, b, label) {
    if (!s.includes(a)) {
      console.error("  ✗ 未找到锚点：" + label);
      process.exit(1);
    }
    s = s.split(a).join(b);
    n++;
  }

  // 2-1 白名单：fileTreeMenus 从「必须缺席」移入允许集合
  rep(
    'ok(JSON.stringify(facets) === JSON.stringify(["editors", "settings", "ui"]), "contributions 仅 editors/settings/ui", facets.join(","));',
    'ok(JSON.stringify(facets) === JSON.stringify(["editors", "fileTreeMenus", "settings", "ui"]), "contributions 仅 editors/fileTreeMenus/settings/ui", facets.join(","));',
    "白名单断言"
  );
  rep(
    'for (const gone of ["renderers", "commands", "promptSections", "toolHooks", "fileTreeMenus", "sidebar"]) {',
    'for (const gone of ["renderers", "commands", "promptSections", "toolHooks", "sidebar"]) {',
    "缺席列表"
  );

  // 2-2 第 3 节：ui 从「仅有大纲」放宽为「大纲 + 划词助手」，其余挂载位仍须缺席
  const sec3Old = [
    'section("3. UI 挂载位：有且仅有大纲");',
    'ok(Array.isArray(c.ui) && c.ui.length === 1, "ui 恰好 1 项", "实得 " + (c.ui || []).length);',
    "const ou = (c.ui || [])[0] || {};",
    'ok(ou.location === "outline", "location = outline（左侧大纲面板）", ou.location);',
    'ok(JSON.stringify(ou.extensions) === JSON.stringify(["tex"]), \'extensions = ["tex"]（只在 .tex 上出现）\', JSON.stringify(ou.extensions));',
    'ok(!!(ou.content && ou.content.source), "大纲面板源码已内联");',
    'ok(!ou.content || !ou.content.sourceFile, "sourceFile 已被 build 消费（不应残留）");',
    'for (const bad of ["page", "widget", "activity-bar", "status-bar", "editor-tabs", "editor-header", "right-panel", "sidebar-input", "messages-top", "popup", "floating", "sidebar-toolbar"]) {',
    '  ok(!(c.ui || []).some((u) => u.location === bad), "已移除挂载位：" + bad);',
    "}",
  ].join("\n");

  const sec3New = [
    'section("3. UI 挂载位：大纲 + 划词助手");',
    'ok(Array.isArray(c.ui) && c.ui.length === 2, "ui 恰好 2 项", "实得 " + (c.ui || []).length);',
    'const ou = (c.ui || []).find((u) => u.location === "outline") || {};',
    'const su = (c.ui || []).find((u) => u.location === "right-panel") || {};',
    'ok(ou.location === "outline", "存在 location = outline（左侧大纲面板）", ou.location);',
    'ok(JSON.stringify(ou.extensions) === JSON.stringify(["tex"]), \'outline 的 extensions = ["tex"]\', JSON.stringify(ou.extensions));',
    'ok(!!(ou.content && ou.content.source), "大纲面板源码已内联");',
    'ok(!ou.content || !ou.content.sourceFile, "outline 的 sourceFile 已被 build 消费");',
    'ok(su.id === "latex-selection", "存在 location = right-panel 的划词助手（id = latex-selection）", su.id);',
    'ok(!!(su.content && su.content.source), "划词助手源码已内联");',
    'ok(!su.content || !su.content.sourceFile, "划词助手的 sourceFile 已被 build 消费");',
    'ok(!!su.content && /ctx\\.selection/.test(su.content.source), "划词助手读取 ctx.selection（宿主划词契约 §5.1.1）");',
    'ok(!!su.content && /skipEvolution:\\s*true/.test(su.content.source), "划词助手的 AI 子调用带 skipEvolution:true（防进化引擎改写提示词）");',
    'ok(!!su.content && /notrat-quote-to-chat/.test(su.content.source), "划词助手可经 notrat-quote-to-chat 引用到对话");',
    'for (const bad of ["page", "widget", "activity-bar", "status-bar", "editor-tabs", "editor-header", "sidebar-input", "messages-top", "popup", "floating", "sidebar-toolbar"]) {',
    '  ok(!(c.ui || []).some((u) => u.location === bad), "未新增挂载位：" + bad);',
    "}",
  ].join("\n");

  rep(sec3Old, sec3New, "第 3 节整段");

  // 2-3 第 4 节之后插入第 4.5 节：fileTreeMenus 正向断言
  const anchor4 = 'section("5. 内联源码静态体检");';
  const secMenu = [
    'section("4.5 fileTreeMenus：.tex 右键编译 / 校验");',
    "const ftm = c.fileTreeMenus || [];",
    'ok(Array.isArray(ftm) && ftm.length === 2, "fileTreeMenus 恰好 2 项", "实得 " + ftm.length);',
    'ok(ftm.every((x) => JSON.stringify(x.extensions) === JSON.stringify(["tex"])), \'菜单项都限定 extensions = ["tex"]\');',
    'ok(ftm.every((x) => !!x.tool), "菜单项都走 tool（直调 MCP 工具，args 自动带 filePath / fileName）");',
    'ok(!ftm.some((x) => x.uiKey), "菜单项未使用 uiKey（因此不需要 page 挂载位）");',
    'const srvSrc = fs.readFileSync(path.join(WS, "server", "index.js"), "utf8");',
    'for (const x of ftm) ok(srvSrc.includes(\'name: "\' + x.tool + \'"\'), "菜单 → 工具 " + x.tool + " 在 server 中有定义");',
    'ok(srvSrc.includes("args.path || args.filePath"), "server 已兼容宿主注入的 filePath（否则右键会静默编译错文件）");',
    'ok(ftm.some((x) => x.tool === "latex_compile"), "含编译项");',
    'ok(ftm.some((x) => x.tool === "latex_validate"), "含校验项");',
    "",
    anchor4,
  ].join("\n");
  rep(anchor4, secMenu, "第 5 节锚点（插入 4.5）");

  // 2-4 第 5 节 srcs：纳入划词助手
  rep(
    'const srcs = [["editors[0]", edSrc, true], ["ui[outline]", (ou.content || {}).source || "", false]];',
    'const srcs = [["editors[0]", edSrc, true], ["ui[outline]", (ou.content || {}).source || "", false], ["ui[selection]", (su.content || {}).source || "", false]];',
    "srcs 数组"
  );

  // 2-5 第 7 节：划词助手字节一致 + server filePath 兼容
  rep(
    'ok((ou.content || {}).source === wsOutline, "ui[outline].source ≡ panels/outline.tsx（" + wsOutline.length + " 字符）");',
    'ok((ou.content || {}).source === wsOutline, "ui[outline].source ≡ panels/outline.tsx（" + wsOutline.length + " 字符）");\n' +
      '  const wsSelection = fs.readFileSync(path.join(WS, "panels", "selection.tsx"), "utf8");\n' +
      '  ok((su.content || {}).source === wsSelection, "ui[selection].source ≡ panels/selection.tsx（" + wsSelection.length + " 字符）");',
    "第 7 节字节一致"
  );

  // 2-6 头部注释同步
  rep(
    "/* 验收脚本 v0.5.2：对【已部署的单文件插件包】做静态体检",
    "/* 验收脚本 v0.6.0：对【已部署的单文件插件包】做静态体检"
  );

  fs.writeFileSync(p, s);
  console.log("  ✓ verify-v052.js：已应用 " + n + " 处断言变更");
}
