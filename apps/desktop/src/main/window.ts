/**
 * Window management for DSH Studio Desktop.
 * Creates and orchestrates Splash Window and Main BrowserWindow instances.
 * @module @deepseek-ai/dsh-desktop/window
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, shell } from 'electron'
import { getResourcesDir } from './paths.js'

export class WindowManager {
  private splashWindow: BrowserWindow | null = null
  private mainWindow: BrowserWindow | null = null
  private isForceQuitting: boolean = false

  public setForceQuitting(value: boolean): void {
    this.isForceQuitting = value
  }

  /**
   * Create and display the brand loading Splash Window.
   */
  public createSplashWindow(): BrowserWindow {
    if (this.splashWindow && !this.splashWindow.isDestroyed()) {
      return this.splashWindow
    }

    const resourcesDir = getResourcesDir()

    this.splashWindow = new BrowserWindow({
      width: 460,
      height: 320,
      frame: false,
      transparent: true,
      resizable: false,
      show: true,
      center: true,
      alwaysOnTop: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    })

    const splashHtmlPath = join(resourcesDir, 'splash.html')
    if (existsSync(splashHtmlPath)) {
      this.splashWindow.loadFile(splashHtmlPath)
    }

    this.splashWindow.on('closed', () => {
      this.splashWindow = null
    })

    return this.splashWindow
  }

  /**
   * Create the Main Application BrowserWindow and load the DSH Web UI.
   * @param targetUrl - Loopback Web server URL.
   */
  public createMainWindow(targetUrl: string): BrowserWindow {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.showAndFocus()
      return this.mainWindow
    }

    const resourcesDir = getResourcesDir()
    const icoPath = join(resourcesDir, 'icon.ico')
    const pngPath = join(resourcesDir, 'icon.png')
    const windowIcon = existsSync(icoPath) ? icoPath : (existsSync(pngPath) ? pngPath : undefined)

    this.mainWindow = new BrowserWindow({
      width: 1280,
      height: 850,
      minWidth: 960,
      minHeight: 640,
      show: true,
      backgroundColor: '#0d1117',
      title: 'DSH Studio',
      icon: windowIcon,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    })

    if (this.splashWindow && !this.splashWindow.isDestroyed()) {
      this.splashWindow.close()
      this.splashWindow = null
    }

    this.mainWindow.show()
    this.mainWindow.focus()

    // Open external links in default browser
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http:') || url.startsWith('https:')) {
        shell.openExternal(url)
      }
      return { action: 'deny' }
    })

    // Handle close button: minimize to tray unless force quitting
    this.mainWindow.on('close', (event) => {
      if (!this.isForceQuitting) {
        event.preventDefault()
        this.mainWindow?.hide()
      }
    })

    this.mainWindow.loadURL(targetUrl)

    this.mainWindow.webContents.once('did-finish-load', () => {
      this.mainWindow?.show()
      this.mainWindow?.focus()
    })

    // Safety fallback: ensure mainWindow becomes visible even if did-finish-load is delayed
    setTimeout(() => {
      if (this.mainWindow && !this.mainWindow.isDestroyed() && !this.mainWindow.isVisible()) {
        if (this.splashWindow && !this.splashWindow.isDestroyed()) {
          this.splashWindow.close()
          this.splashWindow = null
        }
        this.mainWindow.show()
        this.mainWindow.focus()
      }
    }, 1500)

    return this.mainWindow
  }

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  /**
   * Restore and focus the main window.
   */
  public showAndFocus(): void {
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore()
      }
      if (!this.mainWindow.isVisible()) {
        this.mainWindow.show()
      }
      this.mainWindow.focus()
    }
  }

  public closeAll(): void {
    this.isForceQuitting = true
    if (this.splashWindow && !this.splashWindow.isDestroyed()) {
      this.splashWindow.destroy()
      this.splashWindow = null
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.destroy()
      this.mainWindow = null
    }
  }
}
