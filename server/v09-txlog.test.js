"use strict";
/* =====================================================================
 * v0.9 P2 验收 —— server/txlog.js（事务历史）
 *
 * 运行： node server/v09-txlog.test.js
 *        node server/v09-txlog.test.js --iters 500      # 加量
 *        SEED=1234 node server/v09-txlog.test.js        # 复现某一次失败
 *
 * 这一层要消灭三只靶子（见 docs/v0.9-docmodel-plan.md §9.1）：
 *   C1b  历史必须是一个**有名字、有 API、可被测试**的对象（不是组件里那个 ref）
 *   C6   undo ∘ do = id —— 撤销必须**逐字节**回到起点，不多撤一步，不少撤一步
 *   C7   打字后立刻 Ctrl+Z，必有东西可撤（coalesce：第一次按键就落事务）
 *
 * 最重的一件是最后那段「随机交错 200 次」：本地编辑 / 撤销 / 重做 / 外部改动
 * （rebase）四种动作按种子随机交织，每一步都验一遍不变量。
 * 种子写进输出 —— 红了就照抄种子重跑，同一个序列一定能重现。
 *
 * 不碰 UI，不依赖编辑器 —— 纯模块，纯数据。
 * =================================================================== */

const K = require("./testkit.js");
const D = require("./docmodel.js");
const TX = require("./txlog.js");

const ARGV = process.argv.slice(2);
function argOf(name, def) {
  const i = ARGV.indexOf("--" + name);
  if (i >= 0 && ARGV[i + 1] != null) return parseInt(ARGV[i + 1], 10);
  return def;
}
const ITERS = argOf("iters", 200);
const STEPS = argOf("steps", 40);
const BASE_SEED = parseInt(process.env.SEED || "20260923", 10);

/* 确定性 PRNG（mulberry32）—— 同一个种子必然同一个序列 */
function mulberry32(a) {
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }

const TEXTY = { paragraph: 1, heading: 1, comment: 1, blank: 1 };
const HEADS = ["section", "subsection", "subsubsection", "chapter"];

/* 「外部专用块」：本地随机操作一律不碰它，外部改动只打它。
 * 这样「外部改动落在别的块上」是构造出来的事实 —— rebase 必须一条都不丢。 */
const MARK = "外部专用块";
function isCanary(n) { return String(n && n.raw).indexOf(MARK) >= 0; }

/* 可编辑的节点（含空行）—— 但要把专用块**及其紧邻**都摘掉。
 * 为什么连紧邻也要护：空行被 setText 掉、或被删掉，专用块就会和隔壁段落成为
 * 连续非空行，被 wysiwyg 的段落聚合并成同一个多行节点，「本地不碰它」当场作废，
 * 于是 external 的一次 setText 会重写整块（跨到本地改过的行上）→ 假冲突。
 * 返回 doc.nodes 的下标数组。 */
function editableIdx(doc) {
  const ns = doc.nodes;
  const prot = {};
  for (let k = 0; k < ns.length; k++) if (isCanary(ns[k])) { prot[k - 1] = 1; prot[k] = 1; prot[k + 1] = 1; }
  const out = [];
  for (let k = 0; k < ns.length; k++) if (TEXTY[ns[k].type] && !prot[k]) out.push(k);
  return out;
}
function canaryIdx(ns) {
  for (let k = 0; k < ns.length; k++) if (isCanary(ns[k])) return k;
  return -1;
}

const ok = K.ok;   /* 用 testkit 的判定 —— 汇总才能把这几百项算进去 */
function vis(s, max) {
  let t = String(s == null ? "" : s);
  const cut = max && t.length > max;
  if (cut) t = t.slice(0, max);
  return JSON.stringify(t.replace(/\r/g, "\\r").replace(/\n/g, "\\n¶")) + (cut ? "…" : "");
}

/* ---------------------------------------------------------------------
 * 第 1 段：merge3（三方合并）—— rebase 的算力核心
 * ------------------------------------------------------------------- */
