// 运动打卡：通用打卡页。
// 不预设任何考核规则：目标次数、打卡类型、起止日期全部读「设置」里用户自己填的值，
// 没有填的部分就不显示对应的提示，页面只负责「计数 + 进度 + 记录管理」。
// 移植自桌面版 src/views/Run.tsx

const { store } = require('../../store/store');
const { currentWeek } = require('../../utils/plan');
const { fromKey, toKey, daysUntil } = require('../../utils/storage');

/** 把设置里的类型串拆成选项：中英文逗号都当分隔符，去空白、去重、丢掉空项 */
function parseTypes(raw) {
  return [...new Set(String(raw || '').split(/[,，]/).map((s) => s.trim()).filter(Boolean))];
}

const DEFINITION = {
  data: {
    ready: false,
    themeClass: '',

    // 进度
    done: 0,
    target: 1,
    percent: 0,
    barWidth: 0,
    remain: 0,
    types: [],
    todayCount: 0,

    // 时间
    week: 1,
    weeksLeft: 0,
    pace: 0,
    daysLeft: null,
    notStarted: false,
    startedDays: 0,
    ended: false,
    hasStart: false,
    hasEnd: false,
    runStart: '',
    runEnd: '',

    // 筛选与记录
    filter: 'all',
    filterOptions: [],
    records: [],
    recordCount: 0,

    // 每周分布
    byWeek: [],
    weekBarMax: 3,
  },

  onLoad() {
    this._unsub = store.subscribe(() => this.refresh());
    if (store.ready) this.refresh();
  },

  onUnload() {
    if (this._unsub) this._unsub();
  },

  onShow() {
    if (store.ready) this.refresh();
  },

  refresh() {
    const s = store.shape;
    const settings = s.settings;
    const logs = s.run || [];
    const today = store.today;

    const types = parseTypes(settings.runTypes);
    const semesterStart = fromKey(settings.semesterStart);
    const week = currentWeek(today, semesterStart);
    const done = logs.length;
    const target = Math.max(1, settings.runTarget || 0);
    const todayKey = toKey(today);
    const todayCount = logs.filter((l) => l.date === todayKey).length;

    // 起止日期留空 = 不限制，相关倒计时整块不渲染
    const hasStart = Boolean(settings.runStart);
    const hasEnd = Boolean(settings.runEnd);
    const startDate = hasStart ? fromKey(settings.runStart) : null;
    const endDate = hasEnd ? fromKey(settings.runEnd) : null;
    const daysLeft = endDate ? daysUntil(endDate, today) : null;
    const notStarted = startDate ? daysUntil(startDate, today) > 0 : false;
    const ended = daysLeft !== null && daysLeft < 0;
    const startedDays = startDate ? daysUntil(startDate, today) : 0;

    // 剩余周数优先按用户填的结束日期算，没填就退回按学期总周数算
    const weeksLeft = endDate
      ? Math.max(0, Math.ceil(daysLeft / 7))
      : Math.max(0, settings.totalWeeks - week + 1);
    const remain = Math.max(0, target - done);
    // 配速建议只在有目标、有剩余周数时给，避免算出 0 或无穷大这种没意义的数字
    const pace = remain > 0 && weeksLeft > 0 ? Math.ceil(remain / weeksLeft) : 0;

    const percent = Math.min(100, Math.round((done / target) * 100));

    // 类型可能被用户在设置里改掉，记录里留下的旧类型也要能筛出来
    const extra = logs.map((l) => l.type).filter((t) => t && types.indexOf(t) < 0);
    const filterOptions = [...types, ...new Set(extra)];

    // 筛选值失效（类型被删掉）时自动回到「全部」
    const filter =
      this.data.filter !== 'all' && filterOptions.indexOf(this.data.filter) >= 0
        ? this.data.filter
        : 'all';
    const filtered = filter === 'all' ? logs : logs.filter((l) => l.type === filter);

    // 记录倒序展示（最新的在上面），保留原始索引以便删除
    const records = filtered
      .map((l, i) => ({ l, i }))
      .reverse()
      .map(({ l, i }) => ({
        key: `${l.date}-${l.type}-${i}`,
        idx: i,
        date: l.date,
        type: l.type,
        isPrimary: l.type === types[0],
      }));

    // 按周统计打卡次数
    const map = new Map();
    for (const l of logs) {
      const w = currentWeek(fromKey(l.date), semesterStart);
      map.set(w, (map.get(w) || 0) + 1);
    }
    const entries = [...map.entries()].sort((a, b) => a[0] - b[0]);
    const weekBarMax = Math.max(pace > 0 ? pace : 3, ...entries.map((x) => x[1]), 1);
    const byWeek = entries.map(([w, n]) => ({
      week: w,
      n,
      isCurrent: w === week,
      barWidth: Math.round((n / weekBarMax) * 100),
      tone: pace > 0 && n >= pace ? 'emerald' : 'amber',
    }));

    this.setData({
      ready: true,
      themeClass: settings.theme === 'light' ? 'theme-light' : '',
      done,
      target,
      percent,
      barWidth: Math.min(100, Math.round((done / target) * 100)),
      remain,
      types,
      todayCount,
      week,
      weeksLeft,
      pace,
      daysLeft,
      notStarted,
      startedDays,
      ended,
      hasStart,
      hasEnd,
      runStart: settings.runStart || '',
      runEnd: settings.runEnd || '',
      filter,
      filterOptions,
      records,
      recordCount: filtered.length,
      byWeek,
      weekBarMax,
    });
  },

  add(e) {
    const type = e.currentTarget.dataset.type;
    if (!type) return;
    const logs = store.shape.run || [];
    store.setRun([...logs, { date: store.todayKey, type }]);
    wx.showToast({ title: `${type} +1`, icon: 'success' });
  },

  undo() {
    const logs = store.shape.run || [];
    if (!logs.length) return;
    store.setRun(logs.slice(0, -1));
    wx.showToast({ title: '已撤销', icon: 'none' });
  },

  removeAt(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const logs = store.shape.run || [];
    wx.showModal({
      title: '删除记录',
      content: '确定要删除这条打卡记录吗？',
      success: (r) => {
        if (!r.confirm) return;
        store.setRun(logs.filter((_, i) => i !== idx));
      },
    });
  },

  setFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.filter }, () => this.refresh());
  },

  goSettings() {
    // 「设置」已经是 tabBar 页面，只能用 switchTab；
    // 用 navigateTo 会静默失败（不报错也不跳）。
    wx.switchTab({ url: '/pages/settings/settings' });
  },
};


// 这个页面同时被合并页当作子模块使用（见 utils/tabHost.js）。
// 小程序页面模块不 export 定义，这里显式导出一份供 tabHost 取用。
module.exports = DEFINITION;