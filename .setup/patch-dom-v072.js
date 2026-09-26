/* 给 check-v070-dom.js 补上 v0.7.2 的验收：
 *   1) vm 上下文注入 LPC（富渲染卡片的依赖）
 *   2) 新增 [7] 段：卡片是「富预览」而不是源码堆砌，且源码仍完整保留
 * 全部用 String.fromCharCode(92) 拼反斜杠，避免转义歧义。
 */
const fs = require("fs");
const p = ".setup/check-v070-dom.js";
let s = fs.readFileSync(p, "utf8");
const BS = String.fromCharCode(92);
const B4 = BS + BS + BS + BS;   // 文件里要写 4 个反斜杠 → JS 运行期 2 个

/* ---------- 1) ctx 注入 LPC ---------- */
const ctxFrom = "Number: Number, RegExp: RegExp, JSON: JSON };";
const ctxTo = "Number: Number, RegExp: RegExp, JSON: JSON,\n  /* v0.7.2：原子卡片用只读预览内核做富渲染，测试里也得给 */\n  LPC: require(path.join(ws, \"server\", \"preview-core.js\")) };";
if (s.split(ctxFrom).length - 1 !== 1) { console.error("ctx 锚点异常"); process.exit(1); }
s = s.replace(ctxFrom, ctxTo);

/* ---------- 2) 新增 [7] 段 ---------- */
const anchor = 'console.log("' + BS + 'n" + "-".repeat(52));';
if (s.split(anchor).length - 1 !== 1) { console.error("汇总锚点异常"); process.exit(1); }

const section = [
  '',
  'console.log("' + BS + 'n[7] v0.7.2：原子卡片是「富预览」而不是源码堆砌");',
  'const BS = String.fromCharCode(92);',
  'const EQ_OPEN = BS + "begin{equation}";',
  'const cards = root.querySelectorAll(".wys-card");',
  'let eqCard = null;',
  'for (let ci = 0; ci < cards.length; ci++) { if (cards[ci].querySelector(".pv-eq")) { eqCard = cards[ci]; break; } }',
  'ok("卡片里有富渲染出来的公式节点 .pv-eq", !!eqCard);',
  'ok("卡片同时保留源码，可随时切回（.wys-card-src）",',
  '  eqCard ? eqCard.querySelector("pre.wys-card-src") && eqCard.querySelector("pre.wys-card-src").textContent.indexOf(EQ_OPEN) >= 0 : false);',
  'ok("默认视图是富预览：卡片正文里不再出现 LaTeX 源码字样",',
  '  eqCard ? eqCard.querySelector(".wys-card-body").textContent.indexOf(EQ_OPEN) < 0 : false,',
  '  eqCard ? eqCard.querySelector(".wys-card-body").textContent.slice(0, 80) : "");',
  'ok("每张卡片都有「源码」「定位」两个显式出口（唯一会离开预览的入口）",',
  '  Array.prototype.every.call(cards, (el) => el.querySelector(String.fromCharCode(91) + \'data-act="src"\' + String.fromCharCode(93)) && el.querySelector(String.fromCharCode(91) + \'data-act="goto"\' + String.fromCharCode(93))));',
  'let rebaseOk = true, rebaseBad = "";',
  'for (let ci = 0; ci < cards.length; ci++) {',
  '  const cardLn = parseInt(cards[ci].getAttribute("data-line"), 10);',
  '  const inner = cards[ci].querySelectorAll(".wys-card-body [data-line]");',
  '  for (let j = 0; j < inner.length; j++) {',
  '    const v = parseInt(inner[j].getAttribute("data-line"), 10);',
  '    if (!(v >= cardLn)) { rebaseOk = false; rebaseBad = "卡片 L" + cardLn + " 里出现 data-line=" + v; }',
  '  }',
  '}',
  'ok("卡片内富渲染的 data-line 已平移成绝对行号（都 >= 卡片起始行）", rebaseOk, rebaseBad);',
  '',
  'console.log("' + BS + 'n[8] v0.7.2：预览里的跳转不再偷换视图（源码依据检查）");',
  'const editorSrc = fs.readFileSync(path.join(ws, "panels", "editor.tsx"), "utf8");',
  'ok("gotoLine 里没有「预览就切分屏」的老逻辑",',
  '  editorSrc.indexOf(String.fromCharCode(34) + "preview" + String.fromCharCode(34) + ") setView(" + String.fromCharCode(34) + "split" + String.fromCharCode(34) + ")") < 0);',
  'ok("存在预览内定位实现 revealInPreview", editorSrc.indexOf("function revealInPreview(") >= 0);',
  'ok("切视图只剩「显式定位」这一条路（gotoSourceAt）", editorSrc.indexOf("function gotoSourceAt(") >= 0);',
  '',
].join("\n");

s = s.replace(anchor, section + anchor);
fs.writeFileSync(p, s, "utf8");
console.log("已补 check-v070-dom.js");
console.log("  ctx 注入 LPC ✓");
console.log("  新增 [7] 富预览卡片断言 / [8] 跳转不换视图断言 ✓");
