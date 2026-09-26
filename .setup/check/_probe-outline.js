#!/usr/bin/env node
/* 临时探针：直接问 MCP server 要大纲，核对 anchor 与真实行号是否一致。
 * 用法: node .setup/check/_probe-outline.js
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const SRV = path.join(__dirname, '..', '..', 'server', 'index.js');
const TEX = path.join(__dirname, '..', '..', 'samples', 'sample.tex');
const WS = path.join(__dirname, '..', '..');

const p = spawn('node', [SRV], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, NOTRAT_WORKSPACE: WS, LATEX_OUTLINE_DEPTH: '3' } });
let buf = '';
const pending = new Map();
p.stdout.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    let m; try { m = JSON.parse(line); } catch (_) { continue; }
    if (m.id != null && pending.has(m.id)) { const cb = pending.get(m.id); pending.delete(m.id); cb(m); }
  }
});
p.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
let seq = 0;
const send = (method, params) => new Promise((res) => { const id = ++seq; pending.set(id, res); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });

(async () => {
  await send('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'probe', version: '1' } });
  p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  // A) 宿主内置大纲通路
  const host = await send('tools/call', { name: 'latex_outline', arguments: { fileName: 'sample.tex', filePath: TEX } });
  console.log('\n=== A. 宿主通路 result（只带 filePath）===');
  console.log(JSON.stringify(host.result, null, 1).slice(0, 1200));

  // B) 面板通路
  const panel = await send('tools/call', { name: 'latex_outline', arguments: { path: TEX } });
  console.log('\n=== B. 面板通路（带 path，list 行协议）===');
  console.log(((panel.result || {}).content || []).map((c) => c.text).join('\n'));

  // C) latex_parse json 里的 sections
  const parsed = await send('tools/call', { name: 'latex_parse', arguments: { path: TEX, format: 'json' } });
  let j = null;
  try { j = JSON.parse(((parsed.result || {}).content || []).map((c) => c.text).join('\n')); } catch (e) {}
  console.log('\n=== C. latex_parse json sections ===');
  if (j && j.sections) j.sections.forEach((s) => console.log('  cmd=' + s.cmd + ' level=' + s.level + ' line=' + s.line + ' title=' + JSON.stringify(s.title)));

  // D) 真实行号对照
  const raw = fs.readFileSync(TEX, 'utf8').split('\n');
  console.log('\n=== D. sample.tex 真实行号对照 ===');
  raw.forEach((l, i) => { if (/\\(part|chapter|section|subsection|subsubsection)\*?\{/.test(l)) console.log('  L' + (i + 1) + '  ' + l.trim()); });

  p.kill();
  process.exit(0);
})();
