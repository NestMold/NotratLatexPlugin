#!/usr/bin/env node
/**
 * Notrat LaTeX 助手 — TeX 引擎一键安装（v0.9.6）
 *
 * 为什么要有这个文件：
 *   没装引擎的人此前只拿到一句 `winget install MiKTeX.MiKTeX` —— 要管理员权限、几百 MB、
 *   装完还得等 PATH 生效、装在非标准位置还认不出。而「真正好用」的那条路（Tectonic 单文件、
 *   免管理员、免配 PATH）一直只存在于 .setup/install-tectonic.js —— 一个开发者脚本，
 *   用户永远看不到。同一件事有两份实现、用户只看得见难的那份，这就是本文件存在的理由。
 *
 * 四条硬约束：
 *   1. **异步**：下载 10~22 MB，视网络 1~5 分钟。MCP 是请求-响应，同步等 = 把工具调用堵死。
 *      所以 startInstall() 立刻返回 jobId，真活在后台跑，进度靠 jobStatus() 查。
 *   2. **失败不留垃圾**：下载/解压/试跑全在临时目录里做，**验过版本才搬进** ~/.notrat/tools/bin。
 *      半截文件落进探测目录 = 从此「检测到引擎」但编译必炸 —— 比没装更坏。
 *   3. **不毁能用的引擎**：目标位置已有引擎且没给 force，直接拒绝。
 *   4. **不靠猜**：平台/架构 → 资产名是一张**写死的表**（对着上游 10 个产物核过），
 *      表里没有的组合就明说「请手动装」，不去赌一个可能不存在的文件名。
 *
 * 落点 ~/.notrat/tools/bin 不是随便挑的：contrib.js 的 probeDirs() 第一项就是它 ——
 * 装在这里**不需要配 PATH**，装完探测链立刻认得出（这是「一键安装」成立的技术前提）。
 *
 * ⚠ 零依赖（只用 Node 内置模块）：MCP server 是纯 Node 起的，为装个引擎再装 npm 包等于加门槛。
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

/* ------------------------------------------------------------------ */
/* 0. 常量                                                             */
/* ------------------------------------------------------------------ */

const REPO = "tectonic-typesetting/tectonic";
const API_LATEST = "https://api.github.com/repos/" + REPO + "/releases/latest";
const DOWNLOAD_BASE = "https://github.com/" + REPO + "/releases/download";
const UA = "notrat-latex-plugin-engine-install";
const MAX_REDIRECTS = 6;
const MAX_JOBS = 5;            // 只留最近几个任务，别把内存当成日志库
const TIMEOUT_IDLE_MS = 120000; // 空闲超时（不是总时长）：大文件慢速下载不能被误杀

/**
 * 平台/架构 → 上游资产三元组。
 * 对着 tectonic@0.17.0 的 10 个产物逐个核过（不是照名字推的）。
 */
const ASSET_MATRIX = {
  win32: {
    x64: { triple: "x86_64-pc-windows-msvc", ext: "zip" },
    /* 上游没发 Windows/arm64 产物。x64 版在 Win11 on ARM 上靠系统模拟跑得起来 —— 
     * 比「报一句不支持」有用。 */
    arm64: {
      triple: "x86_64-pc-windows-msvc",
      ext: "zip",
      note: "上游未发 Windows/arm64 产物，改用 x64（Win11 on ARM 由系统模拟执行）",
    },
  },
  darwin: {
    x64: { triple: "x86_64-apple-darwin", ext: "tar.gz" },
    arm64: { triple: "aarch64-apple-darwin", ext: "tar.gz" },
  },
  linux: {
    /* 选 musl 静态版：不挑 glibc 版本（老发行版也能跑），体积还只有 gnu 版的一半 */
    x64: {
      triple: "x86_64-unknown-linux-musl",
      ext: "tar.gz",
      note: "选 musl 静态版：不挑 glibc 版本，体积约为 gnu 版一半",
    },
    arm64: { triple: "aarch64-unknown-linux-musl", ext: "tar.gz" },
    arm: { triple: "arm-unknown-linux-musleabihf", ext: "tar.gz" },
    ia32: { triple: "i686-unknown-linux-gnu", ext: "tar.gz" },
  },
};

/* ------------------------------------------------------------------ */
/* 1. 纯计算：平台 → 资产 → URL（全部可离线单测，不碰网络）              */
/* ------------------------------------------------------------------ */

