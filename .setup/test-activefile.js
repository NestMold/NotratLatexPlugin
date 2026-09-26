/* v0.4.1 行为测试：活动文件广播 / 桥接
 *
 * 不装依赖、不进 Electron：把工作区源码里两段真实实现抠出来，配一个假 window +
 * 假 sessionStorage + 迷你 React（useState/useEffect 语义）直接跑。
 *
 * 覆盖：
 *   A. 生产者（panels/editor.tsx）announce/retract
 *      · 挂载即入 sessionStorage 并广播
 *      · .tex -> .tex 切换：旧实例的 retract 不得清掉新实例的广播
 *      · 切走：清 sessionStorage + 广播空路径
 *   B. 消费侧纯函数（isLatexPath / readActiveSnapshot）
 *      · 扩展名判定（含大小写）、快照 8s 新鲜度
 *   C. 消费侧 hook（useActiveLatexFile）
 *      · 无人应答 -> 250ms 后 ready 且 path 为空（= 当前不是 LaTeX 文件）
 *      · 有人应答（真生产者挂上 ping 应答）-> 挂载即拿到路径
 *      · 事件驱动：切到 .tex -> path 变；切走 -> path 回空
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
    console.log("  \u2717 " + msg + (extra !== undefined ? "  -> " + String(extra).slice(0, 200) : ""));
  }
}

/* ⚠ 读进来先归一 CRLF：本仓库 editor.tsx 是 CRLF、outline.tsx 是 LF（历史遗留，
 * 两边没统一）。下面按**代码片段**抠取时用的锚点是按 LF 写的，不归一必然失配 ——
 * "\n  }, 120);\n}\n" 碰上 "\r\n  }, 120);\r\n}\r\n" 里的 "\n}" 是匹配不上的。
 * 这里抠的是「源码长什么样」，不是「字节是否一致」，归一不影响测试意图。 */
const src = (f) => fs.readFileSync(path.join(WS, f), "utf8").replace(/\r\n/g, "\n");

/* ---------------------------------------------------------------- 抠代码 */
function sliceFrom(from, to, label) {
  const i = from.indexOf(to[0]);
  if (i < 0) throw new Error(label + ": 找不到起点 " + to[0]);
  const j = from.indexOf(to[1], i);
  if (j < 0) throw new Error(label + ": 找不到终点 " + to[1]);
  const out = from.slice(i, j + to[1].length);
  try {
    fs.writeFileSync(path.join(WS, ".setup/check/snippet-" + label + ".tsx"), out, "utf8");
    fs.writeFileSync(path.join(WS, ".setup/check/snippet-" + label + ".meta.txt"), "len=" + out.length + " i=" + i + " j=" + j + " from=" + from.length + "\n", "utf8");
  } catch (e) {}
  return out;
}

const editorSrc = src("panels/editor.tsx");
const outlineSrc = src("panels/outline.tsx");
const widgetSrc = src("panels/widget.tsx");
const headerSrc = src("panels/editor-header.tsx");
const tabsSrc = src("panels/editor-tabs.tsx");
const mainSrc = src("panels/main.tsx");

const PRODUCER_SNIPPET = sliceFrom(
  editorSrc,
  ['const LATEX_EV = "notrat-latex-active-file";', "\n  }, 120);\n}\n"],
  "producer"
);
const CONSUMER_SNIPPET = sliceFrom(
  outlineSrc,
  ['const LATEX_EV = "notrat-latex-active-file";', "\n  return state;\n}\n"],
  "consumer"
);

/* -------------------------------------------------------------- 假宿主环境 */
function makeEnv() {
  const listeners = {};
  const events = [];
  class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init && init.detail;
    }
  }
  const win = {
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener: (t, fn) => { listeners[t] = (listeners[t] || []).filter((f) => f !== fn); },
    dispatchEvent: (e) => {
      events.push(e);
      (listeners[e.type] || []).slice().forEach((fn) => fn(e));
      return true;
    },
  };
  const store = new Map();
  const ss = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  return { win, ss, CustomEvent, events, listeners, store };
}

function loadProducer(env) {
  const fn = new Function(
    "window", "sessionStorage", "setTimeout", "clearTimeout", "CustomEvent",
    PRODUCER_SNIPPET + "\nreturn { announceActiveFile: announceActiveFile, retractActiveFile: retractActiveFile };"
  );
  return fn(env.win, env.ss, setTimeout, clearTimeout, env.CustomEvent);
}

