@echo off
:: Startup script for Windows
cd /d "%~dp0.."
call npm install
call npm start
