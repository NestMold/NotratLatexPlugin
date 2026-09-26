"use strict";
/* =====================================================================
 * v0.9 P1 验收 —— server/docmodel.js（无损 CST）
 *
 * 运行： node server/v09-docmodel.test.js
 *
 * 这一层要证明的只有三件事：
 *   ① 无损：serialize(parse(s)) === s，全部语料字节级（含 CRLF / BOM / 末行无换行）
 *   ② 定位：lineFrom/lineTo/from/to 精确，与 wysiwyg 的行号契约逐块一致
 *   ③ 隔离：每个 Op 只碰它自己的节点，未触碰的字节一个都不许动
 *
 * 不碰 UI，不依赖编辑器 —— 纯模块，纯数据。
 * =================================================================== */

const K = require("./testkit.js");
const D = require("./docmodel.js");
const WYS = require("./wysiwyg.js");

const corpus = K.loadCorpus();

/* 每个 Op 之后都跑一遍结构自检，顺手把「平铺破了」这类内部错误变成可读断言 */
function applyChecked(doc, ops, label) {
  const r = D.applyOps(doc, ops);
  const v = D.validate(r.doc);
  if (!v.ok) throw new Error("applyOps(" + label + ") 后结构自检不过：" + v.errors.slice(0, 3).join("；"));
  if (D.serialize(r.doc) !== r.doc.source) throw new Error("applyOps(" + label + ") 后拼接 ≠ source");
  return r;
}
/* 未触碰的节点，raw 必须逐字节不变 */
function untouchedAreIntact(before, afterDoc, changedIds) {
  const bad = [];
  const byId = new Map(afterDoc.nodes.map(function (n) { return [n.id, n]; }));
  for (let i = 0; i < before.nodes.length; i++) {
    const n = before.nodes[i];
    if (changedIds.indexOf(n.id) >= 0) continue;
    const m = byId.get(n.id);
    if (!m) { bad.push(n.id + " 消失了"); continue; }
    if (m.raw !== n.raw) bad.push(n.id + " 的字节被动了");
  }
  return bad;
}
function nodeByType(doc, type, nth) {
  const list = doc.nodes.filter(function (n) { return n.type === type; });
  return list[nth || 0] || null;
}

/* =====================================================================
 * 一 · 无损（红线 1）
 * =================================================================== */
K.section("一 · 无损：serialize(parse(src)) === src（" + corpus.length + " 份语料）");

let corpusNodes = 0;
const notLossless = [];
for (let i = 0; i < corpus.length; i++) {
  const c = corpus[i];
  try {
    const doc = D.parse(c.text);
    corpusNodes += doc.nodes.length;
    const back = D.serialize(doc);
    if (back !== c.text) {
      const d = K.firstDiff(c.text, back);
      notLossless.push(c.name + " @偏移" + (d && d.at) + "（源码第 " + (d && d.line) + " 行）");
    }
  } catch (e) {
    notLossless.push(c.name + " 抛错：" + ((e && e.message) || e));
  }
}
K.ok("1.1 全部 " + corpus.length + " 份语料逐字节还原（" + corpusNodes + " 个节点）",
  notLossless.length === 0, notLossless.slice(0, 5).join("; "));

/* 边界语料逐份点名 —— 失败时一眼看出是哪一类没兜住 */
const HARD = [
  ["03-crlf.tex", "CRLF 行尾"],
  ["04-crlf-no-trailing.tex", "CRLF + 末行无换行"],
  ["05-bom.tex", "UTF-8 BOM"],
  ["06-bom-crlf.tex", "BOM + CRLF"],
  ["02-no-trailing-newline.tex", "末行无换行"],
  ["11-empty.tex", "空文件"],
  ["12-only-newline.tex", "只有一个换行"],
  ["18-verbatim-percent.tex", "verbatim 里的 %"],
  ["23-code-lstlisting.tex", "lstlisting 里的取模 %"],
  ["16-multiline-title.tex", "多行 \\title / \\section"],
  ["15-starred-and-short.tex", "星号标题 + 短标题"],
  ["25-trailing-garbage.tex", "\\end{document} 之后的残留"],
  ["09-trailing-spaces.tex", "行尾空格"],
  ["08-ws-only-lines.tex", "只有空白的空行"],
  ["19-nested-envs.tex", "三层嵌套环境"],
  ["30-escapes.tex", "转义字符"],
];
for (let i = 0; i < HARD.length; i++) {
  const entry = corpus.filter(function (c) { return c.name === "corpus/" + HARD[i][0]; })[0];
  if (!entry) { K.ok("1.2." + i + " " + HARD[i][1], false, "语料 " + HARD[i][0] + " 缺失"); continue; }
  const back = D.serialize(D.parse(entry.text));
  K.ok("1.2." + (i + 1) + " " + HARD[i][1] + "（" + HARD[i][0] + "）", back === entry.text,
    back === entry.text ? "" : JSON.stringify(K.firstDiff(entry.text, back)));
}

