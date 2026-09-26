/* 层 [21] —— 「✓ 已设为「\section」…↩ 撤销」有时候没有生效（v0.8.23 加）
 *
 * 用户原话：
 *   「✓ 已设为「\section」（源码 7 行并成一行，段落语义不变）↩ 撤销 —— 有时候没有生效呢」
 *
 * 为什么必须新增一层（前面 20 层为什么都没拦住）：
 *   它们全都在问「**源码**写对了没有」—— 写回的行区间对不对、字有没有丢、
 *   撤销链有没有记上、切档回得来吗。**没有一层问过「用户看见的还是不是同一个东西」**。
 *   而这一处恰好是：源码改对了（探针里 `\section{…}` 一字不差），屏幕却停在原处 ——
 *   因为 wysSelfEdit 这面旗子是 commitWys 立的（语义：这次变化是用户就地打字造的，
 *   DOM 是权威，别再拿 html 覆一遍），而「打完字立刻 Ctrl+1」让 commitWys 与
 *   applyHeadWys 在同一次事件里跑完，React 把两次 onChange 合成一拍，
 *   同步层只看到一次变化、旗子还是 true → 跳过重画。
 *
 * 这一层把三件事钉住：
 *   [A] 源码：wysPaintFromSrc 存在；**所有**非打字类的 onChange 之前都调了它（顺序断言）；
 *       反面：commitWys 里那面旗子仍必须是「立起来」—— 打字那条路不许被顺手改掉
 *   [B] 行为（真组件 + jsdom 真 DOM）：打字后 Ctrl+1 / 点撤销 / Ctrl+Z，屏幕必须重画；
 *       反例：不打字按 Ctrl+1 仍要生效、纯打字仍**不许**重画（重画会铲掉光标）
 *   [C] 装机产物核对
 *
 * 运行： node .setup/check-v0823-paint.js
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

/* ================= [A] 源码：谁该把旗子放平 ================= */
console.log("\n[A] 非打字类改动落盘前必须先把 wysSelfEdit 放平");

ok("助手存在（唯一职责：把旗子放平）",
  editorSrc.indexOf("function wysPaintFromSrc() { wysSelfEdit.current = false; }") >= 0);
ok("打字那条路**原样不动**：commitWys 里旗子仍立起来（DOM 才是权威）",
  editorSrc.indexOf("wysSelfEdit.current = true;") >= 0);

function slice(from, to) {
  const i = editorSrc.indexOf(from);
  const j = editorSrc.indexOf(to, i);
  if (i < 0 || j < 0) return null;
  return editorSrc.slice(i, j);
}
/* 取一个函数的整段（从 `function NAME(` 到下一个同缩进的函数声明）。
 * 不写死「下一个函数叫什么」—— 那种写法会在函数顺序调整时静默变空段，
 * 断言就全「过」了（这一层第一次跑就是这么红的：段是 null）。 */
function fnBody(name) {
  const i = editorSrc.indexOf("function " + name + "(");
  if (i < 0) return null;
  const m = /\n  (?:async )?function [A-Za-z_$]/.exec(editorSrc.slice(i + 10));
  return m ? editorSrc.slice(i, i + 10 + m.index) : editorSrc.slice(i);
}
function ordered(seg, a, b, name, extra) {
  const i = seg == null ? -1 : seg.indexOf(a);
  const j = seg == null ? -1 : seg.indexOf(b, i);
  return ok(name, seg != null && i >= 0 && j > i,
    extra !== undefined ? extra : (seg == null ? "取不到函数体" : "段内 " + JSON.stringify(a) + " @" + i + " → " + JSON.stringify(b) + " @" + j));
}

const segHead = fnBody("applyHeadWys");
ordered(segHead, "wysPaintFromSrc();", "onChange(out);",
  "Ctrl+1~6 改层级：先放平旗子，再 onChange（屏幕才会重画）");
ok("Ctrl+1~6 那一路没被改坏（仍是「自检 → 记事务 → 落盘」）",
  segHead != null && segHead.indexOf("WYS.parseDoc(out);") > 0 && segHead.indexOf("wysPushTx(base, out,") > 0);

