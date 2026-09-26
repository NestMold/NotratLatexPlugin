# -*- coding: utf-8 -*-
r"""v0.8.0 补丁 2/2：panels/editor.tsx —— 拆掉「模式」，改成在结果上直接编辑。

用户原话（第三次）：
    「我不要就地编辑模式和制度模式，我的意思是在结果上像编辑Mardown和WOrd一样可以快速修改啊」

前两轮我把它做成了「模式」（一个 ✏/🔒 开关 + 卡片 + { } 源码按钮绕回源码），方向错了。
用户要的心智模型是 Word / Markdown：**预览区就是那份文档本身，点哪改哪。**

本补丁：
  [1] 删掉 wysOn 开关与顶栏按钮 —— 预览区唯一形态就是「能直接改的渲染结果」
  [2] 标题显示成 `2 引言`（复用 WYS.headingNumbers），不再是 `\section{引言}` 源码三明治
  [3] 原子块（公式/图/表/文献）撤掉卡片与工具条，渲染结果直接落版；
      点一下在**原地**浮出编辑器（上：实时渲染；下：LaTeX 源码），不跳源码视图
  [4] 浮层写回仍走 applyEdits 只替换该块行区间，三道自检一条不少（防丢稿红线不变）
"""
import io
import sys

P = "panels/editor.tsx"
s = io.open(P, encoding="utf-8").read()
orig = s
steps = []


def rep(old, new, tag):
    global s
    if old not in s:
        print("MISS  " + tag)
        sys.exit(1)
    s = s.replace(old, new, 1)
    steps.append(tag)
    print("  ok  " + tag)


# ============================================================ [0] 文件头
rep(
    " *   1) \u628a WYS.parseDoc \u51fa\u7684\u5757\u6e32\u67d3\u6210\u300c\u53ef\u7f16\u8f91\u6587\u672c + \u539f\u5b50\u8282\u70b9\u300d\uff1b\n"
    " *      v0.7.4\uff1a\u6574\u9875\u5916\u89c2 = \u53ea\u8bfb\u9884\u89c8\u3002\u6ca1\u6709\u89c6\u89c9\u7ed3\u679c\u7684\u5757\uff08\u5bfc\u8a00\u533a / \u547d\u4ee4 / \u6ce8\u91ca\uff09\n"
    " *      \u4e0d\u518d\u5360\u5361\u7247\uff1b\u6709\u89c6\u89c9\u7ed3\u679c\u7684\u539f\u5b50\u5757\u4e5f\u64a4\u4e86\u5361\u7247\u58f3\uff0c\u5de5\u5177\u6761 hover \u624d\u6d6e\u51fa\u3002",
    " *   1) 把 WYS.parseDoc 出的块渲染成「可编辑文本 + 原子节点」；\n"
    " *      v0.8.0：**就地编辑不是模式，是预览区唯一的形态**。\n"
    " *      预览区就是这份文档 —— 点正文就打字、点公式就在原地改，\n"
    " *      没有「进编辑态 / 出编辑态」，没有卡片，没有 { } 源码按钮。\n"
    " *      心智模型 = Word / Markdown，不是「一个可以切换成可编辑的只读视图」。",
    "文件头：写清 v0.8.0 的形态立场",
)

# ============================================================ [1] CSS
i0 = s.index(".wys-card{position:relative;")
i1 = s.index('.wys-card[data-show="src"] .wys-card-body{display:none}')
i1 = s.index("\n", i1) + 1

