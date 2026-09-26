## v0.5.2 — 收敛为「编辑器 + 大纲」（其余贡献面全部下线）

**诉求**：只要编辑器和大纲，其他都不要。

### 贡献面裁剪（manifest）

| 贡献面 | v0.5.1 | v0.5.2 |
|---|---|---|
| `editors` | `latex-editor`（tex, dualView） | ✅ 保留，**新增 `outlineTool: "latex_outline"`** |
| `ui` | 9 个挂载位 | ✅ 只留 `latex-outline@outline`，**新增 `extensions: ["tex"]`** |
| `settings` | 5 字段 | ✅ 只留 `compiler` / `timeout` / `outlineDepth` |
| `renderers` | markdown 代码块渲染器 | ❌ 移除（`panels/code-renderer.tsx` 源码保留） |
| `commands` | 6 条 `/latex-*` | ❌ 移除 |
| `promptSections` | 1 条 | ❌ 移除（副作用：AI 不再自带插件工具说明） |
| `toolHooks` | 编译前自动快照 | ❌ 移除（`latex_backup` 工具本身还在，只是不再自动触发） |
| `fileTreeMenus` | 7 条右键菜单 | ❌ 移除 |
| `ui` 其余挂载位 | page / right-panel / editor-header / editor-tabs / widget / activity-bar / status-bar / sidebar-input | ❌ 全部移除 |

部署包 **227KB → 112KB**，内联组件 9 → 2。

**顺带印证了 Wiki 的说法**：编辑器的「源码/可视化」切换**不该**用 `editor-tabs` / `editor-header` 做，
`editors.dualView` 才是正路（跟编辑器走、只在打开 `.tex` 时出现）。旧版的 editor-tabs/editor-header
本来就是 v0.4.0 时期对 `dualView` 未生效的绕过方案，v0.5.2 删掉它们没有功能损失。

### 接上宿主「大纲工具」契约（`editors[].outlineTool`）

Wiki §3.7 给编辑器插件定了大纲接入的唯一契约：编辑器声明 `outlineTool`，宿主自带大纲面板用它取条目；
点击条目宿主回抛 `notrat-outline-navigate`，编辑器按 `anchor` 定位。三处落地：

1. **`server/contrib.js`** 新增 `outlineHostProtocol(res, depth)` —— 输出 `level|text|anchor` 逐行。
2. **`server/index.js`** `latex_outline` 改成**双通路**：
   - 面板调用 `{ path }` → 沿用 `outlineProtocol` 的 list 行协议（`[ ] #行号 编号 标题`）
   - 宿主调用 `{ filePath, fileName }`（宿主自动注入，无 `path`/`format`）→ 输出 `level|text|anchor`
   - 也可显式 `format: "outline"` 主动要宿主格式
   - schema 补上 `filePath` / `fileName` / `format` 三个字段，并把 `path || filePath` 统一归一
3. **`panels/editor.tsx`** 新增 `notrat-outline-navigate` 监听 → 滚到 `detail.anchor` 行，
   并按 `detail.pluginId` 过滤（不抢别家插件的大纲事件）。与自家面板的 `notrat-latex-reveal-line`
   通路并存，两条互不干扰。

> 装机版宿主还没实现这三个契约（`.setup/host/` 提取包里搜不到 `outlineTool` / `notrat-outline-navigate`，
> `dualView` 有），所以现在声明是**前瞻性的**：旧宿主忽略、零副作用，升级后自动生效。

### 写这段代码时被抓出来的两个真问题

1. **宿主契约的 level 差了一级**。第一版写 `r.level + 1`，而内部层级表是
   `{ part: 0, chapter: 1, section: 1, subsection: 2, subsubsection: 3 }` ——
   `\section` 本来就该是顶层（1），再 +1 变成 2，宿主大纲里整棵树会平白多缩进一格。
   已改为 `Math.max(1, r.level)`，并给冒烟加了断言：顶层 `\section` 的 level 必须 `== 1`、
   `\subsection` 必须比它深一级。**这条是「照着 wiki 猜数字」猜出来的 bug，实测才发现。**
2. **裁剪留下的死按钮**。大纲页脚的「⤢ 整页」按钮派发 `notrat-open-plugin-page` →
   `latex-page`，而 `latex-page` 这个 `ui` 贡献已随裁剪下线 —— 留着就是个点了没反应的按钮，已删除。

### 顺带修掉的工程债

- **版本漂移**：`build-singlefile.js` 里写死 `const VERSION = "0.5.1"`，而 manifest 已改 0.5.2，
  打包会把部署包版本改回旧号。已改为**从 `manifest.json` 读取**，单一事实源。
- **部署产物污染检查**：新增 `verify-v052.js` 第 7 节，把工作区 `panels/*.tsx` 按 build 同样的
  规则（LPC 占位注入 preview-core）跑一遍，与部署包内联源码**逐字节比对**——
  "改了源码忘了重新打包"从此会被拦住，而不是靠人去记。

### 验收（全部离线可跑，退出码 0/1）

```
node .setup/verify-v052.js          # 81 项：结构 / 白名单 / UI 面 / 编辑器声明 /
                                    #        内联体检 / esbuild 转译 / 字节一致 /
                                    #        server 同步 / 冒烟（含子测试 21 项）
node .setup/test-v052.js            # 21 项：工具表 + 大纲双通路 + 其余工具未被裁坏 + depth 生效
node .setup/test-outline-render.js  # 21 项：大纲面板渲染与交互（沿用 v0.5.0 断言）
```

反向断言是这版验收的重点——不只检查"该在的在"，还检查"该没的**确实没**"：
`renderers` / `commands` / `promptSections` / `toolHooks` / `fileTreeMenus` 必须缺席，
12 个不该出现的 `ui` 挂载位必须一个都不在。

### 已知边界（本版引入）

- 移除 `promptSections` 后，侧栏 AI 不再自动知道本插件有哪些工具（需要时可用
  `/plugin-run notrat-latex-plugin latex_outline {...}` 直接调，或把这一条加回去）。
- 移除 `toolHooks` 后编译前不再自动快照；`latex_backup` 工具仍在，可手动调用。

