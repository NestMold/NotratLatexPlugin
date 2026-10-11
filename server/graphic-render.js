"use strict";
/* =====================================================================
 * v0.9.12 绘图环境「就地渲染」
 *
 * 问题（用户原话）：「不能直接看到图片吗」
 *   预览内核认得出 \begin{tikzpicture}…\end{tikzpicture}，但它**只在浏览器里跑**，
 *   浏览器里没有 TeX 引擎 —— 所以它只能给一张占位卡，说「编译 PDF 后可见」。
 *   这句话对，但只对了一半：本机本来就有引擎（这个插件就是靠它编译正文的）。
 *
 * 这一层补的就是缺的那半句：**把这张图当一张图编一次，再栅格化成 PNG 回预览**。
 *   ① 编译：走 CONTRIB.pickCompiler 探到的本机引擎（xelatex / lualatex / pdflatex /
 *      latexmk / tectonic），与「编译正文」同一套探测链 —— 用户装了什么就用什么。
 *   ② 栅格化：走既有的 server/pdf-raster.js（gs / pdftoppm，同一份磁盘缓存）。
 *   ③ 投递：返回 dataURI，前端塞进 <img src>，与插图（\includegraphics）同一条路。
 *
 * 三条硬约束（每一条都有具体代价，不是洁癖）：
 *
 *   [1] 绝不每拍都编。一屏 10 张图 = 首屏 19 秒的编译风暴（实测单图 ≈1.9s：
 *       编译 1.58s + 栅格 0.34s）。所以一定是**用户点一下才编**，且按内容 hash
 *       做磁盘缓存 —— 同一张图第二次点，零成本（连进程都不起）。
 *
 *   [2] 绝不往工作区写任何东西。aux / log / pdf 全落在系统临时目录（os.tmpdir()），
 *       编译时 cwd = 那个临时目录 —— 用户 figs/ 下的 fig-five-dim.pdf 是**他的产物**，
 *       不能被我们悄悄覆盖成另一份。相对路径靠 TEXINPUTS 指回原目录来保住。
 *
 *   [3] 失败必须退回原来那张卡，一个字都不改。这不是「优雅降级」的修辞：
 *       没装引擎、少一个包、少一个 \usetikzlibrary，用户看到的应该还是那张
 *       「这里是一张图 + 源码」的卡，外加一句**人话的原因**。
 *
 * 关于「静默降级」——这一层最贵的错不是编不过，是**编过了但画错了**：
 *
 *   (a) 少一个 \usetikzlibrary：编得过、图出来、只是画错了，不报错。
 *       → 所以导言区尽量保真（下面 A/B 两级），并在 Tier B 里把原文所有
 *         \usetikzlibrary / \tikzset / \pgfplotsset / \definecolor **原样搬过来**。
 *
 *   (b) 中文没了：原 class 是 ctexart/ctexbook 时被换成 standalone，
 *       ctex 的字体设置就跟着没了 —— 中文会**静默消失**（"Missing character"
 *       只是警告，编译照过、PDF 照出）。实测：同一张图补上 \usepackage{ctex}
 *       是 902×387 px，不补是 813×373 px，60 处缺字。
 *       → 所以：换上 standalone 就自己补 \usepackage{ctex}；
 *         并且**数 \log 里的 Missing character**，谁少用谁，一个都不许装作没看见。
 *
 * 两级导言（只对「内联 tikzpicture」用；standalone 图源文件整篇就是完整文档，直接编）：
 *   Tier A：把原文档导言区**整段搬过来**（宏、样式、包全在）—— 最保真，首选。
 *   Tier B：A 编不过时的兜底 —— 只搬「与画图有关的那几行」，其余用最小可用集合。
 *   谁能编过用谁；结果里回报用的是哪一级 + 缺字条数，让用户知道自己看的是不是保真版。
 * =================================================================== */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const RASTER = require("./pdf-raster.js");

/* 缓存根：与 pdf-raster 同一个临时目录（它自己写 <CACHE_ROOT>/<sha1>.png，
 * 我们写在 <CACHE_ROOT>/graphics/ 下，文件名不撞）。 */
