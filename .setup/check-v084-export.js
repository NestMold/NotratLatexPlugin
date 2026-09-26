/* v0.8.4 验收层 [8]：导出契约
 *
 * 为什么单独一层：
 *   导出是**唯一一个会往用户磁盘写文件**的功能，而且写的位置由 dest 决定。
 *   出错的代价不是「按钮没反应」，是「文件跑到了不该去的地方 / 覆盖了别的东西」。
 *   所以要断言的不是文案，是：
 *     · 产物真的落盘、落在该落的目录、字节数与返回一致
 *     · HTML 是真的自包含（没有 data-asset 残留 —— 那意味着图片只在工作区里看得见）
 *     · 静态化没把内容吃掉（标题 / 段落 / 公式都还在）
 *     · 落点不会越界（dest 只认三个白名单值，瞎传就回文档旁，不认 cwd）
 *     · PV_CSS 与编辑器那份是同一份（改一边不改另一边 → 导出件样式与预览不一致）
 *
 * 运行： node .setup/check-v084-export.js
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const WS = "E:/notrat-latex-plugin";
const TEX = path.join(WS, "samples", "sample.tex");
const EXPORT_MODULE = path.join(WS, "server", "export-html.js");
const DEPLOYED = path.join(os.homedir(), ".notrat", "plugins", "notrat-latex-plugin.json");
const SERVER = path.join(os.homedir(), ".notrat", "tools", "latex-server.js");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok    " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "\n        → " + extra : "")); }
}
function section(t) { console.log("\n" + t); }

const EX = require(EXPORT_MODULE);

/* ---------- 临时目录：所有产物都写到这里，跑完清理 ---------- */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "latex-export-"));
function cleanup() {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
}
process.on("exit", cleanup);

/* ================================================================== */
section("[1] 模块级：组装与静态化");
{
  const body = '<div class="pv-title"><div class="pv-title-main">测试标题</div></div>'
    + '<p class="pv-par">正文第一段。</p>'
    + '<div class="pv-eq" data-line="12"><span class="pv-eqbody">E = mc²</span><span class="pv-eqno">(1)</span></div>'
    + '<figure class="pv-float" data-line="20"><img class="pv-img" data-asset="' + TMP.replace(/\\/g, "/") + '/pic.png" alt="pic.png" /></figure>'
    + '<span class="pv-ref" data-line="30" title="跳转">图 1</span>';

  /* 图片：造一张真图 */
  const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
  fs.writeFileSync(path.join(TMP, "pic.png"), png);

  const inl = EX.inlineImages(body);
  ok("图片被内嵌成 dataURI（而不是留 data-asset 等宿主去补）",
    inl.html.indexOf('src="data:image/png;base64,') > 0, JSON.stringify(inl));
  ok("data-asset 属性已被抹掉（导出件不再依赖工作区路径）",
    inl.html.indexOf("data-asset") < 0);
  ok("内嵌计数与实际一致（1 张）", inl.inlined.length === 1 && inl.missing.length === 0,
    JSON.stringify(inl.inlined) + " / " + JSON.stringify(inl.missing));

  /* 缺图：不能变成裂图，要变成一句人话 */
  const bad = EX.inlineImages('<img class="pv-img" data-asset="' + TMP.replace(/\\/g, "/") + '/nope.png" alt="nope.png" />');
  ok("读不到的图降级成 pv-imgna 提示（不是裂图 / 不是空 src）",
    bad.html.indexOf("pv-imgna") > 0 && bad.html.indexOf("src=") < 0, bad.html);
  ok("读不到的图记进 missing（结果条要报出来）", bad.missing.length === 1, JSON.stringify(bad.missing));

  const doc = EX.buildDoc({ title: "标题<>&", bodyHtml: body, katexCss: ".katex{color:red}", lang: "zh-CN" });
  ok("是完整 HTML 文档", /^<!DOCTYPE html>/.test(doc) && /<\/html>\s*$/.test(doc));
  ok("标题做了转义（不注入 HTML）", doc.indexOf("<title>标题&lt;&gt;&amp;</title>") > 0);
  ok("带上了打印样式（可打印是导出 HTML 的核心价值之一）", doc.indexOf("@media print") > 0 && doc.indexOf("@page") > 0);
  ok("主题变量是 HSL 通道值（PV_CSS 全是 hsl(var(--x))，给 hex 会整体失效）",
    /--foreground:\s*[\d.]+ \d+% \d+%/.test(doc), (doc.match(/--foreground:[^;]*/) || [])[0]);
  ok("给了 katexCss 才带 KaTeX 样式（服务端 miniMath 渲染的正文不该背 600KB）",
    doc.indexOf(".katex{color:red}") > 0
    && EX.buildDoc({ bodyHtml: body }).indexOf(".katex{color:red}") < 0);
  ok("正文没被静态化吃掉（标题 / 段落 / 公式 / 图都还在）",
    doc.indexOf("测试标题") > 0 && doc.indexOf("正文第一段") > 0 && doc.indexOf("mc²") > 0 && doc.indexOf('<img') > 0);
  ok("运行时属性被抹掉，静态样式类保留",
    doc.indexOf("data-line") < 0 && doc.indexOf("pv-title-main") > 0 && doc.indexOf("pv-eqno") > 0);
  ok("div 无 contenteditable（导出件不给编辑入口）", doc.indexOf('contenteditable="true"') < 0);

  ok("\\title{} 兜底也能猜出标题",
    EX.guessTitle("\\title{基于深度学习的文本摘要研究}\n\\author{张三}") === "基于深度学习的文本摘要研究",
    EX.guessTitle("\\title{基于深度学习的文本摘要研究}\n\\author{张三}"));
  ok("没有 \\title{} 时不瞎猜（返回空串，交给调用方兜底）", EX.guessTitle("\\documentclass{ctexart}") === "");
}

