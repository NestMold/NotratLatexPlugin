#!/usr/bin/env node
/**
 * Notrat LaTeX 助手 — MCP stdio server（纯 Node，零依赖）
 *
 * 工具：
 *   latex_parse    解析 .tex：文档类/宏包/章节/标签/交叉引用/文献引用/图表公式/字数/TODO
 *   latex_validate 校验：重复 label、未定义 ref、bib 缺失引用、begin/end 配对、TODO/FIXME 清单
 *   latex_compile  调用本机 TeX 引擎编译（xelatex/pdflatex/lualatex/latexmk，设置项可配）
 *   latex_export   导出 PDF / 自包含 HTML（v0.8.4）
 *   latex_env      探测本机 TeX 引擎（不编译、不写盘；面板首屏提示用）
 *
 * ⚠ stdout 是 JSON-RPC 专线，日志一律走 stderr。
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const readline = require("readline");
const CONTRIB = require("./contrib.js"); // v0.4.0 新贡献面支撑（引擎探测/大纲/状态/快照）
const EXPORT = require("./export-html.js"); // v0.8.4 导出（自包含 HTML）

const VERSION = "0.8.6"; // 构建时按 manifest.version 覆写
const PLUGIN_ID = process.env.NOTRAT_PLUGIN_ID || "notrat-latex-plugin";

function log(...a) {
  process.stderr.write("[latex-plugin] " + a.join(" ") + "\n");
}

/* ------------------------------------------------------------------ */
/* 路径解析与主文件发现                                                  */
/* ------------------------------------------------------------------ */

function workspaceRoot(explicit) {
  return explicit || process.env.NOTRAT_WORKSPACE || "";
}

function findMainTex(dir) {
  if (!dir) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const texFiles = entries
    .filter((e) => e.isFile() && /\.tex$/i.test(e.name))
    .map((e) => path.join(dir, e.name));
  const priority = ["main.tex", "master.tex", "paper.tex", "thesis.tex", "article.tex", "report.tex"];
  for (const name of priority) {
    const hit = texFiles.find((f) => path.basename(f).toLowerCase() === name);
    if (hit) return hit;
  }
  for (const f of texFiles) {
    try {
      if (/\\documentclass/.test(fs.readFileSync(f, "utf8"))) return f;
    } catch {}
  }
  if (texFiles.length) return texFiles[0];
  // 一层子目录里找（跳过隐藏/构建目录）
  const SKIP = new Set(["node_modules", ".git", ".notrat", "build", "out", "dist"]);
  for (const e of entries) {
    if (!e.isDirectory() || SKIP.has(e.name) || e.name.startsWith(".")) continue;
    const sub = findMainTex(path.join(dir, e.name));
    if (sub) return sub;
  }
  return null;
}

function resolveInput(p, ws) {
  if (!p || typeof p !== "string" || !p.trim()) return findMainTex(workspaceRoot(ws));
  let cand = p.trim().replace(/^["']|["']$/g, "");
  if (!path.isAbsolute(cand)) {
    const root = workspaceRoot(ws);
    cand = root ? path.join(root, cand) : path.resolve(cand);
  }
  let st;
  try {
    st = fs.statSync(cand);
  } catch {
    return null;
  }
  if (st.isDirectory()) return findMainTex(cand);
  return cand;
}

/* ------------------------------------------------------------------ */
/* LaTeX 解析核心                                                       */
/* ------------------------------------------------------------------ */

/** 去注释（保留 \% 转义） */
function stripComments(src) {
  return src
    .split(/\r?\n/)
    .map((line) => {
      let out = "";
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === "\\") {
          out += ch + (line[i + 1] || "");
          i++;
          continue;
        }
        if (ch === "%") break;
        out += ch;
      }
      return out;
    })
    .join("\n");
}

/** 读取平衡的 {...} 分组，text[i] 必须是 "{" */
function readGroup(text, i) {
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    const c = text[j];
    if (c === "\\") {
      j++;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return { content: text.slice(i + 1, j), end: j };
    }
  }
  return null;
}

function buildLineOf(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  return (idx) => {
    let lo = 0,
      hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= idx) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

function countWords(code) {
  const m = code.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
  let body = m ? m[1] : code;
  body = body
    .replace(/\\begin\{(figure|table|equation|align|gather|tabular)\*?\}[\s\S]*?\\end\{\1\*?\}/g, " ")
    .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{[^{}]*\})*/g, " ")
    .replace(/[{}$&%~^_\\]/g, " ");
  const cjk = (body.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const latin = (body.match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g) || []).length;
  return { cjkChars: cjk, latinWords: latin, approxWords: cjk + latin };
}

/* 浮动体 / 公式环境：起止行 + caption + label
 * 旧版只记 \begin 的行号：大纲面板能列出「🖼 图」，却看不到图题、也点不到 \label。
 * 这里按 \begin/\end 配对，把 caption / label / endLine 一并带出（未闭合的也保留，
 * 配对错误交给 latex_validate 去报，解析侧不吞信息）。 */
const FLOAT_ENV = /^(figure\*?|table\*?|equation\*?|align\*?|gather\*?|eqnarray\*?|multline\*?)$/;