/* 完全平铺：连空行都是节点，拼接即源码 */
const flatBad = [];
for (let i = 0; i < corpus.length; i++) {
  const doc = D.parse(corpus[i].text);
  const concat = doc.nodes.map(function (n) { return n.raw; }).join("");
  if (concat !== corpus[i].text) flatBad.push(corpus[i].name);
  const v = D.validate(doc);
  if (!v.ok) flatBad.push(corpus[i].name + "（自检：" + v.errors[0] + "）");
}
K.ok("1.3 完全平铺：nodes 首尾相接覆盖全部字节，且结构自检全过", flatBad.length === 0, flatBad.slice(0, 4).join("; "));

/* 幂等：parse → serialize → parse 两次结果一致（id 也一致） */
const idemBad = [];
for (let i = 0; i < corpus.length; i++) {
  const a = D.parse(corpus[i].text);
  const b = D.parse(D.serialize(a));
  if (a.nodes.map(function (n) { return n.id; }).join("|") !== b.nodes.map(function (n) { return n.id; }).join("|")) {
    idemBad.push(corpus[i].name);
  }
}
K.ok("1.4 id 派生是确定性的（同一份源码两次 parse，id 序列相同）", idemBad.length === 0, idemBad.slice(0, 4).join("; "));

/* =====================================================================
 * 二 · 定位（红线 3：行号契约）
 * =================================================================== */
K.section("二 · 定位：行号契约与 wysiwyg 逐块一致");

const contractBad = [];
for (let i = 0; i < corpus.length; i++) {
  const src = corpus[i].text;
  const wys = WYS.parseDoc(src).blocks;
  const doc = D.parse(src);
  for (let j = 0; j < wys.length; j++) {
    const w = wys[j];
    const hit = doc.nodes.filter(function (n) {
      return n.lineFrom === w.startLine && n.lineTo === w.endLine && n.type === w.type;
    });
    if (!hit.length) contractBad.push(corpus[i].name + " 的 " + w.type + " L" + (w.startLine + 1) + "-" + (w.endLine + 1));
  }
}
K.ok("2.1 每个 wysiwyg 块都能在模型里找到同类型同区间节点", contractBad.length === 0, contractBad.slice(0, 5).join("; "));

const lineBad = [];
for (let i = 0; i < corpus.length; i++) {
  const doc = D.parse(corpus[i].text);
  let lns = 0;
  for (let j = 0; j < doc.nodes.length; j++) {
    const n = doc.nodes[j];
    if (n.lineFrom !== lns) lineBad.push(corpus[i].name + " 节点 " + j + " lineFrom 断链");
    lns = n.lineTo + 1;
  }
  if (lns !== doc.lineCount) lineBad.push(corpus[i].name + " 行总数 " + lns + " ≠ " + doc.lineCount);
  if (doc.lineCount !== src_split(corpus[i].text)) lineBad.push(corpus[i].name + " lineCount 与 split(\"\\n\") 不符");
}
function src_split(s) { return String(s).split("\n").length; }
K.ok("2.2 节点行区间首尾相接、总数等于源码行数", lineBad.length === 0, lineBad.slice(0, 4).join("; "));

/* 字符 span 精确：raw.slice(0) 必须等于源码对应片段 */
const spanBad = [];
for (let i = 0; i < corpus.length; i++) {
  const src = corpus[i].text;
  const doc = D.parse(src);
  for (let j = 0; j < doc.nodes.length; j++) {
    const n = doc.nodes[j];
    if (src.slice(n.from, n.to) !== n.raw) { spanBad.push(corpus[i].name + " 节点 " + j + " span/raw 不符"); break; }
  }
}
K.ok("2.3 字符 span 精确：source.slice(from,to) === node.raw", spanBad.length === 0, spanBad.slice(0, 4).join("; "));

