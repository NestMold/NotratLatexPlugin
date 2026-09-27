/* v0.8.5 验收层 [9]：引擎自检与首屏提示条
 *
 * 为什么单独一层：
 *   这条路的失败模式是**静默**的 —— 没装引擎的人打开 .tex，如果提示条不出现，
 *   他唯一能得到的线索是「点编译，然后看到一段错」，而第一反应是「插件坏了」。
 *   反过来，提示条乱弹（每次打开都弹、点了「知道了」还弹）同样是把人赶走。
 *   所以这里钉的是三件事：**该弹才弹、只弹一次、说的话是实话**。
 *
 * ⚠ 本层**不渲染 React**（工作区没有 react 依赖，不为此装一个）：
 *   验的是「决策条件 / 文案 / 工具契约 / 真 server 往返」，渲染本身由 [7] 层的
 *   模式契约与 [4] 层的 DOM 往返间接看护。判定表那一段是**从装机源码里把
 *   guard 表达式抠出来求值**（不是照抄一遍），源码改条件这里会先红。
 *
 * 运行： node .setup/check-v085-env-banner.js
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { spawn } = require("child_process");

const WS = "E:/notrat-latex-plugin";
const DEPLOYED = path.join(os.homedir(), ".notrat", "plugins", "notrat-latex-plugin.json");
const SERVER = path.join(os.homedir(), ".notrat", "tools", "latex-server.js");
const STATE = path.join(os.homedir(), ".notrat", "notrat-latex-state.json");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok    " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "\n        → " + extra : "")); }
}
function section(t) { console.log("\n" + t); }

if (!fs.existsSync(DEPLOYED)) { console.error("✗ 没找到装机包，先跑 build-singlefile.js"); process.exit(1); }
const pkg = JSON.parse(fs.readFileSync(DEPLOYED, "utf8"));
const src = pkg.contributions.editors[0].source;

/* 状态文件是**用户机器上的真文件**：进来先备份，退出时还原（本层不许留痕） */
const stateBackup = fs.existsSync(STATE) ? fs.readFileSync(STATE, "utf8") : null;
function restoreState() {
  try {
    if (stateBackup === null) { if (fs.existsSync(STATE)) fs.unlinkSync(STATE); }
    else fs.writeFileSync(STATE, stateBackup);
  } catch (e) {}
}
process.on("exit", restoreState);

/* ================================================================== */
section("[1] 产物形态：提示条那段代码确实在装机包里，且关键字齐全");
{
  ok("编辑器源码里调了 latex_env", src.includes('callTool("latex_env"'));
  ok("有 engineNote 状态位", /const \[engineNote, setEngineNote\] = useState\(null\)/.test(src));
  ok("有「一个实例只探一次」的 ref", /const engineProbedRef = useRef\(false\)/.test(src));
  ok("有「知道了」的处理函数", /function dismissEngineNote\(\)/.test(src));
  ok("有「重新检测」的处理函数", /async function recheckEngine\(\)/.test(src));
  ok("提示条渲染出来了（不是只在注释里提到）",
     /engineNote \? \(\s*<div/.test(src) || /\) : null\}\s*$/m.test(src.slice(src.indexOf("未检测到 TeX 引擎"))));
  /* 别把版本号写死在验收里 —— 每发一版都得来改一次，而改的人多半只想把它改「绿」。
   * 真正的意图是「装机包版本 == 工作区 manifest 版本」（防两处漂移），照这个写：
   * 升版自动跟随，真漂移（忘了 build）才红。 */
  const wsManifest = JSON.parse(fs.readFileSync(path.join(WS, "manifest.json"), "utf8"));
  ok("装机包版本 == 工作区 manifest 版本（不写死数字）", pkg.version === wsManifest.version,
     "装机 " + pkg.version + " vs 工作区 " + wsManifest.version);

  /* 服务端那份也要在（单文件包没有 pluginDir —— v0.8.4 就栽过「模块没拷全」） */
  const srv = fs.readFileSync(SERVER, "utf8");
  const ctr = path.join(os.homedir(), ".notrat", "tools", "contrib.js");
  ok("部署 server 有 latex_env 分支", srv.includes('name === "latex_env"'));
  ok("部署 server 的工具表里有 latex_env", srv.includes('name: "latex_env"'));
  ok("部署 contrib 里有 probeEngine", /function probeEngine\(/.test(fs.readFileSync(ctr, "utf8")));
}

