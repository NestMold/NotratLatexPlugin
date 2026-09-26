/* v0.5.0 大纲面板 v2 行为测试（不装依赖、不进 Electron）
 *
 * 手法与 test-activefile.js 一致：把工作区源码里的真实实现抠出来直接跑。
 *
 * A. 纯逻辑（从 panels/outline.tsx 抠出"纯逻辑区块"整体求值）
 *    · 编号：article（1 / 2.1）/ book（第1章 / 1.1 / 1.1.1）
 *    · \section* 不编号、且不推进计数器
 *    · 层级建树：subsection 挂在 section 下、figure 挂在"它前面那一节"下
 *    · 过滤保留祖先、折叠、层级上限折叠
 *    · 光标行 -> 当前节点（同行优先认章节，不被 \label 抢走）
 *    · flat 必须按行号单调（活跃节查找的前提）
 * B. 真实样例：起真 MCP server 跑 latex_parse，用真函数建树，打印整棵树
 * C. 接线：面板/编辑器两侧的通道名必须逐字一致（跨文件拼错是这类设计的头号故障）
 *    + v1 的契约不能丢（活动文件桥、非 LaTeX 整卡隐藏、无 pickFile 回落）
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const cp = require("child_process");

const WS = "E:/notrat-latex-plugin";
let pass = 0;
let fail = 0;
function ok(cond, msg, extra) {
  if (cond) {
    pass++;
    console.log("  ✓ " + msg);
  } else {
    fail++;
    console.log("  ✗ " + msg + (extra !== undefined ? "  → " + extra : ""));
  }
}

const outlineSrc = fs.readFileSync(path.join(WS, "panels/outline.tsx"), "utf8");
const editorSrc = fs.readFileSync(path.join(WS, "panels/editor.tsx"), "utf8");

/* ============================ A. 纯逻辑 ============================ */
console.log("== A. 纯逻辑（大纲建树 / 编号 / 活跃节） ==");

const MARK_A = "/* ==================== 纯逻辑（无 React 依赖，可单测） ==================== */";
const MARK_B = "/* ============================ 事件通道 ============================ */";
const i0 = outlineSrc.indexOf(MARK_A);
const i1 = outlineSrc.indexOf(MARK_B);
ok(i0 >= 0 && i1 > i0, "能定位纯逻辑区块（标记注释还在）");
const logic = outlineSrc.slice(i0, i1);
ok(!/module\.exports/.test(logic), "纯逻辑区块不含 module.exports（构建脚本会直接拦构建）");

const L = new Function(
  logic +
    "\nreturn {hasChapters,sectionDepth,envKind,sectionNumbers,indexIssues,buildModel,filterTree,flattenVisible,collapseDeeperThan,activeNodeId};"
)();

function flatLines(m) { return m.flat.map((n) => n.line); }
function monotonic(arr) { for (let i = 1; i < arr.length; i++) if (arr[i] < arr[i - 1]) return false; return true; }

/* ---- A1. article（无章） ---- */
const article = {
  file: "a.tex",
  documentClass: "ctexart",
  sections: [
    { level: 1, cmd: "section", star: false, title: "引言", line: 10 },
    { level: 1, cmd: "section", star: true, title: "致谢", line: 20 },
    { level: 1, cmd: "section", star: false, title: "方法", line: 30 },
    { level: 2, cmd: "subsection", star: false, title: "结构", line: 35 },
    { level: 3, cmd: "subsubsection", star: false, title: "细节", line: 40 },
  ],
  environments: [
    { name: "equation", line: 32, endLine: 34, caption: "", label: "eq:a" },
    { name: "figure", line: 36, endLine: 38, caption: "模型结构", label: "fig:m" },
  ],
  labels: [{ key: "sec:intro", line: 10, env: "" }],
  todos: [{ line: 11, kind: "TODO", text: "补文献" }],
  wordCount: { approxWords: 123 },
};
const mA = L.buildModel(article, { issues: [{ line: 36, severity: "warning", message: "图片缺失" }] }, {});
const numsA = mA.flat.filter((n) => n.kind === "section").map((n) => n.number);
ok(JSON.stringify(numsA) === JSON.stringify(["1", "", "2", "2.1", "2.1.1"]), "article 编号 + \\section* 不编号", JSON.stringify(numsA));
ok(mA.flat.length === 8, "article 树节点数 = 5 节 + 公式 + 图 + 待办", mA.flat.length);

