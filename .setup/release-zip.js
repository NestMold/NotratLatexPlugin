/* 发布脚本（版本号从 manifest.json 读，任何版本都能直接用）：
 *
 * ⚠ 为什么叫 release-zip.js 而不是 _release-v0XX.js：.gitignore 把 .setup 里
 *   下划线开头的文件整片当成一次性脚本 —— v0.9.13 那会儿脚本就叫
 *   .setup/_release-v0913.js，于是**打包这一步从来没进过仓库**：v0.9.6 → v0.9.13
 *   的 zip 里 panels/*.tsx 一直是带占位符的构建输入（目录型安装必崩的那个坑），
 *   而修法只能落在本地工作区，谁 clone 谁拿到旧行为。打包是发行的必经之路，
 *   不是一次性脚本：放这里，改动能被 review、能被 diff。
 *   （.setup/_release-v0913.js 现在只剩一行壳，require 本文件 —— 老命令仍能用。）
 * 构建发行 zip → 建/更新 GitHub Release 资产 → 回环自验
 * 用法：node .setup/release-zip.js --zip-only        # 只打本地包 + 自检（不联网）
 *       GITHUB_TOKEN=xxx node .setup/release-zip.js    # 顺带建/更新 GitHub Release
 *      （老命令 node .setup/_release-v0913.js 仍可用：那个文件现在只剩一行壳）
 *
 * 历史 1（2026-09-26）：临时内联命令打包，条目全带 `./` 前缀，
 *       Windows 资源管理器拒绝解压（python/7z/bsdtar 都容忍）。
 * 历史 2（2026-09-27）：zip 修好能装了，立刻炸出第二个雷——
 *       zip 里的 manifest.json 是**目录态**（sourceFile 引用），
 *       而宿主编译组件时**从不解析 sourceFile**（asar 三路核实：
 *       全部 .compile( 调用点 0 处 sourceFile；唯一引用点
 *       stripInlinedPanelSources 还会在落盘时删掉内联 source）。
 *       装出来 editors[].source === undefined → esbuild
 *       transform(undefined) →「The input to "transform" must be
 *       a string or a Uint8Array」。这正是 doc-incident.js 复盘过
 *       的事故，从 zip 渠道又复现了一遍。
 * 历史 3（2026-10-12）：zip 里 panels/editor.tsx 一直是**带占位符的构建输入**
 *       （0.9.6 → 0.9.13 逐版核对：三个占位符都在、没有 `const TX = (function`）。
 *       manifest 内联了，包内那几份文件没内联 —— 而宿主对目录包的契约就是
 *       「缺 source 时按 sourceFile 去目录里读真实文件」：读到什么编译什么，
 *       读到占位符版本就是 ReferenceError: TX is not defined（挂在挂载 effect 里）。
 *       同一根因还带着一处静默降级：zip 那份内联少了 renderInlineHtml，
 *       于是同一个面板两种包形态的内核不一样。
 *       ⇒ 修法见第 2.6 步，验收见 .setup/check/v0914-panel-inline.js。
 *
 * 现构建管线（七道关）：
 *       1. git archive 从 HEAD 提取白名单到暂存目录（标准路径）
 *       2. manifest 内联化：editors[].sourceFile → source（注入
 *          LPC/WYS/TX 三内核，与 build-singlefile.js 同一逻辑）；
 *          ui[].content.sourceFile → source；删净全部 sourceFile；
 *          mcpServers 保持 ${pluginDir}/server/index.js（目录包由
 *          宿主解析 pluginDir，不需要单文件包那套 ~/.notrat/tools）
 *     2.6 面板文件也内联：manifest 引用到的 panels/*.tsx **写回内联产物**
 *         （与 manifest 里那份同一份文本，逐字节一致）；其余带占位符的面板
 *         文件按需内联。包里的面板从此是构建产物 —— 谁读都一样
 *       3. python zipfile 打包（正向斜杠、无 ./ 前缀、manifest 首位）
 *       4. zip 结构自检（magic / EOCD / 中央目录 / 路径黑名单）
 *       5. manifest 语义自检（source 长度 / 无 sourceFile / args 原样）
 *       6. 匿名回环下载比 sha256 + 回环件再过结构自检
 */
