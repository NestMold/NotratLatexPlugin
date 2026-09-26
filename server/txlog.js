"use strict";
/* =====================================================================
 * v0.9 P2 事务历史（txlog）—— 方案 B 的第二块地基。零依赖，纯字符串。
 *
 * 为什么要有这一个文件
 *   现状的「撤销」有三个致命处（见 docs/v0.9-docmodel-plan.md §1、§9.1）：
 *     · C1b  根本没有一个叫「历史」的东西 —— 整份源码快照存在组件 ref 里，
 *            外加一条 `if (!selfEdit && !histOp) { undoRef = []; redoRef = []; }`
 *            的兜底规则：**误判一次布尔标志，用户历史当场清空**。
 *     · C6   undo ∘ do ≠ id —— 撤销不保证回到起点（快照粒度 + 与源码脱节）。
 *     · C7   刚打完字撤不动 —— 打字没有立刻落成一个事务，Ctrl+Z 说「没有可撤」。
 *
 *   本模块把「历史」变成一个**可被测试的纯数据对象**：
 *   一串 Tx（每条带着字节级的 before/after 与「改了哪些节点」的凭据），
 *   一个 cursor，一条说清楚「丢了几步、为什么丢」的 gaps 计数。
 *
 * 设计红线
 *   ① **undo ∘ do = id**：`undo()` 返回的就是「要把文档设成 tx.before」的那条凭据。
 *      调用方只需 `doc.source = tx.before`，不猜、不重放、不模拟。redo 同理。
 *   ② **打字必有可撤**：`coalesce` 第一次调用就落一条真事务（不是「攒着」）。
 *      400ms 空闲或换块才封口，所以任何时刻 Ctrl+Z 都必然有东西可撤（C7）。
 *   ③ **绝不清栈**：`rebase` 只在**真冲突**时丢，且只丢那一条 —— 外部改动落在别的块上
 *      （绝大多数情况）时历史完整保留。清空历史的旧行为在这里被彻底删掉。
 *   ④ **宁可少撤，不可撤错**：rebase 之后必须仍是「一条从头连到尾的链」
 *      （tx[i].after === tx[i+1].before）。链断了就砍掉那一段并 `gaps++`，
 *      绝不留下一步「会撤到别处去」的历史。
 *   ⑤ **零依赖、双端通用**：只看字符串，不 require docmodel / DOM。
 *      （构建接缝与 wysiwyg / docmodel 同一条：末行那条导出语句换成 return，再包 IIFE。）
 *
 * 与 docmodel 的分工
 *   docmodel 产出 tx：{ ops, before, after, changed, deleted, label }
 *   （`changed` 就是 v09-baseline B2 说的「事务凭据」—— 旧内核只返回裸字符串，给不出。）
 *   本模块吃下这条 tx，补上 id / at / open，负责排序、合并、回退、重映射。
 *   两者互不 require：txlog 不 import docmodel，测试里把它们接起来。
 *
 * 已知边界（诚实记下来，别当成没这回事）
 *   merge3 是**逐行**对齐的。当外部把「多行的一段」整段重写（例如同步回来的版本里
 *   两行并成了一行），而本地历史只动了其中一行时，两边的改动块会叠在同一行上：
 *
 *     eb（当前内容）  : [外部写入 X。] [插入的段落]
 *     base（历史地板）: [外部写入 X。]                ← 本地历史里没有第二行
 *     ea（外部结果）  : [外部写入 Y。]                ← 外部把两行重写成一行
 *
 *   逐行看，两边都「动了」第二行 → 判冲突 → 丢掉这一步（gaps++，UI 明说几步没法撤）。
 *   宁可少撤，不可撤错：这里丢的是**撤销的步数**，不是内容 —— 用户的原稿一个字节都不会错，
 *   而且必定会弹「更早的 N 步已与磁盘版本分叉，无法撤销」，不静默。
 *   要彻底消掉这类假冲突，得把对齐从「逐行」换成「按相似度匹配」（词级 diff）—— 那是后续的事。
 *   本模块的取舍始终是：**宁可少撤，不可撤错**；冲突一律丢 + 计数，绝不猜。
 * ===================================================================== */

/* 三方合并的 DP 上限（行×行）。超过就整段当一个替换块 —— 保守，
 * 冲突时丢事务而不是算错，符合红线 ④。 */
const MAXDP = 2000000;

/* ---------- 小工具 ---------- */
function str(x) { return String(x == null ? "" : x); }

