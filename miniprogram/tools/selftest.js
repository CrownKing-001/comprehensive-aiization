// 验收自测：在 Node 里模拟小程序运行环境，逐项检查功能是否真的可用。
//
// 为什么需要它：微信开发者工具的模拟器截图需要一个只能从 IDE 图形界面
// 获取的 token（见 tools/README.md），所以「点一下看看」这条路走不通。
// 这个脚本用假的 wx / App / Page 把 app.onLaunch 和各个页面的生命周期
// 真跑一遍，能抓到「页面加载后 data 是空的」「点了按钮数据没变」这类问题。
//
// ★ 关键：必须先跑 app.js 的 onLaunch。
//   store.ready 初值是 false，只有 app.onLaunch 里调用的 store.hydrate()
//   会把它置为 true；而每个页面都是 `if (store.ready) this.refresh()`。
//   漏掉这一步的话所有页面都会停在「没刷新」状态，看起来像全盘崩了 ——
//   这是测试脚手架的坑，不是小程序的问题，已经踩过一次。
//
// 用法: node tools/selftest.js <小程序目录>

const path = require('path');
const MP = process.argv[2] || path.join(__dirname, '..');

// ── 假的微信运行环境 ──────────────────────────────────
const mem = {};
// 模拟剪贴板：备份导出写进来、导入从这里读，这样能真的验一遍来回
let clipboard = '';
global.wx = {
  getStorageSync: (k) => (mem[k] === undefined ? '' : mem[k]),
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: (k) => { delete mem[k]; },
  getStorageInfoSync: () => ({ keys: Object.keys(mem), currentSize: 1, limitSize: 10240 }),
  clearStorageSync: () => { for (const k of Object.keys(mem)) delete mem[k]; },
  showToast: () => {},
  showModal: (o) => o.success && o.success({ confirm: true }),
  setClipboardData: (o) => { clipboard = String(o.data === undefined ? '' : o.data); o.success && o.success(); },
  getClipboardData: (o) => o.success && o.success({ data: clipboard }),
  navigateTo: () => {},
  switchTab: () => {},
  setNavigationBarTitle: () => {},
  getWindowInfo: () => ({ pixelRatio: 2, windowWidth: 375 }),
  createSelectorQuery: () => ({
    in: () => ({ select: () => ({ fields: () => ({ exec: (cb) => cb([{ node: null }]) }) }) }),
  }),
};

// ── 启动 app ──────────────────────────────────────────
let appDef = null;
global.App = (d) => { appDef = d; };
require(path.join(MP, 'app.js'));
if (appDef && appDef.onLaunch) appDef.onLaunch();

const store = require(path.join(MP, 'store/store.js')).store;
if (!store.ready) {
  console.error('✗ app.onLaunch 之后 store.ready 仍是 false，测试环境有问题');
  process.exit(1);
}

// ── 造一个可交互的页面实例 ─────────────────────────────
function loadPage(name) {
  let def = null;
  global.Page = (d) => { def = d; };
  const f = path.join(MP, 'pages', name, name + '.js');
  delete require.cache[require.resolve(f)];
  require(f);
  return Object.assign({}, def, {
    data: JSON.parse(JSON.stringify(def.data || {})),
    setData(patch, cb) {
      for (const k of Object.keys(patch)) {
        const m = /^(\w+)\[(\d+)\]\.(\w+)$/.exec(k);
        if (m) { this.data[m[1]][+m[2]][m[3]] = patch[k]; continue; }
        if (k.includes('.')) {
          const q = k.split('.');
          let t = this.data;
          for (let i = 0; i < q.length - 1; i++) t = t[q[i]];
          if (t) t[q[q.length - 1]] = patch[k];
          continue;
        }
        this.data[k] = patch[k];
      }
      if (typeof cb === 'function') cb();
    },
  });
}
const ev = (dataset, value) => ({ currentTarget: { dataset }, detail: { value }, target: { dataset } });

// ── 断言 ──────────────────────────────────────────────
let ok = 0, bad = 0;
const T = (name, cond, extra) => {
  if (cond) { console.log('  ✅ ' + name); ok++; }
  else { console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); bad++; }
};
const section = (t) => console.log('\n' + t);

