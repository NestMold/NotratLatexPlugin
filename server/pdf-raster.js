"use strict";
/* =====================================================================
 * v0.9.0 PDF/EPS 插图栅格化（预览 & 导出 HTML 用）
 *
 * 预览内核（preview-core）是双端零依赖的，不能在这儿做进程/文件系统的事；
 * 所以转换放在服务端：latex_asset / export-html 调用本模块，把
 * figs/*.pdf 用本机工具转成 PNG（磁盘缓存），转不动就抛错——
 * 由上层退回「编译 PDF 后可见」占位符，绝不阻塞渲染主流程。
 *
 * 工具优先级：LATEX_RASTER_EXE（显式指定）→ mgs（MiKTeX 自带 GS）
 *   → gswin64c / gswin32c（Ghostscript 独立安装）→ pdftoppm（poppler）。
 * 只取第 1 页 —— \includegraphics 本来就只排一页。
 * 缓存：os.tmpdir()/notrat-latex-pdf-raster/<sha1(绝对路径|mtime|dpi)>.png，
 *   源 PDF 一改（mtime 变）自动失效，不污染工作区。
 * 失败负缓存（进程内存）：同一次会话里不再对同一个坏文件反复起进程。
 * =================================================================== */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");

const CACHE_DIR = path.join(os.tmpdir(), "notrat-latex-pdf-raster");

function envInt(name, dflt) {
  const n = parseInt(process.env[name] || "", 10);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}
function rasterDpi() { return Math.min(Math.max(envInt("LATEX_RASTER_DPI", 150), 36), 600); }
function rasterTimeout() { return envInt("LATEX_RASTER_TIMEOUT", 20) * 1000; }

/* ---------- 工具探测（结果进程内缓存，只探一次） ---------- */
let toolCache = null; // { exe, kind: "gs"|"pdftoppm", via } | null

function candDirs() {
  const lc = process.env.LOCALAPPDATA || "";
  const pf = process.env.ProgramFiles || "C:\\Program Files";
  const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const dirs = [
    path.join(pf, "MiKTeX", "miktex", "bin", "x64"),
    path.join(pf, "MiKTeX", "miktex", "bin"),
    path.join(lc, "Programs", "MiKTeX", "miktex", "bin", "x64"),
    path.join(pf86, "MiKTeX", "miktex", "bin"),
  ];
  // 独立 Ghostscript：C:\Program Files\gs\gs<ver>\bin
  for (const root of [pf, pf86]) {
    const gsRoot = path.join(root, "gs");
    try {
      for (const e of fs.readdirSync(gsRoot)) {
        if (/^gs\d/.test(e)) dirs.push(path.join(gsRoot, e, "bin"));
      }
    } catch {}
  }
  return dirs;
}

function exeWorks(exe, kind) {
  // gs -v / pdftoppm -v 都会立刻打印版本并退出；跑不动就当没有
  const args = kind === "gs" ? ["-q", "--version"] : ["-v"];
  try {
    const r = spawnSync(exe, args, { timeout: 8000, windowsHide: true });
    return !r.error && r.status === 0;
  } catch {
    return false;
  }
}

function resolveRasterTool() {
  if (toolCache !== null) return toolCache;
  toolCache = false; // 先假设没有，探到再改写
  const forced = (process.env.LATEX_RASTER_EXE || "").trim();
  if (forced) {
    let exe = forced;
    if (!path.isAbsolute(exe)) {
      // 相对名 → 候选目录里找
      for (const d of candDirs()) {
        const c = path.join(d, exe + (/\.[a-z]+$/i.test(exe) ? "" : ".exe"));
        if (fs.existsSync(c)) { exe = c; break; }
      }
    }
    if (fs.existsSync(exe) && exeWorks(exe, /pdftoppm/i.test(path.basename(exe)) ? "pdftoppm" : "gs")) {
      toolCache = { exe, kind: /pdftoppm/i.test(path.basename(exe)) ? "pdftoppm" : "gs", via: "LATEX_RASTER_EXE" };
    }
    return toolCache;
  }
  const names = [
    { n: "mgs", kind: "gs" },
    { n: "gswin64c", kind: "gs" },
    { n: "gswin32c", kind: "gs" },
    { n: "pdftoppm", kind: "pdftoppm" },
  ];
  for (const { n, kind } of names) {
    // ① PATH 里直接能跑（CreateProcess 自会补 .exe）
    if (exeWorks(n, kind)) { toolCache = { exe: n, kind, via: "PATH:" + n }; return toolCache; }
    // ② 常见安装目录
    for (const d of candDirs()) {
      const c = path.join(d, n + ".exe");
      if (fs.existsSync(c) && exeWorks(c, kind)) { toolCache = { exe: c, kind, via: c }; return toolCache; }
    }
  }
  return toolCache;
}

/* ---------- 缓存键：绝对路径 + mtime + dpi（源文件一改即失效） ---------- */
function cachePathFor(absFile, dpi) {
  let mt = "0";
  try { mt = String(Math.round(fs.statSync(absFile).mtimeMs)); } catch {}
  const key = crypto.createHash("sha1").update(absFile + "|" + mt + "|" + dpi + "|v1").digest("hex");
  return path.join(CACHE_DIR, key + ".png");
}

/* ---------- 负缓存 & 在途去重（同一坏文件不打爆进程表） ---------- */
const failedCache = new Map(); // "abs|mtime|dpi" → true
const inflight = new Map();    // "abs|mtime|dpi" → Promise