const CACHE_ROOT = path.join(os.tmpdir(), "notrat-latex-pdf-raster");
const CACHE_DIR = path.join(CACHE_ROOT, "graphics");
const OUT_DIR = path.join(CACHE_DIR, "out");
const PNG_DIR = path.join(CACHE_DIR, "png");

/* 包装策略版本：改了包装方式就 +1，旧缓存自动失效（否则用户拿到按旧规则编的图） */
const WRAP_VERSION = "g2";

/* 能「独立成篇」的绘图环境：从 \begin 到 \end 本身就是一张完整画面。
 * 排除：
 *   scope / pgfonlayer / pin —— 它们是 tikzpicture 的片段，单独编必然报错
 *   asy / pspicture         —— Asymptote / PSTricks，xelatex 编不动，v1 不碰
 * 这份表同时是服务端的**白名单**：kind 不在里面直接拒，杜绝把任意环境名塞进包装文案。 */
const RENDERABLE = {
  tikzpicture: 1, pgfpicture: 1, tikzcd: 1, circuitikz: 1, forest: 1, picture: 1,
  axis: 1, semilogxaxis: 1, semilogyaxis: 1, loglogaxis: 1, polaraxis: 1,
};
const PGFPLOTS_ENVS = { axis: 1, semilogxaxis: 1, semilogyaxis: 1, loglogaxis: 1, polaraxis: 1 };

const SRC_MAX = 200 * 1024;   // 单张图的源码上限
const DOC_MAX = 512 * 1024;   // 预览的那份 .tex 全文上限（只用来抠导言区）
const PNG_MAX = 8 * 1024 * 1024;

function envInt(name, dflt) {
  const n = parseInt(process.env[name] || "", 10);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}
function graphicDpi() {
  const n = envInt("LATEX_GRAPHIC_DPI", envInt("LATEX_RASTER_DPI", 150));
  return Math.min(Math.max(n, 72), 600);
}
function graphicTimeout() { return envInt("LATEX_GRAPHIC_TIMEOUT", 60) * 1000; }
/* 总开关：LATEX_GRAPHIC_RENDER=0/off 时直接拒（面板照常显示那张卡，与今天一样） */
function graphicEnabled() {
  const v = String(process.env.LATEX_GRAPHIC_RENDER == null ? "" : process.env.LATEX_GRAPHIC_RENDER).trim().toLowerCase();
  return v !== "0" && v !== "off" && v !== "false" && v !== "no";
}

/* ---------- 小工具（括号平衡读：TeX 的 { } [ ] 里还可能套着同种括号） ---------- */
function skipWs(s, i) { while (i < s.length && (s[i] === " " || s[i] === "\t" || s[i] === "\n" || s[i] === "\r")) i++; return i; }

function grabBalanced(s, i, open, close) {
  if (s[i] !== open) return null;
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === "\\") { j++; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return { body: s.slice(i + 1, j), next: j + 1 }; }
  }
  return null;
}
function grabBraced(s, i) { return grabBalanced(s, i, "{", "}"); }
function grabBracketed(s, i) { return grabBalanced(s, i, "[", "]"); }

/** 掐掉 \% 注释（"%" 之后到行尾）。判断中文之前必须先把注释拿掉 ——
 *  一段中文注释会把整篇当成 CJK 文档，白白塞一个 \usepackage{ctex}。 */
function stripComments(s) {
  return String(s || "").replace(/(^|[^\\])%.*$/gm, "$1");
}
/** 有没有中日韩文字（判断要不要给 standalone 补 ctex）—— 只看真内容，不看注释 */
function hasCJK(s) {
  return /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/.test(stripComments(s));
}

/* ---------- 文档结构识别 ---------- */
function classOf(doc) {
  const m = /\\documentclass\s*(\[[^\]]*\])?\s*\{([^}]*)\}/.exec(doc);
  if (!m) return null;
  return { raw: m[0], opts: m[1] || "", name: String(m[2] || "").trim(), at: m.index, end: m.index + m[0].length };
}

/** 抠出导言区（\documentclass 之后 → \begin{document} 之前），以及「这是一篇完整文档吗」 */
function splitDoc(doc) {
  const src = String(doc || "");
  const cls = classOf(src);
  const bd = /\\begin\s*\{document\}/.exec(src);
  const start = cls ? cls.end : 0;
  const end = bd && bd.index > start ? bd.index : src.length;
  return { cls: cls, preamble: src.slice(start, end).trim(), hasDoc: !!bd };
}

