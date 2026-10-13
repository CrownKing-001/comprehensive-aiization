// 课表管理：查看 / 编辑 / 增删课程，改动存进数据文件
// 移植自桌面版 src/views/Courses.tsx

const { store, uid } = require('../../store/store');
const { currentWeek, semesterStartForWeek } = require('../../utils/plan');
const { fromKey, toKey } = require('../../utils/storage');
const { DAY_LABELS } = require('../../utils/schedule');
const { weeksToText, parseWeeksText, weeksLabelText } = require('../../utils/weeks');

const EMPTY = {
  day: 1,
  name: '',
  start: '08:00',
  end: '09:35',
  place: '',
  weeks: [],
  teacher: '',
  credit: undefined,
  tag: '',
};

/** 把 weeks 数组压成 "2-4,6-16" 这种紧凑写法 */
function fmtWeeks(weeks) {
  if (!weeks || !weeks.length) return '—';
  const s = [...new Set(weeks)].sort((a, b) => a - b);
  const out = [];
  let i = 0;
  while (i < s.length) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(j > i ? `${s[i]}-${s[j]}` : `${s[i]}`);
    i = j + 1;
  }
  return out.join(',');
}

Page({
  data: {
    ready: false,
    themeClass: '',

    // 列表
    list: [],
    totalCount: 0,
    courseCount: 0,
    totalCredit: 0,

    // 编辑表单
    editing: false,
    isAdd: false,
    form: {
      id: '',
      name: '',
      day: 1,
      dayIndex: 0,
      start: '08:00',
      end: '09:35',
      place: '',
      credit: '',
      teacher: '',
      tag: '',
    },
    weeksText: '',
    weeksPreview: '—',
    dayOptions: DAY_LABELS,

    // 周次网格
    week: 1,
    totalWeeks: 18,
    grid: [],
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
    const courses = s.courses || [];
    const today = store.today;
    const semStart = fromKey(settings.semesterStart);

    // 尚未手动选周时，跟随当前教学周
    const curWeek = Math.min(
      Math.max(currentWeek(today, semStart), 1),
      settings.totalWeeks
    );
    const week = this.data.week || curWeek;

    const dayOpts = DAY_LABELS;
    const list = courses
      .map((c, idx) => {
        const key = c.id || `c${idx}`;
        return {
          id: key,
          idx,
          name: c.name,
          teacher: c.teacher || '',
          tag: c.tag || '',
          day: c.day,
          dayText: dayOpts[c.day - 1] || '',
          timeText: `${c.start}–${c.end}`,
          place: c.place || '—',
          weeksText: fmtWeeks(c.weeks),
          creditText: c.credit === undefined || c.credit === null ? '—' : String(c.credit),
        };
      })
      .sort((a, b) => a.day - b.day || a.timeText.localeCompare(b.timeText));

    const names = new Set(courses.map((c) => (c.name || '').trim()).filter(Boolean));
    const totalCredit = courses.reduce((sum, c) => sum + (Number(c.credit) || 0), 0);

    // 周课表速览：按周几分组，只显示本周有课的
    const todayDow = today.getDay() === 0 ? 7 : today.getDay();
    const grid = dayOpts.map((label, i) => {
      const day = i + 1;
      const inWeek = courses
        .filter((c) => c.day === day && Array.isArray(c.weeks) && c.weeks.includes(week))
        .sort((a, b) => String(a.start).localeCompare(String(b.start)));
      return {
        label,
        day,
        isToday: week === curWeek && day === todayDow,
        countText: `${inWeek.length} 节`,
        items: inWeek.map((c, idx) => ({
          id: c.id || `g${day}-${idx}`,
          name: c.name,
          start: c.start,
          place: c.place || '',
        })),
      };
    });

    this.setData({
      ready: true,
      themeClass: settings.theme === 'light' ? 'theme-light' : '',
      list,
      totalCount: courses.length,
      courseCount: names.size,
      totalCredit,
      week,
      totalWeeks: settings.totalWeeks,
      grid,
    });
  },

  // ── 编辑 ────────────────────────────────────────────
  startAdd() {
    const settings = store.shape.settings;
    this.setData({
      editing: true,
      isAdd: true,
      form: Object.assign({}, EMPTY, { id: uid() }),
      weeksText: `1-${settings.totalWeeks}`,
      weeksPreview: fmtWeeks(this.rangeArr(1, settings.totalWeeks)),
    });
  },

  startEdit(e) {
    const id = e.currentTarget.dataset.id;
    const courses = store.shape.courses || [];
    const c = courses.find((x, i) => (x.id || `c${i}`) === id);
    if (!c) return;
    this.setData({
      editing: true,
      isAdd: false,
      form: {
        id,
        name: c.name || '',
        day: c.day,
        dayIndex: (c.day || 1) - 1,
        start: c.start || '08:00',
        end: c.end || '09:35',
        place: c.place || '',
        credit: c.credit === undefined || c.credit === null ? '' : String(c.credit),
        teacher: c.teacher || '',
        tag: c.tag || '',
      },
      weeksText: fmtWeeks(c.weeks) === '—' ? '' : fmtWeeks(c.weeks),
      weeksPreview: fmtWeeks(c.weeks),
    });
  },

  cancelEdit() {
    this.setData({ editing: false });
  },

  onFormInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onDayChange(e) {
    const i = Number(e.detail.value);
    this.setData({ 'form.dayIndex': i, 'form.day': i + 1 });
  },

  onStartTime(e) {
    this.setData({ 'form.start': e.detail.value });
  },

  onEndTime(e) {
    this.setData({ 'form.end': e.detail.value });
  },

  onWeeksInput(e) {
    const t = e.detail.value;
    const parsed = parseWeeksText(t);
    this.setData({ weeksText: t, weeksPreview: fmtWeeks(parsed) });
  },

  save() {
    const f = this.data.form;
    if (!f.name.trim()) {
      wx.showToast({ title: '请填写课程名称', icon: 'none' });
      return;
    }
    const courses = store.shape.courses || [];
    const weeks = parseWeeksText(this.data.weeksText) || [];
    const next = {
      id: f.id,
      day: f.day,
      name: f.name.trim(),
      start: f.start,
      end: f.end,
      place: (f.place || '').trim(),
      weeks,
      tag: (f.tag || '').trim() || undefined,
      teacher: (f.teacher || '').trim() || undefined,
      credit: f.credit === '' ? undefined : Number(f.credit),
    };
    const list = [...courses];
    const at = list.findIndex((c, i) => (c.id || `c${i}`) === f.id);
    if (at >= 0) list[at] = next;
    else list.push(next);

    store.setCourses(list);
    this.setData({ editing: false });
    wx.showToast({ title: this.data.isAdd ? '已添加' : '已保存', icon: 'success' });
  },

  remove(e) {
    const id = e.currentTarget.dataset.id;
    const courses = store.shape.courses || [];
    wx.showModal({
      title: '删除课程',
      content: '确定要删除这门课吗？',
      success: (r) => {
        if (!r.confirm) return;
        store.setCourses(courses.filter((x, i) => (x.id || `c${i}`) !== id));
        wx.showToast({ title: '已删除', icon: 'none' });
      },
    });
  },

  prevWeek() {
    this.setData({ week: Math.max(1, this.data.week - 1) }, () => this.refresh());
  },

  nextWeek() {
    const max = (store.shape.settings.totalWeeks || 18) + 3;
    this.setData({ week: Math.min(max, this.data.week + 1) }, () => this.refresh());
  },

  goScan() {
    wx.navigateTo({ url: '/pages/coursescan/coursescan' });
  },

  rangeArr(a, b) {
    const out = [];
    for (let i = a; i <= b; i++) out.push(i);
    return out;
  },
});
