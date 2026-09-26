#!/usr/bin/env node
/**
 * v0.7.2 —— 按用户反馈改：三种视图都能编辑 / 就地编辑不再掉进源码 / UI 精简
 *
 * 用户原话：
 *   1. 进行编辑的时候还是会进入到分栏里面
 *   2. 这几种模式应该都支持
 *   3. 就地编辑文档意思是在预览的情况下直接编辑，而不是由源代码展示出来
 *   4. 顶部和底部的很多功能可以去掉，优化UI
 *
 * 根因（1 与 3 是同一个）：
 *   gotoLine() 在源码 textarea 没挂载时直接 setView("split")。而就地编辑层里每张原子卡片
 *   都带 data-line，onPreviewClick 又是「点带 data-line 的节点就跳源码」——于是在预览里
 *   点一下公式/图表卡片，就被踢进分屏看见源码。这就是「一编辑就进分栏」。
 *   另外原子卡片此前把 LaTeX 原样塞进 <pre>，也正是「由源代码展示出来」。
 *
 * 本次改动，全部锚点断言后再落盘；跑了 n 次改不动就报错，不静默跳过。
 */
const fs = require("fs");
const path = require("path");

const ws = path.join(__dirname, "..");
const file = path.join(ws, "panels", "editor.tsx");
let s = fs.readFileSync(file, "utf8");
const eol = s.includes("\r\n") ? "\r\n" : "\n";
if (eol === "\r\n") s = s.split("\r\n").join("\n");

const applied = [];
const missed = [];

function E(name, from, to) {
  const n = s.split(from).length - 1;
  if (n !== 1) { missed.push(name + "（锚点命中 " + n + " 次，应为 1）"); return; }
  s = s.replace(from, to);
  applied.push(name);
}

/* ============================================================
 * 1) 视图状态：记住「可视化侧」上次是预览还是分屏
 * ============================================================ */
E(
  "S1 视图 ref",
  `  const [view, setView] = useState("split"); // src | split | preview`,
  `  const [view, setView] = useState("split"); // src | split | preview
  /* 可视化侧上次挑的是「预览」还是「分屏」——宿主标题栏开关来回切时按这个还原，
   * 而不是一律拍回预览（用户要的是「几种模式都支持」，不是只有一个能用） */
  const lastPvView = useRef("split");`
);

E(
  "S2 宿主 mode → 视图",
  `    const hv = String(hostMode).toLowerCase();
    if (hv === "wysiwyg" || /vis|preview|render|read|pdf/.test(hv)) setView("preview");
    else if (hv === "source" || /src|code|edit|write|text/.test(hv)) setView("src");
  }, [hostMode]);`,
  `    const hv = String(hostMode).toLowerCase();
    if (hv === "wysiwyg" || /vis|preview|render|read|pdf/.test(hv)) setView(lastPvView.current || "split");
    else if (hv === "source" || /src|code|edit|write|text/.test(hv)) setView("src");
  }, [hostMode]);`
);

E(
  "S3 goView 回写",
  `  const goView = (v) => {
    /* 离开可视化视图前把改动落盘：否则切到源码视图会看到旧内容 */
    if (view === "preview" && v !== "preview") commitWys();
    setView(v);
    if (typeof props.onModeSwitch === "function") {
      if (v === "preview") props.onModeSwitch("wysiwyg");
      else if (v === "src") props.onModeSwitch("source");
    }
  };`,
  `  const goView = (v) => {
    /* 离开可视化视图前把改动落盘：否则切到源码视图会看到旧内容 */
    if (view === "preview" && v !== "preview") commitWys();
    if (v !== "src") lastPvView.current = v;   // 记住可视化侧的选择（预览 / 分屏）
    setView(v);
    if (typeof props.onModeSwitch === "function") {
      /* 分屏里同样是「渲染过的文档」，对齐宿主的「可视化」态，标题栏开关才不骗人 */
      if (v === "preview" || v === "split") props.onModeSwitch("wysiwyg");
      else if (v === "src") props.onModeSwitch("source");
    }
  };`
);

