"use strict";
/* =====================================================================
 * LaTeX 子集 → HTML 预览内核（零依赖；Node 单测 / 浏览器面板双端通用）
 * renderPreview(source, opts) → { html }
 *   opts.renderMath(tex, displayMode) → HTML string（缺省用 miniMath 兜底）
 *   opts.baseDir   → .tex 所在目录（includegraphics 解析为 data-asset 绝对路径）
 * 约定：文件末尾的导出语句会被构建脚本改写为 const LPC 常量（注释里不要出现该导出语句的字样——0.3.0 曾让构建正则命中注释、漏掉真语句，导致编辑器加载失败）
 * =================================================================== */

/* ---------- 基础工具 ---------- */
function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function pvcEscAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function pvcSafeColor(s) {
  const t = String(s || "").trim();
  if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(t) || /^[a-zA-Z]+$/.test(t)) return t;
  return "";
}
function cntNL(s, idx) {
  let c = 0;
  for (let i = 0; i < idx; i++) if (s.charCodeAt(i) === 10) c++;
  return c;
}
function lineIndexOf(s, idx) { return cntNL(s, idx); }
function skipSpaces(s, i) { while (i < s.length && (s[i] === " " || s[i] === "\t")) i++; return i; }

function readGroup(s, i) { /* s[i]==="{" → 平衡读取 {..} */
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
function optArg(s, i) {
  if (s[i] !== "[") return { body: "", next: i };
  const e = s.indexOf("]", i + 1);
  if (e < 0) return { body: "", next: i };
  return { body: s.slice(i + 1, e), next: e + 1 };
}
function argAt(s, i) { /* 读一个参数：{..} 或单 token/字符 */
  i = skipSpaces(s, i);
  if (s[i] === "{") return readGroup(s, i);
  if (s[i] === "[") { const o = optArg(s, i); return { body: o.body, next: o.next }; }
  if (s[i] === "\\") { const m = /^\\[a-zA-Z]+|^[^\s]/.exec(s.slice(i)); if (m) return { body: m[0], next: i + m[0].length }; }
  if (i < s.length) return { body: s[i], next: i + 1 };
  return { body: "", next: i };
}
function findCmd(s, cmd, from) {
  const re = new RegExp("\\\\" + cmd + "(?![a-zA-Z])", "g");
  re.lastIndex = from || 0;
  const m = re.exec(s);
  if (!m) return null;
  let i = skipSpaces(s, m.index + m[0].length);
  const o = optArg(s, i);
  if (o.next > i) i = skipSpaces(s, o.next);
  if (s[i] !== "{") return null;
  const g = readGroup(s, i);
  return { idx: m.index, body: g.body, next: g.next };
}
function findEnvEnd(s, from, name) {
  const re = new RegExp("\\\\(begin|end)\\s*\\{" + name.replace(/\*/g, "\\*") + "\\}", "g");
  re.lastIndex = from;
  let depth = 1, m;
  while ((m = re.exec(s))) {
    if (m[1] === "begin") depth++;
    else { depth--; if (depth === 0) return m.index; }
  }
  return -1;
}
function stripLineComment(line) {
  let i = 0;
  while (i < line.length) {
    if (line[i] === "\\") { i += 2; continue; }
    if (line[i] === "%") return line.slice(0, i);
    i++;
  }
  return line;
}
function joinPath(base, rel) {
  if (!base) return rel;
  const b = base.replace(/[\\/]+$/, "");
  return b + "/" + rel.replace(/^[\\/]+/, "");
}

/* ---------- 符号表（miniMath 兜底 & inline 未知命令） ---------- */
const SYM = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η",
  theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π",
  rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  times: "×", div: "÷", pm: "±", mp: "∓", cdot: "·", cdots: "⋯", ldots: "…", dots: "…", vdots: "⋮", ddots: "⋱",
  leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠", approx: "≈", equiv: "≡", sim: "∼", simeq: "≃",
  cong: "≅", propto: "∝", infty: "∞", partial: "∂", nabla: "∇", sum: "∑", prod: "∏", int: "∫", oint: "∮",
  in: "∈", notin: "∉", ni: "∋", subset: "⊂", subseteq: "⊆", supset: "⊃", supseteq: "⊇", cup: "∪", cap: "∩",
  emptyset: "∅", varnothing: "∅", forall: "∀", exists: "∃", neg: "¬", lnot: "¬", land: "∧", lor: "∨",
  oplus: "⊕", otimes: "⊗", ominus: "⊖",
  rightarrow: "→", to: "→", leftarrow: "←", gets: "←", leftrightarrow: "↔", Rightarrow: "⇒",
  Leftarrow: "⇐", Leftrightarrow: "⇔", longrightarrow: "⟶", mapsto: "↦", uparrow: "↑", downarrow: "↓",
  top: "⊤", bot: "⊥", vdash: "⊢", models: "⊨", perp: "⊥", parallel: "∥", mid: "∣",
  ell: "ℓ", Re: "ℜ", Im: "ℑ", hbar: "ℏ", aleph: "ℵ", wp: "℘", angle: "∠", triangle: "△",
  star: "⋆", circ: "∘", bullet: "•", prime: "′",
  ln: "ln", log: "log", lim: "lim", max: "max", min: "min", sup: "sup", inf: "inf",
  sin: "sin", cos: "cos", tan: "tan", exp: "exp", det: "det", dim: "dim", gcd: "gcd", deg: "deg",
  TeX: "TeX", LaTeX: "LaTeX", today: "（今天）",
  /* v0.9.3：论文正文常见但此前缺失的符号 */
  dagger: "†", ddagger: "‡", dag: "†", ddag: "‡", S: "§", P: "¶", copyright: "©",
  lceil: "⌈", rceil: "⌉", lfloor: "⌊", rfloor: "⌋", langle: "⟨", rangle: "⟩",
  ast: "∗", surd: "√", checkmark: "✓", Box: "□", blacksquare: "■", diamond: "⋄",
  bmod: " mod ", pmod: " mod ", asymp: "≍", doteq: "≐", nmid: "∤",
};

