/**
 * Tests for process-killer.
 */
import { spawn } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { killProcessTree } from '../src/main/process-killer.js'

describe('Process Tree Killer', () => {
  it('should safely handle non-existent or invalid PIDs', async () => {
    await expect(killProcessTree(0)).resolves.toBeUndefined()
    await expect(killProcessTree(-1)).resolves.toBeUndefined()
  })

  it('should terminate a spawned process cleanly', async () => {
    // Spawn a long-running sleep/ping process
    const child = process.platform === 'win32'
      ? spawn('ping', ['127.0.0.1', '-n', '10'], { stdio: 'ignore' })
      : spawn('sleep', ['10'], { stdio: 'ignore' })

    expect(child.pid).toBeDefined()
    const pid = child.pid!

    await killProcessTree(pid)

    // Give OS time to update process table
    await new Promise((r) => setTimeout(r, 200))

    let isRunning = true
    try {
      isRunning = process.kill(pid, 0)
    } catch {
      isRunning = false
    }

    expect(isRunning).toBe(false)
  })
})