K.section("merge3：三方文本合并（rebase 的核心）");
{
  const m = TX.merge3;
  ok("两边没动 → 原样", m("a\nb\nc", "a\nb\nc", "a\nb\nc").text === "a\nb\nc");
  ok("只我们动 → 取我们", m("a\nb\nc", "a\nB\nc", "a\nb\nc").text === "a\nB\nc");
  ok("只他们动 → 取他们", m("a\nb\nc", "a\nb\nc", "a\nX\nc").text === "a\nX\nc");
  ok("两边改得一样 → 不算冲突", m("a\nb\nc", "a\nB\nc", "a\nB\nc").text === "a\nB\nc");

  const r1 = m("a\nb\nc\nd", "a\nB\nc\nd", "a\nb\nc\nD");
  ok("相隔的两处改动 → 两边都要（外部改别处是常态）", r1.ok && r1.text === "a\nB\nc\nD", JSON.stringify(r1));

  const r2 = m("a\nb\nc", "a\nB\nc", "a\nb\nc\nd");
  ok("我们改中间 + 他们追加末尾 → 两边都要", r2.ok && r2.text === "a\nB\nc\nd", JSON.stringify(r2));

  const r3 = m("a\nb\nc", "a\nB\nc", "a\nX\nc");
  ok("同一处改得不同 → 冲突，不自动取舍", !r3.ok && r3.conflict === true, r3.why);

  const r4 = m("a\nb\nc", "a\nB\nc", "A\nb\nc");
  ok("相邻两行各改各的 → 不冲突（相邻 ≠ 重叠）", r4.ok && r4.text === "A\nB\nc", JSON.stringify(r4));

  ok("他们在开头插一行", m("a\nb", "a\nb", "new\na\nb").text === "new\na\nb");
  ok("我们末尾追加 + 他们改首行 → 两边都要", (function () {
    const r = m("a\nb", "a\nb\nmine", "A\nb");
    return r.ok && r.text === "A\nb\nmine";
  })());
  ok("同位置插入相同内容 → 不冲突", m("a\nb", "a\nx\nb", "a\nx\nb").text === "a\nx\nb");
  ok("同位置插入不同内容 → 冲突", !m("a\nb", "a\nx\nb", "a\ny\nb").ok);
  ok("空串入参不崩", typeof m("", "x", "y").ok === "boolean");
  ok("CRLF 逐字节保留（\\r 留在行内容里）", (function () {
    const r = m("a\r\nb\r\n", "a\r\nB\r\n", "a\r\nb\r\n");
    return r.ok && r.text === "a\r\nB\r\n";
  })());
  ok("大文档：头尾相同、中间两处改动都保住", (function () {
    const H = [], T = [];
    for (let i = 0; i < 50; i++) { H.push("h" + i); T.push("t" + i); }
    const head = H.join("\n"), tail = T.join("\n");
    const base = head + "\nmid1\nmid2\nmid3\n" + tail;
    const r = m(base, head + "\nMID1\nmid2\nmid3\n" + tail, head + "\nmid1\nmid2\nMID3\n" + tail);
    return r.ok && r.text === head + "\nMID1\nmid2\nMID3\n" + tail;
  })());
  /* 回归：随机交错抓到的假冲突 —— 一边在某行【前面】插入，另一边改【那一行】。
     两者互不干涉（git 也不冲突）；旧算法按「起点相同」并成一块，误报冲突 →
     丢事务 → 链断 → 整条历史被清空（正是要消灭的「一改就清栈」）。
     现场快照：base="...甲章标题..."，ours 在它前面插了两行，theirs 把那一行改了。 */
  ok("在行前插入 + 他们改那一行 → 不冲突（回归：假冲突）", (function () {
    const base = "A\nH\nC\n";
    const ours = "A\nINS\n\nH\nC\n";
    const theirs = "A\nH2\nC\n";
    const r = m(base, ours, theirs);
    return r.ok && r.text === "A\nINS\n\nH2\nC\n";
  })(), JSON.stringify(m("A\nH\nC\n", "A\nINS\n\nH\nC\n", "A\nH2\nC\n")));

  ok("插入点落在被替换区间【内部】→ 仍然冲突（顺序不明，保守）", (function () {
    const base = "a\nb\nc\nd\n";
    const ours = "a\nB\nC\nd\n";              /* 换掉 b、c 两行 */
    const theirs = "a\nb\nINS\nc\nd\n";      /* 插在 b 与 c 之间（区间内部） */
    return !m(base, ours, theirs).ok;
  })());

  ok("插入点落在被替换区间的【尾边界】→ 不冲突", (function () {
    const base = "a\nb\nc\nd\n";
    const ours = "a\nB\nC\nd\n";              /* 换掉 b、c 两行 */
    const theirs = "a\nb\nc\nINS\nd\n";      /* 插在 c 之后 = 区间尾边界 */
    const r = m(base, ours, theirs);
    return r.ok && r.text === "a\nB\nC\nINS\nd\n";
  })(), JSON.stringify(m("a\nb\nc\nd\n", "a\nB\nC\nd\n", "a\nb\nc\nINS\nd\n")));

  ok("merge3 是纯函数（同入参同结果，链才能保持）", (function () {
    const a = m("x\ny\nz", "x\nY\nz", "x\ny\nZ"), b = m("x\ny\nz", "x\nY\nz", "x\ny\nZ");
    return a.ok === b.ok && a.text === b.text;
  })());
}

/* ---------------------------------------------------------------------
 * 第 2 段：C1b —— History 的模块面（历史必须是个有名字的东西）
 * ------------------------------------------------------------------- */
K.section("C1b：History 的 API 面");
{
  ok("typeof TX.History === 'function'", typeof TX.History === "function");
  const h = new TX.History();
  ok("构造函数可零参调用（老代码 new History() 不会炸）", !!h);
  const want = ["commit", "coalesce", "undo", "redo", "rebase"];
  ok("五个方法齐全：" + want.join(" / "), want.every(function (k) { return typeof h[k] === "function"; }));
  ok("gaps 是 number（不是 undefined）", typeof h.gaps === "number");
  ok("只读视图：canUndo/canRedo/depth/future/state 都是函数", ["canUndo", "canRedo", "state", "stats", "checkChain"].every(function (k) { return typeof h[k] === "function"; }));
  ok("空历史：undo()/redo() 都返回 null（不是抛错）", h.undo() === null && h.redo() === null);
  ok("空历史 state() === base", h.state() === "");
  const h2 = new TX.History({ base: "abc" });
  ok("可指定 base", h2.state() === "abc");
}

/* ---------------------------------------------------------------------
 * 第 3 段：commit / undo / redo 的基本语义
 * ------------------------------------------------------------------- */
K.section("commit / undo / redo 的基本语义");
{
  const h = new TX.History({ base: "A" });
  const t1 = h.commit({ label: "第一步", before: "A", after: "AB", changed: ["n1"] });
  const t2 = h.commit({ label: "第二步", before: "AB", after: "ABC", changed: ["n2"] });
  ok("commit 返回补全后的 tx（带 id / at）", !!t1 && !!t1.id && typeof t1.at === "number");
  ok("两条入栈，depth = 2", h.length === 2 && h.depth === 2);
  ok("state() = 最后一条的 after", h.state() === "ABC");
  ok("链自检通过", h.checkChain().ok, h.checkChain().errors.join("；"));

  const u1 = h.undo();
  ok("undo 返回第二步（要撤的就是它）", u1 && u1.id === t2.id);
  ok("undo 后 state() = 第二步的 before（调用方照抄即可）", h.state() === "AB");
  const u2 = h.undo();
  ok("再 undo 回第一步之前", u2 && u2.id === t1.id && h.state() === "A");
  ok("撤到底：undo() 返回 null，canUndo() false", h.undo() === null && !h.canUndo());
  ok("撤到底 state() === base", h.state() === "A");

  const r1 = h.redo();
  ok("redo 返回第一步", r1 && r1.id === t1.id && h.state() === "AB");
  h.redo();
  ok("redo 到底 state() = 终态", h.state() === "ABC" && !h.canRedo());
  ok("redo 到底后 redo() 返回 null", h.redo() === null);

  h.undo();
  const t3 = h.commit({ label: "新分支", before: "AB", after: "ABZ", changed: ["n3"] });
  ok("新事务清掉 redo（标准语义）", !!t3 && h.future === 0 && h.length === 2);
  ok("清了 redo 也不算 gap（这是标准语义，不是丢历史）", h.gaps === 0);

  const hEmpty = new TX.History({ base: "S" });
  ok("空转事务不入栈（否则 Ctrl+Z 像没反应）", hEmpty.commit({ before: "S", after: "S" }) === null && hEmpty.length === 0);

  /* limit：超上限从栈底丢，base 跟着前移（state() 仍然正确） */
  const hl = new TX.History({ base: "0", limit: 3 });
  for (let i = 1; i <= 5; i++) hl.commit({ label: "s" + i, before: String(i - 1), after: String(i) });
  ok("limit 生效：栈只留 3 条", hl.length === 3);
  ok("从栈底丢之后 base 前移，state() 仍等于当前内容", hl.state() === "5");
  ok("丢栈底之后链仍自洽", hl.checkChain().ok, hl.checkChain().errors.join("；"));
}

