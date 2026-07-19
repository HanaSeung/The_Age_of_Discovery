# build_airtemp.py - NCEP/NCAR 재분석 2m 기온 월별평년값 -> 4도 격자 -> airtemp_data.js
# 실행: python build_airtemp.py
# 출처: NOAA PSL, NCEP/NCAR Reanalysis 1 Monthly Long-Term Mean (1991-2020)
#       air.2m = 지상 2m 기온, T62 가우시안 격자 192x94
#       강수(build_precip.py)와 같은 창구·같은 격자·같은 달 수라 셈법이 그대로다.
#
# 왜 수온 근사를 두고 이것을 받는가.
#   비가 눈이 되는지를 정하는 것은 물 온도가 아니라 공기 온도다. 수온은
#   그 대용품이었고, 게다가 위도로 지어낸 근사여서 오차가 두 겹이었다.
#   고위도에서 3~6도씩, 그것도 부호가 양쪽으로 어긋났다 - 60N 1월은 6도쯤
#   차갑게, 55S 1월은 4도쯤 따뜻하게. 그 위에 눈 문턱을 얹으면 시험한 곳만
#   맞고 나머지는 틀린다. 그래서 맞는 변수를 실측으로 받기로 했다.
#   덤으로 만류와 래브라도 한류의 비대칭도 자료에 이미 들어 있다.
#
# 강수와 다른 점 하나.
#   음수가 있다. 강수는 0 부터라 그냥 나누면 됐지만 기온은 남극이 -50도까지
#   내려간다. 기준점(BASE_C)을 두고 거기서부터 세어 uint8 에 담는다.
import base64, os, re, urllib.request

BASE = ("https://psl.noaa.gov/thredds/dodsC/Datasets/"
        "ncep.reanalysis.derived/surface_gauss/")
FILE = "air.2m.mon.ltm.nc"
VAR = "air"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "airtemp_data.js")

NX, NY = 90, 45           # 4도 격자 - 바람/구름/강수와 같아야 샘플러를 함께 쓴다
NM = 12                   # 월별 12장
BASE_C = -75.0            # 담을 수 있는 최저 기온 (섭씨)
                          # -60 으로 잡았더니 남극 내륙(-70.8도)이 잘렸다.
QSTEP = 0.5               # 양자화 단위: 0.5도 -> uint8 (-75.0 ~ +52.5도)
MISS = 1e3                # 결측 판정 (재분석 결측값은 -9.97e36)
K0 = 273.15               # 켈빈 -> 섭씨


def get(url, cache, minsize):
    """OPeNDAP 요청. 받은 원문을 캐시에 저장해 재실행 시 재사용."""
    path = os.path.join(HERE, cache)
    if os.path.exists(path) and os.path.getsize(path) > minsize:
        print("  cache hit:", cache)
        return open(path, encoding="ascii", errors="replace").read()
    print("  downloading:", cache, "...")
    req = urllib.request.Request(url, headers={"User-Agent": "build_airtemp.py"})
    with urllib.request.urlopen(req, timeout=300) as r:
        txt = r.read().decode("ascii", "replace")
    open(path, "w", encoding="ascii", errors="replace").write(txt)
    print("  saved:", cache, len(txt), "bytes")
    return txt


def dims():
    """격자 크기를 .dds 로 먼저 확인한다. 창구가 바뀌어 격자가 달라지면
    엉뚱한 값을 만드는 대신 여기서 걸린다."""
    txt = get(BASE + FILE + ".dds", "airtemp_dds.txt", 0)
    m = re.search(r"time\s*=\s*(\d+)\]\[lat\s*=\s*(\d+)\]\[lon\s*=\s*(\d+)", txt)
    if not m:
        raise RuntimeError(".dds 에서 격자 크기를 읽지 못함:\n" + txt[:400])
    nm, nlat, nlon = (int(x) for x in m.groups())
    if nm != NM:
        raise RuntimeError(f"달 수가 12 가 아니다: {nm}")
    return nm, nlat, nlon


