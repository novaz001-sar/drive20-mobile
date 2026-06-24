# Android APK Packaging

This folder builds the latest web game into an installable Android APK using a small native WebView shell.

## Build

From the repository root:

```powershell
.\android-apk\build-apk.ps1
```

The script copies `index.html` and `src/` into Android assets, compiles the native wrapper, signs a debug APK, and verifies the result.

## Output

The generated APK is written to:

```text
android-apk/dist/HappyDriveMobile-debug.apk
```

Install it on a connected Android device with:

```powershell
adb install -r .\android-apk\dist\HappyDriveMobile-debug.apk
```

This APK is debug-signed for direct device testing. For app store release, generate and use a private release keystore.
