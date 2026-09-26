/* v0.5.1：把两处「旧行为」断言改成新契约
 *
 * 旧契约：非 LaTeX 时 panel 里画一张 IdlePanel 提示卡（卡片壳还在）
 * 新契约：非 LaTeX 时整张卡片不出现（面板把宿主卡片壳藏掉）
 */
const fs = require("fs");

const edits = [
  [".setup/test-activefile.js", [
    ['["outline", outlineSrc, /if \\(!act\\.path\\) return <IdlePanel ready=\\{act\\.ready\\} \\/>;/],',
     '["outline", outlineSrc, /if \\(!showCard\\) return <div ref=\\{rootRef\\} style=\\{\\{ display: "none" \\}\\} \\/>;/],'],
    ['["outline", outlineSrc, /load\\(act\\.path\\);/],',
     '["outline", outlineSrc, /load\\(activePath\\);/],'],
  ]],
  [".setup/test-outline-v2.js", [
    ['ok(/if \\(!act\\.path\\) return <IdlePanel ready=\\{act\\.ready\\} \\/>;/.test(outlineSrc), "outline 保留非 LaTeX 收起分支");',
     'ok(/if \\(!showCard\\) return <div ref=\\{rootRef\\} style=\\{\\{ display: "none" \\}\\} \\/>;/.test(outlineSrc), "outline 非 LaTeX 时整卡隐藏（v0.5.1 起不再画提示卡）");'],
    ['ok(/load\\(act\\.path\\);/.test(outlineSrc), "outline 保留 load(act.path) 数据入口");',
     'ok(/load\\(activePath\\);/.test(outlineSrc), "outline 保留 load(activePath) 数据入口");'],
  ]],
];

let bad = 0;
for (const [file, pairs] of edits) {
  let s = fs.readFileSync(file, "utf8");
  for (const [from, to] of pairs) {
    const i = s.indexOf(from);
    if (i < 0) { console.error("\u2717 " + file + " 找不到锚点: " + JSON.stringify(from.slice(0, 80))); bad++; continue; }
    if (s.indexOf(from, i + 1) >= 0) { console.error("\u2717 " + file + " 锚点不唯一"); bad++; continue; }
    s = s.split(from).join(to);
    console.log("\u2713 " + file + "  " + to.slice(0, 72));
  }
  fs.writeFileSync(file, s);
}
console.log(bad === 0 ? "\n全部替换完成" : "\n有 " + bad + " 处失败");
process.exitCode = bad ? 1 : 0;
