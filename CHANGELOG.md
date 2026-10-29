# 更新日志

版本号唯一真源是 `miniprogram/version.js`；打 tag 用 `v<版本>`。
发版时三处一起改：`version.js`、本文件顶部、git tag。

## v1.1.0 — 2026-10-29

**性能：修掉动画卡顿的真正原因**

- 进度条 `.bar-fill` 原来是 `transition: width 0.25s`。过渡 `width`
  每帧都要 layout → paint → composite，而总览/健康页一屏有十几条
  进度条同时动，低端安卓直接掉帧。改为 `transform: scaleX(var(--bar))`，
  只走 composite，不再触发重排。
- WXML 里同时保留 `width: X%` 和 `--bar: 0.xx` 两条：`width` 是兜底，
  不支持 CSS 变量的环境仍然画得对；`@supports` 检测通过时由
  `transform` 接管，避免「宽度 × 缩放」算两遍。
- 迁移 9 条进度条（dashboard 3 条、healthhub 5 条、settings 1 条）。
  其余页面（diet / analysis 等）仍是旧写法，靠 `width` 兜底正常工作，
  后续版本再迁。

**UI：对齐 WeUI 的结构语言（未引入 WeUI 包）**

- 新增 `.cells` / `.cell` 列表组件：发丝线分隔、统一 96rpx 行高、
  二行描述 + 右侧附加信息 + CSS chevron 箭头。适用于设置项、
  历史记录、清单这类「逐行读」的内容。
- 新增 8rpx 基准间距梯度 `.gap-1/2/3`。
- 新增按压态 `.tap` / `.tap-active`（等价于 WeUI 的 `weui-active`），
  `filter-pill` 补上了原来缺的按压反馈。
- 之所以不引 WeUI 包：本项目已有调好的双主题 token
  （`--surface-*` / `--text-*`），WeUI 自带的浅色+微信绿会顶掉它们，
  等于推翻 96KB 现成样式，还要多背约 100KB 体积。只借结构约定，
  样式全部映射回本项目 token，深浅两套主题自动跟随。

**动效**

- 卡片入场 `rise-in`：`opacity` + `translate3d`，一次性播放，
  给 5 个 tabBar 主页的**前 3 个**卡片加，逐条 30ms 延迟。
  只加前 3 个是刻意的 —— 页面里卡片有 13~60 个，全加会在加载瞬间
  同时动画，反而更卡。
- 大数字 `num-pop`、分段切换 `fade-slide`。
- 写了性能红线注释：只允许过渡 `transform` / `opacity`，
  禁止 `width` / `height` / `top` / `left` / `margin` / `padding` /
  `box-shadow` / `font-size`。
- 尊重系统「减弱动态效果」：`prefers-reduced-motion: reduce` 下全部关闭。

**说明**

- 未引入组件库，未启用 Skyline，未改动业务逻辑、存储和登录。
- 未改动的页面：11 个非 tabBar 页面（today / week / run / diet /
  health / milestones / analysis / todos / assignments /
  calendaracademic / coursescan）。
- 验证等级：仅完成 L1 静态校验（产物校验 PASS、WXML/WXSS 配平检查
  通过）。**未在开发者工具编译、未真机验证**，动画流畅度需真机确认。

## v1.0.1 — 2026-10-23

**新增：分享**

- 16 个页面都支持**转发给好友**和**分享到朋友圈**（之前一处都没有，
  右上角「···」里的「转发」一直是灰的，朋友圈入口不存在）。
- 文案集中在 `utils/share.js`。合并页的标题跟着当前分段走
  （「运动打卡 · 每周目标」而不是笼统的「健康」）。
- 分享链接带上分段（`?seg=run`），合并页 `onLoad` 读 `query.seg`，
  点开落在同一段 —— 否则标题写运动、内容却是饮食。
- 16 个页面 json 补 `enableShareTimeline: true`（只写回调、不写它，朋友圈入口照样不出现）。

**修复：合并页的回调会被 tabHost 改名成死代码**

- 子模块的 `onShareAppMessage` 会被加模块前缀变成 `todos_onShareAppMessage`，
  微信永远调不到。三个合并页改为在**宿主**上声明，前缀循环显式跳过这两个键。

**其他**

- 「设置 → 关于」显示版本号（`version.js` 为唯一真源）。
- selftest 新增 `[34] 分享`（58 条断言），验收 `435 通过 / 0 失败`。
- README 补「分享」一节；`docs/navigation.md` 记下 `?seg=` 的落地路径。

## v1.0.0 — 2026-10-20

首个公开版本。

- 从桌面版移植的 14 个模块：总览、今日、课表、周计划、待办、作业 DDL、
  饮食、运动、体重作息、重要事项、智能分析、课表识别、校历识别、设置。
- 底部菜单 5 格上限的解法：待办+作业、饮食+运动+体重 各自合并成一页，
  子模块代码原样复用（`utils/tabHost.js`）。
- 纯本地：无后端、无网络请求；13 个 `fitplan-*` 存储键与桌面版逐字一致，
  备份可以双向导入。
- 深色/浅色主题（含小程序外壳的窗口底色与导航栏）。
- selftest `377 通过 / 0 失败`，静态检查覆盖 WXML 绑定与字段引用。
- 仓库 README。
