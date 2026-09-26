/* v0.5.3 冒烟：latex_outline 双通路 + 其余工具未被裁坏
 * 直接 spawn MCP server 走 stdio JSON-RPC，等价宿主调用链路。
 */
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const WS = "E:/notrat-latex-plugin";
const TEX = WS + "/samples/sample.tex";
/* v0.6.2：断言宿主「最终看到什么」，所以直接拿装机版抠出来的真解析链来解析 */
const { parseItems } = require("./check/host-parse-items.js");
const REAL_LINES = fs
  .readFileSync(TEX, "utf8")
  .split("\n")
  .map((l, i) => (/\\(part|chapter|section|subsection|subsubsection)\*?\{/.test(l) ? i + 1 : 0))
  .filter(Boolean);

const srv = spawn("node", [WS + "/server/index.js"], {
  env: { ...process.env, NOTRAT_WORKSPACE: WS, LATEX_OUTLINE_DEPTH: "2" },
  stdio: ["pipe", "pipe", "pipe"],
});

let buf = "";
const waiters = new Map();
srv.stdout.on("data", (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id && waiters.has(msg.id)) { waiters.get(msg.id)(msg); waiters.delete(msg.id); }
  }
});
let stderr = "";
srv.stderr.on("data", (d) => (stderr += d.toString()));

let id = 0;
function rpc(method, params) {
  const myId = ++id;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("超时: " + method)), 15000);
    waiters.set(myId, (m) => { clearTimeout(t); resolve(m); });
    srv.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: myId, method, params }) + "\n");
  });
}
let fails = 0, passes = 0;
function check(name, cond, extra) {
  if (cond) { passes++; console.log("  ✓ " + name); }
  else { fails++; console.log("  ✗ " + name + (extra ? "  → " + extra : "")); }
}
const text = (r) => ((r.result && r.result.content) || []).map((c) => c.text).join("\n");

