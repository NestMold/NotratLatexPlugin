import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";

/* =========================================================================
 * LaTeX 助手 — 章节大纲面板 v2（ui.location = "outline"）
 *
 * 挂载位：左侧栏「大纲」标签下、宿主自带文件大纲之后的插件卡片里
 *        （宿主 components/Sidebar/PluginUiHosts.tsx#PluginOutlinePanels，
 *          容器 p-3 pt-1 space-y-2，外面已经有 PanelShell 卡片和标题行）。
 *
 * v1 的问题（这一版逐条修掉）：
 *   1. 行不可点 —— 大纲点不动等于没用。现在点任意行 → 源码滚过去并闪一下
 *      （notrat-latex-reveal-line，编辑器回 ACK；没人接住就先让宿主打开该文件再补发）
 *   2. 平铺列表 —— 现在按章节层级建树、逐节折叠，长论文不再一坨
 *   3. 编号是面板自己瞎编的 —— 现在认 \section*（不编号）、认 book/report 的
 *      章节编号（1.2 / 1.2.3），不再冒"第0部分"这种数字
 *   4. 只有章节 —— 图/表/公式（带 caption、\label、行号）与 TODO/FIXME 也进树，
 *      挂在"它前面那一节"下面
 *   5. 不知道你在写哪一节 —— 编辑器广播光标行，面板高亮该节并自动展开祖先
 *   6. 没有检索 —— 加过滤框（命中即展开，Esc 清空）
 *
 * v0.5.1：显示条件收紧 —— 当前活动文件不是 LaTeX 时整张卡片不出现（宿主没有
 *   visibleWhen 之类的条件位，所以由面板自己把宿主卡片外壳藏掉，见 useHostCardHidden）。
 * 数据：自调本插件 MCP 工具 latex_parse / latex_validate（走主进程 IPC，无 CORS）
 * 样式：全部内联 + 主题 token（Tailwind 不扫描插件源码，写 class 无效）
 * ========================================================================= */

/* ============================ 常量 / 样式 ============================ */

const S = {
  root: {
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontSize: 12,
    color: "hsl(var(--foreground))",
    display: "flex",
    flexDirection: "column",
    gap: 5,
    minWidth: 0,
    /* 被父级横向 flex 槽位或外部 !important 覆盖时，仍保持「整宽 + 竖向堆叠」 */
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    alignItems: "stretch",
  },
  bar: { display: "flex", alignItems: "center", gap: 4, minWidth: 0, flexWrap: "wrap" },
  file: {
    flex: 1,
    minWidth: 0,
    fontWeight: 600,
    fontSize: 11.5,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ibtn: {
    border: "1px solid hsl(var(--border))",
    background: "hsl(var(--card))",
    color: "hsl(var(--foreground))",
    borderRadius: 5,
    width: 20,
    height: 20,
    lineHeight: "18px",
    fontSize: 11,
    textAlign: "center",
    padding: 0,
    cursor: "pointer",
    flexShrink: 0,
  },
  input: {
    flex: 1,
    minWidth: 40,
    border: "1px solid hsl(var(--border))",
    background: "hsl(var(--background))",
    color: "hsl(var(--foreground))",
    borderRadius: 5,
    padding: "2px 6px",
    fontSize: 11,
    outline: "none",
  },
  sel: {
    border: "1px solid hsl(var(--border))",
    background: "hsl(var(--background))",
    color: "hsl(var(--foreground))",
    borderRadius: 5,
    fontSize: 11,
    padding: "1px 1px",
    flexShrink: 0,
    maxWidth: 74,
  },
  chip: {
    border: "1px solid hsl(var(--border))",
    background: "hsl(var(--card))",
    color: "hsl(var(--muted-foreground))",
    borderRadius: 5,
    fontSize: 11,
    lineHeight: "18px",
    padding: "0 5px",
    cursor: "pointer",
    flexShrink: 0,
  },
  chipOn: {
    border: "1px solid hsl(var(--primary))",
    background: "hsl(var(--primary) / 0.12)",
    color: "hsl(var(--foreground))",
    borderRadius: 5,
    fontSize: 11,
    lineHeight: "18px",
    padding: "0 5px",
    cursor: "pointer",
    flexShrink: 0,
  },
  body: { maxHeight: "46vh", overflowY: "auto", overflowX: "hidden", outline: "none", margin: "0 -3px", minWidth: 0 },
  row: {
    display: "flex",
    alignItems: "baseline",
    gap: 5,
    padding: "1px 6px 1px 3px",
    borderRadius: 4,
    cursor: "pointer",
    borderLeft: "2px solid transparent",
    minWidth: 0,
  },
  num: {
    color: "hsl(var(--muted-foreground))",
    fontVariantNumeric: "tabular-nums",
    fontSize: 10.5,
    flexShrink: 0,
  },
  txt: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  ic: { flexShrink: 0, fontSize: 10, opacity: 0.85 },
  badge: {
    fontSize: 9.5,
    padding: "0 3px",
    borderRadius: 3,
    border: "1px solid hsl(var(--border))",
    flexShrink: 0,
  },
  ln: { color: "hsl(var(--muted-foreground))", fontSize: 9.5, opacity: 0.65, flexShrink: 0 },
  chev: {
    flexShrink: 0,
    width: 11,
    textAlign: "center",
    fontSize: 9,
    color: "hsl(var(--muted-foreground))",
    cursor: "pointer",
    userSelect: "none",
  },
  empty: {
    padding: "6px 2px",
    color: "hsl(var(--muted-foreground))",
    fontSize: 11,
    lineHeight: 1.7,
  },
  err: {
    padding: 6,
    borderRadius: 6,
    border: "1px solid hsl(var(--destructive))",
    color: "hsl(var(--destructive))",
    fontSize: 11,
    whiteSpace: "pre-wrap",
  },
  foot: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    borderTop: "1px solid hsl(var(--border))",
    paddingTop: 4,
    color: "hsl(var(--muted-foreground))",
    fontSize: 10,
  },
};

