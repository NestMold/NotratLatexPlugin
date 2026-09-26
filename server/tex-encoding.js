"use strict";
/**
 * Notrat LaTeX 助手 — 源码读取的编码嗅探（v0.9.4）
 *
 * 被 server/index.js 与 server/export-html.js require；单文件构建时一并复制到
 * ~/.notrat/tools/（构建脚本 build-singlefile.js 的拷贝清单里漏了它，MCP server
 * 会在 require 阶段直接起不来 —— 那不是「大纲为空」，是整个插件没反应）。
 *
 * 为什么需要它：Windows 记事本「另存为 → 编码：Unicode」存出来的是 UTF-16LE，
 * 每个 ASCII 字符后面跟一个 \x00。按 utf8 硬读时 `\section` 会变成
 * `\x00s\x00e\x00c\x00…`，正则一条也匹配不上 —— 文件本身没坏，大纲 / 章节统计 /
 * 引用校验却集体变空。用户看到的就是宿主那两行：
 *   「该文件没有大纲条目」/「latex_outline 未返回条目」。
 *
 * 判定顺序：BOM → 无 BOM 的 NUL 分布 → utf8 兜底。
 * 只读不写：任何一次读取都不改盘上的字节（要改编码请用户自己另存，插件不代劳）。
 */

const fs = require("fs");

/**
 * 解码 UTF-16。Node 只提供 utf16le，大端先逐对换字节。
 */
function decodeUtf16(buf, bigEndian) {
  if (!bigEndian) return buf.toString("utf16le");
  const n = buf.length & ~1;
  const sw = Buffer.allocUnsafe(n);
  for (let i = 0; i < n; i += 2) {
    sw[i] = buf[i + 1];
    sw[i + 1] = buf[i];
  }
  return sw.toString("utf16le");
}

/**
 * 把 .tex 的字节解成字符串。永不抛错（坏字节由 Buffer 换成 U+FFFD）。
 * GBK 文件里的中文会乱码，但命令名与括号都是 ASCII —— 章节结构照样解析得出来，
 * 所以不为了显示去动用户文件（真要修就是换个编码另存，那是用户自己的事）。
 */
function decodeTexBuffer(buf) {
  if (!buf || !buf.length) return "";

  /* 1) BOM：UTF-8 / UTF-16LE / UTF-16BE */
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.slice(3).toString("utf8");
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return decodeUtf16(buf.slice(2), false);
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return decodeUtf16(buf.slice(2), true);

  /* 2) 无 BOM：LaTeX 源码以 ASCII 为主，UTF-16 的「高字节」位置必有一个恒为 0。
         LE → 奇数位成片是 0；BE → 偶数位成片是 0。比例不够就当我们想多了，走 utf8。 */
  const probe = Math.min(buf.length, 512) & ~1;
  if (probe >= 4) {
    let evenNul = 0;
    let oddNul = 0;
    let pairs = 0;
    for (let i = 0; i < probe; i += 2) {
      pairs++;
      if (buf[i] === 0) evenNul++;
      if (buf[i + 1] === 0) oddNul++;
    }
    if (pairs && oddNul / pairs >= 0.8 && evenNul / pairs <= 0.2) return decodeUtf16(buf, false);
    if (pairs && evenNul / pairs >= 0.8 && oddNul / pairs <= 0.2) return decodeUtf16(buf, true);
  }

  /* 3) utf8 兜底 */
  return buf.toString("utf8");
}

/** 读 .tex 源码：编码嗅探 + 去 BOM 头。只读，绝不写盘。 */
function readTexSource(filePath) {
  return decodeTexBuffer(fs.readFileSync(filePath)).replace(/^\uFEFF/, "");
}

module.exports = {
  decodeTexBuffer: decodeTexBuffer,
  decodeUtf16: decodeUtf16,
  readTexSource: readTexSource,
};