/* ---------------------------------------------------------------------
 * 第 4 段：C7 —— 打字必有可撤（coalesce）
 * ------------------------------------------------------------------- */
K.section("C7：打字后立刻 Ctrl+Z，必有东西可撤");
{
  const h = new TX.History({ base: "正文。" , windowMs: 400 });
  let clock = 1000;
  /* 模拟连打 5 个键，每键间隔 50ms（都在窗口内） */
  const keys = ["正", "正文", "正文一", "正文一。", "正文一。好"];
  let firstTx = null;
  for (let i = 0; i < keys.length; i++) {
    clock += 50;
    const t = h.coalesce({ label: "打字", before: i === 0 ? "正文。" : keys[i - 1], after: keys[i], changed: ["p1"], coalesceKey: "typing:p1", at: clock });
    if (i === 0) firstTx = t;
  }
  ok("第一次按键就落了一条真事务（不是攒着）", !!firstTx && h.length === 1);
  ok("第一次按键之后 canUndo() 立刻为真", h.canUndo() === true);
  ok("窗口内连打 5 个键 → 并成同一条事务", h.length === 1 && h.coalesces === 4);
  ok("合并后 after = 最后一次输入", h.state() === "正文一。好");
  ok("合并后 before 仍是起点（起点不许动）", h.top().before === "正文。");
  const u = h.undo();
  ok("一次 Ctrl+Z 撤掉整串打字，回到起点", u && h.state() === "正文。" && !h.canUndo());

  /* 窗口过期 / 换块：各自用干净的 History 验 —— 上面 undo 过，游标不在末尾，
     继续用同一个 h 量「栈里有几条」会量到 undo 之后的实际条数，不是窗口语义。 */
  const hw = new TX.History({ base: "s0", windowMs: 400 });
  hw.coalesce({ label: "打字", before: "s0", after: "s1", changed: ["p1"], coalesceKey: "typing:p1", at: 1000 });
  hw.coalesce({ label: "打字", before: "s1", after: "s2", changed: ["p1"], coalesceKey: "typing:p1", at: 1300 });
  ok("窗口内（+300ms，同键同块）→ 并成一条", hw.length === 1);
  hw.coalesce({ label: "打字", before: "s2", after: "s3", changed: ["p1"], coalesceKey: "typing:p1", at: 1800 });
  ok("超过 400ms 窗口 → 另起一条", hw.length === 2 && hw.top().before === "s2");

  const hb = new TX.History({ base: "t0", windowMs: 400 });
  hb.coalesce({ label: "打字", before: "t0", after: "t1", changed: ["p1"], coalesceKey: "typing:p1", at: 1000 });
  hb.coalesce({ label: "打字", before: "t1", after: "t2", changed: ["p9"], coalesceKey: "typing:p9", at: 1010 });
  ok("换到另一块（+10ms，键不同）→ 另起一条", hb.length === 2 && hb.top().before === "t1");

  /* 不同 label / 无 key：靠「改的是同一个节点」判定 */
  const h2 = new TX.History({ base: "s", windowMs: 1000 });
  h2.coalesce({ label: "打字", before: "s", after: "s1", changed: ["a"], at: 0 });
  h2.coalesce({ label: "打字", before: "s1", after: "s12", changed: ["a"], at: 10 });
  ok("无 key 但改同一个节点 + 同 label → 并", h2.length === 1);
  h2.coalesce({ label: "打字", before: "s12", after: "s123", changed: ["b"], at: 20 });
  ok("无 key 且换了节点 → 不并", h2.length === 2);

  /* 打字之后立刻撤销，是「一定拿得到东西」而不是「碰运气」 */
  const h3 = new TX.History({ base: "x", windowMs: 400 });
  const rng7 = mulberry32(4242);                      /* 种子化：可复现，不用 Math.random */
  let c3 = 0, miss = 0;
  for (let i = 0; i < 40; i++) {
    c3 += Math.floor(rng7() * 900);                   /* 故意跨窗口 */
    h3.coalesce({ label: "打字", before: i === 0 ? "x" : "t" + (i - 1), after: "t" + i, changed: ["k"], coalesceKey: "typing:k", at: c3 });
    if (!h3.canUndo()) miss++;
  }
  ok("随机时间间隔下打字 40 次，每次之后都可撤（0 次落空）", miss === 0, "落空 " + miss + " 次");
}

/* ---------------------------------------------------------------------
 * 第 5 段：rebase —— 绝不清栈 / 冲突即丢 / 链不许断
 * ------------------------------------------------------------------- */
