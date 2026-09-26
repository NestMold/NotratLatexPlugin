# -*- coding: utf-8 -*-
r"""v0.8.1 补丁 1/2：WYS 内核加 parsePreamble()。

【用户报的问题】「导言区没有正常渲染呢」

【实测到的根因】导言区（block type=preamble，L1–8）从来没走过预览内核，
只被渲染成一坨折叠的源码：

    <details class="wys-blk wys-fold"><summary>导言区 · 8 行</summary>
      <span class="wys-edit">\documentclass[12pt]{ctexart}\n\usepackage{amsmath}\n…</span>
    </details>

而只读预览对同一份 .tex 是这么渲染的：

    <div class="pv-title"><div class="pv-title-main">基于深度学习的文本摘要研究（插件演示样例）</div>
                       <div class="pv-author">张三</div></div>

于是「就地编辑」这一层**没有页首**——\title / \author 变成了源码里的两行，
\documentclass / \usepackage 也是一堆裸文本。这就是「没渲染」。

【本补丁】把导言区解析成结构，供编辑器渲染成成品的页首。
关键不变量：**任意一项的 前缀 + 正文 + 后缀 必须逐字节等于原行**。
    \title{基于…}                 → 前缀 "\title{"  正文 "基于…"   后缀 "}"
    \documentclass[12pt]{ctexart} → 前缀 "\documentclass[12pt]{" 正文 "ctexart" 后缀 "}"
    \usepackage{amsmath}          → 前缀 "\usepackage{"  正文 "amsmath"  后缀 "}"
用户改的只是「正文」，前缀后缀原样带回 —— 这样「改显示」永远不会变成「改源码」。
"""
import io
import sys

P = "server/wysiwyg.js"
s = io.open(P, encoding="utf-8").read()
orig = s

FUNC = r'''
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
'''

rep_exports = (
    "\nmodule.exports = { parseDoc: parseDoc, headingNumbers: headingNumbers, applyEdits: applyEdits, parseInline: parseInline, segmentsToTex: segmentsToTex, headingTex: headingTex, classifyEnv: classifyEnv, escHtml: escHtml, escRe: escRe, readGroup: readGroup };\n"
)

if rep_exports not in s:
    print("MISS  导出行")
    sys.exit(1)

s = s.replace(
    rep_exports,
    FUNC + "\nmodule.exports = { parseDoc: parseDoc, headingNumbers: headingNumbers, parsePreamble: parsePreamble, applyEdits: applyEdits, parseInline: parseInline, segmentsToTex: segmentsToTex, headingTex: headingTex, classifyEnv: classifyEnv, escHtml: escHtml, escRe: escRe, readGroup: readGroup };\n",
    1,
)

if s == orig:
    print("NO CHANGE")
    sys.exit(1)
io.open(P, "w", encoding="utf-8").write(s)
print("  ok  server/wysiwyg.js: parsePreamble 已加并导出")