/** 手动安装的兜底命令（和 contrib.js 的 installHint() 同一套口径） */
function manualHint(platform) {
  if (platform === "win32") return "winget install MiKTeX.MiKTeX";
  if (platform === "darwin") return "brew install --cask mactex-no-gui";
  return "sudo apt install texlive-xetex texlive-latex-recommended";
}

/** 列出上游对这个平台发过哪些架构（错误信息里用得上：别只说「不支持」） */
function archsFor(platform) {
  const byArch = ASSET_MATRIX[platform];
  return byArch ? Object.keys(byArch) : [];
}

function assetFor(platform, arch) {
  const byArch = ASSET_MATRIX[platform];
  if (!byArch) {
    throw new Error(
      "不支持的平台：" + platform + "（本工具只认 " + Object.keys(ASSET_MATRIX).join(" / ") +
        "）。请手动安装 TeX 发行版：" + manualHint(platform)
    );
  }
  const spec = byArch[arch];
  if (!spec) {
    throw new Error(
      "不支持的架构：" + platform + "/" + arch + "（该平台上游只发了 " + archsFor(platform).join(" / ") +
        "）。请手动安装 TeX 发行版：" + manualHint(platform)
    );
  }
  return { triple: spec.triple, ext: spec.ext, note: spec.note || "" };
}

/** `tectonic@0.17.0` → `0.17.0`；顺手容忍 `v0.17.0` / 纯版本号 */
function versionOfTag(tag) {
  return String(tag == null ? "" : tag).trim().replace(/^tectonic@/, "").replace(/^v/, "");
}

function tagOf(version) {
  return "tectonic@" + version;
}

/** `tectonic-0.17.0-x86_64-pc-windows-msvc.zip` */
function assetName(version, spec) {
  return "tectonic-" + version + "-" + spec.triple + "." + spec.ext;
}

function assetUrl(version, spec) {
  return DOWNLOAD_BASE + "/" + tagOf(version) + "/" + assetName(version, spec);
}

/**
 * 镜像前缀拼接（ghproxy 一类：`https://<mirror>/https://github.com/...`）。
 * 保持「前缀」而不是「替换域名」：镜像站的路径规则各家不同，前缀是唯一普遍支持的形式。
 */
function applyMirror(mirror, url) {
  const m = String(mirror == null ? "" : mirror).trim();
  if (!m) return url;
  return /\/$/.test(m) ? m + url : m + "/" + url;
}

/**
 * 读注入的设置项。宿主把 ${settings:x} 替换成真实值；**没配过就原样留着占位符** ——
 * 那种串必须当成「没设置」，否则会把 `${settings:mirror}` 当镜像前缀拼进 URL。
 */
function envClean(name) {
  const v = process.env[name];
  if (v === undefined || v === null) return "";
  const s = String(v).trim();
  if (!s || s.indexOf("$") >= 0 || s.indexOf("{") >= 0) return "";
  return s;
}

function mirrorFromEnv() {
  return envClean("LATEX_MIRROR") || envClean("LATEX_MIRROR_ALT");
}

function proxyFromEnv() {
  return envClean("LATEX_NET_PROXY") || envClean("LATEX_NET_PROXY_ALT");
}

/** NO_PROXY 的极简匹配：逗号分隔，支持 `host` / `.suffix` / `*` */
function noProxyMatch(host, list) {
  const l = String(list == null ? "" : list).trim();
  if (!l) return false;
  const h = String(host || "").toLowerCase();
  const parts = l.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p === "*") return true;
    if (p.charAt(0) === ".") {
      if (h === p.slice(1) || h.length > p.length && h.slice(-p.length) === p) return true;
    } else if (h === p) return true;
  }
  return false;
}

/**
 * 代理决策。`off`/`none`/`direct` = 强制直连；空 = 自动读 HTTPS_PROXY/HTTP_PROXY；否则按给定地址。
 * 为什么值得自带这一小段：直连不通而代理通的环境里，「一键安装」不能因为没读 env 就废掉。
 */
function resolveProxy(raw) {
  const v = String(raw == null ? "" : raw).trim();
  if (/^(off|none|direct|false|0)$/i.test(v)) return null;
  const s =
    v ||
    process.env.HTTPS_PROXY || process.env.https_proxy ||
    process.env.HTTP_PROXY || process.env.http_proxy ||
    "";
  if (!s) return null;
  let u;
  try {
    u = new URL(s);
  } catch (e) {
    return null;
  }
  if (!u.hostname) return null;
  return {
    host: u.hostname,
    port: Number(u.port || (u.protocol === "https:" ? 443 : 80)),
    auth: u.username ? decodeURIComponent(u.username) + ":" + decodeURIComponent(u.password) : "",
  };
}

