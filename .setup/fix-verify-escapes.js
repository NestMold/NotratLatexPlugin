/* 一次性修正 verify 脚本里被 shell 吃掉的转义（用文件写入，绕开 shell 转义） */
const fs = require("fs");
const p = "E:/notrat-latex-plugin/.setup/verify-v040.js";
const lines = fs.readFileSync(p, "utf8").split("\n");
const R1 = 'ok(prim.every((k) => /^\\$\\{settings:[a-zA-Z]+\\}$/.test(srv.env[k])), "主变量形如 ${settings:<字段名>}（官方新文档写法）");';
const R2 = 'ok(alts.every((k) => /^\\$\\{settings:[a-zA-Z]+\\.[a-zA-Z]+\\}$/.test(srv.env[k])), "_ALT 形如 ${settings:<组名>.<字段名>}（旧 Wiki 写法）");';
let n = 0;
for (let i = 0; i < lines.length; i++) {
  if (/^\s*ok\(prim\.every/.test(lines[i])) {
    if (lines[i] === R1) continue;
    lines[i] = R1;
    n++;
  }
  if (/^\s*ok\(alts\.every/.test(lines[i])) {
    if (lines[i] === R2) continue;
    lines[i] = R2;
    n++;
  }
}
fs.writeFileSync(p, lines.join("\n"), "utf8");
console.log("fixed", n, "line(s)");
