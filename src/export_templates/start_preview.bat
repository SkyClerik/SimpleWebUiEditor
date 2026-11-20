@echo off
title UI Bundle Preview Server
echo Starting local preview server on http://localhost:8001/index.html ...
python -c "import http.server, socketserver, webbrowser, threading; threading.Timer(0.5, lambda: webbrowser.open('http://localhost:8001/index.html')).start(); socketserver.TCPServer(('', 8001), http.server.SimpleHTTPRequestHandler).serve_forever()"
if errorlevel 1 (
    echo Python not found! Opening index.html directly in offline mode...
    start "" "index.html"
)
pause
