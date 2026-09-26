/* 一次性工具：dump 某个 latex_* 工具的完整返回文本
 * 用法: node .setup/check/dump-tool.js <工具名> [JSON 参数]
 */
const { spawn } = require("child_process");
const path = require("path");

const tool = process.argv[2] || "latex_parse";
const args = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const SERVER = path.join(process.env.USERPROFILE, ".notrat", "tools", "latex-server.js");

const ch = spawn(process.execPath, [SERVER], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, NOTRAT_PLUGIN_ID: "notrat-latex-plugin", NOTRAT_WORKSPACE: "E:\\notrat-latex-plugin" },
});
let buf = "";
ch.stderr.on("data", (d) => process.stderr.write("[stderr] " + d));
ch.stdout.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    if (m.id === 2) {
      const t = m.result.content[0].text;
      console.log(t);
      console.log("\n--- 断言 ---");
      for (const [k, re] of Object.entries({
        "figure": /figure/i, "table": /table/i, "tabular": /tabular/i,
        "图/表中文": /[图表]/, "\\begin": /\\begin/, "environment": /environment/i,
      })) console.log("  " + k.padEnd(12), re.test(t));
      ch.kill(); process.exit(0);
    }
  }
});
ch.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) + "\n");
ch.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: tool, arguments: args } }) + "\n");
setTimeout(() => { ch.kill(); process.exit(1); }, 60000);
