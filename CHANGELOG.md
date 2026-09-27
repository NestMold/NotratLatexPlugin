# 更新日志

**notrat-latex-plugin** 的完整版本历史 —— 从原 `README.md` 拆出，**正文逐字保留**，只加了这份目录与抬头。

> - 顺序是**写作顺序**，不是语义化版本顺序：有些补丁版是在后续版本之后才补记的（例如 §v0.4.1 排在 §v0.4.0 之前）。
> - 「版本速览」= 原 README 开头那面版本摘要墙，原样保留。
> - 各节里形如「详见 §v0.7.2」的交叉引用都指向本文件内的章节。
> - 当前 `manifest.json` 版本为 **0.9.6**，本日志记录到 **v0.9.6**。
> - ⚠ **v0.8.28 … v0.9.5 这八条是补记的**（当时只写了代码与验收层，日志一直欠着）。
>   取证来源是代码注释、`.setup/gate-v070.js` 的层清单与 `docs/`，每条开头都标了取证位置。
>   补记能保证的是**结论可复核**（照位置读、照命令跑），不能保证的是当时的措辞与情绪 ——
>   那部分已经不可复原，这里不假装。

---

## 目录

- [版本速览](#版本速览)
- [v0.3.0 — Overleaf 式实时预览](#v030--overleaf-式实时预览)
- [v0.3.2 — 划词引用到 Sidebar](#v032--划词引用到-sidebar)
- [v0.4.1 — 面板跟随「当前活动文件」（修：切到别的格式仍显示 LaTeX 大纲）](#v041--面板跟随「当前活动文件」（修：切到别的格式仍显示-latex-大纲）)
- [v0.4.0 — 新贡献面全量接入（dualView / outline / editor-header / editor-tabs / widget / status-bar / renderers / toolHooks）](#v040--新贡献面全量接入（dualview--outline--editor-header--editor-tabs--widget--status-bar--renderers--toolhooks）)
- [v0.4.2 — settings 静默失效 / dualView 未生效 / 双视图 prop 名不符](#v042--settings-静默失效--dualview-未生效--双视图-prop-名不符)
- [v0.5.0 — 章节大纲面板重做（能点、成树、认编号、跟光标）](#v050--章节大纲面板重做（能点、成树、认编号、跟光标）)
- [v0.5.1 — 大纲卡片只在 LaTeX 文件时出现（非 LaTeX 整卡隐藏）](#v051--大纲卡片只在-latex-文件时出现（非-latex-整卡隐藏）)
- [v0.5.3 — 修复「左侧大纲面板整棵树挤成一行」](#v053--修复「左侧大纲面板整棵树挤成一行」)
- [v0.5.4 — 归因：这次到底怪谁（我们的问题 / 开发文档的问题）](#v054--归因：这次到底怪谁（我们的问题--开发文档的问题）)
- [v0.5.2 — 收敛为「编辑器 + 大纲」（其余贡献面全部下线）](#v052--收敛为「编辑器--大纲」（其余贡献面全部下线）)
- [v0.6.0 — 接回划词助手（`right-panel`）与 `.tex` 右键编译 / 校验](#v060--接回划词助手（right-panel）与-tex-右键编译--校验)
- [v0.6.1 — 摘掉划词助手 / 修「点大纲不跳」/ 移除编辑器内大纲](#v061--摘掉划词助手--修「点大纲不跳」-移除编辑器内大纲)
- [v0.7.0 — 可视化视图变成可编辑（方案 A：块级外科手术）](#v070--可视化视图变成可编辑（方案-a：块级外科手术）)
- [v0.7.1 — 修 TDZ 崩溃：`Cannot access 'renderMath' before initialization`](#v071--修-tdz-崩溃：cannot-access-rendermath-before-initialization)
- [v0.7.2 — 三种视图都能就地编辑 / 不再「一编辑就掉进分屏」/ 顶栏底栏精简](#v072--三种视图都能就地编辑--不再「一编辑就掉进分屏」-顶栏底栏精简)
- [v0.8.3 — 视图入口交给宿主标签栏（编辑器顶栏那排视图按钮下线）](#v083--视图入口交给宿主标签栏（编辑器顶栏那排视图按钮下线）)
- [v0.8.4 — 档位顺序「可视化 | 源码 | 分屏」+ 工具栏导出（PDF / 自包含 HTML，可预览）](#v084--档位顺序「可视化--源码--分屏」-工具栏导出（pdf--自包含-html，可预览）)
- [v0.8.5 — 没装 TeX 引擎时首屏提示（`latex_env` + 可关提示条 + 已提示记账）](#v085--没装-tex-引擎时首屏提示（latex_env--可关提示条--已提示记账）)
- [v0.8.6 — Typora 键位铺满编辑器（20 条格式快捷键）+ 插入菜单可发现性](#v086--typora-键位铺满编辑器（20-条格式快捷键）-插入菜单可发现性)
- [v0.8.7 — 修「有些快捷键能用、有些不能用」+ `Ctrl+/` 回不到原来那一档](#v087--修「有些快捷键能用、有些不能用」-ctrl-回不到原来那一档)
- [v0.8.12 — 正文连成一篇、光标回接真的生效（修「Ctrl+1~6 一按就失焦」）](#v0812--正文连成一篇、光标回接真的生效（修「ctrl16-一按就失焦」）)
- [v0.8.13 → v0.8.15 — 多行段落转层级 / 同层级再按一次=还原 / 预览档可撤销](#v0813-→-v0815--多行段落转层级--同层级再按一次还原--预览档可撤销)
- [v0.8.16 — 「以 \ 开头」守卫放行正文段落（只拦命令块）](#v0816--「以--开头」守卫放行正文段落（只拦命令块）)
- [v0.8.17 — 撤销 / 重做先落地「还没写回源码的打字」](#v0817--撤销--重做先落地「还没写回源码的打字」)
- [v0.8.18 / v0.8.19 — 撤销历史接进 txlog（修「我输入了内容再撤回，提示我预览档没有撤回的」）](#v0818--v0819--撤销历史接进-txlog（修「我输入了内容再撤回，提示我预览档没有撤回的」）)
- [v0.8.20 — 块外的字：光标停在块外时敲的字，不许静默丢](#v0820--块外的字：光标停在块外时敲的字，不许静默丢)
- [v0.8.21 — 撤销看得见：画面与源码必须一起回去](#v0821--撤销看得见：画面与源码必须一起回去)
- [v0.8.22 — 代码 / 内容分道：`\maketitle` 不进正文，字也写不进命令](#v0822--代码--内容分道：maketitle-不进正文，字也写不进命令)
- [v0.8.23 — 结构改动之后，屏幕必须跟着动](#v0823--结构改动之后，屏幕必须跟着动)
- [v0.8.24 — 分屏滚动联动：反方向从来没挂过，双向还得不打架](#v0824--分屏滚动联动：反方向从来没挂过，双向还得不打架)
- [v0.8.25 — 分屏内容同步：右栏打字，左栏当场跟着变](#v0825--分屏内容同步：右栏打字，左栏当场跟着变)
- [v0.8.26 — 回车换行：段末那个 `<br>` 是光标落脚点，不是内容](#v0826--回车换行：段末那个-br-是光标落脚点，不是内容)
- [v0.8.27 — 回车 = 新建段落，段内换行改用 Shift+Enter](#v0827--回车--新建段落，段内换行改用-shiftenter)
- [v0.8.28 — 标题块跨多物理行：章节快捷键还能干活 / 「取消层级」不再毁稿](#v0828--标题块跨多物理行：章节快捷键还能干活--「取消层级」不再毁稿)
- [v0.8.29 — 光标几何 / 全选：点块末尾看得到光标 + Ctrl+A 由插件自己说了算](#v0829--光标几何--全选：点块末尾看得到光标--ctrla-由插件自己说了算)
- [v0.9.0 — PDF / EPS 插图栅格化（`\includegraphics` 里的 `.pdf` 不再只是占位符）](#v090--pdf--eps-插图栅格化（includegraphics-里的-pdf-不再只是占位符）)
- [v0.9.1 — 多文件预览：`\input` / `\include` 展开成子文件卡片](#v091--多文件预览：input--include-展开成子文件卡片)
- [v0.9.2 — 导出样式比对改成比类名集合 + 子文件卡的折叠状态烘进 HTML](#v092--导出样式比对改成比类名集合--子文件卡的折叠状态烘进-html)
- [v0.9.3 — 换样例（并让测试不再钉死样例原话）+ 用户宏 / 附录字母编号 / 命令补齐](#v093--换样例（并让测试不再钉死样例原话）-用户宏--附录字母编号--命令补齐)
- [v0.9.4 — 多文件大纲（`\input` 展开）+ 编码嗅探（UTF-16）](#v094--多文件大纲（input-展开）-编码嗅探（utf-16）)
- [v0.9.5 — 快照 / 恢复按字节走（「版本时光机」不再改坏 UTF-16 的 `.tex`）](#v095--快照--恢复按字节走（「版本时光机」不再改坏-utf-16-的-tex）)
- [v0.9.6 — 引擎一键安装（把 `.setup/` 里那份只有开发者看得见的脚本，接进用户能点的按钮）](#v096--引擎一键安装（把-setup-里那份只有开发者看得见的脚本，接进用户能点的按钮）)

---

## 版本速览

> **v0.6.1 起是「编辑器 + 大纲 + 文件树右键」三件事。**
> 贡献面 = `editors` + `ui@outline` + `fileTreeMenus` + `settings`。
> v0.5.2 曾收敛到「编辑器 + 大纲」；v0.6.0 把划词助手（`right-panel`）与 `.tex` 右键编译 / 校验
> （`fileTreeMenus`）接了回来；**v0.6.1 按需求摘掉划词助手**（源码归档在 `panels/_unused/selection.tsx`，
> 要接回只需加一条 manifest），并修掉「点大纲不跳」、移除编辑器内嵌大纲。
> 各版详见文末 §v0.7.2 / §v0.7.1 / §v0.7.0 / §v0.6.1 / §v0.6.0 / §v0.5.2。
>
> **v0.7.0：可视化视图从「只读预览」变成「可编辑」。** 正文与标题可就地改，
> 公式 / 引用 / 浮动体 / 参考文献仍是原子卡片（不可误伤），改完只回写被改的那几块的行区间，
> 未编辑的字节逐字节保留。内核在 `server/wysiwyg.js`，构建期以 IIFE 内联进编辑器源码。
>
> **v0.7.2：三种视图都能就地编辑，不再「一编辑就掉进分屏」。**
> 预览里点公式 / 图表卡片会被踢进分屏看源码 —— 根因是 `gotoLine` 在源码面板不在场时直接
> `setView("split")`。现在跳转一律不动视图（就在预览里滚过去闪一下），
> 切视图只剩卡片上的「↗ 定位」这一条显式路径；原子卡片也从「LaTeX 原样堆在 `<pre>` 里」
> 改成用预览内核**富渲染**（公式是真公式、图表是真图表），源码按需展开。顶栏 14 个按钮精简到 6 个控件。
> 详见 §v0.7.2。
>
> **v0.7.1：修一个「打开 `.tex` 就白屏」的 TDZ 崩溃**
> （`Cannot access 'renderMath' before initialization`）——依赖数组渲染期立即求值，
> 而 `const` 声明写在它后面。并新增「顺序哨兵」作为验收门第 [1] 层（esbuild/tsc 都不报此类错）。
> 详见 §v0.7.1。

> **v0.8.4：档位顺序定为「可视化 | 源码 | 分屏」，工具栏加「⬇ 导出」（PDF / 自包含 HTML，并可预览）。**
> 顺序不是审美问题：N 态契约里**第一项就是宿主给的默认档**，所以「可视化」必须排最前。
> 导出走新 MCP 工具 `latex_export`；预览复用宿主的 `notrat-open-file` 通道（`.pdf` 有内置阅读器、
> `.html` 有内置预览器），**开的永远是刚导出的那个文件** —— 不会出现「预览一套、导出另一套」。
> 详见 §v0.8.4。
>
> **v0.8.5：没装 TeX 引擎时，首屏就把「只影响编译 PDF」说清楚，并给一条能直接粘的安装命令。**
> 新增 MCP 工具 `latex_env`（只探测、不编译、不写盘）。探测**不在**「插件启用时」做 ——
> 插件没有生命周期钩子、MCP 也没有推送通道，服务端探到了也说不出话；所以挂在编辑器挂载，
> 且只在**没引擎**时提示一次（跨会话用 `~/.notrat/notrat-latex-state.json` 记账，
> 点过「知道了」就不再弹）。详见 §v0.8.5。
>
> **v0.8.6：把 Typora 的键位铺满编辑器（20 条格式快捷键），并让插入菜单能「看见」键位。**
> 选中一段话按 `Ctrl+B` 就包成 `\textbf{}`；`Ctrl+1`…`Ctrl+5` 直接设章节层级
> （已有命令则只换层级、保留标题）。键位照 Typora 抄，动作落成 LaTeX。
> 详见 §v0.8.6。
>
> **v0.8.7：修「有些快捷键能用、有些按下去没反应」，并让 `Ctrl+/` 真的能回到原来那一档。**
> 两个根因都在插件自己这边：① 键位匹配只看 `e.key` —— 中文输入法组字中 `Ctrl+字母` 被报成
> `"Process"`（20 条只剩 **7 条**），FR-AZERTY 数字行未按 Shift 是 `& é " ' ( à`（`Ctrl+1..5` / `Ctrl+0` 全哑）；
> 现在补一层**物理键位（`e.code`）兜底**，`e.key` 先命中，US 英文下行为逐字节不变。
> ② `lastPvView` 的记忆被「写进宿主的回抛」当场覆盖 → 分屏切去源码再回来只落纯预览、且再也回不到分屏。
> 详见 §v0.8.7。
> **v0.8.18 / v0.8.19：撤销历史接进 txlog —— 「打完字撤不动」这一类问题连根拔掉。**
> 「我输入了内容再撤回，提示我预览档没有撤回的」不是一句提示写错了，是三条真实路径：
> 切档 / **切主区标签会让宿主卸载组件**（组件里的历史随之消失），宿主回传 / 外部同步又会被
> 旧实现那句「判错就清栈」整条抹掉。现在历史按文件留在模块级（活过重挂），外部改动走 txlog 的
> `rebase` 重映射（真冲突才丢那一条，并明说丢了几步），撤销 / 重做只向历史要凭据。
> 详见 §v0.8.18。

> **v0.8.21：撤销「没效果」的最后一公里 —— 源码回去了，画面也得跟着回去。**
> 提示条说「已撤销」、`onChange` 拿到的源码也逐字节回到打字前，屏幕上那段字却还在 ——
> 幂等守卫只比 `html` 字符串，而打字期间它记的仍是打字前那份，撤销正好把它「还原」成相等，
> 于是整段重建被跳过；更坏的是陈旧的 DOM 下一次失焦就把撤掉的字写回源码（撤销被静默吃掉）。
> 现在台账多一栏「屏幕现在是照着哪份源码画的」，并新开一层**把 `innerHTML` 接进 jsdom** 的探针，
> 让「画面有没有重建」第一次成为可断言的事。详见 §v0.8.21。

> **v0.8.22：代码归代码、内容归内容 —— `\maketitle` 不再摊在正文里，字也再写不进命令里。**
> 三句用户原话对应三个真问题：①「预览还是有 `\maketitle` 和 `\end{document}` 这些代码」——
> 它们本来就不该显示源码（一个是「把页首排进正文」，一个是「正文到此结束」）；
> ②「无法区分代码和内容块」—— 结构块现在带类型标签 + 一句人话 + 左侧竖线，正文块什么都没有；
> ③「我想要加内容块，貌似弄到了代码里面」—— 那三类块以前是「可编辑的一行小灰字」，
> 光标能停进 `\maketitle` 里，在那儿敲的字会被整块读回、写进命令行。现在整块只读、点它开就地编辑器，
> 并补上正文里**从来没有过**的「¶ 新段落」入口（LaTeX 里空行才是分段，光按一次回车只是续行；v0.8.27 起这件事键盘上就是回车本身，那个按钮留给鼠标）。
> 详见 §v0.8.22。
>
> **v0.8.23：源码改对了，屏幕也得跟着动 —— 「✓ 已设为「\section」…↩ 撤销」有时候没有生效。**
> 打完字立刻按 `Ctrl+1`：`commitWys` 与 `applyHeadWys` 在同一次事件里跑完，React 把两次 `onChange`
> 合成一拍，而 `commitWys` 立的「DOM 是权威、别重画」那面旗子还在 —— 于是源码合并好了、屏幕停在原处。
> 前 20 层门禁全绿也没拦住，因为它们问的都是「**源码**写对没写对」，没有一层问过
> 「用户看见的还是不是同一个东西」。详见 §v0.8.23。

> **v0.8.24：分屏「滚动联动」原来只有一半 —— 滚右栏，左栏纹丝不动。**
> 用户原话「分屏那里没有同步呢」。先量后改：内容同步两个方向都是好的（左栏敲字右栏跟着重画；
> 右栏就地改完失焦，左栏拿到新源码），坏的只有滚动 —— 分屏里两栏并排，而 `onScroll` 全文只有**一个**，
> 挂在源码 `textarea` 上；渲染层 `pv-root` 上从来一个都没挂，于是用鼠标滚右栏，`ta.scrollTop` 恒为 0。
> README 这条承诺写的是「滚动联动」，用户读到的当然是「两边一起动」。现在两个方向都有通路、
> 共用同一个比例公式；双向联动最容易出的「A 推 B、B 又推回 A」（浏览器替程序设置派回来的那次
> `scroll`）用一本**回声台账**挡住 —— 判据是「位置对得上 + 就在刚才」，不是「计时器到点就别管了」，
> 后者会把用户真实的滚动也吞掉。详见 §v0.8.24。

> **v0.8.25：分屏内容同步 —— 「边打边看到源码变化」，不是「点一下才刷新」。**
> 用户原话：「我说的不是滚动，是**内容**不同步：在分屏右栏（预览）里打字时，左栏源码框
> 要等我点开才更新，我想**边打边**看到源码变化。」上一版把这条判成 ✓ 了 —— 它测的是
> 「右栏就地改完**失焦** → 左栏拿到新源码」，而「失焦才同步」恰恰就是用户抱怨的那件事本身：
> 打字期间只有 DOM 在变（不变式①「编辑期间 DOM 是权威」），源码要等失焦 / `Ctrl+S` / 切档才落地，
> 左栏 `textarea` 又受控于 `props.content`，于是整个打字过程里它一直停在旧内容上。
> 现在预览层多了一条 `input` 通路：只跟光标所在那一块、当场写回源码，不弹提示、不记历史、
> 不重建 DOM（重建就把光标铲平了）；一次连续编辑在撤销链里仍只占**一步**。
> 详见 §v0.8.25。

> **v0.8.26：回车换行 —— 段末那个 `<br>` 是光标落脚点，不是内容。**
> 用户原话：「换行这些特别不丝滑，不适合续写」。段末按一下回车，DOM 里插一个 `<br>`，
> `wysDomToTex` 把它读成 `"\n"`，而写回走的 `applyEdits` 是**按 `\n` 切行**的：
> `"正文…\n"` 切出来是 `["正文…", ""]` 两个元素，替换掉原来那一行 ⇒
> **源码里凭空长出一个空行**（LaTeX 里空行 = 断段）。于是段末按一下回车就把段落劈成两块，
> 连写十几行就是十几个空行，「¶ 新段落」一次写出**两个**空行。
> 为什么 23 层门禁没拦住：第 [13] 层**就是**管回车换行的，但它钉的是**文本**
> （「产物里有没有 `execCommand(\"insertHTML\")` 那一句」）—— 而回车这条路的实现恰好是
> jsdom 里跑不起来的那一条（jsdom 里根本没有 `execCommand`），于是门禁**一次都没真的按过回车**。
> 现在：块级读回吃掉段末那一个落脚换行（回车一下 = 源码零改动；两下 = 恰好一个空行），
> 执行方式从 `execCommand` 换成自己动 Range（落点自己定 + 夹具里跑得到）。详见 §v0.8.26。

> **v0.8.27：回车 = 新建段落，段内换行改用 Shift+Enter —— 顺带修掉一条「连着打两笔就会中」的错位。**
> 用户原话：「把回车改成新建段落：回车落一个空行 = 新段落，段内换行改用 Shift+Enter」。
> LaTeX 的规矩本来就是「空行才分段、单换行只是空格」，而上一版把回车做成了段内换行、想分段得连按
> 两下（还得先知道这条规矩才猜得到）—— 与所有人（以及 Overleaf / Typora）的手感都反着。
> 两个动作对调，落点仍由自己动 Range 定死：`Enter` 插两个 `<br>`（= 一个空行 = 一个新段落），
> `Shift+Enter` 插一个 `<br>`（= 单换行 = 段内续行）；顺手再收一道，Alt/Cmd+回车 不接管。
> 换过来之后第二件事浮出来了：**行区间会「长大」**。`data-s / data-e` 是渲染那一刻写上的，
> 而一个段落一拆，它下面所有块的行号都得往后挪；不挪的话下一笔回写仍按旧区间 `replace`，
> 新文本比旧区间多一行 —— 多出来那一行盖不住旧内容，源码里就凭空多出一份**重复的正文**
> （这条错上一版就有：Shift+回车之后接着打字同样会中，只是探针只打过一笔）。
> 现在每一笔成功回写之后按这笔编辑的实际效果把行区间平移一次（纯函数 + 单测 + 反证）。
> 详见 §v0.8.27。

---

## v0.3.0 — Overleaf 式实时预览

编辑器改为「源码 + 实时渲染」分栏（📄 源码 / ⧉ 分屏 / 📑 预览三视图，默认分屏）：

- **预览内核** `server/preview-core.js`：零依赖 LaTeX 子集 → HTML（章节编号、公式环境、
  tabular 表格、figure/table 浮动体、itemize/enumerate 嵌套列表、thebibliography、
  verbatim/quote/abstract、\ref/\eqref/\cite 解析徽章（未定义标红，可点击跳转））。
  每个块带 `data-line`，点击预览 → 编辑器跳对应行；编辑滚动 → 预览比例跟随。
- **KaTeX 离线包**：构建时从 `node_modules/katex` 打包 JS+CSS（woff2 字体 dataURI 内嵌），
  经 `latex_asset` 工具下发，无网络依赖；CSP/离线失败自动降级 miniMath 近似渲染
  （分数/根号/上下标/希腊字母）。
- **插图懒加载**：`\includegraphics` 的 png/jpg/svg 等经 `latex_asset` 读本地文件转
  dataURI 回填（PDF/EPS 显示占位提示）；`baseDir` 由编辑器按 filePath 推导。
- **构建注入**：editor.tsx 的 `/*__LPC__*/` 占位由 build-singlefile.js 替换为
  preview-core 全文（`module.exports` → `const LPC`），预览内核单测：
  `node .setup/test-preview.js`（24 断言，含可视化样例 `.setup/preview-sample.html`）。

### 开发命令
```
node .setup/test-preview.js        # 预览内核单测（改 preview-core.js 后必跑）
node .setup/patch-server.js        # server 增量补丁（幂等）
node .setup/build-singlefile.js    # 构建部署 → ~/.notrat/plugins/（热重载自动生效）
```

### 故障实录（防复发）
- **0.2.3**：`mcpServers` 写成对象形态 → 宿主 `enable()` 的 `for...of` 抛
  "object is not iterable"，插件启用按钮失效。构建脚本已加数组断言。
- **0.3.0**：preview-core.js **头注释**里含「module.exports = {...}」示例字样，
  构建脚本无锚点的 `replace` 先命中注释、漏改真导出语句 → 注入后运行时
  `module.exports = {...}` 把宿主 exports 整体覆盖成内核对象 → 宿主 interop
  包装成 `{default: 对象}` → 编辑器报「default 应为 function，实际为 object」。
  修复（0.3.1）：导出改写正则 `^` 行首锚定（`m` 标志）＋构建后断言
  「注入源码不得含 `module.exports`」＋注释去危险字样。
  排查手法存档：`node -e` 读部署产物 dump 源码 → esbuild 转 cjs →
  `new Function('require','module','exports',code)` 复现宿主式加载，
  检查 `typeof exports.default`。
- **0.7.0**：`panels/editor.tsx` 的 `const wys = useMemo(..., [content, renderMath])` 写在
  `const renderMath = useMemo(...)` **之前**（393 行用 / 705 行声明）→ 依赖数组渲染期立即求值
  → 打开任意 `.tex` 直接白屏：`ReferenceError: Cannot access 'renderMath' before initialization`。
  修复（0.7.1）：声明整块上移（依赖项 `katexVer` / `katexOkRef` 本就在上方，逻辑零改动）；
  新增 `.setup/check-tdz.js` 顺序哨兵并作为验收门第 [1] 层。
  **教训：esbuild / tsc 都不报 TDZ，「编译通过」对顺序错误零保证 —— 必须静态查。**

## v0.3.2 — 划词引用到 Sidebar

在源码区或预览区**划选文本**，光标旁浮出「💬 引用到对话」气泡，一键把选段作为
**宿主原生引用卡片**（文件名 + L 行号徽章 + 文本预览 + 快捷动作）送进 AI 侧栏输入区。

- **通路（第一方契约，零 hack）**：宿主自家 CodeMirror/TipTap 编辑器的「划词引用」
  就是向 `window` 派发 `CustomEvent("notrat-quote-to-chat", {detail:{text, source,
  filePath, lineFrom, lineTo}})`，Sidebar composer 监听后生成 SelectionQuoteCard。
  插件编辑器派发同一事件 = 与原生同级体验。
- **降级链**：`document.querySelector("[data-sidebar-composer]")` 探测侧栏是否打开——
  未打开时自动降级为复制选中文本到剪贴板，toast 提示。
- **交互细节**：气泡按 Esc / 点击外部关闭；键盘划选（shift+方向）气泡停靠源码面板右上；
  预览划选的行号取选区两端最近的 `data-line` 块锚点；预览有划选时点击不触发行跳转。
- **取证记录**：通道是从宿主 renderer bundle（明文 Vite 产物，插件作者合法可读）定位；
  preload 为混淆产物且有开发者 AI 指引声明，未做逆向。_runtime 契约如需跨版本兼容，
  建议宿主官方把该事件写入插件 API 文档。

## v0.4.1 — 面板跟随「当前活动文件」（修：切到别的格式仍显示 LaTeX 大纲）

**症状**：打开 `sample.tex` 后再切到 `.md` / `.txt` / 图片，左侧「章节大纲」面板继续显示上一份 .tex 的
章节树；悬浮器、状态行、标签栏徽章也在报上一份 .tex 的状态。

**根因（宿主实现事实，取证自 `app.asar` 的 renderer 明文产物，未做逆向）**：

| 挂载位 | 拿到的 props | 有活动文件吗 |
|---|---|---|
| `editors`（.tex 编辑器） | `{ pluginId, ctx, file, content, onChange, onSave, fileName, filePath }` | ✅ `filePath` |
| `ui` 任意位置（outline / widget / …） | `{ serverId, pluginId, ctx, data, dataError, launch }`，`ctx = { window, workspace, ai, selection, app }` | ❌ 没有 |

`outline` 位由 `PluginOutlinePanels` 渲染，连 `launchParams` 都不传；面板侧 `pickFile()` 三条路
（launch.params → props.filePath → props.file）**全部落空**，只剩 `sessionStorage["notrat-latex-panel"]`
（上一次解析的 .tex）兜底；刷新 effect 又只依赖 `ctx.workspace.path` → 切文件不重载。
于是「切到别的格式」= 继续显示上一份 .tex 的内容。

宿主侧也没有「活动文件变化」事件可听：`notrat-open-file` 只在文件树 / 搜索 / wikilink / 工具卡打开时派发
（点标签栏切换不发）；preload 未暴露 `getActiveFile` 之类接口；`ctx.selection` 仅在**有划选**时才带 filePath。

**修法**：让唯一知道活动文件的那一面广播出去，面板侧统一接收。

- 生产者 `panels/editor.tsx`：挂载 / 切文件 / 卸载三处派发 `notrat-latex-active-file`，并写
  `sessionStorage["notrat-latex-active"]` 快照（8s 新鲜度）。卸载清场**延迟 120ms 且带归属令牌**，
  避免 `.tex → .tex` 切换时旧实例把新实例的广播清掉。
- 消费侧（outline / widget / main / editor-header / editor-tabs）：挂载时用
  `notrat-latex-active-ping` 问一次（编辑器**同步**回话），平时监听广播，快照兜底 ——
  面板比事件晚挂载（大纲页签是切过去才挂载的）也不落空。
- **非 LaTeX 活动文件**时的表现：大纲面板收起章节树、只留一行「当前打开的不是 LaTeX 文件」；
  悬浮器只留一行说明；工具条 / 标签栏徽章 `return null`（它们本就声明「仅 LaTeX 文件」）。

**行为变化（有意为之）**：大纲面板不再「没有 .tex 打开时自动发现工作区主 .tex」，改为严格跟随当前活动文件。
要看工作区主文件时，用右侧「LaTeX 助手」面板留空路径解析，或在文件树右键 .tex → 解析结构。

**验收**：`.setup/test-activefile.js` —— 把两段真实实现抠出来，配假 window + 假 sessionStorage +
迷你 React 直接跑，再直接检查**部署出去的单文件包**里的内联源码（53 项：`.tex → .tex` 不误清、
ping 同 tick 应答、切走收起、快照过期不采信、各面板接线、部署产物已无 pickFile 兜底…），全绿；
七份面板源码过 esbuild(tsx / automatic JSX) 转译；原有静态体检 69 项 / MCP 冒烟 / 快照安全回归同步复跑。

## v0.4.0 — 新贡献面全量接入（dualView / outline / editor-header / editor-tabs / widget / status-bar / renderers / toolHooks）

官方文档新列的贡献面全部用上了，不止「九个挂载位」：

| 新贡献面 | 本插件怎么用 | 落地文件 |
|---|---|---|
| `editors[].dualView` | 标题栏出现宿主自带的**源码 / 可视化**切换，与编辑器自带的三档视图联动（`hostView` 补丁，未知命名自动忽略） | `panels/editor.tsx` |
| `ui.location: outline` | **章节大纲面板**：章节树 + 自动编号 + 行号，行悬停 💬 直接把该节标题钉进对话 | `panels/outline.tsx` |
| `ui.location: editor-header` | **编辑器顶部控制带**：编译 / 校验 / 大纲 / 展开输出 / 💬 把编译日志钉进对话（仅 LaTeX 系文件渲染，其他文件返回 null） | `panels/editor-header.tsx` |
| `ui.location: editor-tabs` | **标签栏徽章**：当前 .tex 的错误/警告计数，点一下重新校验 | `panels/editor-tabs.tsx` |
| `ui.location: widget` | **悬浮器**：状态行 + 编译 / 校验 / 快照 / 整页，可右键拖到任意位置 | `panels/widget.tsx` |
| `ui.location: status-bar` | 状态栏一行摘要（`dataTool: latex_status`，30s 刷新） | manifest |
| `ui.location: activity-bar` / `sidebar-input` | 活动栏入口 + 输入框上方速查提示 | manifest |
| `contributions.renderers` (`markdown/code`) | 聊天里的 ` ```latex ` / ` ```tex ` / ` ```math ` 代码块**直接排版成预览**（KaTeX + 复用 preview-core），可切回源码 | `panels/code-renderer.tsx` |
| `contributions.toolHooks` (`pre`) | **编译前自动快照**源码到 `.latex-history/`（钩子即使出错也不抛，绝不拦掉编译） | `latex_backup` |
| `commands[].name` / `usage` | 命令按新命名规范声明（`name` + `tool` + `usage`，兼容旧的 `id`/`title`） | manifest |
| `fileTreeMenus[].folders` | 「🔨 LaTeX：编译该目录主文件」出现在**文件夹**右键菜单 | manifest |

新增 4 个 MCP 工具（共 8 个）：

| 工具 | 说明 |
|---|---|
| `latex_outline` | 大纲行协议文本 `[ ] #行号 编号 标题`（list 面板 / AI 都能直接吃）；`depth` 可调深度 |
| `latex_status` | 一行摘要：节数 · 公式/图/表/引用数 · 字数 · 错误/警告数 |
| `latex_backup` | 快照源码（内容未变则跳过；超出保留数自动清理） |
| `latex_history` | `action=list` 列快照；`action=restore&stamp=…` 回退（**回退前先把当前内容另存一份**，恢复动作本身可再回退） |

### 编译引擎：探测链 + 双写设置兼容

- **PATH 探测**修了一个真 bug：原 `resolveCompiler` 只扫 `~/.notrat/tools/bin`、Tectonic、WinGet Links、scoop、cargo 五个目录，
  装在标准位置的 MiKTeX（`C:\Program Files\MiKTeX\miktex\bin\x64`）**根本找不到** —— 设置里填 `xelatex` 会直接失败。
  现在顺序为：PATH → 旧目录清单 → 常见安装位置，再叠回退链 `tectonic → xelatex → lualatex → pdflatex → latexmk`，
  并在编译输出里打印「设置里的 X 本机不可用，已自动改用 Y」。
- ~~设置占位符双写~~（**0.4.2 已证伪并移除**）：当年以为「两个都声明、server 取第一个被替换成真值的」能兜住两种约定。
  实际上宿主两端的索引根本对不齐（写入用分组 key、读取用 manifest.id），**两个占位符解析结果都是空串 `""`**，
  双写只是把「取不到」伪装成「有两套约定」，让问题看起来像兼容性话题而不是 bug。
  已改为分组 key === id + 纯字段名引用，`_ALT` 双写移除。
  （`contrib.js` 的 `envReal()` 保留「跳过空串 → 回落默认」：设置被清空时本就应该回落默认，这是正确行为，留着。）

### 冒烟测出的真 bug（已修 + 已加回归）

`latex_backup` / `latex_history restore` 首版时间戳只到**秒**：
回退时的「安全备份」与既有快照同秒 → 覆盖掉好快照 → 回退把坏内容写回文件（**潜在数据丢失**）。

三处加固（`.setup/test-snapshot-safety.js` 逐条钉住）：

1. `stampNow` 加毫秒；
2. 落盘前存在性检查，撞名加 `-1/-2` 后缀，**绝不覆盖既有快照**；
3. `restoreSnapshot` 先把目标快照读进内存，再做安全备份，最后用内存内容写回
   —— 即便备份那步出任何意外，恢复结果依然正确。

### 开发 / 验收命令

```bash
node .setup/patch-v040.js            # 把新贡献面支撑打进 server/index.js + editor.tsx（幂等）
node .setup/build-singlefile.js      # 构建部署 → ~/.notrat/plugins/ + ~/.notrat/tools/
node .setup/verify-v040.js           # 静态体检 69 项（manifest/贡献面/内联源码 esbuild 转译/部署一致性）
node .setup/smoke-v040.js            # 功能冒烟（真起 MCP 子进程，含快照回退实证）
node .setup/test-snapshot-safety.js  # 快照安全回归
node .setup/test-preview.js          # 预览内核单测（改 preview-core.js 后必跑）
```

> `~/.notrat/tools/` 下现在是三件套：`latex-server.js`、**`contrib.js`（v0.4.0 新增）**、`assets-katex.json`。

### ⚠️ 已知风险：`renderers` 是全局接管

`nodeType: "markdown/code"` 会**接管聊天里所有代码块**。本插件的实现只在语言为
`latex/tex/math/katex` 时才排版预览，其余语言走「原样透传」分支（`pre > code`，贴近宿主默认外观），
理论上损失极小；但若你发现其他语言代码块的复制按钮/高亮不如从前，
**删掉 `manifest.json` 里 `contributions.renderers` 整段再构建即可完全关闭**，其余功能不受影响。

### 又一条工程教训（防复发）

- `process.exit()` 在 stdout 是管道/重定向时会**截断未 flush 的输出** —— 验收脚本一律用 `process.exitCode`。
- 用 `str.slice(indexOf(a), indexOf(b))` 做就地改写，一旦 `indexOf(b)` 因转义返回 `-1`，
  会**吃掉文件尾部**（本次先后把 `contrib.js` 的 `module.exports` 和验收脚本尾部各删过一次）。
  改代码用「精确锚点 + split/join + 命中失败即中止」，别用 slice。

### 面板样式自定制

外壳钩子类：`.notrat-plugin-panel-notrat-latex-plugin` / `-header` / `-body`。
面板/悬浮器右键可「移动到…」九个位置，位置持久化、可恢复默认。


---

# 附录 · v0.4.0 完整交付快照

- 部署：`C:\Users\Administrator\.notrat\plugins\notrat-latex-plugin.json`（169.5 KB，单文件包）
- 工具侧：`C:\Users\Administrator\.notrat\tools\latex-server.js` + `contrib.js` + `assets-katex.json`
- 验收：静态 69 项 + 功能冒烟 17 项 + 快照安全回归 13 项，全绿
- 编译实测：`tectonic sample.tex` → 退出码 0，`sample.pdf` 79.9 KB 重新生成


## v0.4.2 — settings 静默失效 / dualView 未生效 / 双视图 prop 名不符

三个 bug 同源：**照 Wiki 写，而宿主实现与 Wiki 不一致**。
本次不再靠 Wiki 推断，直接反编译宿主 `D:\Notrat\resources\app.asar`（>512MB，需流式扫描）取权威实现。

### 1. settings 从未生效（静默失效）

宿主两端索引不一致：

| 端 | 代码 | 外层索引 |
|---|---|---|
| 写入 `PluginSettingsPane` | `setValue(pt.key, Et.key, v)` → `values[外层][字段]` | **settings 分组 key** |
| 读取 `resolvePlaceholders` | `getValue(pluginId, ref)` → `values[外层][ref]` | **manifest.id** |

只有 `settings[].key === manifest.id` 时两端才重合。

原清单分组 key 是 `"latex"` ≠ id，两端永不重合；且未命中时
`resolvePlaceholders` 返回**空串 `""`**（不是保留原文、也不是 undefined），
`""` 被 `envReal()` 当「未配置」跳过 → 全部回落默认值 →
**表面上一切正常，实际任何设置都改不动**。

佐证：官方 `notrat-sync`（`key:"notrat-sync"`）、`notrat-broadcast`（`key:"notrat-broadcast"`）
分组 key 均 === 各自 id，env 一律纯字段名（`${settings:repo}`）。

修复：分组 key 改为 `notrat-latex-plugin`；env 收敛为 5 条纯字段名引用。

### 2. `dualView` 从未生效

宿主解析（逐字）：

```js
dualView: Array.isArray(Bn.dualView) && Bn.dualView.length === 2
          && Bn.dualView.every(d => typeof d == "string" && d.trim())
          ? [String(Bn.dualView[0]), String(Bn.dualView[1])] : void 0
```

必须 **2 元素非空字符串数组**。原清单写 `dualView: true` → `void 0`，连锁后果两个：
标题栏不出现模式开关；且 `...it.dualView ? { mode, onModeSwitch } : {}` 为假 →
**`props.mode` / `props.onModeSwitch` 一律不注入**。
`dualViewLabels` 在 asar 中命中 **0 次**，纯死配置。

修复：`dualView: ["可视化","源码"]`（第 1 项 = wysiwyg 态，第 2 项 = source 态），删除 `dualViewLabels`。

### 3. 编辑器读错 prop 名，且 `"wysiwyg"` 匹配不上旧正则

`panels/editor.tsx` 读 `props.viewMode` / `props.dualViewMode` —— 宿主从不注入这两个名字。
且宿主传的是字面量 `"wysiwyg"` / `"source"`，旧正则 `/vis|preview|render|read|pdf/`
**匹配不上 `"wysiwyg"`** → 即使 dualView 修好，切「可视化」也毫无反应。

修复：改读 `props.mode`（旧名作兜底）、显式处理两个字面量；
三档视图按钮改走 `goView()`，切到 源码/预览 时回写 `props.onModeSwitch("source"|"wysiwyg")`
（分屏无宿主对应态，不回写，避免抖动）。

### 4. 顺带对齐

- `settings.fields.compiler` 默认值 `"tectonic"` → `""`。本机 Tectonic 确实已装于
  `~/.notrat/tools/bin/tectonic.exe` 且回退链首项即为它，故行为一致；改空串是为让
  「留空自动探测」名副其实，且 Tectonic 缺失时能落到 xelatex。
- `server/index.js` 的 `VERSION` 常量 `0.4.0` → `0.4.2`（此前 stderr 日志一直误报旧版本）。

### 5. 新增验收工具（离线可跑，退出码 0/1）

| 脚本 | 作用 |
|---|---|
| `.setup/check/validate-manifest.js` | 清单预检：把宿主源码规则固化成断言（dualView 形态、settings 索引一致性、`${settings:}` 可解析性、command 名合规、ui 挂载位、uiKey 指向…） |
| `.setup/check/smoke-mcp.js` | 以宿主方式驱动 stdio JSON-RPC，跑 8 个工具 + stdout 纯净性 |
| `.setup/check/sim-host-settings.js` | 逐字复刻宿主写入/读取算法，证明 settings→env→引擎选择全链路，含「修复前 vs 修复后」对照 |
| `.setup/check/dump-tool.js` | dump 单个工具的完整返回原文 |

```bash
node .setup/check/validate-manifest.js manifest.json
node .setup/check/smoke-mcp.js
node .setup/check/sim-host-settings.js
```

0.4.2 实测：预检 10 通过 / 0 警告 / 0 错误 · 冒烟 18 通过 / 0 失败 · 通路验证 ✓ 打通。

### 6. 仍未实现（Wiki 领先于宿主，勿照写）

- `ui[].extensions` 过滤：宿主注册表只 push
  `{key,pluginId,title,icon,location,content,serverId,openMode}`，`extensions` 被丢弃。
  Wiki 称 outline 位支持按后缀过滤，**当前宿主版本未实现**——非 LaTeX 文件的收窄由
  `panels/outline.tsx` 自己在组件内判断（v0.5.1 起：非 LaTeX 就整张卡片不出现，见文末 v0.5.1）。
- `editors[].outlineTool`：本插件走的是独立 `ui.location="outline"` 通路，未用该字段。

## v0.5.0 — 章节大纲面板重做（能点、成树、认编号、跟光标）

**动手前先看它到底长什么样**：去宿主包（`app.asar`）里确认了挂载位，`PluginOutlinePanels`
（`components/Sidebar/PluginUiHosts.tsx`）把插件面板塞进左侧「大纲」页签里，结构是：

```
<div className="p-3 pt-1 space-y-2 notrat-plugin-slot notrat-plugin-slot-outline">   ← 外层留白
  <div>插件面板</div>
  <Dismissable><PanelShell>…   ← PanelShell 已经给了卡片边框 + 图标标题行
```

所以 v1 那套「`height:100%` + 自己再画一行标题」是错的：高度百分比在 auto 高度容器里不生效，
自己那行标题又和 PanelShell 的标题行重复。v2 改成**自然高度 + 三行紧凑控制条**，不再自画标题。

### v1 的六个问题（逐条修掉）

| # | v1 症状 | v2 做法 |
|---|---|---|
| 1 | **行不可点**——`cursor: default`、没有 onClick，点章节毫无反应，等于一个只读目录 | 点任意行 → 源码滚过去并高亮闪烁；通道 `notrat-latex-reveal-line`，编辑器回 `…-ack` 回执 |
| 2 | 平铺列表，靠 padding 假装缩进；长论文一屏放不下，也看不出谁属于谁 | 按层级建**树**，逐节折叠（chevron），折叠状态**按文件**记在 sessionStorage |
| 3 | 编号是面板自己从 1 数的：`\section*` 也编号、book 类文档不认章号 | 编号函数认 `chapter`/`part`、认 `\section*`（不编号且不推进计数器）、book/report 下给 `1.2` / `1.2.3` 前缀 |
| 4 | 只有章节——解析器明明返回了图表公式和 TODO，面板全丢 | 图/表/公式（带 **caption + 编号 + `\label` + 起止行**）与 TODO/FIXME 进树，挂在「它前面那一节」下；三个开关可关 |
| 5 | 不知道你正在写哪一节 | 编辑器广播 `notrat-latex-cursor`，面板高亮该节、自动展开祖先、滚进视野（「跟随光标」可关） |
| 6 | 没有检索 | 过滤框：命中即展开祖先；Esc 清空 |

另外补了键盘导航（↑↓ 移动并跳转 / Enter / Home / End / Esc），以及一个「层级」下拉（仅顶层 / 1 / 2 / 3 / 全展开）。

### 顺带把解析器补全（`server/index.js`）

v1 的 `environments` 只有 `{name, line}`——面板能列出「🖼 图」，但拿不到图题，也没法点 `\label`。
新增 `collectFloats()`：按 `\begin`/`\end` 配对，补出

```json
{ "name": "figure", "line": 27, "endLine": 31, "caption": "模型整体结构", "label": "fig:model" }
```

未闭合的环境**照样进清单**（配对错误留给 `latex_validate` 去报，解析侧不吞信息）。

### 新增两条事件通道（`panels/editor.tsx` 侧同步实现）

| 通道 | 方向 | 用途 |
|---|---|---|
| `notrat-latex-reveal-line` | 面板 → 编辑器 | 滚到某行 + 高亮闪烁；**编辑器回 `notrat-latex-reveal-ack`** |
| `notrat-latex-cursor` / `…-ping` | 编辑器 → 面板 | 广播光标行；面板挂载时 ping 一次要当前值 |

**为什么要 ACK**：面板拿不到编辑器实例（官方 props 只有 `{serverId, pluginId, ctx, data, error, launch}`，
`ctx` 里只有 `workspace`），只能靠事件广播。ACK 让「点了一行」有确定的成败——**170 ms 没人接住**
就说明该 .tex 压根没在编辑器里打开，于是回落 `notrat-open-file` 让宿主打开它，隔一拍再补发一次。
用户点大纲一定有反应。

### 工程教训（这条是真被测出来的）

第一版 v2 里 JSX 上挂了 `ref={bodyRef}`，但声明在改写时被漏掉了。
**esbuild 转译通过、宿主静态体检通过、纯逻辑单测全绿**，一渲染直接
`ReferenceError: bodyRef is not defined`——整个面板白屏。

教训：`esbuild 通过` 只证明语法合法，离「能渲染」还差得远。于是补了
`.setup/test-outline-render.js`：esbuild 转 CJS → 塞迷你 React → 假 window/sessionStorage →
**真起 MCP server 拿 JSON** → 渲染到稳定 → 断言树里出现什么 → **真的去点一行**看有没有派发事件。
这个测试当天就抓到了上面那个白屏 bug。

### 验收（全部离线可跑，退出码 0/1）

| 脚本 | 覆盖 | 结果 |
|---|---|---|
| `.setup/verify-v040.js` | 清单/贡献面/9 份内联源码 esbuild 转译/工具注册/工作区↔部署产物一致性 | ✅ 69 项 |
| `.setup/test-activefile.js` | 活动文件桥（生产者广播 + 消费者 hook + 各面板接线） | ✅ 50 项（v0.6.1 起并进验收门） |
| `.setup/test-nav.js`（**新增**） | 「点大纲 → 跳到对应行」**真渲染编辑器**：ACK 真伪 / 落点行号 / 选区偏移 / 切视图补跳 | ✅ 18 项（并进验收门） |
| `.setup/test-outline-v2.js` | 大纲纯逻辑（编号/建树/过滤/折叠/活跃节）+ **跨文件通道名逐字一致** + 真样例建树 | ✅ 82 项 |
| `.setup/test-outline-render.js` | 大纲面板**真渲染** + 点击派发事件（行号/路径/nonce 全查） | ✅ 21 项 |

```bash
node .setup/build-singlefile.js      # 构建部署（~/.notrat/plugins + ~/.notrat/tools）
node .setup/verify-v040.js
node .setup/test-activefile.js
node .setup/test-outline-v2.js
node .setup/test-outline-render.js
```

**跨文件通道名一致性**这条值得单说：这类「靠 window 事件解耦」的设计，头号故障就是两个文件里
字符串拼得不一样（改了这边忘了那边），而且**编译期、运行期都不报错**——只是点了没反应。
所以测试直接从两份源码里各抠出 `const LATEX_REVEAL = "…"` 逐字比对。

### 顺手修正的过期断言（都是"猜的契约"，这次按宿主实现改）

| 断言 | 旧期望 | 真实契约（宿主源码位置） |
|---|---|---|
| `editors[].dualView` | `=== true`（布尔） | **双元素非空字符串数组**：`syncPluginEditors` 里 `Array.isArray(dualView) && length===2 && every(string)`；传布尔会被丢掉 → 双视图静默失效 |
| `${settings:}` 占位符 | 要求再双写一套 `_ALT`（带组名 `.字段`） | **只要裸字段名**：`resolvePlaceholders` 走 `getValue(pluginId, key)`，而设置面板写值走 `setValue(settings.key, field.key, value)` → `${settings:latex.compiler}` 只会解析成空串。现断言**禁止** `_ALT` 残留 |
| `hostView` | 编辑器里找 `hostView` | 实际标识符是 `hostMode`（`hostView` 从没存在过） |
| 部署包版本 | 写死 `"0.4.1"` | 改为与工作区 `manifest.json` 比对（写死导致测试长期红着没人管） |

### 事故复盘：`渲染器编译 · components/Chat/MarkdownRenderer.tsx#MarkdownRenderer`

| 项 | 内容 |
|---|---|
| 现象 | 界面弹红条：`Transform failed with 1 error: … ERROR: The input to transform must be a string or a Uint8Array` |
| 宿主链路 | `enable()` 对 `contributions.renderers` 先 `resolveRendererComponentId(nodeType, componentId)` → `PLUGIN_RENDERER_MAP["markdown/code"] = "components/Chat/MarkdownRenderer.tsx#MarkdownRenderer"`，再 `window.electronAPI.component.compile({ componentId, source: r.source })` |
| 关键契约 | 宿主**不解析 `sourceFile`**：整份 renderer bundle 里 `sourceFile` 只出现 3 次（2 次在 `stripInlinedPanelSources`、1 次是「编辑器缺 source」的告警文案）。单文件包里 `editors[].source` / `renderers[].source` / `ui[].content.source` 必须是**内联字符串** |
| 根因 | 部署包 `~/.notrat/plugins/notrat-latex-plugin.json` 被**目录态 `manifest.json` 逐字节覆盖**（8782 vs 8783 字节，只差末尾换行）→ 9 份组件源码从「内联 source」退回「sourceFile 引用」→ `r.source === undefined` → esbuild `transform(undefined)` 抛错 |
| 为何只有 renderers 弹红条 | renderers 分支**没有** `!source` 守卫；editors 分支有（`if(!Bn.source){ warn; continue }`），于是编辑器静默失效、由渲染器把红条顶出来 |
| 修复 | `node .setup/build-singlefile.js` 重新内联 9 份源码并落盘（222 → 227 KB），`args` 一并改回 `~/.notrat/tools/latex-server.js` → 69 项验收全绿 |
| 附带硬伤 | 同一个 `undefined` 把验收脚本自己也打崩了（`Cannot read properties of undefined (reading 'includes')`）→ 已加防呆：**报红不崩**，失败行直接打印修复命令 |
| 铁律 | 改完 `panels/*.tsx` 或 `manifest.json` **必须跑 `build-singlefile.js` 再 reload**；直接 `cp manifest.json ~/.notrat/plugins/` 会把单文件包打回目录态，必然复现本事故 |

### 已知边界（没动的）

- **编辑器内置的那条 150px 大纲列**（`panels/editor.tsx` 里的内部 `outline`）仍是平铺列表，
  只认 `chapter/section/subsection/subsubsection`，不认 `\section*`，也不含图表公式。它和侧栏面板
  是两个面：一个贴在编辑器里随时可见，一个在侧栏带检索/折叠/跳转。要不要合并成一套，等你决定。
- 树的跳转只在**同一个 .tex 内**生效；`\input` / `\include` 进来的子文件目前当独立文件看，
  没有把子文件内容拼进同一棵树。

## v0.5.1 — 大纲卡片只在 LaTeX 文件时出现（非 LaTeX 整卡隐藏）

**需求（已确认）**：只要当前活动文件是 `.tex` / `.bib` / `.cls` / `.sty` / `.ltx` 就显示这张卡片；
不是 LaTeX 系文件时**整张卡片不出现**（含宿主卡片壳的图标、标题行与右上角 ✕）。

v0.5.0 的做法是「收起内容、留一行提示」（`IdlePanel`），卡片壳还占着位置；这版连壳一起去掉。

### 为什么得自己动手藏

宿主没有「按条件显示」的能力位 —— `ui` 贡献面归一化时只保留
`{ key, pluginId, title, icon, location, content, serverId, openMode }`，没有 `visibleWhen` / `when`。
而卡片外壳是宿主自己画的，结构是：

```
div.notrat-plugin-slot.notrat-plugin-slot-outline      ← 挂载位容器（含「插件面板」分区标题）
  └ div.relative.group/panel                           ← Dismissable：卡片壳 + ✕
      └ div.notrat-plugin-panel                        ← PanelShell 卡片
          ├ div.notrat-plugin-panel-header             ← 图标 + 标题行
          └ div.notrat-plugin-panel-body > 本面板
```

插件只能决定 `-body` 里画什么。所以「整卡不出现」＝面板自己把最外层那个壳置 `display:none`
（向上找，走到挂载位容器就收手），条件恢复或组件卸载时原样还原。

### 活动文件从哪来：事件桥降为兜底，改读宿主 store

v0.4.1 那套事件桥（`notrat-latex-active-file`）**只有本插件的编辑器会广播，而编辑器只声明了 `tex`**，
所以 `.bib` / `.cls` / `.sty` 永远拿不到路径 —— 显示条件也就不可能成立。

现在首选宿主 store：

```js
require("@/store").useWorkspaceStore    // → state.currentFile.{path, name}
```

能这么写是因为宿主编译面板源码后是以
`new Function("require","exports","module","React", code)(requireShim, ...)` 执行的，
而 `requireShim` 的白名单（宿主 renderer 的 `moduleMap`）里就有 `"@/store"`。
（esbuild 以 `--format=cjs` 转译，手写的 `require(...)` 会原样保留 —— 已实测。）

拿不到 store（宿主哪天改了白名单）时不抛错：`known:false` → 静默退回事件桥，老行为照旧。
两条路都认不出文件时（`currentFile === null`）同样隐藏。

### 顺带的两个细节

- **分区标题**：「插件面板」那行是挂载位容器的第一个孩子，不属于卡片。本面板是本区唯一一张卡时
  它会孤零零飘着，所以一并收起；但**只看容器的直接子节点**，同区还有别的插件卡片露着就保留
  （那是别人的标题）。卡片内部节点不算数 —— 否则别人那张卡被藏了，它内部的 `.notrat-plugin-panel`
  还会被数成「露着的卡片」，标题永远收不掉。
- **挪位也认**：挂载位容器类名是 `notrat-plugin-slot[-<位置>]`，收手判定按**前缀**匹配，
  面板被右键挪到 `right-panel` 等位置后不会越界藏到大区域。

### 验收（离线可跑，退出码 0/1）

| 脚本 | 结果 |
|---|---|
| `.setup/test-outline-visibility.js`（**新增** 36 项） | 按宿主真实 DOM 结构搭假树 + 假 store + 迷你 React：找壳 / 分区标题 / 藏与还原 / 跟随 `currentFile` / 白名单缺失降级 |
| `.setup/test-activefile.js`（50 项） | 事件桥回归（旧断言已按新契约更新） |
| `.setup/test-outline-v2.js`（82 项） | 大纲 v2 契约 |
| `.setup/test-outline-render.js`（21 项）· `test-preview` · `test-snapshot-safety` | 渲染 / 预览内核 / 快照安全 |
| `.setup/check/validate-manifest.js` | 10 通过 / 0 警告 / 0 错误 |
| `.setup/check/smoke-mcp.js` | 18 通过 / 0 失败（`ready v0.5.1`） |
| 7 份面板 esbuild 转译 | 全部 ok |

新测试里有 3 个用例是「先写断言、再被实现打脸」：写完发现 `hideOrphanSectionLabel` 扫整棵子树时，
会把「别人已隐藏的卡片」数成露着的，于是改成只看直接子节点。

### 已知边界

- 隐藏靠 DOM：宿主若把 `group/panel`、`notrat-plugin-panel` 这些类名换掉，会退化成「藏不掉」
  （卡片照常显示），**不会误藏别人的东西** —— `findHostCard` 找不到就什么都不做。
- 编辑器内部那条 150px 内联大纲按你的选择**保留不动**。

## v0.5.3 — 修复「左侧大纲面板整棵树挤成一行」

**现象**：左侧「大纲」标签页里，整棵章节树（连同编号、行号）被压成**一行**显示。

**根因（不是 CSS，是数据契约）**：

宿主 `editors/PluginOutlineItems.tsx` 里的 `parseItems()` 对 `result` 有三条分支：

```js
if (Array.isArray(it))            te = it;            // ① result 是数组 -> 每个元素当一条
else if (typeof it === "string")  /* JSON.parse 或按 level|text|anchor 逐行切 */;  // ②
else if (it && typeof it === "object") {              // ③
  const pt = it.content ?? it.items ?? it.data;       //    取 content 当「条目数组」
  if (Array.isArray(pt)) te = pt;
}
```

我们之前返回的是**多行文本**，被 server 包成 MCP 常规形态：

```json
{ "content": [ { "type": "text", "text": "1|1  引言|11\n1|2  方法|16\n…" } ] }
```

这正好命中分支 ③：`content` 被当成条目数组，于是**整份大纲只剩 1 条**，
而这条的 `text` 里带着换行。宿主条目样式是 `whitespace-nowrap` +
`text-ellipsis` + `truncate`（`<span class="truncate block">`），
换行被折叠成空格 → **整棵树 + 编号被压成一行**。

**修法**：宿主通路改为返回「一条一项」的数组，每项保留 MCP 合法的 `type`/`text`，
并挂上 `level`（缩进）与 `anchor`（源文件行号，用于点击跳转）：

```json
{ "content": [ { "type":"text", "text":"1  引言",   "level":1, "anchor":"11" },
                { "type":"text", "text":"2  方法",   "level":1, "anchor":"16" },
                { "type":"text", "text":"2.1  模型结构", "level":2, "anchor":"26" } ] }
```

| 改动 | 文件 | 说明 |
|---|---|---|
| `outlineHostItems(res, depth)` | `server/contrib.js` | 新增；返回条目数组（旧 `outlineHostProtocol` 保留） |
| `tools/call` 支持数组透传 | `server/index.js` | 工具返回数组时不再被包成单条 text |
| `latex_outline` 宿主通路 | `server/index.js` | 改走 `outlineHostItems` |

**验证**（用宿主自己的 `parseItems` 跑真机数据，不是靠读代码猜）：

| 输入形态 | 宿主解析结果 |
|---|---|
| 旧：`{content:[{type:"text",text:"多行"}]}` | **1 条**（整份大纲塌成一行）❌ |
| 新：`{content:[{type:"text",text:"引言",level:1,anchor:"11"}, …]}` | **每条一项**，缩进与行号齐全 ✅ |

**排查过程中排除的**（都有证据，避免下次再走弯路）：

- 运行时样式覆盖：`notrat-slot-overrides` 实测为 `{"state":{"overrides":{}},"version":0}`，是空的 → **没有样式需要重设，也不需要再加任何 `slot_set_style`**。
- 面板被「右键 → 移动到…」挪位：leveldb 里**根本没有 `notrat-plugin-ui-location` 这个键** → 面板一直在声明的 `outline` 挂载位。
- 宿主挂载位横向排布：编译产物里是 `className="p-3 pt-1 space-y-2 notrat-plugin-slot notrat-plugin-slot-outline"`，纯块级竖排 → 不会并排。
- 面板自身布局：`panels/outline.tsx` 的 `S.root` 是 `display:flex` + `flexDirection:column`，树（`S.body`）与统计（`S.foot`）是它的同级子节点 → 结构上不可能同行。

**教训**：`editors[].outlineTool` 这类「宿主渲染插件数据」的贡献面，契约要看**宿主解析器**，
不能只看自己的输出格式对不对。格式对了（`level|text|anchor`），包装层错了照样塌。


## v0.5.4 — 归因：这次到底怪谁（我们的问题 / 开发文档的问题）

**结论：直接责任在我们，宿主契约缺陷是放大器。** 三条账分开记。

### 1. 触发点：我们的 bug —— 返回形态选错了

宿主 `parseItems(result)` 有四条分支（1.3.3 逐字）：

```js
if (Array.isArray(it))                  te = it;                    // ① result 就是条目数组
else if (typeof it === "string") { /* JSON.parse，失败则按 level|text|anchor 逐行切 */ } // ②
else if (it && typeof it === "object") { const pt = it.content ?? it.items ?? it.data; // ③
                                         if (Array.isArray(pt)) te = pt; }
// 兜底：只有 typeof it === "string" 时才回到分支 ②
```

我们旧实现返回的是标准 MCP 形态 `{content:[{type:"text",text:"多行"}]}`，正好命中 ③：
`content` 被当成条目数组 → 整份大纲只剩 1 条，而这条的 text 里带着换行；
宿主条目是 `<span class="truncate">`，换行被折成空格 → **左侧大纲就是一行**。

用**从线上包抠出来的真 `parseItems`** 跑四种形态（`.setup/verify-attribution.js`）：

| 返回形态 | 解析出几条 | 结果 |
|---|---|---|
| A. `{content:[{type:"text",text:"level\|text\|anchor 多行"}]}`（旧实现） | **1** | ❌ 塌成一行 |
| B. 同样文本、裸字符串（非标准 MCP 形态） | 4 | ✅ |
| C. `content` 里一条一项 + `level`/`anchor`（v0.5.3 实现） | 4 | ✅ |
| D. 裸数组（items 直接当 result） | 4 | ✅ |

A 是**我们自己选**的形态，而且它正是 MCP 里最标准的那一个 —— 这份账记在我们头上。

### 2. 放大器：宿主/文档的契约缺陷

分支 ② 就是文档里那个 `level|text|anchor` 文本协议，但它有个**够不到的前置条件**：
`typeof it === "string"`。而 MCP 规定工具返回**必须是对象** `{content:[...]}`。
也就是说：**任何合规的 MCP server 都永远进不了分支 ②**，这个协议对 MCP 插件是死代码。
更糟的是 `content` 这个键名被两种含义复用（MCP 内容块 / 大纲条目数组），
对象分支又会**先**把字符串分支挡住，而且全程**无校验、无告警**：形状错了不报错，只是默默少几条。
一个形状错误能变成「只是显示得奇怪」，这是宿主该修的地方（建议：先探 `content[0].text`，
条目缺 `text` 时 warn，别让两条分支抢同一个键）。

### 3. 为什么没提前发现：我们自己的流程漏洞（快照过期）

根子在 v0.4.2 §6 与「已知边界」里那句「`outlineTool` 当前装机版尚未实现」——
它是**对着 `.setup/host/` 的旧 renderer 快照**下的结论，而 Notrat 在当天 18:05
自动更新到了 **1.3.3**，这套契约是新 renderer 才加的：

| 证据 | 旧快照 `.setup/host/renderer.js` | 装机版 1.3.3 renderer |
|---|---|---|
| `parseItems` / `PluginOutlineItems` | 0 处 | 有 |
| `outlineTool`（`editors` 解析里读） | 0 处 | 有 |
| `notrat-outline-navigate` | 0 处 | 有 |
| 文件 sha1 | `133ac88d…` | `5c081b50…`（`dist/assets/index-XIov55p-.js`） |
| 该 sha1 是否还在 asar 里 | 否（连 AI 指引文案都换了） | 是 |

所以：**我们声明了 `outlineTool`，却以为它是死的**，于是根本没测它被宿主渲染时的返回形态。
等宿主真开始渲染，形状错误就直接怼到界面上。这条记我们头上，
补丁是 `.setup/check/live-host-contract.js`：改插件前跑一遍，asar 比快照新就判 STALE，
并现场核对 5 条契约 + 端到端把真 `parseItems` 跑在我们的输出上。

### 一句话版

> 是我们的问题：返回形态选错（该给数组却给了多行文本），
> 而且兼容性判断用的是过期快照。
> 开发文档 / 宿主也有账：`level|text|anchor` 协议在 MCP 下不可达、`content` 一键两义、错了不报错。
> 前者我们能自己修掉，后者只能绕 —— 绕法就是「一条一项的数组」。

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

## v0.6.0 — 接回划词助手（`right-panel`）与 `.tex` 右键编译 / 校验

### 新增两个贡献面

| 贡献面 | 内容 |
|---|---|
| `ui@right-panel` | `latex-selection` 划词助手（`panels/selection.tsx`） |
| `fileTreeMenus` | `latex-compile` / `latex-validate`，`extensions: ["tex"]`，直调 MCP 工具 |

### 一处必须修的宿主契约差异（否则是「静默错误」而非报错）

宿主 `fileTreeMenus` 点击时自动注入 `filePath` / `fileName`（Wiki §3.8），**不传 `path`**；
而 `latex_parse` / `latex_validate` / `latex_compile` / `latex_status` / `latex_history` 原先只取
`args.path`。`resolveInput(p)` 在 `p` 为空时会 `findMainTex(workspaceRoot)` —— 于是右键
`test.tex` 会**静默**处理 `sample.tex`：不报错、不提示，只是结果不对。

已给 5 个工具入口（throw 形式）与 2 处快照入口统一归一：

```js
const input = args.path || args.filePath;
const file = resolveInput(input, ws);
```

实测对照（`samples/` 下同时有 `sample.tex` 与 `test.tex`）：

```
# A) 只带 filePath —— 宿主右键的真实入参
📋 E:/notrat-latex-plugin/samples/test.tex
🟡 L206 [unverified-citation] \upcite{1} 未找到 .bib 文献库

# B) 不带任何参数 —— 改造前的旧行为
📋 E:\notrat-latex-plugin\samples\sample.tex
🔴 L18 [undefined-ref] \ref{sec:intro} 引用了未定义的 label
```

编译通路同样实测：`latex_compile` 只带 `filePath` → `退出码: 0`，PDF 正常生成。

### 划词助手：按**真实宿主实现**写，避开文档简化版

- 划词采集跟随宿主「划词引用」开关，**纯净版恒为 `null`**（宿主源码明写「纯净版不包含划词引用」）——
  面板把它当正常空态，不当异常。
- 供应商解析走宿主真实链路：`notrat-ai-current:<workspace>` 只存 `{providerId, model}`，
  密钥仍在 `notrat-ai-config.providers` 主表。
- `ui[].extensions` 在宿主 `useUiByEffectiveLocation` 里**不生效**（只按 location 过滤；
  全库只有 `editors` / `fileTreeMenus` 真做了后缀过滤）——所以面板自己在非 LaTeX 文件上降级提示，
  不依赖 manifest 兜底。
- AI 子调用带 `options.skipEvolution: true`（插件发起的调用，进化引擎不得改写本插件提示词）。
- 卸载时 `abort()` 在途请求；结果存 `sessionStorage`（切主区标签会卸载组件）。

### 验收：84 → 101 项

上一轮的反向断言（「`ui` 有且仅有 1 个」、「`fileTreeMenus` 必须缺席」）按需放宽，
但**放宽不等于放弃** —— 改为「正向断言新增面 + 仍反向断言其余 11 个挂载位缺席」：

```
node .setup/verify-v052.js   # 101 项（+17：fileTreeMenus 工具存在性 / filePath 兼容 /
                             #        selection 源码内联 + 契约特征 + 字节一致）
node .setup/test-v052.js     # 24 项（子测试，未受影响）
```

`verify-v052.js` 新增断言：

- `fileTreeMenus` 恰好 2 项、都限定 `["tex"]`、都走 `tool`（不用 `uiKey`，因此不需要 `page` 挂载位）
- 菜单指向的 `latex_compile` / `latex_validate` **在 server 里确有定义**（防「菜单挂了个不存在的工具」）
- `server/index.js` 含 `args.path || args.filePath`（防 filePath 兼容被回退）
- 划词助手源码含 `ctx.selection` / `skipEvolution: true` / `notrat-quote-to-chat` 三个契约特征
- `ui[selection].source ≡ panels/selection.tsx`（字节一致，防「改了源码没重新打包」）

## v0.6.1 — 摘掉划词助手 / 修「点大纲不跳」/ 移除编辑器内大纲

三件事，对应三条明确的需求反馈。

### 1. 划词助手摘除（`ui@right-panel` 下线）

- `manifest.json` 去掉 `latex-selection` 那条 `ui` 贡献；贡献面回到 `editors + ui@outline + fileTreeMenus + settings`
- 源码**归档**到 `panels/_unused/selection.tsx`（不是删掉）：要接回只需把那条贡献加回 manifest 再打包
- 部署包从 138KB 瘦到 114KB（内联组件 3 → 2）

### 2. 「点大纲没跳过去」—— 真凶是异步 setState + 撒谎的回执

现象：在**可视化**视图下点左侧大纲，编辑器毫无反应，也没有任何提示。

根因（读代码只能猜到一半，真渲染才钉死）：

```js
// 老实现（panels/editor.tsx）
function gotoLine(ln, opts) {
  if (view === "preview") setView("split");   // ← setState 是异步的，这一拍不会立刻重渲染
  const ta = taRef.current; if (!ta) return;   // ← 可视化视图下源码 textarea 没挂载 ⇒ 直接 return
  ...
}
// 上层 onReveal：不管 gotoLine 有没有真跳，都无条件回 ACK
```

宿主 `useEditorStore` 的默认 `editorMode` 就是 `"wysiwyg"`（`.setup/host/renderer.js` 里 `editorMode:"wysiwyg"`）
⇒ 打开 `.tex` 默认落在可视化视图 ⇒ `showSrc = false` ⇒ 源码 textarea 根本没挂载。
两件事叠加起来就是「不跳 + 面板以为跳成功 + 兜底不触发」。

修法：

1. `gotoLine` 跳不了时把行号挂到 `pendingReveal` 并**返回 `false`**；新增一个无 deps 的 `useEffect`
   在 DOM 就绪的那一拍补跳；
2. 回执只走 `ackReveal()`，且**只有真的跳了才回**（当拍跳成当拍回，补跳成由 flush 补回）；
3. 面板侧兜底从 1 拍加到 3 拍（`RETRY_DELAYS = [170, 700, 1500]`）——「打开文件 → 编辑器挂载 →
   监听就绪」需要时间，只补发一次常常又赶不上；回执配对改为按 nonce **前缀**匹配，重试轮次也能认。

### 3. 编辑器内不再内嵌大纲

删掉编辑器里那一列 150px 的章节列表，以及只服务它的 `outline` useMemo 与 `SEC_LV` 常量
（画面整块还给源码与预览）。章节导航统一走左侧「章节大纲」面板。

### 新增回归测试：`.setup/test-nav.js`（18 项，真渲染）

这个 bug 属于「静态断言查不出来」的那一类，所以新写了一个**真渲染**测试：esbuild 转 CJS →
迷你 React（带 ref 挂载 + effect cleanup + 渲染循环）→ 假 window/`sessionStorage` → 真渲染
`panels/editor.tsx` → 派发 `notrat-latex-reveal-line` → 查 ACK 与 textarea 的落点。

**先跑在修复前的代码上，4 项红**（ACK 撒谎 / 不滚动 / 不选中 / 不聚焦），修复后 18 项全绿：

```
── B. 可视化视图下点大纲（本文件 / 第 26 行）──
  ✗ 跳不成时不回 ACK（老实现会撒谎回执 → 面板兜底失效）  → ACK 数=1
── C. 切到含源码的视图后那一拍：应当补跳 + 补回执 ──
  ✗ 滚动落点 = 第 26 行对应位置（366.7px）  → 0
  ✗ 选区起点 = 第 26 行的字符偏移（589）  → null
  ✗ 跳转时把焦点给了编辑区
```

测的落点是**真实算出来的行偏移**（第 26 行 = 589 字符处）与 `scrollTop = (26-1)*20 - clientHeight/3`，
而不是「有没有调用过某个函数」—— 这样「跳到别的行」也会被抓出来。

### 顺带清掉一处「恒红的旧断言」

`.setup/test-activefile.js` 的部署产物段还在按「6 个 `ui` 挂载位都在包里」查，
而贡献面自 v0.5.2 起就收敛了 —— 这 6 条从那时起恒红，README 却依然写「✅ 53 项」。
已按实际部署的挂载位重写（并补一条「部署包里确实没有 right-panel」），同时把它与 `test-nav.js`
一起并进 `verify-v052.js` 第 9 节 —— 以后腐烂会被验收门挡住，而不是等人发现。

### 验收

```
node .setup/verify-v052.js   # 172 通过 / 0 失败（v0.6.0 时 101）
                             # 顶层：结构 / 白名单 / UI 面 / 编辑器声明 / 内联体检 /
                             #      esbuild 真转译 / 工作区↔部署产物字节一致 / server 同步
                             # 子测试：test-v052(24) + test-nav(18) + test-activefile(50)
```

新增断言：`gotoLine` 跳不成挂 `pendingReveal` / 只有真跳了才回 ACK / ACK 走 `ackReveal` /
编辑器内无大纲列与死代码 / 面板兜底 3 拍 + nonce 前缀配对 / `_unused/selection.tsx` 已归档 /
部署包无 `right-panel`。

## v0.7.0 — 可视化视图变成可编辑（方案 A：块级外科手术）

### 需求

> 「目前不能够像 TipTap 一样编辑 latex 吗」

### 结论先说

**不能内联 TipTap，但也不需要。** 两条硬事实：

1. **宿主不给 TipTap。** 面板 / 编辑器的模块解析器是一个**写死的 7 项白名单**（装机版
   `dist/assets/index-*.js` 里的 `moduleMap`）：`react` / `react-dom` / `lucide-react` /
   `@/utils/cn` / `@/store` / `@/store/slices/componentOverride` / `@/utils/tokenEstimate`。
   `@tiptap/*` 与 `prosemirror-*` 一律运行时抛错。宿主**自己**确实是 TipTap（bundle 里有
   `tiptap-editor` / `prosemirror-model`），但那是宿主私有依赖，不在插件契约里。
2. **TipTap 解决的不是这里的问题。** 它的 doc 模型 ≠ LaTeX 源码。真上 TipTap，`\cite` / `\ref` /
   宏定义的**回写语义问题一点没省**——只是把「怎么接 contenteditable」换成了「怎么把 PM 节点映回 TeX」。
   换来的是 schema / undo / IME / 选区这些基础设施，代价是装机包再翻几倍。

所以走 **方案 A：块级外科手术**。内核 `server/wysiwyg.js` 在 v0.6.x 就写好了（29 项单测全绿），
但一直是**死代码——没有任何文件 require 它**。本版把它接上。

### 设计红线（为什么不做「HTML → LaTeX」全量重建）

> LaTeX 是编程语言，而预览渲染层是**有损**的——
> `\cite{vaswani2017}` → `[1]`，`\ref{fig:model}` → `图 1`，`\includegraphics` → 只剩占位文件名。
> 若由渲染结果反向生成源码，用户敲一次字就会烧掉 `\cite` / `\ref` / 宏定义——对论文作者等于丢稿。

于是内核只做一件事：**每个块记住自己的 `[startLine, endLine]`，只有用户真改过的块才用自己的新文本
替换自己的行区间；没改的块逐字节原样保留**（硬不变式 `applyEdits(src, []) === src`）。

### 三层实现

| 层 | 位置 | 职责 |
|---|---|---|
| 内核 | `server/wysiwyg.js`（零依赖，Browser / Node 双端） | `parseDoc` 出块模型；`applyEdits` 做行区间替换；`parseInline` / `segmentsToTex` 管行内原子；`headingTex` 保住 `*` / `[短标题]` / `\label` |
| 渲染 | `panels/editor.tsx` 的 `wysInline` / `wysRenderDoc` | `editable:true` 的块（**只有 heading / paragraph**）→ `contenteditable="true"`；行内 `\cite` / `\ref` / `$..$` → `contenteditable="false"` + `data-tex`；其余全部 → 只读原子卡片（点一下跳源码行） |
| 读回 | `panels/editor.tsx` 的 `wysDomToTex` | DOM → LaTeX：`data-tex` 原样吐出、`data-open` 记包裹命令（回写补 `}`）、文本按 `nodeValue` 取回、`\u00a0` 归一 |

### 三条不变式（缺一条就会丢稿）

1. **编辑期间 DOM 是权威** —— 绝不回写 `innerHTML`（`wysEditing` ref 守卫），否则每敲一个字光标就丢。
2. **只提交真正改过的块** —— 渲染时把每块原文记进 `wysOrigRef`，读回后逐块比对。
3. **提交前三道自检**，任何一条不过就**整批放弃**，不半途改坏文件：
   - `applyEdits(src, []) === src`（空编辑集逐字节还原）
   - `parseDoc(next)` 不抛（结果仍可解析）
   - `next !== content`（无改动不产生 diff）

提交时机：**失焦 / Ctrl+S / 切视图 / 编译前 / 校验前**（后两者还会顺手 `onSave()`——编译读的是磁盘文件，
不保存等于拿旧文件糊弄用户）。带撤销 toast（9 秒），一键回到编辑前。

### 踩到一个坑：两份内核顶层重名

`preview-core.js` 与 `wysiwyg.js` **都有** `escHtml` / `readGroup` / `findEnvEnd`。两份内联进同一个模块
作用域，esbuild 直接报：

```
The symbol "findEnvEnd" has already been declared
Duplicate top-level function declarations are not allowed in an ECMAScript module.
```

这是**编译期就炸**，装机后同样加载不了。修法不是去改内核里的函数名（那会连累 `server/` 侧单测与 Node
直用），而是**把整个 WYS 内核包进 IIFE**，顶层只留 `const WYS = (function(){...})();`
（`module.exports = {..}` 改写成 `return {..}`）。改的是内联层，内核一行没动。

### 验收（三层，一条命令 `npm run gate`）

```
[1] node server/wysiwyg.test.js       44 项  块模型 / applyEdits 不变式 / 行内往返 / 多块混合编辑 / 标题改多行
[2] node .setup/check-v070.js         编译   按装机同规则（LPC + WYS 双内联）esbuild 真转译 + 重名与 module.exports 残留检查
[3] node .setup/check-v070-dom.js     19 项  装机包里的代码 + jsdom 真 HTML 解析器 —— 真 DOM 往返
```

第 [3] 层是这次的关键，它验的是最要命的一条：

```
★ 零改动往返：渲染 → DOM → 读回 → applyEdits(src, 全部块原样回写) === src
```

只要这条成立，「聚焦 / 失焦 / 敲几个字」就**不可能丢字节**。附加断言：模拟段首插字后 `\cite` 原子原样
存活、改动只落在该块行区间（其余行逐字节不动）、标题改完 `\label{sec:method}` 仍在、渲染产物无
`<script>` / `onerror`（HTML 注入防线，10 组行内往返含 `< b & c >`、中文引号、`<script>` 用例）。

内核回归门从 29 项涨到 **44 项**（新增行内往返契约 / 多块混合编辑 / 标题改多行 / 提交路径三道自检）。

### 已知边界（就地编辑）

- **回车 = 新建段落；段内换行是 Shift+回车**（v0.8.27 起，与 LaTeX 的规矩对齐：空行才分段、
  单换行只是空格）。回车在光标处落**恰好一个空行**，光标停在新段落的行首 —— 与「¶ 新段落」
  按钮同一个数；已经站在空段落行首再按一次不会多塞空行（LaTeX 里没有空段落）。
  **Shift+回车** = 段内换行（那一行拆成两行，空行数不变）；Alt/Cmd+回车 不接管。
  要加**章节**请用工具栏按钮 / `Ctrl+1..5`，或源码视图（v1 有意收窄，避免自动生成的结构破坏文档）。
  （v0.8.26 的分寸是「段末第一下回车源码零改动、连按两下才一个空行」——那是**按当时
  「回车 = 段内换行」的语义**定的数；两个动作对调之后，「一个空行」由**一下**回车落，
  算式本身一个字没动，见 §v0.8.26 / §v0.8.27。）
- **原子节点可以整个删掉**（选中后删除 = 你确实不要这个 `\cite` 了），但改不到它内部。
- **跨块撤销**只有 toast 那个「↩ 撤销本次编辑」；宿主 `Ctrl+Z` 管不到编辑层内部（DOM 是权威期间
  不由宿主栈记账）。
- 粘贴**只收纯文本**，HTML 富文本一律丢弃（防止 HTML 进 `.tex`）。粘贴进来的 `\cite{..}` 会先当纯文本，
  提交重渲染后才变成原子。
- 只在**可视化**视图生效；源码视图行为完全不变。

## v0.7.1 — 修 TDZ 崩溃：`Cannot access 'renderMath' before initialization`

### 现象

0.7.0 装机后，**打开任意 `.tex` 文件编辑器直接白屏**，控制台抛：

```
ReferenceError: Cannot access 'renderMath' before initialization
```

### 根因

`panels/editor.tsx` 里，两处都在**同一个组件函数体**内：

```tsx
const wys = useMemo(() => {
  try { return { html: wysRenderDoc(content, renderMath) }; }   // 405 行
  catch (e) { /* ... */ }
}, [content, renderMath]);                                      // ← 依赖数组
// ... 中间隔着近 300 行 ...
const renderMath = useMemo(() => {
  if (katexOkRef.current && window.katex) { /* KaTeX 分支 */ }
  return (tex, disp) => LPC.miniMath(tex, disp);
}, [katexVer]);                                                 // 394 行（修复后）
```

`renderMath` 用 `const` 声明 → 存在**暂时性死区（TDZ）**。组件函数体自上而下同步执行，
第 405 行的依赖数组是**渲染期立即求值**的（只有 `useMemo` 的工厂函数体才是延迟执行），
执行到那一行时 `renderMath` 尚未初始化 → 抛错，整个编辑器挂掉。

**关键：炸的是依赖数组，不是回调体。** 若 `renderMath` 只在工厂函数内部被引用，
`useMemo` 可能要等到「该 memo 真的需要重算」才跑，反而可能侥幸不炸 ——
这正是这个 bug 容易写出来、也容易漏测的原因。

### 为什么编译期查不出来

`esbuild` / `tsc` 都**不报**这个错：它不是语法错，也不是类型错 ——
类型上 `renderMath` 完全合法，只是**初始化时机**不对。

0.7.0 的三层验收门（内核单测 / 面板离线编译 / 真 DOM 往返）当时**全绿**，线上照样白屏。
**「编译通过」对这类顺序问题零保证。**

### 修法

把 `renderMath` 的 `useMemo` 声明整块上移到 `wys` 之前。上移前已核对依赖项：
`katexVer`（`useState`，359 行）与 `katexOkRef`（`useRef`，373 行）**都在目标点之前**，
因此**无需改动任何逻辑**，纯顺序调整。

修复脚本存档 `.setup/fix-tdz-rendermath.js`（幂等，带锚点断言与「块外不得再有引用」安全检查）。

### 防复发：新增「顺序哨兵」

新增 **`.setup/check-tdz.js`**，并作为验收门**第 [1] 层**（最先跑，fail fast）：

对每个 hooks 依赖数组 `[a, b, c]` 里的标识符 `X`：

| 情形 | 判定 |
|---|---|
| 本文件有**同时或更早**的声明 | ok |
| 本文件只有**更晚**的声明 | ✗ TDZ（运行时会炸） |
| 本文件没有该声明（props / import / 全局） | 跳过，不猜 |
| `function` 声明 | 天然提升，不参与判定 |

哨兵**自带自检**（否则等于没有）：

- 喂修复前的坏文件 → 必须报警。实测命中「使用行 396 → 声明行 705」，退出码 1。
- 扫修复后的真源码 → 必须全绿。实测 7 个面板 / 36 项依赖全部有序，退出码 0。

### 验收

验收门从三层变四层，`npm run gate` 一条命令跑完：

```
[1] TDZ 顺序哨兵    ✓ 36 项依赖全部有序
[2] 内核单测        ✓ 44 项
[3] 面板离线编译     ✓
[4] 真 DOM 往返     ✓ 19 项
```

产物级复核（直接读装机 JSON，不信任「我改过了」）：

```
renderMath 声明位置: 59892
wys 使用位置:        60308   ✓ 声明先于使用
wys 依赖数组位置:    60523   ✓ 在声明之后
```

## v0.7.2 — 三种视图都能就地编辑 / 不再「一编辑就掉进分屏」/ 顶栏底栏精简

### 用户反馈（原话）

1. 进行编辑的时候还是会进入到分栏里面
2. 这几种模式应该都支持
3. 就地编辑文档意思是在预览的情况下直接编辑，而不是由源代码展示出来
4. 顶部和底部的很多功能可以去掉，优化UI

### 根因：反馈 1 和 3 是同一个 bug

`gotoLine()` 在源码 textarea 没挂载时**直接切分屏**：

```js
// 旧（0.7.1 及之前）
function gotoLine(ln, opts) {
  const ta = taRef.current;
  if (!ta) {
    pendingReveal.current = { ln: ln, ... };
    if (view === "preview") setView("split");   // ← 「一编辑就掉进分栏」就是这一行
    return false;
  }
  ...
}
```

而就地编辑层里**每张原子卡片都带** `data-line`（点一下跳源码），`onPreviewClick` 又是
「点带 `data-line` 的节点就跳源码」——于是在预览里点一下公式 / 图表卡片，就被踢进分屏看见源码。
这正是反馈 3 说的「由源代码展示出来」。

再加一层：卡片此前把块的 LaTeX **原样塞进** `<pre class="wys-card-src">`（超过 800 字符还截断），
所谓「就地编辑」看到的全是源码，确实不像在预览里编辑。

### 改法（逐条对反馈）

| 反馈 | 改动 |
|---|---|
| 1 编辑进分栏 | `gotoLine` 不再切视图：源码面板不在场时**在预览里滚过去闪一下**（返回 `true`，照常回 ACK）。切视图只剩卡片上的「↗ 定位」这一条显式路径（`gotoSourceAt`） |
| 2 几种模式都支持 | 三档视图都在；宿主标题栏切回「可视化」时按 `lastPvView` 还原（分屏 / 预览），不再一律拍回预览；分屏也回写 `wysiwyg`，标题栏开关不再骗人 |
| 3 就地编辑 = 预览里改 | 原子卡片改用只读预览内核**富渲染**（公式是真公式、图表是真图表、参考文献是真列表），源码收进卡片右上角「{ } 源码」按需展开 |
| 4 UI 精简 | 顶栏 14 个按钮 → 视图分段控件 + 就地编辑开关 + 「＋ 插入」菜单 + 编译 / 校验 + 一个状态点；底栏改成「有结果才出现」；状态栏去掉行数与中英拆分 |

### 几处关键实现

**1. 卡片富渲染 + 行号平移**

```js
function richBlockHtml(raw, renderMath, baseDir, startLine) {
  // 把块原文交给 LPC.renderPreview —— 与只读预览同一套内核，所见即所得
  let html = LPC.renderPreview(src, { renderMath, baseDir }).html;
  // 片段渲染出来的 data-line 是「片段内相对行号」，整体平移成 1 基绝对行号（与卡片自身一致）
  html = html.replace(/data-line="(\\d+)"/g, (s, n) => 'data-line="' + (parseInt(n, 10) + shift) + '"');
}
```

> 第一版平移写成了 `startLine - min`（0 基），DOM 验收立刻抓到「卡片 L55 里出现 data-line=54」，
> 改成 `(startLine + 1) - min` 才对上卡片的 1 基约定。**这条是验收门抓出来的，不是想出来的。**

兜底：块 >2 万字符或富渲染抛错 → 退回源码 `<pre style="display:block">`，绝不因此炸掉整篇。

**2. 卡片工具条走 mousedown，不走 click**

若等 `click`：焦点先从正在编辑的块上掉下来 → `blur` → `commitWys` → `onChange` → 整层 `innerHTML` 重建
→ 按钮连同它的事件一起没了，**点了没反应**。所以在 `mousedown` 阶段处理 + `preventDefault()` 保住焦点。

**3. `baseDir` 上移到 `wys` 之前**

卡片要按 `baseDir` 解析图，于是 `baseDir` 又进了 `wys` 的依赖数组 —— 依赖数组是**渲染期立即求值**的，
声明写在后面就是 0.7.0 那个 TDZ 事故重演。这次是**顺序哨兵先拦住**，才没重演。

**4. 图片懒加载改成「每拍补一次未排队的图」**

富渲染的卡片里也有 `<img data-asset>`，原来只在 `pv.html` 变化时跑会漏掉它们（切「就地编辑」开关时 `pv.html` 没变）。
现在注入后统一 `loadAssetsIn(root)`，拿到的 dataURI 进 `assetCache`，DOM 重建也能同步命中。

### 验收

验收门仍是四层，`npm run gate` 一条命令：

```
[1] TDZ 顺序哨兵    ✓ 自检通过 + 36 项依赖全部有序
[2] 内核单测        ✓ 44 项
[3] 面板离线编译     ✓
[4] 真 DOM 往返     ✓ 27 项（v0.7.2 新增 9 项）
```

新增的 9 项专盯这次改动：

- 卡片里有富渲染出来的 `.pv-eq`（公式真的被渲染了）
- 卡片同时保留源码 `pre.wys-card-src`，可随时切回
- 默认视图是富预览：卡片正文里**不再出现** LaTeX 源码字样
- 每张卡片都有「源码」「定位」两个显式出口
- 卡片内富渲染的 `data-line` 已平移成绝对行号（≥ 卡片起始行）
- `gotoLine` 里没有「预览就切分屏」的老逻辑；`revealInPreview` / `gotoSourceAt` 存在

### 已知边界

- 卡片内**嵌套**节点的行号可能偏 1（preview-core 对不同节点用了不同基准，只整体平移一层）。
  只影响「划词引用」带出的行号提示，不影响编辑与回写。
- 「＋ 插入」菜单只在源码 / 分屏出现 —— 纯预览视图里没有 textarea，插了也落不到光标处。
- Enter 仍是块内换行；跨块撤销仍只有 toast 那一次（与 v0.7.0 一致）。
  （⚠ 这半句在 v0.8.27 作废：回车现在是**新建段落**、段内换行改用 Shift+回车 —— 见 §v0.8.27；下面这节记的是 v0.8.2 当时的边界。）

## v0.8.3 — 视图入口交给宿主标签栏（编辑器顶栏那排视图按钮下线）

### 起因

原话：「顶部工具栏的 源码 / 分屏 / 预览 删掉，使用标签 tab 旁边的 可视化和源码，建立多个」。

顶栏那排分段控件与宿主标签栏的模式开关，是**同一件事的两个入口**。谁也没法宣布自己是权威：
用户在一处切了档，另一处不知道，久了必然互相对不上账。v0.4.2 已经因为 prop 名不符吃过一次静默失效，
而这次删掉顶栏之后，**档位入口只剩宿主一处** —— 那条线再断，就没有任何替代入口了。

### 先取证，再动手

「建立多个档位」在新客户端对应 manifest 的 `editors[].modes`（N 态，2–6 个）。
写之前先扫真宿主（`.setup/probe-host-modes.js`，可复跑）：

| 探测目标（D:Notrat
esourcesapp.asar，装机版） | 命中次数 |
|---|---|
| `editors[].dualView` 解析（`Array.isArray` + `length===2` + `every`） | 有 |
| `props.modes` | **0** |
| `modes:Array.isArray` / `modes.length` | **0** |

结论：**当前装机版宿主不认识 `modes`**。只写 `modes` 的话，这台机器上连原来那两个按钮都会消失。

### 做法：两个字段同时声明，代码认两代契约

```json
"dualView": ["可视化", "源码"],
"modes": [
  { "id": "visual", "label": "可视化" },
  { "id": "split",  "label": "分屏" },
  { "id": "source", "label": "源码" }
]
```

- 旧客户端（含当前装机版）：只认 `dualView` → 标签 tab 右侧两个按钮，`props.mode = "wysiwyg" | "source"`
- 新客户端：`modes` 生效、`dualView` 被忽略 → 三个按钮，`props.mode = "visual" | "split" | "source"`，
  并额外下发 `props.modes`（本编辑器用它的长度判断走哪代契约）

编辑器侧只留一张映射表 `MODE2VIEW` + 一张回写表 `writeHostMode`，两代 id 都认；
认不出的字面量一律 `null` = 这一拍不动视图（绝不瞎猜着换档）。**客户端升级后本插件不用再改一行。**

### 改了什么 / 没改什么

- 删：顶栏 `📄 源码 / ⧉ 分屏 / 📑 预览` 分段控件、`VIEWS` 常量、`goView(v.k)` 的渲染
- 留：`＋ 插入` / `编译` / `校验` / MCP 状态点（这些宿主不管）
- 补：内部切档点（`gotoSourceAt`、`gotoLine` 兜底）也回写宿主 —— 档位指示只剩标签栏一处，不许它显示假的
- 不动：`Ctrl+/` 快捷键（源码 ⇄ 可视化侧对翻）、三档各自的渲染逻辑、`lastPvView` 记忆

### 副作用（当前装机版下）

三档里「分屏」与「纯可视化」在旧契约下共用宿主的那一个「可视化」按钮：
默认落在**分屏**（源码 + 渲染并排），`Ctrl+/` 在「源码 ⇄ 可视化侧」对翻。
即：**当前客户端进不了「纯可视化」档**（顶栏那个按钮已删，宿主又只有二态）。
等 `modes` 生效后，「分屏」独立成第三个按钮，这条限制自然消失。

### 验收

- `npm run gate` → **7/7 全绿**（新增第 [7] 层「模式契约」，26 项）
  这一层从**装机产物**里切出模式判定代码，在 vm 里喂两代 `props.mode`，断言落档与回写 id，
  外加形态断言（旧分段控件的渲染特征三处全无、顶栏文档动作没被误删）
- `.setup/check/validate-manifest.js` → 9 通过 / 2 警告 / 0 错误
  （新增 `modes` 校验：2–6 项、id/label 非空、id 不重复；并提示「与 dualView 同时声明 = 预期兜底」）
- 备份：`.setup/editor.tsx.bak-before-v083`；补丁脚本：`.setup/patch-v083-hostmodes.js`（可复核，命中次数断言）


### 图标（`modes[].icon`）—— 已拍板延后，等客户端支持 `modes` 再一次性做

决定：**`dualView` 与 `modes` 两个字段都保持原样，现在不加 `icon`，也不提前做半成品。**
等宿主版本真正认识 `modes` 之后，图标与验证**一次做完**，不留中间态。

理由（两条，都是实测出来的）：

1. **现在加了也看不见。** 装机版宿主（`D:\Notrat\resources\app.asar`，2026-09-22 21:48）
   对 `props.modes` / `modes.map` / `hostModes` / `mode.icon` 的命中数**仍是 0**
   （`.setup/probe-v083-modes2.js`，可复跑）。仓里的 `modes` 目前是**前瞻声明**：
   旧宿主忽略、零副作用，升级后自动生效 —— 这个性质必须保住。
2. **`icon` 有连带风险，得等能验证时再动。** 宿主解析 `dualView` 用的是严格型校验
   （`Array.isArray` + `length===2` + `every(string)`，不合格**整组丢掉**）。
   若 `modes` 的解析器照抄这个风格，`icon` 类型写错可能**连三态一起作废**。
   现在宿主不认 `modes`，写错了在本地也**测不出来** —— 这正是「一起做、一起验」的理由。
   底线仍安全：`dualView` 独立存在，最差退化成现在那两个按钮，不会白屏。

当前状态（已核对，无需改动）：

| 项 | 状态 |
|---|---|
| `manifest.json` → `editors[0].dualView` | `["可视化","源码"]` ✔ 宿主认，出 2 个按钮 |
| `manifest.json` → `editors[0].modes` | 3 项 `{id,label}`，**无 `icon`** ✔ 安全空转 |
| `editors[]` 里是否混进了 `icon` 字段 | **无** ✔（`🧭` / `⚙️` / `✅` 是 `ui` / `fileTreeMenus` 的，与本项无关） |
| `panels/editor.tsx` 有无 icon 渲染的半成品 | **无** ✔（只在 `:552` 读 `props.modes[].id` 判契约代次，不碰 `icon`） |
| 仓库 `manifest.json` ↔ 已部署包 | `dualView` / `modes` 完全一致 ✔（部署包把 `sourceFile` 内联成了 `source`，是宿主安装时的正常行为） |

**再次动手的触发条件**：客户端升级后，用 `.setup/probe-v083-modes2.js` 复扫，
`props.modes` / `mode.icon` 任一非 0 → 说明宿主已认 N 态。届时一次做完三件事：

1. 给三个 `modes` 各加 `icon`（格式以复扫到的宿主解析器为准；同仓库惯例是 emoji，但**以实测为准，不猜**）
2. 重新部署 `~/.notrat/plugins/notrat-latex-plugin.json` + `npm run gate`
3. 装机验证：标签栏出现三个按钮（带图标）、`分屏` 独立成档、`props.mode` 落 `visual|split|source`

在此之前：**不动 `modes` / `dualView`，不动编辑器代码。**


## v0.8.4 — 档位顺序「可视化 | 源码 | 分屏」+ 工具栏导出（PDF / 自包含 HTML，可预览）

### 起因

原话：「可视化|源码|分屏，这样比较好，然后工具栏上可以有个导出，并且支持预览」。

两件事：把三档的**顺序**定下来，以及让编辑器**能把东西交出去** —— 之前只有「🔨 编译」，
它给的是日志文本，产物在哪、长什么样、能不能预览，都得用户自己去找。

### 一、顺序为什么不是审美问题

`modes` 是 N 态契约，**第一项就是宿主给新文件打开的默认档**（校验脚本里那句
「第 1 项为默认档」不是注释，是行为）。所以「可视化」必须排最前 —— 打开一篇论文，
先看到排版结果，比先看到一屏源码更符合直觉。

```json
"dualView": ["可视化", "源码"],                                   // 老契约：2 项固定
"modes": [ {"id":"visual","label":"可视化"},                       // ← 默认档
           {"id":"source","label":"源码"},
           {"id":"split", "label":"分屏"} ]
```

- 编辑器侧**一行没改**：它按 id 认档（`MODE2VIEW` / `VIEW2MODE_N`），顺序只影响宿主按钮的排列。
- 当前装机版宿主仍然**只认 `dualView`**，所以这次顺序变更**在本机看不到任何变化** ——
  两档还是「可视化 | 源码」，分屏仍走 `Ctrl+/`。三档要等客户端认 `modes`。
- 模式表**从装机 manifest 读**（不再写死在测试里）：顺序是会变的东西，写死就变成
  「测试全绿」和「用户看到什么顺序」是两回事。这条断言现在会替我们盯着。

### 二、导出：为什么预览走宿主的 `notrat-open-file`

最省事的做法是插件自己画一个预览弹窗。**没做**，因为那必然多出一个「预览用 HTML / 实际导出文件」
的二义性 —— 两边一旦漂移，预览就是在骗人。改成：

```
导出产物（真文件） ──→ notrat-open-file ──→ 宿主内置阅读器（.pdf 走 pdfjs / .html 走 HTMLViewer）
```

**预览的就是那个文件本身**，不存在「预览一套、导出另一套」。这条路是宿主已有通道，本插件的
「章节大纲」早就在用（`panels/outline.tsx`），不是新发明的私接口。

### 三、HTML 的正文从哪来（两条路，各有取舍）

| 调用方 | 正文来源 | 公式 | 体积 | 什么时候走 |
|---|---|---|---|---|
| 面板（编辑器） | 传 `body` —— 编辑器里那份**已经渲染好的** | KaTeX（与屏幕上逐字一致） | ~340KB | 默认；且带上尚未保存的就地编辑改动 |
| AI / 命令行 | 服务端 `preview-core` 渲染 | miniMath 近似排版 | < 200KB | 没有编辑器在场时 |

面板那份顺带解决一个隐性问题：**导出的是你眼睛看到的那份**，而不是「磁盘上那份」（可能还没有
就地编辑的改动）。导出前照例 `commitWys()` + `onSave()` 先落盘，所以两份也不会打架。

### 四、自包含是什么意思（逐项都验了）

- 图片 → `dataURI` 内嵌，`data-asset` 属性抹掉（否则导出件离开工作区目录就是一堆裂图）
- 公式 → 正文带 KaTeX 标记时才附 KaTeX 样式（**服务端 miniMath 渲染的正文不背这 600KB 字体**）
- 样式 → `PV_CSS` 与编辑器那份**同源**：gate 第 [8] 层把两边切出来，**逐条规则文本**比对
  （只比类名不够 —— 类名一样、值被改过照样是假绿）
- 打开 → DOCTYPE 到 `</html>` 齐全，双击就能开；`@page` A4 与 `@media print` 已就位

### 五、落点

`dest` 只认白名单（`same` / `desktop` / `downloads` / `documents`，非法值退回 `same`），
外加 `out` 指定完整路径。**不认相对路径乱跑** —— 会往用户磁盘写文件的功能，
参数写错不该表现为「文件出现在某个奇怪的目录」。产物已比 `.tex` 新时直接复用（`reused: true`），
所以「预览 PDF」在没改源码时是**秒开**，不会白编一遍。

### 六、这轮踩到的三个坑（都被 gate 抓到了）

1. **服务端少了 `preview-core.js`** —— 导出兜底渲染 `require("./preview-core.js")`，
   而 build 的拷贝清单里没有它（历史上 server 侧确实不需要它，它只被内联进面板）。
   现象是 `Cannot find module`，被第 [8] 层的真实 stdio 调用当场抓住。已加进拷贝清单。
2. **`guessTitle` 的括号配平写错**：`depth` 从 0 起算、`}` 先减后判 → 变成 -1，永远等不到 0，
   于是标题一路吃到 `\author{}`（解析出「基于深度学习的文本摘要研究 张三」）。改成从 1 起算。
3. **锚点全不匹配** —— `panels/editor.tsx` 是**全 CRLF**，补丁脚本的锚点按 LF 写，
   多行锚点一个都命不中（单行能命中，所以前半程看起来是好的）。现在补丁脚本开头先归一到 LF、
   结尾再还原，并在输出里打印实际 EOL。

### 验收

- `npm run gate` → **8/8 全绿**（新增第 [8] 层「导出契约」，**36 项**）
  这一层用**宿主的调用方式**驱动真 server（stdio JSON-RPC），断言的是产物本身：
  落盘位置 / 字节数与返回一致 / 自包含（无 `data-asset` 残留）/ 静态化没吃掉内容 /
  `dest` 白名单不越界 / `format` 非法要明确报错 / 引擎不可用时要给人话（不能崩）
- 模式契约层从 26 → **30 项**（新增：档位顺序、label 非空、`dualView` 仍在）
- 备份：`.setup/editor.tsx.bak-before-v084`；补丁脚本：`.setup/patch-v084-export.js`（server 侧）
  与 `.setup/patch-v084-editor.js`（编辑器侧），都是命中次数断言、对不上就整体不落盘

### 已知边界

- 导出 HTML 是**浅色打印主题**（不跟随应用的暗色主题）—— 拿出去分享 / 打印的东西，浅色更稳妥。
- 服务端兜底路径的公式是**近似排版**（miniMath）；要保真请从编辑器里导（走 KaTeX 那条）。
- PDF 依赖本机 TeX 引擎；引擎不可用时导出返回一条人话而不是崩溃（第 [8] 层专门验了这条）。
- 导出目前只有 PDF / HTML 两种；PNG / 截图类导出未做（需要无头浏览器，不值得为一个按钮引进来）。
- 装机版宿主下，「分屏」档仍然进不去独立按钮（`dualView` 只有二态），`Ctrl+/` 与卡片入口照旧可用。

## v0.8.5 — 没装 TeX 引擎时首屏提示（`latex_env` + 可关提示条 + 已提示记账）

### 起因

「编译 PDF」是全插件唯一一条**有前置依赖**的路：要本机装 TeX 发行版。别的功能都不需要。
但用户没装引擎时看到的只是「点编译 → 一段错日志」，而第一反应是**「插件坏了」** ——
他会重装插件、翻设置、看日志，唯独不会想到「我缺一个 TeX」。这一版就是把这句话在第 3 秒说清楚。

### 一、为什么探测挂在「编辑器挂载」，而不是「插件启用时」

先取证。结论是那条路**当前契约下走不通**，不是懒得做：

- **插件没有生命周期钩子**：`manifest.contributions` 里只有 `editors / ui / fileTreeMenus / settings`，
  没有 `activate` / `main` 之类的入口 —— 插件代码只在「编辑器被挂载 / 面板被渲染」时才执行。
- **MCP 没有推送通道**：服务端其实是第一个知道的人，但它只能通过 `tools/call` 的**返回值**说话；
  宿主不转发 MCP 的 `notifications`，服务端想主动开口，没有通路。
- 于是「服务端知道 → 界面显示」这件事，只能在**界面自己开口问**的时候发生。

编辑器挂载（= 第一次打开 `.tex`）就是这个契约下唯一能主动开口的时机。所以探测放在 `useEffect`，
条件是 `serverId` 就绪；一个实例只探一次 —— `engineProbedRef` **先占位再发请求**：
异步回来的空档里若又打开了第二个 `.tex`，不该再扫一遍 PATH（占位写在发请求之前，不是之后）。

> 这条限制**不是本插件特有**的：任何「服务端想主动告诉界面一件事」的需求，在现宿主契约下都得
> 落到某个 UI 挂载点上。写在这里，省得下次再推一遍。

### 二、触发与防打扰规则

| 规则 | 实现 | 为什么 |
|---|---|---|
| 只在**没引擎**时出现 | `if (dead \|\| !info \|\| info.ok \|\| info.ack) return;` | 有引擎时不打扰；用户点过「知道了」也不打扰 |
| 一个编辑器实例只探一次 | `engineProbedRef.current = true` 放在发请求**之前** | 切档 / 重渲不该反复扫 PATH |
| 跨会话只提示一次 | 服务端状态文件 `~/.notrat/notrat-latex-state.json` | 记账放**家目录**，不落工作区 —— 否则会被同步 / 提交，跟着项目到处跑 |
| 老版 server 没这个工具 | `catch (e) {}` 静默跳过 | 探测失败绝不能让编辑器报错或白屏 |
| 不是常驻控件 | 没引擎才渲染，可关 | 跟底栏「有结果才出现」同一条原则（v0.8.4 刚精简过工具栏） |
| 给的是**出口**，不是一句抱歉 | 「🔄 重新检测」+「知道了」 | 刚装完引擎的人不必重启应用 |

提示条写死的第一句话是：**「未检测到 TeX 引擎，只影响「编译 / 导出 PDF」；编辑、大纲、引用校验、
公式预览、导出 HTML 都正常。」** 这不是客套 —— 不说这句，用户会拿着错结论去排查。

### 三、「知道了」的三个场景（有一个反直觉，所以写清楚）

| 场景 | 行为 | 判断 |
|---|---|---|
| 无引擎 → 点「知道了」→ 重开应用 | ack 保留，**不再弹** | ✅ 要的 |
| 无引擎 → 装了引擎 | 陈旧的 ack 被清掉（但 `ok=true` 本来也不弹） | ✅ 无害 |
| 引擎后来坏了 / 被卸载 | ack 已被清 → **重新提醒一次** | ✅ 要的 |

第二行是验收逼出来的：探测**探到引擎时**会顺手把 ack 清零
（`if (out.ok && engineNoticeAck()) writeState({ engineNoticeAck: false })`）。
本意是「将来引擎没了还能再提醒一次」，代价是「ack 的持久性」只在**没有引擎**的机器上才可观测。
第 [9] 层一开始把这条验反了（在本机断言「ack 写进去要一直在」），测试当场变红 ——
**认下来是断言错了，不是代码错了**，然后把那一整段改成与主机无关的场景。

### 四、探测与编译**复用同一条链**，但缓存只加在探测上

`probeEngine` 内部就是调 `pickCompiler(raw, resolveCompiler)`：设置项 → PATH → 常见安装位置 →
回退链（`tectonic → xelatex → lualatex → pdflatex → latexmk`）。**不另写一套**，否则
「面板说没问题、编译却失败」这种自相矛盾迟早会出现。

缓存只加在探测上（冷探 ~9ms → 命中 0ms）：

```js
probeEngine()   // 命中 _engineCache 直接返回
compileTex()    // 仍然直接调 pickCompiler，不缓存
```

编译路径**一行没动**。因为缓存会撒谎：用户装完引擎，缓存里那句「没找到」还会让下一次编译白失败一次。
所以 `action=reset`（面板上的「🔄 重新检测」）只清探测缓存。

### 五、说的是实话：探测 ≠ 可用

`probeEngine` 只做存在性检查（`fs.accessSync`），**不 spawn `--version`**。所以对外文案一律是
「**检测到 / 未检测到**」，从不说「编译可用」—— 把谎报从编译期挪到启动期毫无意义。

引擎确实是**本机文件**、不需要用户配 PATH 的那些位置都会探（`~/.notrat/tools/bin`、winget shims、
scoop shims、`.cargo/bin`、`C:/Program Files/MiKTeX/...`、`C:/texlive/{2023,2024,2025}`），
所以提示条上那句「装好即用、无需配 PATH」是能兑现的。安装命令按平台给（`installHint`）：

| 平台 | 命令 |
|---|---|
| Windows | `winget install MiKTeX.MiKTeX`（或 https://miktex.org/download） |
| macOS | `brew install --cask mactex-no-gui`（或 https://tug.org/mactex/） |
| Linux | `sudo apt install texlive-full`（最小可用：`texlive-xetex texlive-latex-recommended`） |

**不替用户下载 TeX 二进制** —— 给一条能直接粘的命令，比自己做一个下载器诚实。

### 验收

- `npm run gate` → **9/9 全绿**（新增第 [9] 层「引擎自检」：`.setup/check-v085-env-banner.js`，**56 项**）
  这一层钉三件事：**该弹才弹 / 只弹一次 / 说的话是实话**。
  - 触发条件**不是照抄一遍**：从装机产物里把 guard 表达式抠出来 `new Function` 求值。
    源码改了条件这里先红。5 个判定场景：没引擎且未提示过 → 弹；有引擎 / 已 ack /
    返回 null（老版 server）/ 组件已卸载（异步回来晚了）→ 不弹。
  - **与主机无关**：清空 `PATH` + 抠掉源里写死的 `C:/Program Files/MiKTeX/...` + `homedir` 指向临时目录，
    再决定要不要往那个假家目录里放一个假 `tectonic.cmd`。换台装了 MiKTeX 的机器跑，结论一样。
  - 真 server（stdio JSON-RPC，即面板的真实路径）：`tools/list` 里有 `latex_env`、探测**不写盘**、
    `action=ack` 才写、状态文件落 `~/.notrat/` 下、无引擎分支返回
    `ok:false / code:NO_ENGINE` + 完整回退链 + 可粘安装命令、**不抛异常**。
    跑完**不留痕**：状态文件与假家目录都还原（本层进出各备份一次）。
- 无引擎分支实测输出：
  `{"ok":false,"code":"NO_ENGINE","tried":["tectonic","xelatex","lualatex","pdflatex","latexmk"],"installHint":"winget install MiKTeX.MiKTeX"}`

### 一个操作事故（必须交代）

改 `panels/editor.tsx` 时用了 `sed -i`，它把文件里的 **CRLF 全吃掉了**（2116 行纯空白变更，
而这个仓库没有 git 当安全网）。用补丁前的备份做了逐行 diff 还原并核对：净增 71 行、
**删除行只有 1 行**（就是版本号那行），确认没夹带空白损伤。还原脚本留在 `.setup/_fix-crlf.py`。
教训：`panels/editor.tsx` 是**全 CRLF**，补丁脚本的锚点要按实际 EOL 写、写完要核对行尾 ——
这条在 v0.8.4 已经栽过一次，这次是栽在 `sed` 而不是 Python 上。

### 已知边界

- **探测只查文件在不在，不代表能编译成功**（见上「五」）：缺宏包 / 缺字体要到编译时才暴露。
- 提示条**不会自愈**：装好引擎后要用户点一下「🔄 重新检测」（或重新打开 `.tex`）才会消失 ——
  没有文件系统监听，也就没有「装完自动消失」这件事。
- 「已提示过」记在**本机家目录**：同一台机器上多个用户 / 多套配置共用这一个记账；换机器会重新提示一次。
- 提示条**没做渲染测试**：工作区没有 react 依赖，不为它装一个。第 [9] 层验的是「决策条件 / 文案 /
  工具契约 / 真 server 往返」，渲染本身由第 [7] 层模式契约与第 [4] 层真 DOM 往返间接看护。
- 只自检「**有没有**引擎」这一件事。**引擎装了却跑不起来**（DLL 缺失、镜像拉不到包）不做检测 ——
  要检测就得真跑一次编译，那不叫自检，叫「开机先编一篇论文」。


## v0.8.6 — Typora 键位铺满编辑器（20 条格式快捷键）+ 插入菜单可发现性

### 起因

原话：「支持各种快捷键，和 Typora 的使用体感一致」。

先看现状：编辑器里只有 `Ctrl+S`（保存）、`Tab`（缩进）、`Ctrl+/`（切视图）三条键盘通路。
更要命的是 `insert(text, back)` —— 它**只会「用一段文本替换选区」**，没有「包住选中的字」
这个动作。于是「选中一段话 → Ctrl+B → 变成 `\textbf{选中的话}`」在这份源码里根本没有通路：
要么手打命令名再手动把字括进去，要么用「＋ 插入」菜单插个空模板再自己挪内容。

Typora 的体感恰恰建立在这类动作上。所以这版补的就是它。

### 一、键位怎么选：照 Typora 抄，动作落成 LaTeX

不自创一套。写过 Markdown 的人手上已经有的记忆，直接搬到 LaTeX 上：

| Typora 里是 | 这里落成 |
|---|---|
| `Ctrl+B / I / U` 加粗斜体下划线 | `\textbf{}` / `\textit{}` / `\underline{}` |
| `Ctrl+K` 链接 | `\href{}{}` |
| `Ctrl+M` 行内公式 | `$...$` |
| `Ctrl+Shift+M` 公式块 | `equation` 环境 |
| `Ctrl+T` 表格 | `table` + `tabular` 骨架 |
| 标题 1–5 级 | `Ctrl+1`…`Ctrl+5` → `\section` … `\subparagraph`（LaTeX 本就没有第 6 级，按 `Ctrl+6` 不会有东西） |
| `Ctrl+0` 恢复正常段落 | 去掉行首的章节命令 |

（完整 20 条见上面「功能 → 快捷键」。）

### 二、核心机制：一个模板 + 两个标记位

`insert()` 没法「包住」，所以新增 `expandTpl(tpl, sel)`：模板里用两个控制字符占位，

- `\u0000` = **选区内容**落点
- `\u0002` = **光标**落点

两种形态各一份模板：`e`（无选区）与 `s`（有选区）。于是

```js
{ k: "b", e: "\\textbf{\u0000}",       s: "\\textbf{\u0000}\u0002" }   // 加粗
{ k: "k", e: "\\href{\u0000}{}",       s: "\\href{\u0002}{\u0000}" }   // 链接：有选区时选区当显示文本、光标回 URL
```

- 无选区：`\textbf{}`，光标落在 `{}` **中间**（`\u0000` 位置就是空位）
- 有选区：`\textbf{选中的话}`，光标落在 `}` **之前**（`\u0002` 指定的位置）

两个标记都**先摘掉再算偏移**，避免边改边算。`Ctrl+K` 那种「选区放后面、光标进前面」的顺序
也由同一套逻辑处理，不用为它写特例。

### 三、章节层级不是「插命令」，是「改这一行」

`Ctrl+2` 若只是插一个空的 `\subsection{}`，那跟菜单没区别，省不了手。做法是：

- **有选区** → 直接包住：`\subsection{选中的话}`
- **没选区** → 取**当前整行**当标题，整行替换成 `\subsection{原标题}`
- 该行**已经是**章节命令（`HEAD_RE` 认 7 种 + 带 `*` 版）→ **只换命令、保留标题**

第三条是关键：`Ctrl+1` 写完一级标题，发现该降级，按 `Ctrl+2` —— 层级变了、标题一个字没丢，
不用先删 `{...}` 外面那层。跟 Typora 改标题级别的动作一致。

### 四、为什么只在源码 / 分屏生效

预览区是**块级就地编辑**：点哪改哪，提交时只回写被改过的那几块行区间（v0.7.0 的「方案 A」）。
在那里按 `Ctrl+B` 如果往 DOM 里塞个 `<b>`，回写时它会被当成正文 —— 等于往 `.tex` 里灌 HTML。
所以预览区一概不接管，格式操作走菜单或切到源码视图。

同理，接管前会确认**焦点确实在源码输入框**（`document.activeElement === taRef.current`）
且当前视图含源码 —— 否则放行，不做任何拦截。

### 五、让快捷键「看得见」（不然没人知道有）

快捷键最大的问题是**发现不了**。所以：

- 「＋ 插入」菜单改成三组（格式 / 环境 / 引用），每项**右侧标出对应键位**
- 这些标注**不是手写的**：`check-v086-keys.js` 会拿每条标注去 FMT 表里查实现，
  查不到就红 —— 防的是「菜单写着 `Ctrl+T`、按下去什么都没发生」这种最伤信任的错
- 菜单项加了 hover 高亮与键位胶囊样式（`UI_CSS`，与文档样式 `PV_CSS`/`WYS_CSS` 分开：
  那两个描述**文档**长什么样、会被导出对账脚本逐条比对，混进去只会让对账语义变脏）

### 六、顺手修掉的验收债：172 项静默缩水成 103 项

查这版改动时跑了主验收，发现它报 **103 通过 / 4 失败**，而 README 一直写着 172 项。
逐条查下去，**4 项全是验收脚本自己的毛病**（已用 v0.8.5 的 `editor.tsx` 做过 A/B 对照，
确认与本次功能改动无关）：

| 报错 | 真因 |
|---|---|
| `editors[0].source ≡ panels/editor.tsx` | 脚本只内联了 `__LPC__`，**没内联 `__WYS__`**（v0.7.0 引入的第二块内联）→ 断言恒假 |
| `latex-server.js ≡ server/index.js` | build 会按 `manifest.version` **改写 VERSION 行**（顺带抹掉行尾注释），逐字节比必然不等 |
| `test-activefile.js` 直接崩 | 它按**代码片段**抠取时用的锚点按 LF 写，而 `editor.tsx` 是 CRLF（`"\n  }, 120);\n}\n"` 碰不上 `"\r\n…"`） |
| `test-nav.js` 直接崩 | 假 DOM 节点缺 `querySelectorAll`，就地编辑那层扫 `.wys-blk` 时 TypeError 掀掉整个 harness |

修法是**让比较方式对齐实现**，不是放松断言（`__WYS__` 那条修完反而更严：两块都查）。
顺带把 `check-v085` 里写死的 `0.8.5` 换成「与工作区 manifest 比较」——版本号写死在验收里，
每发一版都得来改一次，而改的人多半只想把它改「绿」。

崩溃修好后 `test-nav` 又露出 **10 项恒假断言**，也一并修了：

- **C 节 8 项**：测试只调了 `render()` 却**没切视图**，`hA` 始终是 wysiwyg，textarea 当然挂不出来。
  v0.8.3 起档位开关搬去了宿主标签栏、编辑器内没有按钮可点，所以「切视图」只能是改 `props.mode`。
- **H 节 2 项**：断言 `todo` / `pos` 两类状态栏条目，而 `editor.tsx` 现在只推 `sec / env / cite / issue`
  —— 测的是不存在的东西。改成**白名单校验真实集合**（有人在集合外新增条目就红）。

结果：**103 通过 / 4 失败 → 207 通过 / 0 失败**（其中 13 项是 `test-nav` 恢复正常后被重新计入的）。这比多加 20 条快捷键更要紧 ——
验收缩水意味着 68 项覆盖在无人察觉的情况下消失了。

### 验收

- `npm run gate` → **10/10 全绿**（新增第 [10] 层「格式快捷键」：`.setup/check-v086-keys.js`，**39 项**；v0.8.7 起扩到 **57 项**）
  这一层从**装机产物**里把 `INSERT_GROUPS … HEAD_RE` 那段模块级代码抠出来求值（不照抄源码），钉四件事：
  - 表自洽：键位无冲突、每项都有可执行动作、章节层级 6 档齐全
  - **菜单标注的键位 ↔ FMT 表一一对应**（防「标了没做」），反向也查「注释里承诺的都实现了」
  - `expandTpl` 的展开**手算期望值**逐条比（`\textbf{}` 光标在 8、`\textbf{abc}` 在 12、
    `\href{}{论文}` 光标回到 6 …… 含「选区里带 `\alpha` 也原样落进去」）
  - 不劫持既有键：`Ctrl+S` / `Ctrl+/` / `Tab` 都不在表里，且放行逻辑在源码里看得见（不是碰运气）
- 主验收 `verify-v052` → **207 项全绿**（原 103）。`test-nav` 也补上了 v0.8.6 的**端到端**一节：
  真渲染编辑器 → 真派发一次 `keydown` → 断言内容与光标落点（`Ctrl+B` 包住选区、
  `Ctrl+1` 整行升级、`Ctrl+M` 光标进 `$$` 中间、`Ctrl+S` 原样放行、焦点不在时一概不接管）

### 已知边界

- **只在源码 / 分屏视图生效**，预览区不接管（见上「四」）。菜单是等效入口。
- 快捷键在**根节点捕获阶段**接管，比组件内部的键盘处理早；但宿主若在外层也捕获同一组合键
  （例如 `Ctrl+1` 切标签页），宿主会先拿到。菜单入口照旧可用。
- `Ctrl+Shift+`` ` `` 那一项用 `code === "Backquote"` 匹配（Shift 会把它变成 `~`，`key` 不可靠）。
- **可视化视图没有格式快捷键**。它是块级就地编辑，正文改字走「点哪改哪」，不引入富文本语义 ——
  这样源码里永远不会因为一次快捷键操作多出 HTML 标签。
- 没做「键位自定义」。默认键位对齐 Typora 是这版的目标；等真有人要改再说。
## v0.8.7 — 修「有些快捷键能用、有些不能用」+ `Ctrl+/` 回不到原来那一档

用户原话：「你的快捷键能用啊，但是有些不能用」，随后给出三条可复现的描述：
源码框里按 `Ctrl+1` 不行 / 切到源码模式再切回来有问题 / `Ctrl+/` 不能来回切换。
三条都能复现，根因是两个 —— 都在插件自己这边，不在宿主。

### 一、键位匹配只看 `e.key`（「有些能用」的真实形状）

`.setup/_probe-fmt-keymatrix.js` 把 20 条键位喂进真实事件形态（浏览器在对应场景下真会给的
`e.key` + `e.code`），跑出来是：

| 布局 / 输入法 | 只看 `e.key`（v0.8.6） | 加物理键位兜底（v0.8.7） | v0.8.6 哑掉的 |
|---|---|---|---|
| US 英文 | 20/20 | 20/20 | — |
| 中文输入法组字中 | **7/20** | 20/20 | 13 条字母键（`Ctrl+B/I/U/K/M/T` + `Ctrl+Shift+M/K/Q/I/U/O/L`） |
| FR-AZERTY 数字行 | **14/20** | 20/20 | `Ctrl+1`…`Ctrl+5`、`Ctrl+0` |

**7/20 正是「有些能用、有些不能」**：数字键与反引号活着，字母键全死。
原来只有反引号那一项走了 `e.code`（注释里已经写明「Shift 会把它变成 `~`，key 不可靠」），
但另外 19 条仍是纯 `e.key` —— 同一个坑只填了一个角。

修法不是换键位，而是加**第二判据**：`e.key` 先比，不中再比 `e.code`（`KeyB` / `Digit1` …）。
物理键位与输入法、布局无关；因为 `e.key` 排在前面，**US 英文下的行为逐字节不变**，
只是「本来会哑掉的那一半」多了一条通路。`onCtrlSlash` 同样补了 `e.code === "Slash"`
—— 输入法组字中 `Ctrl+/` 也会被报成 `"Process"`，这条不补就是「`Ctrl+/` 不能来回切」的另一半原因。

### 二、`lastPvView` 的记忆被自己写进宿主的回抛覆盖

装机版宿主只认 `dualView`，它的「可视化」是**笼统的一侧**（分屏 / 纯预览都算），
所以「上次停在分屏还是纯预览」只能由插件自己记。原实现在同一个 effect 里**先写记忆、再读记忆**：

```
if (v !== "src") lastPvView.current = v;                           // ← 这一拍就把记忆覆盖成 "preview"
if (!nMode && v === "preview" && lastPvView.current === "split")   // ← 于是永远不成立
```

症状：分屏 → 源码 → 回可视化**掉进纯预览**，而且从此再也回不到分屏（记忆已被污染）；
`Ctrl+/` 走同一条路，所以表现为「不能来回切」。顺序反过来即可。
初值也从 `"split"` 改成 `null`（＝「还没记忆」）—— 填 `"split"` 会把 mount 那一拍宿主下发的
可视化档误判成「上次停在分屏」，首屏直接落分屏（这个是在修好顺序之后才暴露出来的第二个问题）。

### 三、连带修掉的三处（都在同一批探针里露出来）

- `applyHead` 原本没有守卫：`\documentclass[12pt]{ctexart}` 会被整行包成 `\section{...}`（毁导言区），
  带行尾 `%` 注释的行匹配不上 `HEAD_RE`，于是**连注释一起吃进标题**。现在：剥注释再判断、
  以 `\` 开头却不是章节命令的行**明说「不接管」**（红色 toast），而不是默默什么都不做。
- 内容「改了等于没改」时（例如已经是 `\section` 的行按 `Ctrl+1`）React 会 bail out，
  `[content]` effect 不跑 → 光标不归位。新增 `writeSrc()`：内容相同就当场 `focus + setSelectionRange`，
  不再等重渲染；模板插入与章节层级两条路都收敛到它，行为一致。
- **验收层自己有一条恒红的断言**：正则里 `"\\{"` 要求源文本出现「反斜杠 + `{`」，
  而代码里是 `"{"` —— 它跟代码对不对无关，永远红。`_probe-re2.js` 留了证据
  （原样 false、改正后 true，产物与源码一致）。恒红的断言会训练人忽略红，这比少一条断言更糟。

### 验收

- `npm run gate` → **10/10 全绿**；第 [10] 层「格式快捷键」从 39 项扩到 **57 项**
- 新增第 [9] 段：20 条键位在 US / 输入法 / AZERTY 三种事件形态下**逐条命中它自己**
  （命中别人也算错），并留两条**反证** —— 没有兜底时命中数必须明显更少
  （IME `7 < 20`、AZERTY `14 < 20`）。反证是为了证明矩阵不是白写的
- `.setup/_probe-interact.js`：症状 1（`Ctrl+1` 八种行形态）、症状 2（分屏→源码→可视化 = `split`）、
  症状 3（`Ctrl+/` 往返 A/B/C/E 四组 × 4 次）逐条复现并转绿

### 已知边界（补两条）

- 物理键位兜底解决的是「事件报上来的 key 不是那个字符」；**输入法把整个事件吞掉**
  （连 `keydown` 都不派发到页面）仍然无解 —— 那时得先把输入法切到英文 / 半角。
- 仍然**没有「键位自定义」**。键位对齐 Typora 是这版的目标；宿主也没有给插件留注册键位的贡献面，
  所以插件的键位不会出现在宿主「设置 → 快捷键」里（`.tex` 的键位是编辑器自己挂在根节点上的）。

## v0.8.12 — 正文连成一篇、光标回接真的生效（修「Ctrl+1~6 一按就失焦」）

**症状**：可视化档里打字没事，但一按 `Ctrl+1~6` 改章节层级（以及撤销、宿主侧改内容），
光标必丢，得重新点一次才继续写。

**根因（一行）**：`wysCaretRestore` 里 `createTreeWalker(part, 3)` 把 `whatToShow`
写错了 —— `NodeFilter.SHOW_TEXT = 4`，3 是 `ELEMENT|ATTRIBUTE`。walker 只吐元素节点，
`n.nodeValue` 是 `null`，`null.length` 当场抛 `TypeError`、被函数的 `try/catch`
静默吞掉 ⇒ 「整层重建后按块 id 回接光标」**从来没成功过**。打字路径
（selfEdit 不重建）绕开了这条断链，所以只有结构性动作会失焦。

**修法**：`whatToShow` 改 4（`SHOW_TEXT`），注释写明来龙去脉；原子岛不必特意跳 ——
快照侧 `Range.toString()` 与回接侧的文本节点推进口径一致，偏移对得上。

**配套（本版同一次交付的可视化档编辑性）**：

- 整篇正文只有一个编辑宿主（`.wys-editroot`，contenteditable=true）——块不再是
  一张张卡片（用户原话「按块的格式感很重」），块间光标自由流动；
- 自己提交的改动**不重建** DOM；从别处来的改动重建前后按「块 id + 块内文本偏移」
  回接光标（`wysCaretSnapshot` / `wysCaretRestore`）；
- 回车插 `<br>`（`wysDomToTex` 本来就有还原分支），Ctrl+S 回写不再铲光标。

**门禁**：`check-v0811-edit.js` 新增「快照读回 → 甩哨兵 → 回接 → 宿主重新拿焦点」
jsdom 断言 + 回归钉（产物里 `createTreeWalker(part, 4` 在、`createTreeWalker(part, 3` 不在）。
验收门 14/14 全绿。

## v0.8.13 → v0.8.15 — 多行段落转层级 / 同层级再按一次=还原 / 预览档可撤销

**v0.8.13 多行段落转层级，修「这一块有 3 行」的假警报。** LaTeX 段落天然是多物理行的
（单换行=空格，空行才分段），可视化档把整段聚成一个块，旧版按源码行数一票拒绝 ——
用户明明只看到一行段落。现在段落块整段并成一行再转层级（`join(" ")` 语义无损），
`applyEdits` 区间放宽为 `[s..endLine]`；多行公式 / 环境依旧拒绝，文案改准确。

**v0.8.14 同层级再按一次 = 取消层级（toggle）。** 按惯例（Word / Notion 同款）：
`\section{A}` 上再按 Ctrl+1 → 还原为正文 A（星号变体同算），再按又套回，往返无损；
不同键仍是换层级。源码档与可视化档两条路径同步。顺手修：`}` 与 `%` 之间的空格
在换层级 / 还原后不再被 `HEAD_RE` 的 `\s*$` 吃掉。

**v0.8.15 预览档可撤销 / 可重做（源码级栈）。** 之前只有「就地写回」能撤一步
（单槽快照 + 提示条 ↩），Ctrl+1..5 的层级切换在预览档撤不回去；而 contenteditable
的原生 Ctrl+Z 回退的是 React 重渲染**前**的 DOM 快照，放行一次 DOM 就与源码脱节
（v0.8.14 已拦截）。现在预览层自己产生的每一步改动（就地写回 / 层级切换 / 原子卡片
改写）落盘前都把改前整份源码压栈：**Ctrl+Z 逐步撤销，Ctrl+Shift+Z / Ctrl+Y 重做**，
提示条 ↩ 与键盘同一条通路；栈深 50、空操作去重。外部改动（宿主 / 大纲 / 源码档）
一到，整条链作废 —— 撤销是整份源码还原，链上任何一环对不上现实，还原出来就是乱串，
所以宁可少撤，不可撤错。

### 验收

- 撤销 / 重做专项 17 项 ✓（逐字节还原、重做链作废、外部改动清栈、去重、封顶、
  toggle 联动、链上每步 parseDoc 自检）
- `wysiwyg.test.js` 59 项 ✓、v0.8.13 多行段落 ✓、v0.8.14 toggle 12 项 ✓
- `npm run gate` 各层 59 / 35 / 30 / 30 / 34 / 34 / 55 全绿 ✓
- 装机产物 v0.8.15 断言 15 项 ✓

### 已知边界

- 撤销 / 重做只覆盖**预览层自己产生的改动**；源码档打字与宿主侧修改仍走源码档的
  Ctrl+Z（宿主提供）。两边不混栈 —— 混了就会出现「撤一步回到十步前」的乱串。
- 预览档栈空时按 Ctrl+Z 会明说指路，绝不静默放行。

## v0.8.16 — 「以 \ 开头」守卫放行正文段落（只拦命令块）

**问题。** 可视化档章节快捷键的守卫对「以 `\` 开头」一刀切。但 `startsStructure`
只拦结构命令（`\begin` / 章节命令 / `\maketitle` / `\newpage`…），普通段落完全可以
以行内命令开头——`\textbf{注意}：本文…`、`\LaTeX{} 是排版系统…`、自定义宏——
它们在 `parseDoc` 里就是 `type=paragraph, editable=true` 的正文块，预览里能点进去
直接写。用户站在正文上按 Ctrl+1，却被回「这一行以 \ 开头（不是正文）」——
和 v0.8.13 的「3 行」假警报同族：守卫把两套概念弄混了（源码物理行的开头 ≠ 块的身份）。

**修法。** `applyHeadWys` 提前取块身份 `isPara = data-type === "paragraph"`：
以 `\` 开头的**段落块**放行（能落到 paragraph 的以 `\` 开头内容必是行内标记，
包成章节命令是合法 LaTeX）；**命令块**（`\maketitle` / `\end{document}` 这类）
不是段落，依旧拒绝、文案不变。源码档无块身份可用，守卫原样保留。

**样例核对**（探针逐块判定 `samples/sample.tex`）：全篇会弹这条提示的只有
`\maketitle`（L9）与 `\end{document}`（L60）两个非正文块——在那两处拦截是正确的；
七个正文段全部放行。

### 验收

- 专项 8 项 ✓（`\textbf` 跨行段落 → 标题全文完整、`\LaTeX` 单行段落放行、
  Ctrl+0 还原逐字节等于原行、`\maketitle` 仍拒、sample.tex 拒绝清单复核、源码档守卫不动）
- `wysiwyg.test.js` 59 项 ✓、`npm run gate` 14/14 全绿 ✓（含新增 v0.8.16 产物断言）
- 装机产物 v0.8.16 断言 7 项 ✓（v0.8.13/14/15 修复一个不丢）

## v0.8.17 — 撤销 / 重做先落地「还没写回源码的打字」

**问题。** v0.8.15 的源码级撤销栈只记**已落盘**的预览层操作（就地写回 / Ctrl+1..5 /
原子卡片改写），而正文打字要等焦点离开 / Ctrl+S 才 commit。于是刚打完字就按
Ctrl+Z：栈里没有这步——要么弹「预览档没有可撤销的改动」（字明明是刚打的），
要么撤掉**更早的旧步骤**、同时 `wysEditing` 复位让 DOM 重建把没落盘的字一并
静默丢掉。用户读作：撤销坏了。

**修法。** `undoWys` / `redoWys` 入口先过 `wysCommitPending()`：把未落地的打字
commit 成一步历史再撤——撤掉的正好是「刚才这串字」。两个连带坑一起堵：

1. `commitWys` 落盘会置 `wysSelfEdit=true`（「DOM 是权威，别重建」），撤销恰恰
   相反（整份源码还原 + DOM 重建）——不复位的话 DOM 里还是刚打的字、源码已退
   回去，两边脱节（v0.8.14 事故同款）。→ `wysCommitPending` 里复位 selfEdit。
2. 组合路径下闭包 `content` 还是打字前的旧值（React 尚未渲染），redo 栈若压它，
   Ctrl+Y 会「重做」回打字前 = 等于没做。→ undo 用 `commitWys` 的返回值压重做栈。

**顺手修：gate 探针的样例行号动态化。** `samples/sample.tex` 是用户可编辑的活
文件（这次用户删了一行，写死的「第 26 行 / L16 / 60 行」立刻脆断）。三处断言
（`_probe-edit.js` / `test-nav.js` / `check-v080-flat.js`）改为运行时定位
`\subsection{模型结构}` 与块自身的 `data-s`——样例怎么编辑，gate 测的都是同一
个本意：「锚点操作落到正确的目标行」。

### 验收

- 专项 23 项 ✓（旧逻辑双症状复现钉死、打字后 Ctrl+Z 逐字节回到打字前、
  selfEdit 复位 → DOM 重建、不清栈、Ctrl+Y 恢复的是 commit 结果、逐步落盘撤销
  不串位、空编辑不凭空多撤、未落盘输入废旧重做 = 标准语义）
- `wysiwyg.test.js` 59 项 ✓、`npm run gate` 14/14 全绿 ✓（含 v0.8.17 产物断言）
- 装机产物 v0.8.17 断言 9 项 ✓（v0.8.13/14/15/16 修复一个不丢）

## v0.8.18 / v0.8.19 — 撤销历史接进 txlog（修「我输入了内容再撤回，提示我预览档没有撤回的」）

**用户原话。**「我输入了内容再撤回，提示我预览档没有撤回的」

**先复现，再改。** 新开一层行为级探针（`.setup/check-v0818-undo.js`：真渲染 + 真派发事件 +
读 toast 与落盘源码），7 条场景跑下来，三条真红 —— 而且都长着用户的同一张脸：

| # | 场景 | 改造前 |
|---|---|---|
| 3 | 打完字 → 去源码档看一眼再切回来 → Ctrl+Z | ✗ 历史被清空，弹「预览档没有可撤销的改动」 |
| 4 | 打完字 → 宿主在**别的块**上改了一处 → Ctrl+Z | ✗ 同上（外部改动落在别处也要清空，纯属误伤） |
| 7 | 打完字 → 切走主区标签（宿主**卸载组件**）再回来 → Ctrl+Z | ✗ 同上 |

三条指向同一个东西：历史是**「一串整份源码快照」+ 一句 `if (!selfEdit && !histOp) 清栈`**
（v0.8.15 的实现）。它判的是「这拍谁写的」——布尔标志误判一次（预览层卸载重挂、宿主回传、
外部同步回来）就把用户历史整条抹掉；而组件里的 ref 又活不过一次「切主区标签」
（宿主契约：切主区标签会卸载组件）。**字还在，历史没了** —— 用户读作「撤销坏了」。

**改法（v0.9 方案里 P2→P3 的第一步；只换历史，不动 DOM 重建路径）。**
历史换成 txlog 的 `TX.History`（`server/txlog.js` 走 `/*__TX__*/` 占位符内联进产物）：

1. **外部改动 → `rebase` 重映射，绝不整条清栈**。只有真冲突（外部动了同一处）才丢那一条，
   `gaps++` 并**弹出来**（「更早的 N 步已与磁盘版本分叉，无法撤销」），不静默。
2. **判据从「这拍谁写的」换成「源码真的变了没有」**：切档 / 重挂（源码没变）什么都不做。
3. **历史按文件留在模块级**（`WYS_HIST_BY_FILE`：上限 8 份文件、每份 50 步）——活过组件重挂；
   换文件按路径分家，A 的撤销链不会套到 B 上。
4. **撤销 / 重做只向 History 要凭据**（`tx.before` / `tx.after`），调用方不再自己存「改后状态」；
   同一次事件里的写回基准改用 `wysBase()`（历史眼里的当前文档），不再取可能过期的闭包 `content`。
5. **撤不动时把话说清**：「已经撤到这一步了（到底了）」与「这一档还没有历史」分开说 ——
   混在一句里，刚打完字的用户只会读成「我白打了」。后者还会告诉他：源码档里敲的字由源码档自己撤。

**先红后绿。** 把 `wysHistFor` 的查表临时改成恒返回新历史（等价于改造前），场景 7 立刻回到
用户报的那句话；恢复后全绿 —— 这条测试是有牙齿的，不是把现象写进断言。

### 验收

- 新层 `.setup/check-v0818-undo.js`：**7 条行为场景 19 项 ✓ + 产物指纹 17 项 ✓**
- `npm run gate` **16/16 全绿**（新增本层；并把 v09-docmodel / v09-txlog 两块地基也接进闸门 ——
  预览层现在依赖 txlog，它坏了整条撤销就坏了）
- v0.9 基线：**B1「撤销一步不该连带抹掉别处的改动」已消灭**（照新链路 txlog + rebase 重跑；
  断言没改，改的是它模拟的实现），剩 B2 / B3 两个靶子（等 P3 的定点 patch 与新内核 API）
- 装机产物 v0.8.19：TX 内核已内联 + 12 条实现指纹 + 3 条反向断言 ✓

### 已知边界（留着下一步做）

- **源码档里敲的字，预览档撤不了**（v0.9 方案的 P4：源码档接进同一套历史，「A 档改 → B 档撤」）。
  现在预览档会明说这句话并指路，不再假装能撤。
- 打字仍是「失焦 / 按 Ctrl+Z 时落成一条事务」（v0.8.17 的行为）。txlog 的 `coalesce`
  （每键一条、400ms 封口）留给 P3 一起接：那要先评估「每键按块读 DOM」的成本。
- DOM 仍是「整份重建 + 启发式接光标」（基线里的病灶 3），P3 的 keyed patch 才能拿掉它。

## v0.8.20 — 块外的字：光标停在块外时敲的字，不许静默丢

**用户原话。**「还是不行，刚输入就撤销说没有内容可以撤销」

**先复现，再改（这次的关键是「复现工具本身要够真」）。** 前面两层探针都没能拦住它：

- `.setup/_test-v0817-typing-undo.js` 是把逻辑**抄一遍**再跑（用 `domTex` 字符串代替 DOM）——
  抄错了照样绿，等于测「我对组件的理解」而不是组件；
- `.setup/_probe-undo.body.js`（v0.8.18 那层）跑的是真组件，但块树是**手搓的假树**：
  只有 `paragraph`、文本就是 `b.raw`、没有原子（`\cite` → `[1]`）、没有标题、没有导言区，
  更没有「块外」。于是只测到「在正文块里打字」**这一种姿势**。

新开一层 `.setup/_probe-undo-real.js`（由 `_mkprobe-undo.js` 组装：harness 复用 `_probe-edit.js`
前半段 + 编译前注入一个 `__probe` 出口，能直接读那条历史的 `stack/cursor/state`）：

- 把 wys 渲染出的**真 HTML** 交给 **jsdom 真解析**，用真节点当块树 ——
  原子、标题、自动编号、块与块之间的空隙，全都是真的；打的是真文本节点；
- `__probe` 出口让「这一下到底有没有落成事务」不必靠猜。

13 组姿势跑下来，**红的是这一组**（与用户那句话逐字对应）：

| 姿势 | 改造前 |
|---|---|
| 打字落在**块与块之间的空隙**（编辑宿主上） | ✗ 字符在 DOM 里看得见，块模型一个字都不记 → Ctrl+Z 弹「预览档没有可撤销的改动」 |
| 打字落在**正文之后的留白**（最后一个块之后） | ✗ 同上 |
| 打字落在**页首那块只读渲染区**（标题 / 作者 / 宏包标签旁） | ✗ 同上 |
| 在正文块里打字（段落 / 标题 / 含 `\cite` 原子的段落） | ✓ 正常（v0.8.17/18 的修复一直生效） |

**根因。** 预览层整篇只有一个编辑宿主（`.wys-editroot`），宿主的**空白处也能落光标**；
而 `commitWys` 是「按 `.wys-blk` 读」的 —— 落在块外的字既进不了源码、也进不了撤销链，
下一拍 `innerHTML` 重建（切档 / 宿主回传 / 任何结构性动作）就把它们**静默吃掉**。
用户看到的是：字明明刚敲上去，撤销却说「没有记下任何改动」。

**修法（三层，一层比一层退让）。**

1. **让光标停不到块外**（正解）：点空白处 → 光标送进**最近的正文块**
   （点正文下方 → 落在最后一段末尾，与 Word 同一种手感；点最上方 → 落在第一块块首）。
   落点是纯函数 `wysPickNearestBlock(cands, y)`，可单测；拿不到坐标就**什么都不做、也不抢这次点击**
   （绝不吞掉一次点击）。点正文里一律不抢 —— 选区与「划词引用」都要它。
   页首那两处只读渲染（`.wys-front-head` / `.wys-front-meta`）顺手关掉可编辑性：它们本来就是
   「点某项开就地编辑器」的渲染结果，不该是可写区。
2. **收得住**：`commitWys` 落盘前先 `wysFoldOrphans(root)` —— 把块外的字并进**最近的正文段落**
   （只认段落：并进 `\end{document}` 后面会让字从排版结果里消失，并进 `\section{…}` 等于把一段话
   塞进标题）。并了几处会在提示条里说清楚，绝不悄悄动。
3. **实话实说**：真的无处可归（全篇没有正文段落）时，一个字节都不动，撤销提示改成
   「刚敲的字不在任何正文块里……」—— 不再说那句会被读成「我白打了」的
   「预览层还没有记下任何改动」。

**两个自己踩的坑（都在探针里现形，一并记下来）。**

- `wysDecoration` 判类名用 `indexOf("wys-edit")`，命中了 **`wys-editroot`**（整篇唯一的编辑宿主）——
  宿主被当成装饰、整棵子树跳过，块外字一处也认不出来，折叠与实话提示**全哑**。改成**类名按
  token 精确比**（`" wys-edit "` 才算）。
- 「光标落点集」与「折叠收容集」一开始混成一个常量：折叠只能进段落，光标落点却应当
  **段落 + 标题**都算（点标题旁的空白，用户多半就是想改那个标题）。拆成
  `WYS_FOLD_BLOCK` / `WYS_CARET_BLOCK`。

### 验收

- 新层 `.setup/check-v0820-orphan.js`（已接进闸门，层 [18]）：**13 组姿势 + 15 条源码指纹
  （含 2 条反向断言）+ 9 条产物指纹（含 1 条反向）全绿**
- **有牙齿**：把 `const folded = wysFoldOrphans(root);` 换成 `const folded = 0;` 再跑，
  ⑤⑥⑦ 立刻回到用户那句「没有可撤销的改动」，退出码非零 —— 恢复后全绿
- `npm run gate` **18/18 全绿**；`wysiwyg.test.js` 59 项 ✓、
  `v09-docmodel` 63 项 ✓、`v09-txlog` 84 项 ✓、`v09-baseline` 红线 6/6 ✓
  （靶子仍剩 2 个 —— P3 的 keyed patch 与新内核 API）、`check-v0818-undo.js` 21 项 ✓
- 装机产物 **v0.8.20**：折叠 / 认字 / 落点 / 页首只读四件都在产物里，反面断言（旧的
  `indexOf` 类名判定）确认不在

## v0.8.21 — 撤销看得见：画面与源码必须一起回去

**用户原话。**「已撤销但是没有效果呢，没有撤销上去」

**上一版为什么没接住。** v0.8.18 / v0.8.20 把「**能不能**撤」修好了（历史接进 txlog、块外的字收进正文块）。
用户再试，症状变了：提示条照样说「↩ 已撤销『打字』（到底了）」，`onChange` 拿到的源码也**逐字节**
回到了打字前 —— 可**屏幕上那段字还在**。原来那两层探针查的全是「`onChange` 收到的源码对不对」，
没有一条断言看屏幕：源码对、屏幕不对，测试一路全绿。

**根因（一行守卫 + 一次被批处理吃掉的中间帧）。** 就地编辑层的画面同步靠 `root.__latexHtml` 做幂等守卫：

```js
if (root.__latexHtml !== html) { /* …重建 innerHTML… */ }
```

打字期间 DOM 是权威（本 effect 在 `wysEditing` 那一行就早退了），`__latexHtml` 记的还是打字**前**那份。
撤销把源码退回打字前 → `html` 与 `__latexHtml` 恰好相等 → **整段跳过**：文件改回去了、屏幕没动。
台账本来可以在「commit 那一拍」补上，但撤销是**同一次事件**里先 commit 再 undo 的，
中间那一帧 `content = 刚敲的字` 被 React 批处理吃掉，effect 根本见不到它。

二阶伤害更狠：DOM 里那份陈旧的打字还在 —— 用户顺手点走（失焦）→ `commitWys` 把它写回源码，
**撤销被静默吃掉**；再接着打字，撤掉的字还会顺路回来。

**修法（两条小的，都在同一处）。**

1. **台账补一栏** `wysDomSrc` =「屏幕现在是照着哪份源码画的」（`commitWys` 写回当拍就记）；
   守卫改成「html 对不上 **或** 源码对不上」才重建 —— 两个都对上才敢不重建。
   这样 v0.8.12 那条「打字不丢光标」的保证一字不动（打字那一拍 `selfEdit` 仍为真、仍不重建）。
2. **两个标志先消费**：`selfEdit` / `histOp` 从守卫**里面**挪到外面。守卫一短路，旧位置上的读取
   就留到下一拍 —— 那一拍的外部改动会被误判成「本层自己写的」，历史不 rebase，静默错位。

**新开一层探针（关键在「让屏幕可断言」）。** `.setup/_probe-undo-view.js`（由 `_mkprobe-undo-view.js`
组装：harness 复用 `_probe-edit.js` 前半段，不复制）。与 v0.8.20 那层的区别只有一处，但它是决定性的：
那一层的 `wire()` 没把 **`innerHTML`** 接到 jsdom，而同步层重建画面写的正是它 ——
于是「画面有没有重建」在那一层里**根本不可观测**（重建与否读到的都是老 DOM）。
这一层把 `innerHTML` / `textContent` 都接上，重建第一次成了可断言的事。

| 场景 | 改造前 |
|---|---|
| ⑭ 打字 → Ctrl+Z：源码回去 ✓，但**屏幕上刚敲的字还在** | ✗ |
| ⑮ 撤销后再失焦一次：撤掉的字被写回源码（撤销被吃掉） | ✗ |
| ⑯ 撤销后接着打字再失焦：撤掉的字跟着回来 | ✗ |
| ⑰ 撤销 → 重做（Ctrl+Y）：屏幕上把字放回来（对称方向一并钉住） | ✓ |

**有牙齿。** 把守卫改回单条件 `if (root.__latexHtml !== html) {` 再跑本层，⑭⑮⑯ 立刻红、退出码非零；
恢复后全绿。

### 验收

- 新层 `.setup/check-v0821-undo-view.js`（已接进闸门，层 [19]）：**⑭–⑰ 四条行为场景全绿 +
  7 条产物指纹（含 2 条反向断言：旧的单条件守卫、守卫内的标志读取都不许再出现）**
- `npm run gate` **19/19 全绿**；`wysiwyg.test.js` 59 项 ✓、`v09-docmodel` 63 项 ✓、
  `v09-txlog` 84 项 ✓、`check-v0818-undo.js` ✓、`check-v0820-orphan.js` ✓（前几层一条没回退）
- 装机产物 **v0.8.21**：`wysDomSrc` 台账与「两头都查」的守卫都在产物里，旧的单条件守卫确认不在


## v0.8.22 — 代码 / 内容分道：`\maketitle` 不进正文，字也写不进命令

**用户原话（三句，三个真问题）。**
①「预览还是有 `\maketitle` 和 `\end{document}` 这些代码呢」
②「而且无法区分代码和内容块」
③「我想要加内容块，貌似弄到了代码里面」

**前面 19 层为什么都没拦住。**
`check-v074-flat` / `check-v080-flat` 只数了 `.wys-blk.wys-cmd` 的**个数**（一直是 2），
从没问过「它排出来的到底是源码还是成品」。③ 更隐蔽：那三类块当时在 `WYS_WHOLE_BLOCK` 里
（＝回写时读整块），光标能停进 `\maketitle` 那一行 —— 那是全文**唯一**一处能把正文写进命令的入口，
而没有任何一层测过「点它会发生什么」。

**修法。**

1. **渲染分道。** 注释 / 命令 / 文档结尾三类走「代码道」：`[命令] 把页首的标题 / 作者 / 日期排进正文`、
   `[结束] 正文到此结束 —— 这一行以下的内容不参与排版`、`[注释] TODO: …`。源码行 `hidden`
   （`\end{document}` 显示源码它也不是文字，是结构）。命令人话表 `WYS_CMD_SAY` 只收录认识的那 22 条，
   不认识的照旧显示命令本身 —— 不猜语义、不假装认识它。
2. **整块只读。** 这三类块 `contenteditable="false"`，点它开就地编辑器（与公式块同一套 `.wys-pop`）——
   光标再也落不进去，字再也写不进命令行。
3. **回写权威换成块自己的 `data-tex`**（`WYS_TEX_BLOCK`）。内部 DOM 现在**全是渲染结果**，
   靠遍历 DOM 拼源码等于把渲染结果当源码写回去。
4. **补上「¶ 新段落」。** 可视化档以前没有任何「加一段」的入口：只有在段落末尾连按两下回车
   （LaTeX 里单换行 = 空格、空行才分段）才长得出新段落 —— 谁都猜不到。用户于是自然会去正文下方点一下
   再敲字，而那儿要么是块与块之间的空隙，要么正撞上 `\end{document}` 那一行。
   现在按钮在段落块末尾补两个 `<br>`：DOM 里有落脚点、光标停在新起那一行，边打字边成型；
   **一个字都没敲就走开，回读等于原文 → 源码零改动、零污染**。

### 验收

- 新层 `.setup/check-v0822-code-vs-content.js`：渲染（可见文字里不许出现 `\maketitle` /
  `\end{document}` / 裸 `% 记法`）+ 回写（`wysDomToTex(块) == data-tex`）+ 行为（点结构块 → 被接下
  并弹就地编辑器；点正文 → 不抢；就地改一条命令只动那一行；「¶ 新段落」按下去源码里真的长出新段落）

> ⚠ 最后半句里「长出新段落」的**数量**在 v0.8.26 变了：那会儿一次落**两个**空行（读回不归一），
> 现在恰好**一个**（段末第一个换行是光标落脚点，见 §v0.8.26）。断的**事**没变。
> v0.8.27 又把**键盘**那条路对齐到同一个数：回车一下 = 一个空行 = 一个新段落（见 §v0.8.27）。
  + 产物指纹，**52 项全绿**
- 反例两条：旧渲染（结构块直接排原始源码）不许回来；点结构块时不许再「不夺默认行为」

## v0.8.23 — 结构改动之后，屏幕必须跟着动

**用户原话。**「✓ 已设为「\section」（源码 7 行并成一行，段落语义不变）↩ 撤销 —— 有时候没有生效呢」

**根因（一面旗子活过了一拍）。** `wysSelfEdit` 是 `commitWys` 立的，语义只有一个：
「这次源码变化是**用户就地打字**造的，DOM 已经是权威，别再拿 `html` 覆一遍（覆一遍会把光标铲掉）」。
而「打完字立刻按 `Ctrl+1`」这种姿势里：

```js
// 同一次事件、同一个 tick
wysEditing.current = false;
const c = commitWys();        // ← 立旗 wysSelfEdit = true，onChange(next)
const out = applyEdits(c, …); //   合并成 \section{…}
onChange(out);                // ← 又一次 onChange —— React 批处理，合成一拍
```

同步层只看到**一次**变化（`content = out`），而那面旗子还是 `true` →
`if (!selfEdit) root.innerHTML = html;` 被跳过 → **源码合并好了，屏幕停在合并前那一段上**。
用户读作「已设为 \section，但是没有生效」；紧接着的「撤销」自然也就「看不出效果」。

**为什么前 20 层全绿也没拦住。** 它们全都在问「**源码**写对了没有」：写回的行区间对不对、
字有没有丢、撤销链有没有记上、切档回得来吗。**没有一层问过「用户看见的还是不是同一个东西」。**

**修法（一处新助手 + 5 个调用点，打字那条路一个字不改）。**

```js
/* 凡是「不是用户就地打字」写上去的源码变化，落盘前都要把这面旗子放平 */
function wysPaintFromSrc() { wysSelfEdit.current = false; }
```

调用点：`applyHeadWys`（`Ctrl+1~6` 改层级 / 取消层级）、`undoWys`、`redoWys`、
`commitAtom`（块级改写）、`commitAtom`（行内原子 —— 外观是 KaTeX 渲染出来的，只改 `data-tex`
不重画，用户看到的是**旧式子**）。`commitWys` 自己**不许**调它：打字那条路必须保持 DOM 权威，
否则每改一处光标就被铲平。

**新一层探针（关键在「把重画本身变成可断言的事」）。** `.setup/_probe-v0823.js`（由
`.setup/_mkprobe-v0823.js` 从 `_probe-undo-real.js` 切 harness 组装，不复制）：

| 场景 | 改造前 |
|---|---|
| ① 打字 → `Ctrl+1`：源码合并 ✓，**屏幕还停在合并前的段落上** | ✗ |
| ② 打字 → 点提示条「↩ 撤销」：源码退回 ✓，屏幕重画 | ✓（跨事件，本来就没事） |
| ③ 打字 → `Ctrl+Z`（同一次事件里 commit + undo） | ✓（v0.8.15 已在 `wysCommitPending` 放过旗子，这里当回归钉子） |
| ④ 反例：光标不在打字时 `Ctrl+1` —— 仍要生效、一个字不多不少 | ✓ |
| ⑤ 反例：纯打字就地写回 —— **不许**重画（重画会铲掉光标） | ✓ |

判据不是「字符串变没变」：②③ 里重画出来的那份**恰好等于**起点那份（源码退回去了），
光比字符串看不出重画有没有发生。① 比 `pv.innerHTML` 是否变化（`root.innerHTML = html`
那一行就是「重画」本身），③ 给 `pv.innerHTML` 装一个**计数器**，数的是「那一行被执行了几次」。

**有牙齿。** 把 5 个调用点去掉再跑本层，① 的四条断言立刻红、退出码非零；恢复后全绿。

### 验收

- 新层 `.setup/check-v0823-paint.js`（已接进闸门，层 [21]）：源码顺序（5 个调用点都排在
  `onChange` 之前 + 反面：`commitWys` 里不许出现它）+ 行为（①–⑤）+ 产物指纹，**20 项全绿**；
  行为探针 **28 项全绿**
- 顺手修掉一处**过期的版本断言**：`check-v0821-undo-view.js` 写死「产物版本 = 0.8.21」，
  0.8.22 一发布这层就红 —— 红的是断言本身，不是产品。现在改成「产物不落后于这一改 + 与
  `manifest.json` 一致」这两条真正的不变式
- `npm run gate` **21/21 全绿**（v0.8.22 那层也补进了闸门 —— 它此前只跑过单测，没进验收门）
- 装机产物 **v0.8.23**：5 个调用点与 `wysPaintFromSrc` 都在产物里


## v0.8.24 — 分屏滚动联动：反方向从来没挂过，双向还得不打架

**用户原话。**「分屏那里没有同步呢」

**先量，再改。** 「同步」在分屏里有两个可能的所指 —— 内容与滚动。两个都钉成可断言的事实，
探针 `.setup/_probe-v0824.js`（真组件 + jsdom 真 DOM，事件真派发，不是读代码猜）：

| 方向 | 改造前 |
|---|---|
| 内容：左栏敲字 → 右栏跟着重画 | ✓ |
| 内容：右栏就地改完失焦 → 左栏 `textarea` 拿到新源码 | ✓ |
| 滚动：左栏滚 → 右栏按比例跟着走 | ✓ |
| 滚动：**右栏滚 → 左栏** | ✗（`ta.scrollTop` 恒为 0） |

> ⚠ 上面第二格后来在 **v0.8.25** 被推翻。它测的是「右栏就地改完**失焦** → 左栏拿到新源码」——
> 把「最后会写回去」当成了「同步」。用户抱怨的正是那个「失焦才写回」：打字过程中左栏一直是旧的。
> 判据写松一格，就让一个真问题在门禁里挂了 ✓ 一整版。见 §v0.8.25。

坏的那一条是实打实的：分屏里两栏并排，而 `onScroll` 全文只有一个，挂在源码 `textarea` 上；
渲染层 `pv-root` 上挂的是
`["onClick","onMouseDown","onMouseUp","onFocus","onBlur","onKeyDown","onPaste"]` ——
一个 `onScroll` 都没有。而 README 承诺的是「分屏 | 左源码右预览，**滚动联动**」。

**为什么前面 21 层都没拦住。** 「分屏」这个词在本项目的门禁里被断言过的只有
**档位落对没落对**（层 [7] 模式契约）和**三种视图都能编辑**（层 [13]）。
**「两栏之间有没有联动」从来没被问过** —— 一条承诺只实现了一半，而没有任何一层去数
「到底挂了几条通路」。这和 v0.8.23 那次是同一类盲区：门禁问的都是「功能在不在」，
没问过「用户在那一档里做的那件事，成不成」。

**修法（两个方向 + 一本回声台账）。**

```js
  /* 比例 → 目标栏的像素位置。两栏总高不同（源码按行、预览按排版），只能按比例对。
   * 刻意用「同一个公式」：推过去再推回来落回同一个点，才不会一点点漂走。 */
  function ratioScroll(el, r) { … }

  /* 源码栏 → 高亮层 / 行号槽 / 渲染层（老通路，一字没动；只是多了个 ev） */
  function syncScroll(ev) { … }

  /* 渲染层 → 源码栏（v0.8.24 补上的反方向；只在分屏档动作，源码栏不在场就早退） */
  function syncScrollFromPv() { … }
```

**回声台账是这一改的核心。** 双向联动最容易出的毛病是「A 推 B、B 又推回 A」两栏来回打架、
画面发抖 —— 因为**程序设置 `scrollTop` 之后，浏览器自己也会派一次 `scroll` 事件**。
判据刻意不用「计时器到点就别管了」这种糊涂账（它会把用户真实的滚动也吞掉），而是**位置对得上**：
凡是我们替对方写进去的位置都记进台账（连时间戳），等那一栏自己报上来的 `scroll`
正好等于这个位置、且就在刚才（350ms 内）→ 认作回声，放行并销账。

这一条**有牙齿** —— 判据数的是「另一栏被写了几次」，不是「画面看起来稳不稳」：

| 回声判据改成 `if (false)` 再跑本层 | 结果 |
|---|---|
| ⑦「右栏这一下**没有**反过来推左栏」（数左栏写入次数） | ✗ 1 → 2（正是两栏在互相推） |
| ⑦「用户真的滚右栏 → 照旧接管」 | ✗ 2 之外又多一次（3） |
| ⑦「回声之后两栏位置不变（画面不抖）」 | ✓ —— **照样绿**：推来推去恰好互逆时，画面看起来是稳的 |

最后那行是这一层存在的理由：光看画面，这项缺陷一辈子测不出来。

顺带两条同源的分寸：

- `syncScroll` 多了个 `ev` 参数。`gotoLine`（大纲跳转）那条**显式驱动**不带事件 ——
  语义是「源码已经滚到位，其余几栏跟上」，所以不走回声判据，并把台账里可能残留的回声
  一笔勾销；否则「恰好滚到同一个位置」会把这次跳跃自己吞掉。
- 反方向也得把高亮层（`<pre>`）与行号槽一起搬 —— 它们与 `textarea` 共用同一个滚动位置，
  只动 textarea 就是「字在动、背景高亮没动」。

### 验收

- 新层 `.setup/check-v0824-split-sync.js`（已接进闸门，层 [22]，**25 项全绿**）：
  源码（两栏各一条通路 / 换算只有一处定义 / 回声判据是「位置 + 就在刚才」而不是计时器 /
  显式驱动那一支 / 两条挂载点各自绑对对象 / 反面：`commitWys` 那条打字路不许被带坏）
  + 行为（整层探针）+ 产物指纹（**`onScroll={` 恰好两处** —— 多出来的那一处就是挂错了地方）
- 行为探针 `.setup/_probe-v0824.js`（由 `_mkprobe-v0824.js` 从 `_probe-undo-real.js` 切
  harness 组装，不复制）**29 项全绿**：内容两向 + 滚动两向 + 回声不打架，外加三条反例
  （可视化档里滚渲染层不炸、用户真的滚右栏必须接管、高亮层与行号槽不留错位）
- `npm run gate` **22/22 全绿**
- 装机产物 **v0.8.24**：`scrollEcho` / `ratioScroll` / `syncScrollFromPv` 与两处 `onScroll` 都在

## v0.8.25 — 分屏内容同步：右栏打字，左栏当场跟着变

**用户原话。**「我说的不是滚动，是**内容**不同步：在分屏右栏（预览）里打字时，左栏源码框
要等我点开才更新，我想**边打边**看到源码变化。」

**根因：两套「行」对不上？不 —— 这次是两套「什么时候写回去」对不上。**
预览层有一条硬不变式（写在 `wysEditing` 那一段注释里）：**编辑期间 DOM 是权威**，
绝不回写 `innerHTML`，否则每敲一个字光标就丢。于是打字期间源码一个字都不动，
要等 `onWysFocusOut` / `Ctrl+S` / 切档时 `commitWys()` 才落地。

而左栏那个源码 `textarea` 是**受控**的：

```jsx
  <textarea ref={taRef} value={content} onChange={(e) => onChange(e.target.value)} />
```

`value` 来自 `props.content` —— 它在整个打字过程里都是旧的。用户「点一下左栏」＝派发 `blur`
＝触发 `commitWys`＝源码才更新。所以他看到的永远是「要等我点开才更新」。
**两个设计各自都是对的，是它们之间的时间差没人管。**

**为什么 23 层门禁都没拦住。** 上一版（v0.8.24）那张表里，这一格被标成了 ✓：

| 方向 | 当时判的 |
|---|---|
| 内容：右栏就地改完**失焦** → 左栏拿到新源码 | ✓ |

判据写的是「**失焦**后写回去」—— 而用户要的恰恰是「**不用失焦**」。门禁把 bug 当成了正确行为，
于是它一直绿。这是与 v0.8.23（源码对了、屏幕没动）、v0.8.24（只挂了一半通路）同一类盲区：
**门禁问的是「功能在不在」，没问过「用户在那个时刻看到的是什么」。**

**修法：给预览层补一条 `input` 通路，但只让它做「跟随」。**

分寸比功能重要得多 —— 顺手把 `commitWys` 挂到每次击键上，会一次踩三个坑
（每敲一个字弹一次「✏ 已就地写回」、撤销栈塞满逐字步骤、光标每改一处被铲平）。所以新通路
（`wysSyncLive`）与收尾（`commitWys`）严格分工：

| | 实时同步 `wysSyncLive` | 收尾 `commitWysSession` |
|---|---|---|
| 扫多少 | 只跟**光标所在那一块** | 扫全部块 |
| 提示 | 不弹（左栏在动，本身就是反馈） | 弹「已就地写回 N 处」 |
| 历史 | 不记 | 整段编辑合成**一步** |
| DOM | 绝不重建（`wysSelfEdit` 那面旗子） | 重建 / 接回光标 |
| 自检 | 跑（`parseDoc`） | 跑 |
| 失败 | 静默（跟随不许打断打字） | 弹提示并放弃整批 |

**三条硬约束**（缺一条就出事故，注释里逐条钉着）：

1. **基准必须往前走。** `props.content` 在同一个 React 批次里还是旧的 —— 连打两笔时
   第二笔若基于旧源码重算，会把第一笔抹掉。所以基准是 `wysOutSrc`（本层最近一次写出去的那份），
   由 `wysBaseSrc()` 统一取。行为探针 ⑦ 钉的就是它（连打两笔，两笔都在，一次 Ctrl+Z 全退）。
2. **打字期间绝不重建预览 DOM。** 沿用 `wysSelfEdit` 那面旗子；探针 ③ 断言 `innerHTML` 一字未动、
   **块节点 identity 不变**（光标、选区都还在原处）。
3. **一次连续编辑 = 撤销链里一步。** 会话起点记在 `wysLiveBase`，收尾时由 `commitWysSession`
   用「会话起点 → 当前源码」落成**一条**事务；全部收尾点（失焦 / 切档 / `Ctrl+S` / 编译 / 校验 /
   导出 / 改层级 / 开原子浮层 / 行内原子）都走这个包装。门禁里有一条断言数「裸 `commitWys()` 只剩
   它自己内部那一次」—— 漏掉一处，那条路上刚打的字就撤不掉。

**顺带两件必须做的事。**

- **性能**：实时同步之后 `content` 每敲一个字就变一次，`wys` 那个 `useMemo` 会跟着把整篇
  （含 KaTeX）重渲染一遍 —— 大文档下就是几十毫秒砸在每一次击键上，而这段时间预览 DOM 本来
  就是权威、算出来没人用。现在有进行中的打字会话时直接复用编辑开始前那一份 HTML。
- **输入法**：中文组字过程中（`isComposing`）不同步 —— 半成品拼音写进源码既难看又难撤；
  组字结束那一拍会再派一次 `input`，照常落地。同一帧里的多次输入用 `requestAnimationFrame`
  合并成一次，但**最后一笔一定落地**（这正是「边打边看到」与「打完才看到」的区别）。

**验证**（`.setup/_probe-v0825.js`，真组件 + jsdom 真 DOM，事件真派发）：

| 场景 | 结果 |
|---|---|
| ② 右栏打字（**不失焦**）→ `onChange` 当场收到新源码 | ✓ |
| ② 左栏 `textarea` 显示的就是新源码（用户眼睛看到的那一份） | ✓ |
| ③ 打字期间 `innerHTML` 不变 + 块节点 identity 不变 | ✓ |
| ④ 输入法组字中一个字都不写；组字结束照常落地 | ✓ |
| ⑤ 失焦 → 历史里**一步**「打字」；一次 `Ctrl+Z` 退掉整串 | ✓ |
| ⑥ 进相位又立刻离开（没打字）：零写入、零历史 | ✓ |
| ⑦ 连打两笔都不丢；仍只占一步；一步退回最初那份 | ✓ |
| ⑧ 改**标题**文字：左栏 `\section{...}` 当场变新标题，前缀没丢 | ✓ |

**反证（这一层有牙齿）。** 把 `panels/editor.tsx` 回滚到这一版之前再跑同一份探针：

| 断言 | 旧代码 |
|---|---|
| 还没失焦 `onChange` 就已经发出去了 | ✗ `writes 新增 0 次` |
| 发出去的源码里带上刚敲的字 | ✗ `""` |
| 左栏显示的是新源码 | ✗ 仍是 `\section{引言}` 那份旧内容 |

**门禁。** 新增层 **[23] 分屏内容同步**（`check-v0825-live-sync.js`，40 项 = 源码分寸 28 + 行为探针汇总 1 + 
产物核对 11），行为探针内部另 33 项全绿。`npm run gate` **23/23 全绿**；装机产物 **v0.8.25**：
`wysSyncLive` / `onWysInput` / `commitWysSession` / `wysBaseSrc` / 两处挂载点 / 冻结开关都在。

顺带更新了四条**过时**的门禁断言（把 `commitWys()` 换成收尾包装 `commitWysSession()`、
「预览未挂载即复位相位」那一段扩成多行）—— 断的**事**没变，只是文本对不上；
同一次也把 `check-v0821` 里那条台账正则放宽到「同一个函数内、900 字符以内」，
因为 `pushTx` 之后多了两行（清会话起点、推进基准），原来那条「紧跟着注释」的写法不再成立。

## v0.8.26 — 回车换行：段末那个 `<br>` 是光标落脚点，不是内容

**用户原话。**「换行这些特别不丝滑，不适合续写」。

**根因（一行算式）。** 段末按回车 → DOM 里插一个 `<br>` → `wysDomToTex` 把它读成 `"\n"`
→ 写回走 `applyEdits`，而它是**按 `\n` 切行**的：

```
newText = "正文…\n"   →   ["正文…", ""]        ← 两个元素，替换掉原来那一行
                             ⇒ 源码里凭空长出一个空行（LaTeX 里空行 = 断段）
```

于是「回车换行」这一下的手感坏在三处，每一处都能一眼看出来：

- 段末按一次回车：那一段后面多一个空行 —— 重建后段落被劈成两块（左栏边打边同步，眼看着变花）；
- 连写十几行 = 十几个空行；
- 「¶ 新段落」那两个 `<br>` 一次写出**两个**空行（文档说好的只有一个）。

**为什么 23 层门禁没拦住。** 第 [13] 层**就是**管回车换行的（v0.8.11 加的），但它钉的是**文本**：

```js
["② 回车插 <br>（insertHTML）", 'document.execCommand("insertHTML", false, "<br>")'],
```

一句话在不在产物里，和「按一下回车源码会变成什么」是两件毫不相干的事。更巧的是：
回车这条路的实现恰好是 jsdom 里跑不起来的那一条（jsdom 里根本没有 `execCommand`），
于是 **23 层门禁一次都没有真的按过回车** —— 上面那三处也就一直没人问。
（与 v0.8.23「源码对了、屏幕没动」、v0.8.25「把失焦后写回当成同步」同一类盲区：
门禁问的是「那句话在不在 / 功能在不在」，没问过「按下去之后文件变成什么」）

**修法一：段末那一串换行，块级读回时吃掉。**
新增 `wysBlockTex(root) = wysDomToTex(root).replace(/\n$/, "")`，三个块级读回点
（收尾 `commitWys` / 边打边 `wysSyncLive` / 渲染后的原文台账）统一走它 —— 读法与
「这块动没动」的比对基准必须是**同一把尺子**，漂一格就会把每个块都误判成「改过」。
吃**一个**（不是全吃干净）：第一个 `<br>` 是落脚点，第二个起才是真内容。
`wysDomToTex` 本身一个字没改（行内往返那条不变式 `wysDomToTex(wysInline(x)) === x` 照旧）。

| 动作 | 之前 | 现在 |
|---|---|---|
| 段末按一下回车（不敲字） | 源码多一个空行 | **源码逐字节不变**（撤销链里也不留一步） |
| 段末连按两下 | 多三个空行 | **恰好一个**空行 = 一个新段落 |
| 段中按回车 | 一行拆两行（对） | 一行拆两行，空行数不变（对） |
| 「¶ 新段落」 | 两个空行 | **一个**空行（文档说好的那个数） |
| 回车后接着续写 | 换行落进源码 + 多一个空行 | 换行落进源码、不多空行，重建后仍在同一段里 |

**修法二：执行方式从 `execCommand` 换成自己动 Range。** 三条理由各自都够：

1. 它是**命令式**的 —— 光标最后落在 `<br>` 前还是后由实现说了算（用户读作「按了回车光标没到新行」）；
2. 它顺手把原生撤销栈当「粘贴」处理（v0.8.15 拦过的同一条路）；
3. **jsdom 里没有它** ⇒ 这条路在任何夹具里都跑不到（就是上面那条盲区的成因）。

现在：插 `<br>` → `range.setStartAfter(br)` 把落点**定死** → `sel.addRange` →
再**自己**喊一声实时同步（`execCommand` 会替调用方派 `input`，自己动 DOM 就得自己派；
不派就是「字看得见、源码不动」，正是 v0.8.25 修掉的那个毛病）。
顺带补一条这一版自己得扛的守卫：**光标落在只读孤岛上**（原子卡片的渲染结果 / 结构块 /
标题编号）时一个字都不动 —— 以前这件事托付给浏览器，现在自己插，就得自己守。

**验证。** 新增 `.setup/_probe-v0826-enter.body.js`（真组件 + jsdom 真 DOM；浏览器那一侧用
一份最小但忠实的 Range/Selection 替身补上 —— 夹具里**真派发 `keydown`**，组件里那段代码真跑）：
43 项行为断言，覆盖上面那张表的每一行，外加「DOM 里真的多了一个 `<br>`」「光标在它后面」
「预览层没被重建（块节点 identity 不变）」「失焦重建后换行还在」「一步 `Ctrl+Z` 退掉整串」。

**反证（这一层有牙齿）。** 把 `panels/editor.tsx` 回滚到这一版之前、跑同一份探针：

| 断言 | 旧代码 |
|---|---|
| 段末按一下回车：源码逐字节不变 | ✗ `第一段正文在这里\n\n\n\section{方法}`（凭空一个空行） |
| 段末连按两下：恰好一个空行 | ✗ 空行 7 vs 原 4（三个） |
| 段末那个落脚换行没有变成空行（续写时） | ✗ 空行 5 vs 原 4 |
| 「¶ 新段落」只落一个空行 | ✗ 两个 |
| 回车不再走 `execCommand` | ✗ 调了一次 `insertHTML` |

（替身里 `execCommand` 是**真的会插 `<br>`** 并且照规矩派 `input` 的 —— 只记账不干活的话，
旧路的后果在夹具里根本发生不了，反证就成了空话。）

**顺带补的一条守卫（用户写的是中文，这条不是锦上添花）。** 输入法组字中按回车 = 「确认候选词」，
不是「换行」。中文输入法下 Chromium 会把这一下 `keydown` 派到页面上（`keyCode 229` / `isComposing`），
而回车分支原来正好会 `preventDefault` + 插 `<br>` —— 用户读作「打个字按回车，行被换了、候选词也没了」。
现在组字中的回车一律放行（同一条 guard 也用在实时同步那侧，v0.8.25 就有）；
行为探针 ⑨ 钉着它：不被拦、不插 `<br>`、源码零改动。

**门禁。** 新增层 **[24] 回车换行**（`check-v0826-enter.js`，源码分寸 + 产物核对，
行为级跑上面那份探针的 43 项），`npm run gate` **24/24 全绿**；装机产物 **v0.8.26**：
`wysBlockTex` / `insertSoftBreak` / `queueWysLive` / 三处读回点 / 「回车与打字共用同一次排程」都在，
回车那条命令调用不在。

同一次改了三条**过时**断言（断的**事**没变，只是文本 / 位置对不上）：

- [13] 层那两条 `execCommand` 文本断言换成行为契约（回车被接管 + 不再走命令路）；
  DOM 级的后果（真的插了 `<br>`、光标在它后面）移交 [24] 层 —— 那一段需要的接线盒在 [24]；
- [20] 层 `commitWys` 的读回口径（`wysDomToTex(anchor)` → `wysBlockTex(anchor)`）；
- [23] 层把 rAF 排程改指 `queueWysLive`（排程从 `onWysInput` 里拆出来了，回车那条路也要用它）。

**踩到的一个坑（记下来，别让下一个人再踩）。**
`.setup/_fix-*.py` 里那句 `io.open(p, "w", encoding="utf-8")` 写回源码，会在 Windows 上把
**混合行尾**的文件统一翻成 CRLF；而门禁里那些跨行断言写的是 `"…\n…"` —— 一翻就整层全红
（[22] 层两条、[23] 层一条），红的是行尾、不是行为。读的时候带 `newline=""`（老脚本就是这么写的），
写回后也检查一眼行尾没变。

## v0.8.27 — 回车 = 新建段落，段内换行改用 Shift+Enter

**用户原话。**「把回车改成新建段落：回车落一个空行 = 新段落，段内换行改用 Shift+Enter」。

### 一、把规矩摆正（动作对调）

LaTeX 里空行才分段、单换行只是空格。上一版把回车做成了**段内换行**，想分段得连按两下 ——
还得先知道 LaTeX 这条规矩才猜得到，与所有人（以及 Overleaf / Typora）的手感都反着。
两个动作对调，落点仍由自己动 Range 定死（v0.8.26 立下的规矩：不许再赌浏览器 / `execCommand`）：

| 动作 | 之前 | 现在 |
|---|---|---|
| 回车 | 段内换行（一个 `<br>`） | **新建段落**（两个 `<br>` = 一个空行） |
| Shift+回车 | 不接管（留给浏览器，会插 `<div>`） | **段内换行**（一个 `<br>`） |
| Alt/Cmd+回车 | 一并吞掉（越界） | **不接管**（那不是我们的键） |
| 「¶ 新段落」按钮 | 一个空行 | 一个空行（没变，留给鼠标） |

「一个空行」这条算式一个字都没改（块级读回仍吃掉段末那一个落脚换行，见 §v0.8.26），
**变的只是按几下**：以前「两下一个空行」，现在「一下一个空行」。

顺带补一条这一版自己得扛的守卫：**已经站在一条空段落行首再按回车不再补**
（判据 = 光标左边紧挨着两个 `<br>`）—— LaTeX 里**空段落不存在**，再补只会往源码里多塞空行
（左栏眼看着变花，正是 v0.8.26 收拾掉的那条老毛病）。判据只看「紧挨着的那两个节点」：
用户一旦挪过光标，判据自然失效 —— 那时插就对了。

### 二、换过来之后，第二件事浮出来了：行区间会「长大」

`data-s` / `data-e` 是**渲染那一刻**写上的（`parseDoc` 给的 `startLine / endLine`）。
在这之前它们一直够用，因为那段设计刻意维持着一条前提 —— **编辑期间行数不变**
（回车只把光标送到新的一行、源码逐字节不动；打字只改某一行的内容）。
三处读回点（收尾 `commitWys` / 边打边 `wysSyncLive` / 渲染后的原文台账）全是按这条前提在
`data-s..data-e` 上 `replace` 的。

一个段落一拆，它下面所有块的行号都得往后挪。不挪的后果不是「差一行」这种小事：

```
base（旧区间 [4..4]）:  4: 甲段落内容摆在这里
第二笔的新文本三行:     4: 甲段落   5: (空)   6: 内容摆在这里续
结果:                   4: 甲段落   5: (空)   6: 内容摆在这里续
                        7: (空)     8: 内容摆在这里        ← 上一笔留下的垃圾
```

**而这条错在上一版里就已经存在了**：`Shift+回车`（老回车）同样是「一行变两行」，
之后接着打字两笔就会中 —— 只是以前的探针只打了一笔（断言查的是「新起那一行在不在」，
没查「旧那一行还在不在」），所以 24 层全绿也拦不住它。

**修法一：一颗纯函数 + 两处调用点。** `wysShiftSpan(s, e, edits)`（模块级、可单测）：
给一个块自己的 `[s,e]` 与这批编辑，算它的新区间 ——

- 编辑**就是这个块自己**（区间完全相等）→ 起点不变，终点 = 起点 + 新文本行数 - 1；
- 编辑**整段在它上面**（`endLine < s`）→ 整体平移 `delta`；
- 编辑**整段在它下面**（`startLine > e`）→ 与它无关；
- **区间交错**（编辑从块中间切过去）→ 一格都不挪（宁可少挪，绝不乱挪）。

行数与 `applyEdits` 同一把尺子（按 `"\n"` 切），不另立一套。`wysShiftSpans(edits)` 把结果写回
各块 DOM 上的 `data-s / data-e` —— 行区间的**唯一权威仍是那两个属性**，三处读回点一个字都不用改。
调用点在**两处**（少一处那条路就会开始吐重复正文）：`wysSyncLive`（每敲一个字）与
`commitWys`（失焦 / `Ctrl+S` / 切档 / 编译前），且都在 `applyEdits` **之后**。

### 三、验证

- **纯函数层** `.setup/_test-v0827-span.js`（19 项，[25] 层）。真 `applyEdits` 跑一串
  「拆段 → 一笔一笔打字」；四条分寸（自己 / 上面 / 下面 / 交错）逐条断言；
  **外加反证**：按旧写法（不挪区间）跑同一串动作，源码里**真的**长出第二份正文 ——
  没有这条反证，这一层就是白开的。
- **行为层** `.setup/_probe-v0827-enter.body.js`（55 项，[24] 层）。真组件 + jsdom 真 DOM，
  浏览器那一侧用一份最小但忠实的 Range/Selection 替身；夹具里**真派发 `keydown`**（含 Shift）。
  覆盖：段末回车 → DOM 两个 `<br>` + 光标在新段落行首 + 源码**恰好**一个空行；
  再按一次不许多塞；段中 `Shift+回车` → 一行拆两行、空行数不变；段中回车 → 恰好一个空行
  （真分成两段）；**回车之后一笔一笔打两笔 → 源码里不许出现重复的正文**（`Shift+回车` 那条同样钉）；
  失焦 / 一步 `Ctrl+Z` 之后字与段落结构都回得去；「¶ 新段落」一个空行；只读孤岛上回车一个字不动；
  组字中回车（含 `Shift`）一律放行。
- **门禁**：[24] 层由 `check-v0826-enter.js` 改判为 `check-v0827-enter.js`（回车分层），
  新增 [25] 层 `check-v0827-span.js`（行区间），**25 层全绿**。
  （本机这一版把整门一把跑会从第 12 层起全部 `exit=null` —— 那是环境对「一次 spawn 几十个
  子进程」的限制，不是层红了；用 `.setup/_gate-batch.js <from> <count>` 分批跑，逐层结果一致。）
  三处**过时断言**跟着改判（断的**事**没变）——
  [13] 层探针那条「Shift+Enter 不接管（不越界）」改成「Shift+Enter 接管 + Alt+回车 不接管（不越界）」，
  因为 Shift+Enter 从这一版起归我们管了；`wysOnEmptyParaLine` 这个名字撞了 [5]/[7] 层
  「不许再出现 `wysOn`」（当年用来钉「编辑不再是模式」）那条断言，改名 `wysCaretOnEmptyLine`
  （与既有的 `wysCaretSnapshot` / `wysCaretRestore` 一族同名）。

### 四、教训（这条比改动本身值钱）

用户的诉求（回车就该分段）完全合理，但它顺带**撤掉了一条不变式**：上一版之所以敢把
「编辑期间行数不变」当公理用到底，是因为回车被做成了零改动。改一个默认键位在这套设计里
不是配置项，而是**换掉一条公理** —— 必须把「依赖这条公理的每一处」重新数一遍：
这一版数出来的就是两处回写点，外加一个**在上一版里就已经存在、只是没人连着打过两笔**的旧错。

顺带一条工程侧的经验（这一版又踩了一次）：`.setup/_fix-*.py` 里 `patch()` 这类「先改内存、
最后一次性写回」的写法，一处没命中就会**整份不写** —— 但前面几条已经打印了 `ok`。
同一次里既要改 A 文件、又要靠 A 的改动让 B 的断言变绿时，这种「静默整份回滚」会让你顺着
绿灯往下走，直到某一层红得莫名其妙。命中数不为 1 就该**当场停**（现在这几个脚本都这么写了）。

---

## v0.8.28 — 标题块跨多物理行：章节快捷键还能干活 / 「取消层级」不再毁稿

> 补记。取证：`panels/editor.tsx:1103 / 1111 / 1142 / 3046 / 3118`、
> `.setup/_test-v0828-headspan.js`（门禁第 25 层）、`.setup/check-v0811-edit.js`。

**用户看到的原话是一行警告**：

> ⚠ 这一块跨 4 行（多行公式 / 环境等），章节快捷键只处理正文段落 —— 把光标放到正文上再用

而光标其实就在标题上。这行提示把用户指去「把光标挪到正文上」，可那一段本来就是标题 ——
照它做只会得到另一个结果，越按越乱。

### 一、两个真成因

**① 判据认块只认「单行段落」。** 章节快捷键那一支原来的写法是「非段落一律拒绝」，
于是跨物理行的标题块落进拒绝分支，而拒绝文案是写死的「多行公式 / 环境」——
**拒绝是对的，理由说错了**。改法两条：标题块（`heading`）是章节快捷键的第一号对象，
不再走「非段落 = 不认」这条捷径；块类型先映射成人话（`WYS_BLK_SAY`：标题 / 正文 / 公式 /
图表浮动体 / 列表 / 参考文献 …），拒绝时说得清拒的是哪一块。
跨多物理行的块先并成一行再当标题处理 —— 逐行剥行尾注释、trim、单空格连接（`mergeWysLines`），
判据是**块类型**，不是「文本长什么样」。

**② 「取消层级」会写出坏的 LaTeX。** 标题文字原来用一条贪婪正则取第 3 组：

```js
/^\s*\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)\s*\{([\s\S]*)\}\s*$/
```

对 `\section{标题}\label{sec:y}`，`([\s\S]*)` 会把整串吞进去再回溯到最后一个 `}` ——
**取出来的「标题」是 `标题}\label{sec:y`**。平时它只是显示得难看；一旦走「取消层级」
（拿标题文字反写回源码），写回去的就是一行坏 LaTeX。
所以换成 `headStripClean`：平衡花括号扫描，认 `[短标题]{标题}`、认嵌套 `{\textbf{粗}标题}`、
转义花括号 `\{` / `\}` 不算括号；**命令组后面还挂着东西（`\label` / `\index`），
或者括号不闭合 —— 一律返回 `null`，也就是拒绝，不猜。**

### 二、验证

- `.setup/_test-v0828-headspan.js`（门禁第 25 层）：真用 `server/wysiwyg.js` 的解析与写回，
  只有分支判断是副本。单行 / 3 行段落 → 并成一行变 `\section` 各一条；
  `headStripClean` 的七条分寸（纯 `{标题}` / `[短]{标题}` / 嵌套 / 转义 / 挂着 `\label` /
  挂着 `\index` / 不闭合）；**外加一条把旧写法钉住的反证**：同一条贪婪正则对
  `\section{标题}\label{sec:y}` 取出的确实是 `标题}\label{sec:y` ——
  没有这条，「必须换掉」就只是我的说法。
- 真代码那一侧另由 `check-v0811-edit.js`（门禁第 15 层）的文本断言盯着（那几行必须在产物里）。
- 单行 + `\label` 现在：取消层级 → **拒绝**（不再写出坏 LaTeX）；换层级 → 只换命令名，
  `\label` 原样不动。

---

## v0.8.29 — 光标几何 / 全选：点块末尾看得到光标 + Ctrl+A 由插件自己说了算

> 补记。取证：`panels/editor.tsx:373 / 1404 / 1466 / 2130 / 2200 / 3330 / 3346 / 3639 / 3694`、
> `.setup/check-v0829-caret.js`（门禁第 26 层）。

**用户两句原话**：

> 「鼠标点击到块末尾的时候没有看到光标呢」
> 「在编辑器内无法全选呢」

### 一、「点块末尾没光标」的根因不是忘了设光标，是那个位置在浏览器里没有几何

段末那串 `<br>` 是光标落脚点（v0.8.26 / v0.8.27 立的规矩）。但 `<br>` 之后一个节点都没有时，
Chromium 算不出这一行的几何 —— `Range.getBoundingClientRect()` 返回 `0,0,0,0`。
光标位置算出来了，屏幕上一个像素也画不出来。**「设了光标」和「看得见光标」是两件事。**

这条不是推出来的，是真 Chromium 探针实测的：无占位时 rect 是 `0,0,0,0`；
在同一行放一个零宽占位后，同一处 rect 立刻变成真实坐标。

修法：每条空落脚行放一个零宽字符（`WYS_ZWSP`，U+200B）—— 零宽（视觉上不存在）、
读回时被归一化掉（**源码一个字节不多**）。落地在五个入口：`Shift+Enter` 段内换行 /
`Enter` 新段落 / 「¶ 新段落」按钮 / 点空白处的 `caretToNearest` /
点正文块（先把落脚行补齐，再把光标交回浏览器）。

**顺带的连带账**（漏了就是「修一个坏两个」）：占位一进 DOM，所有「数节点」的地方判据都得改 ——
数 `<br>` 时要跳过占位，判「这一行空了没有」时也要跳过，光标落点还得同时认两种形态
（停在容器里 = 老写法；停在占位**里面** = 本版之后）。这几处都留了注释说明为什么这么判。

### 二、「无法全选」的取证与修法

取证结论有点反直觉：**本插件没有任何一处拦 Ctrl+A**（`onCtrlSlash` / `onFmtKey` /
`onWysKeyDown` 都不认这个键），真 Chromium 里焦点落在编辑宿主上时原生本来就能全选。
也就是说「能全选」这件事**依赖焦点恰好落在 `.wys-editroot` 上** —— 而本层有两个可编辑面
（可视化档的唯一宿主 / 源码档的 textarea），焦点还可能停在只读孤岛、块间空隙、容器上，
那些时刻原生 SelectAll 就落空。

修法：Ctrl+A 由插件自己定义（语义 = **这一栏的全部内容**），挂在 `window` **捕获阶段**
（比宿主那层任何监听都早，避免宿主先吃掉）；自己没做成一律**放行**，绝不吞成一个空动作。

### 三、验证

`.setup/check-v0829-caret.js`（门禁第 26 层），四段：

- **[A] 纯函数行为**（jsdom 真 DOM）：占位补在哪 / 幂等（按两下不多塞）/ 只碰尾随串 /
  **读回源码逐字节不变**；
- **[B] Ctrl+A 自持**：只认这一下 / 焦点不在本编辑器不抢 / 做不成放行；
- **[C] 真 Chromium 复验**（默认跳过）：`NOTRAT_CARET_BROWSER=1 node .setup/check-v0829-caret.js`
  —— 点段末空行，无占位 rect `0,0,0,0` / 有占位真实坐标；
- **[D] 装机产物核对**。

---

## v0.9.0 — PDF / EPS 插图栅格化（`\includegraphics` 里的 `.pdf` 不再只是占位符）

> 补记。取证：`server/pdf-raster.js`（模块头）、`server/preview-core.js:356 / 360 / 364 / 381 / 426`、
> `server/index.js:1110 / 1140`、`server/export-html.js:161`、`panels/editor.tsx:2610`、
> `.setup/raster-e2e.js`、`.setup/raster-export.js`。

论文插图基本都是 `.pdf`（Matplotlib / TikZ 直接出 PDF），而 `\includegraphics{figs/x.pdf}`
以前在预览里只能落一个「编译 PDF 后可见」的占位符 —— 一篇正文里最贵的信息恰好是图。

### 一、栅格化放服务端（预览内核不许有进程）

预览内核（`preview-core.js`）是**双端零依赖**的，不能在里面做进程 / 文件系统的事。
所以转换放在服务端：新模块 `server/pdf-raster.js`，`latex_asset` 与 `export-html` 调它，
`figs/*.pdf` → PNG。

- **工具优先级**：`LATEX_RASTER_EXE`（显式指定）→ `mgs`（MiKTeX 自带 GS）→ `gswin64c` /
  `gswin32c`（独立安装的 Ghostscript）→ `pdftoppm`（poppler）。**只取第 1 页** ——
  `\includegraphics` 本来就只排一页。
- **磁盘缓存**：`os.tmpdir()/notrat-latex-pdf-raster/<sha1(绝对路径|mtime|dpi)>.png`，
  源 PDF 一改（mtime 变）自动失效，不污染工作区。
- **转不动就退回占位符**，绝不阻塞渲染主流程；另有一层进程内存里的失败负缓存，
  同一次会话里不对同一个坏文件反复起进程。
- 三个旋钮：`LATEX_RASTER_EXE` / `LATEX_RASTER_DPI`（36–600，默认 150）/
  `LATEX_RASTER_TIMEOUT`（默认 20s）。

### 二、同一版顺手修掉的三处渲染

- **子图编号**：`(a)(b)(c)` 以前跨 float 累加，现在每个 float 重排（`ctx.subNo`）；
  `subfigure` 环境与 `\subfloat` 宏两种写法都认 —— 以前只渲染 float 里第一张图。
- **float 主标题取错**：主标题以前在全文中抓第一个 `\caption`，那多半是**子图**的标题。
  提取顺序改成「先摘子图、再取主标题」。
- **间距命令的参数泄漏**：`\vspace{3mm}` 这类以前会把参数漏成正文里的裸文本「3mm」，
  现在连参数一起剥。

### 三、验证

- `.setup/raster-export.js`：**同步**栅格化那条路 —— 清缓存 → 首次真实转换 → 导出 HTML 里
  必须是 `src="data:image/png;base64,…"`；坏 PDF（胡乱写几个字节的假 pdf）→ 占位符 +
  `missing` 里给出说明。
- `.setup/raster-e2e.js`：端到端。起**装机后**的 `~/.notrat/tools/latex-server.js`，
  走 JSON-RPC 调 `latex_asset`，缓存未命中（真实转换）与缓存命中两条都覆盖。
- 这一步依赖本机有 Ghostscript 或 poppler。两者都没有时**只有插图是占位符**，
  编辑器、大纲、编译、HTML 导出照常 —— 与「没装 TeX 引擎」同一套诚实降级。

---

## v0.9.1 — 多文件预览：`\input` / `\include` 展开成子文件卡片

> 补记。取证：`server/preview-core.js:184 / 203 / 524 / 548 / 627 / 638 / 714`、
> `server/index.js:1124 / 1134`、`server/export-html.js:202`、`panels/editor.tsx:686`、
> `server/v09-multifile.test.js`。

真实的论文/学位论文正文都是一个主文件挂一串 `\input`。以前预览只认当前文件：
**`\input` 被静默吞掉** —— 那个位置什么都不出，页面看起来「内容就这么多」。

### 一、改动

- **子文件卡片**：`\input` / `\include` 展开成一张文件卡片（`📄` 头 + 子文件内容内联）；
  子文件在磁盘上找不到 / 没有解析器时，退成静态占位「子文件内容在编译 PDF 时合并显示」，
  不假装已经展开。**循环引用截断**（`a → b → a`），卡片上明说「循环引用」。
- **目录家族出占位卡**：`\tableofcontents` / `\doparttoc` / `\faketableofcontents` …
  真目录要编译才有，预览只标位置；这些命令名也**不再漏成正文**。
- **未知命令降级**：未知命令以前会把命令名漏成字面文本（`\unknowncmd{被保留}` →
  正文里真的出现 `unknowncmd`）。现在**命令名丢掉、参数内容留下**（「被保留」还在）。
- `\input` / `\include` 与目录家族在行内解析里也**是停止点** ——
  不标停止点的话它们会被段落合并吞掉，块级那套卡片根本没机会渲染。
- **服务端也要展开**：导出 HTML（`export-html.js`，服务端有 fs，直接同步解析）、
  `latex_asset` 的文件通道（候选扩展名补上 `.tex`；返回文本 + mtime，**512KB 封顶**）、
  以及 `inputResolver(name, baseDir)` 这个注入点（有它才展开，没有就退静态占位）。

### 二、验证

`server/v09-multifile.test.js` —— **`npm run test:multifile`，8 项**：标题渲染 /
`a.tex` 展开（A1、B1 都出现）/ 循环引用截断 / 目录占位卡 / `doparttoc` 静默 /
未知命令参数保留 / 未知命令名不泄漏 / 文件卡片头，外加上「无 resolver → 静态占位」一条。

⚠ **这一层不在门禁里**（它只测 `preview-core`，跑得动但当年没接进 `gate-v070.js`）。
所以改了 `preview-core` 的 `\input` 那条通路，`npm run gate` 全绿也不代表这里没坏 ——
得手动跑一次 `npm run test:multifile`。这条一直挂着，见 `docs/DEVELOPMENT.md`。

---

## v0.9.2 — 导出样式比对改成比类名集合 + 子文件卡的折叠状态烘进 HTML

> 补记。取证：`.setup/check-v084-export.js:97 / 104`、`panels/editor.tsx:697 / 729 / 3602`、
> `server/export-html.js:17`。

### 一、导出契约那一层在误判

导出契约（门禁第 10 层）要保证一件事：**导出的 HTML 与编辑器里看到的，用的是同一份样式**。
它原来的比法是逐条比样式规则，于是 wys 层那些**后代选择器**规则（形如 `.wys-inc-b .pv-ref`）
被判成「两边样式不一致」—— 规则本身是对的，只是只在就地编辑态下命中，比对口径错了。

改成**只比 `pv-` 类名集合**（两边的类名集合必须逐项相同）：比的是「同一套词汇表」，
而不是「同一批规则在某一刻算出的结果」。`server/export-html.js:17` 那句注释就是这么写的 ——
`PV_CSS` 与 `panels/editor.tsx` 里那份是**同一份样式**，两处的 `pv-` 类名集合必须一致。

### 二、子文件卡片的折叠状态

v0.9.1 引入了子文件卡片，这一版补上「能收起」。两个决定：

- **状态是会话级的**，key = 子文件的**绝对路径**（不是相对路径、不是卡片序号）——
  同一份子文件在正文里被 `\input` 两次，收起一处两处一起收，这才符合直觉。
- **折叠状态在构建时就烘进 HTML**（class / 箭头 / 右侧文案全按那个 Set 生成），
  不是渲染完再补一次 DOM 改动。理由是这一层是「HTML → DOM」单向的：预览每次都是**重建**，
  渲染后再打的补丁下一次重建就没了 —— 于是「点了收起，一打字又展开」。
- 卡头点击 = 收起 / 展开。整卡 `contenteditable=false`：折叠是**纯 UI**，不写盘、不进历史。

---

## v0.9.3 — 换样例（并让测试不再钉死样例原话）+ 用户宏 / 附录字母编号 / 命令补齐

> 补记。取证：`server/wysiwyg.test.js:77 / 86 / 107`、`server/preview-core.js:112 / 154 / 187 / 261 /
> 600 / 651 / 738 / 795`、`server/v09-multifile.test.js:52`、`docs/host-contract-pitfalls.md §5`、
> `samples/`。

### 一、仓库样例整篇换掉 —— 顺手把一整类脆弱测试清掉

`docs/` 里那句「真实语料只有 2 份」的两份之一就是新换上的这份（另一份是 `samples/sample.tex`）。
换样例的**真正代价**不在换文件，在于有一批测试是**钉死旧样例原话**的：
`\label{sec:method}`、`\sqrt{d_k}`、某一句具体的正文 —— 样例一换，整片红。
红得还很像真的坏了。

这一类测试改成**按形态找**：

- 按源码行区间找块；
- 取「第一个带 `\label` 的标题」，而不是 `\label{sec:method}` 那个标题；
- 取「第一个 `\section` 之后的第一行正文」，而不是某句话；
- 制造一次编辑也改成给第一段正文文字打补丁，而不是替换「经典任务」这四个字。

**换样例从此是安全的**：它只应该让「内容不同」的断言变，不该让「结构对错」的断言变。

### 二、渲染侧补三件事

- **用户宏**：`\newcommand` / `\renewcommand` 现在会被收集成一张表，来源是**全源**
  （含导言区）+ `\input` 子文件递归；查表顺序**先于**内置命令 —— 用户重定义 `\vec`
  之类的构造能生效（这也正是它比内置表优先的原因）。`\input` 带进来的宏同样认。
- **附录字母编号**：`\appendix` 之后最外层章节改字母编号（A、B、…，子级 A.1），
  与 `parseBlocks` 渲染侧同一套规则，两处不留第二把尺子。
- **符号与命令补齐**：论文正文常见、此前缺失的符号与命令补上（`preview-core.js:112 / 187`）。

### 三、`notrat.minVersion` 抬到 1.3.3（并写清它是什么）

插件真的用到了 1.3.3 才进注册表的 `editors[].outlineTool`、`notrat-outline-navigate`、
`ui[].extensions`（含 `extractToolText`），所以下限从 1.3.0 抬到 1.3.3 ——
不再声明一个自己并不需要的下限。

顺带把一件事写死进文档（`docs/host-contract-pitfalls.md §5`）：**这个字段是声明，不是闸门。**
核验过运行中的宿主 `app.asar`：42 处 `minVersion` 全部来自第三方库
（protobufjs、semver、TypeScript 的 `ScriptVersionCache`），**没有一处读 `notrat.minVersion`**。
所以低于 1.3.3 的宿主照样加载插件，只是那些 1.3.3 契约不在位。
契约到底在不在，用 `.setup/check/live-host-contract.js` 现场核对，别信旧快照。

---

## v0.9.4 — 多文件大纲（`\input` 展开）+ 编码嗅探（UTF-16）

> 补记。取证：`server/index.js:217 / 632 / 1110`、`server/tex-encoding.js`、
> `.setup/check/v094-outline-multifile.js`（门禁第 28 层，30 项）、`docs/v0.9-status.md`。

**用户报的症状**：打开一个 `.tex`，左侧大纲**一条都没有** —— 「该文件没有大纲条目」，
`latex_outline` 也没返回条目。

### 一、两个真成因

**① 主文件里只有一串 `\input`，章节全在子文件里。** 旧实现只扫**当前打开的那一个文件**，
所以主文件的大纲必然是空的 —— 跟换不换电脑无关，是这个文件本身就这样。
（`latex_outline` 还有一个独立的坏法：它没返回条目。）

**② 文件存成 UTF-16。** Windows 记事本「另存为 → 编码：Unicode」的默认就是 UTF-16，
按 utf8 硬读时 `\section` 每个字符之间夹一个 `\x00`，**一条也匹配不到**。

### 二、改法

- `parseTex` 拆成两件事：**单文件解析**（`parseTexSingle`）+ **展开**（`expandIncludes`）。
- 子文件章节的 `anchor` **落回父文件里那条 `\input` 的行号** ——
  点它，光标在当前打开的文件里定位，**不会跳到别的文件去**；标题后标出来源子文件。
- 源码读统一走新模块 `server/tex-encoding.js`：**BOM → 无 BOM 时的 NUL 分布 → utf8 兜底**，
  而且**只读不写盘**（这条限定后来在 v0.9.5 变成了关键）。
- 顺带改掉一句会误导人的文案：大纲被深度滤空时，旧文案一口咬定「未发现 `\section`」，
  把用户往错方向指。
- 构建侧：`build-singlefile.js` 的 MCP server 拷贝清单**漏了 `tex-encoding.js`**，
  结果是 **MCP server 直接起不来** —— 补上。这类「新增模块忘了进拷贝清单」的坑，
  判据只有一条：新模块 `require` 出来之后，去 `.notrat/tools/` 里看它在不在。

### 三、验证

`.setup/check/v094-outline-multifile.js`（**门禁第 28 层，30 项**）：`\input` 展开、
UTF-16 两种字节序、循环引用、深度过滤文案。

—— 但这一版只修了**读**的一侧。写的那一侧是同一年的 v0.9.5。

---

## v0.9.5 — 快照 / 恢复按字节走（「版本时光机」不再改坏 UTF-16 的 `.tex`）

> 开发期在提交信息与 `docs/v0.9-status.md` 里记作 **0.9.4f**，发布定为 **0.9.5**。
> 理由（先核实再下结论）：远端 Release 只有 `v0.9.3`，**`v0.9.4` 从未发布** ——
> 所以「0.9.4 已经出门」是错的。但 0.9.4 这个号在本机**已经对应过一份带缺陷的字节**
> （仓库根那份 `notrat-latex-plugin-0.9.4.zip`，以及 `~/.notrat/plugins/` 里 version 为 0.9.4
> 的那份装机件），同名覆写会让「0.9.4 到底是哪一份」在本机永远无解，所以另起 0.9.5，不动旧包。
> 取证：`server/contrib.js`（快照区）、`.setup/check/v094-history-bytes.js`（门禁第 29 层，76 项）、
> `.setup/test-nav.js` 等三处临时路径改动。

`latex_backup` 与 `latex_history action=restore` 是插件里**唯一**一条
「把盘上的字节读进来、再写回去」的路径，而它一直跟着
`readFileSync(..., "utf8")` / `writeFileSync(..., "utf8")` 走。

### 一、坏在哪：不是「打不开」，是**伪造 diff**

`.tex` 存成 UTF-16 时，这条路径两端都不是原件：

1. **快照从第一份起就不是原文件的字节** —— 成片的 `\x00` 被折进 utf8 解码、坏字节变 `U+FFFD`；
2. **「恢复」完盘上的文件跟快照的源文件也不相等。**

后果不出现在屏幕上，只出现在**证据链**上：时光机在一份**根本没坏**的文件上伪造出 diff。
用户或审查者会把它当成真改动去回滚，而回滚回去的又不是原件。
这类缺陷比崩溃危险 —— 崩溃会喊，它不会。

### 二、为什么 0.9.4 修过「编码」还会漏

0.9.4 修的是**读**的一侧（`tex-encoding.js` 只读嗅探，大纲 / 统计 / 引用校验全走它，
症状确实全消）。**只读嗅探治不了「往返」** —— 写路径当时漏了，
于是它成了唯一还在把 UTF-16 文件改坏的地方。

### 三、改法（`server/contrib.js`）

- `backupTex`：`fs.readFileSync(filePath)` **不带编码** → `Buffer`；
  去重判等 `prev.equals(cur)`（**必须是 `Buffer#equals`**，理由见下）；
  `fs.writeFileSync(dest, cur)` 原样落盘。
- `restoreSnapshot`：读快照同样不带编码，写回 `fs.writeFileSync(filePath, content)` 不做编解码。
- 快照命名、去重语义、保留数裁剪、恢复前先给当前内容另存一份 —— **行为一律不变**，
  只是判等与落盘换成字节。

**为什么去重也必须按字节**：utf8 解码是**有损**的，两份不同字节（`\xff` / `\xfe`）
都解成同一个 `U+FFFD` —— 按字符串比会判「一致」，
于是**快照被静默吃掉**（本该存下一份不同的内容，结果什么都没存）。

### 四、验证

`.setup/check/v094-history-bytes.js`（**门禁第 29 层，76 项**）：

- **A** 四种落盘形态（UTF-16LE+BOM / UTF-16BE+BOM / UTF-8+BOM / 纯 UTF-8）真调 `contrib.js`：
  快照 == 原件、恢复后 == 原件（逐字节 + sha256）；清单行协议未变。
- **B/C** 保留数 `keep=2` 之后留下的确实是最近两版（逐字节核对内容）。
- **D** 端到端**真 stdio 调 MCP**：`latex_backup` → 改坏（往 UTF-16 文件里追加 UTF-8 正文）
  → `latex_history list` → `restore`，逐字节 + sha256 对账；恢复前的坏版本也另存了一份（可再回退）。
- **E 护栏 + 反空转**：快照区不许再出现任何字符串编解码（源码级扫描）；
  **且同一份夹具上旧写法必须仍然有损** —— 否则这一层会「永远通过」而毫无意义。

门禁前后对照（同一份夹具）：修复前 60 通过 / 16 失败、退出码 1
（D3 快照 sha `67cbf271…` ≠ 原件 `07537ac6…`）；修复后 76 通过 / 0 失败、退出码 0。
外部独立复核：`sha256sum` 对「原件 / 快照 / 恢复后」三个文件，四种形态三列哈希全同。

### 五、同一版还修掉一类「假红」：门禁的临时路径

并发跑两份门禁会踩同一个临时文件：一份正在 esbuild 往 `os.tmpdir()/latex-nav/editor.cjs`
里写，另一份已经在读它 —— 读到半截文件就报
`SyntaxError: Invalid regular expression: missing /`。

**这是假红，而且最坏的一点是它把人指向错误的方向**：看上去像源码里有语法错，
实际只是两个进程共用一个临时文件；顺着它去查源码，查一天也查不出东西。

改成三处**每进程一套**：`test-nav.js` 的 `TMP` 带 pid；`check-v089-focus.js` 的
`_tmp-focus-gate*.js` / `_prod-editor.js` 带 pid；`check-v070.js` 的 esbuild outfile 带 pid
（父进程写完才起子进程，但**两个父进程之间并不互斥**）。跑完各自收拾，不留垃圾。

验证方式就是当初踩出假红的那一下：**两份门禁同时跑，两份都 29/29 全绿**。

### 六、教训

1. **只读嗅探治不了「往返」。** 任何把字节读进来又写回去的路径，都得自己按字节走
   （读不带编码参数、比较用 `Buffer#equals`、写回原样字节）。
   自检标准很简单：这条路径的两端是不是同一份文件？是，就别让字节经过字符串。
2. **并发不互斥的测试会给出「看起来像源码有问题」的假红。** 假红比漏报更贵 ——
   漏报只是没发现问题，假红会让人去修一个不存在的问题。共用临时路径的测试，
   等于把「跑一遍」和「跑两遍」变成了两种不同的实验。
3. **版本号也是证据。** 0.9.4 那个包已经出门，就不能拿 0.9.4 再发一份不同的字节：
   同一个版本号对应两份字节，会让「这个包到底是哪一版」这个问题永远无解。


---

## v0.9.6 — 引擎一键安装（把 `.setup/` 里那份只有开发者看得见的脚本，接进用户能点的按钮）

**取证位置**：`server/engine-install.js`（新）、`.setup/check/v096-engine-install.js`（门禁第 30 层）、
`.setup/gate-v070.js` 层清单、`panels/editor.tsx` 的首屏提示条。

### 一、起因：同一件事有两份实现，用户只看得见难的那份

没装 TeX 引擎的人，此前只会看到一句 `winget install MiKTeX.MiKTeX` —— 要管理员权限、几百 MB、
装完还得等 PATH 生效、装在非标准位置还认不出。

而**真正好用的那条路一直是存在的**：Tectonic 单文件（免管理员、免配 PATH、解压即用）。
`.setup/install-tectonic.js` 里写着，本机那个 `~/.notrat/tools/bin/tectonic.exe` 就是这么装的。
问题在于它是 `.setup/` 下的**开发者脚本**：用户看不到它，只能看到难的那条。

这一版要修的就是这个落差 —— 不是「再写一个安装器」，而是**把已有的那份搬到用户够得着的地方**。

### 二、改法

**服务端** `server/engine-install.js`（零依赖，只用 Node 内置模块 —— 为装个引擎再装 npm 包等于加门槛）：

| 关心的事 | 做法 |
|---|---|
| 平台 × 架构 → 下哪个文件 | 一张**写死的表**，对着上游 `tectonic@0.17.0` 的 10 个产物逐个核过 |
| 落到哪 | `~/.notrat/tools/bin` —— `contrib.js` 的 `probeDirs()` 第一项就是它，**装完无需配 PATH** |
| 下载 10~22MB 要几分钟 | **异步**：`startInstall()` 立刻回 `jobId`，真活在后台跑；进度 / 取消 / 结果走 `latex_engine_install_status` |
| 下到一半断了 | 下载 → 解压 → **试跑** 全在临时目录里做，**验过版本才搬进去** |
| 搬过去之后坏了 | 搬运后再验一次，坏了**立刻删掉**（宁可没有，也不要一个「存在但跑不动」的文件） |
| 目标已有引擎 | 直接拒绝 —— 不替用户毁掉一个能用的引擎；要重装得显式 `force=true` |
| 国内下不动 | `mirror` 前缀（设置项 / 参数）；API 也被墙就填 `version` **绕开 API 直接拼地址** |
| 网络要走代理 | `proxy` 参数 / 设置项；留空自动读 `HTTPS_PROXY`，`off` 强制直连 |

**面板**：首屏提示条上多一个「⬇ 一键安装引擎」。进度就长在提示条里（不弹对话框 —— 装引擎是「几分钟的小事」，
为它挡住整个编辑器不值当）；装完自动 `latex_env action=reset` 重探 + 撤掉整条提示 ——
用户不用再点任何东西。重开编辑器还会**续上**服务端仍在跑的任务，不让它变成孤儿。

**两个新设置项**（`mirror` / `proxy`）都按 `${settings:x}` 注入 —— 注意 `validate-manifest.js`
会**报错**任何解析不到字段的引用，所以不能照 `contrib.js` 注释里那套 `_ALT` 写法（那套在现行校验下不可用）。

### 三、这一版最值钱的三条：全是「本机好好的」型缺陷

它们在本机跑一百遍都正常，是**门禁与真下载**一点一点逼出来的：

**① GNU tar 会把 `-C C:\...` 当成「远程主机 C」**

```
tar (child): Cannot connect to C: resolve failed
```

Git Bash / MSYS 的 PATH 下必然踩到，而 Windows 自带的 bsdtar 反而没事 ——
典型「换台机器 / 换个 shell 才炸」的那类。改成先试**相对路径 + cwd**（GNU tar 与 bsdtar 都成立），
失败再退回绝对路径。

**② 走代理时没发 `Host` 头，GitHub 直接 400**

CONNECT 隧道里如果只给 `socket` 而不给 `host`/`hostname`/`port`，Node 不知道往 `Host` 里写什么：

```
HTTP 400 Bad Request ← https://api.github.com/repos/tectonic-typesetting/tectonic/releases/latest
```

补上这三个字段即通。**同一条路直连是好的** —— 只测直连永远发现不了这条。

**③ `verifyBinary("")` 会抛 `ERR_INVALID_ARG_VALUE`**

「跑不起来」本该是**返回值**，不是异常 —— 调用链靠这个返回值决定要不要落位。
现在空入参 / 非字符串 / `spawnSync` 自己抛错，一律返回 `{ok:false, msg}`。

### 四、验证

`.setup/check/v096-engine-install.js`（**门禁第 30 层，80 项**，**默认不联网**）：

- **A 跨平台资产表**：8 种平台/架构组合逐个对；「上游没发 win/arm64 时退 x64」这件事被**显式写出来**
  （往注释里藏一句不算）；不支持的平台/架构要**说清认识哪些**并给手动安装命令，而不是沉默。
- **B URL 拼装**：资产名与下载地址对上游**真实文件名**逐个核（含 `tectonic@0.17.0` 的 tag 形状）；
  镜像前缀对**下载地址与 API 地址都生效**（只管下载不管查版本 = 国内照样卡在第一跳）。
- **C 设置项注入的坑**：宿主没配过时会把 `${settings:mirror}` **原样传下来** —— 那必须当「没设置」，
  否则会把占位符拼进 URL。代理决策 `off / 自动 / 显式 / 带认证 / 非法` 五条路，外加 `NO_PROXY` 匹配。
- **D 干跑 `describe()`**：不发一个请求就摊开「会下哪个、落到哪、走不走代理」——
  排查「装不上」时先看它，多数问题在 URL 和代理这两行上就现形。
- **E 真解压（不联网）**：自造同构 tar.gz → 递归找到可执行 → 试跑；坏包要**列出试过哪些解压命令**
  （否则用户只看到一句「解压失败」无从下手）；并断言解压策略里**真的含「相对路径」那条**（① 的解药）。
- **F 不留半成品**：目标已有引擎时**拒绝**，且拒绝时不联网、不动那个文件。
- **G 契约与接线**：真 stdio 调 MCP —— 两个工具都在 `tools/list`、描述点明「异步」与
  「不传 jobId = 查最近一个」、挡下覆盖时把 `force` 的用法说清、未知 jobId 返回 `none` 而不是崩；
  面板源码真调这两个工具、真轮询（`setTimeout` 串行而非 `setInterval`）、真取消、卸载真清定时器、
  装完真 `reset` 再报喜。
- **G′ 反回归**：从 `index.js` 出发算 `require` **闭包**，断言 ⊆ 构建拷贝清单 ——
  v0.9.4 那个「加了文件忘进清单 → 装机后 MCP server 起不来」的坑，从此由门禁守着
  （不「扫全目录」：那样会把只被测试引用的 `docmodel/txlog` 也算进来，天天误报）。
- **H 真下载**（`NOTRAT_ENGINE_E2E=1` 才跑，约 20MB）：装到临时目录、验版本、留 sha256、临时目录清空。

### 五、教训

1. **「本机好使」不是证据。** 这一版三条缺陷，没有一条在本机能复现：
   GNU tar 是**换了 shell** 才现形、缺 `Host` 头是**走了代理**才现形、
   空入参是**出错路径**才现形。能自动化的失败场景要自动化，不能自动化的要写进门禁的断言里。
2. **代理这条路上，「小请求通」推不出「大请求通」，反过来说也成立。**
   同一个代理，小 `GET` 好好的、大 `POST` 会被掐（上一版发 Release 的时候踩过）。
   验网络功能时要把两条路（直连 / 代理）都跑一遍，否则验的是「我这台机器恰好怎么走」。
3. **能拒绝就别猜。** 目标已有引擎时拒绝、平台不认识时说清认识哪些、
   解压失败时列出试过哪些命令 —— 这三个「说不」的地方，恰好是用户最需要信息的地方。
4. **搬实现之前先看一眼它为什么没被搬过来。** `.setup/install-tectonic.js` 躺了半年没人用，
   不是因为它不好，而是因为它没接到用户够得着的地方。功能没接进 UI，等于没做。
