# UI 重构交接 · v1.2.0 · 第 1/4 期完成

> 写给「新开一个对话继续做」。
> 读这一份就能接上，**没写在这里的东西新对话不知道**。

---

## 一句话现状

**代码当前是可运行、可验证的绿色状态。** 第 1 期（图标体系）已完成并验证，
第 2/3/4 期还没开始。**未提交、未升版本号、未真机验证。**

```
node miniprogram/tools/selftest.js "$PWD/miniprogram"    → 446 通过 / 0 失败
node miniprogram/tools/check-handlers.js "$PWD/miniprogram" → 所有处理器都有方法
python <skill>/validate_miniprogram_artifacts.py <mp目录>   → PASS (0 errors, 0 warnings)
```

---

## 用户的原始诉求与已确认决策

用户原话：**「完全学习官方文档，运用所有能用的 skill，把小程序的 UI 和底层架构重构，现在有好多 UI 看上去重叠了」**

已通过结构化提问确认的四项决策（**不要再重新问**）：

| 项 | 用户选择 |
|---|---|
| 重构范围 | 先做「视觉体系重构」，一次性解决重叠 + 统一规范 |
| 视觉方向 | **保留现有深色双主题 token 体系**，只做规范和修复 |
| 推进方式 | **按四期顺序做，每期先给截图确认** |
| 图标方案 | **用 WeUI 官方图标字体**（已实施，见下） |

---

## 「UI 重叠」的真正根因（已用像素级证据确认）

**不是**尺寸换算错误，**不是**动画。是 **emoji 字形裁切**：

- 全站图标原本是直接写进 WXML 的 **emoji 字面量**（107+ 处）
- 彩色 emoji 按 1em 的 ~1.17 倍绘制，基线由系统字体决定
- 图标底座 `.icon-chip` 是**定高盒子**（原 `52rpx` = 26px）
- → 字形上下溢出盒子，压到右侧标题文字上

**证据**（同一行像素扫描）：旧 emoji 🔥 高度 7px 上下出界；新 `ui-icon` 高度严格 6px 稳稳在内。

**为什么模拟器看起来"时好时坏"**：截图会截到 `rise-in` 入场动画的中间帧（0.28s），
此时卡片整体位移，视觉上像重叠。稳定态下 emoji 与文字其实是分开的 ——
所以单纯看截图会误判。**必须用像素扫描或 DOM 测量，不能只靠肉眼看截图。**

---

## 第 1 期已完成（可运行）

### 新增文件

| 文件 | 作用 |
|---|---|
| `components/ui-icon/ui-icon.js` `.wxml` `.wxss` `.json` | 全站唯一图标出口，包 WeUI `mp-icon` |
| `components/ui-icon/icons.js` | **图标语义表（真源）**，语义名 → WeUI 名 |
| `utils/ui-icon.js` | 转发到上面那个，供页面 JS 用 |
| `tools/apply-icons.js` | 批量把「图标容器 + emoji」换成 `<ui-icon>`，可 `--write` |

### 修改文件

- `app.json`：注册全局 `"ui-icon": "/components/ui-icon/ui-icon"`
- `app.wxss`：
  - `.icon-chip` 改为 `56rpx` + `align-items:center` + `overflow:hidden`（物理上不可能再溢出）
  - `.icon-btn` 用 `padding:16rpx; margin:-16rpx` 把**热区**撑到 88rpx(44px)，外观不变
  - 新增全局按压反馈，覆盖 22 种可点容器（原来 262 个 bindtap 里只有 3 个有反馈）
- 16 个 WXML：`130` 处 emoji 图标 → `<ui-icon name="语义" size="{{20}}" color="currentColor"/>`
- `project.config.json`：`packOptions.ignore` 剔掉用不到的 WeUI 组件目录（653KB → 423KB）

### 验证方式（重要）

不能靠看截图。用这两个命令：

```powershell
$c = 'D:\webcast_mate\wechatide.cmd'
# 渲染结果里必须有 base64 SVG，空则说明映射失败
& $c -c dsh automation_element_action --project 'D:\Comprehensive AIization\miniprogram' --action outerWxml --selector '.icon-chip'
# 期望看到：mask-image:url(data:image/svg+xml;base64,PD94bWwg...)
```

---

## ⚠️ 踩过的三个坑（不写下来会重踩）

### 1. 语义名绝不能直接透传给 WeUI（静默空白）

