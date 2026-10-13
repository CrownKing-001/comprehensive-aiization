// 校历识别：把校历文字解析成关键日期 → 逐条确认 → 写入重要事项。
//
// 与「课表识别」的区别：课表识别的是课程网格（课程名/星期/节次/教室/周次），
// 校历识别的是自然语言说明区里的关键日期（报到/上课/考试/放假），并可用
// 「正式上课 / 教学周」那天反推学期起点（进而校准当前教学周）。
//
// 设计取舍：
//  · 解析一定有错（日期串行、标题截断），所以**绝不自动写入**，
//    一律先列出识别结果让你逐条勾选、可改日期和标题，确认后才落库。
//  · 桌面版用 Windows 自带 OCR 识图；小程序没有这个能力，本页只保留
//    「粘贴文字」这条更可靠的路径（校历文字里常自带周次-日期对应表）。
//
// 移植自桌面版 src/views/CalendarAcademic.tsx

const { store, uid } = require('../../store/store');
const { parseCalendarText } = require('../../utils/textParse');
const { CALENDAR_AI_PROMPT, copyToClipboard } = require('../../utils/aiPrompts');

const CATEGORY_TONE = {
  教务: 'sky',
  考试: 'rose',
  假期: 'emerald',
  活动: 'amber',
};

/** 给识别结果推一个分类默认值 */
function guessCategory(title) {
  if (/考|测试|四级|六级/.test(title)) return '考试';
  if (/假|节/.test(title)) return '假期';
  if (/运动会|活动|比赛|晚会/.test(title)) return '活动';
  return '教务';
}

