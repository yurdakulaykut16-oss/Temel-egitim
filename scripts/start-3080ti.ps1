param([switch]$WithCoderCouncil)
# RTX 3080 Ti (12GB/16GB VRAM) + 16GB RAM için <1sn Sıfır-Swap Ollama + 18-Modelli Kodlama Konseyi Başlatıcı
$ErrorActionPreference = "Stop"

$env:OLLAMA_FLASH_ATTENTION = "1"
$env:OLLAMA_KV_CACHE_TYPE = "q8_0"
$env:OLLAMA_MAX_LOADED_MODELS = "3"
$env:OLLAMA_NUM_PARALLEL = "4"
$env:OLLAMA_KEEP_ALIVE = "-1"

Write-Host "RTX 3080 Ti GPU & VRAM kontrol ediliyor..." -ForegroundColor Cyan
$vramMb = 12288
try {
    $gpuLine = (& nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits | Select-Object -First 1)
    if ($gpuLine) {
        $parts = $gpuLine.Split(",")
        $vramMb = [int]($parts[1].Trim())
        Write-Host ("Tespit edilen GPU: " + $parts[0].Trim() + " (" + [math]::Round($vramMb/1024,1) + " GB VRAM)") -ForegroundColor Green
    }
} catch {
    Write-Host "nvidia-smi okunamadı; 12 GB RTX 3080 Ti varsayılanı kullanılıyor." -ForegroundColor Yellow
}

$coderModel = if ($vramMb -ge 15000) { "qwen2.5-coder:7b" } else { "qwen2.5-coder:3b" }
$models = @("qwen3:8b", "gemma3:4b", $coderModel)

$ollamaRunning = $false
try {
    $null = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 2
    $ollamaRunning = $true
} catch {}

if (-not $ollamaRunning) {
    Write-Host "Ollama Flash Attention + Q8 KV Cache ayarlarıyla başlatılıyor..." -ForegroundColor Cyan
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 3
}

foreach ($m in $models) {
    Write-Host "Model kontrol/indirme: $m" -ForegroundColor Cyan
    & ollama pull $m
}

if ($WithCoderCouncil) {
    $councilCoders = @("qwen2.5-coder:1.5b", "qwen2.5-coder:7b", "qwen3-coder:7b", "qwen3:4b", "deepseek-r1:8b", "deepseek-r1:14b", "qwen2.5-coder:14b", "qwen3-coder:14b", "deepseek-coder-v2:lite", "starcoder2:7b", "granite-code:8b", "opencoder:8b", "olympiccoder:7b", "codegemma:7b", "codestral:7b", "phi4:14b", "yi-coder:9b", "aya-expanse:8b")
    foreach ($cm in $councilCoders) {
        Write-Host "Proje Geliştirici Konsey açık kaynak modeli indiriliyor: $cm" -ForegroundColor Cyan
        & ollama pull $cm
    }
}

Write-Host "Tüm RTX 3080 Ti takımı <1sn VRAM modunda başlatılıyor..." -ForegroundColor Green
npm run dev