/* ============================================================
 * 2) baseDir 上移到 wys 之前 + wys 改为富渲染原子块
 *    （依赖数组渲染期立即求值 —— 再次踩 TDZ 就是 0.7.0 事故重演）
 * ============================================================ */
E(
  "S4 baseDir 上移 + wys 签名",
  `  const wys = useMemo(() => {
    try { return { html: wysRenderDoc(content, renderMath) }; }
    catch (e) { return { html: '<div class="wys-err">就地编辑层渲染失败：' + esc(String((e && e.message) || e)) + "</div>" }; }
  }, [content, renderMath]);`,
  `  /* 图片基目录：原子卡片现在跟着源码一起富渲染（图 / 表 / 公式），得先有它。
   * ⚠ 必须在 wys 之前声明：依赖数组是渲染期立即求值的，写在后面就是 TDZ
   *   （0.7.0 的 renderMath 白屏事故同款）。 */
  const baseDir = useMemo(() => {
    const p = String(filePath || "");
    const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\\\"));
    return i > 0 ? p.slice(0, i) : "";
  }, [filePath]);

  const wys = useMemo(() => {
    try { return { html: wysRenderDoc(content, renderMath, baseDir) }; }
    catch (e) { return { html: '<div class="wys-err">就地编辑层渲染失败：' + esc(String((e && e.message) || e)) + "</div>" }; }
  }, [content, renderMath, baseDir]);`
);

E(
  "S5 删除原 baseDir",
  `  /* ---------- 实时预览 ---------- */
  const baseDir = useMemo(() => {
    const p = String(filePath || "");
    const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\\\"));
    return i > 0 ? p.slice(0, i) : "";
  }, [filePath]);
`,
  `  /* ---------- 实时预览（baseDir 已上移到 wys 之前声明，避免 TDZ）---------- */
`
);

/* ============================================================
 * 3) 原子卡片：富渲染（问题 3）
 * ============================================================ */
E(
  "S6 richBlockHtml + 签名",
  `function wysRenderDoc(src, renderMath) {`,
  `/* 原子块的「富预览」：把块原文交给只读预览那一套内核，拿回渲染结果而不是源码。
 * 用户原话：就地编辑是「在预览的情况下直接编辑」，不是「由源代码展示出来」。
 * 片段渲染出来的 data-line 是**片段内相对行号**，整体平移到块起始行，行号语义保持一致。
 * 兜底：块太大（>2 万字符）或富渲染抛错 → 退回源码 <pre>，绝不因此炸掉整篇。 */
function richBlockHtml(raw, renderMath, baseDir, startLine) {
  const src = String(raw == null ? "" : raw);
  if (!src) return "";
  const fallback = '<pre class="wys-card-src" style="display:block">' + WYS.escHtml(src) + "</pre>";
  if (src.length > 20000) return fallback;
  /* LPC 在内联进编辑器时才存在；单测里没注入就走兜底（不抛） */
  if (typeof LPC === "undefined" || !LPC || typeof LPC.renderPreview !== "function") return fallback;
  let html = "";
  try { html = LPC.renderPreview(src, { renderMath: renderMath, baseDir: baseDir || "", docHeader: false }).html; }
  catch (e) { html = ""; }
  if (!html) return fallback;
  let min = Infinity;
  const re = /data-line="(\\d+)"/g;
  let m;
  while ((m = re.exec(html))) { const v = parseInt(m[1], 10); if (v < min) min = v; }
  if (min !== Infinity && min !== startLine) {
    /* 卡片自己的 data-line 是 1 基（startLine + 1），内层也要对齐成 1 基绝对行号 */
    const shift = (startLine + 1) - min;
    html = html.replace(/data-line="(\\d+)"/g, function (s2, n) { return 'data-line="' + (parseInt(n, 10) + shift) + '"'; });
  }
  return html;
}

function wysRenderDoc(src, renderMath, baseDir) {`
);

