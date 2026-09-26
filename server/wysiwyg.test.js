"use strict";
/* wysiwyg 内核单测 —— 两条硬不变式 + 真实样例回归
 * 运行： node server/wysiwyg.test.js
 */
const fs = require("fs");
const path = require("path");
const W = require("./wysiwyg.js");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok    " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "   → " + extra : "")); }
}

const src = fs.readFileSync(path.join(__dirname, "..", "samples", "sample.tex"), "utf8");
const doc = W.parseDoc(src);
const lines = src.split("\n");

console.log("\n[1] parseDoc 结构");
console.log("    源码 " + lines.length + " 行 → " + doc.blocks.length + " 块");
doc.blocks.forEach(function (b) {
  console.log("      #" + String(b.id).padStart(2) + " " + b.type.padEnd(10) + " L" +
    (b.startLine + 1) + "-" + (b.endLine + 1) + "  " + (b.editable ? "[可编辑]" : "[原子]  ") + " " + b.label);
});

ok("块按行号升序", doc.blocks.every(function (b, i) { return i === 0 || doc.blocks[i - 1].startLine <= b.startLine; }));
ok("块之间不重叠", doc.blocks.every(function (b, i) {
  return i === 0 || doc.blocks[i - 1].endLine < b.startLine;
}), JSON.stringify(doc.blocks.map(function (b) { return [b.startLine, b.endLine]; })));
ok("行号在界内", doc.blocks.every(function (b) {
  return b.startLine >= 0 && b.endLine >= b.startLine && b.endLine < lines.length;
}));

console.log("\n[2] 硬不变式 A：空编辑逐字节还原");
ok("applyEdits(src, []) === src", W.applyEdits(src, []) === src);
ok("applyEdits(src, null) === src", W.applyEdits(src, null) === src);
ok("applyEdits(src, [{}]) === src", W.applyEdits(src, [{}]) === src);

console.log("\n[3] 硬不变式 B：每块用自己的 raw 回写 = 恒等");
let ident = true;
for (const b of doc.blocks) {
  const out = W.applyEdits(src, [{ startLine: b.startLine, endLine: b.endLine, newText: b.raw }]);
  if (out !== src) { ident = false; console.log("      块 #" + b.id + " 回写后不等价"); }
}
ok("全部 " + doc.blocks.length + " 块逐一恒等回写", ident);

console.log("\n[4] 行内往返（parseInline → segmentsToTex 逐字节还原）");
const tricky = [
  "文本自动摘要是自然语言处理领域的经典任务，旨在从长文档中抽取核心信息。",
  "Transformer 架构~\\cite{vaswani2017} 的提出极大推动了该方向的发展。",
  "参见第~\\ref{sec:intro}~节的动机",
  "其中式~\\eqref{eq:attn} 中 $d_k$ 为键向量维度，$Q$、$K$、$V$ 分别为查询、键、值矩阵。",
  "Ours & \\textbf{44.6} & \\textbf{41.9} \\\\",
  "相关理论背景可参考~\\cite{knuth1984}。",
  "图~\\ref{fig:model} 展示了编码器--解码器整体框架。",
  "100\\% 的 $x^2$ 与 \\emph{强调} 以及 \\cite{a,b} 混排",
  "未来工作包括 % FIXME: 补写局限性与未来工作",
  "\\footnote{脚注内容} 与 \\url{https://example.com} 并列",
];
let rt = true;
for (const t of tricky) {
  const back = W.segmentsToTex(W.parseInline(t));
  if (back !== t) { rt = false; console.log("      往返失配\n        原文: " + JSON.stringify(t) + "\n        还原: " + JSON.stringify(back)); }
}
ok("全部 " + tricky.length + " 条行内往返一致", rt);

console.log("\n[5] 行内原子性：\\cite / \\ref / $..$ 必须是原子片段");
const segs = W.parseInline("文本~\\cite{vaswani2017} 与 \\ref{fig:model} 以及 $d_k$ 结束");
ok("\\cite 成原子", segs.some(function (s) { return s.t === "cmd" && s.cmd === "cite" && s.tex === "\\cite{vaswani2017}"; }));
ok("\\ref 成原子", segs.some(function (s) { return s.t === "cmd" && s.cmd === "ref" && s.tex === "\\ref{fig:model}"; }));
ok("$..$ 成原子", segs.some(function (s) { return s.t === "math" && s.tex === "$d_k$"; }));
ok("\\textbf 成可内嵌编辑的 wrap", W.parseInline("\\textbf{44.6}").some(function (s) {
  return s.t === "wrap" && s.open === "\\textbf{" && s.inner === "44.6";
}));

