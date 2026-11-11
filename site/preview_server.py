#!/usr/bin/env python3
"""Локальный предпросмотр docs/: многопоточный + no-store, без зависимости от cwd."""
import http.server, functools, sys, os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8091
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'docs')

class NoStoreHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()
    def log_message(self, *args):
        pass

Handler = functools.partial(NoStoreHandler, directory=ROOT)
with http.server.ThreadingHTTPServer(('0.0.0.0', PORT), Handler) as httpd:
    print(f'preview (threaded, no-store) on :{PORT} serving {ROOT}', flush=True)
    httpd.serve_forever()
