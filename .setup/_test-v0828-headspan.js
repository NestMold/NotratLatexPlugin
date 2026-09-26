/* v0.8.28 测试：标题块跨多物理行时，章节快捷键还能不能干活 + 「取消层级」不再毁稿。
 *
 * 复刻 editor.tsx / applyHeadWys 与 applyHead 里相关分支的**决策与改写**（纯数据部分），
 * 解析与写回用的是真的 server/wysiwyg.js —— 只有分支判断是副本，
 * 所以产物断言（check-v0811-edit.js 那套）会另外盯住真实代码里那几行文本。
 *
 * 用户报的原话就是一行警告：
 *   ⚠ 这一块跨 4 行（多行公式 / 环境等），章节快捷键只处理正文段落 —— 把光标放到正文上再用
 * 而光标其实在标题上 —— 那是编辑块，不是公式。
 */
const WYS = require('../server/wysiwyg.js');

const WYS_BLK_SAY = {
  preamble: '导言区', heading: '标题', paragraph: '正文', math: '公式',
  float: '图表浮动体', bib: '参考文献', list: '列表', 'text-env': '文本环境',
  env: '环境', code: '代码 / 原样', comment: '注释', command: '命令', tail: '文档结尾',
};

function mergeWysLines(lines, s, e) {
  const parts = [];
  for (let li = s; li <= e; li++) {
    let ln = lines[li] == null ? '' : lines[li];
    const cj = ln.indexOf('%');
    if (cj >= 0) ln = ln.slice(0, cj);
    ln = ln.trim();
    if (ln) parts.push(ln);
  }
  return parts.join(' ');
}

function headStripClean(s) {
  let i = 0;
  const n = s.length;
  while (i < n && (s.charAt(i) === ' ' || s.charAt(i) === '\t')) i++;
  if (s.charAt(i) === '[') {
    const j = s.indexOf(']', i);
    if (j < 0) return null;
    i = j + 1;
    while (i < n && (s.charAt(i) === ' ' || s.charAt(i) === '\t')) i++;
  }
  if (s.charAt(i) !== '{') return null;
  let depth = 0;
  for (let k = i; k < n; k++) {
    const c = s.charAt(k);
    if (c === '\\') { k++; continue; }
    if (c === '{') { depth++; continue; }
    if (c === '}') {
      depth--;
      if (depth < 0) return null;
      if (depth === 0) return s.slice(k + 1).trim() === '' ? s.slice(i + 1, k) : null;
    }
  }
  return null;
}

const HEAD_LEAD_RE = /^(\s*)\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)/;

