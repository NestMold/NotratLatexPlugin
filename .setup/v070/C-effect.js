  /* ---------- 就地编辑层 innerHTML 同步 ----------
   * 无 deps：每拍都试，靠 root.__latexHtml 做幂等守卫（省掉无谓的 DOM 重建）。
   * ⚠ wysEditing.current 为真时直接返回 —— 编辑期间 DOM 是权威，回写会把光标顶到开头。 */
  useEffect(() => {
    const root = pvRef.current;
    if (!root) return;
    if (wysEditing.current) return;
    const html = wysOn ? wys.html : pv.html;
    if (root.__latexHtml === html) return;
    root.__latexHtml = html;
    root.innerHTML = html;
    /* 记下渲染时的原文：commit 靠它判断「这块到底动没动」 */
    const map = new Map();
    if (wysOn) {
      const blks = root.querySelectorAll(".wys-blk");
      for (let i = 0; i < blks.length; i++) {
        const p = blks[i].querySelector(".wys-edit");
        map.set(blks[i].getAttribute("data-bid"), p ? wysDomToTex(p) : "");
      }
    }
    wysOrigRef.current = map;
  });
