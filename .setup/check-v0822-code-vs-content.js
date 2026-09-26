/* 层 [20] —— 「代码块 / 结构块」与「内容块」分道 + 「加内容块弄到了代码里面」（v0.8.22 加）
 *
 * 用户原话（三句话、三个真问题）：
 *   ①「预览还是有 \maketitle 和 \end{document} 这些代码呢」
 *   ②「无法区分代码和内容块」
 *   ③「我想要加内容块，貌似弄到了代码里面」
 *
 * 为什么必须新增一层（前面 19 层为什么都没拦住）：
 *   · check-v074-flat / check-v080-flat 只数了 `.wys-blk.wys-cmd` 的**个数**，
 *     从没问过「它排出来的到底是源码还是成品」—— 个数一直是 2，用户看到的却是源码；
 *   · ③ 更隐蔽：那三类块当时是 **可编辑** 的（在 WYS_WHOLE_BLOCK 里），光标能停进
 *     \maketitle 那一行，敲的字被整块读回、写进命令行。这是全文唯一一处能把正文写进
 *     命令的入口，而没有任何一层测过「点它会发生什么」。
 *
 * 这一层把三件事都钉住：
 *   [A] 渲染：结构块给标签 + 人话，源码行 hidden；可见文字里不许出现 \maketitle / \end{document}
 *   [B] 回写：块自己的 data-tex 是唯一权威（wysDomToTex(块) 也 == data-tex）——
 *       内部现在是渲染结果，靠遍历 DOM 拼源码等于把渲染结果当源码写回去
 *   [C] 行为（真组件 + jsdom 真 DOM）：点结构块 → 被接下 + 弹就地编辑器；点正文 → 不抢；
 *       就地改一条命令只动那一行；「¶ 新段落」按下去源码里真的长出新段落
 *   [D] 装机产物核对
 *
 * 运行： node .setup/check-v0822-code-vs-content.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");

const ws = path.join(__dirname, "..");
const pkgPath = "C:/Users/Administrator/.notrat/plugins/notrat-latex-plugin.json";
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok    " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra !== undefined ? "\n        → " + extra : "")); }
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const src = String(pkg.contributions.editors[0].source || "");
const editorSrc = fs.readFileSync(path.join(ws, "panels", "editor.tsx"), "utf8");
console.log("  产物版本：" + pkg.version + (pkg.version === "0.8.22" ? "" : "  ⚠ 与本次改动不符"));

/* ================= [A] 渲染：结构块按成品排，不摊源码 ================= */
console.log("\n[A] 预览里不再有 \\maketitle / \\end{document} 这些代码");

const iK = src.indexOf("const WYS = (function () {");
const iKEnd = src.indexOf("\n})();", iK) + 6;
const iH = src.indexOf("function escAttr(s) {");
const iHEnd = src.indexOf("\nfunction esc(s) {", iH);
if (iK < 0 || iKEnd < 6 || iH < 0 || iHEnd < 0) { console.error("✗ 装机包里切不出内核"); process.exit(1); }

const { JSDOM } = require(path.join(ws, "node_modules", "jsdom"));
const dom0 = new JSDOM("<!doctype html><html><body></body></html>");
const ctx = {
  document: dom0.window.document, window: dom0.window, console,
  Map, parseInt, String, Number, RegExp, JSON,
  LPC: require(path.join(ws, "server", "preview-core.js")),
};
vm.createContext(ctx);
vm.runInContext(
  src.slice(iK, iKEnd) + "\n" + src.slice(iH, iHEnd) +
  "\n; globalThis.__T = { WYS: WYS, wysRenderDoc: wysRenderDoc, wysDomToTex: wysDomToTex, WYS_TEX_BLOCK: WYS_TEX_BLOCK, WYS_CARET_BLOCK: WYS_CARET_BLOCK };",
  ctx
);
const T = ctx.__T;
const miniMath = (tex, disp) => ctx.LPC.miniMath(tex, disp);

const sample = fs.readFileSync(path.join(ws, "samples", "sample.tex"), "utf8");
const doc = T.WYS.parseDoc(sample);
const html = T.wysRenderDoc(sample, miniMath, path.join(ws, "samples"));
const dom = new JSDOM('<!doctype html><html><body><div id="r">' + html + "</div></body></html>");
const root = dom.window.document.getElementById("r");
const q = (sel) => Array.from(root.querySelectorAll(sel));

const structs = q(".wys-blk.wys-struct");
ok("样例里的 3 个结构块都进了「代码道」（实际 " + structs.length + "）", structs.length === 3);
ok("结构块 = 注释 / 命令 / 文档结尾",
  structs.map((b) => b.getAttribute("data-type")).sort().join(",") === "command,comment,tail",
  structs.map((b) => b.getAttribute("data-type")).join(","));

/* 「看得见的字」只算真的会被排出来的那两块（.wys-tag / .wys-say）。
 * 不能直接用 textContent —— 它连 [hidden] 的源码行一起算进来，那正是这次要测的东西。 */
