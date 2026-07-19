# build_precip.py - NCEP/NCAR 재분석 강수율 월별평년값 -> 4도 격자 -> precip_data.js
# 실행: python build_precip.py
# 출처: NOAA PSL, NCEP/NCAR Reanalysis 1 Monthly Long-Term Mean (1991-2020)
#       prate.sfc = 지표 강수율, T62 가우시안 격자 192x94
#       구름(build_cloud.py)과 같은 OPeNDAP 창구라 외부 라이브러리가 필요 없다.
#
# 왜 운량이 아니라 강수량을 따로 받는가.
#   하늘이 덮인 것과 비가 오는 것은 다르다. 페루·나미비아·캘리포니아 앞바다에는
#   해양성 층적운이 두껍게 깔려 운량이 65% 를 넘지만 비는 거의 내리지 않는다.
#   운량만으로 비를 유도하면 지구에서 가장 메마른 바다가 다우대로 나온다.
#   실제로 그렇게 나와서 이 파일을 만들게 되었다.
#
# 구름과 다른 점 두 가지.
#   1. 단위를 바꾼다. 원자료는 kg/m^2/s 인데 감이 오지 않는다. 86400 을 곱해
#      mm/일 로 바꾼다 (물 1kg/m^2 = 1mm). 적도수렴대가 8~12, 사막이 0 근처다.
#   2. 정규화 기준을 p90 이 아니라 p99 로 잡는다. 강수는 운량과 달리 분포가
#      한쪽으로 크게 쏠려 있어 - 대부분의 바다가 0 에 가깝고 좁은 띠만 아주
#      크다 - p90 으로 자르면 적도수렴대가 통째로 상한에 붙어 뭉개진다.
import base64, os, re, urllib.request

BASE = ("https://psl.noaa.gov/thredds/dodsC/Datasets/"
        "ncep.reanalysis.derived/surface_gauss/")
FILE = "prate.sfc.mon.ltm.nc"
VAR = "prate"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "precip_data.js")

NX, NY = 90, 45           # 4도 격자 - 바람/구름과 같아야 샘플러를 함께 쓴다
NM = 12                   # 월별 12장
SPD = 86400.0             # kg/m^2/s -> mm/일
QSTEP = 0.1               # 양자화 단위: 0.1 mm/일 -> uint8 (0 ~ 25.5 mm/일)
MISS = 1e3                # 결측 판정 (재분석 결측값은 -9.97e36)


def get(url, cache, minsize):
    """OPeNDAP 요청. 받은 원문을 캐시에 저장해 재실행 시 재사용."""
    path = os.path.join(HERE, cache)
    if os.path.exists(path) and os.path.getsize(path) > minsize:
        print("  cache hit:", cache)
        return open(path, encoding="ascii", errors="replace").read()
    print("  downloading:", cache, "...")
    req = urllib.request.Request(url, headers={"User-Agent": "build_precip.py"})
    with urllib.request.urlopen(req, timeout=300) as r:
        txt = r.read().decode("ascii", "replace")
    open(path, "w", encoding="ascii", errors="replace").write(txt)
    print("  saved:", cache, len(txt), "bytes")
    return txt


def dims():
    """격자 크기를 .dds 로 먼저 확인한다. 창구가 바뀌어 격자가 달라지면
    엉뚱한 값을 만드는 대신 여기서 걸린다."""
    txt = get(BASE + FILE + ".dds", "precip_dds.txt", 0)
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


def downsample(g, lat, lon, nm):
    """가우시안 nlon x nlat -> 등간격 4도 90x45. 여기서 mm/일 로 바꾼다.
    build_wind.py / build_cloud.py 와 같은 방식이라 세 데이터의 칸이 겹친다."""
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
                s[k] += v * SPD
                c[k] += 1
        out.append([(s[i] / c[i]) if c[i] else 0.0 for i in range(NX * NY)])
    return out


