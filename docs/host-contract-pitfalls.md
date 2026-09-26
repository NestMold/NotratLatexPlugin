# 宿主契约踩坑（Notrat 插件开发者向）

> 本文从 README 拆出，正文逐字保留。记录宿主实现与 Wiki 文档的出入——照 Wiki 写不会报错，而是**静默失效**。
> 基准：宿主 0.2.4 实测；`notrat.minVersion` 相关结论更新至 v0.9.3。

## 1. `mcpServers` 必须用数组形态

必须写 `[{ id, name, transport, command, args, env }]`，
不要用 Wiki §1、§2 示例的对象形态 `{ latex: {...} }`。

对象形态会让宿主 `enable()` 里 `for...of` 抛
`object is not iterable (cannot read property Symbol(Symbol.iterator))`，
表现为插件管理页点「启用」没反应、MCP server 永远不被 spawn、日志无明确报错
（只有 Renderer:ERROR 一行 UnhandledRejection）。

## 2. `contributions.settings` 同样必须数组

必须写 `[{ key: "组名", title, fields: [{ key, label, type, default }] }]`，
分组 `key` 必须等于 `manifest.id`，占位符只写纯字段名 `${settings:<字段名>}`。

Wiki §3.3 说的 `${settings:组名.字段名}` 与宿主实现不符，照写会让设置静默失效（见 CHANGELOG §v0.4.2）。

## 3. 佐证

notrat-broadcast、notrat-sync、notrat-flow 三个在跑的官方插件全是数组形态。

## 4. 大纲与 `outlineTool` 契约（v0.5.4 更正）

`editors[].outlineTool`、`notrat-outline-navigate`、`ui[].extensions`：Notrat 1.3.3 起宿主已全部实现
（早期文档写「当前装机版尚未实现」，是拿过期快照下的结论，已在 v0.5.4 更正）。现状：

- 宿主 `PluginOutlineItems` 用 `{fileName, filePath}` 调 `editors[].outlineTool` 指定的工具，
  返回交 `parseItems()` 渲染进左侧「大纲」页签；点击回抛 `notrat-outline-navigate`（detail 带 `anchor`）。
- `ui[].extensions` 在 1.3.3 注册表里已保留（更早的构建会丢弃该字段）。
- 返回形态是硬契约，必须能过宿主 `parseItems`；返回多行文本会被静默解析成 1 条（见 v0.5.3、v0.5.4）。
- 自带大纲的层级：`level` 从 1 起。本插件按真实文档层级输出（章、节为 1，小节 2，小小节 3，
  `\part` 兜到 1），`anchor` 直接给源文件行号。注意别把 `level`、`text`、`anchor`
  理解成返回一串多行文本，那是宿主 `parseItems` 的字符串分支，在 MCP 里够不到
  （见 v0.5.4 实验 A），必须用一条一项的数组形态。

## 5. `notrat.minVersion` 是声明，不是闸门（v0.9.3 起）

- 本插件 `notrat.minVersion` 写 1.3.3（原为 1.3.0）：插件真的用到 1.3.3 才进注册表的
  `editors[].outlineTool`、`notrat-outline-navigate`、`ui[].extensions`（含 `extractToolText`），
  所以下限抬到 1.3.3，不再声明一个自己并不需要的 1.3.0。
- 这个字段是声明，不是闸门：核验过运行中的宿主 `app.asar`，里面 42 处 `minVersion`
  全部来自第三方库（protobufjs、semver、TypeScript 的 `ScriptVersionCache`），
  没有一处读 `notrat.minVersion`。所以低于 1.3.3 的宿主照样加载插件，只是那些 1.3.3 契约不在位。
- 契约是否在位用 `.setup/check/live-host-contract.js` 现场核对，不要信任何旧快照。

## 6. `fileTreeMenus` 注入的是 `filePath`，不是 `path`

宿主注入的是 `filePath`，而各工具原先只认 `args.path`。不兼容的后果不是报错，
而是 `resolveInput(undefined)` 静默走「自动发现主 `.tex`」：右键 `test.tex` 会给你 `sample.tex` 的报告。
v0.6.0 已给 5 个工具入口和 2 处快照入口统一加 `args.path || args.filePath` 归一，并加了回归断言。
