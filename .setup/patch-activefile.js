/* v0.4.1 补丁：让所有面板跟随「当前活动文件」，非 LaTeX 时不再显示上一份 .tex 的内容
 *
 * 根因（宿主实现事实，read-only 取证于 app.asar 的 /dist/assets/index-*.js）：
 *   1) editors 贡献面收到 { pluginId, ctx, file, content, onChange, onSave, fileName, filePath }
 *      —— PluginEditorHost 组装（带 filePath）。
 *   2) ui 面板只收到 { serverId, pluginId, ctx, data, dataError, launch }，
 *      ctx = { window, workspace, ai, selection, app } —— 没有 filePath / 活动文件。
 *      outline 位由 PluginOutlinePanels 渲染，连 launchParams 都不传。
 *   3) 于是 outline.tsx 的 pickFile() 三条路全落空，只剩 sessionStorage["notrat-latex-panel"]
 *      这个「上一次解析的 .tex」兜底；且 useEffect 只依赖 workspace.path → 切文件不重载。
 *      ⇒ 切到 .md / .txt 后，大纲面板继续显示上一份 .tex 的章节树。
 *
 * 方案：让唯一知道活动文件的编辑器广播出去，面板侧统一接收。
 *   生产者（panels/editor.tsx）：挂载 / 切文件 / 卸载 时 dispatch notrat-latex-active-file
 *   消费侧（各面板）：notrat-latex-active-ping 主动问一次 + 监听事件 + sessionStorage 快照兜底
 *
 * 幂等：锚点被替换后再执行会因「命中 0 处」直接退出，不会重复注入。
 */
const fs = require("fs");
const path = require("path");

const WS = "E:/notrat-latex-plugin";
let edits = 0;

function rd(p) {
  return fs.readFileSync(path.join(WS, p), "utf8");
}
function wr(p, s) {
  fs.writeFileSync(path.join(WS, p), s, "utf8");
}
function mustReplace(src, re, next, label) {
  const m = src.match(re);
  if (!m || m.length !== 1) {
    console.error("  x " + label + " -> 命中 " + (m ? m.length : 0) + " 处，期望 1 处，已中止");
    process.exit(1);
  }
  edits++;
  console.log("  ok " + label);
  return src.replace(re, () => next);
}

/* =========================================================== 生产者：editor.tsx */
const PRODUCER = `/* =========================================================================
 * 活动文件广播（生产者侧）
 * 宿主只把 filePath 交给 editors 贡献面；ui 面板拿不到（官方 props 只有
 * { serverId, pluginId, ctx, data, dataError, launch }，ctx 里只有 workspace）。
 * 面板过去只能读 sessionStorage 里上一份 .tex -> 切到别的格式仍显示 LaTeX 大纲。
 * 这里在「挂载 / 切文件 / 卸载」三处广播当前活动文件，面板据此显示或收起。
 * ========================================================================= */
const LATEX_EV = "notrat-latex-active-file";
const LATEX_PING = "notrat-latex-active-ping";
const LATEX_STORE = "notrat-latex-active";

let _activeSeq = 0;
let _activeClearTimer = null;

function announceActiveFile(path, name) {
  if (_activeClearTimer) { clearTimeout(_activeClearTimer); _activeClearTimer = null; }
  const detail = { path: String(path || ""), name: String(name || "") };
  _activeSeq += 1;
  try { sessionStorage.setItem(LATEX_STORE, JSON.stringify({ path: detail.path, name: detail.name, at: Date.now() })); } catch (e) {}
  try { window.dispatchEvent(new CustomEvent(LATEX_EV, { detail: detail })); } catch (e) {}
}

/* .tex -> .tex 切换时宿主换 key 重挂载：旧实例先卸载、新实例随后挂载，
 * 所以卸载只「延迟清场」；期间若有新实例广播（_activeSeq 变化）就取消清理。 */
function retractActiveFile() {
  const mine = _activeSeq;
  if (_activeClearTimer) clearTimeout(_activeClearTimer);
  _activeClearTimer = setTimeout(function () {
    _activeClearTimer = null;
    if (_activeSeq !== mine) return;
    try { sessionStorage.removeItem(LATEX_STORE); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent(LATEX_EV, { detail: { path: "", name: "" } })); } catch (e) {}
  }, 120);
}
`;

const PRODUCER_EFFECT = `  /* ---------- 面板桥：把「当前活动 .tex」广播给拿不到 filePath 的面板 ---------- */
  useEffect(() => {
    announceActiveFile(filePath, fileName);
    const onPing = () => announceActiveFile(filePath, fileName);
    window.addEventListener(LATEX_PING, onPing);
    return () => {
      window.removeEventListener(LATEX_PING, onPing);
      retractActiveFile();
    };
  }, [filePath, fileName]);

`;

