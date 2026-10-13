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
global.wx = {
  getStorageSync: (k) => (mem[k] === undefined ? '' : mem[k]),
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: (k) => { delete mem[k]; },
  getStorageInfoSync: () => ({ keys: Object.keys(mem), currentSize: 1, limitSize: 10240 }),
  clearStorageSync: () => { for (const k of Object.keys(mem)) delete mem[k]; },
  showToast: () => {},
  showModal: (o) => o.success && o.success({ confirm: true }),
  setClipboardData: (o) => o.success && o.success(),
  getClipboardData: (o) => o.success && o.success({ data: '' }),
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

console.log('\n══════════════════════════════');
console.log(`  验收: ${ok} 通过 / ${bad} 失败`);
process.exit(bad ? 1 : 0);
