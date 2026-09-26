import React, { useState, useRef, useEffect, useCallback } from "react";

/* =========================================================================
 * LaTeX 助手 — 划词助手（ui.location = "right-panel"）
 *
 * 契约来源：宿主 ctx.selection（§5.1.1 划词双通道）
 *   props.ctx.selection = { text, source, filePath, lineFrom?, lineTo?, reportedAt } | null
 *   · 宿主在任何编辑器里划词，250ms 防抖后写入 useEditorStore.editorSelection
 *   · 选区离开编辑器即清为 null；text 上限 10 万字符，超出会被截断并追加「…[已截断,原 N 字符]」
 *   · 是 live 值 —— ctx 变化自动重渲染，本面板不需要轮询（refreshMs 保持 0）
 *
 * ⚠ 三个实测坑（照抄 wiki 会踩）：
 *   1. 划词引用属基础版（Basic）及以上权益，纯净版恒为 null —— 必须做空态引导，不能当异常。
 *   2. wiki §6.1 的 localStorage 取供应商写法是简化版：
 *      "notrat-ai-current:<slug>" 里只有 { providerId, model }，**没有 apiKey**。
 *      照抄会拿到 apiKey: undefined → 请求必失败。真实解析链见 resolveProvider()：
 *      窗口选中项只覆盖 providerId/model，密钥仍从 "notrat-ai-config".providers 主表取。
 *      （锚点：宿主 renderer 内 applyWindowSelection / loadWindowSelection / readAISelection）
 *   3. ui[].extensions 在宿主 useUiByEffectiveLocation 里不生效（只匹配 location），
 *      所以挂载位过滤必须自己做 —— 见组件内的 isLatexPath 自守卫与空态分支。
 *
 * 数据通路：window.electronAPI.chat.sseUrl（本机 AI 网关，复用用户已配供应商与密钥）
 * 样式：内联 style + 主题 token（hsl(var(--…))），明暗主题自适应；不依赖 Tailwind。
 * ========================================================================= */

/* ------------------------------------------------------------------ *
 * 一、宿主 AI 网关客户端（与宿主 renderer 的解析逻辑逐行对齐）
 * ------------------------------------------------------------------ */

const AI_CONFIG_KEY = "notrat-ai-config";
const AI_CURRENT_PREFIX = "notrat-ai-current:";

/** 宿主 getWindowWorkspaceKey()：URL ?workspace= 净化（trim → 小写 → 非 [a-z0-9-_] 换 _） */
function windowWorkspaceKey() {
  try {
    return (new URLSearchParams(window.location.search).get("workspace") || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "_");
  } catch (e) {
    return "";
  }
}

/** 宿主 loadAIConfig()：{ providers: [...], currentProvider } */
function loadAIConfig() {
  try {
    const raw = localStorage.getItem(AI_CONFIG_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw);
    if (!cfg || !Array.isArray(cfg.providers) || cfg.providers.length === 0) return null;
    return cfg;
  } catch (e) {
    return null;
  }
}

/** 宿主 loadWindowSelection()：只存 { providerId, model }，两个字段都必须是字符串 */
function loadWindowSelection() {
  const key = windowWorkspaceKey();
  if (!key) return null;
  try {
    const raw = localStorage.getItem(AI_CURRENT_PREFIX + key);
    if (!raw) return null;
    const sel = JSON.parse(raw);
    if (!sel || typeof sel.providerId !== "string" || typeof sel.model !== "string") return null;
    return sel;
  } catch (e) {
    return null;
  }
}

/**
 * 宿主 applyWindowSelection() + 取当前供应商 → 归一成 /chat 需要的 provider 形状。
 * 返回 { id, type, baseUrl, model, apiKey }，失败返回 null。
 */
function resolveProvider() {
  const cfg = loadAIConfig();
  if (!cfg) return null;
  let currentId = cfg.currentProvider;
  let providers = cfg.providers;

  const sel = loadWindowSelection();
  if (sel && providers.some((p) => p.id === sel.providerId)) {
    currentId = sel.providerId;
    if (sel.model) providers = providers.map((p) => (p.id === sel.providerId ? { ...p, model: sel.model } : p));
  }
  const p = providers.filter((x) => x.id === currentId)[0] || providers[0];
  if (!p) return null;
  return { id: p.id, type: p.type, baseUrl: p.baseUrl, model: p.model, apiKey: p.apiKey };
}

/**
 * POST {sseUrl}/chat → SSE 流式读。
 * 事件序列：session → chunk{content}×N → done | error（另兼容 OpenAI 风格 delta / [DONE]）
 * options.skipEvolution 必带 true —— 插件发起的子调用，进化引擎不得改写本插件提示词。
 */
