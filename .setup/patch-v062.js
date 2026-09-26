/* v0.6.2 —— 修「宿主大纲点了永远跳第 1 行」+ 接上新增的状态栏贡献面
 *
 * ============================ 事故：大纲定位 ============================
 * 症状（用户反馈：「大纲定位有问题」）：
 *   左侧「大纲」页签里点任何一条，都跳到**第 1 行**（页面顶部）；层级也全平，没有缩进。
 *
 * 真凶：宿主 1.3.3+ 改了 parseItems 的前置步骤，我们的返回形态踩空了。
 *   装机版 app.asar → dist/assets/index-*.js 里，真代码是这么串的：
 *
 *     function extractToolText(it){                       // ← 新版新增的一步
 *       if(typeof it=="string") return it;
 *       if(it && typeof it=="object"){
 *         if(typeof it.content=="string") return it.content;
 *         if(Array.isArray(it.content))
 *           return it.content.map(x=> x?.text ?? "").filter(Boolean).join("\n");  // ★ 把我们 content[] 拍成多行文本
 *         try{ return JSON.stringify(it) }catch{ return "" }
 *       }
 *       return String(it ?? "")
 *     }
 *     function parseItems(it){
 *       const te = extractToolText(it).trim();            // ★ 先拍平
 *       if(!te) return [];
 *       try{ const d=JSON.parse(te); ... }catch{}         // 我们拍出来的是纯文本，JSON.parse 必失败
 *       return parseLineProtocol(te);                     // → 落到行协议分支
 *     }
 *     function parseLineProtocol(it){
 *       return it.split("\n").map(...).map(line=>{
 *         const p=line.split("|");
 *         if(p.length===1) return {level:1,text:line};    // ★ 没有 "|" ⇒ level 恒 1、anchor **undefined**
 *         const[l,t,a]=p; return {level:..,text:..,anchor:a?.trim()||undefined};
 *       })
 *     }
 *
 *   而我们的 latex_outline 宿主通路返回的是「一条一项的 content 数组」，
 *   level/anchor 挂在**内容块上**——被 extractToolText 一拍，两个键全丢，
 *   文本里又没有 "|" 分隔符 ⇒ 宿主拿到 5 条 {level:1} 且 anchor=undefined。
 *
 *   宿主点击条目时发的是：   const anchor = item.anchor ?? item.text;   // 见 PluginOutlineItems
 *   anchor 缺失就退化成**标题文本**（"2.1  模型结构"）回抛；
 *   旧编辑器侧写的是：       const ln = Math.max(1, Number(d.anchor) || 0);
 *   Number("2.1  模型结构")=NaN → NaN||0=0 → Math.max(1,0)=1 ⇒ **静默跳第 1 行**。
 *   三条叠加 = 「点大纲没用 / 都跑顶上」。层级丢失是同一根因的另一面。
 *
 * 为什么仓库里的验收没拦住：.setup/check/host-parse-items.js 是**旧宿主**的复刻
 * （旧版没有 extractToolText，content[] 是当条目数组直接读的，level/anchor 反而保得住），
 * verify-host-parse.js 又写死了旧 bundle 名 index-XIov55p-.js —— 门在测一个不存在的宿主。
 *
 * 修法（三层，缺一层都可能再翻车）：
 *   ① server/contrib.js 宿主通路改返回**单条 JSON 字符串**：
 *      extractToolText 拍平后拿到的正好是那段 JSON → JSON.parse 成功 → 走 mapItemArray
 *      → level/anchor 原样保住（mapItemArray 读的就是 {level,text,anchor}）。
 *   ② panels/editor.tsx 的 notrat-outline-navigate 不再把非数字锚点兜成 1：
 *      数字锚点才跳；否则按条目标题回源码查行号；都落空就明说，绝不瞎跳。
 *   ③ 验收门换成**真·当前宿主**的解析链（.setup/check/host-parse-items.js 重取，
 *      并断言 level/anchor 真的过得去），门从此测的是装机版。
 *
 * ======================== 新增贡献面：状态栏 ========================
 * 宿主 PluginEditorHost 现在给编辑器组件多注入一个 setStatus：
 *   setStatus([{ id, text, title? }])   —— 只收数组；宿主自身 MAX_ITEMS=6 / MAX_TEXT=80 截断+
 *                                          按 id+text+title 去重（内容不变不重渲）；
 *                                          卸载自动 clear(ownerId)。
 *   ⚠ ownerId = `plugin-editor:<贡献key>`，**按编辑器而不是按文件**记账：
 *     同时开多个 .tex 时，谁后写谁占坑。所以只在「本实例是当前活动编辑器」时才推。
 * 本插件推送：节数 / 公式·图·表 / 引用·字数 / TODO / 校验结果 / 光标行列 —— 全部本地统计
 * （状态栏跟着每次按键变，绝不能挂 MCP 往返）。
 */
