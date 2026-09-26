/* 层 [24] —— 回车分层：Enter = 新段落 / Shift+Enter = 段内换行（v0.8.27 按用户要求改判）
 *
 * 用户原话：「把回车改成新建段落：回车落一个空行 = 新段落，段内换行改用 Shift+Enter」。
 *
 * 这一层的前身是 v0.8.26 的「回车换行」（同一个文件名换了个版本号），当时的判据是
 * 「段末按一下回车 = 源码零改动；连按两下 = 恰好一个空行」—— 那是**按当时「回车 = 段内
 * 换行」的语义**定的数，两条都对；把两个动作对调之后，同一个「一个空行」变成按**一下**，
 * 判据跟着改，算式一个字没动（块级读回仍吃掉段末那一个落脚换行）。
 *
 * 为什么这一层当年非建不可（这段历史别删，它解释了为什么这里必须钉**行为**而不是文本）：
 * 旧实现是 `document.execCommand("insertHTML", false, "<br>")`，而 jsdom 里根本没有
 * execCommand —— 23 层门禁里关于回车的那两条只能是**文本断言**（「产物里有没有这句话」）。
 * 一句话在不在，与「按一下回车源码会变成什么」是两件毫不相干的事。
 *
 * 这一层钉三件事：
 *   [A] 源码分寸：回车这一拍分两个动作（Enter → 插两个 <br>；Shift+Enter → 插一个 <br>），
 *       落点仍由自己动 Range 定死；只读孤岛 / 不是编辑宿主一律不动手；已经站在空段落上
 *       不再补（LaTeX 里空段落不存在）；组字中的回车一律放行；回车这一拍不记账、不弹提示
 *   [B] 行为（真组件 + jsdom 真 DOM；浏览器那一侧用最小但忠实的 Range/Selection 替身补上）：
 *       段末回车 → 两个 <br> + 光标在新段落行首 + 源码恰好一个空行；再按一次不许多塞；
 *       段中 Shift+回车 → 一行拆两行且空行数不变；段中回车 → 恰好一个空行（真分成两段）；
 *       回车后接着打两笔 → **源码里不许出现重复的正文**（行区间那条，与 [25] 层同一件事的
 *       两个面）；失焦/撤销之后字与段落结构都回得去
 *   [C] 装机产物核对
 *
 * 运行： node .setup/check-v0827-enter.js
 */
const fs = require("fs");
const path = require("path");
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
const mf = JSON.parse(fs.readFileSync(path.join(ws, "manifest.json"), "utf8"));
console.log("  产物版本：" + pkg.version + " / manifest " + mf.version);

/* 取一个函数的整段（从 `function NAME(` 到下一个同缩进的函数声明）。
 * 不写死「下一个函数叫什么」—— 那种写法会在函数顺序调整时静默变空段，断言就全「过」了。 */
function fnBody(name) {
  const i = editorSrc.indexOf("function " + name + "(");
  if (i < 0) return null;
  const m = /\n  (?:async )?function [A-Za-z_$]/.exec(editorSrc.slice(i + 10));
  return m ? editorSrc.slice(i, i + 10 + m.index) : editorSrc.slice(i);
}
/* 只留**代码行**：注释里写着旧写法是好事（它记着为什么改），但「代码里还有没有这个调用」
 * 是另一件事。混成一条断言，就等于逼后来的人把注释也删干净来换绿灯。 */
function codeOf(text) {
  return String(text).split("\n").filter(function (line) {
    const s = line.trim();
    return !(s.indexOf("*") === 0 || s.indexOf("//") === 0 || s.indexOf("/*") === 0);
  }).join("\n");
}
const codeOnly = codeOf(editorSrc);
const pkgCode = codeOf(src);

/* ================= [A] 源码分寸 ================= */
console.log("\n[A] 回车分层：Enter 插两个 <br>（新段落）/ Shift+Enter 插一个 <br>（段内换行）");

const segPara = fnBody("insertParaBreak");
const segBreak = fnBody("insertSoftBreak");
ok("两个动作各有一个插入函数（insertParaBreak / insertSoftBreak）",
  segPara != null && segBreak != null);
ok("★ 新段落插的是**两个** <br>（一个 = 段内换行，两个 = 空行 = 分段）",
  segPara != null && segPara.indexOf('const br = doc.createElement("br");') >= 0
  && segPara.indexOf('const br2 = doc.createElement("br");') >= 0,
  segPara == null ? "切不出 insertParaBreak" : JSON.stringify(segPara.slice(0, 80)));
ok("◎ 段内换行仍是**一个** <br>（Shift+回车那条路一个字没改）",
  segBreak != null && segBreak.indexOf('createElement("br")') >= 0
  && segBreak.indexOf("br2") < 0);
ok("★ 光标显式落在新段落的行首 —— v0.8.29 起落在第二处零宽占位**里面**（setStart(zw2, 1)）",
  segPara != null && segPara.indexOf("range.setStart(zw2, 1)") >= 0);