/* ================================================================== */
section("[2] 样式单一来源：PV_CSS 与编辑器那份必须一致");
{
  const deployedSrc = JSON.parse(fs.readFileSync(DEPLOYED, "utf8")).contributions.editors[0].source;
  const m = /const PV_CSS = `([\s\S]*?)`;/.exec(deployedSrc);
  ok("能从装机产物里切出编辑器的 PV_CSS", !!m);
  if (m) {
    /* v0.9.2：比对**唯一**类名集合。wys 层规则（.wys-inc-b .pv-ref 这类）会把
     * .pv-ref 的出现次数在编辑器侧多记一次 —— wys 折叠卡片是编辑器独有的层，
     * 导出件没有 wys 层、本来就不该有那条规则；集合一致即「两处都认识同一批 pv-* 类」，
     * 出现次数不是契约的一部分（含重复的字符串比对属于误伤）。 */
    const cls = (t) => [...new Set(t.match(/\.pv-[a-z0-9-]+/g) || [])].sort().join(",");
    const a = cls(m[1]);
    const b = cls(EX.PV_CSS);
    ok("两边 pv- 类名集合逐项相同（" + a.split(",").filter(Boolean).length + " 个）", a === b,
      "只在编辑器里：" + a.split(",").filter((x) => b.indexOf(x) < 0).join(" ")
      + " | 只在导出里：" + b.split(",").filter((x) => a.indexOf(x) < 0).join(" "));
    /* 逐条比对关键数值，避免「类名一样但值被改过」的假绿 */
    const rules = (t) => t.split("\n").map((x) => x.trim()).filter((x) => /^\.pv-\S+\{/.test(x)).sort().join("\n");
    ok("逐条规则文本也相同（不是只对了个类名）", rules(m[1]) === rules(EX.PV_CSS),
      "编辑器 " + rules(m[1]).split("\n").length + " 条 / 导出 " + rules(EX.PV_CSS).split("\n").length + " 条");
  }
}

/* ================================================================== */
section("[3] 端到端：用宿主的调用方式驱动真 server（stdio JSON-RPC）");
{
  if (!fs.existsSync(SERVER)) { ok("装机 server 存在", false, SERVER); }
  else {
    const child = spawn(process.execPath, [SERVER], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        NOTRAT_PLUGIN_ID: "notrat-latex-plugin",
        NOTRAT_WORKSPACE: WS.replace(/\//g, "\\"),
        NOTRAT_WINDOW_ID: "main",
        NOTRAT_LOCALE: "zh",
      },
    });
    let buf = "";
    const pending = new Map();
    child.stdout.on("data", (d) => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        let msg; try { msg = JSON.parse(line); } catch { console.log("  !! stdout 污染协议:", line.slice(0, 120)); continue; }
        const r = pending.get(msg.id);
        if (r) { pending.delete(msg.id); r(msg); }
      }
    });
    let id = 0;
    const call = (name, args) => new Promise((res) => {
      const myId = ++id;
      pending.set(myId, res);
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: myId, method: "tools/call", params: { name, arguments: args } }) + "\n");
      setTimeout(() => { if (pending.has(myId)) { pending.delete(myId); res({ timeout: true }); } }, 120000);
    });
    const textOf = (m) => ((m && m.result && m.result.content) || []).map((c) => c.text).join("\n");

    (async () => {
      const list = await new Promise((res) => {
        const myId = ++id;
        pending.set(myId, res);
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: myId, method: "tools/list", params: {} }) + "\n");
      });
      const names = ((list.result && list.result.tools) || []).map((t) => t.name);
      ok("tools/list 里有 latex_export", names.indexOf("latex_export") >= 0, names.join(", "));

      /* ---- HTML：面板不在场（不传 body）→ 服务端内核渲染 ---- */
      const htmlOut = path.join(TMP, "server-render.html");
      const r1 = await call("latex_export", { path: TEX, format: "html", out: htmlOut });
      let j1 = null;
      try { j1 = JSON.parse(textOf(r1)); } catch (e) {}
      ok("服务端渲染的 HTML 导出返回 JSON", !!j1 && j1.ok === true, textOf(r1).slice(0, 300));
      if (j1 && j1.ok) {
        ok("产物落实在 out 指定的位置（不是文档旁）", path.resolve(j1.outPath) === path.resolve(htmlOut), j1.outPath);
        ok("文件真的存在且与返回字节数一致",
          fs.existsSync(j1.outPath) && fs.statSync(j1.outPath).size === j1.bytes,
          j1.bytes + " vs " + (fs.existsSync(j1.outPath) ? fs.statSync(j1.outPath).size : "缺"));
        const h = fs.readFileSync(j1.outPath, "utf8");
        ok("正文渲染出来了（有章节标题与公式环境）",
          h.indexOf("pv-") > 0 && /pv-h[123]/.test(h) && /式|方程|Attention|softmax/.test(h));
        ok("from=server（面板不在场的路径被走通）", j1.from === "server", JSON.stringify(j1));
        ok("无 KaTeX 时不背 600KB 的字体样式（体积可控）",
          j1.math === "mini" && j1.bytes < 200 * 1024, j1.math + " / " + j1.bytes + "B");
      }

      /* ---- HTML：面板在场（传 body）→ 用面板那份，体积应显著更大（带 KaTeX 样式） ---- */
      const bodyOut = path.join(TMP, "editor-render.html");
      const fakeBody = '<div class="pv-title"><div class="pv-title-main">来自面板</div></div>'
        + '<p class="pv-par">公式：<span class="katex"><span class="katex-html">x</span></span></p>';
      const r2 = await call("latex_export", { path: TEX, format: "html", out: bodyOut, body: fakeBody, title: "面板标题" });
      let j2 = null;
      try { j2 = JSON.parse(textOf(r2)); } catch (e) {}
      ok("面板传 body 的路径也通", !!j2 && j2.ok === true && j2.from === "editor", textOf(r2).slice(0, 300));
      if (j2 && j2.ok) {
        const h2 = fs.readFileSync(j2.outPath, "utf8");
        ok("正文用的是面板那份（不是服务端重渲染一遍）", h2.indexOf("来自面板") > 0);
        ok("标题用的是面板传的 title", h2.indexOf("<title>面板标题</title>") > 0);
        ok("正文里有 KaTeX 标记 → 自动带上 KaTeX 样式（否则公式会裸奔）",
          j2.math === "katex" && h2.indexOf(".katex") > 0, j2.math);
      }

      /* ---- dest 白名单：瞎传不能跑到 cwd ----
       * 用临时目录里的一份 .tex 副本测：产物落在副本旁边，跑完随 TMP 一起清掉。
       * 原来直接在仓库 samples/ 上测 —— Windows 上子进程偶尔还没释放句柄，删不掉，
       * 仓库里就留一个几百 KB 的 sample.html。换个位置断言反而更硬：产物跟 .tex 走。 */
      const docDir = path.join(TMP, "docdir");
      fs.mkdirSync(docDir, { recursive: true });
      const texCopy = path.join(docDir, "sample.tex");
      fs.copyFileSync(TEX, texCopy);
      const r3 = await call("latex_export", { path: texCopy, format: "html", dest: "../../../../etc" });
      let j3 = null;
      try { j3 = JSON.parse(textOf(r3)); } catch (e) {}
      ok("dest 只认白名单：瞎传等于 same（落 .tex 旁边），不会跟着参数乱跑",
        !!j3 && j3.ok === true && path.resolve(j3.outPath) === path.resolve(path.join(docDir, "sample.html")),
        j3 && j3.outPath);

      /* ---- format 校验 ---- */
      const r4 = await call("latex_export", { path: TEX, format: "docx" });
      const t4 = textOf(r4);
      ok("format 只认 pdf/html，别的明确报错（不静默当成 pdf）",
        /只支持 pdf \/ html/.test(t4), t4.slice(0, 200));

      /* ---- 文件不存在 ---- */
      const r5 = await call("latex_export", { path: path.join(TMP, "nope.tex"), format: "html" });
      ok("找不到 .tex 时给的是人话（不是抛栈）", /未找到 \.tex/.test(textOf(r5)), textOf(r5).slice(0, 200));

      /* ---- PDF：编译可以失败（本机没装 TeX 引擎是允许的），但不许崩 ---- */
      const r6 = await call("latex_export", { path: TEX, format: "pdf" });
      const t6 = textOf(r6);
      let j6 = null;
      try { j6 = JSON.parse(t6); } catch (e) {}
      const graceful = (j6 && j6.ok === true) || (j6 && j6.ok === false && typeof j6.message === "string");
      ok("PDF 导出要么成功、要么给一条人话（引擎没装也不能崩）", graceful, t6.slice(0, 300));
      if (j6 && j6.ok) {
        ok("PDF 落盘且字节数与返回一致",
          fs.existsSync(j6.outPath) && fs.statSync(j6.outPath).size === j6.bytes, JSON.stringify(j6).slice(0, 200));
        ok("PDF 返回产物路径（面板据此给预览入口）", /\.pdf$/i.test(j6.outPath), j6.outPath);
      } else {
        console.log("        （本机编译不可用，跳过 PDF 产物断言：" + ((j6 && j6.message) || "").slice(0, 60) + "）");
      }
      /* 复用判定：连导两次，第二次不该重编 */
      if (j6 && j6.ok) {
        const r7 = await call("latex_export", { path: TEX, format: "pdf" });
        const j7 = JSON.parse(textOf(r7));
        ok("产物比 .tex 新时直接复用（不白编一遍）", j7.reused === true, JSON.stringify(j7).slice(0, 200));
      }

      child.stdin.end();
      child.kill();
      finish();
    })().catch((e) => { ok("端到端流程无异常", false, (e && e.stack) || String(e)); child.kill(); finish(); });
  }
}

function finish() {
  console.log("\n" + (fail === 0
    ? "✓ 导出契约验收全绿（" + pass + " 项）"
    : "✗ 导出契约验收有 " + fail + " 项未通过（通过 " + pass + "）"));
  process.exit(fail === 0 ? 0 : 1);
}