NEW_CSS = r"""/* ---------- 原子块（公式 / 图 / 表 / 文献 / 环境）：外观就是最终渲染结果 ----------
 * v0.8.0：不套壳、不放按钮。点它在**原地**打开编辑器（见 .wys-pop）。
 *         hover 只留一条极淡的边，告诉用户「这里能点」—— 这也是 Word 的做法。 */
.wys-atom{position:relative;margin:14px 0;border-radius:8px;border:1px solid transparent;cursor:text;transition:border-color .12s ease,background .12s ease}
.wys-atom:hover{border-color:hsl(var(--border));background:hsl(var(--muted)/.14)}
.wys-atom.picked{border-color:hsl(var(--primary)/.6);background:hsl(var(--primary)/.05)}
.wys-atom-body{padding:2px 4px}
.wys-atom-body>:first-child{margin-top:0}
.wys-atom-body>:last-child{margin-bottom:0}
.wys-src{margin:0;padding:8px 10px;white-space:pre-wrap;overflow-wrap:break-word;font-family:Consolas,'Courier New',monospace;font-size:12.5px;line-height:1.6;color:hsl(var(--foreground)/.82);max-height:260px;overflow:auto;border-radius:6px;background:hsl(var(--muted)/.4)}
/* 标题的自动编号：与只读预览同构，不可编辑（改了标题文字它自己重算，跟 Word 一致） */
.wys-num{color:hsl(var(--muted-foreground));font-weight:600;margin-right:.45em;user-select:none}
/* ---------- 就地编辑浮层：在**原地**改公式 / 引用 / 图表，不跳源码视图 ---------- */
.wys-pop-dim{position:fixed;inset:0;z-index:59;background:transparent}
.wys-pop{position:fixed;z-index:60;width:min(540px,92vw);box-sizing:border-box;border:1px solid hsl(var(--border));border-radius:10px;background:hsl(var(--popover));box-shadow:0 14px 38px rgba(0,0,0,.34);padding:8px}
.wys-pop-pv{min-height:36px;display:flex;align-items:center;justify-content:center;padding:5px 8px;border-radius:6px;background:hsl(var(--muted)/.38);overflow:auto}
.wys-pop-pv>:first-child{margin-top:0}
.wys-pop-pv>:last-child{margin-bottom:0}
.wys-pop-ta{width:100%;box-sizing:border-box;margin-top:7px;border:1px solid hsl(var(--border));border-radius:6px;background:hsl(var(--background));color:hsl(var(--foreground));font-family:Consolas,'Courier New',monospace;font-size:12.5px;line-height:1.6;padding:6px 8px;outline:none;resize:vertical}
.wys-pop-ta:focus{border-color:hsl(var(--primary)/.6)}
.wys-pop-h{font-size:11px;color:hsl(var(--muted-foreground));padding:0 2px 5px;display:flex;align-items:center;gap:6px}
.wys-pop-h b{color:hsl(var(--foreground));font-weight:600}
.wys-pop-keys{margin-left:auto;font-family:Consolas,monospace;opacity:.75;white-space:nowrap}
"""
s = s[:i0] + NEW_CSS + s[i1:]
steps.append("WYS_CSS：卡片壳 / 工具条 -> 原子块 + 就地编辑浮层")
print("  ok  WYS_CSS：卡片壳 / 工具条 -> 原子块 + 就地编辑浮层")

# 兜底 <pre> 的类名跟着改
rep(
    '  const fallback = \'<pre class="wys-card-src" style="display:block">\' + WYS.escHtml(src) + "</pre>";',
    '  const fallback = \'<pre class="wys-src">\' + WYS.escHtml(src) + "</pre>";',
    "richBlockHtml 兜底：.wys-card-src -> .wys-src",
)

# ============================================================ [2] wellRenderDoc：编号 + 原子块
rep(
    "  const out = [];\n  const blocks = doc.blocks || [];",
    "  const out = [];\n  const blocks = doc.blocks || [];\n"
    "  /* 标题编号与只读预览同构：既然是在结果上编辑，标题就得长 `2 引言` 的样子，\n"
    "   * 而不是 `\\section{引言}` —— 后者一眼就让人知道「我还在看源码」。 */\n"
    "  const nums = WYS.headingNumbers ? WYS.headingNumbers(blocks) : new Map();",
    "wysRenderDoc：算标题编号",
)

