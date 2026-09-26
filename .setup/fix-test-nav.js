/* 修 test-nav.js 里 10 项**恒假/失效**的断言（不是放松，是让它们重新指向真实契约）。
 *
 * 背景：这些失败一直存在，只是被 harness 的 TypeError 遮住了 —— 崩溃修好后（fix-verify-infra.js
 * 给假节点补了 querySelectorAll）才露出来。用 v0.8.5 的 editor.tsx 做过 A/B：同样 10 项失败，
 * 所以与本次功能改动无关。
 *
 *   1) C 节 8 项：「切视图后源码 textarea 挂载了 → 实得 0」。
 *      根因：测试只调了 render()，**没有切视图** —— hA 始终是 wysiwyg，textarea 自然不会挂载。
 *      v0.8.3 起档位开关搬去了宿主标签栏，编辑器内没有按钮可点，所以要切只能改 props.mode。
 *      harness 的 render() 用的是同一个 props 引用，改了就生效（editor.tsx 696/698 行按
 *      props.mode 实时同步 view）。
 *   2) H 节 2 项：断言 todo / pos 两类状态栏条目。editor.tsx 现在只推 sec / env / cite / issue ——
 *      这两类已经不在了，断言恒假。改成「白名单校验真实集合」，比原来更严。
 *
 * 运行： node .setup/fix-test-nav.js
 */
const fs = require("fs");
const path = require("path");

const P = "E:/notrat-latex-plugin/.setup/test-nav.js";
const raw = fs.readFileSync(P, "utf8");
const crlf = raw.indexOf("\r\n") >= 0;
let s = crlf ? raw.replace(/\r\n/g, "\n") : raw;
const len0 = s.length;
let n = 0;

function rep(a, b, label) {
  const c = s.split(a).length - 1;
  if (c !== 1) { console.error("✗ " + label + "：命中 " + c + " 次（应 1）—— 未落盘"); process.exit(1); }
  s = s.replace(a, b);
  n++;
  console.log("  ok   " + label);
}

/* ---- 1) mount() 把 props 暴露出来，测试才有办法「切视图」 ---- */
rep(
  "  if (extra) Object.assign(props, extra);\n  return createHarness(props);",
  [
    "  if (extra) Object.assign(props, extra);",
    "  const h = createHarness(props);",
    "  /* v0.8.6：把 props 挂出来，供「切视图」用。v0.8.3 起档位由**宿主标签栏**决定，",
    "   * 编辑器不再自绘切换按钮 —— 没有按钮可点，只能改 props.mode 再重渲染。",
    "   * harness 的 render() 复用同一个 props 引用（tree = Comp(props)），改了就生效。 */",
    "  h.props = props;",
    "  return h;",
  ].join("\n"),
  "mount() 暴露 props"
);

/* ---- 2) C 节：真的切一次视图（含报错文案保留） ---- */
rep(
  '  console.log("\\n── C. 切到含源码的视图后那一拍：应当补跳 + 补回执 ──");\n  treeA = await hA.render();',
  [
    '  console.log("\\n── C. 切到含源码的视图后那一拍：应当补跳 + 补回执 ──");',
    "  /* 老写法只调 render()、不改档位 —— hA 一直是 wysiwyg，textarea 当然挂不出来，",
    "   * 这一节 8 项于是恒假。按 v0.8.3 的契约，档位的权威值就是 props.mode。 */",
    '  hA.props.mode = "source";',
    "  treeA = await hA.render();",
  ].join("\n"),
  "C 节：先切档位再重渲染"
);

/* ---- 3) H 节：todo / pos 已不存在 → 改成白名单校验真实集合 ---- */
rep(
  '  ok(byId("todo") && byId("todo").text === "📌 2 待办", "TODO/FIXME 注释被数到（2 条）", byId("todo") && byId("todo").text);\n  ok(byId("pos") && byId("pos").text === "Ln 1, Col 1", "光标行列", byId("pos") && byId("pos").text);',
  [
    "  /* v0.8.6：这里原先断言 todo / pos 两类条目。它们**已经不在** editor.tsx 的推送集合里",
    "   * （现在只有 sec / env / cite / issue），所以那两条恒假 —— 测的是不存在的东西。",
    "   * 改成白名单：既钉住真实集合，也在有人新增/回填条目时立刻变红，逼他同步这条清单。 */",
    '  const ALLOWED_STATUS_IDS = ["sec", "env", "cite", "issue"];',
    "  const unknown = ids.filter((k) => ALLOWED_STATUS_IDS.indexOf(k) < 0);",
    '  ok(unknown.length === 0, "状态栏条目集合 = " + ALLOWED_STATUS_IDS.join(" / ") + "（无 todo / pos，已废弃勿再断言）", unknown.join(","));',
  ].join("\n"),
  "H 节：todo/pos 改为白名单校验"
);

fs.writeFileSync(P, crlf ? s.replace(/\n/g, "\r\n") : s, "utf8");
console.log("\n✓ " + n + " 处修复写入（" + len0 + " → " + s.length + " 字符，行尾 " + (crlf ? "CRLF" : "LF") + "）");
