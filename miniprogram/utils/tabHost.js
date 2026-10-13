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

  let exported = null;
  try {
    const resolved = require.resolve(file);
    delete require.cache[resolved];
    exported = require(file);
  } finally {
    g.Page = saved;
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
 * @param {string} opts.base      路径基准目录（调用方传 __dirname）
 *
 * 传 path 而不是直接传 require 结果，是因为小程序页面不 export 定义，
 * 必须在 require 的瞬间用 global.Page 截获（见 loadPageDef）。
 */
function buildHost(opts) {
  const segments = opts.segments || [];
  const specs = opts.modules || {};
  const ids = segments.map((s) => s.id);
  const nodePath = require('path');

  // 先把各子模块的定义取出来（每个只取一次）
  const modules = {};
  for (const id of ids) {
    const spec = specs[id];
    if (!spec || !spec.path) continue;
    // 路径按调用方目录解析：相对路径在 Node 里是相对「本文件」的，
    // 直接用 '../todos/todos.js' 会从 utils/ 出发，找不到模块
    const file = nodePath.isAbsolute(spec.path)
      ? spec.path
      : nodePath.resolve(opts.base || process.cwd(), spec.path);
    const def = loadPageDef(file);
    if (!def) {
      console.error(`[tabHost] 取不到 ${id} 的 Page 定义（${file}）`);
      continue;
    }
    modules[id] = { def, label: spec.label || id };
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

    onShow() {
      // 别的页面可能用「switchTab + globalData.pendingSeg」的方式指定过
      // 要停在哪个分段（switchTab 的 url 不能带 query）。
      // 这里检查一次，用完即清，避免下次切回来又被改分段。
      try {
        const app = typeof getApp === 'function' ? getApp() : null;
        const pending = app && app.globalData && app.globalData.pendingSeg;
        if (pending && ids.indexOf(pending.seg) >= 0 && pending.seg !== this.data.seg) {
          app.globalData.pendingSeg = null;
          this.setData({ seg: pending.seg });
        }
      } catch (e) {
        // getApp 在某些时机拿不到，忽略即可
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
      this.setData({ seg: id });
      // 切过去时刷新一下该模块，保证看到的是最新数据
      const mod = modules[id] && modules[id].def;
      const view = this._views && this._views[id];
      if (mod && view && typeof mod.refresh === 'function') {
        try {
          mod.refresh.call(view);
        } catch (err) {
          console.error(`[tabHost] ${id}.refresh 出错`, err);
        }
      }
    },

    /** 允许外部指定初始分段（配合 wx.navigateTo 的 query 用） */
    setSeg(id) {
      if (ids.indexOf(id) >= 0) this.setData({ seg: id });
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
