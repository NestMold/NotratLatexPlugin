/* v0.5.1 行为测试：章节大纲卡片的「显示条件」（只有 LaTeX 文件才出现）
 *
 * 不装依赖、不进 Electron：从 panels/outline.tsx 里把新加的显示条件代码块整段抠出来，
 * 配假的 require / document / window / store + 迷你 React 直接跑。
 *
 * 覆盖：
 *   A. findHostCard —— 向上找到的是「最外层卡片壳」（含 ✕ 的那个），不是 -body / -header
 *   B. hideOrphanSectionLabel —— 只有自己一张卡时才收走「插件面板」分区标题
 *   C. useHostCardHidden —— 藏 / 还原 / 卸载还原（按真 DOM 顺序：commit 挂 ref 之后才跑 effect）
 *   D. useHostCurrentFilePath —— 认得出 .md（事件桥做不到这件事），store 缺失时静默降级
 *   E. 接线（源码级 + 部署产物）
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

const WS = "E:/notrat-latex-plugin";
let pass = 0;
let fail = 0;
function ok(cond, msg, extra) {
  if (cond) {
    pass++;
    console.log("  \u2713 " + msg);
  } else {
    fail++;
    console.log("  \u2717 " + msg + (extra !== undefined ? "  -> " + String(extra).slice(0, 240) : ""));
  }
}

/* ============================ 抠出被测代码块 ============================ */
const A = "/* ============ 显示条件：只有当前活动文件是 LaTeX 时才出现这张卡片 ============ */";
const B = "/* ============================ 主面板 ============================ */";
const outlineSrc = fs.readFileSync(path.join(WS, "panels/outline.tsx"), "utf8");
const iA = outlineSrc.indexOf(A);
const iB = outlineSrc.indexOf(B);
if (iA < 0 || iB < 0 || iB < iA) {
  console.error("找不到显示条件代码块的边界注释");
  process.exit(1);
}
const BLOCK = outlineSrc.slice(iA, iB);
if (BLOCK.indexOf("function getHostStore() {") < 0 || BLOCK.indexOf("function useHostCardHidden(hidden) {") < 0) {
  console.error("代码块里缺少预期函数");
  process.exit(1);
}
console.log("被测代码块 " + BLOCK.length + " 字符\n");

/* ============================ 迷你 React ============================ */
/* 与真 React 的差异只有一处：真 React 在 commit 阶段先挂 ref、再跑 effect，
 * 这里用 mount() / flush() 两步把这个顺序显式化（见 C 组）。 */
function makeHarness() {
  let hooks = [];
  let cursor = 0;
  let queued = [];
  let renderFn = null;
  let last = null;
  let deferred = false;

  function flush() {
    const q = queued;
    queued = [];
    q.forEach(function (run) { run(); });
  }
  function render() {
    cursor = 0;
    const out = renderFn();
    last = out;
    if (!deferred) flush();
    return out;
  }

  const api = {
    useState: function (init) {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = { v: typeof init === "function" ? init() : init };
      const slot = hooks[i];
      function set(nv) {
        const next = typeof nv === "function" ? nv(slot.v) : nv;
        if (next === slot.v) return;
        slot.v = next;
        render();
      }
      return [slot.v, set];
    },
    useEffect: function (fn, deps) {
      const i = cursor++;
      const prev = hooks[i];
      const changed = !prev || !deps || !prev.deps || deps.length !== prev.deps.length ||
        deps.some(function (d, j) { return d !== prev.deps[j]; });
      if (!changed) return;
      const prevCleanup = prev && prev.cleanup;
      hooks[i] = { deps: deps, cleanup: null };
      queued.push(function () {
        if (prevCleanup) prevCleanup();
        hooks[i].cleanup = fn() || null;
      });
    },
    useRef: function (init) {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = { current: init === undefined ? null : init };
      return hooks[i];
    },
  };

  return {
    api: api,
    mount: function (fn) { renderFn = fn; hooks = []; queued = []; deferred = true; render(); return last; },
    flush: function () { deferred = false; flush(); return last; },
    read: function () { return last; },
    unmount: function () { hooks.forEach(function (h) { if (h && h.cleanup) h.cleanup(); }); hooks = []; cursor = 0; },
  };
}

/* ============================ 假 DOM ============================ */
/* 只实现被测代码用到的那点 DOM：className / parentElement / children /
 * firstElementChild / contains / querySelectorAll（只认两种选择器）。 */
