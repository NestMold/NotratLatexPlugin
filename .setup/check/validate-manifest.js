/* 插件清单预检器 —— 规则全部来自宿主 app.asar 的真实实现，不是 wiki 转述。
 *
 * 用法: node .setup/check/validate-manifest.js [manifest.json 路径]
 * 退出码: 0 全通过 / 1 有 ERROR
 *
 * 宿主源码依据（app.asar）:
 *   resolvePlaceholders: String(te).replace(/\$\{settings:([^}]+)\}/g, (_,ref)=>{
 *                          const v = usePluginSettingsStore.getState().getValue(pluginId, ref.trim());
 *                          return v === undefined ? "" : String(v) })      // 未命中 -> 空串
 *   getValue:            (pluginId, key) => get().values[pluginId]?.[key]
 *   PluginSettingsPane:  setValue(group.key, field.key, value)            // 写入用「分组 key」当外层索引
 *                        values[group.key][field.key] === 写入落点
 *   => 只有当 settings 分组 key === manifest.id 时，写入落点与读取索引才重合。
 *      官方 notrat-sync / notrat-broadcast 均满足此式。
 *
 *   editors 解析: if (!id) 忽略; if (!extensions.length) 忽略; if (!source) 忽略;
 *                 dualView = (Array.isArray(dv) && dv.length===2 && 每项非空字符串)
 *                            ? [String(dv[0]), String(dv[1])] : void 0
 *
 *   commands 解析: name 必须匹配 /^[a-z0-9][a-z0-9-:]*$/，否则禁用；
 *                  与内置/更早启用插件重名则禁用；tool 缺省为 name.replace(/-/g,"_")。
 *
 *   fileTreeMenus: 需要 id，且 uiKey / tool 至少其一；
 *                  uiKey 指向的 ui 贡献必须 location === "page"。
 */
const fs = require("fs");
const path = require("path");

const file = path.resolve(process.argv[2] || "manifest.json");
const m = JSON.parse(fs.readFileSync(file, "utf8"));
const c = m.contributions || {};

const ERR = [], WARN = [], OK = [];
const err = (s) => ERR.push(s);
const warn = (s) => WARN.push(s);
const ok = (s) => OK.push(s);

/* ---------- 1. mcpServers 必须是数组 ---------- */
if (!Array.isArray(m.mcpServers)) {
  err(`mcpServers 必须是数组（宿主 enable() 对它 for...of，对象形态抛 "object is not iterable"）`);
} else {
  ok(`mcpServers 数组形态，共 ${m.mcpServers.length} 个 server`);
  m.mcpServers.forEach((s, i) => {
    if (!s.id) err(`mcpServers[${i}] 缺 id`);
    if (!s.transport) warn(`mcpServers[${i}] 缺 transport`);
    if (s.transport === "stdio" && !s.command) err(`mcpServers[${i}] stdio 缺 command`);
  });
}

/* ---------- 2. settings 分组 key 必须 === manifest.id ---------- */
const groups = Array.isArray(c.settings) ? c.settings : [];
if (c.settings !== undefined && !Array.isArray(c.settings)) {
  err(`contributions.settings 必须是数组（分组对象数组）`);
}
for (const g of groups) {
  if (g.key !== m.id) {
    err(`settings 分组 key="${g.key}" ≠ manifest.id="${m.id}" → `
      + `写入落点 values["${g.key}"][field] 与读取索引 values["${m.id}"][ref] 不重合，该组设置永远读不到`);
  } else {
    ok(`settings 分组 key="${g.key}" 与 manifest.id 一致`);
  }
  if (!Array.isArray(g.fields) || !g.fields.length) err(`settings 分组 "${g.key}" 缺 fields`);
}
const fieldKeys = {};
for (const g of groups) for (const f of (g.fields || [])) fieldKeys[f.key] = g.key;

