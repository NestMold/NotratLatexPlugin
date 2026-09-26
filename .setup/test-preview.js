"use strict";
/* preview-core 单元测试：直接跑 node .setup/test-preview.js */
const fs = require("fs");
const path = require("path");
const { renderPreview, miniMath, stripLineComment } = require("../server/preview-core.js");

const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "samples", "sample.tex"), "utf8");
const r = renderPreview(src, {});
const h = r.html;

let fails = 0;
function ok(cond, name) {
  if (cond) { console.log("  ✓ " + name); } else { console.error("  ✗ FAIL " + name); fails++; }
}

console.log("== sample.tex 渲染断言 ==");
ok(h.length > 2000, "输出体量正常 (" + h.length + " chars)");
ok(/<div class="pv-title">/.test(h) && /基于深度学习的文本摘要研究/.test(h), "标题头渲染");
ok(/pv-h2[^>]*>1&nbsp;&nbsp;引言</.test(h), "section 编号 1（映射 h2，h1 留给文档标题）");
ok(/pv-h3[^>]*>2\.1&nbsp;&nbsp;模型结构/.test(h), "subsection 编号 2.1（h3）");
ok(/data-line="\d+"/.test(h), "块级 data-line 行号锚点");
ok(/pv-eqbody/.test(h) && /\(1\)/.test(h), "公式环境 + 编号 (1)");
ok(/pv-tab/.test(h) && /ROUGE-1/.test(h) && /pv-hr/.test(h), "表格 + hline 边框");
ok(/<figure class="pv-float"/.test(h) && /figcaption/.test(h) && /模型整体结构/.test(h), "figure 浮动体 caption");
ok(!/\[htbp\]/.test(h), "[htbp] 可选参数不泄漏");
ok(/pv-bibitem/.test(h) && /Attention is all you need/.test(h), "参考文献列表");
ok(/pv-cite[^>]*>\[1\]</.test(h), "cite → [1] 徽章");
ok(/pv-ref[^>]*>图 1</.test(h), "ref{fig:model} → 图 1");
ok(/pv-ref[^>]*>\(1\)</.test(h), "eqref{eq:attn} → (1)");
ok(/pv-ref[^>]*>表 1</.test(h), "ref{tab:main} → 表 1");
ok(/pv-bad/.test(h) && /sec:intro/.test(h), "未定义引用标红 ?key");
ok(!/\\section|\\begin|\\label/.test(h), "命令不泄漏（无原始 \\section/\\begin 残留）");
ok(!/TODO|FIXME/.test(h), "注释已剥离（TODO/FIXME 不出现）");

console.log("== miniMath 兜底 ==");
const mm = miniMath("\\mathrm{softmax}\\!\\left(\\frac{QK^{\\top}}{\\sqrt{d_k}}\\right)V", true);
ok(/<sup>/.test(mm) && /√|frasl/.test(mm) && /softmax/.test(mm) && !/frac\w/.test(mm), "分数(嵌套花括号)/根号/上标近似");
const mm2 = miniMath("\\alpha + \\beta \\geq \\infty", false);
ok(/α/.test(mm2) && /β/.test(mm2) && /≥/.test(mm2) && /∞/.test(mm2), "希腊字母与关系符");

console.log("== 注释剥离 ==");
ok(stripLineComment("abc % comment") === "abc ", "行注释截断");
ok(stripLineComment("50\\% 折扣") === "50\\% 折扣", "转义 \\% 不截断");

console.log("== 自定义渲染函数注入（模拟 KaTeX）==");
const r2 = renderPreview("\\begin{equation}E=mc^2\\end{equation}", {
  renderMath: (tex, disp) => "<KTEX" + (disp ? ":D" : ":I") + ">" + tex + "</KTEX>",
});
ok(/<KTEX:D>E=mc\^2<\/KTEX>/.test(r2.html), "renderMath 透传 displayMode");

console.log("== 极端输入 ==");
ok(renderPreview("").html === "", "空文档");
const r3 = renderPreview("\\begin{itemize}\\item 甲\\begin{itemize}\\item 乙\\end{itemize}\\item 丙\\end{itemize}", {});
ok((r3.html.match(/<li>/g) || []).length === 3, "嵌套列表 3 个 item");
const r4 = renderPreview("\\documentclass{article}\\usepackage{x}\\begin{document}你好 $a_1+b^2$ 世界\\end{document}", {});
ok(/你好 <span class="pv-mini">a<sub>1<\/sub>\+b<sup>2<\/sup><\/span> 世界/.test(r4.html), "无 preamble 渲染 + 行内公式");

/* 生成可视化样例页（人工检查用） */
const page = '<!doctype html><meta charset="utf-8"><title>preview-core sample</title>' +
  '<style>body{max-width:760px;margin:24px auto;font-family:system-ui,"Segoe UI","Microsoft YaHei",sans-serif;line-height:1.75;color:#1a1a2e;padding:0 16px}' +
  '.pv-title{text-align:center;margin:24px 0}.pv-title-main{font-size:26px;font-weight:700}.pv-author,.pv-date{color:#666;margin-top:6px}' +
  '.pv-h1{font-size:21px;border-bottom:1px solid #ddd;padding-bottom:4px;margin:28px 0 10px}.pv-h2{font-size:19px;margin:22px 0 8px}.pv-h3{font-size:16px;margin:18px 0 6px}' +
  '.pv-eq{margin:14px 0;text-align:center;position:relative}.pv-eqno{position:absolute;right:0;top:50%;transform:translateY(-50%);color:#888}' +
  '.pv-tabwrap{overflow-x:auto}.pv-tab{border-collapse:collapse;margin:10px auto}.pv-tab td{border:1px solid #bbb;padding:5px 14px}.pv-hr td{border-top:2px solid #444}' +
  '.pv-float{border:1px dashed #c9c9d9;border-radius:8px;padding:14px;margin:16px 0;text-align:center}.pv-float figcaption{margin-top:8px;color:#555;font-size:14px}' +
  '.pv-imgna{background:#f4f4f8;padding:24px;color:#888;border-radius:6px}' +
  '.pv-ref,.pv-cite{color:#2563eb;border-bottom:1px dotted #2563eb;cursor:pointer;font-size:.92em}.pv-bad{color:#dc2626;border-color:#dc2626}' +
  '.pv-bib-t{font-weight:700;margin:22px 0 8px}.pv-bibitem{padding-left:2em;text-indent:-2em;margin:4px 0;font-size:14px}.pv-bibno{margin-right:6px}' +
  '.pv-tt{background:#f1f5f9;padding:1px 5px;border-radius:4px;font-family:Consolas,monospace;font-size:.92em}' +
  '.pv-code{background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;overflow:auto;white-space:pre-wrap}' +
  '.pv-quote{border-left:3px solid #cbd5e1;margin:12px 0;padding:4px 14px;color:#475569}' +
  '.pv-abs{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin:16px 0}.pv-abs-t{font-weight:700;margin-bottom:6px}' +
  '.pv-list{padding-left:1.6em}.pv-par{font-weight:600;margin:14px 0 4px}' +
  '</style>' + h;
fs.writeFileSync(path.join(root, ".setup", "preview-sample.html"), page, "utf8");
console.log("\n可视化样例 → .setup/preview-sample.html");
console.log(fails ? "\n" + fails + " 项失败" : "\n全部通过 ✓");
process.exit(fails ? 1 : 0);
