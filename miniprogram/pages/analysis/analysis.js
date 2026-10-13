// 空闲时段分析：热力图 + 空闲时段排名 + 重要事项清单。
// 结论全部由用户自己的课表算出来（freeMatrix），空白模板下不预设任何训练 / 备考方案。
// 移植自桌面版 src/views/Analysis.tsx

const { store } = require('../../store/store');
const { TIME_SLOTS, currentWeek, freeMatrix } = require('../../utils/plan');
const { fromKey, daysUntil } = require('../../utils/storage');

const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 空闲格配色：把桌面版的 Tailwind 类改成小程序可用的语义类名 */
function cellClass(free, total) {
  const ratio = total > 0 ? free / total : 0;
  // 空白模板没有课表时全是 0，用中性灰，避免整页红块看起来像报错
  if (total > 0 && free === 0) return 'hm-cell is-full';
  if (total === 0 || free === 0) return 'hm-cell is-none';
  if (ratio >= 1) return 'hm-cell is-best';
  if (ratio >= 0.66) return 'hm-cell is-high';
  if (ratio >= 0.33) return 'hm-cell is-mid';
  return 'hm-cell is-low';
}

/** 空闲比例对应的推荐等级，纯按名次/空闲度判定，与具体活动无关 */
function kindOf(ratio) {
  if (ratio >= 1) return { text: '最佳', tone: 'emerald' };
  if (ratio >= 0.6) return { text: '推荐', tone: 'sky' };
  return { text: '备选', tone: 'slate' };
}