/* ---------- 3. 每个 ${settings:ref} 必须能解析到某个字段 ---------- */
const refs = [];
for (const s of (Array.isArray(m.mcpServers) ? m.mcpServers : [])) {
  for (const v of Object.values(s.env || {})) {
    for (const mm of String(v).matchAll(/\$\{settings:([^}]+)\}/g)) refs.push(mm[1].trim());
  }
  for (const v of (s.args || [])) {
    for (const mm of String(v).matchAll(/\$\{settings:([^}]+)\}/g)) refs.push(mm[1].trim());
  }
}
for (const ref of new Set(refs)) {
  if (fieldKeys[ref] !== undefined) {
    if (fieldKeys[ref] === m.id) ok(`\${settings:${ref}} 可解析（分组 "${fieldKeys[ref]}" === id）`);
    else err(`\${settings:${ref}} 落在分组 "${fieldKeys[ref]}" ≠ id → 实际解析为空串`);
  } else {
    err(`\${settings:${ref}} 无对应字段 → 宿主解析为空串 ""（注意空串≠未设置，会静默吞掉）`);
  }
}
if (!refs.length && groups.length) warn(`声明了 settings 但没有任何 \${settings:...} 引用`);

/* ---------- 4. editors ---------- */
for (const e of (c.editors || [])) {
  const label = e.label || e.id || "(未命名)";
  /* 源码来源二选一：e.source（内联，装机包形态）或 e.sourceFile（开发态，构建脚本读盘内联）。
     v0.8.3：sourceFile 命中不再直接 continue —— 只差一次内联，模式契约（dualView / modes）照样要查。 */
  let srcOk = !!e.source;
  if (!e.id) { err(`editor "${label}" 缺 id → 宿主忽略`); continue; }
  const exts = (e.extensions || []).map((x) => String(x).trim().replace(/^./, "").toLowerCase()).filter(Boolean);
  if (!exts.length) { err(`editor "${label}" 未声明 extensions → 宿主忽略`); continue; }
  if (!srcOk) {
    const sf = e.sourceFile;
    const sfAbs = sf ? path.resolve(path.dirname(file), sf) : null;
    if (sf && fs.existsSync(sfAbs)) {
      ok(`editor "${label}" 用 sourceFile="${sf}"（构建期将内联，${fs.statSync(sfAbs).size} 字节）`);
      srcOk = true;
    } else {
      err(`editor "${label}" 缺 source（且 sourceFile ${sf ? "指向的文件不存在: " + sf : "未声明"}）→ 宿主忽略`);
      continue;
    }
  }
  if (e.dualView === undefined) {
    ok(`editor "${label}" 无 dualView（不启用宿主双视图）`);
  } else if (Array.isArray(e.dualView) && e.dualView.length === 2
             && e.dualView.every((d) => typeof d === "string" && d.trim())) {
    ok(`editor "${label}" dualView=[${e.dualView.map((x) => `"${x}"`).join(", ")}] 合法（第1项=wysiwyg态，第2项=source态）`);
  } else {
    err(`editor "${label}" dualView=${JSON.stringify(e.dualView)} 非法 → 宿主置为 void 0：`
      + `标题栏不出现模式开关，且 props.mode / props.onModeSwitch 一律不注入`);
  }
  if (e.dualViewLabels !== undefined) {
    warn(`editor "${label}" 含 dualViewLabels —— 宿主对此外零引用，是死配置（且会进权限预览）`);
  }

  /* v0.8.3：modes（N 态）—— 官方规范契约；与 dualView 同时声明做跨版本兜底 */
  if (e.modes !== undefined) {
    const ms = e.modes;
    if (!Array.isArray(ms) || ms.length < 2 || ms.length > 6) {
      err(`editor "${label}" modes 非法（需 2–6 项数组，实际 ${Array.isArray(ms) ? ms.length + " 项" : typeof ms}）→ 宿主忽略该字段`);
    } else {
      const bad = ms.filter((m) => !m || typeof m.id !== "string" || !m.id.trim() || typeof m.label !== "string" || !m.label.trim());
      const ids = ms.map((m) => (m && m.id) || "");
      const dup = ids.filter((x, i) => x && ids.indexOf(x) !== i);
      if (bad.length) err(`editor "${label}" modes 有 ${bad.length} 项缺 id/label → 宿主整表忽略`);
      else if (dup.length) err(`editor "${label}" modes 的 id 重复：${dup.join(", ")}`);
      else ok(`editor "${label}" modes=[${ids.join(", ")}] 合法（${ms.length} 态，第 1 项为默认态）`);
    }
    /* 取证结论（D:/Notrat/resources/app.asar，2026-09 装机版）：渲染进程无 editors[].modes 解析代码 */
    if (Array.isArray(e.dualView)) {
      warn(`editor "${label}" modes 与 dualView 同时声明 → 新客户端 modes 生效、dualView 被忽略；旧客户端（含当前装机版）只认 dualView = 预期兜底`);
    } else {
      warn(`editor "${label}" 只声明 modes 未留 dualView → 当前装机版宿主不解析 modes，将不出现任何模式开关`);
    }
  }
}