const fs = require("fs");
const path = require("path");
const WS = "E:/notrat-latex-plugin";
const rd = (p) => fs.readFileSync(p, "utf8");
const wr = (p, s) => fs.writeFileSync(p, s);
let bad = 0;
function must(cond, msg) { if (!cond) { console.error("  ✗ " + msg); bad++; } else console.log("  ✓ " + msg); }

/* ============================================================ *
 * 1. server/contrib.js —— 宿主通路改返回单条 JSON 字符串
 * ============================================================ */
{
  const p = path.join(WS, "server", "contrib.js");
  let s = rd(p);

  const reOld = /function outlineHostItems\(res, depth\) \{[\s\S]*?\n\}/;
  const m = reOld.exec(s);
  must(!!m, "contrib.js 找到 outlineHostItems 函数体");
  if (!m) { console.error("    （锚点失效，终止）"); process.exit(1); }

  const NEW = String.raw`function outlineHostItems(res, depth) {
  const rows = outlineRows(res, depth);
  return rows.map(function (r) {
    return {
      level: Math.max(1, Math.min(6, Number(r.level) || 1)),
      text: (r.number ? r.number + "  " : "") + r.title,
      anchor: String(r.line),
    };
  });
}

/**
 * 宿主内置大纲（manifest editors[].outlineTool）的**线上返回形态** —— 单条 JSON 字符串。
 *
 * ⚠ 不要改回「一条一项的 content 数组」：level/anchor 挂在内容块上会被宿主
 *   extractToolText() 拍平丢光（它只 join content[].text），最终退化成
 *   parseLineProtocol 的 { level:1, anchor:undefined } —— 层级全平 + 点击跳第 1 行。
 *   详见 .setup/patch-v062.js 头部的事故记录与 .setup/check/host-parse-items.js（真宿主任取）。
 *
 * 走的是宿主 parseItems 的第 ② 条分支：
 *   extractToolText → 这段 JSON 字符串 → JSON.parse 成功 → 数组分支 → mapItemArray
 *   → { level: clampLevel(level), text: String(text).trim(), anchor: String(anchor) } 全部保住。
 *
 * 面板 / AI 通路不受影响，仍旧走 outlineProtocol 的 list 行协议文本。
 */
function outlineHostPayload(res, depth) {
  return JSON.stringify(outlineHostItems(res, depth));
}`;

  s = s.replace(reOld, NEW);
  must(/function outlineHostPayload\(res, depth\) \{/.test(s), "contrib.js +outlineHostPayload（JSON 字符串形态）");

  const expOld = "  outlineHostItems: outlineHostItems,";
  must(s.split(expOld).length - 1 === 1, "contrib.js 导出锚点唯一命中");
  s = s.replace(expOld, "  outlineHostItems: outlineHostItems,\n  outlineHostPayload: outlineHostPayload,");
  must(s.includes("outlineHostPayload: outlineHostPayload,"), "contrib.js 导出 outlineHostPayload");
  wr(p, s);
}

/* ============================================================ *
 * 2. server/index.js —— latex_outline 宿主分支改调 payload
 * ============================================================ */
{
  const p = path.join(WS, "server", "index.js");
  let s = rd(p);

  const oldLine = "    return wantHost ? CONTRIB.outlineHostItems(res, depth) : CONTRIB.outlineProtocol(res, depth);";
  must(s.split(oldLine).length - 1 === 1, "index.js 找到宿主分支调用点");
  s = s.replace(oldLine, "    return wantHost ? CONTRIB.outlineHostPayload(res, depth) : CONTRIB.outlineProtocol(res, depth);");

  const marker = "    // 宿主内置大纲（editors[].outlineTool）只传 filePath/fileName，不带 path/format。";
  must(s.split(marker).length - 1 === 1, "index.js 找到契约注释锚点");
  s = s.replace(
    marker,
    [
      "    // 宿主内置大纲（editors[].outlineTool）只传 filePath/fileName，不带 path/format。",
      "    // ⚠ v0.6.2 起该通路返回**单条 JSON 字符串**（outlineHostPayload）：",
      "    //   宿主 1.3.3+ 的 parseItems 先用 extractToolText 把 content[].text 拍平，",
      "    //   挂在内容块上的 level/anchor 会被丢掉 ⇒ 层级全平 + 点击锚点退化成标题文本 ⇒ 跳第 1 行。",
      "    //   返回 JSON 字符串则被 JSON.parse 认下，走 mapItemArray，level/anchor 完整保住。",
    ].join("\n")
  );
  must(s.includes("CONTRIB.outlineHostPayload(res, depth)"), "index.js 宿主分支已切到 outlineHostPayload");
  wr(p, s);
}

/* ============================================================ *
 * 3. panels/editor.tsx —— 锚点三层兜底 + 状态栏 setStatus
 * ============================================================ */
{
  const p = path.join(WS, "panels", "editor.tsx");
  let s = rd(p);

  /* ---------- 3a. 模块级：锚点 → 行号 ---------- */
  const anchorFn = "  function sameAsFile(p) {";
  must(s.split(anchorFn).length - 1 === 1, "editor.tsx 找到 sameAsFile 锚点");
  const HELPERS = String.raw`  /* ================= 大纲锚点 → 行号（模块级纯函数） =================
   *
   * 宿主只保证回抛 detail={pluginId,editorId,anchor,item}，anchor 的语义是
   * 「outlineTool 返回什么就回传什么」，而且缺失时会**退化成条目标题文本**
   * （见 PluginOutlineItems：const anchor = item.anchor ?? item.text）。
   *
   * 旧实现 「Math.max(1, Number(d.anchor) || 0)」 对非数字锚点会静默得 1 —— 这就是
   * 「怎么点都跳第 1 行」的直接原因。现在宁可不跳（并明说），也不跳错地方。
   */

  /** 标题 → 行号：去掉自动编号后在各 \section 家族命令里回查。 */
  function lineOfSectionTitle(content, raw) {
    const base = String(raw == null ? "" : raw).replace(/\s+/g, " ").trim();
    if (!base) return 0;
    const wants = [base];
    const stripped = base.replace(/^\s*(?:\d+(?:\.\d+)*|[A-Z](?:\.\d+)*|第\s*\d+\s*部分)[\s.、·]+/, "").trim();
    if (stripped && stripped !== base) wants.push(stripped);
    const lines = String(content || "").split("\n");
    const re = /\\(part|chapter|section|subsection|subsubsection)\*?\s*\{([^}]*)\}/;
    let loose = 0;
    for (let i = 0; i < lines.length; i++) {
      const m = re.exec(lines[i]);
      if (!m) continue;
      const title = m[2].replace(/\s+/g, " ").trim();
      for (let k = 0; k < wants.length; k++) {
        if (title === wants[k]) return i + 1;
        if (!loose && wants[k].length >= 2 && (title.indexOf(wants[k]) >= 0 || wants[k].indexOf(title) >= 0)) loose = i + 1;
      }
    }
    return loose;
  }

  /** detail → 行号。数字锚点优先；否则按标题回查；都没有返回 0（**不返回 1**）。 */
  function resolveOutlineLine(detail, content) {
    const d = detail || {};
    const item = d.item || {};
    const cands = [d.anchor, item.anchor, item.line, item.lineNumber];
    for (let i = 0; i < cands.length; i++) {
      const raw = cands[i];
      if (raw == null || raw === "") continue;
      const str = String(raw).trim();
      if (!/^\d+$/.test(str)) continue; // 只认纯数字行号：文本锚点绝不 Number() 后瞎跳
      const n = parseInt(str, 10);
      if (Number.isFinite(n) && n >= 1) return n;
    }
    return lineOfSectionTitle(content, d.anchor != null ? d.anchor : item.text);
  }

`;
  s = s.replace(anchorFn, HELPERS + anchorFn);

  /* ---------- 3b. 换掉宿主大纲监听 ---------- */
  const oldEffect = [
    "  useEffect(() => {",
    "    function onHostOutline(e) {",
    "      const d = (e && e.detail) || {};",
    "      if (d.pluginId && d.pluginId !== pluginId) return; // 别的插件的大纲，不接",
    "      const ln = Math.max(1, Number(d.anchor) || 0);",
    "      if (!ln || !gotoLineRef.current) return;",
    "      gotoLineRef.current(ln);",
    "    }",
    "    window.addEventListener(\"notrat-outline-navigate\", onHostOutline);",
    "    return () => window.removeEventListener(\"notrat-outline-navigate\", onHostOutline);",
    "  }, [pluginId]);",
  ].join("\n");
  must(s.split(oldEffect).length - 1 === 1, "editor.tsx 找到旧 onHostOutline 监听（唯一）");

  const newEffect = String.raw`  useEffect(() => {
    function onHostOutline(e) {
      const d = (e && e.detail) || {};
      if (d.pluginId && d.pluginId !== pluginId) return; // 别的插件的大纲，不接
      /* 不按 d.editorId 过滤：宿主传的是注册表 id（plugin-editor:<贡献key>），不是 manifest 里的
       * "latex-editor" —— 早先按字面量比过，会把自家事件全挡在门外，别再加回来。
       * pluginId 这一层已经足够：宿主大纲只在「本编辑器接管当前文件」时才用我们的条目。 */
      const ln = resolveOutlineLine(d, content);
      if (!ln) {
        setToast({ msg: "⚠ 这条大纲没能定位到源码行（锚点不是行号，标题也没匹配上）" });
        return;
      }
      if (!gotoLineRef.current) return;
      gotoLineRef.current(ln);
    }
    window.addEventListener("notrat-outline-navigate", onHostOutline);
    return () => window.removeEventListener("notrat-outline-navigate", onHostOutline);
  }, [pluginId, content]);`;
  s = s.replace(oldEffect, newEffect);

  /* ---------- 3c. 状态栏 setStatus ---------- */
  const cursorEffectTail = "  }, [cursor.line, cursor.col, filePath]);";
  must(s.split(cursorEffectTail).length - 1 === 1, "editor.tsx 找到光标广播 effect 尾部（唯一）");

  const STATUS = String.raw`

  /* ---------- 状态栏（v0.6.2 新贡献面：props.setStatus） ----------
   * 宿主契约（装机版 PluginEditorHost / usePluginEditorStatusStore）：
   *   setStatus([{ id, text, title? }])  —— 只收数组；MAX_ITEMS=6 / MAX_TEXT=80 由宿主截断；
   *   按 id+text+title 去重，内容不变不重渲；组件卸载宿主自动 clear(ownerId)。
   * ⚠ ownerId 按「编辑器贡献」记账而不是按文件：多开 .tex 会互相盖，
   *   所以只在「本实例是当前活动编辑器」时才推（活动身份复用本插件已有的活动文件桥）。
   */
  const [isActiveEditor, setIsActiveEditor] = useState(true);
  useEffect(() => {
    function onActive(e) {
      const p = String((e && e.detail && e.detail.path) || "");
      setIsActiveEditor(!p || !filePath || sameAsFile(p));
    }
    window.addEventListener(LATEX_EV, onActive);
    return () => window.removeEventListener(LATEX_EV, onActive);
  }, [filePath]);

  /* 本地统计：状态栏每键都要更新，绝不能挂 MCP 往返 */
  const stats = useMemo(() => {
    const lines = content.split("\n");
    let sec = 0, eq = 0, fig = 0, tab = 0, cite = 0, todo = 0;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/^\s*%/.test(l)) continue;
      if (/\\(part|chapter|section|subsection|subsubsection)\*?\s*\{/.test(l)) sec++;
      if (/\\begin\{(equation|align|gather|eqnarray|multline|displaymath)\*?\}/.test(l)) eq++;
      if (/\\begin\{figure\*?\}/.test(l)) fig++;
      if (/\\begin\{table\*?\}/.test(l)) tab++;
      if (/\\cite[a-zA-Z]*\s*\{/.test(l)) {
        const hits = l.match(/\\cite[a-zA-Z]*\s*\{[^}]*\}/g) || [];
        for (let k = 0; k < hits.length; k++) cite += hits[k].replace(/^[^{]*\{|\}$/g, "").split(",").filter(Boolean).length;
      }
      if (/%.*\b(TODO|FIXME|XXX)\b/i.test(l)) todo++;
    }
    return { sec: sec, eq: eq, fig: fig, tab: tab, cite: cite, todo: todo, words: countWords(content).total };
  }, [content]);

  useEffect(() => {
    if (typeof props.setStatus !== "function") return;
    if (!isActiveEditor) return; // 非活动实例保持沉默：宿主只认一个 owner，抢着推只会互相盖
    const items = [
      { id: "sec", text: "📑 " + stats.sec + " 节", title: "章节数（\\part / \\chapter / \\section / \\subsection / \\subsubsection）" },
      { id: "env", text: "∑" + stats.eq + " · 图" + stats.fig + " · 表" + stats.tab, title: "公式 / 图 / 表环境数" },
      { id: "cite", text: "🔖 " + stats.cite + " · ≈" + stats.words + " 字", title: "\\cite 引用数 · 近似字数（CJK 字 + 英文词）" },
    ];
    if (stats.todo) items.push({ id: "todo", text: "📌 " + stats.todo + " 待办", title: "源码注释里的 TODO / FIXME" });
    if (issues && issues.summary) {
      const sm = issues.summary;
      items.push({
        id: "issue",
        text: (sm.errors + sm.warnings > 0 ? "⚠ " : "✅ ") + sm.errors + " 错 / " + sm.warnings + " 警",
        title: "引用校验结果（点工具栏「校验」刷新）",
      });
    }
    items.push({ id: "pos", text: "Ln " + cursor.line + ", Col " + cursor.col, title: "光标位置" });
    try { props.setStatus(items.slice(0, 6)); } catch (e) {}
  }, [stats, cursor.line, cursor.col, issues, isActiveEditor, props.setStatus]);`;

  s = s.replace(cursorEffectTail, cursorEffectTail + STATUS);
  const codeOnly = s.replace(//*[sS]*?*//g, "").replace(/^s*//.*$/gm, "");
  const codeOnly = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  must(!/Number\(d\.anchor\)/.test(codeOnly), "editor.tsx 旧的「非数字锚点兜成 1」已消失（去注释后再查）");
  must(s.includes("resolveOutlineLine(d, content)"), "editor.tsx 已改用三层兜底解析");
  must(s.includes("props.setStatus(items.slice(0, 6))"), "editor.tsx 已接状态栏 setStatus");

  /* ---------- 3d. 顶部注释补一行契约 ---------- */
  const head = " * props: { pluginId, ctx, file, content, onChange, onSave, fileName, filePath }";
  if (s.includes(head)) {
    s = s.replace(
      head,
      " * props: { pluginId, ctx, file, content, onChange, onSave, fileName, filePath,\n *          mode?, onModeSwitch?, setStatus }   // dualView 声明后才有 mode/onModeSwitch；setStatus 恒有"
    );
    console.log("  ✓ editor.tsx 顶部 props 契约已补 mode/onModeSwitch/setStatus");
  } else {
    console.log("  ! editor.tsx 顶部 props 注释锚点未命中（跳过，不影响功能）");
  }

  wr(p, s);
}

/* ============================================================ *
 * 4. 版本号 0.6.1 → 0.6.2
 * ============================================================ */
{
  const p = path.join(WS, "manifest.json");
  let s = rd(p);
  must(s.includes('"version": "0.6.1"'), "manifest 当前版本 0.6.1");
  s = s.replace('"version": "0.6.1"', '"version": "0.6.2"');
  wr(p, s);
  console.log("  ✓ manifest.json → 0.6.2");
}

console.log(bad ? "\n✗ 补丁有 " + bad + " 处未命中，请检查后再跑" : "\n✓ 补丁全部命中（v0.6.2）");
process.exitCode = bad ? 1 : 0;
