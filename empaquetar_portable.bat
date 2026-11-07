@echo off
setlocal
title SGH - Empaquetado Portable (Windows)
cd /d "%~dp0"
set "NODE_BIN=%~dp0.runtime\node\node.exe"
if not exist "%NODE_BIN%" set "NODE_BIN=node"

echo [1/2] Compilando hoja de estilos Tailwind CSS...
"%NODE_BIN%" ".\node_modules\tailwindcss\lib\cli.js" -i ".\src\renderer\styles\input.css" -o ".\src\renderer\styles\output.css" --minify
if %ERRORLEVEL% NEQ 0 (
  echo Error al compilar Tailwind CSS.
  pause
  exit /b 1
)

echo.
echo [2/2] Generando carpeta portable autocontenida en .\dist_portable\SGH_Portable...
"%NODE_BIN%" ".\scripts\build_portable.js"
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo Ocurrio un error durante el empaquetado portable.
  pause
  exit /b 1
)

echo.
echo Listo! Copia unicamente la carpeta ".\dist_portable\SGH_Portable" a la PC destino.
pause
