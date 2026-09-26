/* v0.4.0 补丁：把「新贡献面」支撑接进 server/index.js 与 panels/editor.tsx
 *
 * 幂等：已打过（检测到 CONTRIB require）就跳过 server 部分。
 * 全部用「单引号字符串 + 精确锚点」，避免模板字符串把 ${} 与反引号吃掉。
 */
const fs = require("fs");

const WS = "E:/notrat-latex-plugin";
let fail = 0;

function edit(file, pairs) {
  let src = fs.readFileSync(file, "utf8");
  const orig = src;
  for (const [needle, repl, label] of pairs) {
    if (src.indexOf(needle) < 0) {
      console.error("  ✗ 锚点未命中 [" + label + "]: " + JSON.stringify(needle.slice(0, 60)));
      fail++;
      continue;
    }
    src = src.split(needle).join(repl);
    console.log("  ✓ " + label);
  }
  if (src !== orig) fs.writeFileSync(file, src, "utf8");
  return src;
}

/* ============================ server/index.js ============================ */
console.log("→ server/index.js");
const SRV = WS + "/server/index.js";
let srv = fs.readFileSync(SRV, "utf8");
const already = srv.indexOf('require("./contrib.js")') >= 0;

if (already) {
  console.log("  · 已打过 CONTRIB 补丁，跳过");
} else {
  const NEW_TOOLS = [
    '  {',
    '    name: "latex_outline",',
    '    description:',
    '      "输出文档大纲（章节树 + 自动编号 + 源文件行号），格式为 list 面板行协议（[ ] #行号 编号 标题）。供「大纲」面板 / 状态栏直接消费，也可让 AI 快速掌握论文骨架；path 省略时自动发现主 .tex。",',
    '    inputSchema: {',
    '      type: "object",',
    '      properties: {',
    '        path: { type: "string", description: ".tex 文件路径（绝对或相对工作区；也可传目录）" },',
    '        depth: { type: "number", description: "大纲深度：0=仅部分/章 1=到节 2=到小节 3=到小小节（默认取插件设置 outlineDepth）" },',
    '        ...WS_PARAM,',
    '      },',
    '    },',
    '  },',
    '  {',
    '    name: "latex_status",',
    '    description:',
    '      "输出一行紧凑状态摘要：文件名 · 章节数 · 公式/图/表/引用数 · 中英文字数 · 错误与警告数。供状态栏徽章、编辑器顶部控制带显示。",',
    '    inputSchema: {',
    '      type: "object",',
    '      properties: {',
    '        path: { type: "string", description: ".tex 文件路径（可省略，自动发现主文件）" },',
    '        ...WS_PARAM,',
    '      },',
    '    },',
    '  },',
    '  {',
    '    name: "latex_backup",',
    '    description:',
    '      "把 .tex 源码快照到同目录 .latex-history/（内容与最近一份一致时不重复快照，超出保留数自动清理）。由 toolHooks 在每次编译前自动调用，也可手动 /latex-backup 留存版本。",',
    '    inputSchema: {',
    '      type: "object",',
    '      properties: {',
    '        path: { type: "string", description: ".tex 文件路径（可省略，自动发现主文件）" },',
    '        ...WS_PARAM,',
    '      },',
    '    },',
    '  },',
    '  {',
    '    name: "latex_history",',
    '    description:',
    '      "源码快照历史：action=list 列出 .latex-history/ 里的快照（行协议）；action=restore + stamp=时间戳 恢复到指定快照（恢复前会先把当前内容另存一份，可再回退）。",',
    '    inputSchema: {',
    '      type: "object",',
    '      properties: {',
    '        path: { type: "string", description: ".tex 文件路径（可省略，自动发现主文件）" },',
    '        action: { type: "string", enum: ["list", "restore"], description: "默认 list 列快照；restore 恢复" },',
    '        stamp: { type: "string", description: "restore 时的快照时间戳，形如 20250922-140312；省略则取最新" },',
    '        limit: { type: "number", description: "list 时最多显示几条（默认 15）" },',
    '        ...WS_PARAM,',
    '      },',
    '    },',
    '  },',
  ].join("\n");

  const NEW_HANDLERS = [
    '  if (name === "latex_outline") {',
    '    const file = resolveInput(args.path, ws);',
    '    if (!file) throw new Error(`未找到 .tex 文件（输入: ${args.path || "(自动发现)"}，工作区: ${ws || "无"}）`);',
    '    const depth =',
    '      args.depth === undefined || args.depth === null',
    '        ? CONTRIB.envNum("LATEX_OUTLINE_DEPTH", 2)',
    '        : Number(args.depth);',
    '    return CONTRIB.outlineProtocol(parseTex(file), depth);',
    '  }',
    '  if (name === "latex_status") {',
    '    const file = resolveInput(args.path, ws);',
    '    if (!file) throw new Error(`未找到 .tex 文件（输入: ${args.path || "(自动发现)"}，工作区: ${ws || "无"}）`);',
    '    return CONTRIB.statusLine(parseTex(file), validateTex(file));',
    '  }',
    '  if (name === "latex_backup") {',
    '    // 该工具同时作为编译前 toolHook：任何情况都不抛错，避免把编译挡下来',
    '    try {',
    '      if (CONTRIB.envOff("LATEX_BACKUP")) return "编译前快照已在设置中关闭（backup = off）。";',
    '      const file = resolveInput(args.path, ws);',
    '      if (!file) return "未定位到 .tex 文件，本次不生成快照。";',
    '      return CONTRIB.backupTex(file, CONTRIB.envNum("LATEX_HISTORY_KEEP", 20)).message;',
    '    } catch (e) {',
    '      return "本次未生成快照: " + ((e && e.message) || String(e));',
    '    }',
    '  }',
    '  if (name === "latex_history") {',
    '    const file = resolveInput(args.path, ws);',
    '    if (!file) throw new Error(`未找到 .tex 文件（输入: ${args.path || "(自动发现)"}，工作区: ${ws || "无"}）`);',
    '    if (args.action === "restore") {',
    '      const r = CONTRIB.restoreSnapshot(file, args.stamp);',
    '      if (!r.ok) return "❌ " + r.message;',
    '      return "♻️ 已恢复到快照 " + r.from + "（恢复前的版本另存为 " + (r.safety || "-") + "，可再次回退）。若在编辑器中打开，请重新打开该文件以载入磁盘内容。";',
    '    }',
    '    return CONTRIB.historyProtocol(file, args.limit);',
    '  }',
    '  throw new Error(`未知工具: ${name}`);',
  ].join("\n");

  edit(SRV, [
    [
      'const readline = require("readline");',
      'const readline = require("readline");\nconst CONTRIB = require("./contrib.js"); // v0.4.0 新贡献面支撑（引擎探测/大纲/状态/快照）',
      "require contrib",
    ],
    [
      '  const compiler = (process.env.LATEX_COMPILER || "tectonic").trim();\n  const exe = resolveCompiler(compiler);',
      '  const picked = CONTRIB.pickCompiler(process.env.LATEX_COMPILER, resolveCompiler);\n  const compiler = picked.name;\n  const exe = picked.exe;',
      "引擎探测+回退链",
    ],
    [
      '      L.push(`🔨 ${compiler} ${base}  (目录: ${dir})`);',
      '      L.push(`🔨 ${compiler} ${base}  (目录: ${dir})`);\n      if (picked && picked.fellBack)\n        L.push(`ℹ️ 设置里的「${picked.wanted}」本机不可用，已自动改用 ${compiler}（可尝试: ${picked.tried.join(" / ")}）`);',
      "回退提示",
    ],
    [
      '\n];\n\nasync function handleToolCall(name, args) {',
      "\n" + NEW_TOOLS + "\n];\n\nasync function handleToolCall(name, args) {",
      "4 个新工具",
    ],
    [
      '  throw new Error(`未知工具: ${name}`);',
      NEW_HANDLERS,
      "4 个新 handler",
    ],
    ['const VERSION = "0.1.0";', 'const VERSION = "0.4.0";', "server 版本号"],
  ]);

  srv = fs.readFileSync(SRV, "utf8");
}

