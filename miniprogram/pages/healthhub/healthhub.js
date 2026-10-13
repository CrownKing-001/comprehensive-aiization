// 健康（合并页）：饮食 / 运动 / 体重作息。
//
// 用户要求把「健康」放进底部菜单，但 tabBar 上限 5 项、已经占满，
// 所以饮食、运动、体重这三个原本从总览进入的页面合成一个 tab。
// 子模块代码原样复用，机制见 utils/tabHost.js。

const { buildHost } = require('../../utils/tabHost');

Page(
  buildHost({
    base: __dirname,
    segments: [
      { id: 'diet', label: '饮食', icon: '🍚' },
      { id: 'run', label: '运动', icon: '🏃' },
      { id: 'health', label: '体重', icon: '⚖️' },
    ],
    modules: {
      diet: { path: '../diet/diet.js', label: '饮食' },
      run: { path: '../run/run.js', label: '运动' },
      health: { path: '../health/health.js', label: '体重作息' },
    },
  })
);
