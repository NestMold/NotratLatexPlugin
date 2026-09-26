/* v0.8.3 —— 模式契约验收：拿**装机包里那份源码**切出模式判定逻辑，在 vm 里按两代宿主契约喂 props
 *
 * 为什么要有这一层：
 *   「宿主标签栏开关 → props.mode 」这条线以前出过事（v0.4.2：宿主从不注入 props.viewMode，
 *   字面量 "wysiwyg" 又匹配不上旧正则，双视图整体静默失效 —— 界面看着正常，功能全没了）。
 *   而本次改动把顶栏那排按钮删了：档位入口只剩宿主一处，这条线再断就没有任何替代入口。
 *   所以：不断言「代码长什么样」，只断言「喂进 mode，落到的档位对不对、回写 id 对不对」。
 *
 * 覆盖两代契约：
 *   旧（当前装机版宿主，已取证 app.asar 无 modes 解析）：props.mode = "wysiwyg" | "source"，无 props.modes
 *   新（modes 生效后）：props.mode = "visual" | "split" | "source"，另有 props.modes 表
 *
 * 运行： node .setup/check-v083-mode-contract.js
 */
const fs = require("fs");

const M = "C:/Users/Administrator/.notrat/plugins/notrat-latex-plugin.json";
const src = JSON.parse(fs.readFileSync(M, "utf8")).contributions.editors[0].source;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok    " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "\n        → " + extra : "")); }
}
function cut(startMark, endMark, from) {
  const a = src.indexOf(startMark, from || 0);
  if (a < 0) return null;
  const b = src.indexOf(endMark, a + startMark.length);
  if (b < 0) return null;
  return { text: src.slice(a, b + endMark.length), at: a };
}

/* ---------- 从装机产物里切出模式相关代码（不复制粘贴，测的就是发布出去的那份） ---------- */
const cfgs = cut("const MODE2VIEW = {", "// 三态：分屏是独立档位");
const hosts = cut("const hostModeIds = Array.isArray(props.modes)", "const nMode = hostModeIds.length >= 2;   // true = 宿主走 N 态契约（modes），false = 旧的双态契约");
const viewOf = cut("const viewOf = (m) => {", "\n  };");
const writeHost = cut("const writeHostMode = (v) => {", "\n  };");

for (const [name, c] of [["MODE2VIEW / VIEW2MODE_* 常量", cfgs], ["hostModeIds / nMode", hosts], ["viewOf", viewOf], ["writeHostMode", writeHost]]) {
  if (!c) { console.error("✗ 装机包里切不出「" + name + "」—— 产物与源码不同步？先跑 npm run build"); process.exit(1); }
}

const code = [
  "const props = __props;",
  cfgs.text,
  hosts.text,
  viewOf.text,
  writeHost.text,
  "return { nMode: nMode, viewOf: viewOf, write: writeHostMode };",
].join("\n\n");

function makeHarness(p) {
  const calls = [];
  const props = Object.assign({}, p);
  props.onModeSwitch = (id) => calls.push(id);
  const out = new Function("__props", code)(props);
  out.calls = calls;
  out.view = out.viewOf(props.mode) === null ? "split" : out.viewOf(props.mode); // 对齐组件：首帧 = viewOf || 默认分屏
  return out;
}

console.log("\n[1] 旧契约（当前装机版宿主：只有 dualView，二态 wysiwyg / source）");
{
  const h = makeHarness({ mode: "wysiwyg" });
  ok('props.mode="wysiwyg" → 可视化档（preview）', h.view === "preview", "实际 " + h.view);
  ok("识别为双态契约（nMode=false）", h.nMode === false);
  h.write("src");    ok('内部分档 src 回写 "source"', h.calls.pop() === "source");
  h.write("split");  ok('内部分档 split 回写 "wysiwyg"（旧契约没有分屏档，归可视化侧）', h.calls.pop() === "wysiwyg");
  h.write("preview");ok('内部分档 preview 回写 "wysiwyg"', h.calls.pop() === "wysiwyg");

  const h2 = makeHarness({ mode: "source" });
  ok('props.mode="source" → 源码档（src）', h2.view === "src", "实际 " + h2.view);

  const h3 = makeHarness({});   // 老宿主连 dualView 都没读到：不下发 mode
  ok("宿主不下发 mode 时不报错、落到默认档（分屏）", h3.view === "split", "实际 " + h3.view);
  ok("宿主不下发 mode 时不擅自回写", h3.calls.length === 0);
}

