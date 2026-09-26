"use strict";
/* =====================================================================
 * v0.9 文档模型（无损 CST）—— 方案 B 的地基。零依赖，Browser / Node 双端通用。
 *
 * 为什么要有这一个文件
 *   现状有三份「当前内容」（props.content / textarea.value / contenteditable DOM）
 *   和三套历史，靠三个布尔标志互相打手势 —— 撤销因此不可预测（见 docs/v0.9-docmodel-plan.md §1）。
 *   本模块把「文档」变成一个**可被测试的纯数据对象**：一份内容、一份坐标、一份身份。
 *
 * 设计红线（一条都不能破）
 *   ① **无损**：serialize(parse(s)) === s，字节级。任何规范化（重排空白 / 丢注释 /
 *      归一化换行）都算 bug —— 用户的原稿必须一个字节都不动。
 *   ② **完全平铺**：nodes 首尾相接覆盖全部行，`nodes.map(raw).join("") === source`。
 *      连空行也是节点（blank）。这样「改一块」天然只影响那一块的字节。
 *   ③ **行号契约不变**：lineFrom/lineTo 是 `source.split("\n")` 的下标（0 基闭区间），
 *      与 server/wysiwyg.js 的块区间逐块一致 —— 大纲面板 / gotoLine / latex_outline
 *      都吃这个契约，破了它们全哑。
 *   ④ **只有那份 Op 能碰它自己的节点**：未触碰的节点 raw 逐字节保留（applyOps 组装
 *      源码靠拼接，不做任何全局重建）。
 *
 * 与 wysiwyg.js 的关系
 *   块识别（哪几行是标题 / 环境 / 段落）继续用 wysiwyg.parseDoc —— 那是打过仗的实现，
 *   重写只会引入新的不一致。本模块在它之上补三件它没有的东西：
 *     · 字符级 span（from/to）与完全平铺（空行也成节点）
 *     · 稳定 id（内容哈希派生；reproject 后在文档里跟着节点走）
 *     · 事务化的 Op 接口（applyOps 返回 {doc, tx}，tx 记着到底改了哪些节点）
 *
 * 构建接缝（P3 内联时照 wysiwyg 那条通路）：
 *   把末行那条导出语句整行换成 `return { ... };`，再包成 IIFE；
 *   并把上面那句 require 换成由外层注入 WYS：
 *     const DOC = (function (WYS) { …本文件正文… })(WYS);
 *   注意导出对象内不得出现嵌套花括号（构建正则用 [^}]* 匹配）。
 * =================================================================== */

const WYS = require("./wysiwyg.js");

/* ---------- 行 / 偏移工具 ---------- */

/* lines[i] 是第 i 行的**内容**（不含 "\n"；CRLF 的 "\r" 留在内容里，这样天然无损） */
function splitLines(src) {
  return String(src == null ? "" : src).split("\n");
}

/* 第 i 行首字符在源码里的偏移 */
function lineOffsets(lines) {
  const off = new Array(lines.length);
  let p = 0;
  for (let i = 0; i < lines.length; i++) { off[i] = p; p += lines[i].length + 1; }
  return off;
}

/* 行区间 [a..b] 的原样子串：每行带自己的行尾符，最后一行若本来就是文件末行则不带 */
function nodeRaw(lines, a, b) {
  let s = "";
  for (let k = a; k <= b; k++) {
    s += lines[k];
    if (k < lines.length - 1) s += "\n";
  }
  return s;
}

/* 这段 raw 占几行；用于 applyOps 之后重算坐标 */
function countLines(raw) {
  const r = String(raw);
  return r.split("\n").length - (r.slice(-1) === "\n" ? 1 : 0);
}

/* raw → { body, trail }：body 不含行尾换行，trail 是那个换行（"" 或 "\n"） */
function splitTrail(raw) {
  const r = String(raw == null ? "" : raw);
  if (r.slice(-1) === "\n") return { body: r.slice(0, -1), trail: "\n" };
  return { body: r, trail: "" };
}