/* 节点图标。全部用等宽符号，避免不同字体下的破图 */
const KIND_ICON = {
  part: "◆",
  chapter: "▣",
  section: "§",
  subsection: "•",
  subsubsection: "◦",
  figure: "🖼",
  table: "▦",
  equation: "∑",
  todo: "📝",
  label: "🏷",
};

/* ==================== 纯逻辑（无 React 依赖，可单测） ==================== */

const DOC_CHAPTER_CLASS = /(book|report|memoir|scrbook|scrreprt)/i;
const EQ_ENV = /^(equation|align|gather|eqnarray|multline)$/;

/** 文档是否有"章"这一层（book/report 有，article 没有） */
function hasChapters(parsed) {
  const dc = String((parsed && parsed.documentClass) || "");
  if (DOC_CHAPTER_CLASS.test(dc)) return true;
  return ((parsed && parsed.sections) || []).some(function (s) {
    return s.cmd === "chapter";
  });
}

/** 章节命令 → 树里的层级深度（article: section=1；book: chapter=1, section=2） */
function sectionDepth(cmd, chapters) {
  if (cmd === "part") return 0;
  if (cmd === "chapter") return 1;
  if (cmd === "section") return chapters ? 2 : 1;
  if (cmd === "subsection") return chapters ? 3 : 2;
  if (cmd === "subsubsection") return chapters ? 4 : 3;
  return 1;
}

/** 浮动体/公式环境名 → 节点类型 */
function envKind(name) {
  const n = String(name || "").replace(/\*$/, "");
  if (n === "figure") return "figure";
  if (n === "table") return "table";
  if (EQ_ENV.test(n)) return "equation";
  return "";
}

/** 章节自动编号：\section* 不编号；book/report 下带章号前缀 */
function sectionNumbers(sections, chapters) {
  const c = { part: 0, chapter: 0, section: 0, subsection: 0, subsubsection: 0 };
  return (sections || []).map(function (s) {
    const cmd = s.cmd;
    if (s.star) return "";
    if (cmd === "part") {
      c.part++;
      c.chapter = 0;
      c.section = 0;
      c.subsection = 0;
      c.subsubsection = 0;
      return "第" + c.part + "部分";
    }
    if (cmd === "chapter") {
      c.chapter++;
      c.section = 0;
      c.subsection = 0;
      c.subsubsection = 0;
      return "第" + c.chapter + "章";
    }
    if (cmd === "section") {
      c.section++;
      c.subsection = 0;
      c.subsubsection = 0;
      return chapters && c.chapter ? c.chapter + "." + c.section : String(c.section);
    }
    const base = chapters && c.chapter ? c.chapter + "." + c.section : String(c.section);
    if (cmd === "subsection") {
      c.subsection++;
      c.subsubsection = 0;
      return base + "." + c.subsection;
    }
    c.subsubsection++;
    return base + "." + c.subsection + "." + c.subsubsection;
  });
}

/** 行号 → 该行上的校验问题清单 */
function indexIssues(issues) {
  const map = {};
  ((issues && issues.issues) || []).forEach(function (it) {
    const ln = Number(it.line) || 0;
    if (!ln) return;
    if (!map[ln]) map[ln] = [];
    map[ln].push(it);
  });
  return map;
}

/**
 * 把 latex_parse 的结构拍成一棵可渲染的树。
 * opts: { showFloats, showTodos, showLabels }
 */
