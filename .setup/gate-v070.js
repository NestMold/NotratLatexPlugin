/* 验收门 —— 一条命令跑完全部层次，任何一层红了就退出非零
 *   [1] TDZ 顺序哨兵      : 依赖数组「先用后声明」——esbuild/tsc 都不报，只能静态查（0.7.1 加）
 *   [2] 内核单测         : 块模型 / applyEdits 不变式 / 行内往返（Node，无 DOM）
 *   [3] 面板离线编译      : 按装机同规则内联后 esbuild 编译（含重名、module.exports 残留检查）
 *   [4] 真 DOM 往返       : 装机包里的代码 + jsdom 真解析器 —— ★ 零改动往返必须逐字节还原
 *   [5] 样式一致性        : 就地编辑 ↔ 只读预览（0.7.3 加）
 *   [6] 形态门禁          : 「在结果上编辑」的硬约束 —— 不许再长出卡片壳 / 模式开关（0.8.0 加）
 *   [7] 模式契约          : 档位入口只剩宿主标签栏一处，喂两代 props.mode 断言落档与回写 id（0.8.3 加）
 *   [8] 导出契约          : 唯一会往磁盘写文件的功能 —— 产物落点 / 自包含性 / 样式单一来源（0.8.4 加）
 *   [9] 引擎自检          : 没装 TeX 引擎时该弹才弹 / 只弹一次 / 说的是实话（0.8.5 加）
 *   [10] 格式快捷键       : Typora 键位 → LaTeX；菜单右侧标的键位必须真的实现了（0.8.6 加）
 *   [11] 切视图往返       : 可视化 → 源码 → 回可视化，正文必须还在（0.8.8 加）
 *   [12] 焦点不掉         : 按钮不夺焦；切档 / 收起浮层之后还能接着按键（0.8.9 加，0.8.10 扩到全部瞬态 UI）
 *   [13] 能正常编辑       : 可视化档（默认那一档）的 Ctrl+1 设标题 / 回车换行 / 光标落进正文（0.8.11 加）
 *   [13] 端到端综合       : 大纲跳转 / 状态栏 / 格式键真派发（test-nav.js 的 50+ 项；0.8.9 收编）
 *   [18] 块外的字         : 真组件 + jsdom 真 DOM —— 光标停在块外时敲的字不许静默丢（0.8.20 加）
 *   [19] 撤销看得见       : 打完字 Ctrl+Z —— 屏幕与源码必须一起回去（0.8.21 加）
 *   [20] 代码 / 内容分道   : \maketitle / \end{document} 不再当代码摊在预览里；
 *                            光标再也停不进命令行（0.8.22 加）
 *   [21] 结构改动后重画   : 「已设为 \section」有时不生效 —— 源码对了屏幕也得跟着动（0.8.23 加）
 *   [22] 分屏两栏同步     : 「分屏那里没有同步呢」—— 滚动联动只有一半（滚动层→源码栏那条
 *                            通路从来没挂过）；双向联动还得不打架（0.8.24 加）
 *   [23] 分屏内容同步     : 「我想边打边看到源码变化」—— 打字过程中左栏一直是旧的，
 *                            要点一下（＝失焦）才刷新；门禁此前把「失焦后写回去」
 *                            当成了「同步」（0.8.25 加）
 *   [24] 回车分层         : 「换行这些特别不丝滑，不适合续写」（0.8.26 建）之后又一句：
 *                            「把回车改成新建段落：回车落一个空行 = 新段落，段内换行改用
 *                            Shift+Enter」（0.8.27 按用户要求改判）—— Enter 插两个 <br>、
 *                            Shift+Enter 插一个；这一层当年只能钉**文本**（产物里有没有
 *                            execCommand 那句），而 jsdom 里根本没有 execCommand ——
 *                            23 层门禁一次没真的按过回车，所以现在钉的是**行为**
 *   [25] 行区间           : 段落一拆，下面所有块的行号都得跟着挪 —— 不挪的话下一笔回写
 *                            按旧区间 replace，源码里凭空多出一份**重复的正文**（0.8.27 加）
 *   [28] 多文件大纲       : 「该文件没有大纲条目」的两个真成因 —— 主文件里只有 \input、
 *                            文件存成 UTF-16（记事本「Unicode」）。展开子文件章节 +
 *                            编码嗅探，且子文件章节的 anchor 必须落回父文件那行（0.9.4 加）
 *   [29] 快照字节级       : .latex-history 的「版本时光机」——.tex 存成 UTF-16 时，
 *                            旧代码把快照和恢复都当字符串走 utf8 读写：快照本身就不是
 *                            原件字节，恢复回去的也不是原件 —— 在一份根本没坏的文件上
 *                            伪造出 diff（用户会把假的当真的去回滚）。快照 / 恢复全程
 *                            按字节走，且**去重也要按字节**（utf8 有损解码会把两份不同
 *                            字节解成同一个串，那时快照会被静默吃掉）（v0.9.4f 加）
 *   [26] 光标几何 / 全选   : 「鼠标点击到块末尾的时候没有看到光标呢」「在编辑器内无法全选呢」
 *                            —— 空落脚行上放零宽占位（<br> 之后没有节点时 Chromium 算不出
 *                            光标几何，rect = 0,0,0,0）；Ctrl+A 由插件自己接管（0.8.29 加，
 *                            真浏览器复验可选：NOTRAT_CARET_BROWSER=1）
 *
 * 为什么要第 [1] 层：0.7.0 线上出过
 *   ReferenceError: Cannot access 'renderMath' before initialization
 * 它既不是语法错也不是类型错，[3] 编译通过照样炸。顺序问题必须在运行前拦住。
 *
 * 运行： node .setup/gate-v070.js     （或 npm run gate）
 */
