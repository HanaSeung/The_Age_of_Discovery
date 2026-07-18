# The Age of Discovery - 개발용 정적 서버 (port 8010)
# 실행: python serve.py   또는   run_server.bat 더블클릭
import http.server, socketserver, webbrowser, os, sys

PORT = 8010
ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

class Handler(http.server.SimpleHTTPRequestHandler):
    # 개발 중 수정사항이 바로 반영되도록 캐시 비활성화
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()
    def log_message(self, fmt, *args):
        sys.stdout.write("  %s - %s\n" % (self.address_string(), fmt % args))

class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

def main():
    url = "http://localhost:%d/world_chart.html" % PORT
    print("=" * 52)
    print("  The Age of Discovery  |  static dev server")
    print("  root : %s" % ROOT)
    print("  url  : %s" % url)
    print("  stop : Ctrl + C")
    print("=" * 52)
    try:
        webbrowser.open(url)
    except Exception:
        pass
    with Server(("", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  server stopped.")

if __name__ == "__main__":
    main()
