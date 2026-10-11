"use strict";
/* =====================================================================
 * v0.9.14 验收门 —— 发行 zip 里的 panels/*.tsx 必须是**构建产物**
 *
 * 用户报的那句话（安装形态限定为目录型 / zip）：
 *     ReferenceError: TX is not defined
 *         at wysHistFor (eval at pluginEditorBridge.tsx:127:27, <anonymous>:42:5)
 *         ...
 *         at commitHookEffectListMount      ← 挂载 effect 里第一次碰历史就炸
 *     装单文件包（npm run build 的 JSON）没事，装 zip 必崩。
 *
 * 机制（三条合起来才成立）：
 *   ① 面板源不是成品：文件头三行是占位注释 __LPC__ / __WYS__ / __TX__，
 *      打包时要把三块内核（preview-core / wysiwyg / txlog）**内联进去**；
 *   ② 宿主对面板源码是「读到什么编译什么」：编译期不查自由变量
 *      （宿主只用 TypeScript 抹语法，esbuild 同样不报），
 *      运行到 `new TX.History(...)` 那一句才 ReferenceError；
 *      且异常会被各处 try/catch 咽掉 —— 表现成「撤销失灵」，最难查的一类；
 *   ③ 内联这一步一直只服务于**单文件包**（build-singlefile.js），
 *      发行 zip 只把内联结果写进了 manifest，从没管过 zip 里的 panels/*.tsx。
 *      而宿主对目录包的契约恰恰是「缺 source 时按 sourceFile 去目录里读真实文件」——
 *      读到的就是那几个带占位符的文件。0.9.6 → 0.9.13 逐版核对，目录型这条路一直是坏的。
 *
 * 这一层钉六个面：
 *   [A] 复现：拿仓库里那份**原始**面板（带占位符），按宿主同款方式编译 + 真求值
 *       → 必须报出与用户同字的「TX is not defined」（证明这条通路真的会崩、
 *         也证明本层看得见它；断言恒真是门禁最大的敌人）
 *   [B] 修法：同一份面板经 .setup/lib/panel-inline.js 内联 → 同样真求值
 *       → TX / WYS / LPC 都是真对象，`new TX.History(...)` 与面板自己的
 *         wysHistFor() 都能跑起来；LPC.renderInlineHtml 也在（zip 形态曾漏过它）
 *   [C] 不漂移：两种包形态（单文件 JSON / 发行 zip）的内核必须与唯一实现**逐字节**一致
 *       —— 「同一份规则抄三份」就是这次事故的根因，内核漂了要当场红
 *   [D] 发行包对账：真把 zip 解开读字节 —— 每份 panels/*.tsx 都不许带占位符，
 *       且与 manifest 里那份逐字节一致；包不在就改判 skip（硬跑出来的绿是假绿）
 *   [E] 宿主契约：从**装机版** app.asar 确认宿主编译的是 manifest 里的 source 字符串
 *       （若哪天改成按路径读文件 —— 就是用户那条栈里 pluginEditorBridge 的形状 ——
 *        这条会红，提醒回来重读契约；那时包内 panels/*.tsx 就是唯一供给）
 *   [F] 反向自检：把内联结果里的 TX 抹掉，[B] 必须重新变红（否则 [B] 是恒真）
 *
 * 运行： node .setup/check/v0914-panel-inline.js
 * =================================================================== */
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const cp = require("child_process");

const ws = "E:/notrat-latex-plugin";
const LIB = path.join(ws, ".setup", "lib", "panel-inline.js");
const pack = require(LIB);

let pass = 0, fail = 0, skip = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok    " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "\n        → " + String(extra).slice(0, 700) : "")); }
}
function SKIP(name, why) { skip++; console.log("  skip  " + name + "（" + why + "）"); }

/* ---------- 宿主同款编译：TypeScript 抹语法（这里是 esbuild 等价物）----------
 * 装机版宿主做的事：window.electronAPI.component.compile({componentId, source})
 *   → 主进程用 TypeScript 编译 → renderer 里
 *     new Function("require", "exports", "module", "React", code)(shim, exports, module, React)
 * 关键点：**只抹语法、不查自由变量**。所以这里用 esbuild 转 CJS 足够还原那条通路
 * （loader tsx + jsx transform + 保留 require("react")）。 */