/* =========================================================== 消费侧：统一桥 */
const BRIDGE = `/* =========================================================================
 * 活动文件桥（消费侧）
 * 面板拿不到活动文件（官方 props 无 filePath），上一版只能回落 sessionStorage 里
 * 上一份 .tex，导致「切到其它格式仍显示 LaTeX 大纲」。这里改为问编辑器：
 *   · notrat-latex-active-ping   面板挂载时问一次，编辑器同步回话
 *   - notrat-latex-active-file   编辑器 挂载/切文件/卸载 时广播
 *   - sessionStorage 快照        面板比事件晚挂载时的兜底（8s 内视为有效）
 * ========================================================================= */
const LATEX_EV = "notrat-latex-active-file";
const LATEX_PING = "notrat-latex-active-ping";
const LATEX_STORE = "notrat-latex-active";
const LATEX_EXT = /\\.(tex|bib|cls|sty|ltx|latex)$/i;

function isLatexPath(p) {
  return LATEX_EXT.test(String(p || ""));
}

function readActiveSnapshot() {
  try {
    const s = JSON.parse(sessionStorage.getItem(LATEX_STORE) || "null");
    if (s && isLatexPath(s.path) && Date.now() - (Number(s.at) || 0) < 8000) return String(s.path);
  } catch (e) {}
  return "";
}

/* 返回 { ready, path }：ready=false 表示还在探测；path="" 表示当前不是 LaTeX 文件 */
function useActiveLatexFile() {
  const [state, setState] = useState(function () {
    const snap = readActiveSnapshot();
    return { ready: !!snap, path: snap };
  });
  useEffect(function () {
    let settled = false;
    function apply(p) {
      settled = true;
      setState({ ready: true, path: isLatexPath(p) ? String(p) : "" });
    }
    function onActive(e) { apply(e && e.detail ? e.detail.path : ""); }
    window.addEventListener(LATEX_EV, onActive);
    try { window.dispatchEvent(new CustomEvent(LATEX_PING)); } catch (e) {}
    const t = setTimeout(function () { if (!settled) apply(readActiveSnapshot()); }, 250);
    return function () {
      window.removeEventListener(LATEX_EV, onActive);
      clearTimeout(t);
    };
  }, []);
  return state;
}
`;

/* ------------------------------------------------------------------ outline */
const IDLE_PANEL = `/* 当前活动文件不是 LaTeX：收起章节树，只留一行说明（旧版会继续显示上一份 .tex 的大纲） */
function IdlePanel(props) {
  return (
    <div style={S.root}>
      <div style={S.head}>
        <span style={{ fontSize: 13 }}>🧭</span>
        <span style={S.title}>章节大纲</span>
      </div>
      <div style={S.empty}>
        {props.ready ? (
          <span>
            当前打开的<b>不是 LaTeX 文件</b>。
            <br />
            切到 .tex / .bib / .cls / .sty 后，这里会自动显示章节树。
          </span>
        ) : (
          <span>正在识别当前文件…</span>
        )}
      </div>
    </div>
  );
}
`;

const OUTLINE_EFFECT = `  /* 跟随当前活动文件（面板拿不到 filePath，走活动文件桥）。
   * 旧版只依赖工作区路径 -> 切文件不刷新，且切到非 LaTeX 照旧显示上一份 .tex 的大纲。 */
  useEffect(
    function () {
      if (!act.ready) return;
      setFile(act.path);
      if (!act.path) {
        setInfo(null);
        setIssues(null);
        setErr("");
        return;
      }
      load(act.path);
    },
    [act.ready, act.path, load]
  );
`;

/* ------------------------------------------------------------------- widget */
const WIDGET_REFRESH = `  const refresh = useCallback(
    async function () {
      if (!file) { setStatus(""); return; }
      try {
        setStatus(await callTool("latex_status", { path: file }));
      } catch (e) {
        setStatus(String((e && e.message) || e));
      }
    },
    [callTool, file]
  );
`;

const WIDGET_EFFECT = `  /* 跟随当前活动文件（面板拿不到 filePath，走活动文件桥） */
  useEffect(
    function () {
      setFile(act.ready ? act.path : "");
      setStatus("");
      setOut("");
    },
    [act.ready, act.path]
  );

  useEffect(
    function () {
      if (!file) return;
      refresh();
    },
    [file]
  );
`;

const WIDGET_GATE = `  /* 非 LaTeX 活动文件：收起按钮，只留一行说明 */
  if (act.ready && !act.path) {
    return (
      <div style={S.root}>
        <div style={S.head}>
          <span>📐</span>
          <span style={S.name}>LaTeX 助手</span>
        </div>
        <div style={S.status}>当前不是 LaTeX 文件，切到 .tex 后可编译 / 校验 / 快照。</div>
      </div>
    );
  }

`;

