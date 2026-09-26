
/* =====================================================================
 * 就地编辑层（v0.7.0 · 方案 A）
 *
 * 权威源仍然是 LaTeX 源码。本层只做两件事：
 *   1) 把 WYS.parseDoc 出的块渲染成「可编辑文本 + 原子节点」；
 *   2) 用户改完，用 WYS.applyEdits 只替换**被改过的那几块**的行区间。
 *
 * 红线：绝不从渲染结果反向重建整篇源码。
 *   \cite{vaswani2017} 渲染成 "[1]"、\ref{fig:model} 渲染成 "图 1" —— 都是有损的。
 *   一旦「HTML → LaTeX」，用户敲一次字就会烧掉 \cite / \ref / 宏定义。
 *   所以原子节点一律 contenteditable=false + data-tex，回写时原样吐出。
 * =================================================================== */
const WYS_CSS = `
.wys-blk{position:relative;border-radius:6px;margin:2px 0}
.wys-blk:hover{background:hsl(var(--muted)/.35)}
.wys-blk:focus-within{background:hsl(var(--primary)/.06);box-shadow:inset 0 -2px 0 hsl(var(--primary)/.55)}
.wys-edit{outline:none;display:inline;white-space:pre-wrap;overflow-wrap:break-word;min-width:1em}
.wys-h1{font-size:20px;font-weight:700;margin:26px 0 10px;padding-bottom:4px;border-bottom:1px solid hsl(var(--border))}
.wys-h2{font-size:17px;font-weight:700;margin:22px 0 8px}
.wys-h3{font-size:15px;font-weight:700;margin:18px 0 6px}
.wys-p{margin:0 0 10px}
.wys-fix{color:hsl(var(--muted-foreground)/.7);font-family:Consolas,'Courier New',monospace;font-size:.85em;white-space:pre-wrap}
.wys-atom{border-radius:4px;padding:0 2px}
.wys-math{padding:0 1px}
.wys-cite,.wys-ref{color:hsl(var(--primary));border-bottom:1px dotted hsl(var(--primary));font-size:.9em}
.wys-cmt{color:#71717a;font-family:Consolas,monospace;font-size:.9em}
.wys-wrap{white-space:pre-wrap}
.wys-card{border:1px dashed hsl(var(--border));border-radius:10px;padding:8px 12px;margin:12px 0;background:hsl(var(--muted)/.22);cursor:pointer}
.wys-card:hover{background:hsl(var(--muted)/.42);border-color:hsl(var(--primary)/.5)}
.wys-card-h{display:flex;justify-content:space-between;gap:10px;font-size:11.5px;color:hsl(var(--muted-foreground));margin-bottom:4px}
.wys-card-ln{font-family:Consolas,monospace;opacity:.8}
.wys-card-src{margin:0;white-space:pre-wrap;overflow-wrap:break-word;font-family:Consolas,'Courier New',monospace;font-size:12.5px;line-height:1.6;color:hsl(var(--foreground)/.82);max-height:260px;overflow:auto}
.wys-err{color:#ef4444;padding:10px;font-size:13px}
.wys-tag{color:hsl(var(--muted-foreground));font-size:11px;font-family:Consolas,monospace}
`;

/* 属性值转义：data-tex / data-prefix 里可能有引号与换行，必须走 escAttr 而不是 escHtml */
function escAttr(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* 行内片段 → HTML。
 *   text    → 纯文本（可编辑）
 *   math    → contenteditable=false + data-tex（KaTeX 渲染外观，TeX 原文随行携带）
 *   cmd     → \cite / \ref / \label / \footnote …（原子，显示参数内容）
 *   wrap    → \textbf{...} 外层原子（data-open 记下开符号，回写补 "}"），内层可编辑
 *   comment → 行内 % 注释（原子、置灰）
 * 互逆约束：wysDomToTex(wysInline(x)) === x */
function wysInline(text, renderMath) {
  let segs;
  try { segs = WYS.parseInline(text); } catch (e) { return WYS.escHtml(text); }
  let out = "";
  for (let i = 0; i < segs.length; i++) {
    const g = segs[i];
    if (!g) continue;
    if (g.t === "text") { out += WYS.escHtml(g.v); continue; }
    if (g.t === "comment") {
      out += '<span class="wys-atom wys-cmt" contenteditable="false" data-tex="' + escAttr(g.v) + '">' + WYS.escHtml(g.v) + "</span>";
      continue;
    }
    if (g.t === "math") {
      const bare = String(g.tex || "").replace(/^\$+|\$+$/g, "").replace(/^\\\(|\\\)$/g, "");
      let mh;
      try { mh = renderMath ? renderMath(bare, false) : WYS.escHtml(bare); }
      catch (e2) { mh = WYS.escHtml(bare); }
      out += '<span class="wys-atom wys-math" contenteditable="false" data-tex="' + escAttr(g.tex) + '" title="' + escAttr(g.tex) + '">' + mh + "</span>";
      continue;
    }
    if (g.t === "cmd") {
      const arg = /^\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?\{([^}]*)\}/.exec(String(g.tex || ""));
      const shown = arg ? arg[1] : String(g.tex || "");
      const kind = /^\\cite/i.test(String(g.tex || "")) ? "wys-cite" : "wys-ref";
      out += '<span class="wys-atom ' + kind + '" contenteditable="false" data-tex="' + escAttr(g.tex) + '" title="' + escAttr(g.tex) + '">' + WYS.escHtml(shown) + "</span>";
      continue;
    }
    if (g.t === "wrap") {
      out += '<span class="wys-wrap" data-open="' + escAttr(g.open) + '">' + wysInline(g.inner, renderMath) + "</span>";
      continue;
    }
    out += WYS.escHtml(String(g.v == null ? "" : g.v));
  }
  return out;
}