function collectFloats(lines) {
  const out = [];
  const stack = [];
  for (let li = 0; li < lines.length; li++) {
    const ln = li + 1;
    const line = lines[li];
    const toks = [];
    let tm;
    const bre = /\\begin\s*\{([^}]+)\}/g;
    while ((tm = bre.exec(line))) toks.push({ i: tm.index, t: "b", name: tm[1] });
    const ere = /\\end\s*\{([^}]+)\}/g;
    while ((tm = ere.exec(line))) toks.push({ i: tm.index, t: "e", name: tm[1] });
    if (!toks.length) continue;
    toks.sort((a, b) => a.i - b.i);
    for (const tk of toks) {
      if (tk.t === "b") {
        if (FLOAT_ENV.test(tk.name)) stack.push({ raw: tk.name, name: tk.name.replace(/\*$/, ""), line: ln, endLine: null });
      } else {
        for (let k = stack.length - 1; k >= 0; k--) {
          if (stack[k].raw === tk.name) {
            const f = stack.splice(k, 1)[0];
            f.endLine = ln;
            out.push(f);
            break;
          }
        }
      }
    }
  }
  for (const f of stack) out.push(f); // 未闭合的照样进清单
  for (const f of out) {
    const seg = lines.slice(f.line - 1, Math.max(f.line, f.endLine || f.line)).join("\n");
    const cm = /\\caption\s*(?:\[[^\]]*\])?\s*\{/.exec(seg);
    if (cm) {
      const g = readGroup(seg, cm.index + cm[0].length - 1);
      if (g) f.caption = g.content.replace(/\s+/g, " ").trim();
    }
    const lm = /\\label\s*\{([^}]+)\}/.exec(seg);
    if (lm) f.label = lm[1].trim();
    delete f.raw;
  }
  out.sort((a, b) => a.line - b.line);
  return out.map((f) => ({
    name: f.name,
    line: f.line,
    endLine: f.endLine,
    caption: f.caption || "",
    label: f.label || "",
  }));
}

function parseTex(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const code = stripComments(raw);
  const lines = code.split(/\r?\n/);
  const lineOf = buildLineOf(code);

  const result = {
    file: filePath,
    documentClass: null,
    documentClassOptions: [],
    packages: [],
    title: null,
    author: null,
    date: null,
    bibResources: [],
    sections: [],
    labels: [],
    refs: [],
    cites: [],
    environments: [],
    inlineMath: 0,
    todos: [],
    wordCount: null,
  };

  const dc = code.match(/\\documentclass\s*(?:\[([^\]]*)\])?\s*\{([^}]+)\}/);
  if (dc) {
    result.documentClass = dc[2].trim();
    result.documentClassOptions = (dc[1] || "").split(",").map((s) => s.trim()).filter(Boolean);
  }
  for (const m of code.matchAll(/\\usepackage\s*(?:\[([^\]]*)\])?\s*\{([^}]+)\}/g)) {
    for (const p of m[2].split(",")) {
      const t = p.trim();
      if (t) result.packages.push(t);
    }
  }
  const grab = (cmd) => {
    const re = new RegExp("\\\\" + cmd + "\\s*\\{");
    const m = re.exec(code);
    if (!m) return null;
    const g = readGroup(code, m.index + m[0].length - 1);
    return g ? g.content.replace(/\s+/g, " ").trim() : null;
  };
  result.title = grab("title");
  result.author = grab("author");
  result.date = grab("date");
  for (const m of code.matchAll(/\\(?:addbibresource|bibliography)\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g)) {
    for (const b of m[1].split(",")) {
      const t = b.trim();
      if (t) result.bibResources.push(t);
    }
  }

  // 章节结构（平衡括号取标题）
  const secRe = /\\(part|chapter|section|subsection|subsubsection)(\*)?\s*\{/g;
  let m;
  while ((m = secRe.exec(code))) {
    const g = readGroup(code, m.index + m[0].length - 1);
    if (!g) continue;
    result.sections.push({
      level: { part: 0, chapter: 1, section: 1, subsection: 2, subsubsection: 3 }[m[1]],
      cmd: m[1],
      star: !!m[2],
      title: g.content.replace(/\s+/g, " ").trim(),
      line: lineOf(m.index),
    });
    secRe.lastIndex = g.end + 1;
  }

  // 逐行：环境栈 + 标签/引用/文献引用
  const envStack = [];
  const envSeq = [];
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const ln = li + 1;
    const tokens = [];
    let tm;
    const bre = /\\begin\s*\{([^}]+)\}/g;
    while ((tm = bre.exec(line))) tokens.push({ i: tm.index, t: "b", name: tm[1] });
    const ere = /\\end\s*\{([^}]+)\}/g;
    while ((tm = ere.exec(line))) tokens.push({ i: tm.index, t: "e", name: tm[1] });
    tokens.sort((a, b) => a.i - b.i);
    for (const tk of tokens) {
      if (tk.t === "b") {
        envStack.push({ name: tk.name, line: ln });
        envSeq.push({ name: tk.name, line: ln, open: true });
      } else {
        const top = envStack.pop();
        envSeq.push({ name: tk.name, line: ln, open: false, matched: !!top && top.name === tk.name });
      }
    }
    const curEnv = envStack.length ? envStack[envStack.length - 1].name : "";

    let lm;
    const lab = /\\label\{([^}]+)\}/g;
    while ((lm = lab.exec(line))) result.labels.push({ key: lm[1].trim(), line: ln, env: curEnv });

    const rr = /\\(ref|eqref|autoref|pageref|cref|Cref|vref)\s*\{([^}]+)\}/g;
    while ((lm = rr.exec(line)))
      for (const k of lm[2].split(",")) {
        const key = k.trim();
        if (key) result.refs.push({ key, line: ln, cmd: lm[1] });
      }

    const cr = /\\([a-zA-Z]*[cC]ite[a-zA-Z]*)\s*((?:\[[^\]]*\]\s*)*)\{([^}]+)\}/g;
    while ((lm = cr.exec(line)))
      for (const k of lm[3].split(",")) {
        const key = k.trim();
        if (key) result.cites.push({ key, line: ln, cmd: lm[1] });
      }

  }

  /* 浮动体 / 公式环境：起止行 + caption + label（大纲面板消费） */
  result.environments = collectFloats(lines);

  result.inlineMath = Math.floor(((code.match(/(?<!\\)\$/g) || []).length) / 2);
  result.wordCount = countWords(code);

  // TODO / FIXME（从原始文本的注释里找）
  raw.split(/\r?\n/).forEach((line, i) => {
    let idx = -1;
    for (let j = 0; j < line.length; j++) {
      if (line[j] === "\\") {
        j++;
        continue;
      }
      if (line[j] === "%") {
        idx = j;
        break;
      }
    }
    if (idx < 0) return;
    const c = line.slice(idx + 1);
    const tm2 = c.match(/\b(TODO|FIXME|XXX)\b[:：]?\s*(.*)/i);
    if (tm2)
      result.todos.push({
        line: i + 1,
        kind: tm2[1].toUpperCase(),
        text: (tm2[2] || "").trim() || c.trim(),
      });
  });

  result.envSeq = envSeq;
  return result;
}

