"use strict";
/* =====================================================================
 * v0.9.10 验收门 —— 「\bfseries … \\[5pt] \large …」这类显示到底成了什么样
 *
 * 用户原话：「\bfseries Harness：大模型智能体执行框架的设计空间与工程评测\\[5pt]
 *            \large ——以 DeepSeek Harness 为案例的多框架对比研究  这类显示还是没有修复呢」
 *
 * 这一层钉三个面：
 *   [A] 行内渲染本身（预览内核，纯 Node，不需要浏览器）
 *       · \\[5pt] 的垂直间距是**参数**，不许再把 "[5pt]" 当正文漏出来；
 *       · \bfseries / \itshape / \large 这类「声明」要真的生效（以前是静默吃掉）；
 *       · 作用域到组为止：{\bfseries 粗}后面不粗、a{\large 大}b 父组不受污染；
 *       · 标题块自己的基准是 \LARGE —— 标题里的 \large 必须比标题**小**（0.69em），
 *         而不是把标题撑得更大（1.2em）。
 *   [B] 「参数不是正文」这一大家子：\vspace{3mm} / \hspace*{1em} / \fontsize{12pt}{14pt}
 *       / \rule[..]{..}{..} / \setlength{..}{..} / \linebreak[4]。
 *   [C] 只有一套行内解析：就地编辑层的页首（\title / \author / \date）必须调同一个内核。
 *       两边各自实现一次，就会出现「一边显示 \bfseries 源码、另一边已经加粗了」——
 *       0.7.3 那次标题字号漂移是同一个病根（见 check-v073-style.js）。
 *   [D] 反向自检：把内核里「剥掉可选参数」那一行去掉，"[5pt]" 必须**重新漏出来**。
 *       门禁最容易犯的错是断言恒真 —— 每一层都得能证明自己抓得住这个 bug。
 *
 * 运行： node .setup/check/v0910-title-inline.js
 * =================================================================== */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ws = "E:/notrat-latex-plugin";
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok    " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "\n        → " + extra : "")); }
}

const CORE_REL = "server/preview-core.js";
const coreSrc = fs.readFileSync(path.join(ws, CORE_REL), "utf8");
const P = require(path.join(ws, CORE_REL));

/* 用户报的那份标题，原样拿来当样本 */
const TITLE_TEX = "\\documentclass[12pt]{ctexart}\n" +
  "\\title{\\bfseries Harness：大模型智能体执行框架的设计空间与工程评测\\\\[5pt]\n" +
  "       \\large ——以 DeepSeek Harness 为案例的多框架对比研究}\n" +
  "\\author{\\bfseries 张三}\n" +
  "\\begin{document}\n\\maketitle\n\\end{document}\n";

function pv(src) { return P.renderPreview("\\begin{document}\n" + src + "\n\\end{document}\n", {}).html; }
function textOf(html) { return String(html).replace(/<[^>]*>/g, ""); }

console.log("\n[A] 行内渲染：声明 / 换行参数 / 作用域");

const titleHtml = P.renderPreview(TITLE_TEX, {}).html;
const titleText = textOf(titleHtml);
ok("标题里不再漏出 [5pt]", titleHtml.indexOf("[5pt]") < 0, titleHtml);
ok("标题里不再漏出裸的 \\bfseries / \\large", !/\\bfseries|\\large/.test(titleHtml), titleHtml);
ok("\\bfseries 真的加粗了（font-weight:700）", /font-weight:700/.test(titleHtml), titleHtml);
ok("标题里的 \\large 比标题小一号（0.69em，基准 \\LARGE）", /font-size:0\.69em/.test(titleHtml), titleHtml);
ok("副标题里两个字都还在", titleText.indexOf("Harness") >= 0 && titleText.indexOf("多框架对比研究") >= 0, titleText);
ok("作者行同样吃到了 \\bfseries", /<div class="pv-author"><span style="font-weight:700"/.test(titleHtml), titleHtml);
{
  const h = pv("正文 \\large 大一号");
  ok("正文里的 \\large 比正文大（1.2em，基准 \\normalsize）", /font-size:1\.2em/.test(h), h);
}
{
  const h = pv("{\\bfseries 粗}后面不粗");
  ok("组作用域：{\\bfseries 粗} 之后照旧是细的", h.indexOf('<span style="font-weight:700"> 粗</span>后面不粗') >= 0, h);
}
{
  const h = pv("a{\\large 大}b");
  ok("子组不污染父组：a{\\large 大}b 只有中间那个字变大", h.indexOf('a<span style="font-size:1.2em"> 大</span>b') >= 0, h);
}
{
  const h = pv("\\bfseries 粗\\normalfont 细");
  ok("\\normalfont 复位（粗体当场结束）", (h.match(/<span /g) || []).length === 1 && h.indexOf("细</p>") >= 0, h);
}
{
  const h = pv("\\em 斜\\em 不斜");
  ok("\\em 是开关（第二次按回去）", (h.match(/font-style:italic/g) || []).length === 1 && h.indexOf("不斜</p>") >= 0, h);
}
{
  const h = pv("\\itshape 斜\\upshape 正");
  ok("\\upshape 取消 \\itshape（不是叠两个斜）", (h.match(/font-style:italic/g) || []).length === 1, h);
}

