#!/usr/bin/env node
/**
 * 极简 asar 读取器（零依赖）：
 *   node .setup/asar.js list  <asar> [子串过滤]
 *   node .setup/asar.js cat   <asar> <内部路径>            # 打印源码
 *   node .setup/asar.js grep  <asar> <关键字> [扩展名] [最大命中行数]
 *   node .setup/asar.js save  <asar> <内部路径> <输出文件>
 */
const fs = require('fs');
const path = require('path');

function parseHeaderJson(headerBuf) {
  const raw = headerBuf.slice(4).toString('utf8');
  const start = raw.indexOf('{');
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) throw new Error('asar 头部解析失败');
  return JSON.parse(raw.slice(start, end + 1));
}

function readArchive(archive) {
  const fd = fs.openSync(archive, 'r');
  const sizeBuf = Buffer.alloc(8);
  fs.readSync(fd, sizeBuf, 0, 8, 0);
  const headerSize = sizeBuf.readUInt32LE(4);
  const headerBuf = Buffer.alloc(headerSize);
  fs.readSync(fd, headerBuf, 0, headerSize, 8);
  const header = parseHeaderJson(headerBuf);
  const contentBase = 8 + headerSize;
  const files = [];
  (function walk(node, prefix) {
    for (const [name, entry] of Object.entries(node.files || {})) {
      const p = prefix ? prefix + '/' + name : name;
      if (entry.files) walk(entry, p);
      else if (typeof entry.offset === 'string') {
        files.push({ path: p, offset: Number(entry.offset), size: entry.size, unpacked: !!entry.unpacked });
      }
    }
  })(header, '');
  return { fd, contentBase, files, archive };
}

function readEntry(a, entry) {
  if (entry.unpacked) {
    return fs.readFileSync(path.join(a.archive + '.unpacked', entry.path));
  }
  const buf = Buffer.alloc(entry.size);
  fs.readSync(a.fd, buf, 0, entry.size, a.contentBase + entry.offset);
  return buf;
}

const [cmd, archive, ...rest] = process.argv.slice(2);
if (!cmd || !archive) {
  console.error('用法: node .setup/asar.js <list|cat|grep|save> <asar> [参数...]');
  process.exit(1);
}
const a = readArchive(archive);

if (cmd === 'list') {
  const filter = rest[0];
  const hits = a.files.filter(f => !filter || f.path.includes(filter));
  for (const f of hits.slice(0, 200)) console.log(String(f.size).padStart(9), f.path);
  console.log('--- 共', hits.length, '/', a.files.length, '个文件');
} else if (cmd === 'cat') {
  const entry = a.files.find(f => f.path === rest[0]) || a.files.find(f => f.path.endsWith(rest[0]));
  if (!entry) { console.error('未找到:', rest[0]); process.exit(2); }
  process.stdout.write(readEntry(a, entry));
} else if (cmd === 'save') {
  const entry = a.files.find(f => f.path === rest[0]) || a.files.find(f => f.path.endsWith(rest[0]));
  if (!entry) { console.error('未找到:', rest[0]); process.exit(2); }
  fs.mkdirSync(path.dirname(rest[1]), { recursive: true });
  fs.writeFileSync(rest[1], readEntry(a, entry));
  console.log('已写出', rest[1], entry.size, '字节');
} else if (cmd === 'grep') {
  const kw = rest[0];
  const extFilter = rest[1] || '.js,.ts,.tsx';
  const maxHits = Number(rest[2] || 40);
  const exts = extFilter.split(',');
  let hits = 0, printed = 0;
  for (const f of a.files) {
    if (f.size > (Number(process.env.ASAR_MAXMB || 64) * 1024 * 1024)) continue;
    if (exts.length && !exts.some(e => f.path.endsWith(e))) continue;
    let text;
    try { text = readEntry(a, f).toString('utf8'); } catch { continue; }
    if (!text.includes(kw)) continue;
    hits++;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes(kw)) continue;
      if (printed++ >= maxHits) continue;
      console.log(`${f.path}:${i + 1}: ${lines[i].trim().slice(0, 220)}`);
    }
  }
  console.log('--- 命中文件数:', hits, '（已打印前', Math.min(printed, maxHits), '行）');
} else {
  console.error('未知命令:', cmd);
  process.exit(1);
}
