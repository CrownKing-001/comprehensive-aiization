# 生成 tabBar 图标（普通态 + 选中态）。
#
# 微信 tabBar 的 iconPath 必须是本地图片文件（不支持字体图标/SVG），
# 建议 81×81 px。这里用 Pillow 画 5 组共 10 张 PNG：
#   总览 / 今日 / 课表 / 待办·作业 / 健康
#
# 配色跟 app.json 里的 tabBar 一致：
#   普通态 #64748b，选中态 #10b981
#
# 用法: python tools/make-tab-icons.py

import os
from PIL import Image, ImageDraw

SIZE = 81
NORMAL = (100, 116, 139)   # #64748b
ACTIVE = (16, 185, 129)    # #10b981

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'images', 'tab')


def canvas():
    # 4 倍超采样再缩回来，边缘更干净
    return Image.new('RGBA', (SIZE * 4, SIZE * 4), (0, 0, 0, 0))


def finish(img, name):
    img = img.resize((SIZE, SIZE), Image.LANCZOS)
    os.makedirs(OUT, exist_ok=True)
    img.save(os.path.join(OUT, name + '.png'))
    return name


def rr(d, box, r, **kw):
    d.rounded_rectangle(box, radius=r, **kw)


def ellipse(d, box, **kw):
    d.ellipse(box, **kw)


# ── 总览：四宫格 ──
def dashboard(c):
    img = canvas(); d = ImageDraw.Draw(img)
    s = SIZE * 4
    pad, gap = s * 0.16, s * 0.09
    w = (s - pad * 2 - gap) / 2
    for i in range(2):
        for j in range(2):
            x = pad + j * (w + gap)
            y = pad + i * (w + gap)
            rr(d, (x, y, x + w, y + w), r=w * 0.22, fill=c)
    return img


# ── 今日：日历 ──
def today(c):
    img = canvas(); d = ImageDraw.Draw(img)
    s = SIZE * 4
    pad = s * 0.16
    top = s * 0.26
    rr(d, (pad, top, s - pad, s - pad), r=s * 0.09, outline=c, width=int(s * 0.055))
    # 两个挂钩
    for x in (s * 0.33, s * 0.67):
        d.line((x, s * 0.13, x, top + s * 0.02), fill=c, width=int(s * 0.055))
    # 标题栏分隔 + 一个「今天」的点
    d.line((pad, top + s * 0.14, s - pad, top + s * 0.14), fill=c, width=int(s * 0.045))
    ellipse(d, (s * 0.44, s * 0.56, s * 0.56, s * 0.68), fill=c)
    return img


# ── 课表：表格 ──
def courses(c):
    img = canvas(); d = ImageDraw.Draw(img)
    s = SIZE * 4
    pad = s * 0.15
    rr(d, (pad, pad, s - pad, s - pad), r=s * 0.08, outline=c, width=int(s * 0.052))
    lw = int(s * 0.045)
    d.line((s * 0.5, pad, s * 0.5, s - pad), fill=c, width=lw)
    d.line((pad, s * 0.5, s - pad, s * 0.5), fill=c, width=lw)
    return img


# ── 待办·作业：清单 + 勾 ──
def tasks(c):
    img = canvas(); d = ImageDraw.Draw(img)
    s = SIZE * 4
    lw = int(s * 0.062)
    x0 = s * 0.30
    for i, y in enumerate((0.28, 0.5, 0.72)):
        d.line((x0, s * y, s * 0.84, s * y), fill=c, width=lw)
        if i < 2:
            # 前两条打勾
            d.line((s * 0.13, s * (y - 0.02), s * 0.19, s * (y + 0.045)), fill=c, width=int(s * 0.05))
            d.line((s * 0.19, s * (y + 0.045), s * 0.28, s * (y - 0.06)), fill=c, width=int(s * 0.05))
        else:
            ellipse(d, (s * 0.14, s * (y - 0.035), s * 0.22, s * (y + 0.045)), outline=c, width=int(s * 0.045))
    return img


# ── 健康：心 ──
# 心形和其他图标视觉重量对齐：笔画类图标占约 70% 画布，
# 实心心形要相应缩小一圈，否则在小尺寸下显得比邻居大一块。
def health(c):
    img = canvas(); d = ImageDraw.Draw(img)
    s = SIZE * 4
    r = s * 0.20
    cx = s * 0.5
    top = s * 0.235
    ellipse(d, (cx - r * 2.0, top, cx, top + r * 2), fill=c)
    ellipse(d, (cx, top, cx + r * 2.0, top + r * 2), fill=c)
    d.polygon([(cx - r * 1.90, top + r * 0.86), (cx + r * 1.90, top + r * 0.86), (cx, top + r * 3.10)], fill=c)
    return img


ICONS = {
    'dashboard': dashboard,
    'today': today,
    'courses': courses,
    'tasks': tasks,
    'health': health,
}


def main():
    made = []
    for name, fn in ICONS.items():
        made.append(finish(fn(NORMAL), name))
        made.append(finish(fn(ACTIVE), name + '-on'))
    print('生成 %d 个图标 → %s' % (len(made), os.path.normpath(OUT)))
    for m in made:
        print('  ' + m + '.png')


if __name__ == '__main__':
    main()