/* nodeAtLine：任取一行都能定位，且落在正确区间 */
const atBad = [];
for (let i = 0; i < corpus.length; i++) {
  const doc = D.parse(corpus[i].text);
  for (let ln = 0; ln < doc.lineCount; ln++) {
    const n = D.nodeAtLine(doc, ln);
    if (!n || !(n.lineFrom <= ln && ln <= n.lineTo)) { atBad.push(corpus[i].name + " 第 " + (ln + 1) + " 行定位失败"); break; }
  }
}
K.ok("2.4 nodeAtLine 在每一行都能定位（大纲高亮 / 仪表栏用）", atBad.length === 0, atBad.slice(0, 4).join("; "));

/* =====================================================================
 * 三 · Op 语义
 * =================================================================== */
K.section("三 · Op 语义（每个 Op 只碰自己的节点）");

/* --- setText：正文 --- */
(function () {
  const src = "\\documentclass{article}\n\\begin{document}\n\n第一段。\n\n第二段。\n\n\\end{document}\n";
  const doc = D.parse(src);
  const p = doc.nodes.filter(function (n) { return n.type === "paragraph"; })[1];
  const r = applyChecked(doc, [{ t: "setText", id: p.id, text: "第二段（改过）。" }], "setText");
  K.ok("3.1 setText 正文：内容换掉、行数不变", r.doc.nodes.filter(function (n) { return n.id === p.id; })[0].raw === "第二段（改过）。\n");
  K.ok("3.2 setText 正文：未触碰节点逐字节不变", untouchedAreIntact(doc, r.doc, r.tx.changed).length === 0,
    untouchedAreIntact(doc, r.doc, r.tx.changed).join("; "));
  K.ok("3.3 setText 的 tx.changed 只列这一个 id", r.tx.changed.length === 1 && r.tx.changed[0] === p.id,
    JSON.stringify(r.tx.changed));
})();

/* --- setText：标题（护住 \section* / [短标题] / \label） --- */
(function () {
  const src = "\\documentclass{article}\n\\begin{document}\n\n\\section[短标题]{长标题}\\label{sec:keep}\n\n正文。\n\n\\end{document}\n";
  const doc = D.parse(src);
  const h = doc.nodes.filter(function (n) { return n.type === "heading"; })[0];
  const r = applyChecked(doc, [{ t: "setText", id: h.id, text: "换过的标题" }], "setText/heading");
  const after = r.doc.nodes.filter(function (n) { return n.id === h.id; })[0];
  K.ok("3.4 setText 标题：只换中间那段，[短标题] 与 \\label 原样保留",
    after.raw === "\\section[短标题]{换过的标题}\\label{sec:keep}\n", JSON.stringify(after.raw));
  K.ok("3.5 setText 标题：type 仍是 heading，title/prefix/suffix 同步更新",
    after.type === "heading" && after.title === "换过的标题" && after.suffix === "}\\label{sec:keep}");
  K.ok("3.5b textOf 与 setText 口径一致：标题给 title（不含命令），正文给整块",
    D.textOf(h) === "长标题" && D.textOf(D.parse(src).nodes.filter(function (x) { return x.type === "paragraph"; })[0]) === "正文。");
})();

/* --- setHeading：正文 → 标题（多物理行段落合并，LaTeX 语义无损） --- */
(function () {
  const src = "\\documentclass{article}\n\\begin{document}\n\n文本自动摘要是自然语言处理领域的经典任务，\n旨在从长文档中抽取核心信息。\nTransformer 架构极大推动了该方向。\n\n\\end{document}\n";
  const doc = D.parse(src);
  const p = doc.nodes.filter(function (n) { return n.type === "paragraph"; })[0];
  const span = p.lineTo - p.lineFrom + 1;
  K.ok("3.6 语料确认：可视化档眼里「一段」，源码里跨 " + span + " 个物理行", span === 3);
  const r = applyChecked(doc, [{ t: "setHeading", id: p.id, cmd: "subsection" }], "setHeading");
  const after = r.doc.nodes.filter(function (n) { return n.id === p.id; })[0];
  const want = "\\subsection{文本自动摘要是自然语言处理领域的经典任务， 旨在从长文档中抽取核心信息。 Transformer 架构极大推动了该方向。}\n";
  K.ok("3.7 setHeading 正文→标题：整段并成一行，一个字都不丢", after.raw === want, JSON.stringify(after.raw));
  K.ok("3.8 setHeading 之后仍是完整平铺（行数从 3 变 1，后面的块行号自动重排）",
    r.doc.nodes.reduce(function (a, n) { return a + D.countLines(n.raw); }, 0) === r.doc.lineCount);
})();

