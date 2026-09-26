/* v0.6.2：把 test-v052.js 的 B/C 两段从「中间形态断言」改成「宿主最终结果断言」
 *
 * 旧断言钉的是 `result.content` = 一条一项的数组、level/anchor 挂在内容块上。
 * 那在**旧宿主**里成立（旧 parseItems 把 content 当条目数组直接读），
 * 但新宿主（1.3.3+）在 parseItems 前面加了 extractToolText —— 先把 content[].text
 * 拍平成文本再解析 —— 块上的 level/anchor 直接消失，大纲退化成全平 + 无锚点，
 * 点击就跳第 1 行。断言测着「中间形态」，所以门是绿的，线上是坏的。
 *
 * 改成：把工具的原始返回交给 **真·宿主解析链**（.setup/check/host-parse-items.js），
 * 断言宿主最后看到的条目数 / level / anchor —— 这才是契约。
 */
const fs = require("fs");
const path = require("path");

const p = "E:/notrat-latex-plugin/.setup/test-v052.js";
let s = fs.readFileSync(p, "utf8");

/* ---------- ① 页眉：引入真解析链 + 真实章节行号 ---------- */
{
  const head = 'const TEX = WS + "/samples/sample.tex";';
  if (s.split(head).length - 1 !== 1) { console.error("✗ 页眉锚点异常"); process.exit(1); }
  s = s.replace(
    head,
    [
      head,
      '/* v0.6.2：断言宿主「最终看到什么」，所以直接拿装机版抠出来的真解析链来解析 */',
      'const { parseItems } = require("./check/host-parse-items.js");',
      'const REAL_LINES = fs',
      '  .readFileSync(TEX, "utf8")',
      '  .split("\\n")',
      '  .map((l, i) => (/\\\\(part|chapter|section|subsection|subsubsection)\\*?\\{/.test(l) ? i + 1 : 0))',
      '  .filter(Boolean);',
    ].join("\n")
  );
  if (!/^const fs = require\("fs"\);$/m.test(s)) {
    s = s.replace('const path = require("path");', 'const path = require("path");\nconst fs = require("fs");');
  }
}

/* ---------- ② B 段整体替换 ---------- */
{
  const start = s.indexOf('  console.log("\\n=== B. 宿主通路');
  const end = s.indexOf('  console.log("\\n=== C. 显式 format=outline');
  if (start < 0 || end < 0 || end < start) { console.error("✗ B 段定位失败"); process.exit(1); }
  const oldB = s.slice(start, end);

  const newB = [
    '  console.log("\\n=== B. 宿主通路（filePath，无 path/format）→ 交真解析链判结果 ===");',
    '  const bResp = await rpc("tools/call", { name: "latex_outline", arguments: { filePath: TEX, fileName: "sample.tex" } });',
    '  const bContent = (bResp.result && bResp.result.content) || [];',
    '  console.log("    result.content 条数 = " + bContent.length + "；首条 text 前 110 字：" + String((bContent[0] || {}).text).slice(0, 110));',
    '  /* ★ v0.6.2 事故（点大纲永远跳第 1 行）根因回归：',
    '   *   宿主 parseItems = extractToolText(拍平 content[].text) → JSON.parse → …',
    '   *   所以「内容块上挂 level/anchor」是不安全形状：拍平即丢。',
    '   *   下面同时钉住「新形状能过」与「旧形状必挂」两条。 */',
    '  const hostItems = parseItems(bResp.result);',
    '  const oldShape = { content: [{ type: "text", text: "1  引言", level: 1, anchor: "11" }] };',
    '  check(',
    '    "对照：旧形态（level/anchor 挂在内容块上）在真解析链下会丢 anchor —— 所以不能再用它",',
    '    parseItems(oldShape)[0].anchor === undefined,',
    '    "anchor=" + parseItems(oldShape)[0].anchor',
    '  );',
    '  check("★ 宿主解析后条目数 > 1（不会塌成一行）", hostItems.length > 1, "条目数=" + hostItems.length);',
    '  check("★ 条目数 = 源码真实章节数", hostItems.length === REAL_LINES.length, hostItems.length + " vs " + REAL_LINES.length);',
    '  check(',
    '    "★ 每条都带回数字 anchor（丢了宿主会拿标题当锚点回抛 → 编辑器跳第 1 行）",',
    '    hostItems.every((c) => c.anchor != null && /^\\d+$/.test(String(c.anchor))),',
    '    JSON.stringify(hostItems.map((c) => c.anchor))',
    '  );',
    '  check(',
    '    "★ anchor 逐条等于源码真实章节行号",',
    '    JSON.stringify(hostItems.map((c) => Number(c.anchor))) === JSON.stringify(REAL_LINES),',
    '    JSON.stringify(hostItems.map((c) => Number(c.anchor))) + " vs " + JSON.stringify(REAL_LINES)',
    '  );',
    '  check("★ 层级保住（存在 level > 1 的条目）", hostItems.some((c) => c.level > 1), JSON.stringify(hostItems.map((c) => c.level)));',
    '  check("每条 text 不含换行（折行会被宿主压成一行）", hostItems.every((c) => String(c.text).indexOf("\\n") < 0));',
    '  check("level 从 1 起（1..3）", hostItems.every((c) => c.level >= 1 && c.level <= 3), JSON.stringify(hostItems.map((c) => c.level)));',
    '  check("顶层 section 的 level == 1", hostItems[0].level === 1, JSON.stringify(hostItems[0]));',
    '  check("subsection 比 section 深一级", hostItems[2].level === 2, JSON.stringify(hostItems[2]));',
    '  check("含顶层章节「引言」", /引言/.test(hostItems.map((c) => c.text).join("|")));',
    '  check("缩进交给 level（text 不带前导空格缩进）", hostItems.every((c) => !/^\\s{2,}\\S/.test(String(c.text))));',
    '',
  ].join("\n");

  s = s.replace(oldB, newB);
  console.log("  ✓ B 段：改为「真解析链最终结果」断言（含旧形态必挂的对照断言）");
}

/* ---------- ③ C 段：同构断言同步 ---------- */
{
  const oldC = [
    '  const cItems = (cResp.result && cResp.result.content) || [];',
    '  check("与 B 同构（条目数组）", cItems.length > 1 && cItems.every((c) => typeof c.level === "number" && typeof c.anchor === "string"));',
    '  check("与 B 条目数一致", cItems.length === bItems.length, cItems.length + " vs " + bItems.length);',
  ].join("\n");
  const newC = [
    '  const cItems = parseItems(cResp.result);',
    '  check("与 B 同构（真解析链结果：有 level / 有 anchor）", cItems.length > 1 && cItems.every((c) => typeof c.level === "number" && c.anchor != null));',
    '  check("与 B 条目数一致", cItems.length === hostItems.length, cItems.length + " vs " + hostItems.length);',
  ].join("\n");
  if (s.split(oldC).length - 1 !== 1) { console.error("✗ C 段锚点异常"); process.exit(1); }
  s = s.replace(oldC, newC);
  console.log("  ✓ C 段：format=outline 同样按真解析链结果断言");
}

/* ---------- ④ B 段标题里残留的 bItems 引用兜底清理 ---------- */
if (/\bbItems\b/.test(s)) {
  console.log("  ! 仍残留 bItems 引用，逐处检查：");
  s.split("\n").forEach((l, i) => { if (/\bbItems\b/.test(l)) console.log("    " + (i + 1) + ": " + l.trim()); });
  process.exit(1);
}

fs.writeFileSync(p, s);
console.log("  ✓ test-v052.js 已更新");
