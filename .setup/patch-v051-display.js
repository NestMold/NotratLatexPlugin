/* v0.5.1 补丁：章节大纲卡片只在「当前活动文件是 LaTeX」时出现
 *
 * 需求（用户已确认）：
 *   · 只要当前活动文件是 .tex / .bib / .cls / .sty / .ltx 就显示；
 *   · 不是 LaTeX 系文件时，整张卡片隐藏（含宿主 PanelShell 的标题行与右上角 ✕）；
 *   · 编辑器内部那条 150px 内联大纲保持不动。
 *
 * 做法：
 *   1. 活动文件名改从宿主 store 拿（require("@/store") → useWorkspaceStore.currentFile），
 *      事件桥降级为兜底 —— 桥只认 .tex，认不出 .bib/.cls/.sty；
 *   2. 隐藏整卡：向上找到宿主 Dismissable/PanelShell 外壳置 display:none；
 *   3. 旧 IdlePanel 走掉（它只是"收起内容"，卡片壳还在）。
 */
const fs = require("fs");
const path = require("path");

const WS = "E:/notrat-latex-plugin";
const FILE = path.join(WS, "panels/outline.tsx");
let s = fs.readFileSync(FILE, "utf8");
const before = s;

function mustReplace(from, to, label) {
  const i = s.indexOf(from);
  if (i < 0) throw new Error("找不到锚点：" + label + "\n---\n" + from.slice(0, 200));
  if (s.indexOf(from, i + 1) >= 0) throw new Error("锚点不唯一：" + label);
  s = s.slice(0, i) + to + s.slice(i + from.length);
  console.log("  ✓ " + label);
  return i;
}

/* ---------- 1. IdlePanel 整段 → 显示条件 + 隐藏外壳 ---------- */
const A = "/* ============================ 非 LaTeX 收起态 ============================ */";
const B = "/* ============================ 主面板 ============================ */";
const iA = s.indexOf(A);
const iB = s.indexOf(B);
if (iA < 0 || iB < 0 || iB < iA) throw new Error("找不到 IdlePanel 段落边界");
if (!/function IdlePanel\(props\)/.test(s.slice(iA, iB))) throw new Error("IdlePanel 段落内容不符预期");
const NEW_BLOCK = fs.readFileSync(path.join(WS, ".setup/new-block-outline.txt"), "utf8");
if (NEW_BLOCK.indexOf("function useHostCardHidden") < 0) throw new Error("新代码块文件内容不对");
s = s.slice(0, iA) + NEW_BLOCK + s.slice(iB);
console.log("  ✓ IdlePanel 段落 → 显示条件 + 整卡隐藏");

/* ---------- 2. 头部注释补一行 v0.5.1 ---------- */
mustReplace(
  " * 数据：自调本插件 MCP 工具 latex_parse / latex_validate（走主进程 IPC，无 CORS）",
  " * v0.5.1：显示条件收紧 —— 当前活动文件不是 LaTeX 时整张卡片不出现（宿主没有\n" +
    " *   visibleWhen 之类的条件位，所以由面板自己把宿主卡片外壳藏掉，见 useHostCardHidden）。\n" +
    " * 数据：自调本插件 MCP 工具 latex_parse / latex_validate（走主进程 IPC，无 CORS）",
  "头部注释补 v0.5.1 说明"
);

/* ---------- 3. 组件内部：host 检测 + 显示条件 ---------- */
mustReplace(
  "export default function LatexOutline(props) {\n  const act = useActiveLatexFile();\n",
  "export default function LatexOutline(props) {\n" +
    "  const act = useActiveLatexFile();\n" +
    "  /* 显示条件：当前活动文件是 LaTeX 系（.tex/.bib/.cls/.sty/.ltx）才出现这张卡片。\n" +
    "   * 首选宿主 store（认得所有格式），拿不到才退回事件桥。 */\n" +
    "  const host = useHostCurrentFilePath();\n" +
    "  const ready = host.known ? true : act.ready;\n" +
    "  const activePath = host.known ? host.path : (act.ready ? act.path : \"\");\n" +
    "  const showCard = ready && isLatexPath(activePath);\n" +
    "  const rootRef = useHostCardHidden(!showCard);\n",
  "插入 host 检测与显示条件"
);

/* ---------- 4. 跟随活动文件的 effect 改用统一来源 ---------- */
mustReplace(
  "      if (!act.ready) return;\n      setFile(act.path);\n",
  "      if (!ready) return;\n      setFile(activePath);\n",
  "effect：ready / activePath"
);
mustReplace(
  "      if (!act.path) {\n        setInfo(null);\n",
  "      if (!activePath) {\n        setInfo(null);\n",
  "effect：非 LaTeX 分支"
);
mustReplace(
  "      setFolded(store[act.path] ? Object.assign({}, store[act.path]) : {});\n      load(act.path);\n    },\n    [act.ready, act.path, load]\n  );\n",
  "      setFolded(store[activePath] ? Object.assign({}, store[activePath]) : {});\n      load(activePath);\n    },\n    [ready, activePath, load]\n  );\n",
  "effect：折叠状态与依赖数组"
);

/* ---------- 5. 早退分支：不再画提示卡，改为整卡隐藏 ---------- */
mustReplace(
  "  if (!act.path) return <IdlePanel ready={act.ready} />;\n",
  "  if (!showCard) return <div ref={rootRef} style={{ display: \"none\" }} />;\n",
  "早退分支 → 整卡隐藏"
);

/* ---------- 6. 主根节点挂 ref ---------- */
const ROOT = "    <div style={S.root}>";
const cnt = s.split(ROOT).length - 1;
if (cnt !== 1) throw new Error("期望只剩 1 处 S.root 根节点，实际 " + cnt);
mustReplace(ROOT, "    <div ref={rootRef} style={S.root}>", "主根节点挂 ref");

/* ---------- 收尾检查 ---------- */
if (/IdlePanel/.test(s)) throw new Error("仍残留 IdlePanel 引用");
/* 只剩 3 处【故意保留】的兜底引用：ready 那行 1 处 + activePath 那行 act.ready/act.path 各 1 处 */
const occ = (s.match(/act.(path|ready)/g) || []).length;
if (occ !== 3) throw new Error("act.* 残留数量异常：" + occ + "（应只剩 3 处兜底引用）");
console.log("  ✓ 兜底引用保留 " + occ + " 处");
fs.writeFileSync(FILE, s, "utf8");
console.log("\n写入 " + FILE);
console.log("行数 " + before.split("\n").length + " -> " + s.split("\n").length);
