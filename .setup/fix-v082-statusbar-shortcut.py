# -*- coding: utf-8 -*-
"""
三处改动（panels/editor.tsx）：
  1) 删掉推给宿主状态栏的 pos 项 + 摘掉 cursor 依赖
  2) 删掉 stats.todo（计数 + 推送）
  3) 注册 Ctrl+/ 切视图
每一步都断言「锚点唯一」，不唯一就整体中止，绝不半改。
"""
import io
import sys

P = r'E:\notrat-latex-plugin\panels\editor.tsx'
src = io.open(P, encoding='utf-8').read()
orig = src

def sub(old, new, tag):
    global src
    n = src.count(old)
    if n != 1:
        print(u'[FAIL] %s: anchor x%d (need x1), aborted' % (tag, n))
        sys.exit(1)
    src = src.replace(old, new, 1)
    print(u'[ok] %s' % tag)

# ---------------------------------------------------------------- 1) pos 项
sub(
    u'    /* v0.7.2 起不再往宿主状态栏塞「就地编辑」—— 顶栏已经明示，重复只是噪音 */\n'
    u'    items.push({ id: "pos", text: "Ln " + cursor.line + ", Col " + cursor.col, title: "光标位置" });\n'
    u'    try { props.setStatus(items.slice(0, 6)); } catch (e) {}\n'
    u'  }, [stats, cursor.line, cursor.col, issues, isActiveEditor, props.setStatus, view]);',

    u'    /* v0.8.2：不再往宿主状态栏塞「Ln / Col」。\n'
    u'     * 编辑器自己的底栏已经常驻显示光标位置，两处读的是同一份 cursor state，\n'
    u'     * 值必然相等 —— 上下并排就是同一个数字说两遍。\n'
    u'     *\n'
    u'     * 顺带把 cursor.line / cursor.col 从依赖数组摘掉：光标每动一格都会重跑这个 effect，\n'
    u'     * 推的内容却一字未变。宿主按 id+text+title 去重不会重渲，但每次按键白跑一趟 setStatus\n'
    u'     * 没有意义。现在只在 stats / issues / 视图真的变了才推。\n'
    u'     *\n'
    u'     * items 是**优先级数组**：越靠前越重要，满了先丢后面的（宿主另有 MAX_ITEMS=6）。\n'
    u'     * 摘掉 pos 后最多 4 条（sec / env / cite / issue?），离截断边界还有余量。\n'
    u'     * ⚠ 以后再加条目请往**前**放；直接 append 在末尾，一旦超过 6 条会被静默丢弃。 */\n'
    u'    try { props.setStatus(items.slice(0, 6)); } catch (e) {}\n'
    u'  }, [stats, issues, isActiveEditor, props.setStatus, view]);',
    u'1) 删除推给宿主的 pos 项 + 摘掉 cursor 依赖'
)

# ---------------------------------------------------------------- 2) stats.todo
sub(
    u'    let sec = 0, eq = 0, fig = 0, tab = 0, cite = 0, todo = 0;',
    u'    let sec = 0, eq = 0, fig = 0, tab = 0, cite = 0;',
    u'2a) stats：删掉 todo 计数器声明'
)

sub(
    u'      /* TODO/FIXME 本来就写在注释里 —— 必须先数再跳过整行注释 */\n'
    u'      if (/%.*\\b(TODO|FIXME|XXX)\\b/i.test(l)) todo++;\n'
    u'      if (/^\\s*%/.test(l)) continue;',
    u'      if (/^\\s*%/.test(l)) continue;',
    u'2b) stats：删掉 TODO/FIXME 计数逻辑'
)

sub(
    u'    return { sec: sec, eq: eq, fig: fig, tab: tab, cite: cite, todo: todo, words: countWords(content).total };',
    u'    return { sec: sec, eq: eq, fig: fig, tab: tab, cite: cite, words: countWords(content).total };',
    u'2c) stats：返回值去掉 todo 字段'
)

