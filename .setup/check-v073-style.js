/* v0.7.3 验收门 —— 「就地编辑层」与「只读预览层」必须长得一样
 *
 * 背景事故：同一份 .tex，切到「就地编辑」标题会变大一号。
 *   成因是两套内核各自算了一次层级，公式不同（editor 用 ≤1→1，preview 用 +1→2）。
 *   这类漂移 esbuild / tsc 都不报，只能靠对账脚本盯。
 *
 * 本门禁做两件事：
 *   [A] 层级同构：同一份 .tex，编辑器产出的 hN 与预览产出的 hN 必须同级
 *       （wys-hN ↔ pv-hN，第 4 档 wys-par ↔ pv-par）
 *   [B] 数值对账：两套 CSS 的对应档位（字号 / 字重 / 间距）必须逐项相等
 *
 * 运行： node .setup/check-v073-style.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ws = "E:/notrat-latex-plugin";
const pkg = JSON.parse(fs.readFileSync("C:/Users/Administrator/.notrat/plugins/notrat-latex-plugin.json", "utf8"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok    " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "\n        → " + extra : "")); }
}

/* ---- 从装机包切出内核 + 就地编辑层 ---- */
const src = pkg.contributions.editors[0].source;
const iK = src.indexOf("const WYS = (function () {");
const iKEnd = src.indexOf("\n})();", iK) + 6;
const iH = src.indexOf("function escAttr(s) {");
const iHEnd = src.indexOf("\nfunction esc(s) {", iH);
if (iK < 0 || iKEnd < 6 || iH < 0 || iHEnd < 0) { console.error("✗ 装机包里切不出内核"); process.exit(1); }

function cutCss(name) {
  const key = "const " + name + " = `";
  const k = src.indexOf(key);
  if (k < 0) return "";
  const s = k + key.length;
  const e = src.indexOf("\n`;", s);
  return src.slice(s, e);
}
const PV_CSS = cutCss("PV_CSS");
const WYS_CSS = cutCss("WYS_CSS");
if (!PV_CSS || !WYS_CSS) { console.error("✗ 切不出 CSS"); process.exit(1); }

const { JSDOM } = require(path.join(ws, "node_modules", "jsdom"));
const dom0 = new JSDOM("<!doctype html><html><body></body></html>");
const ctx = {
  document: dom0.window.document, window: dom0.window, console, Map, parseInt, String, Number, RegExp, JSON,
  LPC: require(path.join(ws, "server", "preview-core.js")),
};
vm.createContext(ctx);
vm.runInContext(kernelSrc() + "\n" + src.slice(iH, iHEnd) + "\n; globalThis.__T = { wysRenderDoc: wysRenderDoc };", ctx);
function kernelSrc() { return src.slice(iK, iKEnd); }
const T = ctx.__T;

const miniMath = (tex, disp) => ctx.LPC.miniMath(tex, disp);
const LPC = ctx.LPC;

/* ================= 样本：覆盖全部标题档位 ================= */
const cases = [
  {
    name: "sample.tex（section / subsection）",
    tex: fs.readFileSync(path.join(ws, "samples", "sample.tex"), "utf8"),
  },
  {
    name: "合成样本（chapter / section / subsection / subsubsection）",
    tex: "\\documentclass{book}\n\\begin{document}\n" +
      "\\chapter{第一章测试}\n" +
      "\\section{第一节测试}\n" +
      "\\subsection{第一小节测试}\n" +
      "\\subsubsection{小小节测试}\n" +
      "\\end{document}\n",
  },
];

function wysHeadings(tex) {
  const d = new JSDOM("<!doctype html><html><body><div id=r>" +
    T.wysRenderDoc(tex, miniMath, ws + "/samples") + "</div></body></html>");
  /* v0.8.12 契约：整篇正文只有**一个**编辑宿主，且所有块都在它里面。
   * 以前每块自己挂 contenteditable，块之间互不相通 —— 光标走到块尾就出不去，
   * 用户读作「每一行都会失去焦点」。宿主拆散了，这条断言就得红。 */
  const hosts = d.window.document.querySelectorAll("#r .wys-editroot[contenteditable=\"true\"]");
  const outside = Array.prototype.filter.call(
    d.window.document.querySelectorAll("#r .wys-blk"),
    (el) => !(el.closest ? el.closest(".wys-editroot") : null)
  );
  ok("编辑宿主唯一（.wys-editroot[contenteditable=true] 恰好 1 个）", hosts.length === 1, "实际 " + hosts.length);
  ok("每个正文块都在这个宿主里（没有游离在外的可编辑块）", outside.length === 0, "游离 " + outside.length + " 个");
  const out = [];
  /* v0.8.12：块外面套了一层唯一的编辑宿主 .wys-editroot，直接子代关系不再成立。
   * 这一层验的是「层级/数值同构」，不是 DOM 的直属关系 —— 用后代匹配。 */
  d.window.document.querySelectorAll("#r .wys-blk").forEach((el) => {
    const cls = el.getAttribute("class") || "";
    const m = /wys-(h[1-3]|par)\b/.exec(cls);
    if (!m) return;
    const ed = el.querySelector(".wys-edit");
    out.push({ lv: m[1], title: ed ? ed.textContent.trim() : "" });
  });
  return out;
}

