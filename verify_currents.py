# verify_currents.py - 생성된 currents_data.js 를 역디코딩해 주요 해류 방향 검증
import re, base64, math, os
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, "currents_data.js"), encoding="utf-8").read()
NX = int(re.search(r"nx:\s*(\d+)", src).group(1))
NY = int(re.search(r"ny:\s*(\d+)", src).group(1))
QS = float(re.search(r"quantStep:\s*([\d.]+)", src).group(1))
REF = float(re.search(r"refMs:\s*([\d.]+)", src).group(1))
raw = base64.b64decode(re.search(r'data:\s*"([^"]+)"', src).group(1))
N = NX*NY
assert len(raw) == 2*N, "byte length mismatch: %d" % len(raw)

def dec(i):
    b = raw[i]
    return (b-256 if b > 127 else b) * QS / 100.0   # -> m/s
def cell(lon, lat):
    ti = min(NX-1, max(0, int((lon+180)//2)))
    tj = min(NY-1, max(0, int((90-lat)//2)))
    k = tj*NX + ti
    return dec(k), dec(N+k)
DIRS = ['N','NE','E','SE','S','SW','W','NW']
def brg(u, v):
    a = (math.degrees(math.atan2(u, v)) + 360) % 360
    return a, DIRS[round(a/45) % 8]

TESTS = [
 ("만류 Gulf Stream",      -68,  38, lambda u,v: u > 0),
 ("쿠로시오 Kuroshio",     143,  36, lambda u,v: u > 0 and v > 0),
 ("남적도해류 S.Equat.",  -140,  -2, lambda u,v: u < 0),
 ("북적도해류 N.Equat.",  -150,  12, lambda u,v: u < 0),
 ("남극순환류 ACC(태평양)",-120, -55, lambda u,v: u > 0),
 ("남극순환류 ACC(인도양)",  30, -55, lambda u,v: u > 0),
 ("사하라(육지)",           10,  25, lambda u,v: u == 0 and v == 0),
 ("중앙아시아(육지)",       80,  45, lambda u,v: u == 0 and v == 0),
]
print("grid %dx%d | quant %.1f cm/s | ref %.3f m/s | bytes %d" % (NX, NY, QS, REF, len(raw)))
ok = 0
for name, lo, la, chk in TESTS:
    u, v = cell(lo, la); a, d = brg(u, v); p = chk(u, v); ok += p
    print("  [%s] %-22s u=%+.2f v=%+.2f | %.2f m/s | %5.0f' %s"
          % ("OK" if p else "XX", name, u, v, math.hypot(u, v), a, d))
# 경도 순환 연속성: -180 과 +178 셀이 인접해야 함
uL, vL = cell(-179, 0); uR, vR = cell(179, 0)
print("  wrap check: lon-179 u=%+.2f | lon+179 u=%+.2f (인접셀)" % (uL, uR))
print("\n%d/%d 통과" % (ok, len(TESTS)))
