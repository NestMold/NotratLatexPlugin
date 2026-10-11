"use strict";
/* =============================================================================
 * 面板内核内联 —— **唯一实现**（v0.9.14 收拢）
 *
 * 面板源（panels/*.tsx）不是成品：文件头那三行占位注释
 *     __LPC__ / __WYS__ / __TX__（各写在一个块注释里）
 * 打包时必须换成三块内核（preview-core / wysiwyg / txlog）的真身，
 * 否则面板里的 LPC.renderPreview(...) / WYS.xxx(...) / new TX.History(...)
 * 全是自由变量：编译期谁都不报错（宿主只用 TypeScript 抹语法，
 * esbuild 同样不查自由变量），运行到那一句才抛
 * `ReferenceError: TX is not defined`。
 *
 * 为什么要有这个文件（记一笔账）：
 *   同一套改写规则原来抄了三份 —— .setup/build-singlefile.js（单文件包）、
 *   .setup/release-zip.js（发行 zip）、.setup/check-v070.js（离线编译门禁）。
 *   抄三份的代价不是「多打几个字」，是真出过事：
 *     · 发行 zip 那份少了 `renderInlineHtml`，同一个面板两种包形态的内核**不一样**——
 *       zip 装的用户「行内 HTML 渲染」静默失效（面板那处有 typeof 兜底，不报错、
 *       只是不生效，正好是最难查的一类）；
 *     · 发行 zip 只把内联结果写进 manifest，**从没管过 zip 里的 panels/*.tsx**——
 *       那几个文件仍是「带占位符的构建输入」，而宿主对目录包的契约恰恰是
 *       「缺 source 时按 sourceFile 去目录里读真实文件」，读到就是它。
 *   两件事同一个根因：规则散在多处。所以收成一份，谁都别抄。
 *
 * 用法：
 *   const pack = require("./lib/panel-inline");
 *   const kernels = pack.buildKernels(ws);                  // ws = 仓库根
 *   const r = pack.inlinePanel(src, kernels, { label: "editors[..]", required: ["LPC","WYS","TX"] });
 *   r.text / r.replaced / r.missing
 * ========================================================================== */
const fs = require("fs");
const path = require("path");

/* 占位符与内核名一一对应。这里用拼字符串而不是字面量写出来，是为了让**本文件自己**
 * 不会被任何「扫占位符」的检查误命中（它就是那份检查要用的判据表）。 */
const TOKENS = {
  LPC: "/*" + "__LPC__" + "*/",
  WYS: "/*" + "__WYS__" + "*/",
  TX: "/*" + "__TX__" + "*/",
};
const NAMES = ["LPC", "WYS", "TX"];

