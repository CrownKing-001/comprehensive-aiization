// 「AI 洞察」引擎 —— v1.2.0 引入。
//
// ── 这是什么 ───────────────────────────────────────────────
// 把用户记录的数据（课表 / 饮食 / 运动 / 体重 / 作业）推导成
// 「一句人话的观察」，让首页从「一屏要你填的表」变成「一个懂你的助手」。
//
// ── 为什么现在用规则引擎，不接大模型 ─────────────────────────
// 产品目标是「全面 AI 化」：AI 拿到你的完整上下文才给得出别人给不了的
// 建议。但真接模型有两个问题：
//   1. 每次调用都花钱，用户规模一涨就线性膨胀；
//   2. 小程序端不可能内嵌模型，必须走后端，而后端又是另一笔账。
// 所以这一步先把**产品形态**做对 —— 一问一答、每答必给洞察、洞察跨数据。
// 规则引擎能做到的事情已经远远强于「一张空白表格」。
// 将来有收入了，把 ask()/insightsFor() 内部换成模型调用即可，
// 页面和数据结构都不用动。这是刻意留的接缝。
//
// ── 两条硬规矩（写在此处，防止后来者破坏）────────────────────
// 1. **洞察必须跨数据。** 「你今天有 3 节课」这种单数据统计没有价值，
//    用户自己也知道。只有「周三课多 + 没吃早饭」这种组合，才是
//    只有工具能发现的东西。
// 2. **每答必给回报。** 用户回答任何一步之后，必须立刻看到一条新的
//    洞察，而不是「已保存」。这是「不累地去填」的唯一解法 ——

const { coursesOn, toMin, dayNum } = require('./schedule');
const { currentWeek } = require('./plan');

const DAY_LABEL = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 一天里从早到晚的课，返回 { first, last, count, gapMin, gapText } */
function dayLoad(courses, day) {
  const list = (courses || [])
    .filter((c) => c.day === day)
    .sort((a, b) => toMin(a.start) - toMin(b.start));
  if (!list.length) return null;

  // 相邻两节课之间的空档，取最大的一段 —— 这段决定「这天是连着的还是碎的」
  let maxGap = 0;
  for (let i = 1; i < list.length; i++) {
    const gap = toMin(list[i].start) - toMin(list[i - 1].end);
    if (gap > maxGap) maxGap = gap;
  }

  return {
    count: list.length,
    first: list[0].start,
    last: list[list.length - 1].end,
    firstCourse: list[0].name,
    gapMin: maxGap,
    list,
  };
}

/** 整周的负荷分布：{ 1..7: dayLoad | null } */
function weekLoad(courses) {
  const out = {};
  for (let d = 1; d <= 7; d++) out[d] = dayLoad(courses, d);
  return out;
}

/**
 * 找「最重的一天」和「最轻的工作日」。
 * 只比周一到周五 —— 周末本来就轻，拿周末当「最轻」没有意义。
 */
function heaviestLightest(courses) {
  const load = weekLoad(courses);
  let heavy = null;
  let light = null;
  for (let d = 1; d <= 5; d++) {
    const L = load[d];
    if (!L) {
      if (!light) light = { day: d, load: null };
      continue;
    }
    if (!heavy || L.count > heavy.load.count) heavy = { day: d, load: L };
    if (!light || (light.load && L.count < light.load.count)) light = { day: d, load: L };
  }
  return { heavy, light, load };
}

/** 连续上课不休息的最长跨度（分钟） */
function longestStretch(courses, day) {
  const L = dayLoad(courses, day);
  if (!L || L.list.length < 2) return null;
  let best = 0;
  let bestText = '';
  for (let i = 0; i < L.list.length - 1; i++) {
    const span = toMin(L.list[i + 1].end) - toMin(L.list[i].start);
    if (span > best) {
      best = span;
      bestText = `${L.list[i].start}–${L.list[i + 1].end}`;
    }
  }
  return best ? { min: best, text: bestText } : null;
}

function fmtMin(m) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h <= 0) return `${mm} 分钟`;
  if (mm === 0) return `${h} 小时`;
  return `${h} 小时 ${mm} 分钟`;
}

/**
 * 根据已有数据产出洞察列表。
 * 每条洞察 = { id, tone, title, body, action? }
 *   tone: 'info' | 'warn' | 'good'
 *   action: { label, type } —— 可选，点一下能去补数据
 *
 * 按「信息量」排序，最多返回 limit 条。信息量 = 跨了多少种数据源。
 */