/* 行尾注释：返回 { text, comment }，尊重 \%（与 wysiwyg 同一套判定） */
function stripComment(L) {
  const s = String(L == null ? "" : L);
  for (let j = 0; j < s.length; j++) {
    if (s[j] === "%" && s[j - 1] !== "\\") return { text: s.slice(0, j), comment: s.slice(j) };
  }
  return { text: s, comment: "" };
}

/* ---------- id ---------- */

/* FNV-1a 32 位，十六进制 —— 够用且确定性（不依赖 Math.random，测试可复现） */
function h32(s) {
  let h = 0x811c9dc5;
  const t = String(s);
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ("0000000" + h.toString(16)).slice(-8);
}
function sigOf(c) { return c.type + "\u0000" + c.raw; }

/* 首次 parse：id 由「类型 + 内容 + 第几次出现」派生 —— 确定性，重跑一致 */
function mintIds(cells) {
  const seen = new Map();
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const sig = sigOf(c);
    const k = seen.has(sig) ? seen.get(sig) + 1 : 0;
    seen.set(sig, k);
    c.id = c.type + "-" + h32(sig) + "-" + k;
  }
}

/* 运行期新建的节点（Op 产生的）也要一个不撞车的 id */
function freshId(usedIds, type, raw) {
  const base = type + "-" + h32(type + "\u0000" + raw) + "-";
  let k = 0;
  while (usedIds.has(base + k)) k++;
  const id = base + k;
  usedIds.add(id);
  return id;
}

/* ---------- 节点构造 ---------- */

function newNode(id, type, raw) {
  return {
    id: id, type: type, kind: type,          /* kind 是 v0.9 的叫法，与 type 同值 */
    label: "", editable: false, atomic: true,
    cmd: "", level: 0, title: "", prefix: "", suffix: "",
    lineFrom: 0, lineTo: 0, from: 0, to: 0,
    raw: raw,
  };
}

/* 把 wysiwyg 的一个块的信息搬到节点上 */
function applyBlockMeta(c, b) {
  c.type = b.type; c.kind = b.type;
  c.label = b.label || "";
  c.editable = !!b.editable;
  c.atomic = !!b.atomic;
  c.cmd = (b.type === "heading" || b.type === "command") ? (b.kind || "") : "";
  c.level = b.level || 0;
  c.title = b.title || "";
  c.prefix = b.prefix || "";
  c.suffix = b.suffix || "";
  return c;
}
function applyBlankMeta(c) {
  c.type = "blank"; c.kind = "blank";
  c.label = "空行"; c.editable = true; c.atomic = false;
  c.cmd = ""; c.level = 0; c.title = ""; c.prefix = ""; c.suffix = "";
  return c;
}

/* =====================================================================
 * tile(source) → [cell]
 * 用 wysiwyg 的块识别切结构，再把块之间的空行补成 blank 节点 ——
 * 结果**完全平铺**：cells.map(raw).join("") === source（这是 ① ② 两条红线的落点）。
 * =================================================================== */
function tile(source) {
  const src = String(source == null ? "" : source);
  const lines = splitLines(src);
  const n = lines.length;
  /* 末尾的「幽灵空行」：src 以 "\n" 结尾时，split 出来的最后一个元素恒为空串，
   * 它不是一行真实内容 —— 但只要它和前面的行并进同一个节点，那个节点的 raw 就同时
   * 具备「以换行结尾」和「末行无换行」两种形态的写法：
   *     lines=["",""]（源码 "\n"）→ 覆盖 [0..1] 的节点 raw = "\n" → 到底占几行？
   * 字符串在这里是有歧义的。所以不做聪明解读，改成**结构上禁止**：
   * 末尾幽灵行永远独占一个节点，任何块 / 空行段都只到 bodyEnd 为止。 */
  const endsNl = src.length > 0 && src.slice(-1) === "\n";
  const bodyEnd = endsNl ? n - 2 : n - 1;
  const blocks = WYS.parseDoc(src).blocks;
  const out = [];

  function fill(from, to) {
    if (to < from) return;
    const c = newNode(null, "blank", nodeRaw(lines, from, to));
    applyBlankMeta(c);
    out.push(c);
  }

  let cursor = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const s = Math.max(0, Math.min(bodyEnd, b.startLine | 0));
    const e = Math.max(s, Math.min(bodyEnd, b.endLine | 0));
    if (s > cursor) fill(cursor, s - 1);
    const c = newNode(null, b.type, nodeRaw(lines, s, e));
    applyBlockMeta(c, b);
    out.push(c);
    cursor = e + 1;
  }
  if (cursor <= bodyEnd) fill(cursor, bodyEnd);
  if (endsNl) {
    const c = newNode(null, "blank", lines[n - 1]);
    applyBlankMeta(c);
    out.push(c);
  }
  if (!out.length) fill(0, n - 1);              /* 保险：纯空文档也得有一个节点 */
  return out;
}

