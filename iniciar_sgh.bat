@echo off
title SGH - Sistema de Gestion Horaria Escolar
cd /d "%~dp0"
set "PATH=%~dp0.runtime\node;%PATH%"
echo Iniciando SGH (Sistema de Gestion Horaria Escolar - Offline Portable)...
".\node_modules\electron\dist\electron.exe" .
