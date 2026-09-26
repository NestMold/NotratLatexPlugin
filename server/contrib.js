"use strict";
/**
 * Notrat LaTeX 助手 — v0.4.0「新贡献面」支撑库
 *
 * 被 server/index.js require；单文件构建时一并复制到 ~/.notrat/tools/。
 * 只导出纯函数，绝不写 stdout（stdio 下 stdout 是 JSON-RPC 专线）。
 *
 * 提供：
 *   pickCompiler        引擎探测（PATH → 旧目录 → 常见安装位置）与回退链
 *   outlineProtocol     「outline 大纲面板」行协议文本
 *   statusLine          「status-bar / editor-header」一行状态摘要
 *   backupTex           「toolHooks 编译前快照」写入 .latex-history/
 *   historyProtocol     快照清单行协议
 *   restoreSnapshot     恢复某个快照（先给当前内容再存一份）
 *   probeEngine         引擎探测（不抛错版；供 latex_env 工具与面板首屏提示）
 *   ackEngineNotice     「本机没装引擎、用户已知晓」的记账（~/.notrat/notrat-latex-state.json）
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

/* ------------------------------------------------------------------ */
/* 1. 编译引擎探测与回退                                                */
/* ------------------------------------------------------------------ */

const ENGINE_CHAIN = ["tectonic", "xelatex", "lualatex", "pdflatex", "latexmk"];

