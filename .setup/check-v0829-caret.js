/* 层 [26] —— v0.8.29：两件用户实测报上来的事
 *
 * 用户两句原话：
 *   「鼠标点击到块末尾的时候没有看到光标呢」
 *   「在编辑器内无法全选呢」
 *
 * ① 「点块末尾没光标」的根因**不是**忘了设光标，而是**那个位置在浏览器里没有几何**：
 *    段末那串 <br> 是光标落脚点，可 <br> 之后一个节点都没有时，Chromium 算不出这一行的
 *    几何 —— Range.getBoundingClientRect() 返回 0,0,0,0，屏幕上一个光标都画不出来。
 *    （真 Chromium 探针实测；在同一行放一个零宽占位后，同一处 rect 立刻变成真实坐标。）
 *    修法：每条空落脚行放一个零宽字符（U+200B）—— 零宽（视觉不存在）+ 读回时被归一化掉
 *    （源码一个字节不多）。落地在五个入口：Shift+Enter 段内换行 / Enter 新段落 /
 *    「¶ 新段落」按钮 / 点空白处的 caretToNearest / 点正文块（先补齐再交回浏览器）。
 *
 * ② 「无法全选」的取证：本插件没有任何一处拦 Ctrl+A（onCtrlSlash / onFmtKey /
 *    onWysKeyDown 都不认这个键）；真 Chromium 里焦点落在编辑宿主上时原生本来能全选 ——
 *    也就是说「能全选」这件事**依赖焦点恰好落在 .wys-editroot 上**。本层有两个可编辑面
 *    （可视化档的唯一宿主 / 源码档的 textarea），焦点还可能停在只读孤岛、块间空隙、容器上，
 *    那些时刻原生 SelectAll 就落空。修法：Ctrl+A 由插件自己定义（= 这一栏的全部内容），
 *    挂在 window 捕获阶段（比宿主那层任何监听都早）；自己没做成一律**放行**，绝不吞成空动作。
 *
 * 四段：
 *   [A] 纯函数行为（jsdom 真 DOM）：占位怎么补 / 幂等 / 只碰尾随串 / **读回逐字节不变**
 *   [B] Ctrl+A 自持：源码结构与边界（只认这一下 / 焦点不在本编辑器不抢 / 做不成放行）
 *   [C] 真 Chromium 复验（可选）：点段末空行 —— 无占有 0,0 / 有占真实坐标
 *   [D] 装机产物核对
 *
 * 运行： node .setup/check-v0829-caret.js
 *   [C] 段默认跳过（要起浏览器）；跑它：NOTRAT_CARET_BROWSER=1 node .setup/check-v0829-caret.js
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const DIR = __dirname;
const WS = path.join(DIR, "..");
const M = "C:/Users/Administrator/.notrat/plugins/notrat-latex-plugin.json";
let fail = 0;

function ok(name, cond, extra) {
  if (cond) console.log("  ok    " + name);
  else { fail++; console.log("  FAIL  " + name + (extra !== undefined ? "\n        → " + extra : "")); }
}

const SRC = fs.readFileSync(path.join(WS, "panels/editor.tsx"), "utf8");
let ART = "";
try { ART = fs.readFileSync(M, "utf8"); } catch (e) { ART = ""; }
const ART_VER = ART ? (() => { try { return JSON.parse(ART).version; } catch (e) { return null; } })() : null;
const ART_SRC = ART ? (() => {
  try { const j = JSON.parse(ART); const ed = (j.contributions.editors || [])[0] || {}; return ed.source || ""; } catch (e) { return ""; }
})() : "";
const MF = JSON.parse(fs.readFileSync(path.join(WS, "manifest.json"), "utf8"));

/* ---------- 抠函数（源码里那几个纯函数） ---------- */
function cutFn(src, startMark) {
  const i = src.indexOf(startMark);
  if (i < 0) return null;
  const j = src.indexOf("\n}\n", i);
  if (j < 0) return null;
  return src.slice(i, j + 2);
}
function cutMethod(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) return null;
  const j = src.indexOf("\n  }\n", start);
  return j < 0 ? null : src.slice(start, j + 4);
}
function cutLine(src, prefix) {
  const i = src.indexOf(prefix);
  if (i < 0) return null;
  const j = src.indexOf("\n", i);
  return src.slice(i, j < 0 ? undefined : j);
}

/* ================= [A] 零宽占位：纯函数行为（jsdom 真 DOM） ================= */
console.log("\n[A] 空落脚行的零宽占位：补在哪 / 幂等 / 只碰尾随串 / 读回不变");