/** 安装目录：与 contrib.js 的 probeDirs() 第一项**必须**一致，否则装完认不出 */
function defaultDir() {
  return path.join(os.homedir(), ".notrat", "tools", "bin");
}

function exeName(platform) {
  return platform === "win32" ? "tectonic.exe" : "tectonic";
}

function mb(bytes) {
  return (Number(bytes || 0) / 1048576).toFixed(1) + " MB";
}

/**
 * 干跑：把「会下哪个文件、从哪下、落到哪、走不走代理」摊开，**不发一个请求**。
 * 排查「装不上」时先看它 —— 大部分问题在 URL 和代理这两行上就能看出来。
 */
function describe(opts) {
  const o = opts || {};
  const platform = o.platform || process.platform;
  const arch = o.arch || process.arch;
  const spec = assetFor(platform, arch); // 不支持就抛，同步可判
  const version = String(o.version || "").trim().replace(/^tectonic@/, "").replace(/^v/, "");
  const mirror =
    o.mirror !== undefined && String(o.mirror).trim() !== "" ? String(o.mirror).trim() : mirrorFromEnv();
  const rawProxy =
    o.proxy !== undefined && String(o.proxy).trim() !== "" ? String(o.proxy).trim() : proxyFromEnv();
  const proxy = resolveProxy(rawProxy);
  const dir = o.dir || defaultDir();
  const exe = path.join(dir, exeName(platform));
  return {
    platform,
    arch,
    triple: spec.triple,
    ext: spec.ext,
    note: spec.note,
    version: version || "(最新)",
    tag: version ? tagOf(version) : "",
    asset: version ? assetName(version, spec) : "(按最新版本拼)",
    apiUrl: applyMirror(mirror, API_LATEST),
    url: version ? applyMirror(mirror, assetUrl(version, spec)) : "(需先查 API 拿版本号)",
    mirror: mirror || "(GitHub 官方)",
    proxy: proxy ? proxy.host + ":" + proxy.port : "(直连)",
    proxyRaw: rawProxy || "(自动)",
    dir,
    exe,
    existing: fs.existsSync(exe),
  };
}

/* ------------------------------------------------------------------ */
/* 2. 网络：GET（跟随重定向 + 可选代理 + 流式进度）                      */
/* ------------------------------------------------------------------ */

/**
 * 发一次 GET，返回 { statusCode, headers, stream }。
 * http 模块不替我们做、而这里必须做的两件事：
 *   - **跟随重定向**：release 资产会 302 到 objects.githubusercontent.com（好几跳）
 *   - **走代理**：https 目标用 CONNECT 打隧道；http 目标把绝对地址直接发给代理
 */
