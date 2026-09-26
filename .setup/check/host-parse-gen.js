#!/usr/bin/env node
/* =========================================================================
 * 从**装机版** renderer bundle 重新生成宿主大纲解析链 → host-parse-items.js
 *
 * 为什么必须自动生成、且必须指向「装机版」：
 *   0.5.3 那次事故是因为拿 `.setup/host/` 的旧快照当真理；
 *   v0.6.2 这次「大纲点了永远跳第 1 行」则是因为本地复刻版停在**旧宿主**——
 *   旧版 parseItems 会把 result.content 当条目数组读（level/anchor 保得住），
 *   新版在前面加了一层 extractToolText，先把 content[].text 拍平成多行文本，
 *   挂在内容块上的 level/anchor 就没了。复刻版不跟着更新，门就永远绿。
 *
 * 所以：本文件只用「抠」不用「抄」——三段函数体逐字节取自装机 bundle，
 *       host-parse-items.js 里除页眉外不含任何手写逻辑。
 *
 * 用法: node .setup/check/host-parse-gen.js            # 自动取 .setup/live/ 里最新的 bundle
 *       node .setup/check/host-parse-gen.js <bundle>   # 指定
 * 之后: node .setup/check/host-outline-contract.js     # 端到端断言（我们的返回 × 真解析器）
 * ========================================================================= */
const fs = require("fs");
const path = require("path");

const LIVE = path.join(__dirname, "..", "live");
const OUT = path.join(__dirname, "host-parse-items.js");

function newestBundle() {
  const cands = fs
    .readdirSync(LIVE)
    .filter((f) => /^index-.*\.js$/.test(f))
    .map((f) => path.join(LIVE, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (!cands.length) throw new Error("live/ 里没有 index-*.js（先跑 .setup/check/live-host-contract.js 取快照）");
  return cands[0];
}

/* 按花括号配对抠出「从 header 起到函数体结束」的源码（压缩产物里的这几段函数体不含字符串内花括号） */
function extractFn(src, header) {
  const i = src.indexOf(header);
  if (i < 0) throw new Error("bundle 里找不到: " + header);
  const j = src.indexOf("{", i);
  let depth = 0;
  for (let k = j; k < src.length; k++) {
    const c = src[k];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return src.slice(i, k + 1);
    }
  }
  throw new Error("花括号没配对: " + header);
}

const bundle = process.argv[2] || newestBundle();
const src = fs.readFileSync(bundle, "utf8");

const parts = {
  clampLevel: extractFn(src, ",clampLevel=it=>").replace(/^,/, ""),
  mapItemArray: extractFn(src, "function mapItemArray(it)"),
  parseLineProtocol: extractFn(src, "function parseLineProtocol(it)"),
  extractToolText: extractFn(src, "function extractToolText(it)"),
  parseItems: extractFn(src, "function parseItems(it)"),
};

const st = fs.statSync(bundle);
const head = [
  "/* 自动生成 —— 勿手改（改了这一行下面的东西就跟装机版脱钩了）。",
  " * 重新生成: node .setup/check/host-parse-gen.js",
  " * 来源 bundle: " + path.basename(bundle) + "  (" + (st.size / 1024 / 1024).toFixed(1) + "MB, mtime " + st.mtime.toISOString() + ")",
  " *",
  " * 这是宿主 parseItems 的**完整前置步骤**（含 1.3.3+ 新增的 extractToolText）：",
  " *   parseItems = extractToolText（把 result 拍平成文本，★ level/anchor 就在这一步丢的）",
  " *              → JSON.parse → Array/mapItemArray | 对象分支（items/data/content）",
  " *              → 兜底 parseLineProtocol（逐行 level|text|anchor）",
  " */",
].join("\n");

const body = [
  "const " + parts.clampLevel + ";",
  "",
  parts.mapItemArray,
  "",
  parts.parseLineProtocol,
  "",
  parts.extractToolText,
  "",
  parts.parseItems,
  "",
  "module.exports = { parseItems: parseItems, extractToolText: extractToolText, parseLineProtocol: parseLineProtocol, mapItemArray: mapItemArray, clampLevel: clampLevel };",
  "",
].join("\n");

fs.writeFileSync(OUT, head + "\n" + body);

/* 自检：生成的模块能被 require，且解析链真的在位 */
const mod = require(OUT);
const missing = ["parseItems", "extractToolText", "parseLineProtocol", "mapItemArray"].filter((k) => typeof mod[k] !== "function");
if (missing.length) {
  console.error("✗ 生成失败，缺少导出: " + missing.join(", "));
  process.exit(1);
}
console.log("✓ 已生成 " + path.relative(process.cwd(), OUT));
console.log("  clampLevel / mapItemArray / parseLineProtocol / extractToolText / parseItems 全部就位");
console.log("  来源: " + path.basename(bundle));
