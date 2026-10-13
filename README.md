# Happy Drive Mobile

Happy Drive Mobile is the mobile-first version of `drive20`. It keeps the maze-driving gameplay, level system, map editor, waypoint mode, custom 3D assets, sound effects, and settings from the original project while improving the experience for phones and tablets.

## Live Demo

https://novaz001-sar.github.io/drive20-mobile/

## Mobile-Focused Features

- Gesture-based driving on any empty game area.
- Built-in Chinese and English interfaces with a remembered language choice.
- Large touch targets and readable interface text for tablet and phone users.
- First-person and third-person camera modes, including adjustable third-person controls.
- Solid maze walls with textured tops in both camera modes; upload a local image under Settings > Texture Settings > Wall Top to customize all wall tops independently.
- A selectable beveled 3D arrow avatar matching the minimap's red body, bold yellow left border, bright white right border, and green rear edge.
- Minimap options for fixed and rotating views.
- Custom map editor with walls, paths, start/goal cells, numbered waypoints, free waypoints, highlight floors, and asset size controls.
- Optimized 3D assets for vehicles, goal characters, and free waypoint figures.
- Sound effects for movement, turns, collisions, waypoints, and victories.
- Android WebView packaging support for building an APK.

## Run Locally

Do not open `index.html` directly with a `file:///` URL. The project uses ES modules, import maps, GLB models, and other browser-loaded assets, so it must be served over HTTP.

From PowerShell:

```powershell
.\open-local.ps1
```

Then open:

```text
http://127.0.0.1:8080/index.html
```

If you prefer a simple manual server:

```powershell
python -m http.server 8080
```

## Android APK

The Android WebView project is included in `android-apk/`.

Build a debug APK:

```powershell
.\android-apk\build-apk.ps1
```

Output:

```text
android-apk/dist/HappyDriveMobile-debug.apk
```

Install on a connected Android device:

```powershell
adb install -r .\android-apk\dist\HappyDriveMobile-debug.apk
```

## Repository Structure

```text
.
|-- index.html
|-- src/
|   |-- assets/
|   |   |-- models/
|   |   |-- textures/
|   |   `-- vendor/
|   |-- js/
|   `-- styles/
|-- tools/
|-- android-apk/
|-- open-local.ps1
`-- README.md
```

## Notes for Collaborators

- Use a local HTTP server for development.
- Keep large generated or temporary files out of the repository unless they are required runtime assets.
- After changing asset files, update cache-busting query strings in `index.html` or the relevant JavaScript constants.
- Test both desktop and mobile-sized viewports before publishing.
