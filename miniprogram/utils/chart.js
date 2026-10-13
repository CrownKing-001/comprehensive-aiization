// 趋势曲线绘制：体重 / 睡眠共用同一套坐标与样式，避免两处各画一遍。
//
// 桌面版用 SVG，小程序改用 Canvas 2D（type="2d" 接口）。
//
// 设计取舍（沿用桌面版）：
//  · 只画最近 N 条，横轴按「记录条数」等距排布 —— 因为记录是零散的，
//    按真实日期比例画会让中间的空档挤成一团，看不出趋势；
//  · 目标线画成虚线，让「今天够不够」一眼可读；
//  · y 轴上下各留 0.5 的余量，避免点在边缘被裁掉。
//
// 移植自桌面版 src/components/TrendChart.tsx

const W = 560;
const H = 140;
const PAD = 26;

/**
 * 在 canvas 上画趋势折线。
 * @param {object} canvas  canvas 节点（type="2d"）
 * @param {object} opts    { points, color, target, targetLabel, unit, warnBelow }
 *                         points: [{ date: 'YYYY-MM-DD', value: number }]
 */
function drawTrend(canvas, opts) {
  const points = opts.points || [];
  if (points.length < 2) return;

  const dpr = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio || 2 : 2;
  const ctx = canvas.getContext('2d');
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const color = opts.color || '#10b981';
  const target = opts.target;
  const vs = points.map((p) => p.value);

  // 把目标线也纳入取值范围，否则目标线可能跑到图外
  const all = target !== undefined ? [...vs, target] : vs;
  const min = Math.min(...all) - 0.5;
  const max = Math.max(...all) + 0.5;

  const X = (i) => PAD + (i * (W - PAD * 2)) / (points.length - 1);
  const Y = (v) => H - PAD - ((v - min) / (max - min || 1)) * (H - PAD * 2);

  // ── 目标线（虚线） ──
  if (target !== undefined) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(PAD, Y(target));
    ctx.lineTo(W - PAD, Y(target));
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.75;
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(opts.targetLabel || `目标 ${target}${opts.unit || ''}`, W - PAD, Y(target) - 4);
    ctx.restore();
  }

  // ── 折线 ──
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  points.forEach((p, i) => {
    const px = X(i);
    const py = Y(p.value);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.restore();

  // ── 数据点 + 文字 ──
  // 点太密时只显示首尾与关键点的数值，避免文字互相压叠
  const dense = points.length > 10;
  points.forEach((p, i) => {
    const px = X(i);
    const py = Y(p.value);
    const low = opts.warnBelow && target !== undefined && p.value < target;

    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = low ? '#f43f5e' : color;
    ctx.fill();

    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7c8a9c';
    const label = dense ? (i % 2 === 0 ? p.date.slice(5) : '') : p.date.slice(5);
    if (label) ctx.fillText(label, px, H - 8);

    const showValue = !dense || i === 0 || i === points.length - 1;
    if (showValue) {
      ctx.fillStyle = low ? '#fb7185' : color;
      ctx.fillText(String(p.value), px, py - 8);
    }
  });
}

/**
 * 在页面里初始化一个趋势图。
 * 用法：在 onReady 里调用 initChart(this, 'weightCanvas', () => points, opts)。
 * data 变化后调用返回的 redraw() 重画。
 */
function initChart(page, id, getOpts) {
  const query = wx.createSelectorQuery().in(page);
  query
    .select(`#${id}`)
    .fields({ node: true, size: true })
    .exec((res) => {
      const node = res && res[0] && res[0].node;
      if (!node) return;
      page[`_canvas_${id}`] = node;
      drawTrend(node, getOpts());
    });
}

/** 重画已初始化的图表 */
function redrawChart(page, id, getOpts) {
  const node = page[`_canvas_${id}`];
  if (!node) return;
  drawTrend(node, getOpts());
}

/** 曲线下方的一句话小结 */
function trendSummary(points, target) {
  if (!points || points.length === 0) return null;
  const avg = points.reduce((s, p) => s + p.value, 0) / points.length;
  const hit = points.filter((p) => p.value >= target).length;
  return {
    avgText: avg.toFixed(1),
    hit,
    total: points.length,
    ok: avg >= target,
  };
}

module.exports = { drawTrend, initChart, redrawChart, trendSummary };
