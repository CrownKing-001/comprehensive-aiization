// 图标语义表 —— 全站唯一真源。
//
// ⚠️ 这个文件**故意放在 components/ui-icon/ 里面**，而不是 utils/。
// 原因（踩过）：自定义组件的 JS 在编译期按各自的依赖图打包，从
// components/xxx/ 里 require('../../utils/yyy') 在真机/编译器下会报
//   module 'utils/yyy.js' is not defined
// 把表放在组件同目录、用 './icons' 引用，就不会有解析问题。
// utils/ui-icon.js 只是对这里的转发，给页面 JS 用。
//
// ── 语义名 vs WeUI 图标名 ──────────────────────────────────────
// WXML 里写**语义名**（tasks / meal / run / clock …），表达「这块内容是
// 什么」；具体图形由本表决定。WeUI 缺很多业务语义（没有日历、体重、跑步），
// 把「缺图形」挡在这张表里，将来换图标库只改这一个文件。
//
// WeUI 内置 81 个（全集，写死在官方 icon/icon.js 里）：
//   add add2 add-friends album arrow at back back2 bellring-off bellring-on
//   camera cellphone clip close close2 comment contacts copy delete delete-on
//   discover display done done2 download email error eyes-off eyes-on folder
//   group-detail help home imac info keyboard like link location lock
//   max-window me mike mike2 mobile-contacts more more2 mosaic music music-off
//   note pad pause pencil photo-wall play play2 previous previous2 qr-code
//   refresh report-problem search sending setting share shop star sticker tag
//   text time transfer2 transfer-text translate tv video-call voice
//   volume-down volume-off volume-up
//
// ⚠️ 不是每个图标都有 filled 变体；官方组件查不到变体时**不报错**，
// 而是把 src 留空 → 渲染成空白。所以 ICON_VARIANT 只给确认有的用实心。

const ICON_SIZE = {
  SM: 16, // 行内小图标
  MD: 20, // 默认：卡片头图标底座
  LG: 24, // 空状态
  XL: 32, // 引导页 / 结果页
};

const ICON_MAP = {
  // ── 导航与页面级 ──
  home: 'home',
  calendar: 'time', // WeUI 无日历图形，time 最接近「按日程排」
  schedule: 'time',
  tasks: 'note', // 待办的本质是一行行要写的东西
  assignment: 'text', // 要交的文档
  health: 'like', // 心形，不用医院十字
  settings: 'setting',
  analysis: 'display', // 看板/屏幕
  scan: 'camera',
  graduation: 'discover', // 校历（罗盘/探索意象）

  // ── 通用操作 ──
  add: 'add',
  close: 'close',
  delete: 'delete',
  edit: 'pencil',
  more: 'more',
  info: 'info',
  help: 'help',
  time: 'time',
  clock: 'time',
  check: 'done',
  star: 'star',
  tag: 'tag',
  search: 'search',
  refresh: 'refresh',
  link: 'link',
  location: 'location',
  share: 'share',
  bell: 'bellring-on',
  backup: 'download',
  upload: 'sending',
  folder: 'folder',
  note: 'note',
  text: 'text',
  image: 'album',
  mic: 'mike',
  music: 'music',
  video: 'tv',
  phone: 'cellphone',
  mail: 'email',
  lock: 'lock',
  person: 'me',
  group: 'contacts',
  copy: 'copy',
  translate: 'translate',
  play: 'play',
  robot: 'comment', // 无机器人图形，对话气泡最贴切
  flash: 'sticker',
  celebrate: 'like', // 无彩带图形，用心形
  fire: 'sticker',

  // ── 健康子模块 ──
  meal: 'shop', // 餐
  exercise: 'play2',
  run: 'play2',
  weight: 'display', // 称重读数
  sleep: 'time',
  book: 'note',
  target: 'star',
  brush: 'pencil',
  tree: 'folder',
  chart: 'display',

  // ── v1.2.0 第 1 期收尾补的：原本以 emoji 散落在 WXML / 模板串里的图标 ──
  steps: 'play2', // 👣 无「脚印」图形
  study: 'note', // 📖 打开的书 → 阅读/课业
  doc: 'text', // 📄 单页文档
  tip: 'info', // 💡 提示（与 info 同形，保留两个语义只为读代码时表意清楚）
  warn: 'report-problem', // ⚠️ 与 WeUI 的 warn 形一致
  pin: 'tag', // 📌 无图钉图形；★ 星标同理走 star
  flag: 'tag', // ⚑ 优先级小旗
  trophy: 'star', // 🏆
  copy: 'copy', // 📋 复制 / ☐ 勾选框由 wxss 画，不用图标
  paperclip: 'link', // 📎
  clipboard: 'copy', // 📋 指「复制指令」时
  archive: 'folder', // 💾 存档
  trash: 'delete', // 🗑
  undo: 'previous', // ↩
  exportData: 'sending', // ⬇️ 导出到剪贴板（动作方向：送出去）
  importData: 'download', // ⬆️ 从剪贴板导入
  broom: 'delete', // 🧹
  fire: 'sticker', // 🔥
};