const segZw = cutLine(SRC, "const WYS_ZWSP =");
const segEnsure = cutFn(SRC, "function wysEnsureLandingLine(el) {");
const segD2T = cutFn(SRC, "function wysDomToTex(root) {");
const segB2T = cutFn(SRC, "function wysBlockTex(root) {");
ok("四个定义都在（WYS_ZWSP / wysEnsureLandingLine / wysDomToTex / wysBlockTex）",
  !!segZw && !!segEnsure && !!segD2T && !!segB2T,
  [segZw, segEnsure, segD2T, segB2T].map((x) => x == null ? "缺" : "有").join("/"));

if (segZw && segEnsure && segD2T && segB2T) {
  const { JSDOM } = require("jsdom");
  const factory = new Function(
    [segD2T, segZw, segEnsure, segB2T].join("\n") +
    "\nreturn { WYS_ZWSP: WYS_ZWSP, wysEnsureLandingLine: wysEnsureLandingLine, wysDomToTex: wysDomToTex, wysBlockTex: wysBlockTex };"
  );
  const core = factory();
  const ZW = String.fromCharCode(8203);
  ok("占位就是零宽字符 U+200B（不是 NBSP / 不是空格 —— 后者会进源码）",
    core.WYS_ZWSP === ZW, JSON.stringify(core.WYS_ZWSP));

  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const doc = dom.window.document;
  function span(htmlStr) {
    const s = doc.createElement("span");
    s.className = "wys-edit";
    s.innerHTML = htmlStr;
    doc.body.appendChild(s);
    return s;
  }
  function kids(el) {
    return Array.prototype.map.call(el.childNodes, function (n) {
      if (n.nodeType === 3) return n.nodeValue === ZW ? "ZW" : JSON.stringify(String(n.nodeValue));
      return n.tagName;
    });
  }

  /* ---- ① 补两条尾巴：两个 <br> 各配一个占位 ---- */
  const e1 = span("正文<br><br>");
  const before1 = core.wysBlockTex(e1);
  const lastZw = core.wysEnsureLandingLine(e1);
  ok("★ 两个 <br> 之后各补一个占位（补出来的就是尾随那一串）",
    JSON.stringify(kids(e1)) === JSON.stringify(["\"正文\"", "BR", "ZW", "BR", "ZW"]),
    JSON.stringify(kids(e1)));
  ok("★ 返回的是**最靠后**那个占位（调用方拿它定光标）",
    !!lastZw && lastZw.nodeType === 3 && lastZw === e1.lastChild && lastZw.nodeValue === ZW);
  ok("★★ 读回逐字节不变（占位被归一化掉 —— 源码一个字节都不多）",
    core.wysBlockTex(e1) === before1 && before1 === "正文\n",
    JSON.stringify([before1, core.wysBlockTex(e1)]));

  /* ---- ② 幂等：再补一次不长新节点 ---- */
  const n1 = e1.childNodes.length;
  core.wysEnsureLandingLine(e1);
  core.wysEnsureLandingLine(e1);
  ok("★ 幂等：连补三次节点数不变（连按回车不会越堆越多）",
    e1.childNodes.length === n1, n1 + " → " + e1.childNodes.length);

  /* ---- ③ 只碰尾随串：正文中间的 <br> 一个不动 ---- */
  const e2 = span("甲<br>乙");
  const snap2 = JSON.stringify(kids(e2));
  const r2 = core.wysEnsureLandingLine(e2);
  ok("★ 只碰**尾随**的那一串：中间有真实内容的 <br> 不补（返回 null）",
    r2 === null && JSON.stringify(kids(e2)) === snap2, JSON.stringify(kids(e2)));

  /* ---- ④ 读回不变：几种形态都验一遍 ---- */
  const shapes = ["正文", "正文<br>", "正文<br><br>", "甲<br>乙", "甲<br><br>乙"];
  let same = true, detail = [];
  for (const sh of shapes) {
    const el = span(sh);
    const a = core.wysBlockTex(el);
    core.wysEnsureLandingLine(el);
    const b = core.wysBlockTex(el);
    if (a !== b) { same = false; detail.push(sh + " → " + JSON.stringify(a) + " vs " + JSON.stringify(b)); }
  }
  ok("★★ 五种形态：补占位前后，块级读回逐字节相同（" + shapes.join(" / ") + "）",
    same, detail.join(" ; "));

  /* ---- ⑤ 回车语义：两条空落脚行 = 恰好一个空行 = 一个新段落 ---- */
  const e3 = span("正文<br><br>");
  core.wysEnsureLandingLine(e3);
  ok("★★ 回车之后（正文 + 两条空落脚行 + 占位）读回 = 「正文\\n」＝恰好一个空行",
    core.wysBlockTex(e3) === "正文\n", JSON.stringify(core.wysBlockTex(e3)));
  e3.appendChild(doc.createTextNode("新段"));
  ok("★★ 在新行续写后 = 「正文\\n\\n新段」＝两段（空行就是分段，一个字不多）",
    core.wysBlockTex(e3) === "正文\n\n新段", JSON.stringify(core.wysBlockTex(e3)));

  /* ---- ⑥ 占位位置不影响读回：夹在字中间也照样被吃掉 ---- */
  const e4 = span("正<br>文");
  e4.firstChild.nodeValue = "正" + ZW;
  ok("★ 占位无论落在哪儿都被归一化掉（不会写进 .tex）",
    core.wysDomToTex(e4).indexOf(ZW) < 0, JSON.stringify(core.wysDomToTex(e4)));

  /* ---- ⑦ Shift+Enter 语义没被带坏 ---- */
  const e5 = span("正文<br>" + ZW);
  ok("段内换行（一个 <br> + 占位）读回 = 「正文」（段末那个落脚换行照旧被吃掉）",
    core.wysBlockTex(e5) === "正文", JSON.stringify(core.wysBlockTex(e5)));
}

