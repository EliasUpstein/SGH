@echo off
setlocal
title SGH - Crear Acceso Directo en el Escritorio
set "SGH_DIR=%~dp0"
echo Creando acceso directo "SGH - Gestion Horaria Escolar" en el Escritorio...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$dir = $env:SGH_DIR.TrimEnd('\'); $wsh = New-Object -ComObject WScript.Shell; $desk = [Environment]::GetFolderPath('Desktop'); $lnk = Join-Path $desk 'SGH - Gestion Horaria Escolar.lnk'; $sc = $wsh.CreateShortcut($lnk); $exe = Join-Path $dir 'SGH - Gestion Horaria Escolar.exe'; if (Test-Path -LiteralPath $exe) { $sc.TargetPath = $exe; $sc.IconLocation = ($exe + ',0') } else { $sc.TargetPath = (Join-Path $dir 'iniciar_sgh.bat'); $el = Join-Path $dir 'node_modules\electron\dist\electron.exe'; if (Test-Path -LiteralPath $el) { $sc.IconLocation = ($el + ',0') } }; $sc.WorkingDirectory = $dir; $sc.Description = 'Sistema de Gestion Horaria Escolar (SGH)'; $sc.Save(); Write-Host ('Acceso directo guardado en: ' + $lnk)"
if %ERRORLEVEL% EQU 0 (
  echo.
  echo Acceso directo creado correctamente en tu Escritorio.
) else (
  echo.
  echo Error al generar el acceso directo.
)
pause