E(
  "S7 卡片改为富预览 + 工具条",
  `    /* 原子块：只读卡片。点一下走已有 onPreviewClick 的 data-line 通路跳源码 */
    const raw = String(b.raw == null ? "" : b.raw);
    const shown = raw.length > 800 ? raw.slice(0, 800) + "\\n…（共 " + raw.split("\\n").length + " 行，点开看源码）" : raw;
    out.push(
      '<div class="wys-card" data-line="' + (b.startLine + 1) + '"' + base + ">" +
        '<div class="wys-card-h"><span class="wys-tag">' + WYS.escHtml(b.label || b.type) + "</span>" +
          '<span class="wys-card-ln">L' + (b.startLine + 1) + (b.endLine > b.startLine ? "–" + (b.endLine + 1) : "") + "</span></div>" +
        '<pre class="wys-card-src">' + WYS.escHtml(shown) + "</pre>" +
      "</div>"
    );`,
  `    /* 原子块：只读，但**用预览内核渲染成富结果**，不再把 LaTeX 原样摆出来。
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
    );`
);

/* ============================================================
 * 4) 跳转：不再偷偷切视图（问题 1）
 * ============================================================ */
E(
  "S8 预览侧定位/闪光/选卡/鼠标处理器",
  `  /* 行跳转：面板 / 内置大纲 / 预览点击都走这里。opts.flash=false 可关掉闪烁。
   *
   * v0.6.1 修「点大纲没反应」：可视化视图下 showSrc = false，源码 textarea 压根没挂载，
   * 而 setView("split") 是异步的 —— 当拍读 taRef 仍是 null。老实现这里直接 return，
   * 外面却照样回 ACK ⇒ 既不跳、面板又以为跳成功、兜底也不触发。
   * 现在：跳不了就返回 false 并把行号挂到 pendingReveal，等 DOM 就绪那一拍补跳。 */`,
  `  /* ---------- 预览内定位（v0.7.2）----------
   * 就地编辑时点一下公式卡片就被踢进分屏看见源码，是用户明确抱怨的行为。
   * 现在：源码 textarea 没挂载时，**视图一律不动**，在预览里滚到那一块闪一下就算跳到了。
   * 只有「显式要求源码」（卡片上的 ↗ 定位）才会切视图。 */
  function flashPreview(el) {
    if (!el) return;
    el.classList.remove("wys-flash");
    void el.offsetWidth;              // 强制回流，保证连点两次动画也会重放
    el.classList.add("wys-flash");
    setTimeout(function () { el.classList.remove("wys-flash"); }, 1200);
  }

  function revealInPreview(ln, flash) {
    const root = pvRef.current;
    if (!root) return false;
    /* .wys-blk 只有 data-s（0 基起始行）；.wys-card 有 data-line（1 基）。统一成 1 基再比。 */
    const cands = root.querySelectorAll("[data-line],[data-s]");
    let best = null, bestLn = -1;
    for (let i = 0; i < cands.length; i++) {
      const el = cands[i];
      const v = el.getAttribute("data-line");
      const n = v != null ? parseInt(v, 10) : (parseInt(el.getAttribute("data-s"), 10) + 1);
      if (!(n >= 1) || n > ln) continue;
      if (n > bestLn) { bestLn = n; best = el; }
    }
    if (!best) return false;
    try { best.scrollIntoView({ block: "center", behavior: "smooth" }); }
    catch (e) { try { best.scrollIntoView(); } catch (e2) {} }
    if (flash !== false) flashPreview(best);
    return true;
  }

  /* 显式「去源码里看这一块」——唯一会切视图的入口 */
  function gotoSourceAt(ln) {
    if (taRef.current) { gotoLine(ln, { source: true }); return; }
    pendingReveal.current = { ln: ln, flash: true, ack: null, source: true };
    if (view === "src") { /* 源码视图首帧，textarea 还没挂上：等补跳那一拍 */ }
    else setView("split");
  }

  function selectCard(card) {
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
      btn.textContent = on ? "{ } 源码" : "{ } 富预览";
    } else if (act === "goto") {
      try { const a = document.activeElement; if (a && a.blur) a.blur(); } catch (e2) {}
      gotoSourceAt(parseInt(card.getAttribute("data-line"), 10) || 1);
    }
  }

  /* 行跳转：面板 / 内置大纲 / 预览点击都走这里。opts.flash=false 可关掉闪烁。
   *
   * v0.6.1 修「点大纲没反应」：可视化视图下 showSrc = false，源码 textarea 压根没挂载，
   * 而 setView("split") 是异步的 —— 当拍读 taRef 仍是 null。老实现这里直接 return，
   * 外面却照样回 ACK ⇒ 既不跳、面板又以为跳成功、兜底也不触发。
   * v0.7.2：跳不了也**不再偷偷切分屏** —— 在预览里滚过去闪一下（视作跳到了，照常回 ACK），
   * 只有 opts.source（用户点了「↗ 定位」）才允许切视图。 */`
);

