/* 给 server/index.js 打补丁：编译器按名称找不到时，自动探测常见安装位置 */
const fs = require("fs");
const f = process.argv[2] || "server/index.js";
let s = fs.readFileSync(f, "utf8");
if (!s.includes("TECTONIC_MIRROR")) {
  s = s.replace(
    "await fetch(asset.browser_download_url",
    'await fetch((process.env.TECTONIC_MIRROR || "") + asset.browser_download_url'
  );
  fs.writeFileSync(f, s);
  console.log("mirror support added");
} else {
  console.log("already has mirror support");
}
