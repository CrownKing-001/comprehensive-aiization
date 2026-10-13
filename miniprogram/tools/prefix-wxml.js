// 把子页面 WXML 改写成「带前缀」版本，供合并页使用。
//
// 合并页（pages/tasks、pages/healthhub）需要把多个页面的模板放进同一个文件。
// 每个子页面的 data 键和事件处理函数在宿主里都加了模块前缀
// （见 utils/tabHost.js），所以模板里的 {{xxx}} 和 bindtap="yyy" 也要同步加前缀。
//
// 用法: node tools/prefix-wxml.js <小程序目录> <子页面名> <输出文件> [--inject 后缀]
//
// 处理内容：
//   1. bind*/catch* 的处理函数名加前缀
//   2. {{ }} 里的根标识符加前缀（跳过 wx:for 的 item/index、字面量、item.* 属性）
//   3. 去掉最外层 <view class="page-wrap ..."> 包裹，只保留内容
//      —— 合并页自己有一层 page-wrap，嵌套两层会重复 padding

const fs = require('fs');
const path = require('path');

const MP = process.argv[2];

/** 取出一个页面 data 的键名 */
function dataKeysOf(pageName) {
  const src = fs.readFileSync(path.join(MP, 'pages', pageName, pageName + '.js'), 'utf8');
  const m = /\n  data:\s*\{([\s\S]*?)\n  \},/.exec(src);
  if (!m) return [];
  return [...m[1].matchAll(/(?:^|\n)\s{4}([a-zA-Z_$][\w$]*)\s*:/g)].map((x) => x[1]);
}

/** 取出一个页面的方法名 */
function methodsOf(pageName) {
  const src = fs.readFileSync(path.join(MP, 'pages', pageName, pageName + '.js'), 'utf8');
  return [...src.matchAll(/(?:^|\n)  ([a-zA-Z_$][\w$]*)\s*\(/g)].map((x) => x[1]);
}

// 页面天然带的东西，不加前缀
const NEVER = new Set(['themeClass', 'ready']);

function prefixWxml(pageName, opts) {
  opts = opts || {};
  const prefix = pageName + '_';
  const keys = new Set(dataKeysOf(pageName));
  const methods = new Set(methodsOf(pageName));

  let src = fs.readFileSync(path.join(MP, 'pages', pageName, pageName + '.wxml'), 'utf8');

  // 去掉最外层 page-wrap 包裹
  if (opts.stripWrapper) {
    src = src.replace(/^\s*<!--[\s\S]*?-->\s*/, ''); // 顶部注释
    src = src.replace(/<view class="page-wrap[^"]*"[^>]*>/, '');
    // 去掉与之配对的最后一个 </view>
    const last = src.lastIndexOf('</view>');
    if (last >= 0) src = src.slice(0, last) + src.slice(last + '</view>'.length);
    src = src.trim();
  }

  // 1. 事件处理函数加前缀
  src = src.replace(/((?:bind|catch):?[a-zA-Z]+\s*=\s*")([^"{}]+)(")/g, (all, a, name, c) => {
    const n = name.trim();
    if (!methods.has(n)) return all;
    return a + prefix + n + c;
  });

  // 2. {{ }} 里的根标识符加前缀
  src = src.replace(/\{\{([\s\S]*?)\}\}/g, (all, expr) => {
    // 先把字符串字面量挖出来占位，避免误伤
    const lits = [];
    let work = expr.replace(/'[^']*'|"[^"]*"/g, (s) => {
      lits.push(s);
      return '\u0000' + (lits.length - 1) + '\u0000';
    });
    // item.xxx / index.xxx 整体保留：item 是 wx:for 变量
    work = work.replace(/\b(item|index)\s*\.\s*[a-zA-Z_$][\w$]*/g, (s) => s.replace(/\./g, '\u0001'));
    // 给根标识符加前缀
    work = work.replace(/([a-zA-Z_$][\w$]*)/g, (name, _g, offset) => {
      const before = work.slice(0, offset);
      // 前面是点号说明它是属性名，不动
      if (/[\w$]\s*\.\s*$/.test(before)) return name;
      if (NEVER.has(name)) return name;
      if (name === 'item' || name === 'index') return name;
      if (['true', 'false', 'null', 'undefined'].includes(name)) return name;
      if (!keys.has(name)) return name;
      return prefix + name;
    });
    // 还原
    work = work.replace(/\u0001/g, '.');
    work = work.replace(/\u0000(\d+)\u0000/g, (_s, i) => lits[+i]);
    return '{{' + work + '}}';
  });

  return src;
}

module.exports = { prefixWxml, dataKeysOf, methodsOf };

// CLI
if (require.main === module) {
  const pageName = process.argv[3];
  const outFile = process.argv[4];
  const stripWrapper = process.argv.includes('--strip-wrapper');
  const out = prefixWxml(pageName, { stripWrapper });
  fs.writeFileSync(outFile, out, 'utf8');
  console.log(`已生成 ${outFile}（${out.split('\n').length} 行）`);
}
