// 课表相关派生计算。移植自桌面版 src/lib/schedule.ts。
// 把课程数组变成「今天有什么课」这类可直接渲染的数据 —— 全是纯函数。
const { DEFAULT_SEMESTER_START, currentWeek, weekMonday } = require('./plan');

/**
 * "08:00" → 480（分钟）。缺字段返回 NaN 而不是抛错 ——
 * 课程数据可能来自桌面版备份或手改的 JSON，不保证 start/end 存在。
 */
function toMin(t) {
  if (typeof t !== 'string') return NaN;
  const [h, m] = t.split(':').map(Number);
  if (!Number.isFinite(h)) return NaN;
  return h * 60 + (Number.isFinite(m) ? m : 0);
}

/** 课程是否在指定周次上课。weeks 缺失时视为「每周都上」，避免整门课消失 */
function inWeek(c, week) {
  if (!c) return false;
  if (!Array.isArray(c.weeks) || !c.weeks.length) return true;
  return c.weeks.indexOf(week) >= 0;
}

const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** JS getDay() → 1=周一 … 7=周日 */
function dayNum(d) {
  return d.getDay() === 0 ? 7 : d.getDay();
}

function keyOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** 某一天的课（按开始时间排序），带 uid / dateKey */
function coursesOn(courses, date, semesterStart, totalWeeks) {
  const start = semesterStart || DEFAULT_SEMESTER_START;
  const weeks = totalWeeks || 20;
  const week = currentWeek(date, start);
  const day = dayNum(date);
  return (courses || [])
    .filter((c) => c.day === day && inWeek(c, week))
    .filter(() => week >= 1 && week <= weeks)
    .sort((a, b) => toMin(a.start) - toMin(b.start))
    .map((c) => Object.assign({}, c, { uid: `${c.name}|${c.start}|${day}`, date, dateKey: keyOf(date) }));
}

/** 某一周 7 天的授课情况，供周视图使用 */
function weekGrid(courses, week, semesterStart) {
  const mon = weekMonday(week, semesterStart || DEFAULT_SEMESTER_START);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(mon, i);
    const day = i + 1;
    out.push({
      day,
      date,
      dateKey: keyOf(date),
      items: (courses || [])
        .filter((c) => c.day === day && inWeek(c, week))
        .sort((a, b) => toMin(a.start) - toMin(b.start)),
    });
  }
  return out;
}

/** 今天剩下的课（今天的课里还没结束的） */
function remainingToday(items, now) {
  const cur = now.getHours() * 60 + now.getMinutes();
  return items.filter((c) => toMin(c.end) > cur);
}

/** 正在进行中的课 */
function ongoingNow(items, now) {
  const cur = now.getHours() * 60 + now.getMinutes();
  return items.find((c) => toMin(c.start) <= cur && cur < toMin(c.end));
}

/**
 * 生成今天的日程时间轴：课程 + 训练安排，按时间排序。
 * 「可选」「全天」这类没有具体时间的排在当天末尾。
 */
function buildTimeline(courseItems, sessions, now) {
  const cur = now.getHours() * 60 + now.getMinutes();
  const items = [];

  for (const c of courseItems) {
    const s = toMin(c.start);
    const e = toMin(c.end);
    items.push({
      // 唯一键：同类同名课程可能一天出现多次，用「时间+名称」保证 wx:key 不重复
      id: `c|${c.start}|${c.name}`,
      time: c.start,
      sortKey: s,
      minutes: e - s,
      title: c.name,
      sub: c.place,
      kind: 'course',
      ongoing: s <= cur && cur < e,
      done: e <= cur,
    });
  }

  for (const s of sessions || []) {
    const isClock = /^\d{1,2}:\d{2}$/.test(String(s.time).trim());
    const start = isClock ? toMin(String(s.time).trim()) : -1;
    items.push({
      id: `s|${s.time}|${s.title}`,
      time: s.time,
      sortKey: start >= 0 ? start : 24 * 60 + items.length,
      minutes: 0,
      title: s.title,
      sub: s.detail,
      kind: s.kind,
    });
  }

  return items.sort((a, b) => a.sortKey - b.sortKey);
}

/** 本周还剩下几节课 */
function countWeekCourses(courses, week) {
  return (courses || []).filter((c) => inWeek(c, week)).length;
}

module.exports = {
  toMin,
  DAY_LABELS,
  dayNum,
  keyOf,
  addDays,
  coursesOn,
  weekGrid,
  remainingToday,
  ongoingNow,
  buildTimeline,
  countWeekCourses,
};
