/* 往 test-outline-visibility.js 的 A 组补两个用例：
 *   1) 面板被挪到别的挂载位（容器类名带后缀）时也要在容器处收手
 *   2) 容器外面还有疑似卡片节点时，绝不能藏到它（那会藏掉一大块界面）
 */
const fs = require("fs");
const FILE = ".setup/test-outline-visibility.js";
let s = fs.readFileSync(FILE, "utf8");

const ANCHOR = '  ok(L.api.findHostCard(bodySentinel) === null, "向上走到 document.body 就停（不越界）");\n})();';
if (s.indexOf(ANCHOR) < 0) throw new Error("找不到 A 组结尾锚点");

const ADD = [
  '  /* 面板被用户右键挪到别的挂载位：容器类名换成 notrat-plugin-slot-right-panel，',
  '   * 收手判定必须照样认出来（否则会继续向上走，藏到不该藏的东西） */',
  '  const slot4 = el("notrat-plugin-slot-right-panel p-3 space-y-2");',
  '  const label4 = append(slot4, el("text-[10px] uppercase tracking-wider"));',
  '  const wrapper4 = append(slot4, el("relative group/panel"));',
  '  const card4 = append(wrapper4, el("notrat-plugin-panel"));',
  '  const body4 = append(card4, el("notrat-plugin-panel-body"));',
  '  const root4 = append(body4, el(""));',
  '  ok(L.api.findHostCard(root4) === wrapper4,',
  '    "挂载位带后缀（notrat-plugin-slot-right-panel）也认得出容器，照常收手");',
  '',
  '  /* 容器外面挂一个诱饵卡片：收手判定若失效就会藏到它 */',
  '  const outerDecoy = el("notrat-plugin-panel");',
  '  append(outerDecoy, slot4);',
  '  ok(L.api.findHostCard(root4) === wrapper4,',
  '    "容器外有诱饵卡片时也不会越界藏到它（前缀识别挂载位容器）");',
  '})();',
].join("\n");

s = s.replace(ANCHOR, '  ok(L.api.findHostCard(bodySentinel) === null, "向上走到 document.body 就停（不越界）");\n\n' + ADD);
fs.writeFileSync(FILE, s, "utf8");
console.log("已补 2 个用例");
