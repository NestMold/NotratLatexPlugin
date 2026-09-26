/* v0.8.6 补丁：Typora 风格格式快捷键 + 插入菜单可发现性
 *
 * 为什么是补丁而不是重写整份文件：panels/editor.tsx 有 2116 行且是**全 CRLF**，
 * 整份重写等于把「有没有悄悄丢内容」这件事交给运气。这里每处都断言命中次数，
 * 对不上就整体不落盘（磁盘上一个字节都不动）。
 *
 * 行尾：读入先归一为 LF，改完再按原文还原 CRLF —— v0.8.4 用过 sed 把 CRLF 吃掉过一次，
 * 不再犯。输出里会打印实际 EOL 供核对。
 *
 * 运行： node .setup/patch-v086-keys.js
 */
const fs = require("fs");
const path = require("path");

const WS = "E:/notrat-latex-plugin";
const P = path.join(WS, "panels", "editor.tsx");

const rawIn = fs.readFileSync(P, "utf8");
const isCRLF = rawIn.indexOf("\r\n") >= 0;
const mixed = isCRLF && rawIn.replace(/\r\n/g, "").indexOf("\n") >= 0;
if (mixed) { console.error("✗ 文件是混合行尾，先统一再打补丁"); process.exit(1); }
let s = isCRLF ? rawIn.replace(/\r\n/g, "\n") : rawIn;
const orig = s;

let hits = 0;
function rep(anchor, repl, label) {
  const c = s.split(anchor).length - 1;
  if (c !== 1) { console.error("✗ FAIL " + label + "：命中 " + c + " 次（应 1 次）—— 整体不落盘"); process.exit(1); }
  s = s.replace(anchor, repl);
  hits++;
  console.log("  ok   " + label);
}

/* ======================================================================
 * 1) 模块级：编辑器控件样式 + 插入表改造 + 格式快捷键表
 * ==================================================================== */

const BT = "\x60";   // 反引号（模板字符串里要转义，抽出来更好读）