const fs = require("fs");
const crypto = require("crypto");
const { execSync } = require("child_process");
const path = require("path");

const REPO = "NestMold/NotratLatexPlugin";
/* 版本只认 manifest.json —— 写死必漂（v0.9.10~13 四版没打 zip 就是这么来的） */
const VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8")).version;
const TAG = "v" + VERSION;
/* 产物落点。NOTRAT_ZIP_OUT 只是给「打一份验证包、别覆盖已发布的同名 zip」用
 * （改完打包逻辑先打一份到别处核，比对之后才覆盖正式件）。 */
const ZIP = process.env.NOTRAT_ZIP_OUT || ("notrat-latex-plugin-" + VERSION + ".zip");
const NOTES = ".setup/_release-notes-v" + VERSION.split(".").join("") + ".md";
const STAGE = ".setup/tmp-release";

/* 发行包白名单：运行时所需 + 面板源码。
 * v0.9.14 起 panels/*.tsx 不再是「带占位符的构建输入」，也不是「人读参考」——
 * 第 2.6 步会把它们写成内联产物（宿主对目录包的契约就是读目录里的真实文件）。 */
const PATHS = [
  "manifest.json", "panels", "server",
  /* v0.9.9：体检脚本随包走 —— 换机器的人手上只有这个 zip，不该再要求他先 git clone */
  ".setup/doctor.js",
  ":(exclude)panels/_unused",
  ":(exclude)server/corpus",
  ":(exclude)server/*.test.js",
  ":(exclude)server/testkit.js"
];

/* --zip-only：只打本地包 + 自检，不碰 GitHub（没有人家的 token 也能验包） */
const ZIP_ONLY = process.argv.includes("--zip-only");
const token = (process.env.GITHUB_TOKEN || "").trim();
if (!token && !ZIP_ONLY) { console.error("缺 GITHUB_TOKEN（只想打个本地包就加 --zip-only）"); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function once(url, opt) {
  const r = await fetch(url, opt);
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = { raw: t.slice(0, 200) }; }
  return { status: r.status, ok: r.ok, json: j };
}

async function api(p, body, method, host) {
  const isZip = Buffer.isBuffer(body);
  const url = p.startsWith("http") ? p : "https://" + (host || "api.github.com") + p;
  const opt = {
    method: method || (body ? "POST" : "GET"),
    headers: isZip && host
      ? { Authorization: "Bearer " + token, Accept: "application/vnd.github+json",
          "Content-Type": "application/zip", "Content-Length": body.length }
      : { Authorization: "Bearer " + token, Accept: "application/vnd.github+json",
          "Content-Type": "application/json" },
    body: body ? (isZip ? body : JSON.stringify(body)) : undefined
  };
  let lastErr;
  for (let i = 1; i <= 4; i++) {
    try { return await once(url, opt); }
    catch (e) {
      lastErr = e;
      const why = e.cause ? (e.cause.code || "") + " " + (e.cause.message || "") : e.message;
      console.log("  网络抖动(第" + i + "次):", why.trim(), "→ 重试");
      await sleep(2000 * i);
    }
  }
  throw new Error("重试 4 次仍失败: " + url + " ← " + (lastErr.cause ? lastErr.cause.code : lastErr.message));
}

