// 重要事项：期末考试 / 竞赛 / 证书 / 报名 / 出行……全部由用户自由增删改。
// 移植自桌面版 src/views/Milestones.tsx

const { store, uid } = require('../../store/store');
const { fromKey, daysUntil } = require('../../utils/storage');

/** 常用分类，用户也可以自己输入 */
const CATEGORIES = ['考试', '竞赛', '证书', '作业', '报名', '活动', '其他'];

/** 新建时的快捷模板：常见事项一键生成，再自己微调 */
const PRESETS = [
  {
    label: '期末考试',
    emoji: '📝',
    category: '考试',
    checklist: ['整理课件与笔记', '刷近 3 年真题', '背公式/单词', '考前确认考场与时间', '带学生证 + 文具'],
  },
  {
    label: '学科竞赛',
    emoji: '🏆',
    category: '竞赛',
    checklist: ['确认报名截止时间', '组队并分工', '准备作品/材料', '赛前模拟演练'],
  },
  {
    label: '证书报名',
    emoji: '🎓',
    category: '证书',
    checklist: ['确认报名入口与截止日', '准备证件照与身份证', '缴费并保存凭证'],
  },
  {
    label: '课程作业 DDL',
    emoji: '📄',
    category: '作业',
    checklist: ['列提纲', '查资料', '写完初稿', '检查格式与参考文献', '提交前再读一遍'],
  },
];

/** 距今天数 → 展示文案与配色 */
function urgency(dateKey, today, done) {
  if (done) return { text: '已完成', tone: 'emerald', level: 3 };
  if (!dateKey) return { text: '未定日期', tone: 'slate', level: 3 };
  const d = daysUntil(fromKey(dateKey), today);
  // dateKey 非空但格式不认识（例如手填了「待定」）时 d 为 null
  if (d === null) return { text: '未定日期', tone: 'slate', level: 3 };
  if (d < 0) return { text: `已过 ${-d} 天`, tone: 'slate', level: 3 };
  if (d === 0) return { text: '就是今天', tone: 'rose', level: 0 };
  if (d <= 3) return { text: `还有 ${d} 天`, tone: 'rose', level: 0 };
  if (d <= 14) return { text: `还有 ${d} 天`, tone: 'amber', level: 1 };
  return { text: `还有 ${d} 天`, tone: 'sky', level: 2 };
}

function emptyDraft() {
  return {
    id: '',
    title: '',
    date: '',
    time: '',
    place: '',
    category: '考试',
    emoji: '📌',
    remindDaysBefore: 7,
    done: false,
    note: '',
    checklist: [],
  };
}

