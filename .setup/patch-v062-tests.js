/* v0.6.2 追加：大纲锚点硬化（宿主把 anchor 退化成标题文本）+ 状态栏 setStatus
 *
 * 为什么必须真渲染测这两件事：
 *   · 「点大纲跳第 1 行」在静态断言里是看不出来的 —— 旧代码 `Math.max(1, Number(x)||0)`
 *     对任何非数字都返回 1，源码上完全「合法」，只有派发真事件看落点才抓得住。
 *   · 状态栏条目、上限、id 去重、非活动实例不抢推，全是运行时行为。
 */
const fs = require("fs");
const path = require("path");
const WS = "E:/notrat-latex-plugin";

/* ---------- 1. mount() 支持注入额外 props（setStatus 等） ---------- */
{
  const p = path.join(WS, ".setup", "test-nav.js");
  let s = fs.readFileSync(p, "utf8");
  const oldSig = "function mount(filePath, mode) {";
  const newSig = "function mount(filePath, mode, extra) {";
  if (s.split(oldSig).length - 1 !== 1) { console.error("✗ mount 锚点异常"); process.exit(1); }
  s = s.replace(oldSig, newSig);

  const oldRet = "  return createHarness(props);";
  const newRet = [
    "  if (extra) Object.assign(props, extra);",
    "  return createHarness(props);",
  ].join("\n");
  if (s.split(oldRet).length - 1 !== 1) { console.error("✗ mount return 锚点异常"); process.exit(1); }
  s = s.replace(oldRet, newRet);
  fs.writeFileSync(p, s);
  console.log("  ✓ test-nav.js：mount() 支持注入额外 props");
}