function arrEq(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function union(a, b) {
  const out = [];
  const seen = new Set();
  for (let i = 0; i < a.length; i++) if (!seen.has(a[i])) { seen.add(a[i]); out.push(a[i]); }
  for (let i = 0; i < b.length; i++) if (!seen.has(b[i])) { seen.add(b[i]); out.push(b[i]); }
  return out;
}

function shallow(o) {
  const c = {};
  for (const k in o) if (Object.prototype.hasOwnProperty.call(o, k)) c[k] = o[k];
  return c;
}

/* =====================================================================
 * diffHunks(A, B) → [{ s, e, lines }]
 *   意思是：把 A 的 [s, e) 这几行换成 lines。
 *   保证：有序、互不重叠（normalizeHunks 之后连相邻的也并起来）。
 *   实现：先削掉公共前缀 / 后缀（真实编辑只动中间一小段，DP 因此小得多），
 *         中间用 LCS 回溯切块。
 * =================================================================== */
function diffHunks(A, B) {
  let p = 0;
  const maxP = Math.min(A.length, B.length);
  while (p < maxP && A[p] === B[p]) p++;
  let sfx = 0;
  const maxS = maxP - p;
  while (sfx < maxS && A[A.length - 1 - sfx] === B[B.length - 1 - sfx]) sfx++;

  const Ab = A.slice(p, A.length - sfx);
  const Bb = B.slice(p, B.length - sfx);
  const n = Ab.length, m = Bb.length;
  if (!n && !m) return [];
  if (!n || !m || n * m > MAXDP) return [{ s: p, e: p + n, lines: Bb.slice() }];

  /* LCS 长度表（倒着填，回溯时好走） */
  const W = m + 1;
  const dp = new Uint32Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--) {
    const row = i * W, nrow = (i + 1) * W;
    for (let j = m - 1; j >= 0; j--) {
      dp[row + j] = Ab[i] === Bb[j]
        ? dp[nrow + j + 1] + 1
        : Math.max(dp[nrow + j], dp[row + j + 1]);
    }
  }

  const hunks = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && Ab[i] === Bb[j]) { i++; j++; continue; }
    const s = i, sj = j;
    while (i < n && j < m && Ab[i] !== Bb[j]) {
      /* 删一行 vs 插一行，取 LCS 损失小的那边 */
      if (dp[(i + 1) * W + j] >= dp[i * W + (j + 1)]) i++;
      else j++;
    }
    if (i < n && j < m) {
      hunks.push({ s: p + s, e: p + i, lines: Bb.slice(sj, j) });
    } else {
      /* 一边耗尽：剩下的收进同一个块，收工 */
      hunks.push({ s: p + s, e: p + n, lines: Bb.slice(sj, m) });
      i = n; j = m;
    }
  }
  return hunks;
}

/* 有序、不重叠；相邻的并成一块（语义等价，区域判定好写） */
function normalizeHunks(hs) {
  const out = [];
  for (let k = 0; k < hs.length; k++) {
    const h = hs[k];
    const last = out[out.length - 1];
    if (last && h.s <= last.e) {
      last.lines = last.lines.concat(h.lines);
      if (h.e > last.e) last.e = h.e;
    } else {
      out.push({ s: h.s, e: h.e, lines: h.lines.slice() });
    }
  }
  return out;
}

/* 把 base 的 [start, end) 用 hunks[from..to) 渲染出来（hunks 必须都落在区间内） */
function renderRegion(A, hunks, from, to, start, end) {
  const out = [];
  let cur = start;
  for (let k = from; k < to; k++) {
    const h = hunks[k];
    if (h.s > cur) out.push.apply(out, A.slice(cur, h.s));
    out.push.apply(out, h.lines);
    cur = h.e;
  }
  if (cur < end) out.push.apply(out, A.slice(cur, end));
  return out;
}

/* =====================================================================
 * merge3(base, ours, theirs) → { ok, text } | { ok:false, conflict, line, … }
 *
 * 逐行三方合并（diff3）：把 base → ours、base → theirs 的改动块对齐，
 * 每一段互不重叠的区域内：
 *     只有我们改   → 取我们的
 *     只有他们改   → 取他们的
 *     两边改得一样 → 取任一
 *     两边改得不同 → **冲突**（不猜、不自动取舍）
 *
 * 相邻但不重叠的两处改动**不算冲突**（各改各的），这条很要紧：
 * 「外部改动常落在别的块上」正是 rebase 能保住历史的根据（红线 ③）。
 * =================================================================== */