/* 重建坐标（行区间 + 字符 span）。返回总量，由调用方断言与源码对得上。 */
function reposition(cells) {
  let ln = 0, ch = 0;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const k = countLines(c.raw);
    c.lineFrom = ln;
    c.lineTo = ln + k - 1;
    c.from = ch;
    c.to = ch + c.raw.length;
    ln += k;
    ch += c.raw.length;
  }
  return { lines: ln, chars: ch };
}

/* ---------- 对外：parse / serialize ---------- */

function parse(source) {
  const src = String(source == null ? "" : source);
  const cells = tile(src);
  mintIds(cells);
  const tot = reposition(cells);
  const expect = splitLines(src).length;
  if (tot.lines !== expect || tot.chars !== src.length) {
    throw new Error("docmodel 内部错误：平铺不完整（行 " + tot.lines + "/" + expect +
      "，字符 " + tot.chars + "/" + src.length + "）");
  }
  return { source: src, nodes: cells, lineCount: expect, version: 0 };
}

/* 唯一出口。完全靠拼接 —— 所以「无损」不是小心翼翼做到的，是结构上不可能的破坏。 */
function serialize(doc) {
  if (!doc || !doc.nodes) return "";
  let s = "";
  for (let i = 0; i < doc.nodes.length; i++) s += doc.nodes[i].raw;
  return s;
}

/* ---------- 查询 ---------- */

function nodeById(doc, id) {
  if (!doc || !doc.nodes) return null;
  for (let i = 0; i < doc.nodes.length; i++) if (doc.nodes[i].id === id) return doc.nodes[i];
  return null;
}
function indexById(doc, id) {
  for (let i = 0; i < doc.nodes.length; i++) if (doc.nodes[i].id === id) return i;
  return -1;
}
/* 仪表栏 / 大纲高亮：第 line 行（0 基）落在哪个节点上 */
function nodeAtLine(doc, line) {
  if (!doc || !doc.nodes) return null;
  const ln = line | 0;
  for (let i = 0; i < doc.nodes.length; i++) {
    const c = doc.nodes[i];
    if (c.lineFrom <= ln && ln <= c.lineTo) return c;
  }
  return null;
}
/* 节点正文（不含行尾换行）—— 注意标题的 body 是含命令的整行 */
function bodyOf(node) { return splitTrail(node && node.raw).body; }

/* 用户**可编辑的那段文字** —— setText 的入参口径就是它。
 * 标题只有中间那段（前缀 "\section*{" 与后缀 "}\label{..}" 是命令结构，不是内容）；
 * 其余块就是整块正文。少了这个口子，调用方就得自己分辨「标题取 title、其余取 body」——
 * 那套分辨逻辑散出去，早晚有人把 bodyOf 的整行塞进 setText，把命令套两层写坏源码。 */
function textOf(node) {
  if (!node) return "";
  if (node.type === "heading") return node.title || "";
  return bodyOf(node);
}

/* ---------- 结构自检（测试与运行期都用同一份） ---------- */

