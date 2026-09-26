/* v0.5.0 补丁 3：去掉大纲面板里那段会把用户折叠状态冲掉的冗余 effect
 * （层级切换已经由 select 的 onChange 直接处理，这个 effect 只会把每文件折叠状态和
 *   用户手动折叠覆盖掉 —— v1 遗留的"每次模型变化就重置"式写法）
 */
const fs = require("fs");
const path = require("path");
const WS = "E:/notrat-latex-plugin";
const p = "panels/outline.tsx";
let s = fs.readFileSync(path.join(WS, p), "utf8");

const bad = [
  "  /* 层级预设：换了显示内容或层级就重算折叠（9 = 全部展开） */",
  "  useEffect(",
  "    function () {",
  "      if (!info) return;",
  "      const store = foldStore.current;",
  "      const keep = store[file];",
  "      const auto = level >= 9 ? {} : collapseDeeperThan(model.roots, level);",
  "      /* 用户手动折叠过的状态优先，只有换层级/换内容时才整体重置 */",
  "      setFolded(function () {",
  "        return keep && level >= 9 && Object.keys(auto).length === 0 ? Object.assign({}, auto) : Object.assign({}, auto);",
  "      });",
  "    },",
  "    [level, info, showFloats, showTodos, showLabels, model] // eslint-disable-line",
  "  );",
  "",
].join("\n");

if (s.indexOf("层级预设：换了显示内容或层级就重算折叠") < 0) {
  console.log("  = 目标 effect 已不存在，无需处理");
} else {
  const n = s.split(bad).length - 1;
  if (n !== 1) { console.error("锚点不唯一:", n); process.exit(1); }
  s = s.replace(bad, "");
  fs.writeFileSync(path.join(WS, p), s);
  console.log("  ✓ 已移除会把折叠状态冲掉的冗余 effect");
}