ok("★ 两条空落脚行各配一个零宽占位（没有它 Chromium 算不出光标几何：真机实测 rect = 0,0,0,0 ——「按了回车/点了块末尾看不到光标」就是这条）",
  segPara != null && (segPara.match(/doc\.createTextNode\(WYS_ZWSP\)/g) || []).length === 2);
ok("★ 占位是零宽字符，且读回时被归一化掉（源码一个字节都不会多）",
  codeOnly.indexOf('const WYS_ZWSP = "\\u200b";') >= 0
  && codeOnly.indexOf('.replace(/\\u200b/g, "")') >= 0);
ok("★ 只读孤岛上一律不动手（原子渲染结果 / 结构块 / 标题编号：那儿的 DOM 是渲染结果）",
  segPara != null && segPara.indexOf('getAttribute("contenteditable") === "false"') >= 0
  && segBreak != null && segBreak.indexOf('getAttribute("contenteditable") === "false"') >= 0);
ok("★ 只认那个唯一的编辑宿主（否则回车会插到浮层 / 搜索框那种地方去）",
  segPara != null && segPara.indexOf('"wys-editroot"') >= 0
  && segBreak != null && segBreak.indexOf('"wys-editroot"') >= 0);
ok("插不成一律静默返回 false（不当场抛异常打断键盘）",
  segPara != null && segPara.indexOf("return false;") >= 0 && segPara.indexOf("catch (err)") >= 0);

const segEmpty = fnBody("wysCaretOnEmptyLine");
ok("★ 「已经站在空段落上」的判据存在（wysCaretOnEmptyLine）", segEmpty != null);
ok("★ 判据认「左边两个实义节点都是 <br>」（v0.8.29：占位不算节点 —— 落脚行每行都带一个，跳过它才判得出）",
  segEmpty != null && segEmpty.indexOf("isBr(two[0]) && isBr(two[1])") >= 0
  && segEmpty.indexOf("if (isZw(n)) continue;") >= 0);
ok("★ 在字中间不算空行（左边是字，不是空行）",
  segEmpty != null && segEmpty.indexOf("光标停在字中间") >= 0);
ok("★ insertParaBreak 拿它挡一道（LaTeX 里没有空段落，再补只会多塞空行）",
  segPara != null && segPara.indexOf("if (wysCaretOnEmptyLine(range)) return false;") >= 0);

const segEnter = fnBody("onWysKeyDown");
ok("★ 回车这一拍分两个动作（Enter 新段落 / Shift+Enter 段内换行），各自插完自己喊同步",
  segEnter != null && segEnter.indexOf("if (insertParaBreak()) queueWysLive();") >= 0
  && segEnter.indexOf("if (insertSoftBreak()) queueWysLive();") >= 0
  && segEnter.indexOf("e.shiftKey") >= 0);
ok("回车仍被接管（不接管浏览器会自己插 <div> / <br>）",
  segEnter != null && segEnter.indexOf('if (e.key === "Enter" && !e.altKey && !e.metaKey) {') >= 0
  && segEnter.indexOf("e.preventDefault();") >= 0);
ok("★ Alt/Cmd+回车 不越界（那不是我们的键：旧实现一并吞掉，一并吞掉就是越界）",
  segEnter != null && segEnter.indexOf("!e.altKey && !e.metaKey") >= 0);
ok("★ 旧写法（Enter 无条件当段内换行）已从代码里退场",
  codeOnly.indexOf('if (e.key === "Enter" && !e.shiftKey)') < 0);
/* 「修过头」的反面：回车这一拍**不许**记账 / 弹提示 —— 它是纯 DOM 动作，
 * 落盘走实时同步那条路（弹提示 / 记历史都是收尾那一拍的事）。
 * ⚠ 查的必须是**回车那一段**（onWysKeyDown 里还有 Ctrl+Z / Ctrl+S 两条分支：
 *   它们弹提示、记历史都是对的，混在一起查就成了「整层恒红」那种坏断言）。 */
const enterSeg = (function () {
  if (segEnter == null) return null;
  const i = segEnter.indexOf('if (e.key === "Enter"');
  if (i < 0) return null;
  const j = segEnter.indexOf('if (e.key === "Enter"', i + 10);
  return segEnter.slice(i, j < 0 ? segEnter.length : j);
})();
ok("★ 组字中的回车一律放行（中文输入法确认候选词那一下：不许被我们拦成换行）",
  enterSeg != null && enterSeg.indexOf("e.isComposing") >= 0 && enterSeg.indexOf("e.keyCode === 229") >= 0);
ok("★ 回车这一拍不记账 / 不弹提示（不该在撤销链里凭空多一步）",
  enterSeg != null && enterSeg.indexOf("wysPushTx") < 0 && enterSeg.indexOf("setToast") < 0
  && enterSeg.indexOf("commitWys") < 0,
  enterSeg == null ? "切不出回车那一段（结构变了？）" : JSON.stringify(enterSeg.slice(0, 120)));

const segQueue = fnBody("queueWysLive");
ok("实时同步的排程被拆成可复用的一小步（queueWysLive）", segQueue != null);
ok("同一帧里的多次输入合并成一次（rAF 去重）",
  segQueue != null && segQueue.indexOf("if (wysLiveRaf.current) return;") >= 0);
