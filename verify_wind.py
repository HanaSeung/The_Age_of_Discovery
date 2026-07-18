# verify_wind.py - wind_data.js 검증 (바람대가 실제와 맞는지)
# 실행: python verify_wind.py
import base64, math, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, "wind_data.js"), encoding="utf-8").read()

def field(name, cast=float):
    m = re.search(name + r"\s*:\s*([0-9.eE+-]+)", src)
    return cast(m.group(1))

NX = field("nx", int); NY = field("ny", int); NM = field("months", int)
QS = field("quantStep"); P99 = field("p99")
data = base64.b64decode(re.search(r'data:\s*"([^"]+)"', src).group(1))
N = NX * NY

npass = nfail = 0
def chk(name, cond, note=""):
    global npass, nfail
    if cond: npass += 1; print(f"  OK   {name}  {note}")
    else:    nfail += 1; print(f"  FAIL {name}  {note}")

def s8(b): return b - 256 if b > 127 else b
def uv(m, lat, lon):
    j = int((90.0 - lat) // 4); j = max(0, min(NY - 1, j))
    i = int((((lon + 180.0) % 360.0)) // 4); i = max(0, min(NX - 1, i))
    k = j * NX + i
    u = s8(data[m * N + k]) * QS
    v = s8(data[NM * N + m * N + k]) * QS
    return u, v

DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
def frm(u, v):                       # 바람이 불어오는 방향 (기상 관례)
    return DIRS[round(((math.degrees(math.atan2(-u, -v)) + 360) % 360) / 45) % 8]
def spd(u, v): return math.hypot(u, v)

print("\n=== 1. 파일 구조 ===")
chk("격자 90x45", NX == 90 and NY == 45)
chk("12개월", NM == 12)
chk("데이터 길이 = 2 x 12 x 90 x 45", len(data) == 2 * NM * N, f"({len(data)} bytes)")
chk("양자화 단위 0.2 m/s", abs(QS - 0.2) < 1e-9)

print("\n=== 2. 무역풍 (연중 일정해야 함) ===")
for nm, la, lo, want in [("북동무역풍 15N 40W", 15, -40, ("NE", "E", "ENE")),
                         ("남동무역풍 10S 20W", -10, -20, ("SE", "E", "ESE")),
                         ("태평양 북동무역 15N 140W", 15, -140, ("NE", "E")),
                         ("태평양 남동무역 15S 120W", -15, -120, ("SE", "E"))]:
    for m, mn in ((0, "1월"), (6, "7월")):
        u, v = uv(m, la, lo)
        d = frm(u, v)
        chk(f"{nm} {mn}", d in want, f"{d}풍 {spd(u,v):.1f} m/s")

print("\n=== 3. 편서풍 (중위도) ===")
for nm, la, lo in [("남반구 편서풍 45S 20E", -45, 20),
                   ("남반구 편서풍 50S 100E", -50, 100),
                   ("북대서양 편서풍 45N 30W", 45, -30)]:
    for m, mn in ((0, "1월"), (6, "7월")):
        u, v = uv(m, la, lo)
        chk(f"{nm} {mn}", u > 1.0, f"{frm(u,v)}풍 {spd(u,v):.1f} m/s (u={u:+.1f})")

print("\n=== 4. 적도 무풍대 (위치가 계절에 따라 이동해야 함) ===")
# 고정 지점 검사는 틀린 방법이다. 무풍대(ITCZ)는 태양을 따라 남북으로 움직인다.
def itcz(m, lon):
    """대서양 자오선을 훑어 풍속이 가장 약한 위도를 찾는다."""
    best, bl = 1e9, None
    for la10 in range(-200, 201, 20):        # -20 ~ +20도, 2도 간격
        la = la10 / 10.0
        s = spd(*uv(m, la, lon))
        if s < best: best, bl = s, la
    return bl, best

for lon in (-25, -30):
    j_lat, j_sp = itcz(0, lon)               # 1월
    l_lat, l_sp = itcz(6, lon)               # 7월
    # 절대 수치보다 '같은 자오선의 무역풍보다 확연히 약한가'가 옳은 기준이다.
    tr = max(spd(*uv(0, 15, lon)), spd(*uv(0, -15, lon)))
    chk(f"무풍대가 무역풍보다 약함 {abs(lon)}W",
        j_sp < tr * 0.6 and l_sp < tr * 0.6,
        f"무역풍 {tr:.1f} / 1월 {j_lat:+.0f}도 {j_sp:.1f} / 7월 {l_lat:+.0f}도 {l_sp:.1f} m/s")
    chk(f"무풍대 북상 {abs(lon)}W (1월→7월)", l_lat > j_lat,
        f"{j_lat:+.0f}도 → {l_lat:+.0f}도")

print("\n=== 5. 인도양 계절풍 (1월과 7월이 반대여야 함) ===")
for nm, la, lo in [("아라비아해 12N 65E", 12, 65),
                   ("벵골만 12N 88E", 12, 88),
                   ("소말리아 앞바다 6N 55E", 6, 55)]:
    u1, v1 = uv(0, la, lo)
    u7, v7 = uv(6, la, lo)
    # 두 벡터가 이루는 각 (반대면 180도에 가까움)
    d1, d7 = spd(u1, v1), spd(u7, v7)
    cosang = (u1 * u7 + v1 * v7) / (d1 * d7) if d1 * d7 > 0 else 1
    ang = math.degrees(math.acos(max(-1, min(1, cosang))))
    chk(f"{nm} 방향 역전", ang > 120,
        f"1월 {frm(u1,v1)}풍 {d1:.1f} / 7월 {frm(u7,v7)}풍 {d7:.1f} / 사잇각 {ang:.0f}도")

print("\n=== 6. 원본 대조 (다운샘플이 값을 망치지 않았는지) ===")
raw = os.path.join(HERE, "wind_u_raw.txt")
if os.path.exists(raw):
    txt = open(raw, encoding="ascii", errors="replace").read()
    lines = txt.splitlines()
    lat = None; lon = None
    for i, ln in enumerate(lines):
        if ln.startswith("uwnd.lat["): lat = [float(x) for x in lines[i+1].split(",")]
        if ln.startswith("uwnd.lon["): lon = [float(x) for x in lines[i+1].split(",")]
    rows = {}
    for ln in lines:
        if ln.startswith("[0]["):
            head, _, rest = ln.partition(",")
            _, j = head.strip().strip("[]").split("][")
            rows[int(j)] = [float(x) for x in rest.split(",")]
    for la, lo in [(15, -40), (-45, 20), (12, 65)]:
        # 해당 4도 칸에 들어가는 원본 셀들의 평균
        tj = int((90 - la)//4); ti = int(((lo + 180) % 360)//4)
        acc = []
        for j, jla in enumerate(lat):
            if int((90 - jla)//4) != tj: continue
            for i, ilo in enumerate(lon):
                if int(((((ilo+180)%360)-180+180))//4) != ti: continue
                acc.append(rows[j][i])
        ref = sum(acc)/len(acc)
        got = uv(0, la, lo)[0]
        chk(f"1월 u @ {la},{lo}", abs(ref - got) <= QS,
            f"원본평균 {ref:+.3f} vs 저장 {got:+.3f} (허용 {QS})")
else:
    print("  (원본 캐시 없음 — 건너뜀)")

print(f"\n=== 결과 ===\n  통과 {npass} / 실패 {nfail}  (총 {npass+nfail})")
raise SystemExit(1 if nfail else 0)