Page({
  data: {
    ready: false,
    themeClass: '',

    hasCourses: false,
    courseCount: 0,
    // 重要事项默认只显示前 8 条，点「展开全部」看剩下的
    msExpanded: false,
    msMore: 0,
    weekFrom: 1,
    weekTo: 3,
    total: 3,
    hasFree: false,

    // 表头
    slotHeads: [],

    // 热力图行
    heatRows: [],

    // 综合结论
    bestText: '',

    // 排名
    ranked: [],
    flattest: [],

    // 按时间段汇总
    bySlot: [],

    // 重要事项
    milestones: [],

    // 空课表引导
    hint: '',
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
    const semesterStart = fromKey(settings.semesterStart);
    const week = currentWeek(store.today, semesterStart);
    const today = store.today;

    const hasCourses = courses.length > 0;

    // 重要事项：按日期排，未完成在前
    const ms = [...(s.milestones || [])].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return String(a.date).localeCompare(String(b.date));
    });
    const milestones = ms.map((m) => {
      const d = m.date ? daysUntil(fromKey(m.date), today) : null;
      // 提醒提前量是**每条事项自己的**设置（重要事项页可改，默认 7 天）。
      // 桌面版 Analysis.tsx 写的是 (m.remindDaysBefore ?? 7)，
      // 这里原来写死 7，会把用户改过的提前量忽略掉。
      // 用 || 不用 ??：老数据里可能是 0 或空串，都要退回默认 7。
      const remind = Number(m.remindDaysBefore) || 7;
      return {
        id: m.id,
        title: m.title,
        emoji: m.emoji || '📌',
        category: m.category || '其他',
        date: m.date || '',
        done: !!m.done,
        daysText:
          d === null ? '未定日期' : d < 0 ? `已过 ${-d} 天` : d === 0 ? '就是今天' : `还有 ${d} 天`,
        urgent: !m.done && d !== null && d >= 0 && d <= remind,
      };
    });

    // 桌面版这里不截断（Analysis.tsx 把全部事项直接渲染出来），
    // 但手机上几十条事项会把页面拉得很长，所以默认只显示前 8 条，
    // 其余用「展开全部」放出来 —— 不能像原来那样直接 slice 掉，
    // 那样第 9 条之后的事项在分析页就再也看不到了。
    const MS_PREVIEW = 8;
    const milestonesShown = this.data.msExpanded
      ? milestones
      : milestones.slice(0, MS_PREVIEW);
    const msMore = Math.max(0, milestones.length - milestonesShown.length);

    // 空课表：整页只给一个引导，不渲染算不出内容的热力图
    if (!hasCourses) {
      this.setData({
        ready: true,
        themeClass: settings.theme === 'light' ? 'theme-light' : '',
        hasCourses: false,
        courseCount: 0,
        milestones: milestonesShown,
        msMore,
        msExpanded: !!this.data.msExpanded,
        hint: '还没有课程数据，先把课表填进来，这里会自动算出你每周的空闲时段热力图。',
      });
      return;
    }

    // 分析窗口：当前周起 3 周，看的是「最近这几周」的稳定空闲
    const window3 = [week, week + 1, week + 2];
    const matrix = freeMatrix(courses, window3);
    const total = window3.length;

    // 全部时段按空闲周数排序，取前几名做推荐
    const flat = [];
    matrix.forEach((row, d) => row.forEach((free, sl) => flat.push({ day: d + 1, slot: sl, free })));
    flat.sort((a, b) => b.free - a.free);
    const top4 = flat.slice(0, 4);

    const best = top4[0];
    // 最高空闲周数为 0 说明这几周每个时段都有课，此时不该硬推「最佳时段」
    const hasFree = Boolean(best) && best.free > 0;

    // 表头
    const slotHeads = TIME_SLOTS.map((sl) => ({
      label: sl.label,
      range: `${sl.from}:00–${sl.to}:00`,
    }));

    // 热力图：行是周几，列是时段
    const heatRows = DAYS.map((label, i) => ({
      label,
      cells: (matrix[i] || []).map((free, j) => ({
        free,
        cls: cellClass(free, total),
        tip: `${total} 周中有 ${free} 周该时段完全没课`,
        key: `${i}-${j}`,
      })),
    }));

    // 排序会把时间顺序打乱，热力图下方的标签需要按「周几 → 时间段」的阅读顺序展示
    const ranked = [...top4]
      .sort((a, b) => a.day - b.day || a.slot - b.slot)
      .map((f, i) => ({
        key: `${f.day}-${f.slot}`,
        text: `${DAYS[f.day - 1]} ${TIME_SLOTS[f.slot].label} · ${f.free}/${total} 周空`,
        tone: i === 0 ? 'emerald' : 'sky',
        first: i === 0,
      }));

    // 推荐列表（保持按空闲度排序的名次）
    const flattest = top4.map((f, i) => {
      const ratio = total > 0 ? f.free / total : 0;
      const k = kindOf(ratio);
      return {
        key: `${f.day}-${f.slot}`,
        rank: i + 1,
        title: `${DAYS[f.day - 1]} ${TIME_SLOTS[f.slot].label} ${TIME_SLOTS[f.slot].from}:00–${TIME_SLOTS[f.slot].to}:00`,
        kindText: k.text,
        kindTone: k.tone,
        desc:
          `第 ${window3[0]}–${window3[2]} 周里有 ${f.free}/${total} 周该时段完全没课` +
          (ratio >= 1
            ? '，每周都稳定空着，适合安排需要固定节奏的事。'
            : ratio >= 0.6
              ? '，大多数周都能用，排计划时优先考虑。'
              : '，只有部分周空着，按周次灵活安排。'),
      };
    });

    // 统计每个时间段跨天的总空闲量，用来说明「这段日子整体哪个时段最松」
    const bySlot = TIME_SLOTS.map((sl, i) => ({
      label: sl.label,
      range: `${sl.from}:00–${sl.to}:00`,
      free: matrix.reduce((acc, row) => acc + (row[i] || 0), 0),
      cap: 7 * total,
    }))
      .sort((a, b) => b.free - a.free)
      .map((x) => ({ ...x, width: Math.min(100, Math.round((x.free / x.cap) * 100)) }));

    this.setData({
      ready: true,
      themeClass: settings.theme === 'light' ? 'theme-light' : '',
      hasCourses: true,
      courseCount: courses.length,
      weekFrom: window3[0],
      weekTo: window3[2],
      total,
      hasFree,
      slotHeads,
      heatRows,
      bestText: hasFree ? `${DAYS[best.day - 1]}${TIME_SLOTS[best.slot].label}` : '',
      ranked,
      flattest,
      bySlot,
      milestones: milestonesShown,
      msMore,
      msExpanded: !!this.data.msExpanded,
    });
  },

  /** 展开/收起「接下来要做的事」的剩余条目 */
  toggleMsExpand() {
    this.setData({ msExpanded: !this.data.msExpanded }, () => this.refresh());
  },

  goCourses() {
    // 课表是 tabBar 页面，只能用 switchTab；用 navigateTo 会静默失败
    wx.switchTab({ url: '/pages/courses/courses' });
  },

  goScan() {
    wx.navigateTo({ url: '/pages/coursescan/coursescan' });
  },

  goMilestones() {
    wx.navigateTo({ url: '/pages/milestones/milestones' });
  },
});