const visible = (b) => {
  const t = b.querySelector(".wys-tag"), y = b.querySelector(".wys-say");
  return ((t ? t.textContent : "") + " " + (y ? y.textContent : "")).replace(/\s+/g, " ").trim();
};
structs.forEach((b) => {
  const ty = b.getAttribute("data-type");
  const s0 = parseInt(b.getAttribute("data-s"), 10), e0 = parseInt(b.getAttribute("data-e"), 10);
  const blk = doc.blocks.filter((x) => x.startLine === s0 && x.endLine === e0)[0];
  ok("[" + ty + "] 有类型标签 .wys-tag", !!b.querySelector(".wys-tag"));
  ok("[" + ty + "] 有一句人话 .wys-say（非空）", visible(b).length > 0, JSON.stringify(visible(b)));
  ok("[" + ty + "] 源码行 hidden（不再摊在预览里）", !!b.querySelector(".wys-edit") && b.querySelector(".wys-edit").hasAttribute("hidden"));
  ok("[" + ty + "] data-tex == 块模型里的原文（一个字都不差）",
    !!blk && b.getAttribute("data-tex") === blk.raw, JSON.stringify([b.getAttribute("data-tex"), blk && blk.raw]));
  ok("[" + ty + "] 标签 / 人话都不带源码（不回写渲染结果）",
    b.querySelector(".wys-tag").getAttribute("data-tex") == null && b.querySelector(".wys-say").getAttribute("data-tex") == null);
  ok("[" + ty + "] 整块 contenteditable=false（字写不进去）", b.getAttribute("contenteditable") === "false");
});

const visAll = structs.map(visible).join(" | ");
ok("★ 可见文字里没有 \\maketitle（用户原话①）", visAll.indexOf("\\maketitle") < 0, visAll);
ok("★ 可见文字里没有 \\end{document}（用户原话①）", visAll.indexOf("\\end{document}") < 0, visAll);
ok("★ 可见文字里没有裸的 % 记法", visAll.indexOf("% TODO") < 0 && visAll.indexOf("% FIXME") < 0, visAll);
ok("注释排出来的是注释的正文", visAll.indexOf("补充近三年") >= 0, visAll);
ok("文档结尾说清了「以下内容不参与排版」", visAll.indexOf("不参与排版") >= 0, visAll);
ok("命令块给的是人话（\\maketitle → 页首 / 标题）", visAll.indexOf("页首") >= 0, visAll);

/* 正文块必须干干净净 —— 这是「区分代码和内容」的另一半 */
const contentBlks = q('.wys-blk[data-type="paragraph"], .wys-blk[data-type="heading"]');
ok("正文块（标题 / 段落）不带代码道的类与标签（用户原话②）",
  contentBlks.length > 0 && contentBlks.every((b) => !b.classList.contains("wys-struct") && !b.querySelector(".wys-tag")));
const atomBlks = q(".wys-atomblk");
ok("原子块（公式 / 图 / 表）仍带 data-tex（就地编辑靠它）",
  atomBlks.length > 0 && atomBlks.every((b) => b.getAttribute("data-tex") != null));

/* ================= [B] 回写：data-tex 是唯一权威 ================= */
console.log("\n[B] 回写权威 = 块自己的 data-tex（内部全是渲染结果，绝不参与拼源码）");

ok("结构块走 DOM 拼源码也等于 data-tex（两道口径一致）",
  structs.every((b) => T.wysDomToTex(b) === b.getAttribute("data-tex")),
  JSON.stringify(structs.map((b) => [T.wysDomToTex(b), b.getAttribute("data-tex")])));
ok("常量 WYS_TEX_BLOCK 只含这三类（不误伤 heading / paragraph）",
  !!T.WYS_TEX_BLOCK && T.WYS_TEX_BLOCK.comment === 1 && T.WYS_TEX_BLOCK.command === 1 && T.WYS_TEX_BLOCK.tail === 1
  && !T.WYS_TEX_BLOCK.paragraph && !T.WYS_TEX_BLOCK.heading);
ok("commitWys 用了这条短路（结构块直接取 data-tex，DOM 全是渲染结果）",
  editorSrc.indexOf("const ownTex = WYS_TEX_BLOCK[") >= 0
  /* v0.8.26：块级读回换成了 wysBlockTex（吃掉段末那个落脚换行 —— 不吃就会在源码里
   * 凭空多一个空行 = LaTeX 断段）。断的**事**没变：结构块仍走 data-tex 这条短路。 */
  && editorSrc.indexOf("const now = ownTex != null ? ownTex : wysBlockTex(anchor);") >= 0);