/* ---------- zip 结构自检：中央目录逐项走一遍，路径黑名单 ---------- */
function verifyZip(buf, label) {
  if (buf.length < 22 || buf.readUInt32LE(0) !== 0x04034b50)
    throw new Error(label + ": magic 不是 PK 头");
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  }
  if (e < 0) throw new Error(label + ": 找不到 EOCD");
  const n = buf.readUInt16LE(e + 10);
  let o = buf.readUInt32LE(e + 16);
  const names = [];
  for (let k = 0; k < n; k++) {
    if (o + 46 > buf.length || buf.readUInt32LE(o) !== 0x02014b50)
      throw new Error(label + ": 中央目录第 " + k + " 项断裂");
    const nl = buf.readUInt16LE(o + 28), el = buf.readUInt16LE(o + 30), cl = buf.readUInt16LE(o + 32);
    names.push(buf.toString("utf8", o + 46, o + 46 + nl));
    o += 46 + nl + el + cl;
  }
  if (o !== e) throw new Error(label + ": 中央目录长度与 EOCD 对不上");
  const bad = names.filter(x =>
    x.startsWith("./") || x.startsWith("/") || x.includes("..") || x.includes("\\"));
  if (bad.length) throw new Error(label + ": 存在资源管理器不认的路径:" + bad.join(" | "));
  if (!names.includes("manifest.json")) throw new Error(label + ": 缺 manifest.json");
  return names;
}

const sha256 = b => crypto.createHash("sha256").update(b).digest("hex");

/* 包内实读用 lib 里那份（.setup/lib/panel-inline.js 的 readZipEntry）——
 * 打包脚本与验收层共用同一个 zip 解析器，「条目名对了 ≠ 内容是产物」这条判据
 * 只能有一处实现（两份各写一份，日子久了必然一处修一处漏）。 */

/* ---------- 内联化：规则唯一实现见 .setup/lib/panel-inline.js ----------
 * 返回 { manifest, byFile }：byFile 记下「manifest 引用到的面板文件 → 内联后的文本」，
 * 第 2.6 步拿它把包内同名文件一并写成产物（v0.9.14）。
 * 为什么非要这样：宿主对目录包的契约是「缺 source 时按 sourceFile 去目录里读真实文件」，
 * 包里的 panels/*.tsx 只要有占位符，走到那条通路就是 `TX is not defined`。 */
function buildInlinedManifest(stageDir) {
  const rd = f => fs.readFileSync(path.join(stageDir, f), "utf8");
  const pack = require(path.join(__dirname, "lib", "panel-inline.js"));
  const KERNELS = pack.buildKernels(stageDir);
  const byFile = {};

  function inline(src, label) {
    return pack.inlinePanel(src, KERNELS, { label: label, required: ["LPC", "WYS", "TX"] }).text;
  }

  const m = JSON.parse(rd("manifest.json"));
  let n = 0;
  for (const e of m.contributions.editors || []) {
    if (!e.sourceFile) throw new Error("editors[" + e.id + "] 无 sourceFile（发行包必须从目录态构建）");
    const text = inline(rd(e.sourceFile), "editors[" + e.id + "]");
    e.source = text;
    byFile[e.sourceFile.replace(/\\/g, "/")] = text;
    delete e.sourceFile; n++;
    console.log("  ✓ editors[" + e.id + "] 内联 " + e.source.length + " 字符");
  }
  for (const r of m.contributions.renderers || []) {
    if (!r.sourceFile) continue;
    const text = inline(rd(r.sourceFile), "renderers[" + r.id + "]");
    r.source = text;
    byFile[r.sourceFile.replace(/\\/g, "/")] = text;
    delete r.sourceFile; n++;
    console.log("  ✓ renderers[" + r.id + "] 内联 " + r.source.length + " 字符");
  }
  for (const u of m.contributions.ui || []) {
    const c = u.content || {};
    if (!c.sourceFile) continue;
    let src = rd(c.sourceFile);
    if (pack.needsInline(src)) src = inline(src, "ui[" + u.id + "]");
    else if (src.includes("module.exports")) throw new Error("UI 面板 " + u.id + " 源码含 module.exports");
    c.source = src;
    byFile[c.sourceFile.replace(/\\/g, "/")] = src;
    delete c.sourceFile; n++;
    console.log("  ✓ ui[" + u.id + "@" + u.location + "] 内联 " + src.length + " 字符");
  }
  if (JSON.stringify(m.contributions).includes("sourceFile"))
    throw new Error("contributions 里仍残留 sourceFile（宿主不解析，装上必挂）");
  const srv = (m.mcpServers || []).find(s => s.id === "latex") || (m.mcpServers || [])[0];
  if (!srv || !srv.args.some(a => String(a).includes("${pluginDir}")))
    throw new Error("mcpServers args 必须保持 ${pluginDir}/... 引用（目录包靠宿主解析）");
  if (!m.enabled) m.enabled = true;
  console.log("  内联组件:", n, "| mcpServers args:", JSON.stringify(srv.args));
  return { manifest: m, byFile: byFile };
}

