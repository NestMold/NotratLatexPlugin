/* v0.6.1「点大纲 → 跳到对应行」真渲染验证（不是静态体检，是真跑起来看行为）
 *
 * 复现用户报的问题：在「可视化」视图下点左侧大纲，编辑器毫无反应。
 * 根因（代码里就能看出来，这里把它钉成回归）：
 *   · 宿主 editorMode 默认 "wysiwyg" → 本编辑器 view = "preview"
 *   · showSrc = view !== "preview" ⇒ 源码 textarea 根本没挂载，taRef.current = null
 *   · 老 gotoLine：`if (view === "preview") setView("split"); const ta = taRef.current; if (!ta) return;`
 *     —— setView 是异步的，当拍 ref 还是 null，直接 return，什么都没跳
 *   · 更糟的是外面照样回 ACK ⇒ 面板以为跳成功，170ms 的兜底（打开文件 + 重发）不触发
 *     ⇒ 用户看到的就是「点了没反应，且没有任何提示」
 *
 * 做法：esbuild 转 CJS → 迷你 React（带 ref 挂载 + 真 cleanup）→ 假 window/sessionStorage
 *       → 真渲染 panels/editor.tsx → 派发 reveal 事件 → 查 ACK 与 textarea 的落点。
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const cp = require("child_process");

const WS = "E:/notrat-latex-plugin";
const TMP = path.join(os.tmpdir(), "latex-nav");
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

let pass = 0;
let fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log("  ✓ " + msg); }
  else { fail++; console.log("  ✗ " + msg + (extra !== undefined ? "  → " + extra : "")); }
}

/* ---------- 1. 源码 → 内联 preview-core → esbuild 转 CJS ---------- */
const core0 = fs.readFileSync(path.join(WS, "server", "preview-core.js"), "utf8");
const core = core0.replace(
  /^module\.exports\s*=\s*\{[^}]*\};?[^\S\n]*$/m,
  "const LPC = { renderPreview: renderPreview, miniMath: miniMath };"
);
/* v0.8.11：WYS 也必须内联 —— 它在 editor.tsx 第 3 行有个 __WYS__ 的占位注释，
 * 由 build-singlefile.js 在构建期替换成 wysiwyg 块模型内核。
 * 过去这里漏了这一步，于是凡是碰到 WYS 的代码（commitWys / wysRenderDoc / wysInline
 * —— 「就地编辑」的**全部核心**）在 harness 里一律 ReferenceError: WYS is not defined，
 * 而异常被各处 try/catch 咽掉，测试照样全绿。等于把被测对象换成了一个跑不起来的版本。
 * 这套改写规则必须与 build-singlefile.js 逐字一致，否则测的是变形后的代码。 */
