/**
 * Preload script for DSH Studio Desktop.
 * Provides safe, context-isolated bridge between Electron and web renderer.
 * @module @deepseek-ai/dsh-desktop/preload
 */

import { contextBridge } from 'electron'

// Expose safe desktop environment flags
contextBridge.exposeInMainWorld('dshDesktop', {
  isDesktop: true,
  platform: process.platform,
  version: process.env.npm_package_version || '0.1.0',
})