function openStream(urlStr, opts) {
  const o = opts || {};
  const hop = Number(o._hop || 0);
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(urlStr);
    } catch (e) {
      reject(new Error("不是合法 URL：" + urlStr));
      return;
    }
    if (o.ctl && o.ctl.cancelled) {
      reject(new Error("已取消"));
      return;
    }
    const isHttps = u.protocol === "https:";
    const mod = isHttps ? https : http;
    const port = u.port ? Number(u.port) : isHttps ? 443 : 80;
    const proxy = o.proxy || null;
    const useProxy = !!(proxy && !noProxyMatch(u.hostname, o.noProxy));
    const headers = Object.assign({ "User-Agent": UA, Accept: "*/*" }, o.headers || {});

    let settled = false;
    const fail = (e) => {
      if (!settled) {
        settled = true;
        reject(e);
      }
    };
    const done = (r) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };

    function handleRes(res) {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume(); // 丢掉重定向的 body，否则 socket 不释放
        if (hop >= MAX_REDIRECTS) {
          fail(new Error("重定向次数过多（>" + MAX_REDIRECTS + "）"));
          return;
        }
        const next = new URL(res.headers.location, urlStr).toString();
        openStream(next, Object.assign({}, o, { _hop: hop + 1 })).then(done, fail);
        return;
      }
      if (code !== 200) {
        res.resume();
        fail(new Error("HTTP " + code + (res.statusMessage ? " " + res.statusMessage : "") + " ← " + urlStr));
        return;
      }
      done({ statusCode: code, headers: res.headers || {}, stream: res, url: urlStr });
    }

    function attach(req) {
      if (o.ctl) {
        o.ctl.kill = function () {
          try {
            req.destroy();
          } catch (e) {}
        };
      }
      req.setTimeout(TIMEOUT_IDLE_MS, function () {
        req.destroy(new Error("网络空闲超时（" + TIMEOUT_IDLE_MS / 1000 + "s 没有数据）"));
      });
      req.on("error", fail);
      req.end();
    }

    if (useProxy && isHttps) {
      /* CONNECT 隧道：先让代理建 TCP，再在隧道里做 TLS。
       * 这里不能用 agent —— 我们要的是「这条 socket 已经是目标主机」，agent 会再解析一次 DNS。 */
      const target = u.hostname + ":" + port;
      const cHeaders = { Host: target };
      if (proxy.auth) cHeaders["Proxy-Authorization"] = "Basic " + Buffer.from(proxy.auth).toString("base64");
      const cReq = http.request({ host: proxy.host, port: proxy.port, method: "CONNECT", path: target, headers: cHeaders });
      cReq.on("connect", (res, socket) => {
        if ((res.statusCode || 0) !== 200) {
          try { socket.destroy(); } catch (e) {}
          fail(new Error("代理拒绝 CONNECT：" + res.statusCode + "（" + proxy.host + ":" + proxy.port + "）"));
          return;
        }
        /* ⚠ 必须显式给 host / hostname / port：走隧道时 Node 拿不到「目标主机」，
         *   不打这几个字段就不会生成 Host 头 —— 实测 GitHub 直接回 400 Bad Request。 */
        const req = mod.request(
          {
            socket: socket,
            agent: false,
            host: u.hostname,
            hostname: u.hostname,
            port: port,
            servername: u.hostname,
            path: u.pathname + u.search,
            method: "GET",
            headers: headers,
          },
          handleRes
        );
        attach(req);
      });
      cReq.on("error", (e) => fail(new Error("连代理失败（" + proxy.host + ":" + proxy.port + "）：" + e.message)));
      cReq.setTimeout(TIMEOUT_IDLE_MS, function () {
        cReq.destroy(new Error("代理无响应（" + TIMEOUT_IDLE_MS / 1000 + "s）"));
      });
      cReq.end();
      return;
    }

    const reqOpts = useProxy
      ? { host: proxy.host, port: proxy.port, method: "GET", path: urlStr, headers: Object.assign({ Host: u.host }, headers) }
      : { host: u.hostname, port: port, method: "GET", path: u.pathname + u.search, headers: headers };
    attach(mod.request(reqOpts, handleRes));
  });
}

/** 取一小段 JSON（GitHub API）。被网关拦掉时给的是 HTML —— 那种情况要说人话 */
function fetchJson(url, opts) {
  return openStream(url, opts).then(
    (res) =>
      new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        res.stream.on("data", (c) => {
          size += c.length;
          if (size > 8 * 1048576) {
            res.stream.destroy();
            reject(new Error("API 返回体异常大（>8MB），像是被网关劫持了"));
            return;
          }
          chunks.push(c);
        });
        res.stream.on("error", reject);
        res.stream.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          try {
            resolve(JSON.parse(text));
          } catch (e) {
            reject(
              new Error(
                "GitHub API 没返回 JSON（可能被网络中间层拦截）。原文开头：" + text.slice(0, 120).replace(/\s+/g, " ")
              )
            );
          }
        });
      })
  );
}

/** 流式下载 + 进度回调 + 边下边算 sha256（下载完就能给出校验值，不用再读一遍盘） */
function download(url, dest, opts) {
  const o = opts || {};
  return openStream(url, o).then(
    (res) =>
      new Promise((resolve, reject) => {
        const total = Number(res.headers["content-length"] || 0);
        const hash = crypto.createHash("sha256");
        const out = fs.createWriteStream(dest);
        let received = 0;
        let lastTick = 0;
        if (o.onProgress) o.onProgress(0, total);
        res.stream.on("data", (chunk) => {
          received += chunk.length;
          hash.update(chunk);
          if (o.onProgress) {
            const now = Date.now();
            /* 节流：大文件会切成上万块，每块都回一次进度等于拿回调当 CPU 烧 */
            if (now - lastTick > 200 || (total && received >= total)) {
              lastTick = now;
              o.onProgress(received, total);
            }
          }
        });
        res.stream.on("error", (e) => {
          try { out.destroy(); } catch (x) {}
          reject(e);
        });
        out.on("error", reject);
        out.on("finish", () => resolve({ bytes: received, total: total, sha256: hash.digest("hex") }));
        res.stream.pipe(out);
      })
  );
}

