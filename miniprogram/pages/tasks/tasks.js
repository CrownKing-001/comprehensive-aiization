// 待办 · 作业（合并页）。
//
// 为什么合并：微信 tabBar 硬上限 5 个，原来「待办」和「作业」各占一个，
// 就没位置放「健康」了。
//
// 实现方式：这个页面不重复实现业务逻辑，而是把 todos 和 assignments
// 两个模块的 Page 定义拼在一起，用顶部分段控件切换 —— 每个子模块仍是
// 原来那一份代码（各自的增删改、筛选、统计都在），只是挂到同一个实例上。
// 机制见 utils/tabHost.js。

const { buildHost } = require('../../utils/tabHost');

Page(
  buildHost({
    base: __dirname,
    segments: [
      { id: 'todos', label: '待办', icon: '✅' },
      { id: 'assignments', label: '作业', icon: '📚' },
    ],
    modules: {
      todos: { path: '../todos/todos.js', label: '待办' },
      assignments: { path: '../assignments/assignments.js', label: '作业' },
    },
  })
);
