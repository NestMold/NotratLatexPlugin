"use strict";
/* 给 server/index.js 增补 latex_asset 工具（KaTeX 离线包 / 图片 dataURI） */
const fs = require("fs");
const p = "E:/notrat-latex-plugin/server/index.js";
let s = fs.readFileSync(p, "utf8");

if (s.includes("latex_asset")) { console.log("already patched"); process.exit(0); }

// 1) TOOLS 增补定义
const anchorTools = "];\n\nasync function handleToolCall(name, args) {";
const assetTool = `  {
    name: "latex_asset",
    description:
      "插件内部资产工具：name=katex 返回离线 KaTeX 渲染包（JS+CSS，字体已内嵌）；path=<图片路径> 返回图片 dataURI（预览插图用）。一般不直接调用。",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "资产名：katex" },
        path: { type: "string", description: "图片文件路径（png/jpg/jpeg/gif/svg/webp/bmp）" },
        ...WS_PARAM,
      },
    },
  },
];

async function handleToolCall(name, args) {`;
if (!s.includes(anchorTools)) { console.error("TOOLS anchor not found"); process.exit(1); }
s = s.replace(anchorTools, assetTool);

// 2) handleToolCall 增补分支（放在「未知工具」throw 之前）
const anchorThrow = "  throw new Error(`未知工具: ${name}`);";
const assetBranch = `  if (name === "latex_asset") {
    if (args.name === "katex") {
      try {
        const A = require("./assets-katex.json");
        return JSON.stringify(A);
      } catch (e) {
        return JSON.stringify({ js: "", css: "" });
      }
    }
    if (args.path) {
      const file = resolveInput(args.path, ws);
      if (!file) throw new Error("文件不存在: " + args.path);
      const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp", ".bmp": "image/bmp" };
      const ext = path.extname(file).toLowerCase();
      if (!MIME[ext]) throw new Error("仅支持图片: " + Object.keys(MIME).join(" "));
      const buf = fs.readFileSync(file);
      if (buf.length > 8 * 1024 * 1024) throw new Error("图片过大（>8MB）");
      return JSON.stringify({ dataUri: "data:" + MIME[ext] + ";base64," + buf.toString("base64") });
    }
    throw new Error("latex_asset 需要 name=katex 或 path=<图片路径>");
  }
` + anchorThrow;
if (!s.includes(anchorThrow)) { console.error("throw anchor not found"); process.exit(1); }
s = s.replace(anchorThrow, assetBranch);

fs.writeFileSync(p, s);
console.log("server/index.js patched: latex_asset added");
