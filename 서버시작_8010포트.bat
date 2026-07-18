@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Starting The Age of Discovery server on http://localhost:8010 ...
python serve.py
pause