function validate(doc) {
  const errs = [];
  if (!doc || !doc.nodes || !doc.nodes.length) return { ok: false, errors: ["没有节点"] };
  let ch = 0, ln = 0;
  const ids = new Set();
  for (let i = 0; i < doc.nodes.length; i++) {
    const c = doc.nodes[i];
    if (ids.has(c.id)) errs.push("id 重复：" + c.id);
    ids.add(c.id);
    if (c.from !== ch) errs.push("第 " + i + " 个节点 from=" + c.from + " 应为 " + ch);
    if (c.to !== c.from + c.raw.length) errs.push("第 " + i + " 个节点 to 与 raw 长度不符");
    const k = countLines(c.raw);
    if (c.lineFrom !== ln) errs.push("第 " + i + " 个节点 lineFrom=" + c.lineFrom + " 应为 " + ln);
    if (c.lineTo !== c.lineFrom + k - 1) errs.push("第 " + i + " 个节点 lineTo 与 raw 行数不符");
    ch = c.to; ln = c.lineTo + 1;
  }
  if (ch !== doc.source.length) errs.push("字符总长 " + ch + " ≠ 源码 " + doc.source.length);
  if (ln !== splitLines(doc.source).length) errs.push("行总数 " + ln + " ≠ 源码 " + splitLines(doc.source).length);
  if (serialize(doc) !== doc.source) errs.push("拼接结果 ≠ 源码");
  return { ok: errs.length === 0, errors: errs };
}

/* =====================================================================
 * 按 raw 重新切块（Op 里「整块重写」用）：也可能切出多个节点，全部返回。
 * 关键：这里同样要补空行 —— 否则一次 replaceRaw 就会把块间空行吃掉。
 * =================================================================== */
function cellsFromRaw(raw, usedIds) {
  const text = String(raw == null ? "" : raw);
  const cells = tile(text);
  /* 片段 ≠ 整篇。整篇 parse 时，末尾幽灵空行必须独占节点（否则行数算不准）；
   * 但这里切出来的是要**拼进已有文档**的一段片段 —— 片段末尾那个幽灵行是分裂出来的
   * 假行，留着就会凭空给文档多加一个空行（applyOps 的平铺自检会当场发现）。 */
  if (text.slice(-1) === "\n" && cells.length > 1 && cells[cells.length - 1].raw === "") {
    cells.pop();
  }
  for (let i = 0; i < cells.length; i++) {
    cells[i].id = freshId(usedIds, cells[i].type, cells[i].raw);
  }
  return cells;
}

/* 内容变了之后，把 type / label / title / prefix / suffix 等派生字段跟上来 */
function rederive(c) {
  const blocks = WYS.parseDoc(c.raw).blocks;
  if (blocks.length === 1) {
    applyBlockMeta(c, blocks[0]);
  } else if (!blocks.length) {
    applyBlankMeta(c);
  } else {
    /* 切出多块（Op 不该产生这种情况；replaceRaw / insertNode 已提前切成多个节点）。
     * 与其猜，不如留个记号让调用方发现。 */
    c.kind = c.type;
  }
  return c;
}

const HEAD_NAMES = ["part", "chapter", "section", "subsection", "subsubsection", "paragraph", "subparagraph"];
const TEXTY = { paragraph: 1, heading: 1, comment: 1, blank: 1 };

function opError(op, msg) {
  const e = new Error("Op[" + (op && op.t) + "] " + msg);
  e.op = op && op.t;
  return e;
}

/* =====================================================================
 * applyOps(doc, ops) → { doc, tx }
 *
 * 纯函数：不改传入的 doc，返回新 doc。
 * tx = { ops, before, after, changed:[id…], deleted:[id…], label }
 *   changed 只列**字节真的变了**的节点 + 新插入的节点 —— 这是「撤销这一步」的凭据，
 *   也是旧内核（只返回一个字符串）给不出的东西（见 v09-baseline B2）。
 * =================================================================== */