function buildModel(parsed, issues, opts) {
  const o = opts || {};
  const showFloats = o.showFloats !== false;
  const showTodos = o.showTodos !== false;
  const showLabels = o.showLabels === true;

  const p = parsed || {};
  const sections = p.sections || [];
  const chapters = hasChapters(p);
  const nums = sectionNumbers(sections, chapters);
  const issueMap = indexIssues(issues);

  const roots = [];
  const open = []; // 章节祖先栈
  const sectionNodes = [];
  const byId = {};
  const parentOf = {};
  const counts = { figure: 0, table: 0, equation: 0 };

  sections.forEach(function (s, i) {
    const depth = sectionDepth(s.cmd, chapters);
    const node = {
      id: "s" + s.line + "-" + i,
      kind: s.cmd === "part" || s.cmd === "chapter" ? s.cmd : "section",
      cmd: s.cmd,
      depth: depth,
      title: s.title || "(无标题)",
      number: nums[i],
      star: !!s.star,
      line: s.line,
      endLine: 0,
      children: [],
      issues: issueMap[s.line] || [],
      hasKids: false,
    };
    while (open.length && open[open.length - 1].depth >= depth) open.pop();
    if (open.length) {
      const par = open[open.length - 1];
      par.children.push(node);
      parentOf[node.id] = par.id;
    } else {
      roots.push(node);
    }
    open.push(node);
    sectionNodes.push(node);
    byId[node.id] = node;
  });

  /* 浮动体 / 公式 / 待办 / 标签：挂在"它前面最近的那一节"下面 */
  const extra = [];
  if (showFloats) {
    (p.environments || []).forEach(function (e, i) {
      const kind = envKind(e.name);
      if (!kind) return;
      counts[kind]++;
      const label = kind === "figure" ? "图" + counts.figure : kind === "table" ? "表" + counts.table : "式" + counts.equation;
      const fallback = kind === "figure" ? "(无图题)" : kind === "table" ? "(无表题)" : "(无标签)";
      extra.push({
        id: "e" + e.line + "-" + i,
        kind: kind,
        depth: 0,
        title: e.caption || e.label || fallback,
        number: label,
        label: e.label || "",
        env: e.name,
        line: e.line,
        endLine: e.endLine || 0,
        children: [],
        issues: issueMap[e.line] || [],
        hasKids: false,
      });
    });
  }
  if (showTodos) {
    (p.todos || []).forEach(function (t, i) {
      extra.push({
        id: "t" + t.line + "-" + i,
        kind: "todo",
        depth: 0,
        title: t.text || t.kind,
        number: t.kind,
        line: t.line,
        endLine: 0,
        children: [],
        issues: issueMap[t.line] || [],
        hasKids: false,
      });
    });
  }
  if (showLabels) {
    (p.labels || []).forEach(function (l, i) {
      extra.push({
        id: "l" + l.line + "-" + i,
        kind: "label",
        depth: 0,
        title: l.key,
        number: l.env || "标签",
        line: l.line,
        endLine: 0,
        children: [],
        issues: issueMap[l.line] || [],
        hasKids: false,
      });
    });
  }

  extra.sort(function (a, b) {
    return a.line - b.line || (a.id < b.id ? -1 : 1);
  });

  let si = 0;
  let owner = null;
  extra.forEach(function (n) {
    while (si < sectionNodes.length && sectionNodes[si].line <= n.line) {
      owner = sectionNodes[si];
      si++;
    }
    n.depth = owner ? owner.depth + 1 : 0;
    if (owner) {
      owner.children.push(n);
      parentOf[n.id] = owner.id;
    } else {
      roots.push(n);
    }
    byId[n.id] = n;
  });

  /* 文首的浮动体要排在第一个章节之前 */
  roots.sort(function (a, b) {
    return a.line - b.line || (a.id < b.id ? -1 : 1);
  });

  /* 章节区间结束行（供"光标落在哪一节"用） */
  for (let i = 0; i < sectionNodes.length; i++) {
    sectionNodes[i].endLine = i + 1 < sectionNodes.length ? sectionNodes[i + 1].line - 1 : 0;
  }

  /* 子节点按行号稳定排序 + 拍平（flat 必须按行号单调，活跃节查找依赖它） */
  const pre = [];
  (function walk(list) {
    (list || []).forEach(function (n) {
      n.hasKids = !!(n.children && n.children.length);
      if (n.hasKids) {
        n.children.sort(function (a, b) {
          return a.line - b.line || (a.id < b.id ? -1 : 1);
        });
        walk(n.children);
      }
      pre.push(n);
    });
  })(roots);
  const flat = pre.sort(function (a, b) {
    return a.line - b.line || (a.id < b.id ? -1 : 1);
  });

  return {
    roots: roots,
    flat: flat,
    byId: byId,
    parentOf: parentOf,
    chapters: chapters,
    counts: counts,
    summary: {
      sections: sections.length,
      figures: counts.figure,
      tables: counts.table,
      equations: counts.equation,
      todos: (p.todos || []).length,
      words: p.wordCount ? p.wordCount.approxWords : 0,
    },
  };
}

/** 过滤：命中即保留，并把祖先一起留住（标 forceOpen 让它们强制展开） */
function filterTree(nodes, q) {
  if (!q) return nodes;
  const out = [];
  (nodes || []).forEach(function (n) {
    const kids = filterTree(n.children || [], q);
    const hay = (n.title + " " + (n.number || "") + " " + (n.label || "") + " " + (n.cmd || n.kind)).toLowerCase();
    if (hay.indexOf(q) >= 0 || kids.length) {
      const c = {};
      for (const k in n) if (Object.prototype.hasOwnProperty.call(n, k)) c[k] = n[k];
      c.children = kids;
      c.forceOpen = true;
      out.push(c);
    }
  });
  return out;
}

/** 按折叠状态拍平成可见行 */
function flattenVisible(nodes, collapsed, out) {
  const acc = out || [];
  (nodes || []).forEach(function (n) {
    acc.push(n);
    const kids = n.children || [];
    if (!kids.length) return;
    if (collapsed[n.id] && !n.forceOpen) return;
    flattenVisible(kids, collapsed, acc);
  });
  return acc;
}

/** 折叠深度大于 maxDepth 的节点（maxDepth=null → 全部展开） */
function collapseDeeperThan(nodes, maxDepth) {
  const c = {};
  if (maxDepth === null || maxDepth === undefined) return c;
  (function walk(list) {
    (list || []).forEach(function (n) {
      if (n.children && n.children.length) {
        if (n.depth > maxDepth) c[n.id] = true;
        walk(n.children);
      }
    });
  })(nodes);
  return c;
}