ok("句柄用完就复位（否则第一帧之后再也不会同步）",
  segQueue != null && segQueue.indexOf("wysLiveRaf.current = 0") >= 0);
ok("打字那条路（onWysInput）也走它 —— 三条路共用同一次排程，不各写一份",
  fnBody("onWysInput") != null && fnBody("onWysInput").indexOf("queueWysLive();") >= 0);
ok("组字中仍不同步（输入法的半成品拼音不许写进源码）",
  fnBody("onWysInput") != null && fnBody("onWysInput").indexOf("isComposing") >= 0);
ok("回车不再插裸 \"\\n\"（那是「按回车没反应」的旧实现）",
  codeOnly.indexOf('execCommand("insertText", false, "\\n")') < 0);
ok("回车不再走 execCommand 那条命令路（光标落点由实现定 + jsdom 里根本不存在）",
  codeOnly.indexOf('execCommand("insertHTML"') < 0 && codeOnly.indexOf('execCommand("insertLineBreak")') < 0);

/* ================= [B] 行为：真组件 + jsdom 真 DOM ================= */
console.log("\n── 行为级：真组件 + jsdom 真 DOM（浏览器那一侧用最小但忠实的 Range/Selection 替身） ──");
const mk1 = spawnSync(process.execPath, [path.join(__dirname, "_mkprobe-undo.js")], { stdio: "pipe", cwd: ws });
if (mk1.status !== 0) { ok("探针 harness 可组装", false, String(mk1.stderr || "").slice(0, 300)); }
else {
  const mk2 = spawnSync(process.execPath, [path.join(__dirname, "_mkprobe-v0827.js")], { stdio: "pipe", cwd: ws });
  if (mk2.status !== 0) { ok("v0827 探针可组装", false, String(mk2.stdout || "") + String(mk2.stderr || "").slice(0, 300)); }
  else {
    const r = spawnSync(process.execPath, [path.join(__dirname, "_probe-v0827.js")], { stdio: "inherit", cwd: ws });
    ok("行为级探针全绿（段末回车一个空行 / 再按不许多塞 / Shift+回车段内换行 / 段中回车真分段 / 续写不重复正文 / 一步撤销）",
      r.status === 0, "退出码 " + r.status);
  }
}

/* ================= [C] 装机产物核对 ================= */
console.log("\n[C] 装机产物核对（发布出去的那份必须有这一改）");
ok("产物版本与 manifest.json 一致（发布的就是源码这一版）",
  pkg.version === String(mf.version), "产物 " + pkg.version + " / manifest " + mf.version);
const marks = [
  ["新段落那条路（insertParaBreak）", "function insertParaBreak() {"],
  ["它插的是两个 <br>", 'const br2 = doc.createElement("br");'],
  ["光标落在新段落行首的零宽占位里", "range.setStart(zw2, 1);"],
  ["空落脚行的零宽占位（v0.8.29）", 'const WYS_ZWSP = "\\u200b";'],
  ["补齐落脚行的那颗纯函数（v0.8.29）", "function wysEnsureLandingLine(el) {"],
  ["空段落判据（wysCaretOnEmptyLine）", "function wysCaretOnEmptyLine(range) {"],
  ["判据在插之前挡一道", "if (wysCaretOnEmptyLine(range)) return false;"],
  ["段内换行那条路仍是 insertSoftBreak", "function insertSoftBreak() {"],
  ["回车分两个动作", "if (insertParaBreak()) queueWysLive();"],
  ["Shift 那一路接段内换行", "if (insertSoftBreak()) queueWysLive();"],
  ["实时同步的排程 queueWysLive", "function queueWysLive() {"],
  ["预览层 input 通路仍在（[23] 那条没被带坏）", "onInput={onWysInput}"],
  ["组字结束挂载点仍在", "onCompositionEnd={onWysInput}"],
];
for (const [n, s2] of marks) ok(n, src.indexOf(s2) >= 0);
ok("★ 产物里回车不再无条件当段内换行（旧写法不许留在发布件里；查代码行，注释留着无妨）",
  pkgCode.indexOf('if (e.key === "Enter" && !e.shiftKey)') < 0);
ok("★ 产物里回车不再走 execCommand（旧路那条命令调用不许留在发布件里）",
  pkgCode.indexOf('execCommand("insertHTML"') < 0 && pkgCode.indexOf('execCommand("insertLineBreak")') < 0,
  JSON.stringify((pkgCode.match(/execCommand\("[A-Za-z]+"/g) || [])));
ok("顺带防回归：粘贴仍走 insertText（这次只动回车，没顺手改粘贴）",
  src.indexOf('execCommand("insertText", false, t)') >= 0);

console.log("\n" + "=".repeat(64));
console.log(fail ? "✗ 这一层有 " + fail + " 项未通过（通过 " + pass + "）"
                 : "✓ 回车分层：Enter 新段落 / Shift+Enter 段内换行（源码 + 行为 + 产物，共 " + pass + " 项）");
process.exit(fail ? 1 : 0);
