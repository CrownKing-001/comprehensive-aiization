// 设置：备份导入导出、学期起点、日期锁定、作息时间表、蛋白目标、运动打卡、主题
//
// 与桌面版的差异（小程序能力所限，逐项说明）：
//  · 数据位置：小程序没有文件系统，数据存在本地缓存（Storage）里，
//    面板改为展示「已用 / 上限」并支持一键清空。
//  · 备份导入导出：桌面版写文件，小程序改用剪贴板 ——
//    导出把 JSON 复制到剪贴板（可自行粘贴保存），导入从剪贴板读 JSON。
//  · 桌面提醒：小程序需订阅消息（要用户授权 + 服务端下发），
//    这里保留开关与说明，但不会真的推送。
//  · 饮食照片：小程序无法长期保存本地图片，已整体移除该功能。
//
// 移植自桌面版 src/views/Settings.tsx

const { store } = require('../../store/store');
const { currentWeek } = require('../../utils/plan');
const { fromKey } = require('../../utils/storage');
const { parsePeriodSchedule, formatPeriodSchedule } = require('../../utils/periods');
const { shareAppMessage, shareTimeline } = require('../../utils/share');
const { VERSION } = require('../../version');

Page({
  data: {
    ready: false,
    themeClass: '',
    isLight: false,

    // 「关于」里显示的版本号。唯一真源是 version.js ——
    // 上传版本号在开发者工具里手填，代码拿不到，只能自己记一份。
    version: VERSION,

    // 消息
    msg: null,
    scheduleMsg: null,

    // 存储用量
    usageText: '',
    usageDetail: '',
    quotaText: '',

    // 学期
    semesterStart: '',
    week: 1,
    totalWeeks: 18,
    weekJump: '',

    // 日期锁定
    pinnedDate: '',

    // 作息
    scheduleText: '',
    periodCount: 0,

    // 蛋白
    proteinFactor: '1.8',
    proteinTargetOverride: '',
    latestWeight: null,
    proteinTarget: 110,

    // 运动
    runEnabled: true,
    runTarget: '30',
    runStart: '',
    runEnd: '',
    runTypes: '',

    // 训练日
    trainDaysText: '',
    trainDayChips: [],

    // 通知
    notifyEnabled: false,
    notifyMinutesBefore: '15',

    // 统计
    counts: [],
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

    const week = currentWeek(store.today, fromKey(settings.semesterStart));

    const latestWeight = [...(s.health || [])]
      .filter((h) => typeof h.weight === 'number' && h.weight > 0)
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0];

    // 训练日：'1,3,5' → 周一到周日的 7 个开关状态
    const trainSet = new Set(
      String(settings.trainDays || '')
        .split(/[,，]/)
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7)
    );
    const trainDayChips = ['一', '二', '三', '四', '五', '六', '日'].map((label, i) => ({
      day: i + 1,
      label,
      on: trainSet.has(i + 1),
    }));

    const counts = [
      { label: '课程', n: (s.courses || []).length },
      { label: '待办', n: (s.todos || []).length },
      { label: '作业', n: (s.assignments || []).length },
      { label: '事项', n: (s.milestones || []).length },
      { label: '打卡', n: (s.run || []).length },
      { label: '饮食', n: (s.diet || []).length },
      { label: '身体', n: (s.health || []).length },
      { label: '训练', n: (s.trainDone || []).length },
    ];

    // 本地存储用量
    let bytes = 0;
    try {
      const info = wx.getStorageInfoSync();
      bytes = (info.currentSize || 0) * 1024;
      const limitKB = info.limitSize || 10240;
      this.setData({
        usageText: this._fmtSize(bytes),
        quotaText: `上限 ${this._fmtSize(limitKB * 1024)}`,
        usageDetail: `已用 ${this._fmtSize(bytes)} / ${this._fmtSize(limitKB * 1024)}`,
      });
    } catch (e) {
      this.setData({ usageText: '—', quotaText: '', usageDetail: '读取失败' });
    }

    this.setData({
      ready: true,
      themeClass: settings.theme === 'light' ? 'theme-light' : '',
      isLight: settings.theme === 'light',
      semesterStart: settings.semesterStart,
      week,
      totalWeeks: settings.totalWeeks,
      pinnedDate: settings.pinnedDate || '',
      scheduleText: this.data.scheduleText || formatPeriodSchedule(settings.periods || []),
      periodCount: (settings.periods || []).length,
      proteinFactor: String(settings.proteinFactor),
      proteinTargetOverride:
        settings.proteinTargetOverride === null || settings.proteinTargetOverride === undefined
          ? ''
          : String(settings.proteinTargetOverride),
      latestWeight: latestWeight ? latestWeight.weight : null,
      proteinTarget: store.proteinTarget,
      runEnabled: settings.runEnabled !== false,
      runTarget: String(settings.runTarget || 30),
      runStart: settings.runStart || '',
      runEnd: settings.runEnd || '',
      runTypes: settings.runTypes || '',
      trainDaysText: settings.trainDays || '',
      trainDayChips,
      notifyEnabled: !!settings.notifyEnabled,
      notifyMinutesBefore: String(settings.notifyMinutesBefore || 15),
      counts,
    });
  },

  _fmtSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
  },

  _flash(kind, text) {
    this.setData({ msg: { kind, text } });
    if (this._t) clearTimeout(this._t);
    this._t = setTimeout(() => this.setData({ msg: null }), 5000);
  },

  // ── 主题 ──────────────────────────────────────────
  /** switch 的 change 事件给的是 checked（也就是「是否浅色」） */
  toggleTheme(e) {
    const next = e.detail.value ? 'light' : 'dark';
    store.setSettings({ theme: next });
    wx.showToast({ title: next === 'light' ? '已切浅色' : '已切深色', icon: 'none' });
  },

  // ── 学期 ──────────────────────────────────────────
  onSemesterStart(e) {
    // 直接选学期起点也算「用户说明了当前周次」，走 setCurrentWeek 之外的
    // 普通写入会漏掉确认标记，总览页的醒目提示就撤不掉
    store.setSettings({ semesterStart: e.detail.value, weekConfirmed: true });
    const week = currentWeek(store.today, fromKey(e.detail.value));
    this._flash('ok', `学期起点已设为 ${e.detail.value}，当前是第 ${week} 教学周。`);
  },

  onWeekJump(e) {
    this.setData({ weekJump: e.detail.value });
  },

  /** 按「今天是第 N 周」反推学期起点 */
  applyWeekJump() {
    const n = Number(this.data.weekJump);
    if (!Number.isFinite(n) || n < 1 || n > 40) {
      this._flash('err', '请输入 1–40 之间的周次。');
      return;
    }
    const r = store.setCurrentWeek(n);
    this.setData({ weekJump: '' });
    this._flash('ok', `已按「今天第 ${r.week} 周」把学期起点设为 ${r.start}，全应用周次已重算。`);
  },

  onTotalWeeks(e) {
    const n = Math.max(1, Math.min(40, Number(e.detail.value) || 18));
    store.setSettings({ totalWeeks: n });
  },

  // ── 日期锁定 ──────────────────────────────────────
  onPinnedDate(e) {
    store.setSettings({ pinnedDate: e.detail.value || null });
  },

  clearPinnedDate() {
    store.setSettings({ pinnedDate: null });
    wx.showToast({ title: '已取消锁定', icon: 'none' });
  },

  // ── 作息时间表 ────────────────────────────────────
  onScheduleText(e) {
    this.setData({ scheduleText: e.detail.value });
  },

  importSchedule() {
    const parsed = parsePeriodSchedule(this.data.scheduleText);
    if (!parsed.length) {
      this.setData({
        scheduleMsg: { kind: 'err', text: '没解析出任何时间段。请按「第1节 8:00-8:45」这种格式，每行一节。' },
      });
      return;
    }
    store.setSettings({ periods: parsed });
    this.setData({
      scheduleMsg: { kind: 'ok', text: `已导入 ${parsed.length} 节课的作息时间。` },
      periodCount: parsed.length,
    });
  },

  resetSchedule() {
    store.setSettings({ periods: [] });
    this.setData({ scheduleText: '', periodCount: 0, scheduleMsg: { kind: 'ok', text: '已清空，将使用内置默认作息。' } });
  },

  // ── 蛋白目标 ──────────────────────────────────────
  onProteinFactor(e) {
    const v = Number(e.detail.value) || 1.8;
    store.setSettings({ proteinFactor: v });
  },

  onProteinOverride(e) {
    const v = e.detail.value ? Number(e.detail.value) : null;
    store.setSettings({ proteinTargetOverride: v });
  },

  clearProteinOverride() {
    store.setSettings({ proteinTargetOverride: null });
    wx.showToast({ title: '已改回自动', icon: 'none' });
  },

  // ── 运动打卡 ──────────────────────────────────────
  toggleRunEnabled(e) {
    store.setSettings({ runEnabled: e.detail.value });
  },

  onRunTarget(e) {
    store.setSettings({ runTarget: Math.max(1, Number(e.detail.value) || 1) });
  },

  onRunStart(e) {
    store.setSettings({ runStart: e.detail.value || undefined });
  },

  onRunEnd(e) {
    store.setSettings({ runEnd: e.detail.value || undefined });
  },

  onRunTypes(e) {
    store.setSettings({ runTypes: e.detail.value });
  },

  toggleTrainDay(e) {
    const day = Number(e.currentTarget.dataset.day);
    const cur = new Set(
      String(this.data.trainDaysText || '')
        .split(/[,，]/)
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7)
    );
    if (cur.has(day)) cur.delete(day);
    else cur.add(day);
    const text = [...cur].sort((a, b) => a - b).join(',');
    this.setData({ trainDaysText: text });
    store.setSettings({ trainDays: text });
  },

  // ── 通知 ──────────────────────────────────────────
  toggleNotify(e) {
    store.setSettings({ notifyEnabled: e.detail.value });
    if (e.detail.value) {
      wx.showModal({
        title: '提醒说明',
        content:
          '小程序发送提醒需要「订阅消息」授权，并要求服务端下发，当前版本还没有接入。\n\n这个开关会被保存，但暂时不会真的推送通知。',
        showCancel: false,
      });
    }
  },

  onNotifyMinutes(e) {
    store.setSettings({ notifyMinutesBefore: Math.max(1, Number(e.detail.value) || 15) });
  },

  // ── 备份 ──────────────────────────────────────────
  /** 导出：把整份数据复制到剪贴板 */
  doExport() {
    const payload = store.exportAll();
    const json = JSON.stringify(payload);
    wx.setClipboardData({
      data: json,
      success: () => {
        wx.showModal({
          title: '已复制备份',
          content: `共 ${this._fmtSize(json.length)} 数据已复制到剪贴板。请粘贴到备忘录、聊天窗口或文件里保存。`,
          showCancel: false,
        });
      },
      fail: () => this._flash('err', '复制失败，请检查剪贴板权限。'),
    });
  },

  /** 导入：从剪贴板读 JSON */
  doImport() {
    wx.getClipboardData({
      success: (r) => {
        const text = String(r.data || '').trim();
        if (!text) {
          this._flash('err', '剪贴板是空的。请先复制之前导出的备份内容。');
          return;
        }
        let data;
        try {
          data = JSON.parse(text);
        } catch (err) {
          this._flash('err', '剪贴板内容不是合法的备份 JSON。');
          return;
        }
        wx.showModal({
          title: '确认导入',
          content: '导入会覆盖当前全部数据，建议先导出备份。确定继续吗？',
          success: (m) => {
            if (!m.confirm) return;
            try {
              store.importAll(data);
              this._flash('ok', '导入成功，数据已恢复。');
            } catch (e) {
              this._flash('err', '导入失败：' + String(e && e.message ? e.message : e));
            }
          },
        });
      },
      fail: () => this._flash('err', '读取剪贴板失败。'),
    });
  },

  /** 清空本地存储缓存 */
  clearStorageCache() {
    wx.showModal({
      title: '清理缓存',
      content: '清空小程序的本地缓存（不影响已保存的数据键），通常用于排查显示异常。确定继续吗？',
      success: (r) => {
        if (!r.confirm) return;
        const keys = Object.keys(store.shape).map((k) => k);
        const data = store.exportAll();
        wx.clearStorageSync();
        store.importAll(data);
        this._flash('ok', '已清理缓存并恢复数据。');
      },
    });
  },

  doReset() {
    wx.showModal({
      title: '清空所有数据',
      content: '待办、作业、课表、健康记录、打卡都会删除，且无法恢复。建议先导出备份。确定吗？',
      confirmText: '清空',
      confirmColor: '#e11d48',
      success: (r) => {
        if (!r.confirm) return;
        store.resetAll();
        this._flash('ok', '已清空全部数据');
      },
    });
  },

  // 分享：右上角「···」里的「转发」和「分享到朋友圈」。
  // 这两个是页面级回调，不是普通方法 —— 合并页的 tabHost 必须跳过它们
  // （见 utils/tabHost.js 的前缀循环），否则会被改名成 xxx_onShareAppMessage。
  onShareAppMessage() {
    return shareAppMessage('settings');
  },

  onShareTimeline() {
    return shareTimeline('settings');
  },
});
