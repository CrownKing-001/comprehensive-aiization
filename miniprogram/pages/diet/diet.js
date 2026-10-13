// 「diet」页面入口。
//
// ⚠️ 页面定义放在同目录的 ./def.js，而不是直接写在这里。
// 原因：小程序的打包器**不允许 require 另一个页面文件** ——
//   require('./pages/diet/diet')  → module 'pages/diet/diet.js' is not defined
// 而合并页要复用这份定义（见 utils/tabHost.js），
// 所以定义必须住在一个普通模块里，页面文件只负责注册。
const DEFINITION = require('./def');

Page(DEFINITION);