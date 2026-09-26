"use strict";
/* 验证「v0.9 三块内核」都能被 build-singlefile.js 的同一条通路内联（P3 才用，提前排雷）。

   搬那条通路：① 末行导出语句 → return；② 按各自头部的接缝说明处理依赖；③ 包 IIFE；④ 真 eval 确认还能用。

   为什么现在就要验：build-singlefile.js 的 inline() 里有一条硬检查
     if (out.includes("module.exports")) → 致命
   它只看字面量（0.3.0 事故的防线）。所以**注释里出现这个词也会让构建炸**，
   而那种失败要等 P3 才暴露 —— 一分钟就能提前拆掉。

   各内核的接缝：
     wysiwyg.js  —— 零依赖
     docmodel.js —— 有一句 require("./wysiwyg.js")，按它头部写明的方式由外层注入：
                    const DOC = (function (WYS) { …正文… })（WYS）
     txlog.js    —— 零依赖（刻意只看字符串，不 require docmodel）
*/
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ws = path.join(__dirname, "..");
const EXPORT_RE = /^module\.exports\s*=\s*\{([^}]*)\};?[^\S\n]*$/m;
const WYS_SEAM_RE = /^const WYS = require\("\.\/wysiwyg\.js"\);.*$/m;

let bad = 0;
function ok(n, c, x) { if (!c) bad++; console.log((c ? "  ok    " : "  FAIL  ") + n + (x ? "   → " + x : "")); }

function read(f) { return fs.readFileSync(path.join(ws, f), "utf8"); }
/* 按接缝把一份内核转成可内联的表达式（依赖由参数注入） */
function bodyOf(f, needsWys) {
  let b = read(f).replace(EXPORT_RE, "return {$1};");
  if (needsWys) b = b.replace(WYS_SEAM_RE, "");
  return b;
}
function wrap(f, needsWys, argName, argVal) {
  const b = bodyOf(f, needsWys);
  return needsWys
    ? "(function (" + argName + ") {\n" + b + "\n})"
    : "(function () {\n" + b + "\n})()";
}
function sandbox() {
  return { Uint32Array: Uint32Array, Set: Set, Map: Map, Date: Date, Math: Math, Object: Object,
           Array: Array, String: String, Number: Number, JSON: JSON, isNaN: isNaN, Infinity: Infinity };
}

const MODULES = [
  { file: "server/wysiwyg.js",  needsWys: false, exports: ["parseDoc", "applyEdits", "partsJoin"] },
  { file: "server/docmodel.js", needsWys: true,  exports: ["parse", "serialize", "applyOps", "reproject", "nodeAtLine"] },
  { file: "server/txlog.js",    needsWys: false, exports: ["History", "merge3", "diffHunks"] },
];

for (let i = 0; i < MODULES.length; i++) {
  const mod = MODULES[i];
  const raw = read(mod.file);

  /* ① 字面量恰好 1 次（就是那条真导出语句）—— 注释里再提一次就会让构建致命 */
  const lit = (raw.match(/module\.exports/g) || []).length;
  ok(mod.file + "：module.exports 恰好 1 次（注释里不许再提，否则 inline() 直接判致命）", lit === 1, "出现 " + lit + " 次");

  /* ② 导出语句能改写，且对象里无嵌套花括号 */
  const mm = raw.match(EXPORT_RE);
  ok(mod.file + "：导出语句匹配得上且无嵌套花括号", !!mm && mm[1].indexOf("{") < 0);

  const body = bodyOf(mod.file, mod.needsWys);
  ok(mod.file + "：已改写成 return", /^return \{/m.test(body));
  ok(mod.file + "：改写后不再含该字面量", !/module\.exports/.test(body));

  /* ③ 依赖：只允许那句有说明的 WYS 注入，其余一律不许 require */
  const reqs = raw.match(/\brequire\s*\([^)]*\)/g) || [];
  if (mod.needsWys) {
    ok(mod.file + "：只有那句 WYS 注入接缝，且已被摘掉", reqs.length === 1 && !/\brequire\s*\(/.test(body),
      "require 语句: " + JSON.stringify(reqs));
  } else {
    ok(mod.file + "：零依赖（内联进编辑器后没有 require 可用）", reqs.length === 0, "require 语句: " + JSON.stringify(reqs));
  }

  /* ④ 包 IIFE 后真跑一遍 */
  let M = null;
  try {
    if (mod.needsWys) {
      const WYS = vm.runInNewContext(wrap("server/wysiwyg.js", false), sandbox());
      M = vm.runInNewContext(wrap(mod.file, true, "WYS", null), Object.assign(sandbox(), { WYS: WYS }));
      M = vm.runInNewContext("(function (WYS) {\n" + body + "\n})", Object.assign({}, sandbox()))(WYS);
    } else {
      M = vm.runInNewContext("(function () {\n" + body + "\n})()", sandbox());
    }
  } catch (e) { ok(mod.file + "：IIFE 能执行", false, (e && e.message) || String(e)); }
  if (!M) continue;
  ok(mod.file + "：IIFE 能执行", true);
  const missing = mod.exports.filter(function (k) { return typeof M[k] !== "function"; });
  ok(mod.file + "：内联后导出齐全（" + mod.exports.join(" / ") + "）", missing.length === 0, "缺 " + missing.join(","));
}

/* ⑤ 三块拼在一起（WYS → DOC → TX）跑一条真实链路 */
{
  try {
    const WYS = vm.runInNewContext(wrap("server/wysiwyg.js", false), sandbox());
    const DOC = vm.runInNewContext("(function (WYS) {\n" + bodyOf("server/docmodel.js", true) + "\n})", sandbox())(WYS);
    const TX = vm.runInNewContext(wrap("server/txlog.js", false), sandbox());

    const SRC = "\\section{甲}\n\n正文一。\n\n正文二。\n";
    const doc = DOC.parse(SRC);
    const p = doc.nodes.filter(function (n) { return n.type === "paragraph"; })[0];
    const r = DOC.applyOps(doc, [{ t: "setText", id: p.id, text: "改过的。" }]);
    const h = new TX.History({ base: SRC });
    h.commit(r.tx);
    const u = h.undo();
    const chain = h.checkChain();
    ok("三块内核一起内联后，真实链路可跑（改 → 提交 → 撤销 = 逐字节回起点）",
      !!u && u.before === SRC && h.state() === SRC && chain.ok &&
      DOC.serialize(DOC.parse(r.doc.source)) === r.doc.source,
      chain.ok ? "" : chain.errors.join("；"));

    /* 顺带验一条 rebase 通路（外部改动落在别的块 → 不清栈） */
    const h2 = new TX.History({ base: SRC });
    h2.commit(r.tx);
    const d2 = DOC.parse(r.doc.source);
    const last = d2.nodes.filter(function (n) { return n.type === "paragraph"; }).pop();
    const ext = DOC.applyOps(d2, [{ t: "setText", id: last.id, text: "外部改的。" }]);
    const res = h2.rebase(r.doc.source, ext.doc.source);
    ok("内联后 rebase 通路也对（外部改别的块 → 一条不丢）",
      res.kept === 1 && h2.gaps === 0 && res.source.indexOf("外部改的。") >= 0 && h2.checkChain().ok);
  } catch (e) { ok("三块内核一起内联后，真实链路可跑", false, (e && e.message) || String(e)); }
}

console.log(bad ? "\n✗ 构建接缝有 " + bad + " 项不过" : "\n✓ 三块内核都能被 P3 的构建通路内联，且行为不变");
process.exit(bad ? 1 : 0);
