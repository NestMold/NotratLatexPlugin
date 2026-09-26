/* v0.7.3 修复：就地编辑层与只读预览层的「标题层级」错位一级
 *
 * 问题
 *   同一份 .tex，切到「就地编辑」标题会变大一号、\subsection 更是从 15px 跳到 17px。
 *   成因：两套内核各自算了一次层级，公式不同。
 *     preview-core.js:  lv = Math.min(HEAD_LV[name] + 1, 4)   → section = 2 → .pv-h2 = 17px
 *     editor.tsx:       lv = level<=1 ? 1 : level===2 ? 2 : 3  → section = 1 → .wys-h1 = 20px
 *   且 preview 在 lv=4（subsubsection / paragraph）不升字号、只加粗（.pv-par），
 *   编辑器却给到 .wys-h3 15px。
 *
 * 修法：编辑器侧改用与 preview-core 完全同构的算法，并补 .wys-par 档。
 *   chapter→1 / section→2 / subsection→3 / subsubsection→4(par) / paragraph→4(par)
 */
const fs = require("fs");
const path = require("path");

const ws = "E:/notrat-latex-plugin";
const file = path.join(ws, "panels", "editor.tsx");
let s = fs.readFileSync(file, "utf8");
const before = s;

/* ---------- 1) 层级算法对齐 ---------- */
const oldLv = `        const lv = b.level <= 1 ? 1 : b.level === 2 ? 2 : 3;
        out.push(
          '<div class="wys-blk wys-h' + lv + '"' + base +`;

const newLv = `        /* 层级必须与只读预览内核**逐级同构**，否则同一份 .tex 在两种模式下标题差一号。
         * preview-core.js: lv = Math.min(HEAD_LV[name] + 1, 4)
         *   HEAD_LV = { chapter:0, section:1, subsection:2, subsubsection:3, paragraph:4 }
         *   → chapter=1 / section=2 / subsection=3 / subsubsection=4
         * wysiwyg 的 b.level 用的是同一张表，所以这里同样 +1、同样 clamp 到 4，
         * 第 4 档退化成粗体段落（.wys-par ↔ .pv-par），不升字号。 */
        const lv = Math.min((b.level || 0) + 1, 4);
        const hCls = lv <= 3 ? " wys-h" + lv : " wys-par";
        out.push(
          '<div class="wys-blk' + hCls + '"' + base +`;

if (s.indexOf(oldLv) < 0) { console.error("✗ 找不到层级计算那段（可能已被改过）"); process.exit(1); }
s = s.replace(oldLv, newLv);

/* ---------- 2) 补 .wys-par 档 + 注明与 pv-* 的对应 ---------- */
const oldCss = `.wys-h1{font-size:20px;font-weight:700;margin:26px 0 10px;padding-bottom:4px;border-bottom:1px solid hsl(var(--border))}
.wys-h2{font-size:17px;font-weight:700;margin:22px 0 8px}
.wys-h3{font-size:15px;font-weight:700;margin:18px 0 6px}
.wys-p{margin:0 0 10px}`;

const newCss = `/* 以下 h1\\u2013h3 / par / p 的数值必须与 PV_CSS 的 .pv-h1\\u2013.pv-h3 / .pv-par / .pv-root p 保持一致。
 * 两套 CSS 目前是「人工同步」的：改一边就要改另一边，门禁脚本 check-v073-style.js 会盯着。 */
.wys-h1{font-size:20px;font-weight:700;margin:26px 0 10px;padding-bottom:4px;border-bottom:1px solid hsl(var(--border))}
.wys-h2{font-size:17px;font-weight:700;margin:22px 0 8px}
.wys-h3{font-size:15px;font-weight:700;margin:18px 0 6px}
/* \\subsubsection / \\paragraph 这一档预览不升字号，只加粗（.pv-par） */
.wys-par{font-weight:600;margin:14px 0 4px}
.wys-p{margin:0 0 10px}`;

if (s.indexOf(oldCss) < 0) { console.error("✗ 找不到 WYS_CSS 的标题段"); process.exit(1); }
s = s.replace(oldCss, newCss);

if (s === before) { console.error("✗ 没有任何改动"); process.exit(1); }
fs.writeFileSync(file, s);
console.log("✓ panels/editor.tsx 已更新");
console.log("  · 层级：chapter→h1 / section→h2 / subsection→h3 / subsubsection→par");
console.log("  · 新增 .wys-par（对齐 .pv-par）");