console.log("\n[6] 真实编辑：改段落文字不伤 \\cite，且块外零改动");
/* v0.9.3：不钉死哪一句、哪一个 key —— 按形态找「第一处带 \cite 的段落」，
 * key 从段落自己身上剥出来。断言测的是「改文字不烧原子」，不是「样例里写的恰好是那篇文献」 */
const para = doc.blocks.filter(function (b) {
  return b.type === "paragraph" && b.raw.indexOf("\\cite{") >= 0;
})[0];
ok("定位到含 \\cite 的段落", !!para, "未找到");
const CITE_TEX = para ? (para.raw.match(/\\cite\{[^}]*\}/) || [""])[0] : "";

if (para) {
  /* v0.9.3：原来靠替换"经典任务"（旧样例的原话）来制造一次编辑。改成给第一段正文文字
   * **追加**一个记号 —— 断言测的是「改文字不烧原子、块外零改动」，不是「样例里写过那句话」。 */
  const MARK = "【改过的字】";
  const sg = W.parseInline(para.raw);
  let marked = false;
  const edited = sg.map(function (s) {
    if (!marked && s.t === "text" && String(s.v).trim() !== "") { marked = true; return { t: "text", v: s.v + MARK }; }
    return s;
  });
  const out = W.applyEdits(src, [{ startLine: para.startLine, endLine: para.endLine, newText: W.segmentsToTex(edited) }]);
  const ob = out.split("\n"), sb = src.split("\n");

  ok("新文字已写入", marked && out.indexOf(MARK) >= 0, JSON.stringify(out.slice(0, 60)));
  ok("\\cite 原样保住（" + CITE_TEX + "）", CITE_TEX !== "" && out.indexOf(CITE_TEX) >= 0, "被烧毁了");
  ok("块前逐行不变", sb.slice(0, para.startLine).join("\n") === ob.slice(0, para.startLine).join("\n"));
  const tailLen = sb.length - para.endLine - 1;
  ok("块后逐行不变", sb.slice(para.endLine + 1).join("\n") === ob.slice(ob.length - tailLen).join("\n"));
  ok("总行数不变", sb.length === ob.length);
}

console.log("\n[7] 真实编辑：改标题文字保住 \\label");
/* v0.9.3：不再钉死 \label{sec:method}。取「第一个带 label 的标题」，
 * 命令前缀与 label 都从这一块自己身上取 —— 测的是「改标题烧不掉 label」。 */
const head = doc.blocks.filter(function (b) { return b.type === "heading" && b.raw.indexOf("\\label{") >= 0; })[0];
ok("定位到带 label 的标题", !!head, "未找到");
if (head) {
  const HEAD_CMD = String(head.prefix || "\\section{").replace(/\{$/, "");
  const HEAD_LABEL = (head.raw.match(/\\label\{[^}]*\}/) || [""])[0];
  const out = W.applyEdits(src, [{ startLine: head.startLine, endLine: head.endLine, newText: W.headingTex(head, "方法（改进版）") }]);
  ok("标题已替换", out.indexOf(HEAD_CMD + "{方法（改进版）}") >= 0, "实际: " + head.raw);
  ok("\\label 保住（" + HEAD_LABEL + "）", HEAD_LABEL !== "" && out.indexOf(HEAD_LABEL) >= 0);
}

console.log("\n[8] 原子块不被就地编辑路径触碰");
ok("公式环境为原子块", doc.blocks.filter(function (b) { return b.kind === "equation"; }).every(function (b) { return b.atomic && !b.editable; }));
ok("figure 为原子块", doc.blocks.filter(function (b) { return b.kind === "figure"; }).every(function (b) { return b.atomic && !b.editable; }));
ok("thebibliography 为原子块", doc.blocks.filter(function (b) { return b.kind === "thebibliography"; }).every(function (b) { return b.atomic && !b.editable; }));
ok("正文段落为可编辑块", doc.blocks.filter(function (b) { return b.type === "paragraph"; }).every(function (b) { return b.editable && !b.atomic; }));

console.log("\n[9] 多行标题跨行聚合");
const multi = W.parseDoc("\\section{这是一个\n很长很长的标题}\n\n正文。\n");
const mh = multi.blocks.filter(function (b) { return b.type === "heading"; })[0];
ok("跨行标题合成一块", !!mh && mh.startLine === 0 && mh.endLine === 1, JSON.stringify(mh));
ok("标题主体被正确提取", mh && mh.title === "这是一个\n很长很长的标题", mh && JSON.stringify(mh.title));

console.log("\n[10] 星号标题与短标题不被破坏");
const st = W.parseDoc("\\section*[短]{长标题}\\label{x}\n");
const sh = st.blocks.filter(function (b) { return b.type === "heading"; })[0];
ok("星号+短标题+label 解析", !!sh && sh.title === "长标题", sh && JSON.stringify(sh));
if (sh) {
  const out = W.applyEdits("\\section*[短]{长标题}\\label{x}\n", [{ startLine: sh.startLine, endLine: sh.endLine, newText: W.headingTex(sh, "改过") }]);
  ok("回写保留 * 与 [短] 与 \\label", out === "\\section*[短]{改过}\\label{x}\n", JSON.stringify(out));
}

