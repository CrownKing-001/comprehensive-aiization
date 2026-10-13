# 页面预览工具

把小程序页面静态渲染成 HTML，用于**在无法截取模拟器时目视核对布局**。

## 为什么需要它

微信开发者工具的自动化截图接口需要一个 token，该 token 只能在 IDE 的
「设置 → 安全设置 → 服务端口」里手动开启并复制，Agent 无法获取。
`cli auto --trust-project` 会返回成功，但调试输出显示
`ws connect ... without token`，随后的 WebSocket 连接会被服务端立即关闭。
因此截图只能由人来做，或退而求其次用本工具做近似核对。

## 用法

```powershell
node tools/preview-pages.js . ../miniprogram-preview
# 再用无头 Edge 渲染成 PNG
& "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe" `
  --headless=new --disable-gpu --hide-scrollbars `
  --window-size=400,2400 --screenshot="out/dashboard.png" `
  "file:///<绝对路径>/dashboard.html"
```

## 已知近似项（这些**不是**真实渲染结果）

| 项目 | 处理方式 |
| --- | --- |
| `{{表达式}}` | 一律渲染成占位符 `··` |
| `wx:for` | 不展开，只渲染一次 |
| `wx:if` / `wx:else` | 只保留主分支，`else` 分支整段丢弃 |
| `rpx` | 按 `750rpx = 375px` 折算 |
| `scroll-view` | 不滚动，按普通容器渲染 |
| `canvas` | 用固定高度占位块 |
| `input` / `textarea` / `switch` | 用占位元素 |

所以**看到的一切疑问都要回到源码确认**：
本工具自己就制造过两个假象 ——
`wx:if` 里的 `>` 让属性清理漏掉一截，渲染出 `0)]">`；
`wx:else` 分支没丢弃，`analysis` 页看起来有两张同标题的卡片。
两次都是转换器的问题，源码本身是干净的。
