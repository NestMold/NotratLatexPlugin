/* v0.7.0 —— wysiwyg.test.js 补三组回归：行内往返契约 + 多块混合编辑 + 标题改多行
 * 运行： node .setup/patch-tests-v070.js
 */
const fs = require("fs");
const path = require("path");

const f = "E:/notrat-latex-plugin/server/wysiwyg.test.js";
let src = fs.readFileSync(f, "utf8");

const ANCHOR = 'console.log("\\n" + "-".repeat(52));';
if (src.split(ANCHOR).length - 1 !== 1) {
  console.error("✗ 尾部锚点未命中（期望 1 次）");
  process.exit(1);
}

const ADD = `console.log("\\n[11] 行内往返契约（与面板 wysDomToTex 同构的树遍历）");
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
  "见~\\\\cite{vaswani2017} 与 \\\\ref{fig:model}。",
  "其中式~\\\\eqref{eq:attn} 中 $d_k$ 为键向量维度，$Q$、$K$、$V$ 分别为查询、键、值矩阵。",
  "\\\\textbf{粗体}与\\\\emph{斜体}混排，外加 \\\\texttt{等宽}。",
  "50\\\\% 是比例，其余部分不在注释里。",
  "\\\\section{标题} 之外的 \\\\label{eq:x} 也走原子路径。",
  "转义字符：\\\\$ 美元 \\\\& 与号 \\\\_ 下划线 \\\\# 井号 \\\\{ 花括号 \\\\}。",
  "行尾注释 % 从这里开始全算注释 \\\\cite{nope}",
  "嵌套：\\\\textbf{外层 \\\\emph{内层} 收尾} 与 $a+b$。",
];
let inlineOk = true, badCase = "";
for (let k = 0; k < inlineCases.length; k++) {
  const s = inlineCases[k];
  const back = segsWalk(W.parseInline(s));
  if (back !== s) { inlineOk = false; badCase = "case#" + k + "\\n  原: " + JSON.stringify(s) + "\\n  回: " + JSON.stringify(back); break; }
}
ok("8 组行内往返逐字节一致", inlineOk, badCase);
ok("嵌套 wrap 内层仍可解析", W.parseInline("\\\\textbf{a \\\\emph{b} c}").length >= 1);

console.log("\\n[12] 多块混合编辑：只动被改的块");
const paras = doc.blocks.filter(function (b) { return b.type === "paragraph"; });
const heads = doc.blocks.filter(function (b) { return b.type === "heading"; });
const p0 = paras[0];
const h0 = heads.filter(function (b) { return b.suffix && b.suffix.indexOf("\\\\label") >= 0; })[0] || heads[0];
const multiEdits = [
  { startLine: p0.startLine, endLine: p0.endLine, newText: "改写后的第一段正文，仍带 \\\\cite{vaswani2017}。" },
  { startLine: h0.startLine, endLine: h0.endLine, newText: W.headingTex(h0, "新标题") },
];
const out2 = W.applyEdits(src, multiEdits);
ok("段落已替换", out2.indexOf("改写后的第一段正文") >= 0);
ok("标题已替换", out2.indexOf("新标题") >= 0);
ok("标题的 \\\\label 保住", h0.suffix.indexOf("\\\\label") < 0 || out2.indexOf(h0.suffix.replace(/^\\}/, "}")) >= 0, JSON.stringify(h0.suffix));
ok("新段落里的 \\\\cite 未丢", out2.indexOf("\\\\cite{vaswani2017}") >= 0);
ok("同块数（未新增/删除块）", W.parseDoc(out2).blocks.length === doc.blocks.length,
  doc.blocks.length + " → " + W.parseDoc(out2).blocks.length);
const untouched = doc.blocks.filter(function (b) { return b !== p0 && b !== h0; });
let kept = true, missId = "";
for (let k = 0; k < untouched.length; k++) {
  if (out2.indexOf(untouched[k].raw) < 0) { kept = false; missId = "#" + untouched[k].id + " " + untouched[k].type; break; }
}
ok("其余 " + untouched.length + " 块逐字节保留", kept, missId);

console.log("\\n[13] 标题改多行：行数变化被正确吸收");
const oneLine = "\\\\section{标题}\\\\label{a}\\n\\n正文甲。\\n\\n\\\\section{后一节}\\n";
const d1 = W.parseDoc(oneLine);
const hd = d1.blocks.filter(function (b) { return b.type === "heading"; })[0];
const two = W.applyEdits(oneLine, [{ startLine: hd.startLine, endLine: hd.endLine, newText: W.headingTex(hd, "第一行\\n第二行") }]);
ok("总行数 +1", two.split("\\n").length === oneLine.split("\\n").length + 1, JSON.stringify(two));
ok("\\\\label{a} 保住", two.indexOf("\\\\label{a}") >= 0);
ok("正文甲原样", two.indexOf("正文甲。") >= 0);
ok("后一节原样", two.indexOf("\\\\section{后一节}") >= 0);

console.log("\\n[14] 面板提交路径的三道自检（与 editor.tsx commitWys 同款判定）");
ok("自检1 空编辑集逐字节还原", W.applyEdits(src, []) === src);
ok("自检2 结果仍可解析", (function () { try { W.parseDoc(out2); return true; } catch (e) { return false; } })());
ok("自检3 无改动不产生 diff", W.applyEdits(src, [{ startLine: p0.startLine, endLine: p0.endLine, newText: p0.raw }]) === src);

`;

src = src.split(ANCHOR).join(ADD + ANCHOR);
fs.writeFileSync(f, src);
console.log("✓ server/wysiwyg.test.js 已补充 [11]-[14] 四组回归");
