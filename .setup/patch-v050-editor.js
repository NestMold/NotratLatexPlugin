/* v0.5.0 补丁 2：编辑器侧 —— 光标广播 + 行定位（reveal）+ 定位闪烁
 * 用法：node .setup/patch-v050-editor.js
 *
 * 背景：大纲面板（ui.location = "outline"）拿不到编辑器实例，点章节原来什么也不会发生。
 * 这里给编辑器加一个"行定位"通道（CustomEvent + ack 回执），面板据此确认有人接住。
 */
const fs = require("fs");
const path = require("path");
const WS = "E:/notrat-latex-plugin";
const read = (p) => fs.readFileSync(path.join(WS, p), "utf8");
const write = (p, s) => fs.writeFileSync(path.join(WS, p), s);

function must(hay, needle, label) {
  if (hay.indexOf(needle) < 0) throw new Error("锚点缺失：" + label);
}
function mustOnce(hay, needle, label) {
  const n = hay.split(needle).length - 1;
  if (n !== 1) throw new Error("锚点不唯一(" + n + ")：" + label);
}

const p = "panels/editor.tsx";
let s = read(p);
const before = s;

/* ---------- 1. 通道常量 ---------- */
{
  const anchor = 'const LATEX_STORE = "notrat-latex-active";';
  mustOnce(s, anchor, "LATEX_STORE");
  const ins = [
    anchor,
    '/* v0.5.0 新增两条通道：',
    ' *   notrat-latex-cursor    编辑器 -> 面板：光标行，面板据此高亮"正在写的那一节"',
    ' *   notrat-latex-reveal-line 面板 -> 编辑器：滚到某行并闪一下（AC K 回执让面板知道有人接住）',
    ' */',
    'const LATEX_CURSOR = "notrat-latex-cursor";',
    'const LATEX_CURSOR_PING = "notrat-latex-cursor-ping";',
    'const LATEX_REVEAL = "notrat-latex-reveal-line";',
    'const LATEX_REVEAL_ACK = "notrat-latex-reveal-ack";',
  ].join("\n");
  if (s.indexOf("LATEX_CURSOR") < 0) s = s.replace(anchor, ins);
}

/* ---------- 2. 闪烁用的 state / ref ---------- */
{
  const anchor = "  const assetCache = useRef(new Map());";
  mustOnce(s, anchor, "assetCache");
  const ins = [
    anchor,
    "  /* 行定位闪烁：\"跳过去了\"要看得见，否则用户不知道点没点中 */",
    "  const [flashLine, setFlashLine] = useState(0);",
    "  const flashRef = useRef(null);",
    "  const flashLineRef = useRef(0);",
    "  const flashTimer = useRef(null);",
    "  const gotoLineRef = useRef(null);",
  ].join("\n");
  if (s.indexOf("flashLineRef") < 0) s = s.replace(anchor, ins);
}

