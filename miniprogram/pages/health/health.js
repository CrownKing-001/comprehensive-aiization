// 体重作息：身体数据、体重曲线、睡眠曲线、训练打卡日历
//
// 注意：饮食相关的记录 / 统计 / 目标已全部搬到「饮食记录」页，
// 这里不再出现任何饮食入口与重复统计 —— 一处记录、一处查看。
//
// 移植自桌面版 src/views/Health.tsx（曲线由 SVG 改为 Canvas）

const { store } = require('../../store/store');
const { currentWeek } = require('../../utils/plan');
const { fromKey, toKey, addDays } = require('../../utils/storage');
const { initChart, redrawChart, trendSummary } = require('../../utils/chart');

/** 睡眠目标（小时）—— 睡眠不足会直接影响恢复与增肌效率 */
const SLEEP_TARGET = 7.5;

/** 把「训练日」设置串解析成 1(周一)~7(周日) 的集合，去空白、去重、丢掉越界值 */
function parseTrainDays(raw) {
  const out = new Set();
  for (const part of String(raw || '').split(/[,，]/)) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n >= 1 && n <= 7) out.add(n);
  }
  return out;
}

const DEFINITION = {
  data: {
    ready: false,
    themeClass: '',

    // 录入
    weight: '',
    sleep: '',
    steps: '',

    // 编辑
    editDate: null,
    eWeight: '',
    eSleep: '',
    eSteps: '',

    // 概览卡
    stats: [],

    // 曲线
    weightPoints: [],
    sleepPoints: [],
    sleepSummary: null,
    sleepTarget: SLEEP_TARGET,

    // 训练打卡
    weekDays: [],
    doneCount: 0,
    hasPlan: false,
    week: 1,

    // 历史
    logs: [],
  },

  onLoad() {
    this._unsub = store.subscribe(() => this.refresh());
    if (store.ready) this.refresh();
  },

  onReady() {
    // canvas 节点就绪后初始化曲线
    initChart(this, 'weightCanvas', () => ({
      points: this.data.weightPoints,
      color: '#10b981',
    }));
    initChart(this, 'sleepCanvas', () => ({
      points: this.data.sleepPoints,
      color: '#38bdf8',
      target: SLEEP_TARGET,
      targetLabel: `目标 ${SLEEP_TARGET}h`,
      unit: 'h',
      warnBelow: true,
    }));
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
    const logs = s.health || [];
    const done = s.trainDone || [];
    const today = store.today;
    const todayKey = store.todayKey;

    const sortedLogs = [...logs].sort((a, b) => b.date.localeCompare(a.date));
    const latest = sortedLogs[0];

    const weekLogs = logs.filter((l) => fromKey(l.date) >= addDays(today, -6));
    const sleepVals = weekLogs.filter((l) => l.sleep);
    const avgSleep = sleepVals.length
      ? (sleepVals.reduce((sum, l) => sum + l.sleep, 0) / sleepVals.length).toFixed(1)
      : '--';

    const semesterStart = fromKey(settings.semesterStart);
    const week = currentWeek(today, semesterStart);

    // 用户自己定的训练日（设置 → 训练日）；留空则不区分训练日与休息日
    const trainDays = parseTrainDays(settings.trainDays);
    const hasPlan = trainDays.size > 0;

    /** 某一天是否安排了训练（周一=1 … 周日=7） */
    const isTrainDay = (key) => {
      if (!hasPlan) return false;
      const d = fromKey(key).getDay();
      return trainDays.has(d === 0 ? 7 : d);
    };

    // 本周 7 天的训练打卡
    const monday = addDays(today, -((today.getDay() + 6) % 7));
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i);
      const key = toKey(d);
      weekDays.push({
        key,
        day: d.getDate(),
        wd: '日一二三四五六'[d.getDay()],
        isToday: key === todayKey,
        checked: done.indexOf(key) >= 0,
        isPlan: isTrainDay(key),
      });
    }
    const doneCount = weekDays.filter((d) => d.checked).length;

    const stats = [
      {
        tone: 'emerald',
        icon: '⚖️',
        label: '最新体重',
        value: latest && latest.weight ? `${latest.weight} kg` : '--',
        sub: latest && latest.weight ? '继续记录，看趋势曲线' : '开始记录吧',
      },
      {
        tone: 'sky',
        icon: '🌙',
        label: '近 7 天均睡眠',
        value: `${avgSleep} h`,
        sub: `目标 ≥ ${SLEEP_TARGET}h，恢复关键`,
      },
      {
        tone: 'violet',
        icon: '👣',
        label: '今日步数',
        value: latest && latest.steps ? `${latest.steps}` : '--',
        sub: '配合训练打卡更有效',
      },
      {
        tone: 'amber',
        icon: '🏋️',
        label: '本周训练',
        value: `${doneCount}/7 天`,
        sub: '在下方日历中点选',
      },
    ];

    // 体重曲线：最近 14 条有体重值的记录
    const weightPoints = [...logs]
      .filter((l) => l.weight)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14)
      .map((l) => ({ date: l.date, value: l.weight }));

    // 睡眠曲线：最近 14 条有睡眠值的记录
    const sleepPoints = [...logs]
      .filter((l) => typeof l.sleep === 'number' && l.sleep > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14)
      .map((l) => ({ date: l.date, value: l.sleep }));

    const sleepSummary = trendSummary(sleepPoints, SLEEP_TARGET);

    this.setData(
      {
        ready: true,
        themeClass: settings.theme === 'light' ? 'theme-light' : '',
        stats,
        weightPoints,
        sleepPoints,
        sleepSummary: sleepSummary
          ? {
              ...sleepSummary,
              text:
                Number(sleepSummary.avgText) >= SLEEP_TARGET
                  ? `近 ${sleepSummary.total} 天平均 ${sleepSummary.avgText}h，达标 ✅`
                  : `近 ${sleepSummary.total} 天平均 ${sleepSummary.avgText}h，低于 ${SLEEP_TARGET}h 目标`,
            }
          : null,
        weekDays,
        doneCount,
        hasPlan,
        week,
        logs: sortedLogs.map((l) => ({
          date: l.date,
          weight: l.weight === undefined ? '—' : String(l.weight),
          sleep: l.sleep === undefined ? '—' : String(l.sleep),
          steps: l.steps === undefined ? '—' : String(l.steps),
        })),
      },
      () => {
        redrawChart(this, 'weightCanvas', () => ({ points: this.data.weightPoints, color: '#10b981' }));
        redrawChart(this, 'sleepCanvas', () => ({
          points: this.data.sleepPoints,
          color: '#38bdf8',
          target: SLEEP_TARGET,
          targetLabel: `目标 ${SLEEP_TARGET}h`,
          unit: 'h',
          warnBelow: true,
        }));
      }
    );
  },

  // ── 录入 ──────────────────────────────────────────
  onWeight(e) { this.setData({ weight: e.detail.value }); },
  onSleep(e) { this.setData({ sleep: e.detail.value }); },
  onSteps(e) { this.setData({ steps: e.detail.value }); },

  save() {
    const { weight, sleep, steps } = this.data;
    if (!weight && !sleep && !steps) {
      wx.showToast({ title: '至少填一项', icon: 'none' });
      return;
    }
    const logs = store.shape.health || [];
    const todayKey = store.todayKey;
    const rest = logs.filter((l) => l.date !== todayKey);
    const prev = logs.find((l) => l.date === todayKey) || { date: todayKey };
    store.setHealth([
      ...rest,
      {
        date: todayKey,
        weight: weight ? Number(weight) : prev.weight,
        sleep: sleep ? Number(sleep) : prev.sleep,
        steps: steps ? Number(steps) : prev.steps,
      },
    ]);
    this.setData({ weight: '', sleep: '', steps: '' });
    wx.showToast({ title: '已记录', icon: 'success' });
  },

  // ── 编辑 ──────────────────────────────────────────
  startEdit(e) {
    const date = e.currentTarget.dataset.date;
    const logs = store.shape.health || [];
    const l = logs.find((x) => x.date === date);
    if (!l) return;
    this.setData({
      editDate: date,
      eWeight: l.weight === undefined ? '' : String(l.weight),
      eSleep: l.sleep === undefined ? '' : String(l.sleep),
      eSteps: l.steps === undefined ? '' : String(l.steps),
    });
  },

  cancelEdit() {
    this.setData({ editDate: null });
  },

  onEWeight(e) { this.setData({ eWeight: e.detail.value }); },
  onESleep(e) { this.setData({ eSleep: e.detail.value }); },
  onESteps(e) { this.setData({ eSteps: e.detail.value }); },

  saveEdit() {
    const date = this.data.editDate;
    if (!date) return;
    const logs = store.shape.health || [];
    store.setHealth(
      logs.map((l) =>
        l.date === date
          ? {
              date: l.date,
              weight: this.data.eWeight ? Number(this.data.eWeight) : undefined,
              sleep: this.data.eSleep ? Number(this.data.eSleep) : undefined,
              steps: this.data.eSteps ? Number(this.data.eSteps) : undefined,
            }
          : l
      )
    );
    this.setData({ editDate: null });
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  removeLog(e) {
    const date = e.currentTarget.dataset.date;
    const logs = store.shape.health || [];
    wx.showModal({
      title: '删除记录',
      content: `确定删除 ${date} 的身体数据吗？`,
      success: (r) => {
        if (!r.confirm) return;
        store.setHealth(logs.filter((l) => l.date !== date));
      },
    });
  },

  // ── 训练打卡 ──────────────────────────────────────
  toggleTrain(e) {
    const key = e.currentTarget.dataset.key;
    const done = store.shape.trainDone || [];
    if (done.indexOf(key) >= 0) {
      store.setTrainDone(done.filter((d) => d !== key));
    } else {
      store.setTrainDone([...done, key]);
    }
  },

  goSettings() {
    // 「设置」已经是 tabBar 页面，只能用 switchTab；
    // 用 navigateTo 会静默失败（不报错也不跳）。
    wx.switchTab({ url: '/pages/settings/settings' });
  },

  /** 弹层内部点击：阻止冒泡到遮罩，不做任何事 */
  noop() {},
};

Page(DEFINITION);

// 这个页面同时被合并页当作子模块使用（见 utils/tabHost.js）。
// 小程序页面模块不 export 定义，这里显式导出一份供 tabHost 取用。
module.exports = DEFINITION;