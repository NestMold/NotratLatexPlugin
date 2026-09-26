# samples/ 真实语料来源登记

`server/testkit.js` 的 `loadCorpus()` 会扫本目录根下的 `*.tex`（非递归），把它们当「真实语料」
交给 P1 的逐字节还原断言 —— `server/v09-docmodel.test.js` 第 1.1 条
`serialize(parse(s)) === s`。

入库规矩：

- 只收**授权明确、可再分发**的。许可写不清、下载页没标的，一律不收。
- 原始字节原样入库，不做换行 / 编码清洗。`.gitattributes` 对本目录 `*.tex` 关掉了文本转换
  （`-text -eol`），保证 clone 出来的字节和来源一致。
- 文件头已有的版权 / 许可声明保持原样，不删、不改、不压缩。
- 合成边界语料在 `server/corpus/`，不在这里。这里只放真东西。

## 清单

| 文件 | 来源包 | 许可 | 包版本 | 字节 | sha256（前 16 位） |
| --- | --- | --- | --- | --- | --- |
| `real-latex2e-small2e.tex` | [latex-base](https://ctan.org/pkg/latex-base) | LPPL 1.3c | 2026-06-01 | 1 694 | `6995024e85f537d3` |
| `real-latex2e-sample2e.tex` | [latex-base](https://ctan.org/pkg/latex-base) | LPPL 1.3c | 2026-06-01 | 7 200 | `f135855f870c31f1` |
| `real-llncs-doc.tex` | [llncs](https://ctan.org/pkg/llncs) | CC-BY 4.0 | 2.26 | 17 763 | `2b77b747d13460a3` |
| `real-revtex-apssamp.tex` | [revtex](https://ctan.org/pkg/revtex) | LPPL 1.3c | 4.2f | 31 473 | `9d813074afa316ce` |
| `real-tufte-handout.tex` | [tufte-latex](https://ctan.org/pkg/tufte-latex) | Apache-2.0 | 3.5.2 | 11 684 | `379804c5ccf507a7` |
| `sample.tex` | 仓库自带（Tempo 示例，作者自撰） | 随本仓库 MIT | — | 11 492 | `442f964d80f7ffe2` |

- 许可一栏取自 CTAN 官方元数据 `https://ctan.org/json/2.0/pkg/<包名>` 的 `licenses` 字段，
  不是从下载页或文件头推测的。
- 取得日期：2026-09-27。
- `sample.tex` 一直在仓库里，之前是唯一一份真实语料；换成现在的小样例后文档里「2 份真实 .tex」
  的说法已经过期，实际只有它 1 份，本批把它补到 6 份。

## 逐份说明

### real-latex2e-small2e.tex

- 直取地址：`https://mirrors.ctan.org/macros/latex/base/small2e.tex`
- 文件头声明：「This is a small sample LaTeX input file (Version of 10 April 1994)」。
  属 LaTeX2e 发行版官方示例，文件内无独立版权段，许可按所属包 LPPL 1.3c。
- 实测覆盖：`article` 类。这份很小，价值在「极简真实件」这一档。

### real-latex2e-sample2e.tex

- 直取地址：`https://mirrors.ctan.org/macros/latex/base/sample2e.tex`
- 文件头署名 Leslie Lamport，属 LaTeX2e 发行版官方示例，许可 LPPL 1.3c。
- 实测覆盖：`article` 类、用户宏定义、`\footnote`。

### real-llncs-doc.tex

- 直取地址：`https://mirrors.ctan.org/macros/latex/contrib/llncs/llncsdoc.tex`
- 文件头声明：「This is LLNCSDOC.TEX the documentation file of the LaTeX2e class from
  Springer-Verlag for Lecture Notes in Computer Science, version 2.26」。
- 许可为 CC-BY 4.0，**署名义务由本登记表承担**；原始版权声明保留在文件头未改动。
- 实测覆盖：`llncs` 类、`verbatim`、`\cite`、`tabular`。

### real-revtex-apssamp.tex

- 直取地址：`https://mirrors.ctan.org/macros/latex/contrib/revtex/sample/aps/apssamp.tex`
- 文件头声明：「Copyright (c) 2014 The American Physical Society. See the REVTeX 4 README
  file for restrictions and more information.」——**原文保留**。包许可为 LPPL 1.3c，
  这里按「期刊官方模板」处理：保留原声明、只作结构语料。
- 实测覆盖：`revtex4-2` 类、`verbatim`、浮动体、`\cite` / `\bibliography`、数学环境、
  `\appendix`、`tabular`、`\footnote`。本批结构最复杂的一份。

### real-tufte-handout.tex

- 直取地址：`https://mirrors.ctan.org/macros/latex/contrib/tufte-latex/sample-handout.tex`
- 文件头无版权 / 许可声明（直接以 `\documentclass` 开头）。许可按所属包 Apache-2.0，
  署名同样由本表承担。
- 实测覆盖：`tufte-handout` 类、浮动体、`\cite`、用户宏定义、`tabular`、`\footnote`。

## 还没覆盖到的（下一批的靶子）

本批 5 份全是 article 系，下面这些维度**仍然是空的**：

- 含 `\chapter` 的 `book` / `report` 类（学位论文形态）。
- 主文件 + `\input` / `\include` 的多文件形态，含嵌套与 `\includeonly`。
- 带 BOM、UTF-16LE / BE（含代理对）、CRLF 混排、末行无换行的真实件 ——
  这四项目前只有 `server/corpus/` 的合成件在扛，真实件一个都没有。
- `lstlisting`、跨文件 `\ref` / `\eqref`、`\url`、转义字符 `\& \% \_ \#`。

入库节奏按原来的约定：每批 5 份 → `npm run gate` + `npm run test:docmodel` → 绿了再下一批。
