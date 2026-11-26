$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$python = Join-Path $root 'backend\.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { $python = Join-Path $root '.venv\Scripts\python.exe' }
$processes = @()

function Wait-Endpoint([string]$Url, $Process) {
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if ($Process.HasExited) { throw "Serveur arrete : consulter logs/." }
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
            if ($response.StatusCode -eq 200) { return }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    throw "Delai de demarrage depasse pour $Url. Consulter logs/."
}

try {
    if (-not (Test-Path -LiteralPath $python)) { throw 'Installer backend/.venv selon le README.' }
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $vite = Join-Path $root 'frontend\node_modules\vite\bin\vite.js'
    if (-not (Test-Path -LiteralPath $vite)) { throw 'Executer npm.cmd ci dans frontend.' }
    foreach ($port in @(8000, 5173)) {
        $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if ($listener) { throw "Port $port occupe (PID : $($listener.OwningProcess -join ', ')). Aucun processus existant ne sera arrete." }
    }
    $logs = Join-Path $root 'logs'
    New-Item -ItemType Directory -Path $logs -Force | Out-Null
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $backend = Start-Process -FilePath $python -ArgumentList '-m uvicorn app.main:app --host 127.0.0.1 --port 8000' -WorkingDirectory (Join-Path $root 'backend') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs "$stamp-backend.out.log") -RedirectStandardError (Join-Path $logs "$stamp-backend.err.log")
    $processes += $backend
    Wait-Endpoint 'http://127.0.0.1:8000/' $backend
    # Une seule lecture du classeur : eviter les requetes concurrentes au demarrage.
    Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8000/api/analytics/kpis' -TimeoutSec 120 | Out-Null
    $frontend = Start-Process -FilePath $node -ArgumentList "`"$vite`" --host 127.0.0.1 --port 5173 --strictPort" -WorkingDirectory (Join-Path $root 'frontend') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs "$stamp-frontend.out.log") -RedirectStandardError (Join-Path $logs "$stamp-frontend.err.log")
    $processes += $frontend
    Wait-Endpoint 'http://127.0.0.1:5173/' $frontend
    Write-Host 'ENSA EnergyOS disponible : http://localhost:5173/'
    Write-Host "Journaux : $logs"
    Read-Host 'Appuyer sur Entree pour arreter les deux serveurs' | Out-Null
} catch {
    Write-Host "ERREUR : $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    foreach ($process in $processes) {
        if (-not $process.HasExited) {
            # Le Python de .venv peut creer un processus enfant sous Windows.
            & taskkill.exe /PID $process.Id /T /F | Out-Null
            $process.WaitForExit()
        }
    }
}
