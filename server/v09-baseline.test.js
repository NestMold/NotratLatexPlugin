"use strict";
/* =====================================================================
 * v0.9 P0 —— 痛点基线（可重放）
 *
 * 运行： node server/v09-baseline.test.js
 *
 * 这个文件只有一个职责：**把「撤销不可预测」拆成可执行、可复现的条目**。
 *
 *   第 0 节  取证快照  —— 现状代码事实（file:line），重跑永远一致。这是「基线」。
 *   第 A 节  护稿红线  —— 现状内核已经守住的不变式。绿变红 = 回归，最急。
 *   第 B 节  痛点反例  —— 用**今天的内核**真实跑出来的反例，断言的是「期望行为」，
 *                        所以现在就是红的。每一个都对应方案 §1.3 里的一条病灶。
 *                        （v0.8.18：B1「越界还原」已随「预览层历史接入 txlog + rebase」
 *                          消灭；余下 B2/B3 等 P3 的定点 patch 与新内核 API。）
 *   第 C 节  v0.9 契约 —— P1/P2 交付物（docmodel / txlog）必须满足的不变量。
 *                        模块还不存在 → 红；模块写对了 → 自己变绿。
 *
 * 读法：本文件全绿的那一天，就是 v0.9 各期验收完成的那一天。
 * 不接进 npm run gate —— 它现在**故意**是红的，接了会把门禁一起拖红。
 * （见 package.json 的 npm run v09）
 * =================================================================== */

const fs = require("fs");
const path = require("path");
const K = require("./testkit.js");
const WYS = require("./wysiwyg.js");

const EDITOR = path.join(__dirname, "..", "panels", "editor.tsx");
const editorSrc = (function () {
  try { return fs.readFileSync(EDITOR, "utf8"); } catch (e) { return ""; }
})();
const editorLines = editorSrc.split("\n");

/* 在真实源码里找一条模式，返回行号（1 基）或 -1 */
function findLine(re) {
  for (let i = 0; i < editorLines.length; i++) if (re.test(editorLines[i])) return i + 1;
  return -1;
}
function has(re) { return findLine(re) > 0; }

/* =====================================================================
 * 第 0 节 · 取证快照
 * =================================================================== */
K.section("第 0 节 · 取证快照（现状代码事实，重跑一致）");

const FORENSICS = [
  ["三套内容之一：宿主 props.content 是唯一输入", /const content = props\.content \|\| "";/],
  ["三套内容之二：可视化档 DOM 在编辑期被声明为权威", /const wysEditing = useRef\(false\);/],
  ["历史：预览层的 TX.History —— v0.8.18 起按文件留在模块级（活过组件重挂）", /const WYS_HIST_BY_FILE = new Map\(\);/],
  ["便条一：这一拍变化是本层自己提交的", /const wysSelfEdit = useRef\(false\);/],
  ["便条二：这一拍变化来自 undo\/redo 自己", /const wysHistOp = useRef\(false\);/],
  ["已修（v0.8.18）：外部改动走 rebase，不再是「误判一次就清空历史」", /const res = h0\.rebase\(prevSrc, content\);/],
  ["病灶 1：打字要等失焦 \/ Ctrl\+S 才落盘（不在历史里）", /function commitWys\(\)/],
  ["病灶 1 的补丁：撤销前先强落一次盘", /function wysCommitPending\(\)/],
  ["病灶 3：撤销 = 整份源码还原 + DOM 全量重建", /root\.innerHTML = html;/],
  ["病灶 3 的代价：靠启发式把光标接回来", /function wysCaretRestore/],
  ["已修（v0.8.18）：重做取 History 的凭据，不再压闭包 content", /const tx = hist\.redo\(\);/],
];

for (let i = 0; i < FORENSICS.length; i++) {
  const ln = findLine(FORENSICS[i][1]);
  K.info((ln > 0 ? "L" + String(ln).padEnd(5) : "  --   ") + FORENSICS[i][0]);
}
K.info("编辑器源码 " + editorLines.length + " 行；内核 wysiwyg.js " + WYS.applyEdits("x", []).length + " 字节可测。");

/* =====================================================================
 * 第 A 节 · 护稿红线（现状必须绿，且永远绿）
 * =================================================================== */