rep(
    r"""        const lv = Math.min((b.level || 0) + 1, 4);
        const hCls = lv <= 3 ? " wys-h" + lv : " wys-par";
        out.push(
          '<div class="wys-blk' + hCls + '"' + base +
            ' data-prefix="' + escAttr(b.prefix) + '" data-suffix="' + escAttr(b.suffix) + '">' +
            '<span class="wys-fix" contenteditable="false">' + WYS.escHtml(b.prefix) + "</span>" +
            '<span class="wys-edit" contenteditable="true">' + wysInline(b.title, renderMath) + "</span>" +
            '<span class="wys-fix" contenteditable="false">' + WYS.escHtml(b.suffix) + "</span>" +
          "</div>"
        );""",
    r"""        const lv = Math.min((b.level || 0) + 1, 4);
        const hCls = lv <= 3 ? " wys-h" + lv : " wys-par";
        /* data-prefix / data-suffix 仍原样带着（回写靠它保住 \section* / [短标题] / \label），
         * 但**不再显示出来** —— 显示的是自动编号 + 标题文字，就是成品的那个样子。 */
        const hnum = nums.get(b.id) || "";
        out.push(
          '<div class="wys-blk' + hCls + '"' + base +
            ' data-prefix="' + escAttr(b.prefix) + '" data-suffix="' + escAttr(b.suffix) + '">' +
            (hnum ? '<span class="wys-num" contenteditable="false">' + WYS.escHtml(hnum) + "</span>" : "") +
            '<span class="wys-edit" contenteditable="true">' + wysInline(b.title, renderMath) + "</span>" +
          "</div>"
        );""",
    "标题：源码三明治 -> 自动编号 + 可编辑标题",
)

rep(
    r"""    /* ---------- 有视觉结果的原子块：渲染结果直接落版，工具条 hover 才浮出 ----------
     * 公式 / 浮动体 / 参考文献 / 代码环境 … 一律用预览内核渲染成富结果。
     * 块内部是只读的 —— \cite 渲染成 [1]、\ref 渲染成图 1，都是有损的，
     * 从渲染结果反推 LaTeX 会烧掉用户原稿（见文件头红线）。
     * 要改这一块：hover 出工具条 → { } 看/改源码，或 ↗ 去源码视图定位。 */
    const raw = String(b.raw == null ? "" : b.raw);
    out.push(
      '<div class="wys-card" data-line="' + (b.startLine + 1) + '"' + base + ">" +
        '<div class="wys-bar">' +
          '<span class="wys-bar-ln">' + WYS.escHtml(b.label || b.type) + " · L" + (b.startLine + 1) + (b.endLine > b.startLine ? "–" + (b.endLine + 1) : "") + "</span>" +
          '<button type="button" class="wys-bar-btn" data-act="src" title="看这一块的 LaTeX 源码（不离开预览）">{ }</button>' +
          '<button type="button" class="wys-bar-btn" data-act="goto" title="在源码视图里定位到这一块">↗</button>' +
        "</div>" +
        '<div class="wys-card-body">' + richBlockHtml(raw, renderMath, baseDir, b.startLine) + "</div>" +
        '<pre class="wys-card-src">' + WYS.escHtml(raw) + "</pre>" +
      "</div>"
    );""",
    r"""    /* ---------- 有视觉结果的原子块：渲染结果直接落版，点一下在原地编辑 ----------
     * 公式 / 浮动体 / 参考文献 / 代码环境 … 一律用预览内核渲染成富结果，**不套任何壳**。
     *
     * 为什么块内部仍然是只读的（不直接 contenteditable）：
     *   \cite{vaswani2017} 渲染成 "[1]"，\ref{fig:model} 渲染成 "图 1" —— 都是有损的。
     *   允许从渲染结果反推 LaTeX，用户敲一次字就会把 \cite / \label 烧成 "[1]"。
     *   所以这里给的不是「可编辑的渲染文本」，而是「点开一个就地编辑器」（见 .wys-pop）：
     *   上面照旧实时渲染给你看，下面改的始终是真正的 LaTeX。这就是「在结果上编辑」
     *   对有损渲染的答案 —— 位置在结果上，改的是源码，且不用离开预览。 */
    const raw = String(b.raw == null ? "" : b.raw);
    out.push(
      '<div class="wys-atom" data-line="' + (b.startLine + 1) + '"' + base +
        ' data-tex="' + escAttr(raw) + '">' +
        '<div class="wys-atom-body">' + richBlockHtml(raw, renderMath, baseDir, b.startLine) + "</div>" +
      "</div>"
    );""",
    "原子块：卡片+工具条 -> 无壳可点、原地编辑",
)

