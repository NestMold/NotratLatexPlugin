#!/usr/bin/env node
/* =========================================================================
 * 端到端回归：我们的 latex_outline × **装机版宿主的真解析链**
 *
 * 断言的是「点击能不能落到正确的行」，所以必须同时钉住三件事：
 *   ① 宿主解析出来的**条目数**（>1，否则整棵树塌成一行 —— v0.5.3 事故）
 *   ② **level**（要有 >1 的层级，否则缩进全平 —— v0.6.2 事故的一半）
 *   ③ **anchor**（必须是从工具带回来的行号；缺失时宿主会拿**标题文本**当锚点回抛，
 *      编辑器旧实现 Number(文本)=NaN → 兜成 1 → 「点了永远跳第 1 行」—— v0.6.2 事故的另一半）
 *
 * 用法:
 *   node .setup/check/host-outline-contract.js              # 测工作区 server（改动后先跑这个）
 *   node .setup/check/host-outline-contract.js --deployed   # 测 ~/.notrat/tools/latex-server.js（装机版）
 * 退出码: 0 通过 / 1 失败
 * ========================================================================= */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { parseItems, extractToolText } = require("./host-parse-items.js");

const DEPLOYED = process.argv.includes("--deployed");
const SRV = DEPLOYED
  ? path.join(os.homedir(), ".notrat", "tools", "latex-server.js")
  : path.join(__dirname, "..", "..", "server", "index.js");
const TEX = path.join(__dirname, "..", "..", "samples", "sample.tex");

let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ " + m + (extra ? "  → " + extra : "")); } };

/* ---------- 真 stdio 调工具 ---------- */
function mcp() {
  const p = spawn(process.execPath, [SRV], { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, LATEX_OUTLINE_DEPTH: "3" } });
  let buf = "";
  const pending = new Map();
  p.stdout.on("data", (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      let m; try { m = JSON.parse(line); } catch (_) { continue; }
      if (m.id != null && pending.has(m.id)) { const cb = pending.get(m.id); pending.delete(m.id); cb(m); }
    }
  });
  p.stderr.on("data", () => {});
  let seq = 0;
  const send = (method, params) => new Promise((res) => { const id = ++seq; pending.set(id, res); p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
  return { p, send };
}

/* 源码里真实的章节行号（1 基），用来对账 anchor */
function realSectionLines() {
  const out = [];
  fs.readFileSync(TEX, "utf8").split("\n").forEach((l, i) => {
    if (/\\(part|chapter|section|subsection|subsubsection)\*?\{/.test(l)) out.push(i + 1);
  });
  return out;
}

(async () => {
  console.log("宿主大纲契约端到端（" + (DEPLOYED ? "装机版 server" : "工作区 server") + "）");
  console.log("  server = " + SRV);
  console.log("  parser = .setup/check/host-parse-items.js（从装机 bundle 抠出来的真解析链）\n");

  const { p, send } = mcp();
  await send("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "contract", version: "1" } });
  p.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  /* ---------- A. 宿主内置大纲通路（只带 filePath） ---------- */
  const r = await send("tools/call", { name: "latex_outline", arguments: { fileName: "sample.tex", filePath: TEX } });
  const result = r && r.result;
  ok(!!result, "A1 latex_outline 有返回");

  const flat = extractToolText(result).trim();
  ok(!/^1\|/.test(flat.split("\n")[0] || "") || flat.split("\n").length > 1, "A2 拍平后不是「一条多行」的旧形态", JSON.stringify(flat).slice(0, 80));

  const items = parseItems(result);
  const lines = realSectionLines();
  console.log("      解析结果: " + JSON.stringify(items).slice(0, 200) + "\n");

  ok(items.length === lines.length, "B1 条目数 = 源码章节数（" + lines.length + "）", "实际 " + items.length);
  ok(items.length > 1, "B2 多条目：树不会塌成一行");
  ok(!items.some((it) => /[\n\r]/.test(it.text)), "B3 每条 text 无内嵌换行（不会被 truncate 折成空格）");
  ok(items.some((it) => it.level > 1), "B4 有 >1 的层级：缩进不会全平", "levels=" + items.map((it) => it.level).join(","));

  const anchors = items.map((it) => it.anchor);
  ok(anchors.every((a) => a != null && /^\d+$/.test(String(a))), "B5 每条都有**数字** anchor（缺了宿主会拿标题当锚点 → 跳第 1 行）", JSON.stringify(anchors));
  ok(JSON.stringify(anchors) === JSON.stringify(lines.map(String)), "B6 anchor 逐条等于真实章节行号", JSON.stringify(anchors) + " vs " + JSON.stringify(lines));

  /* ---------- C. 面板 / AI 通路不能被带坏 ---------- */
  const r2 = await send("tools/call", { name: "latex_outline", arguments: { path: TEX } });
  const txt = ((r2.result || {}).content || []).map((c) => c.text).join("\n");
  ok(/^\[ \] #\d+ /.test(txt.split("\n")[1] || ""), "C1 面板通路仍是 list 行协议文本", JSON.stringify(txt.split("\n")[1]));
  ok(/^📄 /.test(txt.split("\n")[0] || ""), "C2 面板通路保留文件头行");

  p.kill();
  console.log("\n=== " + pass + " 通过 / " + fail + " 失败 ===");
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error("失败: " + e.message); process.exit(1); });
