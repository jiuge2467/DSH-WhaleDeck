/**
 * Tests for port probe and server manager.
 */
import net from 'node:net'
import { describe, expect, it } from 'vitest'
import { getAvailablePort, ServerManager } from '../src/main/server-manager.js'

describe('Server Manager & Port Prober', () => {
  it('should find preferred port when free', async () => {
    const port = await getAvailablePort(3999)
    expect(port).toBe(3999)
  })

  it('should allocate fallback port when preferred port is occupied', async () => {
    // Bind 3998 temporarily
    const dummyServer = net.createServer()
    await new Promise<void>((resolve) => {
      dummyServer.listen(3998, '127.0.0.1', () => resolve())
    })

    try {
      const port = await getAvailablePort(3998)
      expect(port).not.toBe(3998)
      expect(port).toBeGreaterThan(0)
    } finally {
      await new Promise<void>((resolve) => dummyServer.close(() => resolve()))
    }
  })

  it('should initialize ServerManager with configured host and port', () => {
    const manager = new ServerManager({ preferredPort: 3090, host: '127.0.0.1' })
    expect(manager.getPort()).toBe(3090)
    expect(manager.getUrl()).toBe('http://127.0.0.1:3090')
    expect(manager.isServerReady()).toBe(false)
  })
})