/* ---------- miniMath：无 KaTeX 时的近似渲染（sub/sup/分数/根号/符号） ---------- */
function miniMath(tex, display) {
  let s = String(tex || "");
  s = s.replace(/\\label\s*\{[^}]*\}/g, "");
  s = s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  s = s.replace(/\\(left|right|big|Big|bigg|Bigg)\b/g, "");
  s = s.replace(/\\!/g, "").replace(/\\[,;:!]/g, " ").replace(/\\quad/g, "\u2003").replace(/\\qquad/g, "\u2003\u2003");
  s = s.replace(/\\(mathrm|mathbf|mathcal|mathbb|mathit|text|textrm|operatorname)\b/g, "");
  let prev;
  do { prev = s; s = s.replace(/\\frac\s*\{((?:[^{}]|\{[^{}]*\})*)\}\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, '<sup>$1</sup>&frasl;<sub>$2</sub>'); } while (s !== prev);
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)");
  s = s.replace(/\^\s*\{([^{}]*)\}/g, "<sup>$1</sup>");
  s = s.replace(/\^\s*(\\[a-zA-Z]+|\w)/g, "<sup>$1</sup>");
  s = s.replace(/_\s*\{([^{}]*)\}/g, "<sub>$1</sub>");
  s = s.replace(/_\s*(\\[a-zA-Z]+|\w)/g, "<sub>$1</sub>");
  s = s.replace(/\\([a-zA-Z]+)/g, (m0, c) => (SYM[c] != null ? SYM[c] : escHtml(c)));
  s = s.replace(/\\(.)/g, "$1");
  s = s.replace(/[{}]/g, "");
  return '<span class="pv-mini' + (display ? " pv-mini-d" : "") + '">' + s + "</span>";
}

/* ---------- 行内渲染 ---------- */
const ESC_MAP = { "%": "%", "&": "&amp;", "_": "_", "$": "$", "#": "#", "{": "{", "}": "}", "^": "^", "~": "~" };

