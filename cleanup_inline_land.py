# cleanup_inline_land.py - HTML에 남은 구 인라인 지도 데이터(const LAND = {...}) 제거
import os, re, io
HERE = os.path.dirname(os.path.abspath(__file__))
P = os.path.join(HERE, "world_chart.html")
src = open(P, encoding="utf-8").read()
before = len(src)

pat = re.compile(r"// ===== 실측 지도 데이터[^\n]*\nconst LAND = \{.*?\};\n", re.S)
m = pat.search(src)
if not m:
    print("이미 제거됨 (또는 패턴 불일치)")
else:
    print("제거 대상 %d KB" % (len(m.group(0))//1024))
    src = pat.sub("// (지도 데이터는 land_data.js 로 분리됨 - build_land.py)\n", src)
    open(P, "w", encoding="utf-8").write(src)
    print("HTML %d KB -> %d KB" % (before//1024, len(src)//1024))

# 잔여 참조 확인
rest = open(P, encoding="utf-8").read()
bad = [l for l in rest.split("\n") if "LAND." in l and "LANDBIN" not in l]
print("남은 구 LAND 참조:", bad if bad else "없음")
print("land_data.js 연결:", 'src="land_data.js"' in rest)