# ============================================================ [3] 状态：删 wysOn，加 atomEdit
rep(
    "  /* \u5c31\u5730\u7f16\u8f91\u5f00\u5173\uff1a\u53ef\u89c6\u5316\u89c6\u56fe\u9ed8\u8ba4\u5f00\u7740\uff1b\u5173\u6389\u9000\u56de\u53ea\u8bfb\u9884\u89c8 */\n"
    "  const [wysOn, setWysOn] = useState(true);",
    "  /* ---------- v0.8.0：就地编辑**不是模式** ----------\n"
    "   * 预览区就是文档本身：点正文打字、点公式在原地改。没有「进编辑态 / 出编辑态」。\n"
    "   * 原来那个 ✏/🔒 开关已经删掉 —— 它把「编辑」做成了模式的开关，方向是错的。\n"
    "   * 下面是原子块的就地编辑器：点一下在被点的那一块旁边浮出来。 */\n"
    "  const [atomEdit, setAtomEdit] = useState(null); // {bid,s,e,tex,orig,x,y}\n"
    "  const atomPickedRef = useRef(null);",
    "状态：删 wysOn，加 atomEdit",
)

# ============================================================ [4] commitWys 去掉模式判断
rep(
    "  function commitWys() {\n    if (!wysOn) return null;\n    const root = pvRef.current;",
    "  function commitWys() {\n    const root = pvRef.current;",
    "commitWys：去掉「不是编辑模式就跳过」",
)

# ============================================================ [5] 渲染源固定为 wys.html，删 pv
i2 = s.index("  const pv = useMemo(() => {")
i3 = s.index("[content, renderMath, baseDir]);", i2) + len("[content, renderMath, baseDir]);")
i3 = s.index("\n", i3) + 1
s = s[:i2] + s[i3:]
steps.append("删掉多余的只读预览 useMemo（预览区只有一种渲染）")
print("  ok  删掉多余的只读预览 useMemo（预览区只有一种渲染）")

rep(
    "    const html = wysOn ? wys.html : pv.html;",
    "    const html = wys.html;",
    "渲染源：wys.html / pv.html 二选一 -> 只有 wys.html",
)

rep(
    """      /* 记下渲染时的原文：commit 靠它判断「这块到底动没动」 */
      const map = new Map();
      if (wysOn) {
        const blks = root.querySelectorAll(".wys-blk");
        for (let i = 0; i < blks.length; i++) {
          const p = blks[i].querySelector(".wys-edit");
          map.set(blks[i].getAttribute("data-bid"), p ? wysDomToTex(p) : "");
        }
      }
      wysOrigRef.current = map;""",
    """      /* 记下渲染时的原文：commit 靠它判断「这块到底动没动」 */
      const map = new Map();
      const blks = root.querySelectorAll(".wys-blk");
      for (let i = 0; i < blks.length; i++) {
        const p = blks[i].querySelector(".wys-edit");
        map.set(blks[i].getAttribute("data-bid"), p ? wysDomToTex(p) : "");
      }
      wysOrigRef.current = map;""",
    "渲染后记录基准：去掉模式判断",
)

