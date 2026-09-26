/* 宿主 app.asar 里 dualView 的全部出现处 —— 用来判断：
 * ① 标签栏那个「可视化 | 源码」开关的按钮文字，是读插件声明的 dualView[] 还是宿主硬编码；
 * ② 开关渲染在哪个位置（标签栏 / 标题栏）。 */
const fs = require("fs");

const P = "D:/Notrat/resources/app.asar";
const NEEDLE = "dualView";
const CH = 32 * 1024 * 1024;
const fd = fs.openSync(P, "r");
const buf = Buffer.alloc(CH);
let pos = 0;
let tail = "";
let read;
let idx = 0;
const out = [];
while ((read = fs.readSync(fd, buf, 0, CH, pos)) > 0) {
  const s = tail + buf.toString("latin1", 0, read);
  let i = 0;
  while ((i = s.indexOf(NEEDLE, i)) !== -1) {
    out.push({ i: idx++, ctx: s.slice(Math.max(0, i - 420), i + 520) });
    i += NEEDLE.length;
  }
  tail = s.slice(-200);
  pos += read;
}
fs.closeSync(fd);
fs.writeFileSync(".setup/out-dualview-hits.json", JSON.stringify(out, null, 2));
console.log("dualView hits:", out.length, "-> .setup/out-dualview-hits.json");
