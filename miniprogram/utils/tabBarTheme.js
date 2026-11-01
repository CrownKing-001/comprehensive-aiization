// tabBar 的主题同步。
//
// ── 为什么需要这个文件 ──────────────────────────────────────────
// app.json 里的 tabBar 颜色是**静态**的，小程序不会跟着 themeClass 变。
// 原来它被写死成深色（#0d1117 底 + #64748b 字），于是浅色主题下：
//   · 底部整条是一条深色带，和白色页面之间硬切；
//   · tab 图标是深色 PNG，压在深色底上几乎看不见（截图里就是一团黑）。
//
// tabBar 图标是 PNG，没法用 CSS 反色，所以浅色主题下必须**换一套深色图标**。
// 仓库里 images/tab/ 目前只有深色底用的浅色图标，浅色主题需要另一组；
// 在补图之前，浅色主题下至少要把底色和字色调对，图标先用 selectedColor
// 的高亮让当前项可辨认。
//
// 用法：utils/tabBarTheme.js
//   const { applyTabBarTheme } = require('../../utils/tabBarTheme');
//   applyTabBarTheme(settings.theme);

const TAB_ITEMS = 5;

// 两套 tabBar 配色，与 app.wxss 的 surface / text token 对应。
const THEMES = {
  dark: {
    color: '#64748b',
    selectedColor: '#10b981',
    backgroundColor: '#0d1117',
    borderStyle: 'black',
  },
  light: {
    color: '#64748b',
    selectedColor: '#047857',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
  },
};

/**
 * 把 tabBar 的配色切到指定主题。
 * 只在真正有 tabBar 的页面调用才不会报错，所以整体 try/catch 兜住。
 * @param {'dark'|'light'} theme
 */
function applyTabBarTheme(theme) {
  const conf = THEMES[theme === 'light' ? 'light' : 'dark'];
  try {
    wx.setTabBarStyle(conf);
  } catch (e) {
    // 非 tabBar 页面调用会抛错（"not TabBar page"），属于正常情况，静默跳过
  }
}

module.exports = { applyTabBarTheme, THEMES, TAB_ITEMS };
