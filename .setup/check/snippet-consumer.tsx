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