function applyOps(doc, ops) {
  if (!doc || !doc.nodes) throw new Error("applyOps: doc 无效");
  const list = Array.isArray(ops) ? ops : [];
  if (!list.length) {
    return { doc: doc, tx: { ops: [], before: doc.source, after: doc.source, changed: [], deleted: [], label: "" } };
  }

  const before = doc.source;
  const cells = doc.nodes.map(function (n) {
    const c = {};
    for (const k in n) if (Object.prototype.hasOwnProperty.call(n, k)) c[k] = n[k];
    return c;
  });
  const usedIds = new Set(cells.map(function (c) { return c.id; }));
  const label = String((list[0] && list[0].label) || "");

  function idxOf(op, id) {
    const i = indexById({ nodes: cells }, id);
    if (i < 0) throw opError(op, "找不到节点 " + id);
    return i;
  }

  for (let n = 0; n < list.length; n++) {
    const op = list[n] || {};
    const t = op.t;

    if (t === "setText") {
      const i = idxOf(op, op.id);
      const c = cells[i];
      if (!TEXTY[c.type]) {
        throw opError(op, "只作用于可编辑文本块（正文 / 标题 / 注释 / 空行），收到 " + c.type + "；原子块请用 replaceRaw");
      }
      const body = splitTrail(c.raw);
      if (c.type === "heading") {
        /* 只换中间那段：\section* / [短标题] / \label 全部原样带回 */
        c.raw = WYS.partsJoin(c.prefix, String(op.text == null ? "" : op.text), c.suffix) + body.trail;
      } else {
        c.raw = String(op.text == null ? "" : op.text) + body.trail;
      }
      rederive(c);
      continue;
    }

    if (t === "setHeading") {
      const i = idxOf(op, op.id);
      const c = cells[i];
      const cmd = op.cmd == null ? null : String(op.cmd);
      if (cmd != null && HEAD_NAMES.indexOf(cmd) < 0) throw opError(op, "未知章节命令 " + cmd);
      const sw = splitTrail(c.raw);

      if (c.type === "heading") {
        if (cmd == null) {
          /* 设为正文：砍掉命令、留住 \label 之类的后缀。
           * 丢掉 [短标题] —— 短标题只对章节有意义，正文没有这个概念。 */
          if (!c.suffix || c.suffix.charAt(0) !== "}") throw opError(op, "标题后缀形态异常，拒绝改（" + JSON.stringify(c.suffix) + "）");
          c.raw = c.title + c.suffix.slice(1) + sw.trail;
        } else {
          /* 只换层级：命令名换掉，其余（* / [短标题] / { ）一律原样。
           * 星号必须**跟着走** —— \section* 是「不编号」，丢了星号就等于把不编号的节
           * 悄悄变成编号节，这是改语义，不是改层级。 */
          if (!/\\[A-Za-z]+\*?/.test(c.prefix)) throw opError(op, "标题前缀里找不到命令名：" + JSON.stringify(c.prefix));
          const np = c.prefix.replace(/\\[A-Za-z]+(\*?)/, "\\" + cmd + "$1");
          c.raw = WYS.partsJoin(np, c.title, c.suffix) + sw.trail;
        }
        rederive(c);
        continue;
      }

      if (c.type !== "paragraph") {
        throw opError(op, "只作用于标题 / 正文段落，收到 " + c.type);
      }
      /* 正文 → 标题。LaTeX 里单换行=空格，所以多物理行段落并成一行是**语义无损**的；
       * 换行处的行尾注释并成一行后无处安放，剥掉（与 v0.8.13 起的行为一致）。 */
      const src = sw.body.split("\n");
      let text, tailComment = "";
      if (src.length === 1) {
        const sc = stripComment(src[0]);
        text = sc.text.trim();
        tailComment = sc.comment;                       /* 单行：行尾注释原样留着 */
      } else {
        const parts = [];
        for (let k = 0; k < src.length; k++) {
          const piece = stripComment(src[k]).text.trim();
          if (piece) parts.push(piece);
        }
        text = parts.join(" ");
      }
      if (text.charAt(0) === "\\") throw opError(op, "这一块以 \\ 开头（不是正文），拒绝改层级");
      c.raw = (cmd != null ? "\\" + cmd + "{" + text + "}" : text) + tailComment + sw.trail;
      rederive(c);
      continue;
    }

    if (t === "splitPara") {
      const i = idxOf(op, op.id);
      const c = cells[i];
      if (c.type !== "paragraph") throw opError(op, "只作用于正文段落，收到 " + c.type);
      const sw = splitTrail(c.raw);
      const at = Math.max(0, Math.min(sw.body.length, op.at | 0));
      const head = sw.body.slice(0, at).replace(/\s+$/, "");
      const rest = sw.body.slice(at).replace(/^\s+/, "");
      /* LaTeX 的段落边界是空行 —— 拆块必须补一行，否则「拆」在源码里根本不成立 */
      c.raw = head + "\n";
      const gap = newNode(freshId(usedIds, "blank", "\n"), "blank", "\n");
      applyBlankMeta(gap);
      const tail = newNode(freshId(usedIds, "paragraph", rest + sw.trail), "paragraph", rest + sw.trail);
      rederive(tail);
      cells.splice(i + 1, 0, gap, tail);
      continue;
    }

    if (t === "mergePara") {
      const ids = Array.isArray(op.ids) ? op.ids : [];
      if (ids.length < 2) throw opError(op, "至少给两个 id");
      const idxs = ids.map(function (id) { return idxOf(op, id); });
      for (let k = 1; k < idxs.length; k++) {
        if (idxs[k] <= idxs[k - 1]) throw opError(op, "ids 必须按文档顺序升序");
        for (let j = idxs[k - 1] + 1; j < idxs[k]; j++) {
          if (cells[j].type !== "blank") throw opError(op, "中间夹着 " + cells[j].type + "，不能合并");
        }
      }
      for (let k = 0; k < idxs.length; k++) {
        if (cells[idxs[k]].type !== "paragraph") throw opError(op, "只合并正文段落，收到 " + cells[idxs[k]].type);
      }
      const first = cells[idxs[0]];
      const lastTrail = splitTrail(cells[idxs[idxs.length - 1]].raw).trail;
      const parts = [];
      for (let k = 0; k < ids.length; k++) {
        const b = splitTrail(cells[idxs[k]].raw).body.replace(/^\s+/, "").replace(/\s+$/, "");
        if (b) parts.push(b);
      }
      /* 只把「段落边界」变成一个空格；每段自己内部的换行原样保留（无损优先） */
      first.raw = parts.join(" ") + lastTrail;
      rederive(first);
      cells.splice(idxs[0] + 1, idxs[idxs.length - 1] - idxs[0]);
      continue;
    }

    if (t === "replaceRaw") {
      const i = idxOf(op, op.id);
      const fresh = cellsFromRaw(op.raw, usedIds);
      cells.splice.apply(cells, [i, 1].concat(fresh));
      continue;
    }

    if (t === "insertNode") {
      const at = Math.max(0, Math.min(cells.length, op.index | 0));
      let raw = String(op.raw == null ? "" : op.raw);
      /* 不是插在末尾、又没自带换行 → 会和后一块粘成一行，补一个 */
      if (at < cells.length && raw.slice(-1) !== "\n") raw += "\n";
      const fresh = cellsFromRaw(raw, usedIds);
      cells.splice.apply(cells, [at, 0].concat(fresh));
      continue;
    }

    if (t === "deleteNodes") {
      const set = new Set(Array.isArray(op.ids) ? op.ids : [op.id]);
      for (let k = cells.length - 1; k >= 0; k--) if (set.has(cells[k].id)) cells.splice(k, 1);
      continue;
    }

    throw opError(op, "未知的 Op 类型");
  }

  const after = serialize({ nodes: cells });
  const tot = reposition(cells);
  const expect = splitLines(after).length;
  if (tot.lines !== expect || tot.chars !== after.length) {
    throw new Error("applyOps 内部错误：平铺破损（行 " + tot.lines + "/" + expect + "，字符 " + tot.chars + "/" + after.length + "）");
  }

  /* 变更集：字节真的变了的 + 新来的；删掉的单独列 */
  const oldRaws = new Map();
  for (let i = 0; i < doc.nodes.length; i++) oldRaws.set(doc.nodes[i].id, doc.nodes[i].raw);
  const changed = [];
  const seen = new Set();
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    seen.add(c.id);
    if (!oldRaws.has(c.id) || oldRaws.get(c.id) !== c.raw) changed.push(c.id);
  }
  const deleted = [];
  for (let i = 0; i < doc.nodes.length; i++) {
    if (!seen.has(doc.nodes[i].id)) deleted.push(doc.nodes[i].id);
  }

  return {
    doc: { source: after, nodes: cells, lineCount: expect, version: (doc.version | 0) + 1 },
    tx: { ops: list, before: before, after: after, changed: changed, deleted: deleted, label: label },
  };
}