/** 被预览的这份文件**自己**就是 standalone 图源吗（整篇 = 一张图） */
function isStandaloneDoc(doc) {
  const c = classOf(String(doc || ""));
  return !!c && /(^|,|\s)standalone($|,|\s)/.test(c.name.replace(/[\[\]]/g, ""));
}

/**
 * 从**全文**里收集「与画图有关的那几行」：\usetikzlibrary / \tikzset / \tikzstyle /
 * \pgfplotsset / \definecolor。
 * 为什么要从全文（含正文）收、而不只收导言区：这些命令在正文里也合法
 * （\tikzset 常写在 figure 里），漏掉一行就可能**静默画错**。
 * @returns string[] 原样片段（去重后）
 */
function collectCarryOver(src) {
  const ARITY = { usetikzlibrary: 1, tikzset: 1, pgfplotsset: 1, definecolor: 3 };
  const raw = String(src || "");
  const re = /\\(usetikzlibrary|tikzset|pgfplotsset|definecolor|tikzstyle)\b/g;
  const found = [];
  let m;
  while ((m = re.exec(raw))) {
    const cmd = m[1];
    let j = skipWs(raw, m.index + m[0].length);
    let piece = "\\" + cmd;
    let dead = false;
    for (;;) {                                  // 可选参数，可能有多个
      if (raw[j] !== "[") break;
      const g = grabBracketed(raw, j);
      if (!g) { dead = true; break; }
      piece += "[" + g.body + "]";
      j = skipWs(raw, g.next);
    }
    if (dead) continue;
    if (cmd === "tikzstyle") {
      /* \tikzstyle{名字}=[键值] —— 组后面跟着 = 方括号，和上面那几个不是一个形状 */
      const g = grabBraced(raw, j);
      if (!g) continue;
      piece += "{" + g.body + "}";
      j = skipWs(raw, g.next);
      if (raw[j] === "=") {
        const b = grabBracketed(raw, skipWs(raw, j + 1));
        if (b) { piece += "=[" + b.body + "]"; j = b.next; }
      }
      found.push(piece);
      re.lastIndex = j;
      continue;
    }
    const n = ARITY[cmd] || 1;
    for (let k = 0; k < n; k++) {
      if (k) j = skipWs(raw, j);
      const g = grabBraced(raw, j);
      if (!g) { dead = true; break; }
      piece += "{" + g.body + "}";
      j = g.next;
    }
    if (dead) continue;
    found.push(piece);
    re.lastIndex = j;
  }
  const seen = Object.create(null);
  const out = [];
  for (const p of found) {
    const k = p.replace(/\s+/g, " ").trim();
    if (!k || seen[k]) continue;
    seen[k] = 1;
    out.push(p);
  }
  return out;
}