const PV_LV = (cls) => {
  const m = /pv-(h[1-3]|par)\b/.exec(cls);
  return m ? m[1] : null;
};

function pvHeadings(tex) {
  const r = LPC.renderPreview(tex, { renderMath: miniMath, baseDir: ws + "/samples" });
  const d = new JSDOM("<!doctype html><html><body><div id=r>" + r.html + "</div></body></html>");
  const out = [];
  d.window.document.querySelectorAll("#r h1, #r h2, #r h3, #r .pv-par").forEach((el) => {
    const lv = PV_LV(el.getAttribute("class") || "");
    if (!lv) return;
    /* 预览的标题带自动编号（"2.1&nbsp;&nbsp;标题"），剥掉再比对 */
    const t = (el.textContent || "").replace(/\u00a0/g, " ").replace(/^[\d.]+\s*/, "").trim();
    out.push({ lv, title: t });
  });
  return out;
}

/* ================= [A] 层级同构 ================= */
console.log("\n[A] 层级同构：同一份 .tex 在两种模式下标题必须同级");
for (const c of cases) {
  console.log("\n  · " + c.name);
  const W = wysHeadings(c.tex);
  const P = pvHeadings(c.tex);
  if (!W.length) { ok("编辑器侧有标题产出", false, "一个都没渲染出来"); continue; }
  for (const w of W) {
    const p = P.find((x) => x.title && (x.title === w.title || x.title.indexOf(w.title) >= 0 || w.title.indexOf(x.title) >= 0));
    if (!p) { ok("预览侧能找到对应标题「" + w.title + "」", false, "预览标题：" + JSON.stringify(P.map((x) => x.title))); continue; }
    ok("「" + w.title + "」 编辑=" + w.lv + " 预览=" + p.lv + (w.lv === p.lv ? "" : "  ← 错位！"), w.lv === p.lv);
  }
}

/* ================= [B] CSS 数值对账 ================= */
console.log("\n[B] 数值对账：两套 CSS 的对应档位逐项相等");

function declOf(css, selector, prop) {
  /* 取出 selector{...} 里 prop 的值 */
  const re = new RegExp("(^|\\})\\s*" + selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}", "m");
  const m = re.exec(css);
  if (!m) return null;
  const body = m[2];
  const p = new RegExp("(?:^|;)\\s*" + prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*:\\s*([^;]+)");
  const mm = p.exec(body);
  return mm ? mm[1].trim() : null;
}

/* .pv-root p 的 margin 用另一套取法 */
function pvRootPMargin() {
  const m = /\.pv-root p\s*\{([^}]*)\}/.exec(PV_CSS);
  if (!m) return null;
  const mm = /margin\s*:\s*([^;]+)/.exec(m[1]);
  return mm ? mm[1].trim() : null;
}

const PAIRS = [
  ["标题 h1", ".pv-h1", "font-size", ".wys-h1", "font-size"],
  ["标题 h2", ".pv-h2", "font-size", ".wys-h2", "font-size"],
  ["标题 h3", ".pv-h3", "font-size", ".wys-h3", "font-size"],
  ["标题 h1", ".pv-h1", "margin", ".wys-h1", "margin"],
  ["标题 h2", ".pv-h2", "margin", ".wys-h2", "margin"],
  ["标题 h3", ".pv-h3", "margin", ".wys-h3", "margin"],
  ["第 4 档", ".pv-par", "font-weight", ".wys-par", "font-weight"],
  ["第 4 档", ".pv-par", "margin", ".wys-par", "margin"],
];
for (const [label, ps, pp, wsSel, wp] of PAIRS) {
  const a = declOf(PV_CSS, ps, pp);
  const b = declOf(WYS_CSS, wsSel, wp);
  ok(label + " " + pp + "  " + ps + "=" + a + " / " + wsSel + "=" + b, a != null && a === b);
}
{
  const a = pvRootPMargin();
  const b = declOf(WYS_CSS, ".wys-p", "margin");
  ok("正文段落 margin  .pv-root p=" + a + " / .wys-p=" + b, a != null && a === b);
}

/* 反向自检：门禁本身能抓到漂移（拿一个改坏的值试） */
console.log("\n[C] 门禁自检：人为造一个错位，应当被抓到");
{
  const broken = WYS_CSS.replace(".wys-h2{font-size:17px", ".wys-h2{font-size:23px");
  const a = declOf(PV_CSS, ".pv-h2", "font-size");
  const b = declOf(broken, ".wys-h2", "font-size");
  ok("改坏后能被判为不一致（23px ≠ 17px）", a !== b, "a=" + a + " b=" + b);
}

console.log("\n" + "=".repeat(60));
console.log(fail === 0 ? "✓ v0.7.3 样式一致性门禁全绿（" + pass + " 项）" : "✗ 有 " + fail + " 项未通过");
process.exit(fail === 0 ? 0 : 1);
