// ui-icon —— 全站统一的矢量图标。
//
// ── 为什么要有这一层 ────────────────────────────────────────────
// v1.1.x 及以前，图标是**直接写进 WXML 的 emoji 字面量**（🗓️ ⏰ ✅ …），
// 一共 100+ 处。问题不是「好不好看」，而是它根本画不稳：
//
//   · 彩色 emoji 是按 1em 的 ~1.17 倍绘制的，且基线由系统字体决定；
//   · 图标底座 .icon-chip 是 width/height 定高的盒子，
//     而 emoji 字形实际高度经常超过盒子高度 → 字形**上下溢出**，
//     压到同一行右侧的标题文字上。用户看到的就是「UI 重叠」。
//   · 更麻烦的是每个机型、每套系统字体的 emoji 尺寸都不一样，模拟器上
//     看着没事，真机就错位 —— 这类问题无法靠微调像素值根治。
//
// 微信官方设计指南 5.6「图标」要求图标与控件尺寸对齐、用矢量而非位图。
// 所以这里统一换成 WeUI 官方的 mp-icon：它用 SVG + mask 绘制，
// 尺寸由 size 属性精确控制到 px，颜色由 color 控制，**不依赖系统字体**。
//
// ── ⚠️ 语义名 ≠ WeUI 图标名 ────────────────────────────────────
// WXML 里写的是**语义名**（tasks / meal / run / clock …），它表达「这块
// 内容是什么」，跟具体用哪个图形无关。真正的图形名由 utils/ui-icon.js
// 的 ICON_MAP 决定，在这里解析。
//
// 为什么不直接在 WXML 里写 WeUI 名：WeUI 只有 63 个图标，缺很多业务语义
// （没有「日历」，没有「体重」，没有「跑步」）。把「缺图形」这件事挡在
// 映射表里，将来换图标库只改那一个文件，16 个页面不用动。
//
// ⚠️ **绝不能把语义名直接透传给 mp-icon**。WeUI 查不到这个名字时不会报错，
// 而是把 src 留空 —— 渲染结果是 `mask-image:url()` 的空 view，页面上什么
// 都不显示，控制台一片安静。这类静默失败最难查（已经踩过一次）。

const { resolveName, resolveVariant, isKnown } = require('./icons');

Component({
  properties: {
    /** 语义名，如 home / time / done / meal；也兼容直接写 WeUI 图标名 */
    name: { type: String, value: '' },

    /** 尺寸（px），默认 20，与 WeUI 组件一致 */
    size: { type: Number, value: 20 },

    /** 颜色，任意 CSS 颜色值；currentColor 表示跟随父元素文字色 */
    color: { type: String, value: '#94a3b8' },

    /** 变体：留空则按语义自动选（多数 outline，少数 filled） */
    variant: { type: String, value: '' },

    /**
     * 行内用法：写在文字/按钮文案前面时置 true。
     * 默认 false —— 作为块级元素放进定高底座（.icon-chip / .nav-icon）。
     */
    inline: { type: Boolean, value: false },
  },

  data: {
    // 解析后的真实值，供 WXML 使用
    iconName: '',
    iconVariant: 'outline',
  },

  // 用组合 observer 一次拿到 name + variant，避免两次 setData
  observers: {
    'name, variant': function (name, variant) {
      const semantic = name || '';
      if (!semantic) {
        this.setData({ iconName: '', iconVariant: 'outline' });
        return;
      }
      const resolved = resolveName(semantic);
      if (!isKnown(semantic)) {
        // 明确报出来，别让它变成一片空白
        console.warn(
          `[ui-icon] 未知图标语义「${semantic}」，WeUI 里没有对应图形。` +
            `请在 components/ui-icon/icons.js 的 ICON_MAP 里补一条。`
        );
      }
      this.setData({
        iconName: resolved,
        iconVariant: variant || resolveVariant(semantic),
      });
    },
  },
});