/**
 * Background DSH Studio Web Server lifecycle manager.
 * Spawns the DSH CLI, detects listening port, performs HTTP health probes, and manages teardown.
 * @module @deepseek-ai/dsh-desktop/server-manager
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync, type WriteStream } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import { join } from 'node:path'
import { getAppRoot, getDshCliPath, getLogsDir, getStudioPatchPath, getUserDataDir, isPackaged } from './paths.js'
import { killProcessTree } from './process-killer.js'

export interface ServerManagerOptions {
  preferredPort?: number
  host?: string
}

/**
 * Pure Node.js port probe that tests preferredPort and falls back to an ephemeral free port if busy.
 */
export async function getAvailablePort(preferredPort: number = 3080, host: string = '127.0.0.1'): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.on('error', () => {
      // Preferred port is in use, allocate an ephemeral free port
      const fallbackServer = net.createServer()
      fallbackServer.unref()
      fallbackServer.listen(0, host, () => {
        const address = fallbackServer.address()
        const port = typeof address === 'object' && address !== null ? address.port : preferredPort + 1
        fallbackServer.close(() => resolve(port))
      })
      fallbackServer.on('error', () => resolve(preferredPort + 1))
    })
    server.listen(preferredPort, host, () => {
      server.close(() => resolve(preferredPort))
    })
  })
}

/**
 * Ensures that the plugin modules are directly resolvable under $DSH_HOME/profiles/node_modules
 * and that the web profile has the studio plugins configured in cordis.patch.yml.
 */
export function ensurePluginsFallback(homeDir: string, appRoot: string): void {
  const profilesNodeModules = join(homeDir, 'profiles', 'node_modules')
  const linxinScope = join(profilesNodeModules, '@linxin666')
  try {
    mkdirSync(profilesNodeModules, { recursive: true })
    mkdirSync(linxinScope, { recursive: true })
  } catch {
    // Ignore mkdir errors
  }

  const pluginsDir = join(appRoot, 'plugins')

  if (existsSync(pluginsDir)) {
    const mappings: [string, string][] = [
      ['dsh-better-sidebar', join(pluginsDir, 'dsh-better-sidebar')],
      ['dsh-better-sidebar-skills', join(pluginsDir, 'dsh-better-sidebar-skills')],
      ['dsh-better-sidebar-mcp', join(pluginsDir, 'dsh-better-sidebar-mcp')],
      ['dsh-mascot-pet', join(pluginsDir, 'dsh-mascot-pet')],
      ['@linxin666/dsh-client-ui-web-ui-settings', join(pluginsDir, 'dsh-web-ui-settings')],
      ['@linxin666/dsh-client-ui-task-board', join(pluginsDir, 'dsh-task-board')],
      ['@linxin666/dsh-remote-web-ui', join(pluginsDir, 'dsh-remote-web-ui')],
      ['@linxin666/dsh-live-stats', join(pluginsDir, 'dsh-live-stats')],
      ['@linxin666/dsh-ssh', join(pluginsDir, 'dsh-ssh')],
      ['@linxin666/dsh-tool-describe-image', join(pluginsDir, 'dsh-tool-describe-image')],
      ['@linxin666/dsh-liangshen', join(pluginsDir, 'dsh-liangshen')],
      ['@linxin666/dsh-client-ui-skin-center', join(pluginsDir, 'skins', 'skin-center')],
    ]

    for (const [name, target] of mappings) {
      if (!existsSync(target)) continue
      const linkPath = join(profilesNodeModules, name)
      try {
        if (!existsSync(linkPath)) {
          symlinkSync(target, linkPath, 'junction')
        }
      } catch {
        // Ignore link creation errors
      }
    }
  }

  // Ensure $DSH_HOME/profiles/web/cordis.patch.yml has studio plugins
  const webProfileDir = join(homeDir, 'profiles', 'web')
  const webPatchFile = join(webProfileDir, 'cordis.patch.yml')
  const studioPatchFile = getStudioPatchPath()

  try {
    mkdirSync(webProfileDir, { recursive: true })
    if (existsSync(studioPatchFile)) {
      const patchContent = readFileSync(studioPatchFile, 'utf8')
      if (!existsSync(webPatchFile) || !readFileSync(webPatchFile, 'utf8').includes('dsh-better-sidebar')) {
        writeFileSync(webPatchFile, patchContent)
      }
    }
  } catch {
    // Ignore file write errors
  }
}

export class ServerManager {
  private host: string
  private port: number
  private process: ChildProcess | null = null
  private logStream: WriteStream | null = null
  private isReady: boolean = false
  private startingPromise: Promise<string> | null = null

