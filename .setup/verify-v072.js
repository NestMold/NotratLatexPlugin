/* v0.7.2 产物级复核：直接读装机 JSON，不信任「我改过了」 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const p = path.join(os.homedir(), ".notrat", "plugins", "notrat-latex-plugin.json");
const st = fs.statSync(p);
const m = JSON.parse(fs.readFileSync(p, "utf8"));
const src = m.contributions.editors[0].source;

let bad = 0;
const ok = (name, cond, extra) => {
  if (cond) console.log("  ok    " + name);
  else { bad++; console.log("  FAIL  " + name + (extra ? "  → " + extra : "")); }
};

console.log("装机包：" + p);
console.log("大小 " + (st.size / 1024).toFixed(1) + " KB   改于 " + st.mtime.toISOString());
console.log("版本 " + m.version);
console.log("");
console.log("── 清单 ──");
ok("JSON 可解析 / editors[0].source 存在", typeof src === "string" && src.length > 1000);
ok("版本 = 0.7.2", m.version === "0.7.2", m.version);
ok("mcpServers 是数组形态（0.2.3 事故防线）", Array.isArray(m.mcpServers));
ok("无 module.exports 残留（0.3.0 事故防线）", !/^\s*module\.exports/m.test(src));

console.log("");
console.log("── v0.7.2 的行为标志 ──");
const oldSplit = 'if (view === "preview") setView("split")';
ok("老逻辑「预览就切分屏」已消失", src.indexOf(oldSplit) < 0);
ok("有 revealInPreview（预览内定位）", src.indexOf("function revealInPreview(") >= 0);
ok("有 gotoSourceAt（唯一显式切视图入口）", src.indexOf("function gotoSourceAt(") >= 0);
ok("有 richBlockHtml（卡片富渲染）", src.indexOf("function richBlockHtml(") >= 0);
ok("卡片富渲染真的调了预览内核", src.indexOf("LPC.renderPreview(src, { renderMath: renderMath") >= 0);
ok("有 loadAssetsIn（富渲染卡片里的图也懒加载）", src.indexOf("function loadAssetsIn(") >= 0);
ok("卡片工具条走 mousedown", src.indexOf("function onPreviewMouseDown(") >= 0);
ok("卡片带两个显式出口按钮", src.indexOf('data-act="src"') >= 0 && src.indexOf('data-act="goto"') >= 0);
ok("卡片有富预览体 + 源码体两个容器", src.indexOf("wys-card-body") >= 0 && src.indexOf("wys-card-src") >= 0);
ok("顶栏用 VIEWS 分段控件", src.indexOf("const VIEWS = [") >= 0);
ok("插入按钮收进 INSERTS 菜单", src.indexOf("const INSERTS = [") >= 0);
ok("可视化侧视图有记忆（lastPvView）", src.indexOf("lastPvView") >= 0);

console.log("");
console.log("── 顺序 / 结构 ──");
const iRm = src.indexOf("const renderMath = useMemo");
/* 依赖数组现在都带上了 baseDir，按「第一个含 renderMath 的依赖数组」定位 */
const iDep = src.indexOf("content, renderMath");
const nDep = src.split("[content, renderMath, baseDir]);").length - 1;
ok("renderMath 声明先于依赖数组（0.7.0 TDZ 事故防线）", iRm >= 0 && iDep > iRm, "声明 " + iRm + " / 首个依赖 " + iDep);
ok("含 renderMath 的依赖数组共 2 处（wys / 预览），无遗漏", nDep === 2, "实测 " + nDep);
const iBd = src.indexOf("const baseDir = useMemo");
const iWysDep = src.indexOf("[content, renderMath, baseDir]");
ok("baseDir 声明先于 wys 依赖数组（本次新增的同类风险）", iBd >= 0 && iWysDep > iBd, "声明 " + iBd + " / 依赖 " + iWysDep);
ok("baseDir 只声明一次（上移后没留副本）", src.split("const baseDir = useMemo").length - 1 === 1);

console.log("");
console.log(bad === 0 ? "✓ 产物复核全部通过" : "✗ 产物复核有 " + bad + " 项未通过");
process.exit(bad === 0 ? 0 : 1);