/* ================================================================== */
section("[2] 触发条件判定表：从装机源码里把 guard 抠出来求值（不是照抄）");
{
  const m = src.match(/if \(([^)]*dead[^)]*info\.ack[^)]*)\) return;/);
  if (!m) {
    ok("能从源码里抠出 guard 表达式", false, "没匹配到 `if (… dead … info.ack …) return;`");
  } else {
    ok("能从源码里抠出 guard 表达式", true);
    console.log("        抠到: if (" + m[1] + ") return;");
    /* 取反 = 「要不要弹提示条」，语义与源码里那句 return 完全同构 */
    const shouldShow = new Function("dead", "info", "return !(" + m[1] + ");");
    const T = [
      ["没引擎 + 没提示过 + 活着", { dead: false, info: { ok: false, ack: false } }, true],
      ["检测到引擎", { dead: false, info: { ok: true, ack: false } }, false],
      ["没引擎但用户已点过知道了", { dead: false, info: { ok: false, ack: true } }, false],
      ["探测返回空对象（老版 server）", { dead: false, info: null }, false],
      ["组件已卸载（异步回来晚了）", { dead: true, info: { ok: false, ack: false } }, false],
    ];
    for (const [name, arg, want] of T) {
      const got = shouldShow(arg.dead, arg.info);
      ok(name + " → " + (want ? "弹" : "不弹"), got === want, "实际 " + got);
    }
  }

  /* 只探一次的时序：占位必须发生在发请求之前，否则异步回来前打开第二个 .tex 会再探 */
  const iGuard = src.indexOf("if (!serverId || engineProbedRef.current) return;");
  const iFlag = src.indexOf("engineProbedRef.current = true;");
  const iCall = src.indexOf('callTool("latex_env"');
  ok("初始化探测的 guard 在（serverId + 只探一次）", iGuard > 0 && iFlag > iGuard);
  ok("占位 flag 在发请求**之前**（防并发重入）", iFlag > 0 && iCall > iFlag,
     "flag@" + iFlag + " call@" + iCall);
}

/* ================================================================== */
section("[3] 文案红线：必须说清「只影响编译 PDF」，且给可复制的安装命令");
{
  /* ⚠ 不能用 indexOf("未检测到 TeX 引擎")：recheckEngine 的 toast 文案
   *   「仍未检测到 TeX 引擎」在源码里更靠前，那样切到的是 toast 不是提示条。
   *   用提示条独有的注释头定位，再切到它自己的 `) : null}` 为止。 */
  const i = src.indexOf("{/* 首屏引擎提示条");
  const iEnd = i >= 0 ? src.indexOf(") : null}", src.indexOf("知道了", i)) : -1;
  const banner = i >= 0 ? src.slice(i, iEnd > i ? iEnd + 10 : i + 2000) : "";
  ok("提示条那段在装机包里（注释头在）", i >= 0);
  ok("切出来的确实是提示条（不是 recheckEngine 的 toast）",
     banner.includes("知道了") && banner.includes("engineNote.installHint"),
     "切片长度 " + banner.length);
  ok("提示条里出现「未检测到 TeX 引擎」", banner.includes("未检测到 TeX 引擎"));
  ok("明说只影响「编译 / 导出 PDF」", banner.includes("只影响「编译 / 导出 PDF」"));
  ok("明说其余功能正常（编辑/大纲/校验/公式/导出 HTML）",
     banner.includes("编辑") && banner.includes("大纲") && banner.includes("引用校验") &&
     banner.includes("公式预览") && banner.includes("导出 HTML"));
  ok("给了安装命令位（installHint 兜底也在）", banner.includes("engineNote.installHint"));
  ok("说明了「无需配 PATH」", banner.includes("无需配 PATH"));
  ok("两个出口都在：重新检测 / 知道了", banner.includes("重新检测") && banner.includes("知道了"));

  /* 服务端侧：不装引擎的机器上，installHint 必须是**这个平台能直接粘的命令**。
   *
   * v0.9.7 修：这条断言原来写的是 `process.platform === "win32" ? hint.includes("winget")` ——
   *   它把「Windows 平台的安装指引」等同于「winget」了。而 winget 是 App Installer
   *   这个**可选组件**提供的，LTSC / Server / 精简镜像 / 删过 Store 的机器都没有。
   *   于是这条门禁会**逼着**代码去推一条本机跑不了的命令 —— 断言和被修的 bug 同款。
   *   判据改成「与**本机真有的**相符」：有哪个包管理器就给哪个；一个都没有，就必须给下载页。 */
  const C = require(path.join(WS, "server", "contrib.js"));
  const hint = C.installHint();
  ok("installHint 非空且是可复制命令", typeof hint === "string" && hint.length > 15, hint);

  const pm = C.packageManagers();
  const noWinPm = !pm.winget && !pm.choco && !pm.scoop;
  const winOk =
    (pm.winget && /winget install/.test(hint)) ||
    (pm.choco && /choco install/.test(hint)) ||
    (pm.scoop && /scoop install/.test(hint)) ||
    (noWinPm && /miktex\.org\/download/.test(hint));
  const macOk = pm.brew ? /brew install/.test(hint) : /tug\.org\/mactex/.test(hint);
  ok("installHint 与当前平台相符，且与本机真有的包管理器一致",
     process.platform === "win32" ? winOk :
     process.platform === "darwin" ? macOk : /apt|dnf|pacman|zypper|texlive/.test(hint),
     hint + "   [本机 " + JSON.stringify(pm) + "]");

  /* 修复的核心：不许推一条本机跑不了的命令（用户拿到的是「命令找不到」的二次失败） */
  ok("installHint 不推本机没有的命令（LTSC/Server 上不再出现 winget install）",
     !(process.platform === "win32" && !pm.winget && /winget install/.test(hint)), hint);
  ok("installHint 对本机没有任何包管理器的情况给了下载页（总有下一步可走）",
     !(process.platform === "win32" && noWinPm && !/miktex\.org\/download/.test(hint)), hint);
}

