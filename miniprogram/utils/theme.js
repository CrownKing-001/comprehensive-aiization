// 「主题」在小程序里其实分两半，必须一起换，否则会露出破绽：
//
//   1) 页面内部 —— .page-wrap 上挂 theme-light 切换 CSS 变量，各页面 refresh() 时自己加。
//   2) 小程序外壳 —— 窗口底色和导航栏。这两个写在 app.json 的 window 里，是编译期静态值，
//      运行时改不了配置，只能用 wx.setBackgroundColor / wx.setNavigationBarColor 去改。
//
// 第 2 半以前没人管，于是浅色主题下外壳一直是深色：切 tab 时新页面先画一帧外壳
// （#12161d 深色窗口底 + 深色导航栏）再画内容（浅色），看上去就是「整屏黑闪一下」。
//
// 另外 app.wxss 里 page 不再写死背景色 —— page 是根节点，写死就等于把窗口底色的
// 一半又钉回深色了。page 留空，颜色由 app.json 的 backgroundColor 兜底，
// 运行时再由下面这两个 API 按主题覆盖。

const SHELL = {
  dark: { bg: '#12161d', nav: '#151a21', front: '#ffffff' },
  light: { bg: '#f8fafc', nav: '#ffffff', front: '#000000' },
};

// 记住上次真正应用过的主题：store 的订阅者每次数据变化都会回调，
// 没必要每次都去调两个原生 API。
let applied = null;

function applyWindowTheme(theme) {
  const key = theme === 'light' ? 'light' : 'dark';
  if (applied === key) return key;
  const c = SHELL[key];

  try {
    wx.setBackgroundColor({
      backgroundColor: c.bg,
      backgroundColorTop: c.bg,
      backgroundColorBottom: c.bg,
    });
  } catch (e) {
    // 个别基础库/平台没有这个 API，忽略即可：只是少一层保险，
    // 页面自己有底色，不写也不至于看不见内容。
  }

  try {
    // frontColor 微信只接受 #ffffff / #000000 两个值，别改成别的颜色。
    wx.setNavigationBarColor({ frontColor: c.front, backgroundColor: c.nav });
  } catch (e) {
    // 同上
  }

  applied = key;
  return key;
}

module.exports = { applyWindowTheme, SHELL };
