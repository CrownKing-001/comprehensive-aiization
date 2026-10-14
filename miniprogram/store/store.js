// 全局数据仓库。移植自桌面版 src/store/store.tsx。
//
// 差异说明：桌面版用 React Context + useState，小程序没有组件树状态，
// 所以这里改成一个全局单例 store：
//   · 页面 onLoad 时 subscribe(fn) 注册刷新回调，onUnload 时退订；
//   · 每次写入后 notify() 广播，各页面 setData 自己的派生数据。
// 数据形状、默认值、键名与桌面版逐字一致，保证备份互通。

const { KEYS, loadAll, replaceAll, saveData, toKey } = require('../utils/storage');
const { DEFAULT_SEMESTER_START, DEFAULT_TOTAL_WEEKS, semesterStartForWeek } = require('../utils/plan');
const { proteinTargetFor } = require('../data/foods');

const DEFAULT_SETTINGS = {
  pinnedDate: null,
  notifyEnabled: false,
  notifyMinutesBefore: 15,
  semesterStart: toKey(DEFAULT_SEMESTER_START),
  totalWeeks: DEFAULT_TOTAL_WEEKS,
  // 用户是否**显式**说明过「今天是第几周」。
  // 首次安装时 semesterStart 被兜底成本周一 → 显示「第 1 教学周」，
  // 这个值和「用户真的在第 1 周」长得一模一样，光看数据分不出来，
  // 所以总览页那个「现在是第几周？」的醒目提示需要一个独立的标记来决定去留。
  weekConfirmed: false,
  startMinimized: false,
  theme: 'dark',
  periods: [],
  proteinTargetOverride: null,
  proteinFactor: 1.8,
  photoQuotaMB: 500,
  runStart: '',
  runEnd: '',
  runTarget: 30,
  runEnabled: true,
  runTypes: '跑步,健步走,健身房,球类,游泳,骑行',
  // 默认周一/三/五为训练日，用户可在「设置」里随时改
  trainDays: '1,3,5',
};

const FALLBACK = {
  health: [],
  trainDone: [],
  diet: [],
  dietSeed: [],
  run: [],
  courses: null,
  todos: [],
  assignments: [],
  templates: [],
  milestones: [],
  calendars: [],
  settings: DEFAULT_SETTINGS,
};

const nowDate = (settings) => {
  if (settings.pinnedDate) {
    const [y, m, d] = settings.pinnedDate.split('-').map(Number);
    if (y && m && d) return new Date(y, m - 1, d);
  }
  return new Date();
};

