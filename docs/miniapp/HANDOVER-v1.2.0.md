# v1.2.0 开发交接

> 这份文件是给「新开一个对话继续做」用的。当前对话上下文可能已满，
> 新对话读这一份就能接上。**没有它记下来的东西，新对话不知道。**

## 一句话现状

小程序 `D:\Comprehensive AIization`（GitHub: `CrownKing-001/comprehensive-aiization`）
正在做 v1.2.0「AI 化首页」改造。**代码已改完、静态校验全过、尚未提交、尚未真机验证。**

## 产品方向（用户 2026-10-29 确认）

用户的三个核心诉求：

1. **减少用户输入** —— "数据都要自己填，有时候都懒得打开"。不是少填，是**每填一点立刻得到回报**。
2. **打破完全本地化** —— 但要 0 成本，暂缓。
3. **提高用户量 → 挂广告赚钱** —— 现状几十个用户，打开一次就不再打开。

用户的愿景原话：**"记录自己的生活数据，用于全面 AI 化"**（参考邵艾伦、孙宇晨访谈的观点）。
即：把所有生活数据汇成结构化上下文，让 AI 给出别人给不了的建议。

**已确认的关键决策：**

- **先做 AI 形态的骨架，背后用规则引擎**（不接大模型，零成本）。
  将来有收入了把 `utils/insight.js` 内部换成模型调用即可，页面和数据结构不用动。
- **不删任何功能**。健康模块保留，它是"你的上下文"的一部分。
- **保留现有深色双主题 token 体系**，不引 WeUI 包。
- 用户明确说：**"先改文件，我看完再升版本"** → 当前**不要升版本号**（仍是 1.1.0）。

## 已完成（未提交）

改动 4 个文件：

| 文件 | 状态 | 内容 |
|---|---|---|
| `miniprogram/utils/insight.js` | **新增 453 行** | 洞察引擎：11 条规则 + 问答推进 |
| `miniprogram/pages/dashboard/dashboard.wxml` | 修改 | 在 `seg === 'dashboard'` 段最前面插入 AI 对话区 + 洞察列表 |
| `miniprogram/pages/dashboard/dashboard.wxss` | 修改 | 追加 `.ai-*` 样式（用现有 token） |
| `miniprogram/pages/dashboard/dashboard.js` | 修改 | 引入引擎、`refresh()` 里算 aiQuestion/aiInsights、加 3 个交互方法 |

### 11 条洞察规则（`insightsFor`）

权重 = 跨了多少种数据源，跨数据的排前面。

| id | 跨的数据 | 权重 | 触发条件 |
|---|---|---|---|
| `heavy-no-breakfast` | 课表 × 饮食 | 5 | 最累那天 ≥3 节课，且那天的饮食记录里没有早饭 |
| `heavy-sleep` | 课表 × 睡眠 | 5 | 最累那天睡眠比其它日子少 ≥0.8h（两边各 ≥2 条） |
| `heavy-no-run` | 课表 × 运动 | 4 | 最累那天 ≥4 节课，且运动记录里那天 0 次（总记录 ≥3） |
| `heavy-low-steps` | 课表 × 步数 | 4 | 最累那天平均步数 <4000（≥3 条步数记录） |
| `ddl-cluster` | 作业 × 课表 | 4 | 3 天内 ≥2 份作业到期 |
| `run-no-diet` | 运动 × 饮食 | 4 | ≥3 天运动、≥5 天饮食，两者零重合 |
| `heavy-day` | 课表 | 3 | 最累的一天 ≥3 节课 |
| `run-stale` | 运动 | 3 | 最近一次运动距今 ≥10 天 |
| `today-left` / `today-done` | 课表 | 2 | 今天还剩几节 / 上完了 |
| `weight-trend` | 体重 | 2 | 首末差 ≥1.5kg |
| `todo-pile` | 待办 | 2 | 未完成 ≥5 条 |

### 问答推进（`nextQuestion`）

顺序：**课表 → 早饭 → 运动 → 完毕**。

- 有真实饮食记录时**跳过**「早饭」这一问（真实数据优先，不再烦用户）
- 答过的题记在 `settings.aiAnswers`，不重复问
- 返回 `{ step, title, body, input, options? }`，`input` 取值：`paste-course` / `choice` / `none`

