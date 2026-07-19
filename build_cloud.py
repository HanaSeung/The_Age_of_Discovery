# build_cloud.py - NCEP/NCAR 재분석 전운량 월별평년값 -> 4도 격자 -> cloud_data.js
# 실행: python build_cloud.py
# 출처: NOAA PSL, NCEP/NCAR Reanalysis 1 Monthly Long-Term Mean (1991-2020)
#       tcdc.eatm = 대기 전층 전운량(%), T62 가우시안 격자 192x94
#       바람(build_wind.py)과 같은 OPeNDAP ASCII 창구라 외부 라이브러리가 필요 없다.
#
# 바람과 다른 점 두 가지.
#   1. 성분이 하나다. 바람은 u/v 두 장이지만 구름은 한 장뿐이라 파일이 절반이다.
#   2. 보정 계수가 없다. 바람은 벡터 평균이라 월평균을 내면 서로 상쇄되어
#      실제보다 약하게 나오므로 windGain 1.8 을 곱했다. 구름량은 스칼라라
#      평균을 내도 상쇄되지 않는다. 받은 값이 곧 쓰는 값이다.
import base64, os, re, urllib.request

BASE = ("https://psl.noaa.gov/thredds/dodsC/Datasets/"
        "ncep.reanalysis.derived/other_gauss/")
FILE = "tcdc.eatm.mon.ltm.nc"
VAR = "tcdc"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "cloud_data.js")

NX, NY = 90, 45           # 4도 격자 - 바람과 같아야 샘플러를 함께 쓴다
NM = 12                   # 월별 12장
QSTEP = 0.5               # 양자화 단위: 0.5% -> uint8 (0~100% 가 0~200)
MISS = 1e3                # 결측 판정 (재분석 결측값은 -9.97e36)


def get(url, cache, minsize):
    """OPeNDAP 요청. 받은 원문을 캐시에 저장해 재실행 시 재사용."""
    path = os.path.join(HERE, cache)
    if os.path.exists(path) and os.path.getsize(path) > minsize:
        print("  cache hit:", cache)
        return open(path, encoding="ascii", errors="replace").read()
    print("  downloading:", cache, "...")
    req = urllib.request.Request(url, headers={"User-Agent": "build_cloud.py"})
    with urllib.request.urlopen(req, timeout=300) as r:
        txt = r.read().decode("ascii", "replace")
    open(path, "w", encoding="ascii", errors="replace").write(txt)
    print("  saved:", cache, len(txt), "bytes")
    return txt


def dims():
    """격자 크기를 .dds 로 먼저 확인한다.
    바람 코드는 192x94 를 그대로 박아 썼지만, 여기서는 물어보고 시작한다.
    창구가 바뀌어 격자가 달라지면 엉뚱한 값을 만드는 대신 여기서 걸린다."""
    txt = get(BASE + FILE + ".dds", "cloud_dds.txt", 0)
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
    """가우시안 nlon x nlat -> 등간격 4도 90x45 (면적 가중 없이 단순 평균).
    build_wind.py 와 같은 방식이라 두 데이터의 격자 칸이 정확히 겹친다."""
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
    """0~100% 를 0.5% 단위 uint8 로. 바람과 달리 음수가 없어 부호가 필요 없다."""
    b = bytearray()
    for x in vals:
        q = int(round(x / QSTEP))
        q = 0 if q < 0 else (255 if q > 255 else q)
        b.append(q)
    return b


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
    txt = get(BASE + FILE + ".ascii?" + VAR + full, "cloud_raw.txt", 10000)
    lat = axis(txt, VAR + ".lat")
    lon = axis(txt, VAR + ".lon")
    print(f"      lat {lat[0]:.2f}~{lat[-1]:.2f}  lon {lon[0]:.2f}~{lon[-1]:.2f}")

    print("[3/5] 파싱")
    g = grid3d(txt, VAR, nm, nlat, nlon)

    print(f"[4/5] {NX}x{NY} (4도) 로 축소")
    d = downsample(g, lat, lon, nm)

    vals = sorted(v for m in range(nm) for v in d[m])
    p10 = vals[int(len(vals) * 0.10)]
    p50 = vals[len(vals) // 2]
    p90 = vals[int(len(vals) * 0.90)]
    print(f"      운량 p10 {p10:.1f} / 중앙 {p50:.1f} / p90 {p90:.1f} / "
          f"최소 {vals[0]:.1f} / 최대 {vals[-1]:.1f} %")
    # 눈으로 확인 - 1월(0)과 7월(6). 사하라는 맑고 남극해는 흐려야 한다.
    for name, la, lo in [("사하라 상공", 24, 12), ("적도 대서양", 2, -20),
                         ("리스본 앞바다", 38, -12), ("남극해", -58, 0),
                         ("인도 서해안", 16, 72)]:
        print(f"      {name:<10} 1월 {at(d[0], la, lo):5.1f}%   "
              f"7월 {at(d[6], la, lo):5.1f}%")

    print("[5/5] cloud_data.js 기록")
    buf = bytearray()
    for m in range(nm):
        buf += quant(d[m])
    payload = base64.b64encode(bytes(buf)).decode()
    js = (
        "// AUTO-GENERATED by build_cloud.py - DO NOT EDIT BY HAND\n"
        "// Source: NOAA PSL, NCEP/NCAR Reanalysis 1 Monthly Long-Term Mean\n"
        "//         tcdc.eatm total cloud cover, T62 Gaussian "
        f"{nlon}x{nlat} -> 4deg {NX}x{NY}, 12 months\n"
        "// Public domain (U.S. Government work). See SOURCES_LICENSE.md\n"
        "window.CLOUD = {\n"
        f"  nx: {NX}, ny: {NY}, months: {nm},\n"
        f"  quantStep: {QSTEP},          // uint8 * quantStep = percent (0~100)\n"
        f"  p10: {p10:.2f}, p90: {p90:.2f},   // 표현 세기 정규화 기준\n"
        "  // layout: month0..11, each ny*nx, row-major from 90N, col-major from 180W\n"
        f'  data: "{payload}"\n'
        "};\n"
    )
    open(OUT, "w", encoding="utf-8").write(js)
    print(f"      완료: cloud_data.js  {os.path.getsize(OUT)/1024:.0f} KB "
          f"(원시 {len(buf)} bytes)")


if __name__ == "__main__":
    main()
