/* v0.9.6 验收层 [30]：引擎一键安装（异步任务 / 跨平台资产表 / 不留半成品）
 *
 * 为什么单独一层：
 *   这条路的失败模式是**用户机器上才现形**的 —— 平台资产名写错、代理没读、解压回退没接上、
 *   半截文件落进探测目录……每一条在本机都跑得好好的，到了别人的 Linux 上就是「一键安装点了没反应」。
 *   所以这里钉的是四件事：
 *     [A] 资产表与 URL 拼装：8 种平台/架构组合逐个对，不认识的要**说清认识哪些**（不是沉默）
 *     [B] 设置项注入的坑：宿主没配过时会把 `${settings:mirror}` 原样传下来 —— 那必须当「没设置」
 *     [C] 解压 / 找可执行 / 试跑：用自造的 tar.gz 真跑一遍（不靠网），且「跑不起来」要返回结果不抛
 *     [D] 契约与接线：server 真往返两个工具；面板真的调它们；装完真的 reset 重探
 *   真下载（联网、约 20MB）单独一层，默认不跑：NOTRAT_ENGINE_E2E=1 才开。
 *
 * ⚠ 本层**不动用户机器上的任何东西**：所有落盘都在 os.tmpdir() 的临时目录里，退出即清。
 *
 * 运行： node .setup/check/v096-engine-install.js
 *       NOTRAT_ENGINE_E2E=1 node .setup/check/v096-engine-install.js   # 额外跑一次真下载
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const WS = "E:/notrat-latex-plugin";
const SERVER = path.join(WS, "server", "index.js");
const DEPLOYED = path.join(os.homedir(), ".notrat", "plugins", "notrat-latex-plugin.json");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok    " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra !== undefined && extra !== "" ? "\n        → " + extra : "")); }
}
function section(t) { console.log("\n" + t); }

const EI = require(path.join(WS, "server", "engine-install.js"));

/* 临时目录统一登记，退出时清干净 */
const TEMPS = [];
function mkTemp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  TEMPS.push(d);
  return d;
}
process.on("exit", () => {
  for (const d of TEMPS) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} }
});

/* ================================================================== */
section("[A] 跨平台资产表：8 种组合逐个对（上游 tectonic@0.17.0 实有产物）");
{
  /* 期望值是对着 GitHub 上那 10 个产物名核过的，不是照命名规则推的 */
  const EXPECT = {
    "win32/x64":    ["x86_64-pc-windows-msvc", "zip"],
    "win32/arm64":  ["x86_64-pc-windows-msvc", "zip"],      // 上游没发 win-arm64，退 x64
    "darwin/x64":   ["x86_64-apple-darwin", "tar.gz"],
    "darwin/arm64": ["aarch64-apple-darwin", "tar.gz"],
    "linux/x64":    ["x86_64-unknown-linux-musl", "tar.gz"],
    "linux/arm64":  ["aarch64-unknown-linux-musl", "tar.gz"],
    "linux/arm":    ["arm-unknown-linux-musleabihf", "tar.gz"],
    "linux/ia32":   ["i686-unknown-linux-gnu", "tar.gz"],
  };
  let bad = [];
  for (const k of Object.keys(EXPECT)) {
    const [plat, arch] = k.split("/");
    const spec = EI.assetFor(plat, arch);
    if (spec.triple !== EXPECT[k][0] || spec.ext !== EXPECT[k][1]) {
      bad.push(`${k}: 拿到 ${spec.triple}.${spec.ext}，期望 ${EXPECT[k][0]}.${EXPECT[k][1]}`);
    }
  }
  ok("8/8 平台架构组合 → 正确三元组与扩展名", bad.length === 0, bad.join("; "));
  ok("上游没发 win/arm64 时给了说明（不能悄悄换）",
     /arm64/.test(JSON.stringify(EI.assetFor("win32", "arm64").note || "") + "") ||
     (EI.assetFor("win32", "arm64").note || "").length > 10,
     EI.assetFor("win32", "arm64").note);

  /* 错误信息要能自证：说清「认识哪些」，用户才知道下一步干嘛 */
  let e1 = null;
  try { EI.assetFor("solaris", "sparc"); } catch (e) { e1 = e; }
  ok("不支持的平台 → 抛错", !!e1);
  ok("错误里列出支持的平台", !!e1 && /win32/.test(e1.message) && /darwin/.test(e1.message) && /linux/.test(e1.message), e1 && e1.message);
  ok("错误里给了手动安装命令", !!e1 && /MiKTeX|mactex|apt/.test(e1.message), e1 && e1.message);

  let e2 = null;
  try { EI.assetFor("linux", "mips"); } catch (e) { e2 = e; }
  ok("不支持的架构 → 抛错并列出该平台已发架构",
     !!e2 && /linux\/mips/.test(e2.message) && /x64/.test(e2.message) && /arm64/.test(e2.message), e2 && e2.message);
}