### dashboard 交互方法

- `aiPasteCourse()` → `navigateTo` 到 `/pages/coursescan/coursescan?from=ai`
- `aiManualCourse()` → **只能** `switchTab`（课表是 tabBar 页，`navigateTo` 会静默失败）
- `aiAnswer(e)` → 写 `store.setSettings({ aiAnswers })`

## 两条必须遵守的设计原则（写在 insight.js 顶部注释里）

1. **洞察必须跨数据。** "你今天有 3 节课"没有价值，用户自己也知道。
   只有"周三课多 + 没吃早饭"这种组合才是只有工具能发现的。
2. **每答必给回报。** 回答任何一步后立刻看到新洞察，而不是"已保存"。

## ⚠️ 2026-10-30 修复：「AI 卡片没有对话框」（已解决）

用户报的现象：**AI 卡片有框、里面一个字都没有、也没有按钮。**

**根因**：`dashboard.wxml` 里 AI 区读的是裸键 `{{aiQuestion}}`，但这个页面是
**tabHost 宿主页**——`dashboard.js` 的 `DEFINITION` 会被 `buildHost` 用
`dashboard_` 前缀并入宿主 data（`utils/tabHost.js` 的 `prefixKeys` / `makeView`），
真实键叫 `dashboard_aiQuestion`。裸键永远是 `undefined`：

- `wx:if="{{aiQuestion.step !== 'done'}}"` → `undefined !== 'done'` 为真 → 卡片壳子渲染
- 里面每个 `{{aiQuestion.xxx}}` → 空字符串

所以看到的是「一个空框」，点也没用（`bindtap="aiAnswer"` 也不存在，真名是
`dashboard_aiAnswer`，这个错误在控制台完全没有报错，属于静默失败）。

**修法**：WXML 里所有 AI 相关引用（含 3 个 `bindtap` 处理器）统一加 `dashboard_` 前缀。

**为什么之前 440 条自测全过**：自测跑的是 **JS 层**，JS 层两个键都在、都对。
只有「把 WXML 引用的根标识符和真实 data 键对一遍」才能发现 → 见下面新增的 `[35]`。

**顺带发现的真 bug**：`healthhub.wxml` 的「历史记录 · {{historyTotal}} 天」同样写错了
（应为 `{{diet_historyTotal}}`，数据在 `diet/def.js:234`），已修。
`diet.wxml` 里同样的写法是**对的**，因为它是独立页面的模板，不需要前缀。

**新增防护**：`selftest.js` 的 `[35] 合并页的 WXML 只读带前缀的 data 键`。
它真跑一遍宿主页、把所有分段都切一遍拿到完整 data 键集合，再与 WXML 里的根标识符比对。
已验证：把前缀改回裸键，它会精确报出 `缺少: aiGreeting, aiQuestion, aiInsights`。

### tabHost 合并页写 WXML 的三条铁律

1. **data 键必须带前缀**：总览 `dashboard_*`、待办/作业 `todos_*` / `assignments_*`、
   健康 `diet_*` / `run_*` / `health_*`。唯一例外是宿主的 `themeClass` 和 `seg`。
2. **事件处理器同样带前缀**：`bindtap="dashboard_aiAnswer"`，写成裸 `aiAnswer` 会静默无反应。
3. **写错不会报错**，只会渲染成空——所以一定要靠 `[35]` 这类静态比对兜底。

## 已验证（2026-10-30 真机前，模拟器实测）

```
node miniprogram/tools/selftest.js "$PWD/miniprogram"     → 446 通过 / 0 失败
python <skill>/validate_miniprogram_artifacts.py <mp目录>  → PASS (0 errors, 0 warnings)
node miniprogram/tools/check-handlers.js <mp目录>          → 所有处理器都有方法
WXML/WXSS 配平检查                                         → 通过
```

**模拟器实测（L3，微信开发者工具，已由 agent 通过 CLI 实际操作）**：
首页 AI 对话区能渲染、「课表→早饭→运动→有数了」四步问答链能真实点击推进、
每步之后洞察同步更新（注入了 6 门课测试数据，验证完已清空还原）。

