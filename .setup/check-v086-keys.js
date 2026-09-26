/* v0.8.6 验收层：格式快捷键（Typora 键位 → LaTeX）
 *
 * 为什么值得单独一层：这版新增 20 条键位，**没有键位表就没有验收** ——
 * 最容易出的错不是「按了没反应」，而是「菜单右侧写着 Ctrl+T，实际按下去什么都没发生」。
 * 所以这一层的核心断言是「菜单上标的键位 == 真的实现了的键位」。
 *
 * 做法沿用 check-v085：从**装机产物**里把模块级代码块抠出来求值（不是照抄一遍源码）——
 * 源码改了这里先红。
 *
 * 钉四件事：
 *   ① 表自洽：键位不冲突 / 每项都有可执行动作 / 分组都有归属
 *   ② 菜单键位提示 ↔ FMT 表一一对应（防「标了没做」）
 *   ③ expandTpl 模板展开正确（纯函数，逐个用例手算期望值）
 *   ④ 不劫持既有快捷键（Ctrl+S 保存 / Ctrl+/ 切视图 / Tab 缩进）
 *
 * 运行： node .setup/check-v086-keys.js
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log("  ok    " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "\n        → " + x : "")));

/* ---------- 从装机产物抠出模块级代码块 ---------- */
const DEP = path.join(os.homedir(), ".notrat", "plugins", "notrat-latex-plugin.json");
const SRC = JSON.parse(fs.readFileSync(DEP, "utf8")).contributions.editors[0].source;

const i0 = SRC.indexOf("const INSERT_GROUPS");
const i1 = SRC.indexOf("const HEAD_RE");
if (i0 < 0 || i1 < 0 || i1 <= i0) {
  console.error("✗ 抠不到 v0.8.6 的模块级块（INSERT_GROUPS … HEAD_RE）—— 装机产物是不是旧的？");
  process.exit(1);
}
const BLOCK = SRC.slice(i0, i1);
const api = new Function(BLOCK + "\nreturn { FMT, INSERTS, INSERT_GROUPS, expandTpl, physOf };")();

console.log("[1] 表自洽");
{
  ok("FMT 表非空（" + api.FMT.length + " 条）", api.FMT.length >= 18);
  const bad = api.FMT.filter((f) => !f.name || (f.e == null && f.head == null) || (!f.k && !f.code));
  ok("每项都有 name + 可执行动作 + 匹配键", bad.length === 0, JSON.stringify(bad.map((f) => f.name)));
  const ctrl = api.FMT.filter((f) => f.head != null);
  ok("章节层级 6 档齐全（Ctrl+1..5 + Ctrl+0）", ctrl.length === 6, ctrl.map((f) => f.k + "→" + f.head).join(" "));
  ok("Ctrl+0 = 变回正文（head 为空串，不是缺省）", ctrl.some((f) => f.k === "0" && f.head === ""));
}

console.log("\n[2] 键位不冲突（同一 key+shift 组合只能有一条）");
{
  const seen = new Map();
  const dup = [];
  for (const f of api.FMT) {
    const id = (f.code || f.k) + (f.shift ? "+shift" : "");
    if (seen.has(id)) dup.push(id + "（" + seen.get(id) + " 与 " + f.name + "）");
    seen.set(id, f.name);
  }
  ok("无重复键位", dup.length === 0, dup.join(" / "));
}

