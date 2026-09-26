/* v0.6.1 代码补丁（a）：编辑器跳转修复 + 移除编辑器内大纲 + 大纲面板兜底加重试
 *
 * 【为什么跳转是坏的 —— 真跑出来的，不是猜的】
 * 宿主 editorMode 默认 "wysiwyg" → 本编辑器 view = "preview" → showSrc = false
 * → 源码 textarea 根本没挂载（taRef.current === null）
 * 老 gotoLine：`if (view === "preview") setView("split"); const ta = taRef.current; if (!ta) return;`
 * setView 是异步的 ⇒ 当拍 ref 仍是 null ⇒ 直接 return，什么都没跳；
 * 而外面照样回 ACK ⇒ 面板以为跳成功、170ms 兜底不触发 ⇒ 用户看到「点了没反应，也没提示」。
 * 证据：.setup/test-nav.js 真渲染 —— 修前 4 项失败（ACK 撒谎 / 不滚动 / 不选中 / 不聚焦）。
 */
const fs = require("fs");
const path = require("path");
const WS = "E:/notrat-latex-plugin";

function rep(s, a, b, label) {
  const n = s.split(a).length - 1;
  if (n === 0) { console.error("  ✗ 锚点缺失：" + label); process.exit(1); }
  if (n > 1) { console.error("  ✗ 锚点命中 " + n + " 次（要求唯一）：" + label); process.exit(1); }
  return s.split(a).join(b);
}
function cut(s, start, end, label) {
  const i = s.indexOf(start);
  if (i < 0) { console.error("  ✗ 起始锚点缺失：" + label); process.exit(1); }
  const j = s.indexOf(end, i + start.length);
  if (j < 0) { console.error("  ✗ 结束锚点缺失：" + label); process.exit(1); }
  return s.slice(0, i) + s.slice(j);
}

/* ============================ 1. editor.tsx ============================ */
{
  const p = path.join(WS, "panels", "editor.tsx");
  let s = fs.readFileSync(p, "utf8");
  const n0 = s.length;

  /* 1-1 gotoLine 头：跳不了 → 记 pendingReveal 并返回 false */
  s = rep(
    s,
    `  /* 行跳转：面板 / 内置大纲 / 预览点击都走这里。opts.flash=false 可关掉闪烁。 */
  function gotoLine(ln, opts) {
    if (view === "preview") setView("split");
    const ta = taRef.current; if (!ta) return;`,
    `  /* 行跳转：面板 / 内置大纲 / 预览点击都走这里。opts.flash=false 可关掉闪烁。
   *
   * v0.6.1 修「点大纲没反应」：可视化视图下 showSrc = false，源码 textarea 压根没挂载，
   * 而 setView("split") 是异步的 —— 当拍读 taRef 仍是 null。老实现这里直接 return，
   * 外面却照样回 ACK ⇒ 既不跳、面板又以为跳成功、兜底也不触发。
   * 现在：跳不了就返回 false 并把行号挂到 pendingReveal，等 DOM 就绪那一拍补跳。 */
  function gotoLine(ln, opts) {
    const ta = taRef.current;
    if (!ta) {
      pendingReveal.current = { ln: ln, flash: !opts || opts.flash !== false, ack: (opts && opts.ack) || null };
      if (view === "preview") setView("split");
      return false;
    }`,
    "gotoLine 头"
  );

  /* 1-2 gotoLine 尾：返回 true + 新增统一回执函数 */
  s = rep(
    s,
    `    if (!opts || opts.flash !== false) flashAt(ln);
  }`,
    `    if (!opts || opts.flash !== false) flashAt(ln);
    return true;
  }

  /* 回执：告诉面板「这一跳有人接住了」，面板才不再走兜底（打开文件 + 重发）。
   * v0.6.1 之前是「无条件回」，跳没跳成都不管 —— 那才是这个 bug 能藏这么久的原因。 */
  function ackReveal(ln, nonce) {
    try {
      window.dispatchEvent(new CustomEvent(LATEX_REVEAL_ACK, { detail: { path: filePath || "", line: ln, nonce: nonce || "" } }));
    } catch (e) {}
  }`,
    "gotoLine 尾 + ackReveal"
  );

  /* 1-3 onReveal：只有真的跳了才回 ACK */
  s = rep(
    s,
    `      if (gotoLineRef.current) gotoLineRef.current(ln);
      try {
        window.dispatchEvent(new CustomEvent(LATEX_REVEAL_ACK, { detail: { path: filePath || "", line: ln, nonce: d.nonce || "" } }));
      } catch (e2) {}`,
    `      const ok = gotoLineRef.current ? gotoLineRef.current(ln, { ack: { nonce: d.nonce || "" } }) : false;
      // v0.6.1：跳不成（可视化视图下 textarea 还没挂载）不回 ACK —— 回早了会让面板的兜底
      //（打开文件 + 重发）失效，用户就成了「点了没反应」。当拍跳成由这里回执，补跳成由 flush 补发。
      if (!ok) return;
      ackReveal(ln, d.nonce);`,
    "onReveal 回执"
  );

  /* 1-4 pendingReveal ref */
  s = rep(
    s,
    `  const pendingCursor = useRef(null);`,
    `  const pendingCursor = useRef(null);
  /* v0.6.1：待补跳的行 —— 源码还没挂载时 gotoLine 跳不了，先存这里，DOM 就绪那一拍兑现 */
  const pendingReveal = useRef(null);`,
    "pendingReveal ref"
  );

  /* 1-5 补跳 flush（无 deps = 每拍试一次；pendingReveal 为空立刻返回，不空转） */
  s = rep(
    s,
    `  useEffect(() => { gotoLineRef.current = gotoLine; });`,
    `  useEffect(() => { gotoLineRef.current = gotoLine; });

  /* 补跳：视图切过去 / textarea 挂载之后的那一拍，把 pendingReveal 兑现（并补回执）。
   * 无 deps = 每拍都试；DOM 还没就绪就下次再试，pendingReveal 为空时立刻返回。 */
  useEffect(() => {
    const p = pendingReveal.current;
    if (!p || !taRef.current) return;
    pendingReveal.current = null;
    gotoLineRef.current(p.ln, { flash: p.flash });
    if (p.ack) ackReveal(p.ln, p.ack.nonce);
  });`,
    "flush effect"
  );

  /* 1-6 移除编辑器内大纲：注释 + 渲染块 + 派生数据 + 只服务它的常量 */
  s = rep(
    s,
    `      {/* 主体：大纲 + 源码 + 预览 */}`,
    `      {/* 主体：源码 + 预览（v0.6.1 起编辑器内不再内嵌大纲，章节导航统一走左侧「章节大纲」面板） */}`,
    "主体注释"
  );
  s = cut(s, `        {outline.length > 0 && view !== "preview" ? (`, `        ) : null}` + "\n", "编辑器内大纲渲染块");
  s = cut(s, `  const outline = useMemo(() => {`, `  const wc = useMemo(`, "outline 派生数据");
  s = rep(s, `const SEC_LV = { chapter: 0, section: 1, subsection: 2, subsubsection: 3 };` + "\n", "", "SEC_LV 常量");

  if (/outline\.length > 0|const outline = useMemo|SEC_LV/.test(s)) {
    console.error("  ✗ editor.tsx 仍有编辑器内大纲残留");
    process.exit(1);
  }
  fs.writeFileSync(p, s);
  console.log("  ✓ editor.tsx：" + n0 + " → " + s.length + " 字符（跳转修复 + 补跳 + 移除内嵌大纲）");
}