// ══ 1. 课表增删改 ══
section('[1] 课表增删改');
{
  const p = loadPage('courses'); p.onLoad();
  T('页面加载', p.data.ready === true);
  const n0 = store.shape.courses.length;
  p.startAdd();
  p.onFormInput(ev({ field: 'name' }, '高等数学'));
  p.onFormInput(ev({ field: 'place' }, 'A101'));
  p.onWeeksInput(ev({}, '1-16'));
  p.onDayChange(ev({}, '0'));
  p.save();
  T('新增课程', store.shape.courses.length === n0 + 1);
  if (store.shape.courses.length > n0) {
    const c = store.shape.courses[store.shape.courses.length - 1];
    p.startEdit(ev({ id: c.id }));
    p.onFormInput(ev({ field: 'name' }, '高等数学(改)'));
    p.save();
    T('修改课程', store.shape.courses.some((x) => x.name === '高等数学(改)'));
    p.remove(ev({ id: c.id }));
    T('删除课程', store.shape.courses.length === n0);
  }
  p.onUnload();
}

// ══ 2. 文字解析导入 ══
section('[2] 文字解析导入');
{
  const tp = require(path.join(MP, 'utils/textParse.js'));
  T('课表文字解析', tp.parseTimetableText('周一\n高等数学，1-2节（08:00-09:40），A101，1-16周').courses.length === 1);
  const cc = tp.parseCalendarText('2026年11月15日 期中考试\n2027年1月4日 期末考试');
  T('校历文字解析', cc.events.length === 2);
  T('  期中考试已支持', cc.events.some((e) => e.title === '期中考试'));
  T('  期末未被期中吞掉', cc.events.some((e) => e.title === '期末考试周'));
}

// ══ 3. 运动打卡 ══
section('[3] 运动打卡');
{
  const p = loadPage('run'); p.onLoad();
  const d0 = store.shape.run.length;
  p.add(ev({ type: '跑步' }));
  T('打卡 +1', store.shape.run.length === d0 + 1);
  T('  面板同步', p.data.done === store.shape.run.length);
  p.undo();
  T('撤销', store.shape.run.length === d0);
  p.onUnload();
}

// ══ 4. 饮食记录 ══
section('[4] 饮食记录');
{
  const fd = require(path.join(MP, 'data/foods.js'));
  T('食物库 ≥150 种', fd.FOODS.length >= 150, fd.FOODS.length + ' 种');
  T('套餐 11 个', fd.TEMPLATES.length === 11);
  const p = loadPage('diet'); p.onLoad();
  T('页面加载', p.data.ready === true);
  if (p.recognizeText) {
    p.setData({ text: '2个鸡蛋 一碗粥 牛奶一盒' });
    p.recognizeText();
    T('自然语言识别 3 项', (p.data.picked || []).length === 3, (p.data.picked || []).length + ' 项');
    T('  蛋白合计已算', p.data.pickedProtein > 0, p.data.pickedProtein + 'g');
    T('  热量合计已算', p.data.pickedCalories > 0, p.data.pickedCalories + 'kcal');
  }
  p.onUnload();
}

// ══ 5. 体重作息 ══
section('[5] 体重作息');
{
  store.setHealth([{ date: '2026-10-13', weight: 70, sleep: 7.5, steps: 8000 }]);
  const p = loadPage('health'); p.onLoad();
  T('页面加载', p.data.ready === true);
  T('  统计已生成', Array.isArray(p.data.stats));
  p.onUnload();
}

// ══ 6. 重要事项 ══
section('[6] 重要事项');
{
  store.setMilestones([{ id: 'm1', title: '期末考试', date: '2027-01-04', category: '考试', emoji: '📚', remindDaysBefore: 7, done: false, checklist: [] }]);
  const p = loadPage('milestones'); p.onLoad();
  T('页面加载', p.data.ready === true);
  T('  列表读到 1 条', (p.data.list || []).length === 1, (p.data.list || []).length + ' 条');
  p.onUnload();
}

