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

/**
 * 读出一个页面/子模块的方法集合。
 *
 * ⚠️ 子模块的定义现在住在同目录的 def.js 里（页面文件 <n>.js 只是
 * require('./def') + Page(DEFINITION) 的薄壳）。原因：小程序的打包器
 * 不允许 require 另一个页面文件，合并页要复用定义就必须让它住在普通模块里。
 * 详见 utils/tabHost.js。所以这里优先读 def.js，读不到再退回页面文件。
 */
function methodsOfModule(dir, name) {
  const def = path.join(MP, 'pages', dir, 'def.js');
  const p = path.join(MP, 'pages', dir, name + '.js');
  if (fs.existsSync(def)) return methodsOf(fs.readFileSync(def, 'utf8'));
  if (fs.existsSync(p)) return methodsOf(fs.readFileSync(p, 'utf8'));
  return new Set();
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
  const merged = MERGED[name] || null;
  // 合并页的宿主方法（switchSeg 等）写在页面 js 里，子模块方法在 def.js 里，
  // 两边都要算上；普通页面只有 def.js（或退回页面文件）。
  const own = new Set([...methodsOf(js), ...methodsOfModule(name, name)]);

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
        if (methodsOfModule(page, page).has(sub)) { matched = true; break; }
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