console.log("\n[3] 菜单键位提示 ↔ FMT 表一一对应（核心：防「标了没做」）");
{
  /* "Ctrl+1" → shift=false,key=1；"Ctrl+Shift+M" → shift=true,key=m；"Ctrl+Shift+`" → code=Backquote */
  function parseHint(h) {
    const parts = h.split("+");
    const shift = parts.indexOf("Shift") >= 0;
    const last = parts[parts.length - 1];
    return { shift, k: last.toLowerCase(), code: last === "`" ? "Backquote" : null };
  }
  const withHint = api.INSERTS.filter((it) => it[3]);
  ok("有键位提示的菜单项 " + withHint.length + " 条", withHint.length >= 10);
  const orphans = [];
  for (const it of withHint) {
    const { shift, k, code } = parseHint(it[3]);
    const hit = api.FMT.filter((f) => !!f.shift === shift && (f.code ? f.code === code : f.k === k))[0];
    if (!hit) orphans.push(it[0] + " → " + it[3]);
  }
  ok("每条提示都能在 FMT 里找到实现（没标空头支票）", orphans.length === 0, orphans.join(" / "));

  /* 反向：文档段落里承诺的那批键位，FMT 里得真的都有 */
  const promised = [["b", false], ["i", false], ["u", false], ["k", false], ["m", false], ["t", false],
                    ["m", true], ["k", true], ["q", true], ["i", true], ["u", true], ["o", true]];
  const missing = promised.filter(([k, sh]) => !api.FMT.some((f) => f.k === k && !!f.shift === sh));
  ok("注释里承诺的键位都实现了", missing.length === 0, missing.map((x) => x[0] + (x[1] ? "+shift" : "")).join(","));
  ok("反引号项走 code 匹配（Shift 会把它变成 ~，key 不可靠）",
     api.FMT.some((f) => f.code === "Backquote" && f.shift === true));
}

console.log("\n[4] 分组：每个插入项都有归处，且分组顺序就是渲染顺序");
{
  const bad = api.INSERTS.filter((it) => api.INSERT_GROUPS.indexOf(it[4]) < 0);
  ok("所有插入项的分组都在 INSERT_GROUPS 里", bad.length === 0, JSON.stringify(bad.map((it) => it[0])));
  const used = api.INSERT_GROUPS.filter((g) => api.INSERTS.some((it) => it[4] === g));
  ok("没有空分组", used.length === api.INSERT_GROUPS.length,
     api.INSERT_GROUPS.filter((g) => !used.includes(g)).join(","));
}

console.log("\n[5] expandTpl 模板展开（纯函数，手算期望值逐条比）");
{
  const find = (k, shift) => api.FMT.filter((f) => f.k === k && !!f.shift === shift)[0];
  const eq = (label, got, wt, wc) => ok(label + "  → " + JSON.stringify(got.text) + " caret=" + got.caret,
    got.text === wt && got.caret === wc, "期望 " + JSON.stringify(wt) + " caret=" + wc);

  const bold = find("b", false);
  eq("Ctrl+B 无选区（光标进 {} 里）", api.expandTpl(bold.e, ""), "\\textbf{}", 8);
  eq("Ctrl+B 包住选区（光标落内容末尾）", api.expandTpl(bold.s, "abc"), "\\textbf{abc}", 12);

  const link = find("k", false);
  eq("Ctrl+K 无选区（光标进第一个 {} 填 URL）", api.expandTpl(link.e, ""), "\\href{}{}", 6);
  eq("Ctrl+K 包住选区（选区当显示文本、光标回 URL）", api.expandTpl(link.s, "论文"), "\\href{}{论文}", 6);

  const math = find("m", false);
  eq("Ctrl+M 无选区", api.expandTpl(math.e, ""), "$$", 1);
  eq("Ctrl+M 包住选区", api.expandTpl(math.s, "x^2"), "$x^2$", 5);

  const code = api.FMT.filter((f) => f.code === "Backquote")[0];
  eq("Ctrl+Shift+` 包住选区", api.expandTpl(code.s, "ls"), "\\texttt{ls}", 11);

  const eqn = find("m", true);
  eq("Ctrl+Shift+M 公式块（光标落在环境体内）",
     api.expandTpl(eqn.e, ""), "\\begin{equation}\n  \n\\end{equation}", 19);

  /* 选区里带反斜杠 / 花括号也不能被吃掉（不做任何转义 = 原样落进去） */
  const ital = find("i", false);
  eq("选区含 LaTeX 命令时原样保留", api.expandTpl(ital.s, "\\alpha"), "\\textit{\\alpha}", 15);
}