/** 在 PATH 里找可执行文件（原实现只扫固定目录，装在标准位置的 MiKTeX/TeX Live 找不到） */
function whichSync(name) {
  const exts = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  const dirs = String(process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (let i = 0; i < dirs.length; i++) {
    for (let j = 0; j < exts.length; j++) {
      const p = path.join(dirs[i], name + exts[j]);
      try {
        fs.accessSync(p, fs.constants.X_OK);
        return p;
      } catch (e) {}
    }
  }
  return null;
}

/** 常见安装位置兜底探测 */
function probeDirs(name) {
  const exts = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  const lc = process.env.LOCALAPPDATA || "";
  const home = os.homedir();
  const dirs = [
    path.join(home, ".notrat", "tools", "bin"),
    path.join(lc, "Tectonic"),
    path.join(lc, "Microsoft", "WinGet", "Links"),
    path.join(home, "scoop", "shims"),
    path.join(home, ".cargo", "bin"),
    "C:/Program Files/MiKTeX/miktex/bin/x64",
    "C:/Program Files/MiKTeX/miktex/bin",
    "C:/texlive/2025/bin/windows",
    "C:/texlive/2024/bin/windows",
    "C:/texlive/2023/bin/windows",
  ];
  for (let i = 0; i < dirs.length; i++) {
    for (let j = 0; j < exts.length; j++) {
      const p = path.join(dirs[i], name + exts[j]);
      try {
        fs.accessSync(p, fs.constants.X_OK);
        return p;
      } catch (e) {}
    }
  }
  return null;
}

/**
 * 解析要用的编译引擎。
 * 顺序：设置项（显式路径 / 引擎名）→ 回退链 tectonic→xelatex→lualatex→pdflatex→latexmk
 * 设置项没被宿主替换成实际值时（形如 ${settings:compiler}）视为未配置。
 */
function pickCompiler(raw, legacyResolve) {
  const want = String(raw == null ? "" : raw).trim();
  const usable = want && want.indexOf("$") < 0 && want.indexOf("{") < 0 ? want : "";
  const names = usable
    ? [usable].concat(ENGINE_CHAIN.filter(function (n) { return n !== usable; }))
    : ENGINE_CHAIN.slice();
  const tried = [];
  for (let i = 0; i < names.length; i++) {
    const n = names[i];
    tried.push(n);
    let exe = null;
    if (path.isAbsolute(n)) exe = fs.existsSync(n) ? n : null;
    else
      exe =
        whichSync(n) ||
        (typeof legacyResolve === "function" ? legacyResolve(n) : null) ||
        probeDirs(n);
    if (exe) {
      return { exe: exe, name: n, wanted: usable || "(默认链)", fellBack: !!usable && n !== usable, tried: tried };
    }
  }
  const err = new Error(
    "未找到可用的 TeX 引擎（已尝试: " + tried.join(" / ") + "）。请安装 TeX 发行版（Windows 推荐 MiKTeX 或 TeX Live），或在插件设置里填写本机已装引擎名或绝对路径。"
  );
  err.code = "NO_ENGINE";
  throw err;
}

/* ------------------------------------------------------------------ */
/* 1b. 引擎探测（不抛错版）+「已提示过」记账                              */
/* ------------------------------------------------------------------ */

/* ⚠ 探测只说明**引擎文件在不在**，不代表它跑得起来（缺 DLL / 宏包库为空都会在编译时才炸）。
 *   所以对外文案一律是「检测到 X」，绝不说「编译可用」—— 把谎报从编译期挪到启动期，
 *   只会让用户拿着错的结论去排查。 */

let _engineCache = null;   // 进程内缓存：PATH 全扫一遍不便宜，一次探测之后瞬答

/** 分平台安装指引（只给命令，不替用户下载 51MB 二进制 —— 那是懒，不是不知道） */
function installHint() {
  if (process.platform === "win32")
    return "winget install MiKTeX.MiKTeX    （或 https://miktex.org/download）";
  if (process.platform === "darwin")
    return "brew install --cask mactex-no-gui    （或 https://tug.org/mactex/）";
  return "sudo apt install texlive-full    （最小可用：texlive-xetex texlive-latex-recommended）";
}

/**
 * 探测本机 TeX 引擎 —— pickCompiler 的**非抛错**包装。
 * 与编译走同一条探测链（设置项 → PATH → 常见安装位置 → 回退链），否则
 * 「面板说没问题、编译却失败」这种自相矛盾迟早会出现。
 * @returns {{ok:boolean, engine:(string|null), exe:(string|null), tried:string[],
 *            fellBack:boolean, reason:string, installHint:string, ms:number}}
 */
function probeEngine(raw, legacyResolve, opts) {
  const force = !!(opts && opts.force);
  if (_engineCache && !force) return _engineCache;
  const t0 = Date.now();
  let out;
  try {
    const p = pickCompiler(raw, legacyResolve);
    out = {
      ok: true,
      engine: p.name,
      exe: p.exe,
      wanted: p.wanted,
      fellBack: p.fellBack,
      tried: p.tried,
      chain: ENGINE_CHAIN.slice(),
      reason: p.fellBack ? "设置里的「" + p.wanted + "」本机不可用，已改用 " + p.name : "",
      installHint: "",
      ms: Date.now() - t0,
    };
  } catch (e) {
    out = {
      ok: false,
      engine: null,
      exe: null,
      wanted: String(raw == null ? "" : raw).trim(),
      fellBack: false,
      tried: ENGINE_CHAIN.slice(),
      chain: ENGINE_CHAIN.slice(),
      code: (e && e.code) || "NO_ENGINE",
      reason: (e && e.message) || String(e),
      installHint: installHint(),
      ms: Date.now() - t0,
    };
  }
  _engineCache = out;
  /* 引擎又在了：把「已提示」清掉，将来真被卸载还能再提示一次（否则一辈子只提示一次） */
  if (out.ok && engineNoticeAck()) writeState({ engineNoticeAck: false });
  return out;
}

/** 丢掉缓存重新探测（用户点了「重新检测」= 刚装完引擎） */
function resetEngineCache() {
  _engineCache = null;
}

/* 「这台机器没装引擎，用户已经知道了」—— 只记一个开关。
 * 落在 ~/.notrat/ 下，**不写进任何工作区目录**：那种文件会被同步/提交，跟着项目到处跑。 */
const STATE_FILE = path.join(os.homedir(), ".notrat", "notrat-latex-state.json");

function readState() {
  try {
    const j = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return j && typeof j === "object" ? j : {};
  } catch (e) {
    return {};
  }
}

function writeState(patch) {
  try {
    const next = Object.assign(readState(), patch || {});
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2));
    return next;
  } catch (e) {
    return null;   // 记不下来不是错误：最坏情况就是下次再提示一遍
  }
}

function engineNoticeAck() {
  return readState().engineNoticeAck === true;
}

function ackEngineNotice() {
  return !!writeState({ engineNoticeAck: true, engineNoticeAckAt: new Date().toISOString() });
}

