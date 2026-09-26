/* v0.5.0 补丁：解析器带出浮动体 caption/label/endLine + 大纲面板重做的接线
 * 用法：node .setup/patch-v050.js
 */
const fs = require("fs");
const path = require("path");
const WS = "E:/notrat-latex-plugin";
const read = (p) => fs.readFileSync(path.join(WS, p), "utf8");
const write = (p, s) => fs.writeFileSync(path.join(WS, p), s);

let changed = 0;

/* ============================ 1. server/index.js ============================ */
{
  const p = "server/index.js";
  let s = read(p);
  const before = s;

  const HELPER = [
    "/* 浮动体 / 公式环境：起止行 + caption + label",
    " * 旧版只记 \\begin 的行号：大纲面板能列出「🖼 图」，却看不到图题、也点不到 \\label。",
    " * 这里按 \\begin/\\end 配对，把 caption / label / endLine 一并带出（未闭合的也保留，",
    " * 配对错误交给 latex_validate 去报，解析侧不吞信息）。 */",
    "const FLOAT_ENV = /^(figure\\*?|table\\*?|equation\\*?|align\\*?|gather\\*?|eqnarray\\*?|multline\\*?)$/;",
    "",
    "function collectFloats(lines) {",
    "  const out = [];",
    "  const stack = [];",
    "  for (let li = 0; li < lines.length; li++) {",
    "    const ln = li + 1;",
    "    const line = lines[li];",
    "    const toks = [];",
    "    let tm;",
    "    const bre = /\\\\begin\\s*\\{([^}]+)\\}/g;",
    "    while ((tm = bre.exec(line))) toks.push({ i: tm.index, t: \"b\", name: tm[1] });",
    "    const ere = /\\\\end\\s*\\{([^}]+)\\}/g;",
    "    while ((tm = ere.exec(line))) toks.push({ i: tm.index, t: \"e\", name: tm[1] });",
    "    if (!toks.length) continue;",
    "    toks.sort((a, b) => a.i - b.i);",
    "    for (const tk of toks) {",
    "      if (tk.t === \"b\") {",
    "        if (FLOAT_ENV.test(tk.name)) stack.push({ raw: tk.name, name: tk.name.replace(/\\*$/, \"\"), line: ln, endLine: null });",
    "      } else {",
    "        for (let k = stack.length - 1; k >= 0; k--) {",
    "          if (stack[k].raw === tk.name) {",
    "            const f = stack.splice(k, 1)[0];",
    "            f.endLine = ln;",
    "            out.push(f);",
    "            break;",
    "          }",
    "        }",
    "      }",
    "    }",
    "  }",
    "  for (const f of stack) out.push(f); // 未闭合的照样进清单",
    "  for (const f of out) {",
    "    const seg = lines.slice(f.line - 1, Math.max(f.line, f.endLine || f.line)).join(\"\\n\");",
    "    const cm = /\\\\caption\\s*(?:\\[[^\\]]*\\])?\\s*\\{/.exec(seg);",
    "    if (cm) {",
    "      const g = readGroup(seg, cm.index + cm[0].length - 1);",
    "      if (g) f.caption = g.content.replace(/\\s+/g, \" \").trim();",
    "    }",
    "    const lm = /\\\\label\\s*\\{([^}]+)\\}/.exec(seg);",
    "    if (lm) f.label = lm[1].trim();",
    "    delete f.raw;",
    "  }",
    "  out.sort((a, b) => a.line - b.line);",
    "  return out.map((f) => ({",
    "    name: f.name,",
    "    line: f.line,",
    "    endLine: f.endLine,",
    "    caption: f.caption || \"\",",
    "    label: f.label || \"\",",
    "  }));",
    "}",
    "",
    "",
  ].join("\n");

  const anchor = "function parseTex(filePath) {";
  if (s.indexOf("function collectFloats(lines)") < 0) {
    if (s.split(anchor).length !== 2) throw new Error("parseTex 锚点不唯一");
    s = s.replace(anchor, HELPER + anchor);
  }

  const oldPush = [
    "    for (const tk of tokens)",
    "      if (tk.t === \"b\" && /^(figure\\*?|table\\*?|equation|align|gather|eqnarray|multline)$/.test(tk.name))",
    "        result.environments.push({ name: tk.name.replace(/\\*$/, \"\"), line: ln });",
    "",
  ].join("\n");
  if (s.indexOf("result.environments.push(") >= 0) {
    if (s.split(oldPush).length !== 2) throw new Error("environments.push 锚点不唯一");
    s = s.replace(oldPush, "");
  }

  const anchor2 = "  result.inlineMath = Math.floor(";
  if (s.indexOf("result.environments = collectFloats(lines);") < 0) {
    if (s.split(anchor2).length !== 2) throw new Error("inlineMath 锚点不唯一");
    s = s.replace(anchor2, "  /* 浮动体 / 公式环境：起止行 + caption + label（大纲面板消费） */\n  result.environments = collectFloats(lines);\n\n" + anchor2);
  }

  if (s !== before) { write(p, s); changed++; console.log("  ✓ server/index.js 已更新（浮动体 caption/label/endLine）"); }
  else console.log("  = server/index.js 无变化");
}

console.log("\nchanged files:", changed);
