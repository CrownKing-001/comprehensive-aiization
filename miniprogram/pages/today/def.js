// 今日：日期切换 + 课程 + 当天待办/作业。移植自桌面版 src/views/Today.tsx。
const { store } = require('../../store/store');
const { currentWeek } = require('../../utils/plan');
const { coursesOn, toMin, buildTimeline, addDays, keyOf } = require('../../utils/schedule');
const { fromKey, daysUntil } = require('../../utils/storage');

const DEFINITION = {
  data: {
    ready: false,
    offset: 0,
    isToday: true,
    dateStr: '',
    weekdayStr: '',
    relLabel: '',
    week: 1,
    shown: [],
    finished: 0,
    timeline: [],
    dayTodos: [],
    dayAssign: [],
    themeClass: '',
  },

  onLoad() {
    this._unsub = store.subscribe(() => this.refresh());
    this.refresh();
  },

  onShow() {
    this.refresh();
  },

  onUnload() {
    if (this._unsub) this._unsub();
  },

  prevDay() {
    this.setData({ offset: this.data.offset - 1 }, () => this.refresh());
  },

  nextDay() {
    this.setData({ offset: this.data.offset + 1 }, () => this.refresh());
  },

  backToday() {
    this.setData({ offset: 0 }, () => this.refresh());
  },

  toggleTodo(e) {
    const id = e.currentTarget.dataset.id;
    store.setTodos(store.shape.todos.map((x) => (x.id === id ? Object.assign({}, x, { done: true }) : x)));
  },

  refresh() {
    if (!store.ready) return;
    const s = store.shape;
    const today = store.today;
    const offset = this.data.offset;
    const view = addDays(today, offset);
    const isToday = offset === 0;
    const semesterStart = fromKey(s.settings.semesterStart);
    const week = currentWeek(view, semesterStart);

    const allCourses = coursesOn(s.courses || [], view, semesterStart);

    const now = new Date();
    const curMin = now.getHours() * 60 + now.getMinutes();
    // 今天的课：已结束的不再占用视线
    const shown = isToday ? allCourses.filter((c) => toMin(c.end) > curMin) : allCourses;
    const finished = isToday ? allCourses.length - shown.length : 0;

    const shownView = shown.map((c) => ({
      uid: c.uid,
      name: c.name,
      place: c.place,
      tag: c.tag || '',
      start: c.start,
      end: c.end,
      ongoing: isToday && toMin(c.start) <= curMin && curMin < toMin(c.end),
    }));

    const timeline = buildTimeline(
      allCourses,
      [],
      isToday ? now : new Date(view.getFullYear(), view.getMonth(), view.getDate(), 0, 0)
    );

    const viewKey = keyOf(view);
    const dayTodos = s.todos
      .filter((t) => !t.done && t.due && t.due <= viewKey)
      .map((t) => ({ id: t.id, text: t.text, overdue: t.due < viewKey }));

    const dayAssign = s.assignments
      // daysUntil 对没填截止日期的作业返回 null，而 null <= 0 是 true ——
      // 必须显式排除，否则「没有 DDL 的作业」会被当成今天截止显示出来
      .filter((a) => {
        if (a.done) return false;
        const d = daysUntil(fromKey(a.due), view);
        return d !== null && d <= 0;
      })
      .slice(0, 6)
      .map((a) => {
        const d = daysUntil(fromKey(a.due), view);
        return {
          id: a.id,
          course: a.course,
          title: a.title,
          chipTone: d < 0 ? 'rose' : 'amber',
          chipText: d < 0 ? `逾期 ${-d} 天` : '今天截止',
        };
      });

    let relLabel = '';
    if (isToday) relLabel = '今天';
    else if (offset === 1) relLabel = '明天';
    else if (offset > 1) relLabel = `${offset} 天后`;
    else if (offset === -1) relLabel = '昨天';
    else relLabel = `${-offset} 天前`;

    this.setData({
      ready: true,
      isToday,
      dateStr: `${view.getMonth() + 1} 月 ${view.getDate()} 日`,
      weekdayStr: `周${'日一二三四五六'[view.getDay()]}`,
      relLabel,
      week,
      shown: shownView,
      finished,
      timeline,
      dayTodos,
      dayAssign,
      themeClass: s.settings.theme === 'light' ? 'theme-light' : '',
    });
  },
};
// 这个页面同时被「总览」合并页当作子模块使用（见 utils/tabHost.js）。
// 小程序页面模块不 export 定义，这里显式导出一份供 tabHost 取用。
module.exports = DEFINITION;