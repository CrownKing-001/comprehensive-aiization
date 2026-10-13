// 总览：工作台首页。移植自桌面版 src/views/Dashboard.tsx。
const { store } = require('../../store/store');
const { currentWeek } = require('../../utils/plan');
const { coursesOn, buildTimeline, toMin } = require('../../utils/schedule');
const { daysUntil, fromKey } = require('../../utils/storage');

Page({
  data: {
    ready: false,
    week: 1,
    dateText: '',
    weekdayText: '',
    greet: '',
    stats: [],
    timeline: [],
    openTodos: [],
    dueSoon: [],
    overdue: [],
    overdueTitles: '',
    pinned: [],
    runDone: 0,
    runTarget: 30,
    runEnabled: true,
    latestWeight: null,
    todayProtein: 0,
    proteinTarget: 110,
    todayCalories: 0,
    todayDietCount: 0,
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

  refresh() {
    if (!store.ready) return;
    const s = store.shape;
    const today = store.today;
    const todayKey = store.todayKey;
    const semesterStart = fromKey(s.settings.semesterStart);
    const week = currentWeek(today, semesterStart);

    const todayCourses = coursesOn(s.courses || [], today, semesterStart);
    const now = new Date();
    const curMin = now.getHours() * 60 + now.getMinutes();
    const restCourses = todayCourses.filter((c) => toMin(c.end) > curMin);

    const timeline = buildTimeline(todayCourses, [], now);

    // ── 指标卡 ──
    const openTodos = s.todos.filter((t) => !t.done);
    const dueSoon = s.assignments
      .filter((a) => !a.done)
      .map((a) => Object.assign({}, a, { days: daysUntil(fromKey(a.due), today) }))
      .sort((a, b) => a.days - b.days);
    const overdue = dueSoon.filter((a) => a.days < 0);
    const dueTodayCount = openTodos.filter((t) => t.due && t.due <= todayKey).length;

    const runDone = s.run.length;
    const runTarget = Math.max(1, s.settings.runTarget || 0);
    const week7 = dueSoon.filter((a) => a.days <= 7).length;

    const stats = [
      {
        key: 'courses',
        icon: '📅',
        tone: 'sky',
        label: '今日课程',
        value: String(restCourses.length),
        unit: '节待上',
        sub: todayCourses.length ? `共 ${todayCourses.length} 节` : '今天没课',
        url: '/pages/today/today',
      },
      {
        key: 'todos',
        icon: '✅',
        tone: 'emerald',
        label: '未完成待办',
        value: String(openTodos.length),
        unit: '项',
        sub: dueTodayCount ? `${dueTodayCount} 项今天到期` : '暂无到期',
        url: '/pages/todos/todos',
      },
      {
        key: 'assign',
        icon: '📖',
        tone: overdue.length ? 'rose' : 'amber',
        label: '临近作业',
        value: String(week7),
        unit: '个',
        sub: overdue.length ? `${overdue.length} 个已逾期` : '7 天内截止',
        url: '/pages/assignments/assignments',
      },
    ];
    if (s.settings.runEnabled) {
      stats.push({
        key: 'run',
        icon: '👟',
        tone: 'emerald',
        label: '运动打卡',
        value: String(runDone),
        unit: `/ ${s.settings.runTarget} 次`,
        sub: runDone >= s.settings.runTarget ? '已达标 🎉' : `还差 ${s.settings.runTarget - runDone} 次`,
        url: '',
      });
    } else {
      const undone = s.milestones.filter((m) => !m.done).length;
      stats.push({
        key: 'milestone',
        icon: '🎯',
        tone: 'sky',
        label: '重要事项',
        value: String(undone),
        unit: '项',
        sub: undone ? '待处理' : '还没有待办事项',
        url: '',
      });
    }

    // ── 钉到总览的倒计时（与「重要事项」共用同一份数据）──
    const pinned = s.milestones
      .filter((m) => m.pinned && m.date)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((m) => {
        const d = daysUntil(fromKey(m.date), today);
        return { id: m.id, label: m.title, date: m.date, days: d, done: d < 0 };
      });
    const compact = pinned.length > 4;

    // ── 待办速览 ──
    const todoPreview = [...openTodos]
      .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))
      .slice(0, 5)
      .map((t) => {
        const overdueT = t.due && t.due < todayKey;
        const dueToday = t.due === todayKey;
        return {
          id: t.id,
          text: t.text,
          dot: t.priority === 'high' ? 'rose' : t.priority === 'low' ? 'slate' : 'emerald',
          chipTone: overdueT ? 'rose' : dueToday ? 'amber' : 'slate',
          chipText: overdueT ? '已逾期' : dueToday ? '今天' : t.due ? t.due.slice(5) : '',
        };
      });

    // ── 作业倒计时 ──
    const assignPreview = dueSoon.slice(0, 4).map((a) => ({
      id: a.id,
      title: a.title,
      course: a.course,
      due: a.due,
      dueTime: a.dueTime || '',
      chipTone: a.days < 0 ? 'rose' : a.days <= 2 ? 'amber' : 'sky',
      chipText: a.days < 0 ? `逾期 ${-a.days} 天` : a.days === 0 ? '今天' : `${a.days} 天`,
    }));

    // ── 身体 / 饮食 ──
    const latestHealth = [...s.health].sort((a, b) => b.date.localeCompare(a.date))[0];
    const todayDiet = s.diet.filter((d) => d.date === todayKey);
    const todayProtein = todayDiet.reduce((sum, d) => sum + (d.protein || 0), 0);
    const todayCalories = todayDiet.reduce((sum, d) => sum + (d.calories || 0), 0);

    const restCount = restCourses.length;
    const greet = restCount > 0
      ? `今天还有 ${restCount} 节课，最近一节 ${restCourses[0].start} ${restCourses[0].name}`
      : '今天课都上完了，剩下的时间归你安排';

    this.setData({
      ready: true,
      week,
      dateText: `${today.getMonth() + 1} 月 ${today.getDate()} 日`,
      weekdayText: `周${'日一二三四五六'[today.getDay()]}`,
      greet,
      stats,
      timeline,
      pinned,
      compact,
      openTodos: todoPreview,
      dueSoon: assignPreview,
      overdue,
      overdueTitles: overdue.slice(0, 3).map((a) => a.title).join('、'),
      runDone,
      runTarget,
      runEnabled: !!s.settings.runEnabled,
      latestWeight: latestHealth && latestHealth.weight ? latestHealth.weight : null,
      todayProtein,
      proteinTarget: store.proteinTarget,
      todayCalories,
      todayDietCount: todayDiet.length,
      themeClass: s.settings.theme === 'light' ? 'theme-light' : '',
    });
  },

  goTab(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.switchTab({ url });
  },

  /** 非 tabBar 页面的入口（饮食 / 运动 / 分析 / 事项 / 设置） */
  goPage(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.navigateTo({ url });
  },

  noop() {},
});