let seq = 0;
const uid = () => `${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// ── store 本体 ──────────────────────────────────────────

/**
 * 把存储里的值收敛成「干净的数组」。
 *
 * 为什么需要：`wx.getStorageSync` 返回的是 JSON.parse 的结果，本地存储被别处
 * 写坏、或者用户手动粘贴备份时留下 `[null, {...}]` 这种空洞是完全可能的。
 * 数组里夹一个 null，各页面的 `.map(m => m.xxx)` / `sort((a,b) => a.done...)`
 * 就会当场抛错 —— 而 store 的 notify 是逐订阅者 try/catch 的，页面不会白屏，
 * 但会**停在旧数据上不再更新**，表现为「点了没反应」，比白屏更难查。
 * 所以在这一层统一滤掉，而不是让 14 个模块各自记得判空。
 *
 * 注意：`trainDone` 存的是日期**字符串**数组，所以这里只能滤掉
 * null / undefined，不能要求元素必须是对象（那样会把打卡记录全滤没）。
 */
function cleanList(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => x !== null && x !== undefined);
}

/** 元素必须是对象的数组（课表/待办/事项……）；用于写入前的收敛与形状校验 */
function isObjectList(v) {
  return Array.isArray(v) && v.every((x) => x && typeof x === 'object');
}

const store = {
  ready: false,
  shape: Object.assign({}, FALLBACK),
  _subs: [],

  /** 页面注册刷新回调，返回退订函数 */
  subscribe(fn) {
    this._subs.push(fn);
    return () => {
      this._subs = this._subs.filter((f) => f !== fn);
    };
  },

  notify() {
    for (const f of this._subs) {
      try {
        f();
      } catch (e) {
        console.error('[store] 订阅回调出错', e);
      }
    }
  },

  /** 首次装载：一次性读出全部数据 */
  hydrate() {
    const all = loadAll();
    const merged = Object.assign({}, FALLBACK);
    for (const k of Object.keys(all)) {
      const v = all[k];
      if (k === KEYS.settings) merged.settings = Object.assign({}, DEFAULT_SETTINGS, v);
      else if (k === KEYS.health) merged.health = cleanList(v);
      else if (k === KEYS.trainDone) merged.trainDone = cleanList(v);
      else if (k === KEYS.diet) merged.diet = cleanList(v);
      else if (k === KEYS.dietSeed) merged.dietSeed = cleanList(v);
      else if (k === KEYS.run) merged.run = cleanList(v);
      else if (k === KEYS.courses) merged.courses = v ? cleanList(v) : null;
      else if (k === KEYS.todos) merged.todos = cleanList(v);
      else if (k === KEYS.assignments) merged.assignments = cleanList(v);
      else if (k === KEYS.templates) merged.templates = cleanList(v);
      else if (k === KEYS.milestones) merged.milestones = cleanList(v);
      else if (k === KEYS.calendars) {
        // 老数据可能缺字段，补默认值，避免 UI 读到 undefined 崩掉
        merged.calendars = cleanList(v).map((c) =>
          Object.assign({}, c, { events: cleanList(c.events).map((e) => Object.assign({}, e, { accepted: e.accepted !== false })) })
        );
      }
    }
    this.shape = merged;
    this.ready = true;
  },

  // ── 派生 ──
  get today() {
    return nowDate(this.shape.settings);
  },
  get todayKey() {
    return toKey(nowDate(this.shape.settings));
  },
  /** 当前生效的每日蛋白质目标（结合体重与用户覆盖值） */
  get proteinTarget() {
    const override = this.shape.settings.proteinTargetOverride;
    if (typeof override === 'number' && override > 0) return override;
    const latest = [...this.shape.health]
      .filter((h) => typeof h.weight === 'number' && h.weight > 0)
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    return proteinTargetFor(latest ? latest.weight : 0, this.shape.settings.proteinFactor);
  },

  // ── 写 ──
  // 这些键存的是「对象数组」，写入前一律过滤空洞并收敛成数组：
  // 否则一次 setMilestones(null) 会把内存和本地存储同时写坏，而 store 的
  // notify 是逐订阅者 try/catch 的 —— 页面不白屏，只是**停在旧数据上不再更新**，
  // 表现为「点了没反应」，比白屏更难查。courses 例外（允许 null 表示还没导课）。
  // 这些键存的是「对象数组」，写入前一律收敛成数组并过滤空洞。
  // trainDone 存的是日期字符串数组，不能用对象校验（会把打卡记录全滤没）。
  _update(key, value, storeKey) {
    let v;
    if (key === 'courses') {
      // courses 用 null 表示「还没导课」，不能被收敛成 []
      v = Array.isArray(value) ? cleanList(value) : (value ? cleanList(value) : null);
      if (!isObjectList(v)) v = v === null ? null : [];
    } else if (key === 'trainDone' || key === 'dietSeed') {
      v = cleanList(value);
    } else {
      // 先滤空洞再校验形状：`[null, {...}]` 这种带空洞的合法数组，
      // 直接整体校验会因为 null 而判成「不是对象数组」，把数据全丢掉。
      const cleaned = cleanList(value);
      v = isObjectList(cleaned) ? cleaned : [];
    }
    this.shape = Object.assign({}, this.shape, { [key]: v });
    if (this.ready) saveData(storeKey, v);
    this.notify();
  },
  setHealth(v) { this._update('health', v, KEYS.health); },
  setTrainDone(v) { this._update('trainDone', v, KEYS.trainDone); },
  setDiet(v) { this._update('diet', v, KEYS.diet); },
  setDietSeed(v) { this._update('dietSeed', v, KEYS.dietSeed); },
  setRun(v) { this._update('run', v, KEYS.run); },
  setCourses(v) { this._update('courses', v, KEYS.courses); },
  setTodos(v) { this._update('todos', v, KEYS.todos); },
  setAssignments(v) { this._update('assignments', v, KEYS.assignments); },
  setTemplates(v) { this._update('templates', v, KEYS.templates); },
  setMilestones(v) { this._update('milestones', v, KEYS.milestones); },
  setCalendars(v) { this._update('calendars', v, KEYS.calendars); },
  setSettings(patch) {
    const next = Object.assign({}, this.shape.settings, patch);
    this.shape = Object.assign({}, this.shape, { settings: next });
    if (this.ready) saveData(KEYS.settings, next);
    this.notify();
  },

  /**
   * 用户显式声明「今天是第 N 周」：反推学期起点，并记下「已经确认过」。
   *
   * 所有「让用户说明当前周次」的入口都走这里，而不是各自写 semesterStart：
   *  · 设置页的「当前是第几周」输入框
   *  · 课表识别页的「用识别到的周次校准」
   *  · 校历识别页的「按正式上课日反推」
   * 只要有一个入口漏了确认标记，总览页的醒目提示就会赖着不走。
   * 返回实际生效的周次与学期起点，供调用方拼提示语。
   */
  setCurrentWeek(week) {
    const n = Math.max(1, Math.min(40, Math.round(Number(week) || 1)));
    const start = toKey(semesterStartForWeek(n, this.today));
    this.setSettings({ semesterStart: start, weekConfirmed: true });
    return { week: n, start };
  },

  // ── 备份 ──
  exportAll() {
    const s = this.shape;
    return {
      __app: 'university-desk',
      __version: 1,
      __exportedAt: new Date().toISOString(),
      [KEYS.health]: s.health,
      [KEYS.trainDone]: s.trainDone,
      [KEYS.diet]: s.diet,
      [KEYS.run]: s.run,
      [KEYS.courses]: s.courses,
      [KEYS.todos]: s.todos,
      [KEYS.assignments]: s.assignments,
      [KEYS.templates]: s.templates,
      [KEYS.milestones]: s.milestones,
      [KEYS.calendars]: s.calendars,
      [KEYS.settings]: s.settings,
    };
  },

  importAll(obj) {
    const s = this.shape;
    const pick = (k, fallback) => (obj[k] === undefined ? fallback : obj[k]);
    const next = {
      health: cleanList(pick(KEYS.health, s.health)),
      trainDone: cleanList(pick(KEYS.trainDone, s.trainDone)),
      diet: cleanList(pick(KEYS.diet, s.diet)),
      dietSeed: s.dietSeed,
      run: cleanList(pick(KEYS.run, s.run)),
      courses: cleanList(pick(KEYS.courses, s.courses)),
      todos: cleanList(pick(KEYS.todos, s.todos)),
      assignments: cleanList(pick(KEYS.assignments, s.assignments)),
      templates: cleanList(pick(KEYS.templates, s.templates)).map((t) =>
        Object.assign({}, t, { items: cleanList(t.items) })
      ),
      milestones: cleanList(pick(KEYS.milestones, s.milestones)).map((m) =>
        Object.assign({}, m, { checklist: cleanList(m.checklist).map((c) => String(c)) })
      ),
      calendars: cleanList(pick(KEYS.calendars, s.calendars)).map((c) =>
        Object.assign({}, c, { events: cleanList(c.events).map((e) => Object.assign({}, e, { accepted: e.accepted !== false })) })
      ),
      settings: Object.assign({}, DEFAULT_SETTINGS, pick(KEYS.settings, s.settings)),
    };
    replaceAll({
      [KEYS.health]: next.health,
      [KEYS.trainDone]: next.trainDone,
      [KEYS.diet]: next.diet,
      [KEYS.run]: next.run,
      [KEYS.courses]: next.courses,
      [KEYS.todos]: next.todos,
      [KEYS.assignments]: next.assignments,
      [KEYS.templates]: next.templates,
      [KEYS.milestones]: next.milestones,
      [KEYS.calendars]: next.calendars,
      [KEYS.settings]: next.settings,
    });
    this.shape = next;
    this.notify();
  },

  resetAll() {
    replaceAll({
      [KEYS.health]: [],
      [KEYS.trainDone]: [],
      [KEYS.diet]: [],
      [KEYS.dietSeed]: [],
      [KEYS.run]: [],
      [KEYS.courses]: [],
      [KEYS.todos]: [],
      [KEYS.assignments]: [],
      [KEYS.templates]: [],
      [KEYS.milestones]: [],
      [KEYS.calendars]: [],
      [KEYS.settings]: DEFAULT_SETTINGS,
    });
    this.shape = Object.assign({}, FALLBACK, { courses: [], settings: DEFAULT_SETTINGS });
    this.notify();
  },
};

module.exports = { store, uid, DEFAULT_SETTINGS, KEYS };