/* 内核改写后的顶层常量名（面板里就是这么用的） */
const DEFS = {
  LPC: /^const LPC = \{ renderPreview/m,
  WYS: /^const WYS = \(function \(\) \{/m,
  TX: /^const TX = \(function \(\) \{/m,
};

/* -----------------------------------------------------------------------------
 * 从 <ws>/server 读三块内核，改写成可内联的顶层片段。
 *   preview-core：`module.exports = {...}` → `const LPC = {...}`（不包 IIFE，
 *                 它的 renderPreview / miniMath 等函数名要留在顶层给别处用）
 *   wysiwyg / txlog：`module.exports = {...}` → `return {...}`，整份包 IIFE ——
 *                 它们内部有 escHtml / readGroup / findEnvEnd 等与 preview-core
 *                 **同名**的顶层函数，两份都摊在顶层会被判「已声明」。
 * 导出对象里不得出现嵌套花括号（正则用 [^}]* 匹配）。
 * -------------------------------------------------------------------------- */
function buildKernels(ws) {
  const rd = (rel) => fs.readFileSync(path.join(ws, rel), "utf8");

  /* 导出清单必须与内核真实导出**逐字对**：漏一个名字，面板那边就是
   * `typeof f === "function"` 兜底 → 静默降级（renderInlineHtml 就这么漏过一版）。 */
  const lpcNames = "renderPreview: renderPreview, miniMath: miniMath, renderInlineHtml: renderInlineHtml";
  const coreSrc = rd("server/preview-core.js");
  const lpc = coreSrc.replace(
    /^module\.exports\s*=\s*\{[^}]*\};?[^\S\n]*$/m,
    "const LPC = { " + lpcNames + " };"
  );
  if (!DEFS.LPC.test(lpc)) {
    throw new Error("preview-core 导出语句改写失败（未找到行首的 `module.exports = {...}`）");
  }
  /* 内核自己导出的名字一个都不能少（改了 preview-core 的导出就回来看这里） */
  const exported = (coreSrc.match(/^module\.exports\s*=\s*\{([^}]*)\};?[^\S\n]*$/m) || [])[1] || "";
  for (const n of ["renderPreview", "miniMath", "renderInlineHtml"]) {
    if (!new RegExp("\\b" + n + "\\b").test(exported)) {
      throw new Error("preview-core 的导出里没有 " + n + " —— 内联常量清单要跟着改（漏了它面板只会静默降级）");
    }
  }

  const wysBody = rd("server/wysiwyg.js")
    .replace(/^module\.exports\s*=\s*\{([^}]*)\};?[^\S\n]*$/m, "return {$1};");
  if (!/^return \{/m.test(wysBody)) throw new Error("wysiwyg 导出语句改写失败（未找到行首的导出语句）");
  const wys = "const WYS = (function () {\n" + wysBody + "\n})();";

  const txBody = rd("server/txlog.js")
    .replace(/^module\.exports\s*=\s*\{([^}]*)\};?[^\S\n]*$/m, "return {$1};");
  if (!/^return \{/m.test(txBody)) throw new Error("txlog 导出语句改写失败（未找到行首的导出语句）");
  const tx = "const TX = (function () {\n" + txBody + "\n})();";

  const out = { LPC: lpc, WYS: wys, TX: tx };
  for (const n of NAMES) {
    if (!DEFS[n].test(out[n])) throw new Error(n + " 内核改写后找不到顶层定义（" + DEFS[n] + "）");
  }
  return out;
}

/** 源码里出现了哪些占位符 */
function tokensIn(src) {
  return NAMES.filter((n) => src.split(TOKENS[n]).length > 1);
}

/**
 * 把 src 里的占位符换成内核。
 * @param {object} opts
 *   label     出错信息里的名字（如 "editors[latex-editor]" / "panels/editor.tsx"）
 *   required  必须存在占位符的内核名数组；缺一个就抛（编辑器的三块内核一个都不能少）
 *   forbidModuleExports  结果里残留 module.exports 就抛（默认 true）
 * @returns {{text:string, replaced:string[], missing:string[]}}
 */
function inlinePanel(src, kernels, opts) {
  const o = opts || {};
  const label = o.label || "(未命名面板)";
  const required = o.required || [];
  const replaced = [];
  const missing = [];
  let out = src;
  for (const n of NAMES) {
    if (out.split(TOKENS[n]).length > 1) {
      out = out.split(TOKENS[n]).join(kernels[n]);
      replaced.push(n);
    } else {
      missing.push(n);
    }
  }
  for (const n of required) {
    if (replaced.indexOf(n) < 0) {
      throw new Error(label + " 缺 " + n + " 占位注释 —— 该能力会整块缺席（发行包不允许）");
    }
  }
  if (o.forbidModuleExports !== false && out.indexOf("module.exports") >= 0) {
    /* 0.3.0 事故：残留会覆盖宿主准备好的 exports → 宿主 interop 包成 {default: 对象}
     * → 面板加载报「default 应为 function，实际为 object」。 */
    throw new Error("致命：" + label + " 注入后仍含 module.exports（会覆盖宿主 exports → default 变 object）");
  }
  return { text: out, replaced: replaced, missing: missing };
}

/** 面板文件是否还需要内联（带占位符 = 是构建输入，不是成品） */
function needsInline(src) {
  return tokensIn(src).length > 0;
}

/** 内核片段里的顶层定义是否齐（判据与面板里那句用法一致） */
function hasKernelDefs(text) {
  const miss = NAMES.filter((n) => !DEFS[n].test(text));
  return { ok: miss.length === 0, missing: miss };
}


/* =============================================================================
 * 顺带的 zip 小工具
 *
 * 为什么放在这里：验收这一摊事的判据只有一个 —— **包里的字节**。
 * 「条目名对了」不等于「内容是产物」，所以打包脚本（.setup/release-zip.js）
 * 和验收层（.setup/check/v0914-panel-inline.js）都得能真把 zip 解开读字节。
 * 两份各写一个解析器的日子就到此为止（这一摊事吃的就是这个亏）。
 * ========================================================================== */

/** 中央目录里所有条目名（顺序 = 写入顺序） */
function zipEntries(buf) {
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  }
  if (e < 0) throw new Error("zip: 找不到 EOCD（不是合法 zip 缓冲？）");
  const n = buf.readUInt16LE(e + 10);
  let o = buf.readUInt32LE(e + 16);
  const out = [];
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(o) !== 0x02014b50) throw new Error("zip: 中央目录第 " + k + " 项断裂");
    const nl = buf.readUInt16LE(o + 28), el = buf.readUInt16LE(o + 30), cl = buf.readUInt16LE(o + 32);
    out.push({ name: buf.toString("utf8", o + 46, o + 46 + nl), offset: o });
    o += 46 + nl + el + cl;
  }
  return out;
}

/** 真把某个条目解出来（stored / deflate 两种都认） */
function readZipEntry(buf, want) {
  for (const ent of zipEntries(buf)) {
    if (ent.name !== want) continue;
    const o = ent.offset;
    const method = buf.readUInt16LE(o + 10);
    const csize = buf.readUInt32LE(o + 20);
    const usize = buf.readUInt32LE(o + 24);
    const nl = buf.readUInt16LE(o + 28), el = buf.readUInt16LE(o + 30);
    const lho = buf.readUInt32LE(o + 42);
    if (buf.readUInt32LE(lho) !== 0x04034b50) throw new Error("zip: " + want + " 的本地头不是 PK\\x03\\x04");
    const lnl = buf.readUInt16LE(lho + 26), lel = buf.readUInt16LE(lho + 28);
    const data = buf.subarray(lho + 30 + lnl + lel, lho + 30 + lnl + lel + csize);
    const out = method === 0 ? Buffer.from(data) : require("zlib").inflateRawSync(data);
    if (usize && out.length !== usize) {
      throw new Error("zip: " + want + " 解出 " + out.length + " 字节，中央目录说 " + usize);
    }
    return out;
  }
  throw new Error("zip: 包里没有 " + want);
}

module.exports = {
  TOKENS: TOKENS,
  NAMES: NAMES,
  DEFS: DEFS,
  buildKernels: buildKernels,
  inlinePanel: inlinePanel,
  tokensIn: tokensIn,
  needsInline: needsInline,
  hasKernelDefs: hasKernelDefs,
  zipEntries: zipEntries,
  readZipEntry: readZipEntry,
};