function loadBibKeys(resources, baseDir) {
  const keys = new Set();
  let found = false;
  for (const res of resources || []) {
    let p = res.trim();
    if (!p) continue;
    if (!path.isAbsolute(p)) p = path.join(baseDir, p);
    if (!/\.bib$/i.test(p) && !fs.existsSync(p)) p += ".bib";
    let txt;
    try {
      txt = fs.readFileSync(p, "utf8");
    } catch {
      continue;
    }
    found = true;
    let bm;
    const re = /@\s*([a-zA-Z]+)\s*\{\s*([^,\s{}]+)\s*,/g;
    while ((bm = re.exec(txt))) keys.add(bm[2]);
  }
  return found ? keys : null;
}

function validateTex(filePath) {
  const p = parseTex(filePath);
  const issues = [];

  const seen = {};
  for (const l of p.labels) {
    if (seen[l.key])
      issues.push({
        severity: "error",
        line: l.line,
        type: "duplicate-label",
        message: `label 重复定义: ${l.key}（首次出现在第 ${seen[l.key]} 行）`,
      });
    else seen[l.key] = l.line;
  }

  const labelSet = new Set(p.labels.map((l) => l.key));
  for (const r of p.refs) {
    r.ok = labelSet.has(r.key);
    if (!r.ok)
      issues.push({
        severity: "error",
        line: r.line,
        type: "undefined-ref",
        message: `\\${r.cmd}{${r.key}} 引用了未定义的 label`,
      });
  }

  const bibKeys = loadBibKeys(p.bibResources, path.dirname(filePath));
  for (const c of p.cites) {
    if (bibKeys) {
      c.ok = bibKeys.has(c.key);
      if (!c.ok)
        issues.push({
          severity: "error",
          line: c.line,
          type: "undefined-citation",
          message: `\\${c.cmd}{${c.key}} 在 .bib 文献库中未找到`,
        });
    } else {
      c.ok = null;
      issues.push({
        severity: "warning",
        line: c.line,
        type: "unverified-citation",
        message: `\\${c.cmd}{${c.key}} 未找到 .bib 文献库（${p.bibResources.join(", ") || "无声明"}），无法核验`,
      });
    }
  }

  for (const e of p.envSeq)
    if (!e.open && !e.matched)
      issues.push({
        severity: "error",
        line: e.line,
        type: "env-mismatch",
        message: `\\end{${e.name}} 与当前打开的环境不匹配`,
      });

  for (const t of p.todos)
    issues.push({ severity: "info", line: t.line, type: "todo", message: `${t.kind}: ${t.text}` });

  issues.sort((a, b) => a.line - b.line);
  const summary = {
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
    infos: issues.filter((i) => i.severity === "info").length,
  };
  return { file: filePath, issues, summary };
}

/* ------------------------------------------------------------------ */
/* 输出格式化                                                           */
/* ------------------------------------------------------------------ */

function fmtParse(res, val) {
  const L = [];
  L.push(`📄 ${res.file}`);
  if (res.documentClass)
    L.push(`文档类: ${res.documentClass}${res.documentClassOptions.length ? "  [" + res.documentClassOptions.join(", ") + "]" : ""}`);
  if (res.packages.length) L.push(`宏包: ${res.packages.join(", ")}`);
  const meta = [res.title && `标题: ${res.title}`, res.author && `作者: ${res.author}`, res.date && `日期: ${res.date}`]
    .filter(Boolean)
    .join("  ·  ");
  if (meta) L.push(meta);
  if (res.bibResources.length) L.push(`文献库: ${res.bibResources.join(", ")}`);

  if (res.sections.length) {
    L.push("", `📑 章节结构 (${res.sections.length}):`);
    for (const s of res.sections) {
      const pre = { part: "◆ ", chapter: "第○章 ", section: "§ ", subsection: "§§ ", subsubsection: "§§§ " }[s.cmd] || "";
      L.push(`${"  ".repeat(s.level)}${pre}${s.title}  (L${s.line})`);
    }
  } else {
    L.push("", "📑 章节结构: 未发现 \\section 等命令");
  }

  const badRef = val ? new Map(val.issues.filter((i) => i.type === "undefined-ref").map((i) => [i.line, true])) : null;
  L.push("", `🔗 交叉引用 (${res.refs.length}):` + (res.refs.length ? "" : " 无"));
  for (const r of res.refs)
    L.push(`  \\${r.cmd}{${r.key}}  (L${r.line})${badRef && badRef.get(r.line) ? "  ⚠ 未定义" : ""}`);

  const badCite = val ? new Map(val.issues.filter((i) => i.type === "undefined-citation").map((i) => [i.line, true])) : null;
  L.push(`📚 文献引用 (${res.cites.length}):` + (res.cites.length ? "" : " 无"));
  for (const c of res.cites)
    L.push(`  ${c.key}  (L${c.line})${badCite && badCite.get(c.line) ? "  ⚠ bib 缺失" : badCite === null && res.cites.length ? "  ?未核验" : ""}`);

  const fig = res.environments.filter((e) => /^figure/.test(e.name)).length;
  const tab = res.environments.filter((e) => /^table/.test(e.name)).length;
  const eq = res.environments.filter((e) => /^(equation|align|gather|eqnarray|multline)$/.test(e.name)).length;
  L.push("", `🖼 图 ${fig} · 表 ${tab} · 公式环境 ${eq} · 行内公式 ~${res.inlineMath}`);
  if (res.wordCount)
    L.push(`💬 字数: 中文 ${res.wordCount.cjkChars} 字 + 英文 ${res.wordCount.latinWords} 词 ≈ ${res.wordCount.approxWords}`);

  if (res.labels.length)
    L.push("", `🏷 标签 (${res.labels.length}): ` + res.labels.map((l) => `${l.key}(L${l.line})`).join("  "));

  if (res.todos.length) {
    L.push("", `📌 TODO/FIXME (${res.todos.length}):`);
    for (const t of res.todos) L.push(`  L${t.line}  [${t.kind}] ${t.text}`);
  }
  return L.join("\n");
}

function fmtValidate(val) {
  const { summary, issues } = val;
  if (!issues.length) return `✅ ${val.file}\n未发现问题。`;
  const icon = { error: "🔴", warning: "🟡", info: "⚪" };
  const L = [`📋 ${val.file}`, `🔴 错误 ${summary.errors} · 🟡 警告 ${summary.warnings} · ⚪ 提示 ${summary.infos}`, ""];
  for (const i of issues) L.push(`${icon[i.severity]} L${i.line} [${i.type}] ${i.message}`);
  return L.join("\n");
}

/* ------------------------------------------------------------------ */
/* 编译                                                                 */
/* ------------------------------------------------------------------ */

function mtime(p) {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return null;
  }
}