/* ================================================================== */
section("[4] 不打扰：点「知道了」写回服务端；重新检测会清缓存");
{
  const fn = src.slice(src.indexOf("function dismissEngineNote()"), src.indexOf("function dismissEngineNote()") + 260);
  ok("dismiss 先关掉提示条", /setEngineNote\(null\)/.test(fn));
  ok("dismiss 把「已知晓」写回服务端（跨会话记住）", /action: "ack"/.test(fn));
  ok("dismiss 用 try 包住（写不进去也不能让界面炸）", /try \{[\s\S]*action: "ack"[\s\S]*\} catch/.test(fn));

  const rc = src.slice(src.indexOf("async function recheckEngine()"), src.indexOf("async function recheckEngine()") + 700);
  ok("重新检测走 action=reset（清服务端缓存）", /action: "reset"/.test(rc));
  ok("重新检测成功即撤条 + 回一句", /info\.ok/.test(rc) && /setEngineNote\(null\)/.test(rc) && /setToast\(/.test(rc));
}

/* ================================================================== */
section("[5] 端到端：真 server（面板的真实路径）·  无引擎/有引擎两个场景都用隔离模块造");
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

/* 「无引擎 / 有引擎」两个场景都**不依赖本机装没装 TeX**：
 *   把 contrib.js 里写死的绝对安装目录抠掉、PATH 清空、homedir 指向临时目录，
 *   再决定要不要在那个「家目录」里放一个假引擎。
 *   —— 否则「无引擎」那条在本机是靠运气成立的，换台装了 MiKTeX 的机器就验不到了。 */
function makeIsolated(homeDir) {
  let src2 = fs.readFileSync(path.join(WS, "server", "contrib.js"), "utf8");
  src2 = src2.replace(/^\s*"C:\/(Program Files\/MiKTeX|texlive)[^"]*",\s*$/gm, "");
  const box = {
    console: console,
    process: Object.assign({}, process, {
      env: Object.assign({}, process.env, { PATH: "", LOCALAPPDATA: "X:/nope", USERPROFILE: homeDir, HOME: homeDir }),
    }),
    require: (mm) => (mm === "os" ? Object.assign({}, os, { homedir: () => homeDir }) : require(mm)),
    module: { exports: {} },
    exports: {},
    __dirname: path.join(WS, "server"),
  };
  box.global = box;
  vm.runInContext(src2, vm.createContext(box), { filename: "contrib-isolated.js" });
  return box.module.exports;
}

const FAKE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "latex-env-home-"));
process.on("exit", () => { try { fs.rmSync(FAKE_HOME, { recursive: true, force: true }); } catch (e) {} });