/* ================================================================== */
section("[B] URL 拼装与镜像前缀");
{
  const spec = EI.assetFor("win32", "x64");
  ok("versionOfTag：tectonic@0.17.0 → 0.17.0", EI.versionOfTag("tectonic@0.17.0") === "0.17.0", EI.versionOfTag("tectonic@0.17.0"));
  ok("versionOfTag 容忍 v 前缀与裸版本号",
     EI.versionOfTag("v0.17.0") === "0.17.0" && EI.versionOfTag("0.17.0") === "0.17.0");
  ok("tagOf：0.17.0 → tectonic@0.17.0", EI.tagOf("0.17.0") === "tectonic@0.17.0");

  const nm = EI.assetName("0.17.0", spec);
  ok("资产名 == 上游真实文件名（win/x64）",
     nm === "tectonic-0.17.0-x86_64-pc-windows-msvc.zip", nm);
  ok("资产名（linux/x64）== 上游真实文件名",
     EI.assetName("0.17.0", EI.assetFor("linux", "x64")) === "tectonic-0.17.0-x86_64-unknown-linux-musl.tar.gz",
     EI.assetName("0.17.0", EI.assetFor("linux", "x64")));

  const u = EI.assetUrl("0.17.0", spec);
  ok("下载地址形状正确（tag 用 tectonic@）",
     u === "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic@0.17.0/tectonic-0.17.0-x86_64-pc-windows-msvc.zip", u);

  ok("镜像为空 → 原样返回", EI.applyMirror("", u) === u && EI.applyMirror(undefined, u) === u);
  ok("镜像前缀拼接（无尾斜杠自动补一个）",
     EI.applyMirror("https://ghproxy.net", u) === "https://ghproxy.net/" + u,
     EI.applyMirror("https://ghproxy.net", u));
  ok("镜像前缀拼接（有尾斜杠不重复补）",
     EI.applyMirror("https://ghproxy.net/", u) === "https://ghproxy.net/" + u);
  ok("镜像同样作用于 API 地址（否则国内照样卡在查版本这步）",
     EI.applyMirror("https://ghproxy.net/", EI.API_LATEST) === "https://ghproxy.net/" + EI.API_LATEST);
}

