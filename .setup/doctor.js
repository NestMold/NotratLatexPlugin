/* 换机器 / 首次安装后的体检（v0.9.9）
 * 用法：node .setup/doctor.js
 *
 * 为什么需要它：宿主对「插件 MCP server 起不来」这件事是**静默**的 —— 启动失败只
 * console.warn，插件面板那次探测又被 try/catch 吞掉。用户能看到的只有一个没头没脑的
 * 「Unknown tool: xxx」，或者干脆什么都不弹。这个脚本把那些「看不到的中间环节」
 * 一条条摆出来，直接告诉你卡在哪一环。
 *
 * 它只读不写（除了一次性启动 server 做 tools/list 探测）。不改任何配置。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const PLUGIN_ID = "notrat-latex-plugin";
const SERVER_SID = "plugin-" + PLUGIN_ID + "-latex"; // 宿主给插件 server 的 id 形态
const HOME = os.homedir();
const PLUGINS = path.join(HOME, ".notrat", "plugins");
const TOOLS = path.join(HOME, ".notrat", "tools");
const MCP_CFG = path.join(HOME, ".notrat", ".mcp", "config.json");
/* 宿主记的活体进程表（app 每次启停都会改写它） */
function roaming(rel) {
  const cands = [
    path.join(process.env.APPDATA || "", "notrat", rel),
    path.join(HOME, "AppData", "Roaming", "notrat", rel),
    path.join(HOME, "Library", "Application Support", "notrat", rel),
    path.join(HOME, ".config", "notrat", rel),
  ];
  for (const c of cands) if (c && fs.existsSync(c)) return c;
  return cands[0] || "";
}

let FAIL = 0, WARN = 0;
const ok = (s) => console.log("  \u2713 " + s);
const bad = (s) => { FAIL++; console.log("  \u2717 " + s); };
const warn = (s) => { WARN++; console.log("  ! " + s); };
const info = (s) => console.log("    " + s);

/* 面板会真正调到的工具（与 panels/editor.tsx 的 callTool 调用点对应） */
const PANEL_CALLS = [
  "latex_env", "latex_outline", "latex_status", "latex_asset", "latex_compile",
  "latex_validate", "latex_export", "latex_backup", "latex_history",
  "latex_engine_install", "latex_engine_install_status",
];

/* ---------- 1. 前提 ---------- */
console.log("\n[1] 运行前提");
const major = Number(process.versions.node.split(".")[0]);
if (major >= 18) ok("Node.js " + process.versions.node + "（插件 server 靠它跑）");
else bad("Node.js " + process.versions.node + " 太老 —— 低于 18 插件 server 起不来（manifest 的 command 就是 node）");

/* ---------- 2. 插件落点：单文件包 / 目录包，以及双形态冲突 ---------- */
console.log("\n[2] 插件落点");
const singleJson = path.join(PLUGINS, PLUGIN_ID + ".json");
const packDir = path.join(PLUGINS, PLUGIN_ID);
const hasJson = fs.existsSync(singleJson);
const hasDir = fs.existsSync(packDir);

if (hasDir && fs.existsSync(path.join(packDir, "manifest.json"))) ok("目录包：" + packDir);
else if (hasDir) warn("有 " + packDir + " 但没有 manifest.json —— 宿主会跳过它（[PluginDir] 跳过无 manifest 的目录）");
else info("无目录包 " + packDir);

if (hasJson) ok("单文件包：" + singleJson);
else info("无单文件包 " + singleJson);

if (hasJson && hasDir && fs.existsSync(path.join(packDir, "manifest.json"))) {
  bad("两种形态同时存在 —— 同一个 id 会互相顶替（README 明令禁止）。留一个，删另一个。");
}
if (!hasJson && !hasDir) bad("两种形态都没有 —— 插件没装上");