/* ---------- 包装成一篇能单独编译的 standalone 文档 ---------- */
function buildInlineDoc(kind, source, doc, tier, engineName) {
  const sp = splitDoc(doc);
  const pre = sp.preamble || "";
  const clsName = sp.cls ? sp.cls.name : "";
  const cjk = hasCJK(source) || hasCJK(pre);
  /* 原 class 是 ctex* 的话，换成 standalone 就把 ctex 的字体设置带走了 —— 中文会静默消失。
   * 导言区自己 \usepackage 过 ctex 的（article + ctex 那种）不算，那种本来就还在。 */
  const pkgCtex = /\\usepackage\s*(\[[^\]]*\])?\s*\{[^}]*\bctex\b[^}]*\}/i.test(pre);
  const classCtex = /\bctex/i.test(clsName);
  /* 字号跟着原文档走：图在正文里是按 11pt 排的，预览也该按 11pt 排，
   * 否则「预览 813px / PDF 902px」这种对不上会让人以为是插件画错了。 */
  const sizeOpt = (/\b(?:10|11|12)pt\b/.exec(sp.cls ? sp.cls.opts : "") || [""])[0];

  const out = [
    "% 由 notrat-latex-plugin 自动生成（绘图环境就地渲染）—— 改这份没用，请改 .tex 原文",
    "\\documentclass[" + (sizeOpt ? sizeOpt + "," : "") + "tikz,border=3pt]{standalone}",
  ];
  /* 引擎带不动 CJK 时就别塞 ctex（ctex 在 pdfLaTeX 下起不来）：
   * 硬塞的结果是「本来能编的一张 ASCII 图，被我们塞崩了」—— 那是我们制造的故障。
   * 名字给空（单测 / 探针）时按「带得动」算：宁可多给一行，也好过静默缺字。 */
  const eng = String(engineName || "");
  const engCjk = !eng || /xelatex|lualatex|tectonic/i.test(eng);
  if ((cjk || classCtex) && !pkgCtex && engCjk) out.push("\\usepackage{ctex}");

  if (tier === "A") {
    out.push(pre);
  } else {
    const carry = collectCarryOver(doc);
    const libs = carry.filter(function (l) { return /^\\usetikzlibrary/.test(l); });
    const sets = carry.filter(function (l) { return /^\\(tikzset|tikzstyle|definecolor)/.test(l); });
    const pps = carry.filter(function (l) { return /^\\pgfplotsset/.test(l); });
    out.push("\\usepackage{amsmath,amssymb}");
    out.push("\\usepackage{xcolor}");
    out.push("\\usepackage{graphicx}");
    out.push("\\usepackage{tikz}");
    for (const l of libs) out.push(l);
    /* 用到 pgfplots（axis 家族）或原文里有 \pgfplotsset —— 都得先把包装上，
     * 否则那一行 \pgfplotsset 自己就会报 undefined control sequence。 */
    if (PGFPLOTS_ENVS[kind] || pps.length) {
      out.push("\\usepackage{pgfplots}");
      out.push("\\pgfplotsset{compat=1.18}");
    }
    for (const l of sets) out.push(l);
    for (const l of pps) out.push(l);
  }

  out.push("\\begin{document}");
  /* source 就是 \begin{...} 之后、\end{...} 之前的那一段（含可选参数），原样回填 */
  out.push("\\begin{" + kind + "}" + source + "\\end{" + kind + "}");
  out.push("\\end{document}", "");
  return out.join("\n");
}

/* ---------- 安全闸 ----------
 * 就算给了 -no-shell-escape（下面编译时确实给了），也不让这些东西进包装文档：
 * 这是纵深防御，不是唯一防线。命中就拒，并把理由原样告诉用户（不静默）。 */
const DANGER = [
  { re: /\\write18\b/, why: "\\write18（调用外部命令）" },
  { re: /\\(?:input|include|subfile|import)\s*\{[^}]*\|/, why: "管道式 \\input{...|...}（会执行外部命令）" },
  { re: /\\directlua\b/, why: "\\directlua（执行 Lua 代码）" },
  { re: /\\lstinputlisting\s*\[[^\]]*\]\s*\{[^}]*\|/, why: "管道式 \\lstinputlisting" },
];
function findDanger(s) {
  for (const d of DANGER) if (d.re.test(s)) return d.why;
  return "";
}

/* ---------- 内容 hash ---------- */
function sha1(s) { return crypto.createHash("sha1").update(s, "utf8").digest("hex"); }
function pngPathOf(hash) { return path.join(PNG_DIR, hash + ".png"); }
function outDirOf(hash) { return path.join(OUT_DIR, hash); }
function metaPathOf(hash) { return path.join(CACHE_DIR, hash + ".meta.json"); }
function failPathOf(hash) { return path.join(CACHE_DIR, hash + ".fail.json"); }

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return null; }
}
function writeJson(p, obj) {
  try { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj), "utf8"); } catch (e) {}
}