sub(
    u'    if (stats.todo) items.push({ id: "todo", text: "📌 " + stats.todo + " 待办", title: "源码注释里的 TODO / FIXME" });\n',

    u'    /* v0.8.2：不再推「待办」。这里只数本文件的注释，而且只展示、点不动；\n'
    u'     * 左侧「章节大纲」面板已经用 MCP latex_parse 的 todos 把 TODO/FIXME 做成\n'
    u'     * 可点击的树节点（点一下直接跳到那一行）。同一件事说两遍，留下的该是能用的那个。 */\n',
    u'2d) 删除状态栏「待办」推送'
)

# ---------------------------------------------------------------- 3) Ctrl+/
sub(
    u'  const [atomEdit, setAtomEdit] = useState(null); // {bid,s,e,tex,orig,x,y}\n'
    u'  const atomPickedRef = useRef(null);\n',

    u'''  const [atomEdit, setAtomEdit] = useState(null); // {bid,s,e,tex,orig,x,y}
  const atomPickedRef = useRef(null);

  /* ---------- Ctrl+/ 切视图（对齐宿主 Markdown 编辑器） ----------
   * 宿主实现（TipTapEditor）：window 捕获阶段监听，(ctrl|meta)+"/"、不带 shift/alt，
   * 命中即 preventDefault，然后 wysiwyg ⇄ source 二态对翻。
   *
   * 本编辑器是三档（📄 源码 / ⧉ 分屏 / 📑 预览），按宿主那套二态语义映射：
   *   当前在「源码」        → 回可视化侧上次停的地方（分屏或预览，默认分屏）
   *   当前在「分屏 / 预览」 → 去「源码」
   *
   * 回写不另造通路：统一调 goView —— 它内含 commitWys()（离开可视化前把改动落盘）
   * 与 props.onModeSwitch(...)（回写宿主标题栏开关），与点顶栏分段按钮走的是同一条路。
   *
   * ⚠ 监听挂在**本编辑器根节点**上，而不是像宿主那样挂 window：
   *   多开 .tex 时只有拿到焦点的那个实例能收到事件，天然不会两边各翻一次（翻两次=没翻）；
   *   也不必依赖「活动文件桥」判定 owner —— 那条桥是异步广播，首个事件到达前人人自认活动。
   *
   * 监听只订阅一次，所以下面用 ref 取「最新闭包」：
   *   goViewRef   —— goView 读的是当拍的 view / commitWys / props.onModeSwitch
   *   viewRef     —— 判断「现在在哪一档」必须是最新值，否则切过一次方向就反了
   *   atomEditRef —— 就地编辑浮层开着时不切（见下）
   * 不把 goView 塞进依赖数组：它是每次渲染新建的函数，订阅会在每次按键时解绑重挂。 */
  const goViewRef = useRef(null);
  const viewRef = useRef(view);
  const atomEditRef = useRef(null);
  goViewRef.current = goView;
  viewRef.current = view;
  atomEditRef.current = atomEdit;

  const rootRef = useRef(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    function onCtrlSlash(e) {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      if (e.key !== "/") return;
      /* 就地编辑浮层开着：这一下先别切。浮层渲染在根节点下、不在预览容器里，
       * 切视图不会把它卸载，它会连同那块遮罩孤零零浮在源码之上。
       * 让用户先 Esc / 点外面收掉，比替他做决定安全。 */
      if (atomEditRef.current) return;
      e.preventDefault();
      e.stopPropagation();   // 别再让底下的 textarea / 预览吃到这一下
      const gv = goViewRef.current;
      if (typeof gv !== "function") return;
      gv(viewRef.current === "src" ? (lastPvView.current || "split") : "src");
    }
    root.addEventListener("keydown", onCtrlSlash, true);   // 捕获阶段，先于组件内部的 onKeyDown
    return () => root.removeEventListener("keydown", onCtrlSlash, true);
  }, []);
''',
    u'3a) 插入 Ctrl+/ 的 ref 桥 + 根节点监听'
)

sub(
    u'  return (\n'
    u'    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "hsl(var(--background))", color: "hsl(var(--foreground))" }}>',

    u'  return (\n'
    u'    <div ref={rootRef} style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "hsl(var(--background))", color: "hsl(var(--foreground))" }}>',

    u'3b) 根节点挂 rootRef（Ctrl+/ 的订阅锚点）'
)

io.open(P, 'w', encoding='utf-8', newline='').write(src)
print(u'\nOK  %d -> %d chars (%+d)' % (len(orig), len(src), len(src) - len(orig)))
