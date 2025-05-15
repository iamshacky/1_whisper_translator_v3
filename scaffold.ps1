
# scaffold.ps1
# Usage: open PowerShell, cd to your project root, then:
#   .\scaffold.ps1

# 1) Directories to create
$dirs = @(
  'client\public',
  'client\src\components',
  'client\src\utils',
  'client\src\styles',
  'server\src\controllers',
  'server\src\middleware',
  'server\src\services',
  'server\src\utils',
  'config',
  'scripts',
  'docker'
)

foreach ($d in $dirs) {
  if (-not (Test-Path $d)) {
    New-Item -ItemType Directory -Path $d -Force | Out-Null
    Write-Host "Created directory: $d"
  }
}

# 2) Helper: writes a file if it doesn't exist (or always overwrite)
function Write-File($path, $content) {
  Write-Host "Creating file: $path"
  $dir = Split-Path $path
  # only attempt Test-Path / New-Item if $dir is non-empty
  if ($dir) {
    if (-not (Test-Path $dir)) {
      New-Item -ItemType Directory -Path $dir -Force | Out-Null
      Write-Host "  └─ Created directory: $dir"
    }
  }
  Set-Content -Path $path -Value $content -Encoding UTF8
}

# 3) Boilerplate contents

$indexHtml = @'
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Voice Translator</title>
</head>
<body>
  <div id="app"></div>
  <script src="../src/index.js"></script>
</body>
</html>
'@

$packageJsonClient = @'
{
  "name": "voice-translator-client",
  "version": "0.1.0"
}
'@

$clientReadme = @'
# Client Setup

1. npm install
2. npm run dev
'@

$packageJsonServer = @'
{
  "name": "voice-translator-server",
  "version": "0.1.0"
}
'@

$serverReadme = @'
# Server Setup

1. npm install
2. node src/index.js
'@

$dockerClient = @'
# FROM node:16-alpine
# TODO: build your client image
'@

$dockerServer = @'
# FROM node:16-alpine
# TODO: build your server image
'@

$rootReadme = @'
# Voice Translator

Overview of the project...
'@

$gitignore = @'
node_modules/
.env
'@

# 4) Create files

Write-File 'client\public\index.html'      $indexHtml
Write-File 'client\src\index.js'           '// Entry point: bootstrap your PWA here'
Write-File 'client\src\serviceWorker.js'   '/* Service Worker for offline support */'
Write-File 'client\src\components\TranslatorUI.js'   '// TODO: build your main translator UI component'
Write-File 'client\src\components\LanguageSelector.js' '// TODO: language dropdown component'
Write-File 'client\src\utils\audioUtils.js' '// TODO: audio capture `& chunking helpers'
Write-File 'client\src\styles\main.css'     '/* TODO: your styles */'
Write-File 'client\package.json'            $packageJsonClient
Write-File 'client\README.md'               $clientReadme

Write-File 'server\src\index.js'            '// Express + WebSocket server entrypoint'
Write-File 'server\src\controllers\wsHandler.js'  "// TODO: handle 'connection' & 'message' events"
Write-File 'server\src\controllers\translate.js'  '// TODO: call Whisper & GPT here'
Write-File 'server\src\middleware\auth.js'  '// TODO: your auth logic'
Write-File 'server\src\services\openaiService.js' '// TODO: wrap OpenAI API calls'
Write-File 'server\src\utils\bufferQueue.js'     '// TODO: implement chunk buffering / batching'
Write-File 'server\package.json'            $packageJsonServer
Write-File 'server\README.md'               $serverReadme

Write-File 'config\languages.json'           '["en","es","fr","de"]'
Write-File 'scripts\scaffold.ps1'            '# Keep this script to regenerate boilerplate if needed.'
Write-File 'docker\Dockerfile.client'        $dockerClient
Write-File 'docker\Dockerfile.server'        $dockerServer

Write-File 'README.md'                       $rootReadme
Write-File 'LICENSE'                         'MIT License'
Write-File '.gitignore'                      $gitignore

Write-Host "`n✅ Scaffold complete! Open this folder in VS Code to start filling in the pieces.`n"
