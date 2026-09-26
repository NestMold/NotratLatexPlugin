/* v0.9.1 烟测：多文件展开 + TOC 占位 + 未知命令降级 */
const c = require("E:/notrat-latex-plugin/server/preview-core.js");

const files = {
  "a.tex": "A1 \\input{b} A2",
  "b.tex": "B1 \\input{a} B2",
  "ok.tex": "\\section{S1} 正文文本 \\begin{equation}x=1\\end{equation}",
};
const resolver = (n) => {
  const k = n.replace(/\.tex$/, "") + ".tex";
  const f = files[k];
  return f ? { path: "E:/x/" + k, content: f } : null;
};

const tex = "\\begin{document}\n\\doparttoc\n\\faketableofcontents\n\\input{ok.tex}\n\\input{a}\n\\unknowncmd{被保留}\n\\end{document}";
const h = c.renderPreview(tex, { baseDir: "E:/x", inputResolver: resolver }).html;

const checks = [
  ["S1 标题渲染", h.includes("S1")],
  ["a.tex 展开（A1/B1 出现）", h.includes("A1") && h.includes("B1")],
  ["循环引用截断", h.includes("循环引用")],
  ["TOC 占位卡", h.includes("目录（编译 PDF 后生成")],
  ["doparttoc 静默", !h.includes("doparttoc") && !h.includes("faketableof")],
  ["未知命令参数保留", h.includes("被保留")],
  ["未知命令名不泄漏", !h.includes("unknowncmd")],
  ["文件卡片头", h.includes("📄")],
];
let bad = 0;
for (const [name, ok] of checks) { console.log((ok ? "✓" : "✗") + " " + name); if (!ok) bad++; }

/* 无 resolver → 静态占位 */
const h2 = c.renderPreview("\\begin{document}\\input{a}\\end{document}", {}).html;
const ok2 = h2.includes("子文件内容在编译 PDF 时合并显示");
console.log((ok2 ? "✓" : "✗") + " 无 resolver 静态占位"); if (!ok2) bad++;

/* resolver 给 path 不给 content → pending 标记（面板异步填充入口） */
const h3 = c.renderPreview("\\begin{document}\\input{a}\\end{document}", {
  baseDir: "E:/x",
  inputResolver: (n) => ({ path: "E:/x/" + n.replace(/\.tex$/, "") + ".tex" }),
}).html;
const ok3 = h3.includes("data-inc-pending=") && h3.includes("子文件加载中");
console.log((ok3 ? "✓" : "✗") + " pending 标记输出"); if (!ok3) bad++;

/* 编号跨文件延续：两个文件各有一个 section，编号应 1 → 2 */
const files2 = { "p.tex": "\\section{第一}", "q.tex": "\\section{第二}" };
const r2 = (n) => { const k = n.replace(/\.tex$/, "") + ".tex"; return files2[k] ? { path: "E:/y/" + k, content: files2[k] } : null; };
const h4 = c.renderPreview("\\begin{document}\\input{p}\\input{q}\\end{document}", { baseDir: "E:/y", inputResolver: r2 }).html;
const ok4 = h4.includes("1") && h4.includes("2");
console.log((ok4 ? "✓" : "✗") + " 章节编号跨文件延续（含 1 与 2）"); if (!ok4) bad++;

process.exitCode = bad ? 1 : 0;
console.log(bad ? "\n有失败 ❌" : "\n全部通过 ✅");
