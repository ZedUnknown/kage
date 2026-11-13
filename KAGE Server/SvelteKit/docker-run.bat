@echo off
setlocal

rem Run from PowerShell or Command Prompt: .\docker-run.bat [action]
rem Actions: start (default), update, status, logs, stop, check.
rem Compose reads .env from the directory containing this script.
cd /d "%~dp0"
if errorlevel 1 exit /b 1

if not exist ".env" (
    echo Missing .env. Copy .env.example to .env and set its values first.
    exit /b 1
)

where.exe docker >nul 2>&1
if errorlevel 1 (
    echo Docker is not available. Start Docker Desktop and try again.
    exit /b 1
)

set "action=%~1"
if not defined action set "action=start"
if /I "%action%"=="start" goto start
if /I "%action%"=="update" goto update
if /I "%action%"=="status" goto status
if /I "%action%"=="logs" goto logs
if /I "%action%"=="stop" goto stop
if /I "%action%"=="check" goto check

echo Usage: %~nx0 [start, update, status, logs, stop, check]
exit /b 2

:check
rem Validate the Compose file and required .env values without starting containers.
call :compose config --quiet
if errorlevel 1 exit /b 1
echo Docker Compose configuration is valid.
exit /b 0

:start
rem Build the image, run migrations, and start web and worker.
call :compose config --quiet
if errorlevel 1 exit /b 1
call :compose up --build -d
if errorlevel 1 exit /b 1
call :compose ps -a
exit /b %errorlevel%

:update
rem Build the updated image and apply migrations before recreating services.
call :compose build migrate
if errorlevel 1 exit /b 1
call :compose run --rm migrate
if errorlevel 1 exit /b 1
call :compose up -d
if errorlevel 1 exit /b 1
call :compose ps -a
exit /b %errorlevel%

:status
rem Include the completed one-shot migration container in the status list.
call :compose ps -a
exit /b %errorlevel%

:logs
rem Follow logs. Ctrl+C stops viewing logs; containers keep running.
call :compose logs -f migrate web worker
exit /b %errorlevel%

:stop
rem Stop containers; the PostgreSQL server on the Windows host is unaffected.
call :compose down
exit /b %errorlevel%

:compose
docker compose %*
exit /b %errorlevel%