/* ---------- 编译一次 ---------- */
function runTex(engine, baseName, cwd, origDir, timeout) {
  const name = String(engine.name || "");
  const common = ["-interaction=nonstopmode", "-halt-on-error", "-file-line-error"];
  let args;
  if (/tectonic/i.test(name)) args = ["--keep-logs", baseName];
  else if (/latexmk/i.test(name)) args = ["-xelatex", "-norc", "-silent"].concat(common, [baseName]);
  /* -no-shell-escape：显式关掉 \write18 这条通路（本插件从不需要它） */
  else args = common.concat(["-no-shell-escape", baseName]);

  const env = Object.assign({}, process.env);
  if (origDir) {
    /* cwd 是临时目录，相对路径（\input / \includegraphics）靠 TEXINPUTS 指回原目录；
     * 末尾那个分隔符 = 「后面接默认搜索路径」，少了它会把 TeX 自带的路径整个替掉。 */
    const d = String(origDir).replace(/\\/g, "/");
    env.TEXINPUTS = d + path.delimiter + (env.TEXINPUTS || "");
  }

  return new Promise(function (resolve) {
    let child;
    try { child = spawn(engine.exe, args, { cwd: cwd, env: env, windowsHide: true }); }
    catch (e) { return resolve({ code: -1, log: "编译器无法启动: " + ((e && e.message) || e) }); }
    let out = "";
    let killed = false;
    const timer = setTimeout(function () {
      killed = true;
      try { child.kill(); } catch (e) {}
    }, timeout);
    child.stdout.on("data", function (d) { out += d.toString(); if (out.length > 400000) out = out.slice(-200000); });
    child.stderr.on("data", function (d) { out += d.toString(); });
    child.on("error", function (e) { clearTimeout(timer); resolve({ code: -1, log: String((e && e.message) || e) }); });
    child.on("close", function (code) {
      clearTimeout(timer);
      if (killed) out += "\n(超时 " + Math.round(timeout / 1000) + "s，已终止)";
      resolve({ code: code, log: out });
    });
  });
}

function pdfLooksOk(p) {
  try {
    const st = fs.statSync(p);
    if (!st.isFile() || st.size < 800) return false;
    const fd = fs.openSync(p, "r");
    const len = Math.min(st.size, 4096);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, Math.max(0, st.size - len));
    fs.closeSync(fd);
    return buf.toString("latin1").indexOf("%%EOF") >= 0;
  } catch (e) { return false; }
}

/** 缺字计数 —— 「编译过了但中文没了」的唯一客观信号 */
function countMissing(log) { return (String(log || "").match(/Missing character/g) || []).length; }

/** 日志尾部摘几句人话：优先带 file:line 的错误行 */
function logTail(log, max) {
  const s = String(log || "");
  const lines = s.split(/\r?\n/);
  const hit = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^!|^.*:\d+:|LaTeX Error|Undefined control sequence|Package .* Error|File .* not found/i.test(lines[i])) {
      hit.push(lines[i].trim());
      if (hit.length >= 8) break;
    }
  }
  if (!hit.length) hit.push(lines.filter(function (l) { return l.trim(); }).slice(-5).join("\n"));
  const t = hit.join("\n").trim();
  return t.length > (max || 900) ? t.slice(-(max || 900)) : t;
}

function fail(code, reason, extra) {
  return Object.assign({ ok: false, code: code, reason: reason }, extra || {});
}

/**
 * 渲染一张绘图环境。
 *
 * @param {object} args
 *   args.kind    环境名（必须在 RENDERABLE 白名单内）
 *   args.source  \begin{...} 之后、\end{...} 之前的那一段（含可选参数），原样
 *   args.doc     被预览的那份 .tex 全文（抠导言区 + standalone 判定 + 进 hash）
 *   args.path    仅用于日志与相对路径（不读盘；doc 才是权威）
 *   args.force   true = 无视缓存与「上次失败」记录，重编
 * @param {object} host  { pickEngine: () => ({exe, name}), log: (msg) => void }
 * @returns Promise<object> 成功 {ok:true, dataUri, ...} / 失败 {ok:false, code, reason, log}
 */
