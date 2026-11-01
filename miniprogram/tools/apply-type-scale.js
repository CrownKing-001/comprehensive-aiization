// 第 2 期：字号收敛到微信官方五档（22 / 17 / 15 / 14 / 12 pt = 44/34/30/28/24 rpx）。
//
// 原来的 24 种字号里，21/22/23/24/25rpx 挤在 11pt 附近互相差 0.5pt，
// 肉眼看不出区别，却让整个站点没有「层级」。收敛后每一种尺寸都有明确职责。
//
// 映射规则（就近取档，但保留层级语义）：
//   ≤19  → 24 (12pt)  原来 16-19rpx 的极小字，属于该消失的档位
//   20-22 → 24 (12pt)  12pt 是官方最小的合法正文尺寸
//   23-26 → 28 (14pt)  正文主力
//   27-29 → 30 (15pt)  卡片标题 / 按钮
//   30-32 → 30 (15pt)
//   33-36 → 34 (17pt)  页面标题
//   37-46 → 34 (17pt)  再大一级只有 22pt，留给 54/66 的巨型数字
//   47+   → 44 (22pt)  核心数字
//
// ⚠️ 不替换 font-size 的 shorthand / 媒体查询里的写法 —— 那些是刻意的。
//
// 用法：node miniprogram/tools/apply-type-scale.js [--write]
const fs = require('fs');
const path = require('path');

const MP = path.resolve(__dirname, '..');
const WRITE = process.argv.includes('--write');

function target(rpx) {
  if (rpx <= 22) return 24;
  if (rpx <= 26) return 28;
  if (rpx <= 32) return 30;
  if (rpx <= 46) return 34;
  return 44;
}

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'miniprogram_npm') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.wxss')) files.push(p);
  }
})(MP);

const tally = {};
let total = 0;
let changedFiles = 0;

for (const f of files) {
  let src = fs.readFileSync(f, 'utf8');
  const before = src;
  src = src.replace(/font-size:\s*([0-9.]+)rpx/g, (m, num) => {
    const v = parseFloat(num);
    const t = target(v);
    const key = `${v}→${t}`;
    tally[key] = (tally[key] || 0) + 1;
    total++;
    if (v === t) return m;
    return `font-size: ${t}rpx`;
  });
  if (src !== before) {
    changedFiles++;
    if (WRITE) fs.writeFileSync(f, src, 'utf8');
  }
}

console.log('映射统计：');
Object.entries(tally)
  .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
  .forEach(([k, n]) => console.log(`  ${k.padEnd(10)} ×${n}`));
console.log(`\n共 ${total} 处声明，涉及 ${changedFiles} 个文件`);
console.log(WRITE ? '已写入' : '预览（加 --write 落盘）');
