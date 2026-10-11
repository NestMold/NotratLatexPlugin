/* v0.7.0 —— 面板离线编译校验
 * 把 editor.tsx 按 build-singlefile 的同一套内联规则（LPC + WYS）拼好，
 * 再用 esbuild 编译，把带行列号的错误直接打出来。
 *
 * ⚠ 本机 ESBUILD_BINARY_PATH 指向 Notrat 自带的 esbuild 0.25.12，
 *   所以这里用工作区里同版本的 esbuild JS（0.25.12）—— 版本不一致时 host/binary 会打架。
 * ⚠ WYS 内核必须走 IIFE 内联：它的 escHtml / readGroup / findEnvEnd 与 preview-core 同名。
 * 运行： node .setup/check-v070.js
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

const ws = "E:/notrat-latex-plugin";

/* 三块内核 + 占位符替换：唯一实现见 .setup/lib/panel-inline.js（v0.9.14 收拢）
 * 这里原来自带一份改写规则（第三份）。抄三份的账记在 lib 文件头：发行 zip 那份少写了
 * renderInlineHtml，两种包形态的内核就不一样了。门禁必须测**真产物**，
 * 所以它和打包脚本共用同一份规则，不再各自维护。 */
const pack = require(path.join(ws, ".setup", "lib", "panel-inline.js"));
const KERNELS = pack.buildKernels(ws);

let src = fs.readFileSync(path.join(ws, "panels", "editor.tsx"), "utf8");
const checks = [];
for (const n of pack.NAMES) {
  const c = src.split(pack.TOKENS[n]).length - 1;
  if (c !== 1) checks.push(n + " 占位符应为 1 个，实际 " + c);
}
if (checks.length) { console.error("✗ " + checks.join("; ")); process.exit(1); }

src = pack.inlinePanel(src, KERNELS, { label: "panels/editor.tsx", required: pack.NAMES }).text;
if (src.includes("module.exports")) { console.error("✗ 内联后仍含 module.exports（0.3.0 事故）"); process.exit(1); }

/* ---- esbuild 编译（绝对路径，避开 npx 缓存的版本打架） ---- */
let esbuild;
const esbuildPath = path.join(ws, "node_modules", "esbuild");
try { esbuild = require(esbuildPath); }
catch (e) {
  console.error("✗ 找不到工作区本地 esbuild（0.25.12）。先跑： npm install --no-save esbuild@0.25.12");
  console.error("  " + e.message.split("\n")[0]);
  process.exit(1);
}

/* v0.9.5：同上 —— esbuild 的 outfile 也是共用路径，并发时会读到没写完的模块 */
const out = path.join(os.tmpdir(), "editor-v070-check-" + process.pid + ".js");
process.on("exit", function () { try { fs.rmSync(out, { force: true }); } catch (e) {} });
const r = esbuild.buildSync({
  stdin: { contents: src, loader: "tsx", resolveDir: ws, sourcefile: "editors__latex-editor.tsx" },
  outfile: out,
  format: "esm",
  bundle: false,
  logLevel: "silent",
  write: true,
});
if (r.errors && r.errors.length) {
  console.error("✗ 编译失败（" + r.errors.length + " 条）：");
  const seen = new Set();
  for (const e of r.errors) {
    const loc = e.location ? e.location.file + ":" + e.location.line + ":" + e.location.column : "";
    const key = loc + e.text;
    if (seen.has(key)) continue;
    seen.add(key);
    console.error("  " + loc + "  " + e.text);
    if (e.location && e.location.lineText) console.error("    " + e.location.lineText.trim().slice(0, 120));
  }
  process.exit(1);
}

const js = fs.readFileSync(out, "utf8");
console.log("✓ 编译通过（内联后 " + src.length + " 字符 → 产物 " + js.length + " 字符）");
console.log("  esbuild:              " + esbuild.version);
console.log("  contentEditable 命中: " + (js.match(/contentEditable/gi) || []).length);
console.log("  data-tex 命中:        " + (js.match(/data-tex/g) || []).length);
console.log("  applyEdits 命中:      " + (js.match(/applyEdits/g) || []).length);
console.log("  wysRenderDoc 命中:    " + (js.match(/wysRenderDoc/g) || []).length);
console.log("  wysDomToTex 命中:     " + (js.match(/wysDomToTex/g) || []).length);
console.log("  commitWys 命中:       " + (js.match(/commitWys/g) || []).length);
