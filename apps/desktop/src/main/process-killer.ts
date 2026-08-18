/**
 * Cross-platform process tree termination helper.
 * Uses native Windows taskkill and Unix process group signals to guarantee clean teardown with zero external dependencies.
 * @module @deepseek-ai/dsh-desktop/process-killer
 */

import { exec } from 'node:child_process'

/**
 * Kill a process and all of its spawned child processes recursively.
 * @param pid - Process ID to terminate.
 * @param signal - Signal to send on Unix systems (default: 'SIGTERM').
 */
export async function killProcessTree(pid: number, signal: string = 'SIGTERM'): Promise<void> {
  if (!pid || pid <= 0) return

  return new Promise<void>((resolvePromise) => {
    if (process.platform === 'win32') {
      // Windows: taskkill /pid <PID> /T /F terminates the process and all child processes created by it
      exec(`taskkill /pid ${pid} /T /F`, () => {
        resolvePromise()
      })
    } else {
      // Unix: kill process group first (negative PID), then single PID
      try {
        process.kill(-pid, signal as NodeJS.Signals)
      } catch {
        try {
          process.kill(pid, signal as NodeJS.Signals)
        } catch {
          // Process already terminated
        }
      }
      resolvePromise()
    }
  })
}