/* ------------------------------------------------------------------ */
/* 3. 解压 / 校验（都只动临时目录）                                      */
/* ------------------------------------------------------------------ */

/**
 * 解压。**先试 tar**：Windows 10+ 自带 bsdtar 能读 zip，macOS/Linux 的 bsdtar/GNU tar 各管一半；
 * 失败再按平台回退（Windows → PowerShell Expand-Archive；Unix → unzip）。
 * 把「试过哪些」记下来，失败信息才能自证（否则用户只看到一句「解压失败」）。
 */
function extractArchive(archivePath, ext, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const tries = [];
  const srcDir = path.dirname(archivePath);
  const base = path.basename(archivePath);

  /* ⚠ 这里有个踩过的坑：tar 的 -C/待解文件**收到 `C:\...` 这种绝对路径时，GNU tar 会把
   *   盘符当成「远程主机」**并报 `Cannot connect to C: resolve failed`（Git Bash / MSYS 的
   *   PATH 下必然踩到，而 Windows 自带的 bsdtar 反而没事）。
   *   所以第一条策略是「相对路径 + cwd」—— 对 GNU tar 与 bsdtar 都成立；
   *   失败再退回绝对路径（bsdtar / unzip / PowerShell 都吃绝对路径）。 */
  const relDir = (function () {
    try {
      const r = path.relative(srcDir, destDir);
      return r && !path.isAbsolute(r) ? r : ".";
    } catch (e) {
      return ".";
    }
  })();

  const run = (cmd, args, cwd) => {
    tries.push(cmd + " " + args[0] + (cwd ? "（相对路径）" : ""));
    const r = spawnSync(cmd, args, { encoding: "utf8", windowsHide: true, timeout: 180000, cwd: cwd });
    return r && r.status === 0;
  };

  if (ext === "zip") {
    if (run("tar", ["-xf", base, "-C", relDir], srcDir)) return { ok: true, tries };
    if (run("tar", ["-xf", archivePath, "-C", destDir])) return { ok: true, tries };
    if (process.platform === "win32") {
      if (
        run("powershell", [
          "-NoProfile",
          "-Command",
          "Expand-Archive -Force -LiteralPath '" + archivePath + "' -DestinationPath '" + destDir + "'",
        ])
      )
        return { ok: true, tries };
    } else if (run("unzip", ["-o", "-q", archivePath, "-d", destDir])) {
      return { ok: true, tries };
    }
  } else {
    if (run("tar", ["-xzf", base, "-C", relDir], srcDir)) return { ok: true, tries };
    if (run("tar", ["-xzf", archivePath, "-C", destDir])) return { ok: true, tries };
  }
  return { ok: false, tries };
}

/** 在解出来的树里找可执行文件（压缩包内部布局可能变，按名字递归找最稳） */
function findBinary(dir, name, depth) {
  const left = depth === undefined ? 4 : depth;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return null;
  }
  for (const e of entries) {
    if (e.isFile() && e.name.toLowerCase() === name.toLowerCase()) return path.join(dir, e.name);
  }
  if (left <= 0) return null;
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const hit = findBinary(path.join(dir, e.name), name, left - 1);
    if (hit) return hit;
  }
  return null;
}

/** 真跑一次 `--version` —— 「文件在」不等于「跑得起来」（缺 DLL / 架构不对都在这一步现形） */
function verifyBinary(exe) {
  /* 边界要稳：没路径 / 非字符串 / 根本起不来 —— 一律**返回结果**，绝不抛。
   * 调用链靠这个返回值决定「要不要把它搬进探测目录」，抛出去只会变成一句无头无尾的报错。 */
  if (!exe || typeof exe !== "string") return { ok: false, version: "", msg: "没有可试跑的路径" };
  let r = null;
  try {
    r = spawnSync(exe, ["--version"], { encoding: "utf8", windowsHide: true, timeout: 60000 });
  } catch (e) {
    return { ok: false, version: "", msg: "起不来：" + ((e && e.message) || String(e)) };
  }
  const out = String((r && r.stdout ? r.stdout : "") + (r && r.stderr ? r.stderr : "")).trim();
  if (!r || r.status !== 0) {
    const hint = r && r.error && r.error.message ? "（" + r.error.message + "）" : "";
    return {
      ok: false,
      version: "",
      msg: "跑不起来（退出码 " + (r && r.status != null ? r.status : "?") + "）" + hint + "：" + out.slice(0, 200),
    };
  }
  const m = /Tectonic\s+([0-9][0-9A-Za-z.\-+]*)/i.exec(out);
  if (!m) return { ok: false, version: "", msg: "能跑但读不出版本号：" + out.slice(0, 200) };
  return { ok: true, version: m[1], msg: out.split(/\r?\n/)[0] };
}

