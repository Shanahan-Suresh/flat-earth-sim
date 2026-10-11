"""Local dev server with caching off, so a reload always picks up edited modules.

    python serve.py [port]      (default 8000)
"""
import functools, http.server, pathlib, sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
handler = functools.partial(NoCacheHandler, directory=str(pathlib.Path(__file__).parent))
print(f'Serving http://127.0.0.1:{port}/ (no-store)')
http.server.ThreadingHTTPServer(('127.0.0.1', port), handler).serve_forever()