// ══ 7. 智能分析 ══
section('[7] 智能分析');
{
  store.setCourses([{ id: 'c1', day: 1, name: '高数', start: '08:00', end: '09:40', place: 'A101', weeks: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16] }]);
  const p = loadPage('analysis'); p.onLoad();
  T('页面加载', p.data.ready === true);
  T('  识别到课程', p.data.hasCourses === true);
  T('  热力图有数据', (p.data.heatRows || []).length > 0, (p.data.heatRows || []).length + ' 行');
  p.onUnload();
}

// ══ 8. 设置 ══
section('[8] 设置');
{
  const p = loadPage('settings'); p.onLoad();
  T('页面加载', p.data.ready === true);
  T('  存储占用文案', typeof p.data.usageText === 'string' && p.data.usageText.length > 0, p.data.usageText);
  p.onUnload();
}

// ══ 9. 备份导入导出 ══
section('[9] 备份导入导出');
{
  store.setTodos([{ id: 't1', title: '写作业', done: false }]);
  const dump = store.exportAll();
  T('导出产生数据', Object.keys(dump).length > 0, Object.keys(dump).length + ' 个键');
  store.resetAll();
  T('清空后为空', store.shape.todos.length === 0);
  store.importAll(dump);
  T('导入后完整恢复', store.shape.todos.length === 1 && store.shape.todos[0].title === '写作业');
}

// ══ 10. 全部 14 页可加载 ══
section('[10] 14 个页面加载');
{
  const names = ['dashboard','today','courses','todos','assignments','week','coursescan','calendaracademic','run','diet','health','milestones','analysis','settings'];
  for (const n of names) {
    const p = loadPage(n); p.onLoad();
    T(n, p.data.ready === true);
    p.onUnload();
  }
}

// ══ 11. 脏数据健壮性 ══
// 桌面版的备份是直接导入的，字段不一定齐全；手改过的 JSON 更是什么都可能缺。
// 这类数据曾经让 5 个页面白屏（todos 缺 priority、course 缺 weeks/start、
// assignment 缺 due），所以固定成回归用例。
section('[11] 脏数据不白屏');
{
  const errs = [];
  const origErr = console.error;
  console.error = (...a) => { errs.push(a.map(String).join(' ')); };

  const cases = [
    ['todo 缺 priority',      () => store.setTodos([{ id: 't1', text: '写作业', done: false }]), ['todos','dashboard','today']],
    ['course 缺 weeks',       () => store.setCourses([{ id: 'c1', day: 1, name: '高数', start: '08:00', end: '09:40' }]), ['courses','analysis','week','dashboard','today']],
    ['course 缺 start/end',   () => store.setCourses([{ id: 'c1', day: 3, name: '高数', weeks: [1,2,3] }]), ['courses','analysis','week','dashboard','today']],
    ['milestone 缺 date',     () => store.setMilestones([{ id: 'm1', title: '考试', done: false }]), ['milestones','dashboard','analysis']],
    ['assignment 缺 due',     () => store.setAssignments([{ id: 'a1', title: '实验报告', done: false }]), ['assignments','dashboard','today']],
    ['全是空对象',            () => { store.setTodos([{}]); store.setCourses([{}]); store.setAssignments([{}]); store.setMilestones([{}]); store.setHealth([{}]); },
                              ['dashboard','today','todos','courses','assignments','milestones','health','analysis','week']],
  ];

  for (const [label, mutate, pages] of cases) {
    store.resetAll();
    errs.length = 0;
    mutate();
    let threw = null;
    for (const n of pages) {
      try { const p = loadPage(n); p.onLoad(); p.onUnload(); }
      catch (e) { threw = n + ': ' + e.message; break; }
    }
    // 页面 refresh 的异常会被 store.notify 吞掉只打 console.error，所以也要查它
    const silent = errs.find((e) => /订阅回调出错/.test(e));
    T(label, !threw && !silent, threw || (silent ? silent.slice(0, 80) : ''));
  }

  console.error = origErr;
  store.resetAll();
}

