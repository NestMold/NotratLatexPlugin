/* settings -> env 通路端到端验证
 *
 * 这是本次修复的核心。宿主侧的真实算法（取自 app.asar，逐字对齐）：
 *
 *   写入 PluginSettingsPane:
 *     values[group.key][field.key] = value
 *       —— setValue(pt.key, Et.key, qt)，外层索引是「settings 分组 key」
 *
 *   读取 resolvePlaceholders:
 *     String(v).replace(/\$\{settings:([^}]+)\}/g, (_, ref) => {
 *       const x = values[pluginId]?.[ref.trim()];
 *       return x === undefined ? "" : String(x);
 *     })
 *       —— 外层索引是「manifest.id」
 *
 *   => 只有 group.key === manifest.id 时，写入落点与读取索引重合。
 *
 * 本脚本把这条链路完整跑一遍（含把解析结果真的喂给 MCP server 编译），
 * 对比「修复前 group.key='latex'」与「修复后 group.key===id」两种清单。
 *
 * 用法: node .setup/check/sim-host-settings.js
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const WS = path.resolve(__dirname, "..", "..");
const manifest = JSON.parse(fs.readFileSync(path.join(WS, "manifest.json"), "utf8"));

/* ---------- 宿主侧算法（逐字复刻） ---------- */
function makeStore() {
  const values = {}; // values[外层索引][key] = value
  return {
    values,
    // setValue(外层索引, key, value)  ← 对应 PluginSettingsPane 的 setValue(pt.key, Et.key, q)
    setValue: (outer, k, v) => { values[outer] = { ...(values[outer] || {}), [k]: v }; },
    // getValue(外层索引, key)  ← 对应 resolvePlaceholders 的 getValue(pluginId, ref)
    getValue: (outer, k) => (values[outer] === undefined ? undefined : values[outer][k]),
  };
}

function resolvePlaceholders(pluginId, text, store) {
  return String(text)
    .replace(/\$\{settings:([^}]+)\}/g, (_m, ref) => {
      const v = store.getValue(pluginId, ref.trim());
      return v === undefined ? "" : String(v);
    })
    .replace(/\$\{pluginDir\}/g, () => path.join(process.env.USERPROFILE, ".notrat", "plugins"));
}

/* 模拟用户把「编译引擎」这一项填成 pdflatex（其余保持默认/未改） */
const USER_EDITS = { compiler: "pdflatex" };

function runPipeline(label, groupKey) {
  const store = makeStore();
  for (const [k, v] of Object.entries(USER_EDITS)) store.setValue(groupKey, k, v);

  const env = {};
  for (const srv of manifest.mcpServers) {
    for (const [k, tpl] of Object.entries(srv.env || {})) {
      env[k] = resolvePlaceholders(manifest.id, tpl, store);
    }
  }
  console.log(`  [${label}] group.key = "${groupKey}"`);
  console.log(`    写入落点        : values[${JSON.stringify(groupKey)}][compiler] = "pdflatex"`);
  console.log(`    读取索引        : values[${JSON.stringify(manifest.id)}][compiler]`);
  console.log(`    解析出的 env    : ${JSON.stringify(env)}`);
  const hit = store.getValue(manifest.id, "compiler");
  console.log(`    LATEX_COMPILER  : ${hit === undefined ? '"" (取不到 → 引擎回退链)' : JSON.stringify(hit)}`);
  console.log("");
  return env;
}

console.log("================ settings -> env 通路验证 ================");
console.log(`插件 id: ${manifest.id}`);
console.log(`清单声明的分组 key: "${manifest.contributions.settings[0].key}"`);
console.log(`用户操作: 把「编译引擎」填成 pdflatex\n`);

const envOld = runPipeline("修复前", "latex");
const envNew = runPipeline("修复后", manifest.contributions.settings[0].key);

const okOld = envOld.LATEX_COMPILER === "pdflatex";
const okNew = envNew.LATEX_COMPILER === "pdflatex";
console.log("----------------------------------------------------------");
console.log(`修复前（group.key="latex"）      LATEX_COMPILER=${JSON.stringify(envOld.LATEX_COMPILER)}  ${okOld ? "✓ 生效" : "✗ 失效"}`);
console.log(`修复后（group.key===id）         LATEX_COMPILER=${JSON.stringify(envNew.LATEX_COMPILER)}  ${okNew ? "✓ 生效" : "✗ 失效"}`);
console.log("----------------------------------------------------------\n");

if (!okNew) { console.log("❌ 修复未生效，终止"); process.exit(1); }
if (okOld) { console.log("⚠ 修复前也生效？说明我对宿主算法的推断有误，请复查"); }

/* ---------- 把解析结果真的喂给 MCP server，验证引擎真的切换 ---------- */
const SERVER = path.join(process.env.USERPROFILE, ".notrat", "tools", "latex-server.js");
console.log("把【修复后】解析出的 env 喂给真实 MCP server，编译并观察实际引擎...\n");

const ch = spawn(process.execPath, [SERVER], {
  stdio: ["pipe", "pipe", "pipe"],
  env: {
    ...process.env,
    NOTRAT_PLUGIN_ID: manifest.id,
    NOTRAT_WORKSPACE: WS,
    NOTRAT_LOCALE: "zh",
    ...envNew, // ← 关键：走宿主解析链得到的 env
  },
});
let buf = "";
let stderr = "";
ch.stderr.on("data", (d) => { stderr += d; });
ch.stdout.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    if (m.id === 2) {
      const t = m.result.content[0].text;
      const usedPdflatex = /pdflatex/i.test(t);
      const usedTectonic = /tectonic/i.test(t);
      console.log(t.split("\n").slice(0, 3).join("\n"));
      console.log("\n  stderr: " + stderr.split("\n").filter(Boolean).slice(-2).join(" | "));
      console.log("\n---- 结论 ----");
      console.log(`  实际使用的引擎含 pdflatex: ${usedPdflatex ? "✓ 是" : "✗ 否"}`);
      console.log(`  仍在使用 tectonic       : ${usedTectonic ? "是（未切换）" : "否"}`);
      const ok = usedPdflatex && !usedTectonic;
      console.log(`  settings -> env -> 引擎选择 全链路: ${ok ? "✓ 打通" : "✗ 未打通"}`);
      ch.kill();
      process.exit(ok ? 0 : 1);
    }
  }
});
ch.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) + "\n");
ch.stdin.write(JSON.stringify({
  jsonrpc: "2.0", id: 2, method: "tools/call",
  params: { name: "latex_compile", arguments: { path: path.join(WS, "samples", "sample.tex") } },
}) + "\n");
setTimeout(() => { ch.kill(); console.log("超时"); process.exit(1); }, 180000);
