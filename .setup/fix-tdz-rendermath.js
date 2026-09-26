#!/usr/bin/env node
/**
 * 修复 TDZ：panels/editor.tsx 中 `const wys = useMemo(..., [content, renderMath])`
 * 在 `const renderMath = useMemo(...)` 声明之前引用它 —— 依赖数组渲染期立即求值，抛
 *   ReferenceError: Cannot access 'renderMath' before initialization
 *
 * 方案：把 renderMath 的声明整块上移到 wys 之前（其依赖 katexVer / katexOkRef 已在上方）。
 * 幂等：已修复则直接退出，重复执行安全。
 */
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "panels", "editor.tsx");
const raw = fs.readFileSync(file, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const lines = raw.split(/\r?\n/);

const find = (re, from = 0) => {
  for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i;
  return -1;
};

const WYS_RE = /^\s*const wys = useMemo\(\(\)\s*=>\s*\{/;
const WYS_END_RE = /^\s*\},\s*\[content,\s*renderMath\]\);\s*$/;
const RM_START_RE = /^\s*const renderMath = useMemo\(\(\)\s*=>\s*\{/;
const RM_END_RE = /^\s*\},\s*\[katexVer\]\);\s*$/;

const jWys = find(WYS_RE);
const iStart = find(RM_START_RE);

if (jWys === -1) throw new Error("找不到 `const wys = useMemo(` 声明，文件结构与预期不符");
if (iStart === -1) throw new Error("找不到 `const renderMath = useMemo(` 声明，文件结构与预期不符");

/* 幂等：renderMath 已在 wys 之前 → 已是修复状态 */
if (iStart < jWys) {
  console.log("[=] 已是修复状态：renderMath(行 " + (iStart + 1) + ") 已在 wys(行 " + (jWys + 1) + ") 之前，无需改动");
  process.exit(0);
}

const jWysEnd = find(WYS_END_RE, jWys);
if (jWysEnd === -1) throw new Error("找不到 wys 块结尾 `}, [content, renderMath]);`");
const iEnd = find(RM_END_RE, iStart);
if (iEnd === -1) throw new Error("找不到 renderMath 块结尾 `}, [katexVer]);`");

/* 安全性检查：wys 块之外、renderMath 声明之前，不应再有任何 renderMath 引用 */
for (let i = jWysEnd + 1; i < iStart; i++) {
  if (/\brenderMath\b/.test(lines[i])) {
    throw new Error("意外引用，需人工确认 @ 行 " + (i + 1) + ": " + lines[i].trim());
  }
}

const block = lines.slice(iStart, iEnd + 1);

/* 1) 摘除原块，并合并多余空行 */
const out = lines.slice(0, iStart).concat(lines.slice(iEnd + 1));
if (out[iStart - 1] !== undefined && out[iStart - 1].trim() === "" && out[iStart] !== undefined && out[iStart].trim() === "") {
  out.splice(iStart, 1);
}

/* 2) 插到 wys 之前（重新定位，删除后行号已变） */
const jWys2 = out.findIndex((l) => WYS_RE.test(l));
if (jWys2 === -1) throw new Error("摘除后重新定位 wys 失败");

const inject = ["", block[0].replace(/^(\s*)const renderMath/, "$1const renderMath"), ...block.slice(1), ""];
out.splice(jWys2, 0, ...inject);

fs.writeFileSync(file, out.join(eol), "utf8");

const newStart = out.findIndex((l) => RM_START_RE.test(l));
const newWys = out.findIndex((l) => WYS_RE.test(l));
console.log("[+] 已修复");
console.log("    renderMath 声明: 行 " + (newStart + 1));
console.log("    wys 使用:        行 " + (newWys + 1));
console.log("    " + (newStart < newWys ? "✓ 声明先于使用" : "✗ 顺序仍错误"));
