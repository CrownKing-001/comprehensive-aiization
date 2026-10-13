// 全局数据仓库。移植自桌面版 src/store/store.tsx。
//
// 差异说明：桌面版用 React Context + useState，小程序没有组件树状态，
// 所以这里改成一个全局单例 store：
//   · 页面 onLoad 时 subscribe(fn) 注册刷新回调，onUnload 时退订；
//   · 每次写入后 notify() 广播，各页面 setData 自己的派生数据。
// 数据形状、默认值、键名与桌面版逐字一致，保证备份互通。

const { KEYS, loadAll, replaceAll, saveData, toKey } = require('../utils/storage');
const { DEFAULT_SEMESTER_START, DEFAULT_TOTAL_WEEKS } = require('../utils/plan');
const { proteinTargetFor } = require('../data/foods');

const DEFAULT_SETTINGS = {
  pinnedDate: null,
  notifyEnabled: false,
  notifyMinutesBefore: 15,
  semesterStart: toKey(DEFAULT_SEMESTER_START),
  totalWeeks: DEFAULT_TOTAL_WEEKS,
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
      else if (k === KEYS.health) merged.health = v || [];
      else if (k === KEYS.trainDone) merged.trainDone = v || [];
      else if (k === KEYS.diet) merged.diet = v || [];
      else if (k === KEYS.dietSeed) merged.dietSeed = v || [];
      else if (k === KEYS.run) merged.run = v || [];
      else if (k === KEYS.courses) merged.courses = v || null;
      else if (k === KEYS.todos) merged.todos = v || [];
      else if (k === KEYS.assignments) merged.assignments = v || [];
      else if (k === KEYS.templates) merged.templates = v || [];
      else if (k === KEYS.milestones) merged.milestones = v || [];
      else if (k === KEYS.calendars) {
        // 老数据可能缺字段，补默认值，避免 UI 读到 undefined 崩掉
        merged.calendars = (v || []).map((c) =>
          Object.assign({}, c, { events: (c.events || []).map((e) => Object.assign({}, e, { accepted: e.accepted !== false })) })
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
  _update(key, value, storeKey) {
    this.shape = Object.assign({}, this.shape, { [key]: value });
    if (this.ready) saveData(storeKey, value);
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
      health: pick(KEYS.health, s.health),
      trainDone: pick(KEYS.trainDone, s.trainDone),
      diet: pick(KEYS.diet, s.diet),
      dietSeed: s.dietSeed,
      run: pick(KEYS.run, s.run),
      courses: pick(KEYS.courses, s.courses),
      todos: pick(KEYS.todos, s.todos),
      assignments: pick(KEYS.assignments, s.assignments),
      templates: pick(KEYS.templates, s.templates),
      milestones: (pick(KEYS.milestones, s.milestones) || []).map((m) =>
        Object.assign({}, m, { checklist: Array.isArray(m.checklist) ? m.checklist : [] })
      ),
      calendars: (pick(KEYS.calendars, s.calendars) || []).map((c) =>
        Object.assign({}, c, { events: (c.events || []).map((e) => Object.assign({}, e, { accepted: e.accepted !== false })) })
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