K.section("第 A 节 · 护稿红线（现状内核已守住；绿变红=回归）");

const sample = (function () {
  try { return fs.readFileSync(path.join(__dirname, "..", "samples", "sample.tex"), "utf8"); }
  catch (e) { return ""; }
})();
const sampleLines = sample.split("\n");
const sampleDoc = sample ? WYS.parseDoc(sample) : { blocks: [], lineCount: 0 };

K.ok("A1 空编辑集逐字节还原（applyEdits(src,[]) === src）", WYS.applyEdits(sample, []) === sample);
K.ok("A2 空编辑集（null）也逐字节还原", WYS.applyEdits(sample, null) === sample);
K.ok("A3 块按行号升序", sampleDoc.blocks.every(function (b, i) {
  return i === 0 || sampleDoc.blocks[i - 1].startLine <= b.startLine;
}));
K.ok("A4 块之间不重叠", sampleDoc.blocks.every(function (b, i) {
  return i === 0 || sampleDoc.blocks[i - 1].endLine < b.startLine;
}));
K.ok("A5 块行号都在界内", sampleDoc.blocks.every(function (b) {
  return b.startLine >= 0 && b.endLine >= b.startLine && b.endLine < sampleLines.length;
}));
K.ok("A6 只改一块，别的块逐字节不动", (function () {
  const b = sampleDoc.blocks.filter(function (x) { return x.type === "paragraph"; })[0];
  if (!b) return false;
  const out = WYS.applyEdits(sample, [{ startLine: b.startLine, endLine: b.endLine, newText: "替换后的正文。" }]);
  const before = sampleLines.slice(0, b.startLine).join("\n");
  const after = sampleLines.slice(b.endLine + 1).join("\n");
  return out.startsWith(before) && out.endsWith(after);
})());

/* =====================================================================
 * 第 B 节 · 痛点反例（用今天的内核真跑出来的，红 = 靶子）
 * =================================================================== */
K.section("第 B 节 · 痛点反例（今天的内核真实跑出来，期望行为 → 红）");

/* --- B1：越界还原（病灶 5：整份快照 → 撤销连带退掉别处的改动）
 * v0.8.18 起面板不再「整份还原」：历史是 TX.History，外部改动先 rebase 重映射。
 * 这里照**新链路**跑一遍 —— 本地打字 → 外部改了别的块 → Ctrl+Z，
 * 该退的只有本地那一步，别处的改动必须原样还在。 --- */
const b1 = (function () {
  const TXL = require("./txlog.js");
  const base = "第一段。\n\n第二段。\n";
  const h = new TXL.History({ base: base });
  const afterLocal = WYS.applyEdits(base, [
    { startLine: 0, endLine: 0, newText: "第一段（我刚改的）。" },
  ]);
  h.commit({ before: base, after: afterLocal, label: "打字" });
  /* 外部（同步 / 别的窗口）改了「第二段」—— 与本地那一步不在同一块 */
  const afterExternal = WYS.applyEdits(afterLocal, [
    { startLine: 2, endLine: 2, newText: "第二段（别处改的，比如同步来的）。" },
  ]);
  h.rebase(afterLocal, afterExternal);                                /* 面板同步层：绝不整条清栈 */
  const tx = h.undo();
  const undone = tx ? tx.before : h.state();                          /* 面板：onChange(tx.before) */
  return { undone: undone, got: undone.split("\n")[2] };
})();
K.target("B1 撤销一步，不该连带抹掉「别处的改动」", b1.got === "第二段（别处改的，比如同步来的）。",
  "撤销后第二段变成 " + JSON.stringify(b1.got) + "（外部改动被整份快照覆盖掉了）");

/* --- B2：内核不产出「事务凭据」（对应病灶 1/3：撤销只能靠整份快照，无法只退这一步） --- */
const b2 = WYS.applyEdits("甲。\n\n乙。\n", [{ startLine: 0, endLine: 0, newText: "甲（改）。" }]);
K.target("B2 编辑应返回事务凭据（改了哪些块的集合），而不是裸字符串",
  b2 && typeof b2 === "object" && Array.isArray(b2.changed),
  "实际返回 " + (typeof b2) + "（" + JSON.stringify(String(b2).slice(0, 40)) + "）→ 调用方只能自己存整份字符串");