ok("空编辑集仍然逐字节还原（内核硬不变式）", T.WYS.applyEdits(sample, []) === sample);
ok("★ 零改动往返：每一块回读仍逐字节等于原文", (function () {
  const edits = [];
  const blks2 = q(".wys-blk");
  for (const b of blks2) {
    const s0 = parseInt(b.getAttribute("data-s"), 10), e0 = parseInt(b.getAttribute("data-e"), 10);
    if (b.getAttribute("data-type") !== "preamble" && !b.querySelector(".wys-edit")) continue;
    const blk = doc.blocks.filter((x) => x.startLine === s0 && x.endLine === e0)[0];
    if (!blk) continue;
    const own = T.WYS_TEX_BLOCK[b.getAttribute("data-type")] ? b.getAttribute("data-tex") : T.wysDomToTex(b);
    if (blk.type === "heading") { if (own !== blk.title) edits.push(blk.type + "@" + s0); }
    else if (own !== blk.raw) edits.push(blk.type + "@" + s0);
  }
  return edits.length === 0;
})(), "有块回读 != 原文");

/* ================= [C] 点击行为（顺序 + 真实派发） ================= */
console.log("\n[C] 点结构块 → 就地编辑器；光标再也落不进命令行");

const iFM = editorSrc.indexOf("function onPreviewMouseDown(e) {");
const segFM = editorSrc.slice(iFM, editorSrc.indexOf("function caretToNearest(y) {", iFM));
ok("点结构块的那一路在（.wys-struct → openAtom）",
  /closest\("\.wys-struct"\)[\s\S]{0,120}?openAtom\(st\)/.test(segFM));
ok("★ 顺序对：结构块那一路排在 `.wys-edit` 放行**之前**（否则点在源码行上就漏过去了）",
  segFM.indexOf('closest(".wys-struct")') < segFM.indexOf('closest(".wys-edit")'));
ok("整块守卫收窄到正文类（结构块有第二道保险）",
  segFM.indexOf("if (ty && WYS_CARET_BLOCK[ty] && host.querySelector(\".wys-edit\")) return;") >= 0
  && segFM.indexOf("WYS_WHOLE_BLOCK[ty] && ty !== \"preamble\"") < 0);

console.log("\n── 行为级：真组件 + jsdom 真 DOM ──");
const mk = spawnSync(process.execPath, [path.join(__dirname, "_mkprobe-undo.js")], { stdio: "pipe", cwd: ws });
if (mk.status !== 0) { ok("探针 harness 可组装", false, String(mk.stderr || "").slice(0, 300)); }
else {
  const mk2 = spawnSync(process.execPath, [path.join(__dirname, "_mkprobe-v0822.js")], { stdio: "inherit", cwd: ws });
  if (mk2.status !== 0) { ok("v0822 探针可组装", false); }
  else {
    const r = spawnSync(process.execPath, [path.join(__dirname, "_probe-v0822.js")], { stdio: "inherit", cwd: ws });
    ok("行为级探针全绿（点结构块 / 改命令 / 新段落 / 反例）", r.status === 0, "退出码 " + r.status);
  }
}

/* ================= [D] 装机产物核对 ================= */
console.log("\n[D] 装机产物核对（发布出去的那份必须有这一改）");
const marks = [
  ["结构块渲染带 .wys-struct", 'class="wys-blk wys-struct '],
  ["结构块整块只读", 'contenteditable="false" data-key="blk:'],
  ["源码行 hidden（不再摊在预览里）", ' data-tex="\' + escAttr(raw) + \'" hidden>'],
  ["类型标签 .wys-tag", 'class="wys-tag"'],
  ["人话 .wys-say", 'class="wys-say"'],
  ["命令人话表", "const WYS_CMD_SAY = {"],
  ["文档结尾的自述", "正文到此结束 —— 这一行以下的内容不参与排版"],
  ["回写权威常量", "const WYS_TEX_BLOCK = { comment: 1, command: 1, tail: 1 };"],
  ["commitWys 用 data-tex", "const ownTex = WYS_TEX_BLOCK["],
  ["点结构块开就地编辑器", 'const st = t.closest(".wys-struct");'],
  ["分道 CSS", ".wys-blk.wys-struct{padding:1px 0 1px 10px;border-left:2px solid"],
  ["「¶ 新段落」入口", "¶ 新段落"],
  ["新段落函数", "function addParagraph() {"],
];
for (const [n, s2] of marks) ok(n, src.indexOf(s2) >= 0);
ok("反面：旧渲染（结构块直接排原始源码）不许回来",
  src.indexOf("'<div class=\"wys-blk ' + cls + '\"' + base + \">\" +\n          '<span class=\"wys-edit\">'") < 0
  && src.indexOf('三者都只是「一行源码」') < 0);
ok("反面：点结构块时不许再「不夺默认行为」（那正是字写进命令的原因）",
  src.indexOf('if (ty && WYS_WHOLE_BLOCK[ty] && ty !== "preamble" && host.querySelector(".wys-edit")) return;') < 0);

console.log("\n" + "=".repeat(64));
console.log(fail ? "✗ 这一层有 " + fail + " 项未通过（通过 " + pass + "）"
                 : "✓ 代码 / 内容分道 + 字再也写不进命令（渲染 + 回写 + 行为 + 产物，共 " + pass + " 项）");
process.exit(fail ? 1 : 0);