/* --- setHeading：换层级 / 设为正文 --- */
(function () {
  const src = "\\documentclass{article}\n\\begin{document}\n\n\\section*{甲}\\label{sec:a}\n\n正文。\n\n\\end{document}\n";
  const doc = D.parse(src);
  const h = doc.nodes.filter(function (n) { return n.type === "heading"; })[0];
  const up = applyChecked(doc, [{ t: "setHeading", id: h.id, cmd: "subsection" }], "换层级");
  const a1 = up.doc.nodes.filter(function (n) { return n.id === h.id; })[0];
  K.ok("3.9 换层级：命令名换掉，星号与 \\label 都保住",
    a1.raw === "\\subsection*{甲}\\label{sec:a}\n", JSON.stringify(a1.raw));

  const plain = applyChecked(doc, [{ t: "setHeading", id: h.id, cmd: null }], "设为正文");
  const a2 = plain.doc.nodes.filter(function (n) { return n.id === h.id; })[0];
  K.ok("3.10 设为正文：命令砍掉，\\label 留住（引用不会断）",
    a2.raw === "甲\\label{sec:a}\n", JSON.stringify(a2.raw));
  K.ok("3.11 设为正文后 type 变成 paragraph", a2.type === "paragraph", a2.type);
})();

/* --- splitPara / mergePara --- */
(function () {
  const src = "\\documentclass{article}\n\\begin{document}\n\n甲甲甲。乙乙乙。\n\n\\end{document}\n";
  const doc = D.parse(src);
  const p = doc.nodes.filter(function (n) { return n.type === "paragraph"; })[0];
  const at = D.bodyOf(p).indexOf("乙");
  const sp = applyChecked(doc, [{ t: "splitPara", id: p.id, at: at }], "splitPara");
  const paras = sp.doc.nodes.filter(function (n) { return n.type === "paragraph"; });
  K.ok("3.12 splitPara：拆成两段，中间补一个空行（LaTeX 的段落边界是空行）",
    paras.length === 2 && D.bodyOf(paras[0]) === "甲甲甲。" && D.bodyOf(paras[1]) === "乙乙乙。",
    paras.map(function (n) { return JSON.stringify(n.raw); }).join(" + "));

  const mg = applyChecked(sp.doc, [{ t: "mergePara", ids: [paras[0].id, paras[1].id] }], "mergePara");
  const mp = mg.doc.nodes.filter(function (n) { return n.type === "paragraph"; });
  K.ok("3.13 mergePara：合回一段，边界变空格", mp.length === 1 && D.bodyOf(mp[0]) === "甲甲甲。 乙乙乙。",
    JSON.stringify(mp.map(function (n) { return n.raw; })));
  /* 拆段又合段**不是**字节可逆的：段落边界合并时按 LaTeX 语义补一个空格
   * （"甲。" + "乙。" 合成一段，读起来必须是 "甲。 乙。"，直接贴成 "甲。乙。" 会连字）。
   * 所以这里断言的是「内容一字不丢，只多一个边界空格」—— 这是设计，不是瑕疵。 */
  const merged = D.serialize(mg.doc);
  K.ok("3.14 拆了又合：内容一字不丢，只多一个段落边界空格（LaTeX 语义）",
    merged.replace("甲甲甲。 乙乙乙。", "甲甲甲。乙乙乙。") === src,
    JSON.stringify(K.firstDiff(src, merged)));
})();

