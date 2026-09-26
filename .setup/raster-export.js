/* 导出 HTML 的 pdf 内嵌路径验证（同步栅格化） */
const fs = require("fs"), os = require("os"), path = require("path");
const EH = require("E:/notrat-latex-plugin/server/export-html.js");
const RASTER = require("E:/notrat-latex-plugin/server/pdf-raster.js");

// 清缓存 → 首次必须真实转换
fs.rmSync(RASTER.CACHE_DIR, { recursive: true, force: true });

const html = '<figure class="pv-float"><img class="pv-img" data-asset="E:/notrat-latex-plugin/samples/arXiv-2308.03688v3/figs/agentbench.pdf" data-raster="1" alt="figs/agentbench.pdf" /></figure>';
const r = EH.inlineImages(html, {});
const okImg = /src="data:image\/png;base64,/.test(r.html);
console.log("① pdf 内嵌:", okImg ? "OK" : "FAIL", "| inlined:", r.inlined, "| missing:", r.missing);

// 坏 pdf → 占位符 + missing 说明
const bad = path.join(os.tmpdir(), "notrat-bad-fig2.pdf");
fs.writeFileSync(bad, "not a pdf");
const html2 = '<img data-asset="' + bad + '" data-raster="1" alt="bad.pdf" />';
const r2 = EH.inlineImages(html2, {});
console.log("② 坏pdf 占位:", r2.html.includes("pv-imgna") && !r2.html.includes("<img") ? "OK" : "FAIL", "| missing:", r2.missing);

// 无扩展名候选
const html3 = '<img data-asset="E:/notrat-latex-plugin/samples/arXiv-2308.03688v3/figs/agentbench" data-raster="1" alt="agentbench" />';
const r3 = EH.inlineImages(html3, {});
console.log("③ 无扩展名:", /src="data:image\/png/.test(r3.html) ? "OK" : "FAIL", "| missing:", r3.missing);

fs.unlinkSync(bad);
const allOk = okImg && r2.html.includes("pv-imgna") && /src="data:image\/png/.test(r3.html);
console.log(allOk ? "\n导出路径全部通过 ✅" : "\n有失败 ❌");
process.exitCode = allOk ? 0 : 1;