async function streamChat(opts) {
  const { provider, system, user, signal, onDelta } = opts;
  const api = typeof window !== "undefined" ? window.electronAPI : null;
  const url = api && api.chat && api.chat.sseUrl;
  if (!url) throw new Error("宿主 AI 网关不可用（electronAPI.chat.sseUrl 未注入）");

  const messages = (system ? [{ role: "system", content: system }] : []).concat([
    { role: "user", content: user },
  ]);

  const res = await fetch(url + "/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: signal,
    body: JSON.stringify({
      provider: provider,
      messages: messages,
      options: {
        temperature: 0.3,
        maxTokens: 4096,
        apiKey: provider.apiKey,
        skipEvolution: true,
      },
    }),
  });
  if (!res.ok) throw new Error("AI 网关返回 HTTP " + res.status);
  if (!res.body) throw new Error("AI 网关无流式响应体");

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let ev = "";
  let out = "";
  let errMsg = "";

  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buf += dec.decode(chunk.value, { stream: true });
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (line.indexOf("event:") === 0) {
        ev = line.slice(6).trim();
        continue;
      }
      if (line.indexOf("data:") !== 0) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") {
        ev = "";
        continue;
      }
      let j = null;
      try {
        j = JSON.parse(payload);
      } catch (e) {
        ev = "";
        continue;
      }
      if (ev === "error" || j.error) {
        const e2 = j.error;
        errMsg = String((e2 && (e2.message || e2)) || "AI 返回错误");
        ev = "";
        continue;
      }
      const piece =
        (typeof j.content === "string" && j.content) ||
        (typeof j.delta === "string" && j.delta) ||
        (j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content) ||
        "";
      if (piece && typeof piece === "string") {
        out += piece;
        onDelta(out);
      }
      ev = "";
    }
  }
  if (!out && errMsg) throw new Error(errMsg);
  return out;
}


/* ------------------------------------------------------------------ *
 * 二、动作定义（科研写作场景）
 * ------------------------------------------------------------------ */

const SYS_BASE =
  "你是科研论文的 LaTeX 写作助手。用户会给你一段从 .tex 源文件里选中的文本。\n" +
  "硬性要求：\n" +
  "1) 原样保留所有 LaTeX 命令、环境、宏（如 \\cite{} \\ref{} \\label{} \\textbf{} 等）与数学公式（$...$、\\begin{equation} 等），不得改动、不得转义、不得补全；\n" +
  "2) 只输出处理后的文本本身，不要输出任何解释、前言、结语、标题或 Markdown 代码围栏；\n" +
  "3) 不要新增或删除引用键（\\cite 里的 key 必须原样保留）。";

const ACTIONS = [
  {
    id: "polish",
    label: "学术润色",
    hint: "改写为更严谨的学术表达，保持原意与 LaTeX 结构",
    ask: "请对下面这段选中文本做学术润色，使其更严谨、简洁、符合期刊论文表达习惯。保持语言不变（中文仍是中文，英文仍是英文）与所有 LaTeX 命令/公式原样。只输出改写后的文本。",
  },
  {
    id: "to-en",
    label: "中译英",
    hint: "翻译成学术英文，LaTeX 与公式不动",
    ask: "请把下面这段选中文本翻译成地道的学术英文。所有 LaTeX 命令与数学公式必须原样保留、位置不变。只输出译文。",
  },
  {
    id: "to-zh",
    label: "英译中",
    hint: "翻译成中文学术表达，LaTeX 与公式不动",
    ask: "请把下面这段选中文本翻译成中文学术表达。所有 LaTeX 命令与数学公式必须原样保留、位置不变。只输出译文。",
  },
  {
    id: "explain-math",
    label: "解释公式",
    hint: "逐个说明数学符号与公式整体含义",
    ask: "请解释下面这段选中文本里的数学公式：逐个说明出现的符号含义、公式在做的事，以及它在论文中的常见用途。用中文回答，可简短分段，不必保留 LaTeX 结构。",
  },
  {
    id: "to-latex",
    label: "转公式",
    hint: "把自然语言描述转成 LaTeX 数学公式",
    ask: "请把下面这段选中文本（自然语言描述）转写成规范的 LaTeX 数学公式。优先使用 amsmath 提供的环境与命令。只输出公式本身（含必要的 $ 或 \\begin{equation} 包裹），不要解释。",
  },
  {
    id: "tighten",
    label: "精简",
    hint: "压缩冗余表述，保留全部信息与引用",
    ask: "请删减下面这段选中文本的冗余与重复表述，使其更紧凑，但不得丢失任何信息、不得删除任何 \\cite{} 引用。保持语言不变，保持 LaTeX 命令与公式原样。只输出精简后的文本。",
  },
  {
    id: "expand",
    label: "扩写",
    hint: "补充过渡与解释，使论证更完整",
    ask: "请在保持原意的前提下适度扩写下面这段选中文本，补充必要的过渡与解释，使论证更完整。不要编造数据、不要新增引用键。保持语言不变，保持 LaTeX 命令与公式原样。只输出扩写后的文本。",
  },
];

