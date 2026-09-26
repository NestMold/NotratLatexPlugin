import { useState, useEffect } from "react";

/**
 * LaTeX 助手 — 面板（right-panel / page 双挂载复用）
 * 数据通路：window.electronAPI.mcp.callTool(props.serverId, tool, args) —— 主进程 IPC，无 CORS。
 * 样式：内联 style + 主题 token（hsl(var(--…))），自动适配明暗主题；不依赖 Tailwind。
 */

const C = {
  error: "#ef4444",
  warning: "#f59e0b",
  info: "#94a3b8",
  ok: "#22c55e",
};

function Card({ title, children, right }) {
  return (
    <div
      style={{
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        borderRadius: 10,
        padding: "10px 12px",
        marginBottom: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: "hsl(var(--muted-foreground))" }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Chip({ children, tone }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 8px",
        margin: "2px 4px 2px 0",
        borderRadius: 999,
        fontSize: 11,
        border: "1px solid " + (tone || "hsl(var(--border))"),
        color: tone || "hsl(var(--foreground))",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

const btn = {
  padding: "4px 10px",
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--secondary))",
  color: "hsl(var(--secondary-foreground))",
  cursor: "pointer",
};
const btnPrimary = { ...btn, background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" };

/* =========================================================================
 * 活动文件桥（消费侧）
 * 面板拿不到活动文件（官方 props 无 filePath），上一版只能回落 sessionStorage 里
 * 上一份 .tex，导致「切到其它格式仍显示 LaTeX 大纲」。这里改为问编辑器：
 *   · notrat-latex-active-ping   面板挂载时问一次，编辑器同步回话
 *   · notrat-latex-active-file   编辑器 挂载/切文件/卸载 时广播
 *   · sessionStorage 快照        面板比事件晚挂载时的兜底（8s 内视为有效）
 * ========================================================================= */
const LATEX_EV = "notrat-latex-active-file";
const LATEX_PING = "notrat-latex-active-ping";
const LATEX_STORE = "notrat-latex-active";
const LATEX_EXT = /\.(tex|bib|cls|sty|ltx|latex)$/i;

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

export default function LatexPanel(props) {
  const [file, setFile] = useState("");
  const [busy, setBusy] = useState("");
  const [info, setInfo] = useState(null);
  const [val, setVal] = useState(null);
  const [err, setErr] = useState("");
  const act = useActiveLatexFile();

  const api = typeof window !== "undefined" ? window.electronAPI : null;

  async function call(tool, args) {
    if (!api || !api.mcp || !api.mcp.callTool) throw new Error("electronAPI.mcp 不可用（宿主未注入）");
    const r = await api.mcp.callTool(props.serverId, tool, args);
    if (!r || r.success === false) throw new Error((r && r.error) || "工具调用失败");
    return (r.result && r.result.content ? r.result.content : []).map((c) => c.text).join("\n");
  }

  async function run(tool, args, then) {
    setBusy(tool);
    setErr("");
    try {
      const out = await call(tool, args);
      then(out);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy("");
    }
  }

  const doParse = () =>
    run("latex_parse", { path: file, format: "json" }, (out) => {
      try {
        const j = JSON.parse(out);
        setInfo(j);
        if (j && j.file) setFile(j.file);
        try {
          sessionStorage.setItem("notrat-latex-panel", JSON.stringify({ file: j.file, info: j }));
        } catch {}
      } catch {
        setErr("解析结果不是合法 JSON: " + out.slice(0, 200));
      }
    });

  const doValidate = () =>
    run("latex_validate", { path: file, format: "json" }, (out) => {
      try {
        const j = JSON.parse(out);
        setVal(j);
        try {
          const s = JSON.parse(sessionStorage.getItem("notrat-latex-panel") || "{}");
          s.issues = j;
          sessionStorage.setItem("notrat-latex-panel", JSON.stringify(s));
        } catch {}
      } catch {
        setErr("校验结果不是合法 JSON: " + out.slice(0, 200));
      }
    });

  const doCompile = () =>
    run("latex_compile", { path: file }, (out) => {
      try {
        window.dispatchEvent(
          new CustomEvent("notrat-quote-to-chat", { detail: { text: out, source: "🔨 LaTeX 编译结果" } })
        );
      } catch {}
    });

  const quoteSummary = () => {
    if (!info) return;
    const parts = [];
    parts.push(`LaTeX 结构速览 — ${info.file}`);
    if (info.title) parts.push(`标题: ${info.title}`);
    if (info.sections && info.sections.length)
      parts.push(
        "章节: " + info.sections.map((s) => "  ".repeat(s.level) + s.title).join(" / ")
      );
    const fig = (info.environments || []).filter((e) => /^figure/.test(e.name)).length;
    const tab = (info.environments || []).filter((e) => /^table/.test(e.name)).length;
    const eq = (info.environments || []).filter((e) => /^(equation|align|gather|eqnarray|multline)$/.test(e.name)).length;
    parts.push(`图 ${fig} · 表 ${tab} · 公式环境 ${eq} · 行内公式 ~${info.inlineMath || 0}`);
    if (info.wordCount) parts.push(`字数≈${info.wordCount.approxWords}（中文${info.wordCount.cjkChars}+英文词${info.wordCount.latinWords}）`);
    if (val && val.summary)
      parts.push(`校验: 🔴${val.summary.errors} 🟡${val.summary.warnings} ⚪${val.summary.infos}`);
    try {
      window.dispatchEvent(
        new CustomEvent("notrat-quote-to-chat", { detail: { text: parts.join("\n"), source: "📐 LaTeX 结构速览" } })
      );
    } catch {}
  };

  const openPage = () => {
    try {
      window.dispatchEvent(
        new CustomEvent("notrat-open-plugin-page", { detail: { key: props.pluginId + ":latex-page", title: "LaTeX 结构" } })
      );
    } catch {}
  };

  // 跟随当前活动 .tex（面板拿不到 filePath，走活动文件桥）；
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


  const fig = info ? (info.environments || []).filter((e) => /^figure/.test(e.name)).length : 0;
  const tab = info ? (info.environments || []).filter((e) => /^table/.test(e.name)).length : 0;
  const eq = info
    ? (info.environments || []).filter((e) => /^(equation|align|gather|eqnarray|multline)$/.test(e.name)).length
    : 0;
  const sum = val && val.summary;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, color: "hsl(var(--foreground))" }}>
      {/* 头部 */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>📐 LaTeX 助手</span>
        <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>v0.1</span>
        <div style={{ flex: 1 }} />
        <button style={btn} onClick={quoteSummary} title="把结构速览钉进聊天输入框">
          💬 引用
        </button>
        <button style={btn} onClick={openPage} title="在主区打开整页视图">
          ⤢ 整页
        </button>
      </div>

      {act.ready && !act.path ? (
        <div style={{ fontSize: 11, lineHeight: 1.6, color: "hsl(var(--muted-foreground))", marginBottom: 8 }}>
          当前打开的不是 LaTeX 文件 —— 下面的操作作用于输入框里的路径（留空则自动发现工作区主 .tex）。
        </div>
      ) : null}
      {/* 文件 + 动作 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <input
          value={file}
          onChange={(e) => setFile(e.target.value)}
          placeholder="留空 = 自动发现工作区主 .tex"
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 12,
            padding: "4px 8px",
            borderRadius: 8,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--background))",
            color: "hsl(var(--foreground))",
          }}
        />
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <button style={btnPrimary} onClick={doParse} disabled={!!busy}>
          {busy === "latex_parse" ? "解析中…" : "解析"}
        </button>
        <button style={btn} onClick={doValidate} disabled={!!busy}>
          {busy === "latex_validate" ? "校验中…" : "校验"}
        </button>
        <button style={btn} onClick={doCompile} disabled={!!busy}>
          {busy === "latex_compile" ? "编译中…" : "编译"}
        </button>
      </div>

      {err ? (
        <div
          style={{
            background: "hsl(var(--destructive) / 0.1)",
            border: "1px solid " + C.error,
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 12,
            color: C.error,
            marginBottom: 10,
            wordBreak: "break-all",
          }}
        >
          {err}
        </div>
      ) : null}

      {/* 结果区 */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {!info ? (
          <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", lineHeight: 1.8 }}>
            点击「解析」读取当前工作区的 LaTeX 文件结构。
            <br />
            也可以在左侧文件树右键 .tex 文件使用快捷菜单。
          </div>
        ) : (
          <>
            <Card title="文档信息">
              <div style={{ fontSize: 12, lineHeight: 1.7, wordBreak: "break-all" }}>
                <div style={{ fontWeight: 600 }}>{info.title || "(无标题)"}</div>
                {info.author ? <div>👤 {info.author}</div> : null}
                <div style={{ color: "hsl(var(--muted-foreground))" }}>
                  {info.documentClass ? "文档类 " + info.documentClass : ""} · 宏包 {(info.packages || []).length} 个
                </div>
                {(info.bibResources || []).length ? (
                  <div style={{ color: "hsl(var(--muted-foreground))" }}>📚 {info.bibResources.join(", ")}</div>
                ) : null}
              </div>
            </Card>

            <Card title={`章节结构 (${(info.sections || []).length})`}>
              {(info.sections || []).length ? (
                info.sections.map((s, i) => (
                  <div key={i} style={{ fontSize: 12, lineHeight: 1.9, paddingLeft: s.level * 14 }}>
                    <span style={{ color: "hsl(var(--muted-foreground))", marginRight: 6 }}>L{s.line}</span>
                    {s.title}
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>未发现章节命令</div>
              )}
            </Card>

            <Card title="统计">
              <div style={{ display: "flex", flexWrap: "wrap" }}>
                <Chip>🖼 图 {fig}</Chip>
                <Chip>📊 表 {tab}</Chip>
                <Chip>∑ 公式环境 {eq}</Chip>
                <Chip>$ 行内 ~{info.inlineMath || 0}</Chip>
                {info.wordCount ? (
                  <Chip>💬 ≈{info.wordCount.approxWords} 字</Chip>
                ) : null}
                <Chip>🏷 标签 {(info.labels || []).length}</Chip>
                <Chip>🔗 引用 {(info.refs || []).length}</Chip>
                <Chip>📚 文献 {(info.cites || []).length}</Chip>
              </div>
            </Card>

            {sum ? (
              <Card
                title={`校验 · 🔴${sum.errors} 🟡${sum.warnings} ⚪${sum.infos}`}
                right={
                  <button style={btn} onClick={doValidate}>
                    重新校验
                  </button>
                }
              >
                {sum.errors + sum.warnings + sum.infos === 0 ? (
                  <div style={{ fontSize: 12, color: C.ok }}>✅ 未发现问题</div>
                ) : (
                  <div style={{ maxHeight: 220, overflowY: "auto" }}>
                    {val.issues.map((i, k) => (
                      <div key={k} style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 4 }}>
                        <span style={{ color: C[i.severity], fontWeight: 700 }}>
                          {i.severity === "error" ? "🔴" : i.severity === "warning" ? "🟡" : "⚪"}
                        </span>{" "}
                        <span style={{ color: "hsl(var(--muted-foreground))" }}>L{i.line}</span> {i.message}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
