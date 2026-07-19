# build_stars.py - 예일 밝은 별 목록(BSC5) -> 1500년 하늘 -> star_data.js
# 실행: python build_stars.py
# 출처: Yale Bright Star Catalogue, 5th Revised Ed. (Hoffleit & Warren 1991)
#       하버드 TDC 배포본. 9110개, 맨눈으로 보이는 별을 거의 다 담고 있다.
#
# 바람·구름과 다른 점: 이건 시간에 따라 변하는 장이 아니라 고정된 목록이다.
# 대신 '언제의 하늘인가'를 정해야 한다. 별자리는 세차운동 때문에 천천히
# 미끄러지는데, 500년이면 7도쯤 된다. 눈에 띄는 차이다.
#
#   지금  북극성은 천구 북극에서 0.74도 떨어져 있다
#   1500년 그 거리가 3.5도였다 - 당시 항해사들이 표로 보정하던 값이다
#
# 자전운동(proper motion)은 넣지 않는다. 500년을 몰아도 가장 빠른 별이
# 0.3도쯤 움직일 뿐이라 화면에서 1픽셀도 안 되고, BSC5 의 단위 표기가
# 판본마다 갈려 잘못 넣을 위험이 이득보다 크다.
import base64, gzip, math, os, struct, urllib.request

URL = "http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "star_data.js")
CACHE = os.path.join(HERE, "star_raw.txt")

EPOCH = 1500.0            # 게임 시작 연도의 하늘로 고정한다
MAGLIM = 4.5              # 이보다 어두운 별은 버린다 (지도 위에 얹히므로)
MAG_MIN, MAG_STEP = -2.0, 0.05


def fetch():
    """받은 원문을 캐시에 둔다. 바람·구름 스크립트와 같은 방식."""
    if os.path.exists(CACHE) and os.path.getsize(CACHE) > 1000000:
        print("  cache hit: star_raw.txt")
        return open(CACHE, encoding="ascii", errors="replace").read()
    print("  downloading: bsc5.dat.gz ...")
    req = urllib.request.Request(URL, headers={"User-Agent": "build_stars.py"})
    with urllib.request.urlopen(req, timeout=180) as r:
        raw = r.read()
    txt = gzip.decompress(raw).decode("ascii", "replace")
    open(CACHE, "w", encoding="ascii", errors="replace").write(txt)
    print(f"  saved: star_raw.txt  {len(txt)} bytes (내려받기 {len(raw)} bytes)")
    return txt


def parse(txt):
    """BSC5 는 고정폭이다. 자리를 한 칸만 밀려 읽어도 조용히 엉뚱한 값이 나오므로
    아래 자리번호는 배포본 ReadMe 를 그대로 옮긴 것이다 (0부터 세는 값)."""
    out = []
    for ln in txt.splitlines():
        if len(ln) < 107:
            continue
        try:
            rh, rm, rs = int(ln[75:77]), int(ln[77:79]), float(ln[79:83])
            sgn = -1.0 if ln[83] == "-" else 1.0
            dd, dm, ds = int(ln[84:86]), int(ln[86:88]), int(ln[88:90])
            mag = float(ln[102:107])
        except ValueError:
            continue                      # 위치가 빈 항목 (신성 등) — 건너뛴다
        ra = (rh + rm/60 + rs/3600) * 15.0            # 시각 -> 도
        dec = sgn * (dd + dm/60 + ds/3600)
        name = ln[4:14].strip()
        out.append((ra, dec, mag, name))
    return out


def precess(ra, dec, year):
    """J2000 좌표를 다른 해의 좌표로 옮긴다 (Meeus 21장, IAU 1976).
    지구 자전축이 26000년에 한 바퀴 도는 것을 셈에 넣는 것이다."""
    T = (year - 2000.0) / 100.0
    S = math.pi / 180.0 / 3600.0                      # 초각 -> 라디안
    zeta = (2306.2181*T + 0.30188*T*T + 0.017998*T**3) * S
    z    = (2306.2181*T + 1.09468*T*T + 0.018203*T**3) * S
    th   = (2004.3109*T - 0.42665*T*T - 0.041833*T**3) * S
    a, d = math.radians(ra), math.radians(dec)
    A = math.cos(d) * math.sin(a + zeta)
    B = math.cos(th)*math.cos(d)*math.cos(a + zeta) - math.sin(th)*math.sin(d)
    C = math.sin(th)*math.cos(d)*math.cos(a + zeta) + math.cos(th)*math.sin(d)
    ra2 = (math.degrees(math.atan2(A, B) + z)) % 360.0
    dec2 = math.degrees(math.asin(max(-1.0, min(1.0, C))))
    return ra2, dec2