# ============================================================ [6] 选中态：卡片 -> 原子块
rep(
    """  function selectCard(card) {
    const root = pvRef.current;
    if (!root) return;
    const prev = root.querySelector(".wys-card.sel");
    if (prev && prev !== card) prev.classList.remove("sel");
    if (card) card.classList.add("sel");
  }

  function clearCardSel() {
    const root = pvRef.current;
    if (!root) return;
    const prev = root.querySelector(".wys-card.sel");
    if (prev) prev.classList.remove("sel");
  }

  /* 卡片工具条：在 mousedown 阶段处理 + 阻止默认。
   * 若等 click，焦点会先从正在编辑的块上掉下来 → blur → 整层 innerHTML 重建 →
   * 按钮连同它的事件一起没了，点了没反应。 */
  function onPreviewMouseDown(e) {
    const t = e.target;
    const btn = t && t.closest ? t.closest("[data-act]") : null;
    if (!btn) return;
    e.preventDefault();
    const card = btn.closest ? btn.closest(".wys-card") : null;
    if (!card) return;
    selectCard(card);
    const act = btn.getAttribute("data-act");
    if (act === "src") {
      const on = card.getAttribute("data-show") === "src";
      card.setAttribute("data-show", on ? "rich" : "src");
      btn.setAttribute("title", on
        ? "回到渲染结果（不离开预览）"
        : "看这一块的 LaTeX 源码（不离开预览）");
    } else if (act === "goto") {
      try { const a = document.activeElement; if (a && a.blur) a.blur(); } catch (e2) {}
      gotoSourceAt(parseInt(card.getAttribute("data-line"), 10) || 1);
    }
  }""",
    """  /* 高亮「正在被编辑的那一个原子块」。 */
  function pickAtom(el) {
    const root = pvRef.current;
    if (root) {
      const prev = root.querySelector(".wys-atom.picked");
      if (prev && prev !== el) prev.classList.remove("picked");
    }
    if (el && el.classList) el.classList.add("picked");
    atomPickedRef.current = el || null;
  }

  /* 点原子块 → 在**原地**打开就地编辑器。
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
  }

  /* 打开某一原子块的就地编辑器。改点别的块时先把上一块落地 —— 不能悄悄吞掉改动。 */
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
      bid: bid, s: s0, e: e0, tex: tex, orig: tex,
      x: Math.max(8, Math.min(r.left, W - 556)),
      y: Math.max(8, Math.min(r.bottom + 6, H - 220)),
    });
  }

  /* 提交原子块：仍然走 applyEdits 只替换**这一块的行区间**，三道自检一条不少。 */
  function commitAtom() {
    const a = atomEdit;
    if (!a) return;
    pickAtom(null);
    if (a.tex === a.orig) { setAtomEdit(null); return; }
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
    setAtomEdit(null);
  }""",
    "卡片工具条 -> 原子块原地编辑器（打开 / 提交 / 写回自检）",
)

# ============================================================ [7] onPreviewClick
rep(
    """    /* 就地编辑开着：点正文 / 标题 = 放光标写字；点卡片 = 选中它。一律不动视图。 */
    if (wysOn && t && t.closest && t.closest(".wys-blk")) { clearCardSel(); return; }
    const card = t && t.closest ? t.closest(".wys-card") : null;
    if (card) { selectCard(card); return; }
    clearCardSel();
    /* 只读预览：点带行锚点的节点 → 预览内滚过去闪一下（不再偷偷切分屏） */
    if (!wysOn) {
      const ln = nodeLine(t);
      if (ln) gotoLine(ln);   // 分屏里跳源码、纯预览里就地滚动，都不换视图
    }
  }""",
    """    /* 点正文 / 标题 = 就地放光标写字。点原子块 = 在原地打开它的编辑器（mousedown 已接管）。
     * 两种都不动视图、不跳源码 —— 这就是「在结果上编辑」。 */
    if (t && t.closest && t.closest(".wys-blk")) { pickAtom(null); return; }
    if (!(t && t.closest && t.closest(".wys-atom"))) pickAtom(null);
  }""",
    "onPreviewClick：去掉只读分支的跳转，点击即编辑",
)

# ============================================================ [8] 顶栏：删模式按钮
rep(
    """        {view !== "src" ? (
          <button
            style={{ ...tbtn, border: "none", background: wysOn ? "hsl(var(--primary)/.14)" : "transparent", color: wysOn ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))", fontWeight: wysOn ? 600 : 400 }}
            onClick={() => { if (wysOn) commitWys(); setWysOn(!wysOn); }}
            title="预览里直接改正文与标题；公式 / 引用 / 浮动体是原子节点，改不到内部。失焦即写回源码，只替换被改的块。"
          >{wysOn ? "✏ 就地编辑" : "🔒 只读"}</button>
        ) : null}

""",
    """        {view !== "src" ? (
          <span style={{ fontSize: 11.5, color: "hsl(var(--muted-foreground))", whiteSpace: "nowrap" }}>
            ✏ 点哪改哪 · 公式点一下原地编辑
          </span>
        ) : null}

""",
    "顶栏：删掉 ✏/🔒 模式开关，换一句提示",
)

