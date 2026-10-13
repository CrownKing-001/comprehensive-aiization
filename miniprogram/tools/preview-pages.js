// 把小程序页面静态渲染成 HTML + PNG，用于在无法截取模拟器时目视核对布局。
//
// 背景：微信开发者工具的自动化截图需要 IDE 安全设置里的 token，
// 该 token 只能在图形界面里手动开启并复制，Agent 无法获取。
// 因此这里用「WXML/WXSS → HTML → 无头 Edge 截图」的方式做近似核对。
//
// 已知近似项（不代表真实渲染）：
//   · {{表达式}} 一律渲染成占位符 ··
//   · wx:for 不展开（只渲染一次，拿不到循环项）
//   · wx:if 只保留主分支，wx:else 分支整段丢弃
//   · rpx 按 750rpx=375px 折算成 px
//   · scroll-view 不滚动，canvas 用占位块
//
// 用法: node tools/preview-pages.js <小程序目录> <输出目录>
const fs = require('fs'), path = require('path');
const MP = process.argv[2], OUT = process.argv[3];

const rpx = (css) => css.replace(/(\d+(?:\.\d+)?)rpx/g, (_, n) => (parseFloat(n) * 0.5).toFixed(3).replace(/\.?0+$/, '') + 'px');

function dropElseBlocks(s) {
  let out = s, guard = 0;
  while (true) {
    const m = /<block\s+wx:else\s*>/.exec(out);
    if (!m || ++guard > 80) break;
    let depth = 0, end = -1;
    const re = /<block\b[^>]*>|<\/block>/g;
    re.lastIndex = m.index;
    let t;
    while ((t = re.exec(out))) {
      if (t[0].startsWith('</')) { if (--depth === 0) { end = re.lastIndex; break; } }
      else depth++;
    }
    if (end < 0) break;
    out = out.slice(0, m.index) + out.slice(end);
  }
  return out;
}

function convert(wxml, opts) {
  opts = opts || {};
  let h = wxml;
  h = h.replace(/\{\{([\s\S]*?)\}\}/g, (_, e) => {
    const m = /^'([^']*)'$/.exec(e.trim());
    return m ? '\u00a7' + m[1] + '\u00a7' : '\u00a7\u00b7\u00b7\u00a7';
  });
  h = h.replace(/<!--[\s\S]*?-->/g, '');
  h = h.replace(/<input\b[^>]*?\/?>/g, '<span class="ph-inline">［输入框］</span>');
  h = h.replace(/<textarea\b[^>]*?><\/textarea>/g, '<div class="ph-box">［多行输入］</div>');
  h = h.replace(/<switch\b[^>]*?\/?>/g, '<span class="ph-switch">◯</span>');
  h = h.replace(/<canvas\b[^>]*?><\/canvas>/g, '<div class="ph-canvas">［Canvas 图表］</div>');
  h = h.replace(/<canvas\b[^>]*?\/>/g, '<div class="ph-canvas">［Canvas 图表］</div>');
  h = dropElseBlocks(h);
  // 合并页（tasks / healthhub）用 <block wx:if="{{seg === 'xxx'}}"> 切换分段。
  // 静态预览只渲染 keepSeg 指定的那一段，否则三段会叠在一起看不清。
  if (opts.keepSeg) {
    h = h.replace(/<block\s+wx:if="\{\{\s*seg\s*===\s*'([^']+)'\s*\}\}"\s*>/g, (all, name) =>
      name === opts.keepSeg ? '<block>' : '<block style="display:none">');
    // 上面保留了 wx:else（体重那段），若不在预览范围内也藏起来
    h = h.replace(/<block\s+style="display:none">/g, '<block style="display:none">');
  }
  h = h.replace(/<(view|text|block|scroll-view|picker)\b([^<>]*)>/g, (_, raw, attrs) => {
    const tag = { view:'div', 'scroll-view':'div', picker:'div', text:'span', block:'' }[raw] ?? 'div';
    if (!tag) return '';
    const cm = /class\s*=\s*"([^"]*)"/.exec(attrs);
    const sm = /style\s*=\s*"([^"]*)"/.exec(attrs);
    const cls = cm ? cm[1].replace(/\u00a7/g, '').trim() : '';
    const sty = sm ? sm[1].trim() : '';
    const a = [];
    if (cls) a.push(`class="${cls}"`);
    if (sty) a.push(`style="${sty}"`);
    return a.length ? `<${tag} ${a.join(' ')}>` : `<${tag}>`;
  });
  h = h.replace(/<\/view>/g, '</div>').replace(/<\/text>/g, '</span>')
       .replace(/<\/scroll-view>/g, '</div>').replace(/<\/picker>/g, '</div>').replace(/<\/block>/g, '');
  return h.replace(/\u00a7/g, '');
}

