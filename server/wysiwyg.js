"use strict";
/* =====================================================================
 * WYSIWYG 块模型 + 块级回写内核 —— 方案 A 核心（零依赖，Browser / Node 双端通用）
 *
 * 设计红线（为什么不做「HTML → LaTeX」全量重建）：
 *   LaTeX 是编程语言，而预览渲染层是有损的——
 *     \cite{vaswani2017} → "[1]"
 *     \ref{fig:model}    → "图 1"
 *     \includegraphics   → 只显示占位文件名
 *   若由渲染结果反向生成源码，用户敲一次字就会烧掉 \cite / \ref / 宏定义，
 *   对论文作者等于丢稿。
 *
 *   因此本内核只做「行区间外科手术」：
 *     1) 每个块记录 [startLine, endLine]（0 基、闭区间）；
 *     2) 只有用户真正改动过的块，才用它自己的新文本替换它自己的行区间；
 *     3) 未改动的块逐字节原样保留（applyEdits(src, []) === src 是硬约束）。
 *   行内同理：\cite / \ref / $..$ 渲染成原子节点，回写时原样吐出 data-tex；
 *   没被编辑过的内容绝不重新生成。
 *
 * 注意：文件末尾的导出语句会被构建脚本改写为 const WYS 常量——
 *   导出对象内不得出现嵌套花括号（构建正则用 [^}]* 匹配）。
 * =================================================================== */

/* ---------- 行工具 ---------- */
function splitLines(src) {
  return String(src == null ? "" : src).split("\n");
}
function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/* 去掉未转义的 % 注释部分 */
function stripComment(L) {
  for (let j = 0; j < L.length; j++) {
    if (L[j] === "%" && L[j - 1] !== "\\") return L.slice(0, j);
  }
  return L;
}
/* 平衡读取 {..} */
function readGroup(s, i) {
  if (s[i] !== "{") return { body: "", next: i };
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === "\\") { j++; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return { body: s.slice(i + 1, j), next: j + 1 }; }
  }
  return { body: s.slice(i + 1), next: s.length };
}

/* ---------- 环境分类 ---------- */
const ENV_MATH = ["equation", "equation*", "align", "align*", "alignat", "alignat*", "gather", "gather*",
  "multline", "multline*", "eqnarray", "eqnarray*", "flalign", "flalign*", "displaymath", "dmath",
  "dmath*", "IEEEeqnarray", "IEEEeqnarray*", "split", "cases", "array", "matrix", "pmatrix",
  "bmatrix", "vmatrix", "Vmatrix", "smallmatrix", "subequations"];
const ENV_FLOAT = ["figure", "figure*", "table", "table*", "wrapfigure", "sidewaysfigure",
  "sidewaystable", "subfigure", "SCfigure", "algorithm", "algorithm*"];
const ENV_CODE = ["verbatim", "verbatim*", "lstlisting", "minted", "alltt", "comment", "filecontents"];
const ENV_BIB = ["thebibliography"];
const ENV_LIST = ["itemize", "enumerate", "description"];
const ENV_TEXT = ["quote", "quotation", "abstract", "center", "flushleft", "flushright", "verse",
  "minipage", "theorem", "lemma", "corollary", "proposition", "definition", "remark", "example",
  "proof", "assumption", "claim", "note", "framed", "shaded", "tcolorbox"];

function classifyEnv(env) {
  const bare = String(env).replace(/\*$/, "");
  if (ENV_MATH.indexOf(bare) >= 0) return { type: "math", label: "公式" };
  if (ENV_FLOAT.indexOf(bare) >= 0) return { type: "float", label: "浮动体" };
  if (ENV_CODE.indexOf(bare) >= 0) return { type: "code", label: "代码 / 原样" };
  if (ENV_BIB.indexOf(bare) >= 0) return { type: "bib", label: "参考文献" };
  if (ENV_LIST.indexOf(bare) >= 0) return { type: "list", label: "列表" };
  if (ENV_TEXT.indexOf(bare) >= 0) return { type: "text-env", label: "文本环境" };
  return { type: "env", label: "环境" };
}

const HEAD_LV = { part: 0, chapter: 0, section: 1, subsection: 2, subsubsection: 3, paragraph: 4, subparagraph: 5 };

