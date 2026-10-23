// 分享：转发给好友（onShareAppMessage）与分享到朋友圈（onShareTimeline）。
//
// 为什么集中在这里，而不是每页各写一份：
//   · 16 个页面都要有，内容格式又完全一样（标题 + 落地路径），
//     复制 16 遍的话以后改文案要改 16 处，漏一个就少一页能转发。
//   · 合并页（总览/待办·作业/健康）的标题要跟着**当前分段**变，
//     这段取分段的逻辑只该有一份。
//
// ★ 两个回调的返回值形状不一样，别混用：
//   onShareAppMessage → { title, path, imageUrl }        （path 带参数）
//   onShareTimeline   → { title, query, imageUrl }        （没有 path，只有 query）
//   朋友圈的 query **不带开头的 ?**，写成 '?a=1' 会被当成参数名的一部分。
//
// ★ 分享出去的是一份空数据：本应用没有后端、没有登录，数据全在
//   分享者自己的手机上。对方点开看到的是他自己的（初始为空的）记录。
//   所以文案只描述「这个工具能干什么」，绝不写「我的课表/我的体重」这类
//   只有分享者自己才看得到的内容。

/** 各页面的分享文案。key 与 pages/ 下的目录名一致。 */
const PAGES = {
  dashboard: {
    title: '大学日程 · 课表、作业 DDL、待办一屏看完',
    desc: '课表、作业截止、待办、健康打卡全在一个小程序里，数据存在本机',
  },
  today: {
    title: '今天的课和截止事项，一屏看完',
    desc: '按天翻看课程、待办与作业截止',
  },
  courses: {
    title: '我的课表 · 支持周次规则',
    desc: '课程增删改，认「第 N 周」「1,3,5 周」这类周次写法',
  },
  coursescan: {
    title: '粘贴教务文字，一键导入课表',
    desc: '把教务系统的课表文字粘进来，自动解析成课程表',
  },
  calendaracademic: {
    title: '粘贴校历文字，生成学期关键日期',
    desc: '报到、开课、考试、放假自动认出来，确认后写进重要事项',
  },
  week: {
    title: '一周课表 · 按教学周看',
    desc: '按教学周查看课程安排，标出当前周和今天',
  },
  tasks: {
    title: '待办 · 作业 DDL',
    desc: '待办清单和作业截止日放在一起，逾期标红',
  },
  todos: {
    title: '待办清单',
    desc: '按今天、7 天内、已逾期分组，支持优先级和标签',
  },
  assignments: {
    title: '作业 DDL · 按课程分组',
    desc: '按课程分组查看作业截止日，逾期标红',
  },
  healthhub: {
    title: '健康 · 饮食 / 运动 / 体重',
    desc: '饮食记录、运动打卡、体重作息放在一个入口下',
  },
  diet: {
    title: '饮食记录 · 带蛋白质目标',
    desc: '从食物库里挑，自动算蛋白质，还能设每日目标',
  },
  run: {
    title: '运动打卡 · 每周目标',
    desc: '按训练日记录运动，统计本周完成了几次',
  },
  health: {
    title: '体重作息记录',
    desc: '记录体重、睡眠，看趋势变化',
  },
  milestones: {
    title: '重要事项 · 考试 / 竞赛 / 证书',
    desc: '考试、竞赛、证书、报名，带倒计时',
  },
  analysis: {
    title: '哪段时间最空？智能分析告诉你',
    desc: '按 7 天 × 时段算整体空闲度，推荐最适合安排的时段',
  },
  settings: {
    title: '大学日程 · 设置',
    desc: '主题、备份导入导出、学期起点、作息表',
  },
};

/**
 * 合并页的分段文案：分享时用**当前那一段**的标题，而不是整个页面名。
 * 合并页的 PAGES 表里那条是兜底（拿不到当前分段时才用）。
 */
const SEGMENTS = {
  dashboard: {
    dashboard: { title: '大学日程 · 课表、作业 DDL、待办一屏看完', desc: '课表、作业截止、待办、健康打卡全在一个小程序里' },
    today: { title: '今天的课和截止事项，一屏看完', desc: '按天翻看课程、待办与作业截止' },
  },
  tasks: {
    todos: { title: '待办清单', desc: '按今天、7 天内、已逾期分组，支持优先级和标签' },
    assignments: { title: '作业 DDL · 按课程分组', desc: '按课程分组查看作业截止日，逾期标红' },
  },
  healthhub: {
    diet: { title: '饮食记录 · 带蛋白质目标', desc: '从食物库里挑，自动算蛋白质，还能设每日目标' },
    run: { title: '运动打卡 · 每周目标', desc: '按训练日记录运动，统计本周完成了几次' },
    health: { title: '体重作息记录', desc: '记录体重、睡眠，看趋势变化' },
  },
};

/** 取某页（或某页的某分段）的文案，取不到就兜底成小程序名 */
function infoOf(key, seg) {
  const segs = SEGMENTS[key];
  if (segs && seg && segs[seg]) return segs[seg];
  return PAGES[key] || { title: '大学日程', desc: '课表、待办、作业截止与健康打卡' };
}

/**
 * 标题：合并页用当前分段的标题，普通页直接用页面标题。
 * @param {string} key    页面名（pages/ 下的目录名）
 * @param {string} [seg]  合并页的当前分段 id
 */
function titleOf(key, seg) {
  return infoOf(key, seg).title;
}

/**
 * 转发给好友。
 * @param {string} key  页面名
 * @param {object} [opts] { seg } 合并页当前分段
 * @returns {{title: string, path: string}} 可直接作为 onShareAppMessage 的返回值
 */
function shareAppMessage(key, opts) {
  const seg = opts && opts.seg;
  // path 指向本页，让对方点开就落在同一个页面。
  // 合并页把分段带上（普通 query，页面在 onLoad 里读 seg 就行）。
  const path = `/pages/${key}/${key}${seg ? `?seg=${seg}` : ''}`;
  return { title: titleOf(key, seg), path };
}

/**
 * 分享到朋友圈。
 * 朋友圈回调没有 path，只有 query（且**不带**开头的 ?）。
 * @param {string} key  页面名
 * @param {object} [opts] { seg }
 * @returns {{title: string, query: string}} 可直接作为 onShareTimeline 的返回值
 */
function shareTimeline(key, opts) {
  const seg = opts && opts.seg;
  return { title: titleOf(key, seg), query: seg ? `seg=${seg}` : '' };
}

module.exports = { PAGES, SEGMENTS, shareAppMessage, shareTimeline, titleOf };