// ══ 12. 合并页（tabHost 组合） ══
// 待办+作业、饮食+运动+体重 这两组页面是「把已有的 Page 定义拼起来」实现的
// （见 utils/tabHost.js），机制比普通页面复杂，单独测。
section('[12] 合并页');
{
  const { buildHost } = require(path.join(MP, 'utils/tabHost.js'));

  // 造一个和真机 Page 实例行为一致的替身
  function mount(def) {
    return Object.assign({}, def, {
      data: JSON.parse(JSON.stringify(def.data || {})),
      setData(patch, cb) {
        for (const k of Object.keys(patch)) {
          if (k.includes('.')) {
            const q = k.split('.');
            let t = this.data;
            for (let i = 0; i < q.length - 1; i++) t = t[q[i]];
            if (t) t[q[q.length - 1]] = patch[k];
            continue;
          }
          this.data[k] = patch[k];
        }
        if (typeof cb === 'function') cb();
      },
    });
  }

  // 载入合并页定义（页面用 Page() 注册，不 export，所以用收集器截获）
  function defOfPage(file) {
    let d = null;
    const saved = global.Page;
    global.Page = (x) => { d = x; };
    delete require.cache[require.resolve(file)];
    require(file);
    global.Page = saved;
    return d;
  }

  store.resetAll();
  const tasks = mount(defOfPage(path.join(MP, 'pages/tasks/tasks.js')));
  tasks.onLoad();

  T('待办·作业页 加载', tasks.data.ready === true);
  T('  默认停在待办', tasks.data.seg === 'todos');
  T('  两个模块的 data 都并入', Object.keys(tasks.data).some((k) => k.startsWith('todos_'))
    && Object.keys(tasks.data).some((k) => k.startsWith('assignments_')));

  // 两个模块的同名方法不能串台 —— 这是组合机制最容易错的地方
  T('  同名方法各自存在', typeof tasks.todos_add === 'function' && typeof tasks.assignments_add === 'function');
  tasks.setData({ todos_text: '交实验报告', todos_due: '2026-10-20' });
  tasks.todos_add.call(tasks);
  T('  待办新增生效', store.shape.todos.length === 1 && store.shape.todos[0].text === '交实验报告');
  tasks.setData({ assignments_title: '写论文', assignments_due: '2026-11-01' });
  tasks.assignments_add.call(tasks);
  T('  作业新增生效', store.shape.assignments.length === 1 && store.shape.assignments[0].title === '写论文');
  T('  互不干扰', store.shape.todos.length === 1 && store.shape.assignments.length === 1);
  T('  列表各自刷新', (tasks.data.todos_list || []).length === 1 && (tasks.data.assignments_list || []).length === 1);

  tasks.switchSeg(ev({ id: 'assignments' }));
  T('  分段切换到作业', tasks.data.seg === 'assignments');
  tasks.onUnload();

  store.resetAll();
  const hub = mount(defOfPage(path.join(MP, 'pages/healthhub/healthhub.js')));
  hub.onLoad();
  T('健康页 加载', hub.data.ready === true);
  T('  默认停在饮食', hub.data.seg === 'diet');
  T('  三个模块都并入',
    ['diet_', 'run_', 'health_'].every((p) => Object.keys(hub.data).some((k) => k.startsWith(p))));
  // 三个模块都有 refresh / save 之类的同名方法
  T('  同名方法各自存在',
    typeof hub.diet_refresh === 'function' && typeof hub.run_refresh === 'function' && typeof hub.health_refresh === 'function');
  hub.switchSeg(ev({ id: 'run' }));
  T('  切到运动', hub.data.seg === 'run');
  hub.switchSeg(ev({ id: 'health' }));
  T('  切到体重', hub.data.seg === 'health');
  hub.onUnload();
  store.resetAll();
}