function inline(s, ctx) {
  let out = "";
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === "\\") {
      const m = /^\\([a-zA-Z]+)\*?/.exec(s.slice(i));
      if (m) {
        const cmd = m[1];
        i += m[0].length;
        /* v0.9.3 用户宏：\newcommand / \renewcommand（含 \input 带进来的）先于内置命令查表 ——
         * TeX 语义就是宏优先。展开后递归渲染，深度闸 24 层（宏互引不炸栈）。 */
        if (ctx.macros && Object.prototype.hasOwnProperty.call(ctx.macros, cmd)) {
          const mac = ctx.macros[cmd];
          const macArgs = [];
          for (let k = 0; k < mac.nargs; k++) { const a = argAt(s, i); macArgs.push(a.body); i = a.next; }
          if ((ctx.__macDepth || 0) >= 24) continue;
          const macExp = mac.body.replace(/#(\d)/g, function (mm, d) { return macArgs[d - 1] != null ? macArgs[d - 1] : ""; });
          ctx.__macDepth = (ctx.__macDepth || 0) + 1;
          try { out += inline(macExp, ctx); } finally { ctx.__macDepth--; }
          continue;
        }
        switch (cmd) {
          case "textbf": { const g = argAt(s, i); i = g.next; out += "<strong>" + inline(g.body, ctx) + "</strong>"; break; }
          case "textit": case "emph": case "textsl": case "textup": { const g = argAt(s, i); i = g.next; out += "<em>" + inline(g.body, ctx) + "</em>"; break; }
          case "texttt": { const g = argAt(s, i); i = g.next; out += '<code class="pv-tt">' + inline(g.body, ctx) + "</code>"; break; }
          case "underline": case "uline": { const g = argAt(s, i); i = g.next; out += "<u>" + inline(g.body, ctx) + "</u>"; break; }
          case "mbox": case "text": { const g = argAt(s, i); i = g.next; out += inline(g.body, ctx); break; }
          case "ref": case "autoref": case "vref": case "pageref": { const g = argAt(s, i); i = g.next; out += ctx.ref(g.body, false); break; }
          case "eqref": { const g = argAt(s, i); i = g.next; out += ctx.ref(g.body, true); break; }
          case "cite": case "citep": case "citet": case "citealp": { const g = argAt(s, i); i = g.next; out += ctx.cite(g.body); break; }
          case "label": { const g = argAt(s, i); i = g.next; break; }
          case "footnote": { const g = argAt(s, i); i = g.next; out += ' <sup class="pv-fn">注: ' + inline(g.body, ctx) + "</sup>"; break; }
          case "item": { const g = optArg(s, i); i = g.next; break; }
          case "newline": case "cr": out += "<br/>"; break;
          case "nbsp": out += "&nbsp;"; break;
          case "quad": out += "\u2003"; break;
          case "qquad": out += "\u2003\u2003"; break;
          case "verb": { const m2 = /\|([^|]*)\|/.exec(s.slice(i)); if (m2) { out += '<code class="pv-tt">' + escHtml(m2[1]) + "</code>"; i += m2[0].length; } break; }
          case "input": case "include":
          /* v0.9.1: TOC/mini-TOC family silent inside paragraphs (block level renders the card) */
          case "minitoc": case "parttoc": case "secttoc": case "doparttoc": case "dominitoc": case "dosecttoc":
          case "tableofcontents": case "faketableofcontents": case "listoffigures": case "listoftables": { const g = argAt(s, i); i = g.next; break; }
          /* v0.9.3：正文常见命令补齐 */
          case "textsc": { const g = argAt(s, i); i = g.next; out += '<span class="pv-sc">' + inline(g.body, ctx) + "</span>"; break; }
          case "url": { const g = argAt(s, i); i = g.next; const u = g.body.trim(); out += '<a class="pv-url" href="' + pvcEscAttr(/^[a-z]+:/i.test(u) ? u : "https://" + u) + '" target="_blank" rel="noreferrer">' + inline(g.body, ctx) + "</a>"; break; }
          case "href": { const g1 = argAt(s, i); const g2 = argAt(s, g1.next); i = g2.next; const u = g1.body.trim(); out += '<a class="pv-url" href="' + pvcEscAttr(/^[a-z]+:/i.test(u) ? u : "https://" + u) + '" target="_blank" rel="noreferrer">' + inline(g2.body, ctx) + "</a>"; break; }
          /* \color{..}：作用域颜色做不便宜，只吞参数 —— 否则 \todo 展开会把 "red" 当正文漏出来 */
          case "color": { const g = argAt(s, i); i = g.next; break; }
          case "textcolor": { const c1 = argAt(s, i); const g = argAt(s, c1.next); i = g.next; const col = pvcSafeColor(c1.body); out += col ? '<span style="color:' + col + '">' + inline(g.body, ctx) + "</span>" : inline(g.body, ctx); break; }
          case "marginpar": { const g = argAt(s, i); i = g.next; out += '<span class="pv-marg">📌 ' + inline(g.body, ctx) + "</span>"; break; }
          /* ICLR/ACL 式多作者排版：\AND 分块换行，\And{名字} 一块 */
          case "AND": out += "<br/>"; break;
          case "And": { const g = argAt(s, i); i = g.next; out += inline(g.body, ctx) + "<br/>"; break; }
          default: {
            if (SYM[cmd] != null) { out += SYM[cmd]; break; }
            let j = skipSpaces(s, i);
            if (s[j] === "{") { const g = readGroup(s, j); out += inline(g.body, ctx); i = g.next; }
            else if (s[j] === "[") { const o = optArg(s, j); i = o.next; }
            /* v0.9.1: unknown commands no longer leak their name as literal text
             * (\doparttoc used to render as "doparttoc"); degrade silently like TeX would. */
            break;
          }
        }
        continue;
      }
      const ch = s[i + 1];
      if (ch === "\\") { out += "<br/>"; i += 2; continue; }
      if (ch && ESC_MAP[ch] != null) { out += ESC_MAP[ch]; i += 2; continue; }
      if (ch && "!,;: ".indexOf(ch) >= 0) { i += 2; continue; }
      out += ch; i += 1; continue;
    }
    if (c === "$") {
      if (s.slice(i, i + 2) === "$$") {
        const end = s.indexOf("$$", i + 2);
        if (end > 0) { out += ctx.math(s.slice(i + 2, end), true); i = end + 2; continue; }
      }
      const end = s.indexOf("$", i + 1);
      if (end > i + 0 && s[i + 1] !== "$") { out += ctx.math(s.slice(i + 1, end), false); i = end + 1; continue; }
      out += "$"; i++; continue;
    }
    if (c === "~") { out += "&nbsp;"; i++; continue; }
    if (c === "{") { const g = readGroup(s, i); out += inline(g.body, ctx); i = g.next; continue; }
    if (c === "}") { i++; continue; }
    if (c === "%") { i++; continue; }
    if (c === "-" && s[i + 1] === "-" && s[i + 2] === "-") { out += "—"; i += 3; continue; }
    if (c === "-" && s[i + 1] === "-") { out += "–"; i += 2; continue; }
    if (c === "`" && s[i + 1] === "`") { out += "\u201C"; i += 2; continue; }
    if (c === "'" && s[i + 1] === "'") { out += "\u201D"; i += 2; continue; }
    if (c === "`") { out += "\u2018"; i++; continue; }
    if (c === "'") { out += "\u2019"; i++; continue; }
    if (c === "&") { out += "&amp;"; i++; continue; }
    if (c === "<") { out += "&lt;"; i++; continue; }
    if (c === ">") { out += "&gt;"; i++; continue; }
    out += c; i++;
  }
  return out;
}

/* ---------- 结构扫描：label → 编号 / bibitem → 序号（供 ref/cite 解析） ---------- */
const HEAD_LV = { chapter: 0, section: 1, subsection: 2, subsubsection: 3, paragraph: 4, subparagraph: 5 };

