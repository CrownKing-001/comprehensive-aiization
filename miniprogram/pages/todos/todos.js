// 待办清单。移植自桌面版 src/views/Todos.tsx。
const { store, uid } = require('../../store/store');
const { addDays, toKey } = require('../../utils/storage');

const FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'today', label: '今天' },
  { id: 'overdue', label: '已逾期' },
  { id: 'week', label: '7 天内' },
  { id: 'done', label: '已完成' },
];

const PRIORITY = [
  { value: 'high', label: '紧急' },
  { value: 'normal', label: '普通' },
  { value: 'low', label: '次要' },
];

Page({
  data: {
    ready: false,
    filter: 'all',
    filters: FILTERS,
    priorityOptions: PRIORITY,
    priorityIndex: 1,

    text: '',
    due: '',
    tag: '',

    list: [],
    counts: { all: 0, today: 0, overdue: 0, week: 0, done: 0 },
    quickDates: [],
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

  onText(e) { this.setData({ text: e.detail.value }); },
  onTag(e) { this.setData({ tag: e.detail.value }); },
  onPriority(e) { this.setData({ priorityIndex: Number(e.detail.value) }); },
  onDue(e) { this.setData({ due: e.detail.value }); },
  clearDue() { this.setData({ due: '' }); },
  pickQuickDate(e) { this.setData({ due: e.currentTarget.dataset.value }); },

  setFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.id }, () => this.refresh());
  },

  add() {
    const text = (this.data.text || '').trim();
    if (!text) return;
    const priority = PRIORITY[this.data.priorityIndex].value;
    const t = {
      id: uid(),
      text,
      done: false,
      createdAt: store.todayKey,
      due: this.data.due || undefined,
      priority,
      tag: (this.data.tag || '').trim() || undefined,
    };
    store.setTodos([t, ...store.shape.todos]);
    this.setData({ text: '', due: '', tag: '', priorityIndex: 1 });
  },

  toggle(e) {
    const id = e.currentTarget.dataset.id;
    store.setTodos(store.shape.todos.map((t) => (t.id === id ? Object.assign({}, t, { done: !t.done }) : t)));
  },

  remove(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除待办',
      content: '删掉就找不回来了，确定吗？',
      confirmColor: '#e11d48',
      success: (res) => {
        if (res.confirm) store.setTodos(store.shape.todos.filter((t) => t.id !== id));
      },
    });
  },

  clearDone() {
    const doneCount = store.shape.todos.filter((t) => t.done).length;
    if (!doneCount) return;
    wx.showModal({
      title: '清除已完成',
      content: `将删除 ${doneCount} 项已完成的待办，确定吗？`,
      confirmColor: '#e11d48',
      success: (res) => {
        if (res.confirm) store.setTodos(store.shape.todos.filter((t) => !t.done));
      },
    });
  },

  refresh() {
    if (!store.ready) return;
    const todayKey = store.todayKey;
    const weekEnd = toKey(addDays(new Date(), 7));
    const todos = store.shape.todos;
    const filter = this.data.filter;

    const open = todos.filter((t) => !t.done);
    let filtered;
    switch (filter) {
      case 'today': filtered = open.filter((t) => t.due && t.due <= todayKey); break;
      case 'overdue': filtered = open.filter((t) => t.due && t.due < todayKey); break;
      case 'week': filtered = open.filter((t) => t.due && t.due >= todayKey && t.due <= weekEnd); break;
      case 'done': filtered = todos.filter((t) => t.done); break;
      default: filtered = open;
    }

    const rank = { high: 0, normal: 1, low: 2 };
    const sorted = [...filtered].sort((a, b) => {
      if (a.due && b.due && a.due !== b.due) return a.due.localeCompare(b.due);
      if (a.due && !b.due) return -1;
      if (!a.due && b.due) return 1;
      return rank[a.priority] - rank[b.priority];
    });

    const priorityLabel = {
      high: { text: '紧急', tone: 'rose' },
      normal: { text: '普通', tone: 'emerald' },
      low: { text: '次要', tone: 'slate' },
    };

    const list = sorted.map((t) => {
      const overdue = t.due && t.due < todayKey && !t.done;
      const isTodayDue = t.due === todayKey;
      return {
        id: t.id,
        text: t.text,
        done: t.done,
        due: t.due || '',
        tag: t.tag || '',
        overdue,
        dueTone: overdue ? 'rose' : isTodayDue ? 'amber' : 'slate',
        dueText: t.due ? `${t.due}${overdue ? ' · 已逾期' : isTodayDue ? ' · 今天' : ''}` : '',
        priorityText: priorityLabel[t.priority].text,
        priorityTone: priorityLabel[t.priority].tone,
      };
    });

    const counts = {
      all: open.length,
      today: todos.filter((t) => !t.done && t.due && t.due <= todayKey).length,
      overdue: todos.filter((t) => !t.done && t.due && t.due < todayKey).length,
      week: todos.filter((t) => !t.done && t.due && t.due >= todayKey && t.due <= weekEnd).length,
      done: todos.filter((t) => t.done).length,
    };

    const now = new Date();
    const quickDates = [
      { label: '今天', value: todayKey },
      { label: '明天', value: toKey(addDays(now, 1)) },
      { label: '本周末', value: toKey(addDays(now, 6 - ((now.getDay() + 6) % 7))) },
      { label: '下周', value: toKey(addDays(now, 7)) },
    ];

    this.setData({
      ready: true,
      list,
      counts,
      quickDates,
      filters: FILTERS.map((f) => Object.assign({}, f, { count: counts[f.id] })),
      themeClass: store.shape.settings.theme === 'light' ? 'theme-light' : '',
    });
  },
});