**如何操作开发者工具**（工具在 `D:\webcast_mate`，不要在 `D:\Comprehensive AIization` 找）：

```powershell
$c = 'D:\webcast_mate\wechatide.cmd'   # 这是命令行版，支持截图/点击/读 console
& $c -c dsh check_wechatide_status
& $c -c dsh open_project_window --project 'D:\Comprehensive AIization\miniprogram' --window-mode fullMode
& $c -c dsh simulator_screenshot --project 'D:\Comprehensive AIization\miniprogram' --path shot.png --optimize false
& $c -c dsh get_simulator_console --project '...' --command 'grep -n .'
& $c -c dsh automation_element_action --project '...' --action tap --selector '.ai-choice'
```

⚠️ **`automation_evaluate` 的三个坑**（踩过，会浪费很多时间）：
- 它走 `.cmd` 包装，**双引号会被 shell 吃掉** → 代码里只用单引号；
- **多行代码会解析失败**（`Unexpected token ')'`）→ 必须写成单行；
- 运行时里 **`require('../../store/store')` 不可用**，用 `getApp().globalData.store` 拿单例。

**规则测试**（手工跑的临时脚本，未入库）覆盖了 7 个用例，确认：
- 数据不够时**不会**误报
- 跨数据洞察排序正确
- 问答链能正确推进

**⚠️ 未验证：真机效果。** 模拟器（L3）已实测通过，但真机、iPhone、安卓三种机型还没看过。

## 已知未做 / 待办

1. **版本号仍是 1.1.0** —— 用户说看完再升。升版要同时改：
   `miniprogram/version.js` + `CHANGELOG.md` 顶部 + `git tag`（然后 `gh release create`）
2. **未提交** —— 8 个文件还在工作区（4 个 v1.2.0 改动 + selftest + healthhub 修复
   + progress.md + 本交接文档），等用户看过模拟器效果再决定
3. **真机验证** —— 用户说真机调试扫码会让开发者工具崩溃（工具侧故障，
   见 README「已知限制」），**用「预览」代替**

## 模拟器里看到、但还没改的观感问题（用户未表态，先记下）

- `--text-4`（`#64748b`）在深色卡片 `#1a1f28` 上的对比度约 3.3:1，不到 WCAG AA 的 4.5:1。
  `.ai-greet`（「下午好」那行）用的就是它，看起来偏暗。整个主题体系里 `--text-4` 都偏暗，
  要改得连着改 token，不是单点改 `.ai-greet` 的事。

## 下一步可选方向（用户还没选）

- **时间维度**：连续几周周三都很忙 → "你的周三一直是最累的"
- **课表空档**：发现 >2 小时空档 → "周三中午有 2 小时空档"
- **作业提前量**：总在 DDL 前一天做 → "这学期有 4 次是最后一晚赶的"
- **饮食规律**：记录时间分布 → "你晚饭经常 21 点后才吃"

## 环境要点

- 仓库：`D:\Comprehensive AIization`，小程序在 `miniprogram/` 子目录（**不是仓库根**）
- 基础库 3.17.4，WebView 渲染器（未启用 Skyline），AppID `wx7e834512568ff8f4`
- 改版前备份在 `miniprogram.bak_v101/`（已被 .gitignore 排除）
- 项目状态记录在 `docs/miniapp/`（progress.md / decisions.md / version-change.md）
- **自测很管用**：它抓到过一次我把 tabBar 页写成 `navigateTo` 的真实 bug

## 给新对话的开场建议

直接说：

> 读 `docs/miniapp/HANDOVER-v1.2.0.md`，这是上次对话的交接。
> 我看了效果，[描述看到的问题 / 或"没问题，请升版本提交"]。

## 一个历史教训（避免重犯）

上次我把开发者工具的 `无效的 page.json ["enableShareTimeline"]` 当成了要修的问题，
删了 2 个页面的字段，结果自测挂了 2 条。**那是工具的误报**——它对全部 16 个页面都报，
但基础库认识这个字段、分享功能正常，而且 `selftest.js` 要求所有页面都必须有。

**教训：工具的警告不一定是对的，先用 selftest 和实际行为交叉验证再改。**
