"use strict";
/* =====================================================================
 * v0.9.13 验收门 —— 就地编辑浮层里的图，也得有人补
 *
 * 用户报的那句话：「点击就地编辑的时候无法对上」
 *
 * 对不上的是什么：浮层**位置**是对的、块也是对的（角标 L149-159 正是那段 figure），
 * 唯独图没了 —— 那个位置上只剩一行文件名（figs/fig-five-dim.pdf）。
 *
 * 机制（三条合起来才成立）：
 *   ① 内核发出的插图标签只有 data-asset、**没有 src**（真图要面板走 MCP 换 dataURI）；
 *   ② 浏览器对「无 src 的 img」画的是**不可用态** —— 显示 alt 文本，而 alt 就是那个路径；
 *   ③ 「每拍补一次图」只喂了 pvRef（.pv-root），而浮层 .wys-pop 是它的**兄弟节点**，
 *      且浮层 HTML 由 React 用 dangerouslySetInnerHTML 塞进去 —— 敲一个字重设一次
 *      innerHTML，src 更是注定丢。于是浮层这一棵从来没人补。
 *
 * 这一层钉五个面：
 *   [A] 内核前提：真渲染用户那段 figure，插图标签**必须没有 src**（bug 的物理前提；
 *       哪天内核自己带上 src 了，这条会红 —— 那说明前提变了，人该回来看这一层）
 *   [B] 接线：done 聚合、loadPopAssets 走同一条通道、effect 每拍调它、依赖带 serverId
 *   [C] 真跑：把三个函数抠进 vm，配假 DOM / 假 callTool 真跑（缓存命中零 MCP、
 *       未命中一次 MCP 且到货补 src 并回调重摆位、转不出图要降级且照样回调、去重）
 *   [D] 反向自检：把 settle 拿掉 / 把调用拿掉，本层必须重新变红（门禁最怕断言恒真）
 *   [E] 装机产物：重打包之后真检（包里有 loadPopAssets、版本与 manifest 一致）；
 *       若还没打包，它改判 skip 并写明原因 —— 硬跑出来的绿是假绿
 *
 * 运行： node .setup/check/v0913-pop-assets.js
 * =================================================================== */
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

const ws = "E:/notrat-latex-plugin";
let pass = 0, fail = 0, skip = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok    " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "\n        → " + String(extra).slice(0, 700) : "")); }
}
function SKIP(name, why) { skip++; console.log("  skip  " + name + "（" + why + "）"); }

const CORE_REL = "server/preview-core.js";
const PANEL_REL = "panels/editor.tsx";
const coreSrc = fs.readFileSync(path.join(ws, CORE_REL), "utf8");
const panelSrc = fs.readFileSync(path.join(ws, PANEL_REL), "utf8");
const P = require(path.join(ws, CORE_REL));

function pv(src) { return P.renderPreview("\\begin{document}\n" + src + "\n\\end{document}\n", {}).html; }
/* 带 baseDir 的渲染：面板真调 renderPreview 时会传 baseDir，
 * 只有传了它 data-asset 才是**绝对路径**（面板正是拿这个绝对路径去问 MCP）。
 * 不带 baseDir 渲染出来是相对路径 —— 那是另一个调用语境，别混。 */
const SAMPLES = "E:/notrat-latex-plugin/samples";
function pvB(src) { return P.renderPreview("\\begin{document}\n" + src + "\n\\end{document}\n", { baseDir: SAMPLES }).html; }
function textOf(html) { return String(html).replace(/<[^>]*>/g, ""); }

/* 从一大段源码里按「函数名 + 花括号配对」抠出一个函数 —— 抠不出来返回 null。
 * [D] 的反向自检也用它（把源码改坏再抠一次，看断言是不是真的会红）。 */
function extractFn(src, name) {
  const i = src.indexOf("function " + name + "(");
  if (i < 0) return null;
  const j = src.indexOf("{", i);
  if (j < 0) return null;
  let d = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}") { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return null;
}

