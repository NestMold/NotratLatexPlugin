/* v0.5.0 收尾：server 版本号同步 + render 测试的过滤框断言改成读 props
 *   1) server/index.js 的 VERSION 常量还是 0.4.2（部署后 ready 横幅与 initialize
 *      回报的 serverInfo.version 都跟着它走，不改会和 manifest 的 0.5.0 对不上）
 *   2) 过滤框的占位文字是 input 的 placeholder 属性，不是子文本，
 *      collectText 看不到 —— 断言改成按 props.placeholder 查
 */
const fs = require("fs");
const path = require("path");
const WS = "E:/notrat-latex-plugin";
const read = (p) => fs.readFileSync(path.join(WS, p), "utf8");
const write = (p, s) => fs.writeFileSync(path.join(WS, p), s);

function rep(p, from, to, label) {
  let s = read(p);
  if (s.indexOf(from) < 0) return console.log("  = " + label + " 已是目标形态");
  if (s.split(from).length - 1 !== 1) throw new Error(label + " 锚点不唯一");
  write(p, s.replace(from, to));
  console.log("  ✓ " + label);
}

rep("server/index.js", 'const VERSION = "0.4.2";', 'const VERSION = "0.5.0";', "server VERSION -> 0.5.0");

rep(
  ".setup/test-outline-render.js",
  '  ok(text.indexOf("过滤标题") >= 0, "过滤框渲染了");',
  [
    '  const inputEl = findEls(tree, []).filter(function (e) { return e.type === "input" && /\\u8fc7\\u6ee4/.test(String((e.props || {}).placeholder || "")); })[0];',
    '  ok(!!inputEl, "\\u8fc7\\u6ee4\\u6846\\u6e32\\u67d3\\u4e86\\uff08placeholder \\u5e26\\u201c\\u8fc7\\u6ee4\\u201d\\uff09");',
    '  ok(inputEl && inputEl.props.onChange && inputEl.props.onKeyDown, "\\u8fc7\\u6ee4\\u6846\\u63a5\\u4e86 onChange / Esc");',
  ].join("\n"),
  "render 测试：过滤框断言改成读 props"
);

rep(
  ".setup/test-outline-render.js",
  "function findRows(node, out) {",
  [
    "function findEls(node, out) {",
    "  if (!node) return out;",
    "  if (Array.isArray(node)) { node.forEach((n) => findEls(n, out)); return out; }",
    "  if (node.__el) { out.push(node); (node.children || []).forEach((c) => findEls(c, out)); }",
    "  return out;",
    "}",
    "function findRows(node, out) {",
  ].join("\n"),
  "render 测试：补 findEls 工具"
);

console.log("\ndone");