/* 影子实现：applyHeadWys(base, s, e, TY, cmd) → { kind, out?, merged?, msg? } */
function headPlan(base, s, e, TY, cmd) {
  const isPara = TY === 'paragraph';
  const isHead = TY === 'heading';
  const lines = base.split('\n');
  let endLine = s, body = '', tail = '';
  if (s !== e) {
    if (!isPara && !isHead) {
      const snip = String(lines[s] == null ? '' : lines[s]).trim().slice(0, 26);
      return { kind: 'refuse', msg: '⚠ 光标不在正文里 —— 这一块是「' + (WYS_BLK_SAY[TY] || '结构块') + '」（源码第 ' +
        (s + 1) + '–' + (e + 1) + ' 行' + (snip ? '：' + snip : '') + '）。章节快捷键只改正文 / 标题，点到正文上再用' };
    }
    if (isHead) {
      const ls = lines[s] == null ? '' : lines[s];
      const ci = ls.indexOf('%');
      const lsBody = ci >= 0 ? ls.slice(0, ci) : ls;
      const lsTail = ci >= 0 ? ls.slice(ci) : '';
      const lead = HEAD_LEAD_RE.exec(lsBody);
      if (!lead) return { kind: 'refuse', msg: '⚠ 这一块标题的开头没认出章节命令' };
      const same = !!cmd && lead[2] === cmd;
      let hText = '', hMerge = false;
      if (cmd && !same) {
        hText = lead[1] + '\\' + cmd + lead[3] + lsBody.slice(lead[0].length) + lsTail;
      } else {
        const whole = mergeWysLines(lines, s, e);
        const rl2 = HEAD_LEAD_RE.exec(whole);
        const stripped = rl2 ? headStripClean(whole.slice(rl2[0].length)) : null;
        if (stripped == null) {
          return { kind: 'refuse', msg: '⚠ 这一块标题后面还挂着别的东西（\\label 之类），取消层级会把它变成正文 —— 先把 \\label 挪走再取消' };
        }
        hText = stripped;
        hMerge = true;
      }
      const out = WYS.applyEdits(base, [{ startLine: s, endLine: hMerge ? e : s, newText: hText }]);
      WYS.parseDoc(out);
      return { kind: 'edit', out: out, merged: hMerge, levelChanged: !!(cmd && !same) };
    }
    endLine = e;
    body = mergeWysLines(lines, s, e);
  } else {
    const rawLine = lines[s] == null ? '' : lines[s];
    const ci = rawLine.indexOf('%');
    body = ci >= 0 ? rawLine.slice(0, ci) : rawLine;
    tail = ci >= 0 ? rawLine.slice(ci) : '';
  }
  const m = /^\s*\\(?:part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*\{([\s\S]*)\}\s*$/.exec(body);
  const lead2 = HEAD_LEAD_RE.exec(body);
  const isCmd = !!lead2;
  let next;
  if (isCmd && lead2[2] === cmd) {           /* 同层级再按一次 = 取消层级（走平衡剥离） */
    const stripped2 = headStripClean(body.slice(lead2[0].length));
    if (stripped2 == null) return { kind: 'refuse', msg: '⚠ 这一行标题后面还挂着别的东西（\\label 之类）…' };
    next = stripped2 + (tail ? ' ' : '');
    const out2 = WYS.applyEdits(base, [{ startLine: s, endLine: endLine, newText: next + tail }]);
    WYS.parseDoc(out2);
    return { kind: 'edit', out: out2, undone: true };
  } else if (m) {
    next = cmd ? '\\' + cmd + '{' + m[1] + '}' : m[1];
  } else {
    const t = body.trim();
    if (t !== '' && t.charAt(0) === '\\' && !isPara) return { kind: 'refuse', msg: '⚠ 这一行以 \\ 开头（不是正文）…' };
    next = cmd ? '\\' + cmd + '{' + t + '}' : t;
  }
  const out = WYS.applyEdits(base, [{ startLine: s, endLine: endLine, newText: next + tail }]);
  WYS.parseDoc(out);
  return { kind: 'edit', out: out };
}

let bad = 0;
function ok(name, cond, extra) {
  if (!cond) bad++;
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  ← ' + extra : ''));
}

/* ---------- [1] 标题块真的会跨多物理行（这是那句「跨 N 行」的来源） ---------- */
const docHead = '\\begin{document}\n\n\\section[短标题]{方法\n123132}\n\\label{sec:method}\n\n正文一段\n\n\\end{document}\n';
const dH = WYS.parseDoc(docHead);
const hb = dH.blocks.find((b) => b.type === 'heading');
ok('[1] 标题块真的跨了多行', hb && hb.endLine > hb.startLine,
  hb ? ('行 ' + hb.startLine + '..' + hb.endLine + '（' + (hb.endLine - hb.startLine + 1) + ' 行）') : '没找到 heading');

/* ---------- [2] 换层级：只换命令名，其余一字不动 ---------- */
const r2 = headPlan(docHead, hb.startLine, hb.endLine, 'heading', 'subsection');
ok('[2] 不再拒绝（旧版这里就是那句「多行公式 / 环境等」）', r2.kind === 'edit', r2.msg || '');
if (r2.kind === 'edit') {
  const l2 = r2.out.split('\n');
  ok('[2] 只改了第一行', l2[hb.startLine].indexOf('\\subsection[短标题]{方法') === 0, JSON.stringify(l2[hb.startLine]));
  ok('[2] 第二行的标题后半句原样（没被并成一行）', l2[hb.startLine + 1] === '123132}', JSON.stringify(l2[hb.startLine + 1]));
  ok('[2] 紧跟其后的 \\label 一字不动', l2[hb.startLine + 2] === '\\label{sec:method}', JSON.stringify(l2[hb.startLine + 2]));
  const h2 = WYS.parseDoc(r2.out).blocks.find((b) => b.type === 'heading');
  ok('[2] 改完标题文字完整', h2 && h2.title.replace(/\s+/g, ' ') === '方法 123132', JSON.stringify(h2 && h2.title));
  ok('[2] 改完层级正确（subsection = 2）', h2 && h2.level === 2, h2 && String(h2.level));
  ok('[2] 改完仍可解析（parseDoc 自检）', !!h2);
}

/* ---------- [3] 干净的跨行标题：同层级再按一次 = 取消层级（整块并成一行） ---------- */
const docClean = '\\begin{document}\n\n\\section[短标题]{方法\n123132}\n\n正文\n\n\\end{document}\n';
const dC = WYS.parseDoc(docClean);
const hc = dC.blocks.find((b) => b.type === 'heading');
const r3 = headPlan(docClean, hc.startLine, hc.endLine, 'heading', 'section');
ok('[3] 取消层级 = 整块并成一行', r3.kind === 'edit' && r3.merged === true, r3.msg || '');
if (r3.kind === 'edit') {
  const p3 = WYS.parseDoc(r3.out).blocks.filter((b) => b.type === 'paragraph');
  ok('[3] 变成一段正文，文字 = 标题原文', p3.some((b) => b.raw === '方法 123132'), JSON.stringify(p3.map((b) => b.raw)));
  ok('[3] 不再是标题', WYS.parseDoc(r3.out).blocks.every((b) => b.type !== 'heading'));
}

/* ---------- [4] \label 在下一行（不属于标题块）→ 取消层级照常成功，那一行原样留着 ---------- */
const r4 = headPlan(docHead, hb.startLine, hb.endLine, 'heading', 'section');   // 已是 section → 取消
ok('[4] \\label 在块外时，取消层级照常成功', r4.kind === 'edit', r4.msg || '');
if (r4.kind === 'edit') {
  const l4 = r4.out.split('\n');
  ok('[4] 标题变正文文字', l4[hb.startLine] === '方法 123132', JSON.stringify(l4[hb.startLine]));
  ok('[4] 块外那行 \\label 一字不动', l4[hb.startLine + 1] === '\\label{sec:method}', JSON.stringify(l4[hb.startLine + 1]));
}

/* ---------- [4b] \label 就在标题块**里面** → 明确拒绝（不猜、不毁） ---------- */
const docIn = '\\begin{document}\n\n\\section{方法\n123132}\\label{sec:method}\n\n\\end{document}\n';
const dIn = WYS.parseDoc(docIn);
const hIn = dIn.blocks.find((b) => b.type === 'heading');
ok('[4b] \\label 落在标题块的第二行（真的在块里）',
  hIn && hIn.raw.indexOf('\\label{sec:method}') >= 0, hIn ? JSON.stringify(hIn.raw) : '没找到');
const r4b = headPlan(docIn, hIn.startLine, hIn.endLine, 'heading', 'section');
ok('[4b] 取消层级 → 明确拒绝', r4b.kind === 'refuse', r4b.msg || JSON.stringify(r4b).slice(0, 80));
ok('[4b] 拒绝理由说清是 \\label', (r4b.msg || '').indexOf('\\label') >= 0, r4b.msg);
const r4c = headPlan(docIn, hIn.startLine, hIn.endLine, 'heading', 'subsection');
ok('[4b] 但换层级照样能干活（只换命令名）', r4c.kind === 'edit' && r4c.out.indexOf('\\subsection{方法') >= 0,
  r4c.kind === 'edit' ? JSON.stringify(r4c.out.split('\n')[hIn.startLine]) : r4c.msg);

/* ---------- [5] 非正文块（参考文献 / 公式 / 浮动体）：拒绝，但说清是哪一块 ---------- */
const docBib = '\\begin{document}\n\n正文\n\n\\begin{thebibliography}{9}\n\\bibitem{a} A.\n\\bibitem{b} B.\n\\end{thebibliography}\n\n\\end{document}\n';
const dB = WYS.parseDoc(docBib);
const bb = dB.blocks.find((b) => b.type === 'bib');
ok('[5] 参考文献块 = 跨 4 行（与用户那句「跨 4 行」对得上）',
  bb && (bb.endLine - bb.startLine + 1) === 4, bb ? ('行 ' + bb.startLine + '..' + bb.endLine) : '没找到 bib');
if (bb) {
  const r5 = headPlan(docBib, bb.startLine, bb.endLine, 'bib', 'section');
  ok('[5] 依旧拒绝（本来就不该改）', r5.kind === 'refuse');
  ok('[5] 说清是哪一块：参考文献', (r5.msg || '').indexOf('「参考文献」') > 0, r5.msg);
  ok('[5] 给出行号范围', (r5.msg || '').indexOf('源码第 ' + (bb.startLine + 1) + '–' + (bb.endLine + 1) + ' 行') > 0, r5.msg);
  ok('[5] 带上首行片段，好让人一眼认出来', (r5.msg || '').indexOf('\\begin{thebibliography}') > 0, r5.msg);
  ok('[5] 不再拿「多行公式 / 环境等」当借口', (r5.msg || '').indexOf('多行公式') < 0, r5.msg);
}

/* ---------- [6] 回归：段落并行（v0.8.13）与单行路径都没被带坏 ---------- */
const docP = '\\begin{document}\n\n第一行文字\n第二行文字\n第三行文字\n\n\\end{document}\n';
const dP = WYS.parseDoc(docP);
const pp = dP.blocks.find((b) => b.type === 'paragraph');
const r6 = headPlan(docP, pp.startLine, pp.endLine, 'paragraph', 'section');
ok('[6] 3 行段落 → 并成一行变 section',
  r6.kind === 'edit' && WYS.parseDoc(r6.out).blocks.some((b) => b.type === 'heading' && b.title === '第一行文字 第二行文字 第三行文字'),
  r6.kind === 'edit' ? JSON.stringify(WYS.parseDoc(r6.out).blocks.filter((b) => b.type === 'heading').map((b) => b.title)) : r6.msg);

const doc1 = '\\begin{document}\n\n普通一行正文\n\n\\end{document}\n';
const d1 = WYS.parseDoc(doc1);
const p1 = d1.blocks.find((b) => b.type === 'paragraph');
const r7 = headPlan(doc1, p1.startLine, p1.endLine, 'paragraph', 'section');
ok('[6b] 单行段落照旧', r7.kind === 'edit' && WYS.parseDoc(r7.out).blocks.some((b) => b.type === 'heading' && b.title === '普通一行正文'));

/* ---------- [7] headStripClean：平衡花括号（堵住那条「取消层级」毁稿路径） ---------- */
ok('[7] 纯 {标题} → 标题文字', headStripClean('{标题}') === '标题');
ok('[7] [短]{标题} → 标题文字', headStripClean('[短]{标题}') === '标题');
ok('[7] 平衡括号内层保留', headStripClean('{\\textbf{粗}标题}') === '\\textbf{粗}标题');
ok('[7] 转义花括号不算括号', headStripClean('{a\\}b}') === 'a\\}b');
ok('[7] 后面挂着 \\label → null（拒绝，不猜）', headStripClean('{标题}\\label{sec:y}') === null);
ok('[7] 后面挂着 \\index → null', headStripClean('{标题} \\index{a}') === null);
ok('[7] 括号不闭合 → null', headStripClean('{标题') === null);

/* 旧写法（贪婪正则取第 3 组）到底会取到什么 —— 用事实说明这条路径以前是毁稿的 */
const OLD_GREEDY = /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)\s*\{([\s\S]*)\}\s*$/;
const oldM = OLD_GREEDY.exec('\\section{标题}\\label{sec:y}');
ok('[7] 旧写法取出的「标题」其实是坏的（所以必须换掉）',
  !!oldM && oldM[3] === '标题}\\label{sec:y', oldM ? JSON.stringify(oldM[3]) : 'null');

/* 单行 + \label 的 toggle：新写法拒绝，而不是写出 `标题} \label{sec:y` */
const docL = '\\begin{document}\n\n\\section{标题}\\label{sec:y}\n\n\\end{document}\n';
const dL = WYS.parseDoc(docL);
const hL = dL.blocks.find((b) => b.type === 'heading');
const r8 = headPlan(docL, hL.startLine, hL.endLine, 'heading', 'section');   // 已是 section → 取消
ok('[8] 单行 + \\label 取消层级 → 拒绝（不再写出坏 LaTeX）', r8.kind === 'refuse', r8.msg || JSON.stringify(r8).slice(0, 60));

/* 单行 + \label 换层级：只换命令名，\label 原样 */
const r9 = headPlan(docL, hL.startLine, hL.endLine, 'heading', 'subsection');
ok('[9] 单行 + \\label 换层级 = 只换命令名', r9.kind === 'edit' && r9.out.indexOf('\\subsection{标题}\\label{sec:y}') >= 0,
  r9.kind === 'edit' ? JSON.stringify(r9.out.split('\n')[hL.startLine]) : r9.msg);

console.log(bad ? '\n✗ ' + bad + ' 项失败' : '\n✓ 全部通过');
process.exit(bad ? 1 : 0);
