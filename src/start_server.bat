@echo off
title Free Web UI Builder Server

cd /d "%~dp0"

echo Starting Free Web UI Builder...
start "" "http://localhost:8000"

if exist "%~dp0gen_server.py" (
    python "%~dp0gen_server.py"
) else if exist "%~dp0src\gen_server.py" (
    python "%~dp0src\gen_server.py"
) else (
    echo [ERROR] gen_server.py not found!
)

pause