/* ---------- 3. manifest 与 server 路径 ---------- */
console.log("\n[3] manifest 的 server 路径");
let manifest = null, manifestFrom = "";
for (const p of [hasDir ? path.join(packDir, "manifest.json") : "", singleJson]) {
  if (p && fs.existsSync(p)) {
    try { manifest = JSON.parse(fs.readFileSync(p, "utf8")); manifestFrom = p; break; } catch (e) {}
  }
}
if (!manifest) bad("读不到可解析的 manifest");
else {
  ok("manifest：" + manifestFrom + "（版本 " + manifest.version + "）");
  const srv = (manifest.mcpServers || []).find((s) => s.id === "latex") || (manifest.mcpServers || [])[0];
  if (!Array.isArray(manifest.mcpServers)) bad("mcpServers 不是数组形态 —— 宿主 enable() 会抛 object is not iterable（0.2.3 事故）");
  if (!srv) bad("manifest 里没有 mcpServers[].id === \"latex\"");
  else {
    const arg = String((srv.args || [])[0] || "");
    info("args[0] = " + JSON.stringify(arg));
    if (!arg.includes("${pluginDir}")) {
      if (/^[A-Za-z]:[\\/]|\/Users\/|\/home\//.test(arg)) {
        bad("args[0] 是绝对路径（" + arg + "）—— 这是 v0.9.8 修掉的那类事故：换台机器就 Cannot find module，且宿主静默");
      } else warn("args[0] 既不是 ${pluginDir} 也不是明显的绝对路径，人工看一眼");
    } else ok("args[0] 用 ${pluginDir}（宿主运行时解析成本机路径）");

    /* 宿主解析后的真实落点：<插件目录>/<插件 id>/server/index.js */
    const resolved = arg.replace("${pluginDir}", packDir).replace(/^"|"$/g, "");
    if (fs.existsSync(resolved)) {
      ok("宿主会拉起的 server 真实存在：" + resolved);
      info("大小 " + (fs.statSync(resolved).size / 1024).toFixed(1) + "KB，改动于 " + fs.statSync(resolved).mtime.toLocaleString());
      /* 目录包路径下没有就说明只有单文件包形态 */
      global.__SERVER__ = resolved;
    } else {
      bad("宿主会拉起的 server **不存在**：" + resolved + "\n      —— 这就是「插件 UI 能显示、所有走 MCP 的能力全废」的根因。\n      —— 单文件包必须配套 <插件目录>/<id>/server/ 目录；只拷 .json 过来必然踩这个坑。");
    }
  }
}

/* ---------- 3.5 面板源码能不能编译（v0.9.14）----------
 * 为什么查这个：宿主对面板源码是「读到什么编译什么」，而编译期**不查自由变量**
 *   （宿主只用 TypeScript 抹语法）。所以一份带占位符的面板（文件头那三行
 *   __LPC__ / __WYS__ / __TX__ 没被内联成内核）装上后一切正常，
 *   直到打开 .tex —— 挂载 effect 里第一次碰历史，直接
 *   `ReferenceError: TX is not defined`，整个编辑器白屏；
 *   同类问题还有 LPC.renderInlineHtml 缺席时「行内 HTML 渲染静默失效」。
 * 这里只看三件事，纯正则、零依赖：占位符有没有清干净、三块内核有没有定义、
 * 以及目录包形态下面板文件本身是不是产物。 */
