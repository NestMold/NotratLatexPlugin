# -*- coding: utf-8 -*-
"""v0.7.4：把「就地编辑」从「可编辑块 + 原子卡片」改成「整页就是预览，点哪改哪」。

用户原话：「我想的是直接就是只读的UI上修改，而不是这样」
           —— 指着 `导言区 L1–8 { } 源码 ↗ 定位` 那排卡片说的。

诊断（读 panels/editor.tsx + server/wysiwyg.js 得到）：
  10 类块里只有 heading / paragraph 被放行成可编辑；其余 8 类一律套「卡片壳 + 两个按钮」。
  但其中 preamble / command / comment / tail **本来就没有视觉结果** —— 它们占卡片是纯噪音；
  math / float / bib / env 有视觉结果，卡片壳却把渲染结果关进了框里。

本补丁：
  1) preamble  → 折叠成一行「导言区 · N 行」，展开后等宽可编辑
  2) comment   → 灰色小字直接排（注释本来就是写给作者看的），可编辑
  3) command / tail → 灰色单行（\\maketitle、\\end{document}），可编辑
  4) math/float/bib/... → 撤掉卡片壳与常驻头部条，渲染结果直接落版；
                          工具条（{ } 源码 / ↗ 定位）改成 hover / 选中时才浮出

不变式不动：所有新块仍带 data-bid/data-s/data-e，里面放一个 .wys-edit，
            commitWys 的扫描范围（.wys-blk）与 wysDomToTex 往返规则完全不变。
"""
import io
import sys

P = "panels/editor.tsx"
s = io.open(P, encoding="utf-8").read()
orig = s


def rep(old, new, tag):
    global s
    if old not in s:
        print("MISS  " + tag)
        sys.exit(1)
    s = s.replace(old, new, 1)
    print("  ok  " + tag)


# ---------------------------------------------------------------- 1) CSS
OLD_CSS = """.wys-card{border:1px solid hsl(var(--border));border-radius:10px;margin:12px 0;background:hsl(var(--card));overflow:hidden}
.wys-card:hover{border-color:hsl(var(--primary)/.45)}
.wys-card.sel{border-color:hsl(var(--primary));box-shadow:0 0 0 1px hsl(var(--primary)/.45)}
.wys-card-h{display:flex;align-items:center;gap:6px;font-size:11.5px;color:hsl(var(--muted-foreground));padding:3px 10px;background:hsl(var(--muted)/.3);border-bottom:1px solid hsl(var(--border))}
.wys-card-ln{font-family:Consolas,monospace;opacity:.8}
.wys-card-grow{flex:1}
.wys-card-btn{border:none;background:transparent;color:hsl(var(--muted-foreground));font-family:inherit;font-size:11px;cursor:pointer;padding:1px 7px;border-radius:5px}
.wys-card-btn:hover{background:hsl(var(--muted));color:hsl(var(--foreground))}
.wys-card-body{padding:6px 12px}
.wys-card-body>:first-child{margin-top:4px}
.wys-card-body>:last-child{margin-bottom:4px}
.wys-card-src{margin:0;padding:8px 12px;white-space:pre-wrap;overflow-wrap:break-word;font-family:Consolas,'Courier New',monospace;font-size:12.5px;line-height:1.6;color:hsl(var(--foreground)/.82);max-height:260px;overflow:auto;border-top:1px dashed hsl(var(--border))}
.wys-card:not([data-show="src"]) .wys-card-src{display:none}
.wys-card[data-show="src"] .wys-card-body{display:none}"""

NEW_CSS = """/* 原子块（公式 / 图 / 表 / 文献 / 环境）：外观就是**最终渲染结果**，没有卡片壳。
 * v0.7.4：常驻头部条 + 两个文字按钮全部撤掉 —— 工具条只在 hover / 选中时浮出，
 *          默认零视觉占用，整页看起来就是只读预览。 */
.wys-card{position:relative;margin:14px 0;border-radius:8px;border:1px solid transparent;transition:border-color .12s ease,background .12s ease}
.wys-card:hover{border-color:hsl(var(--border));background:hsl(var(--muted)/.16)}
.wys-card.sel{border-color:hsl(var(--primary)/.65);background:hsl(var(--primary)/.05)}
.wys-bar{position:absolute;top:-10px;right:8px;z-index:2;display:flex;align-items:center;gap:1px;padding:1px 3px;border-radius:7px;border:1px solid hsl(var(--border));background:hsl(var(--popover));box-shadow:0 2px 10px rgba(0,0,0,.16);opacity:0;pointer-events:none;transition:opacity .12s ease}
.wys-card:hover .wys-bar,.wys-card.sel .wys-bar{opacity:1;pointer-events:auto}
.wys-bar-btn{border:none;background:transparent;color:hsl(var(--muted-foreground));font-family:inherit;font-size:11px;line-height:16px;cursor:pointer;padding:0 5px;border-radius:5px}
.wys-bar-btn:hover{background:hsl(var(--muted));color:hsl(var(--foreground))}
.wys-bar-ln{font-family:Consolas,monospace;font-size:10.5px;color:hsl(var(--muted-foreground));opacity:.75;padding:0 4px;white-space:nowrap}
.wys-card-body{padding:2px 2px}
.wys-card-body>:first-child{margin-top:0}
.wys-card-body>:last-child{margin-bottom:0}
.wys-card-src{margin:0;padding:8px 10px;white-space:pre-wrap;overflow-wrap:break-word;font-family:Consolas,'Courier New',monospace;font-size:12.5px;line-height:1.6;color:hsl(var(--foreground)/.82);max-height:260px;overflow:auto;border-radius:6px;background:hsl(var(--muted)/.4)}
.wys-card:not([data-show="src"]) .wys-card-src{display:none}
.wys-card[data-show="src"] .wys-card-body{display:none}
/* 没有视觉结果的块 —— 注释 / 单条命令 / 文档结尾：不再各占一张卡片，直接排成小灰字。 */
.wys-note .wys-edit{color:#71717a;font-family:Consolas,'Courier New',monospace;font-size:12.5px;line-height:1.7}
.wys-cmd .wys-edit{color:hsl(var(--muted-foreground));font-family:Consolas,'Courier New',monospace;font-size:12px;line-height:1.7}
/* 导言区：默认收起成一行，要改再展开 */
.wys-fold{margin:4px 0}
.wys-fold>summary{cursor:pointer;list-style:none;font-family:Consolas,monospace;font-size:11.5px;color:hsl(var(--muted-foreground));padding:1px 2px;border-radius:5px}
.wys-fold>summary::-webkit-details-marker{display:none}
.wys-fold>summary::before{content:"▸ ";opacity:.7}
.wys-fold[open]>summary::before{content:"▾ "}
.wys-fold>summary:hover{background:hsl(var(--muted)/.5);color:hsl(var(--foreground))}
.wys-fold .wys-edit{display:block;margin:4px 0 6px;padding:6px 10px;border-left:2px solid hsl(var(--border));font-family:Consolas,'Courier New',monospace;font-size:12.5px;line-height:1.75;white-space:pre-wrap;color:hsl(var(--foreground)/.78)}"""