const MODULE_BLOCK = [
  "/* ---------- v0.8.6 编辑器自身控件的样式（菜单 / 键位提示 / 分组标题） ----------",
  " * 为什么不并进 PV_CSS / WYS_CSS：那两个描述的是**文档**长什么样，check-v073-style.js",
  " * 会拿它们和导出产物逐条对账；这里是**编辑器控件**的样式，混进去只会让对账语义变脏。",
  " * 也没用 transition: all —— 高频交互元素上的全属性过渡是输入卡顿的常见来源。 */",
  "const UI_CSS = " + BT + "`",
  ".lx-mh{padding:5px 8px 3px;font-size:10.5px;color:hsl(var(--muted-foreground));letter-spacing:.06em}",
  ".lx-mi{display:flex;align-items:center;justify-content:space-between;gap:14px;width:100%;text-align:left;border:none;background:transparent;color:hsl(var(--popover-foreground));font-family:inherit;font-size:12px;padding:5px 8px;border-radius:5px;cursor:pointer}",
  ".lx-mi:hover{background:hsl(var(--primary)/.14)}",
  ".lx-kbd{font-family:Consolas,'Courier New',monospace;font-size:10.5px;line-height:16px;color:hsl(var(--muted-foreground));border:1px solid hsl(var(--border));border-radius:4px;padding:0 4px;white-space:nowrap;flex:none}",
  BT + "`;",
  "",
  "/* 常用结构插入（v0.7.2 把 8 个按钮收成 1 个；v0.8.6 加分组 + 键位提示）",
  " * 结构：[标签, 插入文本, 光标回退, 键位提示, 分组]。",
  " * 键位提示是**照实抄**自下面的 FMT 表 —— 菜单和快捷键指向同一批动作，",
  " * 免得出现「菜单说 Ctrl+T、实际按了没反应」这种自相矛盾（check-v086-keys.js 会盯着）。 */",
  "const INSERT_GROUPS = [\"格式\", \"环境\", \"引用\"];",
  "const TPL_FIG = \"\\\\begin{figure}[htbp]\\n  \\\\centering\\n  \\\\includegraphics[width=.8\\\\linewidth]{}\\n  \\\\caption{}\\n  \\\\label{fig:}\\n\\\\end{figure}\";",
  "const TPL_TAB = \"\\\\begin{table}[htbp]\\n  \\\\centering\\n  \\\\begin{tabular}{lcc}\\n    \\\\hline\\n    & & \\\\\\\\\\n    \\\\hline\\n  \\\\end{tabular}\\n  \\\\caption{}\\n  \\\\label{tab:}\\n\\\\end{table}\";",
  "const INSERTS = [",
  "  [\"§ 章节\", \"\\\\section{}\", 1, \"Ctrl+1\", \"格式\"],",
  "  [\"§ 小节\", \"\\\\subsection{}\", 1, \"Ctrl+2\", \"格式\"],",
  "  [\"¶ 三级小节\", \"\\\\subsubsection{}\", 1, \"Ctrl+3\", \"格式\"],",
  "  [\"∑ 行内公式\", \"$\", 1, \"Ctrl+M\", \"格式\"],",
  "  [\"∑ 公式环境\", \"\\\\begin{equation}\\\\label{eq:}\\n  \\n\\\\end{equation}\", \"\\\\end{equation}\".length, \"Ctrl+Shift+M\", \"环境\"],",
  "  [\"🖼 图\", TPL_FIG, 0, \"Ctrl+Shift+I\", \"环境\"],",
  "  [\"📊 表\", TPL_TAB, 0, \"Ctrl+T\", \"环境\"],",
  "  [\"📝 代码块\", \"\\\\begin{verbatim}\\n\\n\\\\end{verbatim}\", 0, \"Ctrl+Shift+K\", \"环境\"],",
  "  [\"💬 引用块\", \"\\\\begin{quote}\\n\\n\\\\end{quote}\", 0, \"Ctrl+Shift+Q\", \"环境\"],",
  "  [\"• 无序列表\", \"\\\\begin{itemize}\\n  \\\\item \\n\\\\end{itemize}\", 0, \"Ctrl+Shift+U\", \"环境\"],",
  "  [\"1. 有序列表\", \"\\\\begin{enumerate}\\n  \\\\item \\n\\\\end{enumerate}\", 0, \"Ctrl+Shift+O\", \"环境\"],",
  "  [\"🏷 标签\", \"\\\\label{}\", 1, \"Ctrl+Shift+L\", \"引用\"],",
  "  [\"🔗 交叉引用\", \"\\\\ref{}\", 1, \"\", \"引用\"],",
  "  [\"📚 文献引用\", \"\\\\cite{}\", 1, \"\", \"引用\"],",
  "];",
  "",
  "/* ==========================================================================",
  " * v0.8.6：Typora 风格格式快捷键",
  " *",
  " * 键位**照 Typora 的来**，动作落成 LaTeX —— 这样「肌肉记忆」是同一套：",
  " *   Ctrl+B / I / U      加粗 / 斜体 / 下划线",
  " *   Ctrl+K              链接（\href）",
  " *   Ctrl+M              行内公式（Typora 的 Ctrl+M 就是行内公式）",
  " *   Ctrl+Shift+M        公式块",
  " *   Ctrl+T              表格",
  " *   Ctrl+1..5 / Ctrl+0  章节层级 / 变回正文（Typora 用同一组键设标题）",
  " *   Ctrl+Shift+`        行内代码（\texttt）",
  " *   Ctrl+Shift+K        代码块      Ctrl+Shift+Q  引用块",
  " *   Ctrl+Shift+U / O    无序 / 有序列表",
  " *   Ctrl+Shift+I        插图",
  " *",
  " * 两种执行形态：",
  " *   e / s —— 模板插入。e = 无选区时用，s = 有选区时用（没写 s 就共用 e）。",
  " *            \\u0000 = 选区内容的位置，\\u0002 = 光标落点（都没写则光标落在末尾）。",
  " *   head  —— 章节层级。有选区就包住；没选区把**当前整行**换成 \\section{...}，",
  " *            该行原本已是章节命令时**只换层级、保留标题**（Typora 的 Ctrl+1→Ctrl+2 就是这样）。",
  " *",
  " * 只在「源码 / 分屏」且焦点在源码 textarea 时接管（见 onFmtKey）。预览区是块级就地编辑，",
  " * 往里塞 LaTeX 命令会被当成正文回写 —— 那里一概不碰。",
  " * 反引号那一项用 code 匹配：Shift 会把它变成 ~，key 不可靠。",
  " * ======================================================================== */",
  "const FMT = [",
  "  { k: \"b\", shift: false, name: \"加粗\",     e: \"\\\\textbf{\\u0000}\",    s: \"\\\\textbf{\\u0000}\\u0002\" },",
  "  { k: \"i\", shift: false, name: \"斜体\",     e: \"\\\\textit{\\u0000}\",    s: \"\\\\textit{\\u0000}\\u0002\" },",
  "  { k: \"u\", shift: false, name: \"下划线\",   e: \"\\\\underline{\\u0000}\", s: \"\\\\underline{\\u0000}\\u0002\" },",
  "  { k: \"k\", shift: false, name: \"链接\",     e: \"\\\\href{\\u0000}{}\",    s: \"\\\\href{\\u0002}{\\u0000}\" },",
  "  { k: \"m\", shift: false, name: \"行内公式\", e: \"$\\u0000$\",            s: \"$\\u0000$\\u0002\" },",
  "  { k: \"t\", shift: false, name: \"表格\",     e: TPL_TAB },",
  "  { k: \"`\", code: \"Backquote\", shift: true, name: \"行内代码\", e: \"\\\\texttt{\\u0000}\", s: \"\\\\texttt{\\u0000}\\u0002\" },",
  "  { k: \"m\", shift: true, name: \"公式块\",    e: \"\\\\begin{equation}\\n  \\u0000\\n\\\\end{equation}\" },",
  "  { k: \"k\", shift: true, name: \"代码块\",    e: \"\\\\begin{verbatim}\\n\\u0000\\n\\\\end{verbatim}\" },",
  "  { k: \"q\", shift: true, name: \"引用块\",    e: \"\\\\begin{quote}\\n  \\u0000\\n\\\\end{quote}\" },",
  "  { k: \"i\", shift: true, name: \"插图\",      e: TPL_FIG },",
  "  { k: \"u\", shift: true, name: \"无序列表\",  e: \"\\\\begin{itemize}\\n  \\\\item \\u0000\\n\\\\end{itemize}\" },",
  "  { k: \"o\", shift: true, name: \"有序列表\",  e: \"\\\\begin{enumerate}\\n  \\\\item \\u0000\\n\\\\end{enumerate}\" },",
  "  { k: \"l\", shift: true, name: \"标签\",      e: \"\\\\label{\\u0000}\", s: \"\\\\label{\\u0000}\\u0002\" },",
  "  { k: \"1\", shift: false, name: \"一级标题\", head: \"section\" },",
  "  { k: \"2\", shift: false, name: \"二级标题\", head: \"subsection\" },",
  "  { k: \"3\", shift: false, name: \"三级标题\", head: \"subsubsection\" },",
  "  { k: \"4\", shift: false, name: \"四级标题\", head: \"paragraph\" },",
  "  { k: \"5\", shift: false, name: \"五级标题\", head: \"subparagraph\" },",
  "  { k: \"0\", shift: false, name: \"正文\",     head: \"\" },",
  "];",
  "",
  "const SEL_MARK = \"\\u0000\";    // 选区内容落点",
  "const CARET_MARK = \"\\u0002\";  // 光标落点",
  "",
  "/** 模板展开 → { text, caret }。两个标记都摘掉之后再算偏移，避免边改边算。 */",
  "function expandTpl(tpl, sel) {",
  "  const iS = tpl.indexOf(SEL_MARK);",
  "  const iC = tpl.indexOf(CARET_MARK);",
  "  if (iS < 0 && iC < 0) return { text: tpl, caret: tpl.length };",
  "  if (iS < 0) return { text: tpl.slice(0, iC) + tpl.slice(iC + 1), caret: iC };",
  "  if (iC < 0) return { text: tpl.slice(0, iS) + sel + tpl.slice(iS + 1), caret: iS + sel.length };",
  "  if (iS < iC) {",
  "    return {",
  "      text: tpl.slice(0, iS) + sel + tpl.slice(iS + 1, iC) + tpl.slice(iC + 1),",
  "      caret: iS + sel.length + (iC - iS - 1),",
  "    };",
  "  }",
  "  return {",
  "    text: tpl.slice(0, iC) + tpl.slice(iC + 1, iS) + sel + tpl.slice(iS + 1),",
  "    caret: iC,",
  "  };",
  "}",
  "",
  "/* 行首已存在的章节命令（用于标题升降级：只换命令、保留标题文本） */",
  "const HEAD_RE = /^\\s*\\\\(?:part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\\*?\\s*\\{([\\s\\S]*)\\}\\s*$/;",
].join("\n");