function compilePanel(src, tag) {
  const esbuildPath = path.join(ws, "node_modules", "esbuild");
  let esbuild;
  try { esbuild = require(esbuildPath); }
  catch (e) {
    throw new Error("找不到工作区本地 esbuild：" + path.join(esbuildPath, "（先 npm install）") + " ← " + e.message.split("\n")[0]);
  }
  const r = esbuild.buildSync({
    stdin: { contents: src, loader: "tsx", resolveDir: ws, sourcefile: tag },
    format: "cjs",
    bundle: false,
    write: false,
    logLevel: "silent",
  });
  if (r.errors && r.errors.length) throw new Error("编译失败：" + r.errors.map(function (e) { return e.text; }).join("; "));
  return r.outputFiles[0].text;
}

/* 迷你 React：面板只从 react 拿这几位；模块顶层不调 hook，够用 */
function reactStub() {
  const noop = function () {};
  const pair = function (v) { return [typeof v === "function" ? v() : v, noop]; };
  const R = {
    createElement: function (t) { return { type: t }; },
    useState: pair, useReducer: pair,
    useRef: function (v) { return { current: v === undefined ? null : v }; },
    useEffect: noop, useLayoutEffect: noop,
    useMemo: function (f) { return typeof f === "function" ? f() : f; },
    useCallback: function (f) { return f; },
    Fragment: "Fragment", memo: function (f) { return f; },
  };
  R.default = R;
  return R;
}

/* 真求值：把编译产物丢进 vm，读回探针 */
const PROBE = [
  "",
  "/* ---- v0914 探针（只存在于验收层编译的那一份里；发行包没有这段） ---- */",
  "globalThis.__probe = {",
  "  TX: typeof TX, WYS: typeof WYS, LPC: typeof LPC,",
  "  lpcInlineHtml: (typeof LPC === \"object\" && LPC) ? typeof LPC.renderInlineHtml : \"(LPC 不是对象)\",",
  "  wysHistFor: typeof wysHistFor",
  "};",
  "try { var __h = new TX.History({ base: \"\", limit: 5 }); globalThis.__probe.historyOK = !!(__h && typeof __h.state === \"function\"); }",
  "catch (e) { globalThis.__probe.historyErr = String(e && e.message); }",
  "try { var __wh = wysHistFor(\"probe.tex\", \"\"); globalThis.__probe.wysHistOK = !!__wh; }",
  "catch (e) { globalThis.__probe.wysHistErr = String(e && e.message); }",
  "",
].join("\n");

function probePanel(src, tag) {
  const code = compilePanel(src + PROBE, tag);
  const sandbox = {
    console: console,
    require: function (id) { return id === "react" ? reactStub() : {}; },
    module: { exports: {} },
    exports: {},
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: setInterval, clearInterval: clearInterval,
    queueMicrotask: queueMicrotask,
    URL: URL, TextEncoder: TextEncoder, TextDecoder: TextDecoder,
  };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  let threw = null;
  try { vm.runInContext(code, ctx, { filename: tag }); }
  catch (e) { threw = String((e && e.message) || e); }
  return { probe: ctx.__probe || {}, threw: threw };
}

const KERNELS = pack.buildKernels(ws);
const RAW = fs.readFileSync(path.join(ws, "panels", "editor.tsx"), "utf8");

/* ---------- 发行 zip 的取用规则 ----------
 * 打包是单独一步（打完才谈得上「包内对账」），所以：
 *   · 包不存在                      → skip
 *   · 包比修复本身还老（早于 lib / 打包脚本） → skip，并写明重打包命令
 *     —— 「修复前打的包」判红是无意义的红（它本来就没带修法），但**必须说出来**；
 *        判绿的假绿更糟，所以这条判断只看 mtime，不看「包干净不干净」。
 *   · NOTRAT_ZIP=<路径> 显式指定    → 一律真判（拿旧包验红用这个，例如
 *     NOTRAT_ZIP=notrat-latex-plugin-0.9.13.zip node .setup/check/v0914-panel-inline.js）
 * 判红的判据仍然是包里的字节：一份 panels/*.tsx 带占位符就算红。 */