/* ============================ panels/editor.tsx ============================ */
console.log("→ panels/editor.tsx");
const ED = WS + "/panels/editor.tsx";
const ed = fs.readFileSync(ED, "utf8");
if (ed.indexOf("hostView") >= 0) {
  console.log("  · 已打过 dualView 补丁，跳过");
} else {
  const ANCHOR = '  const [view, setView] = useState("split"); // src | split | preview';
  const ADD = [
    ANCHOR,
    '  // v0.4.0：宿主「源码 / 可视化」双视图（manifest editors[].dualView = true）',
    '  // 标题栏开关由宿主渲染，切换结果经 props 传回；未知命名一律忽略，不干扰自带三档视图',
    '  const hostView =',
    '    props.viewMode !== undefined ? props.viewMode',
    '    : props.dualViewMode !== undefined ? props.dualViewMode',
    '    : undefined;',
    '  useEffect(() => {',
    '    if (hostView === undefined || hostView === null) return;',
    '    const hv = String(hostView).toLowerCase();',
    '    if (/vis|preview|render|read|pdf/.test(hv)) setView("preview");',
    '    else if (/src|source|code|edit|write|text/.test(hv)) setView("split");',
    '  }, [hostView]);',
  ].join("\n");
  edit(ED, [[ANCHOR, ADD, "dualView 视图联动"]]);
}

console.log(fail ? "\n❌ 有 " + fail + " 个锚点未命中" : "\n✅ 补丁完成");
process.exit(fail ? 1 : 0);
