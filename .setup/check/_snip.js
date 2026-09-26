#!/usr/bin/env node
/* 在真 renderer bundle 里按 pattern 抠上下文片段（bundle 是压过行的，直接 grep 没上下文）。
 * 用法: node .setup/check/_snip.js <pattern> [before] [after] [maxHits]
 */
const fs = require('fs');
const path = require('path');

const pat = process.argv[2];
const before = Number(process.argv[3] || 300);
const after = Number(process.argv[4] || 700);
const maxHits = Number(process.argv[5] || 4);

const SNAP = path.join(__dirname, '..', 'live');
let file = process.argv[6];
if (!file) {
  const cands = fs.readdirSync(SNAP).filter((f) => /\.js$/.test(f));
  file = path.join(SNAP, cands.sort((a, b) => fs.statSync(path.join(SNAP, b)).mtimeMs - fs.statSync(path.join(SNAP, a)).mtimeMs)[0]);
}
const src = fs.readFileSync(file, 'utf8');
console.log('file = ' + file + '  (' + src.length + ' chars)');
console.log('pattern = ' + JSON.stringify(pat) + '\n');

let i = -1, n = 0;
const seen = new Set();
while ((i = src.indexOf(pat, i + 1)) >= 0) {
  if (n >= maxHits) break;
  const s = Math.max(0, i - before);
  const e = Math.min(src.length, i + pat.length + after);
  const key = Math.floor(i / 200);
  if (seen.has(key)) continue;
  seen.add(key);
  n++;
  console.log('──────── hit #' + n + ' @' + i + ' ────────');
  console.log((s > 0 ? '…' : '') + src.slice(s, e).replace(/\n/g, '\\n') + (e < src.length ? '…' : ''));
  console.log();
}
if (!n) console.log('(no hit)');