K.section("rebase：外部改动进来时，历史不清空");
{
  const SRC = "\\section{甲}\n\n甲的第一段。\n\n甲的第三段。\n\n\\section{乙}\n\n乙的一段。\n\n\\end{document}\n";
  const doc = D.parse(SRC);
  const byText = function (t) { return doc.nodes.filter(function (n) { return n.text === t || n.raw.replace(/\n$/, "") === t; })[0]; };

  /* (a) 外部改「别的块」→ 历史完整保留 */
  const h = new TX.History({ base: SRC });
  const paras = doc.nodes.filter(function (n) { return n.type === "paragraph"; });
  const p1 = paras[0];
  const pLast = paras[paras.length - 1];
  /* 第二条必须建在第一条的结果上 —— 否则 before/after 本身就接不上，
     rebase 会（正确地）把断链那一段砍掉，那是「测试造错了前提」，不是模块的毛病 */
  const r1 = D.applyOps(doc, [{ t: "setText", id: p1.id, text: "甲的第一段（本地改过）。" }]);
  h.commit(r1.tx);
  const r2 = D.applyOps(r1.doc, [{ t: "setText", id: p1.id, text: "甲的第一段（本地改过两次）。" }]);
  h.commit(r2.tx);
  const depthBefore = h.length;
  ok("(a) 前置：两条本地改动入栈且链自洽", depthBefore === 2 && h.checkChain().ok, h.checkChain().errors.join("；"));

  /* 外部把「乙的一段」改了（跟本地改的块隔着好几块）—— 以当前内容为基准，
     reproject 保住没动过的节点 id，pLast.id 才还能用 */
  const cur = D.reproject(r2.doc, h.state());
  const ext = D.applyOps(cur, [{ t: "setText", id: pLast.id, text: "乙的一段（外部改的）。" }]);
  const res = h.rebase(h.state(), ext.doc.source);

  ok("外部改别的块 → kept === 原有条数（绝不清栈）", res.kept === depthBefore && res.dropped === 0, JSON.stringify(res.stats || res));
  ok("外部改别的块 → gaps 不变（没有静默丢历史）", h.gaps === 0);
  ok("rebase 后的 source 同时含本地改动与外部改动",
    res.source.indexOf("本地改过两次") >= 0 && res.source.indexOf("外部改的") >= 0, vis(res.source, 120));
  ok("rebase 后 state() === 返回的 source（历史与内容对齐）", h.state() === res.source);
  ok("rebase 后链仍自洽", h.checkChain().ok, h.checkChain().errors.join("；"));
  ok("rebase 后仍能一路撤到新的 base（步数 = 2）", (function () {
    const s = h.state();
    const t1 = h.undo(), t2 = h.undo();
    return !!t1 && !!t2 && h.state() === h.base && h.undo() === null;
  })());
  ok("rebase 后 base 也带上了外部改动", h.base.indexOf("外部改的") >= 0, vis(h.base, 100));

  /* (b) 外部改「同一块同一处」→ 冲突即丢一条，gaps++，链不断 */
  const h2 = new TX.History({ base: SRC });
  const a = D.applyOps(doc, [{ t: "setText", id: p1.id, text: "本地版本 A。" }]);
  h2.commit(a.tx);
  const b = D.applyOps(a.doc, [{ t: "setText", id: p1.id, text: "本地版本 B。" }]);
  h2.commit(b.tx);
  const ext2 = D.applyOps(doc, [{ t: "setText", id: p1.id, text: "外部版本 X。" }]);
  const res2 = h2.rebase(SRC, ext2.doc.source);
  ok("同一处冲突 → 有步骤被丢（dropped > 0）", res2.dropped > 0, JSON.stringify({ dropped: res2.dropped, kept: res2.kept }));
  ok("丢弃计入 gaps（诚实告知，不静默）", h2.gaps === res2.dropped && h2.gaps > 0);
  ok("describeGaps() 给人话", h2.describeGaps().indexOf("无法撤销") >= 0, h2.describeGaps());
  ok("冲突之后链**仍然自洽**（宁可少撤，不可撤错）", h2.checkChain().ok, h2.checkChain().errors.join("；"));
  ok("冲突之后 state() === 返回的 source", h2.state() === res2.source);
  ok("冲突之后 base 仍是能对上的内容", typeof h2.base === "string" && h2.base.length > 0);

  /* (c) 外部「没改」→ 一切不动 */
  const h3 = new TX.History({ base: SRC });
  h3.commit(D.applyOps(doc, [{ t: "setText", id: p1.id, text: "只本地改。" }]).tx);
  const before3 = h3.state(), n3 = h3.length;
  const res3 = h3.rebase(SRC, SRC);
  ok("extBefore === extAfter → 栈与内容都不动", h3.length === n3 && h3.state() === before3 && res3.kept === n3);

  /* (e) rebase 不许悄悄改掉眼前这份文件 ——
   *     外部改了「本地也改过的那一块」时，那一步历史保不住（计入 gaps），
   *     但文件内容必须仍是「本地改动 + 外部改动」。旧策略会退回历史地板（把用户编辑悄悄抹了）。 */
  const h5 = new TX.History({ base: SRC });
  const e1 = D.applyOps(doc, [{ t: "setText", id: p1.id, text: "本地改甲。" }]);
  h5.commit(e1.tx);
  const e2 = D.applyOps(e1.doc, [{ t: "setText", id: pLast.id, text: "本地改乙。" }]);
  h5.commit(e2.tx);
  const floor5 = h5.base;
  const live5 = D.reproject(e2.doc, h5.state());
  const ext5 = D.applyOps(live5, [{ t: "setText", id: p1.id, text: "外部改甲。" }]);
  const res5 = h5.rebase(h5.state(), ext5.doc.source);

  ok("(e) 外部撞上本地改过的块 → 历史有损（dropped=1）但如实计入 gaps",
    res5.dropped === 1 && h5.gaps === 1 && res5.kept === 1,
    JSON.stringify({ dropped: res5.dropped, kept: res5.kept, gaps: h5.gaps }));
  ok("(e) 眼前这份文件仍是「当前内容 + 外部改动」（没退回历史地板）", (function () {
    const s = res5.source;
    return s.indexOf("外部改甲") >= 0 &&        /* 外部这次覆写的 p1：在 */
           s.indexOf("本地改乙") >= 0 &&        /* 本地在**另一块**上的改动：还在（退回地板就没了）*/
           s.indexOf("甲的第三段") >= 0 &&      /* 没动过的块：原样 */
           s !== floor5;                        /* 明确不是历史地板 */
  })(), vis(res5.source, 180));
  ok("(e) 能撤的那一步照样能撤，撤不了的一步不装样子", (function () {
    const u = h5.undo();
    return !!u &&
           h5.state().indexOf("本地改乙") < 0 &&     /* 这一步撤掉了 */
           h5.state().indexOf("乙的一段") >= 0 &&    /* 回到那一块的原样 */
           h5.state().indexOf("外部改甲") >= 0 &&    /* 外部改动不因撤销而丢 */
           h5.undo() === null && !h5.canUndo();      /* 撤不动了就明说没有 */
  })(), vis(h5.state(), 160));
  ok("(e) 链自检通过", h5.checkChain().ok, h5.checkChain().errors.join("；"));

  /* (d) rebase 之后还能继续编辑并撤销 */
  const h4 = new TX.History({ base: SRC });
  const c1 = D.applyOps(doc, [{ t: "setText", id: p1.id, text: "本地一。" }]);
  h4.commit(c1.tx);
  /* 外部改动必须以「本地改完的内容」为基准另造一份 —— 不能用 (a) 那份
     （它的 extBefore 带着两条本地改动，跟这里的一步对不上，属于测试造错前提） */
  const cur4 = D.reproject(c1.doc, h4.state());
  const ext4 = D.applyOps(cur4, [{ t: "setText", id: pLast.id, text: "外部又改。" }]);
  const res4 = h4.rebase(h4.state(), ext4.doc.source);
  ok("(d) 前置：外部改别的块 → 本地那一步被保留", res4.kept === 1 && h4.gaps === 0,
    JSON.stringify({ kept: res4.kept, dropped: res4.dropped }));
  const afterRebase = h4.state();

  const again = D.applyOps(D.reproject(cur4, afterRebase), [{ t: "setText", id: p1.id, text: "rebase 之后又改。" }]);
  h4.commit(again.tx);
  ok("(d) rebase 之后还能接着编辑（新事务 before 接得上）", h4.length === 2 && h4.state() === again.tx.after && h4.checkChain().ok);

  const u4 = h4.undo();
  ok("(d) 撤一步 → 落回 rebase 之后的那份内容（不是别的分支）",
    !!u4 && h4.state() === afterRebase, vis(h4.state(), 60));
  ok("(d) 再撤一步 → 落到新的 base（已经是「原稿 + 外部改动」）",
    h4.undo() !== null && h4.state() === h4.base && h4.base.indexOf("外部又改") >= 0);
}

