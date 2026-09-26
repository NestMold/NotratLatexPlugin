/* v0.9.1 烟测：多文件展开 + TOC 占位 + 未知命令降级 */
const c = require("./preview-core.js");

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


/* ---------- v0.9.3 用户宏展开 + 附录字母编号 + 命令补齐 ---------- */
const files3 = {
  "macros.tex": "\\renewcommand{\\model}{\\textsc{Renamed}\\xspace}",
  "appx.tex": "\\appendix\n\\section{附甲}\\label{sec:ap}\n\\subsection{细目}",
};
const r3 = (n) => { const k = n.replace(/\.tex$/, "") + ".tex"; return files3[k] ? { path: "E:/z/" + k, content: files3[k] } : null; };
const t91 = "\\documentclass{article}" +
  "\\newcommand{\\model}{\\textsc{AgentBench}\\xspace}" +
  "\\newcommand{\\vpara}[1]{\\noindent\\textbf{#1}\\xspace}" +
  "\\newcommand{\\hhide}[1]{}" +
  "\\newcommand{\\todo}[1]{\\textbf{\\color{red}[(TODO: #1 )]}}" +
  "\\newcommand{\\a}{\\a}" +
  "\\input{macros.tex}" +
  "\\begin{document}" +
  "\\model\\vpara{背景}正文\\hhide{不许出现}\\todo{预测}" +
  "\\section{甲}\\appendix\\input{appx.tex}" +
  "\\end{document}";
const h91 = c.renderPreview(t91, { baseDir: "E:/z", inputResolver: r3 }).html;
checks.push(
  ["[v093] 导言区宏生效（\\model → AgentBench 小型大写）", h91.includes("pv-sc") && h91.includes("AgentBench")],
  ["[v093] \\input 子文件里的 \\renewcommand 覆盖（Renamed 也在）", h91.includes("Renamed")],
  ["[v093] 带参宏 #1 替换（\\vpara{背景}）", h91.includes("<strong>背景</strong>")],
  ["[v093] 空体宏吞内容（\\hhide）", !h91.includes("不许出现")],
  ["[v093] \\todo 展开、\\color{red} 不漏字面量", h91.includes("TODO") && !h91.includes(">red<")],
  ["[v093] 命令名不泄漏（vpara/hhide/todo）", !h91.includes("vpara") && !h91.includes("hhide")],
  ["[v093] 自引用宏深度闸（\\a 不炸栈）", typeof h91 === "string" && h91.length > 0],
  ["[v093] 附录字母编号 A / A.1（含 \\input 进的附录）", h91.includes("A&nbsp;&nbsp;附甲") && h91.includes("A.1&nbsp;&nbsp;细目")],
  ["[v093] 附录前数字编号 1 不受影响", h91.includes("1&nbsp;&nbsp;甲")]
);
const t92 = "\\begin{document}\\url{example.com}\\href{https://a.b}{链}\\textcolor{red}{红}\\textcolor{javascript:alert(1)}{坏}\\marginpar{旁注}a\\dagger{}b\\ddagger{}c\\end{document}";
const h92 = c.renderPreview(t92, {}).html;
checks.push(
  ["[v093] \\url 出链接（自动补 https://）", h92.includes('class="pv-url"') && h92.includes("https://example.com")],
  ["[v093] \\href 双参数", h92.includes(">链</a>")],
  ["[v093] \\textcolor 合法色上 style", h92.includes('style="color:red"')],
  ["[v093] 危险色值拒绝（javascript: 不进 href/style）", !h92.includes("javascript:")],
  ["[v093] \\marginpar 旁注卡", h92.includes("pv-marg")],
  ["[v093] \\dagger / \\ddagger 符号", h92.includes("†") && h92.includes("‡")]
);
const h93 = c.renderPreview("\\begin{document}\\section{甲}\\subsection{子}\\section{乙}\\end{document}", {}).html;
checks.push(["[v093] 无 \\appendix 时数字编号字节不变（1/1.1/2）", h93.includes("1&nbsp;&nbsp;甲") && h93.includes("1.1&nbsp;&nbsp;子") && h93.includes("2&nbsp;&nbsp;乙")]);

/* v093 断言在主循环之后 push，这里补一轮求值 */
for (const [name, ok] of checks.slice(11)) { console.log((ok ? "✓" : "✗") + " " + name); if (!ok) bad++; }

process.exitCode = bad ? 1 : 0;
console.log(bad ? "\n有失败 ❌" : "\n全部通过 ✅");
