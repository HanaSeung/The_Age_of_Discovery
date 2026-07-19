# verify_cloud.py - cloud_data.js 검증 (기후가 실제와 맞는지)
# 실행: python verify_cloud.py
#
# 구조만 보는 검증은 의미가 없다. 파일이 90x45 인지는 build_cloud.py 가 그렇게
# 썼으니 당연히 맞다. 이 스크립트가 실제로 묻는 것은 "받아 온 숫자가 지구의
# 구름 분포와 같은가" 하나다. 사하라가 맑고 몬순이 계절을 타는지 확인한다.
import base64, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, "cloud_data.js"), encoding="utf-8").read()

def field(name, cast=float):
    m = re.search(name + r"\s*:\s*([0-9.eE+-]+)", src)
    return cast(m.group(1))

NX = field("nx", int); NY = field("ny", int); NM = field("months", int)
QS = field("quantStep"); P10 = field("p10"); P90 = field("p90")
data = base64.b64decode(re.search(r'data:\s*"([^"]+)"', src).group(1))
N = NX * NY

npass = nfail = 0
def chk(name, cond, note=""):
    global npass, nfail
    if cond: npass += 1; print(f"  OK   {name}  {note}")
    else:    nfail += 1; print(f"  FAIL {name}  {note}")

def cc(m, lat, lon):
    """운량(%) 한 점. world_chart.html 의 샘플러와 같은 셈법이어야 한다."""
    j = max(0, min(NY - 1, int((90.0 - lat) // 4)))
    i = max(0, min(NX - 1, int(((lon + 180.0) % 360.0) // 4)))
    return data[m * N + j * NX + i] * QS

def band(m, lat):
    """위도대 한 줄의 평균 - 육지·바다를 섞어 경향만 본다."""
    j = max(0, min(NY - 1, int((90.0 - lat) // 4)))
    return sum(data[m * N + j * NX + i] for i in range(NX)) * QS / NX


print("\n=== 1. 파일 구조 ===")
chk("격자 90x45", NX == 90 and NY == 45)
chk("12개월", NM == 12)
chk("데이터 길이 = 12 x 90 x 45", len(data) == NM * N, f"({len(data)} bytes)")
chk("양자화 단위 0.5%", abs(QS - 0.5) < 1e-9)
chk("바람과 같은 격자", NX == 90 and NY == 45, "wind_data.js 와 셀이 겹친다")

print("\n=== 2. 값의 범위 ===")
lo = min(data) * QS; hi = max(data) * QS
chk("0% 이상", lo >= 0, f"최소 {lo:.1f}%")
chk("100% 이하", hi <= 100, f"최대 {hi:.1f}%")
chk("상수가 아니다", hi - lo > 40, f"폭 {hi-lo:.1f}%p")
chk("p10 < p90", P10 < P90, f"{P10:.1f} < {P90:.1f}")

print("\n=== 3. 사막은 맑다 ===")
# 절대값으로 자르면 안 된다. NCEP 재분석은 사막 운량을 위성 관측보다 높게 잡고,
# 호주 내륙은 1월이 실제로 여름 뇌우철이라 40% 가까이 흐리다. 물어야 할 것은
# "몇 % 인가"가 아니라 "세계 중앙값보다 확실히 맑은가"다.
allv = sorted(data)
MED = allv[len(allv) // 2] * QS
print(f"  (세계 중앙값 {MED:.1f}%)")
for nm, la, lo_ in [("사하라 24N 12E", 24, 12), ("아라비아 22N 48E", 22, 48),
                    ("호주 내륙 24S 132E", -24, 132)]:
    v = [cc(m, la, lo_) for m in range(12)]
    avg = sum(v) / 12
    chk(nm + " 연평균이 중앙값보다 20%p 이상 맑다", MED - avg > 20,
        f"연평균 {avg:.1f}% ({min(v):.1f}~{max(v):.1f}), 중앙값과 차 {avg-MED:+.1f}%p")
chk("가장 맑은 달의 사하라는 10% 미만", min(cc(m, 24, 12) for m in range(12)) < 10,
    f"{min(cc(m, 24, 12) for m in range(12)):.1f}%")

print("\n=== 4. 몬순은 계절을 탄다 ===")
for nm, la, lo_ in [("인도 서해안 16N 72E", 16, 72), ("벵골만 18N 88E", 18, 88)]:
    jan, jul = cc(0, la, lo_), cc(6, la, lo_)
    chk(nm + " 7월이 1월보다 훨씬 흐리다", jul - jan > 25,
        f"1월 {jan:.1f}% -> 7월 {jul:.1f}%  (차 {jul-jan:+.1f}%p)")


print("\n=== 5. 위도대 경향 (대항해시대 항로가 지나는 곳) ===")
# 아열대 고압대(말위도)는 가라앉는 공기라 맑고, 적도 수렴대와 편서풍대는 흐리다.
for m, mn in [(0, "1월"), (6, "7월")]:
    eq, sub, west = band(m, 2), band(m, 26), band(m, 54)
    chk(f"{mn} 적도가 아열대보다 흐리다", eq > sub,
        f"적도 {eq:.1f}% > 아열대 {sub:.1f}%")
    chk(f"{mn} 북위 54도 편서풍대가 아열대보다 흐리다", west > sub,
        f"54N {west:.1f}% > 26N {sub:.1f}%")

print("\n=== 6. 남극해는 연중 흐리다 (별을 못 본다) ===")
v = [cc(m, -58, 0) for m in range(12)]
chk("남극해 58S 연중 45% 이상", min(v) > 45,
    f"최소 {min(v):.1f}% 최대 {max(v):.1f}%")

print("\n=== 7. 리스본 출항 기준점 ===")
v = [cc(m, 38, -12) for m in range(12)]
chk("리스본 앞바다 여름이 겨울보다 맑다", v[6] < v[0],
    f"1월 {v[0]:.1f}% -> 7월 {v[6]:.1f}%")
chk("리스본 앞바다 값이 그럴듯하다", 25 < min(v) and max(v) < 75,
    f"{min(v):.1f}~{max(v):.1f}%")

print(f"\n{'전부 통과' if nfail == 0 else '실패 있음'} - "
      f"통과 {npass}, 실패 {nfail}\n")