function resolveCompiler(compiler) {
  if (path.isAbsolute(compiler)) return fs.existsSync(compiler) ? compiler : null;
  const cands = [];
  if (process.platform === "win32") {
    const exts = ["", ".exe", ".cmd", ".bat"];
    const lc = process.env.LOCALAPPDATA || "";
    const home = os.homedir();
    const dirs = [
      path.join(home, ".notrat", "tools", "bin"),
      path.join(lc, "Tectonic"),
      path.join(lc, "Microsoft", "WinGet", "Links"),
      path.join(home, "scoop", "shims"),
      path.join(home, ".cargo", "bin"),
    ];
    for (const d of dirs) for (const e of exts) cands.push(path.join(d, compiler + e));
    for (const e of exts) cands.push(compiler + e);
  } else cands.push(compiler);
  for (const c of cands) {
    try { fs.accessSync(c, fs.constants.X_OK); return c; } catch {}
  }
  return null;
}
function compileTex(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const picked = CONTRIB.pickCompiler(CONTRIB.envReal("LATEX_COMPILER"), resolveCompiler);
  const compiler = picked.name;
  const exe = picked.exe;
  const timeoutSec = parseInt(process.env.LATEX_TIMEOUT || "120", 10) || 120;
  const pdfPath = path.join(dir, base.replace(/\.tex$/i, ".pdf"));
  const logPath = path.join(dir, base.replace(/\.tex$/i, ".log"));
  const beforeM = mtime(pdfPath);

  log(`compile: ${compiler} ${base} (cwd=${dir}, timeout=${timeoutSec}s)`);
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(exe, /tectonic/i.test(compiler) ? ["--keep-logs", base] : ["-interaction=nonstopmode", "-halt-on-error", "-file-line-error", base], {
        cwd: dir,
        windowsHide: true,
      });
    } catch (e) {
      return resolve(`❌ 编译器无法启动: ${e.message}`);
    }
    let out = "";
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      try {
        child.kill();
      } catch {}
    }, timeoutSec * 1000);
    child.stdout.on("data", (d) => {
      out += d.toString();
      if (out.length > 500000) out = out.slice(-250000);
    });
    child.stderr.on("data", (d) => {
      out += d.toString();
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve(
        `❌ 编译器 "${compiler}" 未找到或无法启动。\n${e.message}\n提示：请安装 TeX 发行版（Windows 推荐 TeX Live / MiKTeX），或在插件设置里更换编译引擎。`
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const afterM = mtime(pdfPath);
      const pdfNew = afterM && (!beforeM || afterM > beforeM);
      const errLines = out
        .split(/\r?\n/)
        .filter((l) => /^!\s/.test(l) || /^.+:\d+:\s/.test(l))
        .slice(0, 12);
      let logTail = "";
      try {
        const lt = fs.readFileSync(logPath, "utf8");
        logTail = lt.split(/\r?\n/).slice(-40).join("\n");
      } catch {}
      const L = [];
      L.push(`🔨 ${compiler} ${base}  (目录: ${dir})`);
      if (picked && picked.fellBack)
        L.push(`ℹ️ 设置里的「${picked.wanted}」本机不可用，已自动改用 ${compiler}（可尝试: ${picked.tried.join(" / ")}）`);
      if (killed) L.push(`⏱ 超时（>${timeoutSec}s），进程已被终止`);
      L.push(`退出码: ${code === null ? "(被终止)" : code}`);
      if (fs.existsSync(pdfPath)) {
        const kb = (fs.statSync(pdfPath).size / 1024).toFixed(1);
        L.push(`📄 PDF: ${path.basename(pdfPath)} (${kb} KB${pdfNew ? "，刚刚生成" : ""}) → ${pdfPath}`);
      } else {
        L.push("📄 PDF: 未生成");
      }
      if (errLines.length) {
        L.push("", "🚫 错误行:");
        for (const e of errLines) L.push("  " + e);
      }
      if (logTail) L.push("", "---- 编译日志尾部 ----", logTail);
      if (!killed && code === 0 && pdfNew)
        L.push("", "提示: 若有交叉引用/目录变化，再编译一次即可全部解析（或把编译引擎设为 latexmk 自动多轮）。");
      resolve(L.join("\n"));
    });
  });
}