/* --------------------------------------------------------------------- main */
const MAIN_EFFECT = `  // 跟随当前活动 .tex（面板拿不到 filePath，走活动文件桥）；
  // 缓存只在「同一个文件」时复用，避免把上一份 .tex 的结构显示给别的文件
  useEffect(() => {
    if (!act.ready) return;
    setErr("");
    setFile(act.path || "");
    let hit = null;
    try {
      const saved = JSON.parse(sessionStorage.getItem("notrat-latex-panel") || "null");
      if (saved && saved.file === act.path) hit = saved;
    } catch {}
    setInfo(hit && hit.info ? hit.info : null);
    setVal(hit && hit.issues ? hit.issues : null);
  }, [act.ready, act.path]);
`;

const MAIN_NOTICE = `      {act.ready && !act.path ? (
        <div style={{ fontSize: 11, lineHeight: 1.6, color: "hsl(var(--muted-foreground))", marginBottom: 8 }}>
          当前打开的不是 LaTeX 文件 —— 下面的操作作用于输入框里的路径（留空则自动发现工作区主 .tex）。
        </div>
      ) : null}
`;

/* ------------------------------------------------------- editor-header/tabs */
const HEADER_EFFECT = `  /* 跟随当前活动文件（面板拿不到 filePath，走活动文件桥） */
  useEffect(
    function () {
      setFile(act.ready ? act.path : "");
      setStatus("");
    },
    [act.ready, act.path]
  );
`;

const TABS_EFFECT = `  /* 跟随当前活动文件（非 LaTeX 时下面 return null，徽章不渲染） */
  useEffect(
    function () {
      setFile(act.ready ? act.path : "");
    },
    [act.ready, act.path]
  );
`;

