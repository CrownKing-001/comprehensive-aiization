// 选择器体检：wxss 里写的类名，是不是真的在对应 wxml 里存在。
//
// 为什么需要：写浅色主题覆盖时，我按记忆写了 `.pin-del`，
// 而真实类名是 `.pin-x`。这类错误**不会报错**——CSS 只是静静地不生效，
// 界面照旧是坏的，而「我加了覆盖」看起来像已经修好了。
//
// 用法：node miniprogram/tools/check-selectors.js
const fs = require('fs');
const path = require('path');

const MP = path.resolve(__dirname, '..');
const IGNORE = new Set(['page-wrap', 'theme-light']); // 来自 app.wxss / 根节点

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'miniprogram_npm' || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.wxss')) out.push(p);
  }
  return out;
}

// 全局 wxss 里的类名集合（这些在任何页面都能用）
const globalCss = fs.readFileSync(path.join(MP, 'app.wxss'), 'utf8');
const globalClasses = new Set();
for (const m of globalCss.matchAll(/\.([a-zA-Z][\w-]*)/g)) globalClasses.add(m[1]);

let problems = 0;
let checked = 0;

// tabHost 宿主页会把自己的 wxss 作用到所有被合并的子模块 wxml 上
// （tasks.wxss 里就有给 assignments 用的 .course-stat-*）。
// 所以对宿主页，必须把子模块的 wxml 一起算进来，否则全是误报。
function hostExtraWxml(wxssPath) {
  const jsPath = wxssPath.replace(/\.wxss$/, '.js');
  if (!fs.existsSync(jsPath)) return [];
  const js = fs.readFileSync(jsPath, 'utf8');
  if (!/buildHost/.test(js)) return [];
  const out = [];
  for (const m of js.matchAll(/:\s*require\('(\.\.[^']+)'\)/g)) {
    const base = path.resolve(path.dirname(jsPath), m[1]);
    // require('../todos/def') → wxml 在 pages/todos/todos.wxml，
    // 所以先试同目录同名，再试同目录下的「目录名.wxml」。
    const dir = path.dirname(base);
    for (const cand of [base + '.wxml', path.join(dir, path.basename(dir) + '.wxml')]) {
      if (fs.existsSync(cand) && !out.includes(cand)) out.push(cand);
    }
  }
  return out;
}

for (const f of walk(MP)) {
  const wxmlPath = f.replace(/\.wxss$/, '.wxml');
  if (!fs.existsSync(wxmlPath)) continue;
  const css = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const wxmlFiles = [wxmlPath, ...hostExtraWxml(f)];
  // 同一页面的多个 wxml 合并成一份「出现过的类名」集合
  const wxml = wxmlFiles.map((p) => fs.readFileSync(p, 'utf8')).join('\n');

  // 收集 wxml 里出现过的所有 class 名（含 {{}} 里的条件类名）
  const present = new Set();
  for (const m of wxml.matchAll(/class="([^"]*)"/g)) {
    const raw = m[1];
    // 普通类名（class="a b c"）
    for (const c of raw.matchAll(/(?:^|\s)([a-zA-Z][\w-]*)/g)) present.add(c[1]);
    // 条件里的 'xxx' / "xxx"（class="a {{x ? 'b' : 'c'}}"）
    for (const c of raw.matchAll(/['"]([a-zA-Z][\w-]*)['"]/g)) present.add(c[1]);
    // 拼接的前半段：class="dot dot-{{item.dot}}" → 记录前缀 "dot-"
    for (const c of raw.matchAll(/([a-zA-Z][\w-]*-)\{\{/g)) present.add(c[1] + '*');
  }
  for (const m of wxml.matchAll(/\{\{[^}]*\}\}/g)) {
    for (const c of m[0].matchAll(/([a-zA-Z][\w-]*)/g)) present.add(c[1]);
  }

  const cssClasses = new Set();
  for (const m of css.matchAll(/\.([a-zA-Z][\w-]*)/g)) cssClasses.add(m[1]);

  for (const c of cssClasses) {
    checked++;
    if (IGNORE.has(c) || globalClasses.has(c) || present.has(c)) continue;
    // 动态拼接：wxml 里有 "dot-" 这样的前缀，就认为 dot-rose 等都可能出现
    let dyn = false;
    for (const p of present) {
      if (p.endsWith('*') && c.startsWith(p.slice(0, -1))) {
        dyn = true;
        break;
      }
    }
    if (dyn) continue;
    // 状态修饰符常由 JS 拼接，跳过
    if (/^is-|^has-|^d[1-6]$/.test(c)) continue;
    // 全局工具类（gap-*、mt-* 等）在 app.wxss 里或由数据给
    if (globalClasses.has(c)) continue;
    console.log(`  ❌ ${path.relative(MP, f)} 里的 .${c} 在 ${path.basename(wxmlPath)} 中找不到`);
    problems++;
  }
}

console.log(
  problems
    ? `\n  ❌ ${problems} 个选择器指向不存在的类名（CSS 不会报错，只是不生效）`
    : `  ✅ ${checked} 个选择器都能在 wxml 里找到对应类名`
);
process.exit(problems ? 1 : 0);
