@echo off
rem Temel Egitim - tek tikla baslatici (Windows).
rem Cift tikla: guncellemeyi alir, paketleri kurar, Ollama'yi hazirlar, uygulamayi acar.
setlocal
cd /d "%~dp0"
title Temel Egitim

where node >nul 2>nul
if errorlevel 1 (
  echo [baslat] Node.js bulunamadi. https://nodejs.org adresinden LTS surumunu kurup tekrar dene.
  pause
  exit /b 1
)

where git >nul 2>nul
if not errorlevel 1 (
  echo [baslat] Guncelleme kontrol ediliyor...
  git pull --ff-only
  if errorlevel 1 echo [baslat] Guncelleme alinamadi; mevcut surumle devam ediliyor.
)

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