/* ------------------------------------------------------------------ */
/* 4. 任务表（进程内；服务重启即失效 —— 这一点要在文案里说清）            */
/* ------------------------------------------------------------------ */

const jobs = new Map();
let latestJobId = null;

function nowIso() {
  return new Date().toISOString();
}

function pushLog(j, line) {
  j.log.push(nowIso().slice(11, 19) + " " + line);
  if (j.log.length > 200) j.log.splice(0, j.log.length - 200);
}

function pruneJobs() {
  while (jobs.size > MAX_JOBS) {
    /* 删最老的；正在跑的跳过（别把在跑的任务从表里抹掉，那样进度就查不到了） */
    let victim = null;
    for (const [id, j] of jobs) {
      if (j.state === "done" || j.state === "error" || j.state === "cancelled") {
        victim = id;
        break;
      }
    }
    if (!victim) break;
    jobs.delete(victim);
    if (latestJobId === victim) latestJobId = null;
  }
}

function snapshot(j) {
  const elapsed = j.startedAt ? (new Date(j.endedAt || Date.now()) - new Date(j.startedAt)) / 1000 : 0;
  return {
    ok: j.state === "done",
    id: j.id,
    state: j.state,
    phase: j.phase,
    msg: j.msg,
    received: j.received,
    total: j.total,
    percent: j.total ? Math.min(100, Math.round((j.received / j.total) * 100)) : j.state === "done" ? 100 : 0,
    version: j.version,
    asset: j.asset,
    mirror: j.mirror || "(GitHub 官方)",
    proxy: j.proxyUsed || "(直连)",
    platform: j.platform,
    arch: j.arch,
    dir: j.dir,
    exe: j.result ? j.result.exe : path.join(j.dir, exeName(j.platform)),
    startedAt: j.startedAt,
    endedAt: j.endedAt,
    elapsed: Math.round(elapsed * 10) / 10,
    result: j.result,
    error: j.error || null,
    log: j.log.slice(-12),
  };
}

/** 传 id 查那一个；不传则给最近一个（面板重新挂载后据此续上进度条） */
function jobStatus(id) {
  const key = String(id == null ? "" : id).trim() || latestJobId;
  if (!key) return null;
  const j = jobs.get(key);
  return j ? snapshot(j) : null;
}

function cancelJob(id) {
  const key = String(id == null ? "" : id).trim() || latestJobId;
  const j = key ? jobs.get(key) : null;
  if (!j) {
    return {
      ok: false,
      state: "none",
      msg: "没有这个任务：" + (id || "(空)") + "。任务记录只活在当前 server 进程里，服务重启后就查不到了。",
    };
  }
  if (j.state === "done" || j.state === "error" || j.state === "cancelled") return snapshot(j);
  j.cancelled = true;
  if (j.ctl && j.ctl.kill) {
    try { j.ctl.kill(); } catch (e) {}
  }
  j.state = "cancelled";
  j.phase = "已取消";
  j.msg = "安装已取消";
  j.endedAt = nowIso();
  pushLog(j, "已取消");
  return snapshot(j);
}

function failJob(j, e) {
  const msg = (e && e.message) || String(e);
  if (j.state === "cancelled" || (j.ctl && j.ctl.cancelled)) {
    j.state = "cancelled";
    j.phase = "已取消";
    j.msg = "安装已取消";
    j.endedAt = j.endedAt || nowIso();
    return;
  }
  j.state = "error";
  j.phase = "失败";
  j.error = msg;
  j.msg = msg;
  j.endedAt = nowIso();
  pushLog(j, "✗ " + msg);
}

/* ------------------------------------------------------------------ */
/* 5. 安装主流程                                                        */
/* ------------------------------------------------------------------ */