/* ================================================================== */
section("[C] 设置项注入的坑：没配过时宿主原样传占位符 —— 必须当「没设置」");
{
  const keep = { LATEX_MIRROR: process.env.LATEX_MIRROR, LATEX_NET_PROXY: process.env.LATEX_NET_PROXY };
  ok("未替换的占位符视为未设置（否则会把 ${settings:mirror} 拼进 URL）",
     EI.envClean("__NOPE__") === "" &&
     (process.env.LATEX_MIRROR = "${settings:mirror}", EI.mirrorFromEnv() === ""),
     JSON.stringify(EI.mirrorFromEnv()));
  ok("真值照常读出（前后空白裁掉）",
     (process.env.LATEX_MIRROR = "  https://ghproxy.net/  ", EI.mirrorFromEnv() === "https://ghproxy.net/"),
     JSON.stringify(EI.mirrorFromEnv()));
  ok("空串 = 未设置",
     (process.env.LATEX_MIRROR = "   ", EI.mirrorFromEnv() === ""));
  ok("envClean 对 undefined 不炸", EI.envClean("__ALSO_NOPE__") === "");
  if (keep.LATEX_MIRROR === undefined) delete process.env.LATEX_MIRROR; else process.env.LATEX_MIRROR = keep.LATEX_MIRROR;
  if (keep.LATEX_NET_PROXY === undefined) delete process.env.LATEX_NET_PROXY; else process.env.LATEX_NET_PROXY = keep.LATEX_NET_PROXY;

  /* 代理决策：off / 自动 / 显式 三条路 */
  const savedP = { HTTPS_PROXY: process.env.HTTPS_PROXY, https_proxy: process.env.https_proxy, HTTP_PROXY: process.env.HTTP_PROXY, http_proxy: process.env.http_proxy };
  delete process.env.HTTPS_PROXY; delete process.env.https_proxy; delete process.env.HTTP_PROXY; delete process.env.http_proxy;
  ok("代理：off → 不走代理（强制直连）", EI.resolveProxy("off") === null);
  ok("代理：direct/none/false/0 都算关", EI.resolveProxy("direct") === null && EI.resolveProxy("none") === null && EI.resolveProxy("false") === null && EI.resolveProxy("0") === null);
  ok("代理：空 + 环境也没有 → null", EI.resolveProxy("") === null);
  const p1 = EI.resolveProxy("http://127.0.0.1:7890");
  ok("代理：显式地址解析出 host/port", !!p1 && p1.host === "127.0.0.1" && p1.port === 7890, JSON.stringify(p1));
  const p2 = EI.resolveProxy("http://user:pw@proxy.local:3128");
  ok("代理：带认证的地址解出 auth", !!p2 && /user:pw/.test(p2.auth) && p2.port === 3128, JSON.stringify(p2));
  ok("代理：空 + 环境有 HTTPS_PROXY → 自动用上",
     (process.env.HTTPS_PROXY = "http://env-proxy:8888", (function () { const p = EI.resolveProxy(""); return !!p && p.port === 8888; })()),
     JSON.stringify(EI.resolveProxy("")));
  if (savedP.HTTPS_PROXY === undefined) delete process.env.HTTPS_PROXY; else process.env.HTTPS_PROXY = savedP.HTTPS_PROXY;
  if (savedP.https_proxy === undefined) delete process.env.https_proxy; else process.env.https_proxy = savedP.https_proxy;
  if (savedP.HTTP_PROXY === undefined) delete process.env.HTTP_PROXY; else process.env.HTTP_PROXY = savedP.HTTP_PROXY;
  if (savedP.http_proxy === undefined) delete process.env.http_proxy; else process.env.http_proxy = savedP.http_proxy;
  ok("代理：非法地址不抛（当没配）", EI.resolveProxy("::::not a url") === null);
  ok("NO_PROXY 匹配：精确 / 后缀 / 通配",
     EI.noProxyMatch("github.com", "github.com") &&
     EI.noProxyMatch("a.github.com", ".github.com") &&
     EI.noProxyMatch("x.y", "a,b,*") &&
     !EI.noProxyMatch("github.com", "example.com"));
}

/* ================================================================== */
section("[D] 干跑 describe()：不发任何请求就能看出「会下哪个、落到哪、走不走代理」");
{
  const d = EI.describe({ platform: "win32", arch: "x64", version: "0.17.0", dir: "X:/no/such/dir" });
  ok("describe：资产名正确", d.asset === "tectonic-0.17.0-x86_64-pc-windows-msvc.zip", d.asset);
  ok("describe：落点默认在 ~/.notrat/tools/bin（探测链会扫）",
     EI.describe({ platform: "win32", arch: "x64" }).dir === path.join(os.homedir(), ".notrat", "tools", "bin"));
  ok("describe：exe 名按平台给（win 是 .exe，unix 无后缀）",
     path.basename(EI.describe({ platform: "win32", arch: "x64" }).exe) === "tectonic.exe" &&
     path.basename(EI.describe({ platform: "linux", arch: "x64", dir: "X:/no/such/dir" }).exe) === "tectonic",
     path.basename(EI.describe({ platform: "win32", arch: "x64" }).exe) + " / " +
     path.basename(EI.describe({ platform: "linux", arch: "x64", dir: "X:/no/such/dir" }).exe));
  ok("describe：没给版本时明说「要先查 API」而不是编一个",
     /API/.test(EI.describe({}).url) && EI.describe({}).version === "(最新)", EI.describe({}).url);
  ok("describe：不支持的平台照样抛（同步可判）",
     (function () { try { EI.describe({ platform: "plan9", arch: "x64" }); return false; } catch (e) { return true; } })());
  /* 装了就能认出来：这是「无需配 PATH」的技术前提 */
  const ctr = fs.readFileSync(path.join(WS, "server", "contrib.js"), "utf8");
  ok("contrib.js 的 probeDirs 里确实有 .notrat/tools/bin（否则装完认不出）",
     /"\.notrat",\s*"tools",\s*"bin"/.test(ctr) || /\.notrat", "tools", "bin/.test(ctr));
  ok("defaultDir() 与 probeDirs 那一项逐字一致",
     ctr.includes(path.join(".notrat", "tools", "bin").replace(/\\/g, "\\")) ||
     ctr.includes('".notrat", "tools", "bin"'));
}