/* 两处改动在 base 上是不是「真正重叠」。
 * 插入是零长的，只占一条边界；落在区间的边界上不算重叠（那是插在它前/后面），
 * 落在区间**内部**才算（顺序不明，只能判冲突）。 */
function overlapsSpan(h, span) {
  const hIns = h.e === h.s;
  const sIns = span.e === span.s;
  if (!hIns && !sIns) return span.s < h.e && h.s < span.e;      /* 区间 × 区间 */
  if (hIns && sIns) return h.s === span.s;                      /* 插入 × 插入：同一点才算 */
  if (sIns) return h.s < span.s && span.s < h.e;                /* 插入点落在区间内部 */
  return span.s < h.s && h.s < span.e;                          /* 区间里的插入点 */
}

/* 同一起点上谁先：插入先于替换（先插进去，再改那一行） */
function seedFirst(a, b) {
  if (a.s !== b.s) return a.s < b.s;
  const aIns = a.e === a.s, bIns = b.e === b.s;
  if (aIns !== bIns) return aIns;
  return true;                                                  /* 同类：先看 ours（多半判冲突） */
}

function merge3(baseText, oursText, theirsText) {
  const base = str(baseText), ours = str(oursText), theirs = str(theirsText);

  if (ours === theirs) return { ok: true, text: ours, why: "both-same" };
  if (ours === base) return { ok: true, text: theirs, why: "ours-unchanged" };
  if (theirs === base) return { ok: true, text: ours, why: "theirs-unchanged" };

  const A = base.split("\n"), O = ours.split("\n"), T = theirs.split("\n");
  const ho = normalizeHunks(diffHunks(A, O));
  const ht = normalizeHunks(diffHunks(A, T));

  const out = [];
  let i = 0, po = 0, pt = 0;

  /* 不变式（每轮顶部成立）：[0,po)/[0,pt) 已消费，未消费的 hunk 都有 s >= i */
  while (true) {
    const no = po < ho.length ? ho[po] : null;
    const nt = pt < ht.length ? ht[pt] : null;
    if (!no && !nt) { for (; i < A.length; i++) out.push(A[i]); break; }

    const next = Math.min(no ? no.s : Infinity, nt ? nt.s : Infinity);
    if (next > i) { for (; i < next; i++) out.push(A[i]); continue; }

    /* 建组：在 i 处取种子，再把与它**真正重叠**的 hunk 并进来 */
    const poStart = po, ptStart = pt;
    let gs = i, ge = i;
    if (!nt || (no && seedFirst(no, nt))) { gs = no.s; ge = no.e; po++; }
    else { gs = nt.s; ge = nt.e; pt++; }

    let grew = true;
    while (grew) {
      grew = false;
      while (po < ho.length && overlapsSpan(ho[po], { s: gs, e: ge })) {
        if (ho[po].e > ge) ge = ho[po].e;
        po++; grew = true;
      }
      while (pt < ht.length && overlapsSpan(ht[pt], { s: gs, e: ge })) {
        if (ht[pt].e > ge) ge = ht[pt].e;
        pt++; grew = true;
      }
    }

    const rBase = A.slice(gs, ge);
    const rOurs = renderRegion(A, ho, poStart, po, gs, ge);
    const rTheirs = renderRegion(A, ht, ptStart, pt, gs, ge);

    if (arrEq(rOurs, rBase)) out.push.apply(out, rTheirs);
    else if (arrEq(rTheirs, rBase)) out.push.apply(out, rOurs);
    else if (arrEq(rOurs, rTheirs)) out.push.apply(out, rOurs);
    else {
      return {
        ok: false, conflict: true, line: gs,
        base: rBase.join("\n"), ours: rOurs.join("\n"), theirs: rTheirs.join("\n"),
        why: "两边改了同一处且结果不同（第 " + (gs + 1) + " 行起）",
      };
    }

    i = ge;
  }

  return { ok: true, text: out.join("\n") };
}

/* ---------- tx id：确定性计数器（不用 Math.random，测试可复现） ---------- */
let _seq = 0;
function nextTxId() { _seq += 1; return "tx" + _seq.toString(36); }