/* 用户截图里的那一块：**真源码**（samples/test.tex 的 149–159 行，1 基），不是另写的样例。
 * 报的是「点这一块对不上」，门禁就得拿这一块跑。 */
const TEX_SRC = fs.readFileSync(path.join(ws, "samples/test.tex"), "utf8");
const BLK = TEX_SRC.split("\n").slice(148, 159).join("\n");
const ASSET_ABS = "E:/notrat-latex-plugin/samples/figs/fig-five-dim.pdf";

console.log("\n[A] 内核前提：插图标签只有 data-asset、没有 src");
{
  ok("取到的是真源码里那段 figure（起始就是 \\begin{figure}）", /^\\begin\{figure\}/.test(BLK.trim()), BLK.slice(0, 60));
  const h = pvB(BLK);
  ok("内核发出了插图标签（class=\"pv-img\"）", /class="pv-img"/.test(h), h.slice(0, 300));
  ok("它带 data-asset，且指向用户那张图（传了 baseDir 就是绝对路径）",
    h.indexOf('data-asset="' + ASSET_ABS + '"') >= 0, h.slice(0, 300));
  ok("★ 它**没有 src** —— 真图必须由面板走 MCP 补（这就是 bug 的物理前提）",
    !/<img[^>]*\ssrc=/.test(h), h);
  ok("★ alt 就是那个文件的相对路径（无 src 时浏览器画出来的正是这行字）",
    /alt="figs\/fig-five-dim\.pdf"/.test(h), h);
  ok("图注与图号还在（不是把整块当图丢掉了）",
    /figcaption/.test(h) && textOf(h).indexOf("Harness 五维结构示意") >= 0, h);
  ok("标了 data-raster（pdf 走栅格通道，转不出来要降级）", /data-raster="1"/.test(h), h);
}