/* --- 原子块替换 / 插入 / 删除 --- */
(function () {
  const src = "\\documentclass{article}\n\\begin{document}\n\n正文。\n\n\\begin{equation}\nx = 1\n\\end{equation}\n\n\\end{document}\n";
  const doc = D.parse(src);
  const eq = doc.nodes.filter(function (n) { return n.type === "math"; })[0];
  const rr = applyChecked(doc, [{ t: "replaceRaw", id: eq.id, raw: "\\begin{equation}\nx = 2 \\\\ y = 3\n\\end{equation}\n" }], "replaceRaw");
  K.ok("3.15 replaceRaw：原子块整块重写，块间空行没被吃掉",
    D.serialize(rr.doc) === src.replace("x = 1", "x = 2 \\\\ y = 3"), JSON.stringify(D.serialize(rr.doc)));

  const ins = applyChecked(doc, [{ t: "insertNode", index: 1, raw: "\\section{插进来的}\n" }], "insertNode");
  K.ok("3.16 insertNode：插在指定位置，且自带换行不与被插块粘成一行",
    D.serialize(ins.doc).indexOf("\\section{插进来的}\n") > 0 &&
    D.serialize(ins.doc).split("\n").length === doc.lineCount + 1,
    JSON.stringify(D.serialize(ins.doc)));

  const del = applyChecked(doc, [{ t: "deleteNodes", ids: [eq.id] }], "deleteNodes");
  K.ok("3.17 deleteNodes：节点消失、tx.deleted 记着它",
    !D.nodeById(del.doc, eq.id) && del.tx.deleted.indexOf(eq.id) >= 0, JSON.stringify(del.tx.deleted));
})();

/* --- 拒绝不该接的活（宁可不做，不许做坏） --- */
function throws(fn) { try { fn(); return null; } catch (e) { return (e && e.message) || String(e); } }
(function () {
  const src = "\\documentclass{article}\n\\begin{document}\n\n正文。\n\n\\begin{equation}\nx=1\n\\end{equation}\n\n\\end{document}\n";
  const doc = D.parse(src);
  const eq = doc.nodes.filter(function (n) { return n.type === "math"; })[0];
  const p = doc.nodes.filter(function (n) { return n.type === "paragraph"; })[0];
  K.ok("3.18 setText 拒绝作用于原子块（公式）",
    !!throws(function () { D.applyOps(doc, [{ t: "setText", id: eq.id, text: "x" }]); }));
  K.ok("3.19 setHeading 拒绝作用于公式块",
    !!throws(function () { D.applyOps(doc, [{ t: "setHeading", id: eq.id, cmd: "section" }]); }));
  K.ok("3.20 setHeading 拒绝「以 \\ 开头的正文」（那多半是用户敲错的命令）",
    !!throws(function () {
      const d2 = D.parse("\\documentclass{a}\n\\begin{document}\n\n\\foo{bar}\n\n\\end{document}\n");
      const q = d2.nodes.filter(function (n) { return n.type === "paragraph"; })[0];
      D.applyOps(d2, [{ t: "setHeading", id: q.id, cmd: "section" }]);
    }));
  K.ok("3.21 setHeading 拒绝未知章节命令",
    !!throws(function () { D.applyOps(doc, [{ t: "setHeading", id: p.id, cmd: "subsubsub" }]); }));
  K.ok("3.22 未知 Op 类型直接抛错（不静默吞掉）",
    !!throws(function () { D.applyOps(doc, [{ t: "frobnicate", id: p.id }]); }));
  K.ok("3.23 找不到 id 直接抛错",
    !!throws(function () { D.applyOps(doc, [{ t: "setText", id: "no-such-id", text: "x" }]); }));
  K.ok("3.24 mergePara 中间夹着别的块时拒绝合并",
    !!throws(function () {
      const d3 = D.parse("\\documentclass{a}\n\\begin{document}\n\n甲。\n\n\\section{乙}\n\n丙。\n\n\\end{document}\n");
      const ps = d3.nodes.filter(function (n) { return n.type === "paragraph"; });
      D.applyOps(d3, [{ t: "mergePara", ids: [ps[0].id, ps[1].id] }]);
    }));
  K.ok("3.25 applyOps 是纯函数：原 doc 一个字节都没动",
    D.serialize(doc) === src && doc.version === 0);
})();

