/**
 * Path and directory resolution for DSH Studio Desktop.
 * Handles development, packaged (app.asar / asar.unpacked), and portable execution paths.
 * Defensively falls back to process environments when running under unit tests / plain Node.
 * @module @deepseek-ai/dsh-desktop/paths
 */

import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import electron from 'electron'

const app = electron?.app

/** Whether the application is running inside a packaged app.asar bundle. */
export const isPackaged: boolean = Boolean(app?.isPackaged)

/** Root directory of the application bundle or workspace. */
export function getAppRoot(): string {
  if (isPackaged && app?.getAppPath) {
    return join(app.getAppPath(), '..', 'bundled-server')
  }
  // In development, find the workspace root containing pnpm-workspace.yaml
  let current = app?.getAppPath ? app.getAppPath() : process.cwd()
  while (current && current !== resolve(current, '..')) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) {
      return current
    }
    current = resolve(current, '..')
  }
  return app?.getAppPath ? app.getAppPath() : process.cwd()
}

/** User data directory where DSH profiles and session databases reside. */
export function getUserDataDir(): string {
  const customHome = process.env.DSH_HOME
  if (customHome && customHome.trim().length > 0) {
    return resolve(customHome)
  }
  if (app?.getPath) {
    return join(app.getPath('userData'), 'dsh-data')
  }
  return join(process.cwd(), '.dsh-data')
}

/** Application logs directory. */
export function getLogsDir(): string {
  const logsPath = app?.getPath
    ? join(app.getPath('userData'), 'logs')
    : join(process.cwd(), '.dsh-logs')

  if (!existsSync(logsPath)) {
    mkdirSync(logsPath, { recursive: true })
  }
  return logsPath
}

/**
 * Resolves the path to the DSH CLI entry point.
 * In development: apps/cli/src/bin.ts or apps/cli/lib/bin.js
 * In production: apps/cli/lib/bin.js under bundled-server
 */
export function getDshCliPath(): string {
  const appRoot = getAppRoot()
  
  if (isPackaged) {
    const packagedEntry = join(appRoot, 'apps', 'cli', 'lib', 'bin.js')
    if (existsSync(packagedEntry)) return packagedEntry
  }

  const devJsEntry = join(appRoot, 'apps', 'cli', 'lib', 'bin.js')
  if (existsSync(devJsEntry)) return devJsEntry

  const devTsEntry = join(appRoot, 'apps', 'cli', 'src', 'bin.ts')
  return devTsEntry
}

/**
 * Resolves the resources directory containing icons and HTML assets.
 */
export function getResourcesDir(): string {
  if (isPackaged && app?.getAppPath) {
    return join(app.getAppPath(), 'resources')
  }
  const appRoot = getAppRoot()
  const devResources = join(appRoot, 'apps', 'desktop', 'resources')
  if (existsSync(devResources)) return devResources
  return join(appRoot, 'resources')
}

/**
 * Resolves the path to the Studio patch file (studio.cordis.patch.yml).
 */
export function getStudioPatchPath(): string {
  const resourcesDir = getResourcesDir()
  const patchFile = join(resourcesDir, 'studio.cordis.patch.yml')
  if (existsSync(patchFile)) return patchFile

  const appRoot = getAppRoot()
  return join(appRoot, 'resources', 'studio.cordis.patch.yml')
}