// ══ 13. 导航完整性 ══
// tabBar 上限 5 项，所以「待办+作业」「饮食+运动+体重」做了合并页。
// 这里固定检查：菜单项数没超限、每项都有图标、所有页面要么在 tabBar
// 里、要么能从某处跳过去（否则用户永远进不去）。
section('[13] 导航完整性');
{
  const fs = require('fs');
  const appJson = JSON.parse(fs.readFileSync(path.join(MP, 'app.json'), 'utf8'));
  const tab = appJson.tabBar.list;
  const tabPaths = tab.map((t) => t.pagePath);

  T('tabBar 不超过 5 项', tab.length <= 5, tab.length + ' 项');
  T('  5 项都配了图标', tab.every((t) => t.iconPath && t.selectedIconPath));
  T('  图标文件都存在', tab.every((t) =>
    fs.existsSync(path.join(MP, t.iconPath)) && fs.existsSync(path.join(MP, t.selectedIconPath))));

  // 收集所有跳转目标：js 里的 navigateTo/switchTab + wxml 里的 data-url
  const targets = new Set();
  const scan = (dir, ext) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) { scan(p, ext); continue; }
      if (!f.name.endsWith(ext)) continue;
      const c = fs.readFileSync(p, 'utf8');
      for (const m of c.matchAll(/url:\s*'(\/pages\/[^']+)'/g)) targets.add(m[1].slice(1));
      for (const m of c.matchAll(/data-url="(\/pages\/[^"]+)"/g)) targets.add(m[1].slice(1));
    }
  };
  scan(path.join(MP, 'pages'), '.js');
  scan(path.join(MP, 'pages'), '.wxml');

  // 这几个页面已经被合并进「待办·作业」和「健康」，不再有独立入口。
  // 它们仍然注册在 app.json 里（旧链接/「最近使用」可能直接打开），
  // 所以「没有入站跳转」是符合预期的，这里显式列出来，
  // 避免以后真的加了入口却被这条检查漏掉。
  const MERGED = new Set([
    'pages/todos/todos', 'pages/assignments/assignments',
    'pages/run/run', 'pages/diet/diet', 'pages/health/health',
  ]);
  const unreachable = appJson.pages.filter(
    (p) => !tabPaths.includes(p) && !targets.has(p) && !MERGED.has(p)
  );
  T('所有页面都能到达', unreachable.length === 0, unreachable.join(', '));
  T('  5 个合并子页仅作为子模块存在', [...MERGED].every((p) => appJson.pages.includes(p)));

  // 合并页必须能取到全部子模块定义（文件末尾的 module.exports = DEFINITION）
  const { buildHost } = require(path.join(MP, 'utils', 'tabHost.js'));
  const check = (name, expect) => {
    const defs = {};
    for (const id of expect) {
      const f = path.join(MP, 'pages', id, id + '.js');
      const saved = global.Page;
      let d = null;
      global.Page = (x) => { d = x; };
      delete require.cache[require.resolve(f)];
      const ex = require(f);
      global.Page = saved;
      defs[id] = ex && ex.data ? ex : d;
    }
    T(`  ${name} 的子模块都导出了定义`, expect.every((id) => defs[id] && defs[id].data));
  };
  check('待办·作业', ['todos', 'assignments']);
  check('健康', ['diet', 'run', 'health']);
}