function scanStruct(body, off) {
  const labels = new Map();
  const bib = new Map();
  const secNo = [0, 0, 0, 0, 0];
  const counters = { eq: 0, fig: 0, tab: 0 };
  const hre = /\\(chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)\s*/g;
  let m;
  const heads = [];
  while ((m = hre.exec(body))) {
    let i = skipSpaces(body, m.index + m[0].length);
    if (body[i] === "[") { const o = optArg(body, i); i = skipSpaces(body, o.next); }
    if (body[i] !== "{") continue;
    const g = readGroup(body, i);
    heads.push({ idx: m.index, end: g.next, line: off + lineIndexOf(body, m.index), name: m[1], starred: !!m[2] });
  }
  /* v0.9.3：\appendix 之后最外层章节改字母编号（与 parseBlocks 渲染侧同一套规则） */
  const appPos = [];
  let am;
  const are = /\\(?:appendix|appendices)\b/g;
  while ((am = are.exec(body))) appPos.push(am.index);
  let appMode = false, appTop = null;
  for (let i = 0; i < heads.length; i++) {
    const h = heads[i];
    let num = "";
    if (!h.starred) {
      const lv = HEAD_LV[h.name];
      if (lv <= 3) {
        if (!appMode) {
          for (let pp = 0; pp < appPos.length; pp++) {
            if (appPos[pp] < h.idx) { appMode = true; appTop = null; for (let z = 0; z < 4; z++) secNo[z] = 0; }
          }
        }
        secNo[lv]++;
        for (let k = lv + 1; k <= 3; k++) secNo[k] = 0;
        if (appMode) {
          if (appTop == null) appTop = lv;
          const appL = String.fromCharCode(64 + Math.max(1, secNo[appTop]));
          num = lv <= appTop ? appL : appL + "." + secNo.slice(appTop + 1, lv + 1).join(".");
        } else {
          num = lv === 0 ? String(secNo[0]) : secNo.slice(1, lv + 1).join(".");
        }
      }
    }
    h.num = num;
    const from = h.end, to = i + 1 < heads.length ? heads[i + 1].idx : body.length;
    const lm = /\\label\s*\{([^}]*)\}/.exec(body.slice(from, to));
    if (lm && num) labels.set(lm[1], { text: num, line: h.line, kind: "sec" });
  }
  const ere = /\\begin\s*\{(equation\*?|align\*?|gather\*?|multline\*?|eqnarray\*?|displaymath|figure\*?|table\*?|scheme\*?)\}/g;
  while ((m = ere.exec(body))) {
    const name = m[1];
    const endIdx = findEnvEnd(body, m.index + m[0].length, name);
    const inner = body.slice(m.index + m[0].length, endIdx < 0 ? body.length : endIdx);
    const line = off + lineIndexOf(body, m.index);
    const starred = name.indexOf("*") >= 0 || name === "displaymath";
    const isFloat = /^(figure|table|scheme)/.test(name);
    let display;
    if (isFloat) {
      if (name.indexOf("tab") === 0) { if (!starred) counters.tab++; display = "表 " + counters.tab; }
      else { if (!starred) counters.fig++; display = "图 " + counters.fig; }
    } else {
      if (!starred) counters.eq++;
      display = String(counters.eq);
    }
    const lm = /\\label\s*\{([^}]*)\}/.exec(inner);
    if (lm) labels.set(lm[1], { text: display, line: line, kind: isFloat ? "float" : "eq" });
  }
  const bre = /\\bibitem\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;
  let bn = 0;
  while ((m = bre.exec(body))) { bn++; bib.set(m[1], { n: bn, line: off + lineIndexOf(body, m.index) }); }
  return { labels, bib, heads };
}

/* ---------- 表格 ---------- */
function parseTable(inner, line, ctx) {
  let t = String(inner).replace(/\\(centering|small|footnotesize|scriptsize|rmfamily|cline\*?\{\d+-\d+\})/g, "");
  t = t.trim();
  const o = optArg(t, 0);
  if (o.next > 0) t = t.slice(o.next).trim();
  const cm = /^\{([^{}]*)\}/.exec(t);
  if (!cm) return '<div class="pv-code">' + escHtml(inner) + "</div>";
  const aligns = (cm[1].match(/[lcr]/g) || []).map((c) => (c === "l" ? "left" : c === "r" ? "right" : "center"));
  t = t.slice(cm[0].length);
  const segs = t.split(/\\\\(?:\s*\[[^\]]*\])?/);
  let html = '<div class="pv-tabwrap"><table class="pv-tab" data-line="' + line + '"><tbody>';
  let pendHline = false;
  for (let ri = 0; ri < segs.length; ri++) {
    let seg = segs[ri];
    const hasHline = /\\hline/.test(seg);
    seg = seg.replace(/\\hline/g, " ");
    if (ri === segs.length - 1 && !seg.trim()) break;
    if (!seg.trim()) { if (hasHline) pendHline = true; continue; }
    const cells = seg.split("&");
    html += "<tr" + (hasHline || pendHline ? ' class="pv-hr"' : "") + ">";
    for (let ci = 0; ci < cells.length; ci++) {
      const al = aligns[ci] || "center";
      html += '<td style="text-align:' + al + '">' + inline(cells[ci], ctx) + "</td>";
    }
    html += "</tr>";
    pendHline = false;
  }
  return html + "</tbody></table></div>";
}