/* 段落内联原子命令（渲染成不可编辑原子节点，回写时原样吐出 tex） */
const INLINE_ATOMIC = ["cite", "citep", "citet", "citealp", "citeauthor", "citeyear", "ref", "eqref",
  "pageref", "autoref", "nameref", "cref", "Cref", "cpageref", "label", "footnote", "footnotemark",
  "url", "href", "includegraphics", "input", "include", "bibliography", "index", "gls", "Gls"];
/* 内联包裹命令（外层原子、内层可编辑 → 回写时 open + inner + "}"） */
const INLINE_WRAP = ["textbf", "emph", "textit", "texttt", "underline", "textsc", "textrm", "textsf",
  "textsl", "mbox", "textsuperscript", "textsubscript", "textnormal", "mathbf", "mathrm", "mathit",
  "operatorname", "textrm"];

/* ---------- 结构起点判定：段落到此截断 ---------- */
function startsStructure(L) {
  return /^\s*(?:\\begin\s*\{|\\end\s*\{|\\\[|\$\$|%|\\(?:part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\s*\*?\s*(?:\[|\{)|\\maketitle\b|\\tableofcontents\b|\\newpage\b|\\clearpage\b|\\appendix\b|\\bibliography\b|\\printbibliography\b)/.test(L);
}

/* 找与 start 行 \begin{env} 配对的 \end{env}（支持同名嵌套） */
function findEnvEnd(lines, start, env) {
  const re = new RegExp("\\\\(begin|end)\\s*\\{\\s*" + escRe(env) + "\\s*\\}", "g");
  let depth = 0;
  for (let k = start; k < lines.length; k++) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(lines[k])) !== null) {
      if (m[1] === "begin") depth++;
      else { depth--; if (depth === 0) return k; }
    }
  }
  return lines.length - 1;
}

/* 花括号未闭合时向下续行（多行 \section{...} 等） */
function collectBalanced(lines, start) {
  let depth = 0;
  let sawBrace = false;
  for (let k = start; k < lines.length; k++) {
    const L = stripComment(lines[k]);
    for (let j = 0; j < L.length; j++) {
      const c = L[j];
      if (c === "\\") { j++; continue; }
      if (c === "{") { depth++; sawBrace = true; }
      else if (c === "}") depth--;
    }
    if (!sawBrace && k === start) return k;
    if (sawBrace && depth <= 0) return k;
  }
  return start;
}

/* 首个闭合符所在行（\[..\] / $$..$$，闭合符可能与开头同行） */
function findCloseLine(lines, start, openRe, closeRe) {
  for (let k = start; k < lines.length; k++) {
    let L = lines[k];
    if (k === start) L = L.replace(openRe, "");
    if (closeRe.test(L)) return k;
  }
  return lines.length - 1;
}

/* 拆出标题的 prefix / title / suffix —— 回写时只替换 title，保留 * 与 [短标题] 与 \label */
function parseHeading(text) {
  const m = /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\s*(\*?)\s*/.exec(text);
  if (!m) return null;
  let i = m.index + m[0].length;
  if (text[i] === "[") {
    let d = 0;
    for (let j = i; j < text.length; j++) {
      if (text[j] === "[") d++;
      else if (text[j] === "]") { d--; if (d === 0) { i = j + 1; break; } }
    }
  }
  while (text[i] === " " || text[i] === "\t") i++;
  if (text[i] !== "{") {
    return { name: m[1], starred: !!m[2], title: "", prefix: text.slice(0, i), suffix: text.slice(i) };
  }
  const g = readGroup(text, i);
  return { name: m[1], starred: !!m[2], title: g.body, prefix: text.slice(0, i + 1), suffix: text.slice(g.next - 1) };
}

/* =====================================================================
 * parseDoc(source) → { blocks, lineCount }
 * 每个 block：{ id, type, kind, startLine, endLine, raw, editable, atomic,
 *               label, level, title, prefix, suffix }
 *   type: preamble | heading | paragraph | math | float | code | bib | list
 *         | text-env | env | command | comment | tail
 *   editable=true  → 文本块（contenteditable 就地编辑）
 *   atomic=true    → 原子块（渲染为源码卡片，点击弹源）
 * =================================================================== */
function parseDoc(source) {
  const lines = splitLines(source);
  const n = lines.length;
  const blocks = [];
  let id = 0;

  function push(type, kind, s, e, extra) {
    const b = {
      id: id++, type: type, kind: kind,
      startLine: s, endLine: e,
      raw: lines.slice(s, e + 1).join("\n"),
      editable: false, atomic: true,
      label: "", level: 0, title: "", prefix: "", suffix: "",
    };
    if (extra) { for (const k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) b[k] = extra[k]; } }
    blocks.push(b);
    return b;
  }

  let i = 0;

  /* 导言区：0 .. \begin{document} 所在行（原样保留，不参与就地编辑） */
  let docBegin = -1;
  for (let k = 0; k < n; k++) {
    if (/^\s*\\begin\s*\{\s*document\s*\}/.test(lines[k])) { docBegin = k; break; }
  }
  if (docBegin >= 0) {
    push("preamble", "preamble", 0, docBegin, { label: "导言区" });
    i = docBegin + 1;
  }

  while (i < n) {
    const L = lines[i];
    if (!L.trim()) { i++; continue; }          /* 空行留在源码里，不归属任何块 */

    if (/^\s*\\end\s*\{\s*document\s*\}/.test(L)) {
      push("tail", "enddocument", i, i, { label: "文档结尾" });
      i++; continue;
    }

    let m;

    /* 环境块 */
    m = /^\s*\\begin\s*\{\s*([a-zA-Z]+\*?)\s*\}/.exec(L);
    if (m) {
      const env = m[1];
      const e = findEnvEnd(lines, i, env);
      const cls = classifyEnv(env);
      push(cls.type, env, i, e, { label: cls.label });
      i = e + 1; continue;
    }

    /* 章标题 */
    m = /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\s*\*?\s*(?:\[|\{)/.exec(L);
    if (m) {
      const e = collectBalanced(lines, i);
      const h = parseHeading(lines.slice(i, e + 1).join("\n")) || {};
      push("heading", m[1], i, e, {
        label: "标题", editable: true, atomic: false,
        level: HEAD_LV[m[1]] != null ? HEAD_LV[m[1]] : 1,
        title: h.title || "", prefix: h.prefix || "", suffix: h.suffix || "",
      });
      i = e + 1; continue;
    }

    /* \[ ... \] */
    if (/^\s*\\\[/.test(L)) {
      const e = findCloseLine(lines, i, /^\s*\\\[/, /\\\]/);
      push("math", "\\[\\]", i, e, { label: "公式" });
      i = e + 1; continue;
    }
    /* $$ ... $$ */
    if (/^\s*\$\$/.test(L)) {
      const e = findCloseLine(lines, i, /^\s*\$\$/, /\$\$/);
      push("math", "$$", i, e, { label: "公式" });
      i = e + 1; continue;
    }

    /* 纯注释块 */
    if (/^\s*%/.test(L)) {
      let e = i;
      while (e + 1 < n && /^\s*%/.test(lines[e + 1])) e++;
      push("comment", "comment", i, e, { label: "注释" });
      i = e + 1; continue;
    }

    /* 单行命令块 */
    m = /^\s*\\(maketitle|tableofcontents|listoffigures|listoftables|newpage|clearpage|cleardoublepage|appendix|frontmatter|mainmatter|backmatter|bibliography|printbibliography|addbibresource|setcounter|vspace|hspace|noindent|centering|includegraphics|input|include)\b/.exec(L);
    if (m) {
      const e = collectBalanced(lines, i);
      push("command", m[1], i, e, { label: "命令 \\" + m[1] });
      i = e + 1; continue;
    }

    /* 正文段落：连续非空行，遇到下一个结构起点为止 */
    {
      let e = i;
      while (e + 1 < n && lines[e + 1].trim() && !startsStructure(lines[e + 1])) e++;
      push("paragraph", "paragraph", i, e, { label: "正文", editable: true, atomic: false });
      i = e + 1; continue;
    }
  }

  return { blocks: blocks, lineCount: n };
}

/* =====================================================================
 * applyEdits(source, edits) → newSource
 *   edits: [{ startLine, endLine, newText }]（0 基、闭区间）
 *   按 startLine 降序应用 → 前面的编辑不受后面行数变化影响。
 *   edits 为空时逐字节返回原文（硬约束，单测覆盖）。
 * =================================================================== */
function applyEdits(source, edits) {
  const src = String(source == null ? "" : source);
  if (!edits || !edits.length) return src;
  let lines = splitLines(src);
  const list = [];
  for (let k = 0; k < edits.length; k++) {
    const e = edits[k];
    if (!e || e.newText == null) continue;
    list.push({ startLine: e.startLine | 0, endLine: e.endLine | 0, newText: String(e.newText) });
  }
  if (!list.length) return src;
  list.sort(function (a, b) { return b.startLine - a.startLine; });
  for (let k = 0; k < list.length; k++) {
    const e = list[k];
    if (e.startLine < 0 || e.startLine >= lines.length) continue;
    const end = Math.min(e.endLine, lines.length - 1);
    lines = lines.slice(0, e.startLine).concat(e.newText.split("\n"), lines.slice(end + 1));
  }
  return lines.join("\n");
}

/* 标题回写：只替换标题主体，* 与 [短标题] 与 \label 原样保留 */
/* ---------- 「前缀 + 正文 + 后缀」：改显示而不改源码的落点 ----------
 * 标题、导言区每一项（\title / \author / \documentclass / \usepackage）都长这个样子：
 * 用户能改的只有中间那段「正文」，前后缀（\title{ … }）原样带回。
 * 硬不变式：**没改过的时候，拼回去必须逐字节等于原行**。
 * 这一条如果破了，「改显示」就变成了「重写源码」—— 用户的原稿会在某次无害编辑后变形。
 * 内核里只留这一份实现，编辑器 / 门禁 / 单测共用，避免各写各的（v0.7.3 的教训）。 */
function partsJoin(prefix, body, suffix) {
  return String(prefix == null ? "" : prefix) + String(body == null ? "" : body) + String(suffix == null ? "" : suffix);
}
function partsExact(block, origText) {
  if (!block) return false;
  return partsJoin(block.prefix, block.body, block.suffix) === String(origText == null ? "" : origText);
}
function headingTex(block, newTitle) {
  return partsJoin(block && block.prefix, newTitle, block && block.suffix);
}

/* ---------- 行内参数读取：\cmd[opt]{a}{b} ---------- */
function readArgs(s, i) {
  let j = i;
  const groups = [];
  for (;;) {
    if (s[j] === "[") {
      let d = 0, k = j, closed = false;
      for (; k < s.length; k++) {
        if (s[k] === "[") d++;
        else if (s[k] === "]") { d--; if (d === 0) { closed = true; k++; break; } }
      }
      if (!closed) break;
      j = k; continue;
    }
    if (s[j] === "{") {
      const open = j;
      const g = readGroup(s, j);
      if (g.next <= j) break;
      groups.push({ open: open, body: g.body, tex: s.slice(open, g.next), next: g.next });
      j = g.next; continue;
    }
    break;
  }
  return { groups: groups, next: groups.length ? j : i };
}

function findClose(s, pos, ch) {
  for (let j = pos; j < s.length; j++) {
    if (s[j] === "\\") { j++; continue; }
    if (s[j] === ch) return j;
  }
  return -1;
}

/* =====================================================================
 * parseInline(text) → 片段序列（行内解析）
 *   { t:"text",    v }              普通文本（可编辑）
 *   { t:"math",    tex, display }   行内公式（原子）
 *   { t:"cmd",     cmd, tex }       \cite \ref \label \footnote ...（原子）
 *   { t:"wrap",    cmd, open, inner } \textbf{} \emph{}（外层原子、内层可编辑）
 *   { t:"comment", v }              行内 % 注释（原子、置灰）
 * 不变式：segmentsToTex(parseInline(s)) === s（逐字节还原，单测覆盖）
 * =================================================================== */
function parseInline(text) {
  const s = String(text == null ? "" : text);
  const segs = [];
  let buf = "";
  let i = 0;
  function flush() { if (buf) { segs.push({ t: "text", v: buf }); buf = ""; } }

  while (i < s.length) {
    const c = s[i];

    /* 转义单字符：原样保留 */
    if (c === "\\" && i + 1 < s.length && "$%{}&_#\\".indexOf(s[i + 1]) >= 0) {
      buf += s.slice(i, i + 2); i += 2; continue;
    }

    /* 行内公式 $...$（$$ 交给块级处理） */
    if (c === "$" && s[i + 1] !== "$") {
      const e = findClose(s, i + 1, "$");
      if (e > 0) { flush(); segs.push({ t: "math", tex: s.slice(i, e + 1), display: false }); i = e + 1; continue; }
    }
    /* \( ... \) */
    if (c === "\\" && s[i + 1] === "(") {
      const e = s.indexOf("\\)", i + 2);
      if (e >= 0) { flush(); segs.push({ t: "math", tex: s.slice(i, e + 2), display: false }); i = e + 2; continue; }
    }

    /* 未转义 % → 其余全是注释 */
    if (c === "%") {
      flush(); segs.push({ t: "comment", v: s.slice(i) }); i = s.length; continue;
    }

    /* \cmd / \cmd{..} / \cmd[..]{..} */
    if (c === "\\") {
      const m = /^\\([a-zA-Z@]+)/.exec(s.slice(i));
      if (m) {
        const name = m[1];
        const cmdEnd = i + m[0].length;
        const star = s[cmdEnd] === "*" ? "*" : "";
        const afterStar = cmdEnd + star.length;
        const args = readArgs(s, afterStar);
        if (args.groups.length) {
          if (INLINE_ATOMIC.indexOf(name) >= 0) {
            flush(); segs.push({ t: "cmd", cmd: name, tex: s.slice(i, args.next) }); i = args.next; continue;
          }
          if (INLINE_WRAP.indexOf(name) >= 0 && args.groups.length === 1 && !star) {
            const g = args.groups[0];
            flush();
            segs.push({ t: "wrap", cmd: name, open: s.slice(i, g.open + 1), inner: g.body });
            i = args.next; continue;
          }
          /* 未登记命令 → 一律按原子处理（安全第一，绝不臆造语义） */
          flush(); segs.push({ t: "cmd", cmd: name, tex: s.slice(i, args.next) }); i = args.next; continue;
        }
        buf += s.slice(i, afterStar); i = afterStar; continue;
      }
    }

    buf += c; i++;
  }
  flush();
  return segs;
}

/* parseInline 的逆运算 */
function segmentsToTex(segs) {
  let out = "";
  const arr = segs || [];
  for (let k = 0; k < arr.length; k++) {
    const g = arr[k];
    if (!g) continue;
    if (g.t === "text") out += g.v;
    else if (g.t === "math") out += g.tex;
    else if (g.t === "cmd") out += g.tex;
    else if (g.t === "comment") out += g.v;
    else if (g.t === "wrap") out += g.open + g.inner + "}";
  }
  return out;
}


/* =====================================================================
 * headingNumbers(blocks) -> Map<blockId, "2.1">
 *
 * 与只读预览 preview-core.parseBlocks 的编号规则**同构**：
 *     idx = HEAD_LV[name]；星号标题 / \paragraph 不编号；
 *     c[idx]++ 并把更深的计数清零；chapter 只给主序号，其余给 "a.b.c" 点分。
 *
 * 为什么需要它：v0.8.0 拆掉了「就地编辑 / 只读」这个模式开关，预览区就是文档本身。
 * 既然是在**结果**上编辑，标题就得显示成 `2 引言` 的样子，而不是 `\section{引言}`。
 * 编号本身不可编辑 —— 改标题文字，编号自己会重算（跟 Word 一致）。
 *
 * 注意 part 被刻意跳过：preview-core 的标题正则不认 \part，为保持一致这里也不编号。
 * =================================================================== */
function headingNumbers(blocks) {
  const c = [0, 0, 0, 0];
  const out = new Map();
  const list = blocks || [];
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (!b || b.type !== "heading") continue;
    if (b.kind === "part") { out.set(b.id, ""); continue; }
    const idx = HEAD_LV[b.kind] != null ? HEAD_LV[b.kind] : 1;
    const starred = /\*/.test(String(b.prefix || ""));
    if (starred || b.kind === "paragraph" || idx > 3) { out.set(b.id, ""); continue; }
    c[idx]++;
    for (let k = idx + 1; k <= 3; k++) c[k] = 0;
    out.set(b.id, idx === 0 ? String(c[0]) : c.slice(1, idx + 1).join("."));
  }
  return out;
}

/* ---------- 导言区结构化：\documentclass / \usepackage / \title / \author / \date ----------
 * 返回每一项的 { cmd, s, e, tex, prefix, body, suffix, opt }：
 *   s / e    该项在整篇里的行区间（0 基，含首尾）—— 就地编辑只替换这个区间
 *   tex      该项的完整原文（多行命令会用 \n 连接）
 *   prefix   正文之前的全部字符（\title{ / \documentclass[12pt]{ …）
 *   body     真正给用户改的那一段
 *   suffix   正文之后的全部字符（}）
 * 硬不变式：prefix + body + suffix === tex（逐字节）。check-v080-flat.js 会逐项对账。 */
function readBracket(s, i) {
  if (s[i] !== "[") return { body: "", next: i, ok: false };
  let d = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === "\\") { j++; continue; }
    if (c === "[") d++;
    else if (c === "]") { d--; if (d === 0) return { body: s.slice(i + 1, j), next: j + 1, ok: true }; }
  }
  return { body: s.slice(i + 1), next: s.length, ok: true };
}

function cmdParts(tex, cmd) {
  const re = new RegExp("\\\\" + cmd + "(?![a-zA-Z])");
  const m = re.exec(tex);
  if (!m) return null;
  let i = m.index + m[0].length;
  const br = readBracket(tex, i);
  if (br.next > i) i = br.next;
  while (i < tex.length && (tex[i] === " " || tex[i] === "\t")) i++;
  if (tex[i] !== "{") return null;
  const g = readGroup(tex, i);
  return { prefix: tex.slice(0, i + 1), body: g.body, suffix: tex.slice(g.next - 1), opt: br.body };
}

const PREAMBLE_CMDS = ["documentclass", "usepackage", "title", "author", "date"];

function parsePreamble(raw, startLine) {
  const lines = splitLines(raw);
  const start = startLine || 0;
  const out = { title: null, author: null, date: null, cls: null, pkgs: [], lines: lines.length };
  for (let k = 0; k < lines.length; k++) {
    const L = lines[k];
    if (!stripComment(L).trim()) continue;
    let cmd = null;
    for (let c = 0; c < PREAMBLE_CMDS.length; c++) {
      if (new RegExp("\\\\" + PREAMBLE_CMDS[c] + "(?![a-zA-Z])").test(L)) { cmd = PREAMBLE_CMDS[c]; break; }
    }
    if (!cmd) continue;
    const e = collectBalanced(lines, k);                 /* \title{…} 允许跨行 */
    const tex = lines.slice(k, e + 1).join("\n");
    const p = cmdParts(tex, cmd);
    if (!p) continue;
    const item = { cmd: cmd, s: start + k, e: start + e, tex: tex, prefix: p.prefix, body: p.body, suffix: p.suffix, opt: p.opt };
    if (cmd === "title") out.title = item;
    else if (cmd === "author") out.author = item;
    else if (cmd === "date") out.date = item;
    else if (cmd === "documentclass") out.cls = item;
    else {
      /* 一个 \usepackage{a,b,c} 摊成多个标签；它们共享同一行，改任意一个都是改那一行 */
      const names = String(p.body).split(",").map(function (x) { return x.trim(); }).filter(Boolean);
      if (!names.length) names.push("");
      for (let n = 0; n < names.length; n++) {
        out.pkgs.push({ cmd: cmd, s: item.s, e: item.e, tex: item.tex, prefix: item.prefix, body: item.body, suffix: item.suffix, opt: item.opt, name: names[n] });
      }
    }
  }
  return out;
}

module.exports = { parseDoc: parseDoc, headingNumbers: headingNumbers, parsePreamble: parsePreamble, partsJoin: partsJoin, partsExact: partsExact, applyEdits: applyEdits, parseInline: parseInline, segmentsToTex: segmentsToTex, headingTex: headingTex, classifyEnv: classifyEnv, escHtml: escHtml, escRe: escRe, readGroup: readGroup };

