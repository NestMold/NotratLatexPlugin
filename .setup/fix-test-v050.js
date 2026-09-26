/* 修正 test-outline-v2.js 里一条写错的断言（是我的期望写错，不是实现错）
 * 语义澄清：level=N = "展开到第 N 层" -> 折叠 depth > N 的节点
 *   方法 depth=1、结构 depth=2  =>  level=1 该收起的是 结构
 */
const fs = require("fs");
const path = require("path");
const p = "E:/notrat-latex-plugin/.setup/test-outline-v2.js";
let s = fs.readFileSync(p, "utf8");

const bad = [
  "const deep = L.collapseDeeperThan(mA.roots, 1);",
  'ok(deep[secMethod.id] === true, "collapseDeeperThan(1) 折叠 depth>1 且有子节点的章节");',
].join("\n");

const good = [
  "const deep = L.collapseDeeperThan(mA.roots, 1);",
  'ok(deep[secStruct.id] === true, "collapseDeeperThan(1) 折叠 depth>1 的 结构");',
  'ok(deep[secMethod.id] !== true, "collapseDeeperThan(1) 不折叠 depth=1 的 方法");',
  'ok(L.collapseDeeperThan(mA.roots, 2)[secStruct.id] !== true, "collapseDeeperThan(2) 放开 depth=2 的 结构");',
  'ok(L.collapseDeeperThan(mA.roots, 0)[secMethod.id] === true, "collapseDeeperThan(0)（仅顶层）折叠 depth=1 的 方法");',
].join("\n");

if (s.indexOf(bad) < 0) {
  console.error("anchor missing");
  process.exit(1);
}
fs.writeFileSync(p, s.replace(bad, good));
console.log("  ✓ 断言已修正（4 条，覆盖 level 0/1/2 三种语义）");
