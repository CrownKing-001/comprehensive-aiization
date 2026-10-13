// 临时探针：复现 prefix-wxml 把「循环项字段」误加前缀的问题。
// 用法: node tools/_tmp_prefix_probe.js
// prefix-wxml.js 在模块加载时读 process.argv[2] 当小程序目录，这里补上
if (!process.argv[2]) process.argv[2] = require('path').join(__dirname, '..');
const { prefixWxml, dataKeysOf } = require('./prefix-wxml.js');

const PREFIXES = ['diet_', 'run_', 'health_', 'todos_', 'assignments_'];

for (const p of ['diet', 'run', 'health', 'todos', 'assignments']) {
  const out = prefixWxml(p, { stripWrapper: true });
  const keys = dataKeysOf(p);
  const re = new RegExp('\\b(?:item|it|index)\\.((?:' + PREFIXES.join('|') + ')[A-Za-z0-9_]+)', 'g');
  const hits = [...new Set([...out.matchAll(re)].map((m) => m[1]))];
  console.log('[' + p + '] page data keys: ' + keys.join(', '));
  console.log('   wrongly prefixed nested fields: ' + (hits.length ? hits.join(', ') : '(none)'));
  for (const h of hits) {
    const bare = h.replace(/^[a-z]+_/, '');
    console.log('      ' + h + '  -> should be "' + bare + '"  (bare name IS a page data key: ' + keys.includes(bare) + ')');
  }
}