/* 把任意来源的 tx 补成内部形态 */
function normTx(tx, fallbackBefore) {
  const t = tx || {};
  const before = str(t.before == null ? fallbackBefore : t.before);
  return {
    id: str(t.id || nextTxId()),
    label: str(t.label == null ? "" : t.label),
    ops: Array.isArray(t.ops) ? t.ops.slice() : [],
    before: before,
    after: str(t.after == null ? before : t.after),
    changed: Array.isArray(t.changed) ? t.changed.slice() : [],
    deleted: Array.isArray(t.deleted) ? t.deleted.slice() : [],
    sel: t.sel === undefined ? null : t.sel,
    at: typeof t.at === "number" ? t.at : Date.now(),
    open: !!t.open,
    coalesceKey: t.coalesceKey == null ? null : str(t.coalesceKey),
  };
}

/* 两条 tx 能不能并成一个（coalesce 的判定，刻意保守） */
function sameCoalesceKey(a, b) {
  if (a.coalesceKey && b.coalesceKey) return a.coalesceKey === b.coalesceKey;
  if (a.coalesceKey || b.coalesceKey) return false;   /* 只有一边标了 key：不并 */
  if (a.label !== b.label) return false;
  /* 没有 key 就要求「改的恰好是同一个节点」—— 换块绝不许并 */
  return a.changed.length === 1 && b.changed.length === 1 && a.changed[0] === b.changed[0];
}

/* =====================================================================
 * class History —— 唯一的历史
 *
 *   stack   : Tx[]，[0, cursor) 是「可撤销的」，[cursor, len) 是「可重做的」
 *   cursor  : 已应用的事务数
 *   base    : 栈底之前的那份源码（cursor === 0 时的当前状态）
 *   gaps    : 因 rebase 无法合并而丢弃的步数（诚实告知用户，绝不静默清空）
 * =================================================================== */
class History {
  constructor(opts) {
    const o = opts || {};
    this.stack = [];
    this.cursor = 0;
    this.gaps = 0;
    this.limit = o.limit > 0 ? o.limit : 500;
    this.windowMs = o.windowMs >= 0 ? o.windowMs : 400;
    this.base = str(o.base);
    this.dropped = [];      /* { reason, id, label, line } —— 给 UI 讲清楚丢了什么 */
    this.rebases = 0;
    this.coalesces = 0;
  }

  /* ---- 只读视图 ---- */
  get length() { return this.stack.length; }
  get depth() { return this.cursor; }
  get future() { return this.stack.length - this.cursor; }
  canUndo() { return this.cursor > 0; }
  canRedo() { return this.cursor < this.stack.length; }
  top() { return this.cursor > 0 ? this.stack[this.cursor - 1] : null; }
  peekRedo() { return this.cursor < this.stack.length ? this.stack[this.cursor] : null; }
  /* 当前状态（= 最后一条已应用事务的 after；一条都没有时就是 base） */
  state() { return this.cursor > 0 ? this.stack[this.cursor - 1].after : this.base; }

  /* 把「起点」对齐到一份新源码（打开文件 / 外部同步时用；会清历史） */
  reset(source) {
    this.stack = [];
    this.cursor = 0;
    this.gaps = 0;
    this.base = str(source);
    this.dropped = [];
    return this;
  }

  /* 封口：当前那一步不再接受合并（失焦 / 换块 / 任何非打字动作之后调用） */
  seal() {
    const t = this.top();
    if (t) t.open = false;
    return this;
  }

  /* 新事务入栈（标准语义：清掉 redo）。空转事务不入栈 —— 否则 Ctrl+Z 像「没反应」。 */
  commit(tx) {
    const t = normTx(tx, this.state());
    if (t.before === t.after) return null;
    if (this.cursor < this.stack.length) {
      this.stack.length = this.cursor;      /* 新分支：丢弃 redo */
    }
    this.seal();
    t.open = false;
    this.stack.push(t);
    if (this.stack.length > this.limit) {
      const gone = this.stack.shift();
      if (this.base === gone.before) this.base = gone.after;
    }
    this.cursor = this.stack.length;
    return t;
  }

