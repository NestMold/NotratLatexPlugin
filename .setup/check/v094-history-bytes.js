#!/usr/bin/env node
/* =========================================================================
 * v0.9.4f 回归层：.latex-history 的「版本时光机」必须**逐字节**无损
 *
 * 这一层钉的是一个看不见、但会骗人的缺陷：
 *   .tex 存成 UTF-16（Windows 记事本「另存为 → 编码：Unicode」）时，旧实现是
 *     backupTex        fs.readFileSync(file, "utf8") → writeFileSync(dest,  text, "utf8")
 *     restoreSnapshot  fs.readFileSync(snap, "utf8") → writeFileSync(file,  text, "utf8")
 *   读的时候按 utf8 解码：UTF-16 的 \x00 被折进去、坏字节变 U+FFFD；
 *   写的时候再按 utf8 编码。于是
 *     ① 快照从第一份起就不是原文件的字节；
 *     ② 「恢复」完盘上的文件跟快照的源文件也不相等。
 *   后果不是「打不开」——是**时光机在一份根本没坏的文件上伪造 diff**：
 *   用户（或审查者）把它当成真改动去回滚，回滚回去的又不是原件。
 *
 *   为什么 0.9.4 修过「编码」这层还会漏：那一次修的是**读**的一侧
 *   （tex-encoding.js 只读嗅探，大纲/统计/引用校验都走它，所以症状确实全消），
 *   而快照是唯一一条「读进来再写回去」的**写**路径 —— 它没跟着改。
 *   教训：只读嗅探治不了「往返」；凡是把字节读进来又写回去的地方，都得自己按字节走。
 *
 * 断言分五组：
 *   A 单元往返（真 require server/contrib.js）：四种落盘形态下 快照 == 原件、恢复后 == 原件
 *   B 去重判等：内容不变要跳过；改一个字节要新增；**不同字节在 utf8 下解成同一串**不许被吞
 *   C 保留数 / 清理：字节化之后仍按最近 N 份裁剪，留下的确实是最近两版
 *   D 端到端（真 stdio 调 MCP）：latex_backup → 改坏 → latex_history list → restore 逐字节对账
 *   E 护栏：源码级防回退（快照区不许再出现字符串编解码）+ **反空转**（旧写法必须有损，
 *     否则这层测试什么都测不出来）+ 清单行协议没被改坏
 *
 * 用法: node .setup/check/v094-history-bytes.js
 *       NOTRAT_LATEX_SRV=<path> node .setup/check/v094-history-bytes.js   # D 组改验发行包里解出来的那份
 * 退出码: 0 通过 / 1 失败
 * ========================================================================= */
"use strict";
const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const WS = path.join(__dirname, "..", "..");
const SRV = (process.env.NOTRAT_LATEX_SRV || "").trim() || path.join(WS, "server", "index.js");
const TMP = path.join(WS, ".setup", "tmp-v094b");
const BS = String.fromCharCode(92); /* 反斜杠：不在源码里出现字面量，省得被 shell/heredoc 吃掉 */

let pass = 0;
let fail = 0;
const ok = (c, m, extra) => {
  if (c) {
    pass++;
    console.log("  ✓ " + m);
  } else {
    fail++;
    console.log("  ✗ " + m + (extra !== undefined ? "  → " + extra : ""));
  }
};

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const s16 = (b) => sha(b).slice(0, 16);

/* ---------- 夹具：同一份源码的四种落盘形态 ---------- */
const SRC = [
  BS + "documentclass[12pt]{ctexart}",
  BS + "usepackage{amsmath}",
  BS + "title{Tempo：免选举的租约定序共识协议}",
  BS + "author{张三}",
  BS + "begin{document}",
  BS + "maketitle",
  BS + "section{引言}",
  "共识协议要解决的问题是：让一组可能失效的副本对同一个操作序列达成一致。",
  BS + "subsection{动机}",
  "排序权由按纪元轮转的仲裁节点以短租约的形式授予 —— 定序令牌（OT）。",
  BS + "end{document}",
].join("\r\n") + "\r\n";

