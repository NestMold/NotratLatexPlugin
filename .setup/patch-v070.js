/* v0.7.0 —— 路线 A：把 server/wysiwyg.js 内核接进 panels/editor.tsx 的可视化视图
 *
 * 目标：可视化视图里 heading / paragraph 变 contenteditable 就地编辑，
 *       改完用 WYS.applyEdits 只回写被改块的行区间（未改块逐字节保留）。
 *
 * 本脚本做 15 处锚定替换，任何一处锚点没命中就报错退出 —— 绝不静默半改。
 * 运行： node .setup/patch-v070.js
 */
const fs = require("fs");
const path = require("path");

const ws = "E:/notrat-latex-plugin";
const f = path.join(ws, "panels/editor.tsx");
let src = fs.readFileSync(f, "utf8");
const before = src;

const A = fs.readFileSync(path.join(ws, ".setup/v070/A-layer.js"), "utf8");
const B = fs.readFileSync(path.join(ws, ".setup/v070/B-hooks.js"), "utf8");
const C = fs.readFileSync(path.join(ws, ".setup/v070/C-effect.js"), "utf8");

let done = 0;
function sub(label, anchor, repl, expect) {
  const n = src.split(anchor).length - 1;
  const want = expect == null ? 1 : expect;
  if (n !== want) {
    console.error("✗ [" + label + "] 锚点命中 " + n + " 次（期望 " + want + "）");
    process.exit(1);
  }
  src = src.split(anchor).join(repl);
  done++;
  console.log("  ✓ " + label);
}

/* 1. WYS 占位符 */
sub("01 WYS 占位符",
  'import React, { useState, useRef, useEffect, useMemo } from "react";\n/*__LPC__*/',
  'import React, { useState, useRef, useEffect, useMemo } from "react";\n/*__LPC__*/\n/*__WYS__*/');

/* 2. 模块级：WYS_CSS + wysInline / wysDomToTex / wysRenderDoc */
sub("02 就地编辑层（模块级）",
  "/* KaTeX 在暗色主题下继承前景色 */\n.pv-root .katex{color:inherit;font-size:1.04em}\n.pv-root .katex-display{margin:0}\n`;\n",
  "/* KaTeX 在暗色主题下继承前景色 */\n.pv-root .katex{color:inherit;font-size:1.04em}\n.pv-root .katex-display{margin:0}\n`;\n" + A);

/* 3. wysOn 开关 state */
sub("03 wysOn state",
  "  const [toast, setToast] = useState(null); // {msg}",
  "  const [toast, setToast] = useState(null); // {msg; undo?}\n"
  + "  /* 就地编辑开关：可视化视图默认开着；关掉退回只读预览 */\n"
  + "  const [wysOn, setWysOn] = useState(true);");

/* 4. 组件内：refs + wys memo + commitWys + 事件 */
sub("04 commitWys / 事件处理",
  "  const gotoLineRef = useRef(null);\n",
  "  const gotoLineRef = useRef(null);\n" + B);

/* 5. innerHTML 同步 effect（紧接图片懒加载 effect 之后） */
sub("05 innerHTML 同步 effect",
  "  }, [pv.html, katexVer, serverId]);\n",
  "  }, [pv.html, katexVer, serverId]);\n\n" + C);

/* 6. 切视图前提交 */
sub("06 goView 提交",
  "  const goView = (v) => {\n    setView(v);",
  "  const goView = (v) => {\n"
  + "    /* 离开可视化视图前把改动落盘：否则切到源码视图会看到旧内容 */\n"
  + "    if (view === \"preview\" && v !== \"preview\") commitWys();\n"
  + "    setView(v);");

/* 7. 编译前提交 + 保存 */
sub("07 doCompile 提交",
  "  async function doCompile() {\n    setBusy(\"compile\"); setErr(\"\"); setBottomTab(\"compile\"); setBottomOpen(true);",
  "  async function doCompile() {\n"
  + "    /* 编译读的是磁盘文件：先提交 + 保存，别拿旧文件糊弄用户 */\n"
  + "    const pendingC = commitWys();\n"
  + "    if (pendingC != null && onSave) { try { onSave(); } catch (e0) {} }\n"
  + "    setBusy(\"compile\"); setErr(\"\"); setBottomTab(\"compile\"); setBottomOpen(true);");

/* 8. 校验前提交 + 保存 */
sub("08 doValidate 提交",
  "  async function doValidate() {\n    setBusy(\"validate\"); setErr(\"\"); setBottomTab(\"issues\"); setBottomOpen(true);",
  "  async function doValidate() {\n"
  + "    const pendingV = commitWys();\n"
  + "    if (pendingV != null && onSave) { try { onSave(); } catch (e0) {} }\n"
  + "    setBusy(\"validate\"); setErr(\"\"); setBottomTab(\"issues\"); setBottomOpen(true);");

/* 9. 注入 WYS_CSS */
sub("09 WYS_CSS 注入",
  '<style dangerouslySetInnerHTML={{ __html: PV_CSS }} />',
  '<style dangerouslySetInnerHTML={{ __html: PV_CSS + WYS_CSS }} />');

