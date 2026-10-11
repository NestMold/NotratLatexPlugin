#!/usr/bin/env node
/**
 * make-market-payload.mjs — 从发布 zip 生成市场上架载荷（admin-payload.json）。
 *
 * 为什么是它：v0.9.9 的 GitHub Release 与 git 都已完成，
 * 唯一没走的是 Notrat 插件市场（https://notrat.cn 插件市场）这条通道 ——
 * 那条通道的契约是 build-release.mjs / upload.mjs 约定的三件套：
 *   <id>-<版本>.zip + admin-payload.json + upload.mjs
 * 本脚本负责中间那件：把已发行 zip 的哈希/大小/清单与 README 组装成上架载荷。
 * 上传前不联网（只读本地 zip + README + manifest），上传由同目录的 upload.mjs 负责。
 *
 * 用法：node .setup/make-market-payload.mjs
 * 产物：release/<id>-<manifest.json 里的版本>/{admin-payload.json, checksums.txt}
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // <repo>/.setup
const ROOT = resolve(here, "..");

/* ── 1. 从 zip 取事实（版本 / 文件清单 / 哈希 / 大小）── */
const VERSION = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8")).version;
const ZIP_NAME = `notrat-latex-plugin-${VERSION}.zip`;
const ZIP_PATH = join(ROOT, ZIP_NAME);
if (!existsSync(ZIP_PATH)) {
  console.error(`✖ 找不到发行 zip：${ZIP_PATH}\n  先跑 node .setup/_release-v099.js --zip-only 或 npm run build（单文件包不是这条通道用的）`);
  process.exit(1);
}
const zipBuf = readFileSync(ZIP_PATH);
const hash = createHash("sha256").update(zipBuf).digest("hex");
const size = zipBuf.length;

// zip 条目清单（python zipfile；与 _release-v099.js 同一读取方式）
const listPy = join(here, "_listzip.py");
writeFileSync(listPy, `
import sys, zipfile
zf = zipfile.ZipFile(sys.argv[1])
for n in zf.namelist():
    print(n)
`, "utf8");
const files = execFileSync("python", [listPy, ZIP_PATH], { encoding: "utf8" })
  .split(/\r?\n/).filter(Boolean);
rmSync(listPy, { force: true });
if (!files.includes("manifest.json")) { console.error("✖ zip 里没有 manifest.json"); process.exit(1); }

// 与 zip 内 manifest 对版本（防拿错包）
const mfTmp = join(here, "_mf-check.json");
const unzPy = join(here, "_unzip-one.py");
writeFileSync(unzPy, `
import sys, zipfile
zipfile.ZipFile(sys.argv[1]).extract("manifest.json", sys.argv[2])
`, "utf8");
execFileSync("python", [unzPy, ZIP_PATH, here], { encoding: "utf8" });
const zipMf = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
rmSync(unzPy, { force: true });
rmSync(join(here, "manifest.json"), { force: true });
if (zipMf.version !== VERSION) { console.error(`✖ zip 内版本 ${zipMf.version} ≠ 仓库版本 ${VERSION}`); process.exit(1); }

/* ── 1.5 mcpTools 从包里真读（手抄会漂：v0.9.12 的 latex_render_graphic 就这么漏过）──
   面板真的会调这些工具（panels/editor.tsx 的 callTool 调用点），
   少报一个 = 市场详情页对不上包，用户照详情页排查会以为工具不存在。 */
const srvDir = join(here, "_srvtmp");
rmSync(srvDir, { recursive: true, force: true });
mkdirSync(srvDir, { recursive: true });
const srvPy = join(here, "_unzip-srv.py");
writeFileSync(srvPy, `
import sys, zipfile
zipfile.ZipFile(sys.argv[1]).extract("server/index.js", sys.argv[2])
`, "utf8");
execFileSync("python", [srvPy, ZIP_PATH, srvDir], { encoding: "utf8" });
const srvSrc = readFileSync(join(srvDir, "server", "index.js"), "utf8");
rmSync(srvPy, { force: true });
rmSync(srvDir, { recursive: true, force: true });
const MCP_TOOLS = [...srvSrc.matchAll(/name:\s*"(latex_[a-z_]+)"/g)].map((m) => m[1]);
if (MCP_TOOLS.length < 12) {
  console.error(`✖ 从包内 server/index.js 只提出 ${MCP_TOOLS.length} 个工具 —— 提取正则可能已失效，别让清单静默变短`);
  process.exit(1);
}
console.log(`  包内工具 ${MCP_TOOLS.length} 个：${MCP_TOOLS.join(", ")}`);

