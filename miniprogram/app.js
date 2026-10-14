// 应用入口：装载数据 → 启动全局 store。
const { store } = require('./store/store');
const { applyWindowTheme } = require('./utils/theme');

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

    // 窗口底色 / 导航栏跟着主题走（app.json 里那份是深色的静态兜底）。
    // 放在 hydrate 之后，这样启动时就能直接用上用户上次选的主题。
    applyWindowTheme(store.shape.settings.theme);
    // 主题可能在「设置」里改，也可能被导入的备份改掉，统一在这里跟。
    // applyWindowTheme 内部有去重，重复调用不会白跑。
    store.subscribe(() => applyWindowTheme(store.shape.settings.theme));
  },
});