console.log("\n[6] 不劫持既有快捷键（Ctrl+S / Ctrl+/ / Tab 各自还在原位）");
{
  ok("FMT 里没有 Ctrl+S", !api.FMT.some((f) => f.k === "s" && !f.shift));
  ok("FMT 里没有 Ctrl+/", !api.FMT.some((f) => f.k === "/"));
  ok("FMT 里没有 Tab", !api.FMT.some((f) => f.k === "tab"));
  /* 放行逻辑得在源码里看得见（不是靠「恰好没冲突」） */
  ok("onFmtKey 显式让位给 Tab / s / /（不是碰运气）",
     /if \(e\.key === "Tab" \|\| k === "s" \|\| e\.key === "\/"\) return;/.test(SRC));
  /* v0.8.11：这条契约变了。以前是「预览区让开」，现在是「预览区也接管」——
   * 用户报的就是在可视化档（插件默认打开的那一档）按 Ctrl+1 毫无反应、
   * 而且连一句提示都没有。但底线没变，只是判据拆成了三道门，一句对一道： */
  ok("源码 / 分屏档仍要求焦点在 textarea（老行为一个字没动）",
     /if \(ta && document\.activeElement === ta\) \{/.test(SRC));
  ok("可视化档改由预览层接管（默认这一档以前按 Ctrl+1 毫无反应）",
     /if \(ta \|\| viewRef\.current !== "preview"\) return;/.test(SRC));
  ok("预览层找不到光标所在块时放行（不认识的地方绝不抢）",
     /if \(!fw\(e\)\) return;/.test(SRC));
  ok("命中的键位才 preventDefault（没命中一律放行）",
     /if \(!fn\(e\)\) return;[\s\S]{0,120}preventDefault\(\)/.test(SRC));
}

console.log("\n[7] 订阅链路：按键 → onFmtKey → fmtRef → applyFmt（断哪一环都是「按了没反应」）");
{
  /* 挂载：捕获阶段挂在根节点上（先于组件内部的 onKeyDown，与既有的 Ctrl+/ 同一层） */
  ok("root 上注册了 onFmtKey（捕获阶段）",
     /root\.addEventListener\("keydown", onFmtKey, true\)/.test(SRC));
  /* 卸载：不注销会在重渲染后叠加监听（同一按键跑多次） */
  ok("卸载时注销 onFmtKey（不叠加监听）",
     /root\.removeEventListener\("keydown", onFmtKey, true\)/.test(SRC));
  /* 桥接：effect 只挂一次，闭包会锁死旧 content —— 必须经 ref 取最新那个 */
  ok("fmtRef 声明了", /const fmtRef = useRef\(null\)/.test(SRC));
  ok("渲染期把 applyFmt 桥进 fmtRef", /fmtRef\.current = applyFmt;/.test(SRC));
  ok("onFmtKey 经 fmtRef.current 取函数（不是直接闭包 applyFmt）",
     /const fn = fmtRef\.current;/.test(SRC) && /typeof fn !== "function"/.test(SRC));

  /* 词法顺序：fmtRef 的声明必须在赋值之前（否则就是 v0.7.1 那个 TDZ 崩溃的同款） */
  const declAt = SRC.indexOf("const fmtRef = useRef(null)");
  const assignAt = SRC.indexOf("fmtRef.current = applyFmt;");
  const fmtDefAt = SRC.indexOf("function applyFmt(e)");
  ok("fmtRef 声明（" + declAt + "）早于赋值（" + assignAt + "）", declAt >= 0 && declAt < assignAt);
  ok("applyFmt 声明（" + fmtDefAt + "）早于 fmtRef 赋值（" + assignAt + "）", fmtDefAt >= 0 && fmtDefAt < assignAt);

  /* 光标回填这条支路：格式快捷键要能把光标放到指定位，且不能和既有的 pendingCursor 打架 */
  ok("pendingRange 声明了", /const pendingRange = useRef\(null\)/.test(SRC));
  ok("回填时区间优先、并清掉另一个（否则下一拍被拽回旧位置）",
     /if \(pendingRange\.current\) \{[\s\S]{0,240}pendingCursor\.current = null;/.test(SRC));
  ok("applyFmt 经 writeSrc 回填光标（v0.8.7：内容没变时也要归位）",
     /writeSrc\(content\.slice\(0, s0\) \+ ex\.text \+ content\.slice\(e0\), s0 \+ ex\.caret\)/.test(SRC));

  /* 章节层级那条支路：有选区包住 / 没选区改整行 / 已是命令则只换层级 */
  ok("章节层级走 applyHead（不是模板插入）", /if \(hit\.head != null\) \{ applyHead\(hit\.head\); return true; \}/.test(SRC));
  /* 字面包含判断（不数反斜杠层数）：源码里那一行是
   *   const ins = cmd ? "\\" + cmd + "{" + m[1] + "}" : m[1];
   * 注意 needle 用单引号 JS 串写，其中的两个反斜杠要写成 \\\\ */
  ok("applyHead 用 HEAD_RE 识别已有章节命令（升降级不丢标题）",
     SRC.includes("const m = HEAD_RE.exec(body)") &&
     SRC.includes('const ins = (cmd ? "\\\\" + cmd + "{" + m[1] + "}" : m[1]) + (tail ? " " : "");'));
  ok("applyHead 认得带 * 的星号版章节命令", /\\\(\?:part\|chapter\|section[^)]*\|paragraph\|subparagraph\)\\\*\?/.test(SRC));
}

console.log("\n[8] v0.8.7 三症状回归（探针 .setup/_probe-interact.js 里都有复现；这里的断言防它回来）");
{
  /* 症状 1a：光标不归位 —— 内容「改了等于没改」时 React bail out，[content] effect 不跑 */
  ok("writeSrc 存在，且处理「内容没变」这一支（当场归位）",
     /function writeSrc\(next, caret\)/.test(SRC) && /if \(next === content\) \{/.test(SRC));
  ok("writeSrc 里直接 focus + setSelectionRange（不走 pendingRange，那要等重渲染）",
     /if \(ta\) \{ ta\.focus\(\); try \{ ta\.setSelectionRange\(caret, caret\); \} catch \(e\) \{\} \}/.test(SRC));
  ok("章节层级与模板插入都收敛到 writeSrc（两条路行为一致）",
     (SRC.match(/writeSrc\(/g) || []).length >= 3);

  /* 症状 1b：把非标题行整行包成 \section{} */
  ok("applyHead 剥行尾注释（不把 % 注释吃进标题）",
     /const ci = raw\.indexOf\("%"\)/.test(SRC) && /const tail = ci >= 0 \? raw\.slice\(ci\) : ""/.test(SRC));
  ok("applyHead 拒绝把以 \\ 开头的行包成标题（导言区命令不是正文）",
     /t\.charAt\(0\) === "\\\\"/.test(SRC) && /章节快捷键不接管/.test(SRC));
  ok("注释剥离后仍复用 HEAD_RE（升降级路径不受影响）",
     /const body = ci >= 0 \? raw\.slice\(0, ci\) : raw;/.test(SRC));

  /* 症状 2 / 3：lastPvView 记忆被自己写进宿主的回抛覆盖 */
  const memRead = SRC.indexOf('lastPvView.current === "split"');
  const memWrite = SRC.indexOf('if (v !== "src") lastPvView.current = v;');
  ok("lastPvView：先读记忆、再写记忆（顺序反了分屏永远回不来）",
     memRead >= 0 && memWrite >= 0 && memRead < memWrite,
     "读@" + memRead + " 写@" + memWrite);
  ok("lastPvView 初值是 null（=「还没记忆」；填 \"split\" 会让首屏误落分屏）",
     /const lastPvView = useRef\(null\)/.test(SRC));
  ok("onCtrlSlash 读 lastPvView 时有 `|| \"split\"` 兜底（null 不会漏）",
     /lastPvView\.current \|\| "split"/.test(SRC));
}

console.log("\n[9] v0.8.7：物理键位兜底（输入法组字中 / 非 US 布局）");
{
  const ph = api.physOf;
  ok("physOf 存在（字母 → KeyX / 数字 → DigitN / 其余空串）",
     typeof ph === "function" && ph("b") === "KeyB" && ph("1") === "Digit1" && ph("`") === "" && ph("%") === "");
  ok("e.key 命中路径没动（先比 e.key，兜底只在后面）",
     /if \(k === f\.k\) \{ hit = f; break; \}/.test(SRC));
  ok("applyFmt 里 e.key 不中时按 physOf(f.k) 再比一次",
     /if \(code && code === physOf\(f\.k\)\) \{ hit = f; break; \}/.test(SRC));
  ok("onCtrlSlash 接受物理键位 Slash（输入法把 key 报成 Process 也能换档）",
     /e\.key !== "\/" && e\.code !== "Slash"/.test(SRC));

  /* 矩阵：20 条键位在三种「浏览器真会给的事件形态」下都必须命中它自己（不能命中别人）。
   * 匹配器与 applyFmt 同形，physOf 用的就是从装机产物里抠出来的那一个。 */
  const hitOf = (e, noFallback) => {
    const k = (e.key || "").toLowerCase(), code = e.code || "";
    for (let i = 0; i < api.FMT.length; i++) {
      const f = api.FMT[i];
      if (!!f.shift !== !!e.shiftKey) continue;
      if (f.code) { if (code === f.code) return f; continue; }
      if (k === f.k) return f;
      if (!noFallback && code && code === ph(f.k)) return f;
    }
    return null;
  };
  const AZ = { "1": "&", "2": "é", "3": String.fromCharCode(34), "4": "'", "5": "(", "0": "à" };
  const evFor = (f, lay) => {
    if (f.code) return { key: lay === "us" ? (f.shift ? "~" : "`") : "Process", code: "Backquote", shiftKey: !!f.shift };
    const digit = /^[0-9]$/.test(f.k);
    if (lay === "ime") return { key: digit ? f.k : "Process", code: ph(f.k), shiftKey: !!f.shift };
    if (lay === "azerty" && digit) return { key: f.shift ? f.k : AZ[f.k], code: ph(f.k), shiftKey: !!f.shift };
    return { key: f.shift ? f.k.toUpperCase() : f.k, code: ph(f.k), shiftKey: !!f.shift };
  };
  const alive = (lay, nb) => api.FMT.filter((f) => hitOf(evFor(f, lay), nb) === f).length;
  const LAYS = [["us", "US 英文"], ["ime", "中文输入法组字中"], ["azerty", "FR-AZERTY 数字行"]];
  for (let i = 0; i < LAYS.length; i++) {
    const lay = LAYS[i][0], label = LAYS[i][1];
    const bad = api.FMT.filter((f) => hitOf(evFor(f, lay)) !== f);
    ok(label + "：全部命中自己（" + api.FMT.length + " 条）", bad.length === 0, bad.map((f) => f.name).join(" "));
  }
  ok("反证：IME 场景没有兜底时命中数明显更少（" + alive("ime", true) + " < " + api.FMT.length + "）",
     alive("ime", true) < api.FMT.length);
  ok("反证：AZERTY 场景没有兜底时命中数明显更少（" + alive("azerty", true) + " < " + api.FMT.length + "）",
     alive("azerty", true) < api.FMT.length);
}

console.log("\n" + "=".repeat(60));
console.log(fail === 0 ? "✓ v0.8.6 快捷键验收全绿（" + pass + " 项）" : "✗ " + fail + " 项未通过（通过 " + pass + "）");
process.exit(fail === 0 ? 0 : 1);