# ============================================================ [9] 预览区 JSX
rep(
    """              onFocus={wysOn ? onWysFocusIn : undefined}
              onBlur={wysOn ? onWysFocusOut : undefined}
              onKeyDown={wysOn ? onWysKeyDown : undefined}
              onPaste={wysOn ? onWysPaste : undefined}""",
    """              onFocus={onWysFocusIn}
              onBlur={onWysFocusOut}
              onKeyDown={onWysKeyDown}
              onPaste={onWysPaste}""",
    "预览区：编辑事件从「模式开启时才挂」改成常挂",
)

# ============================================================ [10] 浮层 JSX
rep(
    "      {/* \u5e95\u90e8\u7ed3\u679c\u9762\u677f\uff1av0.7.2 \u8d77\u300c\u6709\u7ed3\u679c\u624d\u51fa\u73b0\u300d\u2014\u2014 \u5e38\u9a7b\u7684\u4e09\u6309\u94ae\u6761\u592a\u5435 */}",
    """      {/* 原子块的就地编辑器：浮在被点的那一块旁边。
       * 上面 = 实时渲染（改一个字就重画一次，所见即所得）；下面 = 真正的 LaTeX。
       * 这是「在结果上编辑」对有损渲染节点的答案：位置在结果上，改的是源码，不离开预览。 */}
      {atomEdit ? (
        <div>
          <div
            className="wys-pop-dim"
            onMouseDown={(ev) => { ev.preventDefault(); commitAtom(); }}
          />
          <div className="wys-pop" style={{ left: atomEdit.x, top: atomEdit.y }}>
            <div className="wys-pop-h">
              <b>就地编辑</b>
              <span>L{atomEdit.s + 1}{atomEdit.e > atomEdit.s ? "–" + (atomEdit.e + 1) : ""}</span>
              <span className="wys-pop-keys">Esc 取消 · Ctrl+Enter 保存 · 点外面保存</span>
            </div>
            <div className="wys-pop-pv" dangerouslySetInnerHTML={{ __html: atomPvHtml }} />
            <textarea
              className="wys-pop-ta"
              autoFocus
              spellCheck={false}
              rows={Math.min(14, Math.max(3, atomEdit.tex.split("\\n").length + 1))}
              value={atomEdit.tex}
              onChange={(ev) => setAtomEdit({ ...atomEdit, tex: ev.target.value })}
              onKeyDown={(ev) => {
                ev.stopPropagation();
                if (ev.key === "Escape") { ev.preventDefault(); setAtomEdit(null); }
                else if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); commitAtom(); }
              }}
            />
          </div>
        </div>
      ) : null}

      {/* \u5e95\u90e8\u7ed3\u679c\u9762\u677f\uff1av0.7.2 \u8d77\u300c\u6709\u7ed3\u679c\u624d\u51fa\u73b0\u300d\u2014\u2014 \u5e38\u9a7b\u7684\u4e09\u6309\u94ae\u6761\u592a\u5435 */}""",
    "JSX：加就地编辑浮层",
)

# ============================================================ [11] atomPvHtml
rep(
    "  /* 提交：只回写被改过的块。返回新源码；无改动 / 自检不过返回 null。 */",
    """  /* 浮层上半部分的实时渲染：跟原子块本身用的是同一套预览内核，
   * 所以「你看到的」和「点确定后落版的」是同一张图，不会出现改完变样。 */
  const atomPvHtml = useMemo(() => {
    if (!atomEdit) return "";
    try {
      return LPC.renderPreview(atomEdit.tex, { renderMath: renderMath, baseDir: baseDir, docHeader: false }).html;
    } catch (e) {
      return '<span style="color:#ef4444;font-size:12px">这一块暂时渲染不出来，但源码仍可编辑</span>';
    }
  }, [atomEdit, renderMath, baseDir]);

  /* 提交：只回写被改过的块。返回新源码；无改动 / 自检不过返回 null。 */""",
    "新增 atomPvHtml（浮层实时渲染）",
)

if s == orig:
    print("NO CHANGE")
    sys.exit(1)
io.open(P, "w", encoding="utf-8").write(s)
print("\nOK panels/editor.tsx（" + str(len(steps)) + " 处改动）")
