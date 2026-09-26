# -*- coding: utf-8 -*-
r"""v0.8.0 修正：类名撞车 + 行内原子也能就地编辑。

【撞车】
  wysInline（v0.7.0 起）给行内原子用的是 class="wys-atom wys-cite|wys-ref|wys-math"。
  我这轮给块级原子块也起了 .wys-atom —— 于是 .wys-atom 计数把 4 个块级和一堆行内混在一起，
  门禁「原子块数 == 4」当场红。块级改名 .wys-atomblk，行内保持 .wys-atom 不动。

【缺口】
  改块级的时候漏了行内 —— 但 \cite / \ref 恰恰是文档里最常改的东西。
  用户要「在结果上像 Word 一样改」，点 [1] 没反应是不合格的。
  做法：点行内原子 → 同一套浮层 → 提交时**只改该节点的 data-tex 属性**，
       再走常规 commitWys()。因为 wysDomToTex 遇到带 data-tex 的节点就原样吐出该属性，
       所以改属性 = 改这一块的回写结果，不需要重算偏移，也碰不到块里别的原子。
"""
import io
import sys

P = "panels/editor.tsx"
s = io.open(P, encoding="utf-8").read()
orig = s
n = 0


def rep(old, new, tag):
    global s, n
    if old not in s:
        print("MISS  " + tag)
        sys.exit(1)
    s = s.replace(old, new, 1)
    n += 1
    print("  ok  " + tag)


# ---------------- 1) CSS：块级原子改名 ----------------
rep(
    """.wys-atom{position:relative;margin:14px 0;border-radius:8px;border:1px solid transparent;cursor:text;transition:border-color .12s ease,background .12s ease}
.wys-atom:hover{border-color:hsl(var(--border));background:hsl(var(--muted)/.14)}
.wys-atom.picked{border-color:hsl(var(--primary)/.6);background:hsl(var(--primary)/.05)}
.wys-atom-body{padding:2px 4px}
.wys-atom-body>:first-child{margin-top:0}
.wys-atom-body>:last-child{margin-bottom:0}""",
    """/* 注意别和行内原子 .wys-atom（\cite / \ref / 行内公式，见文件前段）撞名：
 * 行内那种是**片段**，块级这种是**整块**，两者结构和提交路径都不同。 */
.wys-atomblk{position:relative;margin:14px 0;border-radius:8px;border:1px solid transparent;cursor:text;transition:border-color .12s ease,background .12s ease}
.wys-atomblk:hover{border-color:hsl(var(--border));background:hsl(var(--muted)/.14)}
.wys-atomblk.picked{border-color:hsl(var(--primary)/.6);background:hsl(var(--primary)/.05)}
.wys-atomblk-body{padding:2px 4px}
.wys-atomblk-body>:first-child{margin-top:0}
.wys-atomblk-body>:last-child{margin-bottom:0}""",
    "CSS：块级 .wys-atom -> .wys-atomblk",
)

# ---------------- 2) 渲染：块级原子改名 ----------------
rep(
    """'<div class="wys-atom" data-line="'""",
    """'<div class="wys-atomblk" data-line="'""",
    "渲染：块级原子外层改名",
)
rep(
    """'<div class="wys-atom-body">'""",
    """'<div class="wys-atomblk-body">'""",
    "渲染：块级原子内层改名",
)

# ---------------- 3) pickAtom ----------------
rep(
    """      const prev = root.querySelector(".wys-atom.picked");""",
    """      const prev = root.querySelector(".wys-atomblk.picked");""",
    "pickAtom：选中态选择器",
)

# ---------------- 4) mousedown 分派 ----------------
rep(
    """  /* 点原子块 → 在**原地**打开就地编辑器。
   * 为什么挂在 mousedown 而不是 click：等 click 的话，焦点会先从正在编辑的正文块上
   * 掉下来 → blur → commitWys → 整层 innerHTML 重建 → 被点的那个原子块已经不是
   * 同一个 DOM 节点了，浮层算出来的位置也跟着失效。 */
  function onPreviewMouseDown(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest(".wys-pop")) return;          // 浮层内部的点击不归这里管
    const atom = t.closest(".wys-atom");
    if (!atom) return;
    e.preventDefault();                          // 别让光标落进只读的渲染结果里
    openAtom(atom);
  }""",
    """  /* 点原子 → 在**原地**打开就地编辑器。分两种，别混：
   *   行内原子 .wys-atom    —— \\cite{key} / \\ref{lab} / 行内公式，是**片段**
   *   块级原子 .wys-atomblk —— 公式环境 / 浮动体 / 参考文献，是**整块**
   * 行内要先判：块级原子的渲染结果里也可能含行内原子（比如图 caption 里的 \\ref），
   * 那种情况下用户点的是那个 \\ref，不是整个浮动体。
   *
   * 为什么挂在 mousedown 而不是 click：等 click 的话，焦点会先从正在编辑的正文块上
   * 掉下来 → blur → commitWys → 整层 innerHTML 重建 → 被点的那块已经不是同一个
   * DOM 节点了，浮层算出来的位置也跟着失效。 */
  function onPreviewMouseDown(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest(".wys-pop")) return;          // 浮层内部的点击不归这里管
    const inline = t.closest(".wys-atom");
    if (inline) { e.preventDefault(); openInline(inline); return; }
    const blk = t.closest(".wys-atomblk");
    if (blk) { e.preventDefault(); openAtom(blk); return; }
  }

  /* 行内原子（[1] / 图 1 / 行内公式）的就地编辑。
   * 提交路径不同：不替换整块，只改这个节点的 data-tex 属性 —— 见 commitAtom。 */
  function openInline(el) {
    const tex = el.getAttribute("data-tex") || "";
    if (!tex) return;
    if (atomEdit && atomEdit.node === el) return;
    if (atomEdit) commitAtom();
    const r = el.getBoundingClientRect();
    const W = typeof window === "undefined" ? 1200 : window.innerWidth;
    const H = typeof window === "undefined" ? 800 : window.innerHeight;
    setAtomEdit({
      mode: "inline", node: el, tex: tex, orig: tex, s: -1, e: -1,
      x: Math.max(8, Math.min(r.left, W - 556)),
      y: Math.max(8, Math.min(r.bottom + 6, H - 220)),
    });
  }""",
    "mousedown：分派行内 / 块级 + 新增 openInline",
)