async function runJob(j, o, hooks) {
  const ctl = j.ctl;
  const reqOpts = { proxy: resolveProxy(j.proxyRaw), ctl: ctl, noProxy: process.env.NO_PROXY || process.env.no_proxy || "" };
  j.proxyUsed = reqOpts.proxy ? reqOpts.proxy.host + ":" + reqOpts.proxy.port : "(直连)";
  const step = (state, phase, msg) => {
    j.state = state;
    j.phase = phase;
    if (msg) j.msg = msg;
    pushLog(j, "[" + phase + "] " + (msg || ""));
  };

  try {
    let version = String(o.version || "").trim().replace(/^tectonic@/, "").replace(/^v/, "");
    let declaredSize = 0;

    /* ---- 1) 定版本 ---- */
    if (version) {
      step("resolving", "查询版本", "用指定版本 " + version + "（跳过 GitHub API）");
    } else {
      const api = applyMirror(j.mirror, API_LATEST);
      step("resolving", "查询版本", "向 GitHub 查最新版本…");
      pushLog(j, "GET " + api);
      const rel = await fetchJson(api, reqOpts);
      version = versionOfTag(rel && rel.tag_name);
      if (!version) {
        throw new Error(
          "GitHub API 没给出版本号。可改用 version 参数直接指定（如 0.17.0）绕开 API —— 网络受限时这条路更稳。"
        );
      }
      const want = assetName(version, j.spec);
      const hit = ((rel && rel.assets) || []).find((a) => a && a.name === want);
      if (hit) declaredSize = Number(hit.size || 0);
      else pushLog(j, "注意：上游资产清单里没有 " + want + "，仍按命名规则尝试");
    }
    j.version = version;

    /* ---- 2) 下载到临时目录 ---- */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "notrat-tectonic-"));
    j.tmp = tmp;
    const name = assetName(version, j.spec);
    const url = applyMirror(j.mirror, assetUrl(version, j.spec));
    j.asset = name;
    const archive = path.join(tmp, name);
    step("downloading", "下载中", name + (declaredSize ? "（" + mb(declaredSize) + "）" : ""));
    pushLog(j, "GET " + url);
    const got = await download(
      url,
      archive,
      Object.assign({}, reqOpts, {
        onProgress: (recv, tot) => {
          j.received = recv;
          j.total = tot || declaredSize || 0;
        },
      })
    );
    if (ctl && ctl.cancelled) throw new Error("已取消");
    /* 两个完整性判据都要：content-length 防截断；API 标称大小防「静默换了文件」 */
    if (got.total && got.bytes !== got.total) {
      throw new Error("下载不完整：" + got.bytes + " / " + got.total + " 字节（网络中断？）");
    }
    if (declaredSize && got.bytes !== declaredSize) {
      throw new Error("大小对不上：拿到 " + got.bytes + " 字节，上游标称 " + declaredSize + " 字节");
    }
    j.received = got.bytes;
    j.total = got.total || declaredSize || got.bytes;
    pushLog(j, "已下载 " + got.bytes + " 字节  sha256=" + got.sha256);

    /* ---- 3) 解压 ---- */
    step("extracting", "解压中", "解开 " + name);
    const ex = extractArchive(archive, j.spec.ext, path.join(tmp, "x"));
    if (!ex.ok) {
      throw new Error("解压失败（试过 " + ex.tries.join("、") + "）—— 本机是不是缺 tar/unzip？");
    }
    const wanted = exeName(j.platform);
    const found = findBinary(path.join(tmp, "x"), wanted);
    if (!found) throw new Error("解压后没找到 " + wanted + "（压缩包内部布局和预期不一样）");
    if (j.platform !== "win32") {
      try { fs.chmodSync(found, 0o755); } catch (e) {}
    }

    /* ---- 4) 先在临时目录里验版：跑不起来的东西绝不搬进探测目录 ---- */
    step("verifying", "验证中", "试跑 " + wanted + " --version");
    const v1 = verifyBinary(found);
    if (!v1.ok) throw new Error(wanted + " 跑不起来：" + v1.msg);
    pushLog(j, "版本自证：" + v1.msg);

    /* ---- 5) 落位 ---- */
    fs.mkdirSync(j.dir, { recursive: true });
    const dst = path.join(j.dir, wanted);
    fs.copyFileSync(found, dst);
    if (j.platform !== "win32") {
      try { fs.chmodSync(dst, 0o755); } catch (e) {}
    }
    /* 搬运后再验一次：复制也可能坏。坏了就清掉 —— 宁可没有，也不要一个「存在但跑不动」的文件 */
    const v2 = verifyBinary(dst);
    if (!v2.ok) {
      try { fs.unlinkSync(dst); } catch (e) {}
      throw new Error("搬过去之后自检没过（已删掉，不留半成品）：" + v2.msg);
    }

    j.result = { exe: dst, version: v2.version, bytes: got.bytes, sha256: got.sha256, source: url };
    j.state = "done";
    j.phase = "完成";
    j.msg = "引擎已装好：" + dst;
    j.endedAt = nowIso();
    pushLog(j, "完成 " + v2.version + " → " + dst);
    if (hooks && typeof hooks.onSuccess === "function") {
      try { hooks.onSuccess(j.result); } catch (e) {}
    }
  } catch (e) {
    failJob(j, e);
  } finally {
    /* 临时目录一律清掉：成功失败都清。残留的半个 zip 除了占地方没有任何用 */
    try {
      if (j.tmp) fs.rmSync(j.tmp, { recursive: true, force: true });
    } catch (e) {}
    j.tmp = null;
    j.ctl = null;
  }
}