const wysRaw = fs.readFileSync(path.join(WS, "server", "wysiwyg.js"), "utf8");
const wysBody = wysRaw.replace(/^module\.exports\s*=\s*\{([^}]*)\};?[^\S\n]*$/m, "return {$1};");
if (!/^return \{/m.test(wysBody)) {
  console.error("wysiwyg 导出语句改写失败（与 build-singlefile.js 的规则漂移了？）");
  process.exit(1);
}
const wysSrc = "const WYS = (function () {\n" + wysBody + "\n})();";

/* v0.8.18：txlog 也必须内联 —— 预览层的历史（commit / rebase / undo）全在里面。
 * 漏掉这一步，凡是碰历史的代码在 harness 里一律 ReferenceError: TX is not defined，
 * 异常被 try/catch 咽掉，测试照样全绿 —— 与 v0.8.11 漏内联 WYS 是同一个坑。
 * 改写规则必须与 build-singlefile.js 逐字一致。 */
const txRaw = fs.readFileSync(path.join(WS, "server", "txlog.js"), "utf8");
const txBody = txRaw.replace(/^module\.exports\s*=\s*\{([^}]*)\};?[^\S\n]*$/m, "return {$1};");
if (!/^return \{/m.test(txBody)) {
  console.error("txlog 导出语句改写失败（与 build-singlefile.js 的规则漂移了？）");
  process.exit(1);
}
const txSrc = "const TX = (function () {\n" + txBody + "\n})();";

const TOK = "/*" + "__LPC__" + "*/";
const WYS_TOK = "/*" + "__WYS__" + "*/";
const TX_TOK = "/*" + "__TX__" + "*/";
const editorSrc = fs.readFileSync(path.join(WS, "panels", "editor.tsx"), "utf8")
  .split(TOK).join(core)
  .split(WYS_TOK).join(wysSrc)
  .split(TX_TOK).join(txSrc);
const TSRC = path.join(TMP, "editor.tsx");
const CJS = path.join(TMP, "editor.cjs");
fs.writeFileSync(TSRC, editorSrc, "utf8");
try {
  cp.execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["--no-install", "esbuild", TSRC, "--loader:.tsx=tsx", "--jsx=transform", "--format=cjs",
      "--outfile=" + CJS, "--log-level=warning"],
    { cwd: WS, stdio: "pipe", shell: process.platform === "win32" }
  );
  ok(true, "editor.tsx（含 preview-core 内联）转 CJS 成功");
  /* v0.8.11：内联必须真的完成。漏掉任一个内核，对应的半边功能在测试里就永远是
   * 「跑不起来的版本」+ 一堆被咽掉的异常 + 一排绿色的 ✓。这条断言就是防那个。 */
  ok(/const WYS = \(function \(\)/.test(editorSrc), "WYS 内核已内联（就地编辑那半边有得跑）");
  ok(/const LPC = \{ renderPreview/.test(editorSrc), "LPC 内核已内联（预览那半边有得跑）");
  ok(!/module\.exports/.test(editorSrc), "内联后不残留 module.exports（残留会覆盖宿主 exports）");
} catch (e) {
  ok(false, "editor.tsx 转 CJS 成功", ((e.stderr || "") + "").slice(0, 400) || e.message);
  process.exit(1);
}

/* ---------- 2. 迷你 React（带 ref 挂载 + effect cleanup + 渲染循环） ---------- */
function flatten(arr) {
  const out = [];
  arr.forEach(function walk(c) {
    if (c === null || c === undefined || c === false || c === true) return;
    if (Array.isArray(c)) { c.forEach(walk); return; }
    out.push(c);
  });
  return out;
}

function makeNode(el) {
  const node = {
    _el: el,
    scrollTop: 0, scrollLeft: 0, clientHeight: 400, scrollHeight: 4000,
    selectionStart: 0, selectionEnd: 0, selection: null,
    value: "", focused: false, style: {}, textContent: "",
    focus: function () { node.focused = true; },
    setSelectionRange: function (a, b) { node.selectionStart = a; node.selectionEnd = b; node.selection = [a, b]; },
    /* v0.8.6：不再空转 —— 把监听器存下来，测试才能真的「派发一次按键」。
     * 组件把 Ctrl+/ 与格式快捷键挂在根节点上（捕获阶段），这里不记就永远测不到那条通路。
     * （注意别改到下面 global.document 里同名的那行 —— 那是 document 自己的。） */
    /* v0.8.10：节点要知道自己是什么标签、也要能 closest 查询 ——
     * 组件用 closest("button") 判断「这一下点的是不是按钮」。缺了它，假 DOM 里
     * 「点工具栏 → 焦点被按钮夺走」这条路径根本走不通，也就测不出
     * 「点完工具栏，格式快捷键和打字全哑了」。标签名不是编的：React 把 type:"button"
     * 渲染成 <button> 是确定的，从自己出发 closest("button") 当然命中自己。 */
    tagName: el && typeof el.type === "string" ? el.type.toUpperCase() : "DIV",
    closest: function (sel) {
      if (sel === "button") return node.tagName === "BUTTON" ? node : null;
      return null;
    },
    listeners: {},
    /* v0.8.11：React 合成事件（onKeyDown 这类写法）单独放这儿。
     * 不混进 listeners —— 那条线代表「真实 addEventListener」，下面 root 上正好 2 个的
     * 断言点着它，掺进来就等于改既有测试的语义。 */
    react: {},
    addEventListener: function (t, fn) { (node.listeners[t] = node.listeners[t] || []).push(fn); },
    removeEventListener: function (t, fn) {
      const a = node.listeners[t] || [];
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
    setAttribute: function () {}, appendChild: function () {},
    getAttribute: function () { return null; },
    /* 就地编辑那层会 querySelectorAll(".wys-blk") 扫块。这里的假节点没有真实子树，
     * 给个空集 —— 语义是「这份文档里没有可回写的块」，不是「让断言过」。
     * 缺了它，commitWys / applyWys 会直接 TypeError 把整个 harness 掀掉。 */
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    getBoundingClientRect: function () { return { top: 0, left: 0, right: 0, bottom: 0, width: 800, height: 400 }; },
  };
  return node;
}

/* v0.8.18：被求值过一次的编辑器模块 —— 模拟宿主「模块加载一次、组件可反复挂载」。
 * 模块级状态（比如按文件留住的撤销历史）必须活过组件重挂，否则「切主区标签 → 卸载重挂」
 * 这条真实路径在测试里永远走不到。
 *
 * reactMod 是**转发器**：属性在取用时才解析到 MODULE_CACHE.react —— 每次渲染前
 * 指到当前 harness 的 React 夹具。共享模块 ≠ 共享 hook 状态：模块级状态共享（要测它），
 * hook / effect / ref 仍各 harness 独立（不然第 2 个 harness 一起手就是哑的）。 */
const MODULE_CACHE = { comp: null, react: null, reactMod: null };
(function () {
  const fw = { __esModule: true };
  Object.defineProperty(fw, "default", { get: function () { return MODULE_CACHE.react; } });
  ["createElement", "Fragment", "useState", "useRef", "useMemo", "useCallback", "useEffect"].forEach(function (k) {
    Object.defineProperty(fw, k, { get: function () { return MODULE_CACHE.react[k]; } });
  });
  MODULE_CACHE.reactMod = fw;
})();

function createHarness(props) {
  const store = {};
  const listeners = {};
  const events = [];
  const hooks = { state: [], refs: [], deps: [], effects: [] };
  let cursor = 0;
  let dirty = false;
  let pending = [];
  let liveRefs = [];
  let tree = null;

  function addL(type, fn) { (listeners[type] = listeners[type] || []).push(fn); }
  function remL(type, fn) {
    const a = listeners[type] || [];
    const i = a.indexOf(fn);
    if (i >= 0) a.splice(i, 1);
  }
  function dispatch(ev) { events.push(ev); (listeners[ev.type] || []).slice().forEach((fn) => fn(ev)); return true; }

  const React = {
    createElement: function (type, props) {
      const children = [];
      for (let i = 2; i < arguments.length; i++) children.push(arguments[i]);
      return { __el: true, type: type, props: props || {}, children: flatten(children) };
    },
    Fragment: "Fragment",
    useState: function (init) {
      const i = cursor++;
      if (!(i in hooks.state)) hooks.state[i] = typeof init === "function" ? init() : init;
      const set = function (v) {
        const nv = typeof v === "function" ? v(hooks.state[i]) : v;
        if (nv !== hooks.state[i]) { hooks.state[i] = nv; dirty = true; }
      };
      return [hooks.state[i], set];
    },
    useRef: function (init) {
      const i = cursor++;
      if (!(i in hooks.refs)) hooks.refs[i] = { current: init === undefined ? null : init };
      return hooks.refs[i];
    },
    useMemo: function (fn, deps) {
      const i = cursor++;
      const prev = hooks.deps[i];
      const changed = !prev || !deps || !prev.deps || deps.length !== prev.deps.length || deps.some((d, k) => d !== prev.deps[k]);
      if (changed) hooks.deps[i] = { v: fn(), deps: deps };
      return hooks.deps[i].v;
    },
    useCallback: function (fn) { cursor++; return fn; },
    useEffect: function (fn, deps) {
      const i = cursor++;
      const prev = hooks.effects[i];
      const changed = !prev || !deps || !prev.deps || deps.length !== prev.deps.length || deps.some((d, k) => d !== prev.deps[k]);
      if (changed) pending.push({ i: i, fn: fn, prev: prev });
      hooks.effects[i] = { fn: fn, deps: deps || null, cleanup: prev ? prev.cleanup : undefined };
    },
  };

  function walk(node, visit) {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach((n) => walk(n, visit)); return; }
    if (node.__el) { visit(node); (node.children || []).forEach((c) => walk(c, visit)); }
  }

  /* ref 挂载：元素只要还挂载着，就复用同一个假 DOM 节点（真 DOM 也是这个语义 ——
   * 每拍都新建节点的话，跳转写进旧节点、断言读到新节点，会得出假结论）。
   * 元素卸载才把 ref 置 null。 */
  const nodeCache = new Map();
  function attachRefs(root) {
    const seen = new Set();
    walk(root, function (el) {
      const r = el.props && el.props.ref;
      if (r && typeof r === "object" && "current" in r) {
        seen.add(r);
        if (!nodeCache.has(r)) nodeCache.set(r, makeNode(el));
        const n = nodeCache.get(r);
        r.current = n;
        /* v0.8.11：把 React 的 on* 事件挂上去（真浏览器里这层由 React 委派，
         * 假 DOM 没有）。不补，预览层的回车路径（onWysKeyDown 挂在 pv-root 的
         * onKeyDown 上）一次都跑不到 —— 而「按回车插的是 <br> 不是裸 \n」
         * 正是这次要钉住的回归。
         * 每次渲染都重挂：React 的 handler 本来就是每渲染一份新闭包，
         * 复用第一帧那份会把 content / onChange 永久锁死（TDZ 哨兵盯的就是这类事）。 */
        n.react = {};
        const rp = el.props || {};
        Object.keys(rp).forEach(function (k) {
          if (k.length > 2 && k.slice(0, 2) === "on" && typeof rp[k] === "function") {
            n.react[k.slice(2).toLowerCase()] = rp[k];
          }
        });
      }
    });
    liveRefs.forEach((r) => {
      if (seen.has(r)) return;
      /* v0.8.9：模拟浏览器的真实行为 —— 带焦点的元素被移除时，activeElement 立刻回到 <body>。
       * 少了这一步，假 DOM 里「切档把带焦点的子树整个卸载」永远不会表现为失焦，
       * 「Ctrl+/ 切过去就再也切不回来」这类 bug 在 harness 里根本复现不出来。 */
      const dead = nodeCache.get(r);
      if (dead && global.document && global.document.activeElement === dead) global.document.activeElement = null;
      r.current = null;
      nodeCache.delete(r);
    });
    liveRefs = Array.from(seen);
  }

  /* 3) 假环境 */
  global.sessionStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  global.CustomEvent = function (type, opts) { return { type: type, detail: (opts || {}).detail }; };
  /* v0.8.11：选区要能喂进来。可视化档的格式快捷键按「光标在哪一块」动作 ——
   * getSelection 恒为 null 的话，那条路在 harness 里一次都走不到。 */
  let fakeSelection = null;
  global.window = {
    dispatchEvent: dispatch,
    addEventListener: addL,
    removeEventListener: remL,
    innerWidth: 1280,
    innerHeight: 800,
    event: null,
    getSelection: function () { return fakeSelection; },
    electronAPI: { mcp: { listActiveServers: async function () { return []; }, callTool: async function () { return { success: false, error: "no server" }; } } },
  };
  /* v0.8.11：execCommand 要看得见。可视化档的回车换行走的就是它（insertHTML "<br>"），
   * 旧实现插裸 "\n" —— 不记下来，「插的到底是什么」这条断言就写不出来。 */
  let execCmds = [];
  global.document = {
    addEventListener: function () {}, removeEventListener: function () {},
    createElement: function () { return makeNode(null); },
    execCommand: function (cmd, ui, val) { execCmds.push({ cmd: cmd, value: val }); return true; },
    head: { appendChild: function () {} },
    body: { appendChild: function () {} },
    getElementById: function () { return null; },
    querySelector: function () { return null; },
  };
  global.requestAnimationFrame = function (fn) { return setTimeout(function () { fn(Date.now()); }, 0); };

  const code = fs.readFileSync(CJS, "utf8");
  /* v0.8.18：模块只求值一次（真宿主同此语义）。hook 状态由转发器分派到当前 harness，
   * 所以多个 harness 共用一份模块代码也不会串味。 */
  MODULE_CACHE.react = React;
  if (!MODULE_CACHE.comp) {
    const mod = { exports: {} };
    new Function("require", "module", "exports", "React", code)(
      function (name) {
        if (name === "react") return MODULE_CACHE.reactMod;
        throw new Error("unexpected require: " + name);
      },
      mod, mod.exports, MODULE_CACHE.reactMod
    );
    MODULE_CACHE.comp = mod.exports.default || mod.exports;
  }
  const Comp = MODULE_CACHE.comp;

  return {
    events: events,
    dispatch: dispatch,
    component: Comp,
    /* v0.8.11：把「光标在哪」喂给组件读的那个选择器 */
    setSelection(sel) { fakeSelection = sel; },
    /* v0.8.11：这一轮里组件调过的 execCommand，按调用顺序 */
    execCommands() { return execCmds.slice(); },
    resetExecCommands() { execCmds = []; },
    /* v0.8.10：给「没有 ref 的元素」造一个身份够用的假 DOM 节点（只要标签名与 closest）。
     * 工具栏按钮没有 ref，但测试要模拟"点在它上面"。标签名是从渲染元素读的，不是编的。 */
    domOf(el) {
      const tag = el && typeof el.type === "string" ? el.type.toUpperCase() : "DIV";
      return {
        tagName: tag,
        closest: function (sel) { return sel === "button" && tag === "BUTTON" ? this : null; },
      };
    },
    async render(rounds) {
      for (let r = 0; r < (rounds || 20); r++) {
        MODULE_CACHE.react = React;     // 这一拍由本 harness 渲染（模块里的 require("react") 跟着它走）
        dirty = false;
        cursor = 0;
        pending = [];
        tree = Comp(props);
        attachRefs(tree);
        const toRun = pending.slice();
        toRun.forEach(function (p) {
          if (p.prev && typeof p.prev.cleanup === "function") { try { p.prev.cleanup(); } catch (e) {} }
          const c = p.fn();
          if (hooks.effects[p.i]) hooks.effects[p.i].cleanup = c;
        });
        await new Promise((res) => setTimeout(res, 3));
        if (!dirty) break;
      }
      return tree;
    },
    tree() { return tree; },
  };

}

/* ---------- 4. 真样例 ---------- */
const SAMPLE = path.join(WS, "samples", "sample.tex").replace(/\\/g, "/");
const content = fs.readFileSync(path.join(WS, "samples", "sample.tex"), "utf8");
const LINES = content.split("\n");
/* v0.8.17：LN 动态定位 —— 样例是用户可编辑的活文件（用户删过一行，这里就脆断过）。
 * v0.9.3：样例整篇换过（Tempo 那篇），所以这里连标题也不钉死了 ——
 * 取**第一个 \subsection**，标题从行文本里剥出来，编号按它前面有几个 \section 算。
 * 断言的本意始终是「锚点操作落到某个 subsection 那一行」，行号与标题都不是被测对象。 */
const SUB_I = LINES.findIndex(function (l) { return /^\s*\\subsection\{/.test(l); });
const LN = SUB_I + 1;
const SUB_TITLE = SUB_I >= 0 ? String((LINES[SUB_I].match(/\\subsection\{([^}]*)\}/) || [])[1] || "") : "";
const SUB_NUM = (LINES.slice(0, SUB_I + 1).filter(function (l) { return /^\s*\\section\{/.test(l); }).length) + ".1";
const SUB_ANCHOR = SUB_NUM + "  " + SUB_TITLE;
ok(LN > 0, "样例里动态定位到第一个 \\subsection{" + SUB_TITLE + "}（第 " + LN + " 行）");
let expectOff = 0;
for (let i = 0; i < LN - 1; i++) expectOff += LINES[i].length + 1;

function findEl(tree, pred) {
  const out = [];
  (function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.__el) { if (pred(node)) out.push(node); (node.children || []).forEach(walk); }
  })(tree);
  return out;
}
function ackEvents(h) { return h.events.filter((e) => e.type === "notrat-latex-reveal-ack"); }

function mount(filePath, mode, extra) {
  const props = {
    pluginId: "notrat-latex-plugin",
    ctx: { workspace: WS },
    file: { name: "sample.tex", content: content, path: filePath },
    content: content,
    onChange: function () {}, onSave: function () {},
    fileName: "sample.tex",
    filePath: filePath,
    mode: mode,
  };
  if (extra) Object.assign(props, extra);
  const h = createHarness(props);
  /* v0.8.6：把 props 挂出来，供「切视图」用。v0.8.3 起档位由**宿主标签栏**决定，
   * 编辑器不再自绘切换按钮 —— 没有按钮可点，只能改 props.mode 再重渲染。
   * harness 的 render() 复用同一个 props 引用（tree = Comp(props)），改了就生效。 */
  h.props = props;
  return h;
}

(async function () {
  /* ============ A. 可视化视图（宿主默认 editorMode = wysiwyg） ============ */
  console.log("\n── A. mode=wysiwyg（可视化）：源码 textarea 是否挂载 ──");
  const hA = mount(SAMPLE, "wysiwyg");
  let treeA = await hA.render();

  const taA = findEl(treeA, (el) => el.type === "textarea");
  ok(taA.length === 0, "可视化视图下源码 textarea 未挂载（正是老 gotoLine 直接 return 的场景）", "实得 " + taA.length);

  const colA = findEl(treeA, (el) => el.props && el.props.style && el.props.style.width === 150);
  ok(colA.length === 0, "编辑器内不再内嵌大纲列（v0.6.1 移除，宽 150 的那一列）", "实得 " + colA.length);

  console.log("\n── B. 可视化视图下点大纲（本文件 / 第 26 行）──");
  hA.dispatch({ type: "notrat-latex-reveal-line", detail: { path: SAMPLE, line: LN, nonce: "rvtest1" } });
  ok(ackEvents(hA).length === 0, "跳不成时不回 ACK（老实现会撒谎回执 → 面板兜底失效）", "ACK 数=" + ackEvents(hA).length);

  console.log("\n── C. 切到含源码的视图后那一拍：应当补跳 + 补回执 ──");
  /* 老写法只调 render()、不改档位 —— hA 一直是 wysiwyg，textarea 当然挂不出来，
   * 这一节 8 项于是恒假。按 v0.8.3 的契约，档位的权威值就是 props.mode。 */
  hA.props.mode = "source";
  treeA = await hA.render();
  const taA2 = findEl(treeA, (el) => el.type === "textarea");
  ok(taA2.length === 1, "切视图后源码 textarea 挂载了", "实得 " + taA2.length);
  const nodeA = taA2[0] && taA2[0].props.ref ? taA2[0].props.ref.current : null;
  ok(!!nodeA, "拿到 textarea 的 ref");
  const expScroll = Math.max(0, (LN - 1) * 20 - 400 / 3);
  ok(nodeA && Math.abs(nodeA.scrollTop - expScroll) < 1.5, "滚动落点 = 第 " + LN + " 行对应位置（" + expScroll.toFixed(1) + "px）", nodeA && nodeA.scrollTop);
  ok(nodeA && nodeA.selection && nodeA.selection[0] === expectOff, "选区起点 = 第 " + LN + " 行的字符偏移（" + expectOff + "）", nodeA && nodeA.selection && nodeA.selection[0]);
  ok(nodeA && nodeA.focused === true, "跳转时把焦点给了编辑区");
  ok(ackEvents(hA).length === 1, "补跳成功后补发 ACK（不多不少 1 条）", "ACK 数=" + ackEvents(hA).length);
  const ack1 = ackEvents(hA)[0];
  ok(ack1 && ack1.detail && ack1.detail.nonce === "rvtest1", "ACK 带回面板的 nonce（面板据此配对）", ack1 && ack1.detail && ack1.detail.nonce);
  ok(ack1 && ack1.detail && /sample\.tex$/.test(String(ack1.detail.path)), "ACK 带回文件路径", ack1 && ack1.detail && ack1.detail.path);

  console.log("\n── D. 不是本文件 → 不回执、不跳（留给对应的编辑器实例）──");
  const ackBefore = ackEvents(hA).length;
  hA.dispatch({ type: "notrat-latex-reveal-line", detail: { path: "E:/somewhere/other.tex", line: 3, nonce: "rvtest2" } });
  await hA.render();
  ok(ackEvents(hA).length === ackBefore, "别的文件不抢答（面板会走「打开文件 + 重试」兜底）", "ACK 数=" + ackEvents(hA).length);

  /* ============ E. 源码视图：应当当拍就跳 ============ */
  console.log("\n── E. mode=source（源码）：应当当拍直接跳 ──");
  const hB = mount(SAMPLE, "source");
  await hB.render();
  const taB = findEl(hB.tree(), (el) => el.type === "textarea");
  ok(taB.length === 1, "源码视图下 textarea 已挂载");
  hB.dispatch({ type: "notrat-latex-reveal-line", detail: { path: SAMPLE, line: LN, nonce: "rvtest3" } });
  ok(ackEvents(hB).length === 1, "无需切视图：当拍即回 ACK", "ACK 数=" + ackEvents(hB).length);

  /* ============ F. 宿主内置大纲通路（notrat-outline-navigate） ============ */
  console.log("\n── F. 宿主大纲点击通路（anchor = 行号字符串）──");
  const hC = mount(SAMPLE, "source");
  await hC.render();
  hC.dispatch({ type: "notrat-outline-navigate", detail: { pluginId: "notrat-latex-plugin", anchor: String(LN) } });
  await hC.render();
  const taC = findEl(hC.tree(), (el) => el.type === "textarea")[0];
  const nodeC = taC && taC.props.ref ? taC.props.ref.current : null;
  ok(nodeC && Math.abs(nodeC.scrollTop - expScroll) < 1.5, "宿主大纲点击也能定位到第 " + LN + " 行", nodeC && nodeC.scrollTop);

  const hD = mount(SAMPLE, "source");
  await hD.render();
  hD.dispatch({ type: "notrat-outline-navigate", detail: { pluginId: "other-plugin", anchor: "5" } });
  await hD.render();
  const taD = findEl(hD.tree(), (el) => el.type === "textarea")[0];
  const nodeD = taD && taD.props.ref ? taD.props.ref.current : null;
  ok(nodeD && nodeD.scrollTop === 0, "别的插件的大纲事件不抢（不滚动）", nodeD && nodeD.scrollTop);

  /* ============ G. 宿主把 anchor 退化成标题文本（v0.6.2 硬化） ============ */
  console.log("\n── G. 宿主回抛的是标题文本（anchor 丢了）→ 必须按标题回查行号 ──");
  const gA = mount(SAMPLE, "source");
  await gA.render();
  gA.dispatch({
    type: "notrat-outline-navigate",
    detail: { pluginId: "notrat-latex-plugin", anchor: SUB_ANCHOR, item: { text: SUB_ANCHOR } },
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
    detail: { pluginId: "notrat-latex-plugin", item: { text: SUB_TITLE } },
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
  /* 注释里引用了旧代码原文（帮后人认出坑），所以必须去注释后再查 */
  const edCode = edSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(!/Number\(d\.anchor\)/.test(edCode), "源码（去注释后）已无「非数字锚点兜成 1」的写法");
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
  /* v0.9.3：这三条原来写死旧样例的 5 / ∑1 / 2 —— 样例一换就整片红，而它真正测的是
   * 「状态栏报的数字 == 文档里真实有的数字」。期望值改成**从源码独立现算**，
   * 而且用与 editor.tsx 不同的写法（split 计数，不是逐行正则），
   * 否则就是把被测实现抄一遍当尺子 —— 那样它永远绿。 */
  const cnt = (needle) => content.split(needle).length - 1;
  const expSec = cnt("\\section{") + cnt("\\subsection{");
  const expEq = cnt("\\begin{equation}");
  const expFig = cnt("\\begin{figure}");
  const expTab = cnt("\\begin{table}");
  const expCite = cnt("\\cite{");
  ok(byId("sec") && byId("sec").text === "📑 " + expSec + " 节", "节数 = 真实章节数 " + expSec, byId("sec") && byId("sec").text);
  ok(byId("env") && byId("env").text === "∑" + expEq + " · 图" + expFig + " · 表" + expTab, "公式/图/表 = 真实环境数", byId("env") && byId("env").text);
  ok(byId("cite") && byId("cite").text.indexOf("🔖 " + expCite + " · ") === 0 && /≈\d+ 字$/.test(byId("cite").text),
     "引用数 = " + expCite + "（真实 \\cite 数）+ 近字数", byId("cite") && byId("cite").text);
  /* v0.8.6：这里原先断言 todo / pos 两类条目。它们**已经不在** editor.tsx 的推送集合里
   * （现在只有 sec / env / cite / issue），所以那两条恒假 —— 测的是不存在的东西。
   * 改成白名单：既钉住真实集合，也在有人新增/回填条目时立刻变红，逼他同步这条清单。 */
  const ALLOWED_STATUS_IDS = ["sec", "env", "cite", "issue"];
  const unknown = ids.filter((k) => ALLOWED_STATUS_IDS.indexOf(k) < 0);
  ok(unknown.length === 0, "状态栏条目集合 = " + ALLOWED_STATUS_IDS.join(" / ") + "（无 todo / pos，已废弃勿再断言）", unknown.join(","));

  const beforeS = statusCalls.length;
  hS.dispatch({ type: "notrat-latex-active-file", detail: { path: "E:/somewhere/other.tex", name: "other.tex" } });
  await hS.render();
  ok(statusCalls.length === beforeS,
     "别的文件成为活动文件后：不抢着推、也不清空（清空会盖掉对方的状态栏）", statusCalls.length - beforeS);

  const hNo = mount(SAMPLE, "source");
  await hNo.render();
  ok(true, "宿主没注入 setStatus 时不抛错（向后兼容老宿主）");

  /* ============ I. v0.8.6 格式快捷键：端到端（真渲染 → 真按键 → 真的包住选区） ============ */
  console.log("\n── I. 格式快捷键端到端（根节点捕获 → 改写内容 / 落光标）──");
  let edited = null;
  /* onChange 里回写 props.content —— 模拟真实宿主：onChange → setState → 重渲染 → effect 回填光标。
   * 不接这条回路，组件的 content prop 永远不变，依赖 [content] 的 effect 不会跑，
   * 光标断言就只能拿到 null（那是测试没接通，不是代码的问题）。 */
  let hK = null;
  hK = mount(SAMPLE, "source", { onChange: function (v) { edited = v; hK.props.content = v; } });
  const treeK = await hK.render();

  /* 根节点 = 唯一挂了 keydown 监听的那个（onCtrlSlash + onFmtKey） */
  const rootEls = findEl(treeK, (el) => {
    const r = el.props && el.props.ref && el.props.ref.current;
    return !!(r && r.listeners && r.listeners.keydown && r.listeners.keydown.length);
  });
  ok(rootEls.length === 1, "找到挂了键盘监听的根节点", "找到 " + rootEls.length + " 个");
  const rootK = rootEls[0].props.ref.current;
  ok(rootK.listeners.keydown.length === 2, "根上有 2 个 keydown 监听（Ctrl+/ 与格式键）", rootK.listeners.keydown.length);

  const taK = findEl(treeK, (el) => el.type === "textarea")[0];
  const taNode = taK && taK.props.ref ? taK.props.ref.current : null;
  ok(!!taNode, "拿到 textarea 的假节点");

  /* 「只在源码输入框聚焦时接管」—— 先把焦点给它，再派发 */
  global.document.activeElement = taNode;

  async function press(key, shift, code) {
    const ev = {
      key: key, code: code || ("Key" + String(key).toUpperCase()),
      ctrlKey: true, metaKey: false, shiftKey: !!shift, altKey: false,
      prevented: false,
      preventDefault: function () { ev.prevented = true; },
      stopPropagation: function () {},
    };
    rootK.listeners.keydown.slice().forEach(function (fn) { try { fn(ev); } catch (e) { console.error(e); } });
    await hK.render();   // 让 [content] 那个 effect 跑一拍，兑现 pendingRange 的光标回填
    return ev;
  }

  /* 每个用例都从**原始正文**重来。不重置的话，第二个用例是在第一个用例改完的结果上继续改 ——
   * 上一拍的 onChange 已经把 props.content 换掉了，期望值自然对不上。 */
  async function fresh(selStart, selEnd) {
    hK.props.content = content;
    edited = null;
    await hK.render();
    taNode.selectionStart = selStart;
    taNode.selectionEnd = selEnd;
  }

  /* ① 无选区按 Ctrl+B：插入空模板，光标落到 {} 中间 */
  await fresh(0, 0);
  const evB = await press("b", false, "KeyB");
  ok(evB.prevented === true, "命中的键位被 preventDefault（不再漏给宿主）");
  const wantB = "\\textbf{}" + content;
  ok(edited === wantB, "Ctrl+B 无选区：内容 = \\textbf{} + 原文",
     edited === null ? "onChange 未被调用" : JSON.stringify(String(edited).slice(0, 30)));
  ok(taNode.selection && taNode.selection[0] === 8, "光标落在 {} 中间（偏移 8）", taNode.selection && taNode.selection[0]);

  /* ② 有选区按 Ctrl+B：包住选中的字 */
  await fresh(0, 6);
  await press("b", false, "KeyB");
  const wantB2 = "\\textbf{" + content.slice(0, 6) + "}" + content.slice(6);
  ok(edited === wantB2, "Ctrl+B 有选区：包住选中内容", JSON.stringify(String(edited || "").slice(0, 40)));

  /* \u2462 Ctrl+1 \u65e0\u9009\u533a\uff1a\u628a**\u5f53\u524d\u6574\u884c**\u53d8\u6210 \\section{...}
   * \u26a0 \u5fc5\u987b\u6311\u4e00\u884c**\u6b63\u6587**\u6765\u6d4b\u3002\u672c\u6587\u4ef6\u7b2c 1 \u884c\u662f \documentclass[12pt]{ctexart}\uff0c\u800c applyHead
   *   \u4ece v0.8.7 \u8d77\u523b\u610f**\u62d2\u7edd\u63a5\u7ba1**\u300c\u4ee5 \ \u5f00\u5934\u5374\u4e0d\u662f\u7ae0\u8282\u547d\u4ee4\u300d\u7684\u884c\uff08\u6e90\u7801\u6ce8\u91ca\u91cc\u5199\u7740\u7406\u7531\uff1a
   *   \u5305\u6210 \section{\documentclass[12pt]{ctexart}} \u662f\u7eaf\u7cb9\u7684\u7834\u574f\uff0c\u7528\u6237\u6ca1\u4e00\u4e2a\u60f3\u8981\u7684\uff09\u3002
   *   \u62ff\u90a3\u4e00\u884c\u6765\u6d4b\u53ea\u4f1a\u62ff\u5230\u7a7a\u7ed3\u679c \u2014\u2014 \u90a3\u662f\u65ad\u8a00\u9009\u9519\u4e86\u88ab\u6d4b\u5bf9\u8c61\uff0c\u4e0d\u662f\u529f\u80fd\u574f\u4e86\uff1b\u2462b \u53cd\u8fc7\u6765\u9489\u4f4f\u5b83\u3002 */
  /* v0.9.3：动态找**第一个 \section 之后的第一行真正的正文**（不以 \ 开头、非空）。
   * 断言的本意是「拿一行正文来测 Ctrl+1」，行号不是被测对象（写死行号，样例一改就脆断）。 */
  const BODY_SEC_I = LINES.findIndex(function (l) { return /^\s*\\section\{/.test(l); });
  let BODY_I = -1;
  for (let i = BODY_SEC_I + 1; i < LINES.length; i++) {
    const bt = LINES[i].trim();
    if (bt && bt.charAt(0) !== "\\") { BODY_I = i; break; }
  }
  ok(BODY_I > 0, "样例里动态定位到一行真正的正文（第 " + (BODY_I + 1) + " 行）");
  const bOff = (function () { let o = 0; for (let k = 0; k < BODY_I; k++) o += LINES[k].length + 1; return o; })();
  const bText = LINES[BODY_I];
  await fresh(bOff, bOff);
  await press("1", false, "Digit1");
  ok(edited === content.slice(0, bOff) + "\\section{" + bText + "}" + content.slice(bOff + bText.length),
     "Ctrl+1 \u628a\u5f53\u524d\u6574\u884c\uff08\u6b63\u6587\uff09\u5347\u6210 \\section{\u539f\u884c}", JSON.stringify(String(edited || "").slice(0, 50)));

  /* \u2462b \u53cd\u8fc7\u6765\u9489\u4f4f\u90a3\u6761\u4fdd\u62a4\uff1a\u4ee5 \ \u5f00\u5934\u7684\u975e\u7ae0\u8282\u884c**\u4e0d\u8bb8**\u88ab\u63a5\u7ba1 */
  await fresh(0, 0);
  const evDoc = await press("1", false, "Digit1");
  ok(edited === null, "Ctrl+1 \u5728 \\documentclass \u90a3\u4e00\u884c\u4e0d\u63a5\u7ba1\uff08\u4e0d\u8bb8\u628a\u5bfc\u8a00\u533a\u5305\u8fdb \\section{}\uff09",
     JSON.stringify(String(edited || "").slice(0, 50)));
  ok(evDoc.prevented === true, "\u2462b \u4f46\u6309\u952e\u4ecd\u88ab\u680f\u4e0b\uff08\u4e0d\u843d\u7ed9\u5bbf\u4e3b\uff09");

  /* ④ Ctrl+M 行内公式 */
  await fresh(0, 0);
  await press("m", false, "KeyM");
  ok(edited === "$$" + content && taNode.selection && taNode.selection[0] === 1, "Ctrl+M 插 $$ 且光标落在中间",
     JSON.stringify(String(edited || "").slice(0, 20)) + " caret=" + (taNode.selection && taNode.selection[0]));

  /* ⑤ 不该拦的必须放行：Ctrl+S（保存）仍旧原样走掉 */
  await fresh(0, 0);
  const evS = await press("s", false, "KeyS");
  ok(evS.prevented === false, "Ctrl+S 不被格式层拦（让位给保存）");
  ok(edited === null, "Ctrl+S 没被格式层改写内容");

  /* ⑥ 焦点不在源码输入框时不接管（预览区 / 别处按键一律放行） */
  global.document.activeElement = null;
  edited = null;
  const evNF = await press("b", false, "KeyB");
  ok(evNF.prevented === false && edited === null, "焦点不在源码输入框时：不拦、不改");

  /* ⑦ 未定义的组合键放行（不能把 Ctrl+9 这类吞掉） */
  global.document.activeElement = taNode;
  const evUnknown = await press("9", false, "Digit9");
  ok(evUnknown.prevented === false, "没在表里的键位一律放行（不做「凡是 Ctrl+X 都吞掉」）");

  console.log("\n" + (fail === 0 ? "✅ 全部通过：" + pass + " 项" : "❌ " + fail + " 项未通过（共 " + (pass + fail) + " 项）"));
  process.exitCode = fail ? 1 : 0;
})();
