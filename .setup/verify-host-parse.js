#!/usr/bin/env node
/* 真机对账：用**当前安装版 Notrat 1.3.3 的真实 parseItems**，
 * 跑我们**已部署**的 latex_outline 返回，判断「整棵树挤成一行」是否真的修好了。
 *
 * 数据来源：
 *   被测服务 = ~/.notrat/tools/latex-server.js（与 server/index.js md5 一致）
 *   被测解析器 = D:/Notrat/resources/app.asar → dist/assets/index-XIov55p-.js 里的 parseItems
 *              （不是我们自己写的模仿版，是从线上包里逐字节抠出来的）
 */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOME = os.homedir();
const SERVER = path.join(HOME, ".notrat/tools/latex-server.js");
const LIVE_BUNDLE = path.join(__dirname, "live/index-XIov55p-.js");
const TEX = path.join(__dirname, "..", "samples", "test.tex");

/* ---------- 1. 从线上 bundle 抠出真 parseItems ---------- */
function extractLiveParseItems() {
  const s = fs.readFileSync(LIVE_BUNDLE, "utf8");
  const start = s.indexOf("function parseItems(it){");
  const end = s.indexOf("function PluginOutlineItems(", start);
  if (start < 0 || end < 0) throw new Error("线上 bundle 里找不到 parseItems");
  const src = s.slice(start, end);
  const parseItems = eval("(" + src.replace(/^function parseItems/, "function") + ")");
  return { parseItems, src };
}

/* ---------- 2. 走真 stdio 调我们的 MCP 工具 ---------- */
function callTool(tool, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [SERVER], { stdio: ["pipe", "pipe", "pipe"] });
    let buf = "";
    let done = false;
    const send = (o) => p.stdin.write(JSON.stringify(o) + "\n");
    p.stdout.on("data", (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === 1) {
          send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
          send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: tool, arguments: args } });
        } else if (msg.id === 2) {
          done = true;
          p.kill();
          resolve(msg);
        }
      }
    });
    p.stderr.on("data", (d) => process.stderr.write("[server] " + d));
    p.on("error", reject);
    const t = setTimeout(() => { if (!done) { p.kill(); reject(new Error("超时")); } }, 30000);
    p.on("exit", () => clearTimeout(t));
    send({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "verify", version: "1" } },
    });
  });
}

/* ---------- 3. 对账 ---------- */
(async () => {
  const { parseItems } = extractLiveParseItems();
  console.log("解析器来源: 线上 app.asar → dist/assets/index-XIov55p-.js（真 parseItems）\n");

  const rpc = await callTool("latex_outline", { fileName: "test.tex", filePath: TEX });
  const result = rpc && rpc.result;
  console.log("RPC 顶层键:", Object.keys(rpc || {}));
  console.log("result 顶层形态:", Array.isArray(result) ? "Array" : typeof result);
  console.log("result.content 是数组:", Array.isArray(result && result.content));
  console.log("result.content 长度:", result && result.content && result.content.length);
  console.log("第 0 条内容:", JSON.stringify(result && result.content && result.content[0]).slice(0, 220));
  console.log("");

  const items = parseItems(result);
  console.log("=== 宿主真解析器解析结果 ===");
  console.log("条目数:", items.length);
  items.slice(0, 6).forEach((it, i) =>
    console.log(`  #${i + 1} level=${it.level} anchor=${it.anchor} text=${JSON.stringify(it.text).slice(0, 70)}`)
  );

  const hasNewline = items.some((it) => /[\n\r]/.test(it.text));
  console.log("");
  console.log(items.length > 1 ? "✅ 多条目：树不会塌成一行" : "❌ 只剩 1 条：会塌成一行");
  console.log(hasNewline ? "❌ 有条目 text 里还带换行（会被 truncate 折成空格）" : "✅ 没有条目 text 带换行");
})().catch((e) => { console.error("失败:", e.message); process.exit(1); });
