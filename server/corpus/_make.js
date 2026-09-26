"use strict";
/* =====================================================================
 * 语料生成器： server/corpus/*.tex
 *
 * 运行： node server/corpus/_make.js
 *
 * 为什么需要它
 *   无损 CST 的成败几乎全在**边界**上：CRLF、BOM、末行无换行、verbatim 里的 %、
 *   多行 \title、\end{document} 之后的垃圾、行尾空格、连续空行……
 *   每一条都在真实论文里出现过。把「解析失败」当测试失败，而不是等用户来报。
 *
 * 这里写的是**最小复现**：一份文件只针对一个或一组相邻的边界，
 * 断言失败时能一眼看出是哪一类没兜住。
 *
 * 每份语料都是显式字节：eol / BOM / 末尾换行全部指定，不靠系统默认 ——
 * 「测试自己在 Windows 上悄悄变成 CRLF」这种事必须杜绝。
 * =================================================================== */

const fs = require("fs");
const path = require("path");
const R = String.raw;

const OUT = __dirname;

/* { eol, bom, endNl, lines } → { eol, bom, endNl } 显式拼字节 */
function build(spec) {
  const eol = spec.eol == null ? "\n" : spec.eol;
  let s = (spec.bom ? "\uFEFF" : "") + spec.lines.join(eol);
  if (spec.endNl !== false) s += eol;
  return s;
}

const F = {};

/* ---------- 1. 基础形态 ---------- */
F["01-minimal.tex"] = { lines: [
  R`\documentclass{article}`,
  R`\begin{document}`,
  R`Hello world.`,
  R`\end{document}`,
] };

F["02-no-trailing-newline.tex"] = { endNl: false, lines: [
  R`\documentclass{article}`,
  R`\begin{document}`,
  R`最后一行没有换行符，直接 EOF`,
  R`\end{document}`,
] };

F["03-crlf.tex"] = { eol: "\r\n", lines: [
  R`\documentclass{article}`,
  R`\begin{document}`,
  R`CRLF 行尾：每一行都以 \r\n 结束。`,
  R`\section{中段}`,
  R`第二段。`,
  R`\end{document}`,
] };

F["04-crlf-no-trailing.tex"] = { eol: "\r\n", endNl: false, lines: [
  R`\documentclass{article}`,
  R`\begin{document}`,
  R`CRLF 且末尾无换行。`,
  R`\end{document}`,
] };

F["05-bom.tex"] = { bom: true, lines: [
  R`\documentclass{article}`,
  R`\begin{document}`,
  R`文件开头带 UTF-8 BOM。`,
  R`\end{document}`,
] };

F["06-bom-crlf.tex"] = { bom: true, eol: "\r\n", lines: [
  R`\documentclass{article}`,
  R`\begin{document}`,
  R`BOM + CRLF 同时出现。`,
  R`\end{document}`,
] };

/* ---------- 2. 空行 / 空白 ---------- */
F["07-blank-runs.tex"] = { lines: [
  R`\documentclass{article}`,
  R`\begin{document}`,
  R`第一段。`,
  ``,
  ``,
  ``,
  R`连续三个空行之后。`,
  ``,
  R`\end{document}`,
] };

F["08-ws-only-lines.tex"] = { lines: [
  R`\documentclass{article}`,
  R`\begin{document}`,
  R`下一行是「只有空格的空行」。`,
  `    `,
  `\t`,
  `  \t  `,
  R`再下一行是正常段落。`,
  R`\end{document}`,
] };

F["09-trailing-spaces.tex"] = { lines: [
  R`\documentclass{article}`,
  R`\begin{document}`,
  R`这一行末尾有空格   `,
  R`\section{标题后面也有空格}  `,
  R`正文。\t`,
  R`\end{document}`,
] };

F["10-tab-indent.tex"] = { lines: [
  R`\documentclass{article}`,
  R`\begin{document}`,
  R`\section{制表符缩进}`,
  `\t这是用 Tab 缩进的段落第一行`,
  `\t\t第二行缩进更深`,
  R`\end{document}`,
] };

F["11-empty.tex"] = { lines: [ `` ], endNl: false };

F["12-only-newline.tex"] = { lines: [ ``, `` ], endNl: false };

/* ---------- 3. 注释 ---------- */
F["13-comments.tex"] = { lines: [
  R`% 文件头注释块`,
  R`% 第二行注释`,
  R`\documentclass{article}`,
  R`\begin{document}`,
  R`正文里带行尾注释 % 这里是注释`,
  R`% 独立注释块`,
  R`% 紧接着第二行`,
  R`转义百分号不是注释：100\% 通过`,
  R`\end{document}`,
] };

