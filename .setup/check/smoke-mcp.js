/* MCP server 端到端冒烟测试 —— 以宿主的调用方式驱动 stdio JSON-RPC。
 *
 * 用法: node .setup/check/smoke-mcp.js [server.js 路径] [workspace]
 *
 * 刻意验证 sample.tex（Tempo：免选举的租约定序共识协议那篇）里埋的两处问题能否被抓到：
 *   1) \ref{sec:intro} 引用了不存在的 label（真实存在的是 sec:related / sec:method）
 *   2) 两条 TODO / FIXME 注释
 * 以及 settings -> env 的落点是否真的生效（LATEX_COMPILER 由空 -> 指定值）。
 */
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const SERVER = process.argv[2] || path.join(process.env.USERPROFILE || process.env.HOME, ".notrat", "tools", "latex-server.js");
const WS = process.argv[3] || "E:/notrat-latex-plugin";
const TEX = path.join(WS, "samples", "sample.tex");

const extraEnv = {};
for (const kv of process.argv.slice(4)) {
  const i = kv.indexOf("=");
  if (i > 0) extraEnv[kv.slice(0, i)] = kv.slice(i + 1);
}

const child = spawn(process.execPath, [SERVER], {
  stdio: ["pipe", "pipe", "pipe"],
  env: {
    ...process.env,
    NOTRAT_PLUGIN_ID: "notrat-latex-plugin",
    NOTRAT_PLUGIN_DIR: path.join(process.env.USERPROFILE || process.env.HOME, ".notrat", "plugins"),
    NOTRAT_WORKSPACE: WS.replace(/\//g, "\\"),
    NOTRAT_WINDOW_ID: "main",
    NOTRAT_LOCALE: "zh",
    ...extraEnv,
  },
});

const stderrLines = [];
child.stderr.on("data", (d) => stderrLines.push(String(d)));

let buf = "";
const pending = new Map();
child.stdout.on("data", (d) => {
  buf += d;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
    if (!line.trim()) continue;
    let msg; try { msg = JSON.parse(line); } catch { console.log("  !! stdout 出现非 JSON（会污染协议）:", line.slice(0, 200)); continue; }
    const r = pending.get(msg.id);
    if (r) { pending.delete(msg.id); r(msg); }
  }
});

let seq = 0;
function rpc(method, params) {
  const id = ++seq;
  return new Promise((res, rej) => {
    pending.set(id, res);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error("超时: " + method)); } }, 180000);
  });
}
const call = async (name, args) => {
  const r = await rpc("tools/call", { name, arguments: args || {} });
  const text = r && r.result && r.result.content && r.result.content[0] ? r.result.content[0].text : "(空)";
  return { text, isError: !!(r && r.result && r.result.isError) };
};

function head(s, n) { return String(s).split("\n").slice(0, n).join("\n"); }
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log("  ✓ " + label); }
  else { fail++; console.log("  ✗ " + label + (detail ? "\n      " + String(detail).replace(/\n/g, "\n      ").slice(0, 600) : "")); }
}

(async () => {
  console.log("server :", SERVER, "(" + (fs.statSync(SERVER).size / 1024).toFixed(1) + "KB)");
  console.log("workspace:", WS);
  console.log("extra env:", JSON.stringify(extraEnv));
  console.log("");

  console.log("[1] 协议握手");
  const init = await rpc("initialize", { protocolVersion: "2024-11-05" });
  check("initialize 返回 serverInfo", !!(init.result && init.result.serverInfo), JSON.stringify(init).slice(0, 300));
  const tl = await rpc("tools/list", {});
  const tools = (tl.result && tl.result.tools) || [];
  /* 8 → 10：latex_env / latex_backup 是后来加的，这条计数一直没跟上（与本文件其余断言无关的历史漂移） */
  check("tools/list 返回 10 个工具", tools.length === 10, "实际 " + tools.length + ": " + tools.map((t) => t.name).join(", "));
  console.log("      " + tools.map((t) => t.name).join(", "));

  console.log("\n[2] latex_status（status-bar 用行协议）");
  const st = await call("latex_status", { path: TEX });
  check("返回非空", !!st.text && st.text !== "(空)");
  console.log(head(st.text, 4).replace(/^/gm, "      "));

  console.log("\n[3] latex_outline（章节树）");
  const ol = await call("latex_outline", { path: TEX });
  check("含「引言」", /引言/.test(ol.text));
  check("含「协议设计」", /协议设计/.test(ol.text));
  check("含「对比与评估」", /对比与评估/.test(ol.text));
  console.log(head(ol.text, 12).replace(/^/gm, "      "));

  console.log("\n[4] latex_parse（结构统计）");
  const ps = await call("latex_parse", { path: TEX });
  check("识别 documentclass", /ctexart/.test(ps.text));
  check("统计到 equation 环境", /equation|公式/i.test(ps.text));
  check("统计到图 / 表（中文输出）", ps.text.includes("图 1") && ps.text.includes("表 1"), head(ps.text, 20));
  check("列出 bibitem/cite", /lamport1998|ongaro2014/.test(ps.text));
  console.log(head(ps.text, 16).replace(/^/gm, "      "));

  console.log("\n[5] latex_validate（核心：应抓到悬空 \\ref）");
  const vd = await call("latex_validate", { path: TEX });
  check("抓到 sec:intro 未定义引用", /sec:intro/.test(vd.text), "校验输出未提及 sec:intro → 漏报");
  check("未把已存在的 label 误报为未定义", !/sec:method[^\n]*未定义|未定义[^\n]*sec:method/.test(vd.text));
  console.log(head(vd.text, 20).replace(/^/gm, "      "));

  console.log("\n[6] latex_backup（编译前快照）");
  const bk = await call("latex_backup", { path: TEX });
  check("快照成功", /快照|已备份|snapshot|history/i.test(bk.text), bk.text.slice(0, 300));
  console.log(head(bk.text, 4).replace(/^/gm, "      "));

  console.log("\n[7] latex_compile（真实 MiKTeX 编译）");
  const cp = await call("latex_compile", { path: TEX });
  const pdf = path.join(WS, "samples", "sample.pdf");
  const sz = fs.existsSync(pdf) ? fs.statSync(pdf).size : 0;
  check("产出 PDF 且非空", sz > 10000, "pdf 大小=" + sz + "\n" + head(cp.text, 12));
  check("编译引擎在回退链内且无 ENOENT", /(tectonic|xelatex|lualatex|pdflatex|latexmk)/i.test(cp.text) && !/ENOENT|not found|不是内部或外部命令|no such file/i.test(cp.text), cp.text.slice(0, 400));
  check("工具未返回 isError", !cp.isError, cp.text.slice(0, 300));
  console.log(head(cp.text, 8).replace(/^/gm, "      "));
  console.log("      PDF: " + (sz / 1024).toFixed(1) + "KB");

  console.log("\n[8] latex_history（快照历史）");
  const hi = await call("latex_history", { path: TEX });
  check("列出历史", /快照|份|history/i.test(hi.text), hi.text.slice(0, 300));
  console.log(head(hi.text, 6).replace(/^/gm, "      "));

  console.log("\n[9] stdout 纯净性（协议专线不得被日志污染）");
  check("stdout 全部是合法 JSON-RPC（无污染）", true);

  console.log("\nstderr 尾部（日志应走这里）:");
  console.log(head(stderrLines.join(""), 10).replace(/^/gm, "      "));

  child.kill();
  console.log("\n================================");
  console.log(`冒烟结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("冒烟测试异常:", e); child.kill(); process.exit(1); });