{
  const i0 = s.indexOf("/* 常用结构插入");
  const i2 = s.indexOf("\n];", s.indexOf("const INSERTS = [", i0));
  if (i0 < 0 || i2 < 0) { console.error("✗ FAIL 找不到 INSERTS 段落边界"); process.exit(1); }
  s = s.slice(0, i0) + MODULE_BLOCK + s.slice(i2 + 3);   // +3 跳过 "\n];"
  hits++;
  console.log("  ok   模块级：UI_CSS + 插入表分组 + FMT 快捷键表 + expandTpl");
}

/* ======================================================================
 * 2) 组件内：fmtRef 桥（root 捕获层要用最新闭包，不能锁旧 content）
 * ==================================================================== */
rep(
  "  const goViewRef = useRef(null);\n  const viewRef = useRef(view);\n  const atomEditRef = useRef(null);\n",
  "  const goViewRef = useRef(null);\n  const viewRef = useRef(view);\n  const atomEditRef = useRef(null);\n  /* v0.8.6：格式化快捷键的执行函数。root 捕获层的订阅只挂一次（deps=[]），\n   * 直接闭包会把第一次渲染的 content / onChange 锁死 —— 必须走 ref 拿最新那个。 */\n  const fmtRef = useRef(null);\n",
  "组件内：fmtRef 声明"
);

