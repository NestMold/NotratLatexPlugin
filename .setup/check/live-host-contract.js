#!/usr/bin/env node
/* =========================================================================
 * 宿主契约在线核对 —— 直接读**装机版** app.asar，不看任何旧快照。
 *
 * 为什么要有这个脚本：
 *   0.5.2 → 0.5.3 之间翻过一次车。我们当时用 `.setup/host/` 里的 renderer 快照
 *   断定「宿主尚未实现 outlineTool」，并据此把 `outlineTool` 当成无害声明发了出去。
 *   结果 Notrat 在 18:05 自动更新到 1.3.3，**新 renderer 开始真的渲染 latex_outline**，
 *   而我们返回的是 MCP 常规的 {content:[{type:"text",text:"多行"}]} →
 *   宿主 parseItems 走「对象分支」，把 content 当条目数组 → 整棵树只剩 1 条 →
 *   配合 <span class="truncate"> 换行被折成空格 → 左侧大纲显示成**一行**。
 *
 * 本脚本做三件事：
 *   ① 版本/快照新鲜度：app.asar 比快照新 → 直接判 STALE（上次就是死在这里）
 *   ② 契约在位性：parseItems / outlineTool / notrat-outline-navigate /
 *      ui 注册保留 extensions —— 逐条断言，缺失即失败
 *   ③ 端到端：把**我们自己**的 latex_outline 输出喂给**从线上包抠出来的真 parseItems**，
 *      断言条目数 > 1 且条目 text 不含换行
 *
 * 用法: node .setup/check/live-host-contract.js [asar路径]
 * 退出码: 0 全绿 / 1 有问题
 * ========================================================================= */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ASAR = process.argv[2] || "D:/Notrat/resources/app.asar";
const HERE = __dirname;                       // .setup/check
const SETUP = path.join(HERE, "..");          // .setup
const WS = path.join(SETUP, "..");            // 仓库根
const SNAP = path.join(SETUP, "live");        // 快照目录
const ASAR_JS = path.join(SETUP, "asar.js");
const TEX = path.join(WS, "samples", "test.tex");
const SERVER = fs.existsSync(path.join(require("os").homedir(), ".notrat/tools/latex-server.js"))
  ? path.join(require("os").homedir(), ".notrat/tools/latex-server.js")
  : path.join(WS, "server", "index.js");

let fail = 0;
const ok = (m) => console.log("  ✓ " + m);
const bad = (m) => { fail++; console.log("  ✗ " + m); };
const warn = (m) => console.log("  ! " + m);
const asar = (...a) => execFileSync(process.execPath, [ASAR_JS, ...a], { encoding: "utf8", maxBuffer: 1 << 28 });

console.log("宿主契约在线核对\n  asar = " + ASAR + "\n  被测 server = " + SERVER + "\n");

/* ---------- ① 版本 + 新鲜度 ---------- */
if (!fs.existsSync(ASAR)) { bad("找不到 app.asar: " + ASAR); process.exit(1); }
const pkg = JSON.parse(asar("cat", ASAR, "package.json").slice(asar("cat", ASAR, "package.json").indexOf("{")));
const asarMtime = fs.statSync(ASAR).mtime;
console.log("① 版本与新鲜度");
ok(`Notrat ${pkg.version}（asar mtime ${asarMtime.toISOString()}）`);

const indexHtml = asar("cat", ASAR, "dist/index.html");
const m = indexHtml.match(/src="\.?\/?(assets\/[^"]+\.js)"/);
if (!m) { bad("dist/index.html 里找不到 renderer bundle"); process.exit(1); }
const bundleRel = "dist/" + m[1];
const bundleName = path.basename(bundleRel);

fs.mkdirSync(SNAP, { recursive: true });
const snapPath = path.join(SNAP, bundleName);
const snapInfo = path.join(SNAP, "snapshot.json");
let needExtract = true;
if (fs.existsSync(snapPath) && fs.existsSync(snapInfo)) {
  const rec = JSON.parse(fs.readFileSync(snapInfo, "utf8"));
  if (rec.bundleRel === bundleRel && rec.asarMtime === asarMtime.toISOString()) needExtract = false;
}
if (needExtract) {
  warn("快照与装机版不一致 → 正在从 asar 重新抠出 " + bundleRel);
  execFileSync(process.execPath, [ASAR_JS, "save", ASAR, bundleRel, snapPath], { stdio: "ignore" });
  fs.writeFileSync(snapInfo, JSON.stringify({ bundleRel, bundleName, asarMtime: asarMtime.toISOString(), version: pkg.version }, null, 2));
  ok("快照已刷新 → " + path.relative(WS, snapPath));
} else {
  ok("快照新鲜（与装机版同一份）");
}
const src = fs.readFileSync(snapPath, "utf8");

