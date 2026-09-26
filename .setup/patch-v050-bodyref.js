/* v0.5.0 补丁 4：修 render 冒烟抓到的真 bug —— JSX 上挂着 bodyRef 但没声明
 * （转译/编译都过得去，一渲染就 ReferenceError: bodyRef is not defined；
 *   滚动定位已经由 rowRefs + scrollIntoView 负责，这个 ref 是多余的，直接摘掉）
 */
const fs = require("fs");
const path = require("path");
const p = "E:/notrat-latex-plugin/panels/outline.tsx";
let s = fs.readFileSync(p, "utf8");

const from = '<div style={S.body} ref={bodyRef} tabIndex={0} onKeyDown={onKeyDown}';
const to = '<div style={S.body} tabIndex={0} onKeyDown={onKeyDown}';

if (s.indexOf(from) < 0) {
  console.log("  = 已经是目标形态");
} else {
  s = s.replace(from, to);
  fs.writeFileSync(p, s);
  console.log("  ✓ 已移除未声明的 bodyRef 引用");
}
