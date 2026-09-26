#!/usr/bin/env node
/* 归因实验：同一份大纲数据，三种"返回形态"喂给**线上 Notrat 1.3.3 的真 parseItems**，
 * 看宿主分别解析出几条。目的是把「怪谁」建立在证据上，而不是靠读代码猜。
 *
 *   A. Wiki 文档写的 `level|text|anchor` 多行文本，但按 MCP 常规包成 {content:[{type:"text"}]}
 *   B. 同样文本，直接当裸字符串返回（不包 envelope）
 *   C. 现在的实现：content 里一条一项，各带 level / anchor
 */
const fs = require("fs");
const path = require("path");

function liveParseItems() {
  const s = fs.readFileSync(path.join(__dirname, "live/index-XIov55p-.js"), "utf8");
  const a = s.indexOf("function parseItems(it){");
  const b = s.indexOf("function PluginOutlineItems(", a);
  return eval("(" + s.slice(a, b).replace(/^function parseItems/, "function") + ")");
}

const PIPE =
  "1|1  引言|125\n" +
  "1|2  理论基础与问题定义|144\n" +
  "2|2.1  正向求解模型|149\n" +
  "2|2.2  时空解耦模型|164\n";

const ITEMS = [
  { type: "text", text: "1  引言", level: 1, anchor: "125" },
  { type: "text", text: "2  理论基础与问题定义", level: 1, anchor: "144" },
  { type: "text", text: "2.1  正向求解模型", level: 2, anchor: "149" },
  { type: "text", text: "2.2  时空解耦模型", level: 2, anchor: "164" },
];

const cases = [
  ["A. 按 Wiki 写文本，但走标准 MCP envelope（旧实现）", { content: [{ type: "text", text: PIPE }] }],
  ["B. 同样文本，裸字符串返回（非标准 MCP 形态）", PIPE],
  ["C. content 里一条一项 + level/anchor（v0.5.3 实现）", { content: ITEMS }],
  ["D. 裸数组（把 items 直接当 result）", ITEMS],
];

const parseItems = liveParseItems();
console.log("解析器: 线上 app.asar → dist/assets/index-XIov55p-.js 的真 parseItems\n");

for (const [name, input] of cases) {
  const out = parseItems(input);
  const nl = out.some((x) => /[\n\r]/.test(String(x.text)));
  console.log("── " + name);
  console.log("   条目数 = " + out.length + "   " + (out.length > 1 ? "✅ 成树" : "❌ 塌成一条"));
  if (nl) console.log("   ⚠ 条目 text 里带换行 → 宿主 <span class=truncate> 会把换行折成空格 → 视觉上就是「一行」");
  console.log("   首条 = " + JSON.stringify(out[0] || null).slice(0, 160));
  console.log("");
}
