#!/usr/bin/env node
/* 一次性补文档（幂等）：把 0.5.4 的归因与「快照过期」教训写进 README。
 * 用法: node .setup/doc-v054.js
 */
const fs = require('fs');
const path = require('path');

const WS = path.join(__dirname, '..');
const P = path.join(WS, 'README.md');
const MARK = '## v0.5.4 — 归因';

let s = fs.readFileSync(P, 'utf8');
if (s.includes(MARK)) { console.log('已记录，跳过'); process.exit(0); }

const NEW1 = [
  '- `editors[].outlineTool`、`notrat-outline-navigate`、`ui[].extensions`：**Notrat 1.3.3 起宿主已全部实现**',
  '  （本节原写「当前装机版尚未实现」，是拿过期快照下的结论，已在 v0.5.4 更正）。现状：',
  '  - 宿主 `PluginOutlineItems` 用 `{fileName, filePath}` 调 `editors[].outlineTool` 指定的工具，',
  '    返回交 `parseItems()` 渲染进左侧「大纲」页签；点击回抛 `notrat-outline-navigate`（detail 带 `anchor`）。',
  '  - `ui[].extensions` 在 1.3.3 注册表里已保留（更早的构建会丢弃该字段）。',
  '  - **返回形态是硬契约**，必须能过宿主 `parseItems`；返回多行文本会被静默解析成 1 条（见 v0.5.3 / v0.5.4）。',
  '  - `notrat.minVersion` 仍写 `1.3.0`：不满足时宿主忽略该字段，声明无害。',
  '  - 契约是否在位用 `.setup/check/live-host-contract.js` 现场核对，**不要信任何旧快照**。',
].join('\n');

const NEW2 = [
  '- 自带大纲的**层级**：level 从 1 起。本插件按真实文档层级输出',
  '  （章/节=1、小节=2、小小节=3、`\\part` 兜到 1），`anchor` 直接给源文件行号。',
  '  ⚠ 但**别把 `level|text|anchor` 理解成「返回一串多行文本」**——那是宿主 `parseItems` 的字符串分支，',
  '  在 MCP 里够不到（见 v0.5.4 实验 A）。必须用「一条一项」的数组形态。',
].join('\n');