/* =====================================================================
 * 四 · reproject（外部改动进来时，历史凭什么还活着）
 * =================================================================== */
K.section("四 · reproject：外部改动后把 id 认回来");

(function () {
  const src = "\\documentclass{article}\n\\begin{document}\n\n\\section{甲}\n\n正文一。\n\n正文二。\n\n\\end{document}\n";
  const before = D.parse(src);
  /* 外部在文档末尾追加一段（模拟宿主 / 大纲 / 同步写入） */
  const ext = src.replace("\\end{document}\n", "新增的一段。\n\n\\end{document}\n");
  const after = D.reproject(before, ext);
  const idsBefore = before.nodes.map(function (n) { return n.id; });
  const alive = after.nodes.filter(function (n) { return idsBefore.indexOf(n.id) >= 0; });
  K.ok("4.1 外部追加一段后，原来的 " + before.nodes.length + " 个节点 id 全部保住",
    alive.length === before.nodes.length, "只保住 " + alive.length);
  K.ok("4.2 reproject 结果无损（拼接 === 外部源码）", D.serialize(after) === ext);
  K.ok("4.3 reproject 结果结构自检通过", D.validate(after).ok, D.validate(after).errors.slice(0, 2).join("; "));

  /* 外部把某块内容改了：那一块应当**继承 id**（就近同类型认领） */
  const ext2 = src.replace("正文一。", "正文一（外部改写）。");
  const after2 = D.reproject(before, ext2);
  const p1 = before.nodes.filter(function (n) { return n.type === "paragraph"; })[0];
  const stillThere = D.nodeById(after2, p1.id);
  K.ok("4.4 某块内容被外部改写后，该块仍继承原 id（就近同类型认领）", !!stillThere,
    "丢失 id " + p1.id);
  K.ok("4.5 改写后新内容是可见的（不是把旧内容塞回去）",
    ext2.indexOf("正文一（外部改写）。") > 0 && D.serialize(after2) === ext2);
})();

(function () {
  /* id 唯一性：认领绝不允许把同一个 id 发给两个节点 */
  const bad = [];
  for (let i = 0; i < corpus.length; i++) {
    const a = D.parse(corpus[i].text);
    const mutated = a.nodes.length > 1
      ? corpus[i].text.replace(/\n\n/, "\n\n外部插入的一段。\n\n")
      : corpus[i].text;
    const b = D.reproject(a, mutated);
    const seen = new Set();
    for (let j = 0; j < b.nodes.length; j++) {
      if (seen.has(b.nodes[j].id)) { bad.push(corpus[i].name + " id 重复 " + b.nodes[j].id); break; }
      seen.add(b.nodes[j].id);
    }
    if (D.serialize(b) !== mutated) bad.push(corpus[i].name + " 无损被破坏");
    if (!D.validate(b).ok) bad.push(corpus[i].name + " 自检不过");
  }
  K.ok("4.6 全部语料：reproject 后 id 不重复、无损、自检通过", bad.length === 0, bad.slice(0, 4).join("; "));
})();

/* =====================================================================
 * 五 · 事务凭据（旧内核给不出的东西）
 * =================================================================== */
K.section("五 · 事务凭据：改变的是「可撤销的一步」，不再是裸字符串");

(function () {
  const src = "\\documentclass{article}\n\\begin{document}\n\n正文。\n\n\\end{document}\n";
  const doc = D.parse(src);
  const p = doc.nodes.filter(function (n) { return n.type === "paragraph"; })[0];
  const r = applyChecked(doc, [{ t: "setText", id: p.id, text: "改过。", label: "打字" }], "tx");
  K.ok("5.1 applyOps 返回 {doc, tx}（旧内核只返回字符串 —— 见基线 B2）", !!(r && r.doc && r.tx));
  K.ok("5.2 tx.before/after 是字节级快照，可直接用于撤销校验",
    r.tx.before === src && r.tx.after === D.serialize(r.doc));
  K.ok("5.3 tx.changed 精确列出被改的节点 id", r.tx.changed.length === 1 && r.tx.changed[0] === p.id,
    JSON.stringify(r.tx.changed));
  K.ok("5.4 tx.label 透传（历史面板 / toast 用）", r.tx.label === "打字", r.tx.label);
  K.ok("5.5 doc.version 自增（渲染层据此判断要不要重画）", r.doc.version === doc.version + 1);
  K.ok("5.6 空 ops 是恒等操作：返回原 doc、changed 为空", (function () {
    const e = D.applyOps(doc, []);
    return e.doc === doc && e.tx.changed.length === 0 && e.tx.before === src;
  })());
})();