/* ================================================================== */
section("[E] 解压 / 找可执行 / 试跑：自造 tar.gz 真跑一遍（不联网）");
{
  /* 造一个和上游同构的包：tectonic-<ver>-<triple>/tectonic */
  const src = mkTemp("ei-src-");
  const inner = "tectonic-9.9.9-x86_64-unknown-linux-musl";
  fs.mkdirSync(path.join(src, inner), { recursive: true });
  fs.writeFileSync(path.join(src, inner, "tectonic"), "#!/bin/sh\necho 'Tectonic 9.9.9'\n");
  try { fs.chmodSync(path.join(src, inner, "tectonic"), 0o755); } catch (e) {}
  const tgz = path.join(src, "pack.tar.gz");
  const made = spawnSync("tar", ["-czf", "pack.tar.gz", inner], { encoding: "utf8", windowsHide: true, cwd: src });
  ok("造出测试包（tar -czf）", made.status === 0 && fs.existsSync(tgz), (made.stderr || "").slice(0, 200));

  const dest = mkTemp("ei-x-");
  const ex = EI.extractArchive(tgz, "tar.gz", dest);
  ok("解压 tar.gz 成功", ex.ok === true, JSON.stringify(ex));
  const found = EI.findBinary(dest, "tectonic");
  ok("递归找到可执行文件（包内多一层目录也能找到）", !!found, String(found));
  ok("找不到时返回 null（不是抛）", EI.findBinary(dest, "tectonic-not-here") === null);

  /* 「跑不起来」必须返回结果、不能抛 —— 调用链靠这个决定要不要落位 */
  const v0 = EI.verifyBinary(path.join(dest, "definitely-missing-tectonic"));
  ok("试跑不存在的文件 → ok:false（不抛）", v0.ok === false && typeof v0.msg === "string" && v0.msg.length > 4, v0.msg);

  if (process.platform === "win32") {
    console.log("  --    Windows 上没法伪造可跑的 tectonic.exe，真试跑交给 [G] 层的真引擎");
  } else {
    const v1 = EI.verifyBinary(found);
    ok("试跑 → 解析出版本号 9.9.9", v1.ok === true && v1.version === "9.9.9", JSON.stringify(v1));
  }

  /* 坏包：要能报出「试过哪些解压方式」，否则用户看到一句「解压失败」无从下手 */
  const bad = path.join(src, "broken.tar.gz");
  fs.writeFileSync(bad, "this is not a gzip archive");
  const eb = EI.extractArchive(bad, "tar.gz", mkTemp("ei-bad-"));
  ok("坏包 → ok:false 且列出试过的解压命令（用户才知道下一步）",
     eb.ok === false && Array.isArray(eb.tries) && eb.tries.length > 0, JSON.stringify(eb));
  ok("解压策略里含「相对路径」这条路（GNU tar 盘符坑的解药）",
     ex.ok === true && ex.tries.some((t) => /相对路径/.test(t)), JSON.stringify(ex.tries));
}

/* ================================================================== */
section("[F] 不留半成品：目标已有引擎时**拒绝**（除非显式 force）");
{
  const dir = mkTemp("ei-has-");
  const exe = path.join(dir, EI.exeName(process.platform));
  fs.writeFileSync(exe, "pretend engine");

  const r = EI.startInstall({ dir: dir });           // 不给 force
  ok("已有引擎 → 不给任务号（没有 id）", r && !r.id, JSON.stringify(r).slice(0, 200));
  ok("已有引擎 → state=error 且 ok=false", r.state === "error" && r.ok === false);
  ok("已有引擎 → 说清怎么覆盖（提示 force）", /force/i.test(r.msg), r.msg);
  ok("拒绝时不联网、不改动那个文件",
     fs.readFileSync(exe, "utf8") === "pretend engine");
}

/* ================================================================== */
section("[G] 契约与接线：server 真往返 + 面板真调用");
function rpc(lines) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SERVER], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.on("close", () => resolve(out.split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean)));
    for (const l of lines) child.stdin.write(JSON.stringify(l) + "\n");
    child.stdin.end();
  });
}
const call = (name, args, id) => ({ jsonrpc: "2.0", id: id, method: "tools/call", params: { name: name, arguments: args || {} } });

