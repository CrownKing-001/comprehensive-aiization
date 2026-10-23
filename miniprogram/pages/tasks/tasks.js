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
    // 分享用：标题跟着当前分段变（待办 / 作业），见 utils/share.js
    shareKey: 'tasks',
    segments: [
      { id: 'todos', label: '待办', icon: '✅' },
      { id: 'assignments', label: '作业', icon: '📚' },
    ],
    modules: {
      todos: { path: '../todos/todos.js', label: '待办' },
      assignments: { path: '../assignments/assignments.js', label: '作业' },
    },
    // ⚠️ 必须用**字符串字面量**的 require —— 小程序的打包器只看字面量，
    // 动态拼出来的路径不会被打进包，运行时报 "module ... is not defined"，
    // 宿主页在求值阶段就抛异常、Page() 走不到，页面一片空白。
    // 详见 utils/tabHost.js 的 buildHost。
    loadDefs() {
      return {
        todos: require('../todos/def'),
        assignments: require('../assignments/def'),
      };
    },
  })
);
