// 作业 DDL 追踪。移植自桌面版 src/views/Assignments.tsx。
const { store, uid } = require('../../store/store');
const { daysUntil, fromKey } = require('../../utils/storage');
const { courseNames } = require('../../utils/plan');
const { shareAppMessage, shareTimeline } = require('../../utils/share');

const FILTERS = [
  { id: 'pending', label: '未完成' },
  { id: 'week', label: '7 天内' },
  { id: 'overdue', label: '已逾期' },
  { id: 'done', label: '已完成' },
];

const DEFINITION = {
  data: {
    ready: false,
    filter: 'pending',
    filters: FILTERS,

    course: '',
    title: '',
    detail: '',
    due: '',
    dueTime: '',
    weight: '',

    names: [],
    list: [],
    counts: { pending: 0, week: 0, overdue: 0, done: 0 },
    byCourse: [],
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

  onCourse(e) { this.setData({ course: e.detail.value }); },
  onTitle(e) { this.setData({ title: e.detail.value }); },
  onDetail(e) { this.setData({ detail: e.detail.value }); },
  onDue(e) { this.setData({ due: e.detail.value }); },
  onDueTime(e) { this.setData({ dueTime: e.detail.value }); },
  onWeight(e) { this.setData({ weight: e.detail.value }); },

  pickCourse(e) {
    this.setData({ course: this.data.names[Number(e.detail.value)] });
  },

  setFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.id }, () => this.refresh());
  },

  add() {
    const title = (this.data.title || '').trim();
    const due = this.data.due;
    if (!title || !due) {
      if (!due) wx.showToast({ title: '截止日期必填', icon: 'none' });
      return;
    }
    const a = {
      id: uid(),
      course: (this.data.course || '').trim() || '其他',
      title,
      detail: (this.data.detail || '').trim() || undefined,
      due,
      dueTime: this.data.dueTime || undefined,
      done: false,
      weight: (this.data.weight || '').trim() || undefined,
    };
    store.setAssignments([...store.shape.assignments, a]);
    this.setData({ title: '', detail: '', due: '', dueTime: '', weight: '' });
    wx.showToast({ title: '已添加', icon: 'success' });
  },

  toggle(e) {
    const id = e.currentTarget.dataset.id;
    store.setAssignments(
      store.shape.assignments.map((a) => (a.id === id ? Object.assign({}, a, { done: !a.done }) : a))
    );
  },

  remove(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除作业',
      content: '删掉就找不回来了，确定吗？',
      confirmColor: '#e11d48',
      success: (res) => {
        if (res.confirm) store.setAssignments(store.shape.assignments.filter((a) => a.id !== id));
      },
    });
  },

  refresh() {
    if (!store.ready) return;
    const today = store.today;
    const assignments = store.shape.assignments;
    const filter = this.data.filter;

    // days 为 null 表示这条作业没写截止日期（due 字段非必填）
    const withDays = assignments.map((a) =>
      Object.assign({}, a, { days: daysUntil(fromKey(a.due), today) })
    );

    let filtered;
    switch (filter) {
      case 'week': filtered = withDays.filter((a) => !a.done && a.days >= 0 && a.days <= 7); break;
      case 'overdue': filtered = withDays.filter((a) => !a.done && a.days < 0); break;
      case 'done': filtered = withDays.filter((a) => a.done); break;
      default: filtered = withDays.filter((a) => !a.done);
    }
    filtered.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      // 没有截止日期的排在最后（String() 兜底，due 非必填）
      const ad = a.due || '9999-99-99';
      const bd = b.due || '9999-99-99';
      return String(ad).localeCompare(String(bd));
    });

    const list = filtered.map((a) => {
      const overdue = a.days !== null && a.days < 0 && !a.done;
      return {
        id: a.id,
        title: a.title,
        course: a.course,
        due: a.due || '',
        dueTime: a.dueTime || '',
        detail: a.detail || '',
        weight: a.weight || '',
        done: a.done,
        overdue,
        // 注意 a.days 可能是 null（没填日期），null <= 2 会算 true，必须显式判 null
        soon: !a.done && !overdue && a.days !== null && a.days <= 2,
        chipTone: overdue ? 'rose' : a.days === 0 || a.days === 1 ? 'amber' : 'slate',
        chipText: overdue
          ? `逾期 ${-a.days} 天`
          : a.done
            ? ''
            : a.days === 0
              ? '今天截止'
              : a.days === 1
                ? '明天截止'
                : '',
        remainText: !a.done && a.days > 1 ? ` · 还有 ${a.days} 天` : '',
      };
    });

    const counts = {
      pending: withDays.filter((a) => !a.done).length,
      week: withDays.filter((a) => !a.done && a.days >= 0 && a.days <= 7).length,
      overdue: withDays.filter((a) => !a.done && a.days < 0).length,
      done: withDays.filter((a) => a.done).length,
    };

    // 按课程分组统计未完成
    const map = {};
    for (const a of withDays) {
      const cur = map[a.course] || { total: 0, done: 0, next: undefined };
      cur.total++;
      if (a.done) cur.done++;
      else if (cur.next === undefined || a.days < cur.next) cur.next = a.days;
      map[a.course] = cur;
    }
    const byCourse = Object.keys(map)
      .map((name) => {
        const s = map[name];
        return {
          name,
          done: s.done,
          total: s.total,
          next: s.next,
          hasNext: s.next !== undefined,
          chipTone: s.next === undefined ? 'slate' : s.next < 0 ? 'rose' : s.next <= 2 ? 'amber' : 'sky',
          chipText:
            s.next === undefined ? '' : s.next < 0 ? `逾期 ${-s.next} 天` : `最近 ${s.next} 天`,
        };
      })
      .sort((a, b) => (a.next === undefined ? 999 : a.next) - (b.next === undefined ? 999 : b.next));

    this.setData({
      ready: true,
      names: courseNames(store.shape.courses || []),
      list,
      counts,
      filters: FILTERS.map((f) => Object.assign({}, f, { count: counts[f.id] })),
      byCourse,
      themeClass: store.shape.settings.theme === 'light' ? 'theme-light' : '',
    });
  },

  // 分享：右上角「···」里的「转发」和「分享到朋友圈」。
  // 这两个是页面级回调，不是普通方法 —— 合并页的 tabHost 必须跳过它们
  // （见 utils/tabHost.js 的前缀循环），否则会被改名成 xxx_onShareAppMessage。
  onShareAppMessage() {
    return shareAppMessage('assignments');
  },

  onShareTimeline() {
    return shareTimeline('assignments');
  },
};


// 这个页面同时被合并页当作子模块使用（见 utils/tabHost.js）。
// 小程序页面模块不 export 定义，这里显式导出一份供 tabHost 取用。
module.exports = DEFINITION;