/* ======================================================================
 * 3) 组件内：root 捕获层加格式键监听
 * ==================================================================== */
rep(
  "    root.addEventListener(\"keydown\", onCtrlSlash, true);   // 捕获阶段，先于组件内部的 onKeyDown\n    return () => root.removeEventListener(\"keydown\", onCtrlSlash, true);\n  }, []);",
  [
    "    /* v0.8.6：格式快捷键。与 Ctrl+/ 同一层（捕获阶段、挂在根节点上），",
    "     * 但**先自己判断该不该管**，不该管的原样放行 —— 见下面几行 return。 */",
    "    function onFmtKey(e) {",
    "      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;",
    "      const k = (e.key || \"\").toLowerCase();",
    "      if (e.key === \"Tab\" || k === \"s\" || e.key === \"/\") return;   // 让位：缩进 / 保存 / 切视图",
    "      const ta = taRef.current;",
    "      /* 只在源码输入框聚焦时接管。预览区是 contenteditable 的就地编辑，",
    "       * 在那儿按 Ctrl+B 该干嘛不该由我们决定 —— 不碰。 */",
    "      if (!ta || document.activeElement !== ta) return;",
    "      const fn = fmtRef.current;",
    "      if (typeof fn !== \"function\") return;",
    "      if (!fn(e)) return;   // 没命中这一套键位 → 放行，不拦",
    "      e.preventDefault();",
    "      e.stopPropagation();",
    "    }",
    "    root.addEventListener(\"keydown\", onCtrlSlash, true);   // 捕获阶段，先于组件内部的 onKeyDown",
    "    root.addEventListener(\"keydown\", onFmtKey, true);      // v0.8.6 格式快捷键",
    "    return () => {",
    "      root.removeEventListener(\"keydown\", onCtrlSlash, true);",
    "      root.removeEventListener(\"keydown\", onFmtKey, true);",
    "    };",
    "  }, []);",
  ].join("\n"),
  "组件内：root 捕获层挂 onFmtKey"
);

/* ======================================================================
 * 4) 组件内：编辑行为区新增 applyFmt / applyHead
 * ==================================================================== */
