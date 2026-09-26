import React, { useState, useRef, useEffect, useMemo } from "react";
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
  if (s[i] === "\\") { const m = /^\[a-zA-Z]+|^\./.exec(s.slice(i)); if (m) return { body: m[0], next: i + m[0].length }; }
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
          case "input": case "include": { const g = argAt(s, i); i = g.next; break; }
          default: {
            if (SYM[cmd] != null) { out += SYM[cmd]; break; }
            let j = skipSpaces(s, i);
            if (s[j] === "{") { const g = readGroup(s, j); out += inline(g.body, ctx); i = g.next; }
            else if (s[j] === "[") { const o = optArg(s, j); i = o.next; }
            else out += escHtml(cmd);
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
const HEAD_LV = { chapter: 0, section: 1, subsection: 2, subsubsection: 3, paragraph: 4 };

function scanStruct(body, off) {
  const labels = new Map();
  const bib = new Map();
  const secNo = [0, 0, 0, 0, 0];
  const counters = { eq: 0, fig: 0, tab: 0 };
  const hre = /\\(chapter|section|subsection|subsubsection|paragraph)(\*?)\s*/g;
  let m;
  const heads = [];
  while ((m = hre.exec(body))) {
    let i = skipSpaces(body, m.index + m[0].length);
    if (body[i] === "[") { const o = optArg(body, i); i = skipSpaces(body, o.next); }
    if (body[i] !== "{") continue;
    const g = readGroup(body, i);
    heads.push({ idx: m.index, end: g.next, line: off + lineIndexOf(body, m.index), name: m[1], starred: !!m[2] });
  }
  for (let i = 0; i < heads.length; i++) {
    const h = heads[i];
    let num = "";
    if (!h.starred) {
      const lv = HEAD_LV[h.name];
      if (lv <= 3) {
        secNo[lv]++;
        for (let k = lv + 1; k <= 3; k++) secNo[k] = 0;
        num = lv === 0 ? String(secNo[0]) : secNo.slice(1, lv + 1).join(".");
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
  let body = inner;
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
  body = body.replace(/\\label\s*\{[^}]*\}/g, "").replace(/\\centering\b/g, "");
  body = body.replace(/^\s*\[[^\]]*\]/, "");
  let bodyHtml = "";
  const img = /\\includegraphics\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/.exec(body);
  if (img) {
    const f = img[1].trim();
    const ext = ((f.match(/\.([a-zA-Z0-9]+)$/) || [, ""])[1] || "").toLowerCase();
    if (ext === "pdf" || ext === "eps" || !ext) {
      bodyHtml += '<div class="pv-imgna">🖼 ' + escHtml(f) + "（该格式不在预览中渲染，编译 PDF 后可见）</div>";
    } else {
      bodyHtml += '<img class="pv-img" data-asset="' + escHtml(joinPath(ctx.baseDir, f)) + '" alt="' + escHtml(f) + '" />';
    }
    body = body.slice(0, img.index) + body.slice(img.index + img[0].length);
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
  const re = /\\(?:maketitle\b|chapter\b|section\b|subsection\b|subsubsection\b|paragraph\b|begin\s*\{|end\s*\{)/g;
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
    if ((m = /^\\(chapter|section|subsection|subsubsection|paragraph)(\*?)\s*/.exec(rest))) {
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
        num = idx === 0 ? String(c[0]) : c.slice(1, idx + 1).join(".");
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
    if ((m = /^\\(end|clearpage|newpage|tableofcontents|printbibliography|appendix|appendices|centering|noindent|par\b|bigskip|medskip|smallskip|bibliographystyle|bibliography)\b/.exec(rest))) {
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

const LPC = { renderPreview: renderPreview, miniMath: miniMath };

const WYS = (function () {
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

const HEAD_LV = { part: 0, chapter: 0, section: 1, subsection: 2, subsubsection: 3, paragraph: 4 };

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
  return /^\s*(?:\\begin\s*\{|\\end\s*\{|\\\[|\$\$|%|\\(?:part|chapter|section|subsection|subsubsection|paragraph)\s*\*?\s*(?:\[|\{)|\\maketitle\b|\\tableofcontents\b|\\newpage\b|\\clearpage\b|\\appendix\b|\\bibliography\b|\\printbibliography\b)/.test(L);
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
  const m = /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph)\s*(\*?)\s*/.exec(text);
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
    m = /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph)\s*\*?\s*(?:\[|\{)/.exec(L);
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

return { parseDoc: parseDoc, headingNumbers: headingNumbers, parsePreamble: parsePreamble, partsJoin: partsJoin, partsExact: partsExact, applyEdits: applyEdits, parseInline: parseInline, segmentsToTex: segmentsToTex, headingTex: headingTex, classifyEnv: classifyEnv, escHtml: escHtml, escRe: escRe, readGroup: readGroup };


})();

/**
 * LaTeX 编辑器 v0.8.5 — editors 贡献面（接管 .tex 文件）
 * Overleaf 式分栏实时预览 + 划词引用到 Sidebar（notrat-quote-to-chat 第一方通道）
 * props: { pluginId, ctx, file, content, onChange, onSave, fileName, filePath,
 *          mode?, onModeSwitch?, modes?, setStatus }
 * 模式契约（v0.8.3）：视图入口**全部交给宿主标签栏**（标签 tab 右侧那排），编辑器不再自绘顶栏按钮。
 *   manifest 两个字段同时声明，跨客户端版本都可用：
 *     dualView = ["可视化","源码"]      → 旧客户端（只认 dualView）：props.mode = "wysiwyg" | "source"
 *     modes    = 可视化 / 源码 / 分屏    → 新客户端（modes 生效、dualView 被忽略）：
 *                                         props.mode = "visual" | "source" | "split"，并下发 props.modes
 *                                         （第一项 = 宿主默认档，所以「可视化」排最前）
 *   onModeSwitch(id) 是唯一回写通路；setStatus 恒有，mode / onModeSwitch / modes 只在声明了上述字段时注入。
 * 导出（v0.8.4）：工具栏「⬇ 导出」→ MCP latex_export。
 *   PDF  = 本机 TeX 引擎编译出的产物；HTML = 自包含单文件（公式已排版、图片内嵌 dataURI、含 A4 打印样式）。
 *   预览走宿主的 notrat-open-file 通道（.pdf 有内置阅读器，.html 有内置预览器）——
 *   开的永远是**刚导出的那个文件**，不会出现「预览一套、导出另一套」。
 *   产物路径 / 换目录 / 重新生成都在底部「⬇ 导出」结果条里，不另造弹窗。
 * 环境自检（v0.8.5）：挂载时探测本机 TeX 引擎（MCP latex_env），**没装才**显示一条可关的顶部提示条，
 *   并把「已提示」记在服务端（~/.notrat/notrat-latex-state.json）—— 只在「编译 PDF」这条路上会卡住。
 * 数据通路：window.electronAPI.mcp.callTool（主进程 IPC）+ window CustomEvent（与宿主自家编辑器同一引用通道）
 * 样式：内联 style + 主题 token，明暗主题自适应
 */

const FH = "20px"; // 行高（滚动同步与行跳转都依赖它）
const MONO = "Consolas, 'Courier New', ui-monospace, monospace";
const CLR = {
  cmd: "#38bdf8",
  math: "#f0abfc",
  brace: "#94a3b8",
  comment: "#71717a",
  esc: "#fbbf24",
  amp: "#fbbf24",
};

/* 预览区样式（pv-* 类，来自 preview-core 输出；明暗主题经 CSS 变量适配） */
const PV_CSS = `
.pv-root{color:hsl(var(--foreground));word-break:break-word}
.pv-root p{margin:0 0 10px}
.pv-title{text-align:center;margin:18px 0 26px}
.pv-title-main{font-size:22px;font-weight:700;line-height:1.4}
.pv-author{margin-top:8px;color:hsl(var(--muted-foreground))}
.pv-date{margin-top:2px;color:hsl(var(--muted-foreground));font-size:13px}
.pv-h1{font-size:20px;font-weight:700;margin:26px 0 10px;padding-bottom:4px;border-bottom:1px solid hsl(var(--border))}
.pv-h2{font-size:17px;font-weight:700;margin:22px 0 8px}
.pv-h3{font-size:15px;font-weight:700;margin:18px 0 6px}
.pv-par{font-weight:600;margin:14px 0 4px}
.pv-eq{margin:12px 0;text-align:center;position:relative;overflow-x:auto}
.pv-eqbody{display:inline-block;max-width:100%}
.pv-eqno{position:absolute;right:0;top:50%;transform:translateY(-50%);color:hsl(var(--muted-foreground));font-size:13px}
.pv-mini{font-family:Georgia,'Times New Roman',serif;font-style:italic;padding:0 2px}
.pv-tabwrap{overflow-x:auto;margin:10px 0}
.pv-tab{border-collapse:collapse;margin:8px auto;font-size:13.5px}
.pv-tab td{border:1px solid hsl(var(--border));padding:4px 14px}
.pv-hr td{border-top:2px solid hsl(var(--foreground)/.55)}
.pv-float{border:1px dashed hsl(var(--border));border-radius:10px;padding:14px;margin:16px 0;text-align:center;background:hsl(var(--muted)/.25)}
.pv-float figcaption{margin-top:8px;color:hsl(var(--muted-foreground));font-size:13px}
.pv-img{max-width:88%;border-radius:6px;margin:4px 0}
.pv-imgerr{outline:1px dashed #f59e0b}
.pv-imgna{background:hsl(var(--muted)/.5);padding:20px;color:hsl(var(--muted-foreground));border-radius:8px;font-size:13px}
.pv-ref,.pv-cite{color:hsl(var(--primary));border-bottom:1px dotted hsl(var(--primary));cursor:pointer;font-size:.9em;padding:0 1px}
.pv-ref:hover,.pv-cite:hover{background:hsl(var(--primary)/.12);border-radius:3px}
.pv-bad{color:#ef4444;border-color:#ef4444}
.pv-fn{font-size:11px;color:hsl(var(--muted-foreground))}
.pv-bib{margin-top:22px;padding-top:10px;border-top:1px solid hsl(var(--border))}
.pv-bib-t{font-weight:700;margin-bottom:8px}
.pv-bibitem{padding-left:2.2em;text-indent:-2.2em;margin:4px 0;font-size:13px;line-height:1.7}
.pv-bibno{margin-right:8px;font-weight:600}
.pv-tt{background:hsl(var(--muted)/.6);padding:1px 5px;border-radius:4px;font-family:Consolas,monospace;font-size:.9em}
.pv-code{background:hsl(var(--muted)/.55);padding:10px 12px;border-radius:8px;overflow:auto;white-space:pre-wrap;font-family:Consolas,monospace;font-size:12.5px;line-height:1.6}
.pv-quote{border-left:3px solid hsl(var(--border));margin:12px 0;padding:2px 14px;color:hsl(var(--muted-foreground))}
.pv-abs{background:hsl(var(--muted)/.3);border:1px solid hsl(var(--border));border-radius:10px;padding:12px 16px;margin:16px 0}
.pv-abs-t{font-weight:700;margin-bottom:6px}
.pv-list{padding-left:1.8em;margin:0 0 10px}
.pv-list li{margin:4px 0}
.pv-list p{margin:2px 0}
.pv-center{text-align:center;margin:10px 0}
/* KaTeX 在暗色主题下继承前景色 */
.pv-root .katex{color:inherit;font-size:1.04em}
.pv-root .katex-display{margin:0}
`;

/* =====================================================================
 * 就地编辑层（v0.7.0 · 方案 A）
 *
 * 权威源仍然是 LaTeX 源码。本层只做两件事：
 *   1) 把 WYS.parseDoc 出的块渲染成「可编辑文本 + 原子节点」；
 *      v0.8.0：**就地编辑不是模式，是预览区唯一的形态**。
 *      预览区就是这份文档 —— 点正文就打字、点公式就在原地改，
 *      没有「进编辑态 / 出编辑态」，没有卡片，没有 { } 源码按钮。
 *      心智模型 = Word / Markdown，不是「一个可以切换成可编辑的只读视图」。
 *   2) 用户改完，用 WYS.applyEdits 只替换**被改过的那几块**的行区间。
 *
 * 红线：绝不从渲染结果反向重建整篇源码。
 *   \cite{vaswani2017} 渲染成 "[1]"、\ref{fig:model} 渲染成 "图 1" —— 都是有损的。
 *   一旦「HTML → LaTeX」，用户敲一次字就会烧掉 \cite / \ref / 宏定义。
 *   所以原子节点一律 contenteditable=false + data-tex，回写时原样吐出。
 * =================================================================== */
const WYS_CSS = `
.wys-blk{position:relative;border-radius:6px;margin:2px 0}
.wys-blk:hover{background:hsl(var(--muted)/.35)}
.wys-blk:focus-within{background:hsl(var(--primary)/.06);box-shadow:inset 0 -2px 0 hsl(var(--primary)/.55)}
.wys-edit{outline:none;display:inline;white-space:pre-wrap;overflow-wrap:break-word;min-width:1em}
/* 以下 h1/h2/h3/par/p 的数值必须与 PV_CSS 的 .pv-h1/.pv-h2/.pv-h3 / .pv-par / .pv-root p 保持一致。
 * 两套 CSS 目前是「人工同步」的：改一边就要改另一边，门禁脚本 check-v073-style.js 会盯着。 */
.wys-h1{font-size:20px;font-weight:700;margin:26px 0 10px;padding-bottom:4px;border-bottom:1px solid hsl(var(--border))}
.wys-h2{font-size:17px;font-weight:700;margin:22px 0 8px}
.wys-h3{font-size:15px;font-weight:700;margin:18px 0 6px}
/* \subsubsection / \paragraph 这一档预览不升字号，只加粗（.pv-par） */
.wys-par{font-weight:600;margin:14px 0 4px}
.wys-p{margin:0 0 10px}
.wys-fix{color:hsl(var(--muted-foreground)/.7);font-family:Consolas,'Courier New',monospace;font-size:.85em;white-space:pre-wrap}
.wys-atom{border-radius:4px;padding:0 2px}
.wys-math{padding:0 1px}
.wys-cite,.wys-ref{color:hsl(var(--primary));border-bottom:1px dotted hsl(var(--primary));font-size:.9em}
.wys-cmt{color:#71717a;font-family:Consolas,monospace;font-size:.9em}
.wys-wrap{white-space:pre-wrap}
/* 原子块（公式 / 图 / 表 / 文献 / 环境）：外观就是**最终渲染结果**，没有卡片壳。
 * v0.7.4：常驻头部条 + 两个文字按钮全部撤掉 —— 工具条只在 hover / 选中时浮出，
 *          默认零视觉占用，整页看起来就是只读预览。 */
/* ---------- 原子块（公式 / 图 / 表 / 文献 / 环境）：外观就是最终渲染结果 ----------
 * v0.8.0：不套壳、不放按钮。点它在**原地**打开编辑器（见 .wys-pop）。
 *         hover 只留一条极淡的边，告诉用户「这里能点」—— 这也是 Word 的做法。 */
/* 注意别和行内原子 .wys-atom（\cite / 
ef / 行内公式，见文件前段）撞名：
 * 行内那种是**片段**，块级这种是**整块**，两者结构和提交路径都不同。 */
.wys-atomblk{position:relative;margin:14px 0;border-radius:8px;border:1px solid transparent;cursor:text;transition:border-color .12s ease,background .12s ease}
.wys-atomblk:hover{border-color:hsl(var(--border));background:hsl(var(--muted)/.14)}
.wys-atomblk.picked{border-color:hsl(var(--primary)/.6);background:hsl(var(--primary)/.05)}
.wys-atomblk-body{padding:2px 4px}
.wys-atomblk-body>:first-child{margin-top:0}
.wys-atomblk-body>:last-child{margin-bottom:0}
/* ---------- 导言区（页首）：渲染成成品的样子，不是一坨源码 ----------
 * 数值必须与 PV_CSS 的 .pv-title / .pv-title-main / .pv-author / .pv-date 逐项一致，
 * 否则同一份 .tex 在这层和「只读预览」里页首长两样（check-v080-flat.js 会逐项对账）。 */
.wys-front,.wys-front:hover,.wys-front:focus-within{background:transparent;box-shadow:none}
.wys-front-head{text-align:center;margin:18px 0 26px}
.wys-front-t{font-size:22px;font-weight:700;line-height:1.4}
.wys-front-a{margin-top:8px;color:hsl(var(--muted-foreground))}
.wys-front-d{margin-top:2px;color:hsl(var(--muted-foreground));font-size:13px}
/* 「一行一项」的就地编辑目标：渲染出来的是成品的样子，点一下在原地改它那一行。
 * 与正文块「点哪改哪」是同一套动作，区别是不开放 contenteditable ——
 * 标题里的 \LaTeX / \thanks 照样是有损渲染，直接敲会把命令烧掉。 */
.wys-fmline{cursor:text;border-radius:5px;transition:background .12s ease,box-shadow .12s ease}
.wys-fmline:hover{background:hsl(var(--muted)/.4);box-shadow:0 0 0 3px hsl(var(--muted)/.4)}
.wys-fmline.picked{background:hsl(var(--primary)/.08);box-shadow:0 0 0 3px hsl(var(--primary)/.14)}
.wys-front-meta{display:flex;flex-wrap:wrap;gap:5px;justify-content:center;align-items:center;margin:-12px 0 20px}
.wys-chip{display:inline-flex;align-items:center;gap:3px;padding:0 7px;border-radius:999px;border:1px solid hsl(var(--border));background:hsl(var(--muted)/.3);color:hsl(var(--muted-foreground));font-family:Consolas,'Courier New',monospace;font-size:11px;line-height:17px;white-space:nowrap}
.wys-chip b{color:hsl(var(--foreground)/.82);font-weight:600}
.wys-chip i{font-style:normal;opacity:.7}
/* 导言区整体源码：默认收起，落在页首下方 —— 上面没认领的行（\begin{document} 等）从这里改得到。 */
.wys-raw{margin:0 0 16px}
.wys-raw>summary{cursor:pointer;list-style:none;text-align:center;font-family:Consolas,monospace;font-size:11px;color:hsl(var(--muted-foreground));padding:1px 2px;border-radius:5px}
.wys-raw>summary::-webkit-details-marker{display:none}
.wys-raw>summary:hover{background:hsl(var(--muted)/.5);color:hsl(var(--foreground))}
.wys-raw .wys-edit{display:block;margin:6px 0;padding:6px 10px;border-left:2px solid hsl(var(--border));font-family:Consolas,'Courier New',monospace;font-size:12.5px;line-height:1.75;white-space:pre-wrap;color:hsl(var(--foreground)/.78)}

.wys-src{margin:0;padding:8px 10px;white-space:pre-wrap;overflow-wrap:break-word;font-family:Consolas,'Courier New',monospace;font-size:12.5px;line-height:1.6;color:hsl(var(--foreground)/.82);max-height:260px;overflow:auto;border-radius:6px;background:hsl(var(--muted)/.4)}
/* 标题的自动编号：与只读预览同构，不可编辑（改了标题文字它自己重算，跟 Word 一致） */
.wys-num{color:hsl(var(--muted-foreground));font-weight:600;margin-right:.45em;user-select:none}
/* ---------- 就地编辑浮层：在**原地**改公式 / 引用 / 图表，不跳源码视图 ---------- */
.wys-pop-dim{position:fixed;inset:0;z-index:59;background:transparent}
.wys-pop{position:fixed;z-index:60;width:min(540px,92vw);box-sizing:border-box;border:1px solid hsl(var(--border));border-radius:10px;background:hsl(var(--popover));box-shadow:0 14px 38px rgba(0,0,0,.34);padding:8px}
.wys-pop-pv{min-height:36px;display:flex;align-items:center;justify-content:center;padding:5px 8px;border-radius:6px;background:hsl(var(--muted)/.38);overflow:auto}
.wys-pop-pv>:first-child{margin-top:0}
.wys-pop-pv>:last-child{margin-bottom:0}
.wys-pop-ta{width:100%;box-sizing:border-box;margin-top:7px;border:1px solid hsl(var(--border));border-radius:6px;background:hsl(var(--background));color:hsl(var(--foreground));font-family:Consolas,'Courier New',monospace;font-size:12.5px;line-height:1.6;padding:6px 8px;outline:none;resize:vertical}
.wys-pop-ta:focus{border-color:hsl(var(--primary)/.6)}
.wys-pop-h{font-size:11px;color:hsl(var(--muted-foreground));padding:0 2px 5px;display:flex;align-items:center;gap:6px}
.wys-pop-h b{color:hsl(var(--foreground));font-weight:600}
.wys-pop-keys{margin-left:auto;font-family:Consolas,monospace;opacity:.75;white-space:nowrap}
/* 没有视觉结果的块 —— 注释 / 单条命令 / 文档结尾：不再各占一张卡片，直接排成小灰字。 */
.wys-note .wys-edit{color:#71717a;font-family:Consolas,'Courier New',monospace;font-size:12.5px;line-height:1.7}
.wys-cmd .wys-edit{color:hsl(var(--muted-foreground));font-family:Consolas,'Courier New',monospace;font-size:12px;line-height:1.7}
/* 导言区：默认收起成一行，要改再展开 */
.wys-fold{margin:4px 0}
.wys-fold>summary{cursor:pointer;list-style:none;font-family:Consolas,monospace;font-size:11.5px;color:hsl(var(--muted-foreground));padding:1px 2px;border-radius:5px}
.wys-fold>summary::-webkit-details-marker{display:none}
.wys-fold>summary::before{content:"▸ ";opacity:.7}
.wys-fold[open]>summary::before{content:"▾ "}
.wys-fold>summary:hover{background:hsl(var(--muted)/.5);color:hsl(var(--foreground))}
.wys-fold .wys-edit{display:block;margin:4px 0 6px;padding:6px 10px;border-left:2px solid hsl(var(--border));font-family:Consolas,'Courier New',monospace;font-size:12.5px;line-height:1.75;white-space:pre-wrap;color:hsl(var(--foreground)/.78)}
.wys-flash{animation:wysflash 1.1s ease-out}
@keyframes wysflash{from{background:hsl(var(--primary)/.22)}to{background:transparent}}
.wys-err{color:#ef4444;padding:10px;font-size:13px}
`;

/* 属性值转义：data-tex / data-prefix 里可能有引号与换行，必须走 escAttr 而不是 escHtml */
function escAttr(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* 行内片段 → HTML。
 *   text    → 纯文本（可编辑）
 *   math    → contenteditable=false + data-tex（KaTeX 渲染外观，TeX 原文随行携带）
 *   cmd     → \cite / \ref / \label / \footnote …（原子，显示参数内容）
 *   wrap    → \textbf{...} 外层原子（data-open 记下开符号，回写补 "}"），内层可编辑
 *   comment → 行内 % 注释（原子、置灰）
 * 互逆约束：wysDomToTex(wysInline(x)) === x */
function wysInline(text, renderMath) {
  let segs;
  try { segs = WYS.parseInline(text); } catch (e) { return WYS.escHtml(text); }
  let out = "";
  for (let i = 0; i < segs.length; i++) {
    const g = segs[i];
    if (!g) continue;
    if (g.t === "text") { out += WYS.escHtml(g.v); continue; }
    if (g.t === "comment") {
      out += '<span class="wys-atom wys-cmt" contenteditable="false" data-tex="' + escAttr(g.v) + '">' + WYS.escHtml(g.v) + "</span>";
      continue;
    }
    if (g.t === "math") {
      const bare = String(g.tex || "").replace(/^\$+|\$+$/g, "").replace(/^\\\(|\\\)$/g, "");
      let mh;
      try { mh = renderMath ? renderMath(bare, false) : WYS.escHtml(bare); }
      catch (e2) { mh = WYS.escHtml(bare); }
      out += '<span class="wys-atom wys-math" contenteditable="false" data-tex="' + escAttr(g.tex) + '" title="' + escAttr(g.tex) + '">' + mh + "</span>";
      continue;
    }
    if (g.t === "cmd") {
      const arg = /^\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?\{([^}]*)\}/.exec(String(g.tex || ""));
      const shown = arg ? arg[1] : String(g.tex || "");
      const kind = /^\\cite/i.test(String(g.tex || "")) ? "wys-cite" : "wys-ref";
      out += '<span class="wys-atom ' + kind + '" contenteditable="false" data-tex="' + escAttr(g.tex) + '" title="' + escAttr(g.tex) + '">' + WYS.escHtml(shown) + "</span>";
      continue;
    }
    if (g.t === "wrap") {
      out += '<span class="wys-wrap" data-open="' + escAttr(g.open) + '">' + wysInline(g.inner, renderMath) + "</span>";
      continue;
    }
    out += WYS.escHtml(String(g.v == null ? "" : g.v));
  }
  return out;
}

/* 反方向：DOM → LaTeX。原子带 data-tex 原样吐回；其余按 nodeValue 取回。 */
function wysDomToTex(root) {
  let out = "";
  function walk(node) {
    for (let n = node.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) { out += n.nodeValue; continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toLowerCase();
      if (tag === "br") { out += "\n"; continue; }
      const dt = n.getAttribute("data-tex");
      if (dt != null) { out += dt; continue; }
      const op = n.getAttribute("data-open");
      if (op != null) { out += op; walk(n); out += "}"; continue; }
      walk(n);
    }
  }
  walk(root);
  /* contentEditable 会塞不换行空格与零宽字符，必须归一再比对 */
  return out.replace(/\u00a0/g, " ").replace(/\u200b/g, "").replace(/\r\n?/g, "\n");
}

/* 导言区里「一行一项」的可点元素（标题 / 作者 / 日期 / 文档类 / 宏包）。
 * 渲染出来的是**成品的样子**；点一下开就地编辑器改这一行 —— 与正文块「点哪改哪」同一套动作。
 * 之所以不开放 contenteditable：这些内容照样是有损渲染（\LaTeX / \thanks 之类），
 * 让用户直接敲就会把命令烧掉。改的始终是那一行的「正文」，前缀（\title{ / \usepackage{）
 * 与后缀（}）原样带回；提交时还有一条自检，要求「前缀 + 原正文 + 后缀」逐字节等于原行。 */
function wysFmLine(it, what, key, cls, inner) {
  return '<span class="wys-fmline' + (cls ? " " + cls : "") + '" contenteditable="false"' +
    ' data-fk="' + escAttr(key) + '"' +
    ' data-s="' + it.s + '" data-e="' + it.e + '"' +
    ' data-tex="' + escAttr(it.body) + '"' +
    ' data-prefix="' + escAttr(it.prefix) + '"' +
    ' data-suffix="' + escAttr(it.suffix) + '"' +
    ' data-what="' + escAttr(what) + '"' +
    ' title="' + escAttr(it.prefix + it.body + it.suffix) + '">' + inner + "</span>";
}

/* 整篇 → 就地编辑层 HTML。只渲染块模型给出的边界，绝不重新发明结构。 */
/* 原子块的「富预览」：把块原文交给只读预览那一套内核，拿回渲染结果而不是源码。
 * 用户原话：就地编辑是「在预览的情况下直接编辑」，不是「由源代码展示出来」。
 * 片段渲染出来的 data-line 是**片段内相对行号**，整体平移到块起始行，行号语义保持一致。
 * 兜底：块太大（>2 万字符）或富渲染抛错 → 退回源码 <pre>，绝不因此炸掉整篇。 */
function richBlockHtml(raw, renderMath, baseDir, startLine) {
  const src = String(raw == null ? "" : raw);
  if (!src) return "";
  const fallback = '<pre class="wys-src">' + WYS.escHtml(src) + "</pre>";
  if (src.length > 20000) return fallback;
  /* LPC 在内联进编辑器时才存在；单测里没注入就走兜底（不抛） */
  if (typeof LPC === "undefined" || !LPC || typeof LPC.renderPreview !== "function") return fallback;
  let html = "";
  try { html = LPC.renderPreview(src, { renderMath: renderMath, baseDir: baseDir || "", docHeader: false }).html; }
  catch (e) { html = ""; }
  if (!html) return fallback;
  let min = Infinity;
  const re = /data-line="(\d+)"/g;
  let m;
  while ((m = re.exec(html))) { const v = parseInt(m[1], 10); if (v < min) min = v; }
  if (min !== Infinity && min !== startLine) {
    /* 卡片自己的 data-line 是 1 基（startLine + 1），内层也要对齐成 1 基绝对行号 */
    const shift = (startLine + 1) - min;
    html = html.replace(/data-line="(\d+)"/g, function (s2, n) { return 'data-line="' + (parseInt(n, 10) + shift) + '"'; });
  }
  return html;
}

function wysRenderDoc(src, renderMath, baseDir) {
  let doc;
  try { doc = WYS.parseDoc(src); }
  catch (e) { return '<div class="wys-err">块模型解析失败：' + WYS.escHtml(String((e && e.message) || e)) + "</div>"; }
  const out = [];
  const blocks = doc.blocks || [];
  /* 标题编号与只读预览同构：既然是在结果上编辑，标题就得长 `2 引言` 的样子，
   * 而不是 `\section{引言}` —— 后者一眼就让人知道「我还在看源码」。 */
  const nums = WYS.headingNumbers ? WYS.headingNumbers(blocks) : new Map();
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const base = ' data-bid="' + b.id + '" data-s="' + b.startLine + '" data-e="' + b.endLine + '" data-type="' + escAttr(b.type) + '"';
    if (b.editable && (b.type === "heading" || b.type === "paragraph")) {
      if (b.type === "heading") {
        /* 层级必须与只读预览内核**逐级同构**，否则同一份 .tex 在两种模式下标题差一号。
         * preview-core.js: lv = Math.min(HEAD_LV[name] + 1, 4)
         *   HEAD_LV = { chapter:0, section:1, subsection:2, subsubsection:3, paragraph:4 }
         *   → chapter=1 / section=2 / subsection=3 / subsubsection=4
         * wysiwyg 的 b.level 用的是同一张表，所以这里同样 +1、同样 clamp 到 4，
         * 第 4 档退化成粗体段落（.wys-par ↔ .pv-par），不升字号。 */
        const lv = Math.min((b.level || 0) + 1, 4);
        const hCls = lv <= 3 ? " wys-h" + lv : " wys-par";
        /* data-prefix / data-suffix 仍原样带着（回写靠它保住 \section* / [短标题] / \label），
         * 但**不再显示出来** —— 显示的是自动编号 + 标题文字，就是成品的那个样子。 */
        const hnum = nums.get(b.id) || "";
        out.push(
          '<div class="wys-blk' + hCls + '"' + base +
            ' data-prefix="' + escAttr(b.prefix) + '" data-suffix="' + escAttr(b.suffix) + '">' +
            (hnum ? '<span class="wys-num" contenteditable="false">' + WYS.escHtml(hnum) + "</span>" : "") +
            '<span class="wys-edit" contenteditable="true">' + wysInline(b.title, renderMath) + "</span>" +
          "</div>"
        );
      } else {
        out.push(
          '<div class="wys-blk wys-p"' + base + ">" +
            '<span class="wys-edit" contenteditable="true">' + wysInline(b.raw, renderMath) + "</span>" +
          "</div>"
        );
      }
      continue;
    }
    /* ---------- 没有视觉结果的块：不再套卡片壳，直接排成可编辑的小灰字 ----------
     * comment  → 注释本来就是写给作者看的，灰色小字最合适
     * command  → \maketitle / \tableofcontents 之类
     * tail     → \end{document}
     * 三者都只是「一行源码」，没有任何渲染结果可展示 —— 给它们一张卡片纯属噪音。 */
    if (b.type === "comment" || b.type === "command" || b.type === "tail") {
      const cls = b.type === "comment" ? "wys-note" : "wys-cmd";
      out.push(
        '<div class="wys-blk ' + cls + '"' + base + ">" +
          '<span class="wys-edit" contenteditable="true">' + WYS.escHtml(String(b.raw == null ? "" : b.raw)) + "</span>" +
        "</div>"
      );
      continue;
    }
    /* ---------- 导言区：渲染成成品的页首，不是一坨源码 ----------
     * 用户报的问题：「导言区没有正常渲染呢」。
     * 根因：这里以前只把 L1–8 原文塞进一个折叠的 <details>，而只读预览把同一份 .tex
     * 渲染成了页首（\title → 大字标题、\author → 作者行）。于是「就地编辑」这一层
     * 没有页首，标题躺在源码里 —— 这正是「没渲染」，也正是两种形态对不上的地方。
     * 现在：标题 / 作者 / 日期渲染成页首，\documentclass / \usepackage 渲染成小标签，
     * 每一项都点得开、在**原地**改它那一行；整体源码留一个折叠兜底入口。 */
    if (b.type === "preamble") {
      const raw0 = String(b.raw == null ? "" : b.raw);
      const fm = WYS.parsePreamble ? WYS.parsePreamble(raw0, b.startLine) : null;
      let inner = "";
      if (fm) {
        if (fm.title || fm.author || fm.date) {
          inner += '<div class="wys-front-head">';
          if (fm.title) inner += '<div class="wys-front-t">' + wysFmLine(fm.title, "标题", "fm:title", "", wysInline(fm.title.body, renderMath)) + "</div>";
          if (fm.author) inner += '<div class="wys-front-a">' + wysFmLine(fm.author, "作者", "fm:author", "", wysInline(fm.author.body, renderMath)) + "</div>";
          if (fm.date) inner += '<div class="wys-front-d">' + wysFmLine(fm.date, "日期", "fm:date", "", wysInline(fm.date.body, renderMath)) + "</div>";
          inner += "</div>";
        }
        const chips = [];
        if (fm.cls) {
          chips.push(wysFmLine(fm.cls, "文档类", "fm:cls", "wys-chip",
            "<b>" + WYS.escHtml(fm.cls.body) + "</b>" + (fm.cls.opt ? " <i>· " + WYS.escHtml(fm.cls.opt) + "</i>" : "")));
        }
        for (let pi = 0; pi < fm.pkgs.length; pi++) {
          chips.push(wysFmLine(fm.pkgs[pi], "宏包", "fm:pkg:" + pi, "wys-chip",
            WYS.escHtml(fm.pkgs[pi].name || fm.pkgs[pi].body)));
        }
        if (chips.length) inner += '<div class="wys-front-meta">' + chips.join("") + "</div>";
      }
      /* 兜底入口：上面没认领的行（\begin{document}、少见的导言区命令）仍从这里改得到。
       * 它同时是这一块**唯一**的 .wys-edit —— commitWys 就靠它读回「整体改动」。 */
      inner += '<details class="wys-raw"><summary>⋯ 导言区源码 · ' + (b.endLine - b.startLine + 1) + " 行</summary>" +
        '<span class="wys-edit" contenteditable="true">' + WYS.escHtml(raw0) + "</span></details>";
      out.push('<div class="wys-blk wys-front"' + base + ">" + inner + "</div>");
      continue;
    }
    /* ---------- 有视觉结果的原子块：渲染结果直接落版，点一下在原地编辑 ----------
     * 公式 / 浮动体 / 参考文献 / 代码环境 … 一律用预览内核渲染成富结果，**不套任何壳**。
     *
     * 为什么块内部仍然是只读的（不直接 contenteditable）：
     *   \cite{vaswani2017} 渲染成 "[1]"，\ref{fig:model} 渲染成 "图 1" —— 都是有损的。
     *   允许从渲染结果反推 LaTeX，用户敲一次字就会把 \cite / \label 烧成 "[1]"。
     *   所以这里给的不是「可编辑的渲染文本」，而是「点开一个就地编辑器」（见 .wys-pop）：
     *   上面照旧实时渲染给你看，下面改的始终是真正的 LaTeX。这就是「在结果上编辑」
     *   对有损渲染的答案 —— 位置在结果上，改的是源码，且不用离开预览。 */
    const raw = String(b.raw == null ? "" : b.raw);
    out.push(
      '<div class="wys-atomblk" data-line="' + (b.startLine + 1) + '"' + base +
        ' data-key="blk:' + b.id + '" data-tex="' + escAttr(raw) + '">' +
        '<div class="wys-atomblk-body">' + richBlockHtml(raw, renderMath, baseDir, b.startLine) + "</div>" +
      "</div>"
    );
  }
  return out.join("");
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function hlLine(line) {
  let cut = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\") { i++; continue; }
    if (ch === "%") { cut = i; break; }
  }
  const code = cut >= 0 ? line.slice(0, cut) : line;
  const comment = cut >= 0 ? line.slice(cut) : "";
  let h = esc(code);
  h = h.replace(/(\\[a-zA-Z@]+\*?)/g, '<span style="color:' + CLR.cmd + '">$1</span>');
  h = h.replace(/(\\[^a-zA-Z\\])/g, '<span style="color:' + CLR.esc + '">$1</span>');
  h = h.replace(/(\$[^$]*\$)/g, '<span style="color:' + CLR.math + '">$1</span>');
  h = h.replace(/(\{|\})/g, '<span style="color:' + CLR.brace + '">$1</span>');
  h = h.replace(/(&amp;)/g, '<span style="color:' + CLR.amp + '">$1</span>');
  if (comment) h += '<span style="color:' + CLR.comment + '">' + esc(comment) + "</span>";
  return h || "&nbsp;";
}

function countWords(text) {
  const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const latin = (text.match(/[a-zA-Z]+/g) || []).length;
  return { cjk: cjk, latin: latin, total: cjk + latin };
}

/* 划词引用气泡定位：钳制在视口内 */
function clampPos(x, y) {
  return {
    x: Math.max(8, Math.min(x || 100, (window.innerWidth || 1200) - 190)),
    y: Math.max(8, Math.min((y || 100) + 14, (window.innerHeight || 800) - 56)),
  };
}

/* 预览节点向上找 data-line（块级行号锚点） */
function nodeLine(node) {
  let el = node && node.nodeType === 1 ? node : node && node.parentElement;
  while (el && el.getAttribute) {
    const v = el.getAttribute("data-line");
    if (v) return parseInt(v, 10) || null;
    el = el.parentElement;
  }
  return null;
}

const tbtn = {
  border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--foreground))",
  borderRadius: 6, padding: "2px 8px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", lineHeight: "18px",
};
const tbtnP = { ...tbtn, background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" };
/* 工具栏下拉（「⬇ 导出」）：右对齐，贴着按钮弹出 */
const tmenu = {
  position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 40, minWidth: 230,
  padding: 4, borderRadius: 8, border: "1px solid hsl(var(--border))",
  background: "hsl(var(--popover))", boxShadow: "0 8px 24px rgba(0,0,0,.25)",
};
const titem = {
  display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent",
  color: "hsl(var(--popover-foreground))", fontFamily: "inherit", fontSize: 12,
  padding: "5px 8px", borderRadius: 5, cursor: "pointer", whiteSpace: "nowrap",
};
const tsep = { height: 1, margin: "4px 6px", background: "hsl(var(--border))" };
const tcap = { padding: "4px 8px 2px", fontSize: 10.5, color: "hsl(var(--muted-foreground))" };
/* ---------- 视图（本编辑器内部三档）----------
 *   src     = 源码（textarea + 高亮层）
 *   split   = 分屏（左源码 / 右渲染）
 *   preview = 可视化（在渲染结果上就地编辑 —— 也就是 manifest 里那一档「可视化」）
 *
 * ⚠ v0.8.3：编辑器**不再自带视图按钮**。顶栏那排「📄 源码 / ⧉ 分屏 / 📑 预览」分段控件已删，
 *   档位入口统一由宿主标签栏的模式开关承担（同一件事两处并存只会互相打架）。
 *   宿主读 manifest 的 editors[] 声明，两代契约本编辑器都认：
 *     旧客户端  dualView = ["可视化","源码"]      → props.mode = "wysiwyg" | "source"
 *     新客户端  modes = 可视化 / 源码 / 分屏       → props.mode = "visual" | "source" | "split"
 *   （已在装机版宿主 app.asar 里取证：无 editors[].modes 解析代码，故 dualView 必须同时保留。） */
const MODE2VIEW = {
  source: "src", src: "src", code: "src", text: "src", edit: "src",
  split: "split", dual: "split", both: "split",
  visual: "preview", wysiwyg: "preview", preview: "preview", render: "preview",
};
/* 内部分档 → 回写宿主的模式 id（两代契约各一张表） */
const VIEW2MODE_DUAL = { src: "source", split: "wysiwyg", preview: "wysiwyg" }; // 只有二态：分屏归可视化侧
const VIEW2MODE_N = { src: "source", split: "split", preview: "visual" };       // 三态：分屏是独立档位
/* ---------- v0.8.6 编辑器自身控件的样式（菜单 / 键位提示 / 分组标题） ----------
 * 为什么不并进 PV_CSS / WYS_CSS：那两个描述的是**文档**长什么样，check-v073-style.js
 * 会拿它们和导出产物逐条对账；这里是**编辑器控件**的样式，混进去只会让对账语义变脏。
 * 也没用 transition: all —— 高频交互元素上的全属性过渡是输入卡顿的常见来源。 */
const UI_CSS = `
.lx-mh{padding:5px 8px 3px;font-size:10.5px;color:hsl(var(--muted-foreground));letter-spacing:.06em}
.lx-mi{display:flex;align-items:center;justify-content:space-between;gap:14px;width:100%;text-align:left;border:none;background:transparent;color:hsl(var(--popover-foreground));font-family:inherit;font-size:12px;padding:5px 8px;border-radius:5px;cursor:pointer}
.lx-mi:hover{background:hsl(var(--primary)/.14)}
.lx-kbd{font-family:Consolas,'Courier New',monospace;font-size:10.5px;line-height:16px;color:hsl(var(--muted-foreground));border:1px solid hsl(var(--border));border-radius:4px;padding:0 4px;white-space:nowrap;flex:none}
`;

/* 常用结构插入（v0.7.2 把 8 个按钮收成 1 个；v0.8.6 加分组 + 键位提示）
 * 结构：[标签, 插入文本, 光标回退, 键位提示, 分组]。
 * 键位提示是**照实抄**自下面的 FMT 表 —— 菜单和快捷键指向同一批动作，
 * 免得出现「菜单说 Ctrl+T、实际按了没反应」这种自相矛盾（check-v086-keys.js 会盯着）。 */
const INSERT_GROUPS = ["格式", "环境", "引用"];
const TPL_FIG = "\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=.8\\linewidth]{}\n  \\caption{}\n  \\label{fig:}\n\\end{figure}";
const TPL_TAB = "\\begin{table}[htbp]\n  \\centering\n  \\begin{tabular}{lcc}\n    \\hline\n    & & \\\\\n    \\hline\n  \\end{tabular}\n  \\caption{}\n  \\label{tab:}\n\\end{table}";
const INSERTS = [
  ["§ 章节", "\\section{}", 1, "Ctrl+1", "格式"],
  ["§ 小节", "\\subsection{}", 1, "Ctrl+2", "格式"],
  ["¶ 三级小节", "\\subsubsection{}", 1, "Ctrl+3", "格式"],
  ["∑ 行内公式", "$", 1, "Ctrl+M", "格式"],
  ["∑ 公式环境", "\\begin{equation}\\label{eq:}\n  \n\\end{equation}", "\\end{equation}".length, "Ctrl+Shift+M", "环境"],
  ["🖼 图", TPL_FIG, 0, "Ctrl+Shift+I", "环境"],
  ["📊 表", TPL_TAB, 0, "Ctrl+T", "环境"],
  ["📝 代码块", "\\begin{verbatim}\n\n\\end{verbatim}", 0, "Ctrl+Shift+K", "环境"],
  ["💬 引用块", "\\begin{quote}\n\n\\end{quote}", 0, "Ctrl+Shift+Q", "环境"],
  ["• 无序列表", "\\begin{itemize}\n  \\item \n\\end{itemize}", 0, "Ctrl+Shift+U", "环境"],
  ["1. 有序列表", "\\begin{enumerate}\n  \\item \n\\end{enumerate}", 0, "Ctrl+Shift+O", "环境"],
  ["🏷 标签", "\\label{}", 1, "Ctrl+Shift+L", "引用"],
  ["🔗 交叉引用", "\\ref{}", 1, "", "引用"],
  ["📚 文献引用", "\\cite{}", 1, "", "引用"],
];

/* ==========================================================================
 * v0.8.6：Typora 风格格式快捷键
 *
 * 键位**照 Typora 的来**，动作落成 LaTeX —— 这样「肌肉记忆」是同一套：
 *   Ctrl+B / I / U      加粗 / 斜体 / 下划线
 *   Ctrl+K              链接（href）
 *   Ctrl+M              行内公式（Typora 的 Ctrl+M 就是行内公式）
 *   Ctrl+Shift+M        公式块
 *   Ctrl+T              表格
 *   Ctrl+1..5 / Ctrl+0  章节层级 / 变回正文（Typora 用同一组键设标题）
 *   Ctrl+Shift+`        行内代码（\texttt）
 *   Ctrl+Shift+K        代码块      Ctrl+Shift+Q  引用块
 *   Ctrl+Shift+U / O    无序 / 有序列表
 *   Ctrl+Shift+I        插图
 *
 * 两种执行形态：
 *   e / s —— 模板插入。e = 无选区时用，s = 有选区时用（没写 s 就共用 e）。
 *            \u0000 = 选区内容的位置，\u0002 = 光标落点（都没写则光标落在末尾）。
 *   head  —— 章节层级。有选区就包住；没选区把**当前整行**换成 \section{...}，
 *            该行原本已是章节命令时**只换层级、保留标题**（Typora 的 Ctrl+1→Ctrl+2 就是这样）。
 *
 * 只在「源码 / 分屏」且焦点在源码 textarea 时接管（见 onFmtKey）。预览区是块级就地编辑，
 * 往里塞 LaTeX 命令会被当成正文回写 —— 那里一概不碰。
 * 反引号那一项用 code 匹配：Shift 会把它变成 ~，key 不可靠。
 * ======================================================================== */
const FMT = [
  { k: "b", shift: false, name: "加粗",     e: "\\textbf{\u0000}",    s: "\\textbf{\u0000}\u0002" },
  { k: "i", shift: false, name: "斜体",     e: "\\textit{\u0000}",    s: "\\textit{\u0000}\u0002" },
  { k: "u", shift: false, name: "下划线",   e: "\\underline{\u0000}", s: "\\underline{\u0000}\u0002" },
  { k: "k", shift: false, name: "链接",     e: "\\href{\u0000}{}",    s: "\\href{\u0002}{\u0000}" },
  { k: "m", shift: false, name: "行内公式", e: "$\u0000$",            s: "$\u0000$\u0002" },
  { k: "t", shift: false, name: "表格",     e: TPL_TAB },
  { k: "`", code: "Backquote", shift: true, name: "行内代码", e: "\\texttt{\u0000}", s: "\\texttt{\u0000}\u0002" },
  { k: "m", shift: true, name: "公式块",    e: "\\begin{equation}\n  \u0000\n\\end{equation}" },
  { k: "k", shift: true, name: "代码块",    e: "\\begin{verbatim}\n\u0000\n\\end{verbatim}" },
  { k: "q", shift: true, name: "引用块",    e: "\\begin{quote}\n  \u0000\n\\end{quote}" },
  { k: "i", shift: true, name: "插图",      e: TPL_FIG },
  { k: "u", shift: true, name: "无序列表",  e: "\\begin{itemize}\n  \\item \u0000\n\\end{itemize}" },
  { k: "o", shift: true, name: "有序列表",  e: "\\begin{enumerate}\n  \\item \u0000\n\\end{enumerate}" },
  { k: "l", shift: true, name: "标签",      e: "\\label{\u0000}", s: "\\label{\u0000}\u0002" },
  { k: "1", shift: false, name: "一级标题", head: "section" },
  { k: "2", shift: false, name: "二级标题", head: "subsection" },
  { k: "3", shift: false, name: "三级标题", head: "subsubsection" },
  { k: "4", shift: false, name: "四级标题", head: "paragraph" },
  { k: "5", shift: false, name: "五级标题", head: "subparagraph" },
  { k: "0", shift: false, name: "正文",     head: "" },
];

const SEL_MARK = "\u0000";    // 选区内容落点
const CARET_MARK = "\u0002";  // 光标落点

/** 模板展开 → { text, caret }。两个标记都摘掉之后再算偏移，避免边改边算。 */
function expandTpl(tpl, sel) {
  const iS = tpl.indexOf(SEL_MARK);
  const iC = tpl.indexOf(CARET_MARK);
  if (iS < 0 && iC < 0) return { text: tpl, caret: tpl.length };
  if (iS < 0) return { text: tpl.slice(0, iC) + tpl.slice(iC + 1), caret: iC };
  if (iC < 0) return { text: tpl.slice(0, iS) + sel + tpl.slice(iS + 1), caret: iS + sel.length };
  if (iS < iC) {
    return {
      text: tpl.slice(0, iS) + sel + tpl.slice(iS + 1, iC) + tpl.slice(iC + 1),
      caret: iS + sel.length + (iC - iS - 1),
    };
  }
  return {
    text: tpl.slice(0, iC) + tpl.slice(iC + 1, iS) + sel + tpl.slice(iS + 1),
    caret: iC,
  };
}

/* 行首已存在的章节命令（用于标题升降级：只换命令、保留标题文本） */
const HEAD_RE = /^\s*\\(?:part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*\{([\s\S]*)\}\s*$/;

/* =========================================================================
 * 活动文件广播（生产者侧）
 * 宿主只把 filePath 交给 editors 贡献面；ui 面板拿不到（官方 props 只有
 * { serverId, pluginId, ctx, data, dataError, launch }，ctx 里只有 workspace）。
 * 面板过去只能读 sessionStorage 里上一份 .tex -> 切到别的格式仍显示 LaTeX 大纲。
 * 这里在「挂载 / 切文件 / 卸载」三处广播当前活动文件，面板据此显示或收起。
 * ========================================================================= */
const LATEX_EV = "notrat-latex-active-file";
const LATEX_PING = "notrat-latex-active-ping";
const LATEX_STORE = "notrat-latex-active";
/* v0.5.0 新增两条通道：
 *   notrat-latex-cursor    编辑器 -> 面板：光标行，面板据此高亮"正在写的那一节"
 *   notrat-latex-reveal-line 面板 -> 编辑器：滚到某行并闪一下（AC K 回执让面板知道有人接住）
 */
const LATEX_CURSOR = "notrat-latex-cursor";
const LATEX_CURSOR_PING = "notrat-latex-cursor-ping";
const LATEX_REVEAL = "notrat-latex-reveal-line";
const LATEX_REVEAL_ACK = "notrat-latex-reveal-ack";

let _activeOwner = null;
let _activeClearTimer = null;

function announceActiveFile(path, name, owner) {
  if (_activeClearTimer) { clearTimeout(_activeClearTimer); _activeClearTimer = null; }
  const detail = { path: String(path || ""), name: String(name || "") };
  _activeOwner = owner || null;
  try { sessionStorage.setItem(LATEX_STORE, JSON.stringify({ path: detail.path, name: detail.name, at: Date.now() })); } catch (e) {}
  try { window.dispatchEvent(new CustomEvent(LATEX_EV, { detail: detail })); } catch (e) {}
}

/* .tex -> .tex 切换时宿主换 key 重挂载：旧实例先卸载、新实例随后挂载，
 * 所以卸载只「延迟清场」；若期间已被新实例接管（_activeOwner 变了）就取消清理。 */
function retractActiveFile(owner) {
  if (_activeClearTimer) clearTimeout(_activeClearTimer);
  _activeClearTimer = setTimeout(function () {
    _activeClearTimer = null;
    if (_activeOwner !== owner) return;
    _activeOwner = null;
    try { sessionStorage.removeItem(LATEX_STORE); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent(LATEX_EV, { detail: { path: "", name: "" } })); } catch (e) {}
  }, 120);
}

export default function LatexEditor(props) {
  const content = props.content || "";
  const { onChange, onSave, filePath, fileName, pluginId } = props;

  const [serverId, setServerId] = useState("");

  /* v0.8.5 环境自检：没装 TeX 引擎时**只影响「编译 PDF」**这一条路，所以提示条必须把这句话
   * 说在前面，否则用户第一反应是「插件坏了」。engineNote=null 表示不显示提示条。 */
  const [engineNote, setEngineNote] = useState(null);
  const engineProbedRef = useRef(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [issues, setIssues] = useState(null);
  const [compileOut, setCompileOut] = useState("");
  const [bottomTab, setBottomTab] = useState("issues"); // issues | compile
  const [bottomOpen, setBottomOpen] = useState(false);
  const [savedTick, setSavedTick] = useState(0);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  /* 宿主下发的模式表：只有声明了 modes 且客户端认识它时才有（当前装机版宿主：空）。 */
  const hostModeIds = Array.isArray(props.modes)
    ? props.modes.map((m) => (m && m.id != null ? String(m.id) : "")).filter(Boolean)
    : [];
  const nMode = hostModeIds.length >= 2;   // true = 宿主走 N 态契约（modes），false = 旧的双态契约
  /* 宿主模式 id -> 内部分档。两代字面量都认（"wysiwyg"/"source" 与 "visual"/"split"/"source"），
   * 认不出就返回 null = 这一拍不动视图（绝不瞎猜着换档）。 */
  const viewOf = (m) => {
    if (m === undefined || m === null) return null;
    const k = String(m).toLowerCase();
    if (MODE2VIEW[k]) return MODE2VIEW[k];
    if (/split|dual|both/.test(k)) return "split";
    if (/vis|preview|render|read|pdf/.test(k)) return "preview";
    if (/src|code|edit|write|text/.test(k)) return "src";
    return null;
  };
  /* 首帧就落在宿主说的那一档（宿主没下发 = 默认分屏，维持老行为） */
  const [view, setView] = useState(() => viewOf(props.mode) || "split"); // src | split | preview
  /* 可视化侧上次挑的是「预览」还是「分屏」—— 旧的双态契约下，「源码」切回「可视化」按这个还原
   * （新契约里分屏是独立档位，用不上这把记忆） */
  const lastPvView = useRef("split");
  /* props.mode = 宿主下发的权威值（live）；props.viewMode / props.dualViewMode 是历史上的错名字，
   * 宿主从不注入，留着只作极旧包的兜底，别当契约用。 */
  const hostMode =
    props.mode !== undefined ? props.mode
    : props.viewMode !== undefined ? props.viewMode
    : props.dualViewMode !== undefined ? props.dualViewMode
    : undefined;
  useEffect(() => {
    const v = viewOf(hostMode);
    if (!v) return;
    if (v !== "src") lastPvView.current = v;
    /* 旧契约的「可视化」是笼统的一侧（分屏 / 纯预览都算）：回到上次停的那一档 */
    if (!nMode && v === "preview" && lastPvView.current === "split") { setView("split"); return; }
    setView(v);
  }, [hostMode]);
  /* 回写宿主标签栏开关 —— props.onModeSwitch 是唯一通路；没注入就静默跳过 */
  const writeHostMode = (v) => {
    if (typeof props.onModeSwitch !== "function") return;
    const id = (nMode ? VIEW2MODE_N : VIEW2MODE_DUAL)[v];
    if (id) props.onModeSwitch(id);
  };
  /* 切档：宿主开关（props.mode 下发）与内部入口（Ctrl+/、卡片「去源码」、行跳转兜底）都汇到这里 */
  const goView = (v) => {
    if (v !== "src" && v !== "split" && v !== "preview") return;
    /* 离开可视化视图前把改动落盘：否则切到源码视图会看到旧内容 */
    if (view === "preview" && v !== "preview") commitWys();
    if (v !== "src") lastPvView.current = v;   // 记住可视化侧的选择（预览 / 分屏）
    setView(v);
    writeHostMode(v);   // 新契约：分屏独立回写 "split"；旧契约：归到可视化侧，开关不骗人
  };
  const [katexVer, setKatexVer] = useState(0);
  const [quote, setQuote] = useState(null); // {text, lineFrom, lineTo, x, y}
  const [toast, setToast] = useState(null); // {msg; undo?}
  /* v0.8.4：导出菜单 + 最近一次产物（预览入口认它，不靠猜磁盘上有没有） */
  const [exMenu, setExMenu] = useState(false);
  const exMenuRef = useRef(null);
  const [exportInfo, setExportInfo] = useState(null);
  /* ---------- v0.8.0：就地编辑**不是模式** ----------
   * 预览区就是文档本身：点正文打字、点公式在原地改。没有「进编辑态 / 出编辑态」。
   * 原来那个 ✏/🔒 开关已经删掉 —— 它把「编辑」做成了模式的开关，方向是错的。
   * 下面是原子块的就地编辑器：点一下在被点的那一块旁边浮出来。 */
  const [atomEdit, setAtomEdit] = useState(null); // {bid,s,e,tex,orig,x,y}
  const atomPickedRef = useRef(null);

  /* ---------- Ctrl+/ 切视图（对齐宿主 Markdown 编辑器） ----------
   * 宿主实现（TipTapEditor）：window 捕获阶段监听，(ctrl|meta)+"/"、不带 shift/alt，
   * 命中即 preventDefault，然后 wysiwyg ⇄ source 二态对翻。
   *
   * 本编辑器内部是三档（源码 / 分屏 / 可视化），按宿主那套语义映射（两代契约都走这条）：
   *   当前在「源码」        → 回可视化侧上次停的地方（分屏或预览，默认分屏）
   *   当前在「分屏 / 预览」 → 去「源码」
   *
   * 回写不另造通路：统一调 goView —— 它内含 commitWys()（离开可视化前把改动落盘）
   * 与 writeHostMode → props.onModeSwitch(...)（回写宿主标签栏的模式开关）。
   * v0.8.3 起编辑器内已无视图按钮，这条快捷键是「不碰鼠标也能换档」的入口。
   *
   * ⚠ 监听挂在**本编辑器根节点**上，而不是像宿主那样挂 window：
   *   多开 .tex 时只有拿到焦点的那个实例能收到事件，天然不会两边各翻一次（翻两次=没翻）；
   *   也不必依赖「活动文件桥」判定 owner —— 那条桥是异步广播，首个事件到达前人人自认活动。
   *
   * 监听只订阅一次，所以下面用 ref 取「最新闭包」：
   *   goViewRef   —— goView 读的是当拍的 view / commitWys / props.onModeSwitch
   *   viewRef     —— 判断「现在在哪一档」必须是最新值，否则切过一次方向就反了
   *   atomEditRef —— 就地编辑浮层开着时不切（见下）
   * 不把 goView 塞进依赖数组：它是每次渲染新建的函数，订阅会在每次按键时解绑重挂。 */
  const goViewRef = useRef(null);
  const viewRef = useRef(view);
  const atomEditRef = useRef(null);
  /* v0.8.6：格式化快捷键的执行函数。root 捕获层的订阅只挂一次（deps=[]），
   * 直接闭包会把第一次渲染的 content / onChange 锁死 —— 必须走 ref 拿最新那个。 */
  const fmtRef = useRef(null);
  goViewRef.current = goView;
  viewRef.current = view;
  atomEditRef.current = atomEdit;

  const rootRef = useRef(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    function onCtrlSlash(e) {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      if (e.key !== "/") return;
      /* 就地编辑浮层开着：这一下先别切。浮层渲染在根节点下、不在预览容器里，
       * 切视图不会把它卸载，它会连同那块遮罩孤零零浮在源码之上。
       * 让用户先 Esc / 点外面收掉，比替他做决定安全。 */
      if (atomEditRef.current) return;
      e.preventDefault();
      e.stopPropagation();   // 别再让底下的 textarea / 预览吃到这一下
      const gv = goViewRef.current;
      if (typeof gv !== "function") return;
      gv(viewRef.current === "src" ? (lastPvView.current || "split") : "src");   // 三档对翻：源码 ⇄ 可视化侧（分屏 / 纯可视化）
    }
    /* v0.8.6：格式快捷键。与 Ctrl+/ 同一层（捕获阶段、挂在根节点上），
     * 但**先自己判断该不该管**，不该管的原样放行 —— 见下面几行 return。 */
    function onFmtKey(e) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = (e.key || "").toLowerCase();
      if (e.key === "Tab" || k === "s" || e.key === "/") return;   // 让位：缩进 / 保存 / 切视图
      const ta = taRef.current;
      /* 只在源码输入框聚焦时接管。预览区是 contenteditable 的就地编辑，
       * 在那儿按 Ctrl+B 该干嘛不该由我们决定 —— 不碰。 */
      if (!ta || document.activeElement !== ta) return;
      const fn = fmtRef.current;
      if (typeof fn !== "function") return;
      if (!fn(e)) return;   // 没命中这一套键位 → 放行，不拦
      e.preventDefault();
      e.stopPropagation();
    }
    root.addEventListener("keydown", onCtrlSlash, true);   // 捕获阶段，先于组件内部的 onKeyDown
    root.addEventListener("keydown", onFmtKey, true);      // v0.8.6 格式快捷键
    return () => {
      root.removeEventListener("keydown", onCtrlSlash, true);
      root.removeEventListener("keydown", onFmtKey, true);
    };
  }, []);

  /* 「＋ 插入」菜单（v0.7.2 把 8 个插入按钮收成 1 个） */
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);

  const taRef = useRef(null);
  const preRef = useRef(null);
  const gutterRef = useRef(null);
  const pvRef = useRef(null);
  const bubbleRef = useRef(null);
  const pendingCursor = useRef(null);
  /* v0.8.6：格式快捷键回填用的区间；见下面那个 [content] effect */
  const pendingRange = useRef(null);
  /* v0.6.1：待补跳的行 —— 源码还没挂载时 gotoLine 跳不了，先存这里，DOM 就绪那一拍兑现 */
  const pendingReveal = useRef(null);
  const katexOkRef = useRef(false);
  const assetCache = useRef(new Map());
  /* 行定位闪烁："跳过去了"要看得见，否则用户不知道点没点中 */
  const [flashLine, setFlashLine] = useState(0);
  const flashRef = useRef(null);
  const flashLineRef = useRef(0);
  const flashTimer = useRef(null);
  const gotoLineRef = useRef(null);
  /* ---------- 就地编辑层（v0.7.0 · 方案 A）----------
   * 权威源 = LaTeX 源码。可视化视图里只有 heading / paragraph 变成可编辑块，
   * 改完用 WYS.applyEdits 只替换被改块的行区间；公式 / 浮动体 / 参考文献保持原子卡片。
   * 三条不变式：
   *   ① 编辑期间 DOM 是权威 —— 绝不回写 innerHTML，否则每敲一个字光标就丢；
   *   ② 只提交真正改过的块（渲染时记下原文当基准）；
   *   ③ 提交前跑内核自检，任何一条不过就整批放弃，绝不半途改坏文件。
   */
  const wysEditing = useRef(false);
  const wysOrigRef = useRef(new Map());
  const wysUndoRef = useRef(null);


  const renderMath = useMemo(() => {
    if (katexOkRef.current && typeof window !== "undefined" && window.katex) {
      return (tex, disp) => {
        try {
          return window.katex.renderToString(tex, { displayMode: !!disp, throwOnError: false, strict: "ignore" });
        } catch (e) { return LPC.miniMath(tex, disp); }
      };
    }
    return (tex, disp) => LPC.miniMath(tex, disp);
  }, [katexVer]);

  /* 图片基目录：原子卡片现在跟着源码一起富渲染（图 / 表 / 公式），得先有它。
   * ⚠ 必须在 wys 之前声明：依赖数组是渲染期立即求值的，写在后面就是 TDZ
   *   （0.7.0 的 renderMath 白屏事故同款）。 */
  const baseDir = useMemo(() => {
    const p = String(filePath || "");
    const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
    return i > 0 ? p.slice(0, i) : "";
  }, [filePath]);

  const wys = useMemo(() => {
    try { return { html: wysRenderDoc(content, renderMath, baseDir) }; }
    catch (e) { return { html: '<div class="wys-err">就地编辑层渲染失败：' + esc(String((e && e.message) || e)) + "</div>" }; }
  }, [content, renderMath, baseDir]);

  /* 浮层上半部分的实时渲染：跟原子块本身用的是同一套预览内核，
   * 所以「你看到的」和「点确定后落版的」是同一张图，不会出现改完变样。 */
  const atomPvHtml = useMemo(() => {
    if (!atomEdit) return "";
    try {
      return LPC.renderPreview(atomEdit.tex, { renderMath: renderMath, baseDir: baseDir, docHeader: false }).html;
    } catch (e) {
      return '<span style="color:#ef4444;font-size:12px">这一块暂时渲染不出来，但源码仍可编辑</span>';
    }
  }, [atomEdit, renderMath, baseDir]);

  /* 提交：只回写被改过的块。返回新源码；无改动 / 自检不过返回 null。 */
  function commitWys() {
    const root = pvRef.current;
    if (!root || wysEditing.current) return null;
    const blks = root.querySelectorAll(".wys-blk");
    if (!blks.length) return null;
    const edits = [];
    for (let i = 0; i < blks.length; i++) {
      const el = blks[i];
      const part = el.querySelector(".wys-edit");
      if (!part) continue;
      const s = parseInt(el.getAttribute("data-s"), 10);
      const e = parseInt(el.getAttribute("data-e"), 10);
      if (!(s >= 0) || !(e >= s)) continue;
      const now = wysDomToTex(part);
      const orig = wysOrigRef.current.get(el.getAttribute("data-bid"));
      if (orig != null && now === orig) continue;        // 没动过的块不进 edit 列表
      if (el.getAttribute("data-type") === "heading") {
        /* headingTex 只换标题主体，保住 *、[短标题]、\label */
        edits.push({
          startLine: s, endLine: e,
          newText: WYS.headingTex(
            { prefix: el.getAttribute("data-prefix") || "", suffix: el.getAttribute("data-suffix") || "" },
            now
          ),
        });
      } else {
        edits.push({ startLine: s, endLine: e, newText: now });
      }
    }
    if (!edits.length) return null;
    let next;
    try {
      /* 自检 1：空编辑集必须逐字节还原（内核硬不变式） */
      if (WYS.applyEdits(content, []) !== content) throw new Error("空编辑集未逐字节还原");
      next = WYS.applyEdits(content, edits);
      /* 自检 2：回写结果必须仍可解析 */
      WYS.parseDoc(next);
    } catch (err) {
      setToast({ msg: "⚠ 就地回写自检未通过，已放弃本次修改：" + String((err && err.message) || err) });
      return null;
    }
    if (next === content) return null;
    wysUndoRef.current = content;
    onChange(next);
    setToast({ msg: "✏ 已就地写回 " + edits.length + " 处改动", undo: true });
    return next;
  }

  function undoWys() {
    const prev = wysUndoRef.current;
    if (prev == null) return;
    wysUndoRef.current = null;
    wysEditing.current = false;
    onChange(prev);
    setToast({ msg: "↩ 已撤销本次就地编辑" });
  }

  function onWysFocusIn() { wysEditing.current = true; }
  function onWysFocusOut(e) {
    /* React 的 onBlur = focusout（冒泡）：焦点仍在层内就不算离开 */
    if (e.currentTarget && e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return;
    wysEditing.current = false;
    commitWys();
  }

  /* Enter = 块内换行（段内续行，合法 LaTeX）；不引入 <div> 污染块结构 */
  function onWysKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      commitWys();
      if (onSave) { try { onSave(); setSavedTick(Date.now()); } catch (e2) {} }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      try { document.execCommand("insertText", false, "\n"); } catch (e3) {}
    }
  }

  /* 粘贴只收纯文本：HTML 富文本进 .tex 源码就是灾难 */
  function onWysPaste(e) {
    e.preventDefault();
    let t = "";
    try { t = (e.clipboardData || window.clipboardData).getData("text/plain") || ""; } catch (e2) {}
    if (t) { try { document.execCommand("insertText", false, t); } catch (e3) {} }
  }

  /* ---------- 面板桥：把「当前活动 .tex」广播给拿不到 filePath 的面板 ---------- */
  useEffect(() => {
    const owner = {}; // 本次挂载的归属令牌：ping 应答与卸载清场都认它
    const broadcast = () => announceActiveFile(filePath, fileName, owner);
    broadcast();
    window.addEventListener(LATEX_PING, broadcast);
    return () => {
      window.removeEventListener(LATEX_PING, broadcast);
      retractActiveFile(owner);
    };
  }, [filePath, fileName]);

  /* ---------- 光标广播：面板靠它高亮"我正在写哪一节" ---------- */
  useEffect(() => {
    const push = () => {
      try {
        window.dispatchEvent(new CustomEvent(LATEX_CURSOR, { detail: { path: filePath || "", line: cursor.line, col: cursor.col } }));
      } catch (e) {}
    };
    push();
    window.addEventListener(LATEX_CURSOR_PING, push);
    return () => window.removeEventListener(LATEX_CURSOR_PING, push);
  }, [cursor.line, cursor.col, filePath]);

  /* ---------- 状态栏（v0.6.2 新贡献面：props.setStatus） ----------
   * 宿主契约（装机版 PluginEditorHost / usePluginEditorStatusStore）：
   *   setStatus([{ id, text, title? }])  —— 只收数组；MAX_ITEMS=6 / MAX_TEXT=80 由宿主截断；
   *   按 id+text+title 去重，内容不变不重渲；组件卸载宿主自动 clear(ownerId)。
   * ⚠ ownerId 按「编辑器贡献」记账而不是按文件：多开 .tex 会互相盖，
   *   所以只在「本实例是当前活动编辑器」时才推（活动身份复用本插件已有的活动文件桥）。
   */
  const [isActiveEditor, setIsActiveEditor] = useState(true);
  useEffect(() => {
    function onActive(e) {
      const p = String((e && e.detail && e.detail.path) || "");
      setIsActiveEditor(!p || !filePath || sameAsFile(p));
    }
    window.addEventListener(LATEX_EV, onActive);
    return () => window.removeEventListener(LATEX_EV, onActive);
  }, [filePath]);

  /* 本地统计：状态栏每键都要更新，绝不能挂 MCP 往返 */
  const stats = useMemo(() => {
    const lines = content.split("\n");
    let sec = 0, eq = 0, fig = 0, tab = 0, cite = 0;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/^\s*%/.test(l)) continue;
      if (/\\(part|chapter|section|subsection|subsubsection)\*?\s*\{/.test(l)) sec++;
      if (/\\begin\{(equation|align|gather|eqnarray|multline|displaymath)\*?\}/.test(l)) eq++;
      if (/\\begin\{figure\*?\}/.test(l)) fig++;
      if (/\\begin\{table\*?\}/.test(l)) tab++;
      if (/\\cite[a-zA-Z]*\s*\{/.test(l)) {
        const hits = l.match(/\\cite[a-zA-Z]*\s*\{[^}]*\}/g) || [];
        for (let k = 0; k < hits.length; k++) cite += hits[k].replace(/^[^{]*\{|\}$/g, "").split(",").filter(Boolean).length;
      }
    }
    return { sec: sec, eq: eq, fig: fig, tab: tab, cite: cite, words: countWords(content).total };
  }, [content]);

  useEffect(() => {
    if (typeof props.setStatus !== "function") return;
    if (!isActiveEditor) return; // 非活动实例保持沉默：宿主只认一个 owner，抢着推只会互相盖
    const items = [
      { id: "sec", text: "📑 " + stats.sec + " 节", title: "章节数（\\part / \\chapter / \\section / \\subsection / \\subsubsection）" },
      { id: "env", text: "∑" + stats.eq + " · 图" + stats.fig + " · 表" + stats.tab, title: "公式 / 图 / 表环境数" },
      { id: "cite", text: "🔖 " + stats.cite + " · ≈" + stats.words + " 字", title: "\\cite 引用数 · 近似字数（CJK 字 + 英文词）" },
    ];
    /* v0.8.2：不再推「待办」。这里只数本文件的注释，而且只展示、点不动；
     * 左侧「章节大纲」面板已经用 MCP latex_parse 的 todos 把 TODO/FIXME 做成
     * 可点击的树节点（点一下直接跳到那一行）。同一件事说两遍，留下的该是能用的那个。 */
    if (issues && issues.summary) {
      const sm = issues.summary;
      items.push({
        id: "issue",
        text: (sm.errors + sm.warnings > 0 ? "⚠ " : "✅ ") + sm.errors + " 错 / " + sm.warnings + " 警",
        title: "引用校验结果（点工具栏「校验」刷新）",
      });
    }
    /* v0.8.2：不再往宿主状态栏塞「Ln / Col」。
     * 编辑器自己的底栏已经常驻显示光标位置，两处读的是同一份 cursor state，
     * 值必然相等 —— 上下并排就是同一个数字说两遍。
     *
     * 顺带把 cursor.line / cursor.col 从依赖数组摘掉：光标每动一格都会重跑这个 effect，
     * 推的内容却一字未变。宿主按 id+text+title 去重不会重渲，但每次按键白跑一趟 setStatus
     * 没有意义。现在只在 stats / issues / 视图真的变了才推。
     *
     * items 是**优先级数组**：越靠前越重要，满了先丢后面的（宿主另有 MAX_ITEMS=6）。
     * 摘掉 pos 后最多 4 条（sec / env / cite / issue?），离截断边界还有余量。
     * ⚠ 以后再加条目请往**前**放；直接 append 在末尾，一旦超过 6 条会被静默丢弃。 */
    try { props.setStatus(items.slice(0, 6)); } catch (e) {}
  }, [stats, issues, isActiveEditor, props.setStatus, view]);

  /* ---------- 行定位：面板点一行 -> 本编辑器滚过去 + 闪一下 + 回执 ---------- */
  useEffect(() => {
    function onReveal(e) {
      const d = (e && e.detail) || {};
      const target = String(d.path || "");
      if (target && !sameAsFile(target)) return; // 不是本文件，留给对应的编辑器实例
      const ln = Math.max(1, Number(d.line) || 1);
      const ok = gotoLineRef.current ? gotoLineRef.current(ln, { ack: { nonce: d.nonce || "" } }) : false;
      // v0.6.1：跳不成（可视化视图下 textarea 还没挂载）不回 ACK —— 回早了会让面板的兜底
      //（打开文件 + 重发）失效，用户就成了「点了没反应」。当拍跳成由这里回执，补跳成由 flush 补发。
      if (!ok) return;
      ackReveal(ln, d.nonce);
    }
    window.addEventListener(LATEX_REVEAL, onReveal);
    return () => window.removeEventListener(LATEX_REVEAL, onReveal);
  }, [filePath]);

  /* gotoLine 每次渲染都是新闭包，用 ref 保持监听里拿到的是最新那份 */
  useEffect(() => { gotoLineRef.current = gotoLine; });

  /* 补跳：视图切过去 / textarea 挂载之后的那一拍，把 pendingReveal 兑现（并补回执）。
   * 无 deps = 每拍都试；DOM 还没就绪就下次再试，pendingReveal 为空时立刻返回。 */
  useEffect(() => {
    const p = pendingReveal.current;
    if (!p || !taRef.current) return;
    pendingReveal.current = null;
    gotoLineRef.current(p.ln, { flash: p.flash, source: !!p.source });
    if (p.ack) ackReveal(p.ln, p.ack.nonce);
  });

  /* ---------- 宿主内置大纲点击 → 定位 ----------
   * 契约（docs §3.7）：editors[].outlineTool 声明的工具喂给宿主大纲面板，
   * 用户点条目 → 编辑器收到 notrat-outline-navigate，detail={pluginId,editorId,anchor,item}。
   * 与自家面板的 LATEX_REVEAL 通路并存（老宿主不发这个事件，监听空转无害）。
   */
  useEffect(() => {
    function onHostOutline(e) {
      const d = (e && e.detail) || {};
      if (d.pluginId && d.pluginId !== pluginId) return; // 别的插件的大纲，不接
      /* 不按 d.editorId 过滤：宿主传的是注册表 id（plugin-editor:<贡献key>），不是 manifest 里的
       * "latex-editor" —— 早先按字面量比过，会把自家事件全挡在门外，别再加回来。
       * pluginId 这一层已经足够：宿主大纲只在「本编辑器接管当前文件」时才用我们的条目。 */
      const ln = resolveOutlineLine(d, content);
      if (!ln) {
        setToast({ msg: "⚠ 这条大纲没能定位到源码行（锚点不是行号，标题也没匹配上）" });
        return;
      }
      if (!gotoLineRef.current) return;
      gotoLineRef.current(ln);
    }
    window.addEventListener("notrat-outline-navigate", onHostOutline);
    return () => window.removeEventListener("notrat-outline-navigate", onHostOutline);
  }, [pluginId, content]);

  /* ---------- MCP 工具通路 ---------- */
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const api = window.electronAPI;
        if (!api || !api.mcp || !api.mcp.listActiveServers) return;
        const servers = await api.mcp.listActiveServers();
        const mine = (servers || []).find(
          (s) => s && typeof s.id === "string" && s.id.indexOf("plugin-" + pluginId + "-") === 0
        );
        if (!dead && mine) setServerId(mine.id);
      } catch (e) {}
    })();
    return () => { dead = true; };
  }, []);

  async function callTool(tool, args) {
    const api = window.electronAPI;
    if (!api || !api.mcp || !api.mcp.callTool) throw new Error("宿主 MCP 通道不可用");
    const sid = serverId || "plugin-" + pluginId + "-latex";
    const r = await api.mcp.callTool(sid, tool, args);
    if (!r || r.success === false) throw new Error((r && r.error) || "工具调用失败");
    return ((r.result && r.result.content) || []).map((c) => c.text).join("\n");
  }

  /* ---------- v0.8.5：首屏探测 TeX 引擎 ----------
   * 为什么探测挂在这里，而不是「插件启用时」：插件没有生命周期钩子（manifest 的
   * contributions 里没有 activate/main），宿主也不转发 MCP 的 notifications ——
   * 服务端就算探到了，也没有通道说给界面听。编辑器挂载（= 第一次打开 .tex）是这个
   * 契约下唯一能主动开口的时机。
   * 只在**没引擎**时提示，且只提示一次：同一实例用 ref 占位（切档 / 重渲不再问一遍），
   * 跨会话由服务端状态文件记账（用户点过「知道了」就不再弹）。
   * 提示条刻意不做成常驻控件 —— 跟底栏「有结果才出现」同一条原则（v0.8.4 刚精简过工具栏）。 */
  useEffect(() => {
    if (!serverId || engineProbedRef.current) return;
    engineProbedRef.current = true;   // 先占位：一个实例只探一次
    let dead = false;
    (async () => {
      try {
        const info = JSON.parse(await callTool("latex_env", {}));
        if (dead || !info || info.ok || info.ack) return;   // 有引擎 / 已提示过 → 不打扰
        setEngineNote(info);
      } catch (e) {}   // 老版 server 没这个工具 / 通道不可用：当作没事，绝不因此报错
    })();
    return () => { dead = true; };
  }, [serverId]);

  /* 关掉提示条 = 记住「这台机器上别再弹」。ack 失败也无所谓：最坏下次再提示一遍。 */
  function dismissEngineNote() {
    setEngineNote(null);
    try { callTool("latex_env", { action: "ack" }); } catch (e) {}
  }

  /* 刚装完引擎的人会点这个：清服务端缓存重探一次，成了就撤掉提示条并回一句。 */
  async function recheckEngine() {
    setBusy("env");
    try {
      const info = JSON.parse(await callTool("latex_env", { action: "reset" }));
      if (info && info.ok) {
        setEngineNote(null);
        setToast({ msg: "✅ 已检测到 TeX 引擎：" + info.engine });
      } else {
        setEngineNote(info);
        setToast({ msg: "仍未检测到 TeX 引擎" });
      }
    } catch (e) {
      setToast({ msg: "重新检测失败：" + String(e.message || e) });
    } finally { setBusy(""); }
  }

  async function doCompile() {
    /* 编译读的是磁盘文件：先提交 + 保存，别拿旧文件糊弄用户 */
    const pendingC = commitWys();
    if (pendingC != null && onSave) { try { onSave(); } catch (e0) {} }
    setBusy("compile"); setErr(""); setBottomTab("compile"); setBottomOpen(true);
    try { setCompileOut(await callTool("latex_compile", { path: filePath })); }
    catch (e) { setErr(String(e.message || e)); }
    finally { setBusy(""); }
  }

  async function doValidate() {
    const pendingV = commitWys();
    if (pendingV != null && onSave) { try { onSave(); } catch (e0) {} }
    setBusy("validate"); setErr(""); setBottomTab("issues"); setBottomOpen(true);
    try {
      const out = await callTool("latex_validate", { path: filePath, format: "json" });
      setIssues(JSON.parse(out));
    } catch (e) { setErr(String(e.message || e)); }
    finally { setBusy(""); }
  }

  /* ---------- 导出（v0.8.4）：PDF / 自包含 HTML，并给出预览入口 ---------- */
  function baseName(p) {
    const t = String(p || "");
    const i = Math.max(t.lastIndexOf("/"), t.lastIndexOf("\\"));
    return i >= 0 ? t.slice(i + 1) : t;
  }
  function fmtSize(n) {
    const b = Number(n) || 0;
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
    return (b / 1024 / 1024).toFixed(2) + " MB";
  }
  function imgCount(info) {
    return info && info.images && info.images.inlined ? info.images.inlined : 0;
  }
  /* 文档标题：写进导出页的 <title>（服务端还有一层 \title{} 兜底） */
  function docTitle() {
    const m = /\\title\s*(?:\[[^\]]*\])?\s*\{([^{}]*)\}/.exec(content || "");
    return m ? m[1].replace(/\\[a-zA-Z]+\s*/g, "").trim() : "";
  }
  /* 预览：交给宿主打开产物（.pdf 内置阅读器 / .html 内置预览器）——
   * 同一份文件，所以「看到的」就是「导出的」，不会两处不同步。 */
  function openInHost(p) {
    if (!p) return;
    try {
      window.dispatchEvent(new CustomEvent("notrat-open-file", { detail: { path: p } }));
      setToast({ msg: "👁 已在 Notrat 中打开 " + baseName(p) });
    } catch (e) {
      setToast({ msg: "⚠ 打不开预览：用结果条里的「📋 复制路径」手动打开" });
    }
  }
  async function copyPath() {
    const p = exportInfo && exportInfo.outPath;
    if (!p) return;
    try {
      await navigator.clipboard.writeText(p);
      setToast({ msg: "📋 已复制产物路径" });
    } catch (e) {
      setToast({ msg: "⚠ 复制失败：" + p });
    }
  }
  /* 导出：先落盘（编译读的是磁盘文件，别拿旧内容糊弄用户）再调工具。
   * HTML 的正文用**编辑器这份**（KaTeX 已排版、含刚提交的就地编辑改动）；
   * 渲染不出来就不传 body，让服务端内核兜底（代价是公式退化为近似排版）。 */
  async function doExport(format, dest, opts) {
    const o = opts || {};
    const pending = commitWys();
    if (pending != null && onSave) { try { onSave(); } catch (e0) {} }
    setBusy("export"); setErr("");
    try {
      const a = { path: filePath, format: format, dest: dest || "same" };
      if (o.force) a.force = true;
      if (format === "html") {
        try {
          if (typeof LPC !== "undefined" && LPC && typeof LPC.renderPreview === "function") {
            a.body = LPC.renderPreview(content, { renderMath: renderMath, baseDir: baseDir }).html;
            const t = docTitle();
            if (t) a.title = t;
          }
        } catch (e1) { /* 交给服务端 */ }
      }
      const out = JSON.parse(await callTool("latex_export", a));
      setExportInfo(out);
      setBottomTab("export"); setBottomOpen(true);
      if (out && out.ok) setToast({ msg: "✅ 已导出 " + baseName(out.outPath) + "（" + fmtSize(out.bytes) + "）" });
      else setToast({ msg: "⚠ 导出未完成 —— 看底部「⬇ 导出」结果" });
      return out;
    } catch (e) {
      const msg = String((e && e.message) || e);
      setErr(msg);
      setExportInfo({ ok: false, format: format, message: msg });
      setBottomTab("export"); setBottomOpen(true);
      return null;
    } finally {
      setBusy("");
    }
  }
  /* 预览：已有产物直接开（不重编）；没有就先导一次再开 */
  async function doPreview(format) {
    let info = exportInfo && exportInfo.format === format && exportInfo.ok !== false ? exportInfo : null;
    if (!info) info = await doExport(format, "same");
    if (info && info.ok && info.outPath) openInHost(info.outPath);
    else setToast({ msg: "⚠ 还没有可预览的产物" });
  }

  /* ---------- KaTeX 资产加载（离线包；失败自动 miniMath 兜底） ---------- */
  useEffect(() => {
    if (!serverId || katexOkRef.current) return;
    let dead = false;
    (async () => {
      try {
        const out = await callTool("latex_asset", { name: "katex" });
        const a = JSON.parse(out);
        if (!a || !a.js || !a.css) return;
        if (!document.getElementById("katex-css-latex-plugin")) {
          const st = document.createElement("style");
          st.id = "katex-css-latex-plugin";
          st.textContent = a.css;
          document.head.appendChild(st);
        }
        new Function(a.js)();
        const k = window.katex;
        if (k && typeof k.renderToString === "function" && !dead) {
          katexOkRef.current = true;
          setKatexVer((v) => v + 1);
        }
      } catch (e) { /* CSP/离线 → miniMath 兜底 */ }
    })();
    return () => { dead = true; };
  }, [serverId]);

  /* ---------- 实时预览（baseDir 已上移到 wys 之前声明，避免 TDZ）---------- */


  /* 预览 / 富渲染卡片里的图片懒加载（走 MCP 读本地文件 → dataURI）。
   * v0.7.2：改成「每拍补一次还没排队的图」—— 就地编辑层里也有图（卡片是富渲染的），
   * 只在 pv.html 变化时跑会漏掉它们；拿到的 dataURI 进 assetCache，DOM 重建后同步命中。 */
  function loadAssetsIn(root) {
    if (!root || !serverId) return;
    const imgs = root.querySelectorAll("img[data-asset]:not([data-asset-queued])");
    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i];
      const p = img.getAttribute("data-asset");
      if (!p) continue;
      img.setAttribute("data-asset-queued", "1");   // 只排队一次，避免每拍重复发起
      if (assetCache.current.has(p)) { img.src = assetCache.current.get(p); continue; }
      callTool("latex_asset", { path: p }).then(function (out) {
        try {
          const a = JSON.parse(out);
          if (a && a.dataUri) { assetCache.current.set(p, a.dataUri); img.src = a.dataUri; }
        } catch (e) { /* 找不到图就留空 */ }
      }).catch(function () {});
    }
  }

  /* ---------- 就地编辑层 innerHTML 同步 ----------
   * 无 deps：每拍都试，靠 root.__latexHtml 做幂等守卫（省掉无谓的 DOM 重建）。
   * ⚠ wysEditing.current 为真时直接返回 —— 编辑期间 DOM 是权威，回写会把光标顶到开头。 */
  useEffect(() => {
    const root = pvRef.current;
    if (!root) return;
    if (wysEditing.current) return;
    const html = wys.html;
    if (root.__latexHtml !== html) {
      root.__latexHtml = html;
      root.innerHTML = html;
      /* 记下渲染时的原文：commit 靠它判断「这块到底动没动」 */
      const map = new Map();
      const blks = root.querySelectorAll(".wys-blk");
      for (let i = 0; i < blks.length; i++) {
        const p = blks[i].querySelector(".wys-edit");
        map.set(blks[i].getAttribute("data-bid"), p ? wysDomToTex(p) : "");
      }
      wysOrigRef.current = map;
      /* 就地编辑器开着时，DOM 一重建，原来那个节点就成了孤儿。
       * 按稳定 key 把新节点找回来重新标出来 —— 否则「我正在改这一项」的高亮会凭空消失。 */
      if (atomEdit && atomEdit.key) {
        const again = root.querySelector('[data-fk="' + atomEdit.key + '"], [data-key="' + atomEdit.key + '"]');
        if (again) pickAtom(again);
      }
    }
    /* 图每拍补一次：富渲染的卡片里也会有 img[data-asset] */
    loadAssetsIn(root);
  });

  /* ---------- 划词引用到 Sidebar ---------- */
  /* 引用气泡出现期间：点击气泡外 / 按 Esc 关闭 */
  useEffect(() => {
    if (!quote) return;
    const onDown = (e) => {
      if (bubbleRef.current && !bubbleRef.current.contains(e.target)) setQuote(null);
    };
    const onKey = (e) => { if (e.key === "Escape") setQuote(null); };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [quote]);

  /* 「＋ 插入」菜单：点别处 / Esc 关掉 */
  useEffect(() => {
    if (!menu) return;
    function onDown(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false); }
    function onKey(e) { if (e.key === "Escape") setMenu(false); }
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  /* toast 自动消失 */
  /* 「⬇ 导出」菜单：点别处 / Esc 关掉 */
  useEffect(() => {
    if (!exMenu) return;
    function onDown(e) { if (exMenuRef.current && !exMenuRef.current.contains(e.target)) setExMenu(false); }
    function onKey(e) { if (e.key === "Escape") setExMenu(false); }
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [exMenu]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 9000 : 2600);
    return () => clearTimeout(t);
  }, [toast]);

  function lineAt(off) {
    return content.slice(0, off).split("\n").length;
  }

  /* 源码区：鼠标划选 */
  function captureSrcQuote(e) {
    const ta = taRef.current; if (!ta) return;
    const s = ta.selectionStart, en = ta.selectionEnd;
    if (s === en) { setQuote(null); return; }
    const text = content.slice(s, en);
    if (!text.trim()) { setQuote(null); return; }
    const pos = clampPos(e.clientX, e.clientY);
    setQuote({ text: text, lineFrom: lineAt(s), lineTo: lineAt(en), x: pos.x, y: pos.y });
  }

  /* 源码区：键盘划选（shift+方向键）——气泡放在源码面板右上 */
  function captureSrcQuoteKb() {
    const ta = taRef.current; if (!ta) return;
    const s = ta.selectionStart, en = ta.selectionEnd;
    if (s === en) { setQuote(null); return; }
    const text = content.slice(s, en);
    if (!text.trim()) { setQuote(null); return; }
    const rect = ta.getBoundingClientRect();
    const pos = clampPos(rect.right - 200, rect.top + 30);
    setQuote({ text: text, lineFrom: lineAt(s), lineTo: lineAt(en), x: pos.x, y: pos.y });
  }

  /* 预览区：划选（行号取选区两端最近的 data-line 块锚点） */
  function capturePvQuote() {
    let sel = null;
    try { sel = window.getSelection(); } catch (e) {}
    const text = sel ? String(sel) : "";
    if (!text.trim()) { setQuote(null); return; }
    let a = null, b = null;
    if (sel) { a = nodeLine(sel.anchorNode); b = nodeLine(sel.focusNode); }
    const lo = (a != null && b != null) ? Math.min(a, b) : (a != null ? a : b);
    const hi = (a != null && b != null) ? Math.max(a, b) : (a != null ? a : b);
    let pos = { x: 100, y: 100 };
    try { pos = clampPos(window.event ? window.event.clientX : 100, window.event ? window.event.clientY : 100); } catch (e) {}
    setQuote({ text: text, lineFrom: lo, lineTo: hi, x: pos.x, y: pos.y });
  }

  /* 投递：优先宿主第一方通道（与宿主自家编辑器同一事件 → 侧栏紫色引用卡片），侧栏未开则降级剪贴板 */
  async function doQuote() {
    const q = quote; if (!q) return;
    setQuote(null);
    const detail = {
      text: q.text,
      source: fileName || "LaTeX 选段",
      filePath: filePath || "",
      lineFrom: q.lineFrom,
      lineTo: q.lineTo,
    };
    try {
      const composer = document.querySelector("[data-sidebar-composer]");
      if (composer) {
        window.dispatchEvent(new CustomEvent("notrat-quote-to-chat", { detail: detail }));
        setToast({ msg: "✓ 已引用到 AI 对话（见侧栏引用卡片）" });
        return;
      }
    } catch (e) {}
    try {
      await navigator.clipboard.writeText(q.text);
      setToast({ msg: "📋 侧栏未打开，选中文本已复制到剪贴板" });
    } catch (e) {
      setToast({ msg: "⚠ 引用失败：" + String((e && e.message) || e) });
    }
  }

  /* ---------- 编辑行为 ---------- */
  /* v0.8.6：把「就地改这几个字」和「按快捷键」收敛到同一处 —— 两者都是
   * 「换掉选区那段文本，再把光标放到该去的地方」，区别只是文本从哪来。 */

  /** 章节层级：有选区包住；没选区改当前整行。原本已是章节命令 → 只换层级、保留标题。 */
  function applyHead(cmd) {
    const ta = taRef.current; if (!ta) return;
    const s0 = ta.selectionStart, e0 = ta.selectionEnd;
    if (e0 > s0) {
      const sel = content.slice(s0, e0);
      const ins = cmd ? "\\" + cmd + "{" + sel + "}" : sel;
      onChange(content.slice(0, s0) + ins + content.slice(e0));
      pendingRange.current = [s0 + ins.length, s0 + ins.length];
      return;
    }
    const ls = content.lastIndexOf("\n", s0 - 1) + 1;
    let le = content.indexOf("\n", s0);
    if (le < 0) le = content.length;
    const m = HEAD_RE.exec(content.slice(ls, le));
    const title = m ? m[1] : content.slice(ls, le).trim();
    const ins = cmd ? "\\" + cmd + "{" + title + "}" : title;
    onChange(content.slice(0, ls) + ins + content.slice(le));
    const caret = ls + (cmd ? ins.length - 1 : ins.length);   // 标题末尾、} 之前
    pendingRange.current = [caret, caret];
  }

  /**
   * 格式快捷键的统一入口。命中返回 true（由调用方 preventDefault）。
   * 只处理「源码 / 分屏」里的 textarea —— 调用方已保证焦点在那儿。
   */
  function applyFmt(e) {
    const k = (e.key || "").toLowerCase();
    const code = e.code || "";
    let hit = null;
    for (let i = 0; i < FMT.length; i++) {
      const f = FMT[i];
      if (!!f.shift !== !!e.shiftKey) continue;
      if (f.code ? code === f.code : k === f.k) { hit = f; break; }
    }
    if (!hit) return false;
    if (hit.head != null) { applyHead(hit.head); return true; }
    const ta = taRef.current;
    if (!ta) return false;
    const s0 = ta.selectionStart, e0 = ta.selectionEnd;
    const hasSel = e0 > s0;
    const tpl = (hasSel && hit.s) ? hit.s : hit.e;
    if (!tpl) return false;
    const ex = expandTpl(tpl, hasSel ? content.slice(s0, e0) : "");
    onChange(content.slice(0, s0) + ex.text + content.slice(e0));
    pendingRange.current = [s0 + ex.caret, s0 + ex.caret];   // 选区收起、落在该在的地方
    return true;
  }

  fmtRef.current = applyFmt;   // 交给 root 捕获层（它在 useEffect 里只挂一次）

  function insert(text, back) {
    const ta = taRef.current; if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    onChange(content.slice(0, s) + text + content.slice(e));
    pendingCursor.current = s + text.length - (back || 0);
  }

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    /* 区间优先（格式快捷键 / 章节层级走这条）：一次把光标放到指定位。
     * 两个 ref 同时有值时以区间为准，并顺手清掉另一个 —— 否则它会在下一拍
     * 把光标又拽回旧位置。 */
    if (pendingRange.current) {
      const r = pendingRange.current;
      pendingRange.current = null;
      pendingCursor.current = null;
      ta.focus();
      try { ta.setSelectionRange(r[0], r[1]); } catch (e) {}
      return;
    }
    if (pendingCursor.current != null) {
      const p = pendingCursor.current;
      pendingCursor.current = null;
      ta.focus();
      try { ta.setSelectionRange(p, p); } catch (e) {}
    }
  }, [content]);

  function updateCursor() {
    const ta = taRef.current; if (!ta) return;
    const upto = content.slice(0, ta.selectionStart);
    const nl = upto.split("\n");
    setCursor({ line: nl.length, col: nl[nl.length - 1].length + 1 });
  }

  /* ================= 大纲锚点 → 行号（模块级纯函数） =================
   *
   * 宿主只保证回抛 detail={pluginId,editorId,anchor,item}，anchor 的语义是
   * 「outlineTool 返回什么就回传什么」，而且缺失时会**退化成条目标题文本**
   * （见 PluginOutlineItems：const anchor = item.anchor ?? item.text）。
   *
   * 旧实现 「Math.max(1, Number(d.anchor) || 0)」 对非数字锚点会静默得 1 —— 这就是
   * 「怎么点都跳第 1 行」的直接原因。现在宁可不跳（并明说），也不跳错地方。
   */

  /** 标题 → 行号：去掉自动编号后在各 \section 家族命令里回查。 */
  function lineOfSectionTitle(content, raw) {
    const base = String(raw == null ? "" : raw).replace(/\s+/g, " ").trim();
    if (!base) return 0;
    const wants = [base];
    const stripped = base.replace(/^\s*(?:\d+(?:\.\d+)*|[A-Z](?:\.\d+)*|第\s*\d+\s*部分)[\s.、·]+/, "").trim();
    if (stripped && stripped !== base) wants.push(stripped);
    const lines = String(content || "").split("\n");
    const re = /\\(part|chapter|section|subsection|subsubsection)\*?\s*\{([^}]*)\}/;
    let loose = 0;
    for (let i = 0; i < lines.length; i++) {
      const m = re.exec(lines[i]);
      if (!m) continue;
      const title = m[2].replace(/\s+/g, " ").trim();
      for (let k = 0; k < wants.length; k++) {
        if (title === wants[k]) return i + 1;
        if (!loose && wants[k].length >= 2 && (title.indexOf(wants[k]) >= 0 || wants[k].indexOf(title) >= 0)) loose = i + 1;
      }
    }
    return loose;
  }

  /** detail → 行号。数字锚点优先；否则按标题回查；都没有返回 0（**不返回 1**）。 */
  function resolveOutlineLine(detail, content) {
    const d = detail || {};
    const item = d.item || {};
    const cands = [d.anchor, item.anchor, item.line, item.lineNumber];
    for (let i = 0; i < cands.length; i++) {
      const raw = cands[i];
      if (raw == null || raw === "") continue;
      const str = String(raw).trim();
      if (!/^\d+$/.test(str)) continue; // 只认纯数字行号：文本锚点绝不 Number() 后瞎跳
      const n = parseInt(str, 10);
      if (Number.isFinite(n) && n >= 1) return n;
    }
    return lineOfSectionTitle(content, d.anchor != null ? d.anchor : item.text);
  }

  function sameAsFile(p) {
    if (!p) return true;
    const a = String(p).replace(/\\/g, "/").toLowerCase();
    const b = String(filePath || "").replace(/\\/g, "/").toLowerCase();
    return a === b;
  }

  /* 闪烁层跟着 textarea 的 scrollTop 走：不引 state，避免滚动时整棵树重渲染 */
  function paintFlash(ln) {
    const el = flashRef.current, ta = taRef.current;
    if (!el || !ta) return;
    if (!ln) { el.style.opacity = "0"; return; }
    el.style.top = 8 + (ln - 1) * 20 - ta.scrollTop + "px";
    el.style.opacity = "1";
  }

  function flashAt(ln) {
    flashLineRef.current = ln;
    setFlashLine(ln);
    paintFlash(ln);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(function () {
      flashTimer.current = null;
      flashLineRef.current = 0;
      setFlashLine(0);
      paintFlash(0);
    }, 1400);
  }

  function syncScroll() {
    const ta = taRef.current; if (!ta) return;
    if (preRef.current) { preRef.current.scrollTop = ta.scrollTop; preRef.current.scrollLeft = ta.scrollLeft; }
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
    const pvEl = pvRef.current;
    if (pvEl && view === "split") {
      const ratio = ta.scrollTop / Math.max(1, ta.scrollHeight - ta.clientHeight);
      pvEl.scrollTop = ratio * Math.max(0, pvEl.scrollHeight - pvEl.clientHeight);
    }
    if (flashLineRef.current) paintFlash(flashLineRef.current);
  }

  /* ---------- 预览内定位（v0.7.2）----------
   * 就地编辑时点一下公式卡片就被踢进分屏看见源码，是用户明确抱怨的行为。
   * 现在：源码 textarea 没挂载时，**视图一律不动**，在预览里滚到那一块闪一下就算跳到了。
   * 只有「显式要求源码」（卡片上的 ↗ 定位）才会切视图。 */
  function flashPreview(el) {
    if (!el) return;
    el.classList.remove("wys-flash");
    void el.offsetWidth;              // 强制回流，保证连点两次动画也会重放
    el.classList.add("wys-flash");
    setTimeout(function () { el.classList.remove("wys-flash"); }, 1200);
  }

  function revealInPreview(ln, flash) {
    const root = pvRef.current;
    if (!root) return false;
    /* .wys-blk 只有 data-s（0 基起始行）；.wys-atom 有 data-line（1 基）。统一成 1 基再比。 */
    const cands = root.querySelectorAll("[data-line],[data-s]");
    let best = null, bestLn = -1;
    for (let i = 0; i < cands.length; i++) {
      const el = cands[i];
      const v = el.getAttribute("data-line");
      const n = v != null ? parseInt(v, 10) : (parseInt(el.getAttribute("data-s"), 10) + 1);
      if (!(n >= 1) || n > ln) continue;
      if (n > bestLn) { bestLn = n; best = el; }
    }
    if (!best) return false;
    try { best.scrollIntoView({ block: "center", behavior: "smooth" }); }
    catch (e) { try { best.scrollIntoView(); } catch (e2) {} }
    if (flash !== false) flashPreview(best);
    return true;
  }

  /* 显式「去源码里看这一块」——唯一会切视图的入口 */
  function gotoSourceAt(ln) {
    if (taRef.current) { gotoLine(ln, { source: true }); return; }
    pendingReveal.current = { ln: ln, flash: true, ack: null, source: true };
    setView("split");   // 卡片按钮只存在于预览面板，所以这里必然是从预览切过去
    writeHostMode("split");   // v0.8.3：档位指示只剩标签栏这一处，内部切档必须同步，别让它显示假的
  }

  /* 高亮「正在被编辑的那一个原子块」。 */
  function pickAtom(el) {
    const root = pvRef.current;
    if (root) {
      const prev = root.querySelectorAll(".wys-atomblk.picked, .wys-fmline.picked");
      for (let pi = 0; pi < prev.length; pi++) if (prev[pi] !== el) prev[pi].classList.remove("picked");
    }
    if (el && el.classList) el.classList.add("picked");
    atomPickedRef.current = el || null;
  }

  /* 点原子 → 在**原地**打开就地编辑器。分两种，别混：
   *   行内原子 .wys-atom    —— \cite{key} / \ref{lab} / 行内公式，是**片段**
   *   块级原子 .wys-atomblk —— 公式环境 / 浮动体 / 参考文献，是**整块**
   * 行内要先判：块级原子的渲染结果里也可能含行内原子（比如图 caption 里的 \ref），
   * 那种情况下用户点的是那个 \ref，不是整个浮动体。
   *
   * 为什么挂在 mousedown 而不是 click：等 click 的话，焦点会先从正在编辑的正文块上
   * 掉下来 → blur → commitWys → 整层 innerHTML 重建 → 被点的那块已经不是同一个
   * DOM 节点了，浮层算出来的位置也跟着失效。 */
  function onPreviewMouseDown(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest(".wys-pop")) return;          // 浮层内部的点击不归这里管
    /* 导言区的项排在最前面：标题里本身就可能含 \cite / \LaTeX 这类行内原子，
     * 那种情况下用户点的是**整行**（\title{…}），不是标题里的某一个命令。 */
    const fm = t.closest(".wys-fmline");
    if (fm) { e.preventDefault(); openAtom(fm); return; }
    const inline = t.closest(".wys-atom");
    if (inline) { e.preventDefault(); openInline(inline); return; }
    const blk = t.closest(".wys-atomblk");
    if (blk) { e.preventDefault(); openAtom(blk); return; }
  }

  /* 行内原子（[1] / 图 1 / 行内公式）的就地编辑。
   * 提交路径不同：不替换整块，只改这个节点的 data-tex 属性 —— 见 commitAtom。 */
  function openInline(el) {
    const tex = el.getAttribute("data-tex") || "";
    if (!tex) return;
    if (atomEdit && atomEdit.node === el) return;
    if (atomEdit) commitAtom();
    const r = el.getBoundingClientRect();
    const W = typeof window === "undefined" ? 1200 : window.innerWidth;
    const H = typeof window === "undefined" ? 800 : window.innerHeight;
    const host = el.closest ? el.closest(".wys-blk") : null;
    setAtomEdit({
      mode: "inline", node: el, tex: tex, orig: tex, s: -1, e: -1,
      blkS: host ? host.getAttribute("data-s") : null,
      x: Math.max(8, Math.min(r.left, W - 556)),
      y: Math.max(8, Math.min(r.bottom + 6, H - 220)),
    });
  }

  /* 一个就地编辑目标的身份。**不能拿 DOM 节点当身份**：DOM 一重建节点就换人了，
   * 同一个目标会被当成新的，浮层会莫名其妙地重开、高亮会消失。 */
  function keyOf(el) {
    const fk = el.getAttribute("data-fk");
    if (fk) return fk;
    const dk = el.getAttribute("data-key");
    return dk || ("bid:" + el.getAttribute("data-bid"));
  }

  /* 此时此地读一份「编辑目标」的快照。必须在动手之前读 —— 下面一落地，DOM 就重建了。 */
  function specOf(el) {
    const s0 = parseInt(el.getAttribute("data-s"), 10);
    const e0 = parseInt(el.getAttribute("data-e"), 10);
    if (!(s0 >= 0) || !(e0 >= s0)) return null;
    const r = el.getBoundingClientRect();
    return {
      s: s0, e: e0,
      tex: el.getAttribute("data-tex") || "",
      prefix: el.getAttribute("data-prefix"),
      suffix: el.getAttribute("data-suffix"),
      what: el.getAttribute("data-what") || "",
      x: r.left, y: r.bottom + 6,
    };
  }

  /* preventDefault 挡掉了 blur，正在打字的正文块还没回写；而 applyEdits 是拿 content 算的。
   * 不先把正文落地就开浮层，两边行号会错位 —— 那是最容易丢稿的一种错位。 */
  function flushTextEdits() {
    if (!wysEditing.current) return;
    wysEditing.current = false;
    commitWys();
  }

  /* 打开某一处就地编辑器（原子块 / 导言区的某一项）。改点别处时先把上一处落地。 */
  function openAtom(el) {
    const key = keyOf(el);
    if (atomEdit && atomEdit.key === key) return;   // 已经开着它了
    const sp = specOf(el);
    if (!sp) return;
    if (atomEdit) commitAtom();                     // 上一处先提交，别丢
    flushTextEdits();                               // 正在打字的正文块也先落地
    pickAtom(el);
    const W = typeof window === "undefined" ? 1200 : window.innerWidth;
    const H = typeof window === "undefined" ? 800 : window.innerHeight;
    setAtomEdit({
      mode: "block", key: key, el: el, s: sp.s, e: sp.e, tex: sp.tex, orig: sp.tex,
      prefix: sp.prefix, suffix: sp.suffix, what: sp.what,
      x: Math.max(8, Math.min(sp.x, W - 556)),
      y: Math.max(8, Math.min(sp.y, H - 220)),
    });
  }

  /* 提交原子编辑。两条路径：
   *   行内 → 只改该节点的 data-tex，再走常规的块提交（wysDomToTex 遇到带 data-tex 的
   *          节点就原样吐出该属性，所以改属性 == 改这一块的回写结果，不需要重算偏移，
   *          也不会碰到块里别的原子）。
   *   块级 → 走 applyEdits 只替换**这一块的行区间**，三道自检一条不少。
   * 显示不在这里手动改：onChange 之后整层会用新源码重渲染，所见即所得。 */
  function commitAtom() {
    const a = atomEdit;
    if (!a) return;
    if (atomPickedRef.current) { try { atomPickedRef.current.classList.remove("picked"); } catch (e0) {} }
    atomPickedRef.current = null;
    if (a.tex === a.orig) { setAtomEdit(null); return; }

    if (a.mode === "inline") {
      setAtomEdit(null);
      let node = a.node;
      /* 浮层开着的这段时间里 DOM 可能被重建过（比如焦点一离开正文就触发了 commitWys）。
       * 那时原节点已经成了孤儿，往孤儿身上写 data-tex 等于把这次修改丢进黑洞。
       * 按「同一个块 + 同一段原文」把新节点找回来；找不到就明说，绝不假装改成功了。 */
      if (node && !node.isConnected) {
        const root2 = pvRef.current;
        const host = root2 && a.blkS != null ? root2.querySelector('.wys-blk[data-s="' + a.blkS + '"]') : null;
        const all = host ? host.querySelectorAll(".wys-atom") : [];
        node = null;
        for (let i = 0; i < all.length; i++) {
          if (all[i].getAttribute("data-tex") === a.orig) { node = all[i]; break; }
        }
      }
      if (!node || !node.setAttribute) {
        setToast({ msg: "⚠ 这一段在编辑期间被重排过，没能落回去 —— 请再点一次它" });
        return;
      }
      node.setAttribute("data-tex", a.tex);
      node.setAttribute("title", a.tex);
      commitWys();          // 读回时 data-tex 已是新值 → 只改动所在的那一块
      return;
    }

    let next;
    try {
      if (WYS.applyEdits(content, []) !== content) throw new Error("空编辑集未逐字节还原");
      /* 导言区那几项改的只是「正文」，写回时要拼回前缀与后缀（\title{ … }）。
       * 自检：前缀 + **原正文** + 后缀 必须逐字节等于原行 —— 否则「改显示」就变成「改源码」了。 */
      let newText = a.tex;
      if (a.prefix != null || a.suffix != null) {
        const origText = content.split("\n").slice(a.s, a.e + 1).join("\n");
        if (!WYS.partsExact({ prefix: a.prefix, body: a.orig, suffix: a.suffix }, origText)) {
          throw new Error("前缀/后缀拼接未能逐字节还原原行");
        }
        newText = WYS.partsJoin(a.prefix, a.tex, a.suffix);
      }
      next = WYS.applyEdits(content, [{ startLine: a.s, endLine: a.e, newText: newText }]);
      WYS.parseDoc(next);
    } catch (err) {
      setToast({ msg: "⚠ 这一处的写回没过自检，已放弃：" + String((err && err.message) || err) });
      setAtomEdit(null);
      return;
    }
    wysUndoRef.current = content;
    onChange(next);
    setToast({ msg: "✏ 已就地改写" + (a.what ? a.what : "这一块") + "（L" + (a.s + 1) + (a.e > a.s ? "–" + (a.e + 1) : "") + "）", undo: true });
    setAtomEdit(null);
  }

  /* 行跳转：面板 / 内置大纲 / 预览点击都走这里。opts.flash=false 可关掉闪烁。
   *
   * v0.6.1 修「点大纲没反应」：可视化视图下 showSrc = false，源码 textarea 压根没挂载，
   * 而 setView("split") 是异步的 —— 当拍读 taRef 仍是 null。老实现这里直接 return，
   * 外面却照样回 ACK ⇒ 既不跳、面板又以为跳成功、兜底也不触发。
   * v0.7.2：跳不了也**不再偷偷切分屏** —— 在预览里滚过去闪一下（视作跳到了，照常回 ACK），
   * 只有 opts.source（用户点了「↗ 定位」）才允许切视图。 */
  function gotoLine(ln, opts) {
    const wantSrc = !!(opts && opts.source);
    const ta = taRef.current;
    if (!ta) {
      /* 源码 textarea 没挂载（预览视图；或刚切分屏的第一帧）。
       * 只要不是显式要源码，就在预览里兑现定位 —— 视图不动。 */
      /* 只有「预览就是唯一画布」才就地滚动；分屏里源码在场，照旧把光标送过去 */
      if (!wantSrc && view === "preview" && revealInPreview(ln, !opts || opts.flash !== false)) return true;
      pendingReveal.current = { ln: ln, flash: !opts || opts.flash !== false, ack: (opts && opts.ack) || null, source: wantSrc };
      if (wantSrc && view !== "split" && view !== "src") { setView("split"); writeHostMode("split"); }
      return false;
    }
    const lines = content.split("\n");
    let off = 0;
    for (let i = 0; i < ln - 1 && i < lines.length; i++) off += lines[i].length + 1;
    ta.focus();
    try { ta.setSelectionRange(off, off + (lines[ln - 1] || "").length); } catch (e) {}
    ta.scrollTop = Math.max(0, (ln - 1) * 20 - ta.clientHeight / 3);
    syncScroll(); updateCursor();
    if (!opts || opts.flash !== false) flashAt(ln);
    return true;
  }

  /* 回执：告诉面板「这一跳有人接住了」，面板才不再走兜底（打开文件 + 重发）。
   * v0.6.1 之前是「无条件回」，跳没跳成都不管 —— 那才是这个 bug 能藏这么久的原因。 */
  function ackReveal(ln, nonce) {
    try {
      window.dispatchEvent(new CustomEvent(LATEX_REVEAL_ACK, { detail: { path: filePath || "", line: ln, nonce: nonce || "" } }));
    } catch (e) {}
  }

  function onPreviewClick(e) {
    const t = e.target;
    /* 卡片工具条的按钮自己处理（切源码 / 显式定位），别被行跳转抢走 */
    if (t && t.closest && t.closest("[data-act]")) return;
    /* 有划选时点击预览 = 收尾选区，不做行跳转 */
    try {
      const sel = window.getSelection();
      if (sel && String(sel).trim()) return;
    } catch (e2) {}
    /* 点正文 / 标题 = 就地放光标写字。点原子块 = 在原地打开它的编辑器（mousedown 已接管）。
     * 两种都不动视图、不跳源码 —— 这就是「在结果上编辑」。 */
    if (t && t.closest && (t.closest(".wys-fmline") || t.closest(".wys-atom") || t.closest(".wys-atomblk"))) return;
    pickAtom(null);
  }

  function onKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (onSave) { try { onSave(); setSavedTick(Date.now()); } catch (e2) {} }
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      insert("  ");
    }
  }

  /* ---------- 派生数据 ---------- */
  const lines = useMemo(() => content.split("\n"), [content]);
  const highlighted = useMemo(() => lines.map(hlLine).join("\n") + "\n", [lines]);
  const wc = useMemo(() => countWords(content), [content]);
  const issueCount = issues ? issues.summary.errors + issues.summary.warnings + issues.summary.infos : 0;
  const toolReady = !!serverId;
  const showSrc = view !== "preview";
  const showPv = view !== "src";
  const flexPart = view === "split" ? "1 1 50%" : "1 1 100%";

  const taStyle = {
    position: "absolute", inset: 0, width: "100%", height: "100%",
    margin: 0, border: "none", outline: "none", resize: "none",
    padding: "8px 12px", fontFamily: MONO, fontSize: 13, lineHeight: FH,
    whiteSpace: "pre-wrap", overflowWrap: "break-word", overflow: "auto",
    background: "transparent", color: "transparent", caretColor: "hsl(var(--foreground))",
  };
  const preStyle = {
    position: "absolute", inset: 0, margin: 0, overflow: "hidden",
    padding: "8px 12px", fontFamily: MONO, fontSize: 13, lineHeight: FH,
    whiteSpace: "pre-wrap", overflowWrap: "break-word",
    color: "hsl(var(--foreground))", pointerEvents: "none",
  };

  return (
    <div ref={rootRef} style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "hsl(var(--background))", color: "hsl(var(--foreground))" }}>
      <style dangerouslySetInnerHTML={{ __html: PV_CSS + WYS_CSS + UI_CSS }} />

      {/* 首屏引擎提示条（v0.8.5）：只在「没装 TeX 引擎」时出现，可关 + 记住。
       *   不是常驻控件：没装引擎只影响「编译 / 导出 PDF」，其余功能全正常 —— 这句话必须写在
       *   提示条里，否则用户会拿「插件坏了」这个错结论去排查。 */}
      {engineNote ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "5px 10px", fontSize: 12, lineHeight: 1.6, background: "hsl(38 92% 50% / .12)", borderBottom: "1px solid hsl(38 92% 50% / .4)" }}>
          <span>⚠ 未检测到 TeX 引擎，<b>只影响「编译 / 导出 PDF」</b>；编辑、大纲、引用校验、公式预览、导出 HTML 都正常。</span>
          <span style={{ color: "hsl(var(--muted-foreground))" }}>
            装好即用、无需配 PATH：<code style={{ fontFamily: MONO }}>{engineNote.installHint || "winget install MiKTeX.MiKTeX"}</code>
          </span>
          <div style={{ flex: 1 }} />
          <button style={tbtn} onClick={recheckEngine} disabled={busy === "env"} title="清掉缓存重新探测（刚装完引擎时点它）">
            {busy === "env" ? "⏳" : "🔄"} 重新检测
          </button>
          <button style={{ ...tbtn, border: "none", background: "transparent" }} onClick={dismissEngineNote} title="记住了：这台机器上不再提示">
            知道了
          </button>
        </div>
      ) : null}

      {/* 工具栏（v0.8.3：视图切换搬去宿主标签栏的模式开关，这里只剩文档级动作）
       *   删掉的是「📄 源码 / ⧉ 分屏 / 📑 预览」那排分段按钮 —— 档位是同一件事，
       *   宿主标签栏已经有一份权威的（就是标签 tab 旁边那排），编辑器内再画一份只会互相打架。
       *   留下的（宿主不管的）：＋插入 / 编译 / 校验 / 导出 / MCP 状态点。 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderBottom: "1px solid hsl(var(--border))", flexWrap: "wrap" }}>
        {view !== "src" ? (
          <span style={{ fontSize: 11.5, color: "hsl(var(--muted-foreground))", whiteSpace: "nowrap" }}>
            ✏ 点哪改哪 · 公式点一下原地编辑
          </span>
        ) : null}

        {view !== "preview" ? (
          <div ref={menuRef} style={{ position: "relative" }}>
            <button style={tbtn} onClick={() => setMenu(!menu)} title="插入常用结构（右侧标注的快捷键，在源码 / 分屏视图生效）">＋ 插入 {menu ? "▴" : "▾"}</button>
            {menu ? (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 40, minWidth: 224, maxHeight: 430, overflowY: "auto", padding: 4, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", boxShadow: "0 8px 24px rgba(0,0,0,.25)" }}>
                {INSERT_GROUPS.map((g) => {
                  const rows = INSERTS.filter((it) => it[4] === g);
                  if (!rows.length) return null;
                  return (
                    <div key={g}>
                      <div className="lx-mh">{g}</div>
                      {rows.map((it) => (
                        <button key={it[0]} className="lx-mi" onClick={() => { insert(it[1], it[2]); setMenu(false); }}>
                          <span>{it[0]}</span>
                          {it[3] ? <span className="lx-kbd">{it[3]}</span> : null}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        <div style={{ flex: 1 }} />

        <button style={{ ...tbtn, border: "none", background: "transparent" }} onClick={doCompile} disabled={busy === "compile"} title="编译当前 .tex（MCP latex_compile）">
          {busy === "compile" ? "⏳" : "🔨"} 编译
        </button>
        <button style={{ ...tbtn, border: "none", background: "transparent" }} onClick={doValidate} disabled={busy === "validate"} title="校验 ref / cite / label（MCP latex_validate）">
          {busy === "validate" ? "⏳" : "✅"} 校验
        </button>

        <div ref={exMenuRef} style={{ position: "relative" }}>
          <button
            style={{ ...tbtn, border: "none", background: "transparent" }}
            onClick={() => setExMenu(!exMenu)}
            disabled={busy === "export"}
            title="导出 PDF / 自包含 HTML，并可预览（MCP latex_export）"
          >
            {busy === "export" ? "⏳" : "⬇"} 导出 {exMenu ? "▴" : "▾"}
          </button>
          {exMenu ? (
            <div style={tmenu}>
              <div style={tcap}>预览（不重编，秒开）</div>
              <button style={titem} onClick={() => { setExMenu(false); doPreview("pdf"); }}>👁 预览 PDF</button>
              <button style={titem} onClick={() => { setExMenu(false); doPreview("html"); }}>👁 预览 HTML</button>
              <div style={tsep} />
              <div style={tcap}>导出到文档旁</div>
              <button style={titem} onClick={() => { setExMenu(false); doExport("pdf", "same"); }}>📄 PDF（编译生成）</button>
              <button style={titem} onClick={() => { setExMenu(false); doExport("html", "same"); }}>🌐 HTML（自包含 · 可分享 / 打印）</button>
              <div style={tsep} />
              <div style={tcap}>导出到桌面</div>
              <button style={titem} onClick={() => { setExMenu(false); doExport("pdf", "desktop"); }}>📄 PDF → 桌面</button>
              <button style={titem} onClick={() => { setExMenu(false); doExport("html", "desktop"); }}>🌐 HTML → 桌面</button>
            </div>
          ) : null}
        </div>
        <span
          title={toolReady ? (katexOkRef.current ? "MCP 工具就绪 · 公式用 KaTeX 渲染" : "MCP 工具就绪 · 公式走内置简易渲染") : "MCP 未连接：解析 / 编译不可用"}
          style={{ fontSize: 11, color: toolReady ? "hsl(var(--muted-foreground))" : "#f59e0b" }}
        >{toolReady ? (katexOkRef.current ? "⚙ ✓" : "⚙") : "⚙ 未连接"}</span>
      </div>

      {/* 主体：源码 + 预览（v0.6.1 起编辑器内不再内嵌大纲，章节导航统一走左侧「章节大纲」面板） */}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>

        {showSrc ? (
          <div style={{ flex: flexPart, minWidth: 0, display: "flex", position: "relative" }}>
            <div ref={gutterRef} style={{
              width: 34, overflow: "hidden", textAlign: "right", padding: "8px 6px 8px 0",
              fontFamily: MONO, fontSize: 13, lineHeight: FH,
              color: "hsl(var(--muted-foreground))", userSelect: "none",
              background: "hsl(var(--muted) / 0.3)", borderRight: "1px solid hsl(var(--border))",
              flexShrink: 0,
            }}>
              {lines.map((_, i) => (
                <div key={i} style={flashLine === i + 1 ? { color: "hsl(var(--primary))", fontWeight: 700, background: "hsl(var(--primary) / 0.14)" } : null}>{i + 1}</div>
              ))}
            </div>
            <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
              {/* 定位闪烁层：top 由 paintFlash 跟着 scrollTop 算，pointerEvents 关掉不挡输入 */}
              <div ref={flashRef} style={{
                position: "absolute", left: 0, right: 0, height: 20, top: -999,
                background: "hsl(var(--primary) / 0.13)", borderLeft: "2px solid hsl(var(--primary))",
                pointerEvents: "none", opacity: 0, transition: "opacity .25s", zIndex: 1,
              }} />
              <pre ref={preRef} style={preStyle} dangerouslySetInnerHTML={{ __html: highlighted }} />
              <textarea
                ref={taRef}
                style={taStyle}
                value={content}
                spellCheck={false}
                onChange={(e) => { onChange(e.target.value); updateCursor(); setQuote(null); }}
                onScroll={syncScroll}
                onKeyDown={onKeyDown}
                onClick={updateCursor}
                onKeyUp={(e) => { updateCursor(); captureSrcQuoteKb(); }}
                onMouseUp={captureSrcQuote}
              />
            </div>
          </div>
        ) : null}

        {showPv ? (
          <div style={{
            flex: flexPart, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden",
            borderLeft: view === "split" && showSrc ? "1px solid hsl(var(--border))" : "none",
            background: "hsl(var(--card))",
          }}>
            <div
              ref={pvRef}
              className="pv-root"
              onClick={onPreviewClick}
              onMouseDown={onPreviewMouseDown}
              onMouseUp={capturePvQuote}
              onFocus={onWysFocusIn}
              onBlur={onWysFocusOut}
              onKeyDown={onWysKeyDown}
              onPaste={onWysPaste}
              contentEditable={false}
              suppressContentEditableWarning
              style={{ flex: 1, overflowY: "auto", padding: "6px 22px 48px", fontSize: 14, lineHeight: 1.8, maxWidth: 860, margin: "0 auto", width: "100%" }}
            />
          </div>
        ) : null}
      </div>

      {/* 原子块的就地编辑器：浮在被点的那一块旁边。
       * 上面 = 实时渲染（改一个字就重画一次，所见即所得）；下面 = 真正的 LaTeX。
       * 这是「在结果上编辑」对有损渲染节点的答案：位置在结果上，改的是源码，不离开预览。 */}
      {atomEdit ? (
        <div>
          <div
            className="wys-pop-dim"
            onMouseDown={(ev) => { ev.preventDefault(); commitAtom(); }}
          />
          <div className="wys-pop" style={{ left: atomEdit.x, top: atomEdit.y }}>
            <div className="wys-pop-h">
              <b>{atomEdit.mode === "inline" ? "就地编辑引用" : (atomEdit.what ? "就地编辑 · " + atomEdit.what : "就地编辑这一块")}</b>
              <span>{atomEdit.mode === "inline" ? "改完这段立刻生效" : "L" + (atomEdit.s + 1) + (atomEdit.e > atomEdit.s ? "–" + (atomEdit.e + 1) : "")}</span>
              <span className="wys-pop-keys">Esc 取消 · Ctrl+Enter 保存 · 点外面保存</span>
            </div>
            <div className="wys-pop-pv" dangerouslySetInnerHTML={{ __html: atomPvHtml }} />
            <textarea
              className="wys-pop-ta"
              autoFocus
              spellCheck={false}
              rows={Math.min(14, Math.max(3, atomEdit.tex.split("\n").length + 1))}
              value={atomEdit.tex}
              onChange={(ev) => setAtomEdit({ ...atomEdit, tex: ev.target.value })}
              onKeyDown={(ev) => {
                ev.stopPropagation();
                if (ev.key === "Escape") { ev.preventDefault(); setAtomEdit(null); }
                else if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); commitAtom(); }
              }}
            />
          </div>
        </div>
      ) : null}

      {/* 底部结果面板：v0.7.2 起「有结果才出现」—— 常驻的三按钮条太吵 */}
      {issues || compileOut || err || exportInfo ? (
      <div style={{ borderTop: "1px solid hsl(var(--border))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 10px" }}>
          <button style={tbtn} onClick={() => setBottomOpen(!bottomOpen)}>
            {bottomOpen ? "▾" : "▸"} 结果
          </button>
          <button
            style={{ ...tbtn, border: "none", background: "transparent", color: bottomTab === "issues" ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}
            onClick={() => { setBottomTab("issues"); setBottomOpen(true); }}
          >
            ✅ 校验 {issues ? `(${issueCount})` : ""}
          </button>
          <button
            style={{ ...tbtn, border: "none", background: "transparent", color: bottomTab === "compile" ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}
            onClick={() => { setBottomTab("compile"); setBottomOpen(true); }}
          >
            🔨 编译 {compileOut ? "•" : ""}
          </button>
          {exportInfo ? (
            <button
              style={{ ...tbtn, border: "none", background: "transparent", color: bottomTab === "export" ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}
              onClick={() => { setBottomTab("export"); setBottomOpen(true); }}
            >
              ⬇ 导出 {exportInfo.ok === false ? "⚠" : "•"}
            </button>
          ) : null}
          {err ? <span style={{ fontSize: 11, color: "#ef4444" }}>⚠ {err}</span> : null}
          <div style={{ flex: 1 }} />
          <button style={{ ...tbtn, border: "none", background: "transparent", color: "hsl(var(--muted-foreground))" }} onClick={() => setBottomOpen(false)} title="收起结果">✕</button>
        </div>
        {bottomOpen ? (
          <div style={{ maxHeight: 180, overflowY: "auto", padding: "4px 12px 10px", fontSize: 12, lineHeight: 1.7 }}>
            {bottomTab === "issues" ? (
              !issues ? (
                <span style={{ color: "hsl(var(--muted-foreground))" }}>尚未校验——点工具栏「✅ 校验」。</span>
              ) : issueCount === 0 ? (
                <span style={{ color: "#22c55e" }}>✅ 未发现问题</span>
              ) : (
                issues.issues.map((i, k) => (
                  <div key={k} onClick={() => gotoLine(i.line)} style={{ cursor: "pointer" }}>
                    <span style={{ color: i.severity === "error" ? "#ef4444" : i.severity === "warning" ? "#f59e0b" : "#94a3b8" }}>
                      {i.severity === "error" ? "🔴" : i.severity === "warning" ? "🟡" : "⚪"}
                    </span>{" "}
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>L{i.line}</span> {i.message}
                  </div>
                ))
              )
            ) : bottomTab === "export" ? (
              exportInfo ? (
                <div>
                  {exportInfo.ok === false ? (
                    <span style={{ color: "#ef4444" }}>⚠ {exportInfo.message || "导出失败"}</span>
                  ) : (
                    <div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                        <span style={{ color: "#22c55e" }}>✅ 已导出 {String(exportInfo.format || "").toUpperCase()}</span>
                        <span style={{ color: "hsl(var(--muted-foreground))" }}>
                          {fmtSize(exportInfo.bytes)}
                          {exportInfo.format === "html" ? " · 公式" + (exportInfo.math === "katex" ? " KaTeX 排版" : " 近似排版") + " · 内嵌图 " + imgCount(exportInfo) + " 张" : ""}
                          {exportInfo.reused ? " · 产物已是最新，未重编" : ""}
                          {exportInfo.from === "server" ? " · 正文由服务端内核渲染" : ""}
                        </span>
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 11, wordBreak: "break-all", color: "hsl(var(--muted-foreground))" }}>{exportInfo.outPath}</div>
                      {exportInfo.images && exportInfo.images.missing && exportInfo.images.missing.length ? (
                        <div style={{ color: "#f59e0b" }}>🖼 有 {exportInfo.images.missing.length} 张图没能内嵌：{exportInfo.images.missing.join("、")}</div>
                      ) : null}
                      <div style={{ marginTop: 5, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button style={tbtn} onClick={() => openInHost(exportInfo.outPath)}>👁 预览</button>
                        <button style={tbtn} onClick={copyPath}>📋 复制路径</button>
                        <button style={tbtn} onClick={() => doExport(exportInfo.format, "desktop")}>🖥 再导一份到桌面</button>
                        <button style={tbtn} onClick={() => doExport(exportInfo.format, "downloads")}>📥 再导一份到下载</button>
                        <button style={tbtn} onClick={() => doExport(exportInfo.format, "same", { force: true })}>🔄 重新生成</button>
                      </div>
                    </div>
                  )}
                  {exportInfo.log ? (
                    <pre style={{ margin: "8px 0 0", fontFamily: MONO, fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 110, overflowY: "auto" }}>{exportInfo.log}</pre>
                  ) : null}
                </div>
              ) : (
                <span style={{ color: "hsl(var(--muted-foreground))" }}>还没有导出过 —— 点工具栏「⬇ 导出」。</span>
              )
            ) : (
              compileOut ? (
                <pre style={{ margin: 0, fontFamily: MONO, fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{compileOut}</pre>
              ) : (
                <span style={{ color: "hsl(var(--muted-foreground))" }}>尚未编译——点工具栏「🔨 编译」。</span>
              )
            )}
          </div>
        ) : null}
      </div>
      ) : null}

      {/* 状态栏：只留每拍真的会看的（v0.7.2 去掉行数、中英拆分这些噪音） */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "2px 10px", borderTop: "1px solid hsl(var(--border))", fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
        <span>Ln {cursor.line}, Col {cursor.col}</span>
        <span>≈ {wc.total} 字</span>
        {savedTick ? <span style={{ color: "#22c55e" }}>已保存 ✓</span> : null}
        <div style={{ flex: 1 }} />
        <span>{katexOkRef.current ? "∑ KaTeX" : "∑ 简易渲染"}</span>
        <span>{fileName || "LaTeX"}</span>
      </div>

      {/* 划词引用气泡 */}
      {quote ? (
        <div ref={bubbleRef} style={{ position: "fixed", left: quote.x, top: quote.y, zIndex: 60 }}>
          <button
            onClick={doQuote}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))",
              border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 12.5,
              cursor: "pointer", boxShadow: "0 6px 20px rgba(0,0,0,.28)", whiteSpace: "nowrap",
            }}
            title="把选中文本作为引用卡片发到 AI 侧栏"
          >
            💬 引用到对话{quote.lineFrom ? <span style={{ opacity: 0.75 }}>L{quote.lineFrom}{quote.lineTo && quote.lineTo !== quote.lineFrom ? "–" + quote.lineTo : ""}</span> : null}
          </button>
        </div>
      ) : null}

      {/* toast 提示 */}
      {toast ? (
        <div style={{
          position: "fixed", bottom: 64, left: "50%", transform: "translateX(-50%)", zIndex: 70,
          background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))",
          border: "1px solid hsl(var(--border))", borderRadius: 8, padding: "6px 14px",
          fontSize: 12, boxShadow: "0 6px 20px rgba(0,0,0,.25)", whiteSpace: "nowrap",
        }}>
          <span>{toast.msg}</span>
          {toast.undo ? (
            <button
              onClick={undoWys}
              style={{
                marginLeft: 10, border: "1px solid hsl(var(--border))", borderRadius: 6,
                background: "transparent", color: "hsl(var(--primary))",
                fontSize: 11.5, padding: "1px 8px", cursor: "pointer",
              }}
            >↩ 撤销</button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