/* ------------------------------------------------------------------ */
/* 2. 大纲 / 状态行（list 面板与状态栏消费）                             */
/* ------------------------------------------------------------------ */

/** 章节自动编号：1 / 1.1 / 1.1.1；part 单独成「第 N 部分」 */
function sectionNumbers(sections) {
  const c = [0, 0, 0, 0];
  const out = [];
  for (let i = 0; i < sections.length; i++) {
    const lv = Math.max(0, Math.min(3, Number(sections[i].level) || 0));
    c[lv]++;
    for (let k = lv + 1; k < 4; k++) c[k] = 0;
    if (lv === 0) out.push("第 " + c[0] + " 部分");
    else if (lv === 1) out.push(String(c[1]));
    else if (lv === 2) out.push(c[1] + "." + c[2]);
    else out.push(c[1] + "." + c[2] + "." + c[3]);
  }
  return out;
}

function envCounts(res) {
  const n = { figure: 0, table: 0, equation: 0, other: 0 };
  const list = (res && res.environments) || [];
  for (let i = 0; i < list.length; i++) {
    const nm = String(list[i].name || "").replace(/\*$/, "");
    if (nm === "figure") n.figure++;
    else if (nm === "table") n.table++;
    else if (/^(equation|align|gather|eqnarray|multline)$/.test(nm)) n.equation++;
    else n.other++;
  }
  return n;
}

function outlineRows(res, depth) {
  const secs = (res && res.sections) || [];
  const nums = sectionNumbers(secs);
  const maxDepth = typeof depth === "number" && depth >= 0 ? depth : 2;
  const rows = [];
  for (let i = 0; i < secs.length; i++) {
    const s = secs[i];
    const lv = Math.max(0, Math.min(3, Number(s.level) || 0));
    if (lv > maxDepth) continue;
    rows.push({
      line: s.line,
      level: lv,
      cmd: s.cmd,
      title: s.title || "(无标题)",
      number: s.cmd === "part" ? "第 " + nums[i].replace(/[^0-9]/g, "") + " 部分" : nums[i],
      indent: lv === 0 ? 0 : lv - 1,
      src: s.src || "", /* v0.9.4：非空 = 这一条来自 \\input 进来的子文件 */
    });
  }
  return rows;
}

/**
 * list 面板行协议：带 #id 的行才有勾选框，纯文本行只展示。
 * #id 用行号（章节不会同行，天然唯一），点一下即可在日志/对话里定位。
 */
function outlineProtocol(res, depth) {
  const rows = outlineRows(res, depth);
  const total = ((res && res.sections) || []).length;
  const inc = (res && res.includes) || [];
  const exp = inc.filter(function (i) { return !i.missing && !i.cycle && !i.error && !i.truncated; });
  const out = [];
  /* v0.9.4：多文件项目的「章节 N」含 \input 进来的子文件，头部标一下子文件数，
     否则有人对着「章节 11」在自己那份主文件里只数出 3 条，会以为是插件数错了 */
  out.push("📄 " + path.basename(res.file) + " · 章节 " + total + " · 大纲 " + rows.length + " 条" +
    (exp.length ? " · 含 " + exp.length + " 个子文件" : ""));
  if (!rows.length) {
    /* 章节非空却一条没渲染 → 是深度设置把它们滤掉了，不是文件里没有章节。
       旧文案一口咬定「未发现 \\section」，把用户往错方向指。 */
    const maxDepth = typeof depth === "number" && depth >= 0 ? depth : 2;
    out.push(total
      ? "（" + total + " 个章节全被大纲深度滤掉了：当前只显示到第 " + maxDepth + " 级，把设置里的大纲深度调大即可）"
      : "（未发现 \\section / \\chapter 等章节命令）");
    return out.join("\n");
  }
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    out.push("[ ] #" + r.line + " " + "  ".repeat(r.indent) + r.number + "  " + r.title + (r.src ? "  ⟵ " + r.src : ""));
  }
  return out.join("\n");
}

