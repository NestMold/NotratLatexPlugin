/* v0.5.2 补丁：只保留「编辑器 + 大纲」，并接上宿主大纲契约
 *
 * 1) contrib.js  新增 outlineHostProtocol —— editors[].outlineTool 契约
 *                （逐行 level|text|anchor；旧宿主忽略，新宿主原生渲染）
 * 2) index.js    latex_outline 同时支持宿主调用（{fileName,filePath}）与
 *                面板调用（{path}），前者返回宿主契约、后者返回 list 行协议
 * 3) editor.tsx  监听 notrat-outline-navigate —— 宿主大纲点击 → 滚到 anchor 行
 * 4) manifest    贡献面裁剪到 editors + ui(outline)；其余全部移除
 *
 * 全部替换都带 assert，命中不到就退出（防静默改错文件）。
 */
const fs = require("fs");
const path = require("path");

const WS = "E:/notrat-latex-plugin";
const read = (p) => fs.readFileSync(path.join(WS, p), "utf8");
const write = (p, s) => fs.writeFileSync(path.join(WS, p), s);
let step = 0;
const ok = (msg) => console.log("  ✓ [" + ++step + "] " + msg);

/* ================= 1) contrib.js ================= */
{
  const p = "server/contrib.js";
  let s = read(p);
  if (s.includes("function outlineHostProtocol")) {
    console.log("  · contrib.js 已打过补丁，跳过");
  } else {
    const anchor = "/** 一行状态摘要（status-bar / editor-header 用） */";
    if (!s.includes(anchor)) throw new Error("contrib.js 未找到 statusLine 锚点");
    const fn = [
      "/**",
      " * 宿主内置大纲面板契约（manifest editors[].outlineTool）：",
      " * 逐行 `level|text|anchor`（level 从 1 起，anchor = 源文件行号）。",
      " * 宿主用自己的大纲 UI 渲染，点击条目回抛 notrat-outline-navigate 事件，",
      " * 编辑器按 anchor 定位。旧宿主不认这个契约时返回值被忽略，零副作用。",
      " * 与 outlineProtocol（面板用的 list 行协议）并存，两条通路互不影响。",
      " */",
      "function outlineHostProtocol(res, depth) {",
      "  const rows = outlineRows(res, depth);",
      "  if (!rows.length) return \"\";",
      "  return rows",
      "    .map(function (r) {",
      "      const label = (r.number ? r.number + \"  \" : \"\") + r.title;",
      "      return r.level + 1 + \"|\" + label + \"|\" + r.line;",
      "    })",
      "    .join(\"\\n\");",
      "}",
      "",
      "",
    ].join("\n");
    s = s.replace(anchor, fn + anchor);
    const ex = "  outlineProtocol: outlineProtocol,";
    if (!s.includes(ex)) throw new Error("contrib.js 未找到导出锚点");
    s = s.replace(ex, ex + "\n  outlineHostProtocol: outlineHostProtocol,");
    write(p, s);
    if (!read(p).split("module.exports").pop().includes("outlineHostProtocol"))
      throw new Error("contrib.js 导出未生效");
    ok("contrib.js  +outlineHostProtocol（宿主大纲契约）");
  }
}

