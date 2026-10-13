// 检查 WXML 里的 {{item.xxx}} 是否真的对应数据里存在的字段。
//
// 为什么需要这个：合并页的 WXML 是 prefix-wxml.js 机械生成的，
// 生成器如果误伤嵌套字段（把 item.meal 变成 item.diet_meal），
// 小程序不会报错 —— 只是渲染成空白。这类 bug 只能靠静态检查抓。
//
// 做法：不按「wx:for 的集合名」去猜（那样会把整份文件的 item.* 都算到
// 每个集合头上，噪音极大）。改为**按作用域**：
//   1. 找出每个 wx:for 所在的元素区间；
//   2. 只取该区间内的 item.xxx；
//   3. 展开集合名的来源：
//        · 页面 data 里的字面量数组 → 直接取元素键
//        · setData 里赋的值 → 回溯到产生它的表达式/函数
//   4. 判断字段是否出现过。找不到就报「可疑」，人工确认。
//
// 用法: node tools/check-item-fields.js <小程序目录>

const fs = require('fs');
const path = require('path');

const MP = process.argv[2] || path.join(__dirname, '..');

/** 把 WXML 按标签配对，找出每个 wx:for 元素的 [start, end) 区间 */
function forScopes(src) {
  const scopes = [];
  const stack = [];
  const tagRe = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
  let m;
  while ((m = tagRe.exec(src))) {
    const [, closing, tag, attrs, selfClose] = m;
    if (closing) {
      const top = stack.pop();
      if (top) {
        top.end = m.index + m[0].length;
        if (top.coll) scopes.push(top);
      }
      continue;
    }
    const node = { start: m.index, end: src.length, coll: null, tag };
    const fm = /wx:for="\{\{\s*([^}]+?)\s*\}\}"/.exec(attrs);
    if (fm) node.coll = fm[1].trim();
    if (selfClose) {
      if (node.coll) { node.end = m.index + m[0].length; scopes.push(node); }
    } else {
      stack.push(node);
    }
  }
  return scopes;
}

/** 取一个 JS 文件里所有 `data: { ... }` 的字面量键 */
function topLevelKeys(body) {
  return [...body.matchAll(/(?:^|[,{[\s])([a-zA-Z_$][\w$]*)\s*:/g)].map((x) => x[1]);
}

/** 判断某个字段名在页面 JS 里是否出现过（作为对象键或属性访问） */
function fieldExists(js, field) {
  const f = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\w$.'"])${f}\\s*:`).test(js)
    || new RegExp(`\\.${f}\\b`).test(js)
    || new RegExp(`['"]${f}['"]`).test(js);
}

let problems = 0;
const dirs = fs.readdirSync(path.join(MP, 'pages'), { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => d.name);

for (const name of dirs) {
  const wxmlPath = path.join(MP, 'pages', name, name + '.wxml');
  const jsPath = path.join(MP, 'pages', name, name + '.js');
  if (!fs.existsSync(wxmlPath) || !fs.existsSync(jsPath)) continue;

  const src = fs.readFileSync(wxmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  const scopes = forScopes(src);

  const bad = new Set();
  for (const sc of scopes) {
    // 嵌套的 wx:for 会重复计数，用 Set 去重即可
    const inner = src.slice(sc.start, sc.end);
    const names = new Set([...inner.matchAll(/\bitem\.([a-zA-Z_$][\w$]*)/g)].map((x) => x[1]));
    for (const f of names) {
      if (!fieldExists(js, f)) bad.add(`${sc.coll} → item.${f}`);
    }
    // 带页面前缀的 item.xxx_yyy 一定可疑：说明生成器误伤了嵌套字段
    const prefixed = new Set([
      ...inner.matchAll(/\bitem\.((?:diet|run|health|todos|assignments)_\w+)/g),
    ].map((x) => x[1]));
    for (const f of prefixed) bad.add(`⚠️ 疑似误加前缀: item.${f}`);
  }

  if (bad.size) {
    problems += bad.size;
    console.log(`  ⚠️  ${name}`);
    [...bad].sort().forEach((b) => console.log('        ' + b));
  }
}

if (problems) {
  console.log(`\n  共 ${problems} 处可疑引用，需人工确认。`);
} else {
  console.log('  ✅ 所有 {{item.xxx}} 都能在页面 JS 里找到对应字段');
}