function utf16beOf(str) {
  const le = Buffer.from(str, "utf16le");
  const o = Buffer.alloc(le.length);
  for (let i = 0; i + 1 < le.length; i += 2) {
    o[i] = le[i + 1];
    o[i + 1] = le[i];
  }
  return o;
}

function forms() {
  return {
    "utf16-le.tex": Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(SRC, "utf16le")]),
    "utf16-be.tex": Buffer.concat([Buffer.from([0xfe, 0xff]), utf16beOf(SRC)]),
    "utf8-bom.tex": Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(SRC, "utf8")]),
    "utf8.tex": Buffer.from(SRC, "utf8"),
  };
}

/** 专属目录（每个用例一个 .latex-history，互不干扰） */
function freshDir(rel) {
  const d = path.join(TMP, rel);
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/* ---------- A. 单元往返 ---------- */
function unitRoundTrip(C) {
  console.log("\nA. 单元：真 require server/contrib.js（backupTex / restoreSnapshot 逐字节对账）");
  const F = forms();
  const names = Object.keys(F);

  for (const n of names) {
    const dir = freshDir("unit/" + n.replace(/\.tex$/, ""));
    const file = path.join(dir, n);
    const orig = F[n];
    fs.writeFileSync(file, orig);
    const tag = "A·" + n;

    const bk = C.backupTex(file, 20);
    ok(bk.ok && !bk.skipped, tag + " backupTex 真的建了快照", bk.message);
    const snap = fs.readFileSync(bk.path);
    ok(
      snap.equals(orig),
      tag + " 快照文件与原件逐字节相同（sha " + s16(snap) + "）",
      "snap=" + s16(snap) + " orig=" + s16(orig)
    );
    ok(
      /\.\d{8}-\d{9}(-\d+)?\.tex$/.test(path.basename(bk.path)),
      tag + " 快照命名协议未变（<名>.<stamp>.tex）",
      path.basename(bk.path)
    );
    ok(bk.path.indexOf(C.HIST_DIR) >= 0, tag + " 快照落在同目录 " + C.HIST_DIR + "/");

    /* 把源文件改成不同字节（模拟用户后续编辑 / 另一台机器上的改动） */
    const damaged = Buffer.concat([orig, Buffer.from("\r\n% 被改坏了\r\n", "utf8")]);
    fs.writeFileSync(file, damaged);
    ok(!fs.readFileSync(file).equals(orig), tag + " 前置条件成立：源文件此刻已不是原件");

    const rs = C.restoreSnapshot(file);
    ok(rs.ok, tag + " restoreSnapshot 成功", rs.message);
    const after = fs.readFileSync(file);
    ok(
      after.equals(orig),
      tag + " 恢复后与原件逐字节相同（sha " + s16(after) + " == " + s16(orig) + "）",
      s16(after)
    );
    ok(sha(after) === sha(orig), tag + " sha256 完全一致");
    ok(!!rs.safety, tag + " 恢复前另存了安全备份（恢复动作本身可回退）", rs.safety);

    /* 清单行协议在这个目录上仍然读得出来（快照清单没被字节化改坏） */
    const lines = C.historyProtocol(file, 5).split("\n");
    ok(/^🗂 .* · 快照 2 份/.test(lines[0]), tag + " 清单头正常（原件 1 份 + 恢复前安全备份 1 份）", lines[0]);
    ok(/\[\s\] #1 \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} · [\d.]+ KB/.test(lines[1] || ""), tag + " 清单行格式不变", lines[1]);
  }
}

/* ---------- B. 去重判等 ---------- */
function unitDedup(C) {
  console.log("\nB. 去重：按**字节**判等（有损解码不许再冒充「一致」）");
  const dir = freshDir("dedup");
  const file = path.join(dir, "doc.tex");

  fs.writeFileSync(file, Buffer.from(SRC, "utf8"));
  const r1 = C.backupTex(file, 20);
  const r2 = C.backupTex(file, 20);
  ok(r1.ok && !r1.skipped, "B1 首次快照真的落盘");
  ok(r2.ok && r2.skipped === true, "B2 内容未变 → 第二次跳过（去重语义保留）", r2.message);
  ok(C.snapshots(file).length === 1, "B3 磁盘上仍只有 1 份快照", C.snapshots(file).length);

  fs.writeFileSync(file, Buffer.from(SRC.replace("张三", "张四"), "utf8"));
  const r3 = C.backupTex(file, 20);
  ok(r3.ok && !r3.skipped, "B4 改掉一个中文字 → 必须新增快照");
  ok(C.snapshots(file).length === 2, "B5 现在是 2 份快照", C.snapshots(file).length);

  /* B6/B7 最阴的一格：两份**不同字节**的文本在 utf8 下解成同一个字符串
     （\xff 与 \xfe 都是非法起始字节 → 都变 U+FFFD）。旧实现拿字符串比 → 判「一致」→
     快照被静默吃掉（用户以为拍了照，其实没有）。字节级比较必须判「不同」。 */
  const a = Buffer.from([0xff]);
  const b = Buffer.from([0xfe]);
  ok(
    !a.equals(b) && a.toString("utf8") === b.toString("utf8"),
    "B6 前置条件成立：两份不同字节在 utf8 下解成同一串（" + JSON.stringify(a.toString("utf8")) + "）"
  );
  const lossy = path.join(dir, "lossy.tex");
  fs.writeFileSync(lossy, a);
  C.backupTex(lossy, 20);
  fs.writeFileSync(lossy, b);
  const r4 = C.backupTex(lossy, 20);
  ok(r4.ok && !r4.skipped, "B7 不同字节不许被去重吞掉（旧实现在这一格丢快照）", r4.message);
  ok(C.snapshots(lossy).length === 2, "B8 lossy.tex 确实留下 2 份快照", C.snapshots(lossy).length);
}

/* ---------- C. 保留数 / 清理 ---------- */
function unitRetention(C) {
  console.log("\nC. 保留数 / 清理：字节化之后仍然生效");
  const dir = freshDir("retain");
  const file = path.join(dir, "doc.tex");
  const contents = [];

  for (let i = 0; i < 5; i++) {
    const body = Buffer.from(SRC + "% 第 " + i + " 版\r\n", "utf8");
    contents.push(body);
    fs.writeFileSync(file, body);
    C.backupTex(file, 2); /* keep=2 */
    const t = Date.now();
    while (Date.now() - t < 3) {} /* 拉开毫秒戳，让新旧顺序可断言 */
  }

  const snaps = C.snapshots(file);
  ok(snaps.length === 2, "C1 keep=2 → 磁盘上只留 2 份", snaps.length);
  const kept = new Set(snaps.map((s) => sha(fs.readFileSync(s.path))));
  ok(kept.has(sha(contents[4])) && kept.has(sha(contents[3])), "C2 留下的确实是最近两版（逐字节核对内容）");
  ok(!kept.has(sha(contents[0])) && !kept.has(sha(contents[1])), "C3 最旧的两版确实被清掉");
}

/* ---------- D. 端到端（真 stdio 调 MCP） ---------- */
function mcp(workdir) {
  const env = Object.assign({}, process.env, { NOTRAT_WORKSPACE: workdir });
  delete env.LATEX_BACKUP; /* 不许环境的开关把这次快照关掉，否则本层测了个寂寞 */
  const p = spawn(process.execPath, [SRV], { stdio: ["pipe", "pipe", "pipe"], env: env });
  let buf = "";
  const pending = new Map();
  p.stdout.on("data", (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      let m;
      try {
        m = JSON.parse(line);
      } catch (_) {
        continue;
      }
      if (m.id != null && pending.has(m.id)) {
        const cb = pending.get(m.id);
        pending.delete(m.id);
        cb(m);
      }
    }
  });
  p.stderr.on("data", () => {});
  let seq = 0;
  const send = (method, params) =>
    new Promise((res) => {
      const id = ++seq;
      pending.set(id, res);
      p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  return { p, send };
}

const textOf = (r) => (((r || {}).result || {}).content || []).map((c) => c.text || "").join("\n");
const call = (send, name, args) => send("tools/call", { name, arguments: args });

async function e2e() {
  console.log("\nD. 端到端：真 stdio 调 MCP（latex_backup → 改坏 → latex_history list → restore）");
  const dir = freshDir("e2e");
  const file = path.join(dir, "论文.tex"); /* 中文文件名一并覆盖 */
  const orig = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(SRC, "utf16le")]);
  fs.writeFileSync(file, orig);

  const { p, send } = mcp(dir);
  try {
    await send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "v094b", version: "1" },
    });
    p.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

    const bk = await call(send, "latex_backup", { path: file });
    const bkText = textOf(bk);
    ok(/已快照/.test(bkText), "D1 latex_backup 报告已快照", bkText.slice(0, 90));

    const histDir = path.join(dir, ".latex-history");
    const names1 = fs.readdirSync(histDir).filter((f) => /\.tex$/i.test(f));
    ok(names1.length === 1, "D2 " + ".latex-history 里 1 份快照", JSON.stringify(names1));
    const snapBytes = fs.readFileSync(path.join(histDir, names1[0]));
    ok(
      snapBytes.equals(orig),
      "D3 落盘快照与原件逐字节相同（UTF-16 的 BOM 与成片 \\x00 全留住了；sha " + s16(snapBytes) + "）",
      s16(snapBytes)
    );
    ok(orig.indexOf(Buffer.from([0x00, 0x5c])) > 0, "D4 夹具确实是 UTF-16（\\x00 与 `\\` 交错）");

    /* 改坏：把整份 UTF-8 正文追加进 UTF-16 文件 —— 编码混血的坏文件 */
    const damaged = Buffer.concat([orig, Buffer.from(SRC, "utf8")]);
    fs.writeFileSync(file, damaged);
    const bk2 = await call(send, "latex_backup", { path: file });
    ok(/已快照/.test(textOf(bk2)), "D5 改坏后再快照一次（备好第 2 份）");

    const list = await call(send, "latex_history", { path: file });
    const lt = textOf(list);
    ok(/快照 2 份/.test(lt), "D6 latex_history list 报出 2 份快照", lt.split("\n")[0]);
    ok(lt.indexOf("论文.tex") >= 0, "D7 清单头带文件名", lt.split("\n")[0]);
    ok(
      /\[\s\] #1 \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} · [\d.]+ KB/.test(lt),
      "D8 行协议仍是 [#序号 时间 · 大小]（面板按这个解析）",
      (lt.split("\n")[1] || "").slice(0, 60)
    );

    const stamp = names1[0].replace(/^论文\./, "").replace(/\.tex$/i, "");
    const rs = await call(send, "latex_history", { path: file, action: "restore", stamp: stamp });
    ok(/已恢复到快照/.test(textOf(rs)), "D9 指定 stamp 恢复成功", textOf(rs).slice(0, 100));

    const after = fs.readFileSync(file);
    ok(
      after.equals(orig),
      "D10 恢复后与原件逐字节相同（sha " + s16(after) + " == " + s16(orig) + "）",
      s16(after)
    );
    ok(sha(after) === sha(orig), "D11 端到端 sha256 一致（插件写盘这条路径已经无编解码）");

    const names2 = fs.readdirSync(histDir).filter((f) => /\.tex$/i.test(f));
    const hasDamaged = names2.some((n) => fs.readFileSync(path.join(histDir, n)).equals(damaged));
    ok(hasDamaged, "D12 恢复前的「坏版本」也按字节存了一份（可再回退）", JSON.stringify(names2));
  } finally {
    try {
      p.kill();
    } catch (_) {}
  }
}

