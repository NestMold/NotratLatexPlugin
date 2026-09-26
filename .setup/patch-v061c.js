/* v0.6.1 收尾：把「早已恒红的旧断言」改回真实契约，并把它并进验收门
 *
 * 背景：test-activefile.js 的 E 段还在按「6 个 ui 挂载位都在部署包里」查，
 * 而贡献面从 v0.5.2 起就收敛成 editors + ui@outline 了 —— widget / page /
 * editor-header / editor-tabs / outline-panel 都已下线，那 6 条断言自那时起恒红。
 * README 却仍写着「✅ 53 项」。这里按实际部署的挂载位重写，并并进 verify 的冒烟段。
 */
const fs = require("fs");
const path = require("path");
const WS = "E:/notrat-latex-plugin";

/* ---------- 1. test-activefile.js ---------- */
{
  const p = path.join(WS, ".setup", "test-activefile.js");
  let s = fs.readFileSync(p, "utf8");
  const oldBlock = [
    '    const need = {',
    '      "latex-outline": /useHostCardHidden/,',
    '      "latex-widget": /当前不是 LaTeX 文件/,',
    '      "outline-panel": /useActiveLatexFile\\(\\)/,',
    '      "latex-page": /useActiveLatexFile\\(\\)/,',
    '      "latex-editor-header": /useActiveLatexFile\\(\\)/,',
    '      "latex-editor-tabs": /useActiveLatexFile\\(\\)/,',
    '    };',
    '    Object.keys(need).forEach((k) => ok(need[k].test(ui[k] || ""), "部署的 " + k + " 已接线"));',
    '    ok((pkg.contributions.ui || []).filter((u) => /notrat-latex-active-ping/.test((u.content || {}).source || "")).length >= 5,',
    '       "至少 5 个面板挂了活动文件桥");',
  ].join("\n");
  const newBlock = [
    '    /* v0.6.1：贡献面从 v0.5.2 起收敛为 editors + ui@outline，widget / page / editor-header /',
    '     * editor-tabs / outline-panel 都已下线 —— 旧断言还在按「6 个面板都在部署包里」查，恒红。',
    '     * 改成「按实际部署的挂载位查接线」：既不撒谎，也没放松对真回归的保护。 */',
    '    const need = { "latex-outline": /useHostCardHidden/ };',
    '    const declared = Object.keys(ui);',
    '    declared.forEach((k) => { if (need[k]) ok(need[k].test(ui[k]), "部署的 " + k + " 已接线"); });',
    '    ok(declared.length === 1 && declared[0] === "latex-outline",',
    '       "部署包里只有一个 ui 挂载位：latex-outline（其余已按需下线）", declared.join(","));',
    '    ok(/notrat-latex-active-ping/.test(ui["latex-outline"] || ""), "大纲面板挂了活动文件桥（ping 探活）");',
    '    ok(!(pkg.contributions.ui || []).some((u) => u.location === "right-panel"), "部署包内无 right-panel 划词助手（v0.6.1 移除）");',
  ].join("\n");

  if (s.split(oldBlock).length - 1 !== 1) {
    console.error("  ✗ test-activefile.js 锚点命中数异常");
    process.exit(1);
  }
  s = s.split(oldBlock).join(newBlock);
  fs.writeFileSync(p, s);
  console.log("  ✓ test-activefile.js：E 段断言按真实契约重写");
}

/* ---------- 2. verify-v052.js §9 追加 test-activefile ---------- */
{
  const p = path.join(WS, ".setup", "verify-v052.js");
  let s = fs.readFileSync(p, "utf8");
  const anchor = [
    '  ok(resNav.status === 0 && mNav, "test-nav.js 全绿（点大纲 → 跳到对应行，真渲染）", mNav ? outNav.split("\\n").slice(-4).join(" | ") : outNav.slice(-400));',
    '  if (mNav) { pass += Number(mNav[1]); fail += Number(fNav ? fNav[1] : 0); console.log("  （子测试 " + mNav[1] + " 通过 / " + (fNav ? fNav[1] : 0) + " 失败，已并入总分）"); }',
  ].join("\n");
  const add = [
    anchor,
    '',
    '  /* 活动文件桥（生产者广播 + 消费面板接线），v0.6.1 起并进门里防它再次腐烂 */',
    '  const resAf = cp.spawnSync("node", [path.join(WS, ".setup", "test-activefile.js")], { cwd: WS, encoding: "utf8", timeout: 120000 });',
    '  const outAf = (resAf.stdout || "") + (resAf.stderr || "");',
    '  const mAf = /全部通过：(\\d+) 项/.exec(outAf);',
    '  const fAf = /❌ (\\d+) 项未通过/.exec(outAf);',
    '  ok(resAf.status === 0 && mAf, "test-activefile.js 全绿（活动文件桥）", mAf ? outAf.split("\\n").slice(-3).join(" | ") : outAf.slice(-400));',
    '  if (mAf) { pass += Number(mAf[1]); fail += Number(fAf ? fAf[1] : 0); console.log("  （子测试 " + mAf[1] + " 通过 / " + (fAf ? fAf[1] : 0) + " 失败，已并入总分）"); }',
  ].join("\n");

  if (s.split(anchor).length - 1 !== 1) {
    console.error("  ✗ verify §9 锚点命中数异常");
    process.exit(1);
  }
  fs.writeFileSync(p, s.split(anchor).join(add));
  console.log("  ✓ verify-v052.js：§9 并入 test-activefile.js");
}
