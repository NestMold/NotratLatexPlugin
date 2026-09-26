/* v0.8.3 补丁：视图入口从「编辑器自绘顶栏」搬到「宿主标签栏模式开关」
 *
 * 背景（已在真宿主 app.asar 里取证）：
 *   宿主当前只认 editors[].dualView（严格 2 个字符串），没有 editors[].modes 的解析代码
 *   （app.asar 扫 "props.modes" = 0 命中、"modes:Array.isArray" = 0 命中）。
 *   所以本次：dualView 保留（旧客户端双态照旧）+ modes 声明（新客户端自动三态），
 *   编辑器侧统一走 MODE2VIEW 映射，两代 props.mode 都认，将来不用再改。
 *
 * 每处替换都断言命中次数，任一为 0 或重复即中止（不写盘）。
 * 本仓库源码是 CRLF 行尾：在 LF 域里替换，写盘前还原。 */
const fs = require("fs");

const F = "panels/editor.tsx";
const raw = fs.readFileSync(F, "utf8");
const CRLF = "\r\n";
const isCrlf = raw.indexOf(CRLF) !== -1;
let src = isCrlf ? raw.split(CRLF).join("\n") : raw;
const before = raw.length;

function sub(label, oldText, newText) {
  const n = src.split(oldText).length - 1;
  if (n !== 1) {
    console.error("✗ [" + label + "] 命中 " + n + " 次（应为 1）—— 中止，未写盘");
    console.error("  片段: " + JSON.stringify(oldText.slice(0, 120)));
    process.exit(1);
  }
  src = src.replace(oldText, newText);
  console.log("  ✓ " + label);
}

/* ---------- 1. 文件头 doc：写清两代模式契约 ---------- */
sub(
  "header-doc",
  ` * LaTeX 编辑器 v0.7.4 — editors 贡献面（接管 .tex 文件）
 * Overleaf 式分栏实时预览 + 划词引用到 Sidebar（notrat-quote-to-chat 第一方通道）
 * props: { pluginId, ctx, file, content, onChange, onSave, fileName, filePath,
 *          mode?, onModeSwitch?, setStatus }   // dualView 声明后才有 mode/onModeSwitch；setStatus 恒有`,
  ` * LaTeX 编辑器 v0.8.3 — editors 贡献面（接管 .tex 文件）
 * Overleaf 式分栏实时预览 + 划词引用到 Sidebar（notrat-quote-to-chat 第一方通道）
 * props: { pluginId, ctx, file, content, onChange, onSave, fileName, filePath,
 *          mode?, onModeSwitch?, modes?, setStatus }
 * 模式契约（v0.8.3）：视图入口**全部交给宿主标签栏**（标签 tab 右侧那排），编辑器不再自绘顶栏按钮。
 *   manifest 两个字段同时声明，跨客户端版本都可用：
 *     dualView = ["可视化","源码"]      → 旧客户端（只认 dualView）：props.mode = "wysiwyg" | "source"
 *     modes    = 可视化 / 分屏 / 源码    → 新客户端（modes 生效、dualView 被忽略）：
 *                                         props.mode = "visual" | "split" | "source"，并下发 props.modes
 *   onModeSwitch(id) 是唯一回写通路；setStatus 恒有，mode / onModeSwitch / modes 只在声明了上述字段时注入。`
);

/* ---------- 2. VIEWS 常量 → 两代模式映射表 ---------- */
sub(
  "VIEWS→MODE2VIEW",
  `/* 三档视图（v0.7.2：顶栏用分段控件，替掉三个各自为政的按钮） */
const VIEWS = [
  { k: "src", label: "📄 源码" },
  { k: "split", label: "⧉ 分屏" },
  { k: "preview", label: "📑 预览" },
];`,
  `/* ---------- 视图（本编辑器内部三档）----------
 *   src     = 源码（textarea + 高亮层）
 *   split   = 分屏（左源码 / 右渲染）
 *   preview = 可视化（在渲染结果上就地编辑 —— 也就是 manifest 里那一档「可视化」）
 *
 * ⚠ v0.8.3：编辑器**不再自带视图按钮**。顶栏那排「📄 源码 / ⧉ 分屏 / 📑 预览」分段控件已删，
 *   档位入口统一由宿主标签栏的模式开关承担（同一件事两处并存只会互相打架）。
 *   宿主读 manifest 的 editors[] 声明，两代契约本编辑器都认：
 *     旧客户端  dualView = ["可视化","源码"]      → props.mode = "wysiwyg" | "source"
 *     新客户端  modes = 可视化 / 分屏 / 源码       → props.mode = "visual" | "split" | "source"
 *   （已在装机版宿主 app.asar 里取证：无 editors[].modes 解析代码，故 dualView 必须同时保留。） */
const MODE2VIEW = {
  source: "src", src: "src", code: "src", text: "src", edit: "src",
  split: "split", dual: "split", both: "split",
  visual: "preview", wysiwyg: "preview", preview: "preview", render: "preview",
};
/* 内部分档 → 回写宿主的模式 id（两代契约各一张表） */
const VIEW2MODE_DUAL = { src: "source", split: "wysiwyg", preview: "wysiwyg" }; // 只有二态：分屏归可视化侧
const VIEW2MODE_N = { src: "source", split: "split", preview: "visual" };       // 三态：分屏是独立档位`
);