console.log("\n[3.5] 面板源码能不能编译（占位符 / 内核定义）");
if (manifest) {
  const TOK = { LPC: "/*" + "__LPC__" + "*/", WYS: "/*" + "__WYS__" + "*/", TX: "/*" + "__TX__" + "*/" };
  const DEF = {
    LPC: /^const LPC = \{ renderPreview/m,
    WYS: /^const WYS = \(function \(\) \{/m,
    TX: /^const TX = \(function \(\) \{/m,
  };
  const editors = (manifest.contributions || {}).editors || [];
  const panelText = (e) => {
    /* 单文件包：源码在 manifest 里（source）；目录包：可能在目录里的真实文件（sourceFile） */
    if (typeof e.source === "string" && e.source) return { text: e.source, from: "manifest.editors[].source" };
    if (typeof e.sourceFile === "string" && e.sourceFile && hasDir) {
      const f = path.join(packDir, String(e.sourceFile).replace(/^[./\\]+/, ""));
      if (fs.existsSync(f)) return { text: fs.readFileSync(f, "utf8"), from: e.sourceFile };
    }
    return null;
  };
  if (!editors.length) warn("manifest 里没有 editors[]（这份包没有编辑器贡献面）");
  editors.forEach((e) => {
    const got = panelText(e);
    if (!got) {
      bad("编辑器「" + (e.label || e.id) + "」拿不到面板源码（manifest 既没有 source，目录里也没有 sourceFile 指向的文件）\n" +
          "      —— 宿主的原话是「缺少 source（目录型包需确认 sourceFile 存在），忽略」：编辑器会被跳过。");
      return;
    }
    const left = Object.keys(TOK).filter((k) => got.text.indexOf(TOK[k]) >= 0);
    const miss = Object.keys(DEF).filter((k) => !DEF[k].test(got.text));
    if (left.length) {
      bad("编辑器「" + (e.label || e.id) + "」的面板源码里还有占位符 " + left.join(" / ") + "（取自 " + got.from + "）\n" +
          "      —— 这不是成品，是构建输入：宿主读到什么编译什么，打开 .tex 就会\n" +
          "      ReferenceError: <内核> is not defined（整个编辑器白屏）。重装一个修好的包。");
    } else if (miss.length) {
      bad("编辑器「" + (e.label || e.id) + "」的面板源码缺内核定义 " + miss.join(" / ") + "（取自 " + got.from + "）\n" +
          "      —— 编译期不报错，运行到那一句才炸（历史 / 就地编辑 / 预览会整块失灵）。");
    } else {
      ok("编辑器「" + (e.label || e.id) + "」的面板源码是产物：占位符 0 个，LPC / WYS / TX 都有定义（取自 " + got.from + "）");
    }
  });
  if (hasDir && fs.existsSync(path.join(packDir, "manifest.json"))) {
    /* 目录包：manifest 引用到的面板文件本身也得是产物（宿主可能按 sourceFile 去读它） */
    const refs = [];
    editors.forEach((e) => { if (typeof e.sourceFile === "string" && e.sourceFile) refs.push(e.sourceFile); });
    ((manifest.contributions || {}).ui || []).forEach((u) => {
      const c = u.content || {};
      if (c.type === "component" && typeof c.sourceFile === "string" && c.sourceFile) refs.push(c.sourceFile);
    });
    const dirty = [];
    refs.forEach((rel) => {
      const f = path.join(packDir, String(rel).replace(/^[./\\]+/, ""));
      if (!fs.existsSync(f)) return;
      const t = fs.readFileSync(f, "utf8");
      const left = Object.keys(TOK).filter((k) => t.indexOf(TOK[k]) >= 0);
      if (left.length) dirty.push(rel + " → " + left.join("/"));
    });
    if (dirty.length) {
      bad("目录包里这些面板文件还是「带占位符的构建输入」：" + dirty.join(" | ") + "\n" +
          "      —— manifest 引用了它们，宿主缺 source 时会按 sourceFile 去读：读到什么编译什么，打开 .tex 就崩。");
    } else ok("目录包引用的面板文件（" + refs.length + " 个）都是产物");

    /* 目录包自己带的 panels/*.tsx 也扫一遍：manifest 内联了 source、也删了 sourceFile 的包，
     * 今天宿主用不到这些文件（缺 source 才回读目录）—— 但它们仍是「跑不起来的半成品」，
     * 谁按目录包契约去读（宿主换实现 / 有人照 README 把源码目录整份放进来）就是同一个坑。 */
    const stray = [];
    (function walkPanels(dir) {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const f = path.join(dir, ent.name);
        if (ent.isDirectory()) { walkPanels(f); continue; }
        if (!/\.(tsx|ts)$/.test(ent.name)) continue;
        const t = fs.readFileSync(f, "utf8");
        const left = Object.keys(TOK).filter((k) => t.indexOf(TOK[k]) >= 0);
        if (left.length) stray.push(path.relative(packDir, f).split(path.sep).join("/") + " → " + left.join("/"));
      }
    })(fs.existsSync(path.join(packDir, "panels")) ? path.join(packDir, "panels") : packDir);
    if (stray.length) {
      warn("包内还有 " + stray.length + " 份面板文件是「带占位符的构建输入」：" + stray.join(" | ") +
           "\n      —— 这份包的内联只写进了 manifest；按目录包契约（缺 source 时读文件）去读它就会崩。换一个重打包过的版本。");
    }
  }
} else {
  info("（没读到 manifest，本节跳过）");
}

/* ---------- 4. 起一次真实产物，问 tools/list ---------- */
console.log("\n[4] 真实产物自检（起 server → tools/list）");
const candidate = global.__SERVER__ || path.join(packDir, "server", "index.js") ||
  (hasJson ? path.join(TOOLS, "latex-server.js") : "");
let listed = [];
if (candidate && fs.existsSync(candidate)) {
  try {
    const probe =
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "doctor", version: "1" } } }) +
      "\n" + JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n";
    const out = execFileSync(process.execPath, [candidate], {
      input: probe, encoding: "utf8", timeout: 25000, stdio: ["pipe", "pipe", "pipe"],
    });
    listed = [...new Set((out.match(/"name":"(latex_[a-z_]+)"/g) || []).map((s) => s.replace(/.*"(latex_[a-z_]+)"/, "$1")))];
    const banner = (out.match(/\[latex-plugin\][^\n]*/) || [""])[0];
    if (banner) ok("server 启动：" + banner.trim());
    else ok("server 启动，报了 " + listed.length + " 个工具");
    info(listed.sort().join(", "));
  } catch (e) {
    bad("起不动：" + candidate + "\n      " + ((e && e.message) || e) +
        "\n      —— 宿主此刻也是静默的：用户在界面上只会看到一句与 LaTeX 无关的 Unknown tool");
  }
  if (listed.length) {
    const miss = PANEL_CALLS.filter((t) => listed.indexOf(t) < 0);
    if (miss.length) bad("面板会调、但 server 没注册：" + miss.join(", "));
    else ok("面板要用的 " + PANEL_CALLS.length + " 个工具全在");
  }
} else {
  bad("找不到任何可启动的 server（单文件包形态还需 " + path.join(TOOLS, "latex-server.js") + "）");
}

