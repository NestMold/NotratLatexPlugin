"use strict";
/* =====================================================================
 * v0.9.12 验收门 —— 绘图环境「点一下就地渲染」
 *
 * 用户原话：「不能直接看到图片吗」
 *
 * 这一层做的事：占位卡上加一个「🖼 渲染这张图」，点了才用**本机 TeX 引擎**把
 * 这一个环境编一次、栅格化成 PNG 回预览。不自动编（一屏 10 张图 = 首屏 19 秒），
 * 不往工作区写任何东西（aux/log/pdf 全在系统临时目录），按内容 hash 缓存。
 *
 * 这一层最贵的错不是「编不过」，是**编过了但画错了**。所以门禁钉的不是
 * 「按钮能不能点」，而是下面这几条会静默出错的：
 *
 *   [A] 卡片：按钮 / 折叠 / data 属性都在；只有能独立成篇的环境才给按钮
 *       （scope 是 tikzpicture 的片段，给它按钮 = 让它必编必败）
 *   [B] 包装：standalone 判定、导言保真、**中文不许丢**（原 class 是 ctexart 时，
 *       换成 standalone 就把 ctex 带走了 —— 实测：不补 \usepackage{ctex} 会
 *       静默缺字 60 处、图窄 89px，而编译退出码是 0）、字号跟随原文档
 *   [C] 服务端：真编一次（集成）；同一张图第二次点**不起进程**；
 *       工作区一个字节都不许动
 *   [D] 对账：preview-core 的白名单 与 graphic-render 的白名单 必须一模一样
 *       （对不上 = 面板发的 kind 服务端不认 = 点了没反应 = 静默失败）
 *   [E] 反向自检：把上面任何一条改回去，本层必须重新变红
 *
 * 运行： node .setup/check/v0912-graphic-render.js
 * =================================================================== */
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");

const ws = "E:/notrat-latex-plugin";
let pass = 0, fail = 0, skip = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok    " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "\n        → " + String(extra).slice(0, 700) : "")); }
}
function SKIP(name, why) { skip++; console.log("  skip  " + name + "（" + why + "）"); }

const CORE_REL = "server/preview-core.js";
const GR_REL = "server/graphic-render.js";
const PANEL_REL = "panels/editor.tsx";
const IDX_REL = "server/index.js";
const coreSrc = fs.readFileSync(path.join(ws, CORE_REL), "utf8");
const grSrc = fs.readFileSync(path.join(ws, GR_REL), "utf8");
const panelSrc = fs.readFileSync(path.join(ws, PANEL_REL), "utf8");
const idxSrc = fs.readFileSync(path.join(ws, IDX_REL), "utf8");
const P = require(path.join(ws, CORE_REL));
const G = require(path.join(ws, GR_REL));
const CONTRIB = require(path.join(ws, "server/contrib.js"));

function pv(src, opts) { return P.renderPreview("\\begin{document}\n" + src + "\n\\end{document}\n", opts || {}).html; }
function textOf(html) { return String(html).replace(/<[^>]*>/g, ""); }
function proseOf(html) { return textOf(String(html).replace(/<pre class="pv-graphic-code">[\s\S]*?<\/pre>/g, "")); }

const TIKZ = [
  "\\begin{tikzpicture}[",
  "    font=\\small,",
  "    box/.style={draw=black!55, rounded corners=2.5pt, align=center,",
  "                 minimum height=9mm, inner sep=2.5mm, fill=black!3},",
  "  ]",
  "  \\node[box] (task) at (0, 0)       {用户任务};",
  "  \\node[box] (loop) at (2.9, 0)     {D2\\\\循环编排};",
  "  \\draw (task) -- (loop);",
  "\\end{tikzpicture}",
].join("\n");

/* 用户真的那份图源（作者自己抽出来的 standalone 图源） */
const FIG_REL = "samples/figs/fig-five-dim.tex";
const figSrc = fs.readFileSync(path.join(ws, FIG_REL), "utf8");
const mainSrc = fs.readFileSync(path.join(ws, "samples/test.tex"), "utf8");
function tikzInnerOf(text) {
  const b = text.indexOf("\\begin{tikzpicture}");
  if (b < 0) return "";
  const bs = b + "\\begin{tikzpicture}".length;
  const e = text.indexOf("\\end{tikzpicture}", bs);
  return e < 0 ? "" : text.slice(bs, e);
}
const figInner = tikzInnerOf(figSrc);