/* ---------- 浮动体（figure / table） ---------- */
function renderFloat(name, inner, line, ctx) {
  const isTab = name.indexOf("tab") === 0;
  let no;
  const starred = name.indexOf("*") >= 0;
  if (isTab) { if (!starred) ctx.tabNo++; no = "表 " + ctx.tabNo; } else { if (!starred) ctx.figNo++; no = "图 " + ctx.figNo; }
  ctx.subNo = 0; /* v0.9.0：子图编号 (a)(b)(c) 每个 float 重排 */
  let body = inner;
  body = body.replace(/\\label\s*\{[^}]*\}/g, "").replace(/\\centering\b/g, "");
  body = body.replace(/^\s*\[[^\]]*\]/, "");
  /* v0.9.0：间距命令的参数旧版会漏成裸文本（"3mm"）—— 连参数一起剥 */
  body = body.replace(/\\(?:v|h)space\s*\*?\s*\{[^}]*\}/g, "");
  let bodyHtml = "";

  /* v0.9.0：子图（subfigure 环境 / \subfloat 宏）—— 旧版只渲染 float 里第一张图，
   * 其余连同子标题漏成裸文本。先把子图块逐个摘出来（img + 子标题 (a)(b)），
   * 剩余零散 includegraphics 再全局替换一次收干净（多图 float 只出第一张的旧病同修）。 */
  const imgTag = function (f, raster) {
    const extra = raster ? ' data-raster="1"' : "";
    return '<img class="pv-img" data-asset="' + escHtml(joinPath(ctx.baseDir, f)) + '"' + extra + ' alt="' + escHtml(f) + '" />';
  };
  const isRasterExt = function (f) {
    const ext = ((f.match(/\.([a-zA-Z0-9]+)$/) || [, ""])[1] || "").toLowerCase();
    return ext === "pdf" || ext === "eps" || !ext;
  };
  const subLabel = function (n) { return n < 26 ? String.fromCharCode(97 + n) : String(n + 1); };
  const renderSub = function (inner, capArg) {
    const im = /\\includegraphics\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/.exec(inner);
    if (!im) return "";
    const f = im[1].trim();
    let cap = "";
    /* v0.9.0：\subfloat 的子标题在可选参数里；subfigure 环境的才在组内 \caption */
    if (capArg) cap = inline(capArg, ctx);
    if (!cap) {
      const cm = /\\caption\s*(?![a-zA-Z])/.exec(inner);
      if (cm) {
        const g2 = readGroup(inner, skipSpaces(inner, cm.index + cm[0].length));
        if (g2.body) cap = inline(g2.body, ctx);
      }
    }
    return (
      '<div class="pv-subfig" style="display:inline-block;margin:0 6px;text-align:center;vertical-align:top">' +
      imgTag(f, isRasterExt(f)) +
      (cap ? '<div class="pv-subcap" style="font-size:12px;opacity:.75;margin-top:2px">(' + escHtml(subLabel(ctx.subNo++)) + ')&nbsp;' + cap + "</div>" : "") +
      "</div>"
    );
  };
  /* ① subfigure 环境（单层）：开/闭标记各换哨兵，按哨兵切出每个子图的内容 */
  body = body.replace(/\\begin\s*\{subfigure\}\s*\{[^}]*\}/g, "\x01SUB\x01").replace(/\\end\s*\{subfigure\}/g, "\x02END\x02");
  const SUBEND = "\x02END\x02";
  const subChunks = body.split("\x01SUB\x01");
  for (let si = 1; si < subChunks.length; si++) {
    const cut = subChunks[si].indexOf(SUBEND);
    const inner = cut >= 0 ? subChunks[si].slice(0, cut) : subChunks[si];
    bodyHtml += renderSub(inner);
    subChunks[si] = cut >= 0 ? subChunks[si].slice(cut + SUBEND.length) : "";
  }
  body = subChunks.join("");
  /* ② \subfloat[短标题]{...}（readGroup 平衡读花括号） */
  for (;;) {
    const sf = /\\subfloat\s*(?![a-zA-Z])/.exec(body);
    if (!sf) break;
    let gi = skipSpaces(body, sf.index + sf[0].length);
    const oo = optArg(body, gi);
    if (oo.next > gi) gi = skipSpaces(body, oo.next);
    const g = readGroup(body, gi);
    bodyHtml += renderSub(g.body, oo.body);
    body = body.slice(0, sf.index) + body.slice(g.next);
  }
  /* ③ 剩余零散 includegraphics：全局替换 */
  body = body.replace(/\\includegraphics\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g, function (m, f) {
    const ff = f.trim();
    bodyHtml += imgTag(ff, isRasterExt(ff));
    return "";
  });

  /* v0.9.0：float 主标题的提取挪到子图摘取**之后** —— 旧版先抓全文第一个
   * \caption，会把第一个子图的标题抢去当主标题（子图一没标题、主图错挂子标题）。 */
  let capHtml = "";
  const capM = /\\caption\s*(?![a-zA-Z])/.exec(body);
  if (capM) {
    let gi = skipSpaces(body, capM.index + capM[0].length);
    const oo = optArg(body, gi);
    if (oo.next > gi) gi = skipSpaces(body, oo.next);
    if (body[gi] === "{") {
      const g = readGroup(body, gi);
      capHtml = inline(g.body, ctx);
      body = body.slice(0, capM.index) + body.slice(g.next);
    }
  }
  bodyHtml += parseBlocks(body, line + 1, ctx);
  return (
    '<figure class="pv-float" data-line="' + line + '">' +
    bodyHtml +
    (capHtml ? "<figcaption>" + escHtml(no) + "&nbsp;&nbsp;" + capHtml + "</figcaption>" : "") +
    "</figure>"
  );
}

/* ---------- 参考文献 ---------- */
function renderBib(inner, line, ctx) {
  let s = String(inner)
    .replace(/\\begin\s*\{thebibliography\}/g, "")
    .replace(/\\end\s*\{thebibliography\}/g, "")
    .replace(/^\s*\{[^{}]*\}/, "");
  const re = /\\bibitem\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;
  const marks = [];
  let m;
  while ((m = re.exec(s))) marks.push({ key: m[1], idx: m.index, start: m.index + m[0].length });
  if (!marks.length) return "";
  let html = '<div class="pv-bib" data-line="' + line + '"><div class="pv-bib-t">参考文献</div>';
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].idx : s.length;
    const text = s.slice(marks[i].start, end);
    const at = line + cntNL(s, marks[i].idx);
    html += '<div class="pv-bibitem" data-line="' + at + '"><span class="pv-bibno">[' + (i + 1) + "]</span> " + inline(text, ctx) + "</div>";
  }
  return html + "</div>";
}

/* ---------- 列表 ---------- */
function splitTopItems(s) {
  const marks = [];
  const re = /\\item(?![a-zA-Z])/g;
  let depth = 0, m;
  const bre = /\\(begin|end)\s*\{([a-zA-Z*]+)\}/g;
  const events = [];
  while ((m = bre.exec(s))) events.push({ i: m.index, t: m[1] });
  let ei = 0;
  while ((m = re.exec(s))) {
    while (ei < events.length && events[ei].i < m.index) {
      depth += events[ei].t === "begin" ? 1 : -1;
      ei++;
    }
    if (depth === 0) marks.push(m.index);
  }
  const parts = [];
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1] : s.length;
    parts.push({ at: marks[i], text: s.slice(marks[i] + 5, end) });
  }
  return parts;
}

function renderList(name, inner, line, ctx) {
  const items = splitTopItems(inner);
  const tag = name === "enumerate" ? "ol" : "ul";
  let html = "<" + tag + ' class="pv-list" data-line="' + line + '">';
  for (const it of items) {
    const at = line + cntNL(inner, it.at);
    html += "<li>" + parseBlocks(it.text, at, ctx) + "</li>";
  }
  if (!items.length) html += "<li>" + parseBlocks(inner, line, ctx) + "</li>";
  return html + "</" + tag + ">";
}