/**
 * 宿主内置大纲面板契约（manifest editors[].outlineTool）：
 * 逐行 `level|text|anchor`（level 从 1 起：章/节=1、小节=2、小小节=3；anchor = 源文件行号）。
 * 宿主用自己的大纲 UI 渲染，点击条目回抛 notrat-outline-navigate 事件，
 * 编辑器按 anchor 定位。旧宿主不认这个契约时返回值被忽略，零副作用。
 * 与 outlineProtocol（面板用的 list 行协议）并存，两条通路互不影响。
 */
function outlineHostProtocol(res, depth) {
  const rows = outlineRows(res, depth);
  if (!rows.length) return "";
  return rows
    .map(function (r) {
      const label = (r.number ? r.number + "  " : "") + r.title;
      return Math.max(1, r.level) + "|" + label + "|" + r.line;
    })
    .join("\n");
}

/**
 * 宿主内置大纲的【真实】契约（实测宿主编译产物 editors/PluginOutlineItems.tsx 的 parseItems）。
 *
 * 宿主拿到的 result 是 MCP 响应里的 `result` 字段本身，parseItems 会这么读：
 *   1) result 是数组          -> 每个元素当一条大纲项
 *   2) result 是字符串        -> 先 JSON.parse；不行再按 `level|text|anchor` 逐行切
 *   3) result 是对象          -> 取 result.content / .items / .data 当「条目数组」
 * 每条的字段：{ level, text, anchor }（level>=1 → 缩进 (level-1)*16+12px；anchor 用于回抛跳转）。
 *
 * ⚠ 事故记录（v0.5.3 修）：早先这里返回纯文本，被 server 包成
 *   { content:[{ type:"text", text:"1|1  引言|11
1|2  方法|16
…" }] }，
 *   命中第 3) 条分支后整个大纲只剩 1 条，且这条的 text 里含换行；
 *   宿主条目样式是 `whitespace-nowrap` + `text-ellipsis` + `truncate`，
 *   换行被折叠成空格 —— 于是「整棵大纲树 + 编号」被压成一行显示。
 * 因此这里不能再返回字符串，必须返回「一条一项」的数组。
 *
 * 返回的元素保留 type/text（MCP content block 合法形态），额外挂 level/anchor；
 * 即使某天宿主对 content 做严格 schema 校验把多余键剥掉，也只是退化成平铺但「一行一条」，
 * 不会再塌成一行。
 */
function outlineHostItems(res, depth) {
  const rows = outlineRows(res, depth);
  return rows.map(function (r) {
    return {
      level: Math.max(1, Math.min(6, Number(r.level) || 1)),
      text: (r.number ? r.number + "  " : "") + r.title + (r.src ? "  ⟵ " + r.src : ""),
      anchor: String(r.line),
    };
  });
}

/**
 * 宿主内置大纲（manifest editors[].outlineTool）的**线上返回形态** —— 单条 JSON 字符串。
 *
 * ⚠ 不要改回「一条一项的 content 数组」：level/anchor 挂在内容块上会被宿主
 *   extractToolText() 拍平丢光（它只 join content[].text），最终退化成
 *   parseLineProtocol 的 { level:1, anchor:undefined } —— 层级全平 + 点击跳第 1 行。
 *   详见 .setup/patch-v062.js 头部的事故记录与 .setup/check/host-parse-items.js（真宿主任取）。
 *
 * 走的是宿主 parseItems 的第 ② 条分支：
 *   extractToolText → 这段 JSON 字符串 → JSON.parse 成功 → 数组分支 → mapItemArray
 *   → { level: clampLevel(level), text: String(text).trim(), anchor: String(anchor) } 全部保住。
 *
 * 面板 / AI 通路不受影响，仍旧走 outlineProtocol 的 list 行协议文本。
 */
function outlineHostPayload(res, depth) {
  return JSON.stringify(outlineHostItems(res, depth));
}

/** 一行状态摘要（status-bar / editor-header 用） */
function statusLine(res, issues) {
  const env = envCounts(res);
  const s = (issues && issues.summary) || { errors: 0, warnings: 0, infos: 0 };
  const p = [];
  p.push("📐 " + path.basename(res.file));
  p.push(((res.sections || []).length) + " 节" + (((res && res.includes) || []).length ? "（含子文件）" : ""));
  p.push(env.equation + " 公式");
  p.push(env.figure + " 图");
  p.push(env.table + " 表");
  p.push(((res.cites || []).length) + " 引用");
  if (res.wordCount) p.push("≈" + res.wordCount.approxWords + " 字");
  p.push(s.errors + s.warnings > 0 ? "⚠ " + s.errors + " 错 / " + s.warnings + " 警" : "✅ 无问题");
  return p.join(" · ");
}

