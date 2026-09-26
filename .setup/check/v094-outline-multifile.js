#!/usr/bin/env node
/* =========================================================================
 * v0.9.4 回归层：多文件大纲（\input/\include 展开）+ 编码嗅探（UTF-16 / BOM）
 *
 * 这一层钉的是一条用户报过的症状：
 *   「该文件没有大纲条目 / latex_outline 未返回条目」
 * 宿主的源码里，这两行只在「调用成功、但解析出 0 条」时才显示 —— 所以
 * 「空」不是「连不上」，是**解析真的没拿到章节**。两个真实成因：
 *   ① 论文拆成主文件 + 子文件，主文件里只有一串 \input（旧实现只扫当前打开的那一个文件）
 *   ② 文件存成 UTF-16（Windows 记事本「另存为 → 编码：Unicode」）→ 按 utf8 硬读，
 *      `\section` 每个字符间夹 \x00，正则一条也匹配不到
 *
 * 断言分四组：
 *   A 宿主大纲通路：条目数 / level / anchor（子文件章节的 anchor 必须落回父文件那条 \input）
 *   B 面板通路：list 行协议 + 头部子文件计数 + 来源标记
 *   C 编码：UTF-16LE/BE（有 BOM / 无 BOM）、UTF-8+BOM、子文件是 UTF-16 也要展开
 *   D 不变式：循环 \input 不挂死、缺失子文件不报错、深度滤空时文案不能误导
 * 外加：sample.tex（单文件）逐条 anchor 不许变（host-outline-contract 的同一把尺）
 *
 * 用法: node .setup/check/v094-outline-multifile.js [--deployed]
 *       NOTRAT_LATEX_SRV=<path> node .setup/check/v094-outline-multifile.js   # 验发行包里解出来的那份
 * 退出码: 0 通过 / 1 失败
 * ========================================================================= */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const { parseItems } = require("./host-parse-items.js");

const DEPLOYED = process.argv.includes("--deployed");
const WS = path.join(__dirname, "..", "..");
const SRV = (process.env.NOTRAT_LATEX_SRV || "").trim()
  ? process.env.NOTRAT_LATEX_SRV.trim()
  : DEPLOYED
    ? path.join(require("os").homedir(), ".notrat", "tools", "latex-server.js")
    : path.join(WS, "server", "index.js");
const TMP = path.join(WS, ".setup", "tmp-v094");

let pass = 0;
let fail = 0;
const ok = (c, m, extra) => {
  if (c) {
    pass++;
    console.log("  ✓ " + m);
  } else {
    fail++;
    console.log("  ✗ " + m + (extra !== undefined ? "  → " + extra : ""));
  }
};
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m, JSON.stringify(a) + " vs " + JSON.stringify(b));

/* ---------- 造夹具 ---------- */
function utf16be(str) {
  const le = Buffer.from(str, "utf16le");
  const be = Buffer.alloc(le.length);
  for (let i = 0; i + 1 < le.length; i += 2) {
    be[i] = le[i + 1];
    be[i + 1] = le[i];
  }
  return be;
}
const BOM = { utf8: Buffer.from([0xef, 0xbb, 0xbf]), utf16le: Buffer.from([0xff, 0xfe]), utf16be: Buffer.from([0xfe, 0xff]) };

const MAIN = [
  "\\documentclass{ctexart}",
  "\\begin{document}",
  "\\section{甲}",
  "\\input{chapters/sec1}",
  "\\include{chapters/sec2}",
  "\\input{chapters/ghost}",
  "\\subsection{乙}",
  "\\input{chapters/sec1}",
  "\\end{document}",
].join("\n");
const SEC1 = ["\\section{子一}", "\\subsection{子一小}", "\\subsubsection{子一小小}"].join("\n");
const SEC2 = "\\section{子二}";
const ONE_SECTION = "\\documentclass{article}\n\\begin{document}\n\\section{唯一一节}\n\\label{sec:one}\n见~\\ref{sec:missing}。\n\\end{document}\n";