/* ---------- 2.6 面板文件也内联（v0.9.14）----------
 * 包里的 panels/*.tsx 必须是**构建产物**：manifest 引用到的几个用同一份内联文本
 * （逐字节一致，不是重跑一次改写），其余带占位符的（如 panels/code-renderer.tsx，
 * 它用 `typeof LPC === "undefined" ? null : LPC` 兜了一手）也顺手内联掉 ——
 * 判定很简单：一个包里的面板源码，任何一份都不该是「跑不起来的半成品」。 */
function inlineStagedPanels(stageDir, byFile) {
  const pack = require(path.join(__dirname, "lib", "panel-inline.js"));
  const KERNELS = pack.buildKernels(stageDir);
  const hits = [];
  (function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) { if (ent.name !== "node_modules") walk(abs); continue; }
      if (!/\.(tsx|ts)$/.test(ent.name)) continue;
      hits.push(abs);
    }
  })(stageDir);
  let referenced = 0, extra = 0, clean = 0;
  for (const abs of hits) {
    const rel = path.relative(stageDir, abs).replace(/\\/g, "/");
    const cur = fs.readFileSync(abs, "utf8");
    if (Object.prototype.hasOwnProperty.call(byFile, rel)) {
      if (cur !== byFile[rel]) fs.writeFileSync(abs, byFile[rel]);
      referenced++;
      continue;
    }
    if (!pack.needsInline(cur)) { clean++; continue; }
    fs.writeFileSync(abs, pack.inlinePanel(cur, KERNELS, { label: rel }).text);
    extra++;
    console.log("  ✓ " + rel + " 顺带内联（不在 manifest 里，但也是半成品）");
  }
  /* 收口断言：暂存目录里任何一份面板源码都不许再带占位符 */
  const left = [];
  for (const abs of hits) {
    const rel = path.relative(stageDir, abs).replace(/\\/g, "/");
    const t = pack.tokensIn(fs.readFileSync(abs, "utf8"));
    if (t.length) left.push(rel + " → " + t.join("/"));
  }
  if (left.length) throw new Error("面板源码仍带占位符（构建输入混进发行包）: " + left.join(" | "));
  console.log("  面板文件: manifest 引用 " + referenced + " 个已写回产物 / 顺带内联 " + extra +
    " 个 / 本来干净 " + clean + " 个 —— 全包 0 个占位符");
  return { referenced: referenced, extra: extra, clean: clean, count: hits.length };
}

/* ---------- python 小工具：解包 / 打包（逐行拼，避免转义地狱） ---------- */
const NL = String.fromCharCode(10);
function writePy(file, lines) {
  fs.writeFileSync(file, lines.join(NL) + NL);
}
const UNZIP_PY = [
  "import sys, zipfile",
  "zf = zipfile.ZipFile(sys.argv[1])",
  "zf.extractall(sys.argv[2])",
  "print('extracted', len(zf.namelist()), 'files')"
];
const MKZIP_PY = [
  "import os, sys, zipfile",
  "src, out = sys.argv[1], sys.argv[2]",
  "src = os.path.abspath(src)",
  "entries = []",
  "for root, dirs, files in os.walk(src):",
  "    dirs.sort()",
  "    for f in sorted(files):",
  "        p = os.path.join(root, f)",
  "        entries.append((os.path.relpath(p, src).replace(os.sep, '/'), p))",
  "entries.sort(key=lambda x: (x[0] != 'manifest.json', x[0]))",
  "with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:",
  "    for arc, p in entries:",
  "        zi = zipfile.ZipInfo(arc, date_time=(1980, 1, 1, 0, 0, 0))",
  "        zi.compress_type = zipfile.ZIP_DEFLATED",
  "        zi.external_attr = 0o100644 << 16",
  "        z.writestr(zi, open(p, 'rb').read(), compresslevel=9)",
  "print('zip:', out, len(entries), 'entries')"
];