const appCss = rpx(fs.readFileSync(path.join(MP, 'app.wxss'), 'utf8'));
const dirs = fs.readdirSync(path.join(MP, 'pages')).filter(d => fs.statSync(path.join(MP, 'pages', d)).isDirectory());
fs.mkdirSync(OUT, { recursive: true });

// 合并页要分段预览，否则三段叠在一起看不清
const SEG_OF = {
  tasks: ['todos', 'assignments'],
  healthhub: ['diet', 'run', 'health'],
};

// tabBar 文案从 app.json 读，避免和真实配置不一致
let TAB = ['总览', '今日', '课表', '待办·作业', '健康'];
try {
  const aj = JSON.parse(fs.readFileSync(path.join(MP, 'app.json'), 'utf8'));
  if (aj.tabBar && Array.isArray(aj.tabBar.list) && aj.tabBar.list.length) {
    TAB = aj.tabBar.list.map((t) => t.text);
  }
} catch (e) { /* 读不到就用默认 */ }

let n = 0;
for (const name of dirs) {
  const wp = path.join(MP, 'pages', name, name + '.wxml');
  const sp = path.join(MP, 'pages', name, name + '.wxss');
  if (!fs.existsSync(wp)) continue;
  const raw = fs.readFileSync(wp, 'utf8');
  const pageCss = fs.existsSync(sp) ? rpx(fs.readFileSync(sp, 'utf8')) : '';
  const segs = SEG_OF[name] || [null];

  for (const seg of segs) {
    const body = convert(raw, { keepSeg: seg });
    const title = seg ? `${name} · ${seg}` : name;
    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title} 预览</title><style>
html,body{margin:0;padding:0;background:#0b0e13;}
body{display:flex;justify-content:center;padding:20px 10px;}
.phone{width:375px;background:#12161d;border-radius:18px;overflow:hidden;
  box-shadow:0 12px 48px rgba(0,0,0,.6);display:flex;flex-direction:column;}
.statusbar{height:24px;background:#151a21;color:#64748b;font-size:11px;display:flex;
  align-items:center;justify-content:center;flex-shrink:0;}
.navbar{height:40px;background:#151a21;color:#e2e8f0;font-size:14px;font-weight:500;
  display:flex;align-items:center;justify-content:center;flex-shrink:0;border-bottom:1px solid #232a34;}
.screen{flex:1;}
.tabbar{height:48px;background:#0d1117;border-top:1px solid #232a34;flex-shrink:0;
  display:flex;align-items:center;justify-content:space-around;color:#64748b;font-size:10px;}
.tabbar .on{color:#10b981;}
*{box-sizing:border-box;}
.ph-inline{display:inline-block;background:#1e242e;border:1px solid #2b333f;border-radius:6px;
  padding:5px 10px;color:#475569;font-size:12px;}
.ph-box{background:#1e242e;border:1px solid #2b333f;border-radius:8px;padding:14px;color:#475569;font-size:12px;}
.ph-switch{display:inline-block;width:40px;height:22px;background:#2b333f;border-radius:11px;
  text-align:center;color:#64748b;font-size:11px;line-height:22px;}
.ph-canvas{height:140px;background:#1a1f28;border:1px dashed #333c49;border-radius:8px;
  display:flex;align-items:center;justify-content:center;color:#475569;font-size:12px;}
${appCss}
${pageCss}
</style></head><body><div class="phone">
<div class="statusbar">9:41</div>
<div class="navbar">大学日程 · ${title}</div>
<div class="screen">
${body}
</div>
<div class="tabbar">${TAB.map((t, i) => `<span class="${i === 3 && name === 'tasks' || i === 4 && name === 'healthhub' ? 'on' : ''}">${t}</span>`).join('')}</div>
</div></body></html>`;
    const fname = seg ? `${name}-${seg}` : name;
    fs.writeFileSync(path.join(OUT, fname + '.html'), html, 'utf8');
    n++;
  }
}
console.log('生成 ' + n + ' 个页面预览 → ' + OUT);