console.log("\n[11] 行内往返契约（与面板 wysDomToTex 同构的树遍历）");
/* 面板里 wysDomToTex 走 DOM：text→nodeValue、math/cmd→data-tex、comment→data-tex、wrap→data-open + 内层 + "}"。
 * 这里用段树做同构遍历 —— 两边算法一一对应，回归在这里拦住就够了。 */
function segsWalk(segs) {
  let out = "";
  for (let k = 0; k < segs.length; k++) {
    const g = segs[k];
    if (!g) continue;
    if (g.t === "text") out += g.v;
    else if (g.t === "math") out += g.tex;
    else if (g.t === "cmd") out += g.tex;
    else if (g.t === "comment") out += g.v;
    else if (g.t === "wrap") out += g.open + segsWalk(W.parseInline(g.inner)) + "}";
  }
  return out;
}
const inlineCases = [
  "见~\\cite{vaswani2017} 与 \\ref{fig:model}。",
  "其中式~\\eqref{eq:attn} 中 $d_k$ 为键向量维度，$Q$、$K$、$V$ 分别为查询、键、值矩阵。",
  "\\textbf{粗体}与\\emph{斜体}混排，外加 \\texttt{等宽}。",
  "50\\% 是比例，其余部分不在注释里。",
  "\\section{标题} 之外的 \\label{eq:x} 也走原子路径。",
  "转义字符：\\$ 美元 \\& 与号 \\_ 下划线 \\# 井号 \\{ 花括号 \\}。",
  "行尾注释 % 从这里开始全算注释 \\cite{nope}",
  "嵌套：\\textbf{外层 \\emph{内层} 收尾} 与 $a+b$。",
];
let inlineOk = true, badCase = "";
for (let k = 0; k < inlineCases.length; k++) {
  const s = inlineCases[k];
  const back = segsWalk(W.parseInline(s));
  if (back !== s) { inlineOk = false; badCase = "case#" + k + "\n  原: " + JSON.stringify(s) + "\n  回: " + JSON.stringify(back); break; }
}
ok("8 组行内往返逐字节一致", inlineOk, badCase);
ok("嵌套 wrap 内层仍可解析", W.parseInline("\\textbf{a \\emph{b} c}").length >= 1);

console.log("\n[12] 多块混合编辑：只动被改的块");
const paras = doc.blocks.filter(function (b) { return b.type === "paragraph"; });
const heads = doc.blocks.filter(function (b) { return b.type === "heading"; });
const p0 = paras[0];
const h0 = heads.filter(function (b) { return b.suffix && b.suffix.indexOf("\\label") >= 0; })[0] || heads[0];
const multiEdits = [
  { startLine: p0.startLine, endLine: p0.endLine, newText: "改写后的第一段正文，仍带 \\cite{vaswani2017}。" },
  { startLine: h0.startLine, endLine: h0.endLine, newText: W.headingTex(h0, "新标题") },
];
const out2 = W.applyEdits(src, multiEdits);
ok("段落已替换", out2.indexOf("改写后的第一段正文") >= 0);
ok("标题已替换", out2.indexOf("新标题") >= 0);
ok("标题的 \\label 保住", h0.suffix.indexOf("\\label") < 0 || out2.indexOf(h0.suffix.replace(/^\}/, "}")) >= 0, JSON.stringify(h0.suffix));
ok("新段落里的 \\cite 未丢", out2.indexOf("\\cite{vaswani2017}") >= 0);
ok("同块数（未新增/删除块）", W.parseDoc(out2).blocks.length === doc.blocks.length,
  doc.blocks.length + " → " + W.parseDoc(out2).blocks.length);
const untouched = doc.blocks.filter(function (b) { return b !== p0 && b !== h0; });
let kept = true, missId = "";
for (let k = 0; k < untouched.length; k++) {
  if (out2.indexOf(untouched[k].raw) < 0) { kept = false; missId = "#" + untouched[k].id + " " + untouched[k].type; break; }
}
ok("其余 " + untouched.length + " 块逐字节保留", kept, missId);

