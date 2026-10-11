"use strict";
/* =====================================================================
 * v0.9.11 验收门 —— 绘图环境不许当正文排 + 浮层按实测尺寸摆位
 *
 * 用户原话（两条连着说的）：
 *   「这一些有问题，并且这些弹窗无法自适应位置」
 *
 * 前半句是 TikZ。一张
 *     \begin{tikzpicture}[ font=…, box/.style={draw=black!55, …}, … ]
 *       \node[box] (task) at (0, 0) {用户任务};
 *       \draw[arr] (task) -- (loop);
 *     \end{tikzpicture}
 *   的图，在预览里被摊成了一地散文：
 *     「[ font=, box/.style=draw=black!55, … ] (task) at (0, 0) 用户任务; (loop) at (2.」
 *   成因是 renderEnv 落到默认分支，把图形代码交给 parseBlocks 当**正文**排；
 *   而 v0.9.1 起「未知命令不再吐名字」，于是 \node / \draw 的名字被吞掉、
 *   只剩它们的花括号与方括号参数漏成文本 —— 一半丢掉一半留下，读起来就是乱码。
 *
 * 后半句是浮层。就地编辑浮层与划词引用气泡的位置，是拿**写死的常数**钳出来的
 *   （按 556×220 / 190×56 猜浮层尺寸），量都不量：文本域一撑开（最多 14 行 ≈ 300px）
 *   浮层就钻出下边界，面板一窄右边就被推出屏幕。
 *
 * 这一层钉四个面：
 *   [A] 内核：绘图环境出占位卡，指令一个字都不落正文
 *   [B] 内核：漏了 \end 时**绝不吃掉后半篇正文**（这是最贵的一种错）
 *   [C] 摆位：fitPopup 读 offsetWidth / offsetHeight；翻上方、钳视口都算得对
 *   [D] 接线：源码与装机产物两侧一致
 *   [E] 反向自检：把上面任何一条改回去，本层必须重新变红 —— 门禁最怕断言恒真
 *
 * 运行： node .setup/check/v0911-tikz-popup.js
 * =================================================================== */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ws = "E:/notrat-latex-plugin";
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok    " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "\n        → " + String(extra).slice(0, 700) : "")); }
}

const CORE_REL = "server/preview-core.js";
const PANEL_REL = "panels/editor.tsx";
const coreSrc = fs.readFileSync(path.join(ws, CORE_REL), "utf8");
const panelSrc = fs.readFileSync(path.join(ws, PANEL_REL), "utf8");
const P = require(path.join(ws, CORE_REL));

function pv(src) { return P.renderPreview("\\begin{document}\n" + src + "\n\\end{document}\n", {}).html; }
function textOf(html) { return String(html).replace(/<[^>]*>/g, ""); }
/* 「正文」= 去掉占位卡里那段**故意原样保留**的源码，再看剩下漏了什么。
 * 把 <pre> 也算进正文的话，占位卡自己就会把断言顶红 —— 那断言就假了。 */
function proseOf(html) {
  return textOf(String(html).replace(/<pre class="pv-graphic-code">[\s\S]*?<\/pre>/g, ""));
}

/* 用户报的那份图，尽量原样 */
const TIKZ = [
  "\\begin{tikzpicture}[",
  "    font=\\small,",
  "    box/.style={draw=black!55, rounded corners=2.5pt, align=center,",
  "                 minimum height=9mm, inner sep=2.5mm, fill=black!3},",
  "    arr/.style={thick, draw=black!70, -{Stealth[length=2.2mm]}},",
  "  ]",
  "  \\node[box] (task) at (0, 0)       {用户任务};",
  "  \\node[box] (loop) at (2.9, 0)     {D2\\\\循环编排};",
  "  \\draw[arr] (task) -- (loop);",
  "\\end{tikzpicture}",
].join("\n");

