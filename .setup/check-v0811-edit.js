/* 层 [13] —— 可视化档到底能不能正常编辑（v0.8.11 加）
 *
 * 用户原话：「目前用起来还不是浑然天成的感觉，无法正常编辑添加啊，我按回车都不能换行，
 *           Ctrl+1也不能设置标题，这一块也不够完善」
 *
 * 三个症状，三处独立根因，而且**全部落在插件默认打开的那一档**上
 * （宿主默认 editorMode = "wysiwyg" → viewOf("wysiwyg") = "preview" = 可视化）：
 *
 *   【一】格式快捷键整体缺席：onFmtKey 头一句要求焦点在源码 textarea 上，
 *        而可视化档 textarea 根本没挂载（taRef.current === null）⇒ 直接 return。
 *        Ctrl+1 按下去既没反应、也没有任何提示。
 *   【二】回车插的是裸 "\n"（execCommand insertText），在 contenteditable 里不稳 ⇒ 看着没反应。
 *        而 wysDomToTex 里本来就有 br → "\n" 的还原分支 ⇒ 这套设计本意就是插 <br>。
 *   【三】切到可视化档后焦点落在 root（一个不可编辑的容器）⇒ 一打字一个字都进不去。
 *
 * 为什么单开一层而不是塞进 [12] 焦点层：
 *   [12] 管的是「焦点在哪」，这一层管的是「焦点对了之后，键按下去到底做了什么」。
 *   两者会同时坏、但坏法不同 —— 上一轮只修了前者，用户照样用不了。
 *
 * 这一层依赖 harness 的三处真实化改动（test-nav.js）：
 *   · 内联 WYS 内核 —— 过去只内联了 LPC。缺了它，凡是碰到 WYS 的代码
 *     （commitWys / wysInline / wysRenderDoc ＝ 就地编辑的**全部核心**）一跑就
 *     ReferenceError: WYS is not defined，而异常被各处 try/catch 咽掉，测试照样全绿。
 *   · window.getSelection 可注入 —— 不喂选区，「光标在哪一块」这条路一次都走不到。
 *   · React 合成事件 + document.execCommand 记录器 —— 预览层的回车挂在 onKeyDown 上，
 *     真浏览器里由 React 委派，假 DOM 里没有这一层。
 *   少了任何一条，这几个 bug 都会被一整排绿色用例盖住。
 *
 * 四段：
 *   [1] 真渲染（源码）
 *   [2] 真渲染（产物）：同一套断言，换成装机产物里那份编辑器源码
 *   [3] 真 DOM（jsdom）：firstEditableIn 的选择器在真 HTML 上选中的是不是该选的那块
 *   [4] 产物静态核对：标记在不在发布出去的那份源码里（含两条反向 —— 不许回退成旧写法）
 *
 * 运行： node .setup/check-v0811-edit.js
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const DIR = __dirname;
const WS = path.join(DIR, "..");
const M = "C:/Users/Administrator/.notrat/plugins/notrat-latex-plugin.json";
let fail = 0;

function ok(name, cond, extra) {
  if (cond) console.log("  ok    " + name);
  else { fail++; console.log("  FAIL  " + name + (extra !== undefined ? "\n        → " + extra : "")); }
}

/* ---------- harness 复用 ---------- */
const nav = fs.readFileSync(path.join(DIR, "test-nav.js"), "utf8");
const cut = nav.indexOf("\n(async function ()");
if (cut < 0) {
  console.error("✗ test-nav.js 结构变了：找不到 IIFE 起点 —— harness 复用不了（先修这一层）");
  process.exit(1);
}
const headSrc = nav.slice(0, cut);

const PROBE_TAIL = "  process.exitCode = 0;   // 探针是复现工具：红了才算复现成功，不据此判失败";
let body = fs.readFileSync(path.join(DIR, "_probe-edit.body.js"), "utf8");
if (body.indexOf(PROBE_TAIL) < 0) {
  console.error("✗ 探针体结尾变了：找不到「红了也算成功」那一行 —— 门禁语义无法切换");
  process.exit(1);
}
body = body.split(PROBE_TAIL).join("  process.exitCode = fail ? 1 : 0;");