/* --- B3：行号是唯一定位手段 → 别处插入一行，后续所有行号失效 --- */
const b3 = (function () {
  const s0 = "甲。\n\n乙。\n\n丙。\n";
  const staleLine = 4;                                                /* 大纲/仪表栏记下：丙在第 4 行（0 基） */
  const s1 = WYS.applyEdits(s0, [{ startLine: 1, endLine: 1, newText: "\n新插入的一段。" }]);
  const s2 = WYS.applyEdits(s1, [{ startLine: staleLine, endLine: staleLine, newText: "丙（改过了）。" }]);
  const ls = s2.split("\n");
  return { out: s2, got: ls[5], also: ls[4] };
})();
K.target("B3 别处插入一段后，用「记住的行号」仍应改到原来那块",
  b3.got === "丙（改过了）。",
  "期望第 5 行是「丙（改过了）。」，实际是 " + JSON.stringify(b3.got) +
  "；而第 4 行被改写成了 " + JSON.stringify(b3.also) + " —— 改错了地方，多出幽灵文本");

/* =====================================================================
 * 第 C 节 · v0.9 契约（P1/P2 交付物；模块不在 → 红）
 * =================================================================== */
K.section("第 C 节 · v0.9 契约（P1 docmodel / P2 txlog 交付物）");

function tryRequire(rel) {
  try { return { mod: require(rel), err: null }; }
  catch (e) { return { mod: null, err: (e && e.message) || String(e) }; }
}
const DOC = tryRequire("./docmodel.js");
const TX = tryRequire("./txlog.js");

/* ---- C1：模块面 ---- */
K.target("C1a server/docmodel.js 存在并导出 parse/serialize/applyOps/reproject/nodeAtLine",
  !!DOC.mod && ["parse", "serialize", "applyOps", "reproject", "nodeAtLine"].every(function (k) {
    return typeof DOC.mod[k] === "function";
  }),
  DOC.err ? "require 失败：" + DOC.err : "导出不全");

K.target("C1b server/txlog.js 存在并导出 History（commit/coalesce/undo/redo/rebase/gaps）",
  !!TX.mod && typeof TX.mod.History === "function" && (function () {
    try {
      const h = new TX.mod.History();
      return ["commit", "coalesce", "undo", "redo", "rebase"].every(function (k) { return typeof h[k] === "function"; })
        && typeof h.gaps === "number";
    } catch (e) { return false; }
  })(),
  TX.err ? "require 失败：" + TX.err : "History 面不全");

/* ---- C2：无损红线（语料） ---- */
const C2 = (function () {
  if (!DOC.mod || typeof DOC.mod.parse !== "function") return { ok: false, why: "docmodel 未实现" };
  const corpus = K.loadCorpus();
  if (!corpus.length) return { ok: false, why: "语料为空" };
  const bad = [];
  for (let i = 0; i < corpus.length; i++) {
    const c = corpus[i];
    try {
      const back = DOC.mod.serialize(DOC.mod.parse(c.text));
      if (back !== c.text) {
        const d = K.firstDiff(c.text, back);
        bad.push(c.name + (d ? " @偏移" + d.at + "（源码第 " + d.line + " 行）" : ""));
      }
    } catch (e) {
      bad.push(c.name + " 抛错：" + ((e && e.message) || e));
    }
  }
  return { ok: bad.length === 0, why: bad.length + "/" + corpus.length + " 份语料不无损", bad: bad.slice(0, 6), n: corpus.length };
})();
K.target("C2 serialize(parse(src)) === src（全部语料，字节级）", C2.ok, C2.why + (C2.bad ? " → " + C2.bad.join("; ") : ""));