rep(OLD_CSS, NEW_CSS, "WYS_CSS：卡片壳 → 无壳")

# ---------------------------------------------------------------- 2) 块分流
OLD_ATOM = """    /* 原子块：只读，但**用预览内核渲染成富结果**，不再把 LaTeX 原样摆出来。
     * 卡片上两个按钮是「显式」出口：看这一块的源码 / 去源码里定位——不点就不会离开预览。 */
    const raw = String(b.raw == null ? "" : b.raw);
    out.push(
      '<div class="wys-card" data-line="' + (b.startLine + 1) + '"' + base + ">" +
        '<div class="wys-card-h">' +
          '<span class="wys-tag">' + WYS.escHtml(b.label || b.type) + "</span>" +
          '<span class="wys-card-ln">L' + (b.startLine + 1) + (b.endLine > b.startLine ? "–" + (b.endLine + 1) : "") + "</span>" +
          '<span class="wys-card-grow"></span>' +
          '<button type="button" class="wys-card-btn" data-act="src" title="看这一块的 LaTeX 源码（不离开预览）">{ } 源码</button>' +
          '<button type="button" class="wys-card-btn" data-act="goto" title="在源码视图里定位到这一块">↗ 定位</button>' +
        "</div>" +
        '<div class="wys-card-body">' + richBlockHtml(raw, renderMath, baseDir, b.startLine) + "</div>" +
        '<pre class="wys-card-src">' + WYS.escHtml(raw) + "</pre>" +
      "</div>"
    );"""

NEW_ATOM = """    /* ---------- 没有视觉结果的块：不再套卡片壳，直接排成可编辑的小灰字 ----------
     * comment  → 注释本来就是写给作者看的，灰色小字最合适
     * command  → \\maketitle / \\tableofcontents 之类
     * tail     → \\end{document}
     * 三者都只是「一行源码」，没有任何渲染结果可展示 —— 给它们一张卡片纯属噪音。 */
    if (b.type === "comment" || b.type === "command" || b.type === "tail") {
      const cls = b.type === "comment" ? "wys-note" : "wys-cmd";
      out.push(
        '<div class="wys-blk ' + cls + '"' + base + ">" +
          '<span class="wys-edit" contenteditable="true">' + WYS.escHtml(String(b.raw == null ? "" : b.raw)) + "</span>" +
        "</div>"
      );
      continue;
    }
    /* 导言区：默认收起成一行。它不是内容，但 \\title / \\usepackage 偶尔确实要改，
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
    }
    /* ---------- 有视觉结果的原子块：渲染结果直接落版，工具条 hover 才浮出 ----------
     * 公式 / 浮动体 / 参考文献 / 代码环境 … 一律用预览内核渲染成富结果。
     * 块内部是只读的 —— \\cite 渲染成 [1]、\\ref 渲染成图 1，都是有损的，
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
    );"""

rep(OLD_ATOM, NEW_ATOM, "原子块：卡片壳 → 分流（隐形 / 无壳）")

# ---------------------------------------------------------------- 3) 按钮文案
rep(
    '      btn.textContent = on ? "{ } 源码" : "{ } 富预览";',
    '      btn.setAttribute("title", on\n'
    '        ? "回到渲染结果（不离开预览）"\n'
    '        : "看这一块的 LaTeX 源码（不离开预览）");',
    "工具条按钮：文字按钮 → 图标 + title 切换",
)

# ---------------------------------------------------------------- 4) 顶部注释说明
rep(
    " *   1) 把 WYS.parseDoc 出的块渲染成「可编辑文本 + 原子节点」；",
    " *   1) 把 WYS.parseDoc 出的块渲染成「可编辑文本 + 原子节点」；\n"
    " *      v0.7.4：整页外观 = 只读预览。没有视觉结果的块（导言区 / 命令 / 注释）\n"
    " *      不再占卡片；有视觉结果的原子块也撤了卡片壳，工具条 hover 才浮出。",
    "文件头注释：补 v0.7.4 说明",
)

if s == orig:
    print("NO CHANGE")
    sys.exit(1)
io.open(P, "w", encoding="utf-8").write(s)
print("\n✓ panels/editor.tsx 已更新")