function insightsFor(ctx, limit) {
  const { courses, diet, run, health, todos, assignments, now, week } = ctx;
  const max = limit || 3;
  const out = [];

  const hasCourses = Array.isArray(courses) && courses.length > 0;
  const today = now || new Date();
  const todayNum = dayNum(today);

  // ── 1. 课表 × 星期：最重的一天 ────────────────────────────
  if (hasCourses) {
    const { heavy } = heaviestLightest(courses);
    if (heavy && heavy.load.count >= 3) {
      const L = heavy.load;
      const stretch = longestStretch(courses, heavy.day);
      let body = `${DAY_LABEL[heavy.day]}是最满的一天：${L.count} 节课，${L.first} 到 ${L.last}。`;
      if (stretch && stretch.min >= 240) {
        body += ` 其中 ${stretch.text} 连着上，中途没多少喘气的时间。`;
      }
      out.push({
        id: 'heavy-day',
        tone: stretch && stretch.min >= 240 ? 'warn' : 'info',
        weight: 3,
        title: `${DAY_LABEL[heavy.day]}是你这学期最累的一天`,
        body,
      });
    }
  }

  // ── 2. 课表 × 今天：今天还剩几节 ──────────────────────────
  if (hasCourses) {
    const todayCourses = coursesOn(courses, today, ctx.semesterStart, ctx.totalWeeks);
    if (todayCourses.length) {
      const cur = today.getHours() * 60 + today.getMinutes();
      const left = todayCourses.filter((c) => toMin(c.end) > cur);
      if (left.length) {
        out.push({
          id: 'today-left',
          tone: 'info',
          weight: 2,
          title: `今天还有 ${left.length} 节课`,
          body: `最近的是 ${left[0].name}（${left[0].start}，${left[0].room || '教室未填'}）。`,
        });
      } else {
        out.push({
          id: 'today-done',
          tone: 'good',
          weight: 2,
          title: '今天的课都上完了',
          body: `今天一共 ${todayCourses.length} 节。剩下的时间是你自己的。`,
        });
      }
    }
  }

  // ── 3. 课表 × 饮食：最累的那天有没有好好吃 ──────────────────
  if (hasCourses && Array.isArray(diet)) {
    const { heavy } = heaviestLightest(courses);
    if (heavy && heavy.load.count >= 3) {
      const days = heavy.load.count;
      const heavyDayDiet = diet.filter((d) => {
        const dt = d.date ? new Date(d.date) : null;
        return dt && dayNum(dt) === heavy.day;
      });
      // 只在确实有记录时才判断，没记录就是没记录，不臆测
      if (heavyDayDiet.length >= 3) {
        const hasBreakfast = heavyDayDiet.some((d) => /早/.test(d.meal || '') || toMin((d.time || '12:00')) < 600);
        if (!hasBreakfast) {
          out.push({
            id: 'heavy-no-breakfast',
            tone: 'warn',
            weight: 5,
            title: `你${DAY_LABEL[heavy.day]}课最多，但那几天好像都不吃早饭`,
            body: `${days} 节课的日子从 ${heavy.load.first} 就开始，一直撑到 ${heavy.load.last}，中间不吃东西很难顶住。`,
          });
        }
      }
    }
  }

  // ── 4. 课表 × 运动：课多的日子运动为 0 ────────────────────
  if (hasCourses && Array.isArray(run) && run.length) {
    const { heavy } = heaviestLightest(courses);
    if (heavy && heavy.load.count >= 4) {
      const runOnHeavy = run.filter((r) => {
        const dt = r.date ? new Date(r.date) : null;
        return dt && dayNum(dt) === heavy.day;
      });
      if (runOnHeavy.length === 0 && run.length >= 3) {
        out.push({
          id: 'heavy-no-run',
          tone: 'info',
          weight: 4,
          title: `你的运动记录里，${DAY_LABEL[heavy.day]}一次都没有`,
          body: `这天你有 ${heavy.load.count} 节课。要练的话，可能得换到 ${DAY_LABEL[(heavy.day % 7) + 1]} 那种轻一点的日子。`,
        });
      }
    }
  }

  // ── 5. 体重趋势：最近有没有明显变化 ──────────────────────
  if (Array.isArray(health) && health.length >= 3) {
    const weights = health
      .filter((h) => h.weight)
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    if (weights.length >= 3) {
      const first = Number(weights[0].weight);
      const last = Number(weights[weights.length - 1].weight);
      const delta = Math.round((last - first) * 10) / 10;
      if (Math.abs(delta) >= 1.5) {
        out.push({
          id: 'weight-trend',
          tone: 'info',
          weight: 2,
          title: delta > 0 ? `这段时间体重涨了 ${delta} kg` : `这段时间体重降了 ${Math.abs(delta)} kg`,
          body: `从第一次记录的 ${first} kg 到最近的 ${last} kg，一共记了 ${weights.length} 次。`,
        });
      }
    }
  }

  // ── 6. 作业 × 课表：DDL 集中的那天有没有课 ────────────────
  // 注意字段名是 due（YYYY-MM-DD 字符串），不是 dueDate ——
  // 与 store.assignments 的实际结构一致，别改错。
  if (Array.isArray(assignments) && assignments.length && hasCourses) {
    const soon = assignments
      .filter((a) => a.due && !a.done)
      .map((a) => ({ a, days: Math.ceil((new Date(a.due + 'T23:59:59') - today) / 86400000) }))
      .filter((x) => x.days >= 0 && x.days <= 3)
      .sort((x, y) => x.days - y.days);
    if (soon.length >= 2) {
      out.push({
        id: 'ddl-cluster',
        tone: 'warn',
        weight: 4,
        title: `接下来 3 天有 ${soon.length} 份作业到期`,
        body: `最近的是「${soon[0].a.title}」，${soon[0].days === 0 ? '今天' : soon[0].days + ' 天后'}。别都压到最后一晚。`,
      });
    }
  }

  // ── 7. 睡眠 × 课表：课多的日子睡得更少吗 ──────────────────
  // health 记录的字段是 { date, weight, sleep, steps }（见 selftest 样例）。
  // 只有真实记录里同时有 sleep 和足够样本时才判断，没记录就不臆测。
  if (Array.isArray(health) && hasCourses) {
    const withSleep = health.filter((h) => h.date && typeof h.sleep === 'number' && h.sleep > 0);
    // 同上：3 条就够看出「课多那天睡得少」的苗头。
    // 但比较时仍要求两边各至少 2 条 —— 单条样本不足以下结论。
    if (withSleep.length >= 3) {
      const { heavy } = heaviestLightest(courses);
      const heavyDaySleep = withSleep.filter((h) => dayNum(new Date(h.date + 'T12:00:00')) === heavy.day);
      const otherSleep = withSleep.filter((h) => dayNum(new Date(h.date + 'T12:00:00')) !== heavy.day);
      if (heavyDaySleep.length >= 2 && otherSleep.length >= 2) {
        const avg = (arr) => arr.reduce((s, h) => s + h.sleep, 0) / arr.length;
        const a = avg(heavyDaySleep);
        const b = avg(otherSleep);
        const diff = Math.round((b - a) * 10) / 10;
        if (diff >= 0.8) {
          out.push({
            id: 'heavy-sleep',
            tone: 'warn',
            weight: 5,
            title: `${DAY_LABEL[heavy.day]}前一晚你平均只睡 ${a.toFixed(1)} 小时`,
            body: `比其它日子少 ${diff} 小时。而这天你有 ${heavy.load.count} 节课，是全周最满的一天 —— 这大概是它让你觉得累的原因。`,
          });
        }
      }
    }
  }

  // ── 8. 步数 × 课表：课多反而走得少？ ──────────────────────
  if (Array.isArray(health) && hasCourses) {
    const withSteps = health.filter((h) => h.date && typeof h.steps === 'number' && h.steps > 0);
    // 门槛是 3 条而不是 4：这是用户最容易只记几天的字段，
    // 门槛太高会让这条规则实际上永远不触发。
    if (withSteps.length >= 3) {
      const { heavy } = heaviestLightest(courses);
      const heavySteps = withSteps.filter((h) => dayNum(new Date(h.date + 'T12:00:00')) === heavy.day);
      if (heavySteps.length >= 2) {
        const avgSteps = Math.round(heavySteps.reduce((s, h) => s + h.steps, 0) / heavySteps.length);
        if (avgSteps < 4000) {
          out.push({
            id: 'heavy-low-steps',
            tone: 'info',
            weight: 4,
            title: `${DAY_LABEL[heavy.day]}课最多，但那天你走得最少`,
            body: `这天的步数平均只有 ${avgSteps} 步。课连着上的日子基本就是坐着，动得反而更少。`,
          });
        }
      }
    }
  }

  // ── 9. 运动频率：最近还有没有在动 ─────────────────────────
  // run 记录只有 { date, type }，没有时长 —— 所以只说「次」，不编造分钟数。
  if (Array.isArray(run) && run.length >= 2) {
    const recent = run
      .filter((r) => r.date)
      .map((r) => new Date(r.date + 'T12:00:00'))
      .filter((d) => !isNaN(d))
      .sort((a, b) => b - a);
    if (recent.length >= 2) {
      const daysSince = Math.floor((today - recent[0]) / 86400000);
      if (daysSince >= 10) {
        out.push({
          id: 'run-stale',
          tone: 'warn',
          weight: 3,
          title: `已经 ${daysSince} 天没记录运动了`,
          body: `上一次是 ${recent[0].getMonth() + 1} 月 ${recent[0].getDate()} 日。如果只是忘了记，补一下就好。`,
        });
      }
    }
  }

  // ── 10. 饮食 × 运动：有没有吃和动完全脱节的日子 ────────────
  // 高蛋白目标只在用户真的记了饮食之后才有意义，所以要两边都有数据。
  if (Array.isArray(diet) && Array.isArray(run) && diet.length >= 5 && run.length >= 3) {
    const dietDays = new Set(diet.map((d) => d.date).filter(Boolean));
    const runDays = new Set(run.map((r) => r.date).filter(Boolean));
    const both = [...runDays].filter((d) => dietDays.has(d)).length;
    if (runDays.size >= 3 && both === 0) {
      out.push({
        id: 'run-no-diet',
        tone: 'info',
        weight: 4,
        title: '你运动的日子，一次饮食都没记过',
        body: `记了 ${runDays.size} 天运动、${dietDays.size} 天饮食，但两边没有一天重合。运动那天的吃喝才是最容易失控的，值得记一下。`,
      });
    }
  }

  // ── 11. 待办堆积：有没有一直没处理的 ──────────────────────
  if (Array.isArray(todos)) {
    const open = todos.filter((t) => !t.done);
    if (open.length >= 5) {
      out.push({
        id: 'todo-pile',
        tone: 'warn',
        weight: 2,
        title: `还有 ${open.length} 件事没做完`,
        body: '清单太长的时候人就容易不看了。挑两件今天能做完的，比留着全部更有用。',
      });
    }
  }

  out.sort((a, b) => b.weight - a.weight);
  return out.slice(0, max);
}

