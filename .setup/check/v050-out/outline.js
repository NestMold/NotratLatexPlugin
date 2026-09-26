import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
const S = {
  root: {
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontSize: 12,
    color: "hsl(var(--foreground))",
    display: "flex",
    flexDirection: "column",
    gap: 5,
    minWidth: 0
  },
  bar: { display: "flex", alignItems: "center", gap: 4, minWidth: 0 },
  file: {
    flex: 1,
    minWidth: 0,
    fontWeight: 600,
    fontSize: 11.5,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
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
    flexShrink: 0
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
    outline: "none"
  },
  sel: {
    border: "1px solid hsl(var(--border))",
    background: "hsl(var(--background))",
    color: "hsl(var(--foreground))",
    borderRadius: 5,
    fontSize: 11,
    padding: "1px 1px",
    flexShrink: 0,
    maxWidth: 74
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
    flexShrink: 0
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
    flexShrink: 0
  },
  body: { maxHeight: "46vh", overflowY: "auto", outline: "none", margin: "0 -3px" },
  row: {
    display: "flex",
    alignItems: "baseline",
    gap: 5,
    padding: "1px 6px 1px 3px",
    borderRadius: 4,
    cursor: "pointer",
    borderLeft: "2px solid transparent",
    minWidth: 0
  },
  num: {
    color: "hsl(var(--muted-foreground))",
    fontVariantNumeric: "tabular-nums",
    fontSize: 10.5,
    flexShrink: 0
  },
  txt: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  ic: { flexShrink: 0, fontSize: 10, opacity: 0.85 },
  badge: {
    fontSize: 9.5,
    padding: "0 3px",
    borderRadius: 3,
    border: "1px solid hsl(var(--border))",
    flexShrink: 0
  },
  ln: { color: "hsl(var(--muted-foreground))", fontSize: 9.5, opacity: 0.65, flexShrink: 0 },
  chev: {
    flexShrink: 0,
    width: 11,
    textAlign: "center",
    fontSize: 9,
    color: "hsl(var(--muted-foreground))",
    cursor: "pointer",
    userSelect: "none"
  },
  empty: {
    padding: "6px 2px",
    color: "hsl(var(--muted-foreground))",
    fontSize: 11,
    lineHeight: 1.7
  },
  err: {
    padding: 6,
    borderRadius: 6,
    border: "1px solid hsl(var(--destructive))",
    color: "hsl(var(--destructive))",
    fontSize: 11,
    whiteSpace: "pre-wrap"
  },
  foot: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    borderTop: "1px solid hsl(var(--border))",
    paddingTop: 4,
    color: "hsl(var(--muted-foreground))",
    fontSize: 10
  }
};
const KIND_ICON = {
  part: "\u25C6",
  chapter: "\u25A3",
  section: "\xA7",
  subsection: "\u2022",
  subsubsection: "\u25E6",
  figure: "\u{1F5BC}",
  table: "\u25A6",
  equation: "\u2211",
  todo: "\u{1F4DD}",
  label: "\u{1F3F7}"
};
const DOC_CHAPTER_CLASS = /(book|report|memoir|scrbook|scrreprt)/i;
const EQ_ENV = /^(equation|align|gather|eqnarray|multline)$/;
function hasChapters(parsed) {
  const dc = String(parsed && parsed.documentClass || "");
  if (DOC_CHAPTER_CLASS.test(dc)) return true;
  return (parsed && parsed.sections || []).some(function(s) {
    return s.cmd === "chapter";
  });
}
function sectionDepth(cmd, chapters) {
  if (cmd === "part") return 0;
  if (cmd === "chapter") return 1;
  if (cmd === "section") return chapters ? 2 : 1;
  if (cmd === "subsection") return chapters ? 3 : 2;
  if (cmd === "subsubsection") return chapters ? 4 : 3;
  return 1;
}
function envKind(name) {
  const n = String(name || "").replace(/\*$/, "");
  if (n === "figure") return "figure";
  if (n === "table") return "table";
  if (EQ_ENV.test(n)) return "equation";
  return "";
}
function sectionNumbers(sections, chapters) {
  const c = { part: 0, chapter: 0, section: 0, subsection: 0, subsubsection: 0 };
  return (sections || []).map(function(s) {
    const cmd = s.cmd;
    if (s.star) return "";
    if (cmd === "part") {
      c.part++;
      c.chapter = 0;
      c.section = 0;
      c.subsection = 0;
      c.subsubsection = 0;
      return "\u7B2C" + c.part + "\u90E8\u5206";
    }
    if (cmd === "chapter") {
      c.chapter++;
      c.section = 0;
      c.subsection = 0;
      c.subsubsection = 0;
      return "\u7B2C" + c.chapter + "\u7AE0";
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
function indexIssues(issues) {
  const map = {};
  (issues && issues.issues || []).forEach(function(it) {
    const ln = Number(it.line) || 0;
    if (!ln) return;
    if (!map[ln]) map[ln] = [];
    map[ln].push(it);
  });
  return map;
}
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
  const open = [];
  const sectionNodes = [];
  const byId = {};
  const parentOf = {};
  const counts = { figure: 0, table: 0, equation: 0 };
  sections.forEach(function(s, i) {
    const depth = sectionDepth(s.cmd, chapters);
    const node = {
      id: "s" + s.line + "-" + i,
      kind: s.cmd === "part" || s.cmd === "chapter" ? s.cmd : "section",
      cmd: s.cmd,
      depth,
      title: s.title || "(\u65E0\u6807\u9898)",
      number: nums[i],
      star: !!s.star,
      line: s.line,
      endLine: 0,
      children: [],
      issues: issueMap[s.line] || [],
      hasKids: false
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
  const extra = [];
  if (showFloats) {
    (p.environments || []).forEach(function(e, i) {
      const kind = envKind(e.name);
      if (!kind) return;
      counts[kind]++;
      const label = kind === "figure" ? "\u56FE" + counts.figure : kind === "table" ? "\u8868" + counts.table : "\u5F0F" + counts.equation;
      const fallback = kind === "figure" ? "(\u65E0\u56FE\u9898)" : kind === "table" ? "(\u65E0\u8868\u9898)" : "(\u65E0\u6807\u7B7E)";
      extra.push({
        id: "e" + e.line + "-" + i,
        kind,
        depth: 0,
        title: e.caption || e.label || fallback,
        number: label,
        label: e.label || "",
        env: e.name,
        line: e.line,
        endLine: e.endLine || 0,
        children: [],
        issues: issueMap[e.line] || [],
        hasKids: false
      });
    });
  }
  if (showTodos) {
    (p.todos || []).forEach(function(t, i) {
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
        hasKids: false
      });
    });
  }
  if (showLabels) {
    (p.labels || []).forEach(function(l, i) {
      extra.push({
        id: "l" + l.line + "-" + i,
        kind: "label",
        depth: 0,
        title: l.key,
        number: l.env || "\u6807\u7B7E",
        line: l.line,
        endLine: 0,
        children: [],
        issues: issueMap[l.line] || [],
        hasKids: false
      });
    });
  }
  extra.sort(function(a, b) {
    return a.line - b.line || (a.id < b.id ? -1 : 1);
  });
  let si = 0;
  let owner = null;
  extra.forEach(function(n) {
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
  roots.sort(function(a, b) {
    return a.line - b.line || (a.id < b.id ? -1 : 1);
  });
  for (let i = 0; i < sectionNodes.length; i++) {
    sectionNodes[i].endLine = i + 1 < sectionNodes.length ? sectionNodes[i + 1].line - 1 : 0;
  }
  const pre = [];
  (function walk(list) {
    (list || []).forEach(function(n) {
      n.hasKids = !!(n.children && n.children.length);
      if (n.hasKids) {
        n.children.sort(function(a, b) {
          return a.line - b.line || (a.id < b.id ? -1 : 1);
        });
        walk(n.children);
      }
      pre.push(n);
    });
  })(roots);
  const flat = pre.sort(function(a, b) {
    return a.line - b.line || (a.id < b.id ? -1 : 1);
  });
  return {
    roots,
    flat,
    byId,
    parentOf,
    chapters,
    counts,
    summary: {
      sections: sections.length,
      figures: counts.figure,
      tables: counts.table,
      equations: counts.equation,
      todos: (p.todos || []).length,
      words: p.wordCount ? p.wordCount.approxWords : 0
    }
  };
}
function filterTree(nodes, q) {
  if (!q) return nodes;
  const out = [];
  (nodes || []).forEach(function(n) {
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
function flattenVisible(nodes, collapsed, out) {
  const acc = out || [];
  (nodes || []).forEach(function(n) {
    acc.push(n);
    const kids = n.children || [];
    if (!kids.length) return;
    if (collapsed[n.id] && !n.forceOpen) return;
    flattenVisible(kids, collapsed, acc);
  });
  return acc;
}
function collapseDeeperThan(nodes, maxDepth) {
  const c = {};
  if (maxDepth === null || maxDepth === void 0) return c;
  (function walk(list) {
    (list || []).forEach(function(n) {
      if (n.children && n.children.length) {
        if (n.depth > maxDepth) c[n.id] = true;
        walk(n.children);
      }
    });
  })(nodes);
  return c;
}
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
const LATEX_EV = "notrat-latex-active-file";
const LATEX_PING = "notrat-latex-active-ping";
const LATEX_STORE = "notrat-latex-active";
const LATEX_CURSOR = "notrat-latex-cursor";
const LATEX_CURSOR_PING = "notrat-latex-cursor-ping";
const LATEX_REVEAL = "notrat-latex-reveal-line";
const LATEX_REVEAL_ACK = "notrat-latex-reveal-ack";
const LATEX_EXT = /\.(tex|bib|cls|sty|ltx|latex)$/i;
const UI_KEY = "notrat-latex-outline-ui";
const FOLD_KEY = "notrat-latex-outline-fold";
function isLatexPath(p) {
  return LATEX_EXT.test(String(p || ""));
}
function readActiveSnapshot() {
  try {
    const s = JSON.parse(sessionStorage.getItem(LATEX_STORE) || "null");
    if (s && isLatexPath(s.path) && Date.now() - (Number(s.at) || 0) < 8e3) return String(s.path);
  } catch (e) {
  }
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
  } catch (e) {
  }
}
function useActiveLatexFile() {
  const [state, setState] = useState(function() {
    const snap = readActiveSnapshot();
    return { ready: !!snap, path: snap };
  });
  useEffect(function() {
    let settled = false;
    function apply(p) {
      settled = true;
      setState({ ready: true, path: isLatexPath(p) ? String(p) : "" });
    }
    function onActive(e) {
      apply(e && e.detail ? e.detail.path : "");
    }
    window.addEventListener(LATEX_EV, onActive);
    try {
      window.dispatchEvent(new CustomEvent(LATEX_PING));
    } catch (e) {
    }
    const t = setTimeout(function() {
      if (!settled) apply(readActiveSnapshot());
    }, 250);
    return function() {
      window.removeEventListener(LATEX_EV, onActive);
      clearTimeout(t);
    };
  }, []);
  return state;
}
function useLatexCursor(file) {
  const [line, setLine] = useState(0);
  useEffect(
    function() {
      setLine(0);
      function onCur(e) {
        const d = e && e.detail || {};
        if (!d.path) return;
        if (file && String(d.path) !== String(file)) return;
        setLine(Number(d.line) || 0);
      }
      window.addEventListener(LATEX_CURSOR, onCur);
      try {
        window.dispatchEvent(new CustomEvent(LATEX_CURSOR_PING));
      } catch (e) {
      }
      return function() {
        window.removeEventListener(LATEX_CURSOR, onCur);
      };
    },
    [file]
  );
  return line;
}
function revealInEditor(path, line) {
  const target = String(path || "");
  const nonce = "rv" + Date.now().toString(36) + Math.floor(Math.random() * 1e5).toString(36);
  let acked = false;
  let timer = null;
  let retry = null;
  function cleanup() {
    window.removeEventListener(LATEX_REVEAL_ACK, onAck);
    if (timer) clearTimeout(timer);
    if (retry) clearTimeout(retry);
  }
  function onAck(e) {
    const d = e && e.detail || {};
    if (d.nonce !== nonce && d.nonce !== nonce + "b") return;
    acked = true;
    cleanup();
  }
  window.addEventListener(LATEX_REVEAL_ACK, onAck);
  timer = setTimeout(function() {
    window.removeEventListener(LATEX_REVEAL_ACK, onAck);
    if (acked) return;
    try {
      window.dispatchEvent(new CustomEvent("notrat-open-file", { detail: { path: target } }));
    } catch (e) {
    }
    retry = setTimeout(function() {
      try {
        window.dispatchEvent(new CustomEvent(LATEX_REVEAL, { detail: { path: target, line, nonce: nonce + "b" } }));
      } catch (e) {
      }
    }, 260);
  }, 170);
  try {
    window.dispatchEvent(new CustomEvent(LATEX_REVEAL, { detail: { path: target, line, nonce } }));
  } catch (e) {
  }
}
function IdlePanel(props) {
  return /* @__PURE__ */ jsxs("div", { style: S.root, children: [
    /* @__PURE__ */ jsxs("div", { style: S.bar, children: [
      /* @__PURE__ */ jsx("span", { style: { fontSize: 13 }, children: "\u{1F9ED}" }),
      /* @__PURE__ */ jsx("span", { style: S.file, children: "\u7AE0\u8282\u5927\u7EB2" })
    ] }),
    /* @__PURE__ */ jsx("div", { style: S.empty, children: props.ready ? /* @__PURE__ */ jsxs("span", { children: [
      "\u5F53\u524D\u6253\u5F00\u7684",
      /* @__PURE__ */ jsx("b", { children: "\u4E0D\u662F LaTeX \u6587\u4EF6" }),
      "\u3002",
      /* @__PURE__ */ jsx("br", {}),
      "\u5207\u5230 .tex / .bib / .cls / .sty \u540E\uFF0C\u8FD9\u91CC\u4F1A\u81EA\u52A8\u663E\u793A\u7AE0\u8282\u6811\u3002"
    ] }) : /* @__PURE__ */ jsx("span", { children: "\u6B63\u5728\u8BC6\u522B\u5F53\u524D\u6587\u4EF6\u2026" }) })
  ] });
}
function LatexOutline(props) {
  const act = useActiveLatexFile();
  const [file, setFile] = useState(function() {
    return readActiveSnapshot();
  });
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
    async function(tool, args) {
      if (!api || !api.mcp || !api.mcp.callTool) throw new Error("electronAPI.mcp \u4E0D\u53EF\u7528\uFF08\u5BBF\u4E3B\u672A\u6CE8\u5165\uFF09");
      const r = await api.mcp.callTool(props.serverId, tool, args);
      if (!r || r.success === false) throw new Error(r && r.error || "\u5DE5\u5177\u8C03\u7528\u5931\u8D25");
      return (r.result && r.result.content ? r.result.content : []).map(function(c) {
        return c.text;
      }).join("\n");
    },
    [api, props.serverId]
  );
  const load = useCallback(
    async function(target) {
      const path = String(target || "");
      if (!path) return;
      if (!api || !api.mcp || !api.mcp.callTool) {
        setErr("electronAPI.mcp \u4E0D\u53EF\u7528\uFF08\u5BBF\u4E3B\u672A\u6CE8\u5165\uFF09");
        return;
      }
      setBusy(true);
      setErr("");
      try {
        const parseOut = await callTool("latex_parse", { path, format: "json" });
        const parsed = JSON.parse(parseOut);
        setInfo(parsed);
        if (parsed && parsed.file && parsed.file !== path) setFile(parsed.file);
        try {
          sessionStorage.setItem("notrat-latex-panel", JSON.stringify({ file: parsed.file, info: parsed }));
        } catch (e) {
        }
        const valOut = await callTool("latex_validate", { path: parsed.file || path, format: "json" });
        const val = JSON.parse(valOut);
        setIssues(val);
        try {
          const s = JSON.parse(sessionStorage.getItem("notrat-latex-panel") || "{}");
          s.issues = val;
          sessionStorage.setItem("notrat-latex-panel", JSON.stringify(s));
        } catch (e) {
        }
      } catch (e) {
        setErr(String(e && e.message || e));
      } finally {
        setBusy(false);
      }
    },
    [api, callTool]
  );
  useEffect(
    function() {
      if (!act.ready) return;
      setFile(act.path);
      setQ("");
      setPickedId("");
      if (!act.path) {
        setInfo(null);
        setIssues(null);
        setErr("");
        return;
      }
      const store = foldStore.current;
      setFolded(store[act.path] ? Object.assign({}, store[act.path]) : {});
      load(act.path);
    },
    [act.ready, act.path, load]
  );
  useEffect(
    function() {
      writeJson(UI_KEY, { showFloats, showTodos, showLabels, level });
    },
    [showFloats, showTodos, showLabels, level]
  );
  const model = useMemo(
    function() {
      return buildModel(info, issues, { showFloats, showTodos, showLabels });
    },
    [info, issues, showFloats, showTodos, showLabels]
  );
  const cursorLine = useLatexCursor(file);
  useEffect(function() {
    setPickedId("");
  }, [cursorLine]);
  const query = q.trim().toLowerCase();
  const filtered = useMemo(function() {
    return filterTree(model.roots, query);
  }, [model, query]);
  const visible = useMemo(function() {
    return flattenVisible(filtered, folded);
  }, [filtered, folded]);
  const cursorActiveId = useMemo(function() {
    return activeNodeId(model.flat, cursorLine);
  }, [model, cursorLine]);
  const activeId = pickedId || cursorActiveId;
  useEffect(
    function() {
      if (!follow || !activeId) return;
      const parents = model.parentOf;
      const chain = {};
      let up = parents[activeId];
      while (up) {
        chain[up] = true;
        up = parents[up];
      }
      setFolded(function(c) {
        let changed = false;
        const nx = {};
        for (const k in c) {
          if (!c[k]) continue;
          if (chain[k]) {
            changed = true;
            continue;
          }
          nx[k] = true;
        }
        return changed ? nx : c;
      });
      const el = rowRefs.current[activeId];
      if (el && el.scrollIntoView) {
        try {
          el.scrollIntoView({ block: "nearest" });
        } catch (e) {
        }
      }
    },
    [activeId, follow, model]
  );
  const sum = issues && issues.summary || { errors: 0, warnings: 0, infos: 0 };
  const fname = file ? String(file).split(/[\\/]/).pop() : "(\u81EA\u52A8\u53D1\u73B0)";
  if (!act.path) return /* @__PURE__ */ jsx(IdlePanel, { ready: act.ready });
  function persistFold(nx) {
    const store = foldStore.current;
    store[file] = nx;
    writeJson(FOLD_KEY, store);
  }
  function toggleFold(id) {
    setFolded(function(c) {
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
    const text = "\\" + s.cmd + "{" + (s.title || "") + "}  \uFF08" + num + "\uFF0C" + fname + " \u7B2C " + s.line + " \u884C\uFF09";
    try {
      window.dispatchEvent(
        new CustomEvent("notrat-quote-to-chat", {
          detail: { text, source: fname, lineFrom: s.line, lineTo: s.line }
        })
      );
    } catch (e) {
    }
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
      if (list[i].id === activeId) {
        idx = i;
        break;
      }
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      const next = idx < 0 ? step > 0 ? 0 : list.length - 1 : Math.min(list.length - 1, Math.max(0, idx + step));
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
  return /* @__PURE__ */ jsxs("div", { style: S.root, children: [
    /* @__PURE__ */ jsxs("div", { style: S.bar, children: [
      /* @__PURE__ */ jsx("span", { style: S.file, title: file || "", children: fname }),
      sum.errors + sum.warnings > 0 ? /* @__PURE__ */ jsxs(
        "span",
        {
          style: { ...S.badge, color: "hsl(var(--destructive))", borderColor: "hsl(var(--destructive))" },
          title: "\u6821\u9A8C\uFF1A\u9519\u8BEF " + sum.errors + " / \u8B66\u544A " + sum.warnings + "\uFF08\u70B9\u884C\u4E0A\u7684\u5FBD\u7AE0\u770B\u8BE6\u60C5\uFF09",
          children: [
            "\u26A0 ",
            sum.errors,
            "/",
            sum.warnings
          ]
        }
      ) : issues ? /* @__PURE__ */ jsx("span", { style: { ...S.badge, color: "hsl(var(--muted-foreground))" }, title: "\u6821\u9A8C\u901A\u8FC7", children: "\u2705" }) : null,
      /* @__PURE__ */ jsx("button", { style: S.ibtn, onClick: function() {
        load(file);
      }, disabled: busy, title: "\u91CD\u65B0\u89E3\u6790", children: busy ? "\u23F3" : "\u21BB" })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: S.bar, children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          style: S.input,
          value: q,
          placeholder: "\u8FC7\u6EE4\u6807\u9898 / \u6807\u7B7E\u2026",
          spellCheck: false,
          onChange: function(e) {
            setQ(e.target.value);
          },
          onKeyDown: function(e) {
            if (e.key === "Escape") setQ("");
          }
        }
      ),
      /* @__PURE__ */ jsxs(
        "select",
        {
          style: S.sel,
          value: String(level),
          title: "\u5C55\u5F00\u5230\u7B2C\u51E0\u5C42\uFF083+ = \u5168\u90E8\u5C55\u5F00\uFF09",
          onChange: function(e) {
            const v = Number(e.target.value);
            setLevel(v);
            const nx = v >= 9 ? {} : collapseDeeperThan(model.roots, v);
            persistFold(nx);
            setFolded(nx);
          },
          children: [
            /* @__PURE__ */ jsx("option", { value: "0", children: "\u4EC5\u9876\u5C42" }),
            /* @__PURE__ */ jsx("option", { value: "1", children: "1 \u5C42" }),
            /* @__PURE__ */ jsx("option", { value: "2", children: "2 \u5C42" }),
            /* @__PURE__ */ jsx("option", { value: "3", children: "3 \u5C42" }),
            /* @__PURE__ */ jsx("option", { value: "9", children: "\u5168\u5C55\u5F00" })
          ]
        }
      ),
      /* @__PURE__ */ jsx(
        "span",
        {
          style: showFloats ? S.chipOn : S.chip,
          title: "\u5728\u56FE/\u8868/\u516C\u5F0F\u7684\u4F4D\u7F6E\u663E\u793A\u6761\u76EE\uFF08\u5E26 caption \u4E0E\u7F16\u53F7\uFF09",
          onClick: function() {
            setShowFloats(!showFloats);
          },
          children: "\u25A6 \u56FE\u8868"
        }
      ),
      /* @__PURE__ */ jsx(
        "span",
        {
          style: showTodos ? S.chipOn : S.chip,
          title: "\u663E\u793A TODO / FIXME \u6CE8\u91CA",
          onClick: function() {
            setShowTodos(!showTodos);
          },
          children: "\u{1F4DD} \u5F85\u529E"
        }
      ),
      /* @__PURE__ */ jsx(
        "span",
        {
          style: showLabels ? S.chipOn : S.chip,
          title: "\u663E\u793A \\label \u6807\u7B7E",
          onClick: function() {
            setShowLabels(!showLabels);
          },
          children: "\u{1F3F7} \u6807\u7B7E"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { style: S.bar, children: [
      /* @__PURE__ */ jsx(
        "span",
        {
          style: follow ? S.chipOn : S.chip,
          title: "\u8DDF\u968F\u7F16\u8F91\u5668\u5149\u6807\uFF1A\u81EA\u52A8\u9AD8\u4EAE\u5E76\u5C55\u5F00\u4F60\u6B63\u5728\u5199\u7684\u90A3\u4E00\u8282",
          onClick: function() {
            setFollow(!follow);
          },
          children: "\u2316 \u8DDF\u968F\u5149\u6807"
        }
      ),
      /* @__PURE__ */ jsx("span", { style: S.chip, title: "\u5168\u90E8\u5C55\u5F00", onClick: function() {
        setAllFolded(true);
      }, children: "\u5C55\u5F00" }),
      /* @__PURE__ */ jsx("span", { style: S.chip, title: "\u6536\u8D77\u6240\u6709\u5B50\u5C42\u7EA7", onClick: function() {
        setAllFolded(false);
      }, children: "\u6536\u8D77" }),
      /* @__PURE__ */ jsx("span", { style: { flex: 1 } }),
      /* @__PURE__ */ jsx("span", { style: { color: "hsl(var(--muted-foreground))", fontSize: 10 }, children: activeId && model.byId[activeId] && model.byId[activeId].kind === "section" ? "\u7B2C " + model.byId[activeId].line + " \u884C" : "" })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: S.body, ref: bodyRef, tabIndex: 0, onKeyDown, title: "\u2191\u2193 \u9009\u62E9 \xB7 Enter \u8DF3\u8F6C \xB7 Esc \u6E05\u7A7A\u8FC7\u6EE4", children: [
      err ? /* @__PURE__ */ jsx("div", { style: S.err, children: err }) : null,
      !err && !info ? /* @__PURE__ */ jsx("div", { style: S.empty, children: busy ? "\u6B63\u5728\u89E3\u6790\u2026" : "\u6253\u5F00\u4E00\u4E2A .tex \u6587\u4EF6\uFF0C\u6216\u628A .tex \u62D6\u8FDB\u5DE5\u4F5C\u533A\u540E\u70B9 \u21BB\u3002" }) : null,
      !err && info && sm.sections === 0 && !query ? /* @__PURE__ */ jsx("div", { style: S.empty, children: "\u672A\u53D1\u73B0 \\section / \\chapter \u7B49\u7AE0\u8282\u547D\u4EE4\u3002" }) : null,
      hasBody && visible.length === 0 ? /* @__PURE__ */ jsxs("div", { style: S.empty, children: [
        "\u6CA1\u6709\u5339\u914D\u300C",
        q.trim(),
        "\u300D\u7684\u6761\u76EE\u3002"
      ] }) : null,
      err ? null : visible.map(function(n) {
        const isActive = n.id === activeId;
        const isHover = n.id === hoverId;
        const errs = (n.issues || []).filter(function(m) {
          return m.severity === "error";
        });
        const warns = (n.issues || []).filter(function(m) {
          return m.severity === "warning";
        });
        const tip = n.issues[0] && n.issues[0].message || n.title + (n.label ? "  [" + n.label + "]" : "");
        return /* @__PURE__ */ jsxs(
          "div",
          {
            ref: function(el) {
              if (el) rowRefs.current[n.id] = el;
            },
            style: { ...S.row, ...rowStyle(n, isActive, isHover) },
            title: tip,
            onMouseEnter: function() {
              setHoverId(n.id);
            },
            onMouseLeave: function() {
              setHoverId("");
            },
            onClick: function() {
              jump(n);
            },
            children: [
              /* @__PURE__ */ jsx(
                "span",
                {
                  style: { ...S.chev, visibility: n.hasKids ? "visible" : "hidden" },
                  onClick: function(e) {
                    e.stopPropagation();
                    toggleFold(n.id);
                  },
                  title: folded[n.id] ? "\u5C55\u5F00" : "\u6536\u8D77",
                  children: folded[n.id] && !n.forceOpen ? "\u25B8" : "\u25BE"
                }
              ),
              /* @__PURE__ */ jsx("span", { style: { ...S.num, minWidth: n.kind === "section" ? 26 : 0 }, children: n.number || (n.star ? "\u2733" : "") }),
              /* @__PURE__ */ jsx("span", { style: S.ic, children: KIND_ICON[n.kind] || "\xA7" }),
              /* @__PURE__ */ jsx("span", { style: { ...S.txt, ...textStyle(n) }, children: n.title }),
              errs.length ? /* @__PURE__ */ jsx("span", { style: { ...S.badge, color: "hsl(var(--destructive))", borderColor: "hsl(var(--destructive))" }, title: errs[0].message, children: "\u9519" }) : warns.length ? /* @__PURE__ */ jsx("span", { style: { ...S.badge, color: "hsl(var(--muted-foreground))" }, title: warns[0].message, children: "\u8B66" }) : null,
              isHover && n.kind === "section" ? /* @__PURE__ */ jsx(
                "button",
                {
                  style: { ...S.ibtn, width: 16, height: 16, lineHeight: "14px", fontSize: 10 },
                  title: "\u5F15\u7528\u8FD9\u4E00\u6BB5\u5230\u5BF9\u8BDD",
                  onClick: function(e) {
                    e.stopPropagation();
                    quote(n, n.number);
                  },
                  children: "\u{1F4AC}"
                }
              ) : null,
              /* @__PURE__ */ jsx("span", { style: S.ln, children: n.line })
            ]
          },
          n.id
        );
      })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: S.foot, children: [
      /* @__PURE__ */ jsx("span", { style: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: info ? sm.sections + " \u8282 \xB7 \u56FE" + sm.figures + " \u8868" + sm.tables + " \u5F0F" + sm.equations + (sm.todos ? " \xB7 \u5F85\u529E" + sm.todos : "") + (sm.words ? " \xB7 \u2248" + sm.words + " \u5B57" : "") : "\u2014" }),
      /* @__PURE__ */ jsx(
        "button",
        {
          style: { ...S.ibtn, width: "auto", padding: "0 6px" },
          onClick: function() {
            try {
              window.dispatchEvent(
                new CustomEvent("notrat-open-plugin-page", {
                  detail: { key: props.pluginId + ":latex-page", title: "LaTeX \u7ED3\u6784" }
                })
              );
            } catch (e) {
            }
          },
          children: "\u2922 \u6574\u9875"
        }
      )
    ] })
  ] });
}
export {
  LatexOutline as default
};