/** 光标所在行 → 当前节点（同一行优先认章节，避免被同一行的 \label 抢走） */
function activeNodeId(flat, line) {
  if (!line) return "";
  let hit = "";
  for (let i = 0; i < flat.length; i++) {
    const n = flat[i];
    if (n.line > line) break;
    if (n.kind === "section" && n.line === line) return n.id;
    hit = n.id;
  }
  return hit;
}

/* ============================ 事件通道 ============================ */

/* 活动文件桥（消费侧）：
 * 面板拿不到活动文件（官方 props 只有 { serverId, pluginId, ctx, data, error, launch }，
 * ctx 里只有 workspace），所以问编辑器：
 *   · notrat-latex-active-ping   面板挂载时问一次，编辑器同步回话
 *   · notrat-latex-active-file   编辑器 挂载/切文件/卸载 时广播
 *   · sessionStorage 快照        面板比事件晚挂载时的兜底（8s 内视为有效）
 * v0.5.0 新增两条：
 *   · notrat-latex-cursor        编辑器广播光标行（面板高亮当前节）
 *   · notrat-latex-reveal-line   面板请求滚到某行（编辑器回 ACK）
 */
const LATEX_EV = "notrat-latex-active-file";
const LATEX_PING = "notrat-latex-active-ping";
const LATEX_STORE = "notrat-latex-active";
const LATEX_CURSOR = "notrat-latex-cursor";
const LATEX_CURSOR_PING = "notrat-latex-cursor-ping";
const LATEX_REVEAL = "notrat-latex-reveal-line";
const LATEX_REVEAL_ACK = "notrat-latex-reveal-ack";
const LATEX_EXT = /\.(tex|bib|cls|sty|ltx|latex)$/i;

/* UI 偏好与折叠状态的存放点（sessionStorage，跨面板重挂载保留） */
const UI_KEY = "notrat-latex-outline-ui";
const FOLD_KEY = "notrat-latex-outline-fold";

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