  /* 打字合并：能并进上一条就并，不能就**立刻**落一条新事务（C7 的关键）。
   * 「立刻」不是措辞 —— 任何时刻调用完 coalesce，undo() 都必然拿得到东西。 */
  coalesce(tx, windowMs) {
    const win = (typeof windowMs === "number" && windowMs >= 0) ? windowMs : this.windowMs;
    const t = normTx(tx, this.state());
    if (t.before === t.after) return null;

    const top = this.top();
    const inWindow = top ? (t.at - top.at) <= win : false;
    if (top && top.open && this.cursor === this.stack.length && inWindow && sameCoalesceKey(top, t)) {
      top.after = t.after;                 /* 起点不动，终点前进 */
      top.at = t.at;
      top.ops = top.ops.concat(t.ops);
      top.changed = union(top.changed, t.changed);
      top.deleted = union(top.deleted, t.deleted);
      if (t.sel !== null) top.sel = t.sel;
      this.coalesces += 1;
      /* 合并后前后相同（打字又删回原样）→ 这步不该留在历史里：Ctrl+Z 会像没反应 */
      if (top.before === top.after) {
        this.stack.pop();
        this.cursor = this.stack.length;
        return null;
      }
      return top;
    }

    const nt = this.commit(t);
    if (nt) nt.open = true;                /* 开着的：下一次同块输入并进来 */
    return nt;
  }

  /* ---- 撤销 / 重做：只返回凭据，不碰文档 ---- */
  /* undo() → 要撤销的那条 tx：调用方 doc.source = tx.before 即可（红线 ①） */
  undo() {
    this.seal();
    if (this.cursor <= 0) return null;
    this.cursor -= 1;
    const t = this.stack[this.cursor];
    this.seal();                           /* 退回去的那一步不许再被新打字并回去 */
    return t;
  }

  redo() {
    this.seal();
    if (this.cursor >= this.stack.length) return null;
    const t = this.stack[this.cursor];
    this.cursor += 1;
    this.seal();
    return t;
  }

  /* 撤销连续 n 步（返回真正退掉的条数），给「长按 Ctrl+Z」用 */
  undoMany(n) {
    let k = 0;
    for (let i = 0; i < (n | 0); i++) { if (!this.undo()) break; k++; }
    return k;
  }
  redoMany(n) {
    let k = 0;
    for (let i = 0; i < (n | 0); i++) { if (!this.redo()) break; k++; }
    return k;
  }