/* ---------- 2. 追加 G / H 两段 ---------- */
{
  const p = path.join(WS, ".setup", "test-nav.js");
  let s = fs.readFileSync(p, "utf8");

  const tail = [
    '  console.log("\\n" + (fail === 0 ? "✅ 全部通过：" + pass + " 项" : "❌ " + fail + " 项未通过（共 " + (pass + fail) + " 项）"));',
    "  process.exitCode = fail ? 1 : 0;",
    "})();",
  ].join("\n");
  if (s.split(tail).length - 1 !== 1) { console.error("✗ 文件尾锚点异常"); process.exit(1); }

  const G = String.raw`  /* ============ G. 宿主把 anchor 退化成标题文本（v0.6.2 硬化） ============ */
  console.log("\n── G. 宿主回抛的是标题文本（anchor 丢了）→ 必须按标题回查行号 ──");
  const gA = mount(SAMPLE, "source");
  await gA.render();
  gA.dispatch({
    type: "notrat-outline-navigate",
    detail: { pluginId: "notrat-latex-plugin", anchor: "2.1  模型结构", item: { text: "2.1  模型结构" } },
  });
  await gA.render();
  const taG = findEl(gA.tree(), (el) => el.type === "textarea")[0];
  const nodeG = taG && taG.props.ref ? taG.props.ref.current : null;
  ok(nodeG && Math.abs(nodeG.scrollTop - expScroll) < 1.5,
     "带编号的标题文本锚点也落到第 " + LN + " 行（" + expScroll.toFixed(1) + "px）", nodeG && nodeG.scrollTop);
  ok(nodeG && nodeG.scrollTop !== 0, "★ 没有掉进「静默跳第 1 行」的老坑（老实现此处必为 0）", nodeG && nodeG.scrollTop);

  const gB = mount(SAMPLE, "source");
  await gB.render();
  gB.dispatch({
    type: "notrat-outline-navigate",
    detail: { pluginId: "notrat-latex-plugin", item: { text: "模型结构" } },
  });
  await gB.render();
  const taB2 = findEl(gB.tree(), (el) => el.type === "textarea")[0];
  const nodeB2 = taB2 && taB2.props.ref ? taB2.props.ref.current : null;
  ok(nodeB2 && Math.abs(nodeB2.scrollTop - expScroll) < 1.5,
     "anchor 完全缺失、只剩纯标题时也能回查到位", nodeB2 && nodeB2.scrollTop);

  const gC = mount(SAMPLE, "source");
  await gC.render();
  gC.dispatch({
    type: "notrat-outline-navigate",
    detail: { pluginId: "notrat-latex-plugin", anchor: "？？未知条目", item: { text: "？？未知条目" } },
  });
  await gC.render();
  const taC2 = findEl(gC.tree(), (el) => el.type === "textarea")[0];
  const nodeC2 = taC2 && taC2.props.ref ? taC2.props.ref.current : null;
  ok(nodeC2 && nodeC2.focused !== true && !nodeC2.selection,
     "认不出的锚点：不跳、也不假装跳过（老实现会跳第 1 行 + 给焦点）",
     nodeC2 && ("focused=" + nodeC2.focused + " selection=" + JSON.stringify(nodeC2.selection)));

  const edSrc = fs.readFileSync(path.join(WS, "panels", "editor.tsx"), "utf8");
  ok(!/Number\(d\.anchor\)/.test(edSrc), "源码里已无「非数字锚点兜成 1」的写法");
  ok(/function resolveOutlineLine\(/.test(edSrc), "三层兜底 resolveOutlineLine 在位");
  ok(/function lineOfSectionTitle\(/.test(edSrc), "标题回查 lineOfSectionTitle 在位");

  /* ============ H. 状态栏（v0.6.2 新贡献面 props.setStatus） ============ */
  console.log("\n── H. 状态栏 setStatus（宿主 PluginEditorStatus）──");
  const statusCalls = [];
  const hS = mount(SAMPLE, "source", { setStatus: function (items) { statusCalls.push(items); } });
  await hS.render();
  ok(statusCalls.length >= 1, "渲染后即推送状态（不靠定时器）", statusCalls.length);
  const last = statusCalls[statusCalls.length - 1];
  ok(Array.isArray(last), "推的是数组（宿主只收数组，非数组被当空处理）");
  ok(last && last.length <= 6, "条目数 ≤ 6（宿主 MAX_ITEMS）", last && last.length);
  ok(last && last.every((it) => it && typeof it.id === "string" && typeof it.text === "string"), "每条都带 id / text");
  ok(last && last.every((it) => it.text.length <= 80), "单条 ≤ 80 字（宿主 MAX_TEXT）");
  const ids = (last || []).map((it) => it.id);
  ok(new Set(ids).size === ids.length, "id 不重复（宿主按 id+text+title 去重）", ids.join(","));
  const byId = (k) => (last || []).filter((it) => it.id === k)[0];
  ok(byId("sec") && byId("sec").text === "📑 5 节", "节数 = 真实章节数 5", byId("sec") && byId("sec").text);
  ok(byId("env") && byId("env").text === "∑1 · 图1 · 表1", "公式/图/表 = 真实环境数", byId("env") && byId("env").text);
  ok(byId("cite") && /^🔖 2 · ≈\d+ 字$/.test(byId("cite").text), "引用数 = 2（两处 \\cite）+ 近字数", byId("cite") && byId("cite").text);
  ok(byId("todo") && byId("todo").text === "📌 2 待办", "TODO/FIXME 注释被数到（2 条）", byId("todo") && byId("todo").text);
  ok(byId("pos") && byId("pos").text === "Ln 1, Col 1", "光标行列", byId("pos") && byId("pos").text);

  const beforeS = statusCalls.length;
  hS.dispatch({ type: "notrat-latex-active-file", detail: { path: "E:/somewhere/other.tex", name: "other.tex" } });
  await hS.render();
  ok(statusCalls.length === beforeS,
     "别的文件成为活动文件后：不抢着推、也不清空（清空会盖掉对方的状态栏）", statusCalls.length - beforeS);

  const hNo = mount(SAMPLE, "source");
  await hNo.render();
  ok(true, "宿主没注入 setStatus 时不抛错（向后兼容老宿主）");

`;

  s = s.replace(tail, G + tail);
  fs.writeFileSync(p, s);
  console.log("  ✓ test-nav.js：追加 G（锚点硬化 4 组）+ H（状态栏 12 项）");
}