function readJson(key, fallback) {
  try {
    const v = JSON.parse(sessionStorage.getItem(key) || "null");
    return v && typeof v === "object" ? v : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
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

/* 编辑器光标行（只认本面板展示的那个文件） */
function useLatexCursor(file) {
  const [line, setLine] = useState(0);
  useEffect(
    function () {
      setLine(0);
      function onCur(e) {
        const d = (e && e.detail) || {};
        if (!d.path) return;
        if (file && String(d.path) !== String(file)) return;
        setLine(Number(d.line) || 0);
      }
      window.addEventListener(LATEX_CURSOR, onCur);
      try { window.dispatchEvent(new CustomEvent(LATEX_CURSOR_PING)); } catch (e) {}
      return function () { window.removeEventListener(LATEX_CURSOR, onCur); };
    },
    [file]
  );
  return line;
}

/**
 * 请编辑器滚到某行。
 * 编辑器没接住（ACK 超时）说明该文件压根没在编辑器里打开 —— 先让宿主打开它，
 * 隔一拍再补发一次，保证用户点大纲一定有反应。
 */
function revealInEditor(path, line) {
  const target = String(path || "");
  const nonce = "rv" + Date.now().toString(36) + Math.floor(Math.random() * 100000).toString(36);
  let acked = false;
  const timers = [];
  function cleanup() {
    window.removeEventListener(LATEX_REVEAL_ACK, onAck);
    for (let i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers.length = 0;
  }
  function onAck(e) {
    const d = (e && e.detail) || {};
    // 本函数派发的 nonce 前缀一致即为自己的回执（重试轮次带 r0/r1/r2 后缀）
    if (String(d.nonce || "").indexOf(nonce) !== 0) return;
    acked = true;
    cleanup();
  }
  window.addEventListener(LATEX_REVEAL_ACK, onAck);
  try { window.dispatchEvent(new CustomEvent(LATEX_REVEAL, { detail: { path: target, line: line, nonce: nonce } })); } catch (e) {}

  /* v0.6.1：兜底从「1 拍」加到「3 拍」。
   * 第一拍没回执，多半是这文件压根没在编辑器里打开 —— 先让宿主打开它；
   * 但「打开文件 → 编辑器挂载 → 监听就绪」需要时间，只补发一次常常又赶不上，
   * 用户于是还是「点了没反应」。多试几拍，代价只是几个空转的 timeout。 */
  const RETRY_DELAYS = [170, 700, 1500];
  RETRY_DELAYS.forEach(function (delay, i) {
    timers.push(setTimeout(function () {
      if (acked) return;
      if (i === 0) {
        try { window.dispatchEvent(new CustomEvent("notrat-open-file", { detail: { path: target } })); } catch (e) {}
      }
      try {
        window.dispatchEvent(new CustomEvent(LATEX_REVEAL, { detail: { path: target, line: line, nonce: nonce + "r" + i } }));
      } catch (e) {}
    }, delay));
  });
}

/* ============ 显示条件：只有当前活动文件是 LaTeX 时才出现这张卡片 ============ */

/* 当前活动文件从哪来？
 *
 * 首选——宿主 store。宿主编译面板源码后是以
 *     new Function("require", "exports", "module", "React", code)(requireShim, ...)
 * 执行的，而 requireShim 的白名单（宿主 renderer 里的 moduleMap）中就有 "@/store"，
 * useWorkspaceStore 上挂着 currentFile。这是唯一能认出「别的格式文件」的来源。
 *
 * 兜底——事件桥 useActiveLatexFile()。但它只由本插件的编辑器广播，而编辑器
 * 只声明了 "tex"，所以 .bib / .cls / .sty 永远拿不到路径（显示条件也就永远不成立）。
 *
 * 宿主哪天改了白名单，这里返回 known:false，静默退回事件桥：不抛错、不白屏。
 */
function getHostStore() {
  try {
    if (typeof require !== "function") return null;
    const m = require("@/store");
    return m && m.useWorkspaceStore ? m : null;
  } catch (e) {
    return null;
  }
}

function pathOfCurrentFile(useWorkspaceStore) {
  try {
    const cf = useWorkspaceStore.getState().currentFile;
    return String((cf && cf.path) || "");
  } catch (e) {
    return "";
  }
}

/* 返回 { known, path }。known = 宿主是否暴露了 store（false 时交给事件桥兜底）。 */
function useHostCurrentFilePath() {
  const [state, setState] = useState(function () {
    const m = getHostStore();
    if (!m) return { known: false, path: "" };
    return { known: true, path: pathOfCurrentFile(m.useWorkspaceStore) };
  });

  useEffect(function () {
    const m = getHostStore();
    if (!m) return;
    let alive = true;
    const sync = function () {
      if (!alive) return;
      const p = pathOfCurrentFile(m.useWorkspaceStore);
      setState(function (prev) {
        return prev.known && prev.path === p ? prev : { known: true, path: p };
      });
    };
    sync();
    const unsub = m.useWorkspaceStore.subscribe(sync);
    return function () {
      alive = false;
      if (typeof unsub === "function") unsub();
    };
  }, []);

  return state;
}

/* 宿主没有「按条件显示」的能力位 —— ui 贡献面归一化时只保留
 * { key, pluginId, title, icon, location, content, serverId, openMode }，没有 visibleWhen。
 * 而卡片外壳（图标 + 标题行 + 右上角悬停才现身的 ✕）是宿主自己的
 * PanelShell / Dismissable 画的，插件只能决定卡片"内部"画什么。
 * 所以「整张卡片不出现」只能面板自己动手，宿主 DOM 结构是：
 *
 *   div.notrat-plugin-slot.notrat-plugin-slot-outline      ← 挂载位容器（含「插件面板」分区标题）
 *     └ div.relative.group/panel                           ← Dismissable：卡片壳 + ✕
 *         └ div.notrat-plugin-panel                        ← PanelShell 卡片
 *             ├ div.notrat-plugin-panel-header             ← 图标 + 标题行
 *             └ div.notrat-plugin-panel-body > 本面板
 *
 * 向上找到最外层那个壳（走到挂载位容器就停），置 display:none，连 ✕ 一起消失；
 * 条件恢复时原样还原，组件卸载时也还原。
 */
function classTokens(node) {
  const cls = node && typeof node.className === "string" ? node.className : "";
  return cls ? cls.split(/\s+/) : [];
}

/* 卡片本体 = Dismissable 的 group/panel 壳，或退一步的 PanelShell 卡片。
 * 精确 token 比较 —— notrat-plugin-panel-body / -header / -outline 都不算卡片本体。 */
function isCardNode(node) {
  const toks = classTokens(node);
  return toks.indexOf("group/panel") >= 0 || toks.indexOf("notrat-plugin-panel") >= 0;
}

/* 挂载位容器：宿主给每个挂载位都带了 notrat-plugin-slot[-<位置>] 这个类。
 * 前缀匹配 —— 面板被用户挪到别的挂载位（类名后缀不同）时也能正确收手。 */
function isSlotContainer(node) {
  const toks = classTokens(node);
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].indexOf("notrat-plugin-slot") === 0) return true;
  }
  return false;
}

function findHostCard(el) {
  let node = el;
  let card = null;
  while (node && node !== document.body) {
    if (isSlotContainer(node)) break; /* 到挂载位容器，停止，不越界动别人的东西 */
    if (isCardNode(node)) card = node;
    node = node.parentElement;
  }
  return card;
}

function isRendered(node) {
  try {
    const cs = window.getComputedStyle(node);
    return !!cs && cs.display !== "none" && cs.visibility !== "hidden";
  } catch (e) {
    return true;
  }
}

/* 本面板是这一区唯一一张卡片时，「插件面板」那行分区标题会孤零零飘着 —— 一并收起；
 * 还有别人的卡片露着就留着（那是别人的标题，不归我们管）。
 * 只看挂载位容器的【直接子节点】：卡片内部的节点不算数 —— 否则别人的卡片自己被藏了，
 * 它内部的 .notrat-plugin-panel 还会被数成「露着的卡片」，标题就永远收不掉。 */
function hideOrphanSectionLabel(card) {
  const box = card.parentElement;
  if (!box) return null;
  const kids = box.children || [];
  for (let i = 0; i < kids.length; i++) {
    const n = kids[i];
    if (n === card || !isCardNode(n)) continue;
    if (isRendered(n)) return null; /* 还有卡片露着 -> 标题留给它 */
  }
  const label = box.firstElementChild;
  if (!label || label === card || isCardNode(label)) return null;
  return label;
}

/* hidden=true -> 藏掉整张卡片；false -> 还原。返回挂到根节点上的 ref。 */
function useHostCardHidden(hidden) {
  const ref = useRef(null);
  useEffect(
    function () {
      const el = ref.current;
      if (!el || !el.parentElement) return;
      const card = findHostCard(el);
      if (!card) return;
      card.style.display = hidden ? "none" : "";
      const label = hidden ? hideOrphanSectionLabel(card) : null;
      if (label) label.style.display = "none";
      return function () {
        card.style.display = "";
        if (label) label.style.display = "";
      };
    },
    [hidden]
  );
  return ref;
}

