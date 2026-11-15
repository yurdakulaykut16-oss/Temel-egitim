@echo off
rem Temel Egitim - tek tikla baslatici (Windows).
rem Cift tikla: guncellemeyi alir, paketleri kurar, Ollama'yi hazirlar, uygulamayi acar.
rem Klasor ZIP olarak indirilmis olsa bile calisir; ilk acilista kendini Git'e baglar.
setlocal
cd /d "%~dp0"
title Temel Egitim
if /i "%~1"=="--devam" goto devam

where node >nul 2>nul
if errorlevel 1 (
  echo [baslat] Node.js bulunamadi. https://nodejs.org adresinden LTS surumunu kurup tekrar dene.
  pause
  exit /b 1
)

rem Guncelleme bu dosyanin kendisini de degistirebilir. Asagidaki satir TEK PARCA okunur:
rem guncelleme biter bitmez dosya bastan, yeni haliyle calistirilir.
node scripts\guncelle.mjs & "%~f0" --devam

:devam
echo [baslat] Paketler kontrol ediliyor...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo [baslat] npm install basarisiz oldu. Internet baglantisini kontrol edip tekrar dene.
  pause
  exit /b 1
)

rem Onerilen modellerden eksik olan varsa indirilsin.
set TEMPO_PULL_MODELS=1

rem VoiceStudio daha once kurulduysa onunla, kurulmadiysa normal modda ac.
if exist ".runtime\VoiceStudio" (
  call npm run dev:voicestudio
) else (
  call npm run dev
)

echo.
echo [baslat] Uygulama kapandi.
pause