// ══ 14. 合并页的分段延迟初始化 ══
// 分段内容在 wx:if 分支里，没显示的那几段不在渲染树上。
// 子模块的 onReady（画 canvas 图表写在这里）不能在宿主 onReady 时统一跑，
// 必须等那一段真的显示出来 —— 否则「健康」页的体重/睡眠曲线永远不画，
// 页面还不报错。这条曾经真的漏过，所以固定成回归用例。
section('[14] 合并页分段延迟初始化');
{
  // 记录 createSelectorQuery 查了哪些 id
  const queries = [];
  const savedQuery = wx.createSelectorQuery;
  wx.createSelectorQuery = () => {
    const q = {
      _sel: null,
      in() { return q; },
      select(s) { q._sel = s; return q; },
      fields() { return q; },
      exec(cb) { queries.push(q._sel); cb([{ node: null, width: 100, height: 40 }]); },
    };
    return q;
  };

  const APP = { globalData: {} };
  const savedGetApp = global.getApp;
  global.getApp = () => APP;

  const fs = require('fs');
  const defOfPage = (file) => {
    let d = null;
    const saved = global.Page;
    global.Page = (x) => { d = x; };
    delete require.cache[require.resolve(file)];
    const ex = require(file);
    global.Page = saved;
    return ex && ex.data ? ex : d;
  };
  const mount = (def) => Object.assign({}, def, {
    data: JSON.parse(JSON.stringify(def.data || {})),
    setData(p, cb) {
      for (const k of Object.keys(p)) this.data[k] = p[k];
      if (typeof cb === 'function') cb();
    },
  });

  store.resetAll();
  const hub = mount(defOfPage(path.join(MP, 'pages/healthhub/healthhub.js')));
  hub.onLoad();
  T('默认停在饮食段', hub.data.seg === 'diet');

  queries.length = 0;
  hub.onReady();
  T('  onReady 不查不可见分段的 canvas', queries.length === 0, '查了 ' + queries.length + ' 次');

  queries.length = 0;
  hub.switchSeg({ currentTarget: { dataset: { id: 'health' } } });
  T('切到体重段才初始化图表', queries.length === 2, JSON.stringify(queries));
  T('  查的是体重/睡眠两个 canvas',
    queries.indexOf('#weightCanvas') >= 0 && queries.indexOf('#sleepCanvas') >= 0);

  queries.length = 0;
  hub.switchSeg({ currentTarget: { dataset: { id: 'diet' } } });
  hub.switchSeg({ currentTarget: { dataset: { id: 'health' } } });
  T('来回切换不重复初始化', queries.length === 0, '又查了 ' + queries.length + ' 次');

  // 总览指标卡 → pendingSeg → 目标页切分段。
  // 用一个**全新的**页面实例：同一个实例上 health 段早就初始化过了，
  // 再切过去不会重复查询 canvas，那样测不出「首次进入」的行为。
  APP.globalData.pendingSeg = { seg: 'health' };
  queries.length = 0;
  const hub2 = mount(defOfPage(path.join(MP, 'pages/healthhub/healthhub.js')));
  hub2.onLoad();
  hub2.onReady();
  hub2.onShow();
  T('onShow 处理 pendingSeg', hub2.data.seg === 'health');
  T('  首次进入该段会初始化图表', queries.length === 2, '查了 ' + queries.length + ' 次');
  T('  pendingSeg 用完即清', !APP.globalData.pendingSeg);
  hub2.onUnload();
  hub.onUnload();

  wx.createSelectorQuery = savedQuery;
  global.getApp = savedGetApp;
  store.resetAll();

  // 子模块定义的生命周期钩子必须都被宿主转发。
  // 漏一个就是「某段功能静默失效」—— onReady 漏转发导致图表不画，
  // 就是这么来的。这里做成通用检查，以后加钩子不会再漏。
  const HOOKS = ['onLoad', 'onReady', 'onShow', 'onHide', 'onUnload',
    'onPullDownRefresh', 'onReachBottom', 'onPageScroll', 'onResize', 'onTabItemTap'];
  const tabSrc = fs.readFileSync(path.join(MP, 'utils', 'tabHost.js'), 'utf8');
  for (const id of ['todos', 'assignments', 'diet', 'run', 'health']) {
    const src = fs.readFileSync(path.join(MP, 'pages', id, id + '.js'), 'utf8');
    const defined = HOOKS.filter((h) => new RegExp('^\\s{2}' + h + '\\s*\\(', 'm').test(src));
    const dropped = defined.filter((h) => !new RegExp('^\\s{4}' + h + '\\s*\\(', 'm').test(tabSrc));
    T(`${id} 的生命周期都被转发`, dropped.length === 0, '未转发: ' + dropped.join(', '));
  }
}