const SECTION = [
  '## v0.5.4 — 归因：这次到底怪谁（我们的问题 / 开发文档的问题）',
  '',
  '**结论：直接责任在我们，宿主契约缺陷是放大器。** 三条账分开记。',
  '',
  '### 1. 触发点：我们的 bug —— 返回形态选错了',
  '',
  '宿主 `parseItems(result)` 有四条分支（1.3.3 逐字）：',
  '',
  '```js',
  'if (Array.isArray(it))                  te = it;                    // ① result 就是条目数组',
  'else if (typeof it === "string") { /* JSON.parse，失败则按 level|text|anchor 逐行切 */ } // ②',
  'else if (it && typeof it === "object") { const pt = it.content ?? it.items ?? it.data; // ③',
  '                                         if (Array.isArray(pt)) te = pt; }',
  '// 兜底：只有 typeof it === "string" 时才回到分支 ②',
  '```',
  '',
  '我们旧实现返回的是标准 MCP 形态 `{content:[{type:"text",text:"多行"}]}`，正好命中 ③：',
  '`content` 被当成条目数组 → 整份大纲只剩 1 条，而这条的 text 里带着换行；',
  '宿主条目是 `<span class="truncate">`，换行被折成空格 → **左侧大纲就是一行**。',
  '',
  '用**从线上包抠出来的真 `parseItems`** 跑四种形态（`.setup/verify-attribution.js`）：',
  '',
  '| 返回形态 | 解析出几条 | 结果 |',
  '|---|---|---|',
  '| A. `{content:[{type:"text",text:"level\\|text\\|anchor 多行"}]}`（旧实现） | **1** | ❌ 塌成一行 |',
  '| B. 同样文本、裸字符串（非标准 MCP 形态） | 4 | ✅ |',
  '| C. `content` 里一条一项 + `level`/`anchor`（v0.5.3 实现） | 4 | ✅ |',
  '| D. 裸数组（items 直接当 result） | 4 | ✅ |',
  '',
  'A 是**我们自己选**的形态，而且它正是 MCP 里最标准的那一个 —— 这份账记在我们头上。',
  '',
  '### 2. 放大器：宿主/文档的契约缺陷',
  '',
  '分支 ② 就是文档里那个 `level|text|anchor` 文本协议，但它有个**够不到的前置条件**：',
  '`typeof it === "string"`。而 MCP 规定工具返回**必须是对象** `{content:[...]}`。',
  '也就是说：**任何合规的 MCP server 都永远进不了分支 ②**，这个协议对 MCP 插件是死代码。',
  '更糟的是 `content` 这个键名被两种含义复用（MCP 内容块 / 大纲条目数组），',
  '对象分支又会**先**把字符串分支挡住，而且全程**无校验、无告警**：形状错了不报错，只是默默少几条。',
  '一个形状错误能变成「只是显示得奇怪」，这是宿主该修的地方（建议：先探 `content[0].text`，',
  '条目缺 `text` 时 warn，别让两条分支抢同一个键）。',
  '',
  '### 3. 为什么没提前发现：我们自己的流程漏洞（快照过期）',
  '',
  '根子在 v0.4.2 §6 与「已知边界」里那句「`outlineTool` 当前装机版尚未实现」——',
  '它是**对着 `.setup/host/` 的旧 renderer 快照**下的结论，而 Notrat 在当天 18:05',
  '自动更新到了 **1.3.3**，这套契约是新 renderer 才加的：',
  '',
  '| 证据 | 旧快照 `.setup/host/renderer.js` | 装机版 1.3.3 renderer |',
  '|---|---|---|',
  '| `parseItems` / `PluginOutlineItems` | 0 处 | 有 |',
  '| `outlineTool`（`editors` 解析里读） | 0 处 | 有 |',
  '| `notrat-outline-navigate` | 0 处 | 有 |',
  '| 文件 sha1 | `133ac88d…` | `5c081b50…`（`dist/assets/index-XIov55p-.js`） |',
  '| 该 sha1 是否还在 asar 里 | 否（连 AI 指引文案都换了） | 是 |',
  '',
  '所以：**我们声明了 `outlineTool`，却以为它是死的**，于是根本没测它被宿主渲染时的返回形态。',
  '等宿主真开始渲染，形状错误就直接怼到界面上。这条记我们头上，',
  '补丁是 `.setup/check/live-host-contract.js`：改插件前跑一遍，asar 比快照新就判 STALE，',
  '并现场核对 5 条契约 + 端到端把真 `parseItems` 跑在我们的输出上。',
  '',
  '### 一句话版',
  '',
  '> 是我们的问题：返回形态选错（该给数组却给了多行文本），',
  '> 而且兼容性判断用的是过期快照。',
  '> 开发文档 / 宿主也有账：`level|text|anchor` 协议在 MCP 下不可达、`content` 一键两义、错了不报错。',
  '> 前者我们能自己修掉，后者只能绕 —— 绕法就是「一条一项的数组」。',
  '',
  '',
].join('\n');

const RE1 = /- `editors\[\]\.outlineTool`[\s\S]*?（现在靠面板自己判断）。/;
const RE2 = /- 自带大纲的\*\*层级写法\*\*[\s\S]*?`anchor` 直接给源文件行号。/;
const ANCHOR = '## v0.5.2 — 收敛为「编辑器 + 大纲」';

for (const [n, re] of [['1', RE1], ['2', RE2]]) {
  if (!re.test(s)) { console.error('锚点 ' + n + ' 未找到'); process.exit(1); }
}
if (!s.includes(ANCHOR)) { console.error('锚点 3 未找到'); process.exit(1); }

s = s.replace(RE1, () => NEW1).replace(RE2, () => NEW2).replace(ANCHOR, SECTION + ANCHOR);
fs.writeFileSync(P, s, 'utf8');
console.log('README 已更新 →', fs.statSync(P).size, '字节');