/* ---- C3：Op 隔离（只碰自己的 span） ---- */
const C3 = (function () {
  if (!DOC.mod || typeof DOC.mod.applyOps !== "function") return { ok: false, why: "docmodel 未实现" };
  const src = "\\section{标题}\n\n正文段落。\n\n\\begin{equation}\nx=1\n\\end{equation}\n";
  const doc = DOC.mod.parse(src);
  const target = doc.nodes.filter(function (n) { return n.type === "paragraph"; })[0];
  if (!target) return { ok: false, why: "语料里找不到正文块" };
  const r = DOC.mod.applyOps(doc, [{ t: "setText", id: target.id, text: "换过的正文。" }]);
  if (!r || !r.doc) return { ok: false, why: "applyOps 没返回 {doc, tx}" };
  const untouched = doc.nodes.filter(function (n) { return n.id !== target.id; });
  const bad = untouched.filter(function (n) {
    const after = r.doc.nodes.filter(function (m) { return m.id === n.id; })[0];
    return !after || after.raw !== n.raw;
  });
  return {
    ok: bad.length === 0 && r.tx && Array.isArray(r.tx.changed) && r.tx.changed.length === 1,
    why: bad.length ? bad.length + " 个未触碰节点的字节被改了" : "tx.changed 不是「只有一个 id」",
  };
})();
K.target("C3 每个 Op 只触碰自己的 span；未触碰节点逐字节不变", C3.ok, C3.why);

/* ---- C4：行号契约（大纲 / 宿主跳转） ---- */
const C4 = (function () {
  if (!DOC.mod || typeof DOC.mod.parse !== "function") return { ok: false, why: "docmodel 未实现" };
  const doc = DOC.mod.parse(sample);
  if (!sample) return { ok: false, why: "样例缺失" };
  const wys = WYS.parseDoc(sample);
  const bad = [];
  for (let i = 0; i < wys.blocks.length; i++) {
    const w = wys.blocks[i];
    const m = doc.nodes.filter(function (n) { return n.lineFrom === w.startLine && n.lineTo === w.endLine; })[0];
    if (!m) bad.push("L" + (w.startLine + 1) + "-" + (w.endLine + 1));
  }
  return { ok: bad.length === 0, why: bad.length + " 个块的行区间对不上 wysiwyg（大纲契约会断）：" + bad.slice(0, 5).join(",") };
})();
K.target("C4 每个节点的 lineFrom/lineTo 与 wysiwyg 契约逐块一致", C4.ok, C4.why);

/* ---- C5：reproject 保住未变节点的 id ---- */
const C5 = (function () {
  if (!DOC.mod || typeof DOC.mod.reproject !== "function") return { ok: false, why: "docmodel 未实现" };
  const before = DOC.mod.parse("\\section{甲}\n\n正文一。\n\n正文二。\n");
  const after = DOC.mod.reproject(before, "\\section{甲}\n\n正文一。\n\n正文二。\n\n新增的一段。\n");
  const idsBefore = before.nodes.map(function (n) { return n.id; });
  const survived = after.nodes.filter(function (n) { return idsBefore.indexOf(n.id) >= 0; });
  return { ok: survived.length >= before.nodes.length, why: "只有 " + survived.length + "/" + before.nodes.length + " 个节点保住了 id" };
})();
K.target("C5 reproject 后，没动过的节点必须保住原 id（否则历史对不上）", C5.ok, C5.why);