/* ------------------------------------------------------------------ */
/* 导出（v0.8.4）：把 .tex 变成「能拿出去」的产物                        */
/* ------------------------------------------------------------------ */

/* 落点：same=文档旁（默认）/ desktop / downloads / documents */
function exportDir(dest, file) {
  const d = String(dest || "same").toLowerCase();
  const home = os.homedir();
  if (d === "desktop") return path.join(home, "Desktop");
  if (d === "downloads") return path.join(home, "Downloads");
  if (d === "documents") return path.join(home, "Documents");
  return path.dirname(file);
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {}
}

function statSize(p) {
  try {
    return fs.statSync(p).size;
  } catch (e) {
    return 0;
  }
}

function mtimeOf(p) {
  try {
    return fs.statSync(p).mtimeMs;
  } catch (e) {
    return 0;
  }
}

/** 导出 PDF：编译（除非产物已比 .tex 新）→ 必要时复制到目标目录 */
function exportPdf(file, args) {
  const base = path.basename(file).replace(/\.tex$/i, "");
  const pdfNative = path.join(path.dirname(file), base + ".pdf");
  const upToDate = mtimeOf(pdfNative) > 0 && mtimeOf(pdfNative) >= mtimeOf(file);
  const mustCompile = args.force === true || !upToDate;
  return (mustCompile ? compileTex(file) : Promise.resolve("")).then((logText) => {
    if (!fs.existsSync(pdfNative)) {
      return JSON.stringify({
        ok: false,
        format: "pdf",
        message: "没有生成 PDF（看看下面的编译日志：多半是 TeX 引擎没装或源码有错）",
        log: logText || "",
      });
    }
    let outPath = pdfNative;
    const explicit = String(args.out || "").trim();
    const destDir = explicit ? path.dirname(path.resolve(explicit)) : exportDir(args.dest, file);
    const destName = explicit ? path.basename(path.resolve(explicit)) : base + ".pdf";
    if (path.resolve(destDir) !== path.resolve(path.dirname(file))) {
      ensureDir(destDir);
      const t = path.join(destDir, destName);
      try {
        fs.copyFileSync(pdfNative, t);
        outPath = t;
      } catch (e) {
        return JSON.stringify({ ok: false, format: "pdf", message: "复制到 " + t + " 失败：" + e.message, log: logText || "" });
      }
    }
    return JSON.stringify({
      ok: true,
      format: "pdf",
      outPath: outPath,
      bytes: statSize(outPath),
      reused: !mustCompile,
      sourcePath: pdfNative,
      log: logText || "",
    });
  });
}

/** 导出 HTML：正文用面板渲染好的那份（KaTeX 已排版）或服务端内核兜底 */
function exportHtml(file, args) {
  const base = path.basename(file).replace(/\.tex$/i, "");
  let source = "";
  try {
    source = fs.readFileSync(file, "utf8");
  } catch (e) {
    source = "";
  }
  let body = "";
  let from = "editor";
  if (typeof args.body === "string" && args.body.trim()) {
    body = args.body;
  } else {
    from = "server";
    body = EXPORT.buildBodyHtml(source, path.dirname(file));
  }
  const inl = EXPORT.inlineImages(body);
  const usesKatex = /class="katex/.test(inl.html);
  const doc = EXPORT.buildDoc({
    title: String(args.title || "").trim() || EXPORT.guessTitle(source) || base,
    lang: process.env.NOTRAT_LOCALE === "en" ? "en" : "zh-CN",
    bodyHtml: inl.html,
    katexCss: usesKatex ? EXPORT.loadKatexCss(__dirname) : "",
  });
  const explicit = String(args.out || "").trim();
  const targetDir = explicit ? path.dirname(path.resolve(explicit)) : exportDir(args.dest, file);
  const outPath = explicit ? path.resolve(explicit) : path.join(targetDir, base + ".html");
  try {
    ensureDir(path.dirname(outPath));
    fs.writeFileSync(outPath, doc, "utf8");
  } catch (e) {
    return JSON.stringify({ ok: false, format: "html", message: "写入 " + outPath + " 失败：" + e.message });
  }
  return JSON.stringify({
    ok: true,
    format: "html",
    outPath: outPath,
    bytes: statSize(outPath),
    from: from,
    math: usesKatex ? "katex" : "mini",
    images: { inlined: inl.inlined.length, missing: inl.missing },
    theme: "light",
  });
}

/* ------------------------------------------------------------------ */
/* MCP JSON-RPC                                                         */
/* ------------------------------------------------------------------ */

const WS_PARAM = {
  workspace: { type: "string", description: "（宿主自动注入，无需填写）当前工作区路径" },
};