(async () => {
  /* 先把这台机器上的状态清干净，保证后面「ack 从 false 起步」是真的 */
  try { if (fs.existsSync(STATE)) fs.unlinkSync(STATE); } catch (e) {}

  /* ---- 第一批：只探测。断言点必须落在 ack **之前**，否则「探测不写盘」这条验不到 ---- */
  const rs1 = await rpc([
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    call("latex_env", {}, 2),
  ]);
  const byId = {};
  for (const r of rs1) if (r && r.id) byId[r.id] = r;

  const names = ((byId[1] || {}).result || {}).tools || [];
  ok("tools/list 里有 latex_env", names.some((t) => t.name === "latex_env"));
  const envTool = names.find((t) => t.name === "latex_env") || {};
  ok("latex_env 声明了 action 白名单 probe/ack/reset",
     JSON.stringify((envTool.inputSchema || {}).properties || {}).includes('"probe","ack","reset"'));

  const probe1 = JSON.parse(byId[2].result.content[0].text);
  ok("探测返回可解析 JSON", !!probe1 && typeof probe1 === "object");
  ok("带齐面板要用的字段（ok / engine / installHint）",
     "ok" in probe1 && "engine" in probe1 && "installHint" in probe1, JSON.stringify(probe1).slice(0, 160));
  ok("ack 字段随探测下发（面板据此决定弹不弹）", probe1.ack === false);
  ok("探测**不写盘**（只是问一句，不该留痕）", !fs.existsSync(STATE), STATE);

  /* ---- 第二批：ack 单独一批。这批之后不许再探测 —— 再探就会把 ack 按设计改写，
   *      那样「记下了没有」就验不到了（这批的断言是「写进去了」）。 ---- */
  const rs2 = await rpc([call("latex_env", { action: "ack" }, 3)]);
  for (const r of rs2) if (r && r.id) byId[r.id] = r;
  const ackRes = JSON.parse(byId[3].result.content[0].text);
  ok("action=ack 返回 ok", ackRes.ok === true);
  ok("ack 落到了状态文件", fs.existsSync(STATE));
  ok("状态文件可解析且记为 true",
     fs.existsSync(STATE) && JSON.parse(fs.readFileSync(STATE, "utf8")).engineNoticeAck === true);
  ok("状态文件在 ~/.notrat 下（不落进工作区，免得被同步/提交）",
     STATE.indexOf(path.join(os.homedir(), ".notrat")) === 0, STATE);

  /* ================= 场景 A：没有引擎 ================= */
  const iso = makeIsolated(FAKE_HOME);
  const dead = iso.probeEngine("", null, { force: true });
  ok("无引擎时 ok=false（不抛异常）", dead.ok === false);
  ok("无引擎时 engine=null / code=NO_ENGINE", dead.engine === null && dead.code === "NO_ENGINE");
  ok("无引擎时带上本机可粘的安装命令",
     typeof dead.installHint === "string" && dead.installHint.length > 15, dead.installHint);
  ok("无引擎时 tried 列出完整回退链（报错要能自证试过什么）",
     JSON.stringify(dead.tried) === JSON.stringify(["tectonic", "xelatex", "lualatex", "pdflatex", "latexmk"]));
  ok("无引擎时 ms 有值（排查时能看到探测耗时）", typeof dead.ms === "number");

  ok("无引擎 + 没提示过 → 面板该弹（ack=false）", iso.engineNoticeAck() === false);
  iso.ackEngineNotice();
  ok("点过「知道了」→ 记下了", iso.engineNoticeAck() === true);
  iso.probeEngine("", null, { force: true });   // 仍然找不到引擎
  ok("★ 无引擎时探测**不会**把 ack 清掉（下次打开 .tex 仍然静默）", iso.engineNoticeAck() === true);

  /* ================= 场景 B：有引擎 ================= */
  const binDir = path.join(FAKE_HOME, ".notrat", "tools", "bin");
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, "tectonic.cmd"), "@echo off\r\n");
  const iso2 = makeIsolated(FAKE_HOME);
  const alive = iso2.probeEngine("", null, { force: true });
  ok("引擎放在 ~/.notrat/tools/bin 时能被探到（用户不必配 PATH）",
     alive.ok === true, JSON.stringify(alive).slice(0, 160));
  ok("探到引擎时给出名字与路径",
     alive.ok === true && alive.engine === "tectonic" && String(alive.exe).indexOf("tectonic") >= 0);
  iso2.ackEngineNotice();
  iso2.probeEngine("", null, { force: true });   // 这次 ok=true
  ok("有引擎时会把陈旧的 ack 清掉（将来引擎没了还能再提醒一次）", iso2.engineNoticeAck() === false);

  /* ---- 缓存：探测不该在每次挂载时重扫一遍 PATH ---- */
  const C = require(path.join(WS, "server", "contrib.js"));
  C.resetEngineCache();
  const a = C.probeEngine("", null, { force: true });
  const b = C.probeEngine("", null);
  ok("第二次探测命中进程内缓存（同一对象）", a === b);
  C.resetEngineCache();
  ok("reset 之后确实重探（拿到新对象）", C.probeEngine("", null) !== b);

  console.log("\n" + "=".repeat(60));
  if (fail === 0) console.log("✓ v0.8.5 引擎自检验收全绿（" + pass + " 项）");
  else console.log("✗ v0.8.5 有 " + fail + " 项未通过（通过 " + pass + "）");
  process.exit(fail === 0 ? 0 : 1);
})();