/* ============================ 主面板 ============================ */

export default function LatexOutline(props) {
  const act = useActiveLatexFile();
  /* 显示条件：当前活动文件是 LaTeX 系（.tex/.bib/.cls/.sty/.ltx）才出现这张卡片。
   * 首选宿主 store（认得所有格式），拿不到才退回事件桥。 */
  const host = useHostCurrentFilePath();
  const ready = host.known ? true : act.ready;
  const activePath = host.known ? host.path : (act.ready ? act.path : "");
  const showCard = ready && isLatexPath(activePath);
  const rootRef = useHostCardHidden(!showCard);
  const [file, setFile] = useState(function () { return readActiveSnapshot(); });
  const [info, setInfo] = useState(null);
  const [issues, setIssues] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState("");
  const [hoverId, setHoverId] = useState("");
  const [pickedId, setPickedId] = useState("");
  const [follow, setFollow] = useState(true);
  const [folded, setFolded] = useState({});

  const prefsRef = useRef(null);
  if (prefsRef.current === null) prefsRef.current = readJson(UI_KEY, {});
  const prefs0 = prefsRef.current;
  const [showFloats, setShowFloats] = useState(prefs0.showFloats !== false);
  const [showTodos, setShowTodos] = useState(prefs0.showTodos !== false);
  const [showLabels, setShowLabels] = useState(prefs0.showLabels === true);
  const [level, setLevel] = useState(typeof prefs0.level === "number" ? prefs0.level : 9);

  const api = typeof window !== "undefined" ? window.electronAPI : null;
  const rowRefs = useRef({});
  const foldStore = useRef(readJson(FOLD_KEY, {}));

  const callTool = useCallback(
    async function (tool, args) {
      if (!api || !api.mcp || !api.mcp.callTool) throw new Error("electronAPI.mcp 不可用（宿主未注入）");
      const r = await api.mcp.callTool(props.serverId, tool, args);
      if (!r || r.success === false) throw new Error((r && r.error) || "工具调用失败");
      return (r.result && r.result.content ? r.result.content : []).map(function (c) { return c.text; }).join("\n");
    },
    [api, props.serverId]
  );

  const load = useCallback(
    async function (target) {
      const path = String(target || "");
      if (!path) return; // 非 LaTeX 活动文件：不解析，也不回落"自动发现主文件"
      if (!api || !api.mcp || !api.mcp.callTool) {
        setErr("electronAPI.mcp 不可用（宿主未注入）");
        return;
      }
      setBusy(true);
      setErr("");
      try {
        const parseOut = await callTool("latex_parse", { path: path, format: "json" });
        const parsed = JSON.parse(parseOut);
        setInfo(parsed);
        if (parsed && parsed.file && parsed.file !== path) setFile(parsed.file);
        /* 与右侧「LaTeX 助手」面板共用同一份结构缓存（main.tsx 也读写它） */
        try {
          sessionStorage.setItem("notrat-latex-panel", JSON.stringify({ file: parsed.file, info: parsed }));
        } catch (e) {}
        const valOut = await callTool("latex_validate", { path: parsed.file || path, format: "json" });
        const val = JSON.parse(valOut);
        setIssues(val);
        try {
          const s = JSON.parse(sessionStorage.getItem("notrat-latex-panel") || "{}");
          s.issues = val;
          sessionStorage.setItem("notrat-latex-panel", JSON.stringify(s));
        } catch (e) {}
      } catch (e) {
        setErr(String((e && e.message) || e));
      } finally {
        setBusy(false);
      }
    },
    [api, callTool]
  );

  /* 跟随当前活动文件（面板拿不到 filePath，走活动文件桥）。
   * 旧版只依赖工作区路径 -> 切文件不刷新，且切到非 LaTeX 照旧显示上一份 .tex 的大纲。 */
  useEffect(
    function () {
      if (!ready) return;
      setFile(activePath);
      setQ("");
      setPickedId("");
      if (!activePath) {
        setInfo(null);
        setIssues(null);
        setErr("");
        return;
      }
      /* 折叠状态按文件存：同一个 .tex 重新挂载后还是上次收起的样子 */
      const store = foldStore.current;
      setFolded(store[activePath] ? Object.assign({}, store[activePath]) : {});
      load(activePath);
    },
    [ready, activePath, load]
  );

  useEffect(
    function () {
      writeJson(UI_KEY, { showFloats: showFloats, showTodos: showTodos, showLabels: showLabels, level: level });
    },
    [showFloats, showTodos, showLabels, level]
  );

  const model = useMemo(
    function () {
      return buildModel(info, issues, { showFloats: showFloats, showTodos: showTodos, showLabels: showLabels });
    },
    [info, issues, showFloats, showTodos, showLabels]
  );


  const cursorLine = useLatexCursor(file);
  useEffect(function () { setPickedId(""); }, [cursorLine]);

  const query = q.trim().toLowerCase();
  const filtered = useMemo(function () { return filterTree(model.roots, query); }, [model, query]);
  const visible = useMemo(function () { return flattenVisible(filtered, folded); }, [filtered, folded]);

  const cursorActiveId = useMemo(function () { return activeNodeId(model.flat, cursorLine); }, [model, cursorLine]);
  const activeId = pickedId || cursorActiveId;

  /* 自动展开活动节点的祖先 + 滚进视野 */
  useEffect(
    function () {
      if (!follow || !activeId) return;
      const parents = model.parentOf;
      const chain = {};
      let up = parents[activeId];
      while (up) {
        chain[up] = true;
        up = parents[up];
      }
      setFolded(function (c) {
        let changed = false;
        const nx = {};
        for (const k in c) {
          if (!c[k]) continue;
          if (chain[k]) { changed = true; continue; } // 祖先被折叠 -> 展开
          nx[k] = true;
        }
        return changed ? nx : c;
      });
      const el = rowRefs.current[activeId];
      if (el && el.scrollIntoView) {
        try { el.scrollIntoView({ block: "nearest" }); } catch (e) {}
      }
    },
    [activeId, follow, model]
  );

  const sum = (issues && issues.summary) || { errors: 0, warnings: 0, infos: 0 };
  const fname = file ? String(file).split(/[\\/]/).pop() : "(自动发现)";

  if (!showCard) return <div ref={rootRef} style={{ display: "none" }} />;

  function persistFold(nx) {
    const store = foldStore.current;
    store[file] = nx;
    writeJson(FOLD_KEY, store);
  }

  function toggleFold(id) {
    setFolded(function (c) {
      const nx = {};
      for (const k in c) nx[k] = c[k];
      if (nx[id]) delete nx[id];
      else nx[id] = true;
      persistFold(nx);
      return nx;
    });
  }

  function setAllFolded(open) {
    const nx = open ? {} : collapseDeeperThan(model.roots, 0);
    persistFold(nx);
    setLevel(open ? 9 : 0);
    setFolded(nx);
  }

  function quote(s, num) {
    const text = "\\" + s.cmd + "{" + (s.title || "") + "}  （" + num + "，" + fname + " 第 " + s.line + " 行）";
    try {
      window.dispatchEvent(
        new CustomEvent("notrat-quote-to-chat", {
          detail: { text: text, source: fname, lineFrom: s.line, lineTo: s.line },
        })
      );
    } catch (e) {}
  }

  function jump(node) {
    if (!node) return;
    setPickedId(node.id);
    revealInEditor(file, node.line);
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      setQ("");
      return;
    }
    const list = visible;
    if (!list.length) return;
    let idx = -1;
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === activeId) { idx = i; break; }
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      const next = idx < 0 ? (step > 0 ? 0 : list.length - 1) : Math.min(list.length - 1, Math.max(0, idx + step));
      jump(list[next]);
    } else if (e.key === "Home") {
      e.preventDefault();
      jump(list[0]);
    } else if (e.key === "End") {
      e.preventDefault();
      jump(list[list.length - 1]);
    } else if (e.key === "Enter") {
      e.preventDefault();
      jump(model.byId[activeId] || list[0]);
    }
  }

  /* 行内样式：层级越深字号越小；正文类节点（图表公式/待办）整体压暗一档 */
  function rowStyle(n, isActive, isHover) {
    const st = { paddingLeft: 3 + n.depth * 11 };
    if (isActive) {
      st.background = "hsl(var(--accent))";
      st.borderLeftColor = "hsl(var(--primary))";
    } else if (isHover) {
      st.background = "hsl(var(--accent) / 0.55)";
    }
    return st;
  }

  function textStyle(n) {
    if (n.kind !== "section") return { fontSize: 11, color: "hsl(var(--muted-foreground))" };
    if (n.depth <= 1) return { fontWeight: 700, fontSize: 12.5 };
    if (n.depth === 2) return { fontWeight: 600, fontSize: 12 };
    return { fontWeight: 400, fontSize: 11.5 };
  }

  const sm = model.summary;
  const hasBody = !err && info && (visible.length > 0 || query);

  return (
    <div ref={rootRef} style={S.root}>
      {/* ── 第一行：文件 + 校验徽章 + 重解析 ── */}
      <div style={S.bar}>
        <span style={S.file} title={file || ""}>{fname}</span>
        {sum.errors + sum.warnings > 0 ? (
          <span
            style={{ ...S.badge, color: "hsl(var(--destructive))", borderColor: "hsl(var(--destructive))" }}
            title={"校验：错误 " + sum.errors + " / 警告 " + sum.warnings + "（点行上的徽章看详情）"}
          >
            ⚠ {sum.errors}/{sum.warnings}
          </span>
        ) : issues ? (
          <span style={{ ...S.badge, color: "hsl(var(--muted-foreground))" }} title="校验通过">✅</span>
        ) : null}
        <button style={S.ibtn} onClick={function () { load(file); }} disabled={busy} title="重新解析">
          {busy ? "⏳" : "↻"}
        </button>
      </div>

      {/* ── 第二行：过滤 + 展开层级 + 内容开关 ── */}
      <div style={S.bar}>
        <input
          style={S.input}
          value={q}
          placeholder="过滤标题 / 标签…"
          spellCheck={false}
          onChange={function (e) { setQ(e.target.value); }}
          onKeyDown={function (e) { if (e.key === "Escape") setQ(""); }}
        />
        <select
          style={S.sel}
          value={String(level)}
          title="展开到第几层（3+ = 全部展开）"
          onChange={function (e) {
            const v = Number(e.target.value);
            setLevel(v);
            const nx = v >= 9 ? {} : collapseDeeperThan(model.roots, v);
            persistFold(nx);
            setFolded(nx);
          }}
        >
          <option value="0">仅顶层</option>
          <option value="1">1 层</option>
          <option value="2">2 层</option>
          <option value="3">3 层</option>
          <option value="9">全展开</option>
        </select>
        <span
          style={showFloats ? S.chipOn : S.chip}
          title="在图/表/公式的位置显示条目（带 caption 与编号）"
          onClick={function () { setShowFloats(!showFloats); }}
        >
          ▦ 图表
        </span>
        <span
          style={showTodos ? S.chipOn : S.chip}
          title="显示 TODO / FIXME 注释"
          onClick={function () { setShowTodos(!showTodos); }}
        >
          📝 待办
        </span>
        <span
          style={showLabels ? S.chipOn : S.chip}
          title="显示 \label 标签"
          onClick={function () { setShowLabels(!showLabels); }}
        >
          🏷 标签
        </span>
      </div>

      {/* ── 第三行：跟随光标 + 全展开/全收起 ── */}
      <div style={S.bar}>
        <span
          style={follow ? S.chipOn : S.chip}
          title="跟随编辑器光标：自动高亮并展开你正在写的那一节"
          onClick={function () { setFollow(!follow); }}
        >
          ⌖ 跟随光标
        </span>
        <span style={S.chip} title="全部展开" onClick={function () { setAllFolded(true); }}>展开</span>
        <span style={S.chip} title="收起所有子层级" onClick={function () { setAllFolded(false); }}>收起</span>
        <span style={{ flex: 1, minWidth: 0 }} />
        <span style={{ color: "hsl(var(--muted-foreground))", fontSize: 10, whiteSpace: "nowrap" }}>
          {activeId && model.byId[activeId] && model.byId[activeId].kind === "section"
            ? "第 " + model.byId[activeId].line + " 行"
            : ""}
        </span>
      </div>

      {/* ── 树 ── */}
      <div style={S.body} tabIndex={0} onKeyDown={onKeyDown} title="↑↓ 选择 · Enter 跳转 · Esc 清空过滤">
        {err ? <div style={S.err}>{err}</div> : null}

        {!err && !info ? (
          <div style={S.empty}>{busy ? "正在解析…" : "打开一个 .tex 文件，或把 .tex 拖进工作区后点 ↻。"}</div>
        ) : null}

        {!err && info && sm.sections === 0 && !query ? (
          <div style={S.empty}>未发现 \section / \chapter 等章节命令。</div>
        ) : null}

        {hasBody && visible.length === 0 ? <div style={S.empty}>没有匹配「{q.trim()}」的条目。</div> : null}

        {err
          ? null
          : visible.map(function (n) {
              const isActive = n.id === activeId;
              const isHover = n.id === hoverId;
              const errs = (n.issues || []).filter(function (m) { return m.severity === "error"; });
              const warns = (n.issues || []).filter(function (m) { return m.severity === "warning"; });
              const tip = (n.issues[0] && n.issues[0].message) || (n.title + (n.label ? "  [" + n.label + "]" : ""));
              return (
                <div
                  key={n.id}
                  ref={function (el) { if (el) rowRefs.current[n.id] = el; }}
                  style={{ ...S.row, ...rowStyle(n, isActive, isHover) }}
                  title={tip}
                  onMouseEnter={function () { setHoverId(n.id); }}
                  onMouseLeave={function () { setHoverId(""); }}
                  onClick={function () { jump(n); }}
                >
                  <span
                    style={{ ...S.chev, visibility: n.hasKids ? "visible" : "hidden" }}
                    onClick={function (e) { e.stopPropagation(); toggleFold(n.id); }}
                    title={folded[n.id] ? "展开" : "收起"}
                  >
                    {folded[n.id] && !n.forceOpen ? "▸" : "▾"}
                  </span>
                  <span style={{ ...S.num, minWidth: n.kind === "section" ? 26 : 0 }}>{n.number || (n.star ? "✳" : "")}</span>
                  <span style={S.ic}>{KIND_ICON[n.kind] || "§"}</span>
                  <span style={{ ...S.txt, ...textStyle(n) }}>{n.title}</span>
                  {errs.length ? (
                    <span style={{ ...S.badge, color: "hsl(var(--destructive))", borderColor: "hsl(var(--destructive))" }} title={errs[0].message}>错</span>
                  ) : warns.length ? (
                    <span style={{ ...S.badge, color: "hsl(var(--muted-foreground))" }} title={warns[0].message}>警</span>
                  ) : null}
                  {isHover && n.kind === "section" ? (
                    <button
                      style={{ ...S.ibtn, width: 16, height: 16, lineHeight: "14px", fontSize: 10 }}
                      title="引用这一段到对话"
                      onClick={function (e) { e.stopPropagation(); quote(n, n.number); }}
                    >
                      💬
                    </button>
                  ) : null}
                  <span style={S.ln}>{n.line}</span>
                </div>
              );
            })}
      </div>

      {/* ── 页脚：统计 ── */}
      <div style={S.foot}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {info
            ? sm.sections + " 节 · 图" + sm.figures + " 表" + sm.tables + " 式" + sm.equations +
              (sm.todos ? " · 待办" + sm.todos : "") + (sm.words ? " · ≈" + sm.words + " 字" : "")
            : "—"}
        </span>

      </div>
    </div>
  );
}