/* ---------- 3. view 状态 / hostMode 同步 / goView ---------- */
sub(
  "view-state",
  `  const [view, setView] = useState("split"); // src | split | preview
  /* 可视化侧上次挑的是「预览」还是「分屏」——宿主标题栏开关来回切时按这个还原，
   * 而不是一律拍回预览（用户要的是「几种模式都支持」，不是只有一个能用） */
  const lastPvView = useRef("split");
  // 宿主「源码 / 可视化」双视图（manifest editors[].dualView = ["可视化","源码"]）
  // 权威契约：props.mode = "wysiwyg" | "source"，props.onModeSwitch(mode) 回写标题栏开关。
  // 旧版读 props.viewMode / props.dualViewMode —— 宿主从不注入这两个名字，且字面量 "wysiwyg"
  // 匹配不上旧正则 /vis|preview/，导致双视图完全失效。
  const hostMode =
    props.mode !== undefined ? props.mode
    : props.viewMode !== undefined ? props.viewMode
    : props.dualViewMode !== undefined ? props.dualViewMode
    : undefined;
  useEffect(() => {
    if (hostMode === undefined || hostMode === null) return;
    const hv = String(hostMode).toLowerCase();
    if (hv === "wysiwyg" || /vis|preview|render|read|pdf/.test(hv)) setView(lastPvView.current || "split");
    else if (hv === "source" || /src|code|edit|write|text/.test(hv)) setView("src");
  }, [hostMode]);
  /* 本编辑器三档视图 -> 宿主二态开关的回写（分屏无宿主对应态，不回写，避免抖动） */
  const goView = (v) => {
    /* 离开可视化视图前把改动落盘：否则切到源码视图会看到旧内容 */
    if (view === "preview" && v !== "preview") commitWys();
    if (v !== "src") lastPvView.current = v;   // 记住可视化侧的选择（预览 / 分屏）
    setView(v);
    if (typeof props.onModeSwitch === "function") {
      /* 分屏里同样是「渲染过的文档」，对齐宿主的「可视化」态，标题栏开关才不骗人 */
      if (v === "preview" || v === "split") props.onModeSwitch("wysiwyg");
      else if (v === "src") props.onModeSwitch("source");
    }
  };`,
  `  /* 宿主下发的模式表：只有声明了 modes 且客户端认识它时才有（当前装机版宿主：空）。 */
  const hostModeIds = Array.isArray(props.modes)
    ? props.modes.map((m) => (m && m.id != null ? String(m.id) : "")).filter(Boolean)
    : [];
  const nMode = hostModeIds.length >= 2;   // true = 宿主走 N 态契约（modes），false = 旧的双态契约
  /* 宿主模式 id -> 内部分档。两代字面量都认（"wysiwyg"/"source" 与 "visual"/"split"/"source"），
   * 认不出就返回 null = 这一拍不动视图（绝不瞎猜着换档）。 */
  const viewOf = (m) => {
    if (m === undefined || m === null) return null;
    const k = String(m).toLowerCase();
    if (MODE2VIEW[k]) return MODE2VIEW[k];
    if (/split|dual|both/.test(k)) return "split";
    if (/vis|preview|render|read|pdf/.test(k)) return "preview";
    if (/src|code|edit|write|text/.test(k)) return "src";
    return null;
  };
  /* 首帧就落在宿主说的那一档（宿主没下发 = 默认分屏，维持老行为） */
  const [view, setView] = useState(() => viewOf(props.mode) || "split"); // src | split | preview
  /* 可视化侧上次挑的是「预览」还是「分屏」—— 旧的双态契约下，「源码」切回「可视化」按这个还原
   * （新契约里分屏是独立档位，用不上这把记忆） */
  const lastPvView = useRef("split");
  /* props.mode = 宿主下发的权威值（live）；props.viewMode / props.dualViewMode 是历史上的错名字，
   * 宿主从不注入，留着只作极旧包的兜底，别当契约用。 */
  const hostMode =
    props.mode !== undefined ? props.mode
    : props.viewMode !== undefined ? props.viewMode
    : props.dualViewMode !== undefined ? props.dualViewMode
    : undefined;
  useEffect(() => {
    const v = viewOf(hostMode);
    if (!v) return;
    if (v !== "src") lastPvView.current = v;
    /* 旧契约的「可视化」是笼统的一侧（分屏 / 纯预览都算）：回到上次停的那一档 */
    if (!nMode && v === "preview" && lastPvView.current === "split") { setView("split"); return; }
    setView(v);
  }, [hostMode]);
  /* 回写宿主标签栏开关 —— props.onModeSwitch 是唯一通路；没注入就静默跳过 */
  const writeHostMode = (v) => {
    if (typeof props.onModeSwitch !== "function") return;
    const id = (nMode ? VIEW2MODE_N : VIEW2MODE_DUAL)[v];
    if (id) props.onModeSwitch(id);
  };
  /* 切档：宿主开关（props.mode 下发）与内部入口（Ctrl+/、卡片「去源码」、行跳转兜底）都汇到这里 */
  const goView = (v) => {
    if (v !== "src" && v !== "split" && v !== "preview") return;
    /* 离开可视化视图前把改动落盘：否则切到源码视图会看到旧内容 */
    if (view === "preview" && v !== "preview") commitWys();
    if (v !== "src") lastPvView.current = v;   // 记住可视化侧的选择（预览 / 分屏）
    setView(v);
    writeHostMode(v);   // 新契约：分屏独立回写 "split"；旧契约：归到可视化侧，开关不骗人
  };`
);

