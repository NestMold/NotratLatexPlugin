"use strict";
/* =====================================================================
 * v0.9 测试小工具（零依赖）—— 给 docmodel / txlog / 基线三套测试共用。
 *
 * 两类判定，刻意分开计数：
 *   ok(...)      红线：永远必须绿。绿变红 = 回归，立刻拦住。
 *   target(...)  靶子：改造前**故意红着**，写的是「v0.9 之后必须成立」的期望。
 *                每消灭一个，计数就少一个；全部消完 = 这一期做完了。
 *
 * 这样 P0 基线既是一份「现状体检报告」，又是一张「还剩多少活」的进度表 ——
 * 同一个文件在改造前红、改造后绿，不需要另写一份验收。
 * =================================================================== */

const fs = require("fs");
const path = require("path");

const CORPUS_DIR = path.join(__dirname, "corpus");
const SAMPLES_DIR = path.join(__dirname, "..", "samples");

let _pass = 0, _fail = 0;          /* 红线 */
let _tGreen = 0, _tRed = 0;        /* 靶子 */
let _title = "";

function section(t) {
  _title = t;
  console.log("\n" + "-".repeat(64));
  console.log(t);
  console.log("-".repeat(64));
}

function info(msg) {
  console.log("  ·     " + msg);
}

function ok(name, cond, extra) {
  if (cond) { _pass++; console.log("  ok    " + name); }
  else { _fail++; console.log("  FAIL  " + name + (extra ? "   → " + extra : "")); }
  return !!cond;
}

function target(name, cond, extra) {
  if (cond) { _tGreen++; console.log("  [绿]  " + name); }
  else { _tRed++; console.log("  [红]  " + name + (extra ? "   → " + extra : "")); }
  return !!cond;
}

function report(title) {
  console.log("\n" + "=".repeat(64));
  console.log(title || "v0.9 体检");
  console.log("=".repeat(64));
  console.log("  红线（必须永远绿）：" + _pass + " 通过 / " + _fail + " 失败");
  console.log("  靶子（改造前故意红）：" + _tGreen + " 已消灭 / " + _tRed + " 待消灭");
  if (_fail) console.log("  ✗ 有红线断了 —— 这是回归，比靶子更急。");
  else if (_tRed) console.log("  ⏳ 红线全绿；还剩 " + _tRed + " 个靶子待 v0.9 各期消灭。");
  else console.log("  ✓ 红线全绿，靶子全清 —— 这一期做完了。");
  return _fail ? 1 : (_tRed ? 2 : 0);
}

/* 退出码：0=全绿；1=红线断了（回归）；2=仅剩靶子（预期中的红） */
function exit() {
  const code = report();
  process.exit(code === 2 ? 1 : code);   /* 靶子未清也返回非零：基线期本就该红 */
}

/* ---------- 语料：合成边界用例 + 仓库自带真实 .tex ---------- */
function loadCorpus() {
  const out = [];
  let names = [];
  try {
    names = fs.readdirSync(CORPUS_DIR)
      .filter(function (f) { return /\.tex$/.test(f); })
      .sort();
  } catch (e) { names = []; }
  for (let i = 0; i < names.length; i++) {
    const f = names[i];
    out.push({
      name: "corpus/" + f,
      kind: "synth",
      text: fs.readFileSync(path.join(CORPUS_DIR, f), "utf8"),
    });
  }
  /* 真实语料：扫 samples/ 根目录的 *.tex（非递归）。
   * 不写死文件名 —— 以前写死 ["sample.tex","test.tex"]，往目录里丢多少份都只认这两份。
   * 构建产物（*.aux / *.log / *.pdf / *.html）不是 .tex，天然不进；
   * .latex-history/ 在子目录里，非递归也扫不到。 */
  let reals = [];
  try {
    reals = fs.readdirSync(SAMPLES_DIR)
      .filter(function (f) { return /.tex$/.test(f); })
      .sort();
  } catch (e) { reals = []; }
  for (let i = 0; i < reals.length; i++) {
    const f = reals[i];
    try {
      out.push({ name: "samples/" + f, kind: "real", text: fs.readFileSync(path.join(SAMPLES_DIR, f), "utf8") });
    } catch (e) { /* 读不动就当没有 */ }
  }
  return out;
}

/* 把不可见字符画出来，断言失败时好定位 */
function vis(s, max) {
  let t = String(s == null ? "" : s);
  const cut = max && t.length > max;
  if (cut) t = t.slice(0, max);
  t = t
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n¶\n")
    .replace(/\t/g, "\\t")
    .replace(/\ufeff/g, "\\uFEFF");
  return JSON.stringify(t) + (cut ? "…(+" + (String(s).length - max) + ")" : "");
}

/* 定位首个不同的字节，给语料无损测试报错用 */
function firstDiff(a, b) {
  const x = String(a == null ? "" : a), y = String(b == null ? "" : b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    if (x[i] !== y[i]) {
      return { at: i, line: x.slice(0, i).split("\n").length, a: vis(x.slice(i, i + 40)), b: vis(y.slice(i, i + 40)) };
    }
  }
  if (x.length === y.length) return null;
  return { at: n, line: x.slice(0, n).split("\n").length, lenA: x.length, lenB: y.length,
    a: vis(x.slice(n, n + 40)), b: vis(y.slice(n, n + 40)) };
}

module.exports = {
  section: section,
  info: info,
  ok: ok,
  target: target,
  report: report,
  exit: exit,
  loadCorpus: loadCorpus,
  vis: vis,
  firstDiff: firstDiff,
};
