/* 复核：当前装机版宿主到底认不认 editors[].modes（N 态）？
 * 上次扫的结果是 0 命中。用户说「目前支持了呀」——重新取证，把判定依据留档。
 * app.asar 908MB：流式扫描，32MB 一块，带 200 字节重叠防截断。 */
const fs = require("fs");

const P = "D:/Notrat/resources/app.asar";
const NEEDLES = [
  "dualView[",
  "props.modes",
  '"modes"',
  "modes:Array.isArray",
  "Array.isArray(Bn.modes)",
  "Array.isArray(it.modes)",
  "Array.isArray(e.modes)",
  "editorModes",
  "modeIds",
  "setEditorMode",
  "editorMode:",
];
const counts = Object.fromEntries(NEEDLES.map((n) => [n, 0]));
const hits = [];

const CH = 32 * 1024 * 1024;
const fd = fs.openSync(P, "r");
const buf = Buffer.alloc(CH);
let pos = 0, tail = "", read;
while ((read = fs.readSync(fd, buf, 0, CH, pos)) > 0) {
  const s = tail + buf.toString("latin1", 0, read);
  for (const n of NEEDLES) {
    let i = 0;
    while ((i = s.indexOf(n, i)) !== -1) {
      counts[n]++;
      if (hits.length < 40) hits.push({ needle: n, off: pos + i, ctx: s.slice(Math.max(0, i - 600), i + 800) });
      i += n.length;
    }
  }
  tail = s.slice(-200);
  pos += read;
}
fs.closeSync(fd);
console.log("asar mtime:", fs.statSync(P).mtime.toISOString(), "| size:", (fs.statSync(P).size / 1024 / 1024).toFixed(0) + "MB");
console.log(JSON.stringify(counts, null, 2));
fs.writeFileSync(".setup/out-v083-modes2.json", JSON.stringify(hits, null, 2));
console.log("hits ->", hits.length);