const secMethod = mA.flat.filter((n) => n.title === "方法")[0];
const secStruct = mA.flat.filter((n) => n.title === "结构")[0];
const figNode = mA.flat.filter((n) => n.kind === "figure")[0];
const eqNode = mA.flat.filter((n) => n.kind === "equation")[0];
const todoNode = mA.flat.filter((n) => n.kind === "todo")[0];
ok(secStruct.depth === 2 && figNode.depth === 3, "小节 depth=2、图挂在小节下 depth=3", secStruct.depth + "/" + figNode.depth);
ok(secMethod.children.indexOf(secStruct) >= 0, "结构 是 方法 的子节点");
ok(secStruct.children.indexOf(figNode) >= 0, "图 挂在 结构 下（不是挂在 方法 下）");
ok(secMethod.children.indexOf(eqNode) >= 0, "公式挂在 方法 下");
ok(mA.flat.filter((n) => n.title === "引言")[0].children.indexOf(todoNode) >= 0, "待办挂在 引言 下");
ok(figNode.title === "模型结构" && figNode.number === "图1", "图节点带 caption 与编号", figNode.title + "/" + figNode.number);
ok(eqNode.title === "eq:a" && eqNode.number === "式1", "公式无 caption 时回落 \\label", eqNode.title);
ok(figNode.issues.length === 1 && figNode.issues[0].severity === "warning", "校验问题按行号挂到节点上");
ok(mA.summary.sections === 5 && mA.summary.figures === 1 && mA.summary.todos === 1, "summary 统计正确", JSON.stringify(mA.summary));
ok(monotonic(flatLines(mA)), "article flat 按行号单调", flatLines(mA).join(","));

/* 内容开关 */
const mNoFloat = L.buildModel(article, null, { showFloats: false });
ok(!mNoFloat.flat.some((n) => n.kind === "figure" || n.kind === "equation"), "showFloats=false 时图/公式不进树");
const mNoTodo = L.buildModel(article, null, { showTodos: false });
ok(!mNoTodo.flat.some((n) => n.kind === "todo"), "showTodos=false 时待办不进树");
const mLabels = L.buildModel(article, null, { showLabels: true });
ok(mLabels.flat.some((n) => n.kind === "label" && n.title === "sec:intro"), "showLabels=true 时 \\label 进树");

/* ---- A2. book（有章） ---- */
const book = {
  file: "b.tex",
  documentClass: "ctexbook",
  sections: [
    { level: 1, cmd: "chapter", star: false, title: "绪论", line: 5 },
    { level: 1, cmd: "section", star: false, title: "背景", line: 8 },
    { level: 2, cmd: "subsection", star: false, title: "动机", line: 12 },
    { level: 1, cmd: "chapter", star: false, title: "方法", line: 20 },
    { level: 1, cmd: "section", star: false, title: "模型", line: 22 },
  ],
  environments: [],
  todos: [],
};
ok(L.hasChapters(book) === true, "book 文档判定为有章");
ok(L.hasChapters(article) === false, "article 判定为无章");
const mB = L.buildModel(book, null, {});
const numsB = mB.flat.filter((n) => n.kind === "section" || n.kind === "chapter").map((n) => n.number);
ok(
  JSON.stringify(numsB) === JSON.stringify(["第1章", "1.1", "1.1.1", "第2章", "2.1"]),
  "book 编号：章号前缀 1.1 / 1.1.1，换章后 2.1",
  JSON.stringify(numsB)
);
const c1 = mB.flat.filter((n) => n.title === "绪论")[0];
const s11 = mB.flat.filter((n) => n.title === "背景")[0];
const ss111 = mB.flat.filter((n) => n.title === "动机")[0];
ok(c1.depth === 1 && s11.depth === 2 && ss111.depth === 3, "book 深度：章1 / 节2 / 小节3");
ok(c1.children.indexOf(s11) >= 0 && s11.children.indexOf(ss111) >= 0, "book 树：章 > 节 > 小节 真嵌套（v1 里三者是平级）");
ok(L.sectionDepth("section", true) === 2 && L.sectionDepth("section", false) === 1, "sectionDepth 按文档类区分");