/* ---------- ② 契约在位性 ---------- */
console.log("\n② 契约在位性（在真 renderer 里逐条找）");
const contracts = [
  ["parseItems（宿主解析插件返回的条目）", "function parseItems(it){"],
  ["editors[].outlineTool（宿主读该字段）", "outlineTool:typeof Bn.outlineTool"],
  ["PluginOutlineItems（宿主渲染大纲条目）", "function PluginOutlineItems("],
  ["notrat-outline-navigate（点击回抛事件）", "notrat-outline-navigate"],
  ["ui 注册保留 extensions", "extensions:Array.isArray(Bn.extensions)"],
  /* v0.6.2 补：下面两条是我们返回形态的直接前提 —— 宿主一改，大纲就可能被打回「全平 + 跳第 1 行」 */
  ["extractToolText（新版把 result 拍平的那一步，level/anchor 就丢在这里）", "function extractToolText(it){"],
  ["点击回抛的 anchor 会退化成标题文本（anchor ?? text）", ".anchor??"],
];
for (const [label, needle] of contracts) {
  src.includes(needle) ? ok(label) : bad("缺失：" + label + "   （旧宿主是正常的，新宿主缺了就是真回归）");
}
if (fail) { console.log("\n结果：✗ " + fail + " 项契约缺失，先别改插件，先对齐宿主版本。"); process.exit(1); }

/* ---------- ③ 端到端：我们的输出 × 线上解析器 ---------- */
console.log("\n③ 端到端：我们的 latex_outline × 线上真 parseItems");
/* v0.6.2：不能再只 eval parseItems —— 新版 parseItems 内部会调 extractToolText，
 * 单独抠出来必然 ReferenceError（本脚本此前就一直是这句红的，红着没人管）。
 * 改用 host-parse-gen.js 从同一份快照生成的完整解析链，并把「生成」绑到本脚本的刷新动作上。 */
require("child_process").execFileSync(process.execPath, [path.join(__dirname, "host-parse-gen.js"), snapPath], { stdio: "ignore" });
const { parseItems } = require("./host-parse-items.js");

function callTool(tool, args) {
  return new Promise((resolve, reject) => {
    const p = require("child_process").spawn(process.execPath, [SERVER], { stdio: ["pipe", "pipe", "pipe"] });
    let buf = "", settled = false;
    const send = (o) => p.stdin.write(JSON.stringify(o) + "\n");
    p.stdout.on("data", (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === 1) {
          send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
          send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: tool, arguments: args } });
        } else if (msg.id === 2) { settled = true; p.kill(); resolve(msg); }
      }
    });
    p.on("error", reject);
    const tmr = setTimeout(() => { if (!settled) { p.kill(); reject(new Error("调工具超时")); } }, 30000);
    p.on("exit", () => clearTimeout(tmr));
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "contract-check", version: "1" } } });
  });
}

(async () => {
  if (!fs.existsSync(TEX)) { warn("样例不存在，跳过：" + TEX); return finish(); }
  const rpc = await callTool("latex_outline", { fileName: path.basename(TEX), filePath: TEX });
  const items = parseItems(rpc && rpc.result);
  items.length > 1 ? ok(`解析出 ${items.length} 条 → 树不会塌成一行`) : bad(`只解析出 ${items.length} 条 → 会塌成一行（返回形态不再是宿主认的形状）`);
  const nl = items.filter((x) => /[\n\r]/.test(String(x.text)));
  nl.length === 0 ? ok("没有条目 text 带换行（不会被 truncate 折成空格）") : bad(`${nl.length} 条 text 里带换行 → 视觉上会挤成一行`);
  /* v0.6.2 新增：level 与 anchor 也必须过得去 —— 只查「条数够不够」是拦不住
   * 「层级全平 + 点击跳第 1 行」的（那正是本次事故：条目数一直是 5，看着全绿）。 */
  const anchors = items.map((x) => x.anchor);
  anchors.every((a) => a != null && /^d+$/.test(String(a)))
    ? ok("每条都带回数字 anchor（" + anchors.join(",") + "）→ 点击能落到正确行")
    : bad("anchor 缺失或非数字 → 宿主回抛标题文本、编辑器会跳第 1 行：" + JSON.stringify(anchors));
  items.some((x) => x.level > 1)
    ? ok("层级保住了（levels=" + items.map((x) => x.level).join(",") + "）")
    : bad("level 全为 1 → 大纲缩进全平（返回形态被拍平了）");
  finish();
})().catch((e) => { bad("端到端失败：" + e.message); finish(); });

function finish() {
  console.log("\n结果：" + (fail ? "✗ " + fail + " 项有问题" : "✓ 全绿"));
  process.exit(fail ? 1 : 0);
}
