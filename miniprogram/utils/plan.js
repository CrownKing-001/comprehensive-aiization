// 通用常量与计算函数。移植自桌面版 src/data/plan.ts。
// 只保留「与个人无关」的结构定义和计算函数 —— 学期开始日、总周数、
// 课表内容全部来自用户自己的设置与数据，首次运行一律为空。

/** 默认学期开始日：定位到「本周周一」，让首次打开就能看到一个合理的当前周次 */
function currentMonday(d) {
  const x = d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : new Date();
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

const DEFAULT_SEMESTER_START = currentMonday();
const DEFAULT_TOTAL_WEEKS = 18;

// ── 教学周计算 ───────────────────────────────────────────
/** 当前教学周（从 1 开始）。学期开始日由用户在「设置」里指定。 */
function currentWeek(d, semesterStart) {
  const date = d || new Date();
  const start = semesterStart || DEFAULT_SEMESTER_START;
  const ms = date.getTime() - start.getTime();
  return Math.max(1, Math.floor(ms / (7 * 24 * 3600 * 1000)) + 1);
}

/** 把日期对齐到所在周的周一 */
function mondayOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/** 第 n 周的周一（按学期开始日推算，自动对齐到周一） */
function weekMonday(week, semesterStart) {
  const base = mondayOf(semesterStart || DEFAULT_SEMESTER_START);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + (week - 1) * 7);
}

/** 第 week 周、周 day(1=周一…7=周日) 对应的日期 */
function dateOf(week, day, semesterStart) {
  const mon = weekMonday(week, semesterStart);
  return new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + (day - 1));
}

/**
 * 把「今天是第 N 周」反推成学期开始日（对齐到周一）。
 * 用于课表图片上读到「第N周」时据此校准当前教学周。
 */
function semesterStartForWeek(week, today) {
  const t = today || new Date();
  const mon = mondayOf(t);
  return new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() - (Math.max(1, week) - 1) * 7);
}

const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六'];

/** 课表里出现过的课程名去重，供作业 / 待办选择 */
function courseNames(courses) {
  return [...new Set((courses || []).map((c) => c.name))];
}

// ── 空闲时段分析（完全基于用户自己的课表）──────────────────
const TIME_SLOTS = [
  { label: '早晨', from: 7, to: 9 },
  { label: '上午', from: 9, to: 12 },
  { label: '下午', from: 13, to: 17 },
  { label: '晚上', from: 18, to: 21 },
];

/**
 * "08:00" → 8（小时，带小数）。
 * 缺字段时返回 NaN 而不是抛错 —— 课程数据可能来自桌面版备份或手改的 JSON，
 * 不保证 start/end 一定存在。调用方用比较运算，NaN 会自然为 false。
 */
function toHour(t) {
  if (typeof t !== 'string') return NaN;
  const [h, m] = t.split(':').map(Number);
  if (!Number.isFinite(h)) return NaN;
  return h + (Number.isFinite(m) ? m / 60 : 0);
}

/**
 * 统计指定周次区间内，每天每个时段有几周是空闲的。
 * 返回 [day 1-7][slot 0-3] = 空闲周数（等于传入周数 = 该时段全空）。
 */
function freeMatrix(courses, weeks) {
  const list = Array.isArray(courses) ? courses : [];
  const ws = Array.isArray(weeks) ? weeks : [];
  const matrix = [];
  for (let day = 1; day <= 7; day++) {
    const row = [];
    for (const slot of TIME_SLOTS) {
      let free = 0;
      for (const w of ws) {
        const busy = list.some(
          (c) =>
            c &&
            c.day === day &&
            Array.isArray(c.weeks) &&
            c.weeks.indexOf(w) >= 0 &&
            toHour(c.start) < slot.to &&
            toHour(c.end) > slot.from
        );
        if (!busy) free++;
      }
      row.push(free);
    }
    matrix.push(row);
  }
  return matrix;
}

module.exports = {
  DEFAULT_SEMESTER_START,
  DEFAULT_TOTAL_WEEKS,
  currentMonday,
  currentWeek,
  mondayOf,
  weekMonday,
  dateOf,
  semesterStartForWeek,
  WEEKDAY_CN,
  courseNames,
  TIME_SLOTS,
  freeMatrix,
};