rep(
  "  /* ---------- 编辑行为 ---------- */\n  function insert(text, back) {",
  [
    "  /* ---------- 编辑行为 ---------- */",
    "  /* v0.8.6：把「就地改这几个字」和「按快捷键」收敛到同一处 —— 两者都是",
    "   * 「换掉选区那段文本，再把光标放到该去的地方」，区别只是文本从哪来。 */",
    "",
    "  /** 章节层级：有选区包住；没选区改当前整行。原本已是章节命令 → 只换层级、保留标题。 */",
    "  function applyHead(cmd) {",
    "    const ta = taRef.current; if (!ta) return;",
    "    const s0 = ta.selectionStart, e0 = ta.selectionEnd;",
    "    if (e0 > s0) {",
    "      const sel = content.slice(s0, e0);",
    "      const ins = cmd ? \"\\\\\" + cmd + \"{\" + sel + \"}\" : sel;",
    "      onChange(content.slice(0, s0) + ins + content.slice(e0));",
    "      pendingRange.current = [s0 + ins.length, s0 + ins.length];",
    "      return;",
    "    }",
    "    const ls = content.lastIndexOf(\"\\n\", s0 - 1) + 1;",
    "    let le = content.indexOf(\"\\n\", s0);",
    "    if (le < 0) le = content.length;",
    "    const m = HEAD_RE.exec(content.slice(ls, le));",
    "    const title = m ? m[1] : content.slice(ls, le).trim();",
    "    const ins = cmd ? \"\\\\\" + cmd + \"{\" + title + \"}\" : title;",
    "    onChange(content.slice(0, ls) + ins + content.slice(le));",
    "    const caret = ls + (cmd ? ins.length - 1 : ins.length);   // 标题末尾、} 之前",
    "    pendingRange.current = [caret, caret];",
    "  }",
    "",
    "  /**",
    "   * 格式快捷键的统一入口。命中返回 true（由调用方 preventDefault）。",
    "   * 只处理「源码 / 分屏」里的 textarea —— 调用方已保证焦点在那儿。",
    "   */",
    "  function applyFmt(e) {",
    "    const k = (e.key || \"\").toLowerCase();",
    "    const code = e.code || \"\";",
    "    let hit = null;",
    "    for (let i = 0; i < FMT.length; i++) {",
    "      const f = FMT[i];",
    "      if (!!f.shift !== !!e.shiftKey) continue;",
    "      if (f.code ? code === f.code : k === f.k) { hit = f; break; }",
    "    }",
    "    if (!hit) return false;",
    "    if (hit.head != null) { applyHead(hit.head); return true; }",
    "    const ta = taRef.current;",
    "    if (!ta) return false;",
    "    const s0 = ta.selectionStart, e0 = ta.selectionEnd;",
    "    const hasSel = e0 > s0;",
    "    const tpl = (hasSel && hit.s) ? hit.s : hit.e;",
    "    if (!tpl) return false;",
    "    const ex = expandTpl(tpl, hasSel ? content.slice(s0, e0) : \"\");",
    "    onChange(content.slice(0, s0) + ex.text + content.slice(e0));",
    "    pendingRange.current = [s0 + ex.caret, s0 + ex.caret];   // 选区收起、落在该在的地方",
    "    return true;",
    "  }",
    "",
    "  fmtRef.current = applyFmt;   // 交给 root 捕获层（它在 useEffect 里只挂一次）",
    "",
    "  function insert(text, back) {",
  ].join("\n"),
  "组件内：applyHead / applyFmt + fmtRef 赋值"
);

/* ======================================================================
 * 5) 组件内：光标回填支持「区间」（格式快捷键要能一次落到指定位）
 * ==================================================================== */
rep(
  [
    "  useEffect(() => {",
    "    if (pendingCursor.current != null && taRef.current) {",
    "      const p = pendingCursor.current;",
    "      pendingCursor.current = null;",
    "      taRef.current.focus();",
    "      try { taRef.current.setSelectionRange(p, p); } catch (e) {}",
    "    }",
    "  }, [content]);",
  ].join("\n"),
  [
    "  useEffect(() => {",
    "    const ta = taRef.current;",
    "    if (!ta) return;",
    "    /* 区间优先（格式快捷键 / 章节层级走这条）：一次把光标放到指定位。",
    "     * 两个 ref 同时有值时以区间为准，并顺手清掉另一个 —— 否则它会在下一拍",
    "     * 把光标又拽回旧位置。 */",
    "    if (pendingRange.current) {",
    "      const r = pendingRange.current;",
    "      pendingRange.current = null;",
    "      pendingCursor.current = null;",
    "      ta.focus();",
    "      try { ta.setSelectionRange(r[0], r[1]); } catch (e) {}",
    "      return;",
    "    }",
    "    if (pendingCursor.current != null) {",
    "      const p = pendingCursor.current;",
    "      pendingCursor.current = null;",
    "      ta.focus();",
    "      try { ta.setSelectionRange(p, p); } catch (e) {}",
    "    }",
    "  }, [content]);",
  ].join("\n"),
  "组件内：pendingRange 优先回填"
);