const segUndo = fnBody("undoWys");
ordered(segUndo, "wysPaintFromSrc();", "onChange(tx.before);",
  "撤销：先放平旗子，再 onChange");
ordered(segUndo, "wysCommitPending();", "onChange(tx.before);",
  "撤销仍先落地没写回的打字（v0.8.17 那条路没丢）");

const segRedo = fnBody("redoWys");
ordered(segRedo, "wysPaintFromSrc();", "onChange(tx.after);",
  "重做：先放平旗子，再 onChange");

const segAtom = fnBody("commitAtom");
ordered(segAtom, 'if (commitWysSession()) wysPaintFromSrc();', "return;",
  "行内原子：写回成功后重画（外观是渲染出来的）");
ordered(segAtom, "wysPushTx(base0, next,", "onChange(next);",
  "块级原子：事务已记 → 放平旗子 → 落盘（顺序见下一条）");
ordered(segAtom, "wysPaintFromSrc();", "onChange(next);",
  "块级原子：先放平旗子，再 onChange");

const nCalls = (editorSrc.match(/wysPaintFromSrc\(\);/g) || []).length;
ok("调用点齐了（6 处：改层级·正文段落 / 改层级·跨行标题块 / 撤销 / 重做 / 块级原子 / 行内原子，实际 " + nCalls + "）", nCalls === 6);

/* 反面：commitWys 自己绝不许调它 —— 打字那条路一旦也重画，光标每改一处就被铲平 */
const segCommit = fnBody("commitWys");
ok("反面：commitWys 里不许出现它（打字那条路必须保持 DOM 权威）",
  segCommit != null && segCommit.indexOf("wysPaintFromSrc") < 0);

/* ================= [B] 行为：屏幕有没有跟着重画 ================= */
console.log("\n── 行为级：真组件 + jsdom 真 DOM ──");
const mk = spawnSync(process.execPath, [path.join(__dirname, "_mkprobe-undo.js")], { stdio: "pipe", cwd: ws });
if (mk.status !== 0) { ok("探针 harness 可组装", false, String(mk.stderr || "").slice(0, 300)); }
else {
  const mk2 = spawnSync(process.execPath, [path.join(__dirname, "_mkprobe-v0823.js")], { stdio: "pipe", cwd: ws });
  if (mk2.status !== 0) { ok("v0823 探针可组装", false, String(mk2.stdout || "") + String(mk2.stderr || "").slice(0, 300)); }
  else {
    const r = spawnSync(process.execPath, [path.join(__dirname, "_probe-v0823.js")], { stdio: "inherit", cwd: ws });
    ok("行为级探针全绿（打字后 Ctrl+1 / 点撤销 / Ctrl+Z + 两条反例）", r.status === 0, "退出码 " + r.status);
  }
}

/* ================= [C] 装机产物核对 ================= */
console.log("\n[C] 装机产物核对（发布出去的那份必须有这一改）");
ok("产物版本与 manifest.json 一致（发布的就是源码这一版）", pkg.version === String(mf.version), "产物 " + pkg.version + " / manifest " + mf.version);
const marks = [
  ["助手 wysPaintFromSrc", "function wysPaintFromSrc() { wysSelfEdit.current = false; }"],
  ["改层级那一处", "wysPaintFromSrc();     // v0.8.23：改的是整块的身份"],
  ["撤销那一处", "wysPaintFromSrc();"],
  ["行内原子那一处", "if (commitWysSession()) wysPaintFromSrc();"],
  ["块级原子那一处", "wysPaintFromSrc();     // v0.8.23：改写的是源码块"],
];
for (const [n, s2] of marks) ok(n, src.indexOf(s2) >= 0);
const nProd = (src.match(/wysPaintFromSrc\(\)/g) || []).length;
ok("产物里 5 处调用点都在（实际 " + nProd + "）", nProd >= 5);

console.log("\n" + "=".repeat(64));
console.log(fail ? "✗ 这一层有 " + fail + " 项未通过（通过 " + pass + "）"
                 : "✓ 结构改动之后屏幕必须重画（源码顺序 + 行为 + 产物，共 " + pass + " 项）");
process.exit(fail ? 1 : 0);
