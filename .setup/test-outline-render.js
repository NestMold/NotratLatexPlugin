/* v0.5.0 大纲面板「真渲染」冒烟：不是看它能不能编译，而是看它渲染出来是什么、点了有没有反应
 *
 * 做法：
 *   1. esbuild 把 panels/outline.tsx 转成 CJS（--jsx=transform ⇒ React.createElement）
 *   2. 塞一个迷你 React（useState/useEffect/useMemo/useRef/useCallback + createElement）
 *      —— 与 test-activefile.js 同一套路数，不装依赖
 *   3. 假 window / sessionStorage；electronAPI.mcp.callTool 真的去起 MCP server 拿 JSON
 *   4. 渲染到稳定，断言：树里出现章节号/图题/待办；点一行 -> 真的派发 reveal 事件
 *
 * 这一步能抓住「编译通过但一渲染就炸」和「点了没反应」这两类只有真跑才暴露的问题。
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const cp = require("child_process");

const WS = "E:/notrat-latex-plugin";
const TMP = path.join(os.tmpdir(), "latex-outline-render");
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

let pass = 0;
let fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log("  ✓ " + msg); }
  else { fail++; console.log("  ✗ " + msg + (extra !== undefined ? "  → " + extra : "")); }
}

/* ---------- 1. 转译 ---------- */
try {
  cp.execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["--no-install", "esbuild", path.join(WS, "panels/outline.tsx"),
      "--loader:.tsx=tsx", "--jsx=transform", "--format=cjs",
      "--outfile=" + path.join(TMP, "outline.cjs"), "--log-level=warning"],
    { cwd: WS, stdio: "pipe", shell: process.platform === "win32" }
  );
  ok(true, "outline.tsx 转译成 CJS 成功");
} catch (e) {
  ok(false, "outline.tsx 转译成 CJS 成功", (e.stderr && e.stderr.toString()) || e.message);
  process.exit(1);
}

/* ---------- 2. 迷你 React ---------- */
const hooks = { state: [], deps: [], refs: [], effects: [] };
let cursor = 0;
let dirty = false;

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
  useEffect: function (fn, deps) {
    const i = cursor++;
    const prev = hooks.effects[i];
    const changed = !prev || !deps || !prev.deps || deps.length !== prev.deps.length || deps.some((d, k) => d !== prev.deps[k]);
    if (changed) hooks.pending.push({ i: i, fn: fn, deps: deps });
    else hooks.pending.push({ i: i, fn: null, deps: prev.deps });
  },
  useMemo: function (fn, deps) {
    const i = cursor++;
    const prev = hooks.deps[i];
    const changed = !prev || !deps || deps.some((d, k) => d !== prev.deps[k]);
    if (changed) hooks.deps[i] = { v: fn(), deps: deps };
    return hooks.deps[i].v;
  },
  useCallback: function (fn) { cursor++; return fn; },
  useRef: function (init) {
    const i = cursor++;
    if (!(i in hooks.refs)) hooks.refs[i] = { current: init };
    return hooks.refs[i];
  },
};
hooks.pending = [];

function flatten(arr) {
  const out = [];
  arr.forEach(function (c) {
    if (c === null || c === undefined || c === false || c === true) return;
    if (Array.isArray(c)) { flatten(c).forEach((x) => out.push(x)); return; }
    out.push(c);
  });
  return out;
}

/* ---------- 3. 转译产物求值 ---------- */
const code = fs.readFileSync(path.join(TMP, "outline.cjs"), "utf8");
const mod = { exports: {} };
const reactMod = Object.assign({ default: React }, React);
new Function("require", "module", "exports", "React", code)(
  function (name) {
    if (name === "react") return reactMod;
    throw new Error("unexpected require: " + name);
  },
  mod, mod.exports, React
);
const LatexOutline = mod.exports.default || mod.exports;
ok(typeof LatexOutline === "function", "面板导出是组件函数", typeof LatexOutline);

/* ---------- 4. 假环境 + 真 MCP 数据 ---------- */
const SAMPLE = path.join(WS, "samples", "sample.tex");
function callReal(tool) {
  const reqs =
    JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } }) + "\n" +
    JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: tool, arguments: { path: SAMPLE, format: "json", workspace: WS } } }) + "\n";
  const out = cp.execFileSync("node", [path.join(WS, "server", "index.js")], { input: reqs, encoding: "utf8" });
  const line = out.trim().split("\n").map((l) => JSON.parse(l)).filter((x) => x.id === 2)[0];
  if (line.error) throw new Error(line.error.message);
  return line.result.content[0].text;
}

const events = [];
const store = {};
global.sessionStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
global.CustomEvent = function (type, opts) { return { type: type, detail: (opts || {}).detail }; };
global.window = {
  dispatchEvent: function (e) { events.push(e); return true; },
  addEventListener: function () {},
  removeEventListener: function () {},
  electronAPI: {
    mcp: {
      callTool: async function (serverId, tool) {
        return { success: true, result: { content: [{ text: callReal(tool) }] } };
      },
    },
  },
};
/* 面板挂载时会 ping 活动文件；这里直接给一份快照，等价于编辑器已应答 */
store["notrat-latex-active"] = JSON.stringify({ path: SAMPLE, name: "sample.tex", at: Date.now() });

