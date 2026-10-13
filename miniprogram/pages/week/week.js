// 周计划：按教学周查看课程安排
// 移植自桌面版 src/views/Week.tsx

const { store } = require('../../store/store');
const { currentWeek } = require('../../utils/plan');
const { weekGrid, DAY_LABELS } = require('../../utils/schedule');
const { fromKey } = require('../../utils/storage');

Page({
  data: {
    ready: false,
    themeClass: '',

    // 周次
    week: 1,
    thisWeek: 1,
    maxWeek: 21,
    weekTabs: [],
    isCurrent: false,

    // 网格
    grid: [],
    weekCourses: 0,
    hasCourses: false,
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
    const today = store.today;
    const semesterStart = fromKey(settings.semesterStart);
    const thisWeek = currentWeek(today, semesterStart);
    const todayDay = today.getDay() === 0 ? 7 : today.getDay();

    // 可查看的周数：以用户设置的总周数为准，再多给 3 周缓冲，方便提前排计划
    const maxWeek = Math.max(1, settings.totalWeeks) + 3;

    // 首次进入定位到当前周；之后保留用户翻到的周次（_userWeek 为 null 表示跟随本周）
    const base = this._userWeek == null ? thisWeek : this._userWeek;
    const week = Math.min(Math.max(base, 1), maxWeek);

    const courseList = s.courses || [];
    const grid = weekGrid(courseList, week, semesterStart);

    // 每周一个 tab；当前周在未选中时标「·今」
    const weekTabs = [];
    for (let w = 1; w <= maxWeek; w++) {
      weekTabs.push({
        w,
        active: w === week,
        isThis: w === thisWeek,
        label: `第${w}周${w === thisWeek && w !== week ? '·今' : ''}`,
      });
    }

    const out = grid.map((g) => {
      const isToday = week === thisWeek && g.day === todayDay;
      const d = g.date;
      return {
        day: g.day,
        label: DAY_LABELS[g.day - 1],
        dateText: `${d.getMonth() + 1}/${d.getDate()}`,
        isToday,
        empty: g.items.length === 0,
        items: g.items.map((c, i) => ({
          key: `${c.name}-${i}`,
          name: c.name,
          start: c.start,
          end: c.end,
          place: c.place || '',
        })),
      };
    });

    const weekCourses = grid.reduce((sum, d) => sum + d.items.length, 0);

    this.setData({
      ready: true,
      themeClass: settings.theme === 'light' ? 'theme-light' : '',
      week,
      thisWeek,
      maxWeek,
      weekTabs,
      isCurrent: week === thisWeek,
      grid: out,
      weekCourses,
      hasCourses: courseList.length > 0,
    });
  },

  prevWeek() {
    const w = Math.max(1, this.data.week - 1);
    this._userWeek = w;
    this.refresh();
  },

  nextWeek() {
    const w = Math.min(this.data.maxWeek, this.data.week + 1);
    this._userWeek = w;
    this.refresh();
  },

  pickWeek(e) {
    const w = Number(e.currentTarget.dataset.w);
    this._userWeek = w;
    this.refresh();
  },

  goThisWeek() {
    this._userWeek = this.data.thisWeek;
    this.refresh();
  },

  goCourses() {
    wx.switchTab({ url: '/pages/courses/courses' });
  },

  goScan() {
    wx.navigateTo({ url: '/pages/coursescan/coursescan' });
  },
});
