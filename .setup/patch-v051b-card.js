/* v0.5.1 补丁 b：findHostCard / hideOrphanSectionLabel 用统一的 isCardNode + 直接子节点判定
 *
 * 原因（行为测试逼出来的）：原 hideOrphanSectionLabel 用 querySelectorAll 扫整棵子树，
 * 于是「别人的卡片自己已被 display:none 藏起来」时，它内部的 .notrat-plugin-panel
 * 仍被当成「露着的卡片」（自身 display 不是 none），导致分区标题该收没收。
 * 改成只看挂载位容器的直接子节点即可，顺带不会再越界碰卡片内部的节点。
 */
const fs = require("fs");
const path = require("path");

const WS = "E:/notrat-latex-plugin";
const FILE = path.join(WS, "panels/outline.tsx");
let s = fs.readFileSync(FILE, "utf8");

const START = "function findHostCard(el) {";
const END = "/* hidden=true -> 藏掉整张卡片；false -> 还原。返回挂到根节点上的 ref。 */";
const i = s.indexOf(START);
const j = s.indexOf(END);
if (i < 0 || j < 0 || j < i) throw new Error("找不到 findHostCard / hideOrphanSectionLabel 区段");

const NEW = [
  'function classTokens(node) {',
  '  const cls = node && typeof node.className === "string" ? node.className : "";',
  '  return cls ? cls.split(/\\s+/) : [];',
  '}',
  '',
  '/* 卡片本体 = Dismissable 的 group/panel 壳，或退一步的 PanelShell 卡片。',
  ' * 精确 token 比较 —— notrat-plugin-panel-body / -header / -outline 都不算卡片本体。 */',
  'function isCardNode(node) {',
  '  const toks = classTokens(node);',
  '  return toks.indexOf("group/panel") >= 0 || toks.indexOf("notrat-plugin-panel") >= 0;',
  '}',
  '',
  'function findHostCard(el) {',
  '  let node = el;',
  '  let card = null;',
  '  while (node && node !== document.body) {',
  '    if (classTokens(node).indexOf("notrat-plugin-slot") >= 0) break; /* 到挂载位容器，停止，不越界动别人的东西 */',
  '    if (isCardNode(node)) card = node;',
  '    node = node.parentElement;',
  '  }',
  '  return card;',
  '}',
  '',
  'function isRendered(node) {',
  '  try {',
  '    const cs = window.getComputedStyle(node);',
  '    return !!cs && cs.display !== "none" && cs.visibility !== "hidden";',
  '  } catch (e) {',
  '    return true;',
  '  }',
  '}',
  '',
  '/* 本面板是这一区唯一一张卡片时，「插件面板」那行分区标题会孤零零飘着 —— 一并收起；',
  ' * 还有别人的卡片露着就留着（那是别人的标题，不归我们管）。',
  ' * 只看挂载位容器的【直接子节点】：卡片内部的节点不算数 —— 否则别人的卡片自己被藏了，',
  ' * 它内部的 .notrat-plugin-panel 还会被数成「露着的卡片」，标题就永远收不掉。 */',
  'function hideOrphanSectionLabel(card) {',
  '  const box = card.parentElement;',
  '  if (!box) return null;',
  '  const kids = box.children || [];',
  '  for (let i = 0; i < kids.length; i++) {',
  '    const n = kids[i];',
  '    if (n === card || !isCardNode(n)) continue;',
  '    if (isRendered(n)) return null; /* 还有卡片露着 -> 标题留给它 */',
  '  }',
  '  const label = box.firstElementChild;',
  '  if (!label || label === card || isCardNode(label)) return null;',
  '  return label;',
  '}',
  '',
  '',
].join("\n");

s = s.slice(0, i) + NEW + s.slice(j);
if (s.indexOf("querySelectorAll") >= 0) throw new Error("仍残留 querySelectorAll 扫描子树");
fs.writeFileSync(FILE, s, "utf8");
console.log("已更新 findHostCard / isCardNode / hideOrphanSectionLabel");