E(
  "S9 gotoLine 不再强制分屏",
  `  function gotoLine(ln, opts) {
    const ta = taRef.current;
    if (!ta) {
      pendingReveal.current = { ln: ln, flash: !opts || opts.flash !== false, ack: (opts && opts.ack) || null };
      if (view === "preview") setView("split");
      return false;
    }`,
  `  function gotoLine(ln, opts) {
    const wantSrc = !!(opts && opts.source);
    const ta = taRef.current;
    if (!ta) {
      /* 源码 textarea 没挂载（预览视图；或刚切分屏的第一帧）。
       * 只要不是显式要源码，就在预览里兑现定位 —— 视图不动。 */
      if (!wantSrc && revealInPreview(ln, !opts || opts.flash !== false)) return true;
      pendingReveal.current = { ln: ln, flash: !opts || opts.flash !== false, ack: (opts && opts.ack) || null, source: wantSrc };
      if (wantSrc && view !== "split" && view !== "src") setView("split");
      return false;
    }`
);

E(
  "S10 补跳带上 source",
  `    pendingReveal.current = null;
    gotoLineRef.current(p.ln, { flash: p.flash });`,
  `    pendingReveal.current = null;
    gotoLineRef.current(p.ln, { flash: p.flash, source: !!p.source });`
);

E(
  "S11 onPreviewClick 重写",
  `  function onPreviewClick(e) {
    /* 有划选时点击预览 = 收尾选区，不做行跳转 */
    try {
      const sel = window.getSelection();
      if (sel && String(sel).trim()) return;
    } catch (e2) {}
    let el = e.target;
    while (el && el !== e.currentTarget) {
      if (el.getAttribute && el.getAttribute("data-line")) {
        gotoLine(parseInt(el.getAttribute("data-line"), 10) || 1);
        return;
      }
      el = el.parentNode;
    }
  }`,
  `  function onPreviewClick(e) {
    const t = e.target;
    /* 卡片工具条的按钮自己处理（切源码 / 显式定位），别被行跳转抢走 */
    if (t && t.closest && t.closest("[data-act]")) return;
    /* 有划选时点击预览 = 收尾选区，不做行跳转 */
    try {
      const sel = window.getSelection();
      if (sel && String(sel).trim()) return;
    } catch (e2) {}
    /* 就地编辑开着：点正文 / 标题 = 放光标写字；点卡片 = 选中它。一律不动视图。 */
    if (wysOn && t && t.closest && t.closest(".wys-blk")) { clearCardSel(); return; }
    const card = t && t.closest ? t.closest(".wys-card") : null;
    if (card) { selectCard(card); return; }
    clearCardSel();
    /* 只读预览：点带行锚点的节点 → 预览内滚过去闪一下（不再偷偷切分屏） */
    if (!wysOn) {
      const ln = nodeLine(t);
      if (ln) revealInPreview(ln, true);
    }
  }`
);

/* ============================================================
 * 5) 图片懒加载：就地编辑层里也有图（富渲染卡片）
 * ============================================================ */
