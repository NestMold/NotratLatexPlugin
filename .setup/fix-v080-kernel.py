# -*- coding: utf-8 -*-
r"""v0.8.0 补丁 1/2：给 WYS 内核加 headingNumbers()。

背景（用户原话，第三次强调）：
    「我不要就地编辑模式和制度模式，我的意思是在结果上像编辑Mardown和WOrd一样可以快速修改啊」

前两轮我一直在「加模式」，这是根本性误解。这一轮拆掉模式。
拆掉模式有一个必须补上的后果：标题不能再显示 `\section{引言}` 这种源码三明治了 ——
Word / Markdown 里标题就长 `2 引言` 的样子，编号是自动的。

所以：把只读预览（preview-core.parseBlocks）的编号规则抽成同构的一份，
供就地编辑层复用。两处必须给出完全相同的编号，check-v080-flat.js 会逐条对账。
"""
import io
import sys

P = "server/wysiwyg.js"
s = io.open(P, encoding="utf-8").read()
orig = s


def rep(old, new, tag):
    global s
    if old not in s:
        print("MISS  " + tag)
        sys.exit(1)
    s = s.replace(old, new, 1)
    print("  ok  " + tag)


FUNC = r'''

/* =====================================================================
 * headingNumbers(blocks) → Map<blockId, "2.1">
 *
 * 与只读预览 preview-core.parseBlocks 的编号规则**同构**：
 *     idx = HEAD_LV[name]；星号标题 / \paragraph 不编号；
 *     c[idx]++，并把更深的计数清零；chapter 只给主序号，其余给 "a.b.c" 点分。
 *
 * 为什么需要它：v0.8.0 拆掉了「就地编辑 / 只读」这个模式开关，预览区就是文档本身。
 * 既然是在**结果**上编辑，标题就得显示成 `2 引言` 的样子，而不是 `\section{引言}`。
 * 编号本身不可编辑 —— 改标题文字，编号自己会重算（跟 Word 一致）。
 *
 * 注意 part 被刻意跳过：preview-core 的标题正则不认 \part，为保持一致这里也不编号。
 * =================================================================== */
function headingNumbers(blocks) {
  const c = [0, 0, 0, 0];
  const out = new Map();
  const list = blocks || [];
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (!b || b.type !== "heading") continue;
    if (b.kind === "part") { out.set(b.id, ""); continue; }          // 与 preview-core 对齐
    const idx = HEAD_LV[b.kind] != null ? HEAD_LV[b.kind] : 1;
    const starred = /\*/.test(String(b.prefix || ""));
    if (starred || b.kind === "paragraph" || idx > 3) { out.set(b.id, ""); continue; }
    c[idx]++;
    for (let k = idx + 1; k <= 3; k++) c[k] = 0;
    out.set(b.id, idx === 0 ? String(c[0]) : c.slice(1, idx + 1).join("."));
  }
  return out;
}
'''

rep(
    "\nmodule.exports = { parseDoc: parseDoc, applyEdits: applyEdits, parseInline: parseInline, segmentsToTex: segmentsToTex, headingTex: headingTex, classifyEnv: classifyEnv, escHtml: escHtml, escRe: escRe, readGroup: readGroup, stripComment: stripComment };",
    FUNC + "\nmodule.exports = { parseDoc: parseDoc, headingNumbers: headingNumbers, applyEdits: applyEdits, parseInline: parseInline, segmentsToTex: segmentsToTex, headingTex: headingTex, classifyEnv: classifyEnv, escHtml: escHtml, escRe: escRe, readGroup: readGroup, stripComment: stripComment };\n",
    "wysiwyg.js 导出 headingNumbers",
)

if s == orig:
    print("NO CHANGE")
    sys.exit(1)
io.open(P, "w", encoding="utf-8").write(s)
print("\nOK server/wysiwyg.js")
