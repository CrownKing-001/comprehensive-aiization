# -*- coding: utf-8 -*-
"""
生成「大学日程」小程序头像。

设计约束（这是整个脚本存在的理由）：
  1. 微信里同一个头像会被**圆形裁切**（搜索、个人页、会话）也会被**方形裁切**
     （部分列表、分享卡片），所以不能做「圆形贴图 + 透明四角」——
     那样方形裁切后四角是空的。
  2. 因此背景必须**满幅出血**，而所有有意义的图形必须落在**内切圆**里：
     边长 1024 的画布，内切圆半径 512；一个居中的边长 W 的方形，
     半对角线 W*√2/2 必须 ≤ 512 → W ≤ 724。本图日历主体取 600（58.6%），
     连顶上的挂环一起算，最远点离中心约 367，留了充足余量。
  3. 要能在 40px 下仍认得出，所以只有一种形状（日历）+ 一个符号（对勾），
     不堆细节。
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.dirname(os.path.abspath(__file__))
S = 1024                      # 成品边长
SS = 3                        # 图形层超采样倍数（先画大再缩小 = 抗锯齿）
N = S * SS

# 图形层坐标一律按 1024 空间写，用这个乘到超采样空间
def k(v):
    return v * SS


def rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# ── 1. 背景：垂直渐变 + 中心翠绿辉光（直接按成品尺寸算，不需要超采样）──
top_c = np.array(rgb('12203a'), dtype=np.float32)
bot_c = np.array(rgb('080d15'), dtype=np.float32)
t = np.linspace(0.0, 1.0, S, dtype=np.float32).reshape(S, 1, 1)
bg = top_c.reshape(1, 1, 3) * (1 - t) + bot_c.reshape(1, 1, 3) * t
bg = np.repeat(bg, S, axis=1)

xg, yg = np.meshgrid(np.arange(S, dtype=np.float32), np.arange(S, dtype=np.float32))
r = np.sqrt((xg - S / 2.0) ** 2 + (yg - S / 2.0) ** 2) / (S / 2.0)
glow = np.clip(1.0 - r / 1.05, 0.0, 1.0) ** 2.6 * 0.44
bg = bg * (1 - glow[..., None]) + np.array(rgb('10b981'), dtype=np.float32) * glow[..., None]
# 四角再压暗一点，圆切之后中心更聚焦
vig = np.clip(r, 0.0, 1.4)
bg *= (1.0 - 0.30 * np.clip(vig - 0.50, 0, 1) / 0.90)[..., None]
base = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8), 'RGB')

# ── 2. 图形层（RGBA，超采样）──
L = Image.new('RGBA', (N, N), (0, 0, 0, 0))
d = ImageDraw.Draw(L)

# 日历主体几何
X0, X1 = k(212), k(812)
Y0, Y1 = k(244), k(784)
RAD = k(86)
HDR = k(142)                       # 顶部色带高度

# 投影：让日历从暗背景里浮起来（暗底上纯黑阴影很弱，主要是给边缘一点厚度）
sh = Image.new('L', (N, N), 0)
ImageDraw.Draw(sh).rounded_rectangle(
    [X0, Y0 + k(18), X1, Y1 + k(26)], radius=RAD, fill=105)
L.paste((0, 0, 0), (0, 0), sh.filter(ImageFilter.GaussianBlur(k(24))))

# 主体：翠绿竖向渐变
col = Image.new('RGB', (1, N))
ct, cb = np.array(rgb('3ddc97'), dtype=np.float32), np.array(rgb('059669'), dtype=np.float32)
for y in range(N):
    f = min(max((y - Y0) / float(Y1 - Y0), 0.0), 1.0)
    px = ct * (1 - f) + cb * f
    col.putpixel((0, y), tuple(int(v) for v in px))
body_grad = col.resize((N, N), Image.NEAREST)

mask = Image.new('L', (N, N), 0)
ImageDraw.Draw(mask).rounded_rectangle([X0, Y0, X1, Y1], radius=RAD, fill=255)
L.paste(body_grad, (0, 0), mask)

# 顶部色带：同样圆角，底边抹平（下半截本来就在主体内）
hcol = Image.new('RGB', (1, N))
ht, hb = np.array(rgb('06926a'), dtype=np.float32), np.array(rgb('04553d'), dtype=np.float32)
for y in range(N):
    f = min(max((y - Y0) / float(HDR), 0.0), 1.0)
    px = ht * (1 - f) + hb * f
    hcol.putpixel((0, y), tuple(int(v) for v in px))
hdr_grad = hcol.resize((N, N), Image.NEAREST)

hmask = Image.new('L', (N, N), 0)
hd = ImageDraw.Draw(hmask)
hd.rounded_rectangle([X0, Y0, X1, Y0 + HDR], radius=RAD, fill=255)
hd.rectangle([X0, Y0 + HDR - RAD, X1, Y0 + HDR], fill=255)     # 底边抹平
L.paste(hdr_grad, (0, 0), hmask)

# 挂环：两条圆头白条，从顶边伸出去。
# 环心对称落在 512±152 —— 这里必须是环心，别写成「左边缘 + 半宽」，
# 那样两条环会分别偏左 129 和偏右 175，肉眼一眼就不平衡。
RING_Y0, RING_Y1 = k(150), k(312)
RING_W = k(52)
for cx in (k(360), k(664)):
    d.rounded_rectangle(
        [cx - RING_W / 2, RING_Y0, cx + RING_W / 2, RING_Y1],
        radius=RING_W / 2, fill=rgb('f1f5f9') + (255,),
    )
# 色带要盖住挂环插进日历的那一截（否则环会压在色带上，看着像贴纸）
L.paste(hdr_grad, (0, 0), hmask)

# 对勾：粗圆头折线
CHK_W = k(64)
pts = [(k(393), k(592)), (k(479), k(678)), (k(631), k(498))]
white = rgb('ffffff') + (255,)
d.line(pts, fill=white, width=CHK_W, joint='curve')
for p in (pts[0], pts[-1]):        # line() 的端点是平头，补圆帽
    d.ellipse([p[0] - CHK_W / 2, p[1] - CHK_W / 2, p[0] + CHK_W / 2, p[1] + CHK_W / 2], fill=white)

# ── 3. 合成 ──
glyph = L.resize((S, S), Image.LANCZOS)
out = base.convert('RGBA')
out.alpha_composite(glyph)
out = out.convert('RGB')

# ── 3b. 自检：图形最远点是否真的落在内切圆里 ──
# 背景层 base 就是「不画图形」的同一张底，逐像素求差即得图形掩膜。
_diff = np.abs(
    np.array(out, dtype=np.int16) - np.array(base.convert('RGB'), dtype=np.int16)
).sum(axis=2)
_ys, _xs = np.nonzero(_diff > 14)
_rad = np.sqrt((_xs - S / 2.0) ** 2 + (_ys - S / 2.0) ** 2)
_maxr = float(_rad.max())
print('  图形最远点离中心 %.0f px，内切圆半径 %d px，余量 %.1f%%' %
      (_maxr, S // 2, (1 - _maxr / (S / 2.0)) * 100))
assert _maxr < S / 2.0, '图形越出内切圆，圆形裁切会被切到'

for size in (1024, 512, 256, 144, 96, 48):
    out.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, 'avatar-%d.png' % size))

# ── 4. 预览：圆形 / 方形 / 小尺寸 ──
def circle(im, size):
    m = Image.new('L', (size * 4, size * 4), 0)
    ImageDraw.Draw(m).ellipse([0, 0, size * 4 - 1, size * 4 - 1], fill=255)
    m = m.resize((size, size), Image.LANCZOS)
    o = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    o.paste(im.resize((size, size), Image.LANCZOS), (0, 0), m)
    return o

def squircle(im, size, rad=0.23):
    m = Image.new('L', (size * 4, size * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle(
        [0, 0, size * 4 - 1, size * 4 - 1], radius=int(size * 4 * rad), fill=255)
    m = m.resize((size, size), Image.LANCZOS)
    o = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    o.paste(im.resize((size, size), Image.LANCZOS), (0, 0), m)
    return o

FONT = None
for fp in (r'C:\Windows\Fonts\msyh.ttc', r'C:\Windows\Fonts\msyhbd.ttc', r'C:\Windows\Fonts\simhei.ttf'):
    if os.path.exists(fp):
        try:
            from PIL import ImageFont
            FONT = ImageFont.truetype(fp, 26)
            FONT_S = ImageFont.truetype(fp, 20)
            break
        except Exception:
            pass

LIGHT = (244, 246, 250)
DARK = (18, 22, 30)
PW, PH = 900, 660
pv = Image.new('RGB', (PW, PH), LIGHT)
d = ImageDraw.Draw(pv)

def label(txt, x, y, fill=(90, 98, 112), f=None):
    if FONT:
        d.text((x, y), txt, font=f or FONT, fill=fill)

# 上半：大图，圆形 + 方形，分别铺在浅底和深底上
big = 200
label('圆形裁切（浅色底）', 96, 76)
pv.paste(circle(out, big), (96, 112), circle(out, big))
label('圆形裁切（深色底）', 356, 76)
d.rectangle([356, 112, 356 + big, 112 + big], fill=DARK)
pv.paste(circle(out, big), (356, 112), circle(out, big))
label('方形裁切', 616, 76)
pv.paste(squircle(out, big), (616, 112), squircle(out, big))

# 下半：小尺寸一排
label('小尺寸实际显示效果（40 / 64 / 96）', 96, 366)
x = 96
for size in (96, 64, 40):
    y = 410 + (96 - size) // 2
    pv.paste(circle(out, size), (x, y), circle(out, size))
    pv.paste(squircle(out, size), (x + 116, y), squircle(out, size))
    x += 232

# 深色底再放一排，确认暗色环境下边缘不糊
d.rectangle([0, 540, PW, PH], fill=DARK)
label('深色环境下的小尺寸', 96, 566, fill=(150, 158, 172))
x = 96
for size in (96, 64, 40):
    y = 604 + (96 - size) // 2
    pv.paste(circle(out, size), (x, y), circle(out, size))
    pv.paste(squircle(out, size), (x + 116, y), squircle(out, size))
    x += 232

pv.save(os.path.join(OUT, 'avatar-preview.png'))

print('  ✓ 已生成：')
for f in sorted(os.listdir(OUT)):
    if f.endswith('.png'):
        p = os.path.join(OUT, f)
        with Image.open(p) as im:
            print('      %-24s %-11s %6.1f KB' % (f, '%dx%d' % im.size, os.path.getsize(p) / 1024.0))
