@echo off
title Free Web UI Builder — Server
echo Free Web UI Builder — Python Server
echo Server running: http://localhost:8000
echo Documents: H:\TestGigaCode\documents
echo API: /api/documents, /api/build, /api/events, /api/error
echo.
echo Opening browser...
start http://localhost:8000
python H:\TestGigaCode\gen_server.py
pause