// ══ 15. 设置页写入与持久化 ══
section('[15] 设置页');
{
  const p = loadPage('settings');
  p.onLoad();
  T('页面加载', p.data.ready === true);

  // switch 组件走 change 事件（e.detail.value），不是 tap
  const sw = (v) => ({ detail: { value: v }, currentTarget: { dataset: {} }, target: { dataset: {} } });
  const inp = (v) => ({ detail: { value: v }, currentTarget: { dataset: {} }, target: { dataset: {} } });

  p.toggleTheme(sw(true));
  T('切到浅色主题', store.shape.settings.theme === 'light');
  p.toggleTheme(sw(false));
  T('切回深色主题', store.shape.settings.theme === 'dark');

  p.onSemesterStart(inp('2026-09-07'));
  T('学期起点保存', store.shape.settings.semesterStart === '2026-09-07');
  p.onTotalWeeks(inp('19'));
  T('总周数保存', store.shape.settings.totalWeeks === 19);

  p.toggleRunEnabled(sw(true));
  T('运动打卡开关', store.shape.settings.runEnabled === true);
  p.onRunTarget(inp('20'));
  T('运动目标次数', store.shape.settings.runTarget === 20);

  // 通知开关只负责持久化（真正的推送需要订阅消息 + 服务端，属已知缺口）
  p.toggleNotify(sw(true));
  T('通知开关持久化', store.shape.settings.notifyEnabled === true);

  T('存储占用文案可读', typeof p.data.usageText === 'string' && p.data.usageText.length > 0);
  p.onUnload();

  // 与桌面版的设置键保持一致，桌面备份才能无损导入
  const st = store.shape.settings;
  const NEED = ['periods', 'semesterStart', 'notifyEnabled', 'notifyMinutesBefore',
    'pinnedDate', 'proteinFactor', 'proteinTargetOverride', 'runEnabled', 'runTarget',
    'runStart', 'runEnd', 'runTypes', 'trainDays', 'photoQuotaMB', 'theme', 'totalWeeks'];
  const missing = NEED.filter((k) => !(k in st));
  T('桌面版设置键齐全', missing.length === 0, '缺: ' + missing.join(', '));

  // periods 默认是空数组（与桌面版一致），解析课表时回退到内置 12 节时间表
  const tp = require(path.join(MP, 'utils', 'textParse.js'));
  T('  内置 12 节时间表可用', tp.DEFAULT_PERIOD_TIMES.length === 12);
  const r = tp.parseTimetableText('周一\n高等数学，1-2节，A101，1-16周');
  T('  periods 为空时仍能解出时间', r.courses.length === 1 && r.courses[0].start === '08:00',
    JSON.stringify(r.courses.map((c) => c.start + '-' + c.end)));
  store.resetAll();
}