def sep(ra1, d1, ra2, d2):
    """두 점 사이의 각거리(도) — 확인용."""
    a1, b1, a2, b2 = map(math.radians, (ra1, d1, ra2, d2))
    c = (math.sin(b1)*math.sin(b2) +
         math.cos(b1)*math.cos(b2)*math.cos(a1-a2))
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def main():
    print("[1/4] 다운로드")
    txt = fetch()

    print("[2/4] 파싱")
    allst = parse(txt)
    print(f"      읽은 별 {len(allst)}개")
    # 자리번호가 맞는지 밝은 별 몇 개로 확인한다. 하나라도 어긋나면 여기서 걸린다.
    KNOWN = [("시리우스", 101.287, -16.716, -1.46), ("카노푸스", 95.988, -52.696, -0.72),
             ("베가",     279.234, 38.784,  0.03), ("북극성",   37.955,  89.264,  1.97)]
    for nm, ra0, dec0, m0 in KNOWN:
        best = min(allst, key=lambda s: sep(s[0], s[1], ra0, dec0))
        d = sep(best[0], best[1], ra0, dec0)
        ok = "OK  " if (d < 0.02 and abs(best[2]-m0) < 0.1) else "이상"
        print(f"      {ok} {nm:<7} 어긋남 {d*3600:5.0f}\" · 등급 {best[2]:+.2f} (참값 {m0:+.2f})")

    print(f"[3/4] {EPOCH:.0f}년 하늘로 옮기고 {MAGLIM} 등급까지 추리기")
    stars = []
    for ra, dec, mag, name in allst:
        if mag > MAGLIM:
            continue
        r2, d2 = precess(ra, dec, EPOCH)
        stars.append((r2, d2, mag, name, ra, dec))
    stars.sort(key=lambda s: s[2])                    # 밝은 것부터
    print(f"      남은 별 {len(stars)}개")
    # 세차운동이 실제로 걸렸는지 - 북극성이 천구 북극에서 얼마나 떨어졌나
    pol = min(stars, key=lambda s: -s[1])
    print(f"      북극성: 2000년 극에서 {90-pol[5]:.2f}° "
          f"-> {EPOCH:.0f}년 {90-pol[1]:.2f}°")
    mv = max(stars, key=lambda s: sep(s[0], s[1], s[4], s[5]))
    print(f"      가장 많이 옮겨간 별: {sep(mv[0],mv[1],mv[4],mv[5]):.2f}°")

    print("[4/4] star_data.js 기록")
    n = len(stars)
    ra_b, dec_b, mag_b = bytearray(), bytearray(), bytearray()
    for ra, dec, mag, *_ in stars:
        ra_b += struct.pack("<H", int(round(ra/360.0*65536)) % 65536)
        dec_b += struct.pack("<h", max(-32767, min(32767,
                             int(round(dec/90.0*32767)))))
        mag_b.append(max(0, min(255, int(round((mag-MAG_MIN)/MAG_STEP)))))
    payload = base64.b64encode(bytes(ra_b + dec_b + mag_b)).decode()
    # 이름이 있는 밝은 별은 따로 적어 둔다. 그리는 데는 안 쓰지만 검증에서
    # '어느 별이 어디 있나'를 사람 눈으로 확인할 수 있어야 한다.
    named = [(i, s[3]) for i, s in enumerate(stars) if s[3] and s[2] <= 1.6]
    names = ", ".join(f'{i}:"{nm}"' for i, nm in named)
    js = (
        "// AUTO-GENERATED by build_stars.py - DO NOT EDIT BY HAND\n"
        "// Source: Yale Bright Star Catalogue, 5th Revised Ed.\n"
        "//         (Hoffleit & Warren 1991), Harvard TDC distribution\n"
        f"// {len(allst)} stars -> V<={MAGLIM} -> {n}, precessed J2000 to {EPOCH:.0f}\n"
        "// See SOURCES_LICENSE.md\n"
        "window.STARS = {\n"
        f"  count: {n}, epoch: {EPOCH:.0f},\n"
        f"  magMin: {MAG_MIN}, magStep: {MAG_STEP},   // uint8 * magStep + magMin = V\n"
        "  // layout: ra uint16 x count, then dec int16 x count, then mag uint8 x count\n"
        "  //   ra  = u16 / 65536 * 360 (deg)\n"
        "  //   dec = i16 / 32767 * 90  (deg)\n"
        f'  data: "{payload}",\n'
        f"  names: {{{names}}}\n"
        "};\n"
    )
    open(OUT, "w", encoding="utf-8").write(js)
    print(f"      완료: star_data.js  {os.path.getsize(OUT)/1024:.1f} KB "
          f"(원시 {len(ra_b)+len(dec_b)+len(mag_b)} bytes, 이름 {len(named)}개)")


if __name__ == "__main__":
    main()