/* ================= [B] Ctrl+A 自持：结构与边界 ================= */
console.log("\n[B] Ctrl+A 自持（可视化档选整篇 / 源码档选全文；只认这一下，做不成放行）");

const iSel = SRC.indexOf("function onSelectAllKey(e) {");
const jSel = iSel < 0 ? -1 : SRC.indexOf("\n    }\n", iSel);
const segSel = (iSel < 0 || jSel < 0) ? null : SRC.slice(iSel, jSel + 2);
ok("★ 有 onSelectAllKey 这颗处理器", !!segSel);

if (segSel) {
  ok("★ 只认「Ctrl/Cmd+A」这一下（Shift / Alt 组合一律不碰 —— 不越界）",
    segSel.indexOf('if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;') >= 0
    && segSel.indexOf('if (k !== "a" && e.code !== "KeyA") return;') >= 0);
  ok("★ 就地编辑浮层开着 → 让浮层自己的 textarea 全选（不插手别人的文本框）",
    segSel.indexOf("if (atomEditRef.current) return;") >= 0);
  ok("★ 焦点不在本编辑器里（宿主搜索框 / 侧栏）→ 一律不抢",
    segSel.indexOf("if (!inRoot) return;") >= 0
    && segSel.indexOf("root0.contains") >= 0);
  ok("★ 源码 / 分屏档：焦点在 textarea 上 → 选全文",
    segSel.indexOf("if (ta0.select) ta0.select();") >= 0);
  ok("★ 可视化档：选整篇编辑宿主（不是「当前块」）",
    segSel.indexOf("selectNodeContents(host0)") >= 0);
  const iDone = segSel.indexOf("if (!done) return;");
  const iPrev = segSel.indexOf("if (e.preventDefault) e.preventDefault();");
  ok("★★ 做不成（没有 Range / 没有 Selection）一律**放行**给原生 —— 顺序上先判 done 再 preventDefault",
    iDone >= 0 && iPrev > iDone,
    "done@" + iDone + " preventDefault@" + iPrev);
  ok("★ 拦下来之后挡住宿主那一层（stopPropagation —— 免得它把这下当自己的键）",
    segSel.indexOf("if (e.stopPropagation) e.stopPropagation();") > iDone);
}
ok("★ 挂在 window 的**捕获**阶段（比宿主那层任何监听都早，谁也吃不掉）",
  SRC.indexOf('window.addEventListener("keydown", onSelectAllKey, true);') >= 0);
ok("★ 卸载时摘干净（多开 .tex 时不许留着野监听）",
  SRC.indexOf('window.removeEventListener("keydown", onSelectAllKey, true);') >= 0);

console.log("\n[B2] 零宽占位的五个落地口（少一个就还有一处「点了没光标」）");
const segPara2 = cutMethod(SRC, "insertParaBreak");
const segBreak2 = cutMethod(SRC, "insertSoftBreak");
ok("① Enter 新段落：两条落脚行各带一个占位，光标落在第二处占位里",
  segPara2 != null
  && (segPara2.match(/createTextNode\(WYS_ZWSP\)/g) || []).length === 2
  && segPara2.indexOf("range.setStart(zw2, 1);") >= 0,
  segPara2 == null ? "切不出 insertParaBreak" : JSON.stringify((segPara2.match(/createTextNode\(WYS_ZWSP\)/g) || []).length));
ok("①′ Shift+Enter 段内换行：一个 <br> 配一个占位（不多不少）",
  segBreak2 != null && (segBreak2.match(/createTextNode\(WYS_ZWSP\)/g) || []).length === 1,
  segBreak2 == null ? "切不出 insertSoftBreak" : JSON.stringify((segBreak2.match(/createTextNode\(WYS_ZWSP\)/g) || []).length));
ok("② Shift+Enter 段内换行：落点也带占位",
  SRC.indexOf("range.setStart(zw1, 1);      // 落点自己定：占位里面 = 新起那一行的行首") >= 0);
