/* 复核 v3：运行中的宿主到底认不认 editors[].modes（N 态）
 * 上一版只搜了 props.modes / modes:Array.isArray 这两个字面量 —— 压缩后的代码
 * 不会长这样，负证据不够硬。这一版换「行为锚点」：onModeSwitch / supportsEditMode /
 * dualView 的真实用法 + 中文模式名（分屏/多模式）的 UTF-8 字节。 */
const fs = require("fs");
const P = process.argv[2] || "D:/Notrat/resources/app.asar";
const st = fs.statSync(P);
console.log("file  :", P);
console.log("mtime :", st.mtime.toISOString(), "| size:", (st.size / 1048576).toFixed(0) + "MB");

const NEEDLES = ["onModeSwitch", "supportsEditMode", "dualView", "editorModes", "modes:[{", "ModeSwitch("];
const CN = ["分屏", "多模式", "可视化"];
const counts = {};
NEEDLES.forEach((n) => (counts[n] = 0));
CN.forEach((c) => (counts["CN:" + c] = 0));
const hits = [];

const CH = 32 << 20;
const fd = fs.openSync(P, "r");
const buf = Buffer.alloc(CH);
let pos = 0, tailStr = "", tailBuf = Buffer.alloc(0), read;
while ((read = fs.readSync(fd, buf, 0, CH, pos)) > 0) {
  const chunk = buf.subarray(0, read);
  const s = tailStr + chunk.toString("latin1");
  const nb = Buffer.concat([tailBuf, chunk]);
  for (const n of NEEDLES) {
    let i = 0;
    while ((i = s.indexOf(n, i)) !== -1) {
      counts[n]++;
      if (hits.length < 60) hits.push({ n, off: pos + i, ctx: s.slice(Math.max(0, i - 520), i + 720) });
      i += n.length;
    }
  }
  for (const c of CN) {
    const b = Buffer.from(c, "utf8");
    let i = 0;
    while ((i = nb.indexOf(b, i)) !== -1) {
      counts["CN:" + c]++;
      if (hits.length < 90) hits.push({ n: "CN:" + c, off: pos + i, ctx: nb.subarray(Math.max(0, i - 420), i + 520).toString("utf8") });
      i += b.length;
    }
  }
  tailStr = s.slice(-400);
  tailBuf = nb.subarray(Math.max(0, nb.length - 400));
  pos += read;
}
fs.closeSync(fd);
console.log(JSON.stringify(counts, null, 2));
fs.writeFileSync(".setup/out-v083-modes3.json", JSON.stringify(hits, null, 2));
console.log("hits ->", hits.length);