/* 随机连打：任何一串 Op 之后，结构都必须仍然成立 */
(function () {
  const base = "\\documentclass{article}\n\\begin{document}\n\n\\section{节}\n\n甲段。\n\n乙段。\n\n丙段。\n\n\\end{document}\n";
  let doc = D.parse(base);
  let seed = 20251213;
  function rnd(n) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; }
  let steps = 0, broke = null;
  try {
    for (let i = 0; i < 200; i++) {
      const paras = doc.nodes.filter(function (n) { return n.type === "paragraph"; });
      if (!paras.length) break;
      const p = paras[rnd(paras.length)];
      const kind = rnd(4);
      if (kind === 0) {
        doc = D.applyOps(doc, [{ t: "setText", id: p.id, text: "第" + i + "次改写。" }]).doc;
      } else if (kind === 1) {
        const b = D.bodyOf(p);
        doc = D.applyOps(doc, [{ t: "splitPara", id: p.id, at: Math.max(0, Math.floor(b.length / 2)) }]).doc;
      } else if (kind === 2 && paras.length >= 2) {
        const q = paras[(paras.indexOf(p) + 1) % paras.length];
        if (q && q.id !== p.id) {
          const i1 = doc.nodes.indexOf(p), i2 = doc.nodes.indexOf(q);
          const first = i1 < i2 ? p : q, second = i1 < i2 ? q : p;
          const between = doc.nodes.slice(doc.nodes.indexOf(first) + 1, doc.nodes.indexOf(second));
          if (between.every(function (x) { return x.type === "blank"; })) {
            doc = D.applyOps(doc, [{ t: "mergePara", ids: [first.id, second.id] }]).doc;
          }
        }
      } else {
        doc = D.applyOps(doc, [{ t: "setHeading", id: p.id, cmd: rnd(2) ? "section" : null }]).doc;
      }
      steps++;
    }
  } catch (e) { broke = (e && e.message) || String(e); }
  const v = D.validate(doc);
  K.ok("5.7 随机连打 " + steps + " 个 Op 后：不抛错、平铺完好、拼接 === source",
    !broke && v.ok && D.serialize(doc) === doc.source,
    broke || v.errors.slice(0, 2).join("; "));
})();

/* 全语料：setText 每个可编辑块，逐块验证「只有它变了」 */
(function () {
  const bad = [];
  let hit = 0;
  for (let i = 0; i < corpus.length; i++) {
    const doc = D.parse(corpus[i].text);
    const editables = doc.nodes.filter(function (n) { return n.type === "paragraph" || n.type === "heading"; });
    for (let j = 0; j < editables.length; j++) {
      const n = editables[j];
      /* textOf 就是 setText 的入参口径：标题给 title（不含命令），其余给整块正文。
       * 用 bodyOf 喂标题会把 "\section{..}" 当成标题文字再套一层壳，把源码写坏 —— 这正是
       * 这条断言要拦的事。 */
      const old = D.textOf(n);
      const r = D.applyOps(doc, [{ t: "setText", id: n.id, text: old }]);
      hit++;
      if (r.tx.changed.length !== 0) { bad.push(corpus[i].name + " 同文改写应无变更（" + JSON.stringify(n.type) + "）"); break; }
      const r2 = D.applyOps(doc, [{ t: "setText", id: n.id, text: old + "X" }]);
      if (r2.tx.changed.length !== 1 || r2.tx.changed[0] !== n.id) { bad.push(corpus[i].name + " 只应改一个节点"); break; }
      const intact = untouchedAreIntact(doc, r2.doc, r2.tx.changed);
      if (intact.length) { bad.push(corpus[i].name + "：" + intact[0]); break; }
    }
  }
  K.ok("5.8 全语料 " + hit + " 次改写：每一次都只动一个节点，其余逐字节不变", bad.length === 0, bad.slice(0, 4).join("; "));
})();

K.exit();