// ══ 16. 备份导入导出 ══
// 存储键与桌面版逐字节一致，桌面备份能直接导入 —— 这是移植的关键卖点，
// 之前只验过「不崩」，没有验过真的能来回。
section('[16] 备份导入导出');
{
  const K = require(path.join(MP, 'utils', 'storage.js')).KEYS;

  // 先核对存储键和桌面版一致（写死一份，防止以后改动破坏兼容）
  const DESKTOP_KEYS = {
    health: 'fitplan-health-logs', trainDone: 'fitplan-train-done',
    diet: 'fitplan-diet-logs', dietSeed: 'fitplan-diet-seed-ids',
    run: 'fitplan-run-logs', courses: 'fitplan-courses', todos: 'fitplan-todos',
    assignments: 'fitplan-assignments', templates: 'fitplan-templates',
    settings: 'fitplan-settings', notes: 'fitplan-notes',
    milestones: 'fitplan-milestones', calendars: 'fitplan-calendars',
  };
  const drift = Object.keys(DESKTOP_KEYS).filter((k) => K[k] !== DESKTOP_KEYS[k]);
  T('存储键与桌面版一致', drift.length === 0, '不一致: ' + drift.join(', '));

  // 造数据 → 导出 → 清空 → 导入 → 比对
  store.resetAll();
  store.setCourses([{ id: 'c1', day: 1, name: '高等数学', start: '08:00', end: '09:40',
    place: 'A101', weeks: [1, 2, 3], tag: '必修', teacher: '张老师', credit: 4 }]);
  store.setTodos([{ id: 't1', text: '交报告', due: '2026-10-20', priority: 'high', tag: '学习', done: false }]);
  store.setAssignments([{ id: 'a1', course: '高等数学', title: '习题3', detail: '第3章',
    due: '2026-10-25', dueTime: '23:59', weight: '20%', done: false }]);
  store.setRun([{ date: '2026-10-13', type: '跑步' }]);
  store.setSettings({ semesterStart: '2026-09-07', runTarget: 25 });

  const p = loadPage('settings');
  p.onLoad();
  clipboard = '';
  p.doExport();
  T('导出内容进了剪贴板', clipboard.length > 0, clipboard.length + ' 字节');

  const ex = JSON.parse(clipboard);
  T('  是合法 JSON 且带应用标识', ex.__app === 'university-desk', String(ex.__app));
  T('  带版本号和导出时间', ex.__version === 1 && !!ex.__exportedAt);
  // dietSeed / notes 不导出 —— 与桌面版 exportAll 的键集合逐一对齐过：
  // dietSeed 是「哪些食物已进过种子库」的本地标记、notes 是临时便签，
  // 都属于可再生的本地状态，桌面版同样不导出。
  const EXPORTED = ['health', 'trainDone', 'diet', 'run', 'courses', 'todos',
    'assignments', 'templates', 'milestones', 'calendars', 'settings'];
  const notExported = Object.keys(DESKTOP_KEYS).filter((k) => !EXPORTED.includes(k));
  T('  导出的键与桌面版一一对应',
    EXPORTED.every((k) => ex[DESKTOP_KEYS[k]] !== undefined)
    && notExported.every((k) => ex[DESKTOP_KEYS[k]] === undefined),
    '不含: ' + notExported.join(', '));

  store.resetAll();
  T('清空后课表为空', store.shape.courses.length === 0);
  p.doImport();
  T('导入后课表恢复', store.shape.courses.length === 1);
  T('  待办恢复', store.shape.todos.length === 1);
  T('  作业恢复', store.shape.assignments.length === 1);
  T('  运动记录恢复', store.shape.run.length === 1);
  T('  设置恢复', store.shape.settings.runTarget === 25);
  T('  课程字段无损', !!store.shape.courses[0] && store.shape.courses[0].teacher === '张老师'
    && store.shape.courses[0].credit === 4 && JSON.stringify(store.shape.courses[0].weeks) === '[1,2,3]');

  // 桌面版 exportAll 返回的是解析后的对象（它的存储层写入 stringify、读取 parse）
  const desktopBackup = {
    __app: 'university-desk', __version: 1, __exportedAt: '2026-01-01T00:00:00.000Z',
    [K.courses]: [{ id: 'd1', day: 2, name: '大学英语', start: '10:00', end: '11:40',
      place: 'B202', weeks: [1, 2], tag: '必修' }],
    [K.todos]: [{ id: 'd2', text: '桌面待办', due: '2026-11-01', priority: 'low', tag: '其他', done: false }],
    [K.settings]: { theme: 'light', runTarget: 42, semesterStart: '2026-09-01' },
  };
  clipboard = JSON.stringify(desktopBackup);
  store.resetAll();
  p.doImport();
  T('桌面备份可直接导入', store.shape.courses.length === 1 && store.shape.todos.length === 1);
  T('  课程字段完整', !!store.shape.courses[0] && store.shape.courses[0].name === '大学英语');
  T('  设置与主题导入', store.shape.settings.runTarget === 42 && store.shape.settings.theme === 'light');

  // 坏备份不能让页面崩掉
  for (const [name, bad] of [['非 JSON', '这不是 json'], ['空字符串', ''],
    ['是数组', '[1,2,3]'], ['是 null', 'null'], ['缺 __app', '{"foo":1}'],
    ['键值是坏 JSON', '{"__app":"university-desk","fitplan-courses":"{坏}"}']]) {
    clipboard = bad;
    let crashed = false;
    try { store.resetAll(); p.doImport(); } catch (e) { crashed = true; }
    T(`  ${name} 不崩溃`, !crashed);
  }
  p.onUnload();
  store.resetAll();
}

console.log('\n══════════════════════════════');
console.log(`  验收: ${ok} 通过 / ${bad} 失败`);
process.exit(bad ? 1 : 0);