function el(className, kids) {
  const node = { className: className || "", style: {}, parentElement: null, children: [] };
  node.contains = function (x) {
    for (let p = x; p; p = p.parentElement) if (p === node) return true;
    return false;
  };
  node.querySelectorAll = function (sel) {
    const parts = String(sel).split(",").map(function (s) { return s.trim(); });
    const hit = [];
    (function walk(n) {
      n.children.forEach(function (c) {
        if (parts.some(function (p) { return matches(c, p); })) hit.push(c);
        walk(c);
      });
    })(node);
    return hit;
  };
  Object.defineProperty(node, "firstElementChild", {
    get: function () { return node.children[0] || null; },
  });
  (kids || []).forEach(function (k) { node.children.push(k); k.parentElement = node; });
  return node;
}
function matches(node, sel) {
  const cls = node.className || "";
  if (sel.indexOf('[class*="') === 0 && sel.slice(-2) === '"]') {
    return cls.indexOf(sel.slice(9, -2)) >= 0;
  }
  if (sel.charAt(0) === ".") return cls.split(/\s+/).indexOf(sel.slice(1)) >= 0;
  return false;
}
function append(parent, child) {
  parent.children.push(child);
  child.parentElement = parent;
  return child;
}
/* 宿主真实结构：挂载位容器 > Dismissable(壳+✕) > PanelShell 卡片 > header/body > 本面板 */
function hostTree() {
  const slot = el("p-3 pt-1 space-y-2 notrat-plugin-slot notrat-plugin-slot-outline");
  const label = append(slot, el("text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider"));
  const wrapper = append(slot, el("relative group/panel"));
  const card = append(wrapper, el("rounded-lg border bg-[hsl(var(--card))] overflow-hidden notrat-plugin-panel notrat-plugin-panel-outline"));
  const header = append(card, el("notrat-plugin-panel-header px-2.5 py-1.5 text-xs font-semibold flex items-center gap-1 border-b"));
  const body = append(card, el("notrat-plugin-panel-body px-2.5 py-2"));
  const root = append(body, el(""));
  return { slot: slot, label: label, wrapper: wrapper, card: card, header: header, body: body, root: root };
}
/* 再挂一个「别的插件」的卡片到同一挂载位 */
function addOtherCard(slot) {
  const wrapper = append(slot, el("relative group/panel"));
  const card = append(wrapper, el("notrat-plugin-panel"));
  const body = append(card, el("notrat-plugin-panel-body"));
  return { wrapper: wrapper, card: card, body: body };
}

/* getComputedStyle：读假 DOM 上的 style（display 缺省 = block） */
const win = {
  getComputedStyle: function (n) {
    return { display: (n && n.style && n.style.display) || "block", visibility: "visible" };
  },
};
const bodySentinel = { className: "__body__", children: [], parentElement: null };
const doc = { body: bodySentinel };

/* ============================ 装载代码块 ============================ */
function load(env) {
  const H = makeHarness();
  const fn = new Function(
    "useState", "useEffect", "useRef", "require", "document", "window",
    BLOCK + "\nreturn { getHostStore: getHostStore, useHostCurrentFilePath: useHostCurrentFilePath," +
      " findHostCard: findHostCard, hideOrphanSectionLabel: hideOrphanSectionLabel," +
      " isRendered: isRendered, useHostCardHidden: useHostCardHidden };"
  );
  const api = fn(H.api.useState, H.api.useEffect, H.api.useRef, env.require, doc, win);
  return { api: api, H: H };
}
/* 假宿主 store：currentFile + subscribe（形状照宿主 useWorkspaceStore） */
function fakeStore(p) {
  let state = { currentFile: p ? { path: p, name: String(p).split("/").pop() } : null };
  const subs = [];
  return {
    getState: function () { return state; },
    subscribe: function (fn) {
      subs.push(fn);
      return function () { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); };
    },
    set: function (np) {
      state = { currentFile: np ? { path: np, name: "x" } : null };
      subs.slice().forEach(function (f) { f(); });
    },
    subs: subs,
  };
}
function fakeRequire(map) {
  return function (id) {
    if (!Object.prototype.hasOwnProperty.call(map, id)) throw new Error('module "' + id + '" is not in the whitelist');
    return map[id];
  };
}

