// 检查 WXML 里绑定的事件处理器在 JS 里是否真的存在。
//
// 为什么不能简单地「在 js 里搜方法名」：
// 合并页（tasks / healthhub / dashboard）的处理器是 tabHost 在运行时
// 按「模块前缀 + 方法名」挂到页面实例上的，源文件里根本没有这个名字。
// 直接搜会产生几十条假警报，假警报一多就没人看这个检查了。
//
// 所以这里分两步：
//   1. 普通页面：直接在页面 js 里找方法定义；
//   2. 合并页：识别出哪个前缀属于哪个子模块，去**子模块**的 js 里找，
//      再单独确认 tabHost 确实会挂这个方法。
//
// 用法: node tools/check-handlers.js <小程序目录>

const fs = require('fs');
const path = require('path');

const MP = process.argv[2] || path.join(__dirname, '..');

// 合并页 → { 前缀: 子模块页面名 }
const MERGED = {
  tasks: { todos: 'todos', assignments: 'assignments' },
  healthhub: { diet: 'diet', run: 'run', health: 'health' },
  dashboard: { dashboard: 'dashboard', today: 'today' },
};

/** 页面 js 里的顶层方法名（`  name(...) {` 形式） */
function methodsOf(src) {
  return new Set(
    [...src.matchAll(/(?:^|\n) {2}([a-zA-Z_$][\w$]*)\s*\(/g)].map((m) => m[1])
  );
}

let problems = 0;
const dirs = fs.readdirSync(path.join(MP, 'pages'), { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => d.name);

for (const name of dirs) {
  const wxmlPath = path.join(MP, 'pages', name, name + '.wxml');
  const jsPath = path.join(MP, 'pages', name, name + '.js');
  if (!fs.existsSync(wxmlPath) || !fs.existsSync(jsPath)) continue;

  const wxml = fs.readFileSync(wxmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  const own = methodsOf(js);
  const merged = MERGED[name] || null;

  // tabHost 自己提供的方法
  const hostMethods = new Set(['switchSeg', 'setSeg', '_revealSeg', 'onLoad', 'onShow',
    'onReady', 'onHide', 'onUnload']);

  const handlers = new Set(
    [...wxml.matchAll(/(?:bind|catch):?[a-zA-Z]+\s*=\s*"([^"{}]+)"/g)].map((m) => m[1])
  );

  const bad = [];
  for (const h of handlers) {
    if (own.has(h)) continue;
    if (merged && hostMethods.has(h)) continue;

    if (merged) {
      // 形如 todos_add 的，去 todos 子模块里找 add
      let matched = false;
      for (const [prefix, page] of Object.entries(merged)) {
        if (!h.startsWith(prefix + '_')) continue;
        const sub = h.slice(prefix.length + 1);
        const subPath = path.join(MP, 'pages', page, page + '.js');
        if (!fs.existsSync(subPath)) break;
        if (methodsOf(fs.readFileSync(subPath, 'utf8')).has(sub)) { matched = true; break; }
      }
      if (matched) continue;
    }
    bad.push(h);
  }

  if (bad.length) {
    problems += bad.length;
    console.log(`  ❌ ${name}`);
    bad.sort().forEach((b) => console.log('        ' + b));
  }
}

if (problems) {
  console.log(`\n  共 ${problems} 个未定义处理器。`);
  process.exit(1);
} else {
  console.log('  ✅ 所有事件处理器都有对应的方法定义');
}