/* ---------- E. 护栏 + 反空转 ---------- */
function guards(C) {
  console.log("\nE. 护栏：源码级防回退 + 反空转对照");

  const src = fs.readFileSync(path.join(WS, "server", "contrib.js"), "utf8");
  const at = src.indexOf('const HIST_DIR = ".latex-history";');
  ok(at > 0, "E1 定位到快照区（HIST_DIR 之后的全部代码）");
  const region = at > 0 ? src.slice(at) : "";
  const hits = region.match(/"utf8"|"utf16|utf16le|utf16be|\.toString\(/g) || [];
  ok(hits.length === 0, "E2 快照区不再出现任何字符串编解码（命中：" + (hits.join(" ") || "无") + "）");
  ok(
    /fs\.readFileSync\(filePath\)/.test(src) && /fs\.readFileSync\(target\.path\)/.test(src),
    "E3 读源文件 / 读快照都不带编码参数"
  );
  ok(
    /fs\.writeFileSync\(dest, cur\)/.test(src) && /fs\.writeFileSync\(filePath, content\)/.test(src),
    "E4 快照落盘 / 恢复写回都是原样字节（不许有第三个参数）"
  );
  ok(/prev\.equals\(cur\)/.test(src), "E5 去重走 Buffer#equals，不是字符串 ===");

  /* 反空转：这层测试必须能真的测出东西 —— 旧写法在同一份夹具上必须**有损**。
     没有这两条断言，将来夹具一不小心换成纯 UTF-8，整层会「永远通过」而毫无意义。 */
  const dir = freshDir("vacuity");
  const f = path.join(dir, "old-way.tex");
  const orig = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(SRC, "utf16le")]);
  fs.writeFileSync(f, orig);
  const legacyRoundTrip = Buffer.from(fs.readFileSync(f, "utf8"), "utf8");
  ok(
    !legacyRoundTrip.equals(orig),
    "E6 反空转：旧 utf8 往返在这份夹具上有损（sha " + s16(legacyRoundTrip) + " ≠ " + s16(orig) + "）—— 本层不是空转",
    s16(legacyRoundTrip)
  );
  const legacySnap = Buffer.from(orig.toString("utf8"), "utf8");
  ok(!legacySnap.equals(orig), "E7 反空转：旧写法连「快照」都存不成原件字节（sha " + s16(legacySnap) + "）");

  /* 报告侧没被牵连：临时状态机仍然只读地跑得动 */
  const lines = C.historyProtocol(f, 5).split("\n");
  ok(/快照 0 份/.test(lines[0]), "E8 无快照目录上 historyProtocol 给的是提示文案，不抛错", lines[0]);

  /* 快照走字节、嗅探走只读 —— 两条路不许互相污染 */
  const enc = fs.readFileSync(path.join(WS, "server", "tex-encoding.js"), "utf8");
  ok(!/writeFileSync|appendFileSync/.test(enc), "E9 编码嗅探模块仍然只读不写（绝不改盘上的字节）");
}

/* ---------- 主流程 ---------- */
(async () => {
  const watchdog = setTimeout(() => {
    console.error("✗ 60s 未跑完（疑似 MCP 子进程没起来 / 没回包）");
    process.exit(1);
  }, 60000);

  let C;
  try {
    C = require(path.join(WS, "server", "contrib.js"));
  } catch (e) {
    console.error("✗ require server/contrib.js 失败: " + e.message);
    process.exit(1);
  }

  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });

  console.log("v0.9.4f 快照/恢复 字节级无损 回归层");
  console.log("  C 组 = 工作区源码 server/contrib.js");
  console.log("  D 组 server = " + SRV + (process.env.NOTRAT_LATEX_SRV ? "（指定）" : "（工作区）"));
  console.log("  夹具 = .setup/tmp-v094b");

  unitRoundTrip(C);
  unitDedup(C);
  unitRetention(C);
  await e2e();
  guards(C);

  clearTimeout(watchdog);
  console.log("\n=== " + pass + " 通过 / " + fail + " 失败 ===");
  process.exitCode = fail ? 1 : 0;
})().catch((e) => {
  console.error("失败: " + ((e && e.stack) || e));
  process.exit(1);
});
