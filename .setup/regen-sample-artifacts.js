/* 样例换内容之后，把随样例一起放在仓库里的两份产物重新生成：
 *   samples/sample.html（自包含 HTML，走 server 那条「面板不在场」的路径）
 *   samples/sample.pdf （真编译一遍，顺带证明新样例是能编译的 LaTeX）
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const WS = 'E:/notrat-latex-plugin';
const TEX = path.join(WS, 'samples', 'sample.tex');
const EXPORT = require(path.join(WS, 'server', 'export-html.js'));

/* ---------- 1. HTML ---------- */
const src = fs.readFileSync(TEX, 'utf8');
const body = EXPORT.buildBodyHtml(src, path.dirname(TEX));
const inl = EXPORT.inlineImages(body);
const doc = EXPORT.buildDoc({
  title: EXPORT.guessTitle(src) || 'sample',
  lang: 'zh-CN',
  bodyHtml: inl.html,
  katexCss: '',
});
const outHtml = path.join(WS, 'samples', 'sample.html');
fs.writeFileSync(outHtml, doc, 'utf8');
console.log('HTML  ' + outHtml + '  ' + Buffer.byteLength(doc, 'utf8') + ' B'
  + ' | 标题=' + JSON.stringify(EXPORT.guessTitle(src))
  + ' | 图片内嵌 ' + inl.inlined.length + ' / 缺 ' + inl.missing.length);

/* ---------- 2. PDF（走插件自己的 latex_compile） ---------- */
const SERVER = path.join(WS, 'server', 'index.js');
const child = spawn(process.execPath, [SERVER], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    NOTRAT_PLUGIN_ID: 'notrat-latex-plugin',
    NOTRAT_PLUGIN_DIR: path.join(os.homedir(), '.notrat', 'plugins'),
    NOTRAT_WORKSPACE: WS.replace(/\//g, '\\'),
    NOTRAT_WINDOW_ID: 'main',
    NOTRAT_LOCALE: 'zh',
  },
});
let buf = '';
const pending = new Map();
child.stdout.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    let m; try { m = JSON.parse(line); } catch (e) { continue; }
    if (m.id != null && pending.has(m.id)) { const cb = pending.get(m.id); pending.delete(m.id); cb(m); }
  }
});
child.stderr.on('data', () => {});
let seq = 0;
const call = (name, args) => new Promise((res) => {
  const id = ++seq;
  pending.set(id, res);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }) + '\n');
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); res({ timeout: true }); } }, 180000);
});
const textOf = (m) => ((m && m.result && m.result.content) || []).map((c) => c.text).join('\n');

(async () => {
  await call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'regen', version: '1' } });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const r = await call('latex_compile', { path: TEX });
  const t = textOf(r);
  console.log('COMPILE ' + t.replace(/\s+/g, ' ').slice(0, 300));
  const pdf = path.join(WS, 'samples', 'sample.pdf');
  if (fs.existsSync(pdf)) console.log('PDF   ' + pdf + '  ' + fs.statSync(pdf).size + ' B  改动时间 ' + fs.statSync(pdf).mtime.toISOString());
  child.kill();
  /* 显式退出：MCP 子进程的 stdio 句柄会让事件循环挂着不散（真卡过一次） */
  setTimeout(function () { process.exit(0); }, 200);
})();