function loadConsumer(env) {
  const fake = makeMiniReact();
  const fn = new Function(
    "window", "sessionStorage", "setTimeout", "clearTimeout", "CustomEvent", "useState", "useEffect",
    CONSUMER_SNIPPET + "\nreturn { useActiveLatexFile: useActiveLatexFile, readActiveSnapshot: readActiveSnapshot, isLatexPath: isLatexPath };"
  );
  const api = fn(env.win, env.ss, setTimeout, clearTimeout, env.CustomEvent, fake.useState, fake.useEffect);
  return { api, react: fake };
}

/* 迷你 React：只实现 useState / useEffect 的真实语义（依赖数组比较 + 卸载清理 + 重渲染） */
function makeMiniReact() {
  let hooks = [];
  let cursor = 0;
  let pending = [];
  let renderFn = null;

  function render() {
    cursor = 0;
    pending = [];
    const out = renderFn();
    last = out; // 先记本帧；effect 里若同步 setState 会再渲染并覆盖成更新的一帧
    const effects = pending;
    effects.forEach((run) => run());
    return out;
  }
  const React = {
    useState(init) {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = { v: typeof init === "function" ? init() : init };
      const slot = hooks[i];
      const set = (nv) => {
        const next = typeof nv === "function" ? nv(slot.v) : nv;
        if (next === slot.v) return;
        slot.v = next;
        last = render();
      };
      return [slot.v, set];
    },
    useEffect(fn, deps) {
      const i = cursor++;
      const prev = hooks[i];
      const changed = !prev || !deps || !prev.deps || deps.length !== prev.deps.length ||
        deps.some((d, j) => d !== prev.deps[j]);
      if (!changed) return;
      const prevCleanup = prev && prev.cleanup;
      hooks[i] = { deps: deps, cleanup: null };
      pending.push(() => {
        if (prevCleanup) prevCleanup();
        hooks[i].cleanup = fn() || null;
      });
    },
    unmount() {
      hooks.forEach((h) => { if (h && h.cleanup) h.cleanup(); });
      hooks = [];
      cursor = 0;
    },
  };
  let last = null;
  return {
    useState: React.useState,
    useEffect: React.useEffect,
    /* 注意：effect 里可能同步 setState 触发重渲染，所以 mount 只取「最终状态」，
     * 不能用 render() 的返回值（那是 effect 跑之前的那一帧）。 */
    mount(fn) { hooks = []; renderFn = fn; return render(), last; },
    read() { return last; },
    unmount: React.unmount,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* =============================================================== A. 生产者 */
(async function () {
  console.log("== A. 生产者：广播 / 延迟清场 ==");
  const env = makeEnv();
  const P = loadProducer(env);

  P.announceActiveFile("E:/ws/a.tex", "a.tex", {});
  const s1 = JSON.parse(env.ss.getItem("notrat-latex-active") || "null");
  ok(s1 && s1.path === "E:/ws/a.tex", "挂载后 sessionStorage 记下活动文件", env.ss.getItem("notrat-latex-active"));
  ok(env.events.length === 1 && env.events[0].detail.path === "E:/ws/a.tex", "广播 1 次，detail.path 正确");
  ok(env.events[0].type === "notrat-latex-active-file", "事件名 = notrat-latex-active-file");

  // .tex -> .tex：新实例先广播，旧实例随后卸载（各自持归属令牌，同组件真实行为）
  const oA = {};
  const oB = {};
  P.announceActiveFile("E:/ws/a.tex", "a.tex", oA);
  P.announceActiveFile("E:/ws/b.tex", "b.tex", oB);
  P.retractActiveFile(oA);
  await sleep(220);
  const s2 = JSON.parse(env.ss.getItem("notrat-latex-active") || "null");
  ok(s2 && s2.path === "E:/ws/b.tex", ".tex->.tex 切换后仍指向新文件（未被旧实例清掉）", env.ss.getItem("notrat-latex-active"));
  ok(!env.events.some((e) => e.detail.path === ""), "切换过程中没有误发空路径事件");

  // 切走：当前 owner 卸载后清场
  P.retractActiveFile(oB);
  await sleep(220);
  ok(env.ss.getItem("notrat-latex-active") === null, "卸载后 sessionStorage 已清空");
  const last = env.events[env.events.length - 1];
  ok(last && last.detail.path === "" && last.detail.name === "", "卸载后广播空路径（面板据此收起）", JSON.stringify(last && last.detail));

  /* ========================================================= B. 消费侧纯函数 */
  console.log("\n== B. 消费侧纯函数 ==");
  const env2 = makeEnv();
  const C = loadConsumer(env2).api;
  ok(C.isLatexPath("a.tex") && C.isLatexPath("a.BIB") && C.isLatexPath("/x/y/main.LaTeX"), "LaTeX 扩展名判定（含大小写）");
  ok(!C.isLatexPath("a.md") && !C.isLatexPath("") && !C.isLatexPath(null) && !C.isLatexPath("notex"), "非 LaTeX（md / 空 / null）判定为否");
  env2.ss.setItem("notrat-latex-active", JSON.stringify({ path: "E:/ws/a.tex", at: Date.now() }));
  ok(C.readActiveSnapshot() === "E:/ws/a.tex", "新鲜快照可直接读出");
  env2.ss.setItem("notrat-latex-active", JSON.stringify({ path: "E:/ws/a.tex", at: Date.now() - 9000 }));
  ok(C.readActiveSnapshot() === "", "过期快照（>8s）不采信");
  env2.ss.setItem("notrat-latex-active", JSON.stringify({ path: "E:/ws/notes.md", at: Date.now() }));
  ok(C.readActiveSnapshot() === "", "快照里是 .md 时不采信");

  /* ============================================================ C. hook 行为 */
  console.log("\n== C. useActiveLatexFile 行为 ==");

  // C1：没人应答（编辑器没挂载 = 当前不是 .tex）-> 250ms 后 ready 且 path 空
  const e1 = makeEnv();
  const h1 = loadConsumer(e1);
  let st = h1.react.mount(() => h1.api.useActiveLatexFile());
  ok(st && st.ready === false, "首次渲染尚未定论（ready=false）", JSON.stringify(st));
  await sleep(320);
  st = h1.react.read();
  ok(st && st.ready === true && st.path === "", "无编辑器应答 -> ready=true 且 path 为空（收起大纲）", JSON.stringify(st));
  h1.react.unmount();

  // C2：有编辑器应答（真生产者挂 ping 应答）-> 挂载即拿到路径
  const e2 = makeEnv();
  const P2 = loadProducer(e2);
  const owner2 = {};
  e2.win.addEventListener("notrat-latex-active-ping", () => P2.announceActiveFile("E:/ws/sample.tex", "sample.tex", owner2));
  const h2 = loadConsumer(e2);
  h2.react.mount(() => h2.api.useActiveLatexFile());
  // 迷你 React 与真 React 一样：effect 在首次渲染后跑，所以读 effect 之后的状态
  let st2 = h2.react.read();
  ok(st2 && st2.ready === true && st2.path === "E:/ws/sample.tex", "ping 应答 -> 挂载同一次 tick 即得到活动 .tex", JSON.stringify(st2));

  // C3：事件驱动 —— 切到另一个 .tex
  P2.announceActiveFile("E:/ws/two.tex", "two.tex", owner2);
  st2 = h2.react.read();
  ok(st2 && st2.path === "E:/ws/two.tex", "切到另一个 .tex -> 桥立即跟随", JSON.stringify(st2));

  // C4：切走（卸载 -> 延迟清场的空路径事件）
  P2.retractActiveFile(owner2);
  await sleep(220);
  st2 = h2.react.read();
  ok(st2 && st2.ready === true && st2.path === "", "卸载 .tex -> 桥收到空路径，面板收起", JSON.stringify(st2));

  // C5：快照兜底（面板比事件晚挂载）
  const e3 = makeEnv();
  e3.ss.setItem("notrat-latex-active", JSON.stringify({ path: "E:/ws/late.tex", at: Date.now() }));
  const h3 = loadConsumer(e3);
  const st3 = h3.react.mount(() => h3.api.useActiveLatexFile());
  ok(st3 && st3.ready === true && st3.path === "E:/ws/late.tex", "面板晚挂载 -> 用 sessionStorage 快照兜底", JSON.stringify(st3));
  h3.react.unmount();

  /* =================================================== D. 各面板接线（静态） */
  console.log("\n== D. 各面板接线 ==");
  const panic = [
    ["outline", outlineSrc, /if \(!showCard\) return <div ref=\{rootRef\} style=\{\{ display: "none" \}\} \/>;/],
    ["outline", outlineSrc, /load\(activePath\);/],
    ["widget", widgetSrc, /if \(act\.ready && !act\.path\) \{/],
    ["editor-header", headerSrc, /if \(!LATEX_EXT\.test\(file \|\| ""\)\) return null;/],
    ["editor-tabs", tabsSrc, /if \(!LATEX_EXT\.test\(file \|\| ""\)\) return null;/],
  ];
  panic.forEach((p) => ok(p[2].test(p[1]), p[0] + " 有非 LaTeX 收起分支"));
  [["outline", outlineSrc], ["widget", widgetSrc], ["main", mainSrc], ["editor-header", headerSrc], ["editor-tabs", tabsSrc]].forEach((p) => {
    ok(/useActiveLatexFile\(\)/.test(p[1]), p[0] + " 使用活动文件桥");
    ok(/notrat-latex-active-ping/.test(p[1]), p[0] + " 挂载时 ping 编辑器");
    ok(!/pickFile\(/.test(p[1]), p[0] + " 已不再回落 pickFile/sessionStorage 兜底");
  });
  ok(/announceActiveFile\(filePath, fileName, owner\)/.test(editorSrc), "editor.tsx 广播真实 filePath");
  ok(/retractActiveFile\(owner\)/.test(editorSrc), "editor.tsx 卸载时按归属令牌收场");
  ok(/return \(\) => \{[\s\S]{0,200}retractActiveFile\(owner\);/.test(editorSrc), "editor.tsx 卸载时收场");
  ok(mainSrc.indexOf("const act = useActiveLatexFile();") > 0, "main.tsx 跟随活动文件");

  /* ================================================ E. 部署产物（单文件包） */
  console.log("\n== E. 部署产物 ==");
  const PKG = path.join(os.homedir(), ".notrat", "plugins", "notrat-latex-plugin.json");
  ok(fs.existsSync(PKG), "单文件包存在", PKG);
  if (fs.existsSync(PKG)) {
    const pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
    const ui = {};
    (pkg.contributions.ui || []).forEach((u) => { ui[u.id] = (u.content && u.content.source) || ""; });
    const ed = ((pkg.contributions.editors || [])[0] || {}).source || "";
    ok(pkg.version === JSON.parse(fs.readFileSync(path.join(WS, "manifest.json"), "utf8")).version, "部署包版本 = 工作区 manifest 版本", pkg.version);
    ok(/announceActiveFile\(filePath, fileName, owner\)/.test(ed) && /notrat-latex-active-ping/.test(ed),
       "部署的编辑器含活动文件广播器");
    ok(!/pickFile\(/.test(ed + Object.keys(ui).map((k) => ui[k]).join("")), "部署产物已无 pickFile 兜底");
    /* v0.6.1：贡献面从 v0.5.2 起收敛为 editors + ui@outline，widget / page / editor-header /
     * editor-tabs / outline-panel 都已下线 —— 旧断言还在按「6 个面板都在部署包里」查，恒红。
     * 改成「按实际部署的挂载位查接线」：既不撒谎，也没放松对真回归的保护。 */
    const need = { "latex-outline": /useHostCardHidden/ };
    const declared = Object.keys(ui);
    declared.forEach((k) => { if (need[k]) ok(need[k].test(ui[k]), "部署的 " + k + " 已接线"); });
    ok(declared.length === 1 && declared[0] === "latex-outline",
       "部署包里只有一个 ui 挂载位：latex-outline（其余已按需下线）", declared.join(","));
    ok(/notrat-latex-active-ping/.test(ui["latex-outline"] || ""), "大纲面板挂了活动文件桥（ping 探活）");
    ok(!(pkg.contributions.ui || []).some((u) => u.location === "right-panel"), "部署包内无 right-panel 划词助手（v0.6.1 移除）");
  }

  console.log("\n" + (fail === 0 ? "\u2705 全部通过：" + pass + " 项" : "\u274c " + fail + " 项未通过（共 " + (pass + fail) + " 项）"));
  process.exitCode = fail ? 1 : 0;
})();