function gsArgs(exeKind, pdf, pngOut, dpi) {
  if (exeKind === "gs") {
    return ["-dNOPAUSE", "-dBATCH", "-dSAFER", "-sDEVICE=png16m", "-r" + dpi,
      "-dFirstPage=1", "-dLastPage=1", "-dEPSCrop", "-sOutputFile=" + pngOut, pdf];
  }
  // pdftoppm -singlefile：输出恰好是 pngOut（不带 -1 序号后缀）
  const prefix = pngOut.replace(/\.png$/i, "");
  return ["-png", "-r" + dpi, "-f", "1", "-l", "1", "-singlefile", pdf, prefix];
}

function spawnTool(exe, args, timeout) {
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawn(exe, args, { windowsHide: true }); } catch (e) { return reject(e); }
    let err = "";
    let done = false;
    const killer = setTimeout(function () {
      err += "\n(超时 " + Math.round(timeout / 1000) + "s，已终止)";
      try { child.kill(); } catch {}
    }, timeout);
    child.stderr && child.stderr.on("data", (d) => { if (err.length < 4000) err += String(d); });
    child.on("error", (e) => { if (!done) { done = true; clearTimeout(killer); reject(e); } });
    child.on("close", (code) => {
      if (done) return;
      done = true; clearTimeout(killer);
      if (code === 0) resolve();
      else reject(new Error("退出码 " + code + (err ? "：" + err.trim().slice(-500) : "")));
    });
  });
}

/**
 * 把 PDF/EPS 第 1 页栅格化成 PNG。
 * @returns Promise<{buf:Buffer, cached:boolean, tool:string, via:string, dpi:number, ms:number}>
 * @throws 找不到工具 / 文件不存在 / 转换失败 —— 调用方负责退回占位符
 */
async function rasterPdf(pdfPath, opts) {
  const dpi = (opts && opts.dpi) || rasterDpi();
  const timeout = (opts && opts.timeout) || rasterTimeout();
  const t0 = Date.now();
  let st;
  try { st = fs.statSync(pdfPath); } catch { throw new Error("文件不存在: " + pdfPath); }
  if (!st.isFile() || st.size === 0) throw new Error("文件为空: " + pdfPath);
  const nk = pdfPath + "|" + Math.round(st.mtimeMs) + "|" + dpi;
  if (failedCache.has(nk)) throw new Error("此前转换已失败（负缓存命中）");

  // ① 磁盘缓存命中 → 直接回
  const png = cachePathFor(pdfPath, dpi);
  try {
    const buf = fs.readFileSync(png);
    if (buf.length > 0) return { buf, cached: true, tool: "cache", via: png, dpi, ms: Date.now() - t0 };
  } catch {}

  // ② 找工具
  const tool = resolveRasterTool();
  if (!tool) throw new Error("本机没有可用的 PDF 栅格化工具（试过 mgs / gswin64c / gswin32c / pdftoppm；可用 LATEX_RASTER_EXE 指定）");

  // ③ 在途去重：同一张图同时只转一次
  const existing = inflight.get(nk);
  if (existing) return existing;

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const p = spawnTool(tool.exe, gsArgs(tool.kind, pdfPath, png, dpi), timeout).then(function () {
    const buf = fs.readFileSync(png);
    if (!buf.length) throw new Error("工具没写出 PNG");
    return { buf, cached: false, tool: tool.kind, via: tool.via, dpi, ms: Date.now() - t0 };
  }).catch(function (e) {
    try { fs.unlinkSync(png); } catch {}
    failedCache.set(nk, true);
    throw new Error("栅格化失败（" + path.basename(pdfPath) + "）: " + (e && e.message || e));
  }).finally(function () { inflight.delete(nk); });
  inflight.set(nk, p);
  return p;
}

/** 同步版：导出 HTML（inlineImages）用。参数同上；opts.maxBytes 超限抛错。 */
function rasterPdfSync(pdfPath, opts) {
  const dpi = (opts && opts.dpi) || rasterDpi();
  const timeout = (opts && opts.timeout) || rasterTimeout();
  let st;
  try { st = fs.statSync(pdfPath); } catch { throw new Error("文件不存在: " + pdfPath); }
  if (!st.isFile() || st.size === 0) throw new Error("文件为空: " + pdfPath);
  const nk = pdfPath + "|" + Math.round(st.mtimeMs) + "|" + dpi;
  if (failedCache.has(nk)) throw new Error("此前转换已失败（负缓存命中）");

  const png = cachePathFor(pdfPath, dpi);
  let buf = null;
  let tool = null;
  try { buf = fs.readFileSync(png); } catch {}
  if (!buf || !buf.length) {
    tool = resolveRasterTool();
    if (!tool) throw new Error("本机没有可用的 PDF 栅格化工具");
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const r = spawnSync(tool.exe, gsArgs(tool.kind, pdfPath, png, dpi), { timeout, windowsHide: true });
    try { buf = fs.readFileSync(png); } catch { buf = null; }
    if (!buf || !buf.length) {
      try { fs.unlinkSync(png); } catch {}
      failedCache.set(nk, true);
      const msg = r.error ? String(r.error.message || r.error) : "退出码 " + r.status;
      throw new Error("栅格化失败（" + path.basename(pdfPath) + "）: " + msg);
    }
  }
  const maxBytes = (opts && opts.maxBytes) || 0;
  if (maxBytes && buf.length > maxBytes) throw new Error("栅格化 PNG 超过 " + Math.round(maxBytes / 1024) + "KB 上限");
  return { buf, cached: !tool, tool: tool ? tool.kind : "cache", via: tool ? tool.via : png, dpi, ms: 0 };
}

/** 给 latex_status / 诊断用：一句话说清本机栅格化能力 */
function describeTool() {
  const t = resolveRasterTool();
  return t ? t.kind + "（" + t.via + "）" : "无（占位符模式）";
}

module.exports = { rasterPdf, rasterPdfSync, describeTool, resolveRasterTool, rasterDpi, CACHE_DIR };