console.log("\n[B] 接线：浮层补图走的是同一条资产通道，且补完会重摆位");
const loadSrc = extractFn(panelSrc, "loadAssetsIn");
const degSrc = extractFn(panelSrc, "degradeRasterImg");
const popSrc = extractFn(panelSrc, "loadPopAssets");
{
  ok("面板里有 loadAssetsIn（唯一的资产通道还在）", !!loadSrc);
  ok("★ 它收了 done（异步到货能通知调用方）", !!loadSrc && /function loadAssetsIn\(root, done\)/.test(loadSrc));
  ok("★ done 是**聚合**的：一批图最后一张落地才算补完（否则会摆好几次）",
    !!loadSrc && /const settle = function \(\) \{ pending--; if \(pending <= 0 && done\) done\(\)/.test(loadSrc));
  ok("★ 到货（dataUri）那条路会通知", !!loadSrc && /img\.src = a\.dataUri; settle\(\); return;/.test(loadSrc));
  ok("★ 降级那条路也会通知（占位 div 同样改高度）",
    !!loadSrc && /degradeRasterImg\(img\);\n        settle\(\);/.test(loadSrc) &&
    /catch\(function \(\) \{ degradeRasterImg\(img\); settle\(\); \}\)/.test(loadSrc));
  ok("★ 缓存命中不通知也不打 MCP（同步补，continue 掉）",
    !!loadSrc && /if \(assetCache\.current\.has\(p\)\) \{ img\.src = assetCache\.current\.get\(p\); continue; \}/.test(loadSrc));

  ok("面板里有 loadPopAssets（浮层自己的补图入口）", !!popSrc, "没找到 function loadPopAssets(");
  ok("★ 它补的是**浮层根节点** popRef.current", !!popSrc && /const pop = popRef\.current;/.test(popSrc));
  ok("★ 它走的是**同一条**资产通道（不另写一套取图逻辑）", !!popSrc && /loadAssetsIn\(pop, refit\)/.test(popSrc));
  ok("★ 补完按新尺寸重摆位（refit → fitPopup）", !!popSrc && /const refit = function \(\) \{ fitPopup\(pop, anchor\); \}/.test(popSrc));
  ok("★ 锚点取 atomEditRef（不是闭包里的 atomEdit —— 那是旧值）", !!popSrc && /atomEditRef\.current/.test(popSrc));
  ok("★ 每张图 decode 完再摆一次（缓存命中是同步写 src，settle 不会被调用）",
    !!popSrc && /im\.addEventListener\("load", refit\)/.test(popSrc));
  ok("降级（error）也再摆一次", !!popSrc && /im\.addEventListener\("error", refit\)/.test(popSrc));
  ok("监听只挂一次（不随重摆累积）", !!popSrc && /data-popfit/.test(popSrc));
  ok("没开浮层 / 没锚点时不做事（不抛）", !!popSrc && /if \(!pop \|\| !a\) return;/.test(popSrc));
  ok("★ 它没把 gfxRestore 顺手搭进来（浮层里的绘图卡是另一件事）",
    !!popSrc && !/gfxRestore\s*\(/.test(popSrc));

  ok("★ 浮层摆位 effect 每拍调 loadPopAssets",
    /useLayoutEffect\(\(\) => \{\n    if \(!atomEdit\) return;\n[\s\S]{0,700}?loadPopAssets\(\);\n  \}, \[atomEdit, serverId\]\);/.test(panelSrc));
  ok("★ effect 依赖带 serverId（服务后起来要补上，否则永久缺一张图）",
    /\}, \[atomEdit, serverId\]\);/.test(panelSrc));
  ok("浮层预览区是 React 塞 HTML（每敲一个字重设 innerHTML，src 注定丢）",
    /className="wys-pop-pv" dangerouslySetInnerHTML/.test(panelSrc));
  ok("浮层仍挂着 popRef（v0911 门禁照样过）", /ref=\{popRef\}/.test(panelSrc));
  ok("摆位 effect 仍是 useLayoutEffect（paint 前摆好，不闪 —— v0911 门禁数着个数）",
    (panelSrc.match(/useLayoutEffect\(/g) || []).length >= 2);
}

console.log("\n[C] 真跑：抠进 vm，配假 DOM / 假 callTool —— 缓存命中零 MCP、未命中有回调");
if (!loadSrc || !degSrc || !popSrc) {
  ok("★ 三个函数都抠出来了（否则 [C] 没法真跑）", false,
    "loadAssetsIn=" + !!loadSrc + " degradeRasterImg=" + !!degSrc + " loadPopAssets=" + !!popSrc);
} else {
  const mkImg = function (asset, o) {
    o = o || {};
    const attrs = { "data-asset": asset, alt: "figs/fig-five-dim.pdf" };
    if (o.raster !== false) attrs["data-raster"] = "1";
    const img = {
      _src: null, parentNode: null, listeners: {},
      getAttribute: function (k) { return attrs[k] == null ? null : attrs[k]; },
      setAttribute: function (k, v) { attrs[k] = String(v); },
      hasAttribute: function (k) { return attrs[k] != null; },
      addEventListener: function (k, fn) { (img.listeners[k] = img.listeners[k] || []).push(fn); },
      fire: function (k) { (img.listeners[k] || []).slice().forEach(function (f) { f(); }); },
    };
    Object.defineProperty(img, "src", {
      get: function () { return img._src; },
      set: function (v) { img._src = v; },
    });
    return img;
  };
  const mkParent = function () {
    const p = { replaced: null };
    p.replaceChild = function (d, old) { p.replaced = { node: d, old: old, className: d.className, textContent: d.textContent }; };
    return p;
  };
  /* 假根：按真代码用到的两个选择器给出语义。data-asset-queued 的排除**必须真做**，
   * 否则「去重」那条断言测的是假东西。 */
  const mkRoot = function (items) {
    return {
      querySelectorAll: function (sel) {
        if (sel.indexOf("data-asset-queued") >= 0) {
          return items.filter(function (it) { return it.getAttribute("data-asset-queued") == null; });
        }
        return items.slice();
      },
    };
  };
  const tick = function () { return new Promise(function (r) { setImmediate(r); }); };

  const mkSandbox = function () {
    const sb = {
      console: { log: function () {}, warn: function () {} },
      calls: [],
      doneCalls: 0,
      fitCalls: 0,
      assetCache: { current: new Map() },
      serverId: "srv-1",
      next: function () { return Promise.resolve(JSON.stringify({ dataUri: "data:image/png;base64,IMG" })); },
      document: { createElement: function () { return { className: "", textContent: "" }; } },
      popRef: { current: null },
      atomEditRef: { current: null },
    };
    sb.fitPopup = function () { sb.fitCalls++; };
    sb.callTool = function (name, args) { sb.calls.push({ name: name, args: args }); return sb.next(); };
    vm.createContext(sb);
    vm.runInContext(
      loadSrc + "\n" + degSrc + "\n" + popSrc +
      "\nthis.__api = { loadAssetsIn: loadAssetsIn, degradeRasterImg: degradeRasterImg, loadPopAssets: loadPopAssets };",
      sb);
    return sb;
  };

  (async function () {
    /* C1：缓存命中 —— 用户点名的那条：补得上，且**一次 MCP 都不打** */
    {
      const sb = mkSandbox();
      sb.assetCache.current.set(ASSET_ABS, "data:image/png;base64,CACHED");
      const img = mkImg(ASSET_ABS), root = mkRoot([img]);
      sb.__api.loadAssetsIn(root, function () { sb.doneCalls++; });
      ok("★ 缓存命中：src 立刻补上（浮层不再是那张裂图）", img.src === "data:image/png;base64,CACHED", String(img.src));
      ok("★ 缓存命中：一次 MCP 都没打", sb.calls.length === 0, JSON.stringify(sb.calls));
    }
    /* C2：未命中 —— 一次 MCP，到货补 src，且**通知调用方重摆位** */
    {
      const sb = mkSandbox();
      const img = mkImg(ASSET_ABS), root = mkRoot([img]);
      sb.__api.loadAssetsIn(root, function () { sb.doneCalls++; });
      ok("未命中：排队时 src 还是空的（先不假装成功）", img.src == null, String(img.src));
      await tick(); await tick();
      ok("未命中：真的打了一次 MCP，且带 kind:image（走插图通道）",
        sb.calls.length === 1 && sb.calls[0].name === "latex_asset" && sb.calls[0].args.kind === "image",
        JSON.stringify(sb.calls));
      ok("未命中：到货后 src 补上", img.src === "data:image/png;base64,IMG", String(img.src));
      ok("★ 补完通知调用方（done 一次）—— 浮层据此按新尺寸重摆位", sb.doneCalls === 1, "done=" + sb.doneCalls);
    }
    /* C3：浮层整体路径 —— loadPopAssets 真跑：一次 MCP + 到货后 fitPopup */
    {
      const sb = mkSandbox();
      const img = mkImg(ASSET_ABS);
      sb.popRef.current = mkRoot([img]);
      sb.atomEditRef.current = { x: 120, y: 400, ayTop: 380, ayBottom: 400 };
      sb.__api.loadPopAssets();
      ok("★ 浮层：把 popRef.current 交给了同一条资产通道（打了一次 MCP）", sb.calls.length === 1, JSON.stringify(sb.calls));
      await tick(); await tick();
      ok("★ 浮层：图到货后重摆一次位（fitPopup 被调用）", sb.fitCalls >= 1, "fit=" + sb.fitCalls);
      ok("浮层：补的就是用户那张图", sb.calls[0] && sb.calls[0].args.path === ASSET_ABS, JSON.stringify(sb.calls));
      const before = sb.fitCalls;
      img.fire("load");
      ok("★ 浮层：<img> 解码完成再摆一次（缓存命中那条路靠它）", sb.fitCalls === before + 1, before + " → " + sb.fitCalls);
    }
    /* C4：缓存命中时浮层也要摆（settle 不会被调用 → 只能靠 load 事件） */
    {
      const sb = mkSandbox();
      const img = mkImg(ASSET_ABS);
      sb.assetCache.current.set(ASSET_ABS, "data:image/png;base64,CACHED");
      sb.popRef.current = mkRoot([img]);
      sb.atomEditRef.current = { x: 10, y: 20, ayTop: 8, ayBottom: 20 };
      sb.__api.loadPopAssets();
      ok("浮层：缓存命中时零 MCP", sb.calls.length === 0, JSON.stringify(sb.calls));
      ok("浮层：缓存命中时 src 也补上了", img.src === "data:image/png;base64,CACHED", String(img.src));
      img.fire("load");
      ok("★ 浮层：缓存命中后 load 一到就摆位（done 不响也不漏摆）", sb.fitCalls === 1, "fit=" + sb.fitCalls);
    }
    /* C5：转不出图 —— 降级成占位，且照样通知（占位也改高度） */
    {
      const sb = mkSandbox();
      sb.next = function () { return Promise.resolve(JSON.stringify({ ok: false, error: "pdf 转不动" })); };
      const img = mkImg(ASSET_ABS), parent = mkParent(), root = mkRoot([img]);
      img.parentNode = parent;
      sb.__api.loadAssetsIn(root, function () { sb.doneCalls++; });
      await tick(); await tick();
      ok("★ 转不出图 → 降级成占位 div（不是留一张裂图）",
        !!parent.replaced && parent.replaced.className === "pv-imgna", String(parent.replaced && parent.replaced.className));
      ok("占位文案说得清（编译 PDF 后可见）",
        !!parent.replaced && String(parent.replaced.textContent).indexOf("编译 PDF 后可见") >= 0,
        String(parent.replaced && parent.replaced.textContent));
      ok("★ 降级后照样通知调用方（浮层高度变了，要重摆）", sb.doneCalls === 1, "done=" + sb.doneCalls);
    }
    /* C6：去重 —— 同一张图不重复排队（补图是每拍都走的路，不能每拍打一次 MCP） */
    {
      const sb = mkSandbox();
      const img = mkImg(ASSET_ABS), root = mkRoot([img]);
      sb.__api.loadAssetsIn(root, null);
      sb.__api.loadAssetsIn(root, null);
      sb.__api.loadAssetsIn(root, null);
      ok("★ 同一张图不重复排队（连打三次只发一次 MCP）", sb.calls.length === 1, "calls=" + sb.calls.length);
      await tick(); await tick();
      ok("去重不影响到货补 src", img.src === "data:image/png;base64,IMG", String(img.src));
    }
    /* C7：服务没起来 —— 一个请求都不发，也不假装补过 */
    {
      const sb = mkSandbox();
      sb.serverId = "";
      const img = mkImg(ASSET_ABS), root = mkRoot([img]);
      sb.__api.loadAssetsIn(root, function () { sb.doneCalls++; });
      ok("★ 服务没起来：一个请求都不发（不把「服务没起来」说成别的）", sb.calls.length === 0, JSON.stringify(sb.calls));
      ok("服务没起来：src 保持空（不假装补过）", img.src == null, String(img.src));
      ok("服务没起来：也不回调（没补完就别说补完了）", sb.doneCalls === 0, "done=" + sb.doneCalls);
    }
    /* C8：没开浮层时 loadPopAssets 是安全的空操作（它每一拍都会被调） */
    {
      const sb = mkSandbox();
      let threw = null;
      try { sb.__api.loadPopAssets(); } catch (e) { threw = e; }
      ok("没开浮层 / 没锚点时不抛（每拍都会调它）", !threw, threw && String(threw.message));
      ok("没开浮层时不发请求", sb.calls.length === 0, JSON.stringify(sb.calls));
    }

    console.log("\n[D] 反向自检：这一层真抓得住这些 bug 吗");
    {
      /* D1：把 settle() 全拿掉 —— 「补完重摆位」这条断言必须真的失效。
       * 门禁最容易骗自己的地方正是这里：断言写得恒真，改坏了也绿。 */
      const broken = loadSrc.split("settle();").join("void 0;");
      ok("反向自检的素材真的改坏了（settle 一处都不剩）", broken.indexOf("settle();") < 0);
      const sb = {
        console: { log: function () {} }, calls: [], doneCalls: 0,
        assetCache: { current: new Map() }, serverId: "srv-1",
        next: function () { return Promise.resolve(JSON.stringify({ dataUri: "data:image/png;base64,X" })); },
        document: { createElement: function () { return { className: "", textContent: "" }; } },
      };
      sb.callTool = function (n, a) { sb.calls.push(a); return sb.next(); };
      vm.createContext(sb);
      vm.runInContext(broken + "\nthis.__f = loadAssetsIn;", sb);
      const bImg = mkImg(ASSET_ABS);
      sb.__f(mkRoot([bImg]), function () { sb.doneCalls++; });
      await tick(); await tick();
      ok("★ 反向自检：拿掉 settle 后 done 真的不响（⇒「done 一次」不是恒真）",
        sb.doneCalls === 0, "done=" + sb.doneCalls);
      ok("★ 反向自检：同一份改坏代码仍然补上了 src（⇒ 失效的正是「回调」这一环，不是整个函数没跑）",
        bImg.src === "data:image/png;base64,X", String(bImg.src));
    }
    {
      /* D2：把 effect 里的调用拿掉 —— 接线断言必须红 */
      const broken = panelSrc.replace(/\n\s*loadPopAssets\(\);\n/, "\n");
      ok("★ 反向自检：拿掉 effect 里的 loadPopAssets() 后，接线断言必须失效",
        broken.indexOf("loadPopAssets();") < 0 &&
        !/loadPopAssets\(\);\n  \}, \[atomEdit, serverId\]\);/.test(broken) &&
        /\}, \[atomEdit, serverId\]\);/.test(broken),   /* 切口是外科式的：effect 本身还在 */
        "broken 里还有 loadPopAssets();=" + (broken.indexOf("loadPopAssets();") >= 0));
    }
    {
      /* D3：把 loadPopAssets 整个删掉 —— [B] 的提取必须变成 null（那条断言会红） */
      const i = panelSrc.indexOf("function loadPopAssets(");
      const j = i < 0 ? -1 : panelSrc.indexOf("\n  }", i);
      const broken = (i < 0 || j < 0) ? panelSrc : panelSrc.slice(0, i) + panelSrc.slice(j + 4);
      ok("★ 反向自检：删掉 loadPopAssets 后 [B] 的提取为 null（⇒ 那条断言会红）",
        extractFn(broken, "loadPopAssets") === null, "still found=" + !!extractFn(broken, "loadPopAssets"));
    }

    console.log("\n[E] 装机产物：包与源码两侧一致");
    {
      const cands = [
        path.join(os.homedir(), ".notrat/plugins/notrat-latex-plugin.json"),
        path.join(os.homedir(), "AppData/Roaming/notrat/plugins/notrat-latex-plugin.json"),
      ].filter(function (f) { return fs.existsSync(f); });
      if (!cands.length) {
        SKIP("装机产物核对", "本机没有装机包");
      } else {
        const pkg = JSON.parse(fs.readFileSync(cands[0], "utf8"));
        const manifest = JSON.parse(fs.readFileSync(path.join(ws, "manifest.json"), "utf8"));
        const ed = ((pkg.contributions || {}).editors || [{}])[0] || {};
        const edSrc = String(ed.source || "");
        if (edSrc.indexOf("loadPopAssets") >= 0 && pkg.version === manifest.version) {
          ok("装机包里有 loadPopAssets，且版本与 manifest 一致", true);
        } else {
          SKIP("装机产物里有 loadPopAssets",
            "装机包还是旧的（装机 " + pkg.version + " / manifest " + manifest.version +
            "）—— 打包与版本号收尾是单独一步：先 npm run build 再验这一条");
        }
      }
    }

    console.log("\n" + (fail ? "✗" : "✓") + " 通过 " + pass + " / 失败 " + fail + (skip ? " / 跳过 " + skip : ""));
    if (fail) process.exit(1);
  })().catch(function (e) {
    console.error("门禁自身抛错：" + ((e && e.stack) || e));
    process.exit(1);
  });
}
