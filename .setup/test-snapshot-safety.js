/* 快照安全的定向回归测试（v0.4.0 冒烟发现的真 bug）
 *
 * 原 bug：快照时间戳只到秒 → 回退时的「安全备份」与既有快照同秒 → 覆盖掉好快照 →
 *         回退把坏内容写回文件（数据丢失）。
 * 本测试逐条钉住修复点：毫秒精度、撞名不覆盖、恢复先读进内存。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const contrib = require("E:/notrat-latex-plugin/server/contrib.js");

const TMP = path.join(os.tmpdir(), "latex-snap-test");
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
const F = path.join(TMP, "paper.tex");

const A = "\\documentclass{article}\n\\begin{document}\nAAA\n\\end{document}\n";
const B = "\\documentclass{article}\n\\begin{document}\nBBB\n\\end{document}\n";
const C = "\\documentclass{article}\n\\begin{document}\nCCC\n\\end{document}\n";

let bad = 0;
function ok(cond, msg, extra) {
  console.log((cond ? "  \u2713 " : "  \u2717 ") + msg + (cond || !extra ? "" : "  \u2192 " + extra));
  if (!cond) bad++;
}
function snapFiles() {
  return contrib.snapshots(F).map(function (s) { return path.basename(s.path); }).sort();
}
function contentsInSnapshots() {
  return contrib
    .snapshots(F)
    .map(function (s) { return fs.readFileSync(s.path, "utf8").trim().split("\n")[2]; })
    .sort()
    .join(",");
}

console.log("== 毫秒精度 + 撞名不覆盖 ==");
fs.writeFileSync(F, A, "utf8");
contrib.backupTex(F, 20);
fs.writeFileSync(F, B, "utf8"); // 紧接着（同一秒内）写第二版
contrib.backupTex(F, 20);
const s2 = snapFiles();
ok(s2.length === 2, "同一秒内两次内容不同的快照 = 2 份（毫秒精度生效）", s2.join(" | "));
ok(contentsInSnapshots() === "AAA,BBB", "两份快照内容分别是 AAA / BBB，谁都没被覆盖", contentsInSnapshots());

console.log("\n== 幂等：内容未变不产生噪声快照 ==");
contrib.backupTex(F, 20);
ok(snapFiles().length === 2, "内容不变再备份一次仍是 2 份", String(snapFiles().length));

console.log("\n== 回退：改坏 → 恢复（原先失败的路径） ==");
fs.writeFileSync(F, C, "utf8"); // 模拟「改坏了」，且比最新快照新
const r = contrib.restoreSnapshot(F, null); // 不指定 stamp → 取最新（BBB）
ok(r.ok, "restoreSnapshot 返回成功", JSON.stringify(r));
ok(fs.readFileSync(F, "utf8") === B, "恢复后文件内容 = 快照 BBB（逐字节一致）", JSON.stringify(fs.readFileSync(F, "utf8")));
ok(snapFiles().length === 3, "恢复前把改坏的 CCC 另存为安全快照（3 份）", snapFiles().join(" | "));
ok(contentsInSnapshots() === "AAA,BBB,CCC", "三份快照齐全，未发生任何覆盖", contentsInSnapshots());

console.log("\n== 指定时间戳恢复 ==");
const oldest = contrib.snapshots(F).filter(function (s) { return fs.readFileSync(s.path, "utf8") === A; })[0];
const r2 = contrib.restoreSnapshot(F, oldest.stamp);
ok(r2.ok && r2.from === oldest.stamp, "按 stamp 精确恢复成功", JSON.stringify(r2));
ok(fs.readFileSync(F, "utf8") === A, "文件回到 AAA");

console.log("\n== 保留份数上限 ==");
for (let i = 0; i < 8; i++) {
  fs.writeFileSync(F, A.replace("AAA", "v" + i), "utf8");
  contrib.backupTex(F, 5);
}
ok(contrib.snapshots(F).length === 5, "historyKeep=5 时快照数被压到 5", String(contrib.snapshots(F).length));

console.log("\n== 清单可读性 ==");
const list = contrib.historyProtocol(F, 3);
ok(/^\u{1F5C2}/u.test(list) || /🗂/.test(list), "清单有标题行", list.split("\n")[0]);
ok(/\[\s\]\s#1\s\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(list), "条目形如「[ ] #1 2026-09-22 14:46:32 · x KB」", list.split("\n")[1]);

console.log("\n" + (bad === 0 ? "\u2705 快照安全回归全部通过" : "\u274c " + bad + " 项失败"));
process.exitCode = bad ? 1 : 0;
