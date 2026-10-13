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

/**
 * 装载「tabHost 宿主」页面（总览）。
 * 这类页面末尾会在 !global.__TABHOST_LOADING__ 时自己调 Page(buildHost(...))，
 * 但它的页面定义本身是 module.exports 出去的 DEFINITION。
 * 直接把 __TABHOST_LOADING__ 置真，require 之后就拿到干净的 DEFINITION，
 * 不用去拆 buildHost 拼出来的合并对象。
 */
function loadHostPage(name) {
  global.__TABHOST_LOADING__ = true;
  try {
    const f = path.join(MP, 'pages', name, name + '.js');
    delete require.cache[require.resolve(f)];
    const def = require(f);
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
  } finally {
    global.__TABHOST_LOADING__ = false;
  }
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

  // 增加一条硬检查：tabBar 的文案顺序必须是约定的那 5 个。
  // 「今日」并进「总览」后，「设置」才拿到最后一格 —— 顺序变了要立刻发现。
  const tabTexts = tab.map((t) => t.text);
  T('tabBar 文案与约定一致',
    JSON.stringify(tabTexts) === JSON.stringify(['总览', '课表', '待办·作业', '健康', '设置']),
    tabTexts.join(' / '));
  T('  设置占了 tabBar 一格', tabPaths.includes('pages/settings/settings'));
  T('  今日不再是 tabBar 页（已并入总览）', !tabPaths.includes('pages/today/today'));

  // 这几个页面已经被合并进「待办·作业」「健康」，或并进「总览」，
  // 不再有独立入口。它们仍然注册在 app.json 里（旧链接/「最近使用」
  // 可能直接打开），所以「没有入站跳转」是符合预期的，这里显式列出来，
  // 避免以后真的加了入口却被这条检查漏掉。
  const MERGED = new Set([
    'pages/todos/todos', 'pages/assignments/assignments',
    'pages/run/run', 'pages/diet/diet', 'pages/health/health',
    'pages/today/today',
  ]);
  const unreachable = appJson.pages.filter(
    (p) => !tabPaths.includes(p) && !targets.has(p) && !MERGED.has(p)
  );
  T('所有页面都能到达', unreachable.length === 0, unreachable.join(', '));
  T('  合并子页仅作为子模块存在', [...MERGED].every((p) => appJson.pages.includes(p)));

  // switchTab 只能打 tabBar 页、navigateTo 只能打非 tabBar 页，
  // 弄反不会报错 —— 就是不跳。这类 bug 只能靠静态检查兜住。
  // 只查字面量 url；goStat/goTab 那种从 dataset 取 url 的按 isTab 分流，查不了。
  const badSwitch = [];
  const scan2 = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) { scan2(p); continue; }
      if (!f.name.endsWith('.js')) continue;
      const src = fs.readFileSync(p, 'utf8');
      for (const m of src.matchAll(/wx\.switchTab\s*\(\s*\{\s*url:\s*'(\/pages\/[^']+)'/g)) {
        if (!tabPaths.includes(m[1].slice(1))) badSwitch.push(`${f.name}: switchTab → ${m[1]}`);
      }
      for (const m of src.matchAll(/wx\.navigateTo\s*\(\s*\{\s*url:\s*'(\/pages\/[^']+)'/g)) {
        if (tabPaths.includes(m[1].slice(1))) badSwitch.push(`${f.name}: navigateTo → ${m[1]}`);
      }
    }
  };
  scan2(path.join(MP, 'pages'));
  T('switchTab / navigateTo 的目标类型都对', badSwitch.length === 0, badSwitch.join('; '));

  // WXML 里 data-url 指向 tabBar 页的格子，必须绑 goTab（走 switchTab），
  // 绑成 goPage（走 navigateTo）同样会静默失败。
  const badTile = [];
  const scanWxml = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) { scanWxml(p); continue; }
      if (!f.name.endsWith('.wxml')) continue;
      const src = fs.readFileSync(p, 'utf8');
      // 逐个标签看：同一标签里既有 data-url 又有 bindtap
      for (const m of src.matchAll(/<[a-z-]+[^>]*>/g)) {
        const tag = m[0];
        const u = /data-url="(\/pages\/[^"]+)"/.exec(tag);
        if (!u) continue;
        if (!tabPaths.includes(u[1].slice(1))) continue;
        const h = /bindtap="([^"]+)"/.exec(tag);
        const hn = h ? h[1] : '';
        if (!/goTab$/.test(hn)) badTile.push(`${f.name}: ${u[1]} 绑的是 ${hn || '(无)'}`);
      }
    }
  };
  scanWxml(path.join(MP, 'pages'));
  T('指向 tabBar 页的入口都走 goTab', badTile.length === 0, badTile.join('; '));

  // 反向也查：goTab 走的是 switchTab，只能打开 tabBar 页面。
  // 如果 data-url 指向一个**非** tabBar 页（比如「今日」并入总览之后的
  // /pages/today/today），switchTab 会静默失败 —— 不报错、不跳转、没日志，
  // 用户只看到「点了没反应」。这个坑真的踩过。
  const badTabTarget = [];
  const scanWxml2 = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) { scanWxml2(p); continue; }
      if (!f.name.endsWith('.wxml')) continue;
      const src = fs.readFileSync(p, 'utf8');
      for (const m of src.matchAll(/<[a-z-]+[^>]*>/g)) {
        const tag = m[0];
        const u = /data-url="(\/pages\/[^"]+)"/.exec(tag);
        if (!u) continue;
        // 只查绑 goTab 的（navigateTo 才是非 tabBar 页的正确选择）
        const h = /bindtap="([^"]+)"/.exec(tag);
        if (!h || !/goTab$/.test(h[1])) continue;
        // 指向自己所在宿主页 + data-seg 是允许的（切分段而非换页）
        if (tabPaths.includes(u[1].slice(1))) continue;
        if (/data-seg="/.test(tag)) continue;
        badTabTarget.push(`${f.name}: goTab → ${u[1]}（不是 tabBar 页，switchTab 会静默失败）`);
      }
    }
  };
  scanWxml2(path.join(MP, 'pages'));
  T('goTab 的目标都是 tabBar 页（否则 switchTab 静默失败）',
    badTabTarget.length === 0, badTabTarget.join('; '));

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
  check('总览', ['dashboard', 'today']);
}

// ══ 13b. 总览 / 今日 合并页 ══
// 「今日」并进「总览」，腾出 tabBar 位置给「设置」。
// 宿主自己的定义（dashboard）也要作为一个分段参与合并。
section('[13b] 总览 · 今日 合并页');
{
  const APP = { globalData: {} };
  const savedGetApp = global.getApp;
  global.getApp = () => APP;

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
  // 注意：dashboard.js 同时 export 了 DEFINITION（给 tabHost 用）并且
  // 在非 tabHost 加载时调 Page(buildHost(...)) 注册真正的页面。
  // 要测的是**注册出去的那个**（带 seg/switchSeg 的宿主），不是裸定义。
  let registered = null;
  {
    const saved = global.Page;
    global.Page = (x) => { registered = x; };
    const f = path.join(MP, 'pages/dashboard/dashboard.js');
    delete require.cache[require.resolve(f)];
    require(f);
    global.Page = saved;
  }
  T('总览页注册了宿主定义', !!(registered && registered.data && registered.data.segments));
  const p = mount(registered);
  T('两个分段', Array.isArray(p.data.segments) && p.data.segments.length === 2,
    JSON.stringify((p.data.segments || []).map((s) => s.id)));
  T('默认停在总览分段', p.data.seg === 'dashboard');

  p.onLoad();
  T('onLoad 后 ready', p.data.ready === true);
  // 两个模块的数据都带各自前缀并入
  T('总览数据带 dashboard_ 前缀', 'dashboard_stats' in p.data && 'dashboard_pinned' in p.data);
  T('今日数据带 today_ 前缀', 'today_shown' in p.data && 'today_timeline' in p.data);
  T('compact 已声明（WXML 里用到）', 'dashboard_compact' in p.data);

  // tabHost 会挂带前缀的方法别名
  T('总览方法可调用', typeof p.dashboard_goStat === 'function');
  T('今日方法可调用', typeof p.today_shiftDay === 'function' || typeof p.today_refresh === 'function');
  T('宿主提供 switchSeg', typeof p.switchSeg === 'function');

  p.switchSeg({ currentTarget: { dataset: { id: 'today' } } });
  T('切到今日分段', p.data.seg === 'today');
  p.switchSeg({ currentTarget: { dataset: { id: 'dashboard' } } });
  T('切回总览分段', p.data.seg === 'dashboard');
  p.onUnload();

  // 今日页单独打开仍要正常（旧链接不能变死链）
  const solo = mount(defOfPage(path.join(MP, 'pages/today/today.js')));
  solo.onLoad();
  T('今日单独打开仍正常', solo.data.ready === true);
  T('  数据无前缀', 'shown' in solo.data && !('today_shown' in solo.data));
  solo.onUnload();

  global.getApp = savedGetApp;
  store.resetAll();
}