function resolveZip() {
  const version = JSON.parse(fs.readFileSync(path.join(ws, "manifest.json"), "utf8")).version;
  const explicit = process.env.NOTRAT_ZIP;
  const file = explicit ? path.resolve(ws, explicit) : path.join(ws, "notrat-latex-plugin-" + version + ".zip");
  if (!fs.existsSync(file)) return { file: file, missing: explicit ? "指定的 zip 不存在" : "还没有与 manifest 同版本的 zip" };
  if (explicit) return { file: file, buf: fs.readFileSync(file) };
  const refs = [path.join(ws, ".setup", "lib", "panel-inline.js"), path.join(ws, ".setup", "_release-v0913.js")];
  const newest = Math.max.apply(null, refs.map(function (f) { return fs.existsSync(f) ? fs.statSync(f).mtimeMs : 0; }));
  const zipM = fs.statSync(file).mtimeMs;
  if (zipM < newest) {
    return { file: file, stale: true, missing: "包早于本次修复（" + path.basename(file) + " mtime " +
      new Date(zipM).toISOString().slice(0, 16) + " < 打包脚本 " + new Date(newest).toISOString().slice(0, 16) +
      "）→ 重打包是单独一步：node .setup/release-zip.js --zip-only" };
  }
  return { file: file, buf: fs.readFileSync(file) };
}

/* ============================ [A] 复现 ============================ */
console.log("\n[A] 复现：带占位符的面板（原始构建输入）真跑起来");
{
  ok("原始面板带三个占位符（前提：它确实是构建输入，不是产物）",
    pack.tokensIn(RAW).length === 3, "实际 " + JSON.stringify(pack.tokensIn(RAW)));
  let r = null;
  try { r = probePanel(RAW, "panels__editor__raw.tsx"); }
  catch (e) { ok("原始面板能编译（宿主也只抹语法，不查自由变量）", false, e.message); }
  if (r) {
    ok("原始面板：TX / WYS / LPC 三个自由变量都未定义",
      r.probe.TX === "undefined" && r.probe.WYS === "undefined" && r.probe.LPC === "undefined",
      JSON.stringify(r.probe));
    ok("★ 原始面板真跑必然炸出用户那条报错：「TX is not defined」（与栈里 wysHistFor 同一条）",
      r.probe.wysHistErr === "TX is not defined" || r.probe.historyErr === "TX is not defined",
      "historyErr=" + r.probe.historyErr + " | wysHistErr=" + r.probe.wysHistErr + " | 模块求值抛错=" + r.threw);
  }
}

/* ============================ [B] 修法 ============================ */
console.log("\n[B] 修法：内联后的面板（构建产物）真跑起来");
let INLINED = null;
{
  INLINED = pack.inlinePanel(RAW, KERNELS, { label: "panels/editor.tsx", required: pack.NAMES }).text;
  ok("内联后不再含任何占位符", pack.tokensIn(INLINED).length === 0);
  ok("内联后 LPC / WYS / TX 三个顶层定义都在", pack.hasKernelDefs(INLINED).ok);
  const r = probePanel(INLINED, "panels__editor__inlined.tsx");
  if (r.threw) ok("内联后的面板能求值（模块顶层不炸）", false, r.threw);
  else ok("内联后的面板能求值（模块顶层不炸）", true);
  ok("★ 内联后 TX / WYS / LPC 都是真对象（不再是自由变量）",
    r.probe.TX === "object" && r.probe.WYS === "object" && r.probe.LPC === "object",
    JSON.stringify(r.probe));
  ok("★ 用户崩的那一句现在跑得通：new TX.History({base, limit})",
    r.probe.historyOK === true, "historyErr=" + r.probe.historyErr);
  ok("★ 栈里那个函数 wysHistFor() 现在跑得通（它就是挂载 effect 里第一个碰历史的）",
    r.probe.wysHistOK === true, "wysHistErr=" + r.probe.wysHistErr);
  ok("★ LPC.renderInlineHtml 是函数（zip 形态曾漏掉它 → 行内 HTML 渲染静默失效）",
    r.probe.lpcInlineHtml === "function", "实际 " + r.probe.lpcInlineHtml);
}

