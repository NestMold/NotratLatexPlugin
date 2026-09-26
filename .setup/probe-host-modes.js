/* 探测真实运行宿主（D:/Notrat/resources/app.asar）的编辑器模式契约：
 * 当前宿主只认 dualView(2 态) 还是已支持 editors[].modes(N 态)？
 * 流式扫描，只统计字面量出现次数 + dump onModeSwitch 附近上下文。 */
const fs = require("fs");

const P = "D:/Notrat/resources/app.asar";
const NEEDLES = ["onModeSwitch", "props.modes", "dualView", "editorMode", "modes:Array.isArray", "modes.length"];
const counts = Object.fromEntries(NEEDLES.map((n) => [n, 0]));
const hits = [];

const CH = 32 * 1024 * 1024;
const fd = fs.openSync(P, "r");
const buf = Buffer.alloc(CH);
let pos = 0;
let tail = "";
let read;
while ((read = fs.readSync(fd, buf, 0, CH, pos)) > 0) {
  const s = tail + buf.toString("latin1", 0, read);
  for (const n of NEEDLES) {
    let i = 0;
    while ((i = s.indexOf(n, i)) !== -1) {
      counts[n]++;
      if (hits.length < 40 && (n === "onModeSwitch" || n === "modes:Array.isArray" || n === "modes.length")) {
        hits.push({ needle: n, ctx: s.slice(Math.max(0, i - 260), i + 420) });
      }
      i += n.length;
    }
  }
  tail = s.slice(-120);
  pos += read;
}
fs.closeSync(fd);
console.log(JSON.stringify(counts, null, 2));
fs.writeFileSync(".setup/out-asar-hits.json", JSON.stringify(hits, null, 2));
console.log("hits ->", hits.length);
