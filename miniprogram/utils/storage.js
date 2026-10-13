// 存储层：小程序端用 wx.setStorageSync / wx.getStorageSync。
// 移植自桌面版的 src/lib/storage.ts —— 桌面端走 Electron 文件存储、
// 浏览器开发预览回退 localStorage；小程序两者都没有，换成 wx 存储。
//
// 键名与桌面版完全一致，这样桌面版导出的备份可以原样导入。

/** 数据文件键名集中登记，避免各处写错字符串 */
const KEYS = {
  health: 'fitplan-health-logs',
  trainDone: 'fitplan-train-done',
  diet: 'fitplan-diet-logs',
  dietSeed: 'fitplan-diet-seed-ids',
  run: 'fitplan-run-logs',
  courses: 'fitplan-courses',
  todos: 'fitplan-todos',
  assignments: 'fitplan-assignments',
  templates: 'fitplan-templates',
  settings: 'fitplan-settings',
  notes: 'fitplan-notes',
  /** 自定义事项：考试 / 竞赛 / 证书……用户可自由增删 */
  milestones: 'fitplan-milestones',
  /** 图片识别记录：原图路径 + 识别结果 */
  calendars: 'fitplan-calendars',
};

const ALL_KEYS = Object.keys(KEYS).map((k) => KEYS[k]);

/** 读一条。读不到或解析失败时返回 fallback，绝不抛错。 */
function loadData(key, fallback) {
  try {
    const v = wx.getStorageSync(key);
    if (v === '' || v === null || v === undefined) return fallback;
    return v;
  } catch (e) {
    return fallback;
  }
}

/** 写一条。失败静默（配额满等），与桌面版行为一致。 */
function saveData(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (e) {
    /* 配额满等情况静默 */
  }
}

/** 一次读出全部数据 */
function loadAll() {
  const out = {};
  for (const key of ALL_KEYS) {
    try {
      const v = wx.getStorageSync(key);
      if (v !== '' && v !== null && v !== undefined) out[key] = v;
    } catch (e) {
      /* ignore */
    }
  }
  return out;
}

/** 整体替换（导入备份 / 重置用） */
function replaceAll(obj) {
  for (const k of Object.keys(obj)) {
    saveData(k, obj[k]);
  }
}

// ── 日期工具（全局共用，统一本地时区格式 YYYY-MM-DD）────────
function toKey(d) {
  const x = d || new Date();
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/**
 * "2026-10-13" → Date。
 * 传进来的可能是 undefined / '' / '待定' —— 作业和事项的 due 字段并非必填，
 * 之前直接 key.split 会让整个页面白屏。取不到有效日期时返回 null，
 * 调用方（daysUntil）会把它当成「没有日期」处理。
 */
function fromKey(key) {
  if (typeof key !== 'string') return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(key.trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDays(d, n) {
  const base = d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date();
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
}

/** 距今天数：正数=还有几天，0=今天，负数=已过几天。无法解析时返回 null */
function daysUntil(target, from) {
  if (!(target instanceof Date) || Number.isNaN(target.getTime())) return null;
  const f = from instanceof Date && !Number.isNaN(from.getTime()) ? from : new Date();
  const a = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const b = new Date(f.getFullYear(), f.getMonth(), f.getDate());
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

module.exports = {
  KEYS,
  loadData,
  saveData,
  loadAll,
  replaceAll,
  toKey,
  fromKey,
  addDays,
  daysUntil,
};
