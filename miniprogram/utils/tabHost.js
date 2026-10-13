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

/**
 * 取出一个页面模块的 Page 定义。
 *
 * 优先用 module.exports —— 子模块会显式导出一份定义（见 pages/todos/todos.js）。
 * 拿不到时回退到「临时替换 global.Page 截获」：小程序的页面是用 Page({...})
 * 注册的，直接 require 时 module.exports 是空的。
 *
 * 注意：require 之前要清缓存，否则模块已经求值过、不会再调 Page()。
 */
function loadPageDef(file) {
  const g = typeof globalThis !== 'undefined' ? globalThis : global;
  const saved = g.Page;
  let captured = null;
  g.Page = (def) => { captured = def; };
  // 告诉子模块「你正在被 tabHost 加载，不要自己注册 Page」——
  // 宿主页面（如 dashboard）自己也要参与合并时，self-require 会重入，
  // 不设这个标志就会把宿主的 Page 定义再注册一遍。
  const savedFlag = g.__TABHOST_LOADING__;
  g.__TABHOST_LOADING__ = true;

  let exported = null;
  try {
    // ⚠️ 这里绝不能用 require.resolve / require.cache / delete require.cache。
    // 那些是 Node 的东西，小程序运行时没有：
    //   · require.resolve 在小程序里不存在 → TypeError
    //   · require.cache 是 undefined → delete undefined[x] 直接抛
    // 之前就是这两行让总览/待办/健康三个宿主页在 onLoad 阶段直接抛异常，
    // 页面注册不上，表现为「点 tabBar 没反应」——而课表、设置是普通页面，
    // 所以只有那两个能点开。这类错误小程序不弹提示，只打在控制台。
    //
    // 小程序自己的模块系统本来就缓存，重复 require 返回同一份，
    // 子模块顶层会执行一次 Page()，用下面替换 global.Page 的方式截获即可。
    exported = require(file);
  } finally {
    g.Page = saved;
    g.__TABHOST_LOADING__ = savedFlag;
  }

  // 导出的是页面定义本身（有 data / onLoad）才用它
  if (exported && typeof exported === 'object' && exported.data) return exported;
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
  if (s.charAt(0) === '/') return '..' + s;
  // 已经是「相对 utils/ 且指向 pages/」的写法，别重复加前缀
  if (s.indexOf('../pages/') === 0) return s;
  // 去掉前导的 ../（相对宿主页面目录），改成相对 utils/
  if (s.indexOf('../') === 0) return '../pages/' + s.slice(3);
  // 同目录（宿主页面与子模块同层，理论上用不到）
  return '../pages/' + s;
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

  // 先把各子模块的定义取出来（每个只取一次）
  const modules = {};
  for (const id of ids) {
    const spec = specs[id];
    if (!spec || !spec.path) continue;
    // ⚠️ 不要用 require('path') 或 process.cwd()：小程序的 require 只认
    // 它自己那套「相对本文件的路径」，没有 path 模块、也没有 process。
    //
    // 而调用方传进来的 path（如 '../todos/todos.js'）是**相对宿主页面**的，
    // 在 tabHost.js 里直接 require 会从 utils/ 出发、找不到模块。
    // 所以这里统一转成「相对 tabHost.js」的路径：
    //   宿主页面在 pages/<name>/，本文件在 utils/，
    //   所以 '../todos/todos.js'（相对 pages/tasks/）要变成
    //   '../pages/todos/todos.js'（相对 utils/）。
    //
    // 调用方也可以直接给相对 utils/ 的路径（以 '.' 开头且去掉前导 ../ 后
    // 落在 pages/ 下），这里两种写法都认。
    const def = loadPageDef(resolveFromUtils(spec.path));
    if (!def) {
      console.error(`[tabHost] 取不到 ${id} 的 Page 定义（${spec.path}）`);
      continue;
    }
    modules[id] = { def, label: spec.label || id };
  }

  // 宿主自己的定义也能作为一个分段参与（如「总览 / 今日」里的总览）。
  // 这时不需要 path —— 定义直接由调用方传进来，省掉一次自 require。
  // selfId 不传时默认用第一个分段。
  const selfId = opts.selfId || ids[0];
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

    onLoad() {
      this._views = {};
      this._unsubs = [];
      // 先把各子模块的 data 并进来，再调它们的 onLoad
      const initial = {};
      for (const id of ids) {
        const mod = modules[id] && modules[id].def;
        if (!mod) continue;
        Object.assign(initial, prefixKeys(mod, prefixOf(id)));
      }
      this.setData(initial);

      for (const id of ids) {
        const mod = modules[id] && modules[id].def;
        if (!mod) continue;
        const view = makeView(this, prefixOf(id), mod);
        this._views[id] = view;
        if (typeof mod.onLoad === 'function') {
          try {
            mod.onLoad.call(view);
          } catch (e) {
            console.error(`[tabHost] ${id}.onLoad 出错`, e);
          }
        }
      }
      this.setData({ ready: true });
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

      for (const id of ids) {
        const mod = modules[id] && modules[id].def;
        const view = this._views && this._views[id];
        if (mod && view && typeof mod.onShow === 'function') {
          try {
            mod.onShow.call(view);
          } catch (e) {
            console.error(`[tabHost] ${id}.onShow 出错`, e);
          }
        }
      }
    },

    onUnload() {
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
      this.setData({ seg: id }, () => {
        const mod = modules[id] && modules[id].def;
        const view = this._views && this._views[id];
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

        // 每次切过来都刷新一下，保证看到的是最新数据
        if (typeof mod.refresh === 'function') {
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
      if (key === 'data' || key === 'onLoad' || key === 'onShow' || key === 'onUnload') continue;
      if (typeof mod[key] !== 'function') continue;
      host[prefixOf(id) + key] = function (e) {
        const view = this._views && this._views[id];
        return mod[key].call(view, e);
      };
    }
  }

  return host;
}

module.exports = { buildHost, makeView, prefixKeys };
