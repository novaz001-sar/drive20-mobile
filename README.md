# 快乐驾驶移动版

这是从 `drive20` 派生的移动端版本，保留原有迷宫驾驶玩法、关卡、地图编辑器和设置功能，同时优化手机和平板上的触控体验。

## 移动端改造重点

- 底部大号驾驶按钮：左转、前进、右转、后退、菜单。
- 更大的字体、表单和菜单按钮，降低误触。
- 更高对比度的配色和明显的焦点样式。
- 大地图增加明确的“开始驾驶”按钮。
- 手机和平板横竖屏布局适配。

部署地址：

https://novaz001-sar.github.io/drive20-mobile/

## 本地打开

不要直接双击 `index.html` 或用 `file:///.../index.html` 打开。项目使用 ES module、importmap 和 GLB 模型资源，浏览器会拦截 `file://` 模块加载并产生 CORS 报错。

在 PowerShell 中运行：

```powershell
.\open-local.ps1
```

然后使用脚本打开的本地地址：

```text
http://127.0.0.1:8080/index.html
```

## Android APK

本项目已经包含 Android WebView 打包工程，位于 `android-apk/`。生成可安装 APK：

```powershell
.\android-apk\build-apk.ps1
```

输出文件：

```text
android-apk/dist/HappyDriveMobile-debug.apk
```

连接 Android 设备后安装：

```powershell
adb install -r .\android-apk\dist\HappyDriveMobile-debug.apk
```