/* ---- A3. 环境名映射 ---- */
ok(L.envKind("figure") === "figure" && L.envKind("figure*") === "figure", "figure / figure* 都算图");
ok(L.envKind("table") === "table", "table 算表");
ok(L.envKind("align") === "equation" && L.envKind("multline") === "equation", "align / multline 都算公式");
ok(L.envKind("tabular") === "", "tabular 不算浮动体（不进大纲）");

/* ---- A4. 过滤 / 折叠 ---- */
const f = L.filterTree(mA.roots, "结构");
ok(f.length === 1 && f[0].title === "方法", "过滤命中被保留的只有祖先链（方法）", f.map((n) => n.title).join("/"));
ok(f[0].children.length === 1 && f[0].children[0].title === "结构", "命中节点留在祖先下");
ok(f[0].forceOpen === true && f[0].children[0].forceOpen === true, "过滤结果标记 forceOpen（命中的祖先强制展开）");
const f2 = L.filterTree(mA.roots, "模型结构");
ok(f2[0].title === "方法" && f2[0].children[0].title === "结构", "按图题也能搜到（图在 结构 下）");
ok(L.filterTree(mA.roots, "不存在的词").length === 0, "无命中返回空");

const vis = L.flattenVisible(mA.roots, {});
ok(vis.length === mA.flat.length, "无折叠时可见行 = 全部节点");
const foldedMap = {};
foldedMap[secMethod.id] = true;
const vis2 = L.flattenVisible(mA.roots, foldedMap);
ok(!vis2.some((n) => n.title === "结构") && !vis2.some((n) => n.kind === "figure"), "折叠 方法 后 结构/图 都不可见");
ok(vis2.some((n) => n.title === "方法"), "被折叠的节点自身仍可见（只是收起子级）");

const deep = L.collapseDeeperThan(mA.roots, 1);
ok(deep[secStruct.id] === true, "collapseDeeperThan(1) 折叠 depth>1 的 结构");
ok(deep[secMethod.id] !== true, "collapseDeeperThan(1) 不折叠 depth=1 的 方法");
ok(L.collapseDeeperThan(mA.roots, 2)[secStruct.id] !== true, "collapseDeeperThan(2) 放开 depth=2 的 结构");
ok(L.collapseDeeperThan(mA.roots, 0)[secMethod.id] === true, "collapseDeeperThan(0)（仅顶层）折叠 depth=1 的 方法");
ok(L.collapseDeeperThan(mA.roots, null) && Object.keys(L.collapseDeeperThan(mA.roots, null)).length === 0, "maxDepth=null 不折叠任何节点");

/* ---- A5. 光标 -> 活跃节 ---- */
ok(L.activeNodeId(mA.flat, 10) === mA.flat.filter((n) => n.title === "引言")[0].id, "光标在第 10 行 -> 引言（同行优先章节）");
ok(L.activeNodeId(mA.flat, 37) === figNode.id, "光标在第 37 行（图中间）-> 图节点");
ok(L.activeNodeId(mA.flat, 5) === "", "光标在第一个章节之前 -> 无活跃节点");
ok(L.activeNodeId(mA.flat, 999) === mA.flat[mA.flat.length - 1].id, "光标在文末 -> 最后一个节点");
const dup = [
  { id: "s10", kind: "section", line: 10, title: "X" },
  { id: "l10", kind: "label", line: 10, title: "x" },
];
ok(L.activeNodeId(dup, 10) === "s10", "同一行上有 \\label 时优先认章节");
ok(L.activeNodeId(mA.flat, 0) === "", "line=0（编辑器还没广播光标）-> 无活跃节点");

