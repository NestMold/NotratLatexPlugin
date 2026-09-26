# -*- coding: utf-8 -*-
r"""v0.8.1 补丁 2/2：panels/editor.tsx —— 导言区渲染成成品的页首。

用户报的问题：「导言区没有正常渲染呢」

根因（实测，不是猜）：导言区这一块从没走过预览内核 —— 它只被渲染成一个折叠的源码坨：

    <details class="wys-blk wys-fold"><summary>导言区 · 8 行</summary>
      <span class="wys-edit">\documentclass[12pt]{ctexart}\n\usepackage{amsmath}\n…</span></details>

而只读预览对同一份 .tex 是这样的：

    <div class="pv-title"><div class="pv-title-main">基于深度学习的文本摘要研究（插件演示样例）</div>
                       <div class="pv-author">张三</div></div>

所以「就地编辑」这层根本没有页首：\title / \author 躺在源码里，\documentclass / \usepackage
是一坨裸文本。这就是「没渲染」—— 而且它跟只读预览对不上，正好是用户最在意的那种不一致。

本补丁：
  [1] 导言区渲染成页首：标题 / 作者 / 日期（与 .pv-title 同构）+ 文档类、宏包小标签
  [2] 每一项都能点开、在**原地**改它那一行；改的只是「正文」，前缀后缀原样带回
  [3] 整体源码留一个折叠兜底入口（\begin{document} 等没被认领的行仍改得到）
  [4] 顺手堵一个丢稿口子：开浮层前先把正在打字的正文块落地（preventDefault 挡掉了 blur）
  [5] 再加一层：浮层开着的期间 DOM 若被重建，行内原子按「同块 + 同原文」找回新节点
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


# ==================================================== [1] CSS
rep(
    """.wys-atomblk-body>:last-child{margin-bottom:0}""",
    """.wys-atomblk-body>:last-child{margin-bottom:0}
/* ---------- 导言区（页首）：渲染成成品的样子，不是一坨源码 ----------
 * 数值必须与 PV_CSS 的 .pv-title / .pv-title-main / .pv-author / .pv-date 逐项一致，
 * 否则同一份 .tex 在这层和「只读预览」里页首长两样（check-v080-flat.js 会逐项对账）。 */
.wys-front,.wys-front:hover,.wys-front:focus-within{background:transparent;box-shadow:none}
.wys-front-head{text-align:center;margin:18px 0 26px}
.wys-front-t{font-size:22px;font-weight:700;line-height:1.4}
.wys-front-a{margin-top:8px;color:hsl(var(--muted-foreground))}
.wys-front-d{margin-top:2px;color:hsl(var(--muted-foreground));font-size:13px}
/* 「一行一项」的就地编辑目标：渲染出来的是成品的样子，点一下在原地改它那一行。
 * 与正文块「点哪改哪」是同一套动作，区别是不开放 contenteditable ——
 * 标题里的 \\LaTeX / \\thanks 照样是有损渲染，直接敲会把命令烧掉。 */
.wys-fmline{cursor:text;border-radius:5px;transition:background .12s ease,box-shadow .12s ease}
.wys-fmline:hover{background:hsl(var(--muted)/.4);box-shadow:0 0 0 3px hsl(var(--muted)/.4)}
.wys-fmline.picked{background:hsl(var(--primary)/.08);box-shadow:0 0 0 3px hsl(var(--primary)/.14)}
.wys-front-meta{display:flex;flex-wrap:wrap;gap:5px;justify-content:center;align-items:center;margin:-12px 0 20px}
.wys-chip{display:inline-flex;align-items:center;gap:3px;padding:0 7px;border-radius:999px;border:1px solid hsl(var(--border));background:hsl(var(--muted)/.3);color:hsl(var(--muted-foreground));font-family:Consolas,'Courier New',monospace;font-size:11px;line-height:17px;white-space:nowrap}
.wys-chip b{color:hsl(var(--foreground)/.82);font-weight:600}
.wys-chip i{font-style:normal;opacity:.7}
/* 导言区整体源码：默认收起，落在页首下方 —— 上面没认领的行（\\begin{document} 等）从这里改得到。 */
.wys-raw{margin:0 0 16px}
.wys-raw>summary{cursor:pointer;list-style:none;text-align:center;font-family:Consolas,monospace;font-size:11px;color:hsl(var(--muted-foreground));padding:1px 2px;border-radius:5px}
.wys-raw>summary::-webkit-details-marker{display:none}
.wys-raw>summary:hover{background:hsl(var(--muted)/.5);color:hsl(var(--foreground))}
.wys-raw .wys-edit{display:block;margin:6px 0;padding:6px 10px;border-left:2px solid hsl(var(--border));font-family:Consolas,'Courier New',monospace;font-size:12.5px;line-height:1.75;white-space:pre-wrap;color:hsl(var(--foreground)/.78)}
""",
    "CSS：页首 + 可就地编辑的项 + 标签 + 源码兜底入口",
)

# ==================================================== [2] wysFmLine helper
rep(
    """/* 整篇 → 就地编辑层 HTML。只渲染块模型给出的边界，绝不重新发明结构。 */""",
    """/* 导言区里「一行一项」的可点元素（标题 / 作者 / 日期 / 文档类 / 宏包）。
 * 渲染出来的是**成品的样子**；点一下开就地编辑器改这一行 —— 与正文块「点哪改哪」同一套动作。
 * 之所以不开放 contenteditable：这些内容照样是有损渲染（\\LaTeX / \\thanks 之类），
 * 让用户直接敲就会把命令烧掉。改的始终是那一行的「正文」，前缀（\\title{ / \\usepackage{）
 * 与后缀（}）原样带回；提交时还有一条自检，要求「前缀 + 原正文 + 后缀」逐字节等于原行。 */
