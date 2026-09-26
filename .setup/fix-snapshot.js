/* 修复：快照时间戳秒级精度导致同秒覆盖（回退时可能把好快照覆盖成坏内容）
 *
 * 三处加固：
 *   ① stampNow 加毫秒（同秒不再撞名）
 *   ② backupTex 落盘前做存在性检查，撞名自动加 -1/-2 后缀（绝不覆盖既有快照）
 *   ③ restoreSnapshot 先把目标快照读进内存，再做安全备份，最后用内存内容写回
 *      —— 即便安全备份那一步出了任何意外，恢复结果依然是正确的
 *   ④ historyProtocol 把时间戳显示成人能读的形式
 */
const fs = require("fs");
const P = "E:/notrat-latex-plugin/server/contrib.js";
let src = fs.readFileSync(P, "utf8");
let fail = 0;

function sub(needle, repl, label) {
  if (src.indexOf(needle) < 0) {
    console.error("  \u2717 锚点未命中: " + label);
    fail++;
    return;
  }
  src = src.split(needle).join(repl);
  console.log("  \u2713 " + label);
}

/* ① 毫秒精度 */
sub(
  '  return "" + t.getFullYear() + p(t.getMonth() + 1) + p(t.getDate()) + "-" + p(t.getHours()) + p(t.getMinutes()) + p(t.getSeconds());',
  '  const ms = String(t.getMilliseconds()).padStart(3, "0");\n' +
    '  return "" + t.getFullYear() + p(t.getMonth() + 1) + p(t.getDate()) + "-" + p(t.getHours()) + p(t.getMinutes()) + p(t.getSeconds()) + ms;',
  "① stampNow 毫秒精度"
);

/* ② 落盘防覆盖 */
sub(
  '  const dest = path.join(dir, baseName(filePath) + "." + stampNow() + ".tex");\n' +
    '  try {\n' +
    '    fs.writeFileSync(dest, cur, "utf8");',
  '  // 撞名绝不覆盖（同毫秒的极端情况下加序号），任何既有快照都必须保住\n' +
    '  let dest = path.join(dir, baseName(filePath) + "." + stampNow() + ".tex");\n' +
    '  for (let k = 1; fs.existsSync(dest) && k < 1000; k++)\n' +
    '    dest = path.join(dir, baseName(filePath) + "." + stampNow() + "-" + k + ".tex");\n' +
    '  try {\n' +
    '    fs.writeFileSync(dest, cur, "utf8");',
  "② backupTex 撞名不覆盖"
);

/* ③ 恢复先读进内存 */
sub(
  '  const safety = backupTex(filePath, 60);\n' +
    '  try {\n' +
    '    fs.copyFileSync(target.path, filePath);\n' +
    '  } catch (e) {\n' +
    '    return { ok: false, message: "恢复失败: " + e.message };\n' +
    '  }',
  '  // 先把目标快照内容读进内存：之后无论安全备份那步发生什么，恢复结果都正确\n' +
    '  let content = "";\n' +
    '  try {\n' +
    '    content = fs.readFileSync(target.path, "utf8");\n' +
    '  } catch (e) {\n' +
    '    return { ok: false, message: "读取快照失败: " + e.message };\n' +
    '  }\n' +
    '  const safety = backupTex(filePath, 60);\n' +
    '  try {\n' +
    '    fs.writeFileSync(filePath, content, "utf8");\n' +
    '  } catch (e) {\n' +
    '    return { ok: false, message: "恢复写入失败: " + e.message };\n' +
    '  }',
  "③ restoreSnapshot 内存回写"
);

/* ④ 时间戳人性化显示 */
sub(
  '    out.push("[ ] #" + (i + 1) + " " + snaps[i].stamp + " · " + kb.toFixed(1) + " KB");',
  '    out.push("[ ] #" + (i + 1) + " " + prettyStamp(snaps[i].stamp) + " · " + kb.toFixed(1) + " KB");',
  "④ 清单用可读时间"
);
sub(
  '  out.push("🗂 " + path.basename(filePath) + " · 快照 " + snaps.length + " 份" + (snaps.length ? "（最新 " + snaps[0].stamp + "）" : ""));',
  '  out.push("🗂 " + path.basename(filePath) + " · 快照 " + snaps.length + " 份" + (snaps.length ? "（最新 " + prettyStamp(snaps[0].stamp) + "）" : ""));',
  "④ 标题用可读时间"
);

/* prettyStamp 实现 + 导出 */
if (src.indexOf("function prettyStamp") < 0) {
  const anchor = "function histDir(filePath) {";
  const impl =
    '/** 20260922-144632123 → 2026-09-22 14:46:32 */\n' +
    "function prettyStamp(s) {\n" +
    '  const m = /^(\\d{4})(\\d{2})(\\d{2})-(\\d{2})(\\d{2})(\\d{2})(?:\\d{3})?(-\\d+)?$/.exec(String(s || ""));\n' +
    '  if (!m) return String(s || "");\n' +
    '  return m[1] + "-" + m[2] + "-" + m[3] + " " + m[4] + ":" + m[5] + ":" + m[6] + (m[7] || "");\n' +
    "}\n\n";
  sub(anchor, impl + anchor, "⑤ prettyStamp 实现");
  sub("  envReal: envReal,", "  prettyStamp: prettyStamp,\n  envReal: envReal,", "⑤ prettyStamp 导出");
}

if (fail) {
  console.error("\n❌ " + fail + " 处未命中，未写盘");
  process.exitCode = 1;
} else {
  fs.writeFileSync(P, src, "utf8");
  console.log("\n✅ 修复已写入 server/contrib.js");
}
