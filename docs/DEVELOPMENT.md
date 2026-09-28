# 开发指南

> 本文从 README 拆出，正文逐字保留。面向想改这个插件或给 Notrat 写插件的开发者。

## 源码结构

```text
manifest.json              插件清单（贡献面：editors + ui + fileTreeMenus + settings）
server/index.js            MCP stdio server（纯 Node 零依赖，10 个工具）
server/contrib.js          解析/校验/大纲/快照内核 + 两套大纲输出协议
server/preview-core.js     可视化预览内核（构建期内联进编辑器源码；v0.8.4 起 server 侧也要它 —— 导出兜底渲染）
server/wysiwyg.js          块模型 + 块级回写内核（方案 A；构建期以 IIFE 内联进编辑器源码）
server/export-html.js      自包含 HTML 导出内核（PV_CSS 与编辑器同源，gate 第 10 层逐条比对）
server/pdf-raster.js       PDF/EPS 插图栅格化（v0.9.0；latex_asset 用，磁盘缓存）
panels/editor.tsx          → editors[latex-editor]
panels/outline.tsx         → ui[latex-outline @ outline]
```

v0.9 的地基已经落地，但接线程度不一，别会错意：

```text
server/docmodel.js         无损 CST 文档模型（v0.9 P1）—— 已完成并测试，但**还没被 UI 用上**
server/txlog.js            事务历史（v0.9 P2）—— 已内联进装机产物，已被 panels/editor.tsx 调用
server/corpus/             32 份合成边界语料 + 2 份真实 .tex（npm run corpus 生成/拾取）
docs/v0.9-docmodel-plan.md 改造方案（含「分区进度 / 还剩什么」）
```

下面这些当前不在注册表里，源码保留，需要时加回 `manifest.json` 的 `contributions` 即可：

```text
panels/main.tsx            右侧结构面板 / 整页
panels/editor-header.tsx
panels/editor-tabs.tsx
panels/widget.tsx
panels/code-renderer.tsx
panels/_unused/selection.tsx   划词助手（v0.6.1 下线）
```

## 构建与脚本

```bash
npm install

npm run build          # node .setup/build-singlefile.js   → 打包写盘（热更新）
npm run gate           # node .setup/gate-v070.js          ★ 一条命令跑完全部门禁层次，任何一层红了就退出非零
npm run test:core      # node server/wysiwyg.test.js       内核单测（块模型 / applyEdits 不变式 / 行内往返）
npm run test:docmodel  # node server/v09-docmodel.test.js  v0.9 P1 文档模型（63 项）
npm run test:txlog     # node server/v09-txlog.test.js     v0.9 P2 事务历史（84 项）
npm run test:multifile # node server/v09-multifile.test.js v0.9.1 多文件预览（8 项，**不在 gate 里**）
npm run v09            # node server/v09-baseline.test.js  ★ 现状体检（2 个靶子仍红 —— 退出码 1 是预期）
npm run corpus         # node server/corpus/_make.js       生成合成语料
```

## 验收门（`npm run gate`）

共 30 层，实测 `✓ 验收门全绿（30/30，用时 86.5s）`。层按 `steps` 数组里的执行顺序编号：

| # | 层 | 加于 |
| --- | --- | --- |
| 1 | TDZ 顺序哨兵：依赖数组先用后声明，esbuild 和 tsc 都不报，只能静态查 | 0.7.1 |
| 2 | 内核单测：块模型、`applyEdits` 不变式、行内往返（Node，无 DOM） | — |
| 3 | 无损 CST：`serialize(parse(s)) === s` 逐字节，跑全部语料（v0.9 P1） | v0.9 |
| 4 | 事务历史：coalesce、rebase、gaps（v0.9 P2） | v0.9 |
| 5 | 面板离线编译：按装机同规则内联后 esbuild 编译（含重名、`module.exports` 残留检查） | — |
| 6 | 真 DOM 往返：装机包里的代码加 jsdom 真解析器，零改动往返必须逐字节还原 | — |
| 7 | 样式一致性：就地编辑与只读预览 | 0.7.3 |
| 8 | 形态门禁：「在结果上编辑」的硬约束，不许再长出卡片壳或模式开关 | 0.8.0 |
| 9 | 模式契约：档位入口只剩宿主标签栏一处，喂两代 `props.mode` 断言落档与回写 id | 0.8.3 |
| 10 | 导出契约：唯一会往磁盘写文件的功能，管产物落点、自包含性、样式单一来源 | 0.8.4 |
| 11 | 引擎自检：没装 TeX 引擎时该弹才弹、只弹一次、说的是实话 | 0.8.5 |
| 12 | 格式快捷键：Typora 键位 → LaTeX；菜单右侧标的键位必须真的实现了 | 0.8.6 |
| 13 | 切视图往返：可视化 → 源码 → 回可视化，正文必须还在 | 0.8.8 |
| 14 | 焦点不掉：按钮不夺焦，切档、收起浮层后还能接着按键 | 0.8.9 · 0.8.10 |
| 15 | 能正常编辑：可视化档 Ctrl+1 设标题、回车换行、光标落进正文 | 0.8.11 |
| 16 | 可撤销：打完字撤得动、切档不丢历史、外部改动不清栈（txlog 接线） | 0.8.18 |
| 17 | 块外的字：光标停在块外时敲的字不许静默丢 | 0.8.20 |
| 18 | 撤销看得见：打完字 Ctrl+Z，屏幕与源码一起回去 | 0.8.21 |
| 19 | 代码与内容分道：`\maketitle` 不进预览，字写不进命令 | 0.8.22 |
| 20 | 结构改动后重画：已设为 `\section` 有时不生效 | 0.8.23 |
| 21 | 分屏两栏同步：滚动联动两个方向，回声不打架 | 0.8.24 |
| 22 | 分屏内容同步：右栏打字 → 左栏当场变 | 0.8.25 |
| 23 | 回车分层：Enter 新段落、Shift+Enter 段内换行 | 0.8.26 · 0.8.27 |
| 24 | 行区间：段落一拆，下面所有块的行号跟着挪 | 0.8.27 |
| 25 | 标题块跨多行：章节快捷键还能干活、取消层级不毁稿 | 0.8.28 |
| 26 | 光标几何与全选：点块末尾有光标，Ctrl+A 由插件自己说了算 | 0.8.29 |
| 27 | 端到端综合：大纲跳转、状态栏、格式键真派发（`test-nav.js`） | 0.8.9 收编 |
| 28 | 多文件大纲 + 编码嗅探：`\input` 展开、UTF-16、循环引用 | v0.9.4 |
| 29 | 快照字节级：`.latex-history` 的 UTF-16 快照 / 恢复逐字节无损 | v0.9.4f |
| 30 | 引擎一键安装：平台资产表、解压回退、拒绝覆盖、工具契约、装机落点 | v0.9.6 · v0.9.8 |