E(
  "S12 loadAssetsIn",
  `  /* 预览内图片懒加载（走 MCP 读本地文件 → dataURI） */
  useEffect(() => {
    if (!pvRef.current || !serverId) return;
    const imgs = pvRef.current.querySelectorAll("img[data-asset]");
    let chain = Promise.resolve();
    imgs.forEach((img) => {
      const p = img.getAttribute("data-asset");
      if (!p) return;
      if (assetCache.current.has(p)) { img.src = assetCache.current.get(p); return; }
      chain = chain.then(async () => {
        try {
          const out = await callTool("latex_asset", { path: p });
          const a = JSON.parse(out);
          if (a && a.dataUri) { assetCache.current.set(p, a.dataUri); img.src = a.dataUri; }
        } catch (e) { /* 找不到图就留空 */ }
      });
    });
  }, [pv.html, katexVer, serverId]);`,
  `  /* 预览 / 富渲染卡片里的图片懒加载（走 MCP 读本地文件 → dataURI）。
   * v0.7.2：改成「每拍补一次还没排队的图」—— 就地编辑层里也有图（卡片是富渲染的），
   * 只在 pv.html 变化时跑会漏掉它们；拿到的 dataURI 进 assetCache，DOM 重建后同步命中。 */
  function loadAssetsIn(root) {
    if (!root || !serverId) return;
    const imgs = root.querySelectorAll("img[data-asset]:not([data-asset-queued])");
    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i];
      const p = img.getAttribute("data-asset");
      if (!p) continue;
      img.setAttribute("data-asset-queued", "1");   // 只排队一次，避免每拍重复发起
      if (assetCache.current.has(p)) { img.src = assetCache.current.get(p); continue; }
      callTool("latex_asset", { path: p }).then(function (out) {
        try {
          const a = JSON.parse(out);
          if (a && a.dataUri) { assetCache.current.set(p, a.dataUri); img.src = a.dataUri; }
        } catch (e) { /* 找不到图就留空 */ }
      }).catch(function () {});
    }
  }`
);

E(
  "S13 注入后补图",
  `    const html = wysOn ? wys.html : pv.html;
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
  });`,
  `    const html = wysOn ? wys.html : pv.html;
    if (root.__latexHtml !== html) {
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
    }
    /* 图每拍补一次：富渲染的卡片里也会有 img[data-asset] */
    loadAssetsIn(root);
  });`
);

/* ============================================================
 * 6) 顶栏 / 底栏 / 状态栏精简（问题 4）
 * ============================================================ */
E(
  "S14 INSERTS + VIEWS 常量",
  `const tbtnP = { ...tbtn, background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" };`,
  `const tbtnP = { ...tbtn, background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" };
/* 三档视图（v0.7.2：顶栏用分段控件，替掉三个各自为政的按钮） */
const VIEWS = [
  { k: "src", label: "📄 源码" },
  { k: "split", label: "⧉ 分屏" },
  { k: "preview", label: "📑 预览" },
];
/* 常用结构插入（原来 8 个按钮铺一行，太吵；收进「＋ 插入」菜单） */
const INSERTS = [
  ["§ 章节", "\\\\section{}", 1],
  ["§ 小节", "\\\\subsection{}", 1],
  ["∑ 行内公式", "$$", 1],
  ["∑ 公式环境", "\\\\begin{equation}\\\\label{eq:}\\n  \\n\\\\end{equation}", "\\\\end{equation}".length],
  ["🖼 图", "\\\\begin{figure}[htbp]\\n  \\\\centering\\n  \\\\includegraphics[width=.8\\\\linewidth]{}\\n  \\\\caption{}\\n  \\\\label{fig:}\\n\\\\end{figure}", 0],
  ["📊 表", "\\\\begin{table}[htbp]\\n  \\\\centering\\n  \\\\begin{tabular}{lcc}\\n    \\\\hline\\n    & & \\\\\\\\\\n    \\\\hline\\n  \\\\end{tabular}\\n  \\\\caption{}\\n  \\\\label{tab:}\\n\\\\end{table}", 0],
  ["🏷 标签", "\\\\label{}", 1],
  ["🔗 引用", "\\\\ref{}", 1],
  ["📚 文献引用", "\\\\cite{}", 1],
];`
);