def axis(txt, tag):
    """.ascii 출력에서 좌표축 배열 한 줄을 뽑는다."""
    lines = txt.splitlines()
    for i, ln in enumerate(lines):
        if ln.startswith(tag + "["):
            return [float(x) for x in lines[i + 1].split(",")]
    raise RuntimeError("축을 찾지 못함: " + tag)


def grid3d(txt, var, nm, nlat, nlon):
    """[t][j], v, v, ... 형식의 본문을 [t][j][i] 리스트로 파싱."""
    g = [[None] * nlat for _ in range(nm)]
    key = var + "." + var + "["
    started = False
    for ln in txt.splitlines():
        if ln.startswith(key):
            started = True
            continue
        if not started:
            continue
        if not ln.startswith("["):
            if g[0][0] is not None:      # 본문이 끝나고 MAPS 구역 시작
                break
            continue
        head, _, rest = ln.partition(",")
        t, j = head.strip().strip("[]").split("][")
        row = [float(x) for x in rest.split(",")]
        if len(row) != nlon:
            raise RuntimeError(f"열 개수 불일치 {len(row)} != {nlon}")
        g[int(t)][int(j)] = row
    for m in range(nm):
        for j in range(nlat):
            if g[m][j] is None:
                raise RuntimeError(f"빠진 행 t={m} j={j}")
    return g


def to_celsius(g, nm, nlat):
    """켈빈이면 섭씨로 바꾼다. 파일마다 단위가 달라 값을 보고 정한다 -
    지구 평균 기온이 280 근처면 켈빈, 15 근처면 이미 섭씨다."""
    s = n = 0
    for m in range(nm):
        for j in range(nlat):
            for v in g[m][j]:
                if abs(v) < MISS:
                    s += v
                    n += 1
    mean = s / n
    if mean > 100.0:
        print(f"      단위: 켈빈 (평균 {mean:.1f}K) -> 섭씨로 환산")
        for m in range(nm):
            for j in range(nlat):
                g[m][j] = [(v - K0) if abs(v) < MISS else v for v in g[m][j]]
    else:
        print(f"      단위: 이미 섭씨 (평균 {mean:.1f}도)")
    return g


