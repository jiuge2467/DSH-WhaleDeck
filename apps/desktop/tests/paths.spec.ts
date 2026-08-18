/**
 * Tests for desktop path resolution.
 */
import { describe, expect, it } from 'vitest'
import { getAppRoot, getDshCliPath, getLogsDir, getUserDataDir, isPackaged } from '../src/main/paths.js'

describe('Desktop Paths Resolver', () => {
  it('should identify packaging status', () => {
    expect(typeof isPackaged).toBe('boolean')
  })

  it('should resolve application root path', () => {
    const root = getAppRoot()
    expect(root).toBeDefined()
    expect(root.length).toBeGreaterThan(0)
  })

  it('should resolve user data directory path', () => {
    const userData = getUserDataDir()
    expect(userData).toBeDefined()
    expect(userData).toContain('dsh-data')
  })

  it('should resolve logs directory path', () => {
    const logs = getLogsDir()
    expect(logs).toBeDefined()
    expect(logs).toContain('logs')
  })

  it('should resolve DSH CLI path', () => {
    const cli = getDshCliPath()
    expect(cli).toBeDefined()
    expect(cli).toMatch(/bin\.(ts|js)$/)
  })
})