/**
 * 起一个安装任务，**立刻**返回快照（带 id）。
 * @param {object} opts { version?, mirror?, proxy?, force?, dir?, platform?, arch? }
 * @param {object} hooks { onSuccess?(result) } —— 用于装完清引擎探测缓存
 */
function startInstall(opts, hooks) {
  const o = opts || {};
  const platform = o.platform || process.platform;
  const arch = o.arch || process.arch;
  const spec = assetFor(platform, arch); // 平台不支持 → 同步抛（调用方立刻能说清原因）
  const dir = o.dir || defaultDir();
  const exe = path.join(dir, exeName(platform));

  if (fs.existsSync(exe) && !o.force) {
    return {
      noJob: true,
      ok: false,
      state: "error",
      phase: "已有引擎",
      msg:
        "目标位置已经有引擎了：" + exe + "。" +
        "本工具不会替你毁掉一个能用的引擎 —— 确实要重装请显式传 force=true（或先把它移走）。",
      exe: exe,
      dir: dir,
      platform: platform,
      arch: arch,
      log: [],
    };
  }

  const mirror =
    o.mirror !== undefined && String(o.mirror).trim() !== "" ? String(o.mirror).trim() : mirrorFromEnv();
  const proxyRaw =
    o.proxy !== undefined && String(o.proxy).trim() !== "" ? String(o.proxy).trim() : proxyFromEnv();

  const j = {
    id: crypto.randomBytes(4).toString("hex"),
    state: "queued",
    phase: "排队",
    msg: "任务已创建，等后台开始下载",
    received: 0,
    total: 0,
    version: "",
    asset: "",
    mirror: mirror,
    proxyUsed: "",
    proxyRaw: proxyRaw,
    platform: platform,
    arch: arch,
    spec: spec,
    dir: dir,
    startedAt: nowIso(),
    endedAt: null,
    result: null,
    error: null,
    log: [],
    tmp: null,
    cancelled: false,
    ctl: { cancelled: false, kill: null },
  };
  pushLog(j, "平台 " + platform + "/" + arch + " → " + spec.triple + "." + spec.ext + (spec.note ? "（" + spec.note + "）" : ""));
  pushLog(j, "落点 " + dir + "（在插件探测链里，无需配 PATH）");
  jobs.set(j.id, j);
  latestJobId = j.id;
  pruneJobs();

  /* 后台跑，不 await —— 这正是「异步」的全部意义 */
  runJob(j, { version: o.version || "", mirror: mirror }, hooks).catch((e) => failJob(j, e));
  return snapshot(j);
}

module.exports = {
  ASSET_MATRIX: ASSET_MATRIX,
  REPO: REPO,
  API_LATEST: API_LATEST,
  startInstall: startInstall,
  jobStatus: jobStatus,
  cancelJob: cancelJob,
  describe: describe,
  /* 纯函数（离线可测，门禁直接用） */
  assetFor: assetFor,
  assetName: assetName,
  assetUrl: assetUrl,
  tagOf: tagOf,
  versionOfTag: versionOfTag,
  applyMirror: applyMirror,
  resolveProxy: resolveProxy,
  noProxyMatch: noProxyMatch,
  defaultDir: defaultDir,
  exeName: exeName,
  manualHint: manualHint,
  envClean: envClean,
  mirrorFromEnv: mirrorFromEnv,
  proxyFromEnv: proxyFromEnv,
  /* 网络原语（诊断与门禁要能单独打一枪：先分清是「网络不通」还是「逻辑不对」） */
  openStream: openStream,
  fetchJson: fetchJson,
  download: download,
  /* 解压/校验（临时环境下可单测） */
  extractArchive: extractArchive,
  findBinary: findBinary,
  verifyBinary: verifyBinary,
};
