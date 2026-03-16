$ErrorActionPreference = 'Stop'

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $projectRoot

$defaultJavaHome = 'C:\Program Files\Android\Android Studio\jbr'
if (-not $env:JAVA_HOME -or -not (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
  if (Test-Path (Join-Path $defaultJavaHome 'bin\java.exe')) {
    $env:JAVA_HOME = $defaultJavaHome
  } else {
    throw "JAVA_HOME is not set to a valid JDK and Android Studio JBR was not found at '$defaultJavaHome'."
  }
}

$env:Path = "$env:JAVA_HOME\bin;$env:Path"

if (-not $env:ANDROID_HOME) {
  $env:ANDROID_HOME = Join-Path $env:USERPROFILE 'AppData\Local\Android\Sdk'
}
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:Path = "$env:ANDROID_HOME\platform-tools;$env:Path"

$adb = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
if (-not (Test-Path $adb)) {
  throw "adb not found at '$adb'. Ensure Android SDK Platform-Tools are installed."
}

$gradleWrapper = Join-Path $projectRoot 'src-tauri\gen\android\gradlew.bat'
if (-not (Test-Path $gradleWrapper)) {
  throw "Gradle wrapper not found at '$gradleWrapper'. Run 'npm run tauri:android:init' first."
}

$androidProjectDir = Join-Path $projectRoot 'src-tauri\gen\android'
& $gradleWrapper --project-dir $androidProjectDir :app:assembleUniversalDebug
if ($LASTEXITCODE -ne 0) {
  throw 'Gradle build failed.'
}

$apk = Join-Path $projectRoot 'src-tauri\gen\android\app\build\outputs\apk\universal\debug\app-universal-debug.apk'
if (-not (Test-Path $apk)) {
  $apk = Get-ChildItem (Join-Path $projectRoot 'src-tauri\gen\android\app\build\outputs\apk') -Recurse -Filter *.apk |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not $apk -or -not (Test-Path $apk)) {
  throw 'No APK found after build.'
}

$deviceLines = & $adb devices | Select-Object -Skip 1
$onlineDevices = @($deviceLines | Where-Object { $_ -match '\sdevice$' })
if ($onlineDevices.Count -eq 0) {
  throw 'No USB device in "device" state found. Check cable, USB debugging, and authorization prompt.'
}

Write-Host "Installing APK: $apk"
& $adb install -r $apk
if ($LASTEXITCODE -ne 0) {
  throw 'APK install failed.'
}

Write-Host 'APK installed successfully.'
