import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import React, { useState, useEffect, useMemo } from "react";
"use strict";
function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function cntNL(s, idx) {
  let c = 0;
  for (let i = 0; i < idx; i++) if (s.charCodeAt(i) === 10) c++;
  return c;
}
function lineIndexOf(s, idx) {
  return cntNL(s, idx);
}
function skipSpaces(s, i) {
  while (i < s.length && (s[i] === " " || s[i] === "	")) i++;
  return i;
}
function readGroup(s, i) {
  if (s[i] !== "{") return { body: "", next: i };
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === "\\") {
      j++;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return { body: s.slice(i + 1, j), next: j + 1 };
    }
  }
  return { body: s.slice(i + 1), next: s.length };
}
function optArg(s, i) {
  if (s[i] !== "[") return { body: "", next: i };
  const e = s.indexOf("]", i + 1);
  if (e < 0) return { body: "", next: i };
  return { body: s.slice(i + 1, e), next: e + 1 };
}
function argAt(s, i) {
  i = skipSpaces(s, i);
  if (s[i] === "{") return readGroup(s, i);
  if (s[i] === "[") {
    const o = optArg(s, i);
    return { body: o.body, next: o.next };
  }
  if (s[i] === "\\") {
    const m = /^\[a-zA-Z]+|^\./.exec(s.slice(i));
    if (m) return { body: m[0], next: i + m[0].length };
  }
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
  while (m = re.exec(s)) {
    if (m[1] === "begin") depth++;
    else {
      depth--;
      if (depth === 0) return m.index;
    }
  }
  return -1;
}
function stripLineComment(line) {
  let i = 0;
  while (i < line.length) {
    if (line[i] === "\\") {
      i += 2;
      continue;
    }
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
const SYM = {
  alpha: "\u03B1",
  beta: "\u03B2",
  gamma: "\u03B3",
  delta: "\u03B4",
  epsilon: "\u03B5",
  varepsilon: "\u03B5",
  zeta: "\u03B6",
  eta: "\u03B7",
  theta: "\u03B8",
  vartheta: "\u03D1",
  iota: "\u03B9",
  kappa: "\u03BA",
  lambda: "\u03BB",
  mu: "\u03BC",
  nu: "\u03BD",
  xi: "\u03BE",
  pi: "\u03C0",
  rho: "\u03C1",
  sigma: "\u03C3",
  tau: "\u03C4",
  upsilon: "\u03C5",
  phi: "\u03C6",
  varphi: "\u03C6",
  chi: "\u03C7",
  psi: "\u03C8",
  omega: "\u03C9",
  Gamma: "\u0393",
  Delta: "\u0394",
  Theta: "\u0398",
  Lambda: "\u039B",
  Xi: "\u039E",
  Pi: "\u03A0",
  Sigma: "\u03A3",
  Phi: "\u03A6",
  Psi: "\u03A8",
  Omega: "\u03A9",
  times: "\xD7",
  div: "\xF7",
  pm: "\xB1",
  mp: "\u2213",
  cdot: "\xB7",
  cdots: "\u22EF",
  ldots: "\u2026",
  dots: "\u2026",
  vdots: "\u22EE",
  ddots: "\u22F1",
  leq: "\u2264",
  le: "\u2264",
  geq: "\u2265",
  ge: "\u2265",
  neq: "\u2260",
  ne: "\u2260",
  approx: "\u2248",
  equiv: "\u2261",
  sim: "\u223C",
  simeq: "\u2243",
  cong: "\u2245",
  propto: "\u221D",
  infty: "\u221E",
  partial: "\u2202",
  nabla: "\u2207",
  sum: "\u2211",
  prod: "\u220F",
  int: "\u222B",
  oint: "\u222E",
  in: "\u2208",
  notin: "\u2209",
  ni: "\u220B",
  subset: "\u2282",
  subseteq: "\u2286",
  supset: "\u2283",
  supseteq: "\u2287",
  cup: "\u222A",
  cap: "\u2229",
  emptyset: "\u2205",
  varnothing: "\u2205",
  forall: "\u2200",
  exists: "\u2203",
  neg: "\xAC",
  lnot: "\xAC",
  land: "\u2227",
  lor: "\u2228",
  oplus: "\u2295",
  otimes: "\u2297",
  ominus: "\u2296",
  rightarrow: "\u2192",
  to: "\u2192",
  leftarrow: "\u2190",
  gets: "\u2190",
  leftrightarrow: "\u2194",
  Rightarrow: "\u21D2",
  Leftarrow: "\u21D0",
  Leftrightarrow: "\u21D4",
  longrightarrow: "\u27F6",
  mapsto: "\u21A6",
  uparrow: "\u2191",
  downarrow: "\u2193",
  top: "\u22A4",
  bot: "\u22A5",
  vdash: "\u22A2",
  models: "\u22A8",
  perp: "\u22A5",
  parallel: "\u2225",
  mid: "\u2223",
  ell: "\u2113",
  Re: "\u211C",
  Im: "\u2111",
  hbar: "\u210F",
  aleph: "\u2135",
  wp: "\u2118",
  angle: "\u2220",
  triangle: "\u25B3",
  star: "\u22C6",
  circ: "\u2218",
  bullet: "\u2022",
  prime: "\u2032",
  ln: "ln",
  log: "log",
  lim: "lim",
  max: "max",
  min: "min",
  sup: "sup",
  inf: "inf",
  sin: "sin",
  cos: "cos",
  tan: "tan",
  exp: "exp",
  det: "det",
  dim: "dim",
  gcd: "gcd",
  deg: "deg",
  TeX: "TeX",
  LaTeX: "LaTeX",
  today: "\uFF08\u4ECA\u5929\uFF09"
};
function miniMath(tex, display) {
  let s = String(tex || "");
  s = s.replace(/\\label\s*\{[^}]*\}/g, "");
  s = s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  s = s.replace(/\\(left|right|big|Big|bigg|Bigg)\b/g, "");
  s = s.replace(/\\!/g, "").replace(/\\[,;:!]/g, " ").replace(/\\quad/g, "\u2003").replace(/\\qquad/g, "\u2003\u2003");
  s = s.replace(/\\(mathrm|mathbf|mathcal|mathbb|mathit|text|textrm|operatorname)\b/g, "");
  let prev;
  do {
    prev = s;
    s = s.replace(/\\frac\s*\{((?:[^{}]|\{[^{}]*\})*)\}\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, "<sup>$1</sup>&frasl;<sub>$2</sub>");
  } while (s !== prev);
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, "\u221A($1)");
  s = s.replace(/\^\s*\{([^{}]*)\}/g, "<sup>$1</sup>");
  s = s.replace(/\^\s*(\\[a-zA-Z]+|\w)/g, "<sup>$1</sup>");
  s = s.replace(/_\s*\{([^{}]*)\}/g, "<sub>$1</sub>");
  s = s.replace(/_\s*(\\[a-zA-Z]+|\w)/g, "<sub>$1</sub>");
  s = s.replace(/\\([a-zA-Z]+)/g, (m0, c) => SYM[c] != null ? SYM[c] : escHtml(c));
  s = s.replace(/\\(.)/g, "$1");
  s = s.replace(/[{}]/g, "");
  return '<span class="pv-mini' + (display ? " pv-mini-d" : "") + '">' + s + "</span>";
}
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
          case "textbf": {
            const g = argAt(s, i);
            i = g.next;
            out += "<strong>" + inline(g.body, ctx) + "</strong>";
            break;
          }
          case "textit":
          case "emph":
          case "textsl":
          case "textup": {
            const g = argAt(s, i);
            i = g.next;
            out += "<em>" + inline(g.body, ctx) + "</em>";
            break;
          }
          case "texttt": {
            const g = argAt(s, i);
            i = g.next;
            out += '<code class="pv-tt">' + inline(g.body, ctx) + "</code>";
            break;
          }
          case "underline":
          case "uline": {
            const g = argAt(s, i);
            i = g.next;
            out += "<u>" + inline(g.body, ctx) + "</u>";
            break;
          }
          case "mbox":
          case "text": {
            const g = argAt(s, i);
            i = g.next;
            out += inline(g.body, ctx);
            break;
          }
          case "ref":
          case "autoref":
          case "vref":
          case "pageref": {
            const g = argAt(s, i);
            i = g.next;
            out += ctx.ref(g.body, false);
            break;
          }
          case "eqref": {
            const g = argAt(s, i);
            i = g.next;
            out += ctx.ref(g.body, true);
            break;
          }
          case "cite":
          case "citep":
          case "citet":
          case "citealp": {
            const g = argAt(s, i);
            i = g.next;
            out += ctx.cite(g.body);
            break;
          }
          case "label": {
            const g = argAt(s, i);
            i = g.next;
            break;
          }
          case "footnote": {
            const g = argAt(s, i);
            i = g.next;
            out += ' <sup class="pv-fn">\u6CE8: ' + inline(g.body, ctx) + "</sup>";
            break;
          }
          case "item": {
            const g = optArg(s, i);
            i = g.next;
            break;
          }
          case "newline":
          case "cr":
            out += "<br/>";
            break;
          case "nbsp":
            out += "&nbsp;";
            break;
          case "quad":
            out += "\u2003";
            break;
          case "qquad":
            out += "\u2003\u2003";
            break;
          case "verb": {
            const m2 = /\|([^|]*)\|/.exec(s.slice(i));
            if (m2) {
              out += '<code class="pv-tt">' + escHtml(m2[1]) + "</code>";
              i += m2[0].length;
            }
            break;
          }
          case "input":
          case "include": {
            const g = argAt(s, i);
            i = g.next;
            break;
          }
          default: {
            if (SYM[cmd] != null) {
              out += SYM[cmd];
              break;
            }
            let j = skipSpaces(s, i);
            if (s[j] === "{") {
              const g = readGroup(s, j);
              out += inline(g.body, ctx);
              i = g.next;
            } else if (s[j] === "[") {
              const o = optArg(s, j);
              i = o.next;
            } else out += escHtml(cmd);
            break;
          }
        }
        continue;
      }
      const ch = s[i + 1];
      if (ch === "\\") {
        out += "<br/>";
        i += 2;
        continue;
      }
      if (ch && ESC_MAP[ch] != null) {
        out += ESC_MAP[ch];
        i += 2;
        continue;
      }
      if (ch && "!,;: ".indexOf(ch) >= 0) {
        i += 2;
        continue;
      }
      out += ch;
      i += 1;
      continue;
    }
    if (c === "$") {
      if (s.slice(i, i + 2) === "$$") {
        const end2 = s.indexOf("$$", i + 2);
        if (end2 > 0) {
          out += ctx.math(s.slice(i + 2, end2), true);
          i = end2 + 2;
          continue;
        }
      }
      const end = s.indexOf("$", i + 1);
      if (end > i + 0 && s[i + 1] !== "$") {
        out += ctx.math(s.slice(i + 1, end), false);
        i = end + 1;
        continue;
      }
      out += "$";
      i++;
      continue;
    }
    if (c === "~") {
      out += "&nbsp;";
      i++;
      continue;
    }
    if (c === "{") {
      const g = readGroup(s, i);
      out += inline(g.body, ctx);
      i = g.next;
      continue;
    }
    if (c === "}") {
      i++;
      continue;
    }
    if (c === "%") {
      i++;
      continue;
    }
    if (c === "-" && s[i + 1] === "-" && s[i + 2] === "-") {
      out += "\u2014";
      i += 3;
      continue;
    }
    if (c === "-" && s[i + 1] === "-") {
      out += "\u2013";
      i += 2;
      continue;
    }
    if (c === "`" && s[i + 1] === "`") {
      out += "\u201C";
      i += 2;
      continue;
    }
    if (c === "'" && s[i + 1] === "'") {
      out += "\u201D";
      i += 2;
      continue;
    }
    if (c === "`") {
      out += "\u2018";
      i++;
      continue;
    }
    if (c === "'") {
      out += "\u2019";
      i++;
      continue;
    }
    if (c === "&") {
      out += "&amp;";
      i++;
      continue;
    }
    if (c === "<") {
      out += "&lt;";
      i++;
      continue;
    }
    if (c === ">") {
      out += "&gt;";
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}
const HEAD_LV = { chapter: 0, section: 1, subsection: 2, subsubsection: 3, paragraph: 4 };
function scanStruct(body, off) {
  const labels = /* @__PURE__ */ new Map();
  const bib = /* @__PURE__ */ new Map();
  const secNo = [0, 0, 0, 0, 0];
  const counters = { eq: 0, fig: 0, tab: 0 };
  const hre = /\\(chapter|section|subsection|subsubsection|paragraph)(\*?)\s*/g;
  let m;
  const heads = [];
  while (m = hre.exec(body)) {
    let i = skipSpaces(body, m.index + m[0].length);
    if (body[i] === "[") {
      const o = optArg(body, i);
      i = skipSpaces(body, o.next);
    }
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
  while (m = ere.exec(body)) {
    const name = m[1];
    const endIdx = findEnvEnd(body, m.index + m[0].length, name);
    const inner = body.slice(m.index + m[0].length, endIdx < 0 ? body.length : endIdx);
    const line = off + lineIndexOf(body, m.index);
    const starred = name.indexOf("*") >= 0 || name === "displaymath";
    const isFloat = /^(figure|table|scheme)/.test(name);
    let display;
    if (isFloat) {
      if (name.indexOf("tab") === 0) {
        if (!starred) counters.tab++;
        display = "\u8868 " + counters.tab;
      } else {
        if (!starred) counters.fig++;
        display = "\u56FE " + counters.fig;
      }
    } else {
      if (!starred) counters.eq++;
      display = String(counters.eq);
    }
    const lm = /\\label\s*\{([^}]*)\}/.exec(inner);
    if (lm) labels.set(lm[1], { text: display, line, kind: isFloat ? "float" : "eq" });
  }
  const bre = /\\bibitem\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;
  let bn = 0;
  while (m = bre.exec(body)) {
    bn++;
    bib.set(m[1], { n: bn, line: off + lineIndexOf(body, m.index) });
  }
  return { labels, bib, heads };
}
function parseTable(inner, line, ctx) {
  let t = String(inner).replace(/\\(centering|small|footnotesize|scriptsize|rmfamily|cline\*?\{\d+-\d+\})/g, "");
  t = t.trim();
  const o = optArg(t, 0);
  if (o.next > 0) t = t.slice(o.next).trim();
  const cm = /^\{([^{}]*)\}/.exec(t);
  if (!cm) return '<div class="pv-code">' + escHtml(inner) + "</div>";
  const aligns = (cm[1].match(/[lcr]/g) || []).map((c) => c === "l" ? "left" : c === "r" ? "right" : "center");
  t = t.slice(cm[0].length);
  const segs = t.split(/\\\\(?:\s*\[[^\]]*\])?/);
  let html = '<div class="pv-tabwrap"><table class="pv-tab" data-line="' + line + '"><tbody>';
  let pendHline = false;
  for (let ri = 0; ri < segs.length; ri++) {
    let seg = segs[ri];
    const hasHline = /\\hline/.test(seg);
    seg = seg.replace(/\\hline/g, " ");
    if (ri === segs.length - 1 && !seg.trim()) break;
    if (!seg.trim()) {
      if (hasHline) pendHline = true;
      continue;
    }
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
function renderFloat(name, inner, line, ctx) {
  const isTab = name.indexOf("tab") === 0;
  let no;
  const starred = name.indexOf("*") >= 0;
  if (isTab) {
    if (!starred) ctx.tabNo++;
    no = "\u8868 " + ctx.tabNo;
  } else {
    if (!starred) ctx.figNo++;
    no = "\u56FE " + ctx.figNo;
  }
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
      bodyHtml += '<div class="pv-imgna">\u{1F5BC} ' + escHtml(f) + "\uFF08\u8BE5\u683C\u5F0F\u4E0D\u5728\u9884\u89C8\u4E2D\u6E32\u67D3\uFF0C\u7F16\u8BD1 PDF \u540E\u53EF\u89C1\uFF09</div>";
    } else {
      bodyHtml += '<img class="pv-img" data-asset="' + escHtml(joinPath(ctx.baseDir, f)) + '" alt="' + escHtml(f) + '" />';
    }
    body = body.slice(0, img.index) + body.slice(img.index + img[0].length);
  }
  bodyHtml += parseBlocks(body, line + 1, ctx);
  return '<figure class="pv-float" data-line="' + line + '">' + bodyHtml + (capHtml ? "<figcaption>" + escHtml(no) + "&nbsp;&nbsp;" + capHtml + "</figcaption>" : "") + "</figure>";
}
function renderBib(inner, line, ctx) {
  let s = String(inner).replace(/\\begin\s*\{thebibliography\}/g, "").replace(/\\end\s*\{thebibliography\}/g, "").replace(/^\s*\{[^{}]*\}/, "");
  const re = /\\bibitem\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;
  const marks = [];
  let m;
  while (m = re.exec(s)) marks.push({ key: m[1], idx: m.index, start: m.index + m[0].length });
  if (!marks.length) return "";
  let html = '<div class="pv-bib" data-line="' + line + '"><div class="pv-bib-t">\u53C2\u8003\u6587\u732E</div>';
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].idx : s.length;
    const text = s.slice(marks[i].start, end);
    const at = line + cntNL(s, marks[i].idx);
    html += '<div class="pv-bibitem" data-line="' + at + '"><span class="pv-bibno">[' + (i + 1) + "]</span> " + inline(text, ctx) + "</div>";
  }
  return html + "</div>";
}
function splitTopItems(s) {
  const marks = [];
  const re = /\\item(?![a-zA-Z])/g;
  let depth = 0, m;
  const bre = /\\(begin|end)\s*\{([a-zA-Z*]+)\}/g;
  const events = [];
  while (m = bre.exec(s)) events.push({ i: m.index, t: m[1] });
  let ei = 0;
  while (m = re.exec(s)) {
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
const MATH_ENVS = {
  equation: 1,
  "equation*": 1,
  align: 1,
  "align*": 1,
  gather: 1,
  "gather*": 1,
  multline: 1,
  "multline*": 1,
  eqnarray: 1,
  "eqnarray*": 1,
  displaymath: 1,
  math: 1
};
function renderMathEnv(name, inner, line, ctx) {
  const tex = String(inner).replace(/\\label\s*\{[^}]*\}/g, "").trim();
  let mh;
  try {
    mh = ctx.renderMath(tex, true);
  } catch (e) {
    mh = miniMath(tex, true);
  }
  const starred = /\*$/.test(name) || name === "displaymath" || name === "math";
  let no = "";
  if (!starred) {
    ctx.eqNo++;
    no = '<span class="pv-eqno">(' + ctx.eqNo + ")</span>";
  }
  return '<div class="pv-eq" data-line="' + line + '"><div class="pv-eqbody">' + mh + "</div>" + no + "</div>";
}
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
  while (pos < n && guard++ < 2e4) {
    const rest = body.slice(pos);
    const atLine = lineOff + cntNL(body, pos);
    let m;
    if (m = /^\\maketitle\b/.exec(rest)) {
      pos += m[0].length;
      continue;
    }
    if (m = /^\\(chapter|section|subsection|subsubsection|paragraph)(\*?)\s*/.exec(rest)) {
      let i = pos + m[0].length;
      i = skipSpaces(body, i);
      if (body[i] === "[") {
        const o = optArg(body, i);
        i = skipSpaces(body, o.next);
      }
      let title = "";
      if (body[i] === "{") {
        const g = readGroup(body, i);
        title = g.body;
        i = g.next;
      }
      const name = m[1];
      const starred = !!m[2];
      const lv = Math.min(HEAD_LV[name] + 1, 4);
      let num = "";
      if (!starred && lv <= 4 && name !== "paragraph") {
        const c = ctx.secNo;
        const idx = HEAD_LV[name];
        if (idx <= 3) {
          c[idx]++;
          for (let k = idx + 1; k <= 3; k++) c[k] = 0;
        }
        num = idx === 0 ? String(c[0]) : c.slice(1, idx + 1).join(".");
      }
      const tag = lv <= 3 ? "h" + lv : "p";
      const cls = lv <= 3 ? ' class="pv-h pv-h' + lv + '"' : ' class="pv-par"';
      const inner = num ? num + "&nbsp;&nbsp;" + inline(title, ctx) : "<strong>" + inline(title, ctx) + "</strong>";
      out += "<" + tag + cls + ' data-line="' + atLine + '">' + inner + "</" + tag + ">";
      pos = i;
      continue;
    }
    if (m = /^\\begin\s*\{([a-zA-Z]+\*?)\}/.exec(rest)) {
      const name = m[1];
      const beginIdx = pos + m[0].length;
      const endM = findEnvEnd(body, beginIdx, name);
      const endIdx = endM < 0 ? body.length : endM;
      const inner = body.slice(beginIdx, endIdx);
      out += renderEnv(name, inner, atLine, ctx);
      pos = endM < 0 ? body.length : endIdx + ("\\end{" + name + "}").length;
      continue;
    }
    if (m = /^\\(end|clearpage|newpage|tableofcontents|printbibliography|appendix|appendices|centering|noindent|par\b|bigskip|medskip|smallskip|bibliographystyle|bibliography)\b/.exec(rest)) {
      let i = pos + m[0].length;
      const o = optArg(body, i);
      i = o.next > i ? o.next : i;
      if (body[i] === "{") {
        const g = readGroup(body, i);
        i = g.next;
      }
      pos = i;
      continue;
    }
    if (m = /^\\(label|hline|rule|vspace\*?|hspace\*?|setlength|renewcommand|newcommand|providecommand|usepackage|documentclass|item)\b/.exec(rest)) {
      let i = pos + m[0].length;
      const o = optArg(body, i);
      i = o.next > i ? o.next : i;
      if (body[skipSpaces(body, i)] === "{") {
        const g = readGroup(body, skipSpaces(body, i));
        i = g.next;
      }
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
    return '<div class="pv-abs" data-line="' + line + '"><div class="pv-abs-t">\u6458\u8981</div>' + parseBlocks(inner, line + 1, ctx) + "</div>";
  if (/^(figure|table|scheme)/.test(name)) {
    const h = renderFloat(name, inner, line, ctx);
    return h;
  }
  if (name === "thebibliography") return renderBib(inner, line, ctx);
  return parseBlocks(inner, line + 1, ctx);
}
function makeCtx(renderMathFn, struct, opts) {
  const ctx = {
    renderMath: renderMathFn || miniMath,
    math: function(tex, disp) {
      try {
        return this.renderMath(tex, disp);
      } catch (e) {
        return miniMath(tex, disp);
      }
    },
    baseDir: opts && opts.baseDir || "",
    labels: struct.labels,
    bib: struct.bib,
    secNo: [0, 0, 0, 0],
    eqNo: 0,
    figNo: 0,
    tabNo: 0,
    ref: function(keyRaw, eqref) {
      const k = String(keyRaw || "").trim();
      const L = this.labels.get(k);
      if (!L) return '<span class="pv-ref pv-bad" title="\u672A\u5B9A\u4E49\u7684\u5F15\u7528\uFF08\u6821\u9A8C\u4F1A\u6807\u51FA\uFF09">?' + escHtml(k) + "</span>";
      const t = eqref && L.kind === "eq" ? "(" + L.text + ")" : L.text;
      return '<span class="pv-ref" data-line="' + L.line + '" title="\u70B9\u51FB\u8DF3\u8F6C\u5230\u5B9A\u4E49">' + escHtml(t) + "</span>";
    },
    cite: function(keysRaw) {
      const keys = String(keysRaw || "").split(",").map((x) => x.trim()).filter(Boolean);
      const parts = keys.map((k) => {
        const B = this.bib.get(k);
        if (!B) return '<span class="pv-cite pv-bad" title="\u672A\u627E\u5230\u6587\u732E">?' + escHtml(k) + "</span>";
        return '<span class="pv-cite" data-line="' + B.line + '" title="\u70B9\u51FB\u8DF3\u8F6C\u5230\u6587\u732E">[' + B.n + "]</span>";
      });
      return parts.length ? parts.join("") : "";
    }
  };
  return ctx;
}
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
    body = clean.slice(startIdx, em ? startIdx + em.index : void 0);
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
  return { html };
}
const LPC = { renderPreview, miniMath };
const LPCX = typeof LPC === "undefined" ? null : LPC;
const PV_CSS = [
  ".pv-root{color:hsl(var(--foreground));word-break:break-word;font-size:13.5px;line-height:1.75}",
  ".pv-root p{margin:0 0 8px}",
  ".pv-title{text-align:center;margin:10px 0 16px}",
  ".pv-title-main{font-size:18px;font-weight:700}",
  ".pv-author,.pv-date{color:hsl(var(--muted-foreground));font-size:12px;margin-top:4px}",
  ".pv-h1{font-size:17px;font-weight:700;margin:18px 0 8px;padding-bottom:3px;border-bottom:1px solid hsl(var(--border))}",
  ".pv-h2{font-size:15px;font-weight:700;margin:14px 0 6px}",
  ".pv-h3{font-size:13.5px;font-weight:700;margin:12px 0 5px}",
  ".pv-eq{margin:10px 0;text-align:center;position:relative;overflow-x:auto}",
  ".pv-eqno{position:absolute;right:0;top:50%;transform:translateY(-50%);color:hsl(var(--muted-foreground));font-size:12px}",
  ".pv-mini{font-family:Georgia,'Times New Roman',serif;font-style:italic;padding:0 2px}",
  ".pv-tabwrap{overflow-x:auto;margin:8px 0}",
  ".pv-tab{border-collapse:collapse;margin:6px auto;font-size:12.5px}",
  ".pv-tab td{border:1px solid hsl(var(--border));padding:3px 10px}",
  ".pv-float{border:1px dashed hsl(var(--border));border-radius:8px;padding:10px;margin:12px 0;text-align:center;background:hsl(var(--muted)/.25)}",
  ".pv-float figcaption{margin-top:6px;color:hsl(var(--muted-foreground));font-size:12px}",
  ".pv-img{max-width:80%;border-radius:6px}",
  ".pv-imgna{background:hsl(var(--muted)/.5);padding:14px;color:hsl(var(--muted-foreground));border-radius:6px;font-size:12px}",
  ".pv-ref,.pv-cite{color:hsl(var(--primary));border-bottom:1px dotted hsl(var(--primary));font-size:.9em}",
  ".pv-list{padding-left:1.7em;margin:0 0 8px}",
  ".pv-list li{margin:3px 0}",
  ".pv-quote{border-left:3px solid hsl(var(--border));margin:10px 0;padding:2px 12px;color:hsl(var(--muted-foreground))}",
  ".pv-code{background:hsl(var(--muted)/.55);padding:8px 10px;border-radius:6px;overflow:auto;white-space:pre-wrap;font-family:Consolas,monospace;font-size:12px}",
  ".pv-bib{margin-top:14px;padding-top:8px;border-top:1px solid hsl(var(--border))}",
  ".pv-bibitem{padding-left:2em;text-indent:-2em;margin:3px 0;font-size:12.5px}",
  ".pv-root .katex{color:inherit;font-size:1.03em}",
  ".pv-root .katex-display{margin:0}"
].join("");
let katexTask = null;
function loadKatex(serverId) {
  if (typeof window !== "undefined" && window.katex) return Promise.resolve(true);
  if (katexTask) return katexTask;
  katexTask = (async function() {
    try {
      const api = typeof window !== "undefined" ? window.electronAPI : null;
      if (!api || !api.mcp || !api.mcp.callTool || !serverId) return false;
      const r = await api.mcp.callTool(serverId, "latex_asset", { name: "katex" });
      if (!r || r.success === false) return false;
      const txt = (r.result && r.result.content ? r.result.content : []).map(function(c) {
        return c.text;
      }).join("\n");
      const a = JSON.parse(txt);
      if (!a || !a.js || !a.css) return false;
      if (!document.getElementById("katex-css-latex-plugin")) {
        const st = document.createElement("style");
        st.id = "katex-css-latex-plugin";
        st.textContent = a.css;
        document.head.appendChild(st);
      }
      new Function(a.js)();
      return !!(window.katex && typeof window.katex.renderToString === "function");
    } catch (e) {
      return false;
    }
  })();
  return katexTask;
}
const S = {
  wrap: { margin: "8px 0", border: "1px solid hsl(var(--border))", borderRadius: 8, overflow: "hidden", background: "hsl(var(--card))" },
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 8px",
    borderBottom: "1px solid hsl(var(--border))",
    fontSize: 10.5,
    color: "hsl(var(--muted-foreground))",
    fontFamily: "system-ui, -apple-system, sans-serif"
  },
  tab: { border: "none", background: "transparent", color: "hsl(var(--muted-foreground))", cursor: "pointer", fontSize: 10.5, padding: "0 4px" },
  tabOn: { border: "none", background: "transparent", color: "hsl(var(--foreground))", cursor: "pointer", fontSize: 10.5, fontWeight: 700, padding: "0 4px" },
  body: { padding: "10px 12px" },
  pre: {
    margin: 0,
    padding: "10px 12px",
    overflow: "auto",
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
    fontSize: 12.5,
    lineHeight: 1.6,
    whiteSpace: "pre",
    background: "hsl(var(--muted)/.45)",
    color: "hsl(var(--foreground))",
    borderRadius: 6
  },
  note: { fontSize: 11, color: "hsl(var(--muted-foreground))", padding: "6px 12px" }
};
function LatexCodeBlock(props) {
  const code = String(
    props.code != null ? props.code : props.value != null ? props.value : props.content != null ? props.content : ""
  );
  const lang = String(
    props.lang || props.language || props.node && props.node.lang || props.info && props.info.lang || ""
  ).toLowerCase().trim();
  const isMath = /^(math|katex|latex-math|tex-math|amsmath)$/.test(lang);
  const isTex = /^(latex|tex|tex-latex|latex-tex|context|plaintex)$/.test(lang);
  const inline2 = !!(props.inline || props.inlineCode);
  const tooLong = code.length > 8e3;
  const [katexOk, setKatexOk] = useState(false);
  const [showSrc, setShowSrc] = useState(false);
  useEffect(
    function() {
      if (inline2 || tooLong || !isTex && !isMath) return;
      let dead = false;
      loadKatex(props.serverId).then(function(ok) {
        if (!dead) setKatexOk(!!ok);
      });
      return function() {
        dead = true;
      };
    },
    [code, lang, inline2, tooLong, isTex, isMath, props.serverId]
  );
  useEffect(
    function() {
      if (!isTex && !isMath) return;
      if (document.getElementById("notrat-latex-pv-css")) return;
      const st = document.createElement("style");
      st.id = "notrat-latex-pv-css";
      st.textContent = PV_CSS;
      document.head.appendChild(st);
    },
    [isTex, isMath]
  );
  const renderMath = useMemo(
    function() {
      if (katexOk && typeof window !== "undefined" && window.katex) {
        return function(tex, disp) {
          try {
            return window.katex.renderToString(tex, { displayMode: !!disp, throwOnError: false, strict: "ignore" });
          } catch (e) {
            return LPCX ? LPCX.miniMath(tex, disp) : tex;
          }
        };
      }
      return function(tex, disp) {
        return LPCX ? LPCX.miniMath(tex, disp) : tex;
      };
    },
    [katexOk]
  );
  const preview = useMemo(
    function() {
      if (!isTex && !isMath || !LPCX || tooLong) return { html: "" };
      try {
        if (isMath) {
          const body = "\\begin{equation*}\n" + code + "\n\\end{equation*}";
          return LPCX.renderPreview(body, { renderMath, baseDir: "" });
        }
        return LPCX.renderPreview(code, { renderMath, baseDir: "" });
      } catch (e) {
        return { html: "" };
      }
    },
    [code, isTex, isMath, renderMath, tooLong]
  );
  if (!isTex && !isMath) {
    return React.createElement(
      "pre",
      { style: S.pre, className: "notrat-latex-code-passthrough" },
      React.createElement("code", null, code)
    );
  }
  const usable = !tooLong && !!(preview && preview.html);
  function quote() {
    try {
      window.dispatchEvent(
        new CustomEvent("notrat-quote-to-chat", {
          detail: { text: code, source: "LaTeX \u4EE3\u7801\u5757" }
        })
      );
    } catch (e) {
    }
  }
  return /* @__PURE__ */ jsxs("div", { style: S.wrap, children: [
    /* @__PURE__ */ jsxs("div", { style: S.bar, children: [
      /* @__PURE__ */ jsx("span", { children: isMath ? "\u2211 \u516C\u5F0F" : "\u{1F4D0} LaTeX" }),
      usable ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("button", { style: showSrc ? S.tab : S.tabOn, onClick: function() {
          setShowSrc(false);
        }, children: "\u9884\u89C8" }),
        /* @__PURE__ */ jsx("button", { style: showSrc ? S.tabOn : S.tab, onClick: function() {
          setShowSrc(true);
        }, children: "\u6E90\u7801" })
      ] }) : /* @__PURE__ */ jsxs("span", { children: [
        "\xB7 \u6E90\u7801\uFF08",
        tooLong ? "\u7247\u6BB5\u8FC7\u957F\uFF0C\u5DF2\u8DF3\u8FC7\u9884\u89C8" : "\u9884\u89C8\u4E0D\u53EF\u7528",
        "\uFF09"
      ] }),
      /* @__PURE__ */ jsx("span", { style: { flex: 1 } }),
      !katexOk && usable ? /* @__PURE__ */ jsx("span", { title: "KaTeX \u672A\u52A0\u8F7D\uFF0C\u4F7F\u7528\u7B80\u6613\u516C\u5F0F\u6E32\u67D3", children: "\u7B80\u6613\u6392\u7248" }) : null,
      /* @__PURE__ */ jsx("button", { style: S.tab, onClick: quote, title: "\u628A\u8FD9\u6BB5 LaTeX \u9489\u5230\u5BF9\u8BDD\u8F93\u5165\u6846", children: "\u{1F4AC}" })
    ] }),
    usable && !showSrc ? /* @__PURE__ */ jsx("div", { style: S.body, className: "pv-root", dangerouslySetInnerHTML: { __html: preview.html } }) : /* @__PURE__ */ jsx("pre", { style: { ...S.pre, borderRadius: 0 }, children: code })
  ] });
}
export {
  LatexCodeBlock as default
};