F["14-comment-only-doc.tex"] = { lines: [
  R`% 这份文件只有注释，没有任何结构`,
  R`% 第二行`,
  ``,
  R`% 第四行`,
] };

/* ---------- 4. 标题形态 ---------- */
F["15-starred-and-short.tex"] = { lines: [
  R`\documentclass{article}`,
  R`\begin{document}`,
  R`\section*{不编号的节}`,
  R`正文。`,
  R`\section[目录里的短标题]{正文里的长标题}`,
  R`正文。`,
  R`\subsection*[短]{长}`,
  R`正文。`,
  R`\end{document}`,
] };

F["16-multiline-title.tex"] = { lines: [
  R`\documentclass{article}`,
  R`\title{第一行标题`,
  R`第二行标题}`,
  R`\author{某人}`,
  R`\begin{document}`,
  R`\maketitle`,
  R`\section{多行的节标题`,
  R`跨了两行}`,
  R`正文。`,
  R`\end{document}`,
] };

F["17-labels.tex"] = { lines: [
  R`\documentclass{article}`,
  R`\begin{document}`,
  R`\section{方法}\label{sec:method}`,
  R`\subsection{细节}\label{sec:detail}`,
  R`\begin{equation}\label{eq:one}`,
  R`  E = mc^2`,
  R`\end{equation}`,
  R`见式~\eqref{eq:one} 与第~\ref{sec:detail}~节。`,
  R`\end{document}`,
] };

/* ---------- 5. 环境 ---------- */
F["18-verbatim-percent.tex"] = { lines: [
  R`\documentclass{article}`,
  R`\begin{document}`,
  R`\begin{verbatim}`,
  `# 这里的 % 不是注释，还有反斜杠 \\ 和大括号 { }`,
  R`\begin{itemize}`,
  R`\item 这行在 verbatim 里只是字面文本`,
  R`\end{itemize}`,
  R`\end{verbatim}`,
  R`verbatim 之后的正文。`,
  R`\end{document}`,
] };

F["19-nested-envs.tex"] = { lines: [
  R`\documentclass{article}`,
  R`\begin{document}`,
  R`\begin{figure}`,
  R`  \centering`,
  R`  \begin{minipage}{0.5\textwidth}`,
  R`    \begin{itemize}`,
  R`      \item 嵌套三层`,
  R`    \end{itemize}`,
  R`  \end{minipage}`,
  R`  \caption{嵌套环境}\label{fig:nest}`,
  R`\end{figure}`,
  R`\end{document}`,
] };

F["20-math-envs.tex"] = { lines: [
  R`\documentclass{article}`,
  R`\begin{document}`,
  R`行内公式 $a^2+b^2=c^2$ 与 \(x \to 0\)。`,
  R`\[`,
  R`  \int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}`,
  R`\]`,
  R`$$`,
  R`  \sum_{i=1}^{n} i = \frac{n(n+1)}{2}`,
  R`$$`,
  R`\begin{align}`,
  R`  a &= b + c \\`,
  R`  d &= e`,
  R`\end{align}`,
  R`\begin{equation}`,
  R`  \begin{cases}`,
  R`    x, & x > 0 \\`,
  R`    0, & x \le 0`,
  R`  \end{cases}`,
  R`\end{equation}`,
  R`\end{document}`,
] };

F["21-bib.tex"] = { lines: [
  R`\documentclass{article}`,
  R`\begin{document}`,
  R`引用~\cite{knuth1984}。`,
  R`\begin{thebibliography}{9}`,
  R`\bibitem{knuth1984} Knuth D E. The \TeX book. 1984.`,
  R`\bibitem{vaswani2017} Vaswani A, et al. Attention is all you need. 2017.`,
  R`\end{thebibliography}`,
  R`\end{document}`,
] };

F["22-lists.tex"] = { lines: [
  R`\documentclass{article}`,
  R`\begin{document}`,
  R`\begin{enumerate}`,
  R`  \item 第一项`,
  R`  \item 第二项`,
  R`  \begin{itemize}`,
  R`    \item 嵌套项`,
  R`  \end{itemize}`,
  R`\end{enumerate}`,
  R`\begin{description}`,
  R`  \item[术语] 解释。`,
  R`\end{description}`,
  R`\end{document}`,
] };