/* ------------------------------------------------------------------ *
 * 三、样式与工具
 * ------------------------------------------------------------------ */

const C = {
  error: "#ef4444",
  warning: "#f59e0b",
  ok: "#22c55e",
  info: "hsl(var(--muted-foreground))",
};

const S = {
  root: { padding: "10px 12px", fontSize: 12, color: "hsl(var(--foreground))" },
  card: {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 10,
    padding: "10px 12px",
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: "hsl(var(--muted-foreground))",
    marginBottom: 6,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  btn: {
    padding: "3px 9px",
    borderRadius: 6,
    fontSize: 11,
    cursor: "pointer",
    border: "1px solid hsl(var(--border))",
    background: "transparent",
    color: "hsl(var(--foreground))",
    margin: "0 4px 4px 0",
  },
  btnPrimary: {
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 11,
    cursor: "pointer",
    border: "1px solid hsl(var(--primary))",
    background: "hsl(var(--primary))",
    color: "hsl(var(--primary-foreground))",
  },
  btnOn: {
    padding: "3px 9px",
    borderRadius: 6,
    fontSize: 11,
    cursor: "pointer",
    border: "1px solid hsl(var(--primary))",
    background: "hsl(var(--primary))",
    color: "hsl(var(--primary-foreground))",
    margin: "0 4px 4px 0",
  },
  chip: {
    display: "inline-block",
    padding: "1px 7px",
    marginRight: 5,
    borderRadius: 999,
    fontSize: 10,
    border: "1px solid hsl(var(--border))",
    color: "hsl(var(--muted-foreground))",
    whiteSpace: "nowrap",
  },
  pre: {
    margin: 0,
    padding: "8px 9px",
    borderRadius: 8,
    background: "hsl(var(--muted))",
    border: "1px solid hsl(var(--border))",
    fontSize: 11.5,
    lineHeight: 1.6,
    fontFamily: "Consolas, 'Courier New', ui-monospace, monospace",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    maxHeight: 240,
    overflow: "auto",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "5px 8px",
    borderRadius: 6,
    fontSize: 11.5,
    border: "1px solid hsl(var(--border))",
    background: "hsl(var(--background))",
    color: "hsl(var(--foreground))",
    outline: "none",
  },
  hint: { fontSize: 11, color: "hsl(var(--muted-foreground))", lineHeight: 1.7 },
};

function isLatexPath(p) {
  if (!p) return false;
  return /\.(tex|latex|ltx|bib|cls|sty|dtx|ins)$/i.test(String(p));
}

/** 宿主超长截断会追加「…[已截断,原 N 字符]」，取出 N 用于警示 */
function truncationNote(text) {
  const m = String(text || "").match(/\[已截断,\s*原\s*(\d+)\s*字符\]/);
  return m ? m[1] : "";
}

/** 模型偶尔会包 ``` 围栏，展示/复制前剥掉 */
function unwrapFence(s) {
  const t = String(s || "").trim();
  if (t.indexOf("```") === 0) {
    const lines = t.split(/\r?\n/);
    if (lines.length >= 2) {
      lines.shift();
      if (lines[lines.length - 1].trim() === "```") lines.pop();
      return lines.join("\n").trim();
    }
  }
  return t;
}

function baseName(p) {
  const s = String(p || "");
  const seg = s.split(/[\\/]/);
  return seg[seg.length - 1] || s;
}

/* ------------------------------------------------------------------ *
 * 四、面板组件
 * ------------------------------------------------------------------ */

export default function LatexSelectionPanel(props) {
  const ctx = (props && props.ctx) || null;
  const sel = (ctx && ctx.selection) || null;
  const ctxHasSelectionField = !!(ctx && Object.prototype.hasOwnProperty.call(ctx, "selection"));

  const [action, setAction] = useState("polish");
  const [custom, setCustom] = useState("");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [snap, setSnap] = useState(null); // 发起时的选区快照（选区是 live 的，跑完可能已变）
  const abortRef = useRef(null);

  /* 跨主区标签切换保留结果（切标签会卸载组件） */
  useEffect(function () {
    try {
      const raw = sessionStorage.getItem("notrat-latex-selection");
      if (raw) {
        const s = JSON.parse(raw);
        if (s && typeof s.out === "string") setOut(s.out);
        if (s && typeof s.action === "string") setAction(s.action);
      }
    } catch (e) {}
  }, []);

  useEffect(
    function () {
      try {
        sessionStorage.setItem("notrat-latex-selection", JSON.stringify({ out: out, action: action }));
      } catch (e) {}
    },
    [out, action]
  );

  /* 卸载时中止在途请求，避免请求悬挂与 setState-after-unmount */
  useEffect(function () {
    return function () {
      if (abortRef.current) {
        try {
          abortRef.current.abort();
        } catch (e) {}
        abortRef.current = null;
      }
    };
  }, []);

  useEffect(
    function () {
      if (!toast) return undefined;
      const t = setTimeout(function () {
        setToast("");
      }, 2200);
      return function () {
        clearTimeout(t);
      };
    },
    [toast]
  );

  const stop = useCallback(function () {
    if (abortRef.current) {
      try {
        abortRef.current.abort();
      } catch (e) {}
      abortRef.current = null;
    }
    setBusy(false);
  }, []);

  const run = useCallback(
    async function (act) {
      const s = sel;
      if (!s || !s.text) {
        setErr("当前没有划词内容");
        return;
      }
      const provider = resolveProvider();
      if (!provider) {
        setErr("读不到已配置的 AI 供应商。请先在 Notrat 设置里配好一个模型供应商。");
        return;
      }
      if (!provider.apiKey) {
        setErr("供应商「" + (provider.id || "?") + "」没有可用的 API Key，请到设置里补全。");
        return;
      }

      const instruction = act.id === "custom" ? String(custom || "").trim() : act.ask;
      if (!instruction) {
        setErr("请先填写自定义指令");
        return;
      }

      setErr("");
      setBusy(true);
      setOut("");
      setSnap({ text: s.text, filePath: s.filePath, lineFrom: s.lineFrom, lineTo: s.lineTo });

      const parts = [];
      if (s.filePath) parts.push("源文件：" + s.filePath);
      if (s.lineFrom != null) parts.push("行号：" + s.lineFrom + (s.lineTo != null ? "-" + s.lineTo : ""));
      if (parts.length) parts.push("");
      parts.push("选中文本：");
      parts.push("```latex");
      parts.push(String(s.text));
      parts.push("```");

      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      abortRef.current = ctrl;

      try {
        await streamChat({
          provider: provider,
          system: SYS_BASE,
          user: instruction + "\n\n" + parts.join("\n"),
          signal: ctrl ? ctrl.signal : undefined,
          onDelta: function (acc) {
            setOut(acc);
          },
        });
      } catch (e) {
        const msg = String((e && e.message) || e);
        if (!/abort/i.test(msg)) setErr(msg);
      } finally {
        abortRef.current = null;
        setBusy(false);
      }
    },
    [sel, custom]
  );

  function copy() {
    const t = unwrapFence(out);
    if (!t) return;
    try {
      navigator.clipboard.writeText(t);
      setToast("✓ 已复制");
    } catch (e) {
      setErr("复制失败：" + String((e && e.message) || e));
    }
  }

  function quote() {
    const t = unwrapFence(out);
    if (!t) return;
    try {
      window.dispatchEvent(
        new CustomEvent("notrat-quote-to-chat", {
          detail: {
            text: t,
            source: "✍️ LaTeX 划词" + (snap && snap.filePath ? " · " + baseName(snap.filePath) : ""),
            filePath: (snap && snap.filePath) || "",
            lineFrom: snap ? snap.lineFrom : undefined,
            lineTo: snap ? snap.lineTo : undefined,
          },
        })
      );
      setToast("✓ 已引用到 AI 对话");
    } catch (e) {
      setErr("引用失败：" + String((e && e.message) || e));
    }
  }

  /* ---------- 空态 ---------- */
  if (!sel || !sel.text) {
    return (
      <div style={S.root}>
        <div style={S.card}>
          <div style={S.cardTitle}>
            <span>✍️ 划词助手</span>
          </div>
          <div style={S.hint}>
            {!ctxHasSelectionField
              ? "当前宿主版本未注入 ctx.selection，划词助手不可用（需较新的 Notrat 客户端）。"
              : "在 .tex 文件里选中一段文字，这里就会出现润色 / 翻译 / 解释公式等动作。"}
            <br />
            <br />
            <span style={{ color: C.info }}>
              没反应？两种可能：① 还没选中文字；② 划词引用属基础版及以上权益，纯净版不包含。
            </span>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- 有选区 ---------- */
  const truncated = truncationNote(sel.text);
  const cur = ACTIONS.filter(function (a) {
    return a.id === action;
  })[0];

  return (
    <div style={S.root}>
      {toast ? (
        <div
          style={{
            background: C.ok,
            color: "#fff",
            borderRadius: 6,
            padding: "4px 9px",
            fontSize: 11,
            marginBottom: 8,
          }}
        >
          {toast}
        </div>
      ) : null}

      <div style={S.card}>
        <div style={S.cardTitle}>
          <span>✍️ 划词助手</span>
          <span style={{ fontWeight: 400, fontSize: 10 }}>
            {busy ? <span style={{ color: C.warning }}>生成中…</span> : <span style={{ color: C.info }}>就绪</span>}
          </span>
        </div>

        <div style={{ marginBottom: 6 }}>
          <span style={S.chip}>📄 {baseName(sel.filePath) || sel.source || "未命名"}</span>
          {sel.lineFrom != null ? (
            <span style={S.chip}>
              L{sel.lineFrom}
              {sel.lineTo != null && sel.lineTo !== sel.lineFrom ? "-" + sel.lineTo : ""}
            </span>
          ) : null}
          <span style={S.chip}>{String(sel.text).length} 字符</span>
        </div>

        {!isLatexPath(sel.filePath) ? (
          <div style={{ ...S.hint, color: C.warning, marginBottom: 6 }}>
            ⚠ 当前文件不是 LaTeX 系后缀，动作提示词按 LaTeX 语境给出，效果可能打折扣。
          </div>
        ) : null}

        {truncated ? (
          <div style={{ ...S.hint, color: C.warning, marginBottom: 6 }}>
            ⚠ 选区过长已被宿主截断（原文 {truncated} 字符），结果只覆盖可用的前一段。
          </div>
        ) : null}

        <div style={{ ...S.pre, maxHeight: 120 }}>{sel.text}</div>
      </div>

      <div style={S.card}>
        <div style={S.cardTitle}>
          <span>动作</span>
        </div>
        <div>
          {ACTIONS.map(function (a) {
            const on = a.id === action;
            return (
              <button
                key={a.id}
                title={a.hint}
                disabled={busy}
                onClick={function () {
                  setAction(a.id);
                  run(a);
                }}
                style={on ? S.btnOn : S.btn}
              >
                {a.label}
              </button>
            );
          })}
          <button
            title="用你自己的指令处理这段选区"
            disabled={busy}
            onClick={function () {
              setAction("custom");
            }}
            style={action === "custom" ? S.btnOn : S.btn}
          >
            自定义
          </button>
        </div>

        {action === "custom" ? (
          <div style={{ marginTop: 6 }}>
            <input
              style={S.input}
              placeholder="例如：把这段改成投稿信的正式口吻"
              value={custom}
              onChange={function (e) {
                setCustom(e.target.value);
              }}
              onKeyDown={function (e) {
                if (e.key === "Enter" && !busy) run({ id: "custom" });
              }}
            />
            <div style={{ marginTop: 6 }}>
              <button
                disabled={busy || !String(custom || "").trim()}
                onClick={function () {
                  run({ id: "custom" });
                }}
                style={S.btnPrimary}
              >
                执行
              </button>
            </div>
          </div>
        ) : cur ? (
          <div style={{ ...S.hint, marginTop: 2 }}>{cur.hint}</div>
        ) : null}
      </div>

      {err ? (
        <div style={{ ...S.card, borderColor: C.error }}>
          <div style={{ ...S.cardTitle, color: C.error }}>
            <span>出错了</span>
          </div>
          <div style={{ ...S.hint, color: C.error }}>{err}</div>
        </div>
      ) : null}

      {out || busy ? (
        <div style={S.card}>
          <div style={S.cardTitle}>
            <span>结果</span>
            <span>
              {busy ? (
                <button onClick={stop} style={S.btn}>
                  停止
                </button>
              ) : null}
            </span>
          </div>
          <div style={S.pre}>{out || "…"}</div>
          {!busy && out ? (
            <div style={{ marginTop: 8 }}>
              <button onClick={quote} style={S.btnPrimary}>
                💬 引用到对话
              </button>
              <button onClick={copy} style={{ ...S.btn, marginLeft: 6 }}>
                📋 复制
              </button>
              <button
                onClick={function () {
                  setOut("");
                  setErr("");
                }}
                style={{ ...S.btn, marginLeft: 6 }}
              >
                ↺ 清空
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