console.log("\n[A] 内核：绘图环境出占位卡，指令不许落进正文");
{
  const h = pv(TIKZ);
  const prose = proseOf(h);
  ok("绘图环境出了占位卡（.pv-graphic）", /class="pv-graphic"/.test(h), h);
  ok("卡上标了这是什么图（TikZ 徽章）", /pv-graphic-badge">TikZ</.test(h), h);
  ok("说得清是在预览里不渲染（不假装渲染出来了）", h.indexOf("预览不渲染") >= 0, h);
  ok("style 选项不再漏进正文", prose.indexOf("box/.style") < 0 && prose.indexOf("draw=black!55") < 0, prose);
  ok("方括号参数不再漏进正文（没有裸露的 font= / minimum height=）",
    prose.indexOf("font=") < 0 && prose.indexOf("minimum height") < 0, prose);
  ok("\\node / \\draw 的坐标不再漏进正文", prose.indexOf("(task)") < 0 && prose.indexOf("(loop)") < 0, prose);
  ok("源码一个字没丢（原样收在占位卡的 <pre> 里）", h.indexOf("box/.style") >= 0, h);
  ok("没有把 \\end{tikzpicture} 当内容漏出来", h.indexOf("end{tikzpicture}") < 0, h);
}
{
  const h = pv("\\begin{tikzpicture}[scale=0.8]\n  \\node (a) at (0,0) {A};\n\\end{tikzpicture}\n\n后一段正文还在不在。");
  ok("裸 tikzpicture（不在 figure 里）也出卡", /class="pv-graphic"/.test(h), h);
  ok("裸 tikzpicture 之后的正文还在", textOf(h).indexOf("后一段正文还在不在。") >= 0, h);
}
{
  const h = pv("\\begin{figure}[t]\n\\centering\n" + TIKZ + "\n\\caption{五维设计空间与执行闭环}\n\\label{fig:x}\n\\end{figure}");
  ok("figure 里的图出卡（而不是把 TikZ 当图注）", /pv-graphic/.test(h) && /figcaption/.test(h), h);
  ok("图注与图号都还在", textOf(h).indexOf("五维设计空间与执行闭环") >= 0 && /图 1/.test(textOf(h)), h);
}
{
  const h = pv("\\begin{axis}[xlabel=$x$]\n\\addplot coordinates {(0,0) (1,1)};\n\\end{axis}");
  ok("同族的 pgfplots axis 也认得（不是只认 tikzpicture）", /pv-graphic/.test(h) && /PGFPlots/.test(h), h);
}

console.log("\n[A2] 盒子 / 缩放类宏：参数是尺寸，不是正文");
{
  /* 用户报的那条消息开头那个孤零零的 "!" —— 就是这一句漏出来的：
   *   \\resizebox{\\textwidth}{!}{\\begin{tikzpicture}…}
   * 第二个参数 "!"（保持长宽比）被当成正文，正好落在图的上面。 */
  const boxed = "\\begin{figure}[htbp]\n  \\centering\n  \\resizebox{\\textwidth}{!}{\n  " +
    TIKZ + "\n  }\n  \\caption{五维框架}\n\\end{figure}";
  const h = pv(boxed);
  ok("\\resizebox 的尺寸参数不落正文（那个孤零零的 \"!\" 没了）", proseOf(h).indexOf("!") < 0, proseOf(h));
  ok("\\resizebox 里的 TikZ 照样出卡", /pv-graphic/.test(h), h);
  ok("图注与图号也没被盒子宏带跑", /figcaption/.test(h) && textOf(h).indexOf("五维框架") >= 0, h);
}
{
  const t1 = textOf(pv("前 \\resizebox{2cm}{!}{缩放的内容} 后"));
  ok("\\resizebox 的内容还在（只吞尺寸）", t1.indexOf("缩放的内容") >= 0, t1);
  const t2 = textOf(pv("前 \\scalebox{0.8}{内容甲} 后"));
  ok("\\scalebox 同理", t2.indexOf("内容甲") >= 0, t2);
  const t3 = textOf(pv("前 \\rotatebox[origin=c]{90}{内容乙} 后"));
  ok("\\rotatebox 的可选参数与角度都不落正文", t3.indexOf("内容乙") >= 0 && t3.indexOf("origin=c") < 0 && t3.indexOf("90") < 0, t3);
  const t4 = textOf(pv("甲\\phantom{看不见}乙"));
  ok("\\phantom 占位但不显示", t4.indexOf("看不见") < 0 && t4.indexOf("甲乙") >= 0, t4);
}

console.log("\n[B] 漏了 \\end 时：少画一张卡可以，吃正文不行");
{
  const h = pv("\\begin{tikzpicture}[\n  node/.style={draw},\n]\n\\node (a) at (0,0) {A};\n\n这一整段正文绝不能被吞掉。\n\\section{后面的章节}\n章节正文也不能丢。");
  ok("★ 后半篇正文一个字都没少（而且是正文，不是被塞进占位卡里）", proseOf(h).indexOf("这一整段正文绝不能被吞掉。") >= 0, h);
  ok("★ 章节正文也没少（不是只保住第一段）", proseOf(h).indexOf("章节正文也不能丢。") >= 0, h);
  ok("章节结构没被吃掉（\\section 仍然是 pv-h2）", /class="pv-h pv-h2"/.test(h), h);
  ok("漏了 \\end 也照样给一句「这里是一张图」", /pv-graphic/.test(h), h);
}
{
  const h = pv("我们讨论 \\node 这个词在别处的含义，这里没有分号。\n\n第二段说明文档结构，段落边界必须保住。");
  ok("正文里出现 \\node 字样不被误吞", textOf(h).indexOf("第二段说明文档结构") >= 0, h);
  ok("段落边界保住（还是两段，不粘成一段）", (h.match(/<p /g) || []).length === 2, h);
}
{
  const long = "\\node " + "很长的正文".repeat(140) + "。";
  const h = pv(long);
  ok("分号远得离谱时不吞正文（>600 字符那道闸生效）", textOf(h).indexOf("很长的正文") >= 0, textOf(h).slice(0, 200));
}

console.log("\n[C] 摆位：fitPopup 读实测尺寸，翻上方 / 钳视口都算得对");
function extractFn(src, name) {
  const i = src.indexOf("function " + name + "(");
  if (i < 0) return null;
  const j = src.indexOf("{", i);
  if (j < 0) return null;
  let depth = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}") { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  return null;
}
function mkFit(src) {
  const sb = { window: { innerWidth: 1200, innerHeight: 800 } };
  vm.createContext(sb);
  vm.runInContext(src + "\nthis.__fit = fitPopup;", sb);
  return { sb: sb, fn: sb.__fit || sb.fitPopup };
}
function place(obj, vw, vh, ew, eh, left, bottom, top) {
  obj.sb.window.innerWidth = vw;
  obj.sb.window.innerHeight = vh;
  const el = { offsetWidth: ew, offsetHeight: eh, style: {} };
  obj.fn(el, { left: left, bottom: bottom, top: top });
  return { left: parseFloat(el.style.left), top: parseFloat(el.style.top), w: ew, h: eh, vw: vw, vh: vh };
}