/* ============ B. 真实样例：起真 server，用真函数建树 ============ */
console.log("\n== B. 真实样例（sample.tex，走真 MCP server） ==");
const TOOLS_SERVER = path.join(os.homedir(), ".notrat", "tools", "latex-server.js");
const WS_SERVER = path.join(WS, "server", "index.js");
const serverPath = fs.existsSync(WS_SERVER) ? WS_SERVER : TOOLS_SERVER;
let parsed = null;
try {
  const reqs =
    JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } }) +
    "\n" +
    JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "latex_parse", arguments: { path: WS + "/samples/sample.tex", format: "json", workspace: WS } },
    }) +
    "\n";
  const out = cp.execFileSync("node", [serverPath], { input: reqs, encoding: "utf8" });
  const lines = out.trim().split("\n").map((l) => JSON.parse(l));
  const r = lines.filter((x) => x.id === 2)[0];
  parsed = JSON.parse(r.result.content[0].text);
  ok(true, "latex_parse(sample.tex) 返回 JSON");
} catch (e) {
  ok(false, "latex_parse(sample.tex) 返回 JSON", e.message);
}

if (parsed) {
  ok(parsed.environments.length === 3, "解析出 3 个浮动体/公式环境", parsed.environments.length);
  ok(
    parsed.environments.every((e) => e.endLine && "caption" in e && "label" in e),
    "每个环境都带 endLine / caption / label（v0.5.0 新字段）",
    JSON.stringify(parsed.environments[0])
  );
  const fig = parsed.environments.filter((e) => e.name === "figure")[0];
  ok(fig.caption === "模型整体结构" && fig.label === "fig:model", "图的 caption 与 label 都取到了", fig.caption + " / " + fig.label);
  const tab = parsed.environments.filter((e) => e.name === "table")[0];
  ok(tab.caption === "在 CNN/DailyMail 上的主要结果", "表的 caption 取到了", tab.caption);

  const mS = L.buildModel(parsed, null, {});
  console.log("\n  ── 用真函数把 sample.tex 拍成树 ──");
  mS.flat.forEach(function (n) {
    console.log(
      "  " + "  ".repeat(n.depth) + (n.number ? "[" + n.number + "] " : "") + n.title +
        "   (L" + n.line + (n.endLine ? "-" + n.endLine : "") + ", " + n.kind + ")"
    );
  });
  console.log("");
  ok(mS.summary.sections === 5 && mS.summary.figures === 1 && mS.summary.tables === 1 && mS.summary.equations === 1,
     "样例统计：5 节 1 图 1 表 1 式", JSON.stringify(mS.summary));
  ok(mS.flat.filter((n) => n.kind === "todo").length === 2, "2 条 TODO/FIXME 进树");
  const sModel = mS.flat.filter((n) => n.title === "模型结构")[0];
  const figS = mS.flat.filter((n) => n.kind === "figure")[0];
  const tabS = mS.flat.filter((n) => n.kind === "table")[0];
  const eqS = mS.flat.filter((n) => n.kind === "equation")[0];
  ok(sModel.children.indexOf(figS) >= 0, "图挂在「模型结构」下");
  ok(mS.flat.filter((n) => n.title === "实验")[0].children.indexOf(tabS) >= 0, "表挂在「实验」下");
  ok(mS.flat.filter((n) => n.title === "方法")[0].children.indexOf(eqS) >= 0, "公式挂在「方法」下");
  ok(figS.title === "模型整体结构" && tabS.number === "表1" && eqS.number === "式1", "样例里图/表/式编号与题注都正确");
  ok(monotonic(flatLines(mS)), "样例 flat 按行号单调", flatLines(mS).join(","));
  const activeAt22 = L.activeNodeId(mS.flat, 22);
  ok(mS.byId[activeAt22] && mS.byId[activeAt22].title === "eq:attn", "光标在第 22 行（公式体内）-> 公式节点");
}