/* ------------------------------------------------------------------ */
/* 3. 编译前快照（toolHooks pre 钩子）与历史                            */
/* ------------------------------------------------------------------ */

const HIST_DIR = ".latex-history";

/** 20260922-144632123 → 2026-09-22 14:46:32 */
function prettyStamp(s) {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:\d{3})?(-\d+)?$/.exec(String(s || ""));
  if (!m) return String(s || "");
  return m[1] + "-" + m[2] + "-" + m[3] + " " + m[4] + ":" + m[5] + ":" + m[6] + (m[7] || "");
}

function histDir(filePath) {
  return path.join(path.dirname(filePath), HIST_DIR);
}

function stampNow(d) {
  const t = d || new Date();
  const p = function (n) { return String(n).padStart(2, "0"); };
  const ms = String(t.getMilliseconds()).padStart(3, "0");
  return "" + t.getFullYear() + p(t.getMonth() + 1) + p(t.getDate()) + "-" + p(t.getHours()) + p(t.getMinutes()) + p(t.getSeconds()) + ms;
}

function baseName(filePath) {
  return path.basename(filePath).replace(/\.tex$/i, "");
}

function snapshots(filePath) {
  const dir = histDir(filePath);
  const base = baseName(filePath);
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch (e) {
    return [];
  }
  return names
    .filter(function (f) { return f.indexOf(base + ".") === 0 && /\.tex$/i.test(f); })
    .map(function (f) {
      const full = path.join(dir, f);
      let ms = 0;
      try { ms = fs.statSync(full).mtimeMs; } catch (e) {}
      return { name: f, stamp: f.slice(base.length + 1).replace(/\.tex$/i, ""), path: full, mtime: ms };
    })
    .sort(function (a, b) { return a.stamp < b.stamp ? 1 : -1; });
}

/**
 * 把当前 .tex 存一份快照。内容与最近一份完全一致时跳过（不产生噪声快照）。
 * 返回 { ok, skipped, path, kept, pruned, message }
 */
function backupTex(filePath, keep) {
  const dir = histDir(filePath);
  let cur = "";
  try {
    cur = fs.readFileSync(filePath, "utf8");
  } catch (e) {
    return { ok: false, message: "快照失败，读取源文件出错: " + e.message };
  }
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    return { ok: false, message: "快照失败，无法创建 " + HIST_DIR + ": " + e.message };
  }
  const snaps = snapshots(filePath);
  if (snaps.length) {
    let prev = "";
    try { prev = fs.readFileSync(snaps[0].path, "utf8"); } catch (e) {}
    if (prev === cur) {
      return { ok: true, skipped: true, path: snaps[0].path, message: "源码与最近一份快照一致，本次不新增快照。" };
    }
  }
  // 撞名绝不覆盖（同毫秒的极端情况下加序号），任何既有快照都必须保住
  let dest = path.join(dir, baseName(filePath) + "." + stampNow() + ".tex");
  for (let k = 1; fs.existsSync(dest) && k < 1000; k++)
    dest = path.join(dir, baseName(filePath) + "." + stampNow() + "-" + k + ".tex");
  try {
    fs.writeFileSync(dest, cur, "utf8");
  } catch (e) {
    return { ok: false, message: "快照写入失败: " + e.message };
  }
  const max = Number(keep) > 0 ? Number(keep) : 20;
  const all = snapshots(filePath);
  const drop = all.slice(max);
  for (let i = 0; i < drop.length; i++) {
    try { fs.unlinkSync(drop[i].path); } catch (e) {}
  }
  return {
    ok: true,
    path: dest,
    kept: Math.min(all.length, max),
    pruned: drop.length,
    message: "已快照 " + baseName(filePath) + " → " + HIST_DIR + "/" + path.basename(dest) + "（保留最近 " + max + " 份）",
  };
}