> 层号有两个体系，别混。各 check 脚本注释里引用的层号（如 `check-v0827-span.js` 自称「层 [25]」）
> 沿用 `gate-v070.js` 文件头注释的编号，而门禁真实执行顺序是 `steps` 数组。
> 两者在 v0.9 把第 3、4 层（docmodel、txlog）插进去之后就不再一一对应了。
> 文件头那份注释目前也已自身受损：`[13]` 出现两次（能正常编辑、端到端综合），
> 缺 `[14]`–`[17]`，止于 `[26]`。想知道第几层是什么，以 `steps` 数组为准。

单层重跑（红哪层跑哪层，按上表编号）：

```bash
node .setup/check-tdz.js                    # 1  TDZ 顺序哨兵
node server/wysiwyg.test.js                 # 2  内核单测
node server/v09-docmodel.test.js            # 3  无损 CST（v0.9 P1）
node server/v09-txlog.test.js               # 4  事务历史（v0.9 P2）
node .setup/check-v070-dom.js               # 6  真 DOM 往返（需 jsdom / esbuild）
node .setup/check-v073-style.js             # 7  样式一致性
node .setup/check-v080-flat.js              # 8  形态
node .setup/check-v083-mode-contract.js     # 9  档位顺序从装机 manifest 读，不写死
node .setup/check-v084-export.js            # 10 导出契约（真 server stdio）
node .setup/check-v085-env-banner.js        # 11 引擎自检（隔离 HOME + 假引擎造两个场景）
node .setup/check-v086-keys.js              # 12 格式快捷键（从装机产物抠表求值）
node .setup/check-v087-roundtrip.js         # 13 切视图往返
node .setup/check-v089-focus.js             # 14 焦点不掉
node .setup/check-v0811-edit.js             # 15 能正常编辑
node .setup/check-v0818-undo.js             # 16 可撤销
node .setup/check-v0824-split-sync.js       # 21 分屏两栏同步
node .setup/check-v0825-live-sync.js        # 22 分屏内容同步
node .setup/check-v0827-enter.js            # 23 回车分层
node .setup/check-v0827-span.js             # 24 行区间
node .setup/_test-v0828-headspan.js         # 25 标题块跨多行
node .setup/check-v0829-caret.js            # 26 光标几何 / 全选（真浏览器复验可选：NOTRAT_CARET_BROWSER=1）
node .setup/test-nav.js                     # 27 端到端综合
```


## 功能级验收（全部离线可跑，退出码 0/1）

```bash
node .setup/verify-v052.js          # 207 项（含下方三个子测试）
node .setup/test-v052.js            # MCP 冒烟：工具表 + 大纲双通路（24 项）
node .setup/test-activefile.js      # 活动文件桥（50 项）
node .setup/test-outline-render.js  # 大纲面板渲染 / 交互（21 项）
```

## 本地直跑 server（不装插件也能测）

```bash
node --check server/index.js
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"latex_parse","arguments":{"path":"samples/sample.tex"}}}' \
  | node server/index.js
```

## 单文件包形态

上面「目录包」路线（安装文档里的方式二）不需要构建：源码目录本身就是插件目录。
单文件包形态（宿主 1.3.0 起也支持目录型 zip 包）想打出可分发的包、或者想让宿主吃构建产物时才用得上：

```bash
npm install                  # 只依赖 katex（预览公式资源）

node .setup/build-singlefile.js
```

产物：

```text
~/.notrat/plugins/notrat-latex-plugin.json          # manifest + 内联的 panels 源码
~/.notrat/tools/latex-server.js
~/.notrat/tools/contrib.js
~/.notrat/tools/export-html.js
~/.notrat/tools/preview-core.js
~/.notrat/tools/pdf-raster.js
~/.notrat/tools/assets-katex.json
```

> 单文件包没有 `pluginDir`，所以 server 依赖的模块要逐个拷过去，v0.8.4 就栽过这一条。

写盘即热更新（chokidar 监听），不用重启 Notrat。改了 `panels/*.tsx` 必须重新 build，
否则跑的还是内联在部署包里的旧源码，`verify-v052.js` 第 7 节会逐字节比对拦住这种漂移。

> 注意不要同时存在两种形态：同一个 `id` 若既有单文件包
> `~/.notrat/plugins/notrat-latex-plugin.json`，又有目录包
> `~/.notrat/plugins/notrat-latex-plugin/`，扫描时会互相顶替。