console.log("\n[13] 标题改多行：行数变化被正确吸收");
const oneLine = "\\section{标题}\\label{a}\n\n正文甲。\n\n\\section{后一节}\n";
const d1 = W.parseDoc(oneLine);
const hd = d1.blocks.filter(function (b) { return b.type === "heading"; })[0];
const two = W.applyEdits(oneLine, [{ startLine: hd.startLine, endLine: hd.endLine, newText: W.headingTex(hd, "第一行\n第二行") }]);
ok("总行数 +1", two.split("\n").length === oneLine.split("\n").length + 1, JSON.stringify(two));
ok("\\label{a} 保住", two.indexOf("\\label{a}") >= 0);
ok("正文甲原样", two.indexOf("正文甲。") >= 0);
ok("后一节原样", two.indexOf("\\section{后一节}") >= 0);

console.log("\n[14] 面板提交路径的三道自检（与 editor.tsx commitWys 同款判定）");
ok("自检1 空编辑集逐字节还原", W.applyEdits(src, []) === src);
ok("自检2 结果仍可解析", (function () { try { W.parseDoc(out2); return true; } catch (e) { return false; } })());
ok("自检3 无改动不产生 diff", W.applyEdits(src, [{ startLine: p0.startLine, endLine: p0.endLine, newText: p0.raw }]) === src);

console.log("\n[15] 导言区解析 + 「前缀 + 正文 + 后缀」不变式（v0.8.1）");
{
  const pb = doc.blocks.filter(function (b) { return b.type === "preamble"; })[0];
  const fm = W.parsePreamble(pb.raw, pb.startLine);

  ok("\\documentclass 认出来了", !!fm.cls && fm.cls.body === "ctexart" && fm.cls.opt === "12pt");
  ok("\\title 认出来了", !!fm.title && fm.title.body.indexOf("Tempo") >= 0, fm.title && fm.title.body);
  ok("\\author 认出来了", !!fm.author && fm.author.body === "张三");
  ok("\\date 不存在时不硬造", fm.date === null);
  ok("两个 \\usepackage 各自成一个标签", fm.pkgs.length === 2 && fm.pkgs[0].name === "amsmath" && fm.pkgs[1].name === "graphicx");
  ok("行号对得上：\\title 在 L" + (fm.title.s + 1), fm.title.s === 4);
  ok("行号对得上：\\documentclass 在 L" + (fm.cls.s + 1), fm.cls.s === 0);

  /* ★ 硬不变式：任何一项，前缀 + 正文 + 后缀 必须逐字节等于它覆盖的那几行 */
  const srcLines2 = src.split("\n");
  const items = [fm.cls, fm.title, fm.author, fm.pkgs[0], fm.pkgs[1]];
  let allExact = true, firstBad = "";
  for (const it of items) {
    const orig = srcLines2.slice(it.s, it.e + 1).join("\n");
    if (!W.partsExact(it, orig)) {
      allExact = false;
      firstBad = firstBad || (it.cmd + " 期望 " + JSON.stringify(orig) + " 实得 " + JSON.stringify(W.partsJoin(it.prefix, it.body, it.suffix)));
    }
  }
  ok("★ 五项逐字节还原（前缀 + 正文 + 后缀 == 原行）", allExact, firstBad);
  ok("partsJoin 与 headingTex 是同一件事（headingTex 已改为复用 partsJoin）",
    W.headingTex({ prefix: "\\section{", suffix: "}" }, "标题") === W.partsJoin("\\section{", "标题", "}"));

  /* 改了正文之后回拼：只换中间那段，前后缀原样 */
  ok("改正文后回拼只动中间：\\title{ 与 } 都还在",
    W.partsJoin(fm.title.prefix, "新标题", fm.title.suffix) === "\\title{新标题}");

  /* 边界：null / undefined / 空串都不许抛，也不许拼出 "undefined" */
  ok("partsJoin 对 null/undefined 不抛且不拼出 undefined",
    W.partsJoin(null, undefined, null) === "" && W.partsJoin("a", null, "b") === "ab");
  ok("partsExact 对空块判 false（不是悄悄通过）", W.partsExact(null, "任意") === false);
  ok("parsePreamble 对空输入不抛", (function () {
    try { const x = W.parsePreamble("", 0); return x && x.title === null && x.pkgs.length === 0; } catch (e) { return false; }
  })());

  /* 多行 \title 也要认，且前缀后缀照样拼得回去 */
  const multi = "\\documentclass{article}\n\\title{第一行\n第二行}\n";
  const fm2 = W.parsePreamble(multi, 0);
  ok("跨行的 \\title 认出来了", !!fm2.title && fm2.title.body === "第一行\n第二行" && fm2.title.s === 1 && fm2.title.e === 2);
  ok("跨行的 \\title 前缀后缀也拼得回去",
    W.partsExact(fm2.title, multi.split("\n").slice(1, 3).join("\n")));
}

console.log("\n" + "-".repeat(52));
console.log(fail === 0 ? "全部通过：" + pass + " 项" : "通过 " + pass + " 项，失败 " + fail + " 项");
process.exit(fail === 0 ? 0 : 1);
