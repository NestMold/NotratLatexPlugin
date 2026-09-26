/* v0.9.0 栅格化端到端测试：起部署后的 latex-server.js，走 JSON-RPC 调 latex_asset */
const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");

const SRV = path.join(os.homedir(), ".notrat", "tools", "latex-server.js");
const WS = "E:/notrat-latex-plugin";
const PDF = WS + "/samples/arXiv-2308.03688v3/figs/agentbench.pdf";

/* 清缓存：保证 ①真实转换 ②缓存命中 都被真实覆盖 */
const RASTER = require(path.join(os.homedir(), ".notrat", "tools", "pdf-raster.js"));
fs.rmSync(RASTER.CACHE_DIR, { recursive: true, force: true });

const p = spawn(process.execPath, [SRV], { cwd: os.tmpdir() });
let buf = "";
const pending = new Map();
let nextId = 1;

p.stdout.on("data", (d) => {
  buf += String(d);
  let idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    } catch {}
  }
});
p.stderr.on("data", (d) => process.stderr.write("[srv] " + d));

function rpc(method, params) {
  return new Promise((res, rej) => {
    const id = nextId++;
    pending.set(id, res);
    p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => rej(new Error("timeout: " + method)), 60000);
  });
}
function callAsset(args) {
  return rpc("tools/call", { name: "latex_asset", arguments: Object.assign({ workspace: WS }, args) }).then((r) => {
    const t = r.result && r.result.content && r.result.content[0] && r.result.content[0].text || "";
    return { isError: !!(r.result && r.result.isError), text: t };
  });
}

(async () => {
  await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "raster-e2e", version: "0" } });
  p.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  // ① pdf 首转（缓存已清 → 必须真实转换）
  let t0 = Date.now();
  let r = await callAsset({ path: PDF });
  if (r.isError) { console.log("① RAW:", r.text); throw new Error("① 失败"); }
  let out = JSON.parse(r.text);
  console.log("① 首转:", JSON.stringify(out.raster), "dataUri.len =", out.dataUri.length, "耗时", Date.now() - t0, "ms");
  if (!out.dataUri.startsWith("data:image/png;base64,")) throw new Error("不是 PNG dataURI");
  if (out.raster.cached !== false) throw new Error("① 应为真实转换 cached:false");

  // ② 第二次 → 磁盘缓存命中
  t0 = Date.now();
  r = await callAsset({ path: PDF });
  out = JSON.parse(r.text);
  console.log("② 二次:", JSON.stringify(out.raster), "耗时", Date.now() - t0, "ms");
  if (out.raster.cached !== true) throw new Error("② 应为缓存命中");

  // ③ 无扩展名（LaTeX 习惯）→ 猜 .pdf
  r = await callAsset({ path: WS + "/samples/arXiv-2308.03688v3/figs/agentbench" });
  out = JSON.parse(r.text);
  console.log("③ 无扩展名猜中 pdf: cached =", out.raster.cached, "dataUri.len =", out.dataUri.length);

  // ④ 不存在的文件 → isError（前端退占位符）
  r = await callAsset({ path: WS + "/figs/不存在.pdf" });
  console.log("④ 缺文件 isError:", r.isError, "| msg:", r.text.slice(0, 60));
  if (!r.isError) throw new Error("④ 应报错");

  // ⑤ 坏 PDF（文本伪装）→ 栅格化失败；再打一发走负缓存（秒回）
  const bad = path.join(os.tmpdir(), "notrat-bad-fig.pdf");
  fs.writeFileSync(bad, "this is not a pdf at all");
  t0 = Date.now();
  r = await callAsset({ path: bad });
  console.log("⑤ 坏PDF isError:", r.isError, "| msg:", r.text.slice(0, 90), "| 耗时", Date.now() - t0, "ms");
  if (!r.isError) throw new Error("⑤ 应报错");
  t0 = Date.now();
  r = await callAsset({ path: bad });
  const negMs = Date.now() - t0;
  console.log("⑤b 坏PDF(负缓存) isError:", r.isError, "| 耗时", negMs, "ms（应 <100ms）");
  if (!r.isError || negMs > 100) throw new Error("⑤b 负缓存未生效");
  fs.unlinkSync(bad);

  console.log("\n全部通过 ✅");
  p.kill();
  process.exit(0);
})().catch((e) => { console.error("❌", e.message); p.kill(); process.exit(1); });
