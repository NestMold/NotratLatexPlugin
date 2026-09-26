#!/usr/bin/env node
/* 一键安装 Tectonic：GitHub latest → ~/.notrat/tools/bin/tectonic.exe */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

const UA = { headers: { "User-Agent": "notrat-latex-plugin-setup" } };

(async () => {
  const dir = path.join(os.homedir(), ".notrat", "tools", "bin");
  fs.mkdirSync(dir, { recursive: true });

  console.log("[1/4] 查询 GitHub 最新 release ...");
  const api = await fetch("https://api.github.com/repos/tectonic-typesetting/tectonic/releases/latest", {
    ...UA,
    signal: AbortSignal.timeout(30000),
  });
  if (!api.ok) throw new Error("GitHub API " + api.status);
  const rel = await api.json();
  const asset = (rel.assets || []).find((a) => /x86_64-pc-windows-msvc\.zip$/.test(a.name));
  if (!asset) throw new Error("未找到 windows-msvc zip 资产 (" + rel.tag_name + ")");
  console.log("      " + rel.tag_name + " · " + asset.name + " · " + (asset.size / 1048576).toFixed(1) + " MB");

  const zp = path.join(os.tmpdir(), asset.name);
  if (fs.existsSync(zp) && fs.statSync(zp).size === asset.size) {
    console.log("[2/4] 命中缓存 zip，跳过下载");
  } else {
    console.log("[2/4] 下载中（约 30MB，视网络 1~5 分钟）...");
    const res = await fetch((process.env.TECTONIC_MIRROR || "") + asset.browser_download_url, { ...UA, signal: AbortSignal.timeout(300000) });
    if (!res.ok) throw new Error("下载失败 HTTP " + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(zp, buf);
    console.log("      已保存 " + (buf.length / 1048576).toFixed(1) + " MB");
  }

  console.log("[3/4] 解压到 " + dir);
  const exe = path.join(dir, "tectonic.exe");
  try {
    execSync('tar -xf "' + zp + '" -C "' + dir + '"', { stdio: "inherit" });
  } catch (e) {
    execSync('powershell -NoProfile -Command "Expand-Archive -Force \'' + zp + "' '" + dir + "'\"", { stdio: "inherit" });
  }
  if (!fs.existsSync(exe)) throw new Error("解压后未见 tectonic.exe：目前有 " + fs.readdirSync(dir).join(", "));

  console.log("[4/4] 验证 ...");
  const v = execSync('"' + exe + '" --version', { encoding: "utf8" }).trim();
  console.log("      " + v);
  console.log("TECTONIC_INSTALL_OK " + v);
})().catch((e) => {
  console.error("TECTONIC_INSTALL_FAIL: " + e.message);
  process.exit(1);
});