/* ---------- 5. 宿主有没有真的把它拉起来 ---------- */
console.log("\n[5] 宿主侧的连接证据");
const procFile = roaming("mcp-processes.json");
if (fs.existsSync(procFile)) {
  let j = null;
  try { j = JSON.parse(fs.readFileSync(procFile, "utf8")); } catch (e) {}
  if (j && Array.isArray(j.processes)) {
    const mine = j.processes.find((p) => p.serverId === SERVER_SID);
    const manual = j.processes.find((p) => p.serverId === "notrat-latex");
    if (mine) {
      let alive = false;
      try { process.kill(mine.pid, 0); alive = true; } catch (e) {}
      alive ? ok("宿主登记并活着：" + SERVER_SID + "（pid " + mine.pid + "）")
            : warn("宿主登记过 " + SERVER_SID + "，但 pid " + mine.pid + " 已经不在了（app 关掉后这份表会过时，正常）");
    } else {
      warn("这份活体表里没有 " + SERVER_SID +
           "\n      —— 若 Notrat 正开着，说明插件 server 没起来（插件没启用 / 没重启 app）");
    }
    if (manual) {
      warn("另有一条手工登记的 MCP server \"notrat-latex\"（pid " + manual.pid + "）与插件自带的那条重复" +
           "\n      —— 它指向 " + path.join(TOOLS, "latex-server.js") + "，是开发期留下的。两条并存会让排查时「到底谁在答」说不清。");
    }
  } else warn("读不出 " + procFile + " 的结构");
  info("活体表：" + procFile);
} else warn("没有 " + procFile + "（宿主还没写过，或不是 Windows）");

/* ---------- 6. 手工登记的重复项 ---------- */
console.log("\n[6] 手工 MCP 登记（与插件自带的那条重复时容易互相顶替）");
if (fs.existsSync(MCP_CFG)) {
  let cfg = null;
  try { cfg = JSON.parse(fs.readFileSync(MCP_CFG, "utf8")); } catch (e) {}
  const list = (cfg && (cfg.servers || cfg.mcpServers)) || [];
  const hit = Array.isArray(list) ? list.filter((s) => s && /latex/i.test(JSON.stringify(s))) : [];
  if (!hit.length) ok("没有 latex 相关的手工登记");
  else hit.forEach((s) => warn("手工登记 id=" + s.id + " → " + JSON.stringify(s.args || s.command)));
  info(MCP_CFG);
} else info("没有 " + MCP_CFG);

/* ---------- 7. TeX 引擎（只影响编译 / 导出 PDF） ---------- */
console.log("\n[7] TeX 引擎（可选：没有它只影响「编译 / 导出 PDF」）");
const engines = ["xelatex", "pdflatex", "lualatex", "tectonic"];
const found = [];
for (const e of engines) {
  try { execFileSync(process.platform === "win32" ? "where" : "which", [e], { stdio: "ignore" }); found.push(e); } catch (er) {}
}
const tectonicHome = path.join(TOOLS, "bin");
let tectonicLocal = false;
try { tectonicLocal = fs.readdirSync(tectonicHome).some((f) => /tectonic/i.test(f)); } catch (e) {}
if (found.length) ok("PATH 里有：" + found.join(", "));
else if (tectonicLocal) ok("PATH 里没有，但插件自装的引擎在 " + tectonicHome);
else warn("一个都没探测到 —— 编辑 / 大纲 / 公式预览 / 导出 HTML 都不受影响；只有编译与导出 PDF 不可用（可在插件面板点「一键安装引擎」）");

/* ---------- 结论 ---------- */
console.log("\n" + "-".repeat(64));
if (FAIL) {
  console.log("结论：" + FAIL + " 条不通过" + (WARN ? "，" + WARN + " 条提醒" : "") + " —— 按上面 ✗ 那几条改。");
  process.exit(1);
}
console.log("结论：全部通过" + (WARN ? "（" + WARN + " 条提醒，非致命）" : "") + "。");
console.log("提示：若界面里仍报工具未知，且本脚本全绿 —— 多半是 app 还没重启。");
console.log("      MCP 连接只在 app 启动时建立，重载窗口不算。完全退出 Notrat 再开。");