/* ========================== 2. panels/outline.tsx ========================== */
{
  const p = path.join(WS, "panels", "outline.tsx");
  let s = fs.readFileSync(p, "utf8");
  const n0 = s.length;

  const newFn = `function revealInEditor(path, line) {
  const target = String(path || "");
  const nonce = "rv" + Date.now().toString(36) + Math.floor(Math.random() * 100000).toString(36);
  let acked = false;
  const timers = [];
  function cleanup() {
    window.removeEventListener(LATEX_REVEAL_ACK, onAck);
    for (let i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers.length = 0;
  }
  function onAck(e) {
    const d = (e && e.detail) || {};
    // 本函数派发的 nonce 前缀一致即为自己的回执（重试轮次带 r0/r1/r2 后缀）
    if (String(d.nonce || "").indexOf(nonce) !== 0) return;
    acked = true;
    cleanup();
  }
  window.addEventListener(LATEX_REVEAL_ACK, onAck);
  try { window.dispatchEvent(new CustomEvent(LATEX_REVEAL, { detail: { path: target, line: line, nonce: nonce } })); } catch (e) {}

  /* v0.6.1：兜底从「1 拍」加到「3 拍」。
   * 第一拍没回执，多半是这文件压根没在编辑器里打开 —— 先让宿主打开它；
   * 但「打开文件 → 编辑器挂载 → 监听就绪」需要时间，只补发一次常常又赶不上，
   * 用户于是还是「点了没反应」。多试几拍，代价只是几个空转的 timeout。 */
  const RETRY_DELAYS = [170, 700, 1500];
  RETRY_DELAYS.forEach(function (delay, i) {
    timers.push(setTimeout(function () {
      if (acked) return;
      if (i === 0) {
        try { window.dispatchEvent(new CustomEvent("notrat-open-file", { detail: { path: target } })); } catch (e) {}
      }
      try {
        window.dispatchEvent(new CustomEvent(LATEX_REVEAL, { detail: { path: target, line: line, nonce: nonce + "r" + i } }));
      } catch (e) {}
    }, delay));
  });
}

`;

  const i = s.indexOf("function revealInEditor(path, line) {");
  const j = s.indexOf("/* ============ 显示条件", i);
  if (i < 0 || j < 0) { console.error("  ✗ outline.tsx 未找到 revealInEditor 区间"); process.exit(1); }
  s = s.slice(0, i) + newFn + s.slice(j);

  fs.writeFileSync(p, s);
  console.log("  ✓ outline.tsx：" + n0 + " → " + s.length + " 字符（兜底重试改 3 拍 + nonce 前缀配对）");
}
