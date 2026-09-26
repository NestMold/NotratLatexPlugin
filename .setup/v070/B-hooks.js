  /* ---------- 就地编辑层（v0.7.0 · 方案 A）----------
   * 权威源 = LaTeX 源码。可视化视图里只有 heading / paragraph 变成可编辑块，
   * 改完用 WYS.applyEdits 只替换被改块的行区间；公式 / 浮动体 / 参考文献保持原子卡片。
   * 三条不变式：
   *   ① 编辑期间 DOM 是权威 —— 绝不回写 innerHTML，否则每敲一个字光标就丢；
   *   ② 只提交真正改过的块（渲染时记下原文当基准）；
   *   ③ 提交前跑内核自检，任何一条不过就整批放弃，绝不半途改坏文件。
   */
  const wysEditing = useRef(false);
  const wysOrigRef = useRef(new Map());
  const wysUndoRef = useRef(null);

  const wys = useMemo(() => {
    try { return { html: wysRenderDoc(content, renderMath) }; }
    catch (e) { return { html: '<div class="wys-err">就地编辑层渲染失败：' + esc(String((e && e.message) || e)) + "</div>" }; }
  }, [content, renderMath]);

  /* 提交：只回写被改过的块。返回新源码；无改动 / 自检不过返回 null。 */
  function commitWys() {
    if (!wysOn) return null;
    const root = pvRef.current;
    if (!root || wysEditing.current) return null;
    const blks = root.querySelectorAll(".wys-blk");
    if (!blks.length) return null;
    const edits = [];
    for (let i = 0; i < blks.length; i++) {
      const el = blks[i];
      const part = el.querySelector(".wys-edit");
      if (!part) continue;
      const s = parseInt(el.getAttribute("data-s"), 10);
      const e = parseInt(el.getAttribute("data-e"), 10);
      if (!(s >= 0) || !(e >= s)) continue;
      const now = wysDomToTex(part);
      const orig = wysOrigRef.current.get(el.getAttribute("data-bid"));
      if (orig != null && now === orig) continue;        // 没动过的块不进 edit 列表
      if (el.getAttribute("data-type") === "heading") {
        /* headingTex 只换标题主体，保住 *、[短标题]、\label */
        edits.push({
          startLine: s, endLine: e,
          newText: WYS.headingTex(
            { prefix: el.getAttribute("data-prefix") || "", suffix: el.getAttribute("data-suffix") || "" },
            now
          ),
        });
      } else {
        edits.push({ startLine: s, endLine: e, newText: now });
      }
    }
    if (!edits.length) return null;
    let next;
    try {
      /* 自检 1：空编辑集必须逐字节还原（内核硬不变式） */
      if (WYS.applyEdits(content, []) !== content) throw new Error("空编辑集未逐字节还原");
      next = WYS.applyEdits(content, edits);
      /* 自检 2：回写结果必须仍可解析 */
      WYS.parseDoc(next);
    } catch (err) {
      setToast({ msg: "⚠ 就地回写自检未通过，已放弃本次修改：" + String((err && err.message) || err) });
      return null;
    }
    if (next === content) return null;
    wysUndoRef.current = content;
    onChange(next);
    setToast({ msg: "✏ 已就地写回 " + edits.length + " 处改动", undo: true });
    return next;
  }

  function undoWys() {
    const prev = wysUndoRef.current;
    if (prev == null) return;
    wysUndoRef.current = null;
    wysEditing.current = false;
    onChange(prev);
    setToast({ msg: "↩ 已撤销本次就地编辑" });
  }

  function onWysFocusIn() { wysEditing.current = true; }
  function onWysFocusOut(e) {
    /* React 的 onBlur = focusout（冒泡）：焦点仍在层内就不算离开 */
    if (e.currentTarget && e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return;
    wysEditing.current = false;
    commitWys();
  }

  /* Enter = 块内换行（段内续行，合法 LaTeX）；不引入 <div> 污染块结构 */
  function onWysKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      commitWys();
      if (onSave) { try { onSave(); setSavedTick(Date.now()); } catch (e2) {} }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      try { document.execCommand("insertText", false, "\n"); } catch (e3) {}
    }
  }

  /* 粘贴只收纯文本：HTML 富文本进 .tex 源码就是灾难 */
  function onWysPaste(e) {
    e.preventDefault();
    let t = "";
    try { t = (e.clipboardData || window.clipboardData).getData("text/plain") || ""; } catch (e2) {}
    if (t) { try { document.execCommand("insertText", false, t); } catch (e3) {} }
  }