F["23-code-lstlisting.tex"] = { lines: [
  R`\documentclass{article}`,
  R`\begin{document}`,
  R`\begin{lstlisting}[language=Python]`,
  R`def f(x):`,
  R`    return x % 2  # 这里的 % 是取模，不是注释`,
  R`\end{lstlisting}`,
  R`\end{document}`,
] };

/* ---------- 6. 缺失 / 异常结构 ---------- */
F["24-no-preamble.tex"] = { lines: [
  R`\section{直接开始}`,
  R`没有导言区，也没有 document 环境。`,
  ``,
  R`\subsection{小节}`,
  R`正文。`,
] };

F["25-trailing-garbage.tex"] = { lines: [
  R`\documentclass{article}`,
  R`\begin{document}`,
  R`正文。`,
  R`\end{document}`,
  ``,
  R`% 以下内容在 \end{document} 之后 —— 多半是误留，但一个字节都不能丢`,
  R`\section{不该出现在文档里}`,
  R`残留的段落。`,
] };

F["26-only-preamble.tex"] = { lines: [
  R`\documentclass[12pt]{article}`,
  R`\usepackage{amsmath}`,
  R`\usepackage{graphicx}`,
  R`\title{只有导言区}`,
  R`% 没有 \begin{document}`,
] };

F["27-end-without-begin.tex"] = { lines: [
  R`\documentclass{article}`,
  R`正文（没有 \begin{document}）。`,
  R`\end{document}`,
] };

/* ---------- 7. 内容形态 ---------- */
F["28-cjk.tex"] = { lines: [
  R`\documentclass[12pt]{ctexart}`,
  R`\title{基于深度学习的文本摘要研究}`,
  R`\author{张三}`,
  R`\begin{document}`,
  R`\maketitle`,
  R`\section{引言}`,
  R`文本自动摘要是自然语言处理领域的经典任务，旨在从长文档中抽取核心信息。`,
  R`Transformer 架构~\cite{vaswani2017} 的提出极大推动了该方向的发展。`,
  R`\section{结论}`,
  R`本文提出了……（此处省略）。`,
  R`\end{document}`,
] };

F["29-inline-atoms.tex"] = { lines: [
  R`\documentclass{article}`,
  R`\begin{document}`,
  R`见图~\ref{fig:a} 与表~\ref{tab:b}，另见~\cite{knuth1984}。`,
  `行内代码用 \\texttt{foo\\_bar}，宏用 \\emph{强调} 与 \\textbf{加粗}。`,
  R`\includegraphics[width=.8\linewidth]{fig.pdf}`,
  R`\footnote{脚注里的 \% 也要能扛住。}`,
  R`\end{document}`,
] };

F["30-escapes.tex"] = { lines: [
  R`\documentclass{article}`,
  R`\begin{document}`,
  R`转义字符：\%  \&  \_  \#  \{  \}  \$  \~{}  \^{}  \textbackslash{}`,
  R`命令名里带 @ 与数字：\foo@bar123 与 \cmd2。`,
  R`未闭合的花括号也不该让解析崩：\section{正常}`,
  R`\end{document}`,
] };

F["31-long-single-line.tex"] = { lines: [
  R`\documentclass{article}`,
  R`\begin{document}`,
  R`\section{超长单行}`,
  `这一行很长很长。`.repeat(200),
  R`\end{document}`,
] };

F["32-many-sections.tex"] = { lines: (function () {
  const out = [R`\documentclass{article}`, R`\begin{document}`];
  for (let i = 1; i <= 40; i++) {
    out.push(R`\section{第 ` + i + R` 节}`);
    out.push(R`这一节的正文内容。`);
    if (i % 3 === 0) out.push(R`\subsection{子节 ` + i + R`}`);
  }
  out.push(R`\end{document}`);
  return out;
})() };

/* ---------- 写盘 ---------- */
fs.mkdirSync(OUT, { recursive: true });
const names = Object.keys(F).sort();
let total = 0;
for (let i = 0; i < names.length; i++) {
  const name = names[i];
  const body = build(F[name]);
  fs.writeFileSync(path.join(OUT, name), Buffer.from(body, "utf8"));
  total += Buffer.byteLength(body, "utf8");
}
console.log("✓ 写出 " + names.length + " 份语料，共 " + total + " 字节 → " + OUT);
console.log("  含边界：CRLF / BOM / 末行无换行 / verbatim 里的 % / 多行标题 / 短标题 / " +
  "\\end{document} 后垃圾 / 行尾空格 / 连续空行 / 嵌套环境 / 缺失结构 / 转义字符");