/**
 * 决定「下一步该问什么」。
 *
 * 这是整个产品最核心的一个函数：用户打开小程序，看到的第一句话由它决定。
 * 优先级按「回答成本 × 能解锁多少洞察」排 ——
 * 课表最贵（要粘贴），但解锁的洞察最多，所以排第一；
 * 而且粘贴是一次性成本，不是每天都要做的事。
 *
 * 返回 { step, title, body, input, options? }
 *   input: 'paste-course' | 'choice' | 'none'
 */
function nextQuestion(ctx) {
  const { courses, diet, run, health, todos, aiAnswers } = ctx;
  const hasCourses = Array.isArray(courses) && courses.length > 0;
  const ans = aiAnswers || {};

  // 第一件事：课表。没有它，后面所有跨数据洞察都成立不了。
  if (!hasCourses) {
    return {
      step: 'courses',
      title: '先让我认识你的课表',
      body: '把教务系统里的课表文字贴进来，我帮你排好。之后所有提醒都按它来。',
      input: 'paste-course',
      actionLabel: '粘贴课表',
    };
  }

  // 第二件事：吃不吃早饭 —— 回答成本极低（点一下），但能立刻和课表组合出洞察。
  // 已经有真实饮食记录时跳过这一问：真实记录比自述更准，不该再烦用户。
  const hasDiet = Array.isArray(diet) && diet.length > 0;
  if (!hasDiet && !ans.breakfast) {
    return {
      step: 'breakfast',
      title: '课表排好了',
      body: '再告诉我一件小事就行：你平时吃早饭吗？这个答案只要点一下。',
      input: 'choice',
      options: [
        { id: 'always', label: '基本每天吃' },
        { id: 'sometimes', label: '看情况' },
        { id: 'never', label: '几乎不吃' },
      ],
    };
  }

  // 第三件事：运动
  const hasRun = Array.isArray(run) && run.length > 0;
  if (!hasRun && !ans.run) {
    return {
      step: 'run',
      title: '你平时运动吗',
      body: '知道这个之后，我就能把运动安排和你课少的日子对上。',
      input: 'choice',
      options: [
        { id: 'often', label: '每周 3 次以上' },
        { id: 'some', label: '偶尔' },
        { id: 'never', label: '基本不动' },
      ],
    };
  }

  // 数据够了：不再问，转为给洞察
  return {
    step: 'done',
    title: '你的情况我已经有数了',
    body: '下面是最近能看出来的东西。有新记录时我会接着说。',
    input: 'none',
  };
}

/** 按时段打招呼 */
function greeting(now) {
  const h = (now || new Date()).getHours();
  if (h < 6) return '还没睡';
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  if (h < 23) return '晚上好';
  return '这么晚了';
}

module.exports = {
  insightsFor,
  nextQuestion,
  greeting,
  dayLoad,
  weekLoad,
  heaviestLightest,
  longestStretch,
  fmtMin,
  DAY_LABEL,
};
