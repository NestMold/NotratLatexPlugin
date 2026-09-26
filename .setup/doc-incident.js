/* 把「渲染器编译 input must be a string」事故复盘写进 README（幂等）。
 * 用法: node .setup/doc-incident.js
 */
const fs = require("fs");
const path = require("path");

const ws = "E:/notrat-latex-plugin";
const p = path.join(ws, "README.md");
const MARK = "must be a string or a Uint8Array";
const ANCHOR = "### 已知边界（没动的）";

let s = fs.readFileSync(p, "utf8");
if (s.includes(MARK)) {
  console.log("已记录，跳过");
  process.exit(0);
}
if (!s.includes(ANCHOR)) {
  console.error("锚点未找到: " + ANCHOR);
  process.exit(1);
}

const L = [
  "### 事故复盘：`渲染器编译 · components/Chat/MarkdownRenderer.tsx#MarkdownRenderer`",
  "",
  "| 项 | 内容 |",
  "|---|---|",
  "| 现象 | 界面弹红条：`Transform failed with 1 error: … ERROR: The input to transform must be a string or a Uint8Array` |",
  "| 宿主链路 | `enable()` 对 `contributions.renderers` 先 `resolveRendererComponentId(nodeType, componentId)` → `PLUGIN_RENDERER_MAP[\"markdown/code\"] = \"components/Chat/MarkdownRenderer.tsx#MarkdownRenderer\"`，再 `window.electronAPI.component.compile({ componentId, source: r.source })` |",
  "| 关键契约 | 宿主**不解析 `sourceFile`**：整份 renderer bundle 里 `sourceFile` 只出现 3 次（2 次在 `stripInlinedPanelSources`、1 次是「编辑器缺 source」的告警文案）。单文件包里 `editors[].source` / `renderers[].source` / `ui[].content.source` 必须是**内联字符串** |",
  "| 根因 | 部署包 `~/.notrat/plugins/notrat-latex-plugin.json` 被**目录态 `manifest.json` 逐字节覆盖**（8782 vs 8783 字节，只差末尾换行）→ 9 份组件源码从「内联 source」退回「sourceFile 引用」→ `r.source === undefined` → esbuild `transform(undefined)` 抛错 |",
  "| 为何只有 renderers 弹红条 | renderers 分支**没有** `!source` 守卫；editors 分支有（`if(!Bn.source){ warn; continue }`），于是编辑器静默失效、由渲染器把红条顶出来 |",
  "| 修复 | `node .setup/build-singlefile.js` 重新内联 9 份源码并落盘（222 → 227 KB），`args` 一并改回 `~/.notrat/tools/latex-server.js` → 69 项验收全绿 |",
  "| 附带硬伤 | 同一个 `undefined` 把验收脚本自己也打崩了（`Cannot read properties of undefined (reading 'includes')`）→ 已加防呆：**报红不崩**，失败行直接打印修复命令 |",
  "| 铁律 | 改完 `panels/*.tsx` 或 `manifest.json` **必须跑 `build-singlefile.js` 再 reload**；直接 `cp manifest.json ~/.notrat/plugins/` 会把单文件包打回目录态，必然复现本事故 |",
  "",
  "",
].join("\n");

fs.writeFileSync(p, s.replace(ANCHOR, L + ANCHOR), "utf8");
console.log("README 已更新，", fs.statSync(p).size, "字节");