/* ---------- 数学环境 ---------- */
const MATH_ENVS = {
  equation: 1, "equation*": 1, align: 1, "align*": 1, gather: 1, "gather*": 1,
  multline: 1, "multline*": 1, eqnarray: 1, "eqnarray*": 1, displaymath: 1, math: 1,
};

function renderMathEnv(name, inner, line, ctx) {
  const tex = String(inner).replace(/\\label\s*\{[^}]*\}/g, "").trim();
  let mh;
  try { mh = ctx.renderMath(tex, true); } catch (e) { mh = miniMath(tex, true); }
  const starred = /\*$/.test(name) || name === "displaymath" || name === "math";
  let no = "";
  if (!starred) { ctx.eqNo++; no = '<span class="pv-eqno">(' + ctx.eqNo + ")</span>"; }
  return '<div class="pv-eq" data-line="' + line + '"><div class="pv-eqbody">' + mh + "</div>" + no + "</div>";
}

/* ---------- 块级解析主循环 ---------- */
function nextStructure(body, from) {
  /* v0.9.1: \input/\include and the TOC family must be stop points too --
   * otherwise they get merged into a paragraph segment and silently eaten by inline()
   * (the reason AgentBench's seven body files never showed up). */
  const re = /\\(?:maketitle\b|chapter\b|section\b|subsection\b|subsubsection\b|paragraph\b|begin\s*\{|end\s*\{|input\b|include\b|tableofcontents\b|faketableofcontents\b|listoffigures\b|listoftables\b|minitoc\b|parttoc\b|secttoc\b|doparttoc\b|dominitoc\b|dosecttoc\b)/g;
  re.lastIndex = from + 1;
  const m = re.exec(body);
  return m ? m.index : body.length;
}

function paragraphsHtml(text, line0, ctx) {
  const parts = String(text).split(/\n[ \t]*\n+/);
  let out = "";
  let ln = line0;
  for (const p of parts) {
    const t = p.replace(/^[ \t]+|[ \t]+$/g, "");
    if (t) {
      const h = inline(t, ctx).replace(/^(<br\/>)+|(<br\/>)+$/g, "").trim();
      if (h) out += '<p data-line="' + ln + '">' + h + "</p>";
    }
    ln += cntNL(p, p.length) + 1;
  }
  return out;
}

/* ---------- v0.9.1 \input / \include -> file card ----------
 * Same ctx recursion: figure/table/eq/section numbering continues across files (TeX semantics).
 * incStack save/restore guards cycles (a->b->a) and depth (>6).
 * resolver returns {path} without content -> placeholder carries data-inc-pending for the panel;
 * no resolver (export fallback / unit tests) -> static placeholder. */
function renderInc(cmd, name, line, ctx) {
  const nm = String(name || "").trim();
  const label = nm ? nm + (/\.[a-zA-Z0-9]+$/.test(nm) ? "" : ".tex") : cmd + " file";
  const head = '<div class="pv-inc-h">📄 ' + escHtml(label) + "</div>";
  const R = ctx.inputResolver;
  let res = null;
  if (R && nm) { try { res = R(nm, ctx.baseDir); } catch (e) { res = null; } }
  if (!res || !res.path)
    return '<div class="pv-inc pv-inc-miss" data-line="' + line + '">' + head + '<div class="pv-inc-b pv-imgna">子文件内容在编译 PDF 时合并显示</div></div>';
  if (typeof res.content !== "string")
    return '<div class="pv-inc pv-inc-miss" data-line="' + line + '" data-inc-pending="' + escHtml(res.path) + '">' + head + '<div class="pv-inc-b pv-imgna">子文件加载中…</div></div>';
  if (ctx.incStack.indexOf(res.path) >= 0)
    return '<div class="pv-inc pv-inc-miss" data-line="' + line + '">' + head + '<div class="pv-inc-b pv-imgna">循环引用已截断（' + escHtml(label) + "）</div></div>";
  if (ctx.incStack.length >= 6)
    return '<div class="pv-inc pv-inc-miss" data-line="' + line + '">' + head + '<div class="pv-inc-b pv-imgna">嵌套超过 6 层已截断</div></div>';
  const saved = ctx.incStack;
  ctx.incStack = saved.concat([res.path]);
  let inner;
  try { inner = parseBlocks(String(res.content), line + 1, ctx); }
  finally { ctx.incStack = saved; }
  return '<div class="pv-inc" data-line="' + line + '" data-inc="' + escHtml(res.path) + '">' + head + '<div class="pv-inc-b">' + inner + "</div></div>";
}

function parseBlocks(body, lineOff, ctx) {
  let out = "";
  let pos = 0;
  const n = body.length;
  let guard = 0;
  while (pos < n && guard++ < 20000) {
    const rest = body.slice(pos);
    const atLine = lineOff + cntNL(body, pos);
    let m;
    if ((m = /^\\maketitle\b/.exec(rest))) { pos += m[0].length; continue; }
    if ((m = /^\\(chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)\s*/.exec(rest))) {
      let i = pos + m[0].length;
      i = skipSpaces(body, i);
      if (body[i] === "[") { const o = optArg(body, i); i = skipSpaces(body, o.next); }
      let title = "";
      if (body[i] === "{") { const g = readGroup(body, i); title = g.body; i = g.next; }
      const name = m[1];
      const starred = !!m[2];
      const lv = Math.min(HEAD_LV[name] + 1, 4);
      let num = "";
      if (!starred && lv <= 4 && name !== "paragraph") {
        const c = ctx.secNo;
        const idx = HEAD_LV[name];
        if (idx <= 3) { c[idx]++; for (let k = idx + 1; k <= 3; k++) c[k] = 0; }
        /* v0.9.3：附录区最外层编号走字母（TeX \appendix 语义）；正文区逻辑一字不动 */
        if (ctx.appMode) {
          if (ctx.appTop == null) ctx.appTop = idx;
          const appL = String.fromCharCode(64 + Math.max(1, c[ctx.appTop]));
          num = idx <= ctx.appTop ? appL : appL + "." + c.slice(ctx.appTop + 1, idx + 1).join(".");
        } else {
          num = idx === 0 ? String(c[0]) : c.slice(1, idx + 1).join(".");
        }
      }
      const tag = lv <= 3 ? "h" + lv : "p";
      const cls = lv <= 3 ? ' class="pv-h pv-h' + lv + '"' : ' class="pv-par"';
      const inner = num ? num + "&nbsp;&nbsp;" + inline(title, ctx) : "<strong>" + inline(title, ctx) + "</strong>";
      out += "<" + tag + cls + ' data-line="' + atLine + '">' + inner + "</" + tag + ">";
      pos = i;
      continue;
    }
    if ((m = /^\\begin\s*\{([a-zA-Z]+\*?)\}/.exec(rest))) {
      const name = m[1];
      const beginIdx = pos + m[0].length;
      const endM = findEnvEnd(body, beginIdx, name);
      const endIdx = endM < 0 ? body.length : endM;
      const inner = body.slice(beginIdx, endIdx);
      out += renderEnv(name, inner, atLine, ctx);
      pos = endM < 0 ? body.length : endIdx + ("\\end{" + name + "}").length;
      continue;
    }
    if ((m = /^\\(input|include)\b/.exec(rest))) {
      /* v0.9.1: no longer swallowed silently -- render as a file card (content inlined) */
      let ii = pos + m[0].length;
      ii = skipSpaces(body, ii);
      let nm = "";
      if (body[ii] === "{") { const g = readGroup(body, ii); nm = g.body; ii = g.next; }
      const io = optArg(body, ii); ii = io.next > ii ? io.next : ii;
      pos = ii;
      out += renderInc(m[1], nm, atLine, ctx);
      continue;
    }
    if ((m = /^\\(faketableofcontents|tableofcontents|listoffigures|listoftables|minitoc|parttoc|secttoc)\b/.exec(rest))) {
      /* v0.9.1: TOC family placeholders -- real ToC needs a compile; preview just marks the spot */
      let ti = pos + m[0].length;
      const to = optArg(body, ti); ti = to.next > ti ? to.next : ti;
      if (body[ti] === "{") { const g = readGroup(body, ti); ti = g.next; }
      pos = ti;
      const which = m[1];
      const small = which === "minitoc" || which === "parttoc" || which === "secttoc";
      const sayTxt = which === "listoffigures" ? "插图目录" : which === "listoftables" ? "表格目录" : small ? "小目录" : "目录";
      out += small
        ? '<div class="pv-tocmini" data-line="' + atLine + '">📑 ' + sayTxt + "（编译 PDF 后生成）</div>"
        : '<div class="pv-tocph" data-line="' + atLine + '">📑 ' + sayTxt + "（编译 PDF 后生成；章节跳转可用左侧大纲）</div>";
      continue;
    }
    /* v0.9.3：\appendix 之后最外层章节改字母编号（A、B、…，子级 A.1）。
     * 状态挂 ctx —— \input 进来的附录文件共享同一个 ctx，字母流不断。 */
    if ((m = /^\\(?:appendix|appendices)\b/.exec(rest))) {
      pos += m[0].length;
      ctx.appMode = true;
      ctx.appTop = null;
      ctx.secNo = [0, 0, 0, 0];
      continue;
    }
    if ((m = /^\\(end|clearpage|newpage|tableofcontents|printbibliography|centering|noindent|par\b|bigskip|medskip|smallskip|bibliographystyle|bibliography|doparttoc|dominitoc|dosecttoc)\b/.exec(rest))) {
      let i = pos + m[0].length;
      const o = optArg(body, i); i = o.next > i ? o.next : i;
      if (body[i] === "{") { const g = readGroup(body, i); i = g.next; }
      pos = i;
      continue;
    }
    if ((m = /^\\(label|hline|rule|vspace\*?|hspace\*?|setlength|renewcommand|newcommand|providecommand|usepackage|documentclass|item)\b/.exec(rest))) {
      let i = pos + m[0].length;
      const o = optArg(body, i); i = o.next > i ? o.next : i;
      if (body[skipSpaces(body, i)] === "{") { const g = readGroup(body, skipSpaces(body, i)); i = g.next; }
      pos = i;
      continue;
    }
    const nextIdx = nextStructure(body, pos);
    const segText = body.slice(pos, nextIdx);
    out += paragraphsHtml(segText, atLine, ctx);
    pos = nextIdx > pos ? nextIdx : pos + 1;
  }
  return out;
}

function renderEnv(name, inner, line, ctx) {
  if (MATH_ENVS[name]) return renderMathEnv(name, inner, line, ctx);
  if (name === "itemize" || name === "enumerate" || name === "description") return renderList(name, inner, line, ctx);
  if (name === "tabular" || name === "tabularx" || name === "longtable") return parseTable(inner, line, ctx);
  if (name === "verbatim" || name === "literal" || name === "lstlisting" || name === "minted")
    return '<pre class="pv-code" data-line="' + line + '">' + escHtml(inner) + "</pre>";
  if (name === "quote" || name === "quotation")
    return '<blockquote class="pv-quote" data-line="' + line + '">' + parseBlocks(inner, line + 1, ctx) + "</blockquote>";
  if (name === "center")
    return '<div class="pv-center" data-line="' + line + '">' + parseBlocks(inner, line + 1, ctx) + "</div>";
  if (name === "abstract")
    return '<div class="pv-abs" data-line="' + line + '"><div class="pv-abs-t">摘要</div>' + parseBlocks(inner, line + 1, ctx) + "</div>";
  if (/^(figure|table|scheme)/.test(name)) {
    const h = renderFloat(name, inner, line, ctx);
    return h;
  }
  if (name === "thebibliography") return renderBib(inner, line, ctx);
  return parseBlocks(inner, line + 1, ctx);
}

/* ---------- 上下文 ---------- */
function makeCtx(renderMathFn, struct, opts) {
  const ctx = {
    renderMath: renderMathFn || miniMath,
    math: function (tex, disp) { try { return this.renderMath(tex, disp); } catch (e) { return miniMath(tex, disp); } },
    baseDir: (opts && opts.baseDir) || "",
    labels: struct.labels,
    bib: struct.bib,
    secNo: [0, 0, 0, 0],
    eqNo: 0,
    figNo: 0,
    tabNo: 0,
    /* v0.9.1 multi-file: inputResolver(name, baseDir) -> {path, content} | {path} | null;
     * incStack = expanding-file stack (cycle & depth guard). */
    inputResolver: (opts && opts.inputResolver) || null,
    incStack: [],
    ref: function (keyRaw, eqref) {
      const k = String(keyRaw || "").trim();
      const L = this.labels.get(k);
      if (!L) return '<span class="pv-ref pv-bad" title="未定义的引用（校验会标出）">?' + escHtml(k) + "</span>";
      const t = eqref && L.kind === "eq" ? "(" + L.text + ")" : L.text;
      return '<span class="pv-ref" data-line="' + L.line + '" title="点击跳转到定义">' + escHtml(t) + "</span>";
    },
    cite: function (keysRaw) {
      const keys = String(keysRaw || "").split(",").map((x) => x.trim()).filter(Boolean);
      const parts = keys.map((k) => {
        const B = this.bib.get(k);
        if (!B) return '<span class="pv-cite pv-bad" title="未找到文献">?' + escHtml(k) + "</span>";
        return '<span class="pv-cite" data-line="' + B.line + '" title="点击跳转到文献">[' + B.n + "]</span>";
      });
      return parts.length ? parts.join("") : "";
    },
  };
  return ctx;
}

/* ---------- v0.9.3 用户宏收集 ----------
 * 扫全源（含导言区 —— main.tex 的 \model/\vpara/\num 全定义在 \begin{document} 之前），
 * 并对全源任意位置的 \input/\include 递归下钻（math_commands.tex 里几百个记号宏靠它）。
 * 认 \newcommand/\renewcommand/\providecommand（带 * 与可选 [n][默认] 均可）、无参分隔符的 \def、
 * \DeclareMathOperator。后定义覆盖先定义（renewcommand 语义）。
 * 不做参数分隔符（\def\x#1.#2{..}）与默认值替换：预览够用即可，别把子集做成 Full TeX。 */
function pvcCollectMacros(clean, resolver, baseDir) {
  const macros = {};
  const seen = new Set();
  const queue = [{ text: clean, dir: baseDir || "" }];
  let guard = 0;
  while (queue.length && guard++ < 30) {
    const job = queue.shift();
    const text = job.text;
    const re = /\\(?:newcommand|renewcommand|providecommand)\*?\s*\{?\s*\\([a-zA-Z]+)\s*\}?\s*(?:\[(\d)\](?:\[[^\]]*\])?)?\s*(?=\{)|\\def\s*\\([a-zA-Z]+)\s*(?=\{)|\\DeclareMathOperator\*?\s*\{?\s*\\([a-zA-Z]+)\s*\}?\s*(?=\{)/g;
    let m;
    while ((m = re.exec(text))) {
      const name = m[1] || m[3] || m[4];
      if (!name || text[re.lastIndex] !== "{") continue;
      const g = readGroup(text, re.lastIndex);
      const body = m[4] != null ? "\\operatorname{" + g.body + "}" : g.body;
      macros[name] = { nargs: m[2] ? parseInt(m[2], 10) : 0, body: body };
    }
    if (!resolver) continue;
    const ire = /\\(?:input|include)\s*\{([^}]*)\}/g;
    while ((m = ire.exec(text))) {
      const nm = m[1].trim();
      if (!nm) continue;
      let r = null;
      try { r = resolver(nm, job.dir); } catch (e) { r = null; }
      if (!r || !r.path || seen.has(r.path) || typeof r.content !== "string") continue;
      seen.add(r.path);
      queue.push({ text: r.content, dir: joinPath(job.dir, nm.replace(/[^/\\]*$/, "")) });
    }
  }
  return macros;
}

/* ---------- 入口 ---------- */
function renderPreview(source, opts) {
  opts = opts || {};
  const src = String(source || "");
  const clean = src.split("\n").map(stripLineComment).join("\n");
  const title = findCmd(clean, "title");
  const author = findCmd(clean, "author");
  const dateCmd = findCmd(clean, "date");
  let body = clean;
  let lineOff = 0;
  const dm = /\\begin\s*\{document\}/.exec(clean);
  if (dm) {
    const startIdx = dm.index + dm[0].length;
    const em = /\\end\s*\{document\}/.exec(clean.slice(startIdx));
    body = clean.slice(startIdx, em ? startIdx + em.index : undefined);
    lineOff = lineIndexOf(clean, startIdx) + 1;
  }
  const struct = scanStruct(body, lineOff);
  const ctx = makeCtx(opts.renderMath, struct, opts);
  /* v0.9.3：用户宏表 —— 全源（含导言区）+ \input 子文件递归收集 */
  ctx.macros = pvcCollectMacros(clean, opts.inputResolver || null, opts.baseDir || "");
  let html = "";
  if (opts.docHeader !== false && title) {
    html += '<div class="pv-title"><div class="pv-title-main">' + inline(title.body, ctx) + "</div>";
    if (author) html += '<div class="pv-author">' + inline(author.body, ctx) + "</div>";
    if (dateCmd) html += '<div class="pv-date">' + inline(dateCmd.body, ctx) + "</div>";
    html += "</div>";
  }
  html += parseBlocks(body, lineOff, ctx);
  return { html: html };
}

module.exports = { renderPreview, miniMath, stripLineComment };