/* =============================================================== 逐文件应用 */
console.log("== panels/editor.tsx ==");
let s = rd("panels/editor.tsx");
s = mustReplace(
  s,
  /export default function LatexEditor\(props\) \{/,
  PRODUCER + "\nexport default function LatexEditor(props) {",
  "注入活动文件广播器"
);
s = mustReplace(
  s,
  /  \/\* ---------- MCP 工具通路 ---------- \*\//,
  PRODUCER_EFFECT + "  /* ---------- MCP 工具通路 ---------- */",
  "挂载/切换/卸载三处广播"
);
wr("panels/editor.tsx", s);

console.log("== panels/outline.tsx ==");
s = rd("panels/outline.tsx");
s = mustReplace(s, /function pickFile\(props\) \{[\s\S]*?\n\}\n/, BRIDGE + "\n", "换活动文件桥（替掉 pickFile）");
s = mustReplace(
  s,
  /export default function LatexOutline\(props\) \{\n  const \[file, setFile\] = useState\(function \(\) \{ return pickFile\(props\); \}\);/,
  IDLE_PANEL +
    "\nexport default function LatexOutline(props) {\n  const act = useActiveLatexFile();\n  const [file, setFile] = useState(function () { return readActiveSnapshot(); });",
  "IdlePanel + useActiveLatexFile"
);
s = mustReplace(
  s,
  /    async function \(\) \{\n      if \(!api \|\| !api\.mcp \|\| !api\.mcp\.callTool\) \{/,
  "    async function (target) {\n      const path = String(target || \"\");\n      if (!path) return; // 非 LaTeX 活动文件：不解析，也不回落「自动发现主文件」\n      if (!api || !api.mcp || !api.mcp.callTool) {",
  "load() 收 path 参数"
);
s = mustReplace(s, /callTool\("latex_parse", \{ path: file, format: "json" \}\)/, 'callTool("latex_parse", { path: path, format: "json" })', "解析用活动文件路径");
s = mustReplace(s, /if \(parsed && parsed\.file && parsed\.file !== file\) setFile\(parsed\.file\);/, "if (parsed && parsed.file && parsed.file !== path) setFile(parsed.file);", "回写真实路径");
s = mustReplace(s, /callTool\("latex_validate", \{ path: parsed\.file \|\| file, format: "json" \}\)/, 'callTool("latex_validate", { path: parsed.file || path, format: "json" })', "校验用活动文件路径");
s = mustReplace(s, /    \[api, callTool, file\]\n  \);/, "    [api, callTool]\n  );", "load 依赖收敛");
s = mustReplace(
  s,
  /  useEffect\(\n    function \(\) \{\n      load\(\);\n      \/\/ 依赖工作区路径：切工作区 \/ 新窗口时重新发现主文件\n    \},\n    \[props\.ctx && props\.ctx\.workspace \? props\.ctx\.workspace\.path : ""\]\n  \);/,
  OUTLINE_EFFECT,
  "改为跟随活动文件"
);
s = mustReplace(s, /onClick=\{load\}/, "onClick={function () { load(file); }}", "刷新按钮传当前文件");
s = mustReplace(s, /  function quote\(s, num\) \{/, "  if (!act.path) return <IdlePanel ready={act.ready} />;\n\n  function quote(s, num) {", "非 LaTeX 时收起大纲");
wr("panels/outline.tsx", s);

console.log("== panels/widget.tsx ==");
s = rd("panels/widget.tsx");
s = mustReplace(s, /function pickFile\(props\) \{[\s\S]*?\n\}\n/, BRIDGE + "\n", "换活动文件桥");
s = mustReplace(
  s,
  /export default function LatexWidget\(props\) \{\n  const \[file, setFile\] = useState\(function \(\) \{ return pickFile\(props\); \}\);/,
  "export default function LatexWidget(props) {\n  const act = useActiveLatexFile();\n  const [file, setFile] = useState(function () { return readActiveSnapshot(); });",
  "接入 useActiveLatexFile"
);
s = mustReplace(s, /  const refresh = useCallback\(\n    async function \(\) \{[\s\S]*?\n    \[callTool, file\]\n  \);/, WIDGET_REFRESH, "refresh 去掉自动发现改写");
s = mustReplace(s, /  useEffect\(\n    function \(\) \{\n      refresh\(\);\n    \},\n    \[file\]\n  \);/, WIDGET_EFFECT, "改为跟随活动文件");
s = mustReplace(s, /  const fname = file \?/, WIDGET_GATE + "  const fname = file ?", "非 LaTeX 时收起按钮");
wr("panels/widget.tsx", s);

console.log("== panels/main.tsx ==");
s = rd("panels/main.tsx");
s = mustReplace(s, /export default function LatexPanel\(props\) \{/, BRIDGE + "\nexport default function LatexPanel(props) {", "接入活动文件桥");
s = mustReplace(s, /  const \[err, setErr\] = useState\(""\);/, '  const [err, setErr] = useState("");\n  const act = useActiveLatexFile();', "接入 useActiveLatexFile");
s = mustReplace(
  s,
  /  \/\/ 挂载：恢复缓存 \+ 自动发现主 \.tex\n  useEffect\(\(\) => \{[\s\S]*?\n  \}, \[\]\);/,
  MAIN_EFFECT,
  "挂载逻辑改为跟随活动文件"
);
s = mustReplace(s, /      \{\/\* 文件 \+ 动作 \*\/\}/, MAIN_NOTICE + "      {/* 文件 + 动作 */}", "非 LaTeX 时给一行提示");
wr("panels/main.tsx", s);

console.log("== panels/editor-header.tsx ==");
s = rd("panels/editor-header.tsx");
s = mustReplace(s, /const LATEX_EXT = .*?\n\nfunction pickFile\(props\) \{[\s\S]*?\n\}\n/, BRIDGE + "\n", "换活动文件桥");
s = mustReplace(
  s,
  /  const \[file, setFile\] = useState\(function \(\) \{ return pickFile\(props\); \}\);/,
  "  const act = useActiveLatexFile();\n  const [file, setFile] = useState(function () { return readActiveSnapshot(); });",
  "接入 useActiveLatexFile"
);
s = mustReplace(
  s,
  /  \/\/ 编辑器切换文件时跟随（props 变化）\n  useEffect\(\n    function \(\) \{\n      const f = pickFile\(props\);\n      if \(f && f !== file\) setFile\(f\);\n    \},\n    \[props\.filePath, props\.file\]\n  \);/,
  HEADER_EFFECT,
  "改为跟随活动文件（原 props.filePath 恒为 undefined）"
);
wr("panels/editor-header.tsx", s);

console.log("== panels/editor-tabs.tsx ==");
s = rd("panels/editor-tabs.tsx");
s = mustReplace(s, /const LATEX_EXT = .*?\n\nfunction pickFile\(props\) \{[\s\S]*?\n\}\n/, BRIDGE + "\n", "换活动文件桥");
s = mustReplace(
  s,
  /  const \[file\] = useState\(function \(\) \{ return pickFile\(props\); \}\);/,
  "  const act = useActiveLatexFile();\n  const [file, setFile] = useState(function () { return readActiveSnapshot(); });",
  "接入 useActiveLatexFile"
);
s = mustReplace(
  s,
  /  useEffect\(\n    function \(\) \{\n      if \(LATEX_EXT\.test\(file \|\| ""\)\) check\(\);\n    \},\n    \[file, check\]\n  \);/,
  '  useEffect(\n    function () {\n      if (LATEX_EXT.test(file || "")) check();\n    },\n    [file, check]\n  );\n\n' + TABS_EFFECT,
  "改为跟随活动文件"
);
wr("panels/editor-tabs.tsx", s);

console.log("\n共应用 " + edits + " 处修改。");