console.log("\n[2] 新契约（modes 声明生效：三态）");
{
  /* v0.8.4：模式表从**装机 manifest** 读，不写死。
   * 档位顺序是会变的东西（这次就从「可视化/分屏/源码」改成了「可视化/源码/分屏」），
   * 写死在测试里 → 「测试全绿」和「用户看到几个按钮、什么顺序」就是两回事了。 */
  const edDecl = JSON.parse(fs.readFileSync(M, "utf8")).contributions.editors[0];
  const modesDeclared = edDecl.modes || [];
  ok("装机 manifest 声明了 modes（N 态契约的前提）", modesDeclared.length >= 2, JSON.stringify(modesDeclared));
  ok("档位顺序 = 可视化 | 源码 | 分屏（第一项是宿主默认档）",
    modesDeclared.map((m) => m.id).join(",") === "visual,source,split",
    modesDeclared.map((m) => m.id + "(" + m.label + ")").join(" "));
  ok("每个档位都有 label（宿主按钮上显示的就是它）",
    modesDeclared.every((m) => m && typeof m.label === "string" && m.label.trim().length > 0));
  /* dualView 必须同时留着：装机版宿主只认它，删了就一个模式按钮都不剩 */
  ok("dualView 仍在（装机版宿主不认 modes，删了模式开关会整个消失）",
    Array.isArray(edDecl.dualView) && edDecl.dualView.length === 2, JSON.stringify(edDecl.dualView));
  const MODES = modesDeclared.map((m) => ({ id: String(m.id), label: String(m.label) }));
  const h = makeHarness({ modes: MODES, mode: "visual" });
  ok("识别为 N 态契约（nMode=true）", h.nMode === true);
  ok('props.mode="visual" → 可视化档', h.view === "preview", "实际 " + h.view);
  ok('props.mode="split" → 分屏档', makeHarness({ modes: MODES, mode: "split" }).view === "split");
  ok('props.mode="source" → 源码档', makeHarness({ modes: MODES, mode: "source" }).view === "src");
  h.write("split");   ok('三态下 split 独立回写 "split"（不再是 wysiwyg）', h.calls.pop() === "split");
  h.write("preview"); ok('三态下 preview 回写 "visual"', h.calls.pop() === "visual");
  h.write("src");     ok('三态下 src 回写 "source"', h.calls.pop() === "source");
}

console.log("\n[3] 未知字面量不许瞎猜：认不出就不换档（返回 null，组件保持当前档）");
{
  ok('mode="weird-mode" → null（不动视图）', makeHarness({ mode: "weird-mode" }).viewOf("weird-mode") === null);
  ok('mode="" → null', makeHarness({ mode: "" }).viewOf("") === null);
  ok('mode=null → null', makeHarness({ mode: null }).viewOf(null) === null);
  ok('mode=123（数字）→ null', makeHarness({ mode: 123 }).viewOf(123) === null);
  ok('mode="SOURCE"（大写）→ 源码档（大小写不敏感）', makeHarness({ mode: "SOURCE" }).view === "src");
}

console.log("\n[4] 产物形态：顶栏那排视图按钮确实没了，且模式常量/回写通路在");
{
  /* 旧按钮文案允许出现在注释里（讲清这次删了什么），但不许再出现在渲染结构里 */
  ok("旧分段控件的渲染结构已消失（VIEWS.map / {v.label}</button> / goView(v.k) 三处特征全无）",
    src.indexOf("VIEWS.map") < 0 && src.indexOf("{v.label}</button>") < 0 && src.indexOf("goView(v.k)") < 0);
  ok("顶栏只剩文档级动作（＋ 插入 / 编译 / 校验 仍在，没被误删）",
    src.indexOf("＋ 插入") > 0 && src.indexOf("🔨") > 0 && src.indexOf("✅") > 0);
  ok("产物里不含 VIEWS 常量与 VIEWS.map（旧顶栏渲染）",
    src.indexOf("const VIEWS") < 0 && src.indexOf("VIEWS.map") < 0);
  ok("MODE2VIEW / VIEW2MODE_DUAL / VIEW2MODE_N 三张表都在",
    src.indexOf("const MODE2VIEW") > 0 && src.indexOf("const VIEW2MODE_DUAL") > 0 && src.indexOf("const VIEW2MODE_N") > 0);
  ok("回写只走 props.onModeSwitch（唯一通路）", src.indexOf("props.onModeSwitch") > 0);
  ok("内部切档点也回写宿主（gotoSourceAt / gotoLine 两处）",
    (src.split("writeHostMode(\"split\")").length - 1) >= 2);
}

console.log("\n" + (fail === 0
  ? "✓ 模式契约验收全绿（" + pass + " 项）"
  : "✗ 模式契约验收有 " + fail + " 项未通过（通过 " + pass + "）"));
process.exit(fail === 0 ? 0 : 1);