/* ================= [C] 两种包形态的内核不许漂 ================= */
console.log("\n[C] 内核唯一：单文件包 / 发行 zip 与 lib 逐字节同源");
{
  const singleJson = path.join(os.homedir(), ".notrat", "plugins", "notrat-latex-plugin.json");
  if (!fs.existsSync(singleJson)) SKIP("单文件包形态的内核对账", "本机没有装机 JSON（npm run build 的产物）");
  else {
    const pkg = JSON.parse(fs.readFileSync(singleJson, "utf8"));
    const src = String((((pkg.contributions || {}).editors || [{}])[0] || {}).source || "");
    if (!src) SKIP("单文件包形态的内核对账", "装机 JSON 里没有 editors[0].source");
    else {
      const names = pack.NAMES.filter(function (n) { return src.indexOf(KERNELS[n]) >= 0; });
      ok("装机单文件包（v" + pkg.version + "）的内核与 lib 逐字节一致：" + names.join("/"),
        names.length === 3, "命中 " + names.length + "/3 —— 内核漂了：同一份规则又被人抄了一份");
    }
  }

  const z = resolveZip();
  if (!z.buf) SKIP("发行 zip 的内核对账", z.missing);
  else {
    const buf = z.buf;
    const mf = JSON.parse(pack.readZipEntry(buf, "manifest.json").toString("utf8"));
    const src = String((((mf.contributions || {}).editors || [{}])[0] || {}).source || "");
    const names = pack.NAMES.filter(function (n) { return src.indexOf(KERNELS[n]) >= 0; });
    ok("发行 zip（v" + mf.version + "）manifest 里的内核与 lib 逐字节一致：" + names.join("/"),
      names.length === 3, "命中 " + names.length + "/3 —— zip 形态的内核与单文件包不一样了");
  }
}

/* ================= [D] 发行包对账（真读字节） ================= */
console.log("\n[D] 发行包对账：包里的 panels/*.tsx 是产物吗");
{
  const z = resolveZip();
  if (!z.buf) {
    SKIP("包内面板对账", z.missing);
  } else {
    const buf = z.buf;
    console.log("  包  " + z.file);
    const entries = pack.zipEntries(buf);
    const panels = entries.map(function (e) { return e.name; })
      .filter(function (n) { return /^panels\/.*\.(tsx|ts)$/.test(n); });
    const dirty = [], kernels = [], mismatch = [];
    for (const nm of panels) {
      const text = pack.readZipEntry(buf, nm).toString("utf8");
      const t = pack.tokensIn(text);
      if (t.length) dirty.push(nm + "→" + t.join("/"));
      if (pack.hasKernelDefs(text).ok) kernels.push(nm);
    }
    const mf = JSON.parse(pack.readZipEntry(buf, "manifest.json").toString("utf8"));
    const refs = [];
    for (const e of (mf.contributions || {}).editors || []) if (e.sourceFile) refs.push(e.sourceFile);
    for (const u of (mf.contributions || {}).ui || []) {
      const c = u.content || {};
      if (c.sourceFile) refs.push(c.sourceFile);
    }
    for (const e of (mf.contributions || {}).editors || []) {
      if (!e.source) continue;
      const expected = e.source;
      const file = panels.filter(function (n) { return n === (e.sourceFile || "panels/editor.tsx"); })[0];
      if (file && pack.readZipEntry(buf, file).toString("utf8") !== expected) mismatch.push(file);
    }
    if (dirty.length) {
      ok("★ 包内 " + panels.length + " 份 panels/*.tsx 全不带占位符", false,
        dirty.join(" | ") + "\n        （带占位符 = 构建输入混进发行包：宿主读到什么编译什么）");
    } else {
      ok("★ 包内 " + panels.length + " 份 panels/*.tsx 全不带占位符", true);
    }
    ok("包内编辑器 / 大纲两份的面板 = manifest 里那份（逐字节）", mismatch.length === 0, mismatch.join(" | "));
    ok("包内带上三块内核的面板：" + (kernels.join(", ") || "（无）"), kernels.indexOf("panels/editor.tsx") >= 0,
      "panels/editor.tsx 必须自带 LPC/WYS/TX（它是编辑器贡献面的源码；没有 = 内联没写进包）");
    ok("manifest 里没有残留 sourceFile 依赖（目录包的两条通路都干净）",
      refs.length === 0, "还有 " + refs.join(", "));
  }
}