/* ---------- 装机产物里那份编辑器源码 ---------- */
let artRaw = "";
try { artRaw = fs.readFileSync(M, "utf8"); } catch (e) {}
const artEditor = artRaw
  ? String((JSON.parse(artRaw).contributions.editors[0] || {}).source || "")
  : "";
if (artEditor) fs.writeFileSync(path.join(DIR, "_prod-editor.js"), artEditor, "utf8");

function run(label, head, tmpName) {
  console.log("\n" + label);
  console.log("-".repeat(64));
  const tmp = path.join(DIR, tmpName);
  fs.writeFileSync(tmp, head + "\n" + body, "utf8");
  const r = spawnSync(process.execPath, [tmp], { stdio: "inherit", cwd: WS });
  if (r.status !== 0) fail++;
}

/* ---------- [1] 源码 ---------- */
run("[1] 真渲染 · 源码 panels/editor.tsx", headSrc, "_tmp-edit-gate.js");

/* ---------- [2] 产物 ---------- */
const SWAP = 'path.join(WS, "panels", "editor.tsx")';
if (!artEditor) {
  console.log("\n[2] 真渲染 · 装机产物");
  console.log("-".repeat(64));
  console.log("  FAIL  读不到装机产物：" + M + "（先 npm run build）");
  fail++;
} else if (headSrc.indexOf(SWAP) < 0) {
  console.log("\n[2] 真渲染 · 装机产物");
  console.log("-".repeat(64));
  console.log("  FAIL  test-nav.js 里读源码那一行变了，产物替换点找不到：" + SWAP);
  fail++;
} else {
  const headProd = headSrc.split(SWAP).join('path.join(WS, ".setup", "_prod-editor.js")');
  run("[2] 真渲染 · 装机产物（同一套断言，换源码）", headProd, "_tmp-edit-gate-prod.js");
}

