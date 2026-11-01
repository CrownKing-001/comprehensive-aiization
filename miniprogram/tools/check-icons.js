// 校验：所有会喂给 <ui-icon name="..."> 的语义名，必须都能被 mp-icon 解析出图案。
//
// 为什么要有这个脚本：WeUI 的 mp-icon 查不到名字时**不报错**，而是把 src 留空
// → 页面上什么都不显示，控制台一片安静。这类静默失败只能靠静态比对拦住。
//
// 用法：node miniprogram/tools/check-icons.js [mp目录]
const fs = require('fs');
const path = require('path');

const MP = path.resolve(process.argv[2] || path.join(__dirname, '..'));

// ── 1. 读出 WeUI mp-icon 真实拥有的图标名 ──────────────────────
// 表变量名 C，结构 {"name":{outline:'<svg...>',filled:'<svg...>'},...}
// ⚠️ 不要用「名字:{outline:」这种朴素正则去猜 —— SVG 内部也有
// "3.Icons/Outlined/xxx" 这样长得像键的字符串。先把 <svg>…</svg> 整体换成
// 占位符再解析，才不会误抓。
function loadWeuiIcons() {
  const file = path.join(MP, 'miniprogram_npm', 'weui-miniprogram', 'icon', 'icon.js');
  if (!fs.existsSync(file)) return null;
  const src = fs.readFileSync(file, 'utf8');
  const anchor = src.lastIndexOf('}},g=function');
  if (anchor < 0) return null;
  const head = src.slice(0, anchor + 3);
  const start = head.indexOf('C={');
  if (start < 0) return null;
  const slim = head.slice(start + 2).replace(/<svg[\s\S]*?<\/svg>/g, '[SVG]');
  const names = new Set();
  const re = /[{,]"?([a-z][a-z0-9-]*)"?:\{outline:/g;
  let m;
  while ((m = re.exec(slim))) names.add(m[1]);
  return names.size ? names : null;
}

const WEUI = loadWeuiIcons();
if (!WEUI) {
  console.log('  ❌ 读不到 WeUI 的 icon.js，无法校验（先跑 npm i / 构建 npm）');
  process.exit(1);
}

const icons = require(path.join(MP, 'components', 'ui-icon', 'icons.js'));
const { ICON_MAP, resolveName } = icons;

// ── 2. ICON_MAP 的每个目标都必须在 WeUI 里 ────────────────────
let bad = 0;
for (const [semantic, target] of Object.entries(ICON_MAP)) {
  if (!WEUI.has(target)) {
    console.log(`  ❌ ICON_MAP.${semantic} → "${target}" 不在 WeUI 图标表里（会渲染成空白）`);
    bad++;
  }
}

// ── 3. 扫所有 WXML，抽出 name="xxx" 的字面量语义名 ─────────────
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'miniprogram_npm') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.wxml')) files.push(p);
  }
})(path.join(MP, 'pages'));

const used = new Map(); // 语义名 -> [文件:行]
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    const re = /<ui-icon[^>]*\sname="([^"{]+)"/g;
    let m;
    while ((m = re.exec(line))) {
      const nm = m[1].trim();
      const rel = path.relative(MP, f);
      if (!used.has(nm)) used.set(nm, []);
      used.get(nm).push(`${rel}:${i + 1}`);
    }
  });
}

for (const [nm, where] of used) {
  const target = resolveName(nm);
  if (!WEUI.has(target)) {
    console.log(`  ❌ 未知语义 "${nm}" → "${target}"，用在 ${where.slice(0, 3).join(', ')}`);
    bad++;
  }
}

// ── 4. 静态 name 覆盖不到的：数据驱动的 {{item.icon}} ─────────
// 这些只能检查数据来源，见下面的硬编码清单。
const DYNAMIC = [
  'pages/dashboard/dashboard.js',
  'pages/health/def.js',
  'pages/tasks/tasks.js',
  'pages/healthhub/healthhub.js',
];
for (const rel of DYNAMIC) {
  const f = path.join(MP, rel);
  if (!fs.existsSync(f)) continue;
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    // ⚠️ 只认「单独成行的 icon: 'x'」，也就是对象字面量里的数据字段。
    // 不能用宽松的 /icon:\s*'...'/ —— 那会连 wx.showToast({ icon: 'success' })
    // 这种提示框图标也抓进来（none/success 根本不是 WeUI 图形名）。
    const m = line.match(/^\s*icon:\s*'([^']+)'\s*,?\s*$/);
    if (!m) return;
    const nm = m[1];
    if (/^[a-zA-Z][\w-]*$/.test(nm)) {
      const target = resolveName(nm);
      if (!WEUI.has(target)) {
        console.log(`  ❌ ${rel}:${i + 1} 的 icon:'${nm}' → "${target}" 不在 WeUI 表里`);
        bad++;
      }
    } else {
      console.log(`  ⚠️  ${rel}:${i + 1} 的 icon:'${nm}' 仍是 emoji，走 emojiToIcon 转义`);
    }
  });
}

console.log('');
if (bad) {
  console.log(`  ❌ ${bad} 个图标名会渲染成空白`);
  process.exit(1);
}
console.log(`  ✅ ${used.size} 个 WXML 语义名 + ${Object.keys(ICON_MAP).length} 条映射，全部能解析（WeUI 共 ${WEUI.size} 个图形）`);

// ── 5. 语义名被当成文字直接渲染（漏包 ui-icon）───────────────
// 踩过：dashboard/tasks 的分段栏写的是 <text class="seg-icon">{{item.icon}}</text>，
// 而 item.icon 这时已经是语义名 'home' / 'calendar'，于是界面上直接显示
// 「home 总览」「calendar 今日」。上一节的检查对此无能为力 ——
// 名字本身是**合法**的，错的是没包成图标。
// 判据：任何 {{...icon}} 插值，如果所在行没有 <ui-icon，就是裸渲染。
let bare = 0;
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/^\s*<!--/.test(line)) return;
    if (!/\{\{[^}]*\bicon\b[^}]*\}\}/.test(line)) return;
    if (/<ui-icon/.test(line)) return;
    // 图标的「选择器」类界面（让用户挑图标）不属于渲染，跳过
    if (/placeholder|data-|bindtap="(setIcon|chooseIcon|pickIcon)"/.test(line) && !/\{\{[^}]*icon/.test(line.replace(/data-[\w-]+="[^"]*"/g, ''))) return;
    console.log(`  ❌ ${path.relative(MP, f)}:${i + 1} 把图标名当文字渲染了：${line.trim().slice(0, 90)}`);
    bare++;
  });
}

if (bare) {
  console.log(`  ❌ ${bare} 处 {{...icon}} 没包 <ui-icon>`);
  process.exit(1);
}
console.log('  ✅ 所有 {{...icon}} 插值都经过 <ui-icon>，没有把语义名直接当文字显示');