Page({
  data: {
    ready: false,
    themeClass: '',

    // 列表
    list: [],
    cats: ['全部'],
    catIndex: 0,
    filter: '全部',
    showDone: true,
    upcomingCount: 0,
    totalCount: 0,

    // 编辑
    editing: false,
    isNew: true,
    draft: emptyDraft(),
    newItem: '',
    note: '',

    presets: PRESETS,
    catOptions: CATEGORIES,
    catPickerIndex: 0,
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
    const all = s.milestones || [];
    const today = store.today;

    const catSet = new Set(all.map((m) => m.category).filter(Boolean));
    const cats = ['全部', ...catSet];

    let out = [...all];
    if (this.data.filter !== '全部') out = out.filter((m) => m.category === this.data.filter);
    if (!this.data.showDone) out = out.filter((m) => !m.done);
    // 未完成在前；都按日期升序，没日期的排最后
    out.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return String(a.date).localeCompare(String(b.date));
    });

    const list = out.map((m) => {
      const u = urgency(m.date, today, m.done);
      const total = (m.checklist || []).length;
      return {
        id: m.id,
        title: m.title,
        emoji: m.emoji || '📌',
        category: m.category || '其他',
        date: m.date || '',
        time: m.time || '',
        place: m.place || '',
        note: m.note || '',
        done: m.done,
        pinned: m.pinned,
        urgencyText: u.text,
        urgencyTone: u.tone,
        level: u.level,
        checkCount: total,
        checklist: (m.checklist || []).map((c, i) => ({ idx: i, text: c })),
        metaText: [m.date, m.time, m.place].filter(Boolean).join(' · '),
      };
    });

    const upcoming = all.filter((m) => {
      if (m.done || !m.date) return false;
      const d = daysUntil(fromKey(m.date), today);
      return d !== null && d >= 0;
    });

    this.setData({
      ready: true,
      themeClass: settings.theme === 'light' ? 'theme-light' : '',
      list,
      cats,
      catIndex: Math.max(0, cats.indexOf(this.data.filter)),
      upcomingCount: upcoming.length,
      totalCount: all.length,
    });
  },

  // ── 筛选 ──────────────────────────────────────────
  setFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.cat }, () => this.refresh());
  },

  toggleShowDone(ev) {
    this.setData({ showDone: ev.detail.value }, () => this.refresh());
  },

  // ── 编辑 ──────────────────────────────────────────
  startNew() {
    this.setData({
      editing: true,
      isNew: true,
      draft: emptyDraft(),
      newItem: '',
      note: '',
      catPickerIndex: CATEGORIES.indexOf('考试'),
    });
  },

  startEdit(e) {
    const id = e.currentTarget.dataset.id;
    const all = store.shape.milestones || [];
    const m = all.find((x) => x.id === id);
    if (!m) return;
    const draft = {
      id: m.id,
      title: m.title || '',
      date: m.date || '',
      time: m.time || '',
      place: m.place || '',
      category: m.category || '其他',
      emoji: m.emoji || '📌',
      remindDaysBefore: m.remindDaysBefore === undefined ? 7 : m.remindDaysBefore,
      done: !!m.done,
      note: m.note || '',
      checklist: [...(m.checklist || [])],
    };
    const ci = CATEGORIES.indexOf(draft.category);
    this.setData({ editing: true, isNew: false, draft, newItem: '', note: '', catPickerIndex: ci < 0 ? 0 : ci });
  },

  applyPreset(e) {
    const label = e.currentTarget.dataset.label;
    const p = PRESETS.find((x) => x.label === label);
    if (!p) return;
    const base = this.data.editing ? this.data.draft : emptyDraft();
    this.setData({
      editing: true,
      draft: {
        ...base,
        title: p.label,
        emoji: p.emoji,
        category: p.category,
        checklist: [...p.checklist],
      },
      note: `已套用「${p.label}」模板，改一下日期就能存`,
      catPickerIndex: Math.max(0, CATEGORIES.indexOf(p.category)),
    });
  },

  onDraftInput(e) {
    const field = e.currentTarget.dataset.field;
    // 提前提醒天数是数字：桌面版也是 onChange 里 Number(...) || 0。
    // 留着字符串的话，分析页那边 `d <= remind` 会变成字符串比较，结果不对。
    if (field === 'remindDaysBefore') {
      const raw = String(e.detail.value).trim();
      // 允许暂时留空（正在输入），保存时再兜底成默认值
      this.setData({ 'draft.remindDaysBefore': raw === '' ? '' : Math.max(0, Math.floor(Number(raw) || 0)) });
      return;
    }
    this.setData({ [`draft.${field}`]: e.detail.value });
  },

  onCatPick(e) {
    const i = Number(e.detail.value);
    this.setData({ 'draft.category': CATEGORIES[i], catPickerIndex: i });
  },

  onDatePick(e) {
    this.setData({ 'draft.date': e.detail.value });
  },

  onTimePick(e) {
    this.setData({ 'draft.time': e.detail.value });
  },

  clearDate() {
    this.setData({ 'draft.date': '' });
  },

  onNewItemInput(e) {
    this.setData({ newItem: e.detail.value });
  },

  addDraftCheck() {
    const v = String(this.data.newItem || '').trim();
    if (!v) return;
    this.setData({
      'draft.checklist': [...this.data.draft.checklist, v],
      newItem: '',
    });
  },

  dropDraftCheck(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    this.setData({
      'draft.checklist': this.data.draft.checklist.filter((_, i) => i !== idx),
    });
  },

  cancelEdit() {
    this.setData({ editing: false, note: '' });
  },

  save() {
    const d = this.data.draft;
    const title = String(d.title || '').trim();
    if (!title) {
      this.setData({ note: '名称不能为空' });
      return;
    }
    const all = store.shape.milestones || [];
    const clean = {
      id: d.id || uid(),
      title,
      category: String(d.category || '').trim() || '其他',
      emoji: String(d.emoji || '').trim() || '📌',
      date: d.date || undefined,
      time: d.time || undefined,
      place: String(d.place || '').trim() || undefined,
      note: String(d.note || '').trim() || undefined,
      // 留空/非法一律回到默认 7（桌面版读的时候是 `?? 7`）。
      // 注意 0 是有意义的值（表示「当天才提醒」），不能被当成空值吞掉。
      remindDaysBefore: d.remindDaysBefore === '' || d.remindDaysBefore === undefined
        || d.remindDaysBefore === null || isNaN(Number(d.remindDaysBefore))
        ? 7
        : Math.max(0, Math.floor(Number(d.remindDaysBefore))),
      done: !!d.done,
      pinned: d.pinned,
      checklist: (d.checklist || []).map((c) => String(c).trim()).filter(Boolean),
    };

    if (d.id) {
      store.setMilestones(all.map((m) => (m.id === d.id ? { ...m, ...clean } : m)));
      wx.showToast({ title: '已更新', icon: 'success' });
    } else {
      store.setMilestones([...all, clean]);
      wx.showToast({ title: '已添加', icon: 'success' });
    }
    this.setData({ editing: false, note: '' });
  },

  // ── 列表操作 ──────────────────────────────────────
  toggleDone(e) {
    const id = e.currentTarget.dataset.id;
    const all = store.shape.milestones || [];
    store.setMilestones(all.map((m) => (m.id === id ? { ...m, done: !m.done } : m)));
  },

  /**
   * 钉住 / 取消钉住：只影响「总览绿色条是否显示这个倒计时」，不删事项本身。
   * 这是总览倒计时卡片唯一的开关 —— 两边共用同一份数据。
   */
  togglePin(e) {
    const id = e.currentTarget.dataset.id;
    const all = store.shape.milestones || [];
    store.setMilestones(all.map((m) => (m.id === id ? { ...m, pinned: !m.pinned } : m)));
  },

  duplicate(e) {
    const id = e.currentTarget.dataset.id;
    const all = store.shape.milestones || [];
    const m = all.find((x) => x.id === id);
    if (!m) return;
    store.setMilestones([
      ...all,
      { ...m, id: uid(), title: `${m.title}（副本）`, checklist: [...(m.checklist || [])] },
    ]);
    wx.showToast({ title: '已复制', icon: 'none' });
  },

  remove(e) {
    const id = e.currentTarget.dataset.id;
    const all = store.shape.milestones || [];
    const m = all.find((x) => x.id === id);
    wx.showModal({
      title: '删除事项',
      content: `确定删除「${m ? m.title : ''}」吗？`,
      success: (r) => {
        if (!r.confirm) return;
        store.setMilestones(all.filter((x) => x.id !== id));
      },
    });
  },

  toggleCheck(e) {
    const id = e.currentTarget.dataset.id;
    const idx = Number(e.currentTarget.dataset.idx);
    const all = store.shape.milestones || [];
    store.setMilestones(
      all.map((m) =>
        m.id === id ? { ...m, checklist: (m.checklist || []).filter((_, i) => i !== idx) } : m
      )
    );
  },
});