def downsample(g, lat, lon, nm):
    """가우시안 nlon x nlat -> 등간격 4도 90x45.
    build_precip.py 와 같은 방식이라 두 데이터의 칸이 정확히 겹친다."""
    out = []
    for m in range(nm):
        s = [0.0] * (NX * NY)
        c = [0] * (NX * NY)
        for j, la in enumerate(lat):
            tj = int((90.0 - la) // 4)
            tj = 0 if tj < 0 else (NY - 1 if tj >= NY else tj)
            row = g[m][j]
            base = tj * NX
            for i, lo in enumerate(lon):
                v = row[i]
                if abs(v) > MISS:
                    continue
                lw = ((lo + 180.0) % 360.0) - 180.0
                ti = int((lw + 180.0) // 4)
                ti = 0 if ti < 0 else (NX - 1 if ti >= NX else ti)
                k = base + ti
                s[k] += v
                c[k] += 1
        out.append([(s[i] / c[i]) if c[i] else 0.0 for i in range(NX * NY)])
    return out


def quant(vals):
    """섭씨를 BASE_C 부터 0.5도 단위 uint8 로. 범위를 벗어난 칸 수를 함께 준다."""
    b = bytearray()
    n = 0
    for x in vals:
        q = int(round((x - BASE_C) / QSTEP))
        if q < 0:
            q = 0
            n += 1
        elif q > 255:
            q = 255
            n += 1
        b.append(q)
    return b, n


def at(d, lat, lon):
    """확인용 - 위경도 한 점의 값을 4도 격자에서 읽는다."""
    tj = min(NY - 1, max(0, int((90.0 - lat) // 4)))
    ti = min(NX - 1, max(0, int((lon + 180.0) // 4)))
    return d[tj * NX + ti]


def main():
    print("[1/5] 격자 확인")
    nm, nlat, nlon = dims()
    print(f"      원본 격자 {nlon}x{nlat}, {nm}개월")

    print("[2/5] 다운로드")
    full = f"[0:1:{nm-1}][0:1:{nlat-1}][0:1:{nlon-1}]"
    txt = get(BASE + FILE + ".ascii?" + VAR + full, "airtemp_raw.txt", 10000)
    lat = axis(txt, VAR + ".lat")
    lon = axis(txt, VAR + ".lon")
    print(f"      lat {lat[0]:.2f}~{lat[-1]:.2f}  lon {lon[0]:.2f}~{lon[-1]:.2f}")

    print("[3/5] 파싱 + 단위 확인")
    g = grid3d(txt, VAR, nm, nlat, nlon)
    g = to_celsius(g, nm, nlat)

    print(f"[4/5] {NX}x{NY} (4도) 로 축소")
    d = downsample(g, lat, lon, nm)

    vals = sorted(v for m in range(nm) for v in d[m])
    p50 = vals[len(vals) // 2]
    print(f"      기온 최저 {vals[0]:.1f} / 중앙 {p50:.1f} / 최고 {vals[-1]:.1f} 도")

    # 위도 근사가 틀렸던 바로 그 자리들. 이번에는 실측이라 맞아야 한다.
    print("      --- 위도 근사가 어긋났던 곳 (1월 / 7월) ---")
    for name, la, lo in [("북대서양 60N", 60, -20),
                         ("그린란드해 72N", 72, -5),
                         ("남극해 55S", -55, 0),
                         ("남극해 65S", -65, 0)]:
        print(f"      {name:<14} {at(d[0], la, lo):6.1f}   {at(d[6], la, lo):6.1f}")

    # 위도만으로는 절대 나오지 않는 것 - 같은 위도의 동서 차이.
    # 만류가 데우는 노르웨이해와 한류가 얼리는 래브라도해가 갈라져야 한다.
    print("      --- 같은 60N 인데 (1월) ---")
    for name, la, lo in [("노르웨이해", 62, 2), ("래브라도해", 60, -55)]:
        print(f"      {name:<14} {at(d[0], la, lo):6.1f}")

    print("[5/5] airtemp_data.js 기록")
    buf = bytearray()
    clipped = 0
    for m in range(nm):
        b, n = quant(d[m])
        buf += b
        clipped += n
    if clipped:
        print(f"      주의: {clipped}칸이 담는 범위 "
              f"({BASE_C:.0f} ~ {BASE_C + 255*QSTEP:.0f}도) 를 벗어나 잘렸다")
    payload = base64.b64encode(bytes(buf)).decode()
    js = (
        "// AUTO-GENERATED by build_airtemp.py - DO NOT EDIT BY HAND\n"
        "// Source: NOAA PSL, NCEP/NCAR Reanalysis 1 Monthly Long-Term Mean\n"
        "//         air.2m surface air temperature, T62 Gaussian "
        f"{nlon}x{nlat} -> 4deg {NX}x{NY}, 12 months\n"
        "// Unit: degC, stored as uint8: degC = baseC + uint8 * quantStep\n"
        "// Public domain (U.S. Government work). See SOURCES_LICENSE.md\n"
        "window.AIRTEMP = {\n"
        f"  nx: {NX}, ny: {NY}, months: {nm},\n"
        f"  baseC: {BASE_C}, quantStep: {QSTEP},   // degC = baseC + uint8*quantStep\n"
        f"  minC: {vals[0]:.2f}, maxC: {vals[-1]:.2f},\n"
        "  // layout: month0..11, each ny*nx, row-major from 90N, col-major from 180W\n"
        f'  data: "{payload}"\n'
        "};\n"
    )
    open(OUT, "w", encoding="utf-8").write(js)
    print(f"      완료: airtemp_data.js  {os.path.getsize(OUT)/1024:.0f} KB "
          f"(원시 {len(buf)} bytes)")


if __name__ == "__main__":
    main()