const TOOLS = [
  {
    name: "latex_parse",
    description:
      "解析 LaTeX (.tex) 文件结构：文档类/宏包/标题作者、章节大纲、label 标签、\\ref/\\eqref 交叉引用（标注未定义）、\\cite 文献引用（对照 .bib）、图表公式数量、中英文字数统计、TODO/FIXME 注释清单。path 省略时自动在工作区发现主 .tex。",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: ".tex 文件路径（绝对或相对工作区；也可传目录）" },
        format: { type: "string", enum: ["text", "json"], description: "输出格式，默认 text（json 供面板程序化消费）" },
        ...WS_PARAM,
      },
    },
  },
  {
    name: "latex_validate",
    description:
      "校验 LaTeX 文件：重复 label、未定义的 \\ref/\\eqref、.bib 中缺失的 \\cite、\\begin/\\end 环境配对错误，并列出 TODO/FIXME。按行号输出错误/警告/提示清单。",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: ".tex 文件路径（绝对或相对工作区；也可传目录）" },
        format: { type: "string", enum: ["text", "json"], description: "输出格式，默认 text" },
        ...WS_PARAM,
      },
    },
  },
  {
    name: "latex_compile",
    description:
      "用本机 TeX 引擎编译 .tex 生成 PDF（默认 xelatex，可在插件设置更换；引擎需已安装）。返回退出码、PDF 产物路径、错误行与日志尾部。",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: ".tex 文件路径（绝对或相对工作区）" },
        ...WS_PARAM,
      },
    },
  },
  {
    name: "latex_export",
    description:
      "把 .tex 导出为可交付产物：format=pdf 用本机 TeX 引擎编译成 PDF（产物比 .tex 新则直接复用，force=true 强制重编）；format=html 生成自包含 HTML（公式已排版、图片内嵌 dataURI、含 A4 打印样式，离线可看、可直接分享）。产物默认落在 .tex 同目录，dest 换目录（desktop/downloads/documents），或用 out 指定完整路径。返回 JSON：{ok, format, outPath, bytes, reused|images, log}。",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: ".tex 文件路径（绝对或相对工作区）" },
        format: { type: "string", enum: ["pdf", "html"], description: "产物格式：pdf(编译) / html(自包含网页)" },
        dest: { type: "string", enum: ["same", "desktop", "downloads", "documents"], description: "落点：same=文档旁（默认）/ desktop / downloads / documents" },
        out: { type: "string", description: "显式产物路径（给了它就忽略 dest）" },
        force: { type: "boolean", description: "PDF：无视新鲜度检查，强制重新编译" },
        body: { type: "string", description: "（面板传入，无需手填）编辑器已渲染好的正文 HTML；不传则服务端内核渲染" },
        title: { type: "string", description: "导出页标题（不传则从 \\title{} 猜）" },
        ...WS_PARAM,
      },
    },
  },
  {
    name: "latex_asset",
    description:
      "插件内部资产工具：name=katex 返回离线 KaTeX 渲染包（JS+CSS，字体已内嵌）；path=<图片路径> 返回图片 dataURI（预览插图用；png/jpg/gif/svg/webp/bmp 直读，pdf/eps 用本机 Ghostscript/pdftoppm 栅格化成 PNG——结果缓存在系统临时目录，转不动则报错由前端退回占位符）；path=<.tex 文件> 返回 {text, mtime, size}（预览多文件展开用，512KB 封顶）。一般不直接调用。",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "资产名：katex" },
        path: { type: "string", description: "图片文件路径（png/jpg/jpeg/gif/svg/webp/bmp）" },
        ...WS_PARAM,
      },
    },
  },
  {
    name: "latex_outline",
    description:
      "输出文档大纲（章节树 + 自动编号 + 源文件行号）。面板/AI 调用（带 path）返回 list 行协议文本（[ ] #行号 编号 标题）；宿主内置大纲调用（只带 filePath，无 path）返回条目数组 [{ text, level, anchor }]，供宿主大纲面板逐条渲染与点击跳转。path 省略时自动发现主 .tex。",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: ".tex 文件路径（绝对或相对工作区；也可传目录）" },
        filePath: { type: "string", description: "（宿主内置大纲自动注入，无需填写）当前 .tex 的完整路径" },
        fileName: { type: "string", description: "（宿主内置大纲自动注入，无需填写）当前 .tex 的文件名" },
        format: { type: "string", enum: ["text", "outline"], description: "text=list 行协议（面板/AI 用，默认）；outline=宿主大纲契约（条目数组 [{text,level,anchor}]）" },
        depth: { type: "number", description: "大纲深度：0=仅部分/章 1=到节 2=到小节 3=到小小节（默认取插件设置 outlineDepth）" },
        ...WS_PARAM,
      },
    },
  },
  {
    name: "latex_status",
    description:
      "输出一行紧凑状态摘要：文件名 · 章节数 · 公式/图/表/引用数 · 中英文字数 · 错误与警告数。供状态栏徽章、编辑器顶部控制带显示。",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: ".tex 文件路径（可省略，自动发现主文件）" },
        ...WS_PARAM,
      },
    },
  },
  {
    name: "latex_env",
    description:
      "探测本机 TeX 引擎（只查文件在不在，不编译、不写盘）：返回 JSON {ok, engine, exe, tried, fellBack, installHint, ms}。ok=false 表示没找到任何引擎——此时**只有「编译 / 导出 PDF」不可用**，编辑 / 大纲 / 引用校验 / 公式预览 / 导出 HTML 全都不受影响。action=ack 记下「用户已知晓」（不再提示）；action=reset 清缓存重新探测（刚装完引擎时用）。",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["probe", "ack", "reset"], description: "probe=探测（默认）/ ack=记住已提示 / reset=清缓存重探" },
        ...WS_PARAM,
      },
    },
  },
  {
    name: "latex_backup",
    description:
      "把 .tex 源码快照到同目录 .latex-history/（内容与最近一份一致时不重复快照，超出保留数自动清理）。由 toolHooks 在每次编译前自动调用，也可手动 /latex-backup 留存版本。",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: ".tex 文件路径（可省略，自动发现主文件）" },
        ...WS_PARAM,
      },
    },
  },
  {
    name: "latex_history",
    description:
      "源码快照历史：action=list 列出 .latex-history/ 里的快照（行协议）；action=restore + stamp=时间戳 恢复到指定快照（恢复前会先把当前内容另存一份，可再回退）。",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: ".tex 文件路径（可省略，自动发现主文件）" },
        action: { type: "string", enum: ["list", "restore"], description: "默认 list 列快照；restore 恢复" },
        stamp: { type: "string", description: "restore 时的快照时间戳，形如 20250922-140312；省略则取最新" },
        limit: { type: "number", description: "list 时最多显示几条（默认 15）" },
        ...WS_PARAM,
      },
    },
  },
];

