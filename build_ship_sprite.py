# -*- coding: utf-8 -*-
"""
build_ship_sprite.py — 프리깃 그림 한 장(두 척)을 게임용 스프라이트 두 장으로 굽는다.

들어오는 것 : frigate_sailing_ships.png
              마젠타 배경 위에 같은 배 두 척. 왼쪽은 돛을 폈고 오른쪽은 접었다.
              뱃머리가 위(-y)를 향한다.
나오는 것   : ship_sprite.js  (base64 로 박은 PNG 두 장 + 치수)
              ship_sprite_set.png / ship_sprite_furl.png  (눈으로 확인하는 용도)

이 프로젝트는 여태 바깥 그림 파일 없이 굴러왔다. 파일을 그대로 두고 불러오면
html 을 더블클릭해 열 때 브라우저 보안 규칙에 막힐 수 있어, cloud_data.js·
star_data.js 와 같은 방식으로 js 한 덩어리에 넣는다.

굽는 차례
  1. 마젠타를 뺀다 — 단순히 지우면 가장자리에 분홍 테두리가 남는다. 배경기
     얼마나 섞였는지로 투명도를 매기고(alpha), 남은 분홍끼를 역산해 뺀다.
  2. 두 척을 가른다 — 사이의 빈 골 한가운데에서 자른다.
  3. 용골선(가로 중심)과 선체 중심(세로)을 찾아 그 점이 그림 정중앙에 오도록
     같은 크기로 오려낸다. 중심이 어긋나면 돛을 접는 순간 배가 툭 튄다.
  4. 뱃머리가 +x 를 보도록 90도 돌린다 — 게임의 도형 배가 그 방향이다.
  5. 줄인다. 화면에서 배는 기본 33px, 최대로 키워도 145px 이므로 크게 둘 이유가 없다.
"""
import base64, io, sys
from PIL import Image

SRC        = 'frigate_sailing_ships.png'
OUT_JS     = 'ship_sprite.js'
OUT_SET    = 'ship_sprite_set.png'
OUT_FURL   = 'ship_sprite_furl.png'

# 배경은 순수 마젠타가 아니라 얼룩이 있다(초록 성분이 5~32까지 흔들린다).
# 그래서 문턱을 두 겹으로 둔다 — 분홍끼가 KEY_BG 몫 이상이면 무조건 배경으로 지우고,
# KEY_FG 몫 이하면 무조건 배를 살린다. 그 사이만 반투명 가장자리로 다룬다.
KEY_BG     = 0.70    # 분홍끼가 배경의 70% 이상 → 완전 투명
KEY_FG     = 0.25    # 분홍끼가 배경의 25% 이하 → 완전 불투명
MARGIN     = 3       # 오려낼 때 사방 여유 (px)
HULL_OUT   = 224     # 나온 그림 안에서 선체 길이가 몇 px 이 되게 할 것인가