/* ================================== A. findHostCard ================================== */
console.log("== A. findHostCard：找到的是最外层卡片壳（连 ✕ 一起） ==");
(function () {
  const t = hostTree();
  const L = load({ require: fakeRequire({}) });
  const hit = L.api.findHostCard(t.root);

  ok(hit === t.wrapper,
    "真结构：从面板根向上 -> Dismissable 壳（group/panel），不是 -body / -header",
    hit && hit.className);
  ok(hit !== t.body && hit !== t.card && hit !== t.header,
    "不是卡片内部节点（只藏 -body 会留下标题行，只藏 -header 会留下内容）");
  ok(hit !== t.slot, "不越界把挂载位容器当卡片（那会连带藏掉别的插件的面板）");

  const slot2 = el("notrat-plugin-slot notrat-plugin-slot-outline");
  const card2 = append(slot2, el("notrat-plugin-panel"));
  const body2 = append(card2, el("notrat-plugin-panel-body"));
  const root2 = append(body2, el(""));
  ok(L.api.findHostCard(root2) === card2, "没有 Dismissable 时回落到 .notrat-plugin-panel 卡片本体");

  const slot3 = el("notrat-plugin-slot notrat-plugin-slot-outline");
  const body3 = append(slot3, el("notrat-plugin-panel-body px-2.5 py-2"));
  const root3 = append(body3, el(""));
  ok(L.api.findHostCard(root3) === null,
    "只有 -body 时返回 null（精确 token 匹配，不会被 notrat-plugin-panel-body 骗到）");

  ok(L.api.findHostCard(bodySentinel) === null, "向上走到 document.body 就停（不越界）");

  /* 面板被用户右键挪到别的挂载位：容器类名换成 notrat-plugin-slot-right-panel，
   * 收手判定必须照样认出来（否则会继续向上走，藏到不该藏的东西） */
  const slot4 = el("notrat-plugin-slot-right-panel p-3 space-y-2");
  const label4 = append(slot4, el("text-[10px] uppercase tracking-wider"));
  const wrapper4 = append(slot4, el("relative group/panel"));
  const card4 = append(wrapper4, el("notrat-plugin-panel"));
  const body4 = append(card4, el("notrat-plugin-panel-body"));
  const root4 = append(body4, el(""));
  ok(L.api.findHostCard(root4) === wrapper4,
    "挂载位带后缀（notrat-plugin-slot-right-panel）也认得出容器，照常收手");

  /* 容器外面挂一个诱饵卡片：收手判定若失效就会藏到它 */
  const outerDecoy = el("notrat-plugin-panel");
  append(outerDecoy, slot4);
  ok(L.api.findHostCard(root4) === wrapper4,
    "容器外有诱饵卡片时也不会越界藏到它（前缀识别挂载位容器）");
})();

/* ================================== B. 分区标题 ================================== */
console.log("\n== B. hideOrphanSectionLabel：只有自己一张卡时才收走「插件面板」 ==");
(function () {
  const L = load({ require: fakeRequire({}) });

  const t = hostTree();
  ok(L.api.hideOrphanSectionLabel(t.wrapper) === t.label,
    "本区只有自己 -> 返回分区标题（一起收走，不留孤零零一行字）");

  const t2 = hostTree();
  const other = addOtherCard(t2.slot);
  ok(L.api.hideOrphanSectionLabel(t2.wrapper) === null,
    "同区还有别的插件卡片露着 -> 保留分区标题（不越界动别人的东西）");

  other.wrapper.style.display = "none";
  ok(L.api.hideOrphanSectionLabel(t2.wrapper) === t2.label,
    "别的卡片自己也已隐藏 -> 仍然收走分区标题");

  const t3 = hostTree();
  ok(L.api.hideOrphanSectionLabel(t3.wrapper) === t3.label,
    "容器内没有别的卡片 -> 收走");
})();

/* ================================== C. useHostCardHidden ================================== */
console.log("\n== C. useHostCardHidden：藏 / 还原 / 卸载还原 ==");
(function () {
  const t = hostTree();
  const L = load({ require: fakeRequire({}) });
  const ref = L.H.mount(function () { return L.api.useHostCardHidden(true); });
  ref.current = t.root; /* 模拟 commit 阶段挂 ref */
  L.H.flush();
  ok(t.wrapper.style.display === "none", "hidden=true -> 卡片壳 display:none（标题行与 ✕ 一起消失）");
  ok(t.label.style.display === "none", "hidden=true -> 「插件面板」分区标题也收走");

  L.H.unmount();
  ok(t.wrapper.style.display === "" && t.label.style.display === "",
    "卸载 -> 壳与分区标题都还原（不给宿主留下被改过的 DOM）");

  const t2 = hostTree();
  const L2 = load({ require: fakeRequire({}) });
  const ref2 = L2.H.mount(function () { return L2.api.useHostCardHidden(false); });
  ref2.current = t2.root;
  L2.H.flush();
  ok(!t2.wrapper.style.display && !t2.label.style.display,
    "hidden=false -> 什么都不藏（连分区标题都不碰）");

  /* 同区还有别的插件卡片：只藏自己，分区标题留给别人 */
  const t3 = hostTree();
  addOtherCard(t3.slot);
  const L3 = load({ require: fakeRequire({}) });
  const ref3 = L3.H.mount(function () { return L3.api.useHostCardHidden(true); });
  ref3.current = t3.root;
  L3.H.flush();
  ok(t3.wrapper.style.display === "none" && !t3.label.style.display,
    "有别的卡片时不收分区标题，只藏自己这张");
})();

