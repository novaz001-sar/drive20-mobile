[CmdletBinding()]
param(
    [int]$Port = 8080,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$ProjectRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$Url = "http://127.0.0.1:$Port/index.html"

function Test-PortListening {
    param([int]$PortToCheck)
    return [bool](Get-NetTCPConnection -LocalPort $PortToCheck -State Listen -ErrorAction SilentlyContinue)
}

function Get-FirstCommandPath {
    param([string[]]$Candidates)
    foreach ($Candidate in $Candidates) {
        if (Test-Path -LiteralPath $Candidate) { return $Candidate }
        $Command = Get-Command $Candidate -ErrorAction SilentlyContinue
        if ($Command) { return $Command.Source }
    }
    return $null
}

if (-not (Test-PortListening $Port)) {
    $Python = Get-FirstCommandPath @(
        "C:\Users\zstom\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe",
        "py",
        "python"
    )

    if ($Python) {
        Start-Process -FilePath $Python `
            -ArgumentList @("-m", "http.server", "$Port", "--bind", "127.0.0.1", "--directory", $ProjectRoot) `
            -WindowStyle Hidden | Out-Null
    } else {
        $Node = Get-FirstCommandPath @(
            "node",
            "C:\Users\zstom\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
        )
        if (-not $Node) {
            throw "No Python or Node.js runtime found. Install Python, then run: python -m http.server $Port --bind 127.0.0.1 --directory `"$ProjectRoot`""
        }

        $ServerScript = Join-Path $env:TEMP "drive20-static-server.js"
        @'
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2]);
const port = Number(process.argv[3] || 8080);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary'
};

http.createServer((req, res) => {
  const parsed = new URL(req.url, 'http://127.0.0.1');
  let pathname = decodeURIComponent(parsed.pathname);
  if (pathname === '/') pathname = '/index.html';
  const file = path.resolve(root, '.' + pathname);

  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}).listen(port, '127.0.0.1');
'@ | Set-Content -LiteralPath $ServerScript -Encoding UTF8

        Start-Process -FilePath $Node `
            -ArgumentList @($ServerScript, $ProjectRoot, "$Port") `
            -WindowStyle Hidden | Out-Null
    }

    $Deadline = (Get-Date).AddSeconds(8)
    while (-not (Test-PortListening $Port)) {
        if ((Get-Date) -gt $Deadline) {
            throw "Local server did not start on port $Port."
        }
        Start-Sleep -Milliseconds 200
    }
}

Write-Host "Happy Drive Mobile is running at: $Url"
Write-Host "Use this HTTP URL instead of opening index.html with file://."

if (-not $NoBrowser) {
    Start-Process $Url
}