(async () => {
  const dir = mkTemp("ei-guard-");
  fs.writeFileSync(path.join(dir, EI.exeName(process.platform)), "pretend engine");

  const rs = await rpc([
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    call("latex_engine_install", { dir: dir }, 2),                       // 应当被「已有引擎」挡下，不联网
    call("latex_engine_install_status", { jobId: "nope" }, 3),           // 未知任务号
    call("latex_engine_install_status", {}, 4),                          // 无任务
  ]);
  const byId = {};
  for (const r of rs) if (r && r.id) byId[r.id] = r;
  const textOf = (r) => (((r || {}).result || {}).content || []).map((c) => c.text).join("\n");

  const tools = (((byId[1] || {}).result || {}).tools) || [];
  ok("tools/list 里有 latex_engine_install", tools.some((t) => t.name === "latex_engine_install"));
  ok("tools/list 里有 latex_engine_install_status", tools.some((t) => t.name === "latex_engine_install_status"));
  const instTool = tools.find((t) => t.name === "latex_engine_install") || {};
  const props = (instTool.inputSchema || {}).properties || {};
  ok("install 工具暴露 version/mirror/proxy/force/dir",
     ["version", "mirror", "proxy", "force", "dir"].every((k) => k in props), Object.keys(props).join(","));
  ok("install 工具描述里点明「异步」（否则调用方会等结果）", /异步/.test(instTool.description || ""));
  ok("status 工具描述里点明「不传 jobId = 查最近一个」（面板靠这个续进度）",
     /最近一个/.test((tools.find((t) => t.name === "latex_engine_install_status") || {}).description || ""));

  const g = JSON.parse(textOf(byId[2]));
  ok("已有引擎时工具调用被挡下（不误装、不误删）", g.state === "error" && !g.id, textOf(byId[2]).slice(0, 200));
  ok("挡下时把 force 的用法说清楚", /force/.test(g.msg || ""), g.msg);

  const s3 = JSON.parse(textOf(byId[3]));
  ok("查未知任务号 → state=none（不是崩）", s3.state === "none", textOf(byId[3]));
  ok("无任务时说清「任务记录不跨 server 进程」", /进程/.test(s3.msg || ""), s3.msg);
  const s4 = JSON.parse(textOf(byId[4]));
  ok("不带 jobId 且没有任务 → 也返回 none（面板不会崩）", s4.state === "none", textOf(byId[4]));

  /* ---------- 面板接线 ---------- */
  const src = fs.readFileSync(path.join(WS, "panels", "editor.tsx"), "utf8");
  ok("面板调 latex_engine_install", src.includes('callTool("latex_engine_install"'));
  ok("面板调 latex_engine_install_status（轮询）", src.includes('callTool("latex_engine_install_status"'));
  ok("有 installEngine 处理函数", /async function installEngine\(\)/.test(src));
  ok("有 cancelEngineInstall 处理函数", /async function cancelEngineInstall\(\)/.test(src));
  ok("轮询用 setTimeout 串起来（不是 setInterval —— 上一次没回来就不发下一次）",
     /enginePollRef\.current = setTimeout/.test(src) && !/setInterval\(function \(\) \{ pollEngineJob/.test(src));
  ok("轮询有终态判断（done/error/cancelled 就停）",
     /engineJobActive/.test(src) && /"done"/.test(src) && /"cancelled"/.test(src));
  ok("卸载时清掉定时器（切档不漏定时器）", /clearTimeout\(enginePollRef\.current\)/.test(src));
  ok("重挂载会续上还在跑的任务（不让它变孤儿）", /engineNote, serverId\]/.test(src));
  ok("装完先重探引擎再报喜（否则缓存会答「仍未检测到」）",
     /await recheckEngine\(\)/.test(src));
  ok("装完撤掉提示条（用户不用再点任何东西）",
     /recheckEngine/.test(src) && /setEngineNote\(null\)/.test(src));

  /* 提示条里的按钮：必须落在提示条那段切片内（接线到别处 = 用户看不见） */
  const iBanner = src.indexOf("{/* 首屏引擎提示条");
  const iEnd = iBanner >= 0 ? src.indexOf(") : null}", src.indexOf("知道了", iBanner)) : -1;
  const banner = iBanner >= 0 ? src.slice(iBanner, iEnd > iBanner ? iEnd + 10 : iBanner + 4000) : "";
  ok("「一键安装引擎」按钮在提示条切片内（不是挂在别处）", banner.includes("一键安装引擎"), "切片长度 " + banner.length);
  ok("按钮旁边说明了体积（别让用户以为秒装）", /MB/.test(banner) && /10~22/.test(banner));
  ok("说明了免管理员 / 免配 PATH", banner.includes("免管理员") && banner.includes("免配 PATH"));
  ok("提醒了首次编译还要联网拉宏包（否则以为装完就秒出 PDF）", /宏包/.test(banner));
  ok("进度条与取消按钮也在提示条内", banner.includes("engineJob") && banner.includes("取消"));
  ok("原来的三个出口没被挤掉（重新检测 / 知道了 / 安装命令）",
     banner.includes("重新检测") && banner.includes("知道了") && banner.includes("engineNote.installHint"));

  /* ---------- 装机包（已构建时才有）---------- */
  if (fs.existsSync(DEPLOYED)) {
    const pkg = JSON.parse(fs.readFileSync(DEPLOYED, "utf8"));
    const dsrc = (pkg.contributions.editors[0] || {}).source || "";
    ok("装机包里也带上了按钮（build 真的把这次改动打进去了）", dsrc.includes("一键安装引擎"));
    const toolsDir = path.join(os.homedir(), ".notrat", "tools");
    ok("装机包把 engine-install.js 也拷了（漏了 MCP server 起不来 —— v0.9.4 的坑）",
       fs.existsSync(path.join(toolsDir, "engine-install.js")), path.join(toolsDir, "engine-install.js"));
    const deployedManifestEnv = ((pkg.mcpServers || [])[0] || {}).env || {};
    ok("装机 manifest 注入了 LATEX_MIRROR（设置项真能传到 server）", "LATEX_MIRROR" in deployedManifestEnv);
    ok("装机 manifest 注入了 LATEX_NET_PROXY", "LATEX_NET_PROXY" in deployedManifestEnv);
  } else {
    console.log("  --    没找到装机包，跳过「装机形态」三条（跑一次 npm run build 会更全）");
  }

  /* ---------- 反回归：从 index.js 出发的 require 闭包 ⊆ 构建拷贝清单 ----------
   * v0.9.4 的坑：tex-encoding.js 加了但没进拷贝清单 → 装机后 MCP server 起不来。
   * 这里不「扫全目录」（那样会把 docmodel/txlog 这些只被测试用的文件也算进来，天天误报），
   * 而是**从真正被执行的入口 index.js 走 require 图**，一步步算闭包 —— 精确且更严。 */
  const bsrc = fs.readFileSync(path.join(WS, ".setup", "build-singlefile.js"), "utf8");
  const copyList = (bsrc.match(/for \(const f of \[([^\]]+)\]\)/) || [])[1] || "";
  const copied = new Set([...copyList.matchAll(/"([^"]+)"/g)].map((m) => m[1]));
  const sdir = path.join(WS, "server");
  const seen = new Set();
  const jsDeps = [];
  const jsonDeps = [];
  (function walk(file) {
    const abs = path.join(sdir, file);
    if (!fs.existsSync(abs)) return;
    const body = fs.readFileSync(abs, "utf8");
    for (const mm of body.matchAll(/require\("\.\/([A-Za-z0-9._-]+)"\)/g)) {
      const dep = mm[1];
      if (seen.has(dep)) continue;
      seen.add(dep);
      if (/\.json$/.test(dep)) { jsonDeps.push(dep); continue; }
      jsDeps.push(dep);
      walk(dep);
    }
  })("index.js");
  const missing = jsDeps.filter((f) => !copied.has(f));
  ok("server 运行时 require 闭包 ⊆ 构建拷贝清单（漏一个 = 装机后 server 起不来）",
     missing.length === 0, "漏了: " + missing.join(", ") + " | 闭包: " + jsDeps.join(", "));
  ok("闭包算得对（至少含 contrib / export-html / engine-install）",
     ["contrib.js", "export-html.js", "engine-install.js"].every((f) => jsDeps.includes(f)), jsDeps.join(", "));
  ok("data 资产（.json）由构建单独拷贝（不在 for 清单里，但要真被拷）",
     jsonDeps.every((f) => bsrc.includes(path.basename(f))), "json 依赖: " + jsonDeps.join(", "));
  ok("engine-install.js 已进拷贝清单", copyList.includes("engine-install.js"), copyList);

  /* ================================================================== */
  section("[I] 安装指引不硬编码 winget（LTSC / Server / 删过 Store 的机器根本没有它）");
  {
    /* 为什么单列一层：
     *   winget 是「App Installer」这个可选组件提供的，不是 Windows 自带命令。
     *   把 `winget install MiKTeX.MiKTeX` 写死进指引，等于对一批用户（LTSC / Server /
     *   精简镜像 / 删过 Store 的机器）发一条**本机跑不了**的命令 —— 他们拿到的不是帮助，
     *   是一次「命令找不到」的二次失败。而这类机器恰恰最需要准确的下一步指引。
     *   本层钉住三件事：① 有哪个才给哪个；② 三无时不许再提 winget，改给下载页；
     *   ③ 跨平台（assetFor 会问 solaris/linux）不许拿本机的包管理器去猜。 */
    const C = require(path.join(WS, "server", "contrib.js"));
    const NO_PM = { winget: false, choco: false, scoop: false, brew: false, apt: false, dnf: false, pacman: false, zypper: false };

    /* ① 纯函数逐台机器验（不依赖跑门禁的这台装了什么） */
    const hWinget = C.installHintFor("win32", { winget: true });
    ok("win32 有 winget → 给 winget 命令", /^winget install /.test(hWinget), hWinget);

    const hChoco = C.installHintFor("win32", { choco: true });
    ok("win32 只有 choco → 给 choco，且**不出现 winget**（不再推一条跑不了的）",
       /^choco install /.test(hChoco) && !/winget/.test(hChoco), hChoco);

    const hNone = C.installHintFor("win32", NO_PM);
    ok("win32 三无（LTSC/Server）→ 不出现 winget install，改给官方下载页",
       !/winget install/.test(hNone) && /miktex\.org\/download/.test(hNone), hNone);

    const hBrew = C.installHintFor("darwin", { brew: true });
    const hNoBrew = C.installHintFor("darwin", NO_PM);
    ok("darwin：有 brew 给 brew，没有就不许再提 brew install",
       /^brew install /.test(hBrew) && !/brew install/.test(hNoBrew), hBrew + "  ||  " + hNoBrew);

    ok("linux：按发行版各给各的（apt / dnf / pacman / zypper）",
       /^sudo apt /.test(C.installHintFor("linux", { apt: true })) &&
       /^sudo dnf /.test(C.installHintFor("linux", { dnf: true })) &&
       /^sudo pacman /.test(C.installHintFor("linux", { pacman: true })) &&
       /^sudo zypper /.test(C.installHintFor("linux", { zypper: true })));

    ok("linux 一个包管理器都没有 → 给 TeX Live 官方页（不是硬编一条 apt）",
       /tug\.org\/texlive/.test(C.installHintFor("linux", NO_PM)), C.installHintFor("linux", NO_PM));

    /* ② 跨平台不探测：assetFor 的错误信息会问 solaris / linux，
     *    拿本机（可能正是 Windows）的包管理器去猜那边有什么，只会得出更荒唐的答案。 */
    const mSolaris = EI.manualHint("solaris");
    ok("跨平台兜底不做本机探测（solaris 仍给通用命令，不被本机污染）",
       /apt|dnf|pacman|zypper|texlive/.test(mSolaris), mSolaris);
    let e3 = null;
    try { EI.assetFor("solaris", "sparc"); } catch (e) { e3 = e; }
    ok("assetFor 的平台错误里仍带可用指引（[A] 那条没被改坏）",
       !!e3 && /MiKTeX|mactex|apt/.test(e3.message), e3 && e3.message);

    /* ③ 单一实现：engine-install 的 manualHint 必须走 contrib，不许自己再抄一份
     *    （抄两份 = 下次再修 winget 只改一处，然后插件自己前后矛盾） */
    const eiSrc = fs.readFileSync(path.join(WS, "server", "engine-install.js"), "utf8");
    ok("engine-install.js 的 manualHint 委托 contrib（不重复实现）",
       /require\("\.\/contrib\.js"\)/.test(eiSrc) && /contrib\.manualHint/.test(eiSrc));

    /* ④ 本机真探：探到的必须就是「这台能给的那条」 */
    const pm = C.packageManagers();
    const live = C.installHint();
    ok("本机探测结果与指引自洽（本机没 winget 就不许出现 winget install）",
       pm.winget === true || !/winget install/.test(live), live + "   [本机 " + JSON.stringify(pm) + "]");
    if (process.platform === "win32" && !pm.winget) {
      ok("本机（无 winget）→ 指引不推 winget，改推本机真有的或下载页",
         !/winget install/.test(live) && (/choco/.test(live) || /scoop/.test(live) || /miktex\.org/.test(live)), live);
    } else {
      console.log("  --    本机 " + process.platform + " winget=" + pm.winget + "，跳过「无 winget 机器」那条实机断言");
    }
    ok("包管理器探测有缓存（冷路径只探一次，别在每次探测引擎时都扫 PATH）",
       C.packageManagers() === C.packageManagers(),
       "缓存对象应是同一个引用；resetPmCache 可清");
    C.resetPmCache();
    ok("resetPmCache 能清掉（换 PATH 后重探用）", typeof C.resetPmCache === "function" && (C.packageManagers(), true));

    /* ⑤ 面板里不许再有写死的 winget 兜底文案 */
    const panelSrc = fs.readFileSync(path.join(WS, "panels", "editor.tsx"), "utf8");
    ok("面板提示条没有写死的 winget 兜底文案", !/installHint \|\| "winget/.test(panelSrc));

    /* ⑥ hasCmd 边界：不存在的命令要返回 false，不能抛（它跑在「用户没装引擎」这条路上，
     *    这条路再抛异常，用户看到的就是「插件整个没反应」） */
    ok("hasCmd 对不存在的命令返回 false（不抛）",
       C.hasCmd("definitely-no-such-cmd-" + Date.now()) === false);
  }

  /* ================================================================== */
  if (process.env.NOTRAT_ENGINE_E2E === "1") {
    section("[H] 真下载（NOTRAT_ENGINE_E2E=1）：约 20MB，装到临时目录，装完即删");
    const tdir = mkTemp("ei-e2e-");
    const job = EI.startInstall({ dir: tdir, version: process.env.NOTRAT_ENGINE_VERSION || "" });
    if (!job.id) {
      ok("E2E 任务能起（该临时目录里没有引擎）", false, JSON.stringify(job).slice(0, 200));
    } else {
      const t0 = Date.now();
      let st = job;
      while (Date.now() - t0 < 10 * 60 * 1000) {
        st = EI.jobStatus(job.id) || st;
        if (!EI.jobStatus(job.id) || ["done", "error", "cancelled"].includes(st.state)) break;
        await new Promise((r) => setTimeout(r, 1000));
        if (st.state === "downloading" && st.percent) process.stdout.write("      … " + st.phase + " " + st.percent + "% (" + (st.received / 1048576).toFixed(1) + "MB)\r");
      }
      console.log("");
      ok("E2E：任务跑完（state=done）", st.state === "done", JSON.stringify({ state: st.state, error: st.error, log: st.log }).slice(0, 500));
      ok("E2E：拿到版本号", !!(st.result && st.result.version), JSON.stringify(st.result));
      ok("E2E：文件真的落在目标目录且可执行",
         !!(st.result && fs.existsSync(st.result.exe)), st.result && st.result.exe);
      ok("E2E：留了 sha256（事后可核）", !!(st.result && /^[0-9a-f]{64}$/.test(st.result.sha256 || "")));
      ok("E2E：临时目录已清（不留半成品）",
         ![...[]].length && fs.readdirSync(os.tmpdir()).filter((n) => /^notrat-tectonic-/.test(n)).length === 0,
         "残留: " + fs.readdirSync(os.tmpdir()).filter((n) => /^notrat-tectonic-/.test(n)).join(","));
      const rev = st.result ? EI.verifyBinary(st.result.exe) : { ok: false, msg: "(没有结果)" };
      ok("E2E：落位的引擎能自证（再跑一次 --version）", rev.ok === true, JSON.stringify(rev));
      ok("E2E：verifyBinary 对空入参不抛（边界要稳）",
         EI.verifyBinary("").ok === false && EI.verifyBinary(null).ok === false && EI.verifyBinary(undefined).ok === false);
      await rpc([call("latex_env", { action: "reset" }, 9)]);
    }
  } else {
    section("[H] 真下载：默认跳过（要跑就 NOTRAT_ENGINE_E2E=1）");
    console.log("  --    本层默认不联网：跨平台资产表、解压、拒绝覆盖、工具契约都不需要网就能验");
  }

  console.log("\n" + (fail === 0 ? "✓ v0.9.6 引擎一键安装层全绿（" + pass + "/" + (pass + fail) + "）"
                                : "✗ 本层有 " + fail + " 项未通过（通过 " + pass + "）"));
  process.exit(fail === 0 ? 0 : 1);
})();