/* ============ [E] 宿主契约（装机版；不在就 skip） ============ */
console.log("\n[E] 宿主契约：宿主编译的是 manifest 里的 source 字符串");
{
  const ASAR = process.env.NOTRAT_ASAR || "D:/Notrat/resources/app.asar";
  const ASAR_JS = path.join(ws, ".setup", "asar.js");
  if (!fs.existsSync(ASAR) || !fs.existsSync(ASAR_JS)) {
    SKIP("宿主契约核对", "找不到装机版 app.asar（" + ASAR + "）");
  } else {
    try {
      const idx = cp.execFileSync(process.execPath, [ASAR_JS, "cat", ASAR, "dist/index.html"], { encoding: "utf8", maxBuffer: 1 << 26 });
      const mm = idx.match(/src="\.?\/?(assets\/[^"]+\.js)"/);
      if (!mm) { SKIP("宿主契约核对", "dist/index.html 里找不到 renderer bundle"); }
      else {
        const bundle = cp.execFileSync(process.execPath, [ASAR_JS, "cat", ASAR, "dist/" + mm[1]], { encoding: "utf8", maxBuffer: 1 << 28 });
        ok("宿主编译插件编辑器时喂的是**源码字符串**：component.compile({componentId:\"plugin-editor/…\", source})",
          bundle.indexOf("component.compile(") >= 0 && bundle.indexOf("plugin-editor/") >= 0,
          "没找到 —— 宿主可能改成按路径读面板文件了（正是用户那条栈里 pluginEditorBridge 的形状）；" +
          "那时包内 panels/*.tsx 就是唯一供给，[D] 的断言必须继续成立");
        ok("宿主对「面板缺 source」的兜底话术仍在（说明目录包/单文件包两种形态的分野没变）",
          bundle.indexOf("缺少 source") >= 0,
          "没找到「缺少 source…」这句 —— 宿主取源码的方式可能变了，回来重读契约");
      }
    } catch (e) {
      SKIP("宿主契约核对", "读 asar 失败：" + String(e.message || e).slice(0, 200));
    }
  }
}

/* ================= [F] 反向自检 ================= */
console.log("\n[F] 反向自检：把内联拿掉，[B] 必须重新变红");
{
  const noTx = INLINED.split(KERNELS.TX).join("");
  ok("抹掉 TX 内核后，源码里确实不再有 TX 定义", !pack.DEFS.TX.test(noTx));
  const r1 = probePanel(noTx, "panels__editor__noTX.tsx");
  ok("★ 抹掉 TX → 真跑必报「TX is not defined」（证明 [B] 不是恒真）",
    r1.probe.TX === "undefined" && (r1.probe.historyErr === "TX is not defined" || r1.probe.wysHistErr === "TX is not defined"),
    JSON.stringify(r1.probe) + " | threw=" + r1.threw);

  const noLpc = INLINED.split(KERNELS.LPC).join("");
  const r2 = probePanel(noLpc, "panels__editor__noLPC.tsx");
  ok("★ 抹掉 LPC → 预览半边（renderInlineHtml / renderPreview）跟着没了",
    r2.probe.LPC === "undefined" && r2.probe.lpcInlineHtml === "(LPC 不是对象)",
    JSON.stringify(r2.probe));

  const noWys = INLINED.split(KERNELS.WYS).join("");
  const r3 = probePanel(noWys, "panels__editor__noWYS.tsx");
  ok("★ 抹掉 WYS → 就地编辑半边没了", r3.probe.WYS === "undefined", JSON.stringify(r3.probe));
}

console.log("\n" + (fail ? "✗" : "✓") + " 通过 " + pass + " / 失败 " + fail + (skip ? " / 跳过 " + skip : ""));
if (fail) process.exit(1);