/* =====================================================================
 * reproject(prevDoc, newSource) → Doc
 *
 * 外部改动（宿主 / 大纲 / 同步）进来时调用：重新切块，但**把老节点的 id 认回来**，
 * 这样历史链不会因为「别处改了一行」而整条作废（现状就会，见 editor.tsx:1629）。
 *
 * 认领策略（顺序保持，fail-safe）：
 *   ① 精确匹配 type+raw，按文档顺序认领 → 「没动过的节点」一定认回来；
 *   ② 同类型、就近认领 → 「正文被编辑过」的节点也认得回来；
 *   ③ 剩下的一律发新 id。
 * 认错了也不可怕：认不回来只是那一步历史对不上（少撤一步），
 * 而乱认才会「撤到别的分支去」。宁可少撤，不可撤错。
 * =================================================================== */
function reproject(prevDoc, newSource) {
  const src = String(newSource == null ? "" : newSource);
  const cells = tile(src);
  if (!prevDoc || !prevDoc.nodes || !prevDoc.nodes.length) {
    mintIds(cells);
    reposition(cells);
    return { source: src, nodes: cells, lineCount: splitLines(src).length, version: 0 };
  }

  const old = prevDoc.nodes;
  const taken = new Array(old.length).fill(false);
  const claimed = new Array(cells.length).fill(null);

  /* ① 精确匹配（顺序保持：只往后找，避免把重排误认成「同一块搬家」） */
  let cursor = -1;
  for (let i = 0; i < cells.length; i++) {
    const sig = sigOf(cells[i]);
    for (let j = cursor + 1; j < old.length; j++) {
      if (!taken[j] && sigOf(old[j]) === sig) {
        claimed[i] = old[j].id; taken[j] = true; cursor = j;
        break;
      }
    }
  }
  /* ② 同类型就近（顺序保持）—— 覆盖「内容被编辑过」的块 */
  cursor = -1;
  for (let i = 0; i < cells.length; i++) {
    if (claimed[i]) {
      for (let j = 0; j < old.length; j++) if (old[j].id === claimed[i]) { cursor = j; break; }
      continue;
    }
    for (let j = cursor + 1; j < old.length; j++) {
      if (!taken[j] && old[j].type === cells[i].type) {
        claimed[i] = old[j].id; taken[j] = true; cursor = j;
        break;
      }
    }
  }
  const usedIds = new Set();
  for (let i = 0; i < cells.length; i++) if (claimed[i]) usedIds.add(claimed[i]);
  for (let i = 0; i < cells.length; i++) {
    cells[i].id = claimed[i] || freshId(usedIds, cells[i].type, cells[i].raw);
  }

  reposition(cells);
  return {
    source: src,
    nodes: cells,
    lineCount: splitLines(src).length,
    version: (prevDoc.version | 0) + 1,
  };
}

module.exports = {
  parse: parse,
  serialize: serialize,
  applyOps: applyOps,
  reproject: reproject,
  nodeAtLine: nodeAtLine,
  nodeById: nodeById,
  bodyOf: bodyOf,
  textOf: textOf,
  tile: tile,
  validate: validate,
  countLines: countLines,
  splitTrail: splitTrail,
};