function build() {
  fs.rmSync(TMP, { recursive: true, force: true });
  const w = (rel, body) => {
    const p = path.join(TMP, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
    return p;
  };
  w("main.tex", MAIN);
  w("chapters/sec1.tex", SEC1);
  w("chapters/sec2.tex", SEC2);

  /* 循环引用（两个文件互 \input） */
  w("cycle/a.tex", "\\section{环A}\n\\input{b}\n");
  w("cycle/b.tex", "\\section{环B}\n\\input{a}\n");

  /* 编码族：同一份内容换四种编码 */
  w("enc/utf16le-nobom.tex", Buffer.from(ONE_SECTION, "utf16le"));
  w("enc/utf16le-bom.tex", Buffer.concat([BOM.utf16le, Buffer.from(ONE_SECTION, "utf16le")]));
  w("enc/utf16be-bom.tex", Buffer.concat([BOM.utf16be, utf16be(ONE_SECTION)]));
  w("enc/utf8-bom.tex", Buffer.concat([BOM.utf8, Buffer.from(ONE_SECTION, "utf8")]));

  /* 主文件 UTF-8，子文件 UTF-16 —— 展开也必须认得 */
  w("enc/main-utf16child.tex", "\\documentclass{article}\n\\begin{document}\n\\section{主}\n\\input{child16}\n\\end{document}\n");
  w("enc/child16.tex", Buffer.from("\\section{子（UTF-16）}\n", "utf16le"));
}

/* ---------- 真 stdio 调工具 ---------- */
function mcp() {
  const p = spawn(process.execPath, [SRV], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, LATEX_OUTLINE_DEPTH: "3", NOTRAT_WORKSPACE: TMP },
  });
  let buf = "";
  const pending = new Map();
  p.stdout.on("data", (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      let m;
      try {
        m = JSON.parse(line);
      } catch (_) {
        continue;
      }
      if (m.id != null && pending.has(m.id)) {
        const cb = pending.get(m.id);
        pending.delete(m.id);
        cb(m);
      }
    }
  });
  p.stderr.on("data", () => {});
  let seq = 0;
  const send = (method, params) =>
    new Promise((res) => {
      const id = ++seq;
      pending.set(id, res);
      p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  return { p, send };
}

const textOf = (r) => (((r || {}).result || {}).content || []).map((c) => c.text || "").join("\n");
const call = (send, name, args) => send("tools/call", { name, arguments: args });

(async () => {
  const watchdog = setTimeout(() => {
    console.error("✗ 60s 未跑完（疑似展开递归没刹住）");
    process.exit(1);
  }, 60000);

  build();
  console.log("v0.9.4 多文件大纲 + 编码嗅探 回归层");
  console.log("  server = " + SRV + (DEPLOYED ? "（装机版）" : "（工作区）") + "  夹具 = .setup/tmp-v094\n");

  const { p, send } = mcp();
  await send("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "v094", version: "1" } });
  p.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  const F = (rel) => path.join(TMP, rel).replace(/\\/g, "/");

  /* ---------------- A. 宿主大纲通路 ---------------- */
  console.log("A. 宿主内置大纲通路（filePath 形态）");
  const mainAbs = F("main.tex");
  const a = await call(send, "latex_outline", { fileName: "main.tex", filePath: mainAbs });
  const aItems = parseItems((a || {}).result);
  console.log("     解析结果: " + JSON.stringify(aItems));

  ok(aItems.length === 6, "A1 主文件 + 两个子文件 = 6 条（不是 0 条）", aItems.length);
  eq(aItems.map((i) => i.anchor), ["3", "4", "4", "4", "5", "7"], "A2 anchor 落回父文件：\\input 那一行（子文件不跳错文件）");
  eq(aItems.map((i) => i.level), [1, 1, 2, 3, 1, 2], "A3 level 逐条对：子文件的 subsubsection 有第 3 级（depth=3 生效）");
  ok(
    aItems[1].text.indexOf("2") === 0 && aItems[2].text.indexOf("2.1") === 0 && aItems[4].text.indexOf("3") === 0,
    "A4 编号跨文件连续（子一=2 / 子一小=2.1 / 子二=3）",
    aItems.map((i) => i.text).join(" | ")
  );
  ok(
    aItems.filter((i) => i.text.includes("⟵ chapters/")).length === 4,
    "A5 子文件来的 4 条都标了来源（⟵ chapters/…）",
    aItems.map((i) => i.text).join(" | ")
  );
  ok(
    aItems.every((i) => !/[\n\r]/.test(i.text)),
    "A6 text 无内嵌换行（宿主要按单行 truncate）"
  );
  ok(aItems[0].text.indexOf("甲") > 0, "A7 主文件自己的章节仍在最前", aItems[0].text);

  /* ---------------- B. 面板通路 ---------------- */
  console.log("\nB. 面板 / AI 通路（path 形态，list 行协议）");
  const b = await call(send, "latex_outline", { path: mainAbs });
  const bTxt = textOf(b);
  const bLines = bTxt.split("\n");
  ok(/· 章节 6 · 大纲 6 条 · 含 2 个子文件/.test(bLines[0]), "B1 头部：章节 6 · 含 2 个子文件", bLines[0]);
  ok(/^\[ \] #4\s+2\s+子一\s+⟵ chapters\/sec1\.tex$/.test(bLines[2] || ""), "B2 行协议保留 #行号 + 来源标记", JSON.stringify(bLines[2]));
  ok(bLines.filter((l) => l.includes("⟵")).length === 4, "B3 四条子文件条目都带来源");

  const bp = await call(send, "latex_parse", { path: mainAbs });
  const bpTxt = textOf(bp);
  ok(bpTxt.includes("📂 子文件 (2/4 已展开)"), "B4 latex_parse 摊开子文件清单（2 展开 / 4 条 \\input）", (bpTxt.match(/📂[^\n]*/) || [""])[0]);
  ok(/ghost[^\n]*找不到/.test(bpTxt), "B5 缺失子文件标「找不到」而不是静默");
  ok(/sec1[^\n]*循环引用/.test(bpTxt), "B6 重复 \\input 同一个文件标「循环引用，已截断」");
  ok(/甲[\s\S]*\(L3\)/.test(bpTxt) && /子一[\s\S]*\(L4 · chapters\/sec1\.tex\)/.test(bpTxt), "B7 章节行标出真实行号 + 来源文件");

  /* ---------------- C. 编码 ---------------- */
  console.log("\nC. 编码嗅探（这条就是「文件看着好好的，大纲却是空的」那一类）");
  const encCases = [
    ["utf16le-nobom.tex", "UTF-16LE 无 BOM（记事本默认「Unicode」）"],
    ["utf16le-bom.tex", "UTF-16LE 带 BOM"],
    ["utf16be-bom.tex", "UTF-16BE 带 BOM"],
    ["utf8-bom.tex", "UTF-8 带 BOM（对照组）"],
  ];
  for (const [file, label] of encCases) {
    const r = await call(send, "latex_outline", { fileName: file, filePath: F("enc/" + file) });
    const items = parseItems((r || {}).result);
    ok(items.length === 1 && items[0].text.includes("唯一一节"), "C1 " + label + " → 出 1 条大纲", JSON.stringify(items));
  }
  const c2 = await call(send, "latex_validate", { path: F("enc/utf16le-nobom.tex") });
  ok(/未定义/.test(textOf(c2)), "C2 UTF-16 文件的引用校验也真跑起来了（能报出未定义 label）", textOf(c2).slice(0, 80));
  const c3 = await call(send, "latex_outline", { fileName: "main-utf16child.tex", filePath: F("enc/main-utf16child.tex") });
  const c3Items = parseItems((c3 || {}).result);
  ok(c3Items.length === 2 && /子（UTF-16）/.test(c3Items[1].text), "C3 子文件是 UTF-16 也照样展开（主 1 + 子 1）", JSON.stringify(c3Items));

  /* ---------------- D. 不变式 ---------------- */
  console.log("\nD. 不变式（循环 / 深度 / 单文件不许被带坏）");
  const d1 = await call(send, "latex_outline", { fileName: "a.tex", filePath: F("cycle/a.tex") });
  const d1Items = parseItems((d1 || {}).result);
  ok(d1Items.length === 2, "D1 循环 \\input（a↔b）不挂死、不重复：2 条", JSON.stringify(d1Items));
  ok(JSON.stringify(d1Items.map((i) => i.anchor)) === '["1","2"]', "D1b 循环时 anchor 仍是各自父文件那行", JSON.stringify(d1Items.map((i) => i.anchor)));

  const d2 = await call(send, "latex_outline", { path: mainAbs, depth: 0 });
  const d2Txt = textOf(d2);
  ok(/大纲深度/.test(d2Txt) && !/未发现/.test(d2Txt), "D2 章节被深度滤空时，文案指向深度设置，而不是谎称「未发现 \\section」", JSON.stringify(d2Txt.split("\n")[1]));

  const SAMPLE = path.join(WS, "samples", "sample.tex").replace(/\\/g, "/");
  const realLines = [];
  fs.readFileSync(SAMPLE, "utf8").split("\n").forEach((l, i) => {
    if (/\\(part|chapter|section|subsection|subsubsection)\*?\{/.test(l)) realLines.push(i + 1);
  });
  const d3 = await call(send, "latex_outline", { fileName: "sample.tex", filePath: SAMPLE });
  const d3Items = parseItems((d3 || {}).result);
  eq(d3Items.map((i) => i.anchor), realLines.map(String), "D3 单文件样例（sample.tex）逐条 anchor 不变 = " + realLines.length + " 条");
  ok(!d3Items.some((i) => i.text.includes("⟵")), "D4 单文件项目不出现子文件标记（没有 \\input 就不许多嘴）");

  const d5 = await call(send, "latex_status", { path: mainAbs });
  ok(/（含子文件）/.test(textOf(d5)), "D5 状态栏标出「含子文件」", textOf(d5).slice(0, 60));

  /* ---------------- E. 静态护栏 ---------------- */
  console.log("\nE. 静态护栏（部署链不许漏文件）");
  const buildSrc = fs.readFileSync(path.join(WS, ".setup", "build-singlefile.js"), "utf8");
  ok(/tex-encoding\.js/.test(buildSrc), "E1 build-singlefile.js 的拷贝清单含 tex-encoding.js（漏了 MCP server 起不来）");
  const encSrc = fs.readFileSync(path.join(WS, "server", "tex-encoding.js"), "utf8");
  ok(!/writeFileSync|appendFileSync/.test(encSrc), "E2 编码模块只读不写（绝不改用户盘上的字节）");
  const idxSrc = fs.readFileSync(path.join(WS, "server", "index.js"), "utf8");
  const rawReads = idxSrc.match(/readFileSync\([^)]*"utf8"\)/g) || [];
  const badReads = rawReads.filter((x) => /\b(file|filePath|f)\b/.test(x));
  ok(badReads.length === 0 && /TEXENC\.readTexSource/.test(idxSrc), "E3 .tex 源码读全部走嗅探（残留的 utf8 硬读：" + (badReads.join(" ") || "无") + "）");
  const gateSrc = fs.readFileSync(path.join(WS, ".setup", "gate-v070.js"), "utf8");
  ok(gateSrc.includes("v094-outline-multifile.js"), "E4 本层已挂进 npm run gate（没挂 = 以后没人跑它）");

  clearTimeout(watchdog);
  p.kill();
  console.log("\n=== " + pass + " 通过 / " + fail + " 失败 ===");
  process.exitCode = fail ? 1 : 0;
})().catch((e) => {
  console.error("失败: " + (e && e.message));
  process.exit(1);
});