/* pendingRange 声明（紧挨 pendingCursor，保证词法顺序在使用之前 —— 别踩 TDZ） */
rep(
  "  const pendingCursor = useRef(null);\n",
  "  const pendingCursor = useRef(null);\n  /* v0.8.6：格式快捷键回填用的区间；见下面那个 [content] effect */\n  const pendingRange = useRef(null);\n",
  "组件内：pendingRange 声明"
);

/* ======================================================================
 * 6) 样式注入：把 UI_CSS 一起挂上
 * ==================================================================== */
rep(
  "<style dangerouslySetInnerHTML={{ __html: PV_CSS + WYS_CSS }} />",
  "<style dangerouslySetInnerHTML={{ __html: PV_CSS + WYS_CSS + UI_CSS }} />",
  "样式注入加 UI_CSS"
);

/* ======================================================================
 * 7) 菜单：分组 + 键位提示（把快捷键「变得看得见」）
 * ==================================================================== */
rep(
  "            <button style={tbtn} onClick={() => setMenu(!menu)} title=\"在光标处插入常用结构\">＋ 插入 {menu ? \"▴\" : \"▾\"}</button>",
  "            <button style={tbtn} onClick={() => setMenu(!menu)} title=\"插入常用结构（右侧标注的快捷键，在源码 / 分屏视图生效）\">＋ 插入 {menu ? \"▴\" : \"▾\"}</button>",
  "菜单：按钮 title 说明快捷键适用范围"
);

rep(
  "left: 0, zIndex: 40, minWidth: 150, padding: 4, borderRadius: 8",
  "left: 0, zIndex: 40, minWidth: 224, maxHeight: 430, overflowY: \"auto\", padding: 4, borderRadius: 8",
  "菜单：加宽并限高（分组后条目变多）"
);

rep(
  [
    "                {INSERTS.map((it) => (",
    "                  <button",
    "                    key={it[0]}",
    "                    onClick={() => { insert(it[1], it[2]); setMenu(false); }}",
    "                    style={{ display: \"block\", width: \"100%\", textAlign: \"left\", border: \"none\", background: \"transparent\", color: \"hsl(var(--popover-foreground))\", fontFamily: \"inherit\", fontSize: 12, padding: \"5px 8px\", borderRadius: 5, cursor: \"pointer\" }}",
    "                  >{it[0]}</button>",
    "                ))}",
  ].join("\n"),
  [
    "                {INSERT_GROUPS.map((g) => {",
    "                  const rows = INSERTS.filter((it) => it[4] === g);",
    "                  if (!rows.length) return null;",
    "                  return (",
    "                    <div key={g}>",
    "                      <div className=\"lx-mh\">{g}</div>",
    "                      {rows.map((it) => (",
    "                        <button key={it[0]} className=\"lx-mi\" onClick={() => { insert(it[1], it[2]); setMenu(false); }}>",
    "                          <span>{it[0]}</span>",
    "                          {it[3] ? <span className=\"lx-kbd\">{it[3]}</span> : null}",
    "                        </button>",
    "                      ))}",
    "                    </div>",
    "                  );",
    "                })}",
  ].join("\n"),
  "菜单：分组渲染 + 右侧键位提示"
);

/* ======================================================================
 * 落盘
 * ==================================================================== */
const out = isCRLF ? s.replace(/\n/g, "\r\n") : s;
fs.writeFileSync(P, out, "utf8");

const dl = out.split("\n").length - orig.split("\n").length;
console.log("\n✓ " + hits + " 处补丁全部命中并写入");
console.log("  panels/editor.tsx: " + orig.split("\n").length + " → " + out.split("\n").length + " 行（净 " + (dl >= 0 ? "+" : "") + dl + "）");
const back = fs.readFileSync(P, "utf8");
console.log("  行尾: " + (back.indexOf("\r\n") >= 0 ? "CRLF" : "LF") + "（原文 " + (isCRLF ? "CRLF" : "LF") + "）");
console.log("  字节: " + rawIn.length + " → " + Buffer.byteLength(out, "utf8"));