/* ---------- 3. 光标广播 + 行定位监听（接在活动文件桥 effect 之后） ---------- */
{
  const anchor = "  }, [filePath, fileName]);";
  must(s, anchor, "活动文件桥 effect 结尾");
  const ins = [
    anchor,
    "",
    "  /* ---------- 光标广播：面板靠它高亮\"我正在写哪一节\" ---------- */",
    "  useEffect(() => {",
    "    const push = () => {",
    "      try {",
    "        window.dispatchEvent(new CustomEvent(LATEX_CURSOR, { detail: { path: filePath || \"\", line: cursor.line, col: cursor.col } }));",
    "      } catch (e) {}",
    "    };",
    "    push();",
    "    window.addEventListener(LATEX_CURSOR_PING, push);",
    "    return () => window.removeEventListener(LATEX_CURSOR_PING, push);",
    "  }, [cursor.line, cursor.col, filePath]);",
    "",
    "  /* ---------- 行定位：面板点一行 -> 本编辑器滚过去 + 闪一下 + 回执 ---------- */",
    "  useEffect(() => {",
    "    function onReveal(e) {",
    "      const d = (e && e.detail) || {};",
    "      const target = String(d.path || \"\");",
    "      if (target && !sameAsFile(target)) return; // 不是本文件，留给对应的编辑器实例",
    "      const ln = Math.max(1, Number(d.line) || 1);",
    "      if (gotoLineRef.current) gotoLineRef.current(ln);",
    "      try {",
    "        window.dispatchEvent(new CustomEvent(LATEX_REVEAL_ACK, { detail: { path: filePath || \"\", line: ln, nonce: d.nonce || \"\" } }));",
    "      } catch (e2) {}",
    "    }",
    "    window.addEventListener(LATEX_REVEAL, onReveal);",
    "    return () => window.removeEventListener(LATEX_REVEAL, onReveal);",
    "  }, [filePath]);",
    "",
    "  /* gotoLine 每次渲染都是新闭包，用 ref 保持监听里拿到的是最新那份 */",
    "  useEffect(() => { gotoLineRef.current = gotoLine; });",
  ].join("\n");
  if (s.indexOf("LATEX_REVEAL_ACK, { detail") < 0) s = s.replace(anchor, ins);
}

/* ---------- 4. 路径比较 + 闪烁绘制助手（放在 syncScroll 之前） ---------- */
{
  const anchor = "  function syncScroll() {";
  mustOnce(s, anchor, "syncScroll");
  const ins = [
    "  function sameAsFile(p) {",
    "    if (!p) return true;",
    "    const a = String(p).replace(/\\\\/g, \"/\").toLowerCase();",
    "    const b = String(filePath || \"\").replace(/\\\\/g, \"/\").toLowerCase();",
    "    return a === b;",
    "  }",
    "",
    "  /* 闪烁层跟着 textarea 的 scrollTop 走：不引 state，避免滚动时整棵树重渲染 */",
    "  function paintFlash(ln) {",
    "    const el = flashRef.current, ta = taRef.current;",
    "    if (!el || !ta) return;",
    "    if (!ln) { el.style.opacity = \"0\"; return; }",
    "    el.style.top = 8 + (ln - 1) * 20 - ta.scrollTop + \"px\";",
    "    el.style.opacity = \"1\";",
    "  }",
    "",
    "  function flashAt(ln) {",
    "    flashLineRef.current = ln;",
    "    setFlashLine(ln);",
    "    paintFlash(ln);",
    "    if (flashTimer.current) clearTimeout(flashTimer.current);",
    "    flashTimer.current = setTimeout(function () {",
    "      flashTimer.current = null;",
    "      flashLineRef.current = 0;",
    "      setFlashLine(0);",
    "      paintFlash(0);",
    "    }, 1400);",
    "  }",
    "",
    anchor,
  ].join("\n");
  if (s.indexOf("function paintFlash(ln)") < 0) s = s.replace(anchor, ins);
}

/* ---------- 5. syncScroll 里补画闪烁层 ---------- */
{
  const anchor = [
    "    if (pvEl && view === \"split\") {",
    "      const ratio = ta.scrollTop / Math.max(1, ta.scrollHeight - ta.clientHeight);",
    "      pvEl.scrollTop = ratio * Math.max(0, pvEl.scrollHeight - pvEl.clientHeight);",
    "    }",
    "  }",
  ].join("\n");
  mustOnce(s, anchor, "syncScroll 尾部");
  const rep = [
    "    if (pvEl && view === \"split\") {",
    "      const ratio = ta.scrollTop / Math.max(1, ta.scrollHeight - ta.clientHeight);",
    "      pvEl.scrollTop = ratio * Math.max(0, pvEl.scrollHeight - pvEl.clientHeight);",
    "    }",
    "    if (flashLineRef.current) paintFlash(flashLineRef.current);",
    "  }",
  ].join("\n");
  if (s.indexOf("if (flashLineRef.current) paintFlash(flashLineRef.current);") < 0) s = s.replace(anchor, rep);
}