/* ---- C6：undo ∘ do = id ---- */
const C6 = (function () {
  if (!TX.mod || typeof TX.mod.History !== "function" || !DOC.mod) return { ok: false, why: "docmodel/txlog 未实现" };
  try {
    const SRC = sample || "\\section{甲}\n\n正文一。\n\n正文二。\n";
    const h = new TX.mod.History({ base: SRC });
    let doc = DOC.mod.parse(SRC);
    const start = doc.source;
    /* 种子化：同一条序列每次重跑都一样，红了能复现 */
    let sd = 7;
    const rnd = function () { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; };

    let n = 0;
    for (let i = 0; i < 14; i++) {
      const hs = doc.nodes.filter(function (x) { return x.type === "heading"; });
      const ps = doc.nodes.filter(function (x) { return x.type === "paragraph"; });
      const useH = rnd() < 0.3 && hs.length;
      const pool = useH ? hs : ps;
      if (!pool.length) break;
      const node = pool[Math.floor(rnd() * pool.length)];
      const op = useH
        ? { t: "setHeading", id: node.id, cmd: [["section", "subsection", null][Math.floor(rnd() * 3)]][0] }
        : { t: "setText", id: node.id, text: "改 " + i + " 号文字。" };
      let r;
      try { r = DOC.mod.applyOps(doc, [op]); } catch (e) { continue; }
      if (r.tx.before === r.tx.after) continue;
      h.commit(r.tx);
      doc = r.doc;
      n++;
    }
    if (!n) return { ok: false, why: "没造出任何本地操作" };
    const end = doc.source;

    /* 撤到底。每一步都查「返回的 after == 撤销前的内容」—— 这才是「撤到该去的地方」 */
    let k = 0;
    while (h.canUndo()) {
      const before = doc.source;
      const tx = h.undo();
      if (!tx) { return { ok: false, why: "第 " + (k + 1) + " 步 undo() 返回 null 却 canUndo()" }; }
      if (tx.after !== before) {
        return { ok: false, why: "第 " + (k + 1) + " 步撤销的 after 与撤销前内容不符（会撤到别处）" };
      }
      doc = DOC.mod.reproject(doc, tx.before);
      k++;
      if (k > 999) return { ok: false, why: "撤不完" };
    }
    if (doc.source !== start) return { ok: false, why: "撤到底没有逐字节回到起点（撤了 " + k + " 步）" };
    if (k !== n) return { ok: false, why: "撤销步数 " + k + " ≠ 提交条数 " + n };

    /* 重做到底必须逐字节回到终点 */
    let m = 0;
    while (h.canRedo()) { const tx = h.redo(); if (!tx) break; doc = DOC.mod.reproject(doc, tx.after); m++; if (m > 999) break; }
    if (doc.source !== end) return { ok: false, why: "重做到底没有逐字节回到终点" };
    return { ok: true, why: n + " 次本地操作（撤销重做各 " + k + " 步），起终点字节级一致" };
  } catch (e) { return { ok: false, why: "抛错：" + ((e && e.message) || e) }; }
})();
K.target("C6 undo ∘ do = id（任意本地操作序列，撤销回起点字节级相等）", C6.ok, C6.why);

/* ---- C7：打字必有可撤销事务 ---- */
const C7 = (function () {
  if (!TX.mod || typeof TX.mod.History !== "function") return { ok: false, why: "txlog 未实现" };
  try {
    const h = new TX.mod.History({ base: "正文。", windowMs: 400 });

    /* ① 第一次按键就必须已经是一条真事务（不是「攒着」，也不是「等 400ms 再说」） */
    const t1 = h.coalesce({ label: "打字", before: "正文。", after: "正文。好", changed: ["p1"], coalesceKey: "typing:p1", at: 1000 });
    if (!t1) return { ok: false, why: "第一次按键没有落成事务" };
    if (!h.canUndo()) return { ok: false, why: "第一次按键之后 canUndo() 仍为 false（Ctrl+Z 会说没得撤）" };

    /* ② 窗口内连打并成一条，且起点不许动 */
    h.coalesce({ label: "打字", before: "正文。好", after: "正文。好，", changed: ["p1"], coalesceKey: "typing:p1", at: 1050 });
    h.coalesce({ label: "打字", before: "正文。好，", after: "正文。好，真的。", changed: ["p1"], coalesceKey: "typing:p1", at: 1100 });
    if (h.length !== 1) return { ok: false, why: "窗口内连打没有并成一条（栈里 " + h.length + " 条）" };
    if (h.top().before !== "正文。") return { ok: false, why: "合并后起点被动了" };

    /* ③ 一次 Ctrl+Z 撤掉整串打字，回到起点 */
    const u = h.undo();
    if (!u || h.state() !== "正文。" || h.canUndo()) return { ok: false, why: "一次 Ctrl+Z 没有把整串打字撤掉" };

    /* ④ 换块必须开新事务（绝不许把两个块并成一条） */
    const h2 = new TX.mod.History({ base: "s", windowMs: 400 });
    h2.coalesce({ label: "打字", before: "s", after: "s1", changed: ["a"], coalesceKey: "typing:a", at: 0 });
    h2.coalesce({ label: "打字", before: "s1", after: "s2", changed: ["b"], coalesceKey: "typing:b", at: 10 });
    if (h2.length !== 2) return { ok: false, why: "换到另一块却并成了一条" };

    return { ok: true, why: "第一次按键即成事务；窗口内合并 / 换块分开；一次撤销回起点" };
  } catch (e) { return { ok: false, why: "抛错：" + ((e && e.message) || e) }; }
})();
K.target("C7 打字后立刻 Ctrl+Z，必有东西可撤（coalesce：第一次按键就开事务）", C7.ok, C7.why);

K.exit();