/* ── 2. README → 市场详情页正文（图片改绝对地址，让市场能渲染）── */
const RAW = "https://raw.githubusercontent.com/NestMold/NotratLatexPlugin/main/";
let readme = readFileSync(join(ROOT, "README.md"), "utf8")
  .replace(/\]\((assets\/[^)]+)\)/g, `](${RAW}$1)`);

/* ── 3. 组装上架载荷（字段契约对齐 notrat-sync / plugin-upload 技能）── */
const payload = {
  kind: "plugin",
  item_id: "notrat-latex-plugin",
  name: "LaTeX 助手",
  version: VERSION,
  description: "科研写作向的 LaTeX 插件：`.tex` 由插件编辑器接管（可视化 / 源码 / 分屏三档视图），KaTeX 公式离线预览、章节大纲点击跳转、一键编译 PDF 与引用校验，导出 PDF / 自包含 HTML 并在 Notrat 内直接预览。纯本地运行，零网络依赖。",
  category: "docs",
  icon: "📐",
  tier: "free",
  min_app_version: "1.3.3",
  tags: ["LaTeX", "论文", "写作", "编辑", "公式", "PDF", "科研"],
  author: { name: "巢墨科技", url: "https://notrat.cn", official: true },
  readme,
  notes: `与 GitHub Release v${VERSION} 同源同包（同一个 zip、同一个 sha256）。` +
    `本版含 v0.9.10→v0.9.13 四版累积修复：标题里的字体声明不再漏进正文、` +
    `TikZ 绘图环境不再被当正文排、绘图可以就地查看、浮层里的配图有人补；` +
    `另附换机器体检脚本 .setup/doctor.js。`,
  manifest_summary: {
    id: "notrat-latex-plugin",
    name: "LaTeX 助手",
    version: VERSION,
    contributions: {
      editors: [{ id: "latex-editor", title: "LaTeX 编辑器", extensions: [".tex"] }],
      ui: [{ id: "latex-outline", title: "章节大纲", location: "outline" }]
    },
    mcpTools: MCP_TOOLS,
  },
  package_url: "",            // ← upload.mjs 上传后回填
  package_hash: hash,
  package_size: size,
  package_files: files
};

/* ── 4. 写到 release/<id>-<版本>/（幂等：重跑覆盖）── */
const OUT = join(ROOT, "release", `notrat-latex-plugin-${VERSION}`);
mkdirSync(OUT, { recursive: true });
copyFileSync(ZIP_PATH, join(OUT, ZIP_NAME));
writeFileSync(join(OUT, "admin-payload.json"), JSON.stringify(payload, null, 2), "utf8");
writeFileSync(join(OUT, "checksums.txt"),
  `${hash}  ${ZIP_NAME}\nsha256 ${hash}\nsize   ${size} bytes\nfiles  ${files.length}\nbuilt  ${new Date().toISOString()}\n`,
  "utf8");

console.log(`✓ 上架包就绪：release/notrat-latex-plugin-${VERSION}/`);
console.log(`  ${ZIP_NAME}  ${size} bytes  sha256 ${hash.slice(0, 16)}…`);
console.log(`  条目 ${files.length} 个 | item_id=notrat-latex-plugin v${VERSION}`);
console.log(`\n上传（等拿到 admin JWT 后跑）：`);
console.log(`  cd release/notrat-latex-plugin-${VERSION}`);
console.log(`  MARKETPLACE_ADMIN_TOKEN="<jwt>" node upload.mjs        # 先 --dry-run 看会发什么`);