E(
  "S15 菜单 state/ref",
  `  const [wysOn, setWysOn] = useState(true);`,
  `  const [wysOn, setWysOn] = useState(true);
  /* 「＋ 插入」菜单（v0.7.2 把 8 个插入按钮收成 1 个） */
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);`
);

E(
  "S16 菜单点外关闭",
  `  }, [quote]);

  /* toast 自动消失 */`,
  `  }, [quote]);

  /* 「＋ 插入」菜单：点别处 / Esc 关掉 */
  useEffect(() => {
    if (!menu) return;
    function onDown(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false); }
    function onKey(e) { if (e.key === "Escape") setMenu(false); }
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  /* toast 自动消失 */`
);

E(
  "S17 顶栏重写",
  `      {/* 工具栏 */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderBottom: "1px solid hsl(var(--border))", flexWrap: "wrap" }}>
        <button style={tbtn} onClick={doCompile} disabled={busy === "compile"}>
          {busy === "compile" ? "⏳ 编译中…" : "🔨 编译"}
        </button>
        <button style={tbtn} onClick={doValidate} disabled={busy === "validate"}>
          {busy === "validate" ? "⏳ 校验中…" : "✅ 校验"}
        </button>
        <span style={{ width: 1, height: 16, background: "hsl(var(--border))", margin: "0 4px" }} />
        <button style={{ ...tbtn, border: "none", background: "transparent", color: view === "src" ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))", fontWeight: view === "src" ? 700 : 400 }} onClick={() => goView("src")}>📄 源码</button>
        <button style={{ ...tbtn, border: "none", background: "transparent", color: view === "split" ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))", fontWeight: view === "split" ? 700 : 400 }} onClick={() => goView("split")}>⧉ 分屏</button>
        <button style={{ ...tbtn, border: "none", background: "transparent", color: view === "preview" ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))", fontWeight: view === "preview" ? 700 : 400 }} onClick={() => goView("preview")}>📑 预览</button>
        <button
          style={{ ...tbtn, border: "none", background: "transparent", color: wysOn ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))", fontWeight: wysOn ? 700 : 400 }}
          onClick={() => { if (wysOn) commitWys(); setWysOn(!wysOn); }}
          title="可视化视图里直接改正文与标题；公式 / 引用 / 浮动体保持原子不可误伤，改完失焦即写回源码（只替换被改的块）"
        >{wysOn ? "✏ 就地编辑" : "🔒 只读预览"}</button>
        <span style={{ width: 1, height: 16, background: "hsl(var(--border))", margin: "0 4px" }} />
        <button style={tbtn} onClick={() => insert("\\\\section{}", 1)}>§ section</button>
        <button style={tbtn} onClick={() => insert("\\\\subsection{}", 1)}>§§ sub</button>
        <button style={tbtn} onClick={() => insert("\\\\begin{equation}\\\\label{eq:}\\n  \\n\\\\end{equation}", "\\\\end{equation}".length)}>∑ 公式</button>
        <button style={tbtn} onClick={() => insert("\\\\begin{figure}[htbp]\\n  \\\\centering\\n  \\\\includegraphics[width=.8\\\\linewidth]{}\\n  \\\\caption{}\\n  \\\\label{fig:}\\n\\\\end{figure}", 0)}>🖼 图</button>
        <button style={tbtn} onClick={() => insert("\\\\begin{table}[htbp]\\n  \\\\centering\\n  \\\\begin{tabular}{lcc}\\n    \\\\hline\\n    & & \\\\\\\\\\n    \\\\hline\\n  \\\\end{tabular}\\n  \\\\caption{}\\n  \\\\label{tab:}\\n\\\\end{table}", 0)}>📊 表</button>
        <button style={tbtn} onClick={() => insert("\\\\label{}", 1)}>🏷 label</button>
        <button style={tbtn} onClick={() => insert("\\\\ref{}", 1)}>🔗 ref</button>
        <button style={tbtn} onClick={() => insert("\\\\cite{}", 1)}>📚 cite</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: toolReady ? "hsl(var(--muted-foreground))" : "#f59e0b" }}>
          {toolReady ? (katexOkRef.current ? "⚙ 工具就绪 · ∑ KaTeX" : "⚙ 工具就绪") : "⚙ MCP 未连接（解析/编译不可用）"}
        </span>
      </div>`,
  `      {/* 工具栏（v0.7.2 精简：14 个按钮 → 视图分段 + 就地编辑 + 插入菜单 + 编译/校验 + 状态点） */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderBottom: "1px solid hsl(var(--border))", flexWrap: "wrap" }}>
        <div style={{ display: "flex", border: "1px solid hsl(var(--border))", borderRadius: 8, overflow: "hidden" }}>
          {VIEWS.map((v) => (
            <button
              key={v.k}
              onClick={() => goView(v.k)}
              style={{
                border: "none", cursor: "pointer", padding: "3px 11px", fontSize: 12, fontFamily: "inherit",
                background: view === v.k ? "hsl(var(--primary))" : "transparent",
                color: view === v.k ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
              }}
            >{v.label}</button>
          ))}
        </div>

        {view !== "src" ? (
          <button
            style={{ ...tbtn, border: "none", background: wysOn ? "hsl(var(--primary)/.14)" : "transparent", color: wysOn ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))", fontWeight: wysOn ? 600 : 400 }}
            onClick={() => { if (wysOn) commitWys(); setWysOn(!wysOn); }}
            title="预览里直接改正文与标题；公式 / 引用 / 浮动体是原子节点，改不到内部。失焦即写回源码，只替换被改的块。"
          >{wysOn ? "✏ 就地编辑" : "🔒 只读"}</button>
        ) : null}

        {view !== "preview" ? (
          <div ref={menuRef} style={{ position: "relative" }}>
            <button style={tbtn} onClick={() => setMenu(!menu)} title="在光标处插入常用结构">＋ 插入 {menu ? "▴" : "▾"}</button>
            {menu ? (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 40, minWidth: 150, padding: 4, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", boxShadow: "0 8px 24px rgba(0,0,0,.25)" }}>
                {INSERTS.map((it) => (
                  <button
                    key={it[0]}
                    onClick={() => { insert(it[1], it[2]); setMenu(false); }}
                    style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", color: "hsl(var(--popover-foreground))", fontFamily: "inherit", fontSize: 12, padding: "5px 8px", borderRadius: 5, cursor: "pointer" }}
                  >{it[0]}</button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div style={{ flex: 1 }} />

        <button style={{ ...tbtn, border: "none", background: "transparent" }} onClick={doCompile} disabled={busy === "compile"} title="编译当前 .tex（MCP latex_compile）">
          {busy === "compile" ? "⏳" : "🔨"} 编译
        </button>
        <button style={{ ...tbtn, border: "none", background: "transparent" }} onClick={doValidate} disabled={busy === "validate"} title="校验 ref / cite / label（MCP latex_validate）">
          {busy === "validate" ? "⏳" : "✅"} 校验
        </button>
        <span
          title={toolReady ? (katexOkRef.current ? "MCP 工具就绪 · 公式用 KaTeX 渲染" : "MCP 工具就绪 · 公式走内置简易渲染") : "MCP 未连接：解析 / 编译不可用"}
          style={{ fontSize: 11, color: toolReady ? "hsl(var(--muted-foreground))" : "#f59e0b" }}
        >{toolReady ? (katexOkRef.current ? "⚙ ✓" : "⚙") : "⚙ 未连接"}</span>
      </div>`
);

