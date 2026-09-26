/* v0.7.0 —— README 更新：头部摘要 / 功能表 / 开发清单 / 验收命令 / 追加 §v0.7.0
 * 章节正文放在 .setup/v070/readme-v070.md（原样 markdown，避开 JS 转义地狱）。
 * 运行： node .setup/patch-readme-v070.js
 */
const fs = require("fs");

const f = "E:/notrat-latex-plugin/README.md";
let src = fs.readFileSync(f, "utf8");
let done = 0;
function sub(label, anchor, repl) {
  const n = src.split(anchor).length - 1;
  if (n !== 1) { console.error("✗ [" + label + "] 命中 " + n + " 次（期望 1）"); process.exit(1); }
  src = src.split(anchor).join(repl); done++; console.log("  ✓ " + label);
}

/* 1. 头部摘要 */
sub("01 头部摘要",
  "> 各版详见文末 §v0.6.1 / §v0.6.0 / §v0.5.2。",
  "> 各版详见文末 §v0.7.0 / §v0.6.1 / §v0.6.0 / §v0.5.2。\n"
  + ">\n"
  + "> **v0.7.0：可视化视图从「只读预览」变成「可编辑」。** 正文与标题可就地改，\n"
  + "> 公式 / 引用 / 浮动体 / 参考文献仍是原子卡片（不可误伤），改完只回写被改的那几块的行区间，\n"
  + "> 未编辑的字节逐字节保留。内核在 `server/wysiwyg.js`，构建期以 IIFE 内联进编辑器源码。");

/* 2. 功能表：补一行「就地编辑」 */
sub("02 功能表",
  "| 可视化视图 | Overleaf 式实时预览：标题/作者/日期、章节层级、KaTeX 公式（离线资产内嵌）、`\\includegraphics` 真实图片、表格、题注与编号 |",
  "| 可视化视图 | Overleaf 式实时预览：标题/作者/日期、章节层级、KaTeX 公式（离线资产内嵌）、`\\includegraphics` 真实图片、表格、题注与编号 |\n"
  + "| **就地编辑** | 可视化视图里**正文与标题可直接改**（v0.7.0）：失焦即写回源码，只替换被改块的行区间；公式 / `\\cite` / `\\ref` / 浮动体 / 参考文献是原子节点，改不动也删不掉内部；工具栏 `✏ 就地编辑` 可切回只读预览 |");

/* 3. 开发：文件清单 */
sub("03 开发清单",
  "server/preview-core.js     可视化预览内核（构建期内联进编辑器源码）",
  "server/preview-core.js     可视化预览内核（构建期内联进编辑器源码）\n"
  + "server/wysiwyg.js          块模型 + 块级回写内核（方案 A；构建期以 IIFE 内联进编辑器源码）");

/* 4. 开发：验收命令 */
sub("04 验收命令",
  "node .setup/test-outline-render.js           # 大纲面板渲染/交互（21 项）\n",
  "node .setup/test-outline-render.js           # 大纲面板渲染/交互（21 项）\n"
  + "node .setup/gate-v070.js                     # ★ 就地编辑验收门（3 层：内核 44 项 + 离线编译 + 真 DOM 19 项）\n"
  + "node server/wysiwyg.test.js                  #   只跑内核单测\n"
  + "node .setup/check-v070-dom.js                #   只跑真 DOM 往返（需 devDependencies: jsdom / esbuild）\n");

/* 5. 追加 §v0.7.0 到文末 */
const SEC = fs.readFileSync("E:/notrat-latex-plugin/.setup/v070/readme-v070.md", "utf8");
sub("05 追加 §v0.7.0",
  "部署包无 `right-panel`。",
  "部署包无 `right-panel`。\n" + SEC);

fs.writeFileSync(f, src);
console.log("\n✓ README.md 已更新（" + done + " 处）");