# ---------------- 5) openAtom 加 mode ----------------
rep(
    """    setAtomEdit({
      bid: bid, s: s0, e: e0, tex: tex, orig: tex,
      x: Math.max(8, Math.min(r.left, W - 556)),
      y: Math.max(8, Math.min(r.bottom + 6, H - 220)),
    });""",
    """    setAtomEdit({
      mode: "block", bid: bid, s: s0, e: e0, tex: tex, orig: tex,
      x: Math.max(8, Math.min(r.left, W - 556)),
      y: Math.max(8, Math.min(r.bottom + 6, H - 220)),
    });""",
    "openAtom：标记 mode=block",
)

# ---------------- 6) commitAtom 分支 ----------------
rep(
    """  /* 提交原子块：仍然走 applyEdits 只替换**这一块的行区间**，三道自检一条不少。 */
  function commitAtom() {
    const a = atomEdit;
    if (!a) return;
    pickAtom(null);
    if (a.tex === a.orig) { setAtomEdit(null); return; }
    let next;""",
    """  /* 提交原子编辑。两条路径：
   *   行内 → 只改该节点的 data-tex，再走常规的块提交（wysDomToTex 遇到带 data-tex 的
   *          节点就原样吐出该属性，所以改属性 == 改这一块的回写结果，不需要重算偏移，
   *          也不会碰到块里别的原子）。
   *   块级 → 走 applyEdits 只替换**这一块的行区间**，三道自检一条不少。
   * 显示不在这里手动改：onChange 之后整层会用新源码重渲染，所见即所得。 */
  function commitAtom() {
    const a = atomEdit;
    if (!a) return;
    if (atomPickedRef.current) { try { atomPickedRef.current.classList.remove("picked"); } catch (e0) {} }
    atomPickedRef.current = null;
    if (a.tex === a.orig) { setAtomEdit(null); return; }

    if (a.mode === "inline") {
      const node = a.node;
      setAtomEdit(null);
      if (!node || !node.setAttribute) return;
      node.setAttribute("data-tex", a.tex);
      node.setAttribute("title", a.tex);
      commitWys();          // 读回时 data-tex 已是新值 → 只改动所在的那一块
      return;
    }

    let next;""",
    "commitAtom：行内 / 块级双路径",
)

# ---------------- 7) onPreviewClick ----------------
rep(
    """    if (t && t.closest && t.closest(".wys-blk")) { pickAtom(null); return; }
    if (!(t && t.closest && t.closest(".wys-atom"))) pickAtom(null);""",
    """    if (t && t.closest && (t.closest(".wys-atom") || t.closest(".wys-atomblk"))) return;
    pickAtom(null);""",
    "onPreviewClick：识别两种原子，其余情况收起高亮",
)

# ---------------- 8) 注释里的 ✏ 会误触发门禁 ----------------
rep(
    """    /* v0.7.2：不再往宿主状态栏塞「✏ 就地编辑」—— 顶栏已经明示，重复只是噪音 */""",
    """    /* v0.7.2 起不再往宿主状态栏塞「就地编辑」—— 顶栏已经明示，重复只是噪音 */""",
    "注释：去掉 ✏（门禁查字符串，注释会误触发）",
)

# ---------------- 9) 浮层标题随模式变 ----------------
rep(
    """              <b>就地编辑</b>
              <span>L{atomEdit.s + 1}{atomEdit.e > atomEdit.s ? "–" + (atomEdit.e + 1) : ""}</span>""",
    """              <b>{atomEdit.mode === "inline" ? "就地编辑引用" : "就地编辑这一块"}</b>
              <span>{atomEdit.mode === "inline" ? "改完这段立刻生效" : "L" + (atomEdit.s + 1) + (atomEdit.e > atomEdit.s ? "–" + (atomEdit.e + 1) : "")}</span>""",
    "浮层标题：区分行内 / 块级",
)

if s == orig:
    print("NO CHANGE")
    sys.exit(1)
io.open(P, "w", encoding="utf-8").write(s)
print("\nOK panels/editor.tsx（" + str(n) + " 处）")