/* 反方向：DOM → LaTeX。原子带 data-tex 原样吐回；其余按 nodeValue 取回。 */
function wysDomToTex(root) {
  let out = "";
  function walk(node) {
    for (let n = node.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) { out += n.nodeValue; continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toLowerCase();
      if (tag === "br") { out += "\n"; continue; }
      const dt = n.getAttribute("data-tex");
      if (dt != null) { out += dt; continue; }
      const op = n.getAttribute("data-open");
      if (op != null) { out += op; walk(n); out += "}"; continue; }
      walk(n);
    }
  }
  walk(root);
  /* contentEditable 会塞不换行空格与零宽字符，必须归一再比对 */
  return out.replace(/\u00a0/g, " ").replace(/\u200b/g, "").replace(/\r\n?/g, "\n");
}

/* 整篇 → 就地编辑层 HTML。只渲染块模型给出的边界，绝不重新发明结构。 */
function wysRenderDoc(src, renderMath) {
  let doc;
  try { doc = WYS.parseDoc(src); }
  catch (e) { return '<div class="wys-err">块模型解析失败：' + WYS.escHtml(String((e && e.message) || e)) + "</div>"; }
  const out = [];
  const blocks = doc.blocks || [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const base = ' data-bid="' + b.id + '" data-s="' + b.startLine + '" data-e="' + b.endLine + '" data-type="' + escAttr(b.type) + '"';
    if (b.editable && (b.type === "heading" || b.type === "paragraph")) {
      if (b.type === "heading") {
        const lv = b.level <= 1 ? 1 : b.level === 2 ? 2 : 3;
        out.push(
          '<div class="wys-blk wys-h' + lv + '"' + base +
            ' data-prefix="' + escAttr(b.prefix) + '" data-suffix="' + escAttr(b.suffix) + '">' +
            '<span class="wys-fix" contenteditable="false">' + WYS.escHtml(b.prefix) + "</span>" +
            '<span class="wys-edit" contenteditable="true">' + wysInline(b.title, renderMath) + "</span>" +
            '<span class="wys-fix" contenteditable="false">' + WYS.escHtml(b.suffix) + "</span>" +
          "</div>"
        );
      } else {
        out.push(
          '<div class="wys-blk wys-p"' + base + ">" +
            '<span class="wys-edit" contenteditable="true">' + wysInline(b.raw, renderMath) + "</span>" +
          "</div>"
        );
      }
      continue;
    }
    /* 原子块：只读卡片。点一下走已有 onPreviewClick 的 data-line 通路跳源码 */
    const raw = String(b.raw == null ? "" : b.raw);
    const shown = raw.length > 800 ? raw.slice(0, 800) + "\n…（共 " + raw.split("\n").length + " 行，点开看源码）" : raw;
    out.push(
      '<div class="wys-card" data-line="' + (b.startLine + 1) + '"' + base + ">" +
        '<div class="wys-card-h"><span class="wys-tag">' + WYS.escHtml(b.label || b.type) + "</span>" +
          '<span class="wys-card-ln">L' + (b.startLine + 1) + (b.endLine > b.startLine ? "–" + (b.endLine + 1) : "") + "</span></div>" +
        '<pre class="wys-card-src">' + WYS.escHtml(shown) + "</pre>" +
      "</div>"
    );
  }
  return out.join("");
}