Page({
  data: {
    ready: false,
    themeClass: '',

    msg: null,

    // 粘贴
    pasteText: '',
    promptOpen: false,
    promptText: CALENDAR_AI_PROMPT,

    // 解析出的学期信息
    parsedStart: '',
    parsedWeeks: null,

    // 识别记录
    docs: [],
    activeId: null,
    activeName: '',

    // 草稿（确认前不写库）
    draft: [],
    acceptedCount: 0,
    importedCount: 0,

    // 原始文字回看
    showRaw: false,
    rawLines: [],

    catOptions: ['教务', '考试', '假期', '活动'],
    todayKey: '',
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
    const docs = s.calendars || [];

    this.setData({
      ready: true,
      themeClass: settings.theme === 'light' ? 'theme-light' : '',
      docs: docs.map((d) => ({
        id: d.id,
        name: d.name,
        engine: d.engine || '',
        lineCount: d.lineCount || 0,
        eventCount: (d.events || []).length,
        createdAt: (d.createdAt || '').slice(0, 16).replace('T', ' '),
        active: d.id === this.data.activeId,
      })),
      todayKey: store.todayKey,
    });
  },

  _notify(kind, text) {
    this.setData({ msg: { kind, text } });
    if (this._t) clearTimeout(this._t);
    this._t = setTimeout(() => {
      this.setData({ msg: null });
    }, 6000);
  },

  // ── AI 指令 ────────────────────────────────────────
  copyPrompt() {
    copyToClipboard(CALENDAR_AI_PROMPT).then(
      () => this._notify('ok', '已复制指令。把它连同你的校历原文发给豆包等 AI，再把 AI 输出的文字粘贴到下面的输入框。'),
      () => {
        this.setData({ promptOpen: true });
        this._notify('err', '自动复制失败，已展开指令原文，请手动全选复制。');
      }
    );
  },

  togglePrompt() {
    this.setData({ promptOpen: !this.data.promptOpen });
  },

  onPasteInput(e) {
    this.setData({ pasteText: e.detail.value });
  },

  clearPaste() {
    this.setData({ pasteText: '' });
  },

  // ── 解析 ──────────────────────────────────────────
  /** 解析粘贴的校历文字：能直接拿到学期起点、总周数、关键日期，比识图可靠 */
  parsePasted() {
    const text = this.data.pasteText;
    if (!String(text || '').trim()) return;
    const res = parseCalendarText(text);
    if (!res.events.length && !res.semesterStart) {
      this._notify('err', (res.warnings && res.warnings[0]) || '没有解析出内容，请检查文字里是否包含日期。');
      return;
    }

    // 与图片识别保持一致：文字解析也存一条「识别记录」，
    // 这样结果区、逐条核对、「添加到重要事项」、原始文本回看全都和识图路径一样。
    const doc = {
      id: uid(),
      relPath: '',
      name: '粘贴的校历文字',
      scale: 1,
      engine: '文字解析',
      lineCount: String(text).split(/\r?\n/).filter((l) => l.trim()).length,
      createdAt: new Date().toISOString(),
      events: res.events.map((e) => ({
        id: uid(),
        title: e.title,
        date: e.date,
        category: e.category,
        emoji: e.emoji,
        raw: e.raw,
        confidence: 'high',
        accepted: true,
      })),
    };

    const docs = store.shape.calendars || [];
    store.setCalendars([doc, ...docs]);
    this.setData(
      {
        activeId: doc.id,
        parsedStart: res.semesterStart || '',
        parsedWeeks: res.totalWeeks || null,
        rawLines: String(text).split(/\r?\n/),
        showRaw: false,
      },
      () => {
        this._loadDraft(doc);
        this._notify(
          'ok',
          `解析出 ${res.events.length} 个关键日期${res.semesterStart ? `，学期起点 ${res.semesterStart}` : ''}` +
            `${res.totalWeeks ? `，共 ${res.totalWeeks} 周` : ''}，已存入「识别记录」，请核对后点「添加到重要事项」。`
        );
      }
    );
  },

  /** 把某条识别记录的 events 载入可编辑草稿 */
  _loadDraft(doc) {
    const draft = (doc.events || []).map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      category: e.category || guessCategory(e.title),
      emoji: e.emoji || '📌',
      raw: e.raw || '',
      confidence: e.confidence || 'high',
      accepted: e.accepted !== false,
      importedAs: e.importedAs,
      tone: CATEGORY_TONE[e.category] || 'slate',
    }));
    this.setData({
      activeName: doc.name,
      draft,
      acceptedCount: draft.filter((d) => d.accepted).length,
      importedCount: draft.filter((d) => d.importedAs).length,
    });
  },

  // ── 记录切换 / 删除 ────────────────────────────────
  pickDoc(e) {
    const id = e.currentTarget.dataset.id;
    const docs = store.shape.calendars || [];
    const doc = docs.find((d) => d.id === id);
    if (!doc) return;
    this.setData({ activeId: id, showRaw: false, rawLines: [] }, () => this._loadDraft(doc));
    this.refresh();
  },

  deleteDoc(e) {
    const id = e.currentTarget.dataset.id;
    const docs = store.shape.calendars || [];
    wx.showModal({
      title: '删除识别记录',
      content: '只删除这条记录，已写入「重要事项」的条目不受影响。确定吗？',
      success: (r) => {
        if (!r.confirm) return;
        store.setCalendars(docs.filter((d) => d.id !== id));
        if (this.data.activeId === id) {
          this.setData({ activeId: null, draft: [], activeName: '', acceptedCount: 0, importedCount: 0 });
        }
        this.refresh();
      },
    });
  },

  // ── 草稿编辑 ──────────────────────────────────────
  toggleAccept(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const draft = [...this.data.draft];
    draft[idx] = { ...draft[idx], accepted: !draft[idx].accepted };
    this.setData({ draft, acceptedCount: draft.filter((d) => d.accepted).length });
  },

  editTitle(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    this.setData({ [`draft[${idx}].title`]: e.detail.value });
  },

  pickDate(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    this.setData({ [`draft[${idx}].date`]: e.detail.value });
  },

  pickCategory(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const cats = this.data.catOptions;
    const cat = cats[Number(e.detail.value)];
    this.setData({ [`draft[${idx}].category`]: cat, [`draft[${idx}].tone`]: CATEGORY_TONE[cat] || 'slate' });
  },

  toggleRaw() {
    this.setData({ showRaw: !this.data.showRaw });
  },

  // ── 写入重要事项 ──────────────────────────────────
  /**
   * 把勾选的条目写进「重要事项」。
   * 图片识别和粘贴文字两条路径都走这里（小程序只有粘贴路径）。
   */
  importToMilestones() {
    const draft = this.data.draft;
    if (!draft || !draft.length) {
      this._notify('err', '还没有可导入的条目，请先解析校历文字。');
      return;
    }
    const good = draft.filter((e) => e.accepted && String(e.title || '').trim() && e.date);
    if (!good.length) {
      this._notify('err', '没有勾选任何有效条目（需要同时有标题和日期）。');
      return;
    }

    const milestones = store.shape.milestones || [];
    // 已有的事项按「标题 + 日期」判重，避免重复导入
    const existing = new Set(milestones.map((m) => `${m.title}|${m.date || ''}`));
    const fresh = good.filter((e) => !existing.has(`${String(e.title).trim()}|${e.date}`));
    const skipped = good.length - fresh.length;

    const newOnes = fresh.map((e) => ({
      id: 'ms-' + e.id,
      title: String(e.title).trim(),
      date: e.date,
      category: e.category || guessCategory(e.title),
      emoji: e.emoji || '📌',
      remindDaysBefore: e.category === '假期' ? 3 : 7,
      done: false,
      checklist: [],
      note: e.raw ? `来自校历识别：${e.raw}` : '来自校历识别',
    }));

    // 记下已写入的 id，便于在页面上标出「已写入」
    const importedIds = new Map(fresh.map((e, i) => [e.id, newOnes[i].id]));

    store.setMilestones([...milestones, ...newOnes]);

    // 更新草稿上的「已写入」标记
    const nextDraft = draft.map((e) => ({
      ...e,
      importedAs: importedIds.get(e.id) || e.importedAs,
    }));
    this.setData({
      draft: nextDraft,
      importedCount: nextDraft.filter((d) => d.importedAs).length,
    });

    // 若有对应的识别记录，把状态一并回写
    const active = (store.shape.calendars || []).find((d) => d.id === this.data.activeId);
    if (active) {
      const nextEvents = (active.events || []).map((e) => ({
        ...e,
        accepted: (draft.find((x) => x.id === e.id) || {}).accepted !== undefined
          ? draft.find((x) => x.id === e.id).accepted
          : e.accepted,
        importedAs: importedIds.get(e.id) || e.importedAs,
      }));
      store.setCalendars(
        (store.shape.calendars || []).map((d) => (d.id === active.id ? { ...d, events: nextEvents } : d))
      );
    }

    this._notify(
      'ok',
      `已添加 ${newOnes.length} 条到「重要事项」${skipped ? `，跳过 ${skipped} 条已存在的` : ''}。去「重要事项」页就能看到倒计时。`
    );
    this.refresh();
  },

  /** 顺带把教学周起止写进设置：用「正式上课 / 教学周」那天反推学期起点 */
  applyTeachingWeeks() {
    const draft = this.data.draft;
    if (!draft || !draft.length) return;
    const start = draft.find((e) => e.accepted && /正式上课|教学周/.test(e.title) && e.date);
    if (!start) {
      this._notify('err', '没找到「正式上课 / 教学周」这类条目，无法推断学期起点。');
      return;
    }
    store.setSettings({ semesterStart: start.date });
    this._notify('ok', `已把学期起点设为 ${start.date}，周计划与本学期周次会据此重算。`);
  },

  /** 把文字解析出的学期起点 / 总周数写进设置 */
  applyParsedSettings() {
    const patch = {};
    if (this.data.parsedStart) patch.semesterStart = this.data.parsedStart;
    if (this.data.parsedWeeks) patch.totalWeeks = this.data.parsedWeeks;
    if (!Object.keys(patch).length) {
      this._notify('err', '这段文字里没有学期起点或总周数，无法应用。');
      return;
    }
    store.setSettings(patch);
    this._notify(
      'ok',
      `已应用${this.data.parsedStart ? `：学期起点 ${this.data.parsedStart}` : ''}` +
        `${this.data.parsedWeeks ? `${this.data.parsedStart ? '，' : '：'}总周数 ${this.data.parsedWeeks}` : ''}。周计划与当前教学周已重算。`
    );
  },

  goMilestones() {
    wx.navigateTo({ url: '/pages/milestones/milestones' });
  },

  goScan() {
    wx.navigateTo({ url: '/pages/coursescan/coursescan' });
  },
});
