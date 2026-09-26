"use strict";
const fs = require("fs");
const p = "E:/notrat-latex-plugin/server/preview-core.js";
let s = fs.readFileSync(p, "utf8");

// A) renderFloat：剥掉环境开头的可选参数 [htbp]（跟在 \centering 剥离之后）
const anchorA = String.raw`  body = body.replace(/\\label\s*\{[^}]*\}/g, "").replace(/\\centering\b/g, "");`;
const addA = anchorA + String.raw`
  body = body.replace(/^\s*\[[^\]]*\]/, "");`;
if (!s.includes(anchorA)) { console.error("A target not found"); process.exit(1); }
s = s.replace(anchorA, addA);

// B) miniMath：\frac 参数支持一层嵌套花括号
const anchorB = String.raw`s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g`;
const replB = String.raw`s = s.replace(/\\frac\s*\{((?:[^{}]|\{[^{}]*\})*)\}\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g`;
if (!s.includes(anchorB)) { console.error("B target not found"); process.exit(1); }
s = s.replace(anchorB, replB);

fs.writeFileSync(p, s);
console.log("patched: [htbp] strip + nested frac");