(async () => {
  console.log("=== tools/list ===");
  const list = await rpc("tools/list", {});
  const names = (list.result.tools || []).map((t) => t.name);
  console.log("  " + names.join(", "));
  check("latex_outline 在工具表里", names.includes("latex_outline"));
  const ol = (list.result.tools || []).find((t) => t.name === "latex_outline");
  check("schema 含 filePath（宿主注入位）", !!(ol && ol.inputSchema.properties.filePath));
  check("schema 含 format=outline", !!(ol && ol.inputSchema.properties.format));

  console.log("\n=== A. 面板通路（path，无 format）→ list 行协议 ===");
  const a = text(await rpc("tools/call", { name: "latex_outline", arguments: { path: TEX } }));
  console.log(a.split("\n").slice(0, 6).map((l) => "    " + l).join("\n"));
  check("首行是 📄 标题行", a.startsWith("📄"));
  check("章节行是 [ ] #行号 形态", /^\[ \] #\d+\s/m.test(a));
  check("不含宿主契约的 '|' 行", !/^\d+\|/m.test(a));

  console.log("\n=== B. 宿主通路（filePath，无 path/format）→ 交真解析链判结果 ===");
  const bResp = await rpc("tools/call", { name: "latex_outline", arguments: { filePath: TEX, fileName: "sample.tex" } });
  const bContent = (bResp.result && bResp.result.content) || [];
  console.log("    result.content 条数 = " + bContent.length + "；首条 text 前 110 字：" + String((bContent[0] || {}).text).slice(0, 110));
  /* ★ v0.6.2 事故（点大纲永远跳第 1 行）根因回归：
   *   宿主 parseItems = extractToolText(拍平 content[].text) → JSON.parse → …
   *   所以「内容块上挂 level/anchor」是不安全形状：拍平即丢。
   *   下面同时钉住「新形状能过」与「旧形状必挂」两条。 */
  const hostItems = parseItems(bResp.result);
  const oldShape = { content: [{ type: "text", text: "1  引言", level: 1, anchor: "11" }] };
  check(
    "对照：旧形态（level/anchor 挂在内容块上）在真解析链下会丢 anchor —— 所以不能再用它",
    parseItems(oldShape)[0].anchor === undefined,
    "anchor=" + parseItems(oldShape)[0].anchor
  );
  check("★ 宿主解析后条目数 > 1（不会塌成一行）", hostItems.length > 1, "条目数=" + hostItems.length);
  check("★ 条目数 = 源码真实章节数", hostItems.length === REAL_LINES.length, hostItems.length + " vs " + REAL_LINES.length);
  check(
    "★ 每条都带回数字 anchor（丢了宿主会拿标题当锚点回抛 → 编辑器跳第 1 行）",
    hostItems.every((c) => c.anchor != null && /^\d+$/.test(String(c.anchor))),
    JSON.stringify(hostItems.map((c) => c.anchor))
  );
  check(
    "★ anchor 逐条等于源码真实章节行号",
    JSON.stringify(hostItems.map((c) => Number(c.anchor))) === JSON.stringify(REAL_LINES),
    JSON.stringify(hostItems.map((c) => Number(c.anchor))) + " vs " + JSON.stringify(REAL_LINES)
  );
  check("★ 层级保住（存在 level > 1 的条目）", hostItems.some((c) => c.level > 1), JSON.stringify(hostItems.map((c) => c.level)));
  check("每条 text 不含换行（折行会被宿主压成一行）", hostItems.every((c) => String(c.text).indexOf("\n") < 0));
  check("level 从 1 起（1..3）", hostItems.every((c) => c.level >= 1 && c.level <= 3), JSON.stringify(hostItems.map((c) => c.level)));
  check("顶层 section 的 level == 1", hostItems[0].level === 1, JSON.stringify(hostItems[0]));
  check("subsection 比 section 深一级", hostItems[2].level === 2, JSON.stringify(hostItems[2]));
  check("含顶层章节「引言」", /引言/.test(hostItems.map((c) => c.text).join("|")));
  check("缩进交给 level（text 不带前导空格缩进）", hostItems.every((c) => !/^\s{2,}\S/.test(String(c.text))));
  console.log("\n=== C. 显式 format=outline（面板也能要宿主格式）===");
  const cResp = await rpc("tools/call", { name: "latex_outline", arguments: { path: TEX, format: "outline" } });
  const cItems = parseItems(cResp.result);
  check("与 B 同构（真解析链结果：有 level / 有 anchor）", cItems.length > 1 && cItems.every((c) => typeof c.level === "number" && c.anchor != null));
  check("与 B 条目数一致", cItems.length === hostItems.length, cItems.length + " vs " + hostItems.length);

  console.log("\n=== D. 其余工具未被裁坏 ===");
  const p = text(await rpc("tools/call", { name: "latex_parse", arguments: { path: TEX, format: "json" } }));
  let pj = null; try { pj = JSON.parse(p); } catch {}
  check("latex_parse 返回合法 JSON", !!pj);
  check("解析出 file 字段", !!(pj && pj.file));
  const v = text(await rpc("tools/call", { name: "latex_validate", arguments: { path: TEX, format: "json" } }));
  let vj = null; try { vj = JSON.parse(v); } catch {}
  check("latex_validate 返回合法 JSON", !!vj);
  const s = (vj && vj.summary) || {};
  check("检出未定义 \\ref（sample.tex 故意埋的）", (s.errors || 0) > 0, JSON.stringify(s));
  const st = text(await rpc("tools/call", { name: "latex_status", arguments: { path: TEX } }));
  check("latex_status 仍可用", st.indexOf("📐") === 0, st.slice(0, 60));

  console.log("\n=== E. depth 仍受设置控制 ===");
  const d1 = (((await rpc("tools/call", { name: "latex_outline", arguments: { filePath: TEX, depth: 1 } })).result || {}).content || []).map((c) => c.text).join("\n");
  const d3 = (((await rpc("tools/call", { name: "latex_outline", arguments: { filePath: TEX, depth: 3 } })).result || {}).content || []).map((c) => c.text).join("\n");
  check("depth=1 不含小节「模型结构」", !/模型结构/.test(d1));
  check("depth=3 含小节「模型结构」", /模型结构/.test(d3));

  console.log("\nstdio 污染检查: " + (stderr.trim() ? "stderr 有日志（正常）" : "无 stderr 输出"));
  console.log("stderr 前 200 字: " + stderr.slice(0, 200).replace(/\n/g, " "));
  console.log("\n=== 结果: " + passes + " 通过 / " + fails + " 失败 ===");
  srv.kill();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("测试异常:", e.message); srv.kill(); process.exit(2); });