  /* ===================================================================
   * rebase(extBefore, extAfter) → { ok, source, kept, dropped, gaps, conflicts }
   *
   * 外部改动（宿主 / 同步 / 大纲）进来时调用。**绝不清栈**（红线 ③）：
   *   ① 逐条把 {before, after} 用三方合并搬到新版本上；
   *      merge3 是纯函数 → 原本相等的两个字符串映射后仍相等，
   *      所以「链」在能干净合并时自动保持。
   *   ② 冲突的丢掉，gaps++。
   *   ③ 最后强制校验链完整性（tx[i].after === tx[i+1].before），
   *      从断点起整段砍掉 —— 宁可少撤，不可撤错（红线 ④）。
 *   ④ 「栈里不许有空转事务」：重映射后 before === after 的那条（改动已被外部
 *      改动吸收）也丢掉并计入 gaps —— 留着它，Ctrl+Z 会像没反应。
   *
   * 返回的 source 是**重映射之后的当前状态**（本地改动 + 外部改动），
   * 调用方应当把它写回文档 —— 它可能不等于 extAfter。
   * =================================================================== */
  rebase(extBefore, extAfter) {
    const eb = str(extBefore), ea = str(extAfter);
    this.rebases += 1;
    this.seal();

    const res = { ok: true, source: this.state(), kept: this.stack.length, dropped: 0,
                  gaps: this.gaps, conflicts: [], detail: null, total: this.stack.length };
    if (eb === ea) return res;                       /* 外部其实什么都没改 */

    const n = this.stack.length;
    const oldCursor = this.cursor;
    const self = this;
    function log(reason, t, line) {
      self.dropped.push({ reason: reason, id: t ? t.id : null, label: t ? t.label : "", line: line == null ? null : line });
      if (self.dropped.length > 60) self.dropped.splice(0, self.dropped.length - 60);
    }

    /* ① 当前内容在新世界里是什么。**这份文件不许被静默改掉** —— 它是用户眼前的东西。 */
    const curNew = merge3(eb, this.state(), ea);
    if (!curNew.ok) {
      /* 连当前内容都合不了（外部改了同一处）→ 只能接受外部版本并把历史全清，诚实计入 gaps */
      this.base = ea;
      this.stack = [];
      this.cursor = 0;
      this.gaps += n;
      log("state-conflict", null, curNew.line);
      res.ok = false; res.source = ea; res.kept = 0; res.dropped = n; res.gaps = this.gaps;
      res.conflicts.push({ id: null, label: "当前内容", line: curNew.line });
      res.detail = { where: "state", line: curNew.line, base: curNew.base, ours: curNew.ours,
                     theirs: curNew.theirs, why: curNew.why };
      return res;
    }
    const newState = curNew.text;

    /* ② 逐条重映射。merge3 是纯函数 ⇒ 原本相等的两个字符串映射后仍相等，
     *    所以「能合的那些」之间链自动保持 —— 不必也不许去猜。 */
    const rem = [];
    for (let i = 0; i < n; i++) {
      const t = this.stack[i];
      const nb = merge3(eb, t.before, ea);
      const na = merge3(eb, t.after, ea);
      if (!nb.ok || !na.ok) {
        const c = nb.ok ? na : nb;
        rem.push(null);
        if (!res.detail) {
          res.detail = { where: "tx", id: t.id, label: t.label, line: c.line,
                         base: c.base, ours: c.ours, theirs: c.theirs, why: c.why };
        }
        res.conflicts.push({ id: t.id, label: t.label, line: c.line });
        log("conflict", t, c.line);
        continue;
      }
      const c2 = shallow(t);
      c2.before = nb.text;
      c2.after = na.text;
      rem.push(c2);
    }

    /* ③ 从「当前那一步」往两边接成连续的一段。
     *    停下来就是停 —— 不跳过、不猜。撤不回原处的一律不留（宁可少撤，不可撤错）。 */
    const pastIdx = [];
    let expect = newState;
    for (let i = oldCursor - 1; i >= 0; i--) {
      const t = rem[i];
      if (!t || t.after !== expect) break;
      if (t.before === t.after) continue;             /* 空转：不留（Ctrl+Z 会像没反应） */
      pastIdx.unshift(i);
      expect = t.before;
    }
    const futureIdx = [];
    expect = newState;
    for (let i = oldCursor; i < n; i++) {
      const t = rem[i];
      if (!t || t.before !== expect) break;
      if (t.before === t.after) continue;
      futureIdx.push(i);
      expect = t.after;
    }

    const keptIdx = pastIdx.concat(futureIdx);
    const keptSet = new Set(keptIdx);
    for (let i = 0; i < n; i++) {
      if (keptSet.has(i) || !rem[i]) continue;        /* 冲突的已经记过了 */
      log(rem[i].before === rem[i].after ? "absorbed" : "unreachable", rem[i], null);
    }

    this.stack = keptIdx.map(function (i) { return rem[i]; });
    this.cursor = pastIdx.length;
    /* floor = 撤销链底下的那一步的状态；链是空的时候 floor 就是当前内容（地板不再可达，如实反映） */
    this.base = pastIdx.length ? rem[pastIdx[0]].before : newState;

    res.dropped = n - keptIdx.length;
    this.gaps += res.dropped;
    res.source = this.state();
    res.kept = this.stack.length;
    res.gaps = this.gaps;
    res.ok = res.dropped === 0;
    return res;
  }

  /* 给 UI 用的一句人话（红线：gaps 必须被呈现，不许静默丢历史） */
  describeGaps() {
    if (!this.gaps) return "";
    return "更早的 " + this.gaps + " 步已与磁盘版本分叉，无法撤销";
  }

  stats() {
    return {
      length: this.stack.length, depth: this.cursor, future: this.future,
      gaps: this.gaps, rebases: this.rebases, coalesces: this.coalesces,
      canUndo: this.canUndo(), canRedo: this.canRedo(),
    };
  }

  /* 自检：链必须首尾相接，且每条 before/after 都是真改动 */
  checkChain() {
    const bad = [];
    let expected = this.base;
    for (let i = 0; i < this.stack.length; i++) {
      const t = this.stack[i];
      if (t.before !== expected) bad.push("tx[" + i + "](" + t.label + ") 的 before 接不上前一条的 after");
      if (t.before === t.after) bad.push("tx[" + i + "](" + t.label + ") 是空转事务");
      expected = t.after;
    }
    if (this.cursor < 0 || this.cursor > this.stack.length) bad.push("cursor 越界：" + this.cursor);
    return { ok: bad.length === 0, errors: bad };
  }
}

/* 注意：导出对象里不得出现嵌套花括号（构建正则用 [^}]* 匹配） */
module.exports = {
  History: History,
  merge3: merge3,
  diffHunks: diffHunks,
  normalizeHunks: normalizeHunks,
};