/* =====================================================================
 * 第 6 段：随机交错 200 次（种子可复现）
 * =================================================================== */

/* 随机造一份文档 */
function makeDoc(rng) {
  const out = [];
  out.push("\\documentclass[12pt]{ctexart}");
  out.push("\\begin{document}");
  const n = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    if (rng() < 0.45) out.push("\\section{第" + (i + 1) + "节}");
    if (rng() < 0.25) {
      out.push("第 " + (i + 1) + " 段折成两行写，");
      out.push("第二行接着上一行。");
    } else {
      out.push("这是第 " + (i + 1) + " 段正文，用来测试撤销是否可预测。");
    }
    if (rng() < 0.35) out.push("");
  }
  if (rng() < 0.35) { out.push("\\begin{equation}"); out.push("x = 1"); out.push("\\end{equation}"); }
  out.push("");
  out.push("这是" + MARK + "，本地编辑一律不碰它，专门用来验「外部改动落在别的块上」。");
  out.push("");
  out.push("\\end{document}");
  return out.join("\n") + "\n";
}

function textyNodes(doc) {
  return editableIdx(doc).map(function (k) { return doc.nodes[k]; });
}

/* 造一条合法的本地编辑 Op（失败返回 null —— 不合法就跳过，不制造假失败） */
function randOp(rng, doc) {
  const kinds = ["setText", "setText", "setText", "setHeading", "insertNode", "deleteNodes", "splitPara", "mergePara"];
  let t = pick(rng, kinds);

  if (t === "splitPara") {
    const ok = {};
    for (let q = 0; q < editableIdx(doc).length; q++) ok[editableIdx(doc)[q]] = 1;
    const ps = doc.nodes.filter(function (n, k) {
      return ok[k] && n.type === "paragraph" && n.raw.replace(/\n$/, "").length > 8;
    });
    if (!ps.length) t = "setText";
    else {
      const p = pick(rng, ps);
      const len = p.raw.replace(/\n$/, "").length;
      return { t: "splitPara", id: p.id, at: 1 + Math.floor(rng() * (len - 2)) };
    }
  }

  if (t === "mergePara") {
    const ns = doc.nodes;
    for (let i = 0; i + 2 < ns.length; i++) {
      if (ns[i].type === "paragraph" && ns[i + 1].type === "blank" && ns[i + 2].type === "paragraph" &&
          !isCanary(ns[i]) && !isCanary(ns[i + 1]) && !isCanary(ns[i + 2])) {
        return { t: "mergePara", ids: [ns[i].id, ns[i + 2].id] };
      }
    }
    t = "setText";
  }

  if (t === "insertNode") {
    const ns2 = doc.nodes;
    const ci = canaryIdx(ns2);
    /* 插在专用块的紧前（ci）或紧后（ci+1）会让两者成为连续非空行 → 被聚合成一个多行节点 */
    const allowed = [];
    for (let k = 0; k <= ns2.length; k++) if (k !== ci && k !== ci + 1) allowed.push(k);
    return { t: "insertNode", index: allowed.length ? pick(rng, allowed) : 0,
             raw: "插入的新段落 " + Math.floor(rng() * 1000) + "。\n" };
  }

  if (t === "deleteNodes") {
    const ok2 = {};
    for (let q = 0; q < editableIdx(doc).length; q++) ok2[editableIdx(doc)[q]] = 1;
    const cands = doc.nodes.filter(function (n, k) {
      return ok2[k] && (n.type === "blank" || n.type === "paragraph");
    });
    if (!cands.length) t = "setText";
    else return { t: "deleteNodes", ids: [pick(rng, cands).id] };
  }

  if (t === "setHeading") {
    const ok3 = {};
    for (let q = 0; q < editableIdx(doc).length; q++) ok3[editableIdx(doc)[q]] = 1;
    const ps = doc.nodes.filter(function (n, k) {
      return ok3[k] && n.type === "paragraph" && n.raw.trim().charAt(0) !== "\\";
    });
    const hs = doc.nodes.filter(function (n, k) { return ok3[k] && n.type === "heading"; });
    if (!ps.length && !hs.length) t = "setText";
    else if (hs.length && (rng() < 0.4 || !ps.length)) {
      const h = pick(rng, hs);
      const cmd = rng() < 0.25 ? null : pick(rng, HEADS);
      return { t: "setHeading", id: h.id, cmd: cmd };
    } else {
      return { t: "setHeading", id: pick(rng, ps).id, cmd: pick(rng, HEADS) };
    }
  }

  const cands = textyNodes(doc);
  if (!cands.length) return null;
  const node = pick(rng, cands);
  return { t: "setText", id: node.id, text: "改过的文字 " + Math.floor(rng() * 100000) + "。" };
}