/* ---------- 4. 顶栏：删掉视图分段控件 ---------- */
sub(
  "toolbar-drop-views",
  `      {/* 工具栏（v0.7.2 精简：14 个按钮 → 视图分段 + 就地编辑 + 插入菜单 + 编译/校验 + 状态点） */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderBottom: "1px solid hsl(var(--border))", flexWrap: "wrap" }}>
        <div style={{ display: "flex", border: "1px solid hsl(var(--border))", borderRadius: 8, overflow: "hidden" }}>
          {VIEWS.map((v) => (
            <button
              key={v.k}
              onClick={() => goView(v.k)}
              style={{
                border: "none", cursor: "pointer", padding: "3px 11px", fontSize: 12, fontFamily: "inherit",
                background: view === v.k ? "hsl(var(--primary))" : "transparent",
                color: view === v.k ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
              }}
            >{v.label}</button>
          ))}
        </div>

`,
  `      {/* 工具栏（v0.8.3：视图切换搬去宿主标签栏的模式开关，这里只剩文档级动作）
       *   删掉的是「📄 源码 / ⧉ 分屏 / 📑 预览」那排分段按钮 —— 档位是同一件事，
       *   宿主标签栏已经有一份权威的（就是标签 tab 旁边那排），编辑器内再画一份只会互相打架。
       *   留下的（宿主不管的）：＋插入 / 编译 / 校验 / MCP 状态点。 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderBottom: "1px solid hsl(var(--border))", flexWrap: "wrap" }}>
`
);

/* ---------- 5. 内部切档也要回写宿主（否则标签栏开关与真实档位脱节） ---------- */
sub(
  "gotoSourceAt-writeback",
  `    setView("split");   // 卡片按钮只存在于预览面板，所以这里必然是从预览切过去`,
  `    setView("split");   // 卡片按钮只存在于预览面板，所以这里必然是从预览切过去
    writeHostMode("split");   // v0.8.3：档位指示只剩标签栏这一处，内部切档必须同步，别让它显示假的`
);
sub(
  "gotoLine-writeback",
  `      if (wantSrc && view !== "split" && view !== "src") setView("split");`,
  `      if (wantSrc && view !== "split" && view !== "src") { setView("split"); writeHostMode("split"); }`
);

const out = isCrlf ? src.split("\n").join(CRLF) : src;
fs.writeFileSync(F, out);
console.log("\nwritten " + F + "  " + before + " → " + out.length + " 字符（+" + (out.length - before) + "）");