/* ---------- [3] 真 DOM：firstEditableIn 的选择器 ---------- */
console.log("\n[3] 真 DOM（jsdom）：切换档位后光标该落在哪一块");
console.log("-".repeat(64));
if (!artEditor) {
  ok("产物可读", false, "读不到装机产物");
} else {
  const prod = artEditor.replace(/\r\n/g, "\n");
  /* 从产物源码里把函数原样抠出来 —— 不是照抄一份，抄的那份迟早跟代码漂移。
   * 抠的是「光标该落到哪一块」这个决策本身。 */
  /* 从源码里原样抠出一个函数（含花括号配平）。
   * ⚠ 必须跳过字符串字面量 —— wysDomToTex 里就有 `out += "}"`，
   * 不跳的话扫描器数到那个 `}` 就以为函数结束了，抠出来半截、eval 直接语法错。
   * 仍不处理正则字面量里的 `{`（当前要抠的这几个函数里没有）；要用它抠带 /\d{2}/
   * 的函数，得再补一层正则状态机。 */
  function extractFn(src, sig) {
    const i = src.indexOf(sig);
    if (i < 0) return null;
    const j = src.indexOf("{", i);
    let depth = 0, quote = null, esc = false;
    for (let k = j; k < src.length; k++) {
      const c = src[k];
      if (esc) { esc = false; continue; }
      if (quote) {
        if (c === "\\") { esc = true; continue; }
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) return src.slice(i, k + 1); }
    }
    return null;
  }
  const srcFn = extractFn(prod, "function firstEditableIn(root) {");
  ok("能从产物里抠出 firstEditableIn", !!srcFn);
  if (srcFn) {
    const fn = eval("(" + srcFn + ")");
    const { JSDOM } = require(path.join(WS, "node_modules", "jsdom"));
    const dom = new JSDOM(
      '<!doctype html><html><body><div id="root"><div class="pv-root">' +
        /* 导言区：折叠在 <details> 里。把光标扔进去，用户会看到页面莫名滚一下、光标不见了。 */
        '<div class="wys-blk wys-front"><details class="wys-raw"><summary>⋯ 导言区源码 · 3 行</summary>' +
          '<span class="wys-edit" id="frontEdit">\\documentclass[12pt]{ctexart}</span></details></div>' +
        /* 注释块：也是可编辑的，但不是「开始写字」该落的地方 */
        '<div class="wys-blk wys-note"><span class="wys-edit" id="noteEdit">% TODO: 补文献</span></div>' +
        /* 真正的正文：光标该落在这儿 */
        '<div class="wys-blk wys-h2"><span class="wys-num" contenteditable="false">1</span>' +
          '<span class="wys-edit" id="headEdit">引言</span></div>' +
        '<div class="wys-blk wys-p"><span class="wys-edit" id="paraEdit">文本自动摘要……</span></div>' +
      '</div></div></body></html>',
      { contentType: "text/html" }
    );
    const doc = dom.window.document;
    const rootEl = doc.getElementById("root");
    const first = fn(rootEl);
    ok("选中的不是导言区折叠项", first && first.id !== "frontEdit", first && first.id);
    ok("选中的不是注释块", first && first.id !== "noteEdit", first && first.id);
    ok("★ 选中的是正文/标题块（一进来就能直接打字）", !!first && first.id === "headEdit", first && first.id);

    /* 反向：整篇只有导言区和注释时，宁可返回 null（调用方会退回「焦点放容器」的老行为），
     * 也不要把光标塞进一个折叠起来的东西里。 */
    const dom2 = new JSDOM(
      '<!doctype html><html><body><div id="root"><div class="pv-root">' +
        '<div class="wys-blk wys-front"><details class="wys-raw"><span class="wys-edit">x</span></details></div>' +
      '</div></div></body></html>'
    );
    const none = fn(dom2.window.document.getElementById("root"));
    ok("◆ 没有可写正文时不硬塞（返回 null，让调用方退回老行为）", none === null, String(none));

    const dom3 = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
    ok("◆ 预览层压根没挂载时返回 null（不抛）", fn(dom3.window.document.getElementById("root")) === null);

    /* ---- v0.8.12：正文是**一个**宿主，焦点直接给它 ----
     * 每块自己挂 contenteditable 时，光标在块里走到头就出不去（方向键、继续打字都跨不过块边界），
     * 用户读作「每一行都会失去焦点」。宿主合成一个，块之间才连得通。 */
    const domHost = new JSDOM(
      '<!doctype html><html><body><div id="root"><div class="pv-root">' +
        '<div class="wys-editroot" contenteditable="true" id="host">' +
          '<div class="wys-blk wys-h2"><span class="wys-num" contenteditable="false">1</span>' +
            '<span class="wys-edit" id="h2edit">引言</span></div>' +
        '</div></div></div></body></html>'
    );
    const hostPick = fn(domHost.window.document.getElementById("root"));
    ok("★ 有唯一宿主时，焦点给宿主本身（光标才能跨块自由流动）",
       !!hostPick && hostPick.id === "host", hostPick && hostPick.id);

    /* ---- 配套：插进去的 <br>，回写那侧必须认得 ----
     * 「插 <br>」和「把 <br> 读回成 \n」是一对。只验前一半等于只验了一半：
     * 用户按回车看到换行了，一失焦回写却把换行吃掉 —— 当场对、回头错，比不做还糟。
     * 两边都从产物里抠原函数跑，不另抄一份逻辑（抄的那份迟早跟代码漂移）。 */
    const srcDom2Tex = extractFn(prod, "function wysDomToTex(root) {");
    ok("能从产物里抠出 wysDomToTex", !!srcDom2Tex);
    if (srcDom2Tex) {
      const d2t = eval("(" + srcDom2Tex + ")");
      const dom4 = new JSDOM('<!doctype html><html><body><span id="e">第一行<br>第二行</span></body></html>');
      const got = d2t(dom4.window.document.getElementById("e"));
      ok("★ DOM 里的 <br> 被读回成 \\n（与「回车插 <br>」配套，换行不会被回写吃掉）",
         got === "第一行\n第二行", JSON.stringify(got));
      /* 顺带钉住那条归一化：contentEditable 会塞不换行空格与零宽字符 */
      const dom5 = new JSDOM('<!doctype html><html><body><span id="f">a\u00a0b\u200bc</span></body></html>');
      ok("◆ 不换行空格 / 零宽字符仍被归一再比对（编辑期间浏览器塞的脏字符）",
         d2t(dom5.window.document.getElementById("f")) === "a bc",
         JSON.stringify(d2t(dom5.window.document.getElementById("f"))));

      /* ---- v0.8.12：合成一个宿主之后，「哪些节点算源码」得说清楚 ----
       * 标题前面那个自动编号是**渲染装饰**（contenteditable=false 且没有 data-tex），
       * 不是源码 —— 读回时跳过，否则改一次标题就会把「2」写进 \section{}。
       * 反向那一半同样要钉住：跳过规则不能宽到把带 data-tex 的原子（\cite）也吃掉。 */
      const dom6 = new JSDOM('<!doctype html><html><body><span id="h">' +
        '<span class="wys-num" contenteditable="false">2</span>引言</span></body></html>');
      const got6 = d2t(dom6.window.document.getElementById("h"));
      ok("★ 标题的自动编号不进源码（非可编辑 + 无 data-tex → 跳过）",
         got6 === "引言", JSON.stringify(got6));
      const dom7 = new JSDOM('<!doctype html><html><body><span id="c">' +
        '<span class="wys-atom" contenteditable="false" data-tex="\\cite{a}">[1]</span>见</span></body></html>');
      const got7 = d2t(dom7.window.document.getElementById("c"));
      ok("★ 带 data-tex 的原子仍原样吐回（跳过规则没吃掉 \\cite）",
         got7 === "\\cite{a}见", JSON.stringify(got7));
    }

    /* ---- v0.8.12：重建后的光标回接（wysCaretSnapshot / wysCaretRestore）----
     * Ctrl+1~6、宿主改动、撤销走的都是「整层 innerHTML 重建 + 按 bid 回接」；
     * 回接若静默失败，症状就是「一按快捷键 / 一撤销，光标必丢」。
     * 两个函数都从装机产物里抠原函数跑 —— 测的是装出去的那份。 */
    const srcSnap12 = extractFn(prod, "function wysCaretSnapshot(root) {");
    const srcRest12 = extractFn(prod, "function wysCaretRestore(root, keep) {");
    ok("◆ 能从产物里抠出 wysCaretSnapshot / wysCaretRestore", !!srcSnap12 && !!srcRest12);
    if (srcSnap12 && srcRest12) {
      const w12 = new JSDOM('<!doctype html><html><body>' +
        '<div id="root"><div class="wys-editroot" id="host" tabindex="0">' +
        '<div class="wys-blk" data-bid="7"><span class="wys-edit" id="ed">ab<br>cd</span></div>' +
        '</div></div></body></html>');
      const gDoc = global.document, gWin = global.window;
      global.document = w12.window.document;
      global.window = w12.window;
      try {
        const snap12 = eval("(" + srcSnap12 + ")");
        const rest12 = eval("(" + srcRest12 + ")");
        const doc12 = w12.window.document;
        const root12 = doc12.getElementById("root");
        const ed12 = doc12.getElementById("ed");
        const host12 = doc12.getElementById("host");
        /* 快照：光标在 "cd"[1]（整块内偏移 3）→ { bid:"7", offset:3 } */
        const rg = doc12.createRange();
        rg.setStart(ed12.lastChild, 1);   // lastChild = br 之后的 "cd" 文本节点
        rg.collapse(true);
        const sl = doc12.getSelection();
        host12.focus();   // 先聚焦：jsdom 的 focus() 会清空选区（真浏览器不会），先 focus 再摆光标
        sl.removeAllRanges(); sl.addRange(rg);
        const got = snap12(root12);
        ok("★ 快照：块 id + 块内文本偏移都读得回", !!got && got.bid === "7" && got.offset === 3,
           JSON.stringify(got));
        /* 回接：先把选区甩到层外当哨兵 —— 回接成功 = 哨兵被搬回 "cd"[1] 且宿主拿到焦点 */
        sl.removeAllRanges();
        const sent = doc12.createRange();
        sent.setStart(doc12.body, 0);
        sent.collapse(true);
        sl.addRange(sent);
        rest12(root12, { bid: "7", offset: 3 });
        const s12 = doc12.getSelection();
        ok("★ 回接：光标回到「块内偏移 3」＝ br 后文本节点 [1]（SHOW_TEXT 逐文本节点推进）",
           s12.anchorNode && s12.anchorNode.nodeValue === "cd" && s12.anchorOffset === 1,
           s12.anchorNode ? JSON.stringify([s12.anchorNode.nodeValue, s12.anchorOffset]) : "无选区");
        ok("★ 回接：宿主 .wys-editroot 重新拿到焦点（activeElement）",
           doc12.activeElement === host12,
           "activeElement=" + (doc12.activeElement && doc12.activeElement.id));
        /* 回归钉：walker 的 whatToShow 必须是 4（SHOW_TEXT）。写 3 时上一条必挂 ——
         * 元素节点的 nodeValue 是 null，null.length 抛错被 catch 吞掉，回接静默失败。 */
        ok("★ 回归钉：createTreeWalker 的 whatToShow 是 4（SHOW_TEXT），不是 3",
           prod.indexOf("createTreeWalker(part, 4") >= 0 && prod.indexOf("createTreeWalker(part, 3") < 0);
      } finally {
        global.document = gDoc;
        global.window = gWin;
      }
    }
  }
}