/* ---------- 引擎（没有就明确 skip，绝不假装通过） ---------- */
let engine = null;
/* figs/build.sh 用的是 latexmk -xelatex —— 作者那份 figs/fig-five-dim.pdf 就是 xelatex 的产物。
 * 对账（尺寸 / 缺字）必须用同一个引擎，否则比的是两种排版器的差异，不是我们的错。 */
try { engine = CONTRIB.pickCompiler("xelatex", null); } catch (e) { engine = null; }
/* xelatex 不在时退而求其次：功能照样验，但「与作者产物同尺寸」「缺字对照」这两条改判 skip ——
 * 换引擎时缺字检测本身就不一定成立（实测 tectonic 会把中文兜住、根本不报 Missing character）。 */
let engineExact = !!engine;
if (!engine) {
  try { engine = CONTRIB.pickCompiler(CONTRIB.envReal("LATEX_COMPILER"), null); } catch (e) { engine = null; }
}
function hostOf() {
  return {
    pickEngine: function () { if (!engine) { const e2 = new Error("no engine"); e2.code = "NO_ENGINE"; throw e2; } return { exe: engine.exe, name: engine.name }; },
    log: function () {},
  };
}

(async function () {
  console.log("\n[A] 卡片：按钮 / 折叠 / data 属性");
  {
    const h = pv(TIKZ);
    ok("绘图环境出了卡片（.pv-graphic 原样留着 —— v0911 门禁认它）", /class="pv-graphic"/.test(h), h);
    ok("TikZ 徽章还在", /pv-graphic-badge">TikZ</.test(h), h);
    ok("说得清「预览不渲染」（不假装已经渲染出来了）", h.indexOf("预览不渲染") >= 0, h);
    ok("★ 有「渲染这张图」按钮", /data-graphic-render="1"/.test(h), h);
    ok("★ 有「收起 / 展开源码」折叠按钮", /data-graphic-fold="1"/.test(h), h);
    ok("卡片带上了环境名（面板要靠它发 kind）", h.indexOf('data-graphic="tikzpicture"') >= 0, h);
    ok("★ 按钮带 data-act（预览的行跳转认这个标记，会主动让路）",
      /data-graphic-render="1" data-act="1"/.test(h) && /data-graphic-fold="1" data-act="1"/.test(h), h);
    ok("源码一个字没丢（原样收在 <pre class=\"pv-graphic-code\"> 里）",
      /<pre class="pv-graphic-code">/.test(h) && h.indexOf("box/.style") >= 0, h);
    ok("图体容器在卡里（渲染结果往这儿塞）", /class="pv-graphic-body"/.test(h), h);
    ok("状态位在卡里（编译中 / 已渲染 / 失败原因往这儿写）", /class="pv-graphic-st"/.test(h), h);
    const prose = proseOf(h);
    ok("指令仍然不许漏进正文", prose.indexOf("box/.style") < 0 && prose.indexOf("(task)") < 0, prose);
  }
  {
    /* scope / pin / pgfonlayer 是 tikzpicture 的**片段** —— 单独编必然报错，
     * 所以绝不给它们按钮（给了就是「点了必失败」的假承诺）。 */
    const h = pv("\\begin{scope}[xshift=1cm]\n  \\node (a) at (0,0) {甲};\n\\end{scope}");
    ok("★ 片段环境（scope）不给渲染按钮", /class="pv-graphic"/.test(h) && !/data-graphic-render/.test(h), h);
    ok("片段环境照样说清是绘图环境（不能当正文排）", h.indexOf("预览不渲染") >= 0, h);
    const h2 = pv("\\begin{asy}\n  draw((0,0)--(1,1));\n\\end{asy}");
    ok("Asymptote / PSTricks 也不给按钮（xelatex 编不动）", /class="pv-graphic"/.test(h2) && !/data-graphic-render/.test(h2), h2);
  }
  {
    /* 导出 HTML 是静态网页，没人接这个点击 —— 发个点不动的按钮出去就是骗人 */
    const h = pv(TIKZ, { graphicButtons: false });
    ok("★ 导出 HTML 语境不发按钮（点不动的控件不许发出去）",
      !/data-graphic-render/.test(h) && !/data-graphic-fold/.test(h), h);
    ok("导出语境下卡片仍然完整（徽章 / 说明 / 源码都在）",
      /pv-graphic-badge/.test(h) && /<pre class="pv-graphic-code">/.test(h), h);
  }

  console.log("\n[B] 包装：standalone 判定 / 导言保真 / 中文不许丢");
  {
    ok("★ 认得出「整篇就是一张图」的 standalone 图源", G.isStandaloneDoc(figSrc) === true);
    ok("认得出 test.tex 不是 standalone 图源（是正文）", G.isStandaloneDoc(mainSrc) === false);
    ok("图源里确实抠到了 tikzpicture 的环境体", figInner.length > 200, "长度 " + figInner.length);
  }
  {
    const doc = G.buildInlineDoc("tikzpicture", figInner, mainSrc, "A");
    ok("★ 换上 standalone 之后**补上了 ctex**（原 class 是 ctexart，不补中文会静默消失）",
      /\\usepackage\{ctex\}/.test(doc.split("\\begin{document}")[0]), doc.split("\n").slice(0, 4).join("\n"));
    ok("★ 字号跟着原文档（test.tex 是 11pt —— 图在正文里就是按 11pt 排的）",
      /\\documentclass\[11pt,tikz,border=3pt\]\{standalone\}/.test(doc), doc.split("\n")[1]);
    ok("Tier A 把原导言区整段搬了过来（宏 / 样式 / 包都在）",
      doc.indexOf("\\usetikzlibrary{arrows.meta,positioning,fit,backgrounds}") >= 0 && doc.indexOf("\\usepackage{amsmath,amssymb}") >= 0);
    ok("原 \documentclass 行没被留下来（留下就是两个 documentclass）",
      (doc.match(/\\documentclass/g) || []).length === 1, doc);
    ok("环境体原样回填（含 [可选参数] 那一段）",
      doc.indexOf("\\begin{tikzpicture}" + figInner + "\\end{tikzpicture}") >= 0);
    ok("有 \\begin{document}…\\end{document} 包着（是完整文档）",
      /\\begin\{document\}[\s\S]*\\end\{document\}/.test(doc));
  }
  {
    /* Tier B：A 编不过时的兜底 —— 搬「画图有关的几行」。少一个 \usetikzlibrary
     * 是静默降级（编得过、图出来、画错了），所以这一条必须钉死。 */
    const docB = G.buildInlineDoc("tikzpicture", figInner, mainSrc, "B");
    ok("★ Tier B 搬来了原文所有 \\usetikzlibrary",
      docB.indexOf("\\usetikzlibrary{arrows.meta,positioning,fit,backgrounds}") >= 0, docB.split("\n").slice(0, 12).join("\n"));
    ok("Tier B 是「最小导言」：不搬原导言区那一大坨", docB.indexOf("\\usepackage{geometry}") < 0);
    ok("Tier B 也补 ctex", /\\usepackage\{ctex\}/.test(docB));
    const carry = G.collectCarryOver(mainSrc);
    ok("搬家清单收得到 \\usetikzlibrary", carry.some(function (l) { return /^\\usetikzlibrary/.test(l); }), carry.join(" | "));
    const carry2 = G.collectCarryOver("\\tikzset{box/.style={draw, rounded corners=2pt}}\n\\definecolor{myc}{RGB}{1,2,3}\n");
    ok("★ 嵌套花括号也读得全（\\tikzset{…{…}…} 不能只读到一半）",
      carry2.some(function (l) { return l.indexOf("rounded corners=2pt}}") >= 0; }), carry2.join(" | "));
    ok("\\definecolor 的三个参数都收（少一个就编不过）",
      carry2.some(function (l) { return l === "\\definecolor{myc}{RGB}{1,2,3}"; }), carry2.join(" | "));
  }
  {
    /* pgfplots：axis 家族必须先把包装上，否则那一行 \pgfplotsset 自己就报 undefined */
    const docAxis = G.buildInlineDoc("axis", "\\addplot coordinates {(0,0) (1,1)};", "\\documentclass{article}\n\\usepackage{pgfplots}\n", "B");
    ok("axis（pgfplots）在 Tier B 里会装 pgfplots", docAxis.indexOf("\\usepackage{pgfplots}") >= 0, docAxis);
    ok("axis 还带了 compat（不写会出一堆兼容告警）", docAxis.indexOf("\\pgfplotsset{compat=1.18}") >= 0, docAxis);
  }
  {
    ok("★ 危险源码被拒：\\write18", !!G.findDanger("\\immediate\\write18{rm -rf /}"));
    ok("★ 危险源码被拒：管道式 \\input", !!G.findDanger("\\input{|cmd}"));
    ok("危险源码被拒：\\directlua", !!G.findDanger("\\directlua{os.execute('x')}"));
    ok("正常 TikZ 不被误伤（\\node / \\draw / \\foreach 都得放行）",
      !G.findDanger(TIKZ) && !G.findDanger("\\foreach \\x in {1,2} {\\node at (\\x,0) {\\x};}"));
  }

  console.log("\n[C] 服务端：真编一次 / 缓存 / 不碰工作区");
  {
    if (!engine) {
      SKIP("真编译集成（单图编译 + 栅格化 + 缓存）", "本机没探测到 TeX 引擎");
      SKIP("对照实验：不补 ctex 会不会缺字", "本机没探测到 TeX 引擎");
    } else {
      console.log("        （引擎：" + engine.name + " @ " + engine.exe + "｜对账基准：" + (engineExact ? "xelatex（与作者产物同引擎）" : "非 xelatex，尺寸/缺字对照改判 skip") + "）");
      const figPath = path.join(ws, FIG_REL);

      /* 工作区快照：编译前后 samples/ 下一个字节都不许动 */
      function snap() {
        const out = {};
        const walk = function (d) {
          for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) { if (e.name !== ".latex-history") walk(p); }
            else out[p] = fs.statSync(p).mtimeMs + ":" + fs.statSync(p).size;
          }
        };
        walk(path.join(ws, "samples"));
        return out;
      }
      const before = snap();

      const t0 = Date.now();
      const r1 = await G.renderGraphic({ kind: "tikzpicture", source: figInner, doc: figSrc, path: figPath }, hostOf());
      const ms1 = Date.now() - t0;
      ok("★ 真编成了（standalone 图源整篇直编）", r1.ok === true, JSON.stringify({ code: r1.code, reason: r1.reason && String(r1.reason).slice(0, 300) }));
      if (r1.ok) {
        ok("模式判定为 file（整篇就是一张图）", r1.mode === "file", r1.mode);
        ok("回报了用的是哪一级包装", r1.tier === "F" || r1.tier === "A", r1.tier);
        ok("回报了缺字条数（0 = 没丢字）", r1.missing === 0, "missing=" + r1.missing + " warn=" + r1.warn);
        ok("产出是 PNG dataURI", /^data:image\/png;base64,/.test(r1.dataUri), String(r1.dataUri).slice(0, 40));
        ok("PNG 不是空的", (r1.bytes || 0) > 2000, "bytes=" + r1.bytes);
        ok("耗时回报得出来（面板要显示）", !!(r1.ms && r1.ms.total >= 0), JSON.stringify(r1.ms));
        console.log("        第一次：" + ms1 + "ms（编译 " + r1.ms.compile + "ms + 栅格 " + r1.ms.raster + "ms）");

        /* ★ 尺寸对账：同一份图源，我们编出来的图必须与作者自己的产物**同尺寸**。
         * 这是不看图也能验「画对了没有」的最硬一条 —— 少了 ctex 会窄 89px。 */
        const RASTER = require(path.join(ws, "server/pdf-raster.js"));
        try {
          const ref = await RASTER.rasterPdf(path.join(ws, "samples/figs/fig-five-dim.pdf"), { dpi: r1.dpi });
          const mine = Buffer.from(r1.dataUri.split(",")[1], "base64");
          const same = mine.readUInt32BE(16) === ref.buf.readUInt32BE(16) && mine.readUInt32BE(20) === ref.buf.readUInt32BE(20);
          if (!engineExact) {
            SKIP("尺寸对账（我们 " + mine.readUInt32BE(16) + "x" + mine.readUInt32BE(20) + " vs 作者 " + ref.buf.readUInt32BE(16) + "x" + ref.buf.readUInt32BE(20) + "）",
              "本机没有 xelatex，这份参考 PDF 是 xelatex 编的 —— 换引擎比尺寸比的是排版器差异，不是对错");
          } else {
            ok("★ 我们编的图与作者自己的 figs/fig-five-dim.pdf **逐像素同尺寸**（" + mine.readUInt32BE(16) + "x" + mine.readUInt32BE(20) + "）—— 丢了中文就会窄 89px，这一条立刻红",
              same, mine.readUInt32BE(16) + "x" + mine.readUInt32BE(20) + " vs " + ref.buf.readUInt32BE(16) + "x" + ref.buf.readUInt32BE(20));
          }
        } catch (e) {
          SKIP("尺寸对账", "参考 PDF 栅格化失败：" + String(e.message).slice(0, 80));
        }
      }

      const t1 = Date.now();
      const r2 = await G.renderGraphic({ kind: "tikzpicture", source: figInner, doc: figSrc, path: figPath }, hostOf());
      ok("★ 第二次点：命中缓存（同一内容 hash）", r2.ok === true && r2.cached === true, JSON.stringify({ ok: r2.ok, cached: r2.cached }));
      ok("★ 缓存命中是**零进程**（毫秒级，不是又编了一遍）", Date.now() - t1 < 300, "耗时 " + (Date.now() - t1) + "ms");
      ok("缓存命中也不重复报缺字/警告", r2.missing === 0 && !r2.warn, JSON.stringify({ missing: r2.missing, warn: r2.warn }));

      /* 内联那张图：同一段源码，doc 换成正文 —— 必须与 above 走**不同**的缓存键 */
      const r3 = await G.renderGraphic({ kind: "tikzpicture", source: figInner, doc: mainSrc, path: path.join(ws, "samples/test.tex") }, hostOf());
      ok("★ 同一段源码在两个不同的 doc 里 → 不同的缓存键（导言区进 hash）",
        r3.hash !== r1.hash, String(r1.hash).slice(0, 8) + " vs " + String(r3.hash).slice(0, 8));
      ok("内联那张图也编成了（Tier A）", r3.ok === true && r3.mode === "inline", JSON.stringify({ ok: r3.ok, mode: r3.mode, tier: r3.tier, reason: r3.reason && String(r3.reason).slice(0, 200) }));

      /* 拒收：kind 不在白名单 / 环境体为空 / 没 doc —— 都必须是 ok:false 而不是静默成功 */
      const bad1 = await G.renderGraphic({ kind: "scope", source: "x", doc: figSrc, path: figPath }, hostOf());
      ok("★ 片段环境（scope）被服务端拒（白名单在服务端也有一份）", bad1.ok === false && bad1.code === "REJECTED", JSON.stringify(bad1).slice(0, 200));
      const bad2 = await G.renderGraphic({ kind: "tikzpicture", source: "  ", doc: figSrc, path: figPath }, hostOf());
      ok("空环境体被拒", bad2.ok === false && bad2.code === "REJECTED", JSON.stringify(bad2).slice(0, 200));
      const bad3 = await G.renderGraphic({ kind: "tikzpicture", source: figInner, doc: "" }, hostOf());
      ok("★ 拿不到 doc 时宁可拒，也不瞎编（导言区不知道 = 图可能画错）", bad3.ok === false && bad3.code === "REJECTED", JSON.stringify(bad3).slice(0, 200));

      /* 缓存落在系统临时目录里 —— 它**必须**在 tmpdir 下，不许在工作区 */
      ok("★ 缓存落在系统临时目录（不是工作区）",
        path.resolve(G.CACHE_DIR).indexOf(path.resolve(os.tmpdir())) === 0, G.CACHE_DIR);

      const after = snap();
      const changed = Object.keys(after).filter(function (k) { return before[k] !== after[k]; })
        .concat(Object.keys(before).filter(function (k) { return !(k in after); }));
      ok("★ 渲染前后 samples/ 一个字节都没动（aux/log/pdf 全在临时目录）", changed.length === 0, changed.join("\n"));
      ok("★ 作者的 figs/fig-five-dim.pdf 没被覆盖", fs.existsSync(path.join(ws, "samples/figs/fig-five-dim.pdf")) &&
        fs.statSync(path.join(ws, "samples/figs/fig-five-dim.pdf")).size > 10000);
    }
  }

  console.log("\n[D] 对账：面板 ↔ 服务端 ↔ 内核，三边不许漂移");
  {
    const pvNames = Object.keys(G.RENDERABLE).sort();
    const inner = vm.createContext({ module: { exports: {} }, console: console });
    /* preview-core 里的 GRAPHIC_RENDERABLE 是文件内的 const，不导出 —— 从源码里抠出来求值，
     * 这样「两边一致」验的是**真源码**，不是我们以为的值。 */
    const m = /const GRAPHIC_RENDERABLE = \{([\s\S]*?)\};/.exec(coreSrc);
    let coreNames = null;
    if (m) {
      const obj = new Function("return ({" + m[1] + "});")();
      coreNames = Object.keys(obj).sort();
    }
    ok("内核里抠得到 GRAPHIC_RENDERABLE 白名单", !!coreNames, String(coreNames));
    ok("★ 内核白名单 === 服务端白名单（对不上就是「点了没反应」）",
      !!coreNames && JSON.stringify(coreNames) === JSON.stringify(pvNames),
      JSON.stringify(coreNames) + "\n        vs\n        " + JSON.stringify(pvNames));
    ok("★ 面板真的会调这个工具（callTool 里出现 latex_render_graphic）",
      /callTool\("latex_render_graphic"/.test(panelSrc));
    ok("★ 服务端真的注册了这个工具（tools/list 里得有它）",
      /name: "latex_render_graphic"/.test(idxSrc));
    ok("服务端真的分发了它（不是只登记在表里）",
      /if \(name === "latex_render_graphic"\)/.test(idxSrc));
    ok("引擎探测复用「编译正文」那条链（CONTRIB.pickCompiler）",
      /latex_render_graphic[\s\S]{0,600}CONTRIB\.pickCompiler/.test(idxSrc));
    ok("★ 点按接线是捕获阶段挂根节点（一个监听管住预览 / 就地编辑 / 浮层）",
      /addEventListener\("click", onClick, true\)/.test(panelSrc));
    ok("★ 点按走 ref 转一道（否则 [] 效果永远拿到首拍闭包，serverId 恒为空）",
      /gfxRunRef\.current = \{ run: gfxRender/.test(panelSrc) && /const cur = gfxRunRef\.current/.test(panelSrc));
    ok("样式齐了：图体 / 状态 / 失败红字 / 折叠",
      panelSrc.indexOf(".pv-graphic-img{") >= 0 && panelSrc.indexOf(".pv-graphic-st{") >= 0 &&
      panelSrc.indexOf('.pv-graphic-st[data-bad="1"]') >= 0 && panelSrc.indexOf('.pv-graphic[data-graphic-folded="1"] .pv-graphic-code{display:none}') >= 0);
    ok("★ 会话内 memo 用的是 kind+源码（不是 kind 一个键 —— 那样改图不刷新）",
      /const key = kind \+ "\\u0000" \+ code;/.test(panelSrc));
    ok("★ 连点两下只编一次（in-flight 去重）", /gfxInFlight\.current\.has\(key\)/.test(panelSrc));
    ok("★ 预览重画之后按会话缓存把图补回来（gfxRestore 每拍补一次；否则在别处改一个字，图就没了）",
      /function gfxRestore\(root\)/.test(panelSrc) && /^\s*gfxRestore\(root\);$/m.test(panelSrc));
    ok("★ gfxRestore 只认缓存里**已经有的**结果（绝不是「这拍没图了再编一张」）",
      /gfxMemo\.current\.get\(\(card\.getAttribute/.test(panelSrc) &&
      !/function gfxRestore[\s\S]{0,600}?gfxRender\(/.test(panelSrc));
    ok("★ 导出 HTML 不发点不动的按钮", /graphicButtons: false/.test(fs.readFileSync(path.join(ws, "server/export-html.js"), "utf8")));
    ok("★ 编译时显式关掉 shell escape（-no-shell-escape）", /-no-shell-escape/.test(grSrc));
    ok("★ standalone / 内联两条路都只写临时目录（cwd = outDir，用 TEXINPUTS 指回原目录）",
      /cwd: cwd/.test(grSrc) && /TEXINPUTS/.test(grSrc) && /OUT_DIR = path\.join\(CACHE_DIR/.test(grSrc));
    ok("失败不落盘「没引擎」这条（用户可能刚装完引擎）",
      /NO_ENGINE[\s\S]{0,400}return fail/.test(grSrc) && !/writeJson\(failPathOf[\s\S]{0,120}NO_ENGINE/.test(grSrc));
  }

  console.log("\n[D2] 装机产物：源码改了、包还是旧的 —— 这一条会红");
  {
    /* 这一小节的由来与 v0911 的 [D] 同一件事：源码改了、忘了 npm run build，
     * 单测全绿而用户装的还是旧包 —— 那种绿是最没用的绿。 */
    const cands = [
      path.join(os.homedir(), ".notrat/plugins/notrat-latex-plugin.json"),
      path.join(os.homedir(), "AppData/Roaming/notrat/plugins/notrat-latex-plugin.json"),
    ];
    const pkgFile = cands.filter(function (f) { return fs.existsSync(f); })[0] || "";
    if (!pkgFile) {
      SKIP("装机产物核对", "本机没有装机包（没跑过 npm run build）");
    } else {
      const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
      const manifest = JSON.parse(fs.readFileSync(path.join(ws, "manifest.json"), "utf8"));
      const ed = ((pkg.contributions || {}).editors || [{}])[0] || {};
      const edSrc = String(ed.source || "");
      ok("装机包版本号与 manifest 一致（别拿旧包当新包验）",
        pkg.version === manifest.version, pkg.version + " vs " + manifest.version);
      ok("★ 装机包的面板里有渲染接线（gfxRender / gfxRunRef）",
        /gfxRunRef\.current = \{ run: gfxRender/.test(edSrc), "面板源码长度 " + edSrc.length);
      ok("★ 装机包的内核里有绘图卡的按钮与折叠标记",
        edSrc.indexOf('data-graphic-render="1"') >= 0 && edSrc.indexOf('data-graphic-fold="1"') >= 0);
      ok("★ 装机包里有绘图卡的样式（.pv-graphic-img）", edSrc.indexOf(".pv-graphic-img{") >= 0);

      const scDir = path.join(os.homedir(), ".notrat/plugins/notrat-latex-plugin/server");
      const scFile = path.join(scDir, "graphic-render.js");
      ok("★ 装机包的 server 侧带了 graphic-render.js（漏一个 = 点了报 Cannot find module）",
        fs.existsSync(scFile));
      if (fs.existsSync(scFile)) {
        ok("★ 装机包里的 graphic-render.js 与源码**逐字节一致**",
          fs.readFileSync(scFile, "utf8") === grSrc);
      }
    }
  }

  console.log("\n[E] 反向自检：这一层真抓得住这些 bug 吗");
  {
    /* E1：★ 把「补 ctex」那条拿掉，包装文档里就必须**没有 ctex**。
     * 证明 [B] 那条断言钉的是真东西，不是恒真。（真机上它就是 60 处静默缺字的成因） */
    /* v0.9.12 注：这一条判据后来又多了个条件（引擎带不带得动 CJK），写死的锚点当场就命不中了 ——
     * 门禁自己把这件事报了出来（自检锚点还在 → FAIL）。改成「认条件前缀、尾巴随便」的正则，
     * 以后再加条件也不会把这条自检悄悄变成恒真。 */
    const anchor = /if \(\(cjk \|\| classCtex\) && !pkgCtex[^\n]*\) out\.push\("\\\\usepackage\{ctex\}"\);/;
    ok("自检锚点还在（graphic-render 里补 ctex 那一条）", anchor.test(grSrc));
    if (anchor.test(grSrc)) {
      const broken = grSrc.replace(anchor, "0; /* 故意拿掉：换上 standalone 之后不补 ctex */");
      let BG = null;
      /* 裸模块名（fs/os/path…）走真 require；相对路径按 server/ 解析 */
      const sbReq = function (rel) { return /^[./]/.test(rel) ? require(path.join(ws, "server", rel)) : require(rel); };
      const sb = { module: { exports: {} }, console: console, require: sbReq, __dirname: path.join(ws, "server") };
      try { vm.runInNewContext(broken, sb, { filename: "graphic-render.broken.js" }); BG = sb.module.exports; }
      catch (e) { ok("改坏后的内核仍能加载", false, e.message); }
      if (BG) {
        const doc = BG.buildInlineDoc("tikzpicture", figInner, mainSrc, "A");
        ok("★ 拿掉之后包装文档真的没有 ctex 了（证明 [B] 的断言不是恒真）",
          !/\\usepackage\{ctex\}/.test(doc.split("\\begin{document}")[0]), doc.split("\n").slice(0, 3).join("\n"));
      }
    }

    /* E2：把 tikzpicture 从白名单里拿掉 → 卡片必须**不给按钮** */
    const wlAnchor = /const GRAPHIC_RENDERABLE = \{\n  tikzpicture: 1, pgfpicture: 1/;
    ok("自检锚点还在（内核里的白名单）", wlAnchor.test(coreSrc));
    if (wlAnchor.test(coreSrc)) {
      const broken = coreSrc.replace(wlAnchor, "const GRAPHIC_RENDERABLE = {\n  pgfpicture: 1");
      let BP = null;
      const sb = { module: { exports: {} }, console: console };
      try { vm.runInNewContext(broken, sb); BP = sb.module.exports; } catch (e) { ok("改坏后的内核仍能加载", false, e.message); }
      if (BP) {
        const h = BP.renderPreview("\\begin{document}\n" + TIKZ + "\n\\end{document}\n", {}).html;
        ok("★ 拿掉 tikzpicture 之后卡片真的不给按钮了（证明 [A] 不是恒真）",
          /class="pv-graphic"/.test(h) && !/data-graphic-render/.test(h), h.slice(0, 200));
      }
    }

    /* E3：★ 对照实验 —— 把 ctex 那条拿掉，真编一次，必须出现 "Missing character"。
     * 这是 [B] 那条断言的**物理证据**：缺字不是推理出来的，是数出来的。 */
    if (!engine) {
      SKIP("对照实验：不补 ctex 会不会缺字", "本机没探测到 TeX 引擎");
    } else if (!engineExact) {
      /* 实测：tectonic 会把中文兜住、根本不报 "Missing character" ——
       * 换引擎时这条检测**本身**就不成立，硬跑出来的绿是假绿。 */
      SKIP("对照实验：不补 ctex 会不会缺字", "本机没有 xelatex；" + engine.name + " 不一定报 Missing character，跑出来是假绿");
    } else {
      const tmp = path.join(os.tmpdir(), "v0912-ctex-ab");
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
        fs.mkdirSync(tmp, { recursive: true });
        const full = G.buildInlineDoc("tikzpicture", figInner, mainSrc, "A");
        const noCtex = full.split("\\usepackage{ctex}\n").join("");   /* 只掐掉这一行 */
        const out = {};
        for (const pair of [["补 ctex", full], ["不补 ctex", noCtex]]) {
          const tag = pair[0].replace(/\s/g, "");
          const d = path.join(tmp, tag);
          fs.mkdirSync(d, { recursive: true });
          fs.writeFileSync(path.join(d, "figure.tex"), pair[1], "utf8");
          const r = spawnSync(engine.exe, ["-interaction=nonstopmode", "-no-shell-escape", "figure.tex"],
            { cwd: d, encoding: "utf8", timeout: 180000, windowsHide: true });
          out[tag] = (String(r.stdout || "").match(/Missing character/g) || []).length;
        }
        ok("★ 对照实验：补 ctex → 0 处缺字", out["补ctex"] === 0, "缺字 " + out["补ctex"]);
        ok("★ 对照实验：不补 ctex → 真的缺字（证明 ctex 那一条不是多余的）", out["不补ctex"] > 0, "缺字 " + out["不补ctex"]);
      } catch (e) {
        ok("对照实验执行失败", false, String((e && e.message) || e));
      } finally {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
      }
    }
  }

  console.log("\n" + (fail ? "✗" : "✓") + " 通过 " + pass + " / 失败 " + fail + (skip ? " / 跳过 " + skip : ""));
  if (fail) process.exit(1);
})().catch(function (e) {
  console.error("门禁自身抛错：" + ((e && e.stack) || e));
  process.exit(1);
});