WXML 写的是**语义名**（`tasks` / `meal` / `run`），WeUI 只有 81 个图形，
没有 `tasks`。**WeUI 查不到名字时不报错，而是把 `src` 留空** →
渲染成 `mask-image:url()` 的空 view，页面上什么都不显示，控制台一片安静。

必须在 `ui-icon` 里先 `resolveName()` 再传给 `mp-icon`。

### 2. 从 `components/` require 到 `utils/` 会失败

```
Error: module 'utils/ui-icon.js' is not defined, require args is '../../utils/ui-icon'
```

这就是 `utils/tabHost.js` 注释里记过的那类问题。**解法**：图标表放在
`components/ui-icon/icons.js`（组件同目录），用 `require('./icons')`。

### 3. `automation_evaluate` 的三个限制

- 走 `.cmd` 包装，**双引号会被 shell 吃掉** → 代码里只用单引号
- **多行代码解析失败**（`Unexpected token ')'`）→ 必须写成单行
- 运行时 `require('../../store/store')` 不可用 → 用 `getApp().globalData.store`

---

## 第 1 期未做（属于后续期或需单独确认）

1. **数据驱动的导航格仍是 emoji**：`dashboard.wxml:186`
   `<view class="icon-chip tone-{{item.tone}}">{{item.icon}}</view>`
   `item.icon` 来自 JS 数据，`apply-icons.js` 有意跳过。要改成 ui-icon 需要
   同时改数据层（把 emoji 换成语义名）。
2. **行内 emoji 仍是 emoji**（约 40 处）：按钮文字前缀（`📷 课表识别`）、
   正文里的 `📍 {{item.place}}`、模板字面量 `'今日蛋白已达标 ✅'`。
   这类**不会造成重叠**（是行内文字，不占定高盒子），但风格不统一。
3. **`week-setup-emoji`** `📅`（`dashboard.wxml:86`）是 `<text>` 不是容器，脚本没动。

---

## 第 2/3/4 期待办（用户已同意按此顺序）

### 第 2 期：排版尺度 → 官方 22/17/15/14/12pt 五档

微信设计指南 5.1 规定常用字号为 **22, 17, 15, 14, 12 (pt)**。
现状有 `23rpx / 24rpx / 25rpx` 等规则外尺寸（≈11.5/12/12.5pt）。
需要：定 5 档字号 token，全站替换，`--text-4` 对比度不足（3.3:1 < AA 4.5:1）也要一起处理。

### 第 3 期：卡片层级统一

85 处 `card-head-title` 结构一致但层级混乱，存在「卡片套卡片」。

### 第 4 期：底层清理

tabHost 前缀问题已有 `[35]` 测试兜底；store 与合并页机制暂不动。

---

## 环境与操作手册

- 仓库：`D:\Comprehensive AIization`，小程序在 **`miniprogram/` 子目录**（不是仓库根）
- **开发者工具在 `D:\webcast_mate`**（不在仓库目录里找）
- 基础库 3.17.4，WebView 渲染器，AppID `wx7e834512568ff8f4`

```powershell
$c = 'D:\webcast_mate\wechatide.cmd'
& $c -c dsh check_wechatide_status
& $c -c dsh open_project_window --project 'D:\Comprehensive AIization\miniprogram' --window-mode fullMode
& $c -c dsh simulator_refresh --project 'D:\Comprehensive AIization\miniprogram'
& $c -c dsh simulator_screenshot --project '...' --path shot.png --optimize false
& $c -c dsh get_simulator_console --project '...' --command 'grep -i error'
& $c -c dsh automation_element_action --project '...' --action outerWxml --selector '.icon-chip'
& $c -c dsh automation_element_action --project '...' --action size --selector '.icon-chip'
& $c -c dsh automation_navigate --project '...' --action switchTab --url '/pages/tasks/tasks'
```

**改完代码后如果渲染没变**：`close_project_window` → 重新 `open_project_window`。
新文件（如 `icons.js`）需要重新编译才会进依赖图。

---

## 前一版交接仍然有效

`docs/miniapp/HANDOVER-v1.2.0.md` 记录了 **AI 洞察引擎**（`utils/insight.js`）
和 tabHost 前缀 bug 的完整排查。那份文档里的教训仍然适用，特别是：

- 开发者工具的 `无效的 page.json ["enableShareTimeline"]` 是**误报**，别去改
- 合并页 WXML 必须用带前缀的 data 键，`selftest` 的 `[35]` 就是拦这个的