K.section("随机交错 " + ITERS + " 次（本地编辑 / 撤销 / 重做 / 外部 rebase）");
{
  let fails = [];
  let stat = { edits: 0, undos: 0, redos: 0, rebases: 0, rebaseKept: 0, rebaseDropped: 0, coalesces: 0, noop: 0, thrown: 0 };
  let seedUsed = [];
  let firstLogged = false;

  function fail(seed, it, step, msg, detail) {
    if (fails.length < 8) fails.push({ seed: seed, it: it, step: step, msg: msg, detail: detail });
  }

  for (let it = 0; it < ITERS; it++) {
    const seed = (BASE_SEED + it * 7919) | 0;
    const rng = mulberry32(seed);
    if (fails.length === 0) seedUsed.push(seed);

    let src = makeDoc(rng);
    let doc = D.parse(src);
    const h = new TX.History({ base: src, windowMs: 400 });
    let clock = 1000;
    const log = [];
    let stop = false;

    /* 每一步之后都验一遍的不变量 */
    function invariants(step) {
      const v = D.validate(doc);
      if (!v.ok) { fail(seed, it, step, "doc 结构自检不过", v.errors.slice(0, 2).join("；")); return false; }
      if (D.serialize(doc) !== doc.source) { fail(seed, it, step, "拼接 ≠ source（平铺破损）", ""); return false; }
      if (D.serialize(D.parse(doc.source)) !== doc.source) { fail(seed, it, step, "无损破了：serialize(parse(s)) !== s", K.vis ? "" : ""); return false; }
      const c = h.checkChain();
      if (!c.ok) { fail(seed, it, step, "历史链断了", c.errors.slice(0, 2).join("；")); return false; }
      const can = doc.nodes.filter(isCanary);
      if (can.length !== 1) {
        fail(seed, it, step, "专用块没了或不止一个（precondition 被破坏）", "找到 " + can.length + " 个");
        return false;
      }
      if (can[0].type !== "paragraph" || can[0].raw.replace(/\n$/, "").indexOf("\n") >= 0) {
        /* 专用块必须始终是**独立的单行** paragraph —— 否则「本地不碰它」这句话就不成立 */
        const L2 = doc.source.split("\n");
        let li2 = -1;
        for (let q = 0; q < L2.length; q++) if (L2[q].indexOf(MARK) >= 0) { li2 = q; break; }
        let ci2 = -1;
        for (let q = 0; q < doc.nodes.length; q++) if (isCanary(doc.nodes[q])) { ci2 = q; break; }
        fail(seed, it, step, "专用块被并成了多行块（precondition 被破坏）",
          "type=" + can[0].type +
          " 节点下标=" + ci2 + "/" + doc.nodes.length +
          " 上下文行=[" + JSON.stringify(L2.slice(Math.max(0, li2 - 3), li2 + 3)).slice(0, 300) + "]" +
          " 节点类型=" + doc.nodes.map(function (n) { return n.type; }).join(","));
        return false;
      }
      if (h.state() !== doc.source) {
        fail(seed, it, step, "历史与内容脱节：h.state() !== doc.source",
          "state=" + vis(h.state(), 60) + " doc=" + vis(doc.source, 60));
        return false;
      }
      return true;
    }

    function applyLocal(step, forceCommit) {
      const op = randOp(rng, doc);
      if (!op) return;
      let r;
      try { r = D.applyOps(doc, [op]); } catch (e) { stat.thrown++; log.push("edit!throw:" + op.t); return; }
      if (r.tx.before === r.tx.after) { stat.noop++; log.push("edit!noop:" + op.t); return; }
      clock += 30 + Math.floor(rng() * 500);
      const useCoalesce = !forceCommit && rng() < 0.7;
      const tx = useCoalesce
        ? h.coalesce({
            label: "打字", ops: r.tx.ops, before: r.tx.before, after: r.tx.after,
            changed: r.tx.changed, deleted: r.tx.deleted,
            coalesceKey: "typing:" + (r.tx.changed[0] || "?"), at: clock,
          })
        : h.commit({ label: op.t, ops: r.tx.ops, before: r.tx.before, after: r.tx.after,
                     changed: r.tx.changed, deleted: r.tx.deleted, at: clock });
      /* 先同步内容：这一步的字节确实变了（历史记不记是另一回事）。
       * coalesce 可能返回 null —— 合并后净效果为零（打了又删回去），那一步被摘掉了，
       * 但当前内容仍是 r.doc（= 起点的样子）。 */
      doc = r.doc;
      if (!tx) { stat.noop++; log.push("edit!noop-merged:" + op.t); return; }
      stat.edits++;
      /* C7 铁律：任何一次 coalesce 之后都必须有东西可撤 */
      if (useCoalesce && !h.canUndo()) { fail(seed, it, step, "C7 破了：coalesce 之后 canUndo() === false", ""); stop = true; }
      log.push("edit:" + op.t + (useCoalesce ? "(coalesce)" : "(commit)"));
    }

    function doUndo(step) {
      const beforeSrc = doc.source;
      const tx = h.undo();
      if (!tx) { log.push("undo!empty"); return; }
      /* C6 铁律：撤销这一步必须**恰好**回到它的 after 之前 */
      if (tx.after !== beforeSrc) {
        fail(seed, it, step, "C6 破了：undo 返回的 tx.after 与撤销前的内容不符（会撤到别处）",
          "tx.after=" + vis(tx.after, 50) + " 撤销前=" + vis(beforeSrc, 50));
        stop = true; return;
      }
      doc = D.reproject(doc, tx.before);
      stat.undos++;
      log.push("undo");
      if (!invariants(step)) stop = true;
    }

    function doRedo(step) {
      const beforeSrc = doc.source;
      const tx = h.redo();
      if (!tx) { log.push("redo!empty"); return; }
      if (tx.before !== beforeSrc) {
        fail(seed, it, step, "redo 的 tx.before 与当前内容不符", vis(tx.before, 50) + " vs " + vis(beforeSrc, 50));
        stop = true; return;
      }
      doc = D.reproject(doc, tx.after);
      stat.redos++;
      log.push("redo");
      if (!invariants(step)) stop = true;
    }

    /* 外部改动：改一个「离本地改动最远」的块（disjoint）或「同一个块」（overlap） */
    function doRebase(step, disjoint) {
      const top = h.top();
      const touched = new Set();
      for (let i = 0; i < h.stack.length; i++) for (let j = 0; j < h.stack[i].changed.length; j++) touched.add(h.stack[i].changed[j]);
      const un = doc.nodes;

      let cand = null;
      if (disjoint) {
        /* 构造性：本地操作从不碰专用块，所以这次外部改动必然「落在别的块上」 */
        for (let i = 0; i < un.length; i++) if (TEXTY[un[i].type] && isCanary(un[i])) { cand = un[i]; break; }
        if (!cand) { fail(seed, it, step, "专用块不见了（makeDoc 或本地操作误伤了它）", ""); stop = true; return; }
      } else {
        /* 故意打本地刚改过的地方（也允许打别处）—— 用来真的走一遍冲突路径 */
        const okp = {};
        for (let q = 0; q < editableIdx(doc).length; q++) okp[editableIdx(doc)[q]] = 1;
        const pool = un.filter(function (n, k) { return okp[k]; });
        const hit = pool.filter(function (n) { return touched.has(n.id); });
        cand = (hit.length && rng() < 0.8) ? pick(rng, hit) : pick(rng, pool);
        if (!cand) { log.push("rebase!nopick"); return; }
      }

      let ext;
      /* 打专用块时把标记留在文字里 —— 否则第一次外部写入就把标记抹掉，专用块只能用一次 */
      const extText = "外部写入 " + Math.floor(rng() * 100000) + "。" + (isCanary(cand) ? "（" + MARK + "）" : "");
      try {
        ext = D.applyOps(doc, [{ t: "setText", id: cand.id, text: extText }]);
      } catch (e) { stat.thrown++; log.push("rebase!throw"); return; }
      if (ext.tx.before === ext.tx.after) { log.push("rebase!noop"); return; }

      const nBefore = h.length, gBefore = h.gaps;
      const dbgBase = h.base, dbgEb = ext.tx.before, dbgEa = ext.tx.after;
      const res = h.rebase(ext.tx.before, ext.tx.after);
      stat.rebases++;
      stat.rebaseKept += res.kept;
      stat.rebaseDropped += res.dropped;

      if (disjoint) {
        /* 外部改的是别的块 → 一条都不许丢（这就是「绝不清栈」） */
        if (res.dropped !== 0 || h.length !== nBefore) {
          if (process.env.DBG) {
            const A = dbgEb.split("\n"), B = dbgBase.split("\n"), C = dbgEa.split("\n");
            console.log("    [DBG] eb==state? " + (dbgEb === doc.source) + "  行数 eb=" + A.length + " base=" + B.length + " ea=" + C.length);
            console.log("    [DBG] diffHunks(eb,base) = " + JSON.stringify(TX.diffHunks(A, B)));
            console.log("    [DBG] diffHunks(eb,ea)   = " + JSON.stringify(TX.diffHunks(A, C)));
            console.log("    [DBG] merge3(eb,base,ea) = " + JSON.stringify(TX.merge3(dbgEb, dbgBase, dbgEa)).slice(0, 400));
          }
          fail(seed, it, step, "rebase 把「落在别的块上」的外部改动误判成冲突（清了栈）",
            "原 " + nBefore + " 条 → 留 " + h.length + " 条，dropped=" + res.dropped +
            " ｜ detail=" + JSON.stringify(res.detail) +
            " ｜ extBefore==state?" + (ext.tx.before === doc.source));
          stop = true; return;
        }
        if (h.gaps !== gBefore) { fail(seed, it, step, "无冲突却涨了 gaps", ""); stop = true; return; }
      }
      if (h.gaps !== gBefore + res.dropped) { fail(seed, it, step, "gaps 记账与 dropped 不符", ""); stop = true; return; }
      if (h.state() !== res.source) { fail(seed, it, step, "rebase 返回的 source 与 h.state() 不符", ""); stop = true; return; }

      doc = D.reproject(doc, res.source);
      log.push("rebase:" + (disjoint ? "disjoint" : "overlap") + "(kept " + res.kept + "/" + nBefore + ")");
      if (!invariants(step)) stop = true;
    }

    /* ---- 阶段 A：只做本地编辑，验 C6 的「撤到底 = 回到起点」 ---- */
    const startA = doc.source;
    const nEdit = 2 + Math.floor(rng() * 6);
    for (let i = 0; i < nEdit && !stop; i++) {
      applyLocal("A" + i, false);
      if (!invariants("A" + i)) { stop = true; break; }
    }
    const endA = doc.source;
    const depthA = h.depth;
    if (!stop && depthA > 0) {
      /* 撤到底 → 必须逐字节回到阶段开始的那份内容（C6：undo ∘ do = id） */
      for (let i = 0; i < depthA && !stop; i++) doUndo("A-undo" + i);
      if (!stop && doc.source !== startA) {
        fail(seed, it, "A-undo", "C6 破了：撤到底没有逐字节回到起点",
          "起点=" + vis(startA, 60) + " 撤到底=" + vis(doc.source, 60));
        stop = true;
      }
      if (!stop) {
        /* 重做到底 → 必须逐字节回到阶段结束的那份内容（redo ∘ undo = id） */
        for (let i = 0; i < depthA && !stop; i++) doRedo("A-redo" + i);
        if (!stop && doc.source !== endA) {
          fail(seed, it, "A-redo", "redo 到底没有逐字节回到终点",
            "终点=" + vis(endA, 60) + " 重做到底=" + vis(doc.source, 60));
          stop = true;
        }
      }
    }

    /* ---- 阶段 B：四种动作随机交织 ---- */
    for (let s = 0; s < STEPS && !stop; s++) {
      const r = rng();
      if (r < 0.34) applyLocal("B" + s, rng() < 0.15);
      else if (r < 0.54) doUndo("B" + s);
      else if (r < 0.68) doRedo("B" + s);
      else if (r < 0.84) doRebase("B" + s, true);
      else doRebase("B" + s, false);

      if (!stop && !invariants("B" + s)) { stop = true; break; }

      /* 每 5 步做一次「撤一步 / 重做一步」的精确往返（可预测性的正面检验） */
      if (!stop && s % 5 === 4 && h.canUndo()) {
        const s0 = doc.source;
        const tx = h.undo();
        if (tx.after !== s0) { fail(seed, it, "B" + s, "往返：undo 的 after ≠ 撤销前内容", ""); stop = true; }
        else {
          doc = D.reproject(doc, tx.before);       /* 撤销 = 把文档设成 tx.before */
          if (doc.source !== tx.before) { fail(seed, it, "B" + s, "往返：撤一步没落到 tx.before", vis(doc.source, 50) + " vs " + vis(tx.before, 50)); stop = true; }
          else {
            const tx2 = h.redo();
            doc = D.reproject(doc, tx2.after);
            if (doc.source !== s0) { fail(seed, it, "B" + s, "往返：重做没回到撤销前的内容", ""); stop = true; }
            else if (tx2.id !== tx.id) { fail(seed, it, "B" + s, "往返：重做拿到的不是同一条事务", ""); stop = true; }
          }
        }
      }
    }

    /* ---- 收尾：撤到底 → 必须恰好落在 h.base，且步数 = depth ---- */
    if (!stop) {
      let steps = 0;
      while (h.canUndo()) {
        const beforeSrc = doc.source;
        const tx = h.undo();
        if (!tx) break;
        if (tx.after !== beforeSrc) { fail(seed, it, "tail", "尾部撤销：after 与当前内容不符", ""); stop = true; break; }
        doc = D.reproject(doc, tx.before);
        steps++;
        if (steps > 5000) { fail(seed, it, "tail", "撤不完（死循环？）", ""); stop = true; break; }
      }
      if (!stop) {
        if (doc.source !== h.base) {
          fail(seed, it, "tail", "撤到底没有落在 h.base 上", "base=" + vis(h.base, 50) + " 实到=" + vis(doc.source, 50));
          stop = true;
        }
        if (h.undo() !== null) { fail(seed, it, "tail", "撤到底之后 undo() 仍返回东西（cursor 越界）", ""); stop = true; }
        if (D.serialize(D.parse(doc.source)) !== doc.source) { fail(seed, it, "tail", "终态无损破了", ""); stop = true; }
      }
    }

    stat.coalesces += h.coalesces;
    if (fails.length && seedUsed.indexOf(seed) < 0) seedUsed.push(seed);
    if (fails.length && !firstLogged) {
      firstLogged = true;
      console.log("\n  ---- 首次失败那次的动作流水（seed=" + seed + " 迭代=" + it + "）----");
      for (let li = 0; li < log.length; li++) console.log("    " + li + "  " + log[li]);
      console.log("  ------------------------------------------------\n");
    }
    stat["iters"] = it + 1;
  }

  const totalChecked = stat.edits + stat.undos + stat.redos + stat.rebases;
  console.log("  ·     迭代 " + ITERS + " 次 × 最多 " + STEPS + " 步；" +
    "本地编辑 " + stat.edits + " / 撤销 " + stat.undos + " / 重做 " + stat.redos + " / rebase " + stat.rebases +
    "（共 " + totalChecked + " 次动作）");
  console.log("  ·     rebase 保留 " + stat.rebaseKept + " 条、丢弃 " + stat.rebaseDropped + " 条；" +
    "coalesce 合并 " + stat.coalesces + " 次；跳过非法/空转 " + (stat.noop + stat.thrown) + " 次");
  console.log("  ·     种子：BASE=" + BASE_SEED + "，第 i 次 = BASE + i×7919（照抄即可复现）");

  ok("随机交错 " + ITERS + " 次，四种动作交织，全部不变量成立",
    fails.length === 0,
    fails.length ? fails.slice(0, 3).map(function (f) {
      return "seed=" + f.seed + " it=" + f.it + " step=" + f.step + " " + f.msg + (f.detail ? " [" + f.detail + "]" : "");
    }).join("  ||  ") : "");

  if (fails.length) {
    console.log("\n  失败明细（前 8 条）：");
    for (let i = 0; i < fails.length; i++) {
      const f = fails[i];
      console.log("   " + (i + 1) + ") seed=" + f.seed + " 迭代=" + f.it + " 步=" + f.step);
      console.log("      " + f.msg + (f.detail ? "\n      " + f.detail : ""));
    }
    console.log("\n  复现： SEED=" + fails[0].seed + " node server/v09-txlog.test.js --iters 1");
  }

  /* 动作确实发生了（防止「随机」退化成一堆空转，把测试变成空跑） */
  ok("随机序列量足够（本地编辑 ≥ " + Math.floor(ITERS / 2) + " 次）", stat.edits >= Math.floor(ITERS / 2), "实际 " + stat.edits);
  ok("随机序列量足够（rebase ≥ " + Math.floor(ITERS / 4) + " 次）", stat.rebases >= Math.floor(ITERS / 4), "实际 " + stat.rebases);
  ok("确实发生过 rebase 冲突（否则 C6/C7 的冲突路径没被走到）", stat.rebaseDropped > 0, "丢弃 " + stat.rebaseDropped + " 条");
}

K.exit();