const { spawnSync } = require("child_process");
const path = require("path");

const ws = "E:/notrat-latex-plugin";
const steps = [
  { name: "TDZ 顺序哨兵（check-tdz.js）", file: ".setup/check-tdz.js" },
  { name: "内核单测（wysiwyg.test.js）", file: "server/wysiwyg.test.js" },
  { name: "无损 CST：parse/serialize 逐字节（server/v09-docmodel.test.js）", file: "server/v09-docmodel.test.js" },
  { name: "事务历史：coalesce / rebase / gaps（server/v09-txlog.test.js）", file: "server/v09-txlog.test.js" },
  { name: "面板离线编译（check-v070.js）", file: ".setup/check-v070.js" },
  { name: "真 DOM 往返（check-v070-dom.js）", file: ".setup/check-v070-dom.js" },
  { name: "样式一致性：就地编辑 ↔ 只读预览（check-v073-style.js）", file: ".setup/check-v073-style.js" },
  { name: "形态：在结果上编辑，不是编辑模式（check-v080-flat.js）", file: ".setup/check-v080-flat.js" },
  { name: "模式契约：宿主标签栏开关 → 档位 / 回写 id（check-v083-mode-contract.js）", file: ".setup/check-v083-mode-contract.js" },
  { name: "导出契约：产物落点 / 自包含 / 样式单一来源（check-v084-export.js）", file: ".setup/check-v084-export.js" },
  { name: "引擎自检：提示条该弹才弹 / 只弹一次 / 说的是实话（check-v085-env-banner.js）", file: ".setup/check-v085-env-banner.js" },
  { name: "格式快捷键：菜单标的键位 == 真的实现了的键位（check-v086-keys.js）", file: ".setup/check-v086-keys.js" },
  { name: "切视图往返：可视化 → 源码 → 回可视化，正文还在（check-v087-roundtrip.js）", file: ".setup/check-v087-roundtrip.js" },
  { name: "焦点不掉：按钮不夺焦 / 切档与收浮层后焦点不掉（check-v089-focus.js）", file: ".setup/check-v089-focus.js" },
  { name: "能正常编辑：可视化档 Ctrl+1 设标题 / 回车插 <br> / 光标落进正文（check-v0811-edit.js）", file: ".setup/check-v0811-edit.js" },
  { name: "可撤销：打完字撤得动 / 切档不丢历史 / 外部改动不清栈（check-v0818-undo.js）", file: ".setup/check-v0818-undo.js" },
  { name: "块外的字：刚输入就撤销说没有内容可以撤销（check-v0820-orphan.js）", file: ".setup/check-v0820-orphan.js" },
  { name: "撤销看得见：打完字 Ctrl+Z，屏幕与源码一起回去（check-v0821-undo-view.js）", file: ".setup/check-v0821-undo-view.js" },
  { name: "代码 / 内容分道：\maketitle 不进预览 / 字写不进命令（check-v0822-code-vs-content.js）", file: ".setup/check-v0822-code-vs-content.js" },
  { name: "结构改动后必须重画：已设为 \section 有时不生效（check-v0823-paint.js）", file: ".setup/check-v0823-paint.js" },
  { name: "分屏两栏同步：滚动联动两个方向 / 回声不打架（check-v0824-split-sync.js）", file: ".setup/check-v0824-split-sync.js" },
  { name: "分屏内容同步：右栏打字 → 左栏当场变（check-v0825-live-sync.js）", file: ".setup/check-v0825-live-sync.js" },
  { name: "回车分层：Enter 新段落 / Shift+Enter 段内换行（check-v0827-enter.js）", file: ".setup/check-v0827-enter.js" },
  { name: "行区间：段落一拆，下面所有块的行号跟着挪（check-v0827-span.js）", file: ".setup/check-v0827-span.js" },
  { name: "标题块跨多行：章节快捷键还能干活 / 取消层级不毁稿（_test-v0828-headspan.js）", file: ".setup/_test-v0828-headspan.js" },
  { name: "光标几何 / 全选：点块末尾有光标 + Ctrl+A 由插件自己说了算（check-v0829-caret.js）", file: ".setup/check-v0829-caret.js" },
  { name: "端到端综合：大纲跳转 / 状态栏 / 格式键真派发（test-nav.js）", file: ".setup/test-nav.js" },
  { name: "多文件大纲 + 编码嗅探：\\input 展开 / UTF-16 / 循环引用（v094-outline-multifile.js）", file: ".setup/check/v094-outline-multifile.js" },
  { name: "快照字节级：.latex-history 的 UTF-16 快照 / 恢复逐字节无损（v094-history-bytes.js）", file: ".setup/check/v094-history-bytes.js" },
];

let failed = 0;
const t0 = Date.now();
for (const s of steps) {
  console.log("\n" + "=".repeat(60));
  console.log("▶ " + s.name);
  console.log("=".repeat(60));
  const r = spawnSync(process.execPath, [path.join(ws, s.file)], { stdio: "inherit", cwd: ws });
  if (r.status !== 0) { failed++; console.log("✗ 这一层红了（退出码 " + r.status + "）"); }
}

console.log("\n" + "=".repeat(60));
console.log(failed === 0
  ? "✓ 验收门全绿（" + steps.length + "/" + steps.length + "，用时 " + ((Date.now() - t0) / 1000).toFixed(1) + "s）"
  : "✗ 验收门有 " + failed + " 层未通过");
process.exit(failed === 0 ? 0 : 1);