/** 快照清单行协议 */
function historyProtocol(filePath, limit) {
  const snaps = snapshots(filePath);
  const out = [];
  out.push("🗂 " + path.basename(filePath) + " · 快照 " + snaps.length + " 份" + (snaps.length ? "（最新 " + prettyStamp(snaps[0].stamp) + "）" : ""));
  if (!snaps.length) {
    out.push("（暂无快照：开启「编译前自动快照」后，每次编译都会留一份）");
    return out.join("\n");
  }
  const lim = Number(limit) > 0 ? Number(limit) : 15;
  for (let i = 0; i < snaps.length && i < lim; i++) {
    let kb = 0;
    try { kb = fs.statSync(snaps[i].path).size / 1024; } catch (e) {}
    out.push("[ ] #" + (i + 1) + " " + prettyStamp(snaps[i].stamp) + " · " + kb.toFixed(1) + " KB");
  }
  return out.join("\n");
}

/** 恢复快照：先把当前内容再存一份，再覆盖（恢复动作本身也可回退） */
function restoreSnapshot(filePath, stamp) {
  const snaps = snapshots(filePath);
  if (!snaps.length) return { ok: false, message: "没有可恢复的快照。" };
  let target = null;
  if (stamp) {
    for (let i = 0; i < snaps.length; i++) if (snaps[i].stamp === String(stamp)) target = snaps[i];
  }
  if (!target) target = snaps[0];
  // 先把目标快照内容读进内存：之后无论安全备份那步发生什么，恢复结果都正确
  let content = "";
  try {
    content = fs.readFileSync(target.path, "utf8");
  } catch (e) {
    return { ok: false, message: "读取快照失败: " + e.message };
  }
  const safety = backupTex(filePath, 60);
  try {
    fs.writeFileSync(filePath, content, "utf8");
  } catch (e) {
    return { ok: false, message: "恢复写入失败: " + e.message };
  }
  return { ok: true, from: target.stamp, safety: safety && safety.path ? path.basename(safety.path) : null };
}

/* ------------------------------------------------------------------ */

/**
 * 读取设置项注入的环境变量。
 * 宿主对 ${settings:x} 的解析存在两种约定（字段名 / 组名.字段名），manifest 两个都声明：
 *   LATEX_TIMEOUT=${settings:timeout}   LATEX_TIMEOUT_ALT=${settings:latex.timeout}
 * 这里取第一个「已被替换成真实值」的；全是未替换占位符 = 视为未配置（回落默认值）。
 */
function envReal(name) {
  const keys = [name, name + "_ALT"];
  for (let i = 0; i < keys.length; i++) {
    const v = process.env[keys[i]];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (!s) continue;
    if (s.indexOf("$") >= 0 || s.indexOf("{") >= 0) continue;
    return s;
  }
  return "";
}

function envNum(name, def) {
  const v = Number(envReal(name));
  return isFinite(v) && v > 0 ? v : def;
}

function envOff(name) {
  const v = envReal(name).toLowerCase();
  return v === "false" || v === "off" || v === "0" || v === "no";
}


module.exports = {
  pickCompiler: pickCompiler,
  probeEngine: probeEngine,
  resetEngineCache: resetEngineCache,
  installHint: installHint,
  readState: readState,
  writeState: writeState,
  engineNoticeAck: engineNoticeAck,
  ackEngineNotice: ackEngineNotice,
  STATE_FILE: STATE_FILE,
  whichSync: whichSync,
  probeDirs: probeDirs,
  engineChain: ENGINE_CHAIN,
  sectionNumbers: sectionNumbers,
  envCounts: envCounts,
  outlineRows: outlineRows,
  outlineProtocol: outlineProtocol,
  outlineHostProtocol: outlineHostProtocol,
  outlineHostItems: outlineHostItems,
  outlineHostPayload: outlineHostPayload,
  statusLine: statusLine,
  backupTex: backupTex,
  snapshots: snapshots,
  historyProtocol: historyProtocol,
  restoreSnapshot: restoreSnapshot,
  prettyStamp: prettyStamp,
  envReal: envReal,
  envNum: envNum,
  envOff: envOff,
  HIST_DIR: HIST_DIR,
};
