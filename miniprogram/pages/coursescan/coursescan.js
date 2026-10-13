// 课表识别：粘贴课表文字 → 解析 → 逐条核对 → 导入课表。
//
// 设计取舍（沿用桌面版）：
//  · 解析一定会有错（课程名认错、周次串行、地点串到隔壁），所以**绝不自动写入**。
//    一律先列出解析结果，用户逐条核对、修改、取消勾选，确认后才写进课表。
//  · 小程序端不做图片 OCR（桌面版用的 Windows.Media.Ocr 不可用），
//    只保留「粘贴文字」这条路径 —— 而它本来就更准（文字是确定的）。
//
// 移植自桌面版 src/views/CalendarScan.tsx

const { store, uid } = require('../../store/store');
const { currentWeek, semesterStartForWeek } = require('../../utils/plan');
const { fromKey, toKey } = require('../../utils/storage');
const { parseTimetableText } = require('../../utils/textParse');
const { weeksToText, parseWeeksText } = require('../../utils/weeks');
const { TIMETABLE_AI_PROMPT } = require('../../utils/aiPrompts');

const WEEKDAY_LABEL = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

Page({
  data: {
    ready: false,
    themeClass: '',

    pasteText: '',
    promptText: TIMETABLE_AI_PROMPT,
    showPrompt: false,

    // 解析结果草稿
    hasDraft: false,
    draft: [],
    acceptedCount: 0,
    detectedWeek: null,
    onlyThisWeek: false,
    currentWeekNum: 1,

    // 原始文本
    rawLines: [],
    showRaw: false,

    // 解析警告（如「字段没用逗号分隔」），只要非空就一直挂在页面上
    parseWarnings: [],

    msg: null,
  },

  onLoad() {
    this._unsub = store.subscribe(() => this.refresh());
    if (store.ready) this.refresh();
  },

  onUnload() {
    if (this._unsub) this._unsub();
  },

  refresh() {
    const settings = store.shape.settings;
    const curWeek = currentWeek(store.today, fromKey(settings.semesterStart));
    this.setData({
      ready: true,
      themeClass: settings.theme === 'light' ? 'theme-light' : '',
      currentWeekNum: curWeek,
    });
    this._recompute();
  },

  /** 根据「只导入本周」开关重新算可见草稿 */
  _recompute() {
    if (!this._allDraft) {
      this.setData({ draft: [], acceptedCount: 0 });
      return;
    }
    const cur = this.data.currentWeekNum;
    const visible = this.data.onlyThisWeek
      ? this._allDraft.filter((c) => c.nonThisWeek || !c.weeks || c.weeks.indexOf(cur) >= 0)
      : this._allDraft;

    const draft = visible.map((c) => ({
      id: c.id,
      accepted: c.accepted,
      name: c.name,
      day: c.day,
      dayText: WEEKDAY_LABEL[c.day] || '',
      timeText: `${c.start}–${c.end}`,
      place: c.place || '',
      weeksText: c.weeksText,
      raw: c.raw,
      nonThisWeek: c.nonThisWeek,
      confidence: c.confidence,
      confidenceText: c.confidence === 'high' ? '高' : c.confidence === 'medium' ? '中' : '低',
      confidenceTone: c.confidence === 'high' ? 'emerald' : c.confidence === 'medium' ? 'amber' : 'rose',
    }));

    const acceptedCount = draft.filter((c) => c.accepted && String(c.name).trim()).length;
    this.setData({ draft, acceptedCount, hasDraft: this._allDraft.length > 0 });
  },

  onPasteInput(e) {
    this.setData({ pasteText: e.detail.value });
  },

  /** 解析粘贴的课表文字 */
  parsePasted() {
    const text = this.data.pasteText;
    if (!text.trim()) {
      this._notify('err', '请先粘贴课表文字。');
      return;
    }
    const res = parseTimetableText(text, store.shape.settings.periods);
    if (!res.courses.length) {
      this._notify('err', res.warnings[0] || '没有解析出课程，请检查文字里是否包含「周一」这类分节标题。');
      return;
    }

    this._allDraft = res.courses.map((c) => ({
      id: uid(),
      // 标了「非本周」的课默认不勾选，否则会被当成每周都上
      accepted: !c.nonThisWeek,
      name: c.name,
      day: c.day,
      start: c.start,
      end: c.end,
      place: c.place,
      weeks: c.weeks,
      weeksText: weeksToText(c.weeks),
      raw: c.raw,
      nonThisWeek: c.nonThisWeek,
      confidence: c.confidence,
    }));

    this.setData({
      detectedWeek: res.textWeek,
      rawLines: text.split(/\r?\n/).filter((l) => l.trim()),
      showRaw: false,
      // 解析出的警告要一直挂着，不能只在「一门课都没解析出来」时才说。
      // 之前这里是丢掉的：只要解析出 1 门课就走成功提示，用户看不到
      // 「字段没用逗号分隔」这类问题，会直接导入一串错数据。
      parseWarnings: res.warnings || [],
    });
    this._recompute();

    if (res.warnings && res.warnings.length) {
      this._notify(
        'err',
        `解析出 ${res.courses.length} 门课程，但有问题需要先处理：${res.warnings[0]}`
      );
    } else {
      this._notify(
        'ok',
        `解析出 ${res.courses.length} 门课程${res.textWeek ? `（这份文字属于第 ${res.textWeek} 周）` : ''}，请核对后导入。`
      );
    }
  },

  toggleAccept(e) {
    const id = e.currentTarget.dataset.id;
    const item = this._allDraft.find((c) => c.id === id);
    if (!item) return;
    item.accepted = !item.accepted;
    this._recompute();
  },

  acceptAll() {
    if (!this._allDraft) return;
    this._allDraft.forEach((c) => { c.accepted = true; });
    this._recompute();
  },

  acceptNone() {
    if (!this._allDraft) return;
    this._allDraft.forEach((c) => { c.accepted = false; });
    this._recompute();
  },

  onWeeksEdit(e) {
    const id = e.currentTarget.dataset.id;
    const item = this._allDraft.find((c) => c.id === id);
    if (!item) return;
    item.weeksText = e.detail.value;
    item.weeks = parseWeeksText(e.detail.value);
    this._recompute();
  },

  onNameEdit(e) {
    const id = e.currentTarget.dataset.id;
    const item = this._allDraft.find((c) => c.id === id);
    if (!item) return;
    item.name = e.detail.value;
    this._recompute();
  },

  onPlaceEdit(e) {
    const id = e.currentTarget.dataset.id;
    const item = this._allDraft.find((c) => c.id === id);
    if (!item) return;
    item.place = e.detail.value;
  },

  toggleOnlyThisWeek(e) {
    this.setData({ onlyThisWeek: e.detail.value }, () => this._recompute());
  },

  toggleRaw() {
    this.setData({ showRaw: !this.data.showRaw });
  },

  togglePrompt() {
    this.setData({ showPrompt: !this.data.showPrompt });
  },

  /** 复制「给 AI 的指令」 */
  copyPrompt() {
    wx.setClipboardData({
      data: TIMETABLE_AI_PROMPT,
      success: () => {
        wx.showModal({
          title: '已复制指令',
          content: '把它连同你的课表原文发给豆包等 AI，再把 AI 输出的文字粘贴到上面的输入框，然后点「解析」。',
          showCancel: false,
        });
      },
      fail: () => {
        this.setData({ showPrompt: true });
        this._notify('err', '复制失败，已展开指令原文，请手动长按全选复制。');
      },
    });
  },

  /** 用文字里识别出的「第N周」校准当前教学周 */
  applyCurrentWeek() {
    const w = this.data.detectedWeek;
    if (!w) return;
    const start = semesterStartForWeek(w, store.today);
    store.setSettings({ semesterStart: toKey(start) });
    this._notify('ok', `已把当前周设为第 ${w} 周（学期起点调整为 ${toKey(start)}），全应用的周次会据此重算。`);
  },

  /** 把勾选的课程写进课表 */
  importToCourses() {
    if (!this._allDraft) return;
    const good = this._allDraft.filter((c) => c.accepted && String(c.name).trim());
    if (!good.length) {
      this._notify('err', '没有勾选任何课程（需要有课程名）。');
      return;
    }

    const existing = store.shape.courses || [];
    // 已有课表按「课程名 + 星期 + 开始时间」判重，避免重复导入
    const seen = new Set(existing.map((c) => `${c.name}|${c.day}|${c.start}`));
    const fresh = good.filter((c) => !seen.has(`${String(c.name).trim()}|${c.day}|${c.start}`));
    const skipped = good.length - fresh.length;

    const totalWeeks = store.shape.settings.totalWeeks || 18;
    const newOnes = fresh.map((c) => {
      const weeks = parseWeeksText(c.weeksText);
      return {
        id: uid(),
        day: c.day,
        name: String(c.name).trim(),
        start: c.start,
        end: c.end,
        place: String(c.place || '').trim(),
        // 文字里没写周次时，用「整个学期」表达，让课表页每天都能显示出来
        weeks: weeks || Array.from({ length: totalWeeks }, (_, i) => i + 1),
        tag: '导入',
      };
    });

    store.setCourses([...existing, ...newOnes]);
    this._notify('ok', `已导入 ${newOnes.length} 门课程${skipped ? `，跳过 ${skipped} 门已存在的` : ''}。`);
  },

  goCourses() {
    wx.switchTab({ url: '/pages/courses/courses' });
  },

  _notify(kind, text) {
    this.setData({ msg: { kind, text } });
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      this.setData({ msg: null });
    }, 6000);
  },
});