function wysFmLine(it, what, key, cls, inner) {
  return '<span class="wys-fmline' + (cls ? " " + cls : "") + '" contenteditable="false"' +
    ' data-fk="' + escAttr(key) + '"' +
    ' data-s="' + it.s + '" data-e="' + it.e + '"' +
    ' data-tex="' + escAttr(it.body) + '"' +
    ' data-prefix="' + escAttr(it.prefix) + '"' +
    ' data-suffix="' + escAttr(it.suffix) + '"' +
    ' data-what="' + escAttr(what) + '"' +
    ' title="' + escAttr(it.prefix + it.body + it.suffix) + '">' + inner + "</span>";
}

/* 整篇 → 就地编辑层 HTML。只渲染块模型给出的边界，绝不重新发明结构。 */""",
    "新增 wysFmLine()",
)

# ==================================================== [3] 导言区渲染
rep(
    """    /* 导言区：默认收起成一行。它不是内容，但 \\title / \\usepackage 偶尔确实要改，
     * 所以留一个可展开的入口，而不是像以前那样把 8 行源码摊在正文最上面。 */
    if (b.type === "preamble") {
      const nLines = b.endLine - b.startLine + 1;
      out.push(
        '<details class="wys-blk wys-fold"' + base + ">" +
          "<summary>导言区 · " + nLines + " 行</summary>" +
          '<span class="wys-edit" contenteditable="true">' + WYS.escHtml(String(b.raw == null ? "" : b.raw)) + "</span>" +
        "</details>"
      );
      continue;
    }""",
    """    /* ---------- 导言区：渲染成成品的页首，不是一坨源码 ----------
     * 用户报的问题：「导言区没有正常渲染呢」。
     * 根因：这里以前只把 L1–8 原文塞进一个折叠的 <details>，而只读预览把同一份 .tex
     * 渲染成了页首（\\title → 大字标题、\\author → 作者行）。于是「就地编辑」这一层
     * 没有页首，标题躺在源码里 —— 这正是「没渲染」，也正是两种形态对不上的地方。
     * 现在：标题 / 作者 / 日期渲染成页首，\\documentclass / \\usepackage 渲染成小标签，
     * 每一项都点得开、在**原地**改它那一行；整体源码留一个折叠兜底入口。 */
    if (b.type === "preamble") {
      const raw0 = String(b.raw == null ? "" : b.raw);
      const fm = WYS.parsePreamble ? WYS.parsePreamble(raw0, b.startLine) : null;
      let inner = "";
      if (fm) {
        if (fm.title || fm.author || fm.date) {
          inner += '<div class="wys-front-head">';
          if (fm.title) inner += '<div class="wys-front-t">' + wysFmLine(fm.title, "标题", "fm:title", "", wysInline(fm.title.body, renderMath)) + "</div>";
          if (fm.author) inner += '<div class="wys-front-a">' + wysFmLine(fm.author, "作者", "fm:author", "", wysInline(fm.author.body, renderMath)) + "</div>";
          if (fm.date) inner += '<div class="wys-front-d">' + wysFmLine(fm.date, "日期", "fm:date", "", wysInline(fm.date.body, renderMath)) + "</div>";
          inner += "</div>";
        }
        const chips = [];
        if (fm.cls) {
          chips.push(wysFmLine(fm.cls, "文档类", "fm:cls", "wys-chip",
            "<b>" + WYS.escHtml(fm.cls.body) + "</b>" + (fm.cls.opt ? " <i>· " + WYS.escHtml(fm.cls.opt) + "</i>" : "")));
        }
        for (let pi = 0; pi < fm.pkgs.length; pi++) {
          chips.push(wysFmLine(fm.pkgs[pi], "宏包", "fm:pkg:" + pi, "wys-chip",
            WYS.escHtml(fm.pkgs[pi].name || fm.pkgs[pi].body)));
        }
        if (chips.length) inner += '<div class="wys-front-meta">' + chips.join("") + "</div>";
      }
      /* 兜底入口：上面没认领的行（\\begin{document}、少见的导言区命令）仍从这里改得到。
       * 它同时是这一块**唯一**的 .wys-edit —— commitWys 就靠它读回「整体改动」。 */
      inner += '<details class="wys-raw"><summary>⋯ 导言区源码 · ' + (b.endLine - b.startLine + 1) + " 行</summary>" +
        '<span class="wys-edit" contenteditable="true">' + WYS.escHtml(raw0) + "</span></details>";
      out.push('<div class="wys-blk wys-front"' + base + ">" + inner + "</div>");
      continue;
    }""",
    "导言区：折叠源码 -> 渲染成页首 + 可就地编辑的项",
)

# ==================================================== [4] 原子块加稳定 key
rep(
    """      '<div class="wys-atomblk" data-line="' + (b.startLine + 1) + '"' + base +
        ' data-tex="' + escAttr(raw) + '">' +""",
    """      '<div class="wys-atomblk" data-line="' + (b.startLine + 1) + '"' + base +
        ' data-key="blk:' + b.id + '" data-tex="' + escAttr(raw) + '">' +""",
    "原子块：加 data-key（DOM 重建后靠它找回同一项）",
)

# ==================================================== [5] pickAtom
rep(
    """      const prev = root.querySelector(".wys-atomblk.picked");
      if (prev && prev !== el) prev.classList.remove("picked");""",
    """      const prev = root.querySelectorAll(".wys-atomblk.picked, .wys-fmline.picked");
      for (let pi = 0; pi < prev.length; pi++) if (prev[pi] !== el) prev[pi].classList.remove("picked");""",
    "pickAtom：同时管原子块与导言区项",
)

# ==================================================== [6] mousedown 分派
rep(
    """    if (t.closest(".wys-pop")) return;          // 浮层内部的点击不归这里管
    const inline = t.closest(".wys-atom");
    if (inline) { e.preventDefault(); openInline(inline); return; }
    const blk = t.closest(".wys-atomblk");
    if (blk) { e.preventDefault(); openAtom(blk); return; }
  }""",
    """    if (t.closest(".wys-pop")) return;          // 浮层内部的点击不归这里管
    /* 导言区的项排在最前面：标题里本身就可能含 \\cite / \\LaTeX 这类行内原子，
     * 那种情况下用户点的是**整行**（\\title{…}），不是标题里的某一个命令。 */
    const fm = t.closest(".wys-fmline");
    if (fm) { e.preventDefault(); openAtom(fm); return; }
    const inline = t.closest(".wys-atom");
    if (inline) { e.preventDefault(); openInline(inline); return; }
    const blk = t.closest(".wys-atomblk");
    if (blk) { e.preventDefault(); openAtom(blk); return; }
  }""",
    "mousedown：导言区项 -> 整行就地编辑",
)

# ==================================================== [7] openInline 兜底定位
rep(
    """    setAtomEdit({
      mode: "inline", node: el, tex: tex, orig: tex, s: -1, e: -1,
      x: Math.max(8, Math.min(r.left, W - 556)),
      y: Math.max(8, Math.min(r.bottom + 6, H - 220)),
    });""",
    """    const host = el.closest ? el.closest(".wys-blk") : null;
    setAtomEdit({
      mode: "inline", node: el, tex: tex, orig: tex, s: -1, e: -1,
      blkS: host ? host.getAttribute("data-s") : null,
      x: Math.max(8, Math.min(r.left, W - 556)),
      y: Math.max(8, Math.min(r.bottom + 6, H - 220)),
    });""",
    "openInline：记下所在块，供 DOM 重建后找回",
)

# ==================================================== [8] openAtom 重写
rep(
    """  /* 打开某一原子块的就地编辑器。改点别的块时先把上一块落地 —— 不能悄悄吞掉改动。 */
  function openAtom(el) {
    const bid = el.getAttribute("data-bid");
    if (atomEdit && atomEdit.bid === bid) return;   // 已经开着它了
    if (atomEdit) commitAtom();                     // 上一块先提交，别丢
    const s0 = parseInt(el.getAttribute("data-s"), 10);
    const e0 = parseInt(el.getAttribute("data-e"), 10);
    if (!(s0 >= 0) || !(e0 >= s0)) return;
    const tex = el.getAttribute("data-tex") || "";
    const r = el.getBoundingClientRect();
    pickAtom(el);
    const W = typeof window === "undefined" ? 1200 : window.innerWidth;
    const H = typeof window === "undefined" ? 800 : window.innerHeight;
    setAtomEdit({
      mode: "block", bid: bid, s: s0, e: e0, tex: tex, orig: tex,
      x: Math.max(8, Math.min(r.left, W - 556)),
      y: Math.max(8, Math.min(r.bottom + 6, H - 220)),
    });
  }""",
    """  /* 一个就地编辑目标的身份。**不能拿 DOM 节点当身份**：DOM 一重建节点就换人了，
   * 同一个目标会被当成新的，浮层会莫名其妙地重开、高亮会消失。 */
  function keyOf(el) {
    const fk = el.getAttribute("data-fk");
    if (fk) return fk;
    const dk = el.getAttribute("data-key");
    return dk || ("bid:" + el.getAttribute("data-bid"));
  }

  /* 此时此地读一份「编辑目标」的快照。必须在动手之前读 —— 下面一落地，DOM 就重建了。 */
  function specOf(el) {
    const s0 = parseInt(el.getAttribute("data-s"), 10);
    const e0 = parseInt(el.getAttribute("data-e"), 10);
    if (!(s0 >= 0) || !(e0 >= s0)) return null;
    const r = el.getBoundingClientRect();
    return {
      s: s0, e: e0,
      tex: el.getAttribute("data-tex") || "",
      prefix: el.getAttribute("data-prefix"),
      suffix: el.getAttribute("data-suffix"),
      what: el.getAttribute("data-what") || "",
      x: r.left, y: r.bottom + 6,
    };
  }

  /* preventDefault 挡掉了 blur，正在打字的正文块还没回写；而 applyEdits 是拿 content 算的。
   * 不先把正文落地就开浮层，两边行号会错位 —— 那是最容易丢稿的一种错位。 */
  function flushTextEdits() {
    if (!wysEditing.current) return;
    wysEditing.current = false;
    commitWys();
  }

  /* 打开某一处就地编辑器（原子块 / 导言区的某一项）。改点别处时先把上一处落地。 */
  function openAtom(el) {
    const key = keyOf(el);
    if (atomEdit && atomEdit.key === key) return;   // 已经开着它了
    const sp = specOf(el);
    if (!sp) return;
    if (atomEdit) commitAtom();                     // 上一处先提交，别丢
    flushTextEdits();                               // 正在打字的正文块也先落地
    pickAtom(el);
    const W = typeof window === "undefined" ? 1200 : window.innerWidth;
    const H = typeof window === "undefined" ? 800 : window.innerHeight;
    setAtomEdit({
      mode: "block", key: key, el: el, s: sp.s, e: sp.e, tex: sp.tex, orig: sp.tex,
      prefix: sp.prefix, suffix: sp.suffix, what: sp.what,
      x: Math.max(8, Math.min(sp.x, W - 556)),
      y: Math.max(8, Math.min(sp.y, H - 220)),
    });
  }""",
    "openAtom：稳定 key + 快照先行 + 正文先落地",
)

# ==================================================== [9] commitAtom
rep(
    """    if (a.mode === "inline") {
      const node = a.node;
      setAtomEdit(null);
      if (!node || !node.setAttribute) return;
      node.setAttribute("data-tex", a.tex);
      node.setAttribute("title", a.tex);
      commitWys();          // 读回时 data-tex 已是新值 → 只改动所在的那一块
      return;
    }

    let next;
    try {
      if (WYS.applyEdits(content, []) !== content) throw new Error("空编辑集未逐字节还原");
      next = WYS.applyEdits(content, [{ startLine: a.s, endLine: a.e, newText: a.tex }]);
      WYS.parseDoc(next);
    } catch (err) {
      setToast({ msg: "⚠ 这一块的写回没过自检，已放弃：" + String((err && err.message) || err) });
      setAtomEdit(null);
      return;
    }
    wysUndoRef.current = content;
    onChange(next);
    setToast({ msg: "✏ 已就地改写 L" + (a.s + 1) + (a.e > a.s ? "–" + (a.e + 1) : "") + " 这一块", undo: true });
    setAtomEdit(null);""",
    """    if (a.mode === "inline") {
      setAtomEdit(null);
      let node = a.node;
      /* 浮层开着的这段时间里 DOM 可能被重建过（比如焦点一离开正文就触发了 commitWys）。
       * 那时原节点已经成了孤儿，往孤儿身上写 data-tex 等于把这次修改丢进黑洞。
       * 按「同一个块 + 同一段原文」把新节点找回来；找不到就明说，绝不假装改成功了。 */
      if (node && !node.isConnected) {
        const root2 = pvRef.current;
        const host = root2 && a.blkS != null ? root2.querySelector('.wys-blk[data-s="' + a.blkS + '"]') : null;
        const all = host ? host.querySelectorAll(".wys-atom") : [];
        node = null;
        for (let i = 0; i < all.length; i++) {
          if (all[i].getAttribute("data-tex") === a.orig) { node = all[i]; break; }
        }
      }
      if (!node || !node.setAttribute) {
        setToast({ msg: "⚠ 这一段在编辑期间被重排过，没能落回去 —— 请再点一次它" });
        return;
      }
      node.setAttribute("data-tex", a.tex);
      node.setAttribute("title", a.tex);
      commitWys();          // 读回时 data-tex 已是新值 → 只改动所在的那一块
      return;
    }

    let next;
    try {
      if (WYS.applyEdits(content, []) !== content) throw new Error("空编辑集未逐字节还原");
      /* 导言区那几项改的只是「正文」，写回时要拼回前缀与后缀（\\title{ … }）。
       * 自检：前缀 + **原正文** + 后缀 必须逐字节等于原行 —— 否则「改显示」就变成「改源码」了。 */
      let newText = a.tex;
      if (a.prefix != null || a.suffix != null) {
        const back = String(a.prefix == null ? "" : a.prefix) + a.orig + String(a.suffix == null ? "" : a.suffix);
        if (back !== content.split("\\n").slice(a.s, a.e + 1).join("\\n")) {
          throw new Error("前缀/后缀拼接未能逐字节还原原行");
        }
        newText = String(a.prefix == null ? "" : a.prefix) + a.tex + String(a.suffix == null ? "" : a.suffix);
      }
      next = WYS.applyEdits(content, [{ startLine: a.s, endLine: a.e, newText: newText }]);
      WYS.parseDoc(next);
    } catch (err) {
      setToast({ msg: "⚠ 这一处的写回没过自检，已放弃：" + String((err && err.message) || err) });
      setAtomEdit(null);
      return;
    }
    wysUndoRef.current = content;
    onChange(next);
    setToast({ msg: "✏ 已就地改写" + (a.what ? a.what : "这一块") + "（L" + (a.s + 1) + (a.e > a.s ? "–" + (a.e + 1) : "") + "）", undo: true });
    setAtomEdit(null);""",
    "commitAtom：行内兜底定位 + 导言区前缀后缀回拼与自检",
)

# ==================================================== [10] onPreviewClick
rep(
    """    if (t && t.closest && (t.closest(".wys-atom") || t.closest(".wys-atomblk"))) return;
    pickAtom(null);""",
    """    if (t && t.closest && (t.closest(".wys-fmline") || t.closest(".wys-atom") || t.closest(".wys-atomblk"))) return;
    pickAtom(null);""",
    "onPreviewClick：导言区项也算「点开了编辑」，别立刻清掉高亮",
)

# ==================================================== [11] DOM 重建后重新标注
rep(
    """      wysOrigRef.current = map;
    }
    /* 图每拍补一次：富渲染的卡片里也会有 img[data-asset] */""",
    """      wysOrigRef.current = map;
      /* 就地编辑器开着时，DOM 一重建，原来那个节点就成了孤儿。
       * 按稳定 key 把新节点找回来重新标出来 —— 否则「我正在改这一项」的高亮会凭空消失。 */
      if (atomEdit && atomEdit.key) {
        const again = root.querySelector('[data-fk="' + atomEdit.key + '"], [data-key="' + atomEdit.key + '"]');
        if (again) pickAtom(again);
      }
    }
    /* 图每拍补一次：富渲染的卡片里也会有 img[data-asset] */""",
    "innerHTML 同步：DOM 重建后按 key 重新标注",
)

# ==================================================== [12] 浮层标题带 what
rep(
    """              <b>{atomEdit.mode === "inline" ? "就地编辑引用" : "就地编辑这一块"}</b>""",
    """              <b>{atomEdit.mode === "inline" ? "就地编辑引用" : (atomEdit.what ? "就地编辑 · " + atomEdit.what : "就地编辑这一块")}</b>""",
    "浮层标题：显示改的是哪一项",
)

if s == orig:
    print("NO CHANGE")
    sys.exit(1)
io.open(P, "w", encoding="utf-8").write(s)
print("\nOK panels/editor.tsx（" + str(n) + " 处）")
