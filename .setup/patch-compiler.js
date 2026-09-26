/* 给 server/index.js 打补丁：编译器按名称找不到时，自动探测常见安装位置 */
const fs = require("fs");
const f = process.argv[2] || "server/index.js";
let s = fs.readFileSync(f, "utf8");
if (s.includes("function resolveCompiler")) {
  console.log("already-patched");
  process.exit(0);
}

s = s.replace(
  'const path = require("path");',
  'const path = require("path");\nconst os = require("os");'
);

const helper = [
  "",
  "function resolveCompiler(compiler) {",
  "  if (path.isAbsolute(compiler)) return fs.existsSync(compiler) ? compiler : null;",
  "  const cands = [];",
  '  if (process.platform === "win32") {',
  '    const exts = ["", ".exe", ".cmd", ".bat"];',
  '    const lc = process.env.LOCALAPPDATA || "";',
  "    const home = os.homedir();",
  "    const dirs = [",
  '      path.join(home, ".notrat", "tools", "bin"),',
  '      path.join(lc, "Tectonic"),',
  '      path.join(lc, "Microsoft", "WinGet", "Links"),',
  '      path.join(home, "scoop", "shims"),',
  '      path.join(home, ".cargo", "bin"),',
  "    ];",
  "    for (const d of dirs) for (const e of exts) cands.push(path.join(d, compiler + e));",
  "    for (const e of exts) cands.push(compiler + e);",
  "  } else cands.push(compiler);",
  "  for (const c of cands) {",
  "    try { fs.accessSync(c, fs.constants.X_OK); return c; } catch {}",
  "  }",
  "  return null;",
  "}",
  "",
].join("\n");

s = s.replace("function compileTex(filePath) {", helper + "function compileTex(filePath) {");
s = s.replace(
  'const compiler = (process.env.LATEX_COMPILER || "xelatex").trim();',
  'const compiler = (process.env.LATEX_COMPILER || "tectonic").trim();\n  const exe = resolveCompiler(compiler);'
);
s = s.replace(
  "child = spawn(compiler, /tectonic/i.test(compiler)",
  "child = spawn(exe, /tectonic/i.test(compiler)"
);

fs.writeFileSync(f, s);
console.log("patched");
