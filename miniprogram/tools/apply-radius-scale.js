// 第 3 期：圆角收敛到四档 + 胶囊。
//
// 原来有 6/8/10/12/14/16/18/20/22/24/28 共 11 档，和字号一样的问题：
// 相邻两档差 1rpx(0.5px)，肉眼分不出，却让每张卡片看起来都略微不同。
//
// 收敛到四档，每档有明确职责（与微信官方组件的圆角尺度对齐）：
//   8rpx   小控件：徽标、小方块
//   12rpx  行内元素：chip、输入框内层
//   16rpx  控件：按钮、输入框
//   20rpx  容器：卡片、面板
//   999rpx 胶囊：标签、开关（保持不变）
//
// 用法：node miniprogram/tools/apply-radius-scale.js [--write]
const fs = require('fs');
const path = require('path');

const MP = path.resolve(__dirname, '..');
const WRITE = process.argv.includes('--write');

function target(rpx) {
  if (rpx >= 900) return null; // 胶囊，不动
  if (rpx <= 10) return 8;
  if (rpx <= 14) return 12;
  if (rpx <= 18) return 16;
  if (rpx <= 22) return 20;
  return 24; // 24-28 → 24，留给大面板/弹层
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

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const out = src.replace(/border-radius:\s*([0-9]+)rpx/g, (m, n) => {
    const v = parseInt(n, 10);
    const t = target(v);
    if (t === null) return m; // 999rpx 保持
    const key = `${v}→${t}`;
    tally[key] = (tally[key] || 0) + 1;
    total++;
    return v === t ? m : `border-radius: ${t}rpx`;
  });
  if (out !== src && WRITE) fs.writeFileSync(f, out, 'utf8');
}

console.log('映射统计：');
Object.entries(tally)
  .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
  .forEach(([k, n]) => console.log(`  ${k.padEnd(12)} ×${n}`));
console.log(`\n共 ${total} 处`);
console.log(WRITE ? '已写入' : '预览（加 --write 落盘）');
