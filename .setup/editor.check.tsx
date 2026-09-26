import React, { useState, useRef, useEffect, useMemo } from "react";
"use strict";
/* =====================================================================
 * LaTeX 子集 → HTML 预览内核（零依赖；Node 单测 / 浏览器面板双端通用）
 * renderPreview(source, opts) → { html }
 *   opts.renderMath(tex, displayMode) → HTML string（缺省用 miniMath 兜底）
 *   opts.baseDir   → .tex 所在目录（includegraphics 解析为 data-asset 绝对路径）
 * 约定：末行 const LPC = { renderPreview: renderPreview, miniMath: miniMath }; 会被构建脚本替换为 const LPC = {...}
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

module.exports = { renderPreview, miniMath, stripLineComment };


/**
 * LaTeX 编辑器 v0.3 — editors 贡献面（接管 .tex 文件）
 * Overleaf 式分栏实时预览：左源码（高亮/行号/大纲）+ 右渲染（KaTeX 数学/表格/图表/引用徽章）
 * props: { pluginId, ctx, file, content, onChange, onSave, fileName, filePath }
 * 数据通路：window.electronAPI.mcp.callTool（主进程 IPC，无 CORS）
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
const SEC_LV = { chapter: 0, section: 1, subsection: 2, subsubsection: 3 };

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

const tbtn = {
  border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--foreground))",
  borderRadius: 6, padding: "2px 8px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", lineHeight: "18px",
};
const tbtnP = { ...tbtn, background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" };

export default function LatexEditor(props) {
  const content = props.content || "";
  const { onChange, onSave, filePath, fileName, pluginId } = props;

  const [serverId, setServerId] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [issues, setIssues] = useState(null);
  const [compileOut, setCompileOut] = useState("");
  const [bottomTab, setBottomTab] = useState("issues"); // issues | compile
  const [bottomOpen, setBottomOpen] = useState(false);
  const [savedTick, setSavedTick] = useState(0);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [view, setView] = useState("split"); // src | split | preview
  const [katexVer, setKatexVer] = useState(0);

  const taRef = useRef(null);
  const preRef = useRef(null);
  const gutterRef = useRef(null);
  const pvRef = useRef(null);
  const pendingCursor = useRef(null);
  const katexOkRef = useRef(false);
  const assetCache = useRef(new Map());

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

  async function doCompile() {
    setBusy("compile"); setErr(""); setBottomTab("compile"); setBottomOpen(true);
    try { setCompileOut(await callTool("latex_compile", { path: filePath })); }
    catch (e) { setErr(String(e.message || e)); }
    finally { setBusy(""); }
  }

  async function doValidate() {
    setBusy("validate"); setErr(""); setBottomTab("issues"); setBottomOpen(true);
    try {
      const out = await callTool("latex_validate", { path: filePath, format: "json" });
      setIssues(JSON.parse(out));
    } catch (e) { setErr(String(e.message || e)); }
    finally { setBusy(""); }
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

  /* ---------- 实时预览 ---------- */
  const baseDir = useMemo(() => {
    const p = String(filePath || "");
    const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
    return i > 0 ? p.slice(0, i) : "";
  }, [filePath]);

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

  const pv = useMemo(() => {
    try {
      return LPC.renderPreview(content, { renderMath: renderMath, baseDir: baseDir });
    } catch (e) {
      return { html: '<p class="pv-bad">预览渲染失败: ' + esc(String((e && e.message) || e)) + "</p>" };
    }
  }, [content, renderMath, baseDir]);

  /* 预览内图片懒加载（走 MCP 读本地文件 → dataURI） */
  useEffect(() => {
    if (!pvRef.current || !serverId) return;
    const imgs = pvRef.current.querySelectorAll("img[data-asset]");
    let chain = Promise.resolve();
    imgs.forEach((img) => {
      const p = img.getAttribute("data-asset");
      if (!p) return;
      if (assetCache.current.has(p)) { img.src = assetCache.current.get(p); return; }
      chain = chain.then(async () => {
        try {
          const out = await callTool("latex_asset", { path: p });
          const a = JSON.parse(out);
          if (a && a.dataUri) { assetCache.current.set(p, a.dataUri); img.src = a.dataUri; }
        } catch (e) { /* 找不到图就留空 */ }
      });
    });
  }, [pv.html, katexVer, serverId]);

  /* ---------- 编辑行为 ---------- */
  function insert(text, back) {
    const ta = taRef.current; if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    onChange(content.slice(0, s) + text + content.slice(e));
    pendingCursor.current = s + text.length - (back || 0);
  }

  useEffect(() => {
    if (pendingCursor.current != null && taRef.current) {
      const p = pendingCursor.current;
      pendingCursor.current = null;
      taRef.current.focus();
      try { taRef.current.setSelectionRange(p, p); } catch (e) {}
    }
  }, [content]);

  function updateCursor() {
    const ta = taRef.current; if (!ta) return;
    const upto = content.slice(0, ta.selectionStart);
    const nl = upto.split("\n");
    setCursor({ line: nl.length, col: nl[nl.length - 1].length + 1 });
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
  }

  function gotoLine(ln) {
    if (view === "preview") setView("split");
    const ta = taRef.current; if (!ta) return;
    const lines = content.split("\n");
    let off = 0;
    for (let i = 0; i < ln - 1 && i < lines.length; i++) off += lines[i].length + 1;
    ta.focus();
    try { ta.setSelectionRange(off, off + (lines[ln - 1] || "").length); } catch (e) {}
    ta.scrollTop = Math.max(0, (ln - 1) * 20 - ta.clientHeight / 3);
    syncScroll(); updateCursor();
  }

  function onPreviewClick(e) {
    let el = e.target;
    while (el && el !== e.currentTarget) {
      if (el.getAttribute && el.getAttribute("data-line")) {
        gotoLine(parseInt(el.getAttribute("data-line"), 10) || 1);
        return;
      }
      el = el.parentNode;
    }
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
  const outline = useMemo(() => {
    const arr = [];
    const re = /\\(chapter|section|subsection|subsubsection)\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(content))) {
      let line = 1;
      for (let i = 0; i < m.index; i++) if (content[i] === "\n") line++;
      arr.push({ level: SEC_LV[m[1]] != null ? SEC_LV[m[1]] : 1, title: m[2], line: line });
    }
    return arr;
  }, [content]);
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "hsl(var(--background))", color: "hsl(var(--foreground))" }}>
      <style dangerouslySetInnerHTML={{ __html: PV_CSS }} />

      {/* 工具栏 */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderBottom: "1px solid hsl(var(--border))", flexWrap: "wrap" }}>
        <button style={tbtn} onClick={doCompile} disabled={busy === "compile"}>
          {busy === "compile" ? "⏳ 编译中…" : "🔨 编译"}
        </button>
        <button style={tbtn} onClick={doValidate} disabled={busy === "validate"}>
          {busy === "validate" ? "⏳ 校验中…" : "✅ 校验"}
        </button>
        <span style={{ width: 1, height: 16, background: "hsl(var(--border))", margin: "0 4px" }} />
        <button style={{ ...tbtn, border: "none", background: "transparent", color: view === "src" ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))", fontWeight: view === "src" ? 700 : 400 }} onClick={() => setView("src")}>📄 源码</button>
        <button style={{ ...tbtn, border: "none", background: "transparent", color: view === "split" ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))", fontWeight: view === "split" ? 700 : 400 }} onClick={() => setView("split")}>⧉ 分屏</button>
        <button style={{ ...tbtn, border: "none", background: "transparent", color: view === "preview" ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))", fontWeight: view === "preview" ? 700 : 400 }} onClick={() => setView("preview")}>📑 预览</button>
        <span style={{ width: 1, height: 16, background: "hsl(var(--border))", margin: "0 4px" }} />
        <button style={tbtn} onClick={() => insert("\\section{}", 1)}>§ section</button>
        <button style={tbtn} onClick={() => insert("\\subsection{}", 1)}>§§ sub</button>
        <button style={tbtn} onClick={() => insert("\\begin{equation}\\label{eq:}\n  \n\\end{equation}", "\\end{equation}".length)}>∑ 公式</button>
        <button style={tbtn} onClick={() => insert("\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=.8\\linewidth]{}\n  \\caption{}\n  \\label{fig:}\n\\end{figure}", 0)}>🖼 图</button>
        <button style={tbtn} onClick={() => insert("\\begin{table}[htbp]\n  \\centering\n  \\begin{tabular}{lcc}\n    \\hline\n    & & \\\\\n    \\hline\n  \\end{tabular}\n  \\caption{}\n  \\label{tab:}\n\\end{table}", 0)}>📊 表</button>
        <button style={tbtn} onClick={() => insert("\\label{}", 1)}>🏷 label</button>
        <button style={tbtn} onClick={() => insert("\\ref{}", 1)}>🔗 ref</button>
        <button style={tbtn} onClick={() => insert("\\cite{}", 1)}>📚 cite</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: toolReady ? "hsl(var(--muted-foreground))" : "#f59e0b" }}>
          {toolReady ? (katexOkRef.current ? "⚙ 工具就绪 · ∑ KaTeX" : "⚙ 工具就绪") : "⚙ MCP 未连接（解析/编译不可用）"}
        </span>
      </div>

      {/* 主体：大纲 + 源码 + 预览 */}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {outline.length > 0 && view !== "preview" ? (
          <div style={{ width: 150, overflowY: "auto", borderRight: "1px solid hsl(var(--border))", padding: "6px 4px", flexShrink: 0 }}>
            {outline.map((o, i) => (
              <div key={i} onClick={() => gotoLine(o.line)} style={{
                paddingLeft: 6 + o.level * 10, fontSize: 11.5, lineHeight: "20px",
                cursor: "pointer", color: o.level <= 1 ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", borderRadius: 4,
              }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "hsl(var(--muted) / 0.5)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                title={o.title}>
                {o.level <= 1 ? "§ " : "· "}{o.title}
              </div>
            ))}
          </div>
        ) : null}

        {showSrc ? (
          <div style={{ flex: flexPart, minWidth: 0, display: "flex", position: "relative" }}>
            <div ref={gutterRef} style={{
              width: 34, overflow: "hidden", textAlign: "right", padding: "8px 6px 8px 0",
              fontFamily: MONO, fontSize: 13, lineHeight: FH,
              color: "hsl(var(--muted-foreground))", userSelect: "none",
              background: "hsl(var(--muted) / 0.3)", borderRight: "1px solid hsl(var(--border))",
              flexShrink: 0,
            }}>
              {lines.map((_, i) => (<div key={i}>{i + 1}</div>))}
            </div>
            <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
              <pre ref={preRef} style={preStyle} dangerouslySetInnerHTML={{ __html: highlighted }} />
              <textarea
                ref={taRef}
                style={taStyle}
                value={content}
                spellCheck={false}
                onChange={(e) => { onChange(e.target.value); updateCursor(); }}
                onScroll={syncScroll}
                onKeyDown={onKeyDown}
                onClick={updateCursor}
                onKeyUp={updateCursor}
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
              style={{ flex: 1, overflowY: "auto", padding: "6px 22px 48px", fontSize: 14, lineHeight: 1.8, maxWidth: 860, margin: "0 auto", width: "100%" }}
              dangerouslySetInnerHTML={{ __html: pv.html }}
            />
          </div>
        ) : null}
      </div>

      {/* 底部结果面板 */}
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
          {err ? <span style={{ fontSize: 11, color: "#ef4444" }}>⚠ {err}</span> : null}
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

      {/* 状态栏 */}
      <div style={{ display: "flex", gap: 14, alignItems: "center", padding: "2px 10px", borderTop: "1px solid hsl(var(--border))", fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
        <span>Ln {cursor.line}, Col {cursor.col}</span>
        <span>{lines.length} 行</span>
        <span>中文 {wc.cjk} + 英文 {wc.latin} ≈ {wc.total} 字</span>
        {savedTick ? <span style={{ color: "#22c55e" }}>已保存 ✓</span> : null}
        <div style={{ flex: 1 }} />
        <span>{katexOkRef.current ? "∑ KaTeX" : "∑ 简易渲染"}</span>
        <span>{fileName || "LaTeX"}</span>
      </div>
    </div>
  );
}