/* ================= 2) index.js : latex_outline 双通路 ================= */
{
  const p = "server/index.js";
  let s = read(p);

  // 2a. schema：补 filePath / fileName / format
  const oldSchema = [
    '        path: { type: "string", description: ".tex 文件路径（绝对或相对工作区；也可传目录）" },',
    '        depth: { type: "number", description: "大纲深度：0=仅部分/章 1=到节 2=到小节 3=到小小节（默认取插件设置 outlineDepth）" },',
  ].join("\n");
  const newSchema = [
    '        path: { type: "string", description: ".tex 文件路径（绝对或相对工作区；也可传目录）" },',
    '        filePath: { type: "string", description: "（宿主内置大纲自动注入，无需填写）当前 .tex 的完整路径" },',
    '        fileName: { type: "string", description: "（宿主内置大纲自动注入，无需填写）当前 .tex 的文件名" },',
    '        format: { type: "string", enum: ["text", "outline"], description: "text=list 行协议（面板用，默认）；outline=宿主编排契约 level|text|anchor" },',
    '        depth: { type: "number", description: "大纲深度：0=仅部分/章 1=到节 2=到小节 3=到小小节（默认取插件设置 outlineDepth）" },',
  ].join("\n");
  if (!s.includes("filePath: { type: \"string\", description: \"（宿主内置大纲自动注入")) {
    if (!s.includes(oldSchema)) throw new Error("index.js 未找到 latex_outline schema 锚点");
    s = s.replace(oldSchema, newSchema);
    ok("index.js  latex_outline schema +filePath/fileName/format");
  } else {
    console.log("  · index.js schema 已含 filePath，跳过");
  }

  // 2b. 描述补一句双通路
  const oldDesc = "供「大纲」面板 / 状态栏直接消费，也可让 AI 快速掌握论文骨架；path 省略时自动发现主 .tex。";
  if (s.includes(oldDesc)) {
    s = s.replace(
      oldDesc,
      "供「大纲」面板直接消费，也可让 AI 快速掌握论文骨架；path 省略时自动发现主 .tex。" +
        "宿主内置大纲面板调用时（带 filePath，无 format）自动输出 level|text|anchor 契约格式。"
    );
    ok("index.js  latex_outline 描述更新");
  }

  // 2c. handler：双通路分派
  const oldBody = [
    '  if (name === "latex_outline") {',
    '    const file = resolveInput(args.path, ws);',
    '    if (!file) throw new Error(`未找到 .tex 文件（输入: ${args.path || "(自动发现)"}，工作区: ${ws || "无"}）`);',
    '    const depth =',
    '      args.depth === undefined || args.depth === null',
    '        ? CONTRIB.envNum("LATEX_OUTLINE_DEPTH", 2)',
    '        : Number(args.depth);',
    '    return CONTRIB.outlineProtocol(parseTex(file), depth);',
    '  }',
  ].join("\n");
  const newBody = [
    '  if (name === "latex_outline") {',
    '    const input = args.path || args.filePath;',
    '    const file = resolveInput(input, ws);',
    '    if (!file) throw new Error(`未找到 .tex 文件（输入: ${input || "(自动发现)"}，工作区: ${ws || "无"}）`);',
    '    const depth =',
    '      args.depth === undefined || args.depth === null',
    '        ? CONTRIB.envNum("LATEX_OUTLINE_DEPTH", 2)',
    '        : Number(args.depth);',
    '    // 宿主内置大纲（editors[].outlineTool）只传 filePath/fileName，不带 path/format：',
    '    // 该通路要的是 level|text|anchor 契约；面板显式调用走 list 行协议。',
    '    const wantHost = args.format === "outline" || (!args.path && !!args.filePath);',
    '    const res = parseTex(file);',
    '    return wantHost ? CONTRIB.outlineHostProtocol(res, depth) : CONTRIB.outlineProtocol(res, depth);',
    '  }',
  ].join("\n");
  if (!s.includes(oldBody)) throw new Error("index.js 未找到 latex_outline handler 锚点（可能已改过）");
  s = s.replace(oldBody, newBody);
  write(p, s);
  ok("index.js  latex_outline 双通路分派（面板 / 宿主）");
}