const fitSrc = extractFn(panelSrc, "fitPopup");
ok("面板里有 fitPopup（摆位有了唯一的家）", !!fitSrc);
ok("它读的是实测尺寸 offsetWidth / offsetHeight",
  !!fitSrc && /offsetWidth/.test(fitSrc) && /offsetHeight/.test(fitSrc));
ok("它有一条「下面放不下就翻到上面」的判定", !!fitSrc && /flipped/.test(fitSrc));

let F = null;
if (fitSrc) {
  try { F = mkFit(fitSrc); } catch (e) { ok("fitPopup 能在沙箱里求值", false, e.message); }
}
ok("fitPopup 取到了（后面几条靠它）", !!(F && typeof F.fn === "function"));

if (F && typeof F.fn === "function") {
  /* ① 空间够：贴在锚点下方 */
  const a = place(F, 1200, 800, 400, 200, 100, 120, 100);
  ok("① 空间够就贴锚点下方（top = 锚点下沿 + 6）", a.top === 126 && a.left === 100, JSON.stringify(a));

  /* ② 下面放不下、上面有地：翻到上方（这条就是用户看到的「弹窗不跟着位置走」） */
  const b = place(F, 1200, 800, 400, 400, 100, 560, 740);
  ok("② 下面放不下就翻到上方，且整个浮层留在视口里",
    b.top < 560 && b.top >= 8 && b.top + b.h <= 800 - 8, JSON.stringify(b));

  /* ③ 两边都不够（浮层比视口还高）：钳进视口，绝不把 top 弄成负数 */
  const c = place(F, 1200, 300, 400, 320, 100, 280, 260);
  ok("③ 两边都放不下时钳进视口（top = 8，不为负）", c.top === 8, JSON.stringify(c));

  /* ④ 面板窄、锚点靠右：往回收，右边界不进屏幕外 */
  const d = place(F, 400, 800, 380, 200, 390, 200, 180);
  ok("④ 窄面板里靠右锚点往回收（left + 宽 ≤ 视口 - 8）", d.left + d.w <= 400 - 8, JSON.stringify(d));

  /* ⑤ 浮层比视口还宽：左边界仍然看得见（不越左） */
  const e = place(F, 300, 800, 380, 200, 250, 200, 180);
  ok("⑤ 浮层比视口宽时左沿仍然可见（left = 8）", e.left === 8, JSON.stringify(e));
}

