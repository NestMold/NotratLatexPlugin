/* 诊断：为什么「就地编辑」与「只读」的样式不一样
 *
 * 方法：从**装机包源码**里切出真实内核 + 就地编辑层 + PV_CSS/WYS_CSS，
 *       用 jsdom 把两种模式的 HTML 挂到同一个 .pv-root 容器下，
 *       再对同一块内容比对「命中的 CSS 声明」。
 *
 * 运行： node .setup/diag-inline-style.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ws = "E:/notrat-latex-plugin";
const pkgPath = "C:/Users/Administrator/.notrat/plugins/notrat-latex-plugin.json";
if (!fs.existsSync(pkgPath)) { console.error("✗ 找不到装机包: " + pkgPath); process.exit(1); }
const m = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const src = m.contributions.editors[0].source;
console.log("装机包版本: " + m.version);

/* ---- 切出内核 + 就地编辑层 ---- */
const iK = src.indexOf("const WYS = (function () {");
const iKEnd = src.indexOf("\n})();", iK) + 6;
const kernel = src.slice(iK, iKEnd);
const iH = src.indexOf("function escAttr(s) {");
const iHEnd = src.indexOf("\nfunction esc(s) {", iH);
const helpers = src.slice(iH, iHEnd);

/* ---- 切出两套 CSS ---- */
function cutCss(name) {
  const k = src.indexOf("const " + name + " = `");
  if (k < 0) return "";
  const s = src.indexOf("`", k + ("const " + name + " = ").length + 1);
  const e = src.indexOf("\n`;", s);
  return src.slice(s + 1, e);
}
const PV_CSS = cutCss("PV_CSS");
const WYS_CSS = cutCss("WYS_CSS");
console.log("PV_CSS " + PV_CSS.length + " 字符 / WYS_CSS " + WYS_CSS.length + " 字符\n");

/* ---- vm 求值内核 ---- */
const { JSDOM } = require(path.join(ws, "node_modules", "jsdom"));
const dom0 = new JSDOM("<!doctype html><html><body></body></html>");
const ctx = {
  document: dom0.window.document, window: dom0.window, console,
  Map, parseInt, String, Number, RegExp, JSON,
  LPC: require(path.join(ws, "server", "preview-core.js")),
};
vm.createContext(ctx);
vm.runInContext(
  kernel + "\n" + helpers + "\n; globalThis.__T = { WYS: WYS, wysInline: wysInline, wysRenderDoc: wysRenderDoc };",
  ctx
);
const T = ctx.__T;

const sample = fs.readFileSync(path.join(ws, "samples", "sample.tex"), "utf8");
const renderMath = (tex, disp) => ctx.LPC.miniMath(tex, disp);

/* ================= 构造两模式 DOM ================= */
/* 容器 inline style 必须与 editor.tsx 的 pvRef 完全一致，否则对账无意义 */
const CONTAINER_STYLE = "padding:6px 22px 48px;font-size:14px;line-height:1.8;max-width:860px;margin:0 auto;width:100%";

function build(mode) {
  const html = mode === "wys"
    ? T.wysRenderDoc(sample, renderMath, ws + "/samples")
    : ctx.LPC.renderPreview(sample, { renderMath, baseDir: ws + "/samples" }).html;
  const d = new JSDOM(
    '<!doctype html><html><head><style>' + PV_CSS + "\n" + WYS_CSS + "</style></head>" +
    '<body><div id="root" class="pv-root" style="' + CONTAINER_STYLE + '">' + html + "</div></body></html>"
  );
  return d.window.document;
}

const docWys = build("wys");
const docPv = build("pv");
const rootWys = docWys.getElementById("root");
const rootPv = docPv.getElementById("root");

/* ================= 命中声明提取 ================= */
function rulesOf(doc) {
  const out = [];
  const sheets = doc.styleSheets;
  for (let i = 0; i < sheets.length; i++) {
    let rs;
    try { rs = sheets[i].cssRules; } catch (e) { continue; }
    for (let j = 0; j < rs.length; j++) {
      if (rs[j].selectorText) out.push({ sel: rs[j].selectorText, style: rs[j].style });
    }
  }
  return out;
}
const RULES_W = rulesOf(docWys);