/* ---------- 5. 渲染到稳定 ---------- */
function collectText(node, out) {
  if (node === null || node === undefined || node === false) return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (Array.isArray(node)) { node.forEach((n) => collectText(n, out)); return out; }
  if (node.__el) (node.children || []).forEach((c) => collectText(c, out));
  return out;
}
function findEls(node, out) {
  if (!node) return out;
  if (Array.isArray(node)) { node.forEach((n) => findEls(n, out)); return out; }
  if (node.__el) { out.push(node); (node.children || []).forEach((c) => findEls(c, out)); }
  return out;
}
function findRows(node, out) {
  if (!node) return out;
  if (Array.isArray(node)) { node.forEach((n) => findRows(n, out)); return out; }
  if (node.__el) {
    const p = node.props || {};
    /* 树行 = 有 onClick + cursor:pointer 的 div */
    if (p.onClick && p.style && p.style.cursor === "pointer" && node.type === "div") out.push(node);
    (node.children || []).forEach((c) => findRows(c, out));
  }
  return out;
}

let tree = null;
(async function () {
  function renderOnce() {
    cursor = 0;
    hooks.pending = [];
    const el = LatexOutline({ serverId: "latex", pluginId: "notrat-latex-plugin", ctx: {}, data: null, dataError: null, launch: {} });
    hooks.effects = hooks.pending.map((p) => ({ fn: p.fn, deps: p.deps }));
    hooks.pending.forEach((p) => { if (p.fn) p.cleanup = p.fn(); });
    return el;
  }

  for (let round = 0; round < 30; round++) {
    dirty = false;
    tree = renderOnce();
    await new Promise((r) => setTimeout(r, 5));
    if (!dirty) break;
  }

  const text = collectText(tree, []).join(" | ");
  console.log("\n  ── 渲染出的面板文本 ──");
  console.log("  " + text.slice(0, 700));
  console.log("");

  ok(!!tree, "组件函数能跑出元素树（没抛异常）");
  ok(text.indexOf("sample.tex") >= 0, "标题栏显示当前文件名");
  ok(text.indexOf("引言") >= 0 && text.indexOf("实验") >= 0 && text.indexOf("结论") >= 0, "树里有章节标题");
  ok(text.indexOf("模型整体结构") >= 0, "树里有图的题注（来自 caption）");
  ok(text.indexOf("在 CNN/DailyMail 上的主要结果") >= 0, "树里有表的题注");
  ok(text.indexOf("2.1") >= 0, "树里有小节号 2.1");
  ok(text.indexOf("图1") >= 0 && text.indexOf("表1") >= 0 && text.indexOf("式1") >= 0, "图/表/式编号都渲染了");
  ok(text.indexOf("补充近三年") >= 0, "TODO 文本进树");
  ok(text.indexOf("节 · 图1 表1 式1") >= 0, "页脚统计渲染正确");
  ok(text.indexOf("跟随光标") >= 0 && text.indexOf("图表") >= 0, "工具行（跟随光标/内容开关）渲染了");
  const inputEl = findEls(tree, []).filter(function (e) { return e.type === "input" && /\u8fc7\u6ee4/.test(String((e.props || {}).placeholder || "")); })[0];
  ok(!!inputEl, "\u8fc7\u6ee4\u6846\u6e32\u67d3\u4e86\uff08placeholder \u5e26\u201c\u8fc7\u6ee4\u201d\uff09");
  ok(inputEl && inputEl.props.onChange && inputEl.props.onKeyDown, "\u8fc7\u6ee4\u6846\u63a5\u4e86 onChange / Esc");

  const rows = findRows(tree, []);
  ok(rows.length >= 8, "找到 >= 8 个可点击的树行", rows.length);

  /* 点「模型结构」这一行：应当派发 notrat-latex-reveal-line 且 line=26 */
  const target = rows.filter(function (r) { return collectText(r, []).join(" ").indexOf("模型结构") >= 0; })[0];
  ok(!!target, "能在渲染结果里定位到「模型结构」这一行");
  if (target) {
    events.length = 0;
    target.props.onClick();
    const rev = events.filter((e) => e.type === "notrat-latex-reveal-line")[0];
    ok(!!rev, "点击该行派发了 notrat-latex-reveal-line");
    ok(rev && rev.detail && rev.detail.line === 26, "派发的行号 = 26（\\subsection 所在行）", rev && rev.detail && rev.detail.line);
    ok(rev && rev.detail && /sample\.tex$/.test(String(rev.detail.path)), "派发时带上文件路径（别的编辑器实例会无视）");
    ok(rev && rev.detail && typeof rev.detail.nonce === "string" && rev.detail.nonce.length > 2, "带 nonce（编辑器 ACK 靠它配对）");
  }

  /* 点「图1」：跳到图的 \\begin 行 27 */
  const figRow = rows.filter(function (r) { return collectText(r, []).join(" ").indexOf("模型整体结构") >= 0; })[0];
  if (figRow) {
    events.length = 0;
    figRow.props.onClick();
    const rev = events.filter((e) => e.type === "notrat-latex-reveal-line")[0];
    ok(rev && rev.detail && rev.detail.line === 27, "点「图1」跳到第 27 行（\\begin{figure}）", rev && rev.detail && rev.detail.line);
  }

  console.log("\n" + (fail === 0 ? "\u2705 全部通过：" + pass + " 项" : "\u274c " + fail + " 项未通过（共 " + (pass + fail) + " 项）"));
  process.exitCode = fail ? 1 : 0;
})();
