/* ============ 复现 / 回归：切视图往返，正文还在不在 ============
 *
 * 两条断言是本次要钉的：
 *   ★ 回程后预览层必须被重新画出来（不是空壳）
 *   ▲ 离场那一下 commitWys 必须真的跑进去（相位要先复位，否则刚敲的字静默丢掉）
 * 一条是防「修过头」的：
 *   ◆ 预览层没卸载就别重画 —— 内容没变却重建 DOM，正在打字的块光标会被顶掉
 *
 * 跑法： node .setup/_probe-roundtrip.js && node .setup/_tmp-roundtrip.js
 * 只读源码，不改任何产物。 */
(async function () {

  function tierOf(t) {
    const ta = findEl(t, (el) => el.type === "textarea").length;
    const pv = findEl(t, (el) => el.props && el.props.className === "pv-root").length;
    return (ta && pv) ? "split" : ta ? "src" : pv ? "preview" : "?";
  }
  function pvEl(t) {
    const a = findEl(t, (el) => el.props && el.props.className === "pv-root");
    return a.length ? a[0] : null;
  }
  function pvNode(t) { const e = pvEl(t); return e && e.props.ref ? e.props.ref.current : null; }
  function rootNode(t) {
    const r = findEl(t, (el) => el.props && el.props.ref && el.props.ref.current
      && el.props.ref.current.listeners && (el.props.ref.current.listeners.keydown || []).length > 0);
    return r.length ? r[0].props.ref.current : null;
  }
  /* Ctrl+/ —— 键盘事件，焦点一点都不动，所以不会产生 focusout */
  function pressSlash(t) {
    const n = rootNode(t);
    if (!n) return null;
    const ev = {
      key: "/", code: "Slash", ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, isComposing: false,
      preventDefault: function () { this.__pd = true; },
      stopPropagation: function () { this.__sp = true; },
    };
    (n.listeners.keydown || []).slice().forEach(function (f) { f(ev); });
    return ev;
  }
  function painted(n) { return !!n && typeof n.innerHTML === "string" && n.innerHTML.length > 0; }
  function desc(n) {
    if (!n) return "无节点";
    return "innerHTML=" + (typeof n.innerHTML === "string" ? ("长度 " + n.innerHTML.length) : String(n.innerHTML)) +
           " __latexHtml=" + String(n.__latexHtml);
  }
  /* 给假节点装个计数：commitWys 一旦越过相位守卫就会扫 .wys-blk，扫没扫过一目了然 */
  function watchQsa(n) {
    const box = { n: 0 };
    n.querySelectorAll = function () { box.n++; return []; };
    return box;
  }
  /* 数「重画了几次」：innerHTML 的 setter 被调用一次就是重画一次。
   * 读的时候要回落到装钩子之前那个值，否则 painted() 会被自己的钩子骗成「空」。 */
  function countPaint(n) {
    const cur = n.innerHTML;
    const box = { hits: 0 };
    Object.defineProperty(n, "innerHTML", {
      configurable: true,
      get: function () { return this.__h === undefined ? cur : this.__h; },
      set: function (v) { box.hits++; this.__h = v; },
    });
    return box;
  }

  console.log("── A. 可视化 → 源码 → 回可视化（切走前在预览里敲过字）──");
  const h = mount(SAMPLE, "wysiwyg");
  let t = await h.render();
  ok(tierOf(t) === "preview", "① 首屏落在可视化档", tierOf(t));
  const pv0 = pvNode(t);
  ok(painted(pv0), "② 首屏预览层已画出内容", desc(pv0));

  /* 用户在预览里点了一下正文块：focusin → wysEditing.current = true */
  const pe = pvEl(t);
  ok(!!(pe && typeof pe.props.onFocus === "function"), "③ 预览层挂有 onFocus（点一下就算进编辑态）");
  const qsa = watchQsa(pv0);
  pe.props.onFocus();

  const evA = pressSlash(t);
  ok(!!(evA && evA.__pd === true), "④ Ctrl+/ 被编辑器拦下（不落到宿主）");
  await h.render();
  t = h.tree();
  ok(tierOf(t) === "src", "⑤ 切到源码档", tierOf(t));
  ok(qsa.n > 0, "▲ 离场时 commitWys 真的跑进去了（相位先复位，不是早退）", "扫 .wys-blk 次数=" + qsa.n);

  const evB = pressSlash(t);
  ok(!!(evB && evB.__pd === true), "⑥ 再按 Ctrl+/ 被拦下");
  await h.render();
  t = h.tree();
  ok(tierOf(t) === "preview", "⑦ 回到可视化档", tierOf(t));

  const pv1 = pvNode(t);
  ok(!!pv1 && pv1 !== pv0, "⑧ 回来的是新挂载的预览节点（旧节点随卸载销毁）");
  ok(painted(pv1), "★ 回程后预览层重新画出内容（非空白）", desc(pv1));

  console.log("\n── B. 对照：切走之前没碰过预览（同一往返）──");
  const h2 = mount(SAMPLE, "wysiwyg");
  let t2 = await h2.render();
  pressSlash(t2); await h2.render();
  pressSlash(h2.tree()); await h2.render();
  t2 = h2.tree();
  ok(tierOf(t2) === "preview", "⑨ 对照：也回到了可视化档", tierOf(t2));
  ok(painted(pvNode(t2)), "⑨b 对照：没碰过预览时回程同样画得出来", desc(pvNode(t2)));

  console.log("\n── C. 宿主开关通路（props.mode 下发，不经 Ctrl+/）──");
  const h3 = mount(SAMPLE, "wysiwyg");
  let t3 = await h3.render();
  const pe3 = pvEl(t3);
  ok(!!pe3, "⑩ 预览层在场");
  const qsa3 = watchQsa(pvNode(t3));
  pe3.props.onFocus();
  h3.props.mode = "source";
  await h3.render();
  t3 = h3.tree();
  ok(tierOf(t3) === "src", "⑪ 宿主下发 source → 源码档", tierOf(t3));
  ok(qsa3.n > 0, "▲ 宿主开关离场同样收了尾（不是只修了 Ctrl+/ 那一条路）", "扫 .wys-blk 次数=" + qsa3.n);
  h3.props.mode = "wysiwyg";
  await h3.render();
  t3 = h3.tree();
  ok(tierOf(t3) === "preview", "⑫ 宿主下发 wysiwyg → 回可视化档", tierOf(t3));
  ok(painted(pvNode(t3)), "★ 宿主开关往返后预览层重新画出内容（非空白）", desc(pvNode(t3)));

  console.log("\n── D. 分屏 ⇄ 可视化：预览层没卸载，就不该重画（重画会顶掉光标）──");
  const MODES3 = [{ id: "visual" }, { id: "source" }, { id: "split" }];
  const h4 = mount(SAMPLE, "split", { modes: MODES3 });
  let t4 = await h4.render();
  ok(tierOf(t4) === "split", "⑬ 首屏落在分屏档", tierOf(t4));
  const pv4 = pvNode(t4);
  ok(painted(pv4), "⑭ 分屏里预览层已画出内容", desc(pv4));
  const paint4 = countPaint(pv4);

  h4.props.mode = "visual";          // 宿主开关：分屏 → 纯可视化
  await h4.render();
  t4 = h4.tree();
  ok(tierOf(t4) === "preview", "⑮ 切到纯可视化档", tierOf(t4));
  ok(pvNode(t4) === pv4, "⑯ 这一路预览层没卸载（还是同一个节点，DOM 权威区没被动过）");
  ok(paint4.hits === 0, "◆ 没重画（内容没变就不重建 DOM，正在打字的块光标不会被顶掉）", "重画次数=" + paint4.hits);

  h4.props.mode = "split";           // 再切回分屏
  await h4.render();
  t4 = h4.tree();
  ok(tierOf(t4) === "split", "⑰ 切回分屏档", tierOf(t4));
  ok(pvNode(t4) === pv4, "⑱ 仍然没卸载");
  ok(paint4.hits === 0, "◆ 仍然没重画", "重画次数=" + paint4.hits);

  console.log("\n" + (fail === 0 ? "✅ 全部通过：" + pass + " 项" : "❌ " + fail + " 项未通过（共 " + (pass + fail) + " 项）"));
  process.exitCode = fail ? 1 : 0;
})();