  constructor(private options: ServerManagerOptions = {}) {
    this.host = options.host || '127.0.0.1'
    this.port = options.preferredPort || 3080
  }

  public getUrl(): string {
    return `http://${this.host}:${this.port}`
  }

  public getPort(): number {
    return this.port
  }

  public isServerReady(): boolean {
    return this.isReady
  }

  /**
   * Start the DSH Web Server daemon and wait for HTTP 200 health check.
   * @returns The active Web Server URL.
   */
  public async start(): Promise<string> {
    if (this.isReady) {
      return this.getUrl()
    }
    if (this.startingPromise) {
      return this.startingPromise
    }

    this.startingPromise = this.bootInternal()
    try {
      const url = await this.startingPromise
      return url
    } finally {
      this.startingPromise = null
    }
  }

  private async bootInternal(): Promise<string> {
    // 1. Pick an available port
    this.port = await getAvailablePort(this.options.preferredPort || 3080, this.host)

    const cliPath = getDshCliPath()
    const appRoot = getAppRoot()
    const userDataDir = getUserDataDir()
    const logFilePath = join(getLogsDir(), 'dsh-server.log')
    this.logStream = createWriteStream(logFilePath, { flags: 'a' })

    // 2. Ensure studio plugins and profile patch are linked into the profile's home directory
    ensurePluginsFallback(userDataDir, appRoot)

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DSH_HOME: userDataDir,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_PATH: join(appRoot, 'node_modules'),
      NODE_ENV: isPackaged ? 'production' : (process.env.NODE_ENV || 'development'),
    }

    const args = ['web', '--host', this.host, '--port', String(this.port)]

    if (cliPath.endsWith('.ts')) {
      // In dev mode with TypeScript sources, run via node --import tsx/esm
      this.process = spawn('node', ['--import', 'tsx/esm', cliPath, ...args], {
        cwd: appRoot,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } else {
      // With built JavaScript, execute via process.execPath (in packaged app) or node
      const execBinary = isPackaged ? process.execPath : 'node'
      this.process = spawn(execBinary, [cliPath, ...args], {
        cwd: appRoot,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    }

    const timestamp = new Date().toISOString()
    this.logStream.write(`\n[${timestamp}] --- Starting DSH Studio Server (Port: ${this.port}) ---\n`)

    this.process.stdout?.on('data', (chunk: Buffer) => {
      this.logStream?.write(chunk)
    })

    this.process.stderr?.on('data', (chunk: Buffer) => {
      this.logStream?.write(chunk)
    })

    this.process.on('error', (err) => {
      this.logStream?.write(`\n[ERROR] Failed to spawn DSH server process: ${err.message}\n`)
    })

    this.process.on('exit', (code, signal) => {
      this.isReady = false
      this.logStream?.write(`\n[EXIT] DSH server exited with code: ${code}, signal: ${signal}\n`)
    })

    // Wait for HTTP 200 health check response
    await this.pollHealthCheck(30000, 500)
    this.isReady = true
    return this.getUrl()
  }

  /**
   * Polls the server until HTTP 200 is returned or timeout is reached.
   */
  private async pollHealthCheck(timeoutMs: number, intervalMs: number): Promise<void> {
    const startTime = Date.now()
    const url = this.getUrl()

    while (Date.now() - startTime < timeoutMs) {
      if (this.process?.exitCode !== null && this.process?.exitCode !== undefined) {
        throw new Error(`DSH Server exited prematurely with code ${this.process.exitCode}`)
      }

      try {
        const isHealthy = await new Promise<boolean>((resolve) => {
          const req = http.get(url, { timeout: intervalMs }, (res) => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
              resolve(true)
            } else {
              resolve(false)
            }
            res.resume()
          })
          req.on('error', () => resolve(false))
          req.on('timeout', () => {
            req.destroy()
            resolve(false)
          })
        })

        if (isHealthy) {
          return
        }
      } catch {
        // Continue polling
      }

      await new Promise((r) => setTimeout(r, intervalMs))
    }

    throw new Error(`DSH Studio server failed to respond at ${url} within ${timeoutMs / 1000}s`)
  }

  /**
   * Restarts the server daemon.
   */
  public async restart(): Promise<string> {
    await this.stop()
    return this.start()
  }

  /**
   * Gracefully terminate the server daemon and all spawned child processes.
   */
  public async stop(): Promise<void> {
    this.isReady = false
    if (this.process && this.process.pid) {
      await killProcessTree(this.process.pid)
      this.process = null
    }
    if (this.logStream) {
      this.logStream.end()
      this.logStream = null
    }
  }
}