// ══ 13c. 总览的置顶倒计时增删 ══
// 桌面版是 hover 出现铅笔/叉号，手机没有 hover，所以撤下按钮常显。
// 「添加」是从重要事项里挑，不新建 —— 绿色条和重要事项页必须共用一份数据。
section('[13c] 总览 · 置顶倒计时增删');
{
  const APP = { globalData: {} };
  const savedGetApp = global.getApp;
  global.getApp = () => APP;

  // 取宿主注册出去的实例（方法带 dashboard_ 前缀）
  let reg = null;
  {
    const saved = global.Page;
    global.Page = (x) => { reg = x; };
    const f = path.join(MP, 'pages/dashboard/dashboard.js');
    delete require.cache[require.resolve(f)];
    require(f);
    global.Page = saved;
  }
  const p = Object.assign({}, reg, {
    data: JSON.parse(JSON.stringify(reg.data || {})),
    setData(patch, cb) {
      for (const k of Object.keys(patch)) this.data[k] = patch[k];
      if (typeof cb === 'function') cb();
    },
  });

  // 相对今天偏移 n 天的 YYYY-MM-DD（不引 toKey，避免多一个依赖）
  const shift = (n) => {
    const d = new Date(store.today.getTime() + n * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  store.resetAll();
  store.setMilestones([
    { id: 'p1', title: '期末考试', date: shift(20), emoji: '📝', category: '考试', done: false },
    { id: 'p2', title: '四级报名', date: shift(5), emoji: '📘', category: '考试', done: false },
    { id: 'p3', title: '很久以前', date: '2020-01-01', emoji: '📌', category: '其他', done: false },
    { id: 'p4', title: '没有日期', date: '', emoji: '📌', category: '其他', done: false },
  ]);
  p.onLoad();

  T('初始没有钉住的', p.data.dashboard_pinned.length === 0);
  T('可选列表排除过期太久的', !p.data.dashboard_availablePins.some((x) => x.id === 'p3'));
  T('  也排除没有日期的', !p.data.dashboard_availablePins.some((x) => x.id === 'p4'));
  T('  可选的按日期升序', p.data.dashboard_availablePins[0].id === 'p2',
    p.data.dashboard_availablePins.map((x) => x.id).join(','));

  p.dashboard_togglePinPicker();
  T('选择器可展开', p.data.dashboard_pinPickerOpen === true);
  p.dashboard_pinMilestone({ currentTarget: { dataset: { id: 'p2' } } });
  T('钉住后出现在绿色条上', p.data.dashboard_pinned.some((x) => x.id === 'p2'));
  T('  选择器自动收起', p.data.dashboard_pinPickerOpen === false);
  T('  已钉的不再出现在可选列表', !p.data.dashboard_availablePins.some((x) => x.id === 'p2'));
  T('  事项本身没被复制成两条', (store.shape.milestones || []).length === 4);

  p.dashboard_unpinMilestone({ currentTarget: { dataset: { id: 'p2' } } });
  T('撤下后不在绿色条上', !p.data.dashboard_pinned.some((x) => x.id === 'p2'));
  T('  撤下≠删除，事项还在', (store.shape.milestones || []).some((m) => m.id === 'p2'));
  T('  撤下后回到可选列表', p.data.dashboard_availablePins.some((x) => x.id === 'p2'));

  // 超过 4 条改用紧凑卡片（桌面版 dashMilestones.length > 4）
  store.setMilestones([
    { id: 'q1', title: 'a', date: shift(1), emoji: '📌', category: '', done: false, pinned: true },
    { id: 'q2', title: 'b', date: shift(2), emoji: '📌', category: '', done: false, pinned: true },
    { id: 'q3', title: 'c', date: shift(3), emoji: '📌', category: '', done: false, pinned: true },
    { id: 'q4', title: 'd', date: shift(4), emoji: '📌', category: '', done: false, pinned: true },
    { id: 'q5', title: 'e', date: shift(5), emoji: '📌', category: '', done: false, pinned: true },
  ]);
  p.dashboard_refresh();
  T('钉超过 4 条改用紧凑样式', p.data.dashboard_compact === true);
  T('  钉住的按日期升序', JSON.stringify(p.data.dashboard_pinned.map((x) => x.date))
    === JSON.stringify([...p.data.dashboard_pinned.map((x) => x.date)].sort()));

  store.setMilestones([]);
  p.dashboard_refresh();
  T('没有可添加项时列表为空', p.data.dashboard_availablePins.length === 0);

  global.getApp = savedGetApp;
  store.resetAll();
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

// ══ 17. 文字解析：校历事项规则 ══
// 桌面版原有 21 条事项规则必须一条不少，另加 7 条（期中考试 / 补考 /
// 四六级 / 计算机等级 / 运动会 / 选课 / 实习）。
// 注意：事项必须带「日号」才会生成 —— 只有「6月 中秋节」没有可挂靠的日期，
// 这是正确行为，不是漏识别。
section('[17] 文字解析 · 校历事项');
{
  const tp = require(path.join(MP, 'utils', 'textParse.js'));

  const ORIGINAL = [
    ['9月1日 军训开始', '军训及入学教育'], ['9月5日 新生报到', '新生报到'],
    ['9月8日 新生开课', '新生开课'], ['9月10日 正式上课', '正式上课'],
    ['1月5日 考试周', '期末考试周'], ['1月20日 寒假开始', '寒假'],
    ['7月10日 暑假', '暑假'], ['9月29日 中秋节', '中秋节'],
    ['10月1日 国庆节', '国庆节'], ['1月1日 元旦', '元旦'],
    ['2月16日 除夕', '除夕'], ['2月17日 春节', '春节'],
    ['3月8日 妇女节', '妇女节'], ['4月5日 清明节', '清明节'],
    ['5月1日 劳动节', '劳动节'], ['5月4日 青年节', '青年节'],
    ['6月1日 儿童节', '儿童节'], ['6月10日 端午节', '端午节'],
    ['7月1日 建党节', '建党节'], ['8月1日 建军节', '建军节'],
    ['6月30日 毕业典礼', '毕业生离校'],
  ];
  const missOrig = ORIGINAL.filter(([line, want]) =>
    !tp.parseCalendarText(line).events.some((e) => e.title === want));
  T('桌面版 21 条原有规则全部命中', missOrig.length === 0,
    missOrig.map((m) => m[0]).join('; '));

  const ADDED = [
    ['11月5日 期中考试', '期中考试'], ['3月1日 补考', '补考'],
    ['6月15日 英语四级考试', '四六级考试'], ['3月20日 计算机等级考试', '计算机等级考试'],
    ['4月20日 校运动会', '运动会'], ['6月1日 选课开始', '选课'],
    ['7月1日 实习', '实习实践'],
  ];
  const missAdded = ADDED.filter(([line, want]) =>
    !tp.parseCalendarText(line).events.some((e) => e.title === want));
  T('新增 7 条规则全部命中', missAdded.length === 0, missAdded.map((m) => m[0]).join('; '));

  // 无日号 → 不产生事项（没有可挂靠的日期）
  T('无日号不产生事项', tp.parseCalendarText('6月 中秋节').events.length === 0);
  T('  补上日号即可识别', tp.parseCalendarText('9月29日 中秋节').events.length === 1);

  // 周次表 → 反推学期起点
  const c = tp.parseCalendarText('第 1 周：9.7–9.13\n第 2 周：9.14–9.20\n第 3 周：9.21–9.27');
  T('解析周次表', c.weeks.length === 3, c.weeks.length + ' 周');
  T('  反推学期起点', c.semesterStart === '2026-09-07', c.semesterStart);

  // 课表文字解析
  const r = tp.parseTimetableText(
    '周一\n高等数学，1-2节，教一A101，1-16周\n大学英语，3-4节，外语楼B202，1-16周\n周二\n体育，5-6节，体育馆，1-16周');
  T('课表解析出 3 门课', r.courses.length === 3, r.courses.length + '');
  const math = r.courses.filter((x) => x.name === '高等数学')[0];
  T('  节次转成时间', !!math && math.start === '08:00' && math.end === '09:40',
    math ? math.start + '-' + math.end : '(无)');
  T('  地点与周次', !!math && math.place === '教一A101' && math.weeks.length === 16);
}

// ══ 18. 饮食 · 自定义套餐 ══
// 桌面版 Diet.tsx：内置 TEMPLATES 是常量，用户可以「存为我的套餐」
// 写进 store.templates，之后一键复用。自存的带 ★ 且绿色描边。
section('[18] 饮食 · 自定义套餐');
{
  const mkPage = () => {
    let def = null;
    const saved = global.Page;
    global.Page = (x) => { def = x; };
    const f = path.join(MP, 'pages/diet/diet.js');
    delete require.cache[require.resolve(f)];
    require(f);
    global.Page = saved;
    return Object.assign({}, def, {
      data: JSON.parse(JSON.stringify(def.data || {})),
      setData(patch, cb) {
        for (const k of Object.keys(patch)) this.data[k] = patch[k];
        if (typeof cb === 'function') cb();
      },
    });
  };

  store.resetAll();
  const p = mkPage();
  p.onLoad();

  T('初始没有自存套餐', p.data.savedTemplates.length === 0);
  T('内置套餐来自常量', p.data.templates.length > 0, String(p.data.templates.length));

  // 清单为空时不允许存
  p.setData({ picked: [] });
  p.openSaveTpl();
  T('清单为空时不开保存弹层', p.data.saveTplOpen === false);

  // 存一个
  const builtin = p.data.templates[0];
  p.applyTemplate({ currentTarget: { dataset: { id: builtin.id } } });
  const n1 = p.data.picked.length;
  T('内置套餐能套用', n1 > 0);
  p.openSaveTpl();
  T('  清单非空时可开弹层', p.data.saveTplOpen === true);
  p.onTplName({ detail: { value: '我的增肌餐' } });
  p.commitTemplate();
  T('已写进 store.templates', (store.shape.templates || []).length === 1);
  T('  名字用的是输入值', store.shape.templates[0].name === '我的增肌餐');
  T('  条目快照完整', (store.shape.templates[0].items || []).length === n1);
  T('  存完自动关弹层', p.data.saveTplOpen === false);

  p.refresh();
  T('刷新后列表里能看到', p.data.savedTemplates.length === 1);
  T('  带项数与摘要', p.data.savedTemplates[0].count === n1
    && p.data.savedTemplates[0].summary.length > 0);

  // 名字留空用「餐次+套餐」
  p.setData({ tplName: '' });
  p.commitTemplate();
  T('名字留空时用「餐次套餐」兜底',
    store.shape.templates[1].name === builtin.meal + '套餐', store.shape.templates[1].name);

  // 套用自存套餐
  p.setData({ picked: [], meal: '晚餐' });
  p.refresh();
  p.applySaved({ currentTarget: { dataset: { id: store.shape.templates[0].id } } });
  T('自存套餐能套用', p.data.picked.length === n1, String(p.data.picked.length));
  T('  餐次跟着还原', p.data.meal === builtin.meal);

  // 食物库改了 / 食物下架时，用存下来的快照兜底，不能整份丢
  store.setTemplates([{
    id: 'legacy1', name: '旧套餐', meal: '午餐',
    items: [{ foodId: '__不存在__', name: '已下架鸡胸', qty: 2, protein: 30, calories: 200 }],
  }]);
  p.refresh();
  p.applySaved({ currentTarget: { dataset: { id: 'legacy1' } } });
  T('食物已下架时用快照兜底', p.data.picked.length === 1
    && p.data.picked[0].name === '已下架鸡胸', JSON.stringify(p.data.picked));
  T('  数量也按快照', p.data.picked[0].qty === 2);

  // 删除自存套餐（内置的删不掉，因为不在 store 里）
  store.setTemplates([
    { id: 'd1', name: 'A', meal: '早餐', items: [] },
    { id: 'd2', name: 'B', meal: '午餐', items: [] },
  ]);
  p.removeTemplate({ currentTarget: { dataset: { id: 'd1' } } });
  T('删除自存套餐', (store.shape.templates || []).every((x) => x.id !== 'd1'));
  T('  只删指定的那个', (store.shape.templates || []).length === 1);
  T('内置套餐不受影响', p.data.templates.length > 0);

  store.resetAll();
}

// ══ 19. 健康 · 月历打卡与连续天数 ══
// 桌面版是 CheckinCalendar.tsx：真实月历网格（不是 7 格周条），
// 能跨月看长期坚持情况、能补上个月漏打的日子。
// 连续天数按「有训练计划的天」算，休息日跳过 —— 不计数也不打断，
// 否则一周只练 3 天的人永远连不上。
section('[19] 健康 · 月历打卡与连续天数');
{
  const mkPage = () => {
    let def = null;
    const saved = global.Page;
    global.Page = (x) => { def = x; };
    const f = path.join(MP, 'pages/health/health.js');
    delete require.cache[require.resolve(f)];
    require(f);
    global.Page = saved;
    return Object.assign({}, def, {
      data: JSON.parse(JSON.stringify(def.data || {})),
      setData(patch, cb) {
        for (const k of Object.keys(patch)) this.data[k] = patch[k];
        if (typeof cb === 'function') cb();
      },
    });
  };
  const K = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const back = (n) => {
    const t = store.today;
    return new Date(t.getFullYear(), t.getMonth(), t.getDate() - n);
  };

  store.resetAll();
  // 训练日 = 周一 / 周三 / 周五
  store.setSettings({ trainDays: '1,3,5' });
  // 最近的 4 个训练日
  const td = [back(1), back(4), back(6), back(8)].map(K);

  let p = mkPage();
  store.setTrainDone(td);
  p.onLoad();

  T('月历是 6 行 × 7 列共 42 格', p.data.calCells.length === 42, String(p.data.calCells.length));
  T('月历标题形如「YYYY 年 M 月」', /^\d{4} 年 \d{1,2} 月$/.test(p.data.calLabel), p.data.calLabel);
  T('默认不允许翻到未来', p.data.canGoNextMonth === false);

  // 连续打卡的边界：休息日不打断、漏一个训练日就断
  const cases = [
    ['打满 4 次', td, 4],
    ['漏掉最近那个训练日 → 断', td.slice(1), 0],
    ['只漏中间那个 → 数到中间为止', [td[0], td[1], td[3]], 2],
    ['只打最近两次', td.slice(0, 2), 2],
    ['一个都没打', [], 0],
  ];
  for (const [name, done, want] of cases) {
    store.setTrainDone(done);
    p = mkPage();
    p.onLoad();
    T(`连续天数：${name}`, p.data.streak === want, `得 ${p.data.streak}，期望 ${want}`);
  }

  // 今天（休息日）没安排，昨天的打卡仍应算在连续里
  store.setTrainDone([K(back(1))]);
  p = mkPage();
  p.onLoad();
  T('休息日不打断连续', p.data.streak === 1, String(p.data.streak));

  // 今天额外补练也计入
  store.setTrainDone([K(back(1)), K(store.today)]);
  p = mkPage();
  p.onLoad();
  T('今天额外打卡也计入连续', p.data.streak === 2, String(p.data.streak));

  // 翻月
  store.setTrainDone(td);
  p = mkPage();
  p.onLoad();
  p.shiftMonth({ currentTarget: { dataset: { delta: -1 } } });
  T('可以翻到上个月', p.data.calCursor !== null);
  T('  翻月后允许往后翻', p.data.canGoNextMonth === true);
  p.shiftMonth({ currentTarget: { dataset: { delta: 1 } } });
  T('  不能翻过当月', p.data.canGoNextMonth === false);
  p.backToThisMonth();
  T('回到本月后游标清空（跟随今天）', p.data.calCursor === null);

  // 点格子补打卡 / 取消
  const cell = p.data.calCells.find((c) => !c.checked && c.inMonth && !c.isFuture);
  T('月历里有可点的历史格子', !!cell);
  if (cell) {
    p.toggleTrain({ currentTarget: { dataset: { key: cell.key } } });
    p.refresh();
    T('  点格子能补打卡', p.data.calCells.find((c) => c.key === cell.key).checked === true);
    p.toggleTrain({ currentTarget: { dataset: { key: cell.key } } });
    p.refresh();
    T('  再点一次取消打卡', p.data.calCells.find((c) => c.key === cell.key).checked === false);
  }

  // 没设训练日时 hasPlan=false（WXML 靠它隐藏「连续 N 天」）
  store.setSettings({ trainDays: '' });
  p.refresh();
  T('没设训练日时 hasPlan=false', p.data.hasPlan === false);

  store.resetAll();
}

// ══ 20. store 数组里的空洞 ══
// wx.getStorageSync 返回的是 JSON.parse 的结果，本地存储被写坏、或者用户手动
// 粘贴备份时留下 [null, {...}] 这种空洞是完全可能的。数组里夹一个 null，
// 各页面的 `.map(m => m.xxx)` / `sort((a,b) => a.done...)` 就会当场抛错 ——
// 而 store 的 notify 是逐订阅者 try/catch 的，页面不白屏，只是**停在旧数据上
// 不再更新**，表现为「点了没反应」，比白屏更难查。所以在 store 这一层统一收敛。
section('[20] store 数组里的空洞');
{
  T('对象数组过滤 null/undefined',
    (() => {
      store.resetAll();
      store.setMilestones([null, { id: 'm1', title: '真的', date: '2026-11-01' },
        undefined, { id: 'm2', title: '也是', date: '2026-12-01' }]);
      return store.shape.milestones.length === 2
        && store.shape.milestones.map((m) => m.id).join(',') === 'm1,m2';
    })());

  // trainDone 存的是日期字符串数组 —— 不能被「元素必须是对象」的校验滤没，
  // 这是打卡功能的地基（曾因为统一用对象校验而把打卡记录全部清空）。
  T('日期字符串数组（打卡记录）不被误滤',
    (() => {
      store.resetAll();
      store.setTrainDone([null, '2026-10-12', '2026-10-09', undefined, '2026-10-07']);
      return store.shape.trainDone.length === 3
        && store.shape.trainDone.join(',') === '2026-10-12,2026-10-09,2026-10-07';
    })());

  T('本地存储里的空洞也会被 hydrate 过滤',
    (() => {
      store.resetAll();
      // 直接用存储键写一份带空洞的数据，模拟本地存储被写坏
      const SK = require(path.join(MP, 'utils', 'storage.js')).KEYS;
      mem[SK.milestones] = [null, { id: 'z1', title: '存储里的', date: '2026-11-01' }, null];
      store.ready = false;
      store.hydrate();
      return store.shape.milestones.length === 1;
    })());

  // 10 个 setter × 各种垃圾输入，一律收敛成干净数组
  const SETTERS = [
    ['milestones', 'setMilestones'], ['todos', 'setTodos'], ['courses', 'setCourses'],
    ['assignments', 'setAssignments'], ['templates', 'setTemplates'], ['run', 'setRun'],
    ['diet', 'setDiet'], ['health', 'setHealth'], ['trainDone', 'setTrainDone'],
    ['calendars', 'setCalendars'],
  ];
  const junk = [['null', null], ['undefined', undefined], ['数字', 42], ['字符串', 'abc'],
    ['对象', {}], ['布尔', true], ['函数', () => {}], ['含空洞数组', [null, { id: 'a' }]]];
  const offenders = [];
  for (const [key, setter] of SETTERS) {
    for (const [label, value] of junk) {
      store.resetAll();
      let threw = null;
      try { store[setter](value); } catch (e) { threw = e.message; }
      const got = store.shape[key];
      const okShape = key === 'courses'
        ? (got === null || (Array.isArray(got) && got.every((x) => x && typeof x === 'object')))
        : (Array.isArray(got) && got.every((x) => x && typeof x === 'object'));
      if (threw || !okShape) offenders.push(`${setter}(${label})`);
    }
  }
  T('10 个 setter × 8 种垃圾输入全部收敛成干净数组', offenders.length === 0, offenders.join(', '));

  // courses 用 null 表示「还没导课」，不能被收敛成 []
  store.resetAll();
  store.setCourses(null);
  T('setCourses(null) 仍是 null（表示还没导课）', store.shape.courses === null);

  // 嵌套 items 也要抗空洞：store 只保证外层数组，页面自己 map 嵌套时要过滤
  store.resetAll();
  store.setTemplates([{ id: 'tp', name: '脏套餐', meal: '早餐',
    items: [null, { foodId: 'f1', name: '鸡蛋', qty: 2, protein: 12, calories: 140 }] }]);
  let dp = null;
  {
    const saved = global.Page;
    global.Page = (x) => { dp = x; };
    const f = path.join(MP, 'pages/diet/diet.js');
    delete require.cache[require.resolve(f)];
    require(f);
    global.Page = saved;
  }
  dp = Object.assign({}, dp, {
    data: JSON.parse(JSON.stringify(dp.data || {})),
    setData(patch, cb) {
      for (const k of Object.keys(patch)) this.data[k] = patch[k];
      if (typeof cb === 'function') cb();
    },
  });
  let nestedErr = null;
  try { dp.onLoad(); } catch (e) { nestedErr = e.message; }
  T('饮食页能加载带空洞 items 的套餐', !nestedErr, nestedErr);
  T('  摘要只统计有效项', dp.data.savedTemplates[0].count === 1);
  T('  摘要文本正确', dp.data.savedTemplates[0].summary === '鸡蛋');
  T('  蛋白合计正确', dp.data.savedTemplates[0].protein === 12);
  nestedErr = null;
  try { dp.applySaved({ currentTarget: { dataset: { id: 'tp' } } }); } catch (e) { nestedErr = e.message; }
  T('  套用时不崩', !nestedErr, nestedErr);

  // 全量：16 个页面在空洞数据下都要能加载
  const allPages = ['dashboard', 'today', 'courses', 'todos', 'assignments', 'week',
    'coursescan', 'calendaracademic', 'run', 'diet', 'health', 'milestones',
    'analysis', 'settings', 'tasks', 'healthhub'];
  const crashed = [];
  for (const name of allPages) {
    store.resetAll();
    store.setMilestones([null, { id: 'm', title: 'x', date: '2026-11-01' }]);
    store.setTodos([null, { id: 't', text: 'x' }]);
    store.setCourses([null, { id: 'c', name: 'x', day: 1, weeks: [1] }]);
    store.setTemplates([null, { id: 'tp', name: 'x', meal: '早餐', items: [null, { name: 'y' }] }]);
    store.setCalendars([null, { id: 'cal', name: 'x', events: [null, { date: '2026-10-01', title: 'y' }] }]);
    try {
      let def = null;
      const saved = global.Page;
      global.Page = (x) => { def = x; };
      const f = path.join(MP, 'pages', name, `${name}.js`);
      delete require.cache[require.resolve(f)];
      require(f);
      global.Page = saved;
      const pg = Object.assign({}, def, {
        data: JSON.parse(JSON.stringify(def.data || {})),
        setData(patch) { for (const k of Object.keys(patch)) this.data[k] = patch[k]; },
      });
      if (pg.onLoad) pg.onLoad();
    } catch (e) {
      crashed.push(`${name}: ${e.message}`);
    }
  }
  T('16 个页面在空洞数据下都能加载', crashed.length === 0, crashed.join(' | '));

  store.resetAll();
}

// ══ 21. 重要事项 · 提前提醒天数可编辑 ══
// 桌面版在编辑表单里有「提前提醒（天）」（Milestones.tsx:273-283），
// 分析页用它判断「临近」，重要事项页用它给「接下来」标红。
// 之前这个字段只在保存时原样带走、界面上没有输入框 —— 值永远是默认 7，
// 用户改了也不生效，等于这个设置不存在。
section('[21] 重要事项 · 提前提醒天数可编辑');
{
  store.resetAll();
  const p = loadPage('milestones');
  p.onLoad();

  T('新建时默认 7 天', p.data.draft.remindDaysBefore === 7, String(p.data.draft.remindDaysBefore));

  p.setData({ editing: true, draft: Object.assign({}, p.data.draft, { title: '期末考试', date: '2026-11-01' }) });
  p.onDraftInput({ currentTarget: { dataset: { field: 'remindDaysBefore' } }, detail: { value: '14' } });
  T('输入 14 后草稿里是数字 14',
    p.data.draft.remindDaysBefore === 14 && typeof p.data.draft.remindDaysBefore === 'number',
    `${typeof p.data.draft.remindDaysBefore} ${p.data.draft.remindDaysBefore}`);
  p.save();
  T('  保存后事项带 14', store.shape.milestones[0].remindDaysBefore === 14,
    JSON.stringify(store.shape.milestones[0].remindDaysBefore));

  // 编辑已有事项要回填真实值，不能永远是 7
  p.startEdit({ currentTarget: { dataset: { id: store.shape.milestones[0].id } } });
  T('编辑时回填真实值 14', p.data.draft.remindDaysBefore === 14, String(p.data.draft.remindDaysBefore));
  p.onDraftInput({ currentTarget: { dataset: { field: 'remindDaysBefore' } }, detail: { value: '3' } });
  p.save();
  T('  改成 3 生效', store.shape.milestones[0].remindDaysBefore === 3);

  // 0 是有意义的值（当天才提醒），不能被当成「空」
  p.onDraftInput({ currentTarget: { dataset: { field: 'remindDaysBefore' } }, detail: { value: '0' } });
  T('0 是合法值（当天提醒）', p.data.draft.remindDaysBefore === 0, String(p.data.draft.remindDaysBefore));
  p.save();
  T('  存进去仍是 0，没被当成空值', store.shape.milestones[0].remindDaysBefore === 0,
    JSON.stringify(store.shape.milestones[0].remindDaysBefore));

  // 清空是「正在输入」的中间态，保存时兜底
  p.onDraftInput({ currentTarget: { dataset: { field: 'remindDaysBefore' } }, detail: { value: '' } });
  T('清空后草稿是空串（允许正在输入）', p.data.draft.remindDaysBefore === '');
  p.save();
  T('  保存时兜底成 7', store.shape.milestones[0].remindDaysBefore === 7,
    JSON.stringify(store.shape.milestones[0].remindDaysBefore));

  // 脏输入不崩、不写坏
  p.onDraftInput({ currentTarget: { dataset: { field: 'remindDaysBefore' } }, detail: { value: 'abc' } });
  T('非数字输入收敛到 0', p.data.draft.remindDaysBefore === 0, String(p.data.draft.remindDaysBefore));
  p.onDraftInput({ currentTarget: { dataset: { field: 'remindDaysBefore' } }, detail: { value: '-5' } });
  T('负数夹到 0', p.data.draft.remindDaysBefore === 0, String(p.data.draft.remindDaysBefore));

  // 别的字段不受这个特判影响
  p.onDraftInput({ currentTarget: { dataset: { field: 'place' } }, detail: { value: '教三-201' } });
  T('其他字段仍按原样存字符串', p.data.draft.place === '教三-201', String(p.data.draft.place));

  // 分析页按每条事项自己的阈值判断「临近」，不是写死 7
  store.resetAll();
  const now = store.today;
  const shift = (n) => {
    const d = new Date(now.getTime() + n * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  store.setMilestones([
    { id: 'ra', title: '三天后·提前7天', date: shift(3), done: false, remindDaysBefore: 7 },
    { id: 'rb', title: '三天后·提前1天', date: shift(3), done: false, remindDaysBefore: 1 },
  ]);
  const an = loadPage('analysis');
  an.onLoad();
  const byId = {};
  an.data.milestones.forEach((m) => { byId[m.id] = m; });
  T('分析页：提前 7 天的算「临近」', byId.ra.urgent === true, JSON.stringify(byId.ra));
  T('  提前 1 天的不算「临近」', byId.rb.urgent === false, JSON.stringify(byId.rb));
  T('  两条阈值不同，说明读的是各自的设置', byId.ra.urgent !== byId.rb.urgent);

  store.resetAll();
}

// ══ 22. 课表识别 · 周次过滤与识别记录 ══
// 桌面版 CalendarScan.tsx:284-288 的「只导入本周」是拿**用户编辑过的 weeksText**
// 现算的，不是拿解析时的 weeks 快照；并且本周不上的课直接不显示。
// 桌面版 332-346 还会把每次识别存成一条记录（store.calendars），
// 和「校历识别」共用同一份数据，所以两个页面的记录会汇总在一起。
section('[22] 课表识别 · 周次过滤与识别记录');
{
  store.resetAll();
  store.setSettings({ semesterStart: '2026-09-07' });
  const p = loadPage('coursescan');
  p.onLoad();
  const cur = p.data.currentWeekNum;

  // 用真实格式「N-N周」（解析器要求带「周」字，和桌面版一致）
  const inR = `${cur}-${cur + 8}周`;
  const outR = `${cur + 4}-${cur + 12}周`;
  p.onPasteInput({ detail: { value: `周一\n本周的课，1-2节，A101，${inR}\n不在本周的课，3-4节，B202，${outR}` } });
  p.parsePasted();
  T('解析出 2 门课', p.data.draft.length === 2, String(p.data.draft.length));
  T('  weeksText 被正确填充（不是 undefined）',
    !!p.data.draft[0].weeksText && !!p.data.draft[1].weeksText,
    JSON.stringify(p.data.draft.map((d) => d.weeksText)));

  p.setData({ onlyThisWeek: true });
  p._recompute();
  T('只导入本周 → 留下含本周的课', p.data.draft.some((d) => d.name === '本周的课'),
    p.data.draft.map((d) => d.name).join(','));
  T('  过滤掉不含本周的课', !p.data.draft.some((d) => d.name === '不在本周的课'),
    p.data.draft.map((d) => d.name).join(','));

  // 改周次后过滤必须立刻跟着变（旧代码读的是解析时的 weeks 快照）
  const outRow = p._allDraft.find((c) => c.name === '不在本周的课');
  p.onWeeksEdit({ currentTarget: { dataset: { id: outRow.id } }, detail: { value: '1-30' } });
  T('改周次后 weeks 快照同步更新',
    JSON.stringify(p._allDraft.find((c) => c.id === outRow.id).weeks)
    === JSON.stringify(Array.from({ length: 30 }, (_, i) => i + 1)));
  p.setData({ onlyThisWeek: true });
  p._recompute();
  T('  改成本周后立刻出现在「只导入本周」里',
    p.data.draft.some((d) => d.name === '不在本周的课'), p.data.draft.map((d) => d.name).join(','));

  // 旧代码无条件保留 nonThisWeek 行，改成含本周的周次后语义也不对
  p.setData({ onlyThisWeek: false });
  p.onPasteInput({ detail: { value: '周三\n形势与政策，9-10节，教二-101，非本周\n大学物理，1-2节，理科楼，1-16周' } });
  p.parsePasted();
  const pol = p._allDraft.find((c) => c.name === '形势与政策');
  T('非本周的课被标记 nonThisWeek', !!pol && pol.nonThisWeek === true);
  p.onWeeksEdit({ currentTarget: { dataset: { id: pol.id } }, detail: { value: '1-16' } });
  p.setData({ onlyThisWeek: true });
  p._recompute();
  T('  改成 1-16 周后本周有课就显示出来',
    p.data.draft.some((d) => d.name === '形势与政策'), p.data.draft.map((d) => d.name).join(','));

  // 没写周次 = 每周都上，必须保留
  p.setData({ onlyThisWeek: false });
  p.onPasteInput({ detail: { value: '周二\n体育，5-6节，体育馆' } });
  p.parsePasted();
  p.setData({ onlyThisWeek: true });
  p._recompute();
  T('没写周次的课当成每周都上（保留）', p.data.draft.some((d) => d.name === '体育'),
    p.data.draft.map((d) => d.name).join(','));

  // 识别记录
  store.resetAll();
  p.onLoad();
  T('  初始没有识别记录', p.data.docs.length === 0);
  p.onPasteInput({ detail: { value: '周一\n高等数学，1-2节，教一A101，1-16周' } });
  p.onDocName({ detail: { value: '  2026 秋 课表  ' } });
  p.parsePasted();
  p.saveDoc();
  T('存档写进 store.calendars', (store.shape.calendars || []).length === 1);
  T('  名字两端空白被去掉', store.shape.calendars[0].name === '2026 秋 课表',
    JSON.stringify(store.shape.calendars[0].name));
  T('  记了行数', store.shape.calendars[0].lineCount > 0, String(store.shape.calendars[0].lineCount));
  T('  带创建时间', !!store.shape.calendars[0].createdAt);
  p.refresh();
  T('  刷新后列表里能看见', p.data.docs.length === 1);
  T('  带日期文本', /^\d{4}-\d{2}-\d{2}$/.test(p.data.docs[0].createdText), p.data.docs[0].createdText);

  store.resetAll();
  p.onLoad();
  p.onDocName({ detail: { value: '' } });
  p.onPasteInput({ detail: { value: '周一\n高等数学，1-2节，教一A101，1-16周' } });
  p.parsePasted();
  p.saveDoc();
  T('名字留空时用「课表」兜底', store.shape.calendars[0].name === '课表',
    JSON.stringify(store.shape.calendars[0].name));

  // 空白内容不能存档（rawLines 只在解析成功后写，不能拿它判断）
  store.resetAll();
  p.onLoad();
  p.onPasteInput({ detail: { value: '   \n  ' } });
  p.saveDoc();
  T('只有空白时拒绝存档', (store.shape.calendars || []).length === 0);
  // 解析成功后清空输入框但不重新解析，也必须拒绝
  p.onPasteInput({ detail: { value: '周一\n高等数学，1-2节，教一A101，1-16周' } });
  p.parsePasted();
  p.onPasteInput({ detail: { value: '' } });
  p.saveDoc();
  T('  清空后即使没重新解析也拒绝', (store.shape.calendars || []).length === 0);

  // 删除记录
  store.resetAll();
  store.setCalendars([
    { id: 'd1', name: 'A', lineCount: 3, createdAt: '2026-10-01T00:00:00.000Z', events: [] },
    { id: 'd2', name: 'B', lineCount: 5, createdAt: '2026-10-02T00:00:00.000Z', events: [] },
  ]);
  p.refresh();
  T('记录按时间倒序（最新在前）', p.data.docs[0].id === 'd2', p.data.docs.map((d) => d.id).join(','));
  p.deleteDoc({ currentTarget: { dataset: { id: 'd1' } } });
  T('删除指定记录', (store.shape.calendars || []).every((x) => x.id !== 'd1'));
  T('  只剩 1 条', (store.shape.calendars || []).length === 1);

  // 删记录不影响课程
  store.resetAll();
  store.setCourses([{ id: 'c1', name: '高等数学', day: 1, start: '08:00', end: '09:40', weeks: [1] }]);
  store.setCalendars([{ id: 'd1', name: '旧记录', lineCount: 1, createdAt: '2026-10-01T00:00:00.000Z', events: [] }]);
  p.refresh();
  p.deleteDoc({ currentTarget: { dataset: { id: 'd1' } } });
  T('删记录不会删课程', (store.shape.courses || []).length === 1);

  // 和校历识别共用 store.calendars
  store.resetAll();
  store.setCalendars([{ id: 'cal1', name: '校历', lineCount: 0, createdAt: '2026-10-05T00:00:00.000Z',
    events: [{ date: '2026-10-01', title: '国庆' }] }]);
  p.refresh();
  T('校历识别存的记录在这里也看得到', p.data.docs.length === 1);
  T('  能看出它是校历（事件数 > 0）', p.data.docs[0].eventCount === 1, String(p.data.docs[0].eventCount));

  store.resetAll();
}

// ══ 23. 总览 · 置顶卡就地编辑 + 重要事项补位 ══
// 桌面版 Dashboard.tsx:219-257 的置顶倒计时卡片可以直接改标题和日期
// （hover 出铅笔）。手机没有 hover，改成点卡片进编辑态。
// Dashboard.tsx:541-581 还规定：运动打卡关掉时，那张卡片由「重要事项」补位，
// 并且指标卡副标题写「最近一项：<名字>」。
section('[23] 总览 · 置顶卡就地编辑与重要事项补位');
{
  const now = store.today;
  const shift = (n) => {
    const d = new Date(now.getTime() + n * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const boot = (p) => { p.onLoad(); p.refresh(); };

  // ── 置顶卡就地编辑 ──
  store.resetAll();
  store.setSettings({ runEnabled: false });
  store.setMilestones([{ id: 'a', title: '期末考试', date: shift(10), emoji: '📝', done: false, pinned: true }]);
  const p = loadHostPage('dashboard');
  boot(p);
  T('钉住的事项出现在倒计时条上', p.data.pinned.length === 1, String(p.data.pinned.length));
  T('  初始不在编辑态', p.data.pinEditId === '', JSON.stringify(p.data.pinEditId));

  p.startPinEdit(ev({ id: 'a' }));
  T('点卡片进入编辑态', p.data.pinEditId === 'a');
  T('  草稿标题回填原值', p.data.pinDraftTitle === '期末考试', p.data.pinDraftTitle);
  T('  草稿日期回填原值', p.data.pinDraftDate === shift(10), p.data.pinDraftDate);

  p.onPinTitle(ev({}, '  期末数学考试  '));
  p.onPinDate(ev({}, shift(20)));
  p.savePinEdit(ev({ id: 'a' }));
  T('保存后标题更新（两端空白去掉）', store.shape.milestones[0].title === '期末数学考试',
    store.shape.milestones[0].title);
  T('  日期更新', store.shape.milestones[0].date === shift(20), store.shape.milestones[0].date);
  T('  退出编辑态', p.data.pinEditId === '');
  T('  仍钉在总览上', store.shape.milestones[0].pinned === true);

  // 桌面版 saveMilestone：标题为空就直接退出编辑、不写数据
  p.startPinEdit(ev({ id: 'a' }));
  p.onPinTitle(ev({}, '   '));
  p.savePinEdit(ev({ id: 'a' }));
  T('标题留空时不保存（改回原值）', store.shape.milestones[0].title === '期末数学考试',
    store.shape.milestones[0].title);
  T('  退出编辑态', p.data.pinEditId === '');

  p.startPinEdit(ev({ id: 'a' }));
  p.onPinTitle(ev({}, '改了但不保存'));
  p.cancelPinEdit();
  T('取消后不写数据', store.shape.milestones[0].title === '期末数学考试');
  T('  草稿清空', p.data.pinDraftTitle === '');

  // 只改标题和日期，别的字段不能被抹掉
  store.resetAll();
  store.setSettings({ runEnabled: false });
  store.setMilestones([{ id: 'b', title: '竞赛', date: shift(5), emoji: '🏆', time: '09:00',
    place: '体育馆', done: false, pinned: true, remindDaysBefore: 3 }]);
  boot(p);
  p.startPinEdit(ev({ id: 'b' }));
  p.onPinTitle(ev({}, '数学竞赛'));
  p.savePinEdit(ev({ id: 'b' }));
  const s0 = store.shape.milestones[0];
  T('就地编辑保留 emoji', s0.emoji === '🏆', s0.emoji);
  T('  保留时间', s0.time === '09:00', s0.time);
  T('  保留地点', s0.place === '体育馆', s0.place);
  T('  保留提前提醒天数', s0.remindDaysBefore === 3, String(s0.remindDaysBefore));
  T('  保留钉住状态', s0.pinned === true);

  // ── 重要事项卡片补位 ──
  store.resetAll();
  store.setSettings({ runEnabled: false });
  store.setMilestones([
    { id: 'x', title: '三个月后', date: shift(90), done: false },
    { id: 'y', title: '五天后', date: shift(5), done: false },
    { id: 'z', title: '已过期', date: shift(-3), done: false },
    { id: 'w', title: '已完成', date: shift(2), done: true },
  ]);
  boot(p);
  T('运动打卡关掉时卡片走补位分支', p.data.runEnabled === false);
  T('  待办数只算未完成（3）', p.data.undoneCount === 3, String(p.data.undoneCount));
  T('  最近一项跳过已过期/已完成 →「五天后」', p.data.nextMilestoneText === '五天后', p.data.nextMilestoneText);

  store.resetAll();
  store.setSettings({ runEnabled: false });
  boot(p);
  T('没有事项时副标题为空串', p.data.nextMilestoneText === '', JSON.stringify(p.data.nextMilestoneText));
  T('  待办数为 0', p.data.undoneCount === 0);

  // ── 指标卡副标题 ──
  const card = () => p.data.stats.find((s) => s.key === 'milestone');
  store.resetAll();
  store.setSettings({ runEnabled: false });
  store.setMilestones([{ id: 'm', title: '毕业论文', date: shift(30), done: false }]);
  boot(p);
  T('指标卡副标题「最近一项：毕业论文」', card() && card().sub === '最近一项：毕业论文',
    JSON.stringify(card() && card().sub));
  T('  value 是待办数', card() && card().value === '1', JSON.stringify(card() && card().value));

  store.resetAll();
  store.setSettings({ runEnabled: false });
  store.setMilestones([{ id: 'm', title: '只有过期的', date: shift(-5), done: false }]);
  boot(p);
  T('只剩过期事项时退回「待处理」', card() && card().sub === '待处理', JSON.stringify(card() && card().sub));
  T('  value 仍是 1', card() && card().value === '1', JSON.stringify(card() && card().value));

  store.resetAll();
  store.setSettings({ runEnabled: false });
  boot(p);
  T('空列表时是「还没有待办事项」', card() && card().sub === '还没有待办事项',
    JSON.stringify(card() && card().sub));

  store.resetAll();
  store.setSettings({ runEnabled: false });
  store.setMilestones([
    { id: 'a', title: '三个月后', date: shift(90), done: false },
    { id: 'b', title: '五天后', date: shift(5), done: false },
  ]);
  boot(p);
  T('多个未完成时取日期最近的', card() && card().sub === '最近一项：五天后', JSON.stringify(card() && card().sub));
  T('  value 是 2', card() && card().value === '2', JSON.stringify(card() && card().value));

  store.resetAll();
  store.setSettings({ runEnabled: true });
  boot(p);
  T('运动打卡开启时指标卡是「运动打卡」', !!p.data.stats.find((s) => s.key === 'run'));
  T('  没有 milestone 指标卡', !card());

  store.resetAll();
}

// ══ 24. 小程序运行时兼容性 ══
// 这一节盯的是一类**在 Node 里永远测不出来**的 bug：
// 代码用了 Node 才有的东西（require.cache / require.resolve / __dirname /
// process.cwd() / require('path')），Node 里跑得好好的，一进小程序就在
// 模块顶层抛异常。而页面注册失败的表现是「点这个 tab 没反应」——
// 不白屏、不弹窗、不报错给用户看，只有开发者工具控制台里有一行红字。
//
// 实际踩到过两次：
//   · tabHost.js 用 require.resolve + delete require.cache 清模块缓存
//   · 三个宿主页传 base: __dirname 给 buildHost
// 两次都是「点总览/待办/健康没反应，只有课表和设置能点开」。
// 所以这里既做静态扫描，也真的在「没有这些 API」的环境里加载一遍页面。
section('[24] 小程序运行时兼容性（不能用 Node 专有 API）');
{
  const fs = require('fs');
  const walk = (dir, out) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'tools' && e.name !== 'node_modules') walk(p, out); }
      else if (e.name.endsWith('.js')) out.push(p);
    }
    return out;
  };

  // ── 24a. 静态扫描：源码里（去掉注释后）不该出现这些标识符 ──
  const BANNED = [
    { re: /(^|[^.\w$])__dirname\b/, what: '__dirname' },
    { re: /(^|[^.\w$])__filename\b/, what: '__filename' },
    { re: /\brequire\s*\.\s*cache\b/, what: 'require.cache' },
    { re: /\brequire\s*\.\s*resolve\b/, what: 'require.resolve' },
    { re: /\bprocess\s*\.\s*cwd\b/, what: 'process.cwd()' },
    { re: /\brequire\s*\(\s*['"](path|fs|os|util|child_process)['"]\s*\)/, what: "require('path'/'fs'/…)" },
  ];
  const hits = [];
  for (const f of walk(MP, [])) {
    let src = fs.readFileSync(f, 'utf8');
    src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1'); // 去注释（保留 http://）
    for (const b of BANNED) {
      if (b.re.test(src)) hits.push(`${path.relative(MP, f)} → ${b.what}`);
    }
  }
  T('源码里没有 Node 专有 API', hits.length === 0, hits.join('; '));

  // tabHost 里不该再出现「路径基准」参数
  const hostSrc = fs.readFileSync(path.join(MP, 'utils', 'tabHost.js'), 'utf8');
  T('  buildHost 不再依赖 opts.base', !/opts\.base\s*(\|\||\))/.test(hostSrc));

  // ── 24b. 宿主页 loadDefs 的 require 目标要落到真实文件 ──
  //
  // ⚠️ 这里的路径是 pages/<n>/def.js，不是 pages/<n>/<n>.js。
  // 小程序的打包器**不允许 require 另一个页面文件**：
  //   require('./pages/today/today') → module 'pages/today/today.js' is not defined
  // 所以每个可被合并的子模块，定义都住在同目录的 def.js 里（普通模块，可以 require），
  // 页面文件 <n>.js 只是一层薄壳：require('./def') + Page(DEFINITION)。
  {
    const hosts = ['dashboard', 'tasks', 'healthhub'];
    const bad = [];
    for (const h of hosts) {
      const src = fs.readFileSync(path.join(MP, 'pages', h, h + '.js'), 'utf8');
      const re = /require\('(\.\.[^']+)'\)/g;
      let mm;
      const seen = [];
      while ((mm = re.exec(src)) !== null) {
        const rel = mm[1];
        if (rel.indexOf('/def') < 0) continue; // 只查合并子模块的 require
        seen.push(rel);
        const real = path.resolve(MP, 'pages', h, rel) + '.js';
        if (!fs.existsSync(real)) bad.push(`${h}: ${rel} → 不存在`);
      }
      if (seen.length === 0) bad.push(`${h}: 没有找到 loadDefs 里的 require`);
    }
    T('  三个宿主页 loadDefs 的 require 都指向真实 def.js', bad.length === 0, bad.join('; '));

    // 每个 def.js 必须是「普通模块」：有导出、且自己不调 Page()
    const defs = ['todos', 'assignments', 'today', 'diet', 'run', 'health'];
    const bad2 = [];
    for (const n of defs) {
      const f = path.join(MP, 'pages', n, 'def.js');
      if (!fs.existsSync(f)) { bad2.push(`${n}/def.js 不存在`); continue; }
      const s = fs.readFileSync(f, 'utf8');
      if (!/module\.exports\s*=\s*DEFINITION/.test(s)) bad2.push(`${n}/def.js 没有导出 DEFINITION`);
      if (/^\s*Page\s*\(/m.test(s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1'))) {
        bad2.push(`${n}/def.js 里不该有 Page()`);
      }
      // 页面薄壳要注册
      const w = fs.readFileSync(path.join(MP, 'pages', n, n + '.js'), 'utf8');
      if (!/Page\(DEFINITION\)/.test(w)) bad2.push(`${n}/${n}.js 没有注册 Page`);
      if (new RegExp(`require\\('\\./def'\\)`).test(w) === false) bad2.push(`${n}/${n}.js 没有 require('./def')`);
    }
    T('  6 个子模块的 def.js / 薄壳都符合约定', bad2.length === 0, bad2.join('; '));
  }

  // ── 24c. 在「没有 Node API」的环境里真的加载一遍每个页面 ──
  // 这是最关键的一条：静态扫描可能漏（比如间接引用），
  // 但把 require 换成受限版本后，任何 Node 专有用法都会当场抛。
  const Module = require('module');
  const realRequire = Module.prototype.require;
  const realCache = Module.prototype.require.cache;
  const realResolve = Module.prototype.require.resolve;
  const load = (abs) => {
    const cands = [abs, abs + '.js', path.join(abs, 'index.js')];
    const real = cands.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
    if (!real) throw new Error('module not found: ' + abs);
    if (!Module._cache[real]) {
      const mm = new Module(real); mm.filename = real; mm.paths = [];
      Module._cache[real] = mm; mm.load(real);
    }
    return Module._cache[real].exports;
  };
  // 伪装成小程序：require 上既没有 cache 也没有 resolve，path/fs 也拿不到
  const strictRequire = function (mod) { return load(path.resolve(path.dirname(this.filename), mod)); };
  strictRequire.cache = undefined;
  strictRequire.resolve = undefined;
  Module.prototype.require = function (mod) {
    if (mod === 'path' || mod === 'fs') throw new ReferenceError(`module '${mod}' is not defined`);
    return strictRequire.call(this, mod);
  };
  delete Module.prototype.require.cache;
  delete Module.prototype.require.resolve;

  const pageNames = ['dashboard', 'courses', 'tasks', 'healthhub', 'settings'];
  const results = [];
  try {
    for (const name of pageNames) {
      const f = path.join(MP, 'pages', name, name + '.js');
      let reg = null;
      global.Page = (d) => { reg = d; };
      delete Module._cache[f];
      try {
        load(f);
      } catch (e) {
        results.push(`${name}: ${e.message}`);
        continue;
      }
      if (!reg) { results.push(`${name}: Page() 未被调用`); continue; }
      for (const k of ['data', 'onLoad', 'onShow', 'onUnload']) {
        if (reg[k] === undefined) results.push(`${name}: 缺 ${k}`);
      }
      // 光注册成功不够 —— 子模块的 data 是 host.onLoad() 里才并进来的，
      // 而且 onLoad 里还会调子模块的 onLoad，那里同样是 Node 专有 API
      // 的高发区。所以这里也要真跑一遍。
      const inst = Object.assign({}, reg, {
        data: JSON.parse(JSON.stringify(reg.data || {})),
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
      try {
        inst.onLoad();
      } catch (e) {
        results.push(`${name}: onLoad 抛 ${e.message}`);
      }
      // 合并页的 data 键应该远多于单个页面（子模块的都并进来了）。
      // 取不到子模块时 buildHost 只 console.error 再 continue，
      // 页面照样注册成功、onLoad 也不抛 —— 只有键数能暴露。
      const n = Object.keys(inst.data || {}).length;
      const minKeys = { dashboard: 20, tasks: 20, healthhub: 20 }[name] || 5;
      if (n < minKeys) results.push(`${name}: data 只有 ${n} 个键（应 >= ${minKeys}，子模块可能没挂上）`);
    }
  } finally {
    // 一定要还原，否则后面的用例全废
    Module.prototype.require = realRequire;
    Module.prototype.require.cache = realCache;
    Module.prototype.require.resolve = realResolve;
  }
  T('  5 个 tabBar 页在「无 Node API」环境下都能注册 + onLoad 通过', results.length === 0, results.join('; '));

  // ── 24d. 三个宿主页确实取到了全部子模块 ──
  // buildHost 取不到子模块时只 console.error 然后 continue，
  // 页面照样注册成功，只是分段是空的 —— 静态和注册检查都发现不了。
  // 注意：这里必须拿 buildHost 组装出来的那个对象（带 segments/onLoad），
  // 不是页面 export 的 DEFINITION。
  const expectMods = { dashboard: ['总览', '今日'], tasks: ['待办', '作业'], healthhub: ['饮食', '运动', '体重作息'] };
  {
    const { buildHost } = require(path.join(MP, 'utils', 'tabHost.js'));
    const specs = {
      dashboard: {
        segments: [{ id: 'dashboard', label: '总览' }, { id: 'today', label: '今日' }],
        selfDef: loadHostPage('dashboard'), selfId: 'dashboard', selfLabel: '总览',
        // 用 loadDefs（和宿主页真实写法一致）：
        // require 的字面量必须是 def.js，不能是页面文件
        // eslint-disable-next-line global-require
        loadDefs: () => ({ today: require(path.join(MP, 'pages', 'today', 'def.js')) }),
      },
      tasks: {
        segments: [{ id: 'todos', label: '待办' }, { id: 'assignments', label: '作业' }],
        loadDefs: () => ({
          todos: require(path.join(MP, 'pages', 'todos', 'def.js')),
          assignments: require(path.join(MP, 'pages', 'assignments', 'def.js')),
        }),
      },
      healthhub: {
        segments: [{ id: 'diet', label: '饮食' }, { id: 'run', label: '运动' }, { id: 'health', label: '体重作息' }],
        loadDefs: () => ({
          diet: require(path.join(MP, 'pages', 'diet', 'def.js')),
          run: require(path.join(MP, 'pages', 'run', 'def.js')),
          health: require(path.join(MP, 'pages', 'health', 'def.js')),
        }),
      },
    };
    for (const name of Object.keys(expectMods)) {
      const host = buildHost(specs[name]);
      // 子模块的 data 是在 host.onLoad() 里才并进来的（见 tabHost.js），
      // 所以必须先跑一遍 onLoad 再检查。
      const inst = Object.assign({}, host, {
        data: JSON.parse(JSON.stringify(host.data || {})),
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
      let err = '';
      try { inst.onLoad(); } catch (e) { err = e.message; }
      const keys = Object.keys(inst.data || {});
      const missing = [];
      for (const id of specs[name].segments.map((s) => s.id)) {
        const hasPrefix = keys.some((k) => k.indexOf(id + '_') === 0);
        if (!hasPrefix) missing.push(id);
      }
      T(`  ${name} 的子模块都挂上了（${specs[name].segments.map((s) => s.label).join('/')}）`,
        missing.length === 0 && !err,
        err ? `onLoad 抛 ${err}` : `缺 [${missing.join(',')}]，data 键 ${keys.length} 个`);
    }
  }
}
console.log('\n══════════════════════════════');
console.log(`  验收: ${ok} 通过 / ${bad} 失败`);
process.exit(bad ? 1 : 0);
