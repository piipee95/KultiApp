@echo off
chcp 65001 >nul
cd /d "%~dp0"
if "%~1"=="" (
  echo.
  echo  Arrastra tu archivo .3mf ENCIMA de este archivo para usarlo.
  echo.
  pause
  exit /b
)
set PY=py
where py >nul 2>nul || set PY=python
%PY% -c "import numpy, scipy, PIL, contourpy" >nul 2>nul
if errorlevel 1 (
  echo Instalando lo necesario, solo esta vez...
  %PY% -m pip install numpy scipy pillow contourpy
)
%PY% base_contorno.py "%~1"
echo.
echo  Listo. El archivo nuevo quedo junto al original, con "_con_contorno" al final.
pause
