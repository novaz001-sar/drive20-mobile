[CmdletBinding()]
param(
    [string]$AndroidHome = $env:ANDROID_HOME,
    [string]$JavaHome = $env:JAVA_HOME,
    [int]$MinSdk = 23,
    [int]$TargetSdk = 36,
    [string]$ApkName = "HappyDriveMobile-debug.apk"
)

$ErrorActionPreference = "Stop"

if (-not $AndroidHome) { $AndroidHome = "D:\DevTools\AndroidSdk" }
if (-not $JavaHome) { $JavaHome = "D:\DevTools\JDK\jdk-26.0.1+8" }

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $ScriptRoot ".."))
$BuildRoot = [System.IO.Path]::GetFullPath((Join-Path $ScriptRoot "build"))
$DistRoot = [System.IO.Path]::GetFullPath((Join-Path $ScriptRoot "dist"))
$KeystoreRoot = [System.IO.Path]::GetFullPath((Join-Path $ScriptRoot "keystore"))

function Assert-Tool {
    param([string]$Path, [string]$Name)
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "$Name not found: $Path"
    }
}

function Remove-GeneratedDirectory {
    param([string]$Path, [string[]]$AllowedRoots)
    $FullPath = [System.IO.Path]::GetFullPath($Path)
    $Allowed = $false
    foreach ($Root in $AllowedRoots) {
        $FullRoot = [System.IO.Path]::GetFullPath($Root)
        if ($FullPath -eq $FullRoot -or $FullPath.StartsWith($FullRoot + [System.IO.Path]::DirectorySeparatorChar)) {
            $Allowed = $true
            break
        }
    }
    if (-not $Allowed) {
        throw "Refusing to remove path outside generated Android folders: $FullPath"
    }
    if (Test-Path -LiteralPath $FullPath) {
        Remove-Item -LiteralPath $FullPath -Recurse -Force
    }
}

$BuildToolsDir = Join-Path $AndroidHome "build-tools"
$PlatformDir = Join-Path $AndroidHome "platforms\android-$TargetSdk"
if (-not (Test-Path -LiteralPath $PlatformDir)) {
    $PlatformDir = Get-ChildItem -LiteralPath (Join-Path $AndroidHome "platforms") -Directory |
        Where-Object { $_.Name -match "^android-\d+$" } |
        Sort-Object { [int]($_.Name -replace "android-", "") } -Descending |
        Select-Object -First 1 -ExpandProperty FullName
}

$BuildTools = Get-ChildItem -LiteralPath $BuildToolsDir -Directory |
    Sort-Object { [version]$_.Name } -Descending |
    Select-Object -First 1 -ExpandProperty FullName

$Aapt = Join-Path $BuildTools "aapt.exe"
$Zipalign = Join-Path $BuildTools "zipalign.exe"
$Apksigner = Join-Path $BuildTools "apksigner.bat"
$D8 = Join-Path $BuildTools "d8.bat"
$AndroidJar = Join-Path $PlatformDir "android.jar"
$Javac = Join-Path $JavaHome "bin\javac.exe"
$Jar = Join-Path $JavaHome "bin\jar.exe"
$Keytool = Join-Path $JavaHome "bin\keytool.exe"

Assert-Tool $Aapt "aapt"
Assert-Tool $Zipalign "zipalign"
Assert-Tool $Apksigner "apksigner"
Assert-Tool $D8 "d8"
Assert-Tool $AndroidJar "android.jar"
Assert-Tool $Javac "javac"
Assert-Tool $Jar "jar"
Assert-Tool $Keytool "keytool"

Remove-GeneratedDirectory $BuildRoot @($BuildRoot)
New-Item -ItemType Directory -Force -Path $BuildRoot, $DistRoot, $KeystoreRoot | Out-Null

$AssetsRoot = Join-Path $BuildRoot "assets"
$WebRoot = Join-Path $AssetsRoot "www"
$GenDir = Join-Path $BuildRoot "gen"
$ClassesDir = Join-Path $BuildRoot "classes"
$DexDir = Join-Path $BuildRoot "dex"

New-Item -ItemType Directory -Force -Path $WebRoot, $GenDir, $ClassesDir, $DexDir | Out-Null

Copy-Item -LiteralPath (Join-Path $ProjectRoot "index.html") -Destination $WebRoot -Force
Copy-Item -LiteralPath (Join-Path $ProjectRoot "src") -Destination $WebRoot -Recurse -Force

$Manifest = Join-Path $ScriptRoot "AndroidManifest.xml"
$ResDir = Join-Path $ScriptRoot "res"
$UnsignedApk = Join-Path $BuildRoot "unsigned.apk"
$AlignedApk = Join-Path $BuildRoot "aligned.apk"
$OutputApk = Join-Path $DistRoot $ApkName
$KeystorePath = Join-Path $KeystoreRoot "debug.keystore"

Write-Host "Using Android SDK: $AndroidHome"
Write-Host "Using build tools: $BuildTools"
Write-Host "Using Java: $JavaHome"

& $Aapt package `
    -f `
    -m `
    -M $Manifest `
    -S $ResDir `
    -A $AssetsRoot `
    -I $AndroidJar `
    -J $GenDir `
    -F $UnsignedApk `
    --min-sdk-version $MinSdk `
    --target-sdk-version $TargetSdk `
    --auto-add-overlay

$JavaSources = @()
$JavaSources += Get-ChildItem -LiteralPath (Join-Path $ScriptRoot "src") -Recurse -Filter "*.java" | ForEach-Object { $_.FullName }
$JavaSources += Get-ChildItem -LiteralPath $GenDir -Recurse -Filter "*.java" | ForEach-Object { $_.FullName }
& $Javac -encoding UTF-8 -source 1.8 -target 1.8 -classpath $AndroidJar -d $ClassesDir $JavaSources

$ClassFiles = Get-ChildItem -LiteralPath $ClassesDir -Recurse -Filter "*.class" | ForEach-Object { $_.FullName }
& $D8 --release --min-api $MinSdk --lib $AndroidJar --output $DexDir $ClassFiles
& $Jar uf $UnsignedApk -C $DexDir classes.dex

if (-not (Test-Path -LiteralPath $KeystorePath)) {
    & $Keytool -genkeypair `
        -keystore $KeystorePath `
        -storepass android `
        -keypass android `
        -alias androiddebugkey `
        -keyalg RSA `
        -keysize 2048 `
        -validity 10000 `
        -dname "CN=Drive20 Mobile Debug,O=novaz001-sar,C=US"
}

if (Test-Path -LiteralPath $AlignedApk) { Remove-Item -LiteralPath $AlignedApk -Force }
if (Test-Path -LiteralPath $OutputApk) { Remove-Item -LiteralPath $OutputApk -Force }
& $Zipalign -f 4 $UnsignedApk $AlignedApk
& $Apksigner sign `
    --ks $KeystorePath `
    --ks-key-alias androiddebugkey `
    --ks-pass pass:android `
    --key-pass pass:android `
    --out $OutputApk `
    $AlignedApk
& $Apksigner verify --verbose --print-certs $OutputApk

Write-Host "APK written to: $OutputApk"