E(
  "S18 预览区加 mousedown",
  `              className="pv-root"
              onClick={onPreviewClick}
              onMouseUp={capturePvQuote}`,
  `              className="pv-root"
              onClick={onPreviewClick}
              onMouseDown={onPreviewMouseDown}
              onMouseUp={capturePvQuote}`
);

E(
  "S19 底栏条件显示（开）",
  `      {/* 底部结果面板 */}
      <div style={{ borderTop: "1px solid hsl(var(--border))" }}>`,
  `      {/* 底部结果面板：v0.7.2 起「有结果才出现」—— 常驻的三按钮条太吵 */}
      {issues || compileOut || err ? (
      <div style={{ borderTop: "1px solid hsl(var(--border))" }}>`
);

E(
  "S20 底栏加收起按钮",
  `            🔨 编译 {compileOut ? "•" : ""}
          </button>
          {err ? <span style={{ fontSize: 11, color: "#ef4444" }}>⚠ {err}</span> : null}
        </div>`,
  `            🔨 编译 {compileOut ? "•" : ""}
          </button>
          {err ? <span style={{ fontSize: 11, color: "#ef4444" }}>⚠ {err}</span> : null}
          <div style={{ flex: 1 }} />
          <button style={{ ...tbtn, border: "none", background: "transparent", color: "hsl(var(--muted-foreground))" }} onClick={() => setBottomOpen(false)} title="收起结果">✕</button>
        </div>`
);

