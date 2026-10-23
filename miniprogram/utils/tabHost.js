// 把多个已有的小程序页面「拼」成一个宿主页面，用分段控件切换。
//
// 背景：微信 tabBar 最多 5 项。用户要把「待办 + 作业」并成一项、再加「健康」，
// 位置不够。与其把每个子模块的几百行逻辑复制粘贴进一个大文件（那样以后
// 改一处要改两处，且已经验证过的逻辑会分叉），不如让子模块保持原样，
// 由这里把它们挂到同一个 Page 实例上。
//
// 做法：
//   1. 子模块的 data 键加前缀并入宿主 data（todos 的 list → td_list）。
//   2. 子模块的方法原样挂到宿主，但其内部的 this.data / this.setData
//      访问会被改写成带前缀的版本 —— 这样两个子模块即使都有 list、
//      filter、ready 这些同名键也不会互相踩。
//   3. 生命周期：宿主 onLoad 时依次调用各子模块的 onLoad，
//      但每个子模块拿到的 this 是「带前缀视图」，见 makeView。
//
// 限制（不重要，但写清楚）：
//   · 只处理对象方法，不支持子模块用 Object.defineProperty 之类的花活；
//   · 子模块之间不共享状态，需要联动得自己在宿主里写。

// 取当前主题对应的类名。放在宿主这一层算，是因为 .page-wrap 这个根节点是宿主的，
// 而子模块算出来的 themeClass 会被加上 `<模块>_` 前缀（见 tools/prefix-wxml.js 的
// NEVER 集合，那里特意把 themeClass 排除在外，不给它加前缀）。
const { store } = require('../store/store');
const { shareAppMessage, shareTimeline } = require('./share');

function themeClassOf() {
  const settings = store && store.shape && store.shape.settings;
  return settings && settings.theme === 'light' ? 'theme-light' : '';
}

/**
 * 在一段「正在加载子模块」的上下文里执行 fn。
 *
 * 子模块顶层会无条件执行 `Page(DEFINITION)`。宿主页把它们 require 进来时，
 * 这次 Page() 会把子模块注册成「当前页面」，把宿主自己顶掉。所以这里临时
 * 把 global.Page 换成收集器，并置上 __TABHOST_LOADING__ 标志。
 */
function withCapture(fn) {
  const g = typeof globalThis !== 'undefined' ? globalThis : global;
  const savedPage = g.Page;
  const savedFlag = g.__TABHOST_LOADING__;
  let captured = null;
  g.Page = (def) => { captured = def; };
  g.__TABHOST_LOADING__ = true;
  let ret;
  try {
    ret = fn();
  } finally {
    g.Page = savedPage;
    g.__TABHOST_LOADING__ = savedFlag;
  }
  return { captured, ret };
}

/**
 * 取出一个页面模块的 Page 定义。
 *
 * ⚠️ 这个函数用「运行时算出来的路径」调 require，小程序**不能**这么用：
 * 打包器只把「字符串字面量 require」的目标打进包，动态路径的模块根本不在包里，
 * 运行时报 `module 'pages/xxx/xxx.js' is not defined`。
 * 这个异常发生在宿主页模块求值阶段，Page() 没执行到，页面就是一片空白
 * （不白屏、不弹窗，只有控制台一行红字）—— 课表/设置是普通页面所以正常，
 * 总览/待办·作业/健康三个合并页全空。
 *
 * 所以正常路径改走 opts.loadDefs（宿主页里写死字面量 require，见 buildHost）。
 * 这里只作为**回退**保留：Node 环境下 require 支持动态路径，单测仍然走这条路。
 */
function loadPageDef(file) {
  const { captured, ret } = withCapture(() => require(file));
  // 导出的是页面定义本身（有 data / onLoad）才用它
  if (ret && typeof ret === 'object' && ret.data) return ret;
  return captured;
}

