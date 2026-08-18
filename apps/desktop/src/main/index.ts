/**
 * DSH Studio Desktop Electron Main Process Entry Point.
 * Orchestrates single instance lock, lifecycle events, window, tray, and background daemon.
 * @module @deepseek-ai/dsh-desktop/main
 */

import { app, dialog } from 'electron'
import { ServerManager } from './server-manager.js'
import { TrayManager } from './tray.js'
import { WindowManager } from './window.js'

// 1. Enforce Single Instance Lock
const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  // If another instance is already running, exit silently
  app.quit()
} else {
  let windowManager: WindowManager | null = null
  let serverManager: ServerManager | null = null
  let trayManager: TrayManager | null = null

  // Focus existing window when user attempts to launch a second instance
  app.on('second-instance', () => {
    windowManager?.showAndFocus()
  })

  app.whenReady().then(async () => {
    windowManager = new WindowManager()
    serverManager = new ServerManager()
    trayManager = new TrayManager(windowManager, serverManager)

    // 1. Instantly display splash window for immediate visual feedback
    windowManager.createSplashWindow()

    try {
      // 2. Boot background DSH Web Server
      const serverUrl = await serverManager.start()

      // 3. Create Main Window & System Tray
      windowManager.createMainWindow(serverUrl)
      trayManager.createTray()
    } catch (error) {
      console.error('[FATAL] Failed to initialize DSH Studio Desktop:', error)
      dialog.showErrorBox(
        'DSH Studio 启动失败',
        `本地服务初始化失败，原因:\n${error instanceof Error ? error.message : String(error)}\n\n请检查端口占用或查看日志文件。`
      )
      windowManager.closeAll()
      app.quit()
    }
  })

  // Prevent app from quitting when all windows are closed (keep running in Tray)
  app.on('window-all-closed', () => {
    // Keep app alive in tray across all platforms
  })

  app.on('activate', () => {
    windowManager?.showAndFocus()
  })

  // Gracefully clean up child processes on exit
  app.on('before-quit', async (event) => {
    windowManager?.setForceQuitting(true)
    trayManager?.destroy()
    if (serverManager) {
      event.preventDefault()
      await serverManager.stop()
      app.exit(0)
    }
  })
}