E(
  "S21 底栏条件显示（合）",
  `        ) : null}
      </div>

      {/* 状态栏 */}`,
  `        ) : null}
      </div>
      ) : null}

      {/* 状态栏 */}`
);

E(
  "S22 状态栏精简",
  `      {/* 状态栏 */}
      <div style={{ display: "flex", gap: 14, alignItems: "center", padding: "2px 10px", borderTop: "1px solid hsl(var(--border))", fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
        <span>Ln {cursor.line}, Col {cursor.col}</span>
        <span>{lines.length} 行</span>
        <span>中文 {wc.cjk} + 英文 {wc.latin} ≈ {wc.total} 字</span>`,
  `      {/* 状态栏：只留每拍真的会看的（v0.7.2 去掉行数、中英拆分这些噪音） */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "2px 10px", borderTop: "1px solid hsl(var(--border))", fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
        <span>Ln {cursor.line}, Col {cursor.col}</span>
        <span>≈ {wc.total} 字</span>`
);

E(
  "S23 宿主状态栏去重复项",
  `    if (view !== "src" && wysOn) items.push({ id: "wys", text: "✏ 就地编辑", title: "可视化视图可直接改正文与标题；失焦即写回源码，只替换被改的块" });
`,
  `    /* v0.7.2：不再往宿主状态栏塞「✏ 就地编辑」—— 顶栏已经明示，重复只是噪音 */
`
);

E(
  "S24 WYS_CSS 卡片样式",
  `.wys-card{border:1px dashed hsl(var(--border));border-radius:10px;padding:8px 12px;margin:12px 0;background:hsl(var(--muted)/.22);cursor:pointer}
.wys-card:hover{background:hsl(var(--muted)/.42);border-color:hsl(var(--primary)/.5)}
.wys-card-h{display:flex;justify-content:space-between;gap:10px;font-size:11.5px;color:hsl(var(--muted-foreground));margin-bottom:4px}
.wys-card-ln{font-family:Consolas,monospace;opacity:.8}
.wys-card-src{margin:0;white-space:pre-wrap;overflow-wrap:break-word;font-family:Consolas,'Courier New',monospace;font-size:12.5px;line-height:1.6;color:hsl(var(--foreground)/.82);max-height:260px;overflow:auto}`,
  `.wys-card{border:1px solid hsl(var(--border));border-radius:10px;margin:12px 0;background:hsl(var(--card));overflow:hidden}
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
.wys-card[data-show="src"] .wys-card-body{display:none}
.wys-flash{animation:wysflash 1.1s ease-out}
@keyframes wysflash{from{background:hsl(var(--primary)/.22)}to{background:transparent}}`
);

/* ---------- 落盘 ---------- */
console.log("v0.7.2 补丁 · 锚点结果");
console.log("-".repeat(56));
for (const a of applied) console.log("  ✓ " + a);
for (const m of missed) console.log("  ✗ " + m);
console.log("-".repeat(56));

if (missed.length) {
  console.error("有锚点没命中，未写盘（先修锚点再跑）");
  process.exit(1);
}

fs.writeFileSync(file, eol === "\r\n" ? s.split("\n").join("\r\n") : s, "utf8");
console.log("已写入 panels/editor.tsx（" + s.split("\n").length + " 行）");