/* ---------- 5. commands ---------- */
const seen = new Set();
for (const cmd of (c.commands || [])) {
  const name = String(cmd.name || "");
  if (!/^[a-z0-9][a-z0-9-:]*$/.test(name)) {
    err(`command name="${name}" 不合规（需 /^[a-z0-9][a-z0-9-:]*$/）→ 宿主禁用该命令`);
    continue;
  }
  if (seen.has(name)) err(`command name="${name}" 在本清单内重复`);
  seen.add(name);
  if (!cmd.tool) warn(`command "${name}" 缺 tool → 宿主兜底为 name.replace(/-/g,"_") = "${name.replace(/-/g, "_")}"`);
}
if (seen.size) ok(`commands ${seen.size} 条，name 全部合规`);

/* ---------- 6. ui locations ---------- */
const LOC = new Set(["sidebar-input","messages-top","right-panel","popup","floating",
  "sidebar-toolbar","activity-bar","status-bar","outline","editor-tabs","editor-header",
  "widget","page"]);
for (const u of (c.ui || [])) {
  if (!LOC.has(u.location)) err(`ui "${u.id}" location="${u.location}" 不在已知挂载位`);
  if (u.extensions !== undefined) {
    warn(`ui "${u.id}" 声明了 extensions —— 当前宿主注册表只 push `
      + `{key,pluginId,title,icon,location,content,serverId,openMode}，extensions 被丢弃（无过滤效果）`);
  }
  const ct = u.content && u.content.type;
  if (ct === "component" && !u.content.source && !u.content.sourceFile) {
    err(`ui "${u.id}" content.type=component 但既无 source 也无 sourceFile`);
  }
}
if ((c.ui || []).length) ok(`ui ${c.ui.length} 项，挂载位合法`);

/* ---------- 7. fileTreeMenus ---------- */
const pageKeys = new Set((c.ui || []).filter((u) => u.location === "page").map((u) => u.id));
for (const t of (c.fileTreeMenus || [])) {
  if (!t.id) { err(`fileTreeMenu "${t.label}" 缺 id → 忽略`); continue; }
  if (!t.uiKey && !t.tool) { err(`fileTreeMenu "${t.id}" 缺 uiKey / tool → 忽略`); continue; }
  if (t.uiKey && !pageKeys.has(t.uiKey)) {
    err(`fileTreeMenu "${t.id}" uiKey="${t.uiKey}" 未指向任何 location="page" 的 ui 贡献`);
  }
}

/* ---------- 8. toolHooks ---------- */
const toolNames = new Set();
for (const h of (c.toolHooks || [])) {
  if (!h.on || !h.tool) err(`toolHook "${h.id}" 缺 on / tool`);
  if (h.on && !["pre","post"].includes(h.on)) warn(`toolHook "${h.id}" on="${h.on}" 非 pre/post`);
}

/* ---------- 9. 其他契约 ---------- */
if (m.type !== "plugin") err(`type 应为 "plugin"，实为 ${JSON.stringify(m.type)}`);
if (m.manifestVersion !== 2) err(`manifestVersion 应为 2，实为 ${JSON.stringify(m.manifestVersion)}`);
if (!m.id) err(`缺 id`);
if (!/^\d+\.\d+\.\d+/.test(String(m.version || ""))) warn(`version="${m.version}" 非语义化`);
if (!m.notrat || !m.notrat.minVersion) warn(`缺 notrat.minVersion`);

/* ---------- 输出 ---------- */
console.log(`\n预检 ${path.basename(file)}  (id=${m.id}, v=${m.version})\n`);
if (OK.length)   { console.log("通过:"); OK.forEach((s) => console.log("  ✓ " + s)); }
if (WARN.length) { console.log("\n警告:"); WARN.forEach((s) => console.log("  ! " + s)); }
if (ERR.length)  { console.log("\n错误:"); ERR.forEach((s) => console.log("  ✗ " + s)); }
console.log(`\n合计: ${OK.length} 通过 / ${WARN.length} 警告 / ${ERR.length} 错误`);
process.exit(ERR.length ? 1 : 0);
