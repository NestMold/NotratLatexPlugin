/* 收尾清理：两处无关紧要但该干净的地方
 *  ① editor-header.tsx 的 quoteOut 里残留的三元表达式（恒为空串）
 *  ② outline.tsx 的 useEffect 里 alive 标志位没实际作用（load 本身就是幂等的 HTTP 调用）
 */
const fs = require("fs");
let fail = 0;
function sub(file, needle, repl, label) {
  let src = fs.readFileSync(file, "utf8");
  if (src.indexOf(needle) < 0) {
    console.error("  \u2717 锚点未命中: " + label);
    fail++;
    return;
  }
  fs.writeFileSync(file, src.split(needle).join(repl), "utf8");
  console.log("  \u2713 " + label);
}

sub(
  "E:/notrat-latex-plugin/panels/editor-header.tsx",
  '        detail: { text: (busy === "latex_compile" ? "" : "") + out, source: "LaTeX 编译输出 · " + fname },',
  '        detail: { text: out, source: "LaTeX 输出 · " + fname },',
  "① editor-header 去掉恒空三元"
);

sub(
  "E:/notrat-latex-plugin/panels/outline.tsx",
  "  useEffect(function () {\n    let alive = true;\n    if (alive) load();\n    return function () { alive = false; };\n    // 工作区切换时重新发现主文件\n  }, [props.ctx && props.ctx.workspace ? props.ctx.workspace.path : \"\"]);",
  "  useEffect(\n    function () {\n      load();\n      // 依赖工作区路径：切工作区 / 新窗口时重新发现主文件\n    },\n    [props.ctx && props.ctx.workspace ? props.ctx.workspace.path : \"\"]\n  );",
  "② outline 去掉无用的 alive 标志"
);

process.exitCode = fail ? 1 : 0;