# ---------------------------------------------------------------- 1. 마젠타 빼기
def load_and_key(path):
    """마젠타 배경을 투명으로 바꾼 RGBA 를 돌려준다.

    마젠타는 빨강과 파랑이 높고 초록이 낮다. 그래서 '분홍끼'를
        spill = (R+B)/2 - G
    로 재면, 순수 배경에서 가장 크고 배 위에서는 0 근처가 된다. 나무·천·밧줄
    어느 색도 R 과 B 가 G 보다 나란히 높지는 않기 때문이다.
    가장자리 화소는 배와 배경이 섞여 있으므로 spill 이 중간값을 갖는다 —
    그 비율이 곧 투명도다. 섞인 화소는 배경 몫을 역산해 빼야(decontaminate)
    분홍 테두리가 남지 않는다.
    """
    im = Image.open(path).convert('RGB')
    w, h = im.size
    src = im.load()

    # 배경색을 네 변에서 재어 평균낸다 (그림마다 조금씩 다르다)
    acc, n = [0, 0, 0], 0
    for x in range(0, w, 7):
        for y in (0, 1, h-2, h-1):
            c = src[x, y]
            acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; n += 1
    BG = tuple(v // n for v in acc)
    spill_bg = (BG[0] + BG[2]) / 2.0 - BG[1]
    if spill_bg < 40:
        sys.exit('배경이 마젠타로 보이지 않는다: %r' % (BG,))
    print('배경색 %r, 분홍끼 %.1f' % (BG, spill_bg))

    out = Image.new('RGBA', (w, h))
    dst = out.load()
    hi, lo = spill_bg * KEY_BG, spill_bg * KEY_FG
    for y in range(h):
        for x in range(w):
            r, g, b = src[x, y]
            spill = (r + b) / 2.0 - g
            a = (hi - spill) / (hi - lo)
            if a >= 1.0:
                dst[x, y] = (r, g, b, 255)
            elif a <= 0.0:
                dst[x, y] = (0, 0, 0, 0)
            else:
                # 섞인 화소 — 배경 몫을 빼고 남은 것이 배의 참색이다
                inv = 1.0 - a
                fr = (r - inv * BG[0]) / a
                fg = (g - inv * BG[1]) / a
                fb = (b - inv * BG[2]) / a
                dst[x, y] = (max(0, min(255, int(fr + .5))),
                             max(0, min(255, int(fg + .5))),
                             max(0, min(255, int(fb + .5))),
                             int(a * 255 + .5))
    return out


# ------------------------------------------------------- 2. 두 척 가르기 · 재기
ALPHA_ON = 24        # 이만큼 불투명하면 '배가 있다'로 친다

def columns_used(img, x0, x1):
    """[x0,x1) 안에서 배가 걸친 세로줄을 True 로 돌려준다."""
    px = img.load(); w, h = img.size
    used = [False] * w
    for x in range(x0, x1):
        for y in range(h):
            if px[x, y][3] >= ALPHA_ON:
                used[x] = True; break
    return used

def split_x(img):
    """두 배 사이의 가장 넓은 빈 골 한가운데를 돌려준다."""
    w, h = img.size
    used = columns_used(img, 0, w)
    best, run_s, best_len = None, None, 0
    for x in range(w):
        if not used[x]:
            if run_s is None: run_s = x
        elif run_s is not None:
            if x - run_s > best_len and run_s > 0:
                best_len, best = x - run_s, (run_s + x) // 2
            run_s = None
    if best is None:
        sys.exit('두 배를 가를 빈 골을 찾지 못했다')
    return best

def bbox(img, x0, x1):
    px = img.load(); w, h = img.size
    bx0, bx1, by0, by1 = x1, x0-1, h, -1
    for y in range(h):
        for x in range(x0, x1):
            if px[x, y][3] >= ALPHA_ON:
                if x < bx0: bx0 = x
                if x > bx1: bx1 = x
                if y < by0: by0 = y
                if y > by1: by1 = y
    return bx0, bx1, by0, by1


def keel_x(img, x0, x1, y0, y1):
    """용골선 — 배는 좌우 대칭이므로 줄마다 좌우 끝의 한가운데를 모아 중앙값을 쓴다.
    (평균이 아니라 중앙값인 것은, 돛 한두 장이 비뚜름해도 흔들리지 않게 하려는 것)"""
    px = img.load()
    mids = []
    for y in range(y0, y1 + 1):
        xs = [x for x in range(x0, x1) if px[x, y][3] >= ALPHA_ON]
        if xs: mids.append((xs[0] + xs[-1]) / 2.0)
    mids.sort()
    return mids[len(mids) // 2]

def hull_span(img, x0, x1, keel):
    """선체 몸통의 위·아래 끝 — 뱃머리 뾰족한 끝에서 선미 끝까지.

    몸통은 용골을 가로지르는 '한 덩어리로 이어진 통짜 가로줄'이다. 뱃머리 앞으로
    뻗은 활대와 선미 뒤의 키는 굵기가 10px 을 넘지 않아 걸리지 않고, 활대는 몸통
    위에 얹혀 있어 어차피 몸통의 y 범위 안이다. 뾰족한 끝은 폭이 0 으로 줄기 전까지
    세므로 HULL_MIN 을 작게 둔다."""
    HULL_MIN = 25
    px = img.load(); h = img.size[1]
    k = int(round(keel))
    solid = []
    for y in range(h):
        if not (x0 <= k < x1) or px[k, y][3] < ALPHA_ON:
            solid.append(False); continue
        a = k
        while a - 1 >= x0 and px[a - 1, y][3] >= ALPHA_ON: a -= 1
        b = k
        while b + 1 < x1 and px[b + 1, y][3] >= ALPHA_ON: b += 1
        solid.append((b - a + 1) >= HULL_MIN)
    best, s, bl = None, None, 0
    for y in range(h + 1):
        on = solid[y] if y < h else False
        if on and s is None: s = y
        elif not on and s is not None:
            if y - s > bl: bl, best = y - s, (s, y - 1)
            s = None
    if best is None:
        sys.exit('선체 몸통을 찾지 못했다')
    return best


# --------------------------------------------------------------- 3. 굽기
def main():
    img = load_and_key(SRC)
    w, h = img.size
    print('원본 %dx%d' % (w, h))

    cut = split_x(img)
    print('두 배를 가르는 x = %d' % cut)

    ships = {}
    for name, x0, x1 in (('set', 0, cut), ('furl', cut, w)):
        bx0, bx1, by0, by1 = bbox(img, x0, x1)
        k = keel_x(img, x0, x1, by0, by1)
        ships[name] = dict(x0=x0, x1=x1, box=(bx0, bx1, by0, by1), keel=k)
        print('%-4s 경계 x %d~%d  y %d~%d   용골 x %.1f' % (name, bx0, bx1, by0, by1, k))

    # 선체 몸통은 돛에 가리지 않은 '접은 배'에서 잰다. 두 배는 같은 붓질로 그려져
    # 세로로 이미 맞춰져 있으므로(아래에서 확인) 그 값을 양쪽에 함께 쓴다.
    f = ships['furl']
    hy0, hy1 = hull_span(img, f['x0'], f['x1'], f['keel'])
    hull_len = hy1 - hy0 + 1
    hull_cy = (hy0 + hy1) / 2.0
    print('선체 몸통 y %d~%d  길이 %d  중심 %.1f' % (hy0, hy1, hull_len, hull_cy))

    dtop = abs(ships['set']['box'][2] - ships['furl']['box'][2])
    dbot = abs(ships['set']['box'][3] - ships['furl']['box'][3])
    print('두 배의 위·아래 어긋남 %dpx / %dpx' % (dtop, dbot))
    if max(dtop, dbot) > 12:
        sys.exit('두 배가 세로로 어긋나 있다 — 같은 자리에 그려진 그림이 아니다')

    # 잘라낼 상자 — 어느 쪽 배든 다 담기도록 넉넉히, 그리고 중심에 대칭으로.
    half_w = half_h = 0
    for s in ships.values():
        bx0, bx1, by0, by1 = s['box']
        half_w = max(half_w, bx1 - s['keel'], s['keel'] - bx0)
        half_h = max(half_h, by1 - hull_cy, hull_cy - by0)
    half_w = int(half_w) + MARGIN
    half_h = int(half_h) + MARGIN
    print('오려낼 반크기  가로 %d  세로 %d' % (half_w, half_h))

    scale = HULL_OUT / float(hull_len)
    out_w = int(round(2 * half_w * scale))          # 돌리기 전 기준
    out_h = int(round(2 * half_h * scale))
    print('줄이는 비율 %.4f → 돌리기 전 %dx%d' % (scale, out_w, out_h))

    b64 = {}
    for name, path in (('set', OUT_SET), ('furl', OUT_FURL)):
        k = ships[name]['keel']
        box = (int(round(k - half_w)), int(round(hull_cy - half_h)),
               int(round(k + half_w)), int(round(hull_cy + half_h)))
        cut_im = img.crop(box)                       # 그림 밖은 투명으로 채워진다
        cut_im = cut_im.resize((out_w, out_h), Image.LANCZOS)
        # 뱃머리가 위(-y)에서 오른쪽(+x)으로 — 게임의 도형 배와 같은 방향
        cut_im = cut_im.transpose(Image.Transpose.ROTATE_270)
        cut_im.save(path)
        buf = io.BytesIO(); cut_im.save(buf, 'PNG', optimize=True)
        b64[name] = base64.b64encode(buf.getvalue()).decode('ascii')
        print('%-4s → %s  %dx%d  %.1f KB (base64 %.1f KB)'
              % (name, path, cut_im.width, cut_im.height,
                 len(buf.getvalue())/1024.0, len(b64[name])/1024.0))

    # 돌린 뒤의 치수 — 게임은 이것만 보고 그린다
    SW, SH = out_h, out_w                            # 90도 돌았으므로 뒤바뀐다
    hull_px = int(round(hull_len * scale))
    with open(OUT_JS, 'w', encoding='utf-8') as fp:
        fp.write('// 자동 생성 — build_ship_sprite.py 가 %s 에서 구웠다. 손대지 말 것.\n' % SRC)
        fp.write('// 뱃머리는 +x 를 본다. 그림 한가운데가 곧 선체 한가운데다.\n')
        fp.write('// w,h : 그림 크기(px)   hullLen : 그 안에서 선체 몸통의 길이(px)\n')
        fp.write('// 게임은 선체 길이가 29*shipScale 화면px 이 되도록 맞춰 그린다.\n')
        fp.write('const SHIP_SPRITE = {\n')
        fp.write('  w: %d, h: %d, hullLen: %d,\n' % (SW, SH, hull_px))
        fp.write("  set : 'data:image/png;base64,%s',\n" % b64['set'])
        fp.write("  furl: 'data:image/png;base64,%s'\n" % b64['furl'])
        fp.write('};\n')
    import os
    print('%s  %.1f KB   (그림 %dx%d, 선체 %dpx)'
          % (OUT_JS, os.path.getsize(OUT_JS)/1024.0, SW, SH, hull_px))

main()