def quant(vals, clip):
    """mm/일 을 0.1 단위 uint8 로. 상한을 넘은 칸 수를 함께 돌려준다."""
    b = bytearray()
    n = 0
    for x in vals:
        q = int(round(x / QSTEP))
        if q > 255:
            q = 255
            n += 1
        if q < 0:
            q = 0
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
    txt = get(BASE + FILE + ".ascii?" + VAR + full, "precip_raw.txt", 10000)
    lat = axis(txt, VAR + ".lat")
    lon = axis(txt, VAR + ".lon")
    print(f"      lat {lat[0]:.2f}~{lat[-1]:.2f}  lon {lon[0]:.2f}~{lon[-1]:.2f}")

    print("[3/5] 파싱")
    g = grid3d(txt, VAR, nm, nlat, nlon)

    print(f"[4/5] {NX}x{NY} (4도) 로 축소 + mm/일 환산")
    d = downsample(g, lat, lon, nm)

    vals = sorted(v for m in range(nm) for v in d[m])
    p50 = vals[len(vals) // 2]
    p90 = vals[int(len(vals) * 0.90)]
    p99 = vals[int(len(vals) * 0.99)]
    print(f"      강수 중앙 {p50:.2f} / p90 {p90:.2f} / p99 {p99:.2f} / "
          f"최대 {vals[-1]:.2f} mm/일")

    # 이 표가 이 파일을 만든 이유다. 운량으로는 페루가 적도수렴대보다 흐렸다.
    # 강수로 보면 뒤집혀야 한다 - 페루는 0 근처, 적도수렴대는 한 자릿수 후반.
    print("      --- 확인 (mm/일) ---")
    for name, la, lo in [("적도수렴대 대서양", 8, -25),
                         ("적도수렴대 태평양", 8, -140),
                         ("페루 앞바다", -20, -90),
                         ("나미비아 앞바다", -22, 5),
                         ("남대서양 고압대", -25, -10),
                         ("벵골만", 15, 90),
                         ("아라비아해", 15, 60),
                         ("북대서양 폭풍대", 55, -25),
                         ("남극해", -55, 0)]:
        print(f"      {name:<12} 1월 {at(d[0], la, lo):6.2f}   "
              f"7월 {at(d[6], la, lo):6.2f}")

    print("[5/5] precip_data.js 기록")
    buf = bytearray()
    clipped = 0
    for m in range(nm):
        b, n = quant(d[m], 255)
        buf += b
        clipped += n
    if clipped:
        print(f"      주의: {clipped}칸이 상한 {255*QSTEP:.1f} mm/일 에서 잘렸다")
    payload = base64.b64encode(bytes(buf)).decode()
    js = (
        "// AUTO-GENERATED by build_precip.py - DO NOT EDIT BY HAND\n"
        "// Source: NOAA PSL, NCEP/NCAR Reanalysis 1 Monthly Long-Term Mean\n"
        "//         prate.sfc precipitation rate, T62 Gaussian "
        f"{nlon}x{nlat} -> 4deg {NX}x{NY}, 12 months\n"
        "// Unit: mm/day (kg/m^2/s * 86400)\n"
        "// Public domain (U.S. Government work). See SOURCES_LICENSE.md\n"
        "window.PRECIP = {\n"
        f"  nx: {NX}, ny: {NY}, months: {nm},\n"
        f"  quantStep: {QSTEP},          // uint8 * quantStep = mm/day\n"
        f"  p50: {p50:.3f}, p90: {p90:.3f}, p99: {p99:.3f},   // 세기 정규화 기준\n"
        "  // layout: month0..11, each ny*nx, row-major from 90N, col-major from 180W\n"
        f'  data: "{payload}"\n'
        "};\n"
    )
    open(OUT, "w", encoding="utf-8").write(js)
    print(f"      완료: precip_data.js  {os.path.getsize(OUT)/1024:.0f} KB "
          f"(원시 {len(buf)} bytes)")


if __name__ == "__main__":
    main()