async function renderGraphic(args, host) {
  host = host || {};
  const t0 = Date.now();
  const log = typeof host.log === "function" ? host.log : function () {};

  if (!graphicEnabled()) {
    return fail("DISABLED", "本机用 LATEX_GRAPHIC_RENDER=0 关掉了绘图就地渲染（照旧看源码 / 编译 PDF 后看图）");
  }

  const kind = String((args && args.kind) || "").trim();
  if (!RENDERABLE[kind]) {
    return fail("REJECTED", "不支持就地渲染的环境：\"" + (kind || "(空)") + "\" —— 只支持能独立成篇的绘图环境（例如 tikzpicture / axis / tikzcd）");
  }
  const source = String(args && args.source != null ? args.source : "");
  if (!source.trim()) return fail("REJECTED", "这张图的环境体是空的，没有可编译的内容");
  if (source.length > SRC_MAX) return fail("REJECTED", "图源码过大（" + Math.round(source.length / 1024) + "KB > 200KB），不编译");

  const doc = String((args && args.doc) || "");
  if (!doc.trim()) return fail("REJECTED", "没有拿到这份 .tex 的全文（导言区无法确定，宁可不编也不瞎编）");
  if (doc.length > DOC_MAX) return fail("REJECTED", "这份 .tex 过大（" + Math.round(doc.length / 1024) + "KB），不为了渲染一张图整篇解析");

  const danger = findDanger(source);
  if (danger) return fail("REJECTED", "图源码里有 " + danger + "，为安全起见不在预览里编译它（正文照旧可编）");

  /* 引擎：与「编译 PDF」同一条探测链。探不到**不落盘缓存** —— 用户可能刚装完引擎 */
  let engine = null;
  try {
    engine = host.pickEngine ? host.pickEngine() : null;
  } catch (e) {
    return fail("NO_ENGINE", String((e && e.message) || e));
  }
  if (!engine || !engine.exe) return fail("NO_ENGINE", "没探测到本机 TeX 引擎");

  const mode = isStandaloneDoc(doc) ? "file" : "inline";
  const dpi = graphicDpi();
  const hash = sha1([WRAP_VERSION, mode, kind, engine.name, String(dpi), doc, source].join("\u0000"));

  /* ① 命中缓存：连进程都不起 */
  if (!args.force) {
    try {
      const buf = fs.readFileSync(pngPathOf(hash));
      if (buf.length) {
        const meta = readJson(metaPathOf(hash)) || {};
        return {
          ok: true, cached: true, hash: hash, mode: mode, dpi: dpi,
          engine: meta.engine || engine.name,
          tier: meta.tier || (mode === "file" ? "F" : "A"),
          missing: meta.missing || 0,
          warn: meta.missing ? meta.missing + " 处字符没排出来（多半缺中文字体/宏包），图可能缺字" : "",
          dataUri: "data:image/png;base64," + buf.toString("base64"),
          bytes: buf.length,
          ms: { total: Date.now() - t0, compile: 0, raster: 0 },
        };
      }
    } catch (e) { /* 没缓存 → 往下编 */ }
    /* 「上次就编不过」的记录：同样的源码重编一次只是再等几十秒。
     * 这是个**内容 hash**，源码一改 key 就变，所以不存在「改了还拿旧失败挡着」。
     * 想硬重试就给 force（面板的「重试」按钮就是这么发的）。 */
    const prev = readJson(failPathOf(hash));
    if (prev && prev.reason) {
      return fail(prev.code || "COMPILE_FAIL", prev.reason + "（这是上次的记录；改了源码或点「重试」会重新编）",
        { hash: hash, log: prev.log || "", mode: mode });
    }
  }

  const outDir = outDirOf(hash);
  const baseName = "figure.tex";
  const texPath = path.join(outDir, baseName);
  const pdfPath = path.join(outDir, "figure.pdf");
  const winPath = path.join(outDir, "win.pdf");
  const origDir = args && args.path ? path.dirname(String(args.path)) : "";

  const tiers = mode === "file" ? ["F"] : ["A", "B"];
  let best = null;              // { tier, missing }：编过的里面缺字最少的那个
  let lastLog = "";
  let lastCode = 0;
  let compileMs = 0;

  try {
    fs.mkdirSync(outDir, { recursive: true });
  } catch (e) {
    return fail("IO_FAIL", "临时目录写不进去：" + ((e && e.message) || e));
  }

  for (const tier of tiers) {
    const body = mode === "file" ? doc : buildInlineDoc(kind, source, doc, tier, engine.name);
    try {
      /* 清掉上一轮 tier 的产物，免得 B 捡到 A 的残留 pdf 当成功 */
      for (const f of ["figure.pdf", "figure.log", "figure.aux", "figure.xdv", "figure.out", "win.pdf"]) {
        try { fs.unlinkSync(path.join(outDir, f)); } catch (e) {}
      }
      fs.writeFileSync(texPath, body, "utf8");
    } catch (e) {
      return fail("IO_FAIL", "包装文档写不进去：" + ((e && e.message) || e));
    }
    const tC = Date.now();
    const r = await runTex(engine, baseName, outDir, origDir, graphicTimeout());
    compileMs = Date.now() - tC;
    log("graphic: " + kind + " tier=" + tier + " engine=" + engine.name + " exit=" + r.code + " " + compileMs + "ms");
    if (r.code === 0 && pdfLooksOk(pdfPath)) {
      const miss = countMissing(r.log);
      if (!best || miss < best.missing) {
        best = { tier: tier, missing: miss };
        try { fs.copyFileSync(pdfPath, winPath); } catch (e) {}
      }
      if (miss === 0) break;      // 干净 → 不用再试下一级
      continue;                   // 有缺字 → 再试下一级，谁少用谁
    }
    lastLog = r.log;
    lastCode = r.code;
  }

  if (!best) {
    const why = lastCode === 0
      ? "编译退出码为 0，但没有拿到可用的 PDF"
      : "编译失败（" + engine.name + " 退出码 " + lastCode + "）";
    const reason = why + "；" + (logTail(lastLog) || "日志为空");
    /* NO_ENGINE 不落盘（用户可能刚装好引擎）；其余失败落盘 —— 内容 hash 决定它不会误伤新源码 */
    writeJson(failPathOf(hash), { code: "COMPILE_FAIL", reason: reason, log: logTail(lastLog, 2000), at: Date.now(), mode: mode, tier: tiers.join("/") });
    return fail("COMPILE_FAIL", reason, { hash: hash, log: logTail(lastLog, 2000), mode: mode });
  }

  /* ② 栅格化（复用 pdf-raster 的工具探测与缓存） */
  let buf = null;
  let rasterMs = 0;
  try {
    const rr = await RASTER.rasterPdf(winPath, { dpi: dpi });
    buf = rr.buf;
    rasterMs = rr.ms;
  } catch (e) {
    const reason = "图编出来了，但栅格化失败：" + ((e && e.message) || e) +
      "（本机需要 Ghostscript 或 poppler 的 pdftoppm）";
    writeJson(failPathOf(hash), { code: "RASTER_FAIL", reason: reason, log: "", at: Date.now() });
    return fail("RASTER_FAIL", reason, { hash: hash, mode: mode });
  }
  if (!buf || !buf.length) return fail("RASTER_FAIL", "栅格化没有产出 PNG 数据", { hash: hash, mode: mode });
  if (buf.length > PNG_MAX) return fail("RASTER_FAIL", "栅格化 PNG 过大（>" + Math.round(PNG_MAX / 1024 / 1024) + "MB），不往预览里塞", { hash: hash, mode: mode });

  const warn = best.missing ? best.missing + " 处字符没排出来（多半缺中文字体/宏包），图可能缺字" : "";
  try {
    fs.mkdirSync(PNG_DIR, { recursive: true });
    fs.writeFileSync(pngPathOf(hash), buf);
    writeJson(metaPathOf(hash), { tier: best.tier, engine: engine.name, dpi: dpi, mode: mode, missing: best.missing, at: Date.now(), ms: compileMs + rasterMs });
    try { fs.unlinkSync(failPathOf(hash)); } catch (e) {}
  } catch (e) { /* 缓存写失败不影响这次显示 */ }

  /* 成功就把临时编译现场清掉（PNG 已缓存，pdf/aux 留着只会让临时目录越滚越大） */
  try { fs.rmSync(outDir, { recursive: true, force: true }); } catch (e) {}

  return {
    ok: true, cached: false, hash: hash, mode: mode, dpi: dpi,
    engine: engine.name, tier: best.tier, missing: best.missing, warn: warn,
    dataUri: "data:image/png;base64," + buf.toString("base64"),
    bytes: buf.length,
    ms: { total: Date.now() - t0, compile: compileMs, raster: rasterMs },
  };
}

module.exports = {
  renderGraphic: renderGraphic,
  isStandaloneDoc: isStandaloneDoc,
  buildInlineDoc: buildInlineDoc,
  collectCarryOver: collectCarryOver,
  countMissing: countMissing,
  findDanger: findDanger,
  RENDERABLE: RENDERABLE,
  CACHE_DIR: CACHE_DIR,
};
