// 饮食记录：全应用**唯一**的饮食入口 —— 食物库点选 + 文字识别 + 套餐复用 + 手动记账 + 历史回顾。
//
// 「体重作息」页不再记录或统计任何饮食数据，避免同一份数据两处各记一遍。
//
// 记录方式：
//   · 点食物库 → 精确到份数，算得最准
//   · 写一句话 → 自动在食物库里识别并折算营养
//   · 直接手填蛋白 / 热量 → 识别不出来时的兜底
//
// 小程序端不做拍照存档（桌面版存到 data/photos，小程序没有文件系统权限；
// 相册临时路径也无法长期保存），所以这一版去掉了照片相关功能。
//
// 移植自桌面版 src/views/Diet.tsx

const { store, uid } = require('../../store/store');
const { CATEGORIES, FOODS, TEMPLATES, analyzeText, foodById } = require('../../data/foods');
const { toKey } = require('../../utils/storage');

const MEALS = ['早餐', '午餐', '晚餐', '加餐'];

/** 一天里各餐次的默认顺序 */
const mealOrder = (m) => {
  const i = MEALS.indexOf(m);
  return i < 0 ? 99 : i;
};

const DEFINITION = {
  data: {
    ready: false,
    themeClass: '',

    // 录入
    meal: '午餐',
    mealIndex: 1,
    mealOptions: MEALS,
    text: '',
    picked: [],
    pickedProtein: 0,
    pickedCalories: 0,
    msg: '',

    // 食物库
    q: '',
    cat: '全部',
    catOptions: ['全部', ...CATEGORIES],
    catIndex: 0,
    library: [],
    libraryShown: [],
    libraryLimit: 30,

    // 手动记账
    mText: '',
    mProtein: '',
    mCalories: '',

    // 套餐
    templates: TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      meal: t.meal,
      summary: t.items
        .map((id) => foodById(id))
        .filter(Boolean)
        .map((f) => f.name)
        .join(' + '),
      protein: Math.round(
        t.items.reduce((s, id) => {
          const f = foodById(id);
          return s + (f ? f.protein : 0);
        }, 0)
      ),
    })),

    // 自己存过的套餐（store.templates）。内置的是 TEMPLATES 常量，
    // 自己存的是用户数据 —— wxml 里分两排渲染，自存的带 ★ 区分。
    savedTemplates: [],
    // 「存为我的套餐」的输入框与弹层
    saveTplOpen: false,
    tplName: '',

    // 今日汇总
    todayProtein: 0,
    todayCalories: 0,
    proteinTarget: 110,
    calorieTarget: 2400,
    proteinBar: 0,
    calorieBar: 0,
    meals: [],
    todayLogs: [],

    // 近 7 天趋势
    trend: [],
    trendMax: 100,

    // 历史
    historyDays: [],
    showAllHistory: false,

    latestWeight: null,
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
    const logs = s.diet || [];
    const todayKey = store.todayKey;

    // ── 目标值 ────────────────────────────────────────
    // 蛋白按最近一次体重 × 系数（与「体重作息」同源，都读 store）；热量按 38 kcal/kg 估算需求。
    const target = store.proteinTarget;
    const latestWeight = [...(s.health || [])]
      .filter((l) => typeof l.weight === 'number' && l.weight > 0)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const latestWeightVal = latestWeight ? latestWeight.weight : null;
    const calorieTarget = latestWeightVal ? Math.round((latestWeightVal * 38) / 50) * 50 : 2400;

    // ── 今日汇总 ──────────────────────────────────────
    // 保留原数组下标，删除时按下标定位 —— 比对象引用比较可靠。
    const todayIndexed = logs
      .map((l, idx) => ({ log: l, idx }))
      .filter((x) => x.log.date === todayKey)
      .sort((a, b) => mealOrder(a.log.meal) - mealOrder(b.log.meal));
    const todayLogs = todayIndexed.map((x) => x.log);
    const todayProtein = todayLogs.reduce((sum, l) => sum + (l.protein || 0), 0);
    const todayCalories = todayLogs.reduce((sum, l) => sum + (l.calories || 0), 0);

    const meals = MEALS.map((m) => {
      const items = todayIndexed.filter((x) => x.log.meal === m);
      return {
        meal: m,
        count: items.length,
        protein: Math.round(items.reduce((sum, x) => sum + (x.log.protein || 0), 0)),
        calories: Math.round(items.reduce((sum, x) => sum + (x.log.calories || 0), 0)),
        items: items.map((x) => ({
          idx: x.idx,
          text: x.log.text,
          protein: Math.round(x.log.protein || 0),
          calories: Math.round(x.log.calories || 0),
        })),
      };
    }).filter((m) => m.items.length > 0);

    // ── 近 7 天趋势 ───────────────────────────────────
    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(store.today);
      d.setDate(d.getDate() - i);
      const k = toKey(d);
      const day = logs.filter((l) => l.date === k);
      trend.push({
        date: k,
        label: k.slice(5),
        protein: Math.round(day.reduce((sum, l) => sum + (l.protein || 0), 0)),
        calories: Math.round(day.reduce((sum, l) => sum + (l.calories || 0), 0)),
      });
    }
    const trendMax = Math.max(target, ...trend.map((t) => t.protein), 1);
    const trendOut = trend.map((t) => ({
      ...t,
      barWidth: Math.round((t.protein / trendMax) * 100),
      hit: t.protein >= target,
    }));

    // ── 历史（非今天），按日期倒序 ─────────────────────
    const history = logs
      .map((l, idx) => ({ log: l, idx }))
      .filter((x) => x.log.date !== todayKey)
      .sort((a, b) => b.log.date.localeCompare(a.log.date));

    const dayMap = new Map();
    for (const x of history) {
      if (!dayMap.has(x.log.date)) dayMap.set(x.log.date, []);
      dayMap.get(x.log.date).push(x);
    }
    const allDays = [...dayMap.entries()].map(([date, items]) => ({
      date,
      count: items.length,
      protein: Math.round(items.reduce((sum, x) => sum + (x.log.protein || 0), 0)),
      calories: Math.round(items.reduce((sum, x) => sum + (x.log.calories || 0), 0)),
      items: items.map((x) => ({
        idx: x.idx,
        meal: x.log.meal,
        text: x.log.text,
        protein: Math.round(x.log.protein || 0),
        calories: Math.round(x.log.calories || 0),
      })),
    }));
    const historyDays = this.data.showAllHistory ? allDays : allDays.slice(0, 7);

    this.setData({
      ready: true,
      themeClass: settings.theme === 'light' ? 'theme-light' : '',
      // 自己存过的套餐：只显示名字和摘要，点一下套用。
      // items 逐项过滤 —— store 只保证外层数组没空洞，嵌套的 items 可能是脏的
      // （手动改过的备份/旧版本写进去的），不过滤会让整页 refresh 抛错。
      savedTemplates: (store.shape.templates || []).map((t) => {
        const items = (t.items || []).filter((i) => i && typeof i === 'object');
        return {
          id: t.id,
          name: t.name,
          meal: t.meal,
          count: items.length,
          summary: items.map((i) => i.name).join(' + '),
          protein: Math.round(items.reduce((s, i) => s + (i.protein || 0), 0)),
        };
      }),
      proteinTarget: target,
      calorieTarget,
      latestWeight: latestWeightVal,
      todayProtein: Math.round(todayProtein),
      todayCalories: Math.round(todayCalories),
      proteinBar: Math.min(100, Math.round((todayProtein / target) * 100)),
      calorieBar: Math.min(100, Math.round((todayCalories / calorieTarget) * 100)),
      meals,
      todayLogs,
      trend: trendOut,
      trendMax,
      historyDays,
      historyTotal: allDays.length,
      pickedProtein: Math.round(this.data.picked.reduce((sum, i) => sum + i.protein, 0)),
      pickedCalories: Math.round(this.data.picked.reduce((sum, i) => sum + i.calories, 0)),
    });

    this._applyFilter();
  },

  // ── 食物库筛选 ────────────────────────────────────
  _applyFilter() {
    let list = FOODS;
    if (this.data.cat !== '全部') list = list.filter((f) => f.category === this.data.cat);
    const q = String(this.data.q || '').trim().toLowerCase();
    if (q) {
      list = list.filter(
        (f) => f.name.toLowerCase().includes(q) || (f.alias || []).some((a) => a.toLowerCase().includes(q))
      );
    }
    const library = list.map((f) => ({
      id: f.id,
      name: f.name,
      unit: f.unit,
      protein: f.protein,
      calories: f.calories,
      category: f.category,
    }));
    this.setData({ library, libraryShown: library.slice(0, this.data.libraryLimit) });
  },

  onSearch(e) {
    this.setData({ q: e.detail.value }, () => this._applyFilter());
  },

  onCatChange(e) {
    const i = Number(e.detail.value);
    this.setData({ catIndex: i, cat: this.data.catOptions[i] }, () => this._applyFilter());
  },

  showMoreLibrary() {
    this.setData({ libraryLimit: this.data.libraryLimit + 40 }, () => this._applyFilter());
  },

  // ── 餐次 ──────────────────────────────────────────
  onMealChange(e) {
    const i = Number(e.detail.value);
    this.setData({ mealIndex: i, meal: MEALS[i] });
  },

  setMealTap(e) {
    const m = e.currentTarget.dataset.meal;
    this.setData({ meal: m, mealIndex: MEALS.indexOf(m) });
  },

  // ── 加入清单 ──────────────────────────────────────
  addFood(e) {
    const id = e.currentTarget.dataset.id;
    const food = foodById(id);
    if (!food) return;
    const picked = [...this.data.picked];
    const idx = picked.findIndex((p) => p.foodId === id);
    if (idx >= 0) {
      const cur = picked[idx];
      const q = cur.qty + 1;
      picked[idx] = {
        ...cur,
        qty: q,
        protein: Math.round(food.protein * q * 10) / 10,
        calories: Math.round(food.calories * q),
      };
    } else {
      picked.push({
        foodId: food.id,
        name: food.name,
        qty: 1,
        protein: Math.round(food.protein * 10) / 10,
        calories: Math.round(food.calories),
      });
    }
    this.setData({ picked }, () => this._recalcPicked());
    wx.showToast({ title: `已加 ${food.name}`, icon: 'none' });
  },

  changeQty(e) {
    const i = Number(e.currentTarget.dataset.idx);
    const delta = Number(e.currentTarget.dataset.delta);
    const picked = [...this.data.picked];
    const it = picked[i];
    if (!it) return;
    const food = it.foodId ? foodById(it.foodId) : null;
    const qty = Math.max(0.5, Math.round((it.qty + delta) * 2) / 2);
    picked[i] = {
      ...it,
      qty,
      protein: food ? Math.round(food.protein * qty * 10) / 10 : it.protein,
      calories: food ? Math.round(food.calories * qty) : it.calories,
    };
    this.setData({ picked }, () => this._recalcPicked());
  },

  removePicked(e) {
    const i = Number(e.currentTarget.dataset.idx);
    const picked = this.data.picked.filter((_, idx) => idx !== i);
    this.setData({ picked }, () => this._recalcPicked());
  },

  clearPicked() {
    this.setData({ picked: [], pickedProtein: 0, pickedCalories: 0 });
  },

  _recalcPicked() {
    const picked = this.data.picked.map((p) => ({ ...p, qtyText: String(p.qty) }));
    this.setData({
      picked,
      pickedProtein: Math.round(picked.reduce((s, i) => s + i.protein, 0)),
      pickedCalories: Math.round(picked.reduce((s, i) => s + i.calories, 0)),
    });
  },

  // ── 文字识别 ──────────────────────────────────────
  onTextInput(e) {
    this.setData({ text: e.detail.value });
  },

  /** 把文字描述识别成食物并加入清单 */
  recognizeText() {
    const text = this.data.text;
    if (!text.trim()) return;
    const r = analyzeText(text);
    const hit = r.matches.filter((m) => m.food);
    if (!hit.length) {
      this.setData({ msg: '没识别出具体食物，可以直接点下面的食物库，或换个说法试试' });
      return;
    }
    const picked = [...this.data.picked];
    for (const m of hit) {
      const f = m.food;
      const idx = picked.findIndex((p) => p.foodId === f.id);
      if (idx >= 0) {
        const cur = picked[idx];
        const qty = cur.qty + m.qty;
        picked[idx] = {
          ...cur,
          qty,
          protein: Math.round(f.protein * qty * 10) / 10,
          calories: Math.round(f.calories * qty),
        };
      } else {
        picked.push({ foodId: f.id, name: f.name, qty: m.qty, protein: m.protein, calories: m.calories });
      }
    }
    const miss = r.matches.filter((m) => !m.food).map((m) => m.token);
    this.setData(
      {
        picked,
        text: '',
        msg: `识别出 ${hit.length} 项，合计 ${r.totalProtein}g 蛋白${miss.length ? `；未识别：${miss.join('、')}` : ''}`,
      },
      () => this._recalcPicked()
    );
  },

  // ── 套餐 ──────────────────────────────────────────
  applyTemplate(e) {
    const id = e.currentTarget.dataset.id;
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    const picked = [...this.data.picked];
    for (const fid of t.items) {
      const f = foodById(fid);
      if (!f) continue;
      const idx = picked.findIndex((p) => p.foodId === f.id);
      if (idx >= 0) {
        const cur = picked[idx];
        const qty = cur.qty + 1;
        picked[idx] = {
          ...cur,
          qty,
          protein: Math.round(f.protein * qty * 10) / 10,
          calories: Math.round(f.calories * qty),
        };
      } else {
        picked.push({
          foodId: f.id,
          name: f.name,
          qty: 1,
          protein: Math.round(f.protein * 10) / 10,
          calories: Math.round(f.calories),
        });
      }
    }
    this.setData({ picked, meal: t.meal, mealIndex: MEALS.indexOf(t.meal), msg: `已套用「${t.name}」` }, () =>
      this._recalcPicked()
    );
  },

  /**
   * 套用自己存过的套餐。
   * 与内置套餐的区别：这里的 items 是**存下来的快照**（含名称/蛋白/热量），
   * 所以要按 foodId 查最新食物库补全，查不到就沿用快照 ——
   * 否则食物库改过之后，旧套餐会因为找不到食物而少几项。
   */
  applySaved(e) {
    const id = e.currentTarget.dataset.id;
    const t = (store.shape.templates || []).find((x) => x.id === id);
    if (!t) return;
    const picked = (t.items || []).filter((it) => it && typeof it === 'object').map((it) => {
      const f = foodById(it.foodId);
      return {
        foodId: it.foodId,
        name: (f && f.name) || it.name || '未知食物',
        qty: it.qty || 1,
        protein: Math.round(((f ? f.protein : it.protein) || 0) * (it.qty || 1) * 10) / 10,
        calories: Math.round(((f ? f.calories : it.calories) || 0) * (it.qty || 1)),
      };
    });
    const meal = t.meal || this.data.meal;
    this.setData(
      { picked, meal, mealIndex: MEALS.indexOf(meal), msg: `已套用「${t.name}」` },
      () => this._recalcPicked()
    );
  },

  /** 打开「存为我的套餐」输入框 */
  openSaveTpl() {
    if (!this.data.picked.length) {
      this.setData({ msg: '清单是空的，先加点食物再存套餐' });
      return;
    }
    this.setData({ saveTplOpen: true, tplName: '' });
  },

  closeSaveTpl() {
    this.setData({ saveTplOpen: false, tplName: '' });
  },

  onTplName(e) {
    this.setData({ tplName: e.detail.value });
  },

  /** 把当前清单存成套餐；名字留空就用「早餐套餐」这种默认名 */
  commitTemplate() {
    const picked = this.data.picked;
    if (!picked.length) {
      this.setData({ saveTplOpen: false, msg: '清单是空的，没有可存的' });
      return;
    }
    const name = String(this.data.tplName || '').trim() || `${this.data.meal}套餐`;
    const list = store.shape.templates || [];
    store.setTemplates([
      ...list,
      {
        id: uid(),
        name,
        meal: this.data.meal,
        items: picked.map((p) => ({
          foodId: p.foodId,
          name: p.name,
          qty: p.qty,
          protein: p.protein,
          calories: p.calories,
        })),
      },
    ]);
    this.setData({ saveTplOpen: false, tplName: '', msg: `已存为套餐「${name}」，下次一键复用` });
  },

  /** 删除自己存的套餐（内置套餐不能删） */
  removeTemplate(e) {
    const id = e.currentTarget.dataset.id;
    const list = store.shape.templates || [];
    const t = list.find((x) => x.id === id);
    if (!t) return;
    wx.showModal({
      title: '删除套餐',
      content: `确定删除「${t.name}」吗？不影响已经记录的内容。`,
      success: (res) => {
        if (!res.confirm) return;
        store.setTemplates(list.filter((x) => x.id !== id));
        this.setData({ msg: `已删除套餐「${t.name}」` });
      },
    });
  },

  // ── 保存 ──────────────────────────────────────────
  save() {
    const picked = this.data.picked;
    const text = this.data.text;
    if (!picked.length && !text.trim()) {
      this.setData({ msg: '至少选一个食物，或写一句描述' });
      return;
    }
    const items = picked.length
      ? picked.map((p) => ({
          foodId: p.foodId,
          name: p.name,
          qty: p.qty,
          protein: p.protein,
          calories: p.calories,
        }))
      : analyzeText(text)
          .matches.filter((m) => m.food)
          .map((m) => ({
            foodId: m.food.id,
            name: m.food.name,
            qty: m.qty,
            protein: m.protein,
            calories: m.calories,
          }));
    const protein = items.reduce((s, i) => s + i.protein, 0);
    const calories = items.reduce((s, i) => s + i.calories, 0);
    const desc = picked.length ? picked.map((p) => `${p.name}×${p.qty}`).join(' + ') : text.trim();

    const logs = store.shape.diet || [];
    store.setDiet([
      ...logs,
      {
        date: store.todayKey,
        meal: this.data.meal,
        text: desc,
        protein: Math.round(protein),
        calories: Math.round(calories),
        items: items.length ? items : undefined,
      },
    ]);
    this.setData({
      picked: [],
      pickedProtein: 0,
      pickedCalories: 0,
      text: '',
      msg: `已记录${this.data.meal}：${Math.round(protein)}g 蛋白 / ${Math.round(calories)} kcal`,
    });
    wx.showToast({ title: '已记录', icon: 'success' });
  },

  // ── 手动记账 ──────────────────────────────────────
  onMText(e) { this.setData({ mText: e.detail.value }); },
  onMProtein(e) { this.setData({ mProtein: e.detail.value }); },
  onMCalories(e) { this.setData({ mCalories: e.detail.value }); },

  /** 手动记一笔：手填了蛋白/热量就用填的，否则按描述在食物库自动算 */
  addManual() {
    const mText = this.data.mText;
    if (!mText.trim()) return;
    const auto = analyzeText(mText);
    const useAuto = !this.data.mProtein && !this.data.mCalories && auto.matches.some((m) => m.food);
    const logs = store.shape.diet || [];
    const entry = {
      date: store.todayKey,
      meal: this.data.meal,
      text: mText.trim(),
      protein: this.data.mProtein ? Number(this.data.mProtein) : useAuto ? auto.totalProtein : undefined,
      calories: this.data.mCalories ? Number(this.data.mCalories) : useAuto ? auto.totalCalories : undefined,
      items: useAuto
        ? auto.matches
            .filter((m) => m.food)
            .map((m) => ({
              foodId: m.food.id,
              name: m.food.name,
              qty: m.qty,
              protein: m.protein,
              calories: m.calories,
            }))
        : undefined,
    };
    store.setDiet([...logs, entry]);

    let msg;
    if (useAuto) {
      const miss = auto.matches.filter((m) => !m.food).map((m) => m.token);
      msg =
        `已按食物库自动计算：${auto.totalProtein}g 蛋白 / ${auto.totalCalories} kcal` +
        (miss.length ? `（未识别：${miss.join('、')}，可在下面食物库点选补充）` : '');
    } else {
      msg = `已记录${this.data.meal}：${mText.trim()}`;
    }
    this.setData({ mText: '', mProtein: '', mCalories: '', msg });
    wx.showToast({ title: '已记录', icon: 'success' });
  },

  // ── 删除 ──────────────────────────────────────────
  removeLog(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const logs = store.shape.diet || [];
    store.setDiet(logs.filter((_, i) => i !== idx));
    wx.showToast({ title: '已删除', icon: 'none' });
  },

  toggleHistory() {
    this.setData({ showAllHistory: !this.data.showAllHistory }, () => this.refresh());
  },

  /**
   * 跳到体重作息。
   * 在「健康」合并页里，饮食和体重是同一个页面的两个分段，
   * 这时应该切分段而不是 navigateTo（否则会压一个新页面上去）。
   * 宿主的 switchSeg 在 this 上（子模块的 this 就是宿主实例的视图）。
   */
  goHealth() {
    if (typeof this.switchSeg === 'function') {
      this.switchSeg({ currentTarget: { dataset: { id: 'health' } } });
      return;
    }
    wx.navigateTo({ url: '/pages/health/health' });
  },

  /** 弹层内部点击：阻止冒泡到遮罩，不做任何事 */
  noop() {},
};


// 这个页面同时被合并页当作子模块使用（见 utils/tabHost.js）。
// 小程序页面模块不 export 定义，这里显式导出一份供 tabHost 取用。
module.exports = DEFINITION;