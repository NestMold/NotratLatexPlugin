/* v0.5.1 补丁 c：挂载位容器按【前缀】识别
 *
 * 宿主给每个插件挂载位的容器类名是 notrat-plugin-slot[-<位置>]：
 *   notrat-plugin-slot-outline / -sidebar-input / -messages-top / -right-panel ...
 * 面板可以被用户右键挪到别的挂载位（类名后缀跟着变）。原实现只认裸 token
 * notrat-plugin-slot，挪位后就认不出容器、会继续向上走 —— 万一上面还有别的
 * notrat-plugin-panel，就会藏错东西（藏掉一大块界面）。
 */
const fs = require("fs");
const path = require("path");

const WS = "E:/notrat-latex-plugin";
const FILE = path.join(WS, "panels/outline.tsx");
let s = fs.readFileSync(FILE, "utf8");

const FROM = 'function findHostCard(el) {';
const TO =
  '/* 挂载位容器：宿主给每个挂载位都带了 notrat-plugin-slot[-<位置>] 这个类。\n' +
  ' * 前缀匹配 —— 面板被用户挪到别的挂载位（类名后缀不同）时也能正确收手。 */\n' +
  'function isSlotContainer(node) {\n' +
  '  const toks = classTokens(node);\n' +
  '  for (let i = 0; i < toks.length; i++) {\n' +
  '    if (toks[i].indexOf("notrat-plugin-slot") === 0) return true;\n' +
  '  }\n' +
  '  return false;\n' +
  '}\n' +
  '\n' +
  'function findHostCard(el) {';

if (s.indexOf(FROM) < 0) throw new Error("找不到 findHostCard");
if (s.indexOf(FROM) !== s.lastIndexOf(FROM)) throw new Error("findHostCard 不唯一");
s = s.replace(FROM, TO);

const FROM2 = '    if (classTokens(node).indexOf("notrat-plugin-slot") >= 0) break; /* 到挂载位容器，停止，不越界动别人的东西 */';
const TO2 = '    if (isSlotContainer(node)) break; /* 到挂载位容器，停止，不越界动别人的东西 */';
if (s.indexOf(FROM2) < 0) throw new Error("找不到收手判定");
s = s.replace(FROM2, TO2);

fs.writeFileSync(FILE, s, "utf8");
console.log("已更新：isSlotContainer（前缀识别挂载位容器）");