console.log("\n[D] 接线与样式：源码与装机产物两侧一致");
{
  ok("旧的两条写死常数没了：W - 556", panelSrc.indexOf("W - 556") < 0);
  ok("旧的两条写死常数没了：H - 220", panelSrc.indexOf("H - 220") < 0);
  ok("旧的气泡常数没了：- 190（写死的气泡宽）", panelSrc.indexOf("- 190)") < 0);
  const uses = (panelSrc.match(/fitPopup\(/g) || []).length;
  ok("fitPopup 有接线（定义 + 浮层 + 气泡，实际 " + uses + " 处）", uses >= 3);
  ok("就地编辑浮层挂了 ref（popRef）", /ref=\{popRef\}/.test(panelSrc));
  ok("浮层与气泡都在 useLayoutEffect 里摆位（paint 前摆好，不闪）",
    (panelSrc.match(/useLayoutEffect\(/g) || []).length >= 2);
  ok(".wys-pop 有 max-height（量出来才钳得住）", /\.wys-pop\{[^}]*max-height/.test(panelSrc));
  ok(".wys-pop-ta / .wys-pop-pv 都有 max-height",
    /\.wys-pop-ta\{[^}]*max-height/.test(panelSrc) && /\.wys-pop-pv\{[^}]*max-height/.test(panelSrc));
  ok("插入菜单不再固定 430px 高（矮窗口里会捅出屏幕）", panelSrc.indexOf("maxHeight: 430") < 0);
}

{
  const pkgPath = "C:/Users/Administrator/.notrat/plugins/notrat-latex-plugin.json";
  if (!fs.existsSync(pkgPath)) {
    ok("装机包存在（没有装机包，这一层验不了接线）", false, pkgPath);
  } else {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const src = (pkg.contributions.editors[0] || {}).source || "";
    ok("装机包里有 fitPopup（面板接线真发出去了）", src.indexOf("function fitPopup") >= 0);
    ok("装机包里有 useLayoutEffect 摆位", src.indexOf("useLayoutEffect(() =>") >= 0);
    ok("装机包里有绘图占位卡样式（.pv-graphic）", src.indexOf(".pv-graphic{") >= 0);
    ok("装机包里的内核认得绘图环境（GRAPHIC_ENVS）", src.indexOf("GRAPHIC_ENVS") >= 0);
    ok("装机包里的内核有「漏 \\end 不吃正文」那条守卫",
      src.indexOf("if (endM < 0 && GRAPHIC_ENVS[name])") >= 0);
  }
}

console.log("\n[E] 反向自检：这一层真抓得住这些 bug 吗");
{
  /* E1：拿掉「绘图环境 → 占位卡」那条判定，参数必须**重新漏回正文** */
  /* v0.9.12：这条锚点原来写死了整条调用 —— 给 renderGraphicEnv 多传一个 ctx 之后它就命不中了，
   * 于是这一整条反向自检变成**恒真失效**（门禁最怕的正是这个）。改成认「整条调用」的正则：
   * 以后再加参数也不会把它悄悄打漂；替换文本改成 `0;`，保证改坏后的代码仍然语法合法。 */
  const gfxCallRe = /if \(GRAPHIC_ENVS\[name\]\) return renderGraphicEnv\(name, inner, line[^;]*\);/;
  const n = (coreSrc.match(gfxCallRe) || []).length;
  ok("自检锚点还在（内核里那条绘图环境判定）", n === 1, "命中 " + n + " 次");
  if (n === 1) {
    const broken = coreSrc.replace(gfxCallRe, "/* 故意拿掉：绘图环境不再识别 */ 0;");
    let bad = null;
    const sb = { module: { exports: {} }, console: console };
    try { vm.runInNewContext(broken, sb); bad = sb.module.exports; } catch (e) { ok("改坏后的内核仍能加载", false, e.message); }
    if (bad) {
      const h = bad.renderPreview("\\begin{document}\n" + TIKZ + "\n\\end{document}\n", {}).html;
      ok("拿掉判定后参数又漏回正文（证明 [A] 的断言不是恒真）",
        h.indexOf("box/.style") >= 0 && !/class="pv-graphic"/.test(h), h.slice(0, 300));
    }
  }

  /* E2：拿掉「漏了 \end 的守卫」，后半篇正文必须**被吃掉** —— 证明 [B] 钉的是真东西 */
  const guard = 'if (endM < 0 && GRAPHIC_ENVS[name]) {';
  const g = coreSrc.split(guard).length - 1;
  ok("自检锚点还在（内核里那条未闭合守卫）", g === 1, "命中 " + g + " 次");
  if (g === 1) {
    const broken = coreSrc.split(guard).join("if (false) {");
    let bad = null;
    const sb = { module: { exports: {} }, console: console };
    try { vm.runInNewContext(broken, sb); bad = sb.module.exports; } catch (e) { ok("改坏后的内核仍能加载", false, e.message); }
    if (bad) {
      const h = bad.renderPreview("\\begin{document}\n\\begin{tikzpicture}[\n  a/.style={draw},\n]\n\\node (a) at (0,0) {A};\n\n这一整段正文绝不能被吞掉。\n\\end{document}\n", {}).html;
      ok("拿掉守卫后后半篇正文真的被吃了（证明 [B] 的断言不是恒真）",
        proseOf(h).indexOf("这一整段正文绝不能被吞掉。") < 0, h.slice(0, 300));
    }
  }

  /* E3：把 fitPopup 的「实测高度」换回写死的 220 —— 底部浮层必须**重新捅出屏幕**
   *（这正是用户报的那一条：文本域一撑开就钻出下边界） */
  if (fitSrc) {
    const brokenFit = fitSrc.replace(/el\.offsetHeight \|\| 0/, "220");
    let BF = null;
    try { BF = mkFit(brokenFit); } catch (e) { ok("改坏后的 fitPopup 仍能求值", false, e.message); }
    if (BF && typeof BF.fn === "function") {
      const x = place(BF, 1200, 800, 400, 400, 100, 560, 740);
      ok("换回写死的 220 后，底部浮层真的捅出屏幕（证明 [C] 的断言不是恒真）",
        x.top + x.h > 800 - 8, JSON.stringify(x));
    }
  }
}

console.log("\n" + "=".repeat(60));
console.log(fail === 0 ? "✓ v0.9.11 绘图环境 / 浮层摆位层全绿（" + pass + " 项）" : "✗ 有 " + fail + " 项未通过");
process.exit(fail === 0 ? 0 : 1);