/* ---------- 6. gotoLine 带闪烁 ---------- */
{
  const anchor = [
    "  function gotoLine(ln) {",
    "    if (view === \"preview\") setView(\"split\");",
    "    const ta = taRef.current; if (!ta) return;",
    "    const lines = content.split(\"\\n\");",
    "    let off = 0;",
    "    for (let i = 0; i < ln - 1 && i < lines.length; i++) off += lines[i].length + 1;",
    "    ta.focus();",
    "    try { ta.setSelectionRange(off, off + (lines[ln - 1] || \"\").length); } catch (e) {}",
    "    ta.scrollTop = Math.max(0, (ln - 1) * 20 - ta.clientHeight / 3);",
    "    syncScroll(); updateCursor();",
    "  }",
  ].join("\n");
  mustOnce(s, anchor, "gotoLine");
  const rep = [
    "  /* 行跳转：面板 / 内置大纲 / 预览点击都走这里。opts.flash=false 可关掉闪烁。 */",
    "  function gotoLine(ln, opts) {",
    "    if (view === \"preview\") setView(\"split\");",
    "    const ta = taRef.current; if (!ta) return;",
    "    const lines = content.split(\"\\n\");",
    "    let off = 0;",
    "    for (let i = 0; i < ln - 1 && i < lines.length; i++) off += lines[i].length + 1;",
    "    ta.focus();",
    "    try { ta.setSelectionRange(off, off + (lines[ln - 1] || \"\").length); } catch (e) {}",
    "    ta.scrollTop = Math.max(0, (ln - 1) * 20 - ta.clientHeight / 3);",
    "    syncScroll(); updateCursor();",
    "    if (!opts || opts.flash !== false) flashAt(ln);",
    "  }",
  ].join("\n");
  if (s.indexOf("function gotoLine(ln, opts)") < 0) s = s.replace(anchor, rep);
}

/* ---------- 7. 行号槽：闪烁行高亮 ---------- */
{
  const anchor = [
    "              {lines.map((_, i) => (<div key={i}>{i + 1}</div>))}",
  ].join("\n");
  mustOnce(s, anchor, "行号槽渲染");
  const rep = [
    "              {lines.map((_, i) => (",
    "                <div key={i} style={flashLine === i + 1 ? { color: \"hsl(var(--primary))\", fontWeight: 700, background: \"hsl(var(--primary) / 0.14)\" } : null}>{i + 1}</div>",
    "              ))}",
  ].join("\n");
  if (s.indexOf("flashLine === i + 1") < 0) s = s.replace(anchor, rep);
}

/* ---------- 8. 源码列：整行闪烁层 ---------- */
{
  const anchor = [
    "            <div style={{ flex: 1, minWidth: 0, position: \"relative\" }}>",
    "              <pre ref={preRef} style={preStyle} dangerouslySetInnerHTML={{ __html: highlighted }} />",
  ].join("\n");
  mustOnce(s, anchor, "源码列容器");
  const rep = [
    "            <div style={{ flex: 1, minWidth: 0, position: \"relative\" }}>",
    "              {/* 定位闪烁层：top 由 paintFlash 跟着 scrollTop 算，pointerEvents 关掉不挡输入 */}",
    "              <div ref={flashRef} style={{",
    "                position: \"absolute\", left: 0, right: 0, height: 20, top: -999,",
    "                background: \"hsl(var(--primary) / 0.13)\", borderLeft: \"2px solid hsl(var(--primary))\",",
    "                pointerEvents: \"none\", opacity: 0, transition: \"opacity .25s\", zIndex: 1,",
    "              }} />",
    "              <pre ref={preRef} style={preStyle} dangerouslySetInnerHTML={{ __html: highlighted }} />",
  ].join("\n");
  if (s.indexOf("ref={flashRef}") < 0) s = s.replace(anchor, rep);
}

if (s !== before) { write(p, s); console.log("  ✓ panels/editor.tsx 已更新（光标广播 + 行定位 + 闪烁）"); }
else console.log("  = panels/editor.tsx 无变化");
