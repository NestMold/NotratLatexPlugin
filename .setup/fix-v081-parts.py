# -*- coding: utf-8 -*-
r"""把「前缀 + 正文 + 后缀」这条不变式收进内核，只留一份实现。

为什么要收：导言区的每一项都是「改正文、拼回前后缀」。
    \title{基于…}                 前缀 "\title{"  正文 "基于…"  后缀 "}"
    \documentclass[12pt]{ctexart}  前缀 "\documentclass[12pt]{"  正文 "ctexart"  后缀 "}"
    \usepackage{amsmath}          前缀 "\usepackage{"  正文 "amsmath"  后缀 "}"
如果编辑器自己写一遍、门禁自己写一遍、单测再写一遍，迟早会各写各的 —— 那正是
v0.7.3 那次「两套内核各自算标题层级、结果差一号」的翻版。所以收进内核：
  partsJoin(prefix, body, suffix)        拼回去
  partsExact(block, origText)            拼回去是否逐字节等于原行 ← 提交前的自检
  headingTex(block, title) = partsJoin(...)   原来就是这件事，顺手统一
"""
import io
import sys

P = "server/wysiwyg.js"
s = io.open(P, encoding="utf-8").read()
orig = s

OLD_HEAD = """function headingTex(block, newTitle) {
  return String((block && block.prefix) || "") + String(newTitle == null ? "" : newTitle) + String((block && block.suffix) || "");
}"""

NEW_HEAD = """/* ---------- 「前缀 + 正文 + 后缀」：改显示而不改源码的落点 ----------
 * 标题、导言区每一项（\\title / \\author / \\documentclass / \\usepackage）都长这个样子：
 * 用户能改的只有中间那段「正文」，前后缀（\\title{ … }）原样带回。
 * 硬不变式：**没改过的时候，拼回去必须逐字节等于原行**。
 * 这一条如果破了，「改显示」就变成了「重写源码」—— 用户的原稿会在某次无害编辑后变形。
 * 内核里只留这一份实现，编辑器 / 门禁 / 单测共用，避免各写各的（v0.7.3 的教训）。 */
function partsJoin(prefix, body, suffix) {
  return String(prefix == null ? "" : prefix) + String(body == null ? "" : body) + String(suffix == null ? "" : suffix);
}
function partsExact(block, origText) {
  if (!block) return false;
  return partsJoin(block.prefix, block.body, block.suffix) === String(origText == null ? "" : origText);
}
function headingTex(block, newTitle) {
  return partsJoin(block && block.prefix, newTitle, block && block.suffix);
}"""

if OLD_HEAD not in s:
    print("MISS  headingTex")
    sys.exit(1)
s = s.replace(OLD_HEAD, NEW_HEAD, 1)

OLD_EXP = "module.exports = { parseDoc: parseDoc, headingNumbers: headingNumbers, parsePreamble: parsePreamble, applyEdits: applyEdits,"
NEW_EXP = "module.exports = { parseDoc: parseDoc, headingNumbers: headingNumbers, parsePreamble: parsePreamble, partsJoin: partsJoin, partsExact: partsExact, applyEdits: applyEdits,"
if OLD_EXP not in s:
    print("MISS  导出行")
    sys.exit(1)
s = s.replace(OLD_EXP, NEW_EXP, 1)

if s == orig:
    print("NO CHANGE")
    sys.exit(1)
io.open(P, "w", encoding="utf-8").write(s)
print("  ok  server/wysiwyg.js: partsJoin / partsExact 已加并导出，headingTex 改为复用")

# ============================================================ editor.tsx 用内核那份
E = "panels/editor.tsx"
e = io.open(E, encoding="utf-8").read()
OLD_E = """      let newText = a.tex;
      if (a.prefix != null || a.suffix != null) {
        const back = String(a.prefix == null ? "" : a.prefix) + a.orig + String(a.suffix == null ? "" : a.suffix);
        if (back !== content.split("\\n").slice(a.s, a.e + 1).join("\\n")) {
          throw new Error("前缀/后缀拼接未能逐字节还原原行");
        }
        newText = String(a.prefix == null ? "" : a.prefix) + a.tex + String(a.suffix == null ? "" : a.suffix);
      }"""
NEW_E = """      let newText = a.tex;
      if (a.prefix != null || a.suffix != null) {
        const origText = content.split("\\n").slice(a.s, a.e + 1).join("\\n");
        if (!WYS.partsExact({ prefix: a.prefix, body: a.orig, suffix: a.suffix }, origText)) {
          throw new Error("前缀/后缀拼接未能逐字节还原原行");
        }
        newText = WYS.partsJoin(a.prefix, a.tex, a.suffix);
      }"""
if OLD_E not in e:
    print("MISS  editor.tsx 的自检")
    sys.exit(1)
io.open(E, "w", encoding="utf-8").write(e.replace(OLD_E, NEW_E, 1))
print("  ok  panels/editor.tsx: 自检与回拼改用内核 partsExact / partsJoin")

# ============================================================ 门禁也用内核那份
G = ".setup/check-v080-flat.js"
g = io.open(G, encoding="utf-8").read()
OLD_G = """for (const el of fml) {
  const s0 = parseInt(el.getAttribute("data-s"), 10), e0 = parseInt(el.getAttribute("data-e"), 10);
  const back = el.getAttribute("data-prefix") + el.getAttribute("data-tex") + el.getAttribute("data-suffix");
  const orig = srcLines.slice(s0, e0 + 1).join("\\n");
  invChecked++;
  if (back !== orig) invBad = invBad || ("data-fk=" + el.getAttribute("data-fk") +
    "\\n          期望 " + JSON.stringify(orig) + "\\n          实得 " + JSON.stringify(back));
}"""
NEW_G = """for (const el of fml) {
  const s0 = parseInt(el.getAttribute("data-s"), 10), e0 = parseInt(el.getAttribute("data-e"), 10);
  const item = { prefix: el.getAttribute("data-prefix"), body: el.getAttribute("data-tex"), suffix: el.getAttribute("data-suffix") };
  const orig = srcLines.slice(s0, e0 + 1).join("\\n");
  invChecked++;
  /* 用内核那一份判定，门禁不另写一套 —— 否则两边迟早各偏一点 */
  if (!W.partsExact(item, orig)) {
    invBad = invBad || ("data-fk=" + el.getAttribute("data-fk") +
      "\\n          期望 " + JSON.stringify(orig) + "\\n          实得 " + JSON.stringify(W.partsJoin(item.prefix, item.body, item.suffix)));
  }
}"""
if OLD_G not in g:
    print("MISS  门禁 [B2] 的判定")
    sys.exit(1)
io.open(G, "w", encoding="utf-8").write(g.replace(OLD_G, NEW_G, 1))
print("  ok  check-v080-flat.js: [B2] 改用内核 partsExact")
