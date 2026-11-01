// 对比度体检：直接读 wxss 里的真实颜色，算 WCAG 对比度。
//
// 为什么要读文件而不是写死：#059669 这种值散在 8 个文件里，
// 写死的检查脚本会在改完之后继续报旧数字（踩过）。
//
// 用法：node miniprogram/tools/check-contrast.js
const fs = require('fs');
const path = require('path');

const MP = path.resolve(__dirname, '..');

function parse(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}
function lum(hex) {
  const f = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const [r, g, b] = parse(hex).map((v) => f(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const l1 = lum(a);
  const l2 = lum(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
/** 把前景色按 alpha 压到背景色上，得到「降低不透明度后」的真实视觉色 */
function blend(fg, bg, alpha) {
  const a = parse(fg);
  const b = parse(bg);
  const mix = a.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)));
  return '#' + mix.map((v) => v.toString(16).padStart(2, '0')).join('');
}

const app = fs.readFileSync(path.join(MP, 'app.wxss'), 'utf8');

// ⚠️ 必须分主题取 token。深色在 .page-wrap 里，浅色在 .page-wrap.theme-light 里，
// 两者的 --text-4 / --surface-* 完全不同。只取第一个匹配 = 只检查了深色主题，
// 浅色主题的对比度问题会被漏掉。
function themeTokens(sel) {
  const re = new RegExp(
    sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([\\s\\S]*?)\\}'
  );
  const m = app.match(re);
  const body = m ? m[1] : '';
  const get = (n) => {
    const v = body.match(new RegExp(`${n}:\\s*(#[0-9a-fA-F]{3,8})`));
    return v ? v[1] : null;
  };
  return {
    text1: get('--text-1'),
    text2: get('--text-2'),
    text3: get('--text-3'),
    text4: get('--text-4'),
    s0: get('--surface-0'),
    s1: get('--surface-1'),
    s3: get('--surface-3'),
    heroBg: get('--hero-bg'),
    heroStrong: get('--hero-text-strong'),
    heroBody: get('--hero-text-body'),
    heroWeak: get('--hero-text-weak'),
    disBg: get('--disabled-bg'),
    disText: get('--disabled-text'),
    disBorder: get('--disabled-border'),
  };
}

function btnBg() {
  const m = app.match(/\.btn-primary\s*\{[^}]*background(?:-color)?:\s*(#[0-9a-fA-F]{3,8})/);
  return m ? m[1] : null;
}

const BG = btnBg();

function audit(label, t) {
  const pairs = [
    ['#ffffff', BG, `btn-primary 白字 / 实底 ${BG}`],
    [t.text1, t.s1, `--text-1 / 卡片`],
    [t.text2, t.s1, `--text-2 / 卡片`],
    [t.text3, t.s1, `--text-3 / 卡片`],
    [t.text4, t.s1, `--text-4 / 卡片`],
    [t.text4, t.s0, `--text-4 / 页面底`],
    [t.text3, t.s3, `--text-3 / 输入框底`],
    // 禁用态：现在用专用 token，而不是整体 opacity
    [t.disText, t.disBg, `禁用按钮字 / 底`],
    // 欢迎条三处文字各自对 hero 底
    [t.heroStrong, t.heroBg, `hero 日期字 / hero 底`],
    [t.heroBody, t.heroBg, `hero 问候字 / hero 底`],
    [t.heroWeak, t.heroBg, `hero 辅助字 / hero 底`],
  ];
  let fail = 0;
  console.log(`\n【${label}】`);
  for (const [fg, bg, name] of pairs) {
    if (!fg || !bg) {
      console.log(`  ⚠️  ${name}：取不到色值`);
      fail++;
      continue;
    }
    const r = ratio(fg, bg);
    const ok = r >= 4.5;
    if (!ok) fail++;
    console.log(`  ${ok ? '✅' : '❌'} ${r.toFixed(2).padStart(5)}:1  ${name}`);
  }
  return fail;
}

const fail =
  audit('深色主题（默认）', themeTokens('.page-wrap')) +
  audit('浅色主题 theme-light', themeTokens('.page-wrap.theme-light'));

console.log(fail ? `\n  ❌ 共 ${fail} 组低于 AA 4.5:1` : '\n  ✅ 两套主题全部达到 WCAG AA 4.5:1');
process.exit(fail ? 1 : 0);
