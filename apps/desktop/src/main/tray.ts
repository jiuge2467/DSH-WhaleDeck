/**
 * System Tray management for DSH Studio Desktop.
 * Provides background residency and quick access context menu.
 * @module @deepseek-ai/dsh-desktop/tray
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, Menu, nativeImage, shell, Tray, type NativeImage } from 'electron'
import { getLogsDir, getResourcesDir, getUserDataDir, isPackaged } from './paths.js'
import type { ServerManager } from './server-manager.js'
import type { WindowManager } from './window.js'

export class TrayManager {
  private tray: Tray | null = null

  constructor(
    private windowManager: WindowManager,
    private serverManager: ServerManager,
  ) {}

  /**
   * Initialize and display the system tray icon and menu.
   */
  public createTray(): Tray {
    if (this.tray) return this.tray

    const iconImage = this.loadTrayIcon()
    this.tray = new Tray(iconImage)
    this.tray.setToolTip('DSH Studio')

    this.updateContextMenu()

    this.tray.on('click', () => {
      const mainWindow = this.windowManager.getMainWindow()
      if (mainWindow && mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        this.windowManager.showAndFocus()
      }
    })

    return this.tray
  }

  private loadTrayIcon(): NativeImage {
    const resourcesDir = getResourcesDir()

    const pngPath = join(resourcesDir, 'icon.png')
    const icoPath = join(resourcesDir, 'icon.ico')

    if (process.platform === 'win32' && existsSync(icoPath)) {
      return nativeImage.createFromPath(icoPath)
    }
    if (existsSync(pngPath)) {
      return nativeImage.createFromPath(pngPath)
    }

    // Return empty 16x16 icon as ultimate fallback
    return nativeImage.createEmpty()
  }

  public updateContextMenu(): void {
    if (!this.tray) return

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示 DSH Studio',
        click: () => this.windowManager.showAndFocus(),
      },
      {
        label: '在浏览器中打开',
        click: () => shell.openExternal(this.serverManager.getUrl()),
      },
      { type: 'separator' },
      {
        label: '重启后台服务',
        click: async () => {
          await this.serverManager.restart()
          const mainWindow = this.windowManager.getMainWindow()
          if (mainWindow) {
            mainWindow.loadURL(this.serverManager.getUrl())
          }
        },
      },
      {
        label: '打开数据目录',
        click: () => shell.openPath(getUserDataDir()),
      },
      {
        label: '打开日志目录',
        click: () => shell.openPath(getLogsDir()),
      },
      { type: 'separator' },
      {
        label: '彻底退出',
        click: () => {
          this.windowManager.setForceQuitting(true)
          app.quit()
        },
      },
    ])

    this.tray.setContextMenu(contextMenu)
  }

  public destroy(): void {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
  }
}