/* ---------- [4] 产物静态核对 ---------- */
console.log("\n[4] 装机产物：本次修复的标记在不在发布出去的那份源码里");
console.log("-".repeat(64));
if (!artEditor) {
  console.log("  FAIL  产物不可读，跳过核对");
  fail++;
} else {
  const j = JSON.parse(artRaw);
  const prod = artEditor.replace(/\r\n/g, "\n");
  console.log("  产物版本：" + j.version + "   编辑器源码长度：" + prod.length);
  const marks = [
    ["① 可视化档的格式动作挂上了 ref", "fmtWysRef.current = applyFmtWys;"],
    ["① onFmtKey 在可视化档不再直接 return", 'if (ta || viewRef.current !== "preview") return;'],
    ["① Ctrl+1 用块自己的行号改源码（不猜 DOM 偏移；v0.8.13 起区间可为 [s..endLine] 整段）", "WYS.applyEdits(base, [{ startLine: s, endLine: endLine, newText: next + tail }])"],
    ["① 段落以行内命令开头也放行（v0.8.16 isPara），命令块仍拒绝", 'if (t !== "" && t.charAt(0) === "\\\\" && !isPara) {'],
    /* ---------- v0.8.17：undo / redo 先落地未落盘的打字 ---------- */
    ["① undo/redo 入口先 wysCommitPending（打字也是一步历史）", "function wysCommitPending() {"],
    ["① 组合路径复位 selfEdit（撤销必须走 DOM 重建）", "wysSelfEdit.current = false;"],
    /* ---------- v0.8.18：历史交给 txlog（commit / rebase / undo 全是真事务） ----------
     * 原来这条断言写死了「自己维护的 redo 栈」那一行实现（committed != null ? committed : content）。
     * 实现换成 TX.History 之后它就该改 —— 但更强的是断言**新契约**：撤销 / 重做只向
     * History 要凭据（tx.before / tx.after），调用方不再自己存「改后状态」。 */
    ["① 撤销走 History 的凭据（tx.before = 要撤到的那份源码）", "onChange(tx.before);"],
    ["① 重做走 History 的凭据（tx.after）", "onChange(tx.after);"],
    ["① 历史是 TX.History（v0.9 P2 的地基），不再是自攒的源码数组", "new TX.History({ base: source, limit: WYS_HIST_STEPS_MAX })"],
    ["① 历史按文件留在模块级（组件被宿主卸载重挂也接得上）", "const WYS_HIST_BY_FILE = new Map();"],
    ["① 挂载 / 换文件按路径认领历史（不是新建）", "wysHistRef.current = k"],
    ["① 取不到路径就不进历史表（两篇文档的撤销链不许串）", "function wysHistKey() {"],
    ["① 外部改动走 rebase 重映射（绝不整条清栈）", "const res = h0.rebase(prevSrc, content);"],
    ["① gaps 必须弹出来（丢了步数不许静默）", 'if (res.dropped) setToast({ msg: "⚠ " + h0.describeGaps() });'],
    ["① 撤不动时把「到底了」与「没有历史」分开说", "function wysNoUndoMsg() {"],
    ["① 改完必须仍能解析（自检）", "WYS.parseDoc(out);"],
    /* ---------- v0.8.28：标题块跨多物理行 + 取消层级不再毁稿 ---------- */
    ["⑦ 光标不在正文时，回报要说清是「哪一块」（不再是「多行公式 / 环境等」）", "光标不在正文里 —— 这一块是「"],
    ["⑦ 块类型有人话名字（参考文献 / 图表浮动体…）", "WYS_BLK_SAY"],
    ["⑦ 标题块放行：换层级只写回第一行（跨几行无所谓）", "endLine: hMerge ? e : s, newText: hText"],
    ["⑦ 折行并成一行抽成共用函数（段落 / 标题同一套）", "function mergeWysLines(lines, s, e)"],
    ["⑦ 取消层级走平衡花括号剥离（贪婪正则会写出坏 LaTeX）", "function headStripClean(s)"],
    ["⑦ 可视化档取消层级用上它", "headStripClean(whole.slice(rl2[0].length))"],
    ["⑦ 源码档取消层级同样用上它", "headStripClean(body.slice(rlS[0].length))"],
    ["① 拒绝接管以 \\ 开头的行（导言区是雷区）", 'if (t !== "" && t.charAt(0) === "\\\\") {'],
    ["① 模板类键给一句说明，不静默失灵", "fmtWysWarnedRef.current = true;"],
    /* v0.8.26：这两条原来是**文本**断言（「产物里有没有 execCommand 那一句」）。
     * 正是它让「段末按回车会在源码里凭空长出一个空行」在 23 层门禁里一次都没被问到：
     * jsdom 里根本没有 execCommand，这句话在不在产物里，与「按一下回车源码会变成什么」
     * 是两件毫不相干的事。现在钉的是**行为契约**（行为级见 [24] 层）：
     * 自己插 <br>、光标自己定死、插完自己喊同步。 */
    ["② 回车自己插 <br>（Range.insertNode，不再赌 execCommand 的光标落点）",
      'const br = doc.createElement("br");'],
    ["② 光标显式落在新行的零宽占位里（v0.8.29：setStart(zw1, 1) —— 「按了回车光标在新行」，而且浏览器画得出来）",
      "range.setStart(zw1, 1);"],
    ["② 自己插完自己喊了一次实时同步（UA 不会替我们派 input）",
      "if (insertSoftBreak()) queueWysLive();"],
    ["③ 可视化档把光标送进正文块", "const first = firstEditableIn(r2);"],
    ["③ 先同步收回容器（焦点不悬空，快捷键才收得到）", "try { root.focus(); } catch (e) {}"],
    ["③ 推迟一拍：该 effect 排在 paint 之前", "}, 0);"],
    /* 防「修过头」：这几条是既有的、不能被这次改动带坏的行为 */
    ["v0.8.10 的按钮不夺焦守卫仍在", 'root.addEventListener("mousedown", onRootMouseDown, true);'],
    ["源码/分屏档仍走 textarea 老路", "if (ta && document.activeElement === ta) {"],
    ["监听仍挂在根节点（不是 window）", 'root.addEventListener("keydown", onCtrlSlash, true);'],
    /* ---------- v0.8.12：可视化档「浑然天成」的那几条 ---------- */
    ["④ 整篇正文只有一个编辑宿主（块之间才连得通）", 'class="wys-editroot" contenteditable="true"'],
    ["④ 原子块在宿主里显式关掉编辑（有损渲染不许被敲坏）", 'contenteditable="false" data-line="'],
    ["④ 自己提交的改动不重建 DOM（重建就是把光标铲掉）", "if (!selfEdit) root.innerHTML = html;"],
    ["④ 别处来的改动：重建前后把光标接回去", "if (!selfEdit && keepCaret) wysCaretRestore(root, keepCaret);"],
    ["④ 光标按「块 id + 文本偏移」记（节点引用重建即失效）", 'bid: el.getAttribute("data-bid"), offset: String(rg).length'],
    ["④ firstEditableIn 先认唯一宿主", 'const host = root.querySelector(".wys-editroot");'],
    ["④ firstEditableIn 认自己就是 .pv-root（querySelector 不查自身）",
      'const pv = (root.classList && root.classList.contains("pv-root")) ? root : root.querySelector(".pv-root");'],
    ["④ 切档后光标落到第一块正文末尾（不是漂在整篇开头）", "wysCaretToStart(first);"],
    ["④ 简单块读整块（光标落在 .wys-edit 之外的字不许丢）",
      'const anchor = (el.getAttribute("data-type") === "preamble") ? part : el;'],
    ["④ 标题被清空不写 \\section{}", 'if (!String(now).trim()) {'],
  ];
  for (const [name, s] of marks) {
    const hit = prod.includes(s);
    if (!hit) fail++;
    console.log((hit ? "  ok    " : "  FAIL  ") + name);
  }
  /* ---------- 反向：不许回退成旧写法 ----------
   * 只在**代码行**里查，先剥掉注释。注释里留着旧写法是好事 —— 它记着「为什么改」
   * （"原来那句把换行当普通字符塞进去，浏览器里不稳"）。但「代码里还有没有这个调用」
   * 是另一件事。混成一条断言，就等于逼后来的人把注释也删干净来换绿灯。 */
  const codeOnly = prod.split("\n").filter(function (line) {
    const s = line.trim();
    return !(s.indexOf("*") === 0 || s.indexOf("//") === 0 || s.indexOf("/*") === 0);
  }).join("\n");
  const banned = [
    ["回车不许再插裸 \\n（旧实现，浏览器里不稳）", 'execCommand("insertText", false, "\\n")'],
    /* v0.8.26：命令路（execCommand）在夹具里根本不存在 ⇒ 它上面的行为一次都测不到。
     * 光标落点也不由我们决定 —— 用户读作「按了回车光标没到新行」。 */
    ["回车不许再走 execCommand 那条命令路（光标落点 + 测不到，两条理由各自都够）",
      'document.execCommand("insertHTML"'],
    ["可视化档的格式键不许再无条件 return", "if (!ta || document.activeElement !== ta) return;"],
    /* v0.8.12：每块自己挂 contenteditable 是「每一行都会失去焦点」的根因之一 ——
     * 块之间互不相通，光标走到块尾就出不去。宿主只能有一个。 */
    ["块不许再自己挂 contenteditable（旧写法：每行都得重新点一次）", 'class="wys-edit" contenteditable="true"'],
    /* v0.8.18：这条是用户报上来的那句「我输入了内容再撤回，提示我预览档没有撤回的」
     * 的根因写法 —— 判「这拍谁写的」的布尔标志一旦误判（切档重挂 / 宿主回传），
     * 整条历史当场清空。改由 rebase 接住外部改动，历史不许再被这样清掉。 */
    ["不许再「误判一次就把历史清空」（v0.8.18：外部改动走 rebase）", "wysUndoRef.current = [];"],
  ];
  for (const [name, s] of banned) {
    const hit = codeOnly.includes(s);
    if (hit) fail++;
    console.log((hit ? "  FAIL  " : "  ok    ") + name);
  }
}

console.log("\n" + (fail === 0 ? "✓ 编辑层全绿" : "✗ 编辑层有 " + fail + " 处未通过"));
process.exit(fail === 0 ? 0 : 1);
