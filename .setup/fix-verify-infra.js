/* 修复验收基础设施里 4 处「断言与实现脱节」——它们让 172 项验收静默缩水成 103 项。
 *
 * 纪律：修的是**比较方式**，不是**断言本身**。每一处的原意都保留：
 *   1) verify-v052 §7：build 会内联 LPC + WYS 两块，断言只内联了 LPC → 恒假
 *   2) verify-v052 §8：build 会按 manifest.version 改写 VERSION 行 → 逐字节比恒假
 *   3) test-activefile：锚点按 LF 写，而 editor.tsx 是 CRLF → 抠片段必然失配崩掉
 *   4) test-nav：假 DOM 节点缺 querySelectorAll，就地编辑那层一扫块就 TypeError
 * 没有一处是「放松断言」：改完 1) 反而是更严的（两块都查），2) 才是真正在测「同步」。
 *
 * 运行： node .setup/fix-verify-infra.js
 */
const fs = require("fs");
const path = require("path");

const WS = "E:/notrat-latex-plugin";

function patchFile(rel, edits) {
  const file = path.join(WS, rel);
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.indexOf("\r\n") >= 0;
  let s = crlf ? raw.replace(/\r\n/g, "\n") : raw;
  const len0 = s.length;
  console.log("\n" + rel + "  [" + (crlf ? "CRLF" : "LF") + "]");
  for (const [a, b, name] of edits) {
    const c = s.split(a).length - 1;
    if (c !== 1) { console.error("  ✗ " + name + "：命中 " + c + " 次（应 1）—— 该文件未改动"); process.exit(1); }
    s = s.replace(a, b);
    console.log("  ok   " + name);
  }
  fs.writeFileSync(file, crlf ? s.replace(/\n/g, "\r\n") : s, "utf8");
  console.log("  → " + len0 + " → " + s.length + " 字符，行尾保持 " + (crlf ? "CRLF" : "LF"));
}

/* ---------- 1) verify-v052 §7 + §8 ---------- */
patchFile(".setup/verify-v052.js", [
  [
    "  const inline = (s) => s.split(tok).join(core);",
    [
      "  /* 与 build-singlefile.js 的 inline() **逐条对齐**：LPC 与 WYS 两个占位都要替换。",
      "   * 之前只替了 LPC —— v0.7.0 引入 __WYS__ 之后这条断言就恒假了：",
      "   * 它测的不再是「改了源码没重新打包」，而是「build 的内联规则是什么」。",
      "   * 断言本意（防源码/产物漂移）不变，只是得用同一套转换来比。 */",
      "  const wysRaw0 = fs.readFileSync(path.join(WS, \"server\", \"wysiwyg.js\"), \"utf8\");",
      "  const wysBody0 = wysRaw0.replace(/^module\\.exports\\s*=\\s*\\{([^}]*)\\};?[^\\S\\n]*$/m, \"return {$1};\");",
      "  const wysSrc0 = \"const WYS = (function () {\\n\" + wysBody0 + \"\\n})();\";",
      "  const tokW = \"/*\" + \"__WYS__\" + \"*/\";",
      "  const inline = (s) => s.split(tok).join(core).split(tokW).join(wysSrc0);",
    ].join("\n"),
    "§7 inline() 补 WYS 内联（与 build 对齐）",
  ],
  [
    [
      "ok(fs.readFileSync(path.join(TOOLS, \"latex-server.js\"), \"utf8\") === fs.readFileSync(path.join(WS, \"server\", \"index.js\"), \"utf8\"),",
      "  \"latex-server.js ≡ server/index.js（字节一致）\");",
    ].join("\n"),
    [
      "/* build 会把 index.js 的 VERSION 常量对齐到 manifest.version（顺带抹掉行尾注释），",
      " * 所以这里必须**先施加同一条改写**再逐字节比 —— 否则测的是「build 改了什么」，",
      " * 而不是「源码同步过去没有」。 */",
      "const verAlign = (s) => s.replace(/^const VERSION = \"[^\"]*\";.*$/m, 'const VERSION = \"' + wsManifest.version + '\";');",
      "ok(verAlign(fs.readFileSync(path.join(TOOLS, \"latex-server.js\"), \"utf8\")) === verAlign(fs.readFileSync(path.join(WS, \"server\", \"index.js\"), \"utf8\")),",
      "  \"latex-server.js ≡ server/index.js（字节一致，已对齐 build 的版本号改写）\");",
    ].join("\n"),
    "§8 VERSION 行按 build 规则对齐后再比",
  ],
]);

/* ---------- 2) test-activefile ---------- */
patchFile(".setup/test-activefile.js", [
  [
    "const src = (f) => fs.readFileSync(path.join(WS, f), \"utf8\");",
    [
      "/* ⚠ 读进来先归一 CRLF：本仓库 editor.tsx 是 CRLF、outline.tsx 是 LF（历史遗留，",
      " * 两边没统一）。下面按**代码片段**抠取时用的锚点是按 LF 写的，不归一必然失配 ——",
      " * \"\\n  }, 120);\\n}\\n\" 碰上 \"\\r\\n  }, 120);\\r\\n}\\r\\n\" 里的 \"\\n}\" 是匹配不上的。",
      " * 这里抠的是「源码长什么样」，不是「字节是否一致」，归一不影响测试意图。 */",
      "const src = (f) => fs.readFileSync(path.join(WS, f), \"utf8\").replace(/\\r\\n/g, \"\\n\");",
    ].join("\n"),
    "src() 归一 CRLF",
  ],
]);

/* ---------- 3) test-nav 假节点 ---------- */
patchFile(".setup/test-nav.js", [
  [
    "    getAttribute: function () { return null; },",
    [
      "    getAttribute: function () { return null; },",
      "    /* 就地编辑那层会 querySelectorAll(\".wys-blk\") 扫块。这里的假节点没有真实子树，",
      "     * 给个空集 —— 语义是「这份文档里没有可回写的块」，不是「让断言过」。",
      "     * 缺了它，commitWys / applyWys 会直接 TypeError 把整个 harness 掀掉。 */",
      "    querySelector: function () { return null; },",
      "    querySelectorAll: function () { return []; },",
    ].join("\n"),
    "假节点补 querySelector(All)",
  ],
]);

console.log("\n✓ 全部修复写入");
