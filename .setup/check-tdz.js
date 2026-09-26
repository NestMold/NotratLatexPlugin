#!/usr/bin/env node
/**
 * TDZ 静态哨兵 —— 专抓 "Cannot access 'X' before initialization" 这一类事故。
 *
 * 背景（0.7.0 线上事故）：
 *   panels/editor.tsx 里
 *     const wys = useMemo(() => {...renderMath...}, [content, renderMath]);   // ← 405 行
 *     ...
 *     const renderMath = useMemo(() => {...}, [katexVer]);                    // ← 705 行才声明
 *   依赖数组是**渲染期立即求值**的（不像回调体那样延迟），于是那一行一执行就
 *   ReferenceError: Cannot access 'renderMath' before initialization → 编辑器白屏。
 *
 *   注意：esbuild / tsc 都**不报**这个错（它不是类型错，也不是语法错），
 *   所以「编译通过」给不了任何保证 —— 必须有这么一道运行前的顺序检查。
 *
 * 判定规则：
 *   对每个 hooks 依赖数组 [a, b, c] 里的标识符 X：
 *     - 若 X 在本文件有 **同时或更早** 的声明      → ok
 *     - 若 X 在本文件只有 **更晚** 的声明          → ✗ TDZ（真·运行时会炸）
 *     - 若本文件没有 X 的声明（props / import / 全局）→ 跳过，不猜
 *   `function` 声明会被提升，天然安全，不参与判定。
 *
 * 自检（重要）：
 *   每次运行都会拿 fixtures/tdz-known-bad/editor.tsx（0.7.0 的坏样本）喂一遍，
 *   必须能报出警。**报不出来就说明哨兵本身失效了** → 退出码 1。
 *   没有自检的哨兵等于没有哨兵。
 *
 * 运行： node .setup/check-tdz.js [待扫目录]
 */
const fs = require("fs");
const path = require("path");

const ws = path.join(__dirname, "..");
/* 可选：argv[2] 指定待扫目录（哨兵自检用） */
const panelsDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ws, "panels");
const FIXTURE = path.join(__dirname, "fixtures", "tdz-known-bad");

const DECL = [
  /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/, // const x =
  /^\s*(?:const|let|var)\s*\[([^\]]+)\]\s*=/, // const [a, b] =
  /^\s*(?:const|let|var)\s*\{([^}]+)\}\s*=/, // const { a, b } =
];
const FUNC = /^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/;

/* 依赖数组结束的三种写法 */
const DEP = [
  /\},\s*\[([^\]]+)\]\s*\)/, // }, [a, b]);
  /\],\s*\[([^\]]+)\]\s*\)/, // ], [a, b]);
  /^\s*\[([^\]]+)\]\s*,?\s*\)/, // 跨行续写：[a, b]\n  );
];

const ident = (s) =>
  String(s)
    .split(",")
    .map((t) => t.trim())
    .filter((t) => /^[A-Za-z_$][\w$]*$/.test(t));

/* ---------- 扫描核心：目录 -> { files, checked, violations } ---------- */
function scan(dir) {
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => /\.tsx$/.test(f));
  } catch (e) {
    throw new Error("读不到目录 " + dir + "：" + e.message);
  }

  const violations = [];
  let checked = 0;

  for (const f of files) {
    const lines = fs.readFileSync(path.join(dir, f), "utf8").split(/\r?\n/);

    /* name -> 升序声明行号（1-based） */
    const decls = new Map();
    const hoisted = new Set();
    lines.forEach((ln, i) => {
      const n = i + 1;
      let m = FUNC.exec(ln);
      if (m) {
        hoisted.add(m[1]);
        if (!decls.has(m[1])) decls.set(m[1], []);
        decls.get(m[1]).push(n);
        return;
      }
      for (const re of DECL) {
        m = re.exec(ln);
        if (!m) continue;
        for (const name of ident(m[1])) {
          if (!decls.has(name)) decls.set(name, []);
          decls.get(name).push(n);
        }
        return;
      }
    });

    lines.forEach((ln, i) => {
      const useLine = i + 1;
      for (const re of DEP) {
        const m = re.exec(ln);
        if (!m) continue;
        for (const name of ident(m[1])) {
          const list = decls.get(name);
          if (!list || !list.length) continue; // props / import / 全局 —— 不猜
          checked++;
          if (list.some((d) => d <= useLine)) continue; // 有同时/更早的声明 → ok
          violations.push({ file: f, name, useLine, declLine: Math.min(...list), text: ln.trim() });
        }
        break;
      }
    });
  }
  return { files: files.length, checked, violations };
}

/* ---------- 1. 自检：坏样本必须被抓到 ---------- */
let selfOk = false;
let selfNote = "";
try {
  if (fs.existsSync(FIXTURE)) {
    const r = scan(FIXTURE);
    if (r.violations.length === 0) {
      selfNote = "✗ 自检失败：已知坏样本（0.7.0 的 renderMath）竟未报警 —— 哨兵本身失效了";
    } else {
      selfOk = true;
      selfNote = "✓ 自检通过：坏样本被抓到 " + r.violations.length + " 处（"
        + r.violations.map((v) => v.name + " 使用行" + v.useLine + "→声明行" + v.declLine).join("; ") + "）";
    }
  } else {
    selfNote = "⚠ 缺 fixtures/tdz-known-bad/，本次跳过自检（哨兵有效性未验证）";
  }
} catch (e) {
  selfNote = "✗ 自检异常：" + e.message;
}

/* ---------- 2. 扫真代码 ---------- */
console.log("TDZ 顺序哨兵 · 扫描 panels/*.tsx 的 hooks 依赖数组");
console.log("-".repeat(60));
console.log(selfNote);
console.log("-".repeat(60));

let res;
try {
  res = scan(panelsDir);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

console.log("目录: " + panelsDir);
console.log("文件数: " + res.files + "   依赖项检查数: " + res.checked);
console.log("-".repeat(60));

if (res.violations.length) {
  console.log("✗ 发现 " + res.violations.length + " 处 TDZ 风险：\n");
  for (const v of res.violations) {
    console.log("  " + v.file);
    console.log("    标识符 : " + v.name);
    console.log("    使用行 : " + v.useLine + "   ← 依赖数组渲染期立即求值");
    console.log("    声明行 : " + v.declLine + "   ← 声明在之后，运行时必炸");
    console.log("    原文   : " + v.text);
    console.log("");
  }
  console.log("修法：把该声明整块上移到使用点之前（或改用 function 声明以获得提升）。");
  process.exit(1);
}

console.log("✓ 未发现「先用后声明」的依赖项（" + res.checked + " 项全部有序）");

if (!selfOk) {
  console.log("");
  console.log(selfNote);
  process.exit(1);
}
process.exit(0);
