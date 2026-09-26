/* 自动生成 —— 勿手改（改了这一行下面的东西就跟装机版脱钩了）。
 * 重新生成: node .setup/check/host-parse-gen.js
 * 来源 bundle: index-CYesnb_M.js  (8.9MB, mtime 2026-09-22T14:04:14.212Z)
 *
 * 这是宿主 parseItems 的**完整前置步骤**（含 1.3.3+ 新增的 extractToolText）：
 *   parseItems = extractToolText（把 result 拍平成文本，★ level/anchor 就在这一步丢的）
 *              → JSON.parse → Array/mapItemArray | 对象分支（items/data/content）
 *              → 兜底 parseLineProtocol（逐行 level|text|anchor）
 */
const clampLevel=it=>{const te=Number(it);return Number.isFinite(te)&&te>0?Math.min(Math.floor(te),6):1};

function mapItemArray(it){return it.map(te=>{const dt=te??{},ht=String(dt.text??dt.title??"").trim();return{level:clampLevel(dt.level),text:ht,anchor:dt.anchor!=null?String(dt.anchor):void 0}}).filter(te=>te.text)}

function parseLineProtocol(it){return it.split(`
`).map(te=>te.trim()).filter(Boolean).map(te=>{const dt=te.split("|");if(dt.length===1)return{level:1,text:te};const[ht,pt,yt]=dt;return{level:clampLevel(ht),text:pt.trim()||te,anchor:(yt==null?void 0:yt.trim())||void 0}}).filter(te=>te.text)}

function extractToolText(it){if(typeof it=="string")return it;if(it&&typeof it=="object"){const te=it;if(typeof te.content=="string")return te.content;if(Array.isArray(te.content))return te.content.map(dt=>typeof dt=="string"?dt:(dt==null?void 0:dt.text)??"").filter(Boolean).join(`
`);try{return JSON.stringify(it)}catch{return""}}return String(it??"")}

function parseItems(it){const te=extractToolText(it).trim();if(!te)return[];try{const dt=JSON.parse(te);if(Array.isArray(dt)){const ht=mapItemArray(dt);if(ht.length)return ht}else if(dt&&typeof dt=="object"){const ht=dt,pt=[ht.items,ht.data,ht.content].find(Array.isArray);if(pt){const yt=mapItemArray(pt);if(yt.length)return yt}}if(Array.isArray(dt)||dt&&typeof dt=="object")return[]}catch{}return parseLineProtocol(te)}

module.exports = { parseItems: parseItems, extractToolText: extractToolText, parseLineProtocol: parseLineProtocol, mapItemArray: mapItemArray, clampLevel: clampLevel };
