@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先安装 Node.js 18 或更高版本。
  pause
  exit /b 1
)
if not exist .env (
  copy /y .env.example .env >nul
  echo 已自动创建 .env。没有 Liquipedia API Key 也可以先运行内置赛程。
)
echo.
echo TI2026 观赛指南启动中...
echo 浏览器访问：http://127.0.0.1:17826
echo.
node server.js
pause