function matched(el, rules) {
  const acc = {};
  for (const r of rules) {
    let hit = false;
    try { hit = el.matches(r.sel); } catch (e) { hit = false; }
    if (!hit) continue;
    for (let i = 0; i < r.style.length; i++) {
      const p = r.style[i];
      acc[p] = { v: r.style.getPropertyValue(p), from: r.sel };
    }
  }
  return acc;
}

/* 只关心影响「所见排版」的属性 */
const KEYS = ["font-size", "font-family", "font-weight", "font-style", "line-height", "color",
  "white-space", "margin", "margin-bottom", "padding", "padding-bottom", "border-bottom", "cursor"];

function show(el, rules) {
  const a = matched(el, rules);
  const lines = [];
  for (const k of KEYS) {
    lines.push("    " + k.padEnd(14) + (a[k] ? a[k].v.padEnd(30) + " ← " + a[k].from : "—（未声明）"));
  }
  return lines.join("\n");
}

/* ================= 逐块对账 ================= */
console.log("=".repeat(78));
console.log("【1】正文段落：同一段 LaTeX，两种模式命中的声明");
console.log("=".repeat(78));

/* 编辑态：第一段 \section 引言 后面的段落 */
const wysP = rootWys.querySelector(".wys-blk.wys-p .wys-edit");
/* 只读态：对应段落 */
const pvPs = Array.from(rootPv.querySelectorAll("p")).filter((p) => p.textContent.indexOf("文本自动摘要") >= 0);
const pvP = pvPs[0] || rootPv.querySelector("p");

console.log("\n① 就地编辑 —— <span class=\"wys-edit\" contenteditable=\"true\">");
console.log(show(wysP, RULES_W));
console.log("\n② 只读 —— <p>（容器 .pv-root）");
console.log(show(pvP, RULES_W));

/* ================= 差异归并 ================= */
console.log("\n" + "=".repeat(78));
console.log("【2】逐属性差异（只列不同项）");
console.log("=".repeat(78));
const aw = matched(wysP, RULES_W);
const ap = matched(pvP, RULES_W);
let diff = 0;
for (const k of KEYS) {
  const a = aw[k] ? aw[k].v : "—";
  const b = ap[k] ? ap[k].v : "—";
  if (a !== b) {
    diff++;
    console.log("  ✗ " + k.padEnd(14) + " 编辑=" + String(a).padEnd(26) + " 只读=" + b);
  }
}
if (!diff) console.log("  （该段无差异）");

/* ================= 行内引用 / 公式 逐类对账 ================= */
console.log("\n" + "=".repeat(78));
console.log("【3】行内原子：引用 / 公式 在两种模式下的外观");
console.log("=".repeat(78));

function probe(label, elW, elP) {
  console.log("\n— " + label + " —");
  if (elW) console.log("  编辑态 " + show(elW, RULES_W).split("\n").slice(3, 7).join("\n"));
  else console.log("  编辑态 未找到");
  if (elP) console.log("  只读态 " + show(elP, RULES_W).split("\n").slice(3, 7).join("\n"));
  else console.log("  只读态 未找到");
}
const citeW = rootWys.querySelector(".wys-cite, .wys-ref");
const citeP = rootPv.querySelector(".pv-cite, .pv-ref");
probe("引用 / 交叉引用（同一 \\cite / \\ref）", citeW, citeP);

const katexW = rootWys.querySelector(".wys-math .katex") || rootWys.querySelector(".wys-math");
const katexP = rootPv.querySelector(".katex");
probe("数学公式（KaTeX）", katexW, katexP);

/* ================= DOM 结构对比 ================= */
console.log("\n" + "=".repeat(78));
console.log("【4】结构：同一页里被拆成「可编辑块」与「只读卡片」的块");
console.log("=".repeat(78));
console.log("\n编辑模式 DOM 顶层子元素：");
Array.from(rootWys.children).slice(0, 12).forEach((el) => {
  const cls = el.getAttribute("class") || "";
  const t = (el.textContent || "").replace(/\s+/g, " ").slice(0, 34);
  console.log("   <" + el.tagName.toLowerCase() + " class=\"" + cls + "\"> " + t);
});
console.log("\n只读模式 DOM 顶层子元素（前 12）：");
Array.from(rootPv.children).slice(0, 12).forEach((el) => {
  const cls = el.getAttribute("class") || "";
  const t = (el.textContent || "").replace(/\s+/g, " ").slice(0, 34);
  console.log("   <" + el.tagName.toLowerCase() + " class=\"" + cls + "\"> " + t);
});