/* ================= 3) editor.tsx : notrat-outline-navigate ================= */
{
  const p = "panels/editor.tsx";
  let s = read(p);
  if (s.includes("notrat-outline-navigate")) {
    console.log("  · editor.tsx 已有 notrat-outline-navigate 监听，跳过");
  } else {
    const anchor = "  /* gotoLine 每次渲染都是新闭包，用 ref 保持监听里拿到的是最新那份 */\n  useEffect(() => { gotoLineRef.current = gotoLine; });";
    if (!s.includes(anchor)) throw new Error("editor.tsx 未找到 gotoLineRef 锚点");
    const block = anchor + [
      "",
      "",
      "  /* ---------- 宿主内置大纲点击 → 定位 ----------",
      "   * 契约（docs §3.7）：editors[].outlineTool 声明的工具喂给宿主大纲面板，",
      "   * 用户点条目 → 编辑器收到 notrat-outline-navigate，detail={pluginId,editorId,anchor,item}。",
      "   * 与自家面板的 LATEX_REVEAL 通路并存（老宿主不发这个事件，监听空转无害）。",
      "   */",
      "  useEffect(() => {",
      "    function onHostOutline(e) {",
      "      const d = (e && e.detail) || {};",
      "      if (d.pluginId && d.pluginId !== pluginId) return; // 别的插件的大纲，不接",
      "      const ln = Math.max(1, Number(d.anchor) || 0);",
      "      if (!ln || !gotoLineRef.current) return;",
      "      gotoLineRef.current(ln);",
      "    }",
      "    window.addEventListener(\"notrat-outline-navigate\", onHostOutline);",
      "    return () => window.removeEventListener(\"notrat-outline-navigate\", onHostOutline);",
      "  }, [pluginId]);",
    ].join("\n");
    s = s.replace(anchor, block);
    write(p, s);
    if (!read(p).includes('addEventListener("notrat-outline-navigate"')) throw new Error("editor.tsx 监听未写入");
    ok("editor.tsx  +notrat-outline-navigate 监听（宿主大纲 → 定位）");
  }
}

/* ================= 4) manifest.json : 只留编辑器 + 大纲 ================= */
{
  const p = "manifest.json";
  const m = JSON.parse(read(p));
  const c = m.contributions;

  const dropped = {};
  for (const k of ["renderers", "commands", "promptSections", "toolHooks", "fileTreeMenus"]) {
    if (c[k]) { dropped[k] = Array.isArray(c[k]) ? c[k].length : 1; delete c[k]; }
  }
  const keepUi = (c.ui || []).filter((u) => u.location === "outline");
  dropped.ui = (c.ui || []).length - keepUi.length;

  c.editors = [
    {
      id: "latex-editor",
      label: "LaTeX 编辑器",
      extensions: ["tex"],
      dualView: ["可视化", "源码"],
      outlineTool: "latex_outline",
      sourceFile: "panels/editor.tsx",
    },
  ];
  c.ui = keepUi.map((u) => ({
    id: u.id,
    title: u.title,
    icon: u.icon,
    location: "outline",
    extensions: ["tex"],
    content: { type: "component", sourceFile: "panels/outline.tsx" },
  }));
  // 贡献面顺序：editors 在前
  const ordered = { editors: c.editors, ui: c.ui, settings: c.settings };
  m.contributions = ordered;

  // 设置：只留编辑器/大纲真正要的三项
  const grp = (m.contributions.settings || [])[0];
  const allFields = (grp && grp.fields) || [];
  const wanted = ["compiler", "timeout", "outlineDepth"];
  const keptFields = allFields.filter((f) => wanted.indexOf(f.key) >= 0);
  if (keptFields.length !== 3) throw new Error("设置字段裁剪异常，期望 3 项，实得 " + keptFields.length);
  grp.fields = keptFields;
  m.contributions.settings = [grp];

  // env 只留还在用的
  const srv = m.mcpServers.find((s) => s.id === "latex") || m.mcpServers[0];
  delete srv.env.LATEX_HISTORY_KEEP;
  delete srv.env.LATEX_BACKUP;

  m.version = "0.5.2";
  m.description =
    "科研写作向的 LaTeX 插件：.tex 由插件编辑器接管（可视化/源码双视图、语法高亮、KaTeX 公式预览、编译与引用校验），" +
    "左侧「章节大纲」是可点击的章节树——点击跳回源码并高亮、跟随光标自动定位当前节、支持过滤与折叠。";

  write(p, JSON.stringify(m, null, 2) + "\n");
  ok("manifest.json 裁剪完成  移除: " + JSON.stringify(dropped));
}

console.log("\n=== 补丁完成 ===");