// 实心变体：只有确认 WeUI 该图标同时有 filled 的才写在这里。
const ICON_VARIANT = {
  health: 'filled', // like 有 filled
  star: 'filled', // star 有 filled
  target: 'filled',
  celebrate: 'filled',
};

// ⚠️ 必须走 hasOwnProperty，不能直接 ICON_MAP[x]。
// 从 v1.2.0 起图标名来自**数据**（item.icon 由页面 JS 给），不是写死的字面量：
//   resolveName('__proto__')  → 普通的 [] 索引会拿到 Object.prototype → 渲染成 [object Object]
//   resolveName('toString')   → 拿到继承来的函数 → mp-icon 收到一个函数 → 空白
// 这两种都**不会报错**，正是本节开头说的那类静默失败。
function resolveName(semantic) {
  const key = String(semantic == null ? '' : semantic).trim();
  if (!key) return '';
  return hasOwn(key) ? ICON_MAP[key] : key;
}

function hasOwn(key) {
  return Object.prototype.hasOwnProperty.call(ICON_MAP, key);
}

function isKnown(semantic) {
  const key = String(semantic == null ? '' : semantic).trim();
  return !!key && hasOwn(key);
}

function resolveVariant(semantic) {
  const key = String(semantic == null ? '' : semantic).trim();
  return Object.prototype.hasOwnProperty.call(ICON_VARIANT, key) ? ICON_VARIANT[key] : 'outline';
}

// ── 旧数据兼容：emoji → 语义名 ─────────────────────────────────
// 「重要事项」的每一条在 store 里存的是 `emoji: '📝'`（用户可以手填），
// 校历识别的结果也带 emoji。这些是**已经落在用户手机上的数据**，
// 不能迁移掉（没有后端，迁移一旦出 bug 用户的记录就没了）。
//
// 所以做法是：数据保持不动，渲染时才换成图标。认不出来的 emoji 一律
// 退成 fallback，绝不把 emoji 原样透传给 mp-icon（那样是静默空白）。
const EMOJI_TO_ICON = {
  '📝': 'note',
  '📌': 'pin',
  '🏆': 'trophy',
  '🎓': 'graduation',
  '📄': 'doc',
  '📚': 'study',
  '📖': 'study',
  '📕': 'study',
  '💻': 'analysis',
  '🔤': 'translate',
  '🏃': 'run',
  '🥾': 'run',
  '🧳': 'folder',
  '📋': 'clipboard',
  '🧰': 'folder',
  '❄️': 'time',
  '☀️': 'time',
  '🥮': 'celebrate',
  '🇨🇳': 'flag',
  '🎊': 'celebrate',
  '🧧': 'celebrate',
  '🧨': 'celebrate',
  '🌷': 'star',
  '🌱': 'star',
  '💪': 'exercise',
  '🎈': 'celebrate',
  '🧸': 'star',
  '🍡': 'meal',
  '🚩': 'flag',
  '🎖️': 'trophy',
  '⚖️': 'weight',
  '🌙': 'sleep',
  '👣': 'steps',
  '🏋️': 'exercise',
  '🍚': 'meal',
  '🍽️': 'meal',
  '✅': 'tasks',
  '🏠': 'home',
  '📅': 'calendar',
  '👟': 'run',
  '🎯': 'target',
  '⭐': 'star',
  '🔔': 'bell',
  '💡': 'tip',
  '⚠️': 'warn',
  '⚠': 'warn',
};

/** emoji（或已经是语义名的字符串）→ 一定能被 mp-icon 解析的语义名 */
function emojiToIcon(value, fallback) {
  const fb = fallback || 'pin';
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return fb;
  if (isKnown(raw)) return raw; // 已经是语义名，原样用
  // 去掉变体选择符（FE0F/FE0E）再比：'🏋️' 与 '🏋' 应当命中同一条
  const strip = (s) => s.replace(/[\uFE0F\uFE0E]/g, '');
  const key = strip(raw);
  if (EMOJI_TO_ICON[raw]) return EMOJI_TO_ICON[raw];
  const found = Object.keys(EMOJI_TO_ICON).find((k) => strip(k) === key);
  return found ? EMOJI_TO_ICON[found] : fb;
}

module.exports = {
  ICON_MAP,
  ICON_SIZE,
  ICON_VARIANT,
  EMOJI_TO_ICON,
  resolveName,
  resolveVariant,
  isKnown,
  emojiToIcon,
};