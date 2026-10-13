// 总览：工作台首页。移植自桌面版 src/views/Dashboard.tsx。
const { store } = require('../../store/store');
const { currentWeek } = require('../../utils/plan');
const { coursesOn, buildTimeline, toMin } = require('../../utils/schedule');
const { daysUntil, fromKey } = require('../../utils/storage');

const DEFINITION = {
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
    // 钉住的倒计时多于 4 个时，卡片改用紧凑样式。
    // 必须在 data 里先声明：WXML 的 {{compact ? ...}} 在首次 setData 之前
    // 读到 undefined，虽然三元结果相同，但声明了前缀生成器才能识别它。
    compact: false,
    // 「从重要事项里挑」的选择器是否展开
    pinPickerOpen: false,
    availablePins: [],
    // 置顶卡就地编辑：正在编辑哪一条 + 草稿值（桌面版 Dashboard.tsx:76-92）
    pinEditId: '',
    pinDraftTitle: '',
    pinDraftDate: '',
    // 重要事项指标卡的副标题：最近一项的名字（桌面版 Dashboard.tsx:570）
    nextMilestoneText: '',
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
      // days 可能是 null（没填截止日期），排到最后而不是参与 NaN 比较
      .sort((a, b) => (a.days === null ? 1 : b.days === null ? -1 : a.days - b.days));
    const overdue = dueSoon.filter((a) => a.days !== null && a.days < 0);
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
        // 「今日」已经并进总览，不再是 tabBar 页 —— 不能再写 switchTab，
        // 那会静默失败（不报错也不跳）。改成跳到总览的「今日」分段。
        url: '/pages/dashboard/dashboard',
        seg: 'today',
        isTab: true,
      },
      {
        key: 'todos',
        icon: '✅',
        tone: 'emerald',
        label: '未完成待办',
        value: String(openTodos.length),
        unit: '项',
        sub: dueTodayCount ? `${dueTodayCount} 项今天到期` : '暂无到期',
        url: '/pages/tasks/tasks',
        seg: 'todos',
        isTab: true,
      },
      {
        key: 'assign',
        icon: '📖',
        tone: overdue.length ? 'rose' : 'amber',
        label: '临近作业',
        value: String(week7),
        unit: '个',
        sub: overdue.length ? `${overdue.length} 个已逾期` : '7 天内截止',
        url: '/pages/tasks/tasks',
        seg: 'assignments',
        isTab: true,
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
        url: '/pages/healthhub/healthhub',
        seg: 'run',
        isTab: true,
      });
    } else {
      const undone = s.milestones.filter((m) => !m.done).length;
      // 副标题显示「最近一项：<名字>」（桌面版 Dashboard.tsx:570），
      // 比光写「待处理」有用。条件是未完成 + 有日期 + 还没过期。
      const nextMs = s.milestones
        .filter((m) => !m.done && m.date && daysUntil(fromKey(m.date), today) >= 0)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
      stats.push({
        key: 'milestone',
        icon: '🎯',
        tone: 'sky',
        label: '重要事项',
        value: String(undone),
        unit: '项',
        sub: nextMs ? `最近一项：${nextMs.title}` : (undone ? '待处理' : '还没有待办事项'),
        url: '/pages/milestones/milestones',
        isTab: false,
      });
    }

    // ── 钉到总览的倒计时（与「重要事项」共用同一份数据）──
    // 卡片只显示被「钉」上的事项；「添加」是从重要事项里挑一个放上来，
    // 不新建 —— 这样绿色条和重要事项页永远是同一份数据。
    const datedMilestones = s.milestones.filter((m) => m.date);
    const pinned = datedMilestones
      .filter((m) => m.pinned)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((m) => {
        const d = daysUntil(fromKey(m.date), today);
        return { id: m.id, label: m.title, date: m.date, days: d, done: d !== null && d < 0 };
      });
    const compact = pinned.length > 4;

    // 可供挑选的：有日期、还没钉上、且没有过去太久（过期一天内还留着）
    const availablePins = datedMilestones
      .filter((m) => !m.pinned && daysUntil(fromKey(m.date), today) >= -1)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((m) => ({
        id: m.id,
        title: m.title,
        emoji: m.emoji || '📌',
        category: m.category || '',
        date: m.date,
        daysText: (() => {
          const d = daysUntil(fromKey(m.date), today);
          return d < 0 ? `已过 ${-d} 天` : d === 0 ? '就是今天' : `还有 ${d} 天`;
        })(),
      }));

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
      availablePins,
      openTodos: todoPreview,
      dueSoon: assignPreview,
      overdue,
      overdueTitles: overdue.slice(0, 3).map((a) => a.title).join('、'),
      runDone,
      runTarget,
      runEnabled: !!s.settings.runEnabled,
      // 运动打卡关闭时补位的「重要事项」卡片用这两项
      undoneCount: (s.milestones || []).filter((m) => !m.done).length,
      nextMilestoneText: (() => {
        const n = (s.milestones || [])
          .filter((m) => !m.done && m.date && daysUntil(fromKey(m.date), today) >= 0)
          .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
        return n ? n.title : '';
      })(),
      latestWeight: latestHealth && latestHealth.weight ? latestHealth.weight : null,
      todayProtein,
      proteinTarget: store.proteinTarget,
      todayCalories,
      todayDietCount: todayDiet.length,
      themeClass: s.settings.theme === 'light' ? 'theme-light' : '',
    });
  },

  /**
   * 跳到 tabBar 页面。
   * 注意：wx.switchTab 的 url 不能带 query（带了会跳转失败），
   * 所以「跳到健康页并停在某个子项」只能先 switchTab、再把要显示的
   * 分段记到全局，由目标页在 onShow 里取走。
   */
  goTab(e) {
    const ds = e.currentTarget.dataset;
    const url = ds.url;
    if (!url) return;
    if (ds.seg) {
      const app = getApp();
      if (app) {
        app.globalData = app.globalData || {};
        app.globalData.pendingSeg = { url, seg: ds.seg };
      }
    }
    wx.switchTab({ url });
  },

  /**
   * 指标卡点击。
   * 卡片的 url 可能是 tabBar 页面也可能是普通页面，用 isTab 区分 ——
   * switchTab 打不开普通页面、navigateTo 打不开 tabBar 页面，弄反就没反应。
   */
  goStat(e) {
    const ds = e.currentTarget.dataset;
    const url = ds.url;
    if (!url) return;
    if (ds.seg) {
      const app = getApp();
      if (app) {
        app.globalData = app.globalData || {};
        app.globalData.pendingSeg = { url, seg: ds.seg };
      }
    }
    if (ds.isTab) wx.switchTab({ url });
    else wx.navigateTo({ url });
  },

  /** 非 tabBar 页面的入口（分析 / 周计划 / 事项 / 识别） */
  goPage(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.navigateTo({ url });
  },

  // ── 倒计时卡片的增删（与「重要事项」共用同一份 milestones 数据）──

  /** 打开 / 关闭「从重要事项里挑」的选择器 */
  togglePinPicker() {
    this.setData({ pinPickerOpen: !this.data.pinPickerOpen });
  },

  /**
   * 把某一事项钉到总览上。
   * 只改 pinned 标记，不新建事项 —— 绿色条和重要事项页永远一致。
   */
  pinMilestone(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const all = store.shape.milestones || [];
    store.setMilestones(all.map((m) => (m.id === id ? { ...m, pinned: true } : m)));
    this.setData({ pinPickerOpen: false });
    this.refresh();
    wx.showToast({ title: '已钉到总览', icon: 'success' });
  },

  /**
   * 从总览撤下。
   * 语义是「取消钉住」，事项本身仍留在重要事项页里，不会被删掉 ——
   * 所以不弹确认框，误点也不丢数据。
   */
  unpinMilestone(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const all = store.shape.milestones || [];
    store.setMilestones(all.map((m) => (m.id === id ? { ...m, pinned: false } : m)));
    this.refresh();
    wx.showToast({ title: '已从总览撤下', icon: 'none' });
  },

  /** 选择器里一个都没有时的「去新建」入口 */
  goMilestones() {
    wx.navigateTo({ url: '/pages/milestones/milestones' });
  },

  // ── 置顶卡片就地编辑（桌面版 Dashboard.tsx:76-92）────────
  // 桌面版是 hover 出铅笔。手机没有 hover，所以点整张卡片进编辑态。
  startPinEdit(e) {
    const id = e.currentTarget.dataset.id;
    const all = store.shape.milestones || [];
    const m = all.find((x) => x.id === id);
    if (!m) return;
    this.setData({
      pinEditId: id,
      pinDraftTitle: m.title || '',
      pinDraftDate: m.date || '',
      pinPickerOpen: false,
    });
  },

  onPinTitle(e) {
    this.setData({ pinDraftTitle: e.detail.value });
  },

  onPinDate(e) {
    this.setData({ pinDraftDate: e.detail.value });
  },

  cancelPinEdit() {
    this.setData({ pinEditId: '', pinDraftTitle: '', pinDraftDate: '' });
  },

  /**
   * 保存就地编辑。桌面版 saveMilestone：标题或日期为空就直接退出编辑、不写数据
   * （而不是存一个空标题进去）。
   */
  savePinEdit(e) {
    const id = e.currentTarget.dataset.id || this.data.pinEditId;
    const title = String(this.data.pinDraftTitle || '').trim();
    const date = this.data.pinDraftDate;
    if (!id || !title || !date) {
      this.cancelPinEdit();
      return;
    }
    const all = store.shape.milestones || [];
    store.setMilestones(all.map((m) => (m.id === id ? { ...m, title, date } : m)));
    this.cancelPinEdit();
    this.refresh();
    wx.showToast({ title: '已更新', icon: 'success' });
  },

  noop() {},
};

// 总览现在是「总览 / 今日」合并页的宿主（tabBar 只有 5 格，
// 今日并进总览才腾出位置给设置）。页面定义由 pages/dashboard 自己导出，
// 再连同 today 子模块一起交给 buildHost 组装。
module.exports = DEFINITION;

// 只有被小程序真正当页面加载时才注册；被 tabHost require 时不要注册，
// 否则会覆盖宿主自己那份 Page 定义。
if (!global.__TABHOST_LOADING__) {
  const { buildHost } = require('../../utils/tabHost');
  Page(
    buildHost({
      selfDef: DEFINITION,
      segments: [
        { id: 'dashboard', label: '总览', icon: '🏠' },
        { id: 'today', label: '今日', icon: '📅' },
      ],
      modules: {
        today: { path: '../today/today.js', label: '今日' },
      },
      // ⚠️ 必须是字符串字面量的 require，理由见 utils/tabHost.js 的 buildHost
      loadDefs() {
        return { today: require('../today/def') };
      },
    })
  );
}