/** 把一个子模块的 data 键加上命名空间前缀 */
function prefixKeys(mod, prefix) {
  const out = {};
  for (const k of Object.keys((mod && mod.data) || {})) out[prefix + k] = mod.data[k];
  return out;
}

/**
 * 把「相对宿主页面」的模块路径转成「相对本文件（utils/tabHost.js）」的路径。
 *
 * 小程序没有 path 模块，只能自己做字符串处理。这里不做通用解析，
 * 只处理实际会出现的两种写法：
 *   · '../todos/todos.js'      → '../pages/todos/todos.js'
 *   · '/pages/todos/todos.js'  → '../pages/todos/todos.js'
 *   · '../pages/x/x.js'        → 原样（已经是相对 utils/ 的）
 */
function resolveFromUtils(p) {
  let s = String(p || '');
  if (!s) return s;
  // 绝对路径（小程序里以 / 开头 = 项目根）
  if (s.charAt(0) === '/') s = '..' + s;
  // 已经是「相对 utils/ 且指向 pages/」的写法，别重复加前缀
  else if (s.indexOf('../pages/') === 0) { /* 原样 */ }
  // 去掉前导的 ../（相对宿主页面目录），改成相对 utils/
  else if (s.indexOf('../') === 0) s = '../pages/' + s.slice(3);
  // 同目录（宿主页面与子模块同层，理论上用不到）
  else s = '../pages/' + s;
  // 去掉 .js 后缀，统一成小程序模块表的键名
  if (s.slice(-3) === '.js') s = s.slice(0, -3);
  return s;
}

/**
 * 造一个「视图」：它长得像原来那个页面实例，但读写 data 时会自动加/去前缀。
 * 子模块的代码完全不用改就能跑。
 *
 * 方法解析顺序很重要：子模块里写 `this.add(...)`，这里要优先解析到
 * `todos_add`（本模块的），而不是宿主上的裸 `add` —— 否则两个模块的
 * 同名方法会互相串台。
 */
function makeView(host, prefix, mod) {
  return new Proxy(host, {
    get(target, prop, receiver) {
      // data：返回一个按前缀映射的代理对象
      if (prop === 'data') {
        return new Proxy(target.data, {
          get(d, key) {
            if (typeof key !== 'string') return d[key];
            // 先找带前缀的，找不到再原样找（宿主自己的键，如 themeClass）
            const pk = prefix + key;
            if (pk in d) return d[pk];
            return d[key];
          },
          set(d, key, value) {
            d[prefix + key] = value;
            return true;
          },
          has(d, key) {
            return typeof key === 'string' && (prefix + key in d || key in d);
          },
        });
      }

      // setData：把补丁的键都加上前缀
      if (prop === 'setData') {
        return (patch, cb) => {
          const out = {};
          for (const k of Object.keys(patch)) out[prefix + k] = patch[k];
          return target.setData(out, cb);
        };
      }

      // 方法：本模块前缀的版本优先，避免同名方法串台
      if (typeof prop === 'string') {
        const own = target[prefix + prop];
        if (typeof own === 'function') return own.bind(target);
      }

      const v = target[prop];
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}

/**
 * @param {object} opts
 * @param {Array}  opts.segments  分段定义 [{id,label,icon}]
 * @param {object} opts.modules   { 分段id: { path: 子模块 js 路径, label } }
 *
 * ⚠️ 模块路径写成**相对宿主页面**的（如 '../todos/todos.js'）。
 * 不要去传 __dirname、base 之类的「路径基准」—— 小程序里没有 __dirname，
 * 也没有 path 模块；这类代码在 Node 里跑得好好的，一进小程序就在模块顶层
 * 抛 ReferenceError，表现是「点这个 tab 没反应」，而且只有控制台看得到。
 * 路径换算由 resolveFromUtils 负责。
 *
 * 传 path 而不是直接传 require 结果，是因为小程序页面不 export 定义，
 * 必须在 require 的瞬间用 global.Page 截获（见 loadPageDef）。
 */
function buildHost(opts) {
  const segments = opts.segments || [];
  const specs = opts.modules || {};
  const ids = segments.map((s) => s.id);

  // ⚠️ 子模块必须由调用方用**字符串字面量的 require** 取进来。
  //
  // 小程序的打包器只把字面量 require 的目标打进包。之前这里用
  // loadPageDef(算出来的路径) 去 require，那些模块压根不在包里，运行时抛
  //   module 'pages/today/today.js' is not defined
  // 这个异常在宿主页模块求值阶段就抛出，Page() 根本没执行到，页面一片空白。
  // 课表、设置是普通页面，所以看起来「只有那两个能用」。
  //
  // 用法（宿主页里）：
  //   buildHost({ ..., loadDefs() { return { today: require('../today/today.js') }; } })
  // 传进来的是个函数，只有在 withCapture 里调用它，子模块顶层的
  // Page(DEFINITION) 才不会被当成宿主自己的注册。
  let preloaded = null;
  if (typeof opts.loadDefs === 'function') {
    const { ret } = withCapture(() => opts.loadDefs());
    preloaded = ret || {};
  }

  // 「宿主自己」那一段（如「总览 / 今日」里的总览）：定义由调用方用 selfDef
  // 传进来，既不写 path 也不会出现在 loadDefs 里。先算出来，免得下面误报。
  const selfId = opts.selfId || ids[0];

  // 先把各子模块的定义取出来（每个只取一次）
  const modules = {};
  for (const id of ids) {
    // spec 只是「可选补充」：有了 loadDefs 之后，宿主页可以完全不写 modules，
    // 标签直接从 segments 里取。
    const spec = specs[id] || {};

    // 优先：宿主页字面量 require 进来的定义
    let def = preloaded && preloaded[id] ? preloaded[id] : null;
    // 其次：调用方直接给的定义对象
    if (!def && spec.def) def = spec.def;
    // 回退：动态 require（Node 单测走这条；小程序里这条路走不通，见上）
    if (!def && spec.path) def = loadPageDef(resolveFromUtils(spec.path));

    if (!def) {
      // 宿主自己那一段马上会由下面的 selfDef 补上，不是错误 ——
      // 以前这里会白报一条「取不到 dashboard 的 Page 定义」，把控制台染红。
      if (opts.selfDef && id === selfId) continue;
      console.error(`[tabHost] 取不到 ${id} 的 Page 定义（${spec.path || id}）`);
      continue;
    }
    const seg = segments.filter((s) => s.id === id)[0];
    modules[id] = { def, label: spec.label || (seg && seg.label) || id };
  }

  // 宿主自己的定义也能作为一个分段参与（如「总览 / 今日」里的总览）。
  // 这时不需要 path —— 定义直接由调用方传进来，省掉一次自 require。
  if (opts.selfDef && !modules[selfId]) {
    modules[selfId] = { def: opts.selfDef, label: opts.selfLabel || selfId };
  }

  // 前缀用「模块名 + 下划线」，例如 todos_list
  const prefixOf = (id) => id + '_';

  const host = {
    data: {
      ready: false,
      themeClass: '',
      // 当前分段
      seg: ids[0],
      segments: segments.map((s) => Object.assign({}, s)),
    },

    /**
     * 按需初始化一个分段：建视图 + 首次跑它的 onLoad。
     *
     * 以前这里对 ids 全量循环：三个分段都跑 onLoad（各自 subscribe + 全量
     * refresh + setData），可 wx:if 只渲染当前这一段，另外两段的工作全是白做的。
     * 真机实测健康页进入一次是 10 次 setData / 59 KB，其中大半是给没显示的分段
     * 刷的。改成按需初始化后，切换分段时由 _revealSeg 补做，行为等价。
     */
    _initSeg(id) {
      const mod = modules[id] && modules[id].def;
      if (!mod) return null;
      if (!this._views) this._views = {};
      const view = this._views[id] || (this._views[id] = makeView(this, prefixOf(id), mod));
      if (!this._segLoaded) this._segLoaded = {};
      if (this._segLoaded[id]) return view;
      this._segLoaded[id] = true;
      if (typeof mod.onLoad === 'function') {
        try {
          mod.onLoad.call(view);
        } catch (e) {
          console.error(`[tabHost] ${id}.onLoad 出错`, e);
        }
      }
      return view;
    },

    /** 把某个分段的 data 并进宿主；同一段只并一次（分段没显示时本来也不渲染） */
    _dataPatchFor(id) {
      const out = {};
      if (!this._segData) this._segData = {};
      if (this._segData[id]) return out;
      const mod = modules[id] && modules[id].def;
      if (!mod) return out;
      const defaults = prefixKeys(mod, prefixOf(id));
      // 只补「宿主 data 里还没有的键」。
      // 不能无条件覆盖：子模块 onLoad 里的 refresh 可能已经把真数据写进来了，
      // 再用它的初始 data 覆盖回去，界面会先闪一帧空列表。
      for (const k of Object.keys(defaults)) {
        if (!(k in this.data)) out[k] = defaults[k];
      }
      this._segData[id] = true;
      return out;
    },

    /**
     * 分享：转发给好友。
     *
     * 为什么声明在宿主上、而不是让子模块自己带：子模块的 onShareAppMessage
     * 会被下面的前缀循环改名成 `todos_onShareAppMessage`，微信永远调不到它，
     * 转发入口会一直是灰的。标题跟着**当前分段**走，所以这里读 this.data.seg。
     */
    onShareAppMessage() {
      return shareAppMessage(opts.shareKey, { seg: this.data.seg });
    },

    /** 分享到朋友圈。同样在宿主上声明，理由同上。 */
    onShareTimeline() {
      return shareTimeline(opts.shareKey, { seg: this.data.seg });
    },

    onLoad(query) {
      this._views = {};
      this._unsubs = [];
      this._segLoaded = {};
      this._segData = {};
      // 别人点开分享链接时带过来的分段（?seg=run）——
      // 不处理的话分享出去的「运动打卡」会落在默认的第一段「饮食」上。
      // 必须在下面 setData 之前设好：_dataPatchFor 读的就是 this.data.seg。
      if (query && typeof query.seg === 'string' && ids.indexOf(query.seg) >= 0) {
        this.data.seg = query.seg;
      }
      // 根节点上的主题类由宿主自己给：子模块算出来的那份会被加上 `<模块>_` 前缀，
      // 而 WXML 的根节点读的是不带前缀的这一个（以前没人给，于是三个合并页
      // 在浅色主题下一直是深色）。
      const initial = { themeClass: themeClassOf() };
      // 只并「当前显示那一段」的 data，其余分段等切过去时再并 ——
      // wx:if 没显示的分段不在渲染树上，早并是白并。
      Object.assign(initial, this._dataPatchFor(this.data.seg));
      this.setData(initial);
      // 在「设置」里换主题不会重新进这个页面，所以得订阅一次
      this._themeUnsub = store.subscribe(() => this._syncTheme());

      this._initSeg(this.data.seg);
      this.setData({ ready: true });
    },

    /**
     * 把当前主题同步到根节点的 class 上。
     *
     * 只在这一层算，原因见 themeClassOf。值没变就不 setData —— 订阅者会在
     * store 的任何一次写入后被调用，没必要每次都惊动渲染层。
     */
    _syncTheme() {
      const cls = themeClassOf();
      if (this.data.themeClass !== cls) this.setData({ themeClass: cls });
    },

    /**
     * onReady：只给「当前显示的那一段」跑子模块的 onReady。
     *
     * 原因：分段内容在 wx:if 分支里，没显示的那几段不在渲染树上，
     * 子模块 onReady 里去查 canvas 节点会拿到 null。
     * 其余分段等切过去时由 _revealSeg 补跑。
     */
    onReady() {
      const cur = this.data.seg;
      const mod = modules[cur] && modules[cur].def;
      const view = this._views && this._views[cur];
      if (!mod || !view) return;
      this._segReady = this._segReady || {};
      this._segReady[cur] = true;
      if (typeof mod.onReady === 'function') {
        try {
          mod.onReady.call(view);
        } catch (e) {
          console.error(`[tabHost] ${cur}.onReady 出错`, e);
        }
      }
    },

    /** 同 onReady：子模块可能在 onHide 里停掉定时器之类 */
    onHide() {
      for (const id of ids) {
        const mod = modules[id] && modules[id].def;
        const view = this._views && this._views[id];
        if (mod && view && typeof mod.onHide === 'function') {
          try {
            mod.onHide.call(view);
          } catch (e) {
            console.error(`[tabHost] ${id}.onHide 出错`, e);
          }
        }
      }
    },

    onShow() {
      // 兜一下：极端情况下（比如热重载）订阅可能没跑，进页面时对一次主题
      this._syncTheme();

      // 别的页面可能用「switchTab + globalData.pendingSeg」的方式指定过
      // 要停在哪个分段（switchTab 的 url 不能带 query）。
      // 这里检查一次，用完即清，避免下次切回来又被改分段。
      //
      // 走 _revealSeg 而不是直接 setData：目标分段可能是第一次显示，
      // 需要补跑它的 onReady（画图表的代码在那里）。
      let pendingSeg = null;
      try {
        const app = typeof getApp === 'function' ? getApp() : null;
        const pending = app && app.globalData && app.globalData.pendingSeg;
        if (pending && ids.indexOf(pending.seg) >= 0) {
          app.globalData.pendingSeg = null;
          pendingSeg = pending.seg;
        }
      } catch (e) {
        // getApp 在某些时机拿不到，忽略即可
      }

      if (pendingSeg && pendingSeg !== this.data.seg) {
        // _revealSeg 里已经包含 refresh，这里直接返回就行
        this._revealSeg(pendingSeg);
        return;
      }

      // 只跑「当前显示这一段」的 onShow。
      // 子模块的 onShow 基本都是 this.refresh()（一次全量 setData），对没显示的
      // 分段跑它纯属浪费 —— wx:if 分支不在渲染树上，刷了也看不到。
      // 切过去的时候 _revealSeg 会补跑。
      const cur = this.data.seg;
      const cmod = modules[cur] && modules[cur].def;
      const cview = this._initSeg(cur);
      if (cmod && cview && typeof cmod.onShow === 'function') {
        try {
          cmod.onShow.call(cview);
        } catch (e) {
          console.error(`[tabHost] ${cur}.onShow 出错`, e);
        }
      }
    },

    onUnload() {
      if (this._themeUnsub) {
        try { this._themeUnsub(); } catch (e) { /* 退订失败不影响别的 */ }
        this._themeUnsub = null;
      }
      for (const id of ids) {
        const mod = modules[id] && modules[id].def;
        const view = this._views && this._views[id];
        if (mod && view && typeof mod.onUnload === 'function') {
          try {
            mod.onUnload.call(view);
          } catch (e) {
            console.error(`[tabHost] ${id}.onUnload 出错`, e);
          }
        }
      }
    },

    /** 分段切换 */
    switchSeg(e) {
      const id = e.currentTarget.dataset.id;
      if (!id || ids.indexOf(id) < 0 || id === this.data.seg) return;
      this._revealSeg(id);
    },

    /**
     * 切到某个分段。
     *
     * 分段内容都在 wx:if 分支里，没显示的那几段根本不在渲染树上 ——
     * 所以子模块的 onReady（画 canvas 图表就写在这里）不能在宿主 onReady
     * 时统一调，必须等它那段真的显示出来。
     *
     * 这里用 _segReady 记录「这段的 onReady 跑过了」，避免来回切换时重复初始化
     * （重复 initChart 会拿到新节点、旧节点上的绘制白做，还可能泄漏）。
     */
    _revealSeg(id) {
      const firstTime = !this._segReady || !this._segReady[id];
      // 先按需初始化（首次会跑子模块 onLoad → refresh，把该段的 data 写好），
      // 再连同 seg 一起 setData —— wx:if 在 seg 生效那一帧就渲染，分两次写会
      // 先渲染出一帧「字段全是 undefined」的空分段。
      const view = this._initSeg(id);
      const patch = { seg: id };
      Object.assign(patch, this._dataPatchFor(id));
      this.setData(patch, () => {
        const mod = modules[id] && modules[id].def;
        if (!mod || !view) return;

        // 首次显示时补跑 onReady —— 此时节点才存在
        if (firstTime && typeof mod.onReady === 'function') {
          this._segReady = this._segReady || {};
          this._segReady[id] = true;
          try {
            mod.onReady.call(view);
          } catch (err) {
            console.error(`[tabHost] ${id}.onReady 出错`, err);
          }
        }

        // 每次切过来都刷新一下，保证看到的是最新数据。
        // 优先走子模块的 onShow（语义上和它独立成页时一致），没有才退回 refresh。
        if (typeof mod.onShow === 'function') {
          try {
            mod.onShow.call(view);
          } catch (err) {
            console.error(`[tabHost] ${id}.onShow 出错`, err);
          }
        } else if (typeof mod.refresh === 'function') {
          try {
            mod.refresh.call(view);
          } catch (err) {
            console.error(`[tabHost] ${id}.refresh 出错`, err);
          }
        }
      });
    },

    /** 允许外部指定初始分段（配合 globalData.pendingSeg 用） */
    setSeg(id) {
      if (ids.indexOf(id) < 0) return;
      if (id === this.data.seg) return;
      this._revealSeg(id);
    },
  };

  // 把子模块的方法挂到宿主上，一律加模块前缀（todos_add / assignments_add）。
  //
  // 为什么不挂「无前缀」的版本：两个模块很可能有同名方法（todos 和
  // assignments 都有 add / remove / toggle），裸名字只能属于其中一个，
  // 另一个模块内部的 this.add() 就会调到别的模块去 —— 这类串台很难查。
  // 由于子模块内部调用走的是 makeView 的 Proxy，get 的时候会优先从
  // 「本模块前缀」里找（见 makeView），所以裸名字在这里不需要存在。
  for (const id of ids) {
    const mod = modules[id] && modules[id].def;
    if (!mod) continue;
    for (const key of Object.keys(mod)) {
      // 生命周期与「页面级回调」不挂前缀：
      //   · onLoad / onShow / onUnload 由宿主自己转发（见上面那几个方法）；
      //   · onShareAppMessage / onShareTimeline 只有微信在**页面根对象**上
      //     才认，挂成 todos_onShareAppMessage 是死代码。宿主统一用
      //     opts.shareKey 声明一份（见 host.onShareAppMessage）。
      if (
        key === 'data' ||
        key === 'onLoad' ||
        key === 'onShow' ||
        key === 'onUnload' ||
        key === 'onShareAppMessage' ||
        key === 'onShareTimeline'
      )
        continue;
      if (typeof mod[key] !== 'function') continue;
      host[prefixOf(id) + key] = function (e) {
        // 分段现在是懒初始化的；用户没切到过那一段时它的视图还没建。
        // 这里兜一次，否则视图的 data 代理读不到自己的字段，
        // 方法里 this.data.xxx 会全是 undefined。
        const view = this._initSeg(id);
        return mod[key].call(view, e);
      };
    }
  }

  return host;
}

module.exports = { buildHost, makeView, prefixKeys };
