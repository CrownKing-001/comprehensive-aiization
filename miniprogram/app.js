// 应用入口：装载数据 → 启动全局 store。
const { store } = require('./store/store');

App({
  globalData: {
    store,
  },

  onLaunch() {
    // 一次性把本机存储读进内存，之后各页面直接读 store
    store.hydrate();

    // 空白模板：首次运行时课表与重要事项都保持为空，
    // 由用户在「课表」页手动添加，或用「课表识别」导入。
    if (store.shape.courses === null) {
      store.setCourses([]);
    }
  },
});