ok("③ 点空白处（caretToNearest）：块尾先补占位，再把光标停进占位里",
  SRC.indexOf("const zw = wysEnsureLandingLine(pick.el);") >= 0
  && SRC.indexOf("if (zw && zw.parentNode) { rng.setStart(zw, 1); rng.collapse(true); }") >= 0);
ok("④ 点正文块：先把落脚行补齐，再交回浏览器（原生落点这オ画得出光标）",
  SRC.indexOf('wysEnsureLandingLine(caretHost.querySelector(".wys-edit"))') >= 0);
ok("⑤「¶ 新段落」按钮：补占位 + 光标进占位；数 <br> 时跳过占位",
  SRC.indexOf("const zw = wysEnsureLandingLine(part);   // v0.8.29：补齐空落脚行，光标才有几何") >= 0
  && SRC.indexOf("if (c.nodeType === 3 && String(c.nodeValue) === WYS_ZWSP) continue;") >= 0);
ok("★ 「已经在空段落上」的判据跳过占位（否则回车会一直往源码里堆空行）",
  SRC.indexOf("if (isZw(n)) continue;") >= 0);
ok("★ 预览栏两条灰边也送光标进正文块（文档列有 maxWidth，那两条边不在 pv-root 里）",
  SRC.indexOf("if (r0 && r0.contains && ev.target && r0.contains(ev.target)) return;") >= 0);

/* ================= [C] 真 Chromium 复验（可选） ================= */
console.log("\n[C] 真 Chromium 复验：点段末空行 —— 无占位 rect = 0,0 / 有占位真实坐标");
if (process.env.NOTRAT_CARET_BROWSER === "1") {
  const r = spawnSync(process.execPath, [path.join(DIR, "_probe-v0829-caret.js")], { stdio: "inherit", cwd: WS });
  ok("真浏览器复验全绿", r.status === 0, "退出码 " + r.status);
} else {
  console.log("  （跳过：要起一个真浏览器。跑法 → NOTRAT_CARET_BROWSER=1 node .setup/check-v0829-caret.js）");
}

/* ================= [D] 装机产物核对 ================= */
console.log("\n[D] 装机产物核对（发布出去的那份必须有这一改）");
if (!ART_SRC) {
  console.log("  （装机产物不可读 —— 跳过核对；先 npm run build）");
} else {
  ok("产物版本与 manifest.json 一致（发布的就是源码这一版）",
    ART_VER === String(MF.version), "产物 " + ART_VER + " / manifest " + MF.version);
  const marks = [
    ["零宽占位常量", 'const WYS_ZWSP = "\\u200b";'],
    ["补齐落脚行的纯函数", "function wysEnsureLandingLine(el) {"],
    ["读回时归一化掉占位", '.replace(/\\u200b/g, "")'],
    ["Enter 新段落：光标进占位", "range.setStart(zw2, 1);"],
    ["Shift+Enter：光标进占位", "range.setStart(zw1, 1);"],
    ["点空白处：先补占位再停光标", "const zw = wysEnsureLandingLine(pick.el);"],
    ["点正文块：先补齐再交回浏览器", 'wysEnsureLandingLine(caretHost.querySelector(".wys-edit"))'],
    ["「¶ 新段落」：补占位", "const zw = wysEnsureLandingLine(part);"],
    ["空行判据跳过占位", "if (isZw(n)) continue;"],
    ["Ctrl+A 自持：处理器", "function onSelectAllKey(e) {"],
    ["Ctrl+A 自持：window 捕获挂载", 'window.addEventListener("keydown", onSelectAllKey, true);'],
    ["Ctrl+A 自持：做不成放行", "if (!done) return;"],
    ["Ctrl+A 自持：可视化档选整篇", "selectNodeContents(host0)"],
    ["预览栏灰边兜底", "if (r0 && r0.contains && ev.target && r0.contains(ev.target)) return;"],
  ];
  for (const [n, s2] of marks) ok(n, ART_SRC.indexOf(s2) >= 0);

  /* 反向：老写法不许留在发布件里 */
  ok("★ 产物里不再有「光标 setStartAfter(br2)」（那个落点没有几何 —— 正是这次修掉的病）",
    ART_SRC.indexOf("range.setStartAfter(br2)") < 0);
  ok("★ 产物里不再有「光标 setStartAfter(br)」",
    ART_SRC.indexOf("range.setStartAfter(br)") < 0);
}

console.log(fail
  ? "\n✗ v0.8.29 光标几何 / Ctrl+A（未过 " + fail + " 项）"
  : "\n✓ v0.8.29 光标几何 / Ctrl+A（点块末尾有光标 · 全选由插件自己说了算）");
process.exit(fail ? 1 : 0);