async function handleToolCall(name, args) {
  const ws = args.workspace || "";
  if (name === "latex_parse") {
    const input = args.path || args.filePath;
    const file = resolveInput(input, ws);
    if (!file) throw new Error(`未找到 .tex 文件（输入: ${input || "(自动发现)"}，工作区: ${ws || "无"}）`);
    const res = parseTex(file);
    const val = validateTex(file);
    if (args.format === "json") {
      const { envSeq, ...clean } = res;
      return JSON.stringify({ ...clean, summary: val.summary });
    }
    return fmtParse(res, val);
  }
  if (name === "latex_validate") {
    const input = args.path || args.filePath;
    const file = resolveInput(input, ws);
    if (!file) throw new Error(`未找到 .tex 文件（输入: ${input || "(自动发现)"}，工作区: ${ws || "无"}）`);
    const val = validateTex(file);
    return args.format === "json" ? JSON.stringify(val) : fmtValidate(val);
  }
  if (name === "latex_compile") {
    const input = args.path || args.filePath;
    const file = resolveInput(input, ws);
    if (!file) throw new Error(`未找到 .tex 文件（输入: ${input || "(自动发现)"}，工作区: ${ws || "无"}）`);
    return compileTex(file);
  }
  if (name === "latex_export") {
    const input = args.path || args.filePath;
    const file = resolveInput(input, ws);
    if (!file) throw new Error(`未找到 .tex 文件（输入: ${input || "(自动发现)"}，工作区: ${ws || "无"}）`);
    const format = String(args.format || "pdf").toLowerCase();
    if (format === "pdf") return exportPdf(file, args);
    if (format === "html" || format === "htm") return exportHtml(file, args);
    throw new Error(`latex_export 的 format 只支持 pdf / html（收到 "${format}"）`);
  }
  if (name === "latex_asset") {
    if (args.name === "katex") {
      try {
        const A = require("./assets-katex.json");
        return JSON.stringify(A);
      } catch (e) {
        return JSON.stringify({ js: "", css: "" });
      }
    }
    if (args.path) {
      const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp", ".bmp": "image/bmp" };
      /* v0.9.0：无扩展名（\includegraphics 的 LaTeX 习惯）时 resolveInput 会因
       * statSync 失败直接判 null —— 候选补扩展名必须赶在它前面自己做绝对化。 */
      let abs = String(args.path || args.filePath || "").trim().replace(/^["']|["']$/g, "");
      if (!abs) throw new Error("latex_asset 需要 path");
      if (!path.isAbsolute(abs)) {
        const root = workspaceRoot(ws);
        abs = root ? path.join(root, abs) : path.resolve(abs);
      }
      let file = abs;
      let st0 = null;
      try { st0 = fs.statSync(abs); } catch {}
      if (!st0 || !st0.isFile()) {
        const extRaw = path.extname(abs).toLowerCase();
        if (!extRaw || !MIME[extRaw]) {
          const cands = [".tex", ".pdf", ".eps", ".png", ".jpg", ".jpeg"]; /* v0.9.1: +.tex（\input 的 TeX 习惯） */
          let hit = "";
          for (const c of cands) {
            try { if (fs.statSync(abs + c).isFile()) { hit = abs + c; break; } } catch {}
          }
          if (hit) file = hit;
          else throw new Error("文件不存在: " + args.path + "（试过 " + cands.join("/") + "）");
        } else throw new Error("文件不存在: " + args.path);
      }
      const ext = path.extname(file).toLowerCase();
      /* v0.9.1：.tex 子文件 → 返回文本 + mtime（预览的多文件展开通道；512KB 封顶） */
      if (ext === ".tex") {
        const stx = fs.statSync(file);
        if (stx.size > 512 * 1024) throw new Error("子文件过大（>512KB），预览不展开");
        return JSON.stringify({ text: fs.readFileSync(file, "utf8"), mtime: Math.round(stx.mtimeMs), size: stx.size });
      }
      /* v0.9.0：pdf/eps → 栅格化成 PNG（mgs/gs/pdftoppm + tmpdir 磁盘缓存）；
       * 抛错让前端退回占位符，不影响预览主流程。 */
      const RASTER = require("./pdf-raster.js");
      const rasterOut = function (pdfFile) {
        return RASTER.rasterPdf(pdfFile).then(function (rr) {
          if (rr.buf.length > 8 * 1024 * 1024) throw new Error("栅格化 PNG 过大（>8MB）");
          return JSON.stringify({
            dataUri: "data:image/png;base64," + rr.buf.toString("base64"),
            raster: { tool: rr.tool, via: rr.via, dpi: rr.dpi, cached: rr.cached, ms: rr.ms },
          });
        });
      };
      const readImage = function (f, e2) {
        const buf = fs.readFileSync(f);
        if (buf.length > 8 * 1024 * 1024) throw new Error("图片过大（>8MB）");
        return JSON.stringify({ dataUri: "data:" + MIME[e2] + ";base64," + buf.toString("base64") });
      };
      if (ext === ".pdf" || ext === ".eps") return rasterOut(file);
      if (!MIME[ext]) throw new Error("仅支持图片: " + Object.keys(MIME).join(" ") + "（pdf/eps 自动栅格化；无扩展名自动补全）");
      return readImage(file, ext);
    }
    throw new Error("latex_asset 需要 name=katex 或 path=<图片路径>");
  }
  if (name === "latex_outline") {
    const input = args.path || args.filePath;
    const file = resolveInput(input, ws);
    if (!file) throw new Error(`未找到 .tex 文件（输入: ${input || "(自动发现)"}，工作区: ${ws || "无"}）`);
    const depth =
      args.depth === undefined || args.depth === null
        ? CONTRIB.envNum("LATEX_OUTLINE_DEPTH", 2)
        : Number(args.depth);
    // 宿主内置大纲（editors[].outlineTool）只传 filePath/fileName，不带 path/format。
    // ⚠ v0.6.2 起该通路返回**单条 JSON 字符串**（outlineHostPayload）：
    //   宿主 1.3.3+ 的 parseItems 先用 extractToolText 把 content[].text 拍平，
    //   挂在内容块上的 level/anchor 会被丢掉 ⇒ 层级全平 + 点击锚点退化成标题文本 ⇒ 跳第 1 行。
    //   返回 JSON 字符串则被 JSON.parse 认下，走 mapItemArray，level/anchor 完整保住。
    // ⚠ 该通路必须返回「一条一项的 content 数组」，不能返回多行字符串：
    //   宿主的 parseItems 会把 result.content 当【条目数组】读，多行字符串只会塌成 1 条，
    //   再被宿主条目样式 whitespace-nowrap+truncate 压成一行（v0.5.3 修）。
    // 面板显式调用（带 path）走 list 行协议，两条通路互不影响。
    const wantHost = args.format === "outline" || (!args.path && !!args.filePath);
    const res = parseTex(file);
    return wantHost ? CONTRIB.outlineHostPayload(res, depth) : CONTRIB.outlineProtocol(res, depth);
  }
  if (name === "latex_status") {
    const input = args.path || args.filePath;
    const file = resolveInput(input, ws);
    if (!file) throw new Error(`未找到 .tex 文件（输入: ${input || "(自动发现)"}，工作区: ${ws || "无"}）`);
    return CONTRIB.statusLine(parseTex(file), validateTex(file));
  }
  if (name === "latex_env") {
    /* 引擎状态跟具体文件无关：没打开任何 .tex 也该问得到 —— 所以不复用 latex_status
     * （那条路会 resolveInput 找文件，找不到直接抛错）。 */
    const action = String(args.action || "probe").toLowerCase();
    if (action === "ack") return JSON.stringify({ ok: true, ack: CONTRIB.ackEngineNotice() });
    const force = action === "reset";
    if (force) CONTRIB.resetEngineCache();
    const info = CONTRIB.probeEngine(CONTRIB.envReal("LATEX_COMPILER"), resolveCompiler, { force: force });
    return JSON.stringify(Object.assign({ ack: CONTRIB.engineNoticeAck() }, info));
  }
  if (name === "latex_backup") {
    // 该工具同时作为编译前 toolHook：任何情况都不抛错，避免把编译挡下来
    try {
      if (CONTRIB.envOff("LATEX_BACKUP")) return "编译前快照已在设置中关闭（backup = off）。";
      const file = resolveInput(args.path || args.filePath, ws);
      if (!file) return "未定位到 .tex 文件，本次不生成快照。";
      return CONTRIB.backupTex(file, CONTRIB.envNum("LATEX_HISTORY_KEEP", 20)).message;
    } catch (e) {
      return "本次未生成快照: " + ((e && e.message) || String(e));
    }
  }
  if (name === "latex_history") {
    const input = args.path || args.filePath;
    const file = resolveInput(input, ws);
    if (!file) throw new Error(`未找到 .tex 文件（输入: ${input || "(自动发现)"}，工作区: ${ws || "无"}）`);
    if (args.action === "restore") {
      const r = CONTRIB.restoreSnapshot(file, args.stamp);
      if (!r.ok) return "❌ " + r.message;
      return "♻️ 已恢复到快照 " + r.from + "（恢复前的版本另存为 " + (r.safety || "-") + "，可再次回退）。若在编辑器中打开，请重新打开该文件以载入磁盘内容。";
    }
    return CONTRIB.historyProtocol(file, args.limit);
  }
  throw new Error(`未知工具: ${name}`);
}

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}
function respond(id, result) {
  if (id !== undefined && id !== null) send({ jsonrpc: "2.0", id, result });
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on("line", (line) => {
  const s = line.trim();
  if (!s) return;
  let req;
  try {
    req = JSON.parse(s);
  } catch {
    return;
  }
  const { id, method, params } = req;
  try {
    if (method === "initialize")
      return respond(id, {
        protocolVersion: (params && params.protocolVersion) || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "notrat-latex", version: VERSION },
      });
    if (method === "ping") return respond(id, {});
    if (method === "tools/list") return respond(id, { tools: TOOLS });
    if (method === "tools/call") {
      const { name, arguments: targs } = params || {};
      handleToolCall(name, targs || {})
        .then((out) =>
          respond(id, {
            // 工具可返回「已组装好的 content 数组」（如宿主大纲契约），此时原样透传；
            // 返回字符串则按 MCP 常规包成单条 text content。
            content: Array.isArray(out) ? out : [{ type: "text", text: String(out) }],
          })
        )
        .catch((e) =>
          respond(id, { content: [{ type: "text", text: "❌ " + ((e && e.message) || String(e)) }], isError: true })
        );
      return;
    }
    if (method && /^notifications\//.test(method)) return; // 通知不回包
    if (id !== undefined && id !== null) return respond(id, {});
  } catch (e) {
    log("handler error:", e.stack || e);
    respond(id, { content: [{ type: "text", text: "❌ server 内部错误: " + e.message }], isError: true });
  }
});

rl.on("close", () => process.exit(0));
process.on("uncaughtException", (e) => log("uncaught:", (e && e.stack) || e));
log(`ready v${VERSION} (plugin=${PLUGIN_ID}, workspace=${process.env.NOTRAT_WORKSPACE || "-"})`);