/* 10. 预览容器：托管控件交给同步 effect，自己不再写 innerHTML；挂上就地编辑事件 */
sub("10 预览容器改就地编辑层",
  '            <div\n'
  + '              ref={pvRef}\n'
  + '              className="pv-root"\n'
  + '              onClick={onPreviewClick}\n'
  + '              onMouseUp={capturePvQuote}\n'
  + '              style={{ flex: 1, overflowY: "auto", padding: "6px 22px 48px", fontSize: 14, lineHeight: 1.8, maxWidth: 860, margin: "0 auto", width: "100%" }}\n'
  + '              dangerouslySetInnerHTML={{ __html: pv.html }}\n'
  + '            />',
  '            <div\n'
  + '              ref={pvRef}\n'
  + '              className="pv-root"\n'
  + '              onClick={onPreviewClick}\n'
  + '              onMouseUp={capturePvQuote}\n'
  + '              onFocus={wysOn ? onWysFocusIn : undefined}\n'
  + '              onBlur={wysOn ? onWysFocusOut : undefined}\n'
  + '              onKeyDown={wysOn ? onWysKeyDown : undefined}\n'
  + '              onPaste={wysOn ? onWysPaste : undefined}\n'
  + '              contentEditable={false}\n'
  + '              suppressContentEditableWarning\n'
  + '              style={{ flex: 1, overflowY: "auto", padding: "6px 22px 48px", fontSize: 14, lineHeight: 1.8, maxWidth: 860, margin: "0 auto", width: "100%" }}\n'
  + '            />');

/* 11. 工具栏：就地编辑开关 */
sub("11 工具栏开关",
  '        <button style={{ ...tbtn, border: "none", background: "transparent", color: view === "preview" ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))", fontWeight: view === "preview" ? 700 : 400 }} onClick={() => goView("preview")}>📑 预览</button>',
  '        <button style={{ ...tbtn, border: "none", background: "transparent", color: view === "preview" ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))", fontWeight: view === "preview" ? 700 : 400 }} onClick={() => goView("preview")}>📑 预览</button>\n'
  + '        <button\n'
  + '          style={{ ...tbtn, border: "none", background: "transparent", color: wysOn ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))", fontWeight: wysOn ? 700 : 400 }}\n'
  + '          onClick={() => { if (wysOn) commitWys(); setWysOn(!wysOn); }}\n'
  + '          title="可视化视图里直接改正文与标题；公式 / 引用 / 浮动体保持原子不可误伤，改完失焦即写回源码（只替换被改的块）"\n'
  + '        >{wysOn ? "✏ 就地编辑" : "🔒 只读预览"}</button>');

/* 12. 状态栏：把就地编辑状态推给宿主（v0.6.2 起新增的 setStatus 贡献面） */
sub("12 状态栏条目",
  '    items.push({ id: "pos", text: "Ln " + cursor.line + ", Col " + cursor.col, title: "光标位置" });\n'
  + '    try { props.setStatus(items.slice(0, 6)); } catch (e) {}\n'
  + '  }, [stats, cursor.line, cursor.col, issues, isActiveEditor, props.setStatus]);',
  '    if (view !== "src" && wysOn) items.push({ id: "wys", text: "✏ 就地编辑", title: "可视化视图可直接改正文与标题；失焦即写回源码，只替换被改的块" });\n'
  + '    items.push({ id: "pos", text: "Ln " + cursor.line + ", Col " + cursor.col, title: "光标位置" });\n'
  + '    try { props.setStatus(items.slice(0, 6)); } catch (e) {}\n'
  + '  }, [stats, cursor.line, cursor.col, issues, isActiveEditor, props.setStatus, view, wysOn]);');

/* 13. toast 停留时长：带撤销按钮时给足时间 */
sub("13 toast 时长",
  "    const t = setTimeout(() => setToast(null), 2600);",
  "    const t = setTimeout(() => setToast(null), toast.undo ? 9000 : 2600);");

/* 14. toast 撤销按钮 */
sub("14 toast 撤销",
  "          {toast.msg}\n        </div>\n      ) : null}\n    </div>\n  );\n}",
  "          <span>{toast.msg}</span>\n"
  + "          {toast.undo ? (\n"
  + "            <button\n"
  + "              onClick={undoWys}\n"
  + "              style={{\n"
  + "                marginLeft: 10, border: \"1px solid hsl(var(--border))\", borderRadius: 6,\n"
  + "                background: \"transparent\", color: \"hsl(var(--primary))\",\n"
  + "                fontSize: 11.5, padding: \"1px 8px\", cursor: \"pointer\",\n"
  + "              }}\n"
  + "            >↩ 撤销</button>\n"
  + "          ) : null}\n"
  + "        </div>\n      ) : null}\n    </div>\n  );\n}");

if (src === before) { console.error("没有任何改动"); process.exit(1); }
fs.writeFileSync(f, src);
console.log("\n✓ panels/editor.tsx 已更新（" + done + " 处）");