/* ================================== D. useHostCurrentFilePath ================================== */
console.log("\n== D. useHostCurrentFilePath：认得出非 LaTeX 文件（事件桥做不到） ==");
(function () {
  const store = fakeStore("E:/ws/sample.tex");
  const L = load({ require: fakeRequire({ "@/store": { useWorkspaceStore: store } }) });
  L.H.mount(function () { return L.api.useHostCurrentFilePath(); });
  L.H.flush();
  let st = L.H.read();
  ok(st && st.known === true && st.path === "E:/ws/sample.tex",
    "挂载即拿到宿主当前文件（不用等编辑器 ping）", JSON.stringify(st));

  store.set("E:/ws/notes.md");
  st = L.H.read();
  ok(st.known === true && st.path === "E:/ws/notes.md",
    "切到 .md -> path 跟随更新（这一步让「整卡隐藏」的判定成立）", JSON.stringify(st));

  store.set(null);
  st = L.H.read();
  ok(st.known === true && st.path === "",
    "没有打开任何文件（currentFile=null）-> path 为空 = 隐藏", JSON.stringify(st));

  L.H.unmount();
  ok(store.subs.length === 0, "卸载时退订（不留悬挂订阅）");

  /* 宿主不给 store：静默降级，不抛错 */
  let threw = null;
  try {
    const L2 = load({ require: fakeRequire({}) });
    L2.H.mount(function () { return L2.api.useHostCurrentFilePath(); });
    L2.H.flush();
    const st2 = L2.H.read();
    ok(st2 && st2.known === false && st2.path === "",
      "require(\"@/store\") 不在白名单 -> known=false，静默交给事件桥兜底", JSON.stringify(st2));
  } catch (e) {
    threw = e;
  }
  ok(!threw, "白名单缺失时不抛异常（面板不能因此白屏）", threw && threw.message);
})();

/* ================================== E. 接线 ================================== */
console.log("\n== E. 接线（源码级 + 部署产物） ==");
(function () {
  ok(/require\("@\/store"\)/.test(outlineSrc), "outline 从宿主 store 取当前文件（require 白名单通道）");
  ok(/const showCard = ready && isLatexPath\(activePath\);/.test(outlineSrc),
    "显示条件逐字可查：ready && isLatexPath(activePath)");
  ok(/if \(!showCard\) return <div ref=\{rootRef\} style=\{\{ display: "none" \}\} \/>;/.test(outlineSrc),
    "非 LaTeX 时走整卡隐藏分支（不再画提示卡）");
  ok(/<div ref=\{rootRef\} style=\{S\.root\}>/.test(outlineSrc), "主根节点挂了 ref（隐藏的抓手）");
  ok(!/IdlePanel/.test(outlineSrc), "旧的 IdlePanel（只收内容、卡片壳还在）已移除");
  ok(/useHostCardHidden\(!showCard\)/.test(outlineSrc), "隐藏 hook 由显示条件驱动");
  ok(/useActiveLatexFile\(\)/.test(outlineSrc), "事件桥仍然保留为兜底");
  ok(/load\(activePath\);/.test(outlineSrc), "数据入口改为 load(activePath)");

  const PKG = path.join(os.homedir(), ".notrat", "plugins", "notrat-latex-plugin.json");
  ok(fs.existsSync(PKG), "单文件包存在", PKG);
  if (fs.existsSync(PKG)) {
    const pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
    let src = "";
    (pkg.contributions.ui || []).forEach(function (u) {
      if (u.id === "latex-outline") src = (u.content && u.content.source) || "";
    });
    ok(!!src, "部署包里找得到 latex-outline 面板");
    ok(/useHostCardHidden/.test(src) && /findHostCard/.test(src), "部署产物含整卡隐藏实现");
    ok(/require\("@\/store"\)/.test(src), "部署产物含宿主 store 通道");
    ok(!/IdlePanel/.test(src), "部署产物已无 IdlePanel");
  }
})();

console.log("\n" + (fail === 0 ? "\u2705 全部通过：" + pass + " 项" : "\u274c " + fail + " 项未通过（共 " + (pass + fail) + " 项）"));
process.exitCode = fail ? 1 : 0;
