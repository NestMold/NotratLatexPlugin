/* 功能性冒烟：真实调 8 个工具（含快照 / 回退），在临时副本上做破坏性验证
 * 用真实 MCP 子进程（stdio JSON-RPC），与宿主调用路径一致。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const SERVER = path.join(os.homedir(), ".notrat", "tools", "latex-server.js");
const WS = "E:/notrat-latex-plugin";
const TMP = path.join(os.tmpdir(), "latex-smoke");
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
fs.copyFileSync(path.join(WS, "samples/sample.tex"), path.join(TMP, "paper.tex"));
const PAPER = path.join(TMP, "paper.tex");

function mcp(calls) {
  const input = calls
    .map((c, i) => JSON.stringify({ jsonrpc: "2.0", id: i + 1, method: "tools/call", params: { name: c[0], arguments: c[1] } }))
    .join("\n") + "\n";
  const out = cp.execFileSync("node", [SERVER], { input: input, encoding: "utf8" });
  return out
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l))
    .map((j) => (j.result && j.result.content ? j.result.content.map((c) => c.text).join("\n") : "ERR " + JSON.stringify(j.error)));
}

let bad = 0;
function check(cond, msg, extra) {
  console.log((cond ? "  ✓ " : "  ✗ ") + msg + (cond || !extra ? "" : "\n      " + String(extra).slice(0, 240)));
  if (!cond) bad++;
}

console.log("== 在临时副本上跑真实 MCP 调用 ==");
const [st, ol, bk1, bk2, hi] = mcp([
  ["latex_status", { path: PAPER }],
  ["latex_outline", { path: PAPER, depth: 1 }],
  ["latex_backup", { path: PAPER }],
  ["latex_backup", { path: PAPER }],
  ["latex_history", { path: PAPER }],
]);

check(/^📐 paper\.tex · /.test(st), "latex_status 返回一行摘要", st);
check(/公式/.test(st) && /引用/.test(st) && /字/.test(st), "摘要含公式/引用/字数", st);
check(ol.split("\n")[0].indexOf("章节 5") >= 0, "latex_outline 认到 5 个章节", ol.split("\n")[0]);
check(/^\[ \] #\d+ 1  引言$/m.test(ol), "大纲行协议形如「[ ] #行号 编号 标题」", ol);
check(!/模型结构/.test(ol), "depth=1 时不含 subsection（模型结构）", ol);
check(/已快照/.test(bk1), "首次快照写入成功", bk1);
check(/一致，本次不新增快照/.test(bk2), "内容未变时不重复快照（幂等）", bk2);
check(!/拒绝|deny/i.test(bk1 + bk2), "pre 钩子文案不含「拒绝/deny」（否则会拦掉编译）", bk1 + bk2);
check(/快照 1 份/.test(hi), "latex_history 统计到 1 份快照", hi);

console.log("\n== 快照回退实证（改坏 → 回退） ==");
const good = fs.readFileSync(PAPER, "utf8");
fs.writeFileSync(PAPER, "\\documentclass{ctexart}\n\\begin{document}\n被改坏了\n", "utf8");
const st2 = mcp([["latex_status", { path: PAPER }]])[0];
check(/0 节/.test(st2), "改坏后章节数归零（确认文件真的被破坏）", st2);
const [rs, hi2] = mcp([
  ["latex_history", { path: PAPER, action: "restore" }],
  ["latex_history", { path: PAPER }],
]);
check(/已恢复到快照/.test(rs), "restore 执行成功", rs);
check(fs.readFileSync(PAPER, "utf8") === good, "恢复后内容与快照前逐字节一致");
check(/快照 2 份/.test(hi2), "恢复前自动留了一份安全快照（可再次回退）", hi2);

console.log("\n== 主工作区样例回归 ==");
const [p1, v1, o1] = mcp([
  ["latex_parse", { path: path.join(WS, "samples/sample.tex"), format: "json" }],
  ["latex_validate", { path: path.join(WS, "samples/sample.tex"), format: "json" }],
  ["latex_outline", { path: path.join(WS, "samples/sample.tex") }],
]);
const pj = JSON.parse(p1);
const vj = JSON.parse(v1);
check(pj.file && pj.sections.length === 5, "latex_parse(JSON) 正常", "sections=" + (pj.sections || []).length);
check(vj.summary.errors === 1, "latex_validate 认到样例里故意留的 1 个未定义引用", JSON.stringify(vj.summary));
check(o1.split("\n").length - 1 === 5, "latex_outline 输出 5 行（5 个章节）");

console.log("\n" + (bad === 0 ? "✅ 功能冒烟全部通过" : "❌ " + bad + " 项失败"));
process.exitCode = bad ? 1 : 0;