/* ============================ C. 接线 / 契约 ============================ */
console.log("\n== C. 接线（跨文件通道名 + v1 契约） ==");

function ch(src, name) {
  const m = src.match(new RegExp('const ' + name + ' = "([^"]+)"'));
  return m ? m[1] : "";
}
["LATEX_REVEAL", "LATEX_REVEAL_ACK", "LATEX_CURSOR", "LATEX_CURSOR_PING", "LATEX_EV", "LATEX_PING"].forEach(function (k) {
  const a = ch(outlineSrc, k);
  const b = ch(editorSrc, k);
  ok(a && b && a === b, "通道名逐字一致：" + k, a + " vs " + b);
});

ok(/if \(!showCard\) return <div ref=\{rootRef\} style=\{\{ display: "none" \}\} \/>;/.test(outlineSrc), "outline 非 LaTeX 时整卡隐藏（v0.5.1 起不再画提示卡）");
ok(/load\(activePath\);/.test(outlineSrc), "outline 保留 load(activePath) 数据入口");
ok(/useActiveLatexFile\(\)/.test(outlineSrc) && /notrat-latex-active-ping/.test(outlineSrc), "outline 仍走活动文件桥（ping 提问）");
ok(!/pickFile\(/.test(outlineSrc), "outline 无 pickFile 回落");
ok(!/module\.exports/.test(outlineSrc + editorSrc), "两个面板源码都不含 module.exports");

ok(/onClick=\{function \(\) \{ jump\(n\); \}\}/.test(outlineSrc), "大纲行可点 -> jump(node)（v1 里行是死的不响应点击）");
ok(/revealInEditor\(file, node\.line\)/.test(outlineSrc), "jump 走 revealInEditor(文件, 行号)");
ok(/notrat-open-file/.test(outlineSrc), "编辑器没接住时回落 notrat-open-file（先打开文件再补发）");
ok(/tabIndex=\{0\}/.test(outlineSrc) && /ArrowDown/.test(outlineSrc), "树支持键盘导航（↑↓/Enter/Esc）");
ok(/filterTree\(model\.roots, query\)/.test(outlineSrc), "面板接了过滤");
ok(/collapseDeeperThan/.test(outlineSrc) && /flattenVisible/.test(outlineSrc), "面板接了折叠/层级");

ok(/window\.addEventListener\(LATEX_REVEAL, onReveal\)/.test(editorSrc), "editor 监听 reveal-line");
ok(/LATEX_REVEAL_ACK, \{ detail/.test(editorSrc), "editor 回 ACK 回执");
ok(/CustomEvent\(LATEX_CURSOR, \{ detail/.test(editorSrc), "editor 广播光标行");
ok(/function gotoLine\(ln, opts\)/.test(editorSrc), "gotoLine 支持 opts（闪烁开关）");
ok(/function paintFlash\(ln\)/.test(editorSrc) && /flashAt\(ln\)/.test(editorSrc), "editor 有定位闪烁实现");
ok(/if \(flashLineRef\.current\) paintFlash\(flashLineRef\.current\);/.test(editorSrc), "闪烁层跟随滚动（滚动时不会漂）");

console.log("\n" + (fail === 0 ? "\u2705 全部通过：" + pass + " 项" : "\u274c " + fail + " 项未通过（共 " + (pass + fail) + " 项）"));
process.exitCode = fail ? 1 : 0;