(async () => {
  /* 1. HEAD → 暂存目录（git archive 出 zip，python 解开；MSYS tar 不认盘符路径） */
  fs.rmSync(STAGE, { recursive: true, force: true });
  fs.mkdirSync(STAGE, { recursive: true });
  const stageZip = path.resolve(".setup", "_stage.zip");
  console.log("提取 HEAD 白名单 →", STAGE);
  execSync('git archive --format=zip --output="' + stageZip + '" HEAD -- ' +
    PATHS.map(p => '"' + p + '"').join(" "), { stdio: "inherit" });
  const unzipPy = path.resolve(".setup", "_unzip.py");
  writePy(unzipPy, UNZIP_PY);
  execSync('python "' + unzipPy + '" "' + stageZip + '" "' + path.resolve(STAGE) + '"', { stdio: "inherit" });

  /* 2. manifest 内联化 */
  console.log("内联化 manifest.json …");
  const built = buildInlinedManifest(STAGE);
  const m = built.manifest;
  fs.writeFileSync(path.join(STAGE, "manifest.json"), JSON.stringify(m, null, 2));

  /* 2.6 面板文件也内联 —— 包里的 panels/*.tsx 是产物，不是带占位符的构建输入 */
  console.log("内联化面板文件（panels/*.tsx）…");
  const panelStat = inlineStagedPanels(STAGE, built.byFile);

  /* 2.5 暂存目录里的 server/index.js 也把 VERSION 对齐 manifest.version
   *     （build-singlefile.js 只覆盖 ~/.notrat/tools 那一份；目录包这份不覆盖就自称旧版本） */
  const srvIdx = path.join(STAGE, "server", "index.js");
  let srvBody = fs.readFileSync(srvIdx, "utf8");
  if (!/^const VERSION = "[^"]*";/m.test(srvBody)) throw new Error("发行包 server/index.js 里找不到 VERSION 常量");
  srvBody = srvBody.replace(/^const VERSION = "[^"]*";.*$/m, 'const VERSION = "' + m.version + '";');
  fs.writeFileSync(srvIdx, srvBody);
  console.log("  发行包 server/index.js VERSION → " + m.version);

  /* 3. 打包（python zipfile，标准路径，manifest 首位） */
  const mkzipPy = path.resolve(".setup", "_mkzip.py");
  writePy(mkzipPy, MKZIP_PY);
  execSync('python "' + mkzipPy + '" "' + path.resolve(STAGE) + '" "' + path.resolve(ZIP) + '"', { stdio: "inherit" });

  /* 4/5. 结构 + 语义自检 */
  const buf = fs.readFileSync(ZIP);
  const names = verifyZip(buf, "构建产物");
  const esrc = m.contributions.editors[0].source || "";
  const usrc = (m.contributions.ui[0].content || {}).source || "";
  if (esrc.length < 100000) throw new Error("editors 内联源码异常短: " + esrc.length);
  if (usrc.length < 5000) throw new Error("ui 内联源码异常短: " + usrc.length);
  /* 5.5 包内面板实读（v0.9.14）：名字对了不代表内容是产物。
   *     ① 任何 panels/*.tsx 都不许带占位符（带 = 构建输入混进发行包）；
   *     ② manifest 引用到的每一个面板文件，包内字节必须与 manifest 里那份逐字节一致
   *        （两份各改一次就会漂 —— 宿主读哪份都得是同一份）；
   *     ③ 内联的 LPC 必须与单文件包形态**同源**（少 renderInlineHtml 就静默降级）。 */
  {
    const zipPack = require(path.join(__dirname, "lib", "panel-inline.js"));
    const ZIPKIT = zipPack;
    const panelNames = names.filter(x => x.startsWith("panels/") && /\.(tsx|ts)$/.test(x));
    if (!panelNames.length) throw new Error("发行包里一个 panels/*.tsx 都没有？白名单出问题了");
    const dirty = [];
    for (const nm of panelNames) {
      const t = zipPack.tokensIn(ZIPKIT.readZipEntry(buf, nm).toString("utf8"));
      if (t.length) dirty.push(nm + " → " + t.join("/"));
    }
    if (dirty.length) {
      throw new Error("发行包内面板仍是带占位符的构建输入（宿主读到什么编译什么，这就是 " +
        "ReferenceError: TX is not defined 的来路）: " + dirty.join(" | "));
    }
    for (const [rel, text] of Object.entries(built.byFile)) {
      const inZip = ZIPKIT.readZipEntry(buf, rel).toString("utf8");
      if (inZip !== text) {
        throw new Error("包内 " + rel + " 与 manifest 里那份不一致（" + inZip.length + " vs " + text.length +
          " 字符）—— 两份各改一次就会漂，宿主读哪份都得是同一份");
      }
    }
    const ed = m.contributions.editors[0];
    const kern = zipPack.hasKernelDefs(esrc);
    if (!kern.ok) throw new Error("发行包内联面板缺内核定义 " + kern.missing.join("/") + "（编译期不报错，运行到那一句才炸）");
    if (!/const LPC = \{ renderPreview: renderPreview, miniMath: miniMath, renderInlineHtml: renderInlineHtml \}/.test(esrc)) {
      throw new Error("发行包内联的 LPC 少了 renderInlineHtml —— 与单文件包形态不一致（行内 HTML 渲染会静默失效）");
    }
    console.log("  \u2713 包内面板实读: " + panelNames.length + " 份 panels 全无占位符 | " +
      Object.keys(built.byFile).length + " 份与 manifest 逐字节一致 | 内核 LPC/WYS/TX 齐全");
  }

  console.log("自检通过:", names.length, "个条目 |", (buf.length / 1024).toFixed(0) + "KB |",
    "editors.source", esrc.length, "字符 | ui.source", usrc.length, "字符 |",
    "sha256", sha256(buf).slice(0, 16) + "…");

  /* 6. 本版修复必须真的进包（v0.9.9）：内联面板里不能还有猜测式 serverId 兜底，
   *    且必须带 resolveServerId —— 否则发出去的包又回到「服务没起来 → Unknown tool」。 */
  if (m.version !== VERSION) throw new Error("发行包版本不是 " + VERSION + "，实际 " + m.version);
  if (/serverId\s*\|\|\s*"plugin-/.test(esrc)) {
    throw new Error("发行包的内联面板仍含猜测式 serverId 兜底（v0.9.9 的修复没进包）");
  }
  if (!esrc.includes("resolveServerId")) {
    throw new Error("发行包的内联面板里找不到 resolveServerId（v0.9.9 的修复没进包）");
  }
  console.log("  \u2713 本版修复可见：resolveServerId 在包内，猜测式兜底已消失");
  if (!names.includes(".setup/doctor.js")) {
    throw new Error("发行包里缺 .setup/doctor.js（换机器体检脚本）");
  }

  /* 6.5 本版修复必须真的进包（v0.9.10 → v0.9.13 四版合一）——
   *     任何一条不成立就说明「改了源码、打的却是旧包」，这类错吃一次就够。 */
  const staged = f => fs.readFileSync(path.resolve(STAGE, f), "utf8");
  const core0 = staged("server/preview-core.js");
  const GUARDS = [
    ["v0.9.10 标题里的字体声明（\\bfseries / \\[5pt] 不落正文）", /bfseries/.test(core0),
     "server/preview-core.js 里找不到 \\bfseries 声明内核"],
    ["v0.9.11 TikZ 绘图环境不当正文排", /tikzpicture/.test(core0),
     "server/preview-core.js 里找不到 tikzpicture 环境处理"],
    ["v0.9.12 绘图能就地看（graphic-render）",
     names.includes("server/graphic-render.js") && /graphic-render\.js/.test(staged("server/index.js")),
     "包里缺 server/graphic-render.js，或 server/index.js 没引用它"],
    ["v0.9.13 浮层里的图有人补（loadPopAssets）", /loadPopAssets/.test(esrc),
     "内联面板里找不到 loadPopAssets（浮层配图不会补）"]
  ];
  for (const [what, ok, why] of GUARDS) {
    if (!ok) throw new Error("发行包缺本版修复：" + what + " —— " + why);
    console.log("  \u2713 本版修复可见：" + what);
  }

  if (ZIP_ONLY) {
    console.log("");
    console.log("--zip-only：跳过 GitHub（没有建 Release、没有动任何资产）");
    console.log("本地包:", path.resolve(ZIP), "|", (buf.length / 1024).toFixed(0) + "KB | sha256", sha256(buf));
    console.log("包内条目:"); console.log(names.map(x => "  " + x).join("\n"));
    return;
  }

  /* 6. 建 Release（tag 已存在则查询） */
  const body = fs.readFileSync(NOTES, "utf8");
  let rel = await api("/repos/" + REPO + "/releases", {
    tag_name: TAG, target_commitish: "main",
    name: "LaTeX 助手 " + TAG, body, draft: false, prerelease: false
  });
  if (!rel.ok && rel.status === 422) {
    rel = { ok: true, json: (await api("/repos/" + REPO + "/releases/tags/" + TAG)).json };
  }
  if (!rel.ok) throw new Error("建 Release 失败: " + rel.status + " " + JSON.stringify(rel.json).slice(0, 300));
  const R = rel.json;

  for (const a of (R.assets || [])) {
    if (a.name === ZIP) {
      const d = await api("/repos/" + REPO + "/releases/assets/" + a.id, null, "DELETE");
      console.log("删旧资产:", a.name, "(id " + a.id + ", " + a.size + "B) → HTTP", d.status);
    }
  }

  console.log("上传资产:", ZIP, (buf.length / 1024).toFixed(0) + "KB …");
  const up = await api(R.upload_url.replace(/\{\?name,label\}$/, "") + "?name=" + ZIP, buf, "POST", "uploads.github.com");
  if (!up.ok) throw new Error("上传资产失败: " + up.status + " " + JSON.stringify(up.json).slice(0, 300));
  if (up.json.size !== buf.length) throw new Error("上传回执大小不一致: " + up.json.size + " ≠ " + buf.length);
  console.log("资产已上传:", up.json.name, up.json.size, "bytes | state:", up.json.state);

  /* 7. 匿名回环下载 → sha256 → 再过结构自检 */
  const fin = await api("/repos/" + REPO + "/releases/tags/" + TAG);
  const A = (fin.json.assets || []).find(a => a.name === ZIP);
  if (!A) throw new Error("上传后清单里找不到资产");
  let back = null, lastErr;
  for (let i = 1; i <= 4; i++) {
    try {
      const r = await fetch(A.browser_download_url);
      if (!r.ok) throw new Error("HTTP " + r.status);
      back = Buffer.from(await r.arrayBuffer()); break;
    } catch (e) { lastErr = e; console.log("  回环下载抖动(第" + i + "次) → 重试"); await sleep(2000 * i); }
  }
  if (!back) throw new Error("回环下载失败: " + lastErr.message);
  if (back.length !== buf.length || sha256(back) !== sha256(buf))
    throw new Error("回环 sha256 不一致！远端资产不可信");
  verifyZip(back, "回环下载件");
  console.log("回环验证:", (back.length / 1024).toFixed(0) + "KB | sha256 一致 | 条目路径全部标准");

  console.log("");
  console.log("=== 最终验收 ===");
  console.log("下载地址（匿名可下）:", A.browser_download_url);
  console.log("包内条目:"); console.log(names.map(x => "  " + x).join("\n"));
})().catch(e => { console.error("失败:", e.message); process.exit(1); });