console.log("\n[B] 「参数不是正文」：一大家子漏字命令");
const LEAKS = [
  ["\\\\[5pt]", "上\\\\[5pt]下", ["[5pt]"]],
  ["\\\\ [3mm]（中间有空格）", "上\\\\ [3mm]下", ["[3mm]"]],
  ["\\vspace{3mm}", "上\\vspace{3mm}下", ["3mm"]],
  ["\\hspace*{1em}", "上\\hspace*{1em}下", ["1em"]],
  ["\\fontsize{12pt}{14pt}", "上\\fontsize{12pt}{14pt}下", ["12pt", "14pt"]],
  ["\\rule[2pt]{1pt}{2pt}", "上\\rule[2pt]{1pt}{2pt}下", ["2pt", "1pt"]],
  ["\\setlength{\\parskip}{3pt}", "上\\setlength{\\parskip}{3pt}下", ["3pt", "parskip"]],
  ["\\linebreak[4]", "上\\linebreak[4]下", ["[4]"]],
];
for (const [name, src, leaks] of LEAKS) {
  const t = textOf(pv(src));
  const bad = leaks.filter((x) => t.indexOf(x) >= 0);
  ok(name + " 的参数一个字都不落正文", bad.length === 0 && t.indexOf("上下") >= 0, "漏出 " + JSON.stringify(bad) + "  文本=" + t);
}
{
  const h = pv("\\fontsize{12pt}{14pt}文字\\selectfont");
  ok("\\fontsize 认得出量纲就真的改字号（12pt）", /font-size:12pt/.test(h), h);
  const h2 = pv("\\fontsize{\\mysize}{14pt}文字");
  ok("\\fontsize 认不出来只吞参数（不乱猜）", h2.indexOf("font-size") < 0 && textOf(h2).indexOf("文字") >= 0, h2);
}

console.log("\n[C] 同一个内核：就地编辑层的页首走的就是它");
ok("预览内核导出了 renderInlineHtml", typeof P.renderInlineHtml === "function");
{
  const a = P.renderInlineHtml("\\bfseries 粗 \\large 大", { sizeBase: 1.728 });
  const b = P.renderInlineHtml("\\bfseries 粗 \\large 大", {});
  ok("renderInlineHtml 吃 sizeBase（标题基准 0.69em / 正文基准 1.2em）",
    /font-size:0\.69em/.test(a) && /font-size:1\.2em/.test(b), a + " || " + b);
}
{
  /* 装机包才是用户真在跑的那份 —— 拿它验面板接线，顺带挡住「源码改了、包还是旧的」 */
  const pkgPath = "C:/Users/Administrator/.notrat/plugins/notrat-latex-plugin.json";
  /* 页首渲染器里剥 data-line 的那句（拼成字符串来比对，免得正则转义再被吃一层） */
  /* 页首渲染器里剥 data-line 的那句（拼成字符串比对，免得正则转义再被吃一层） */
  const fmNoLine = ".replace(/ data-line=\"\\d+\"/g, \"\")";
  if (!fs.existsSync(pkgPath)) {
    ok("装机包存在（没有装机包，这一层验不了接线）", false, pkgPath);
  } else {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const src = (pkg.contributions.editors[0] || {}).source || "";
    ok("装机包里的内核带 renderInlineHtml", src.indexOf("renderInlineHtml: renderInlineHtml") >= 0,
      "构建脚本的 LPC 常量没补 → 面板拿到 undefined → 静默退回源码渲染");
    ok("装机包里的内核带「剥掉 \\\\ 可选参数」那条逻辑", src.indexOf('if (s[j] === "[") j = optArg(s, j).next;') >= 0);
    ok("页首渲染器 wysFmPreview 调的是 LPC.renderInlineHtml", /function wysFmPreview[\s\S]{0,700}?LPC\.renderInlineHtml\(/.test(src));
    const used = (src.match(/wysFmPreview\(fm\.(title|author|date)\.body/g) || []).length;
    ok("标题 / 作者 / 日期三行都改走它（实际 " + used + " 处，应为 3）", used === 3);
    ok("页首不再用 wysInline 渲染（那是「源码可信」的编辑层写法）",
      src.indexOf('"标题", "fm:title", "", wysInline(') < 0 && src.indexOf('"作者", "fm:author", "", wysInline(') < 0);
    ok("页首显示的 data-line 被剥掉（点标题不会跳错行）", src.indexOf(fmNoLine) >= 0,
      "少了它，标题里的 \\ref 会把编辑器的行跳转带跑偏：" + fmNoLine);
  }
}

console.log("\n[D] 反向自检：这一层真抓得住这个 bug 吗");
{
  const anchor = 'if (s[j] === "[") j = optArg(s, j).next;';
  const n = coreSrc.split(anchor).length - 1;
  ok("自检锚点还在（内核里那条剥参数的判定）", n === 1, "命中 " + n + " 次");
  if (n === 1) {
    const broken = coreSrc.split(anchor).join("/* 故意改坏：不剥可选参数 */");
    const sandbox = { module: { exports: {} }, console: console };
    let badKernel = null;
    try { vm.runInNewContext(broken, sandbox); badKernel = sandbox.module.exports; }
    catch (e) { ok("改坏后的内核仍能加载", false, e.message); }
    if (badKernel) {
      const h = badKernel.renderPreview("\\begin{document}\n上\\\\[5pt]下\n\\end{document}\n", {}).html;
      ok("改坏后 [5pt] 又漏回正文（证明上面那条断言不是恒真）", h.indexOf("[5pt]") >= 0, h);
    }
  }
}

console.log("\n" + "=".repeat(60));
console.log(fail === 0 ? "✓ v0.9.10 标题行内层全绿（" + pass + " 项）" : "✗ 有 " + fail + " 项未通过");
process.exit(fail === 0 ? 0 : 1);
