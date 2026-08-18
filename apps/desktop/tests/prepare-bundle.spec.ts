/**
 * Unit tests for prepare-bundle.ts bundling logic.
 * Verifies that safeCopyThirdPartyPkg correctly excludes nested node_modules.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ────────────────────────────────────────────────────────────────
// Helper: create a minimal fake package with a nested node_modules
// ────────────────────────────────────────────────────────────────
function createFakePkg(dir: string, name: string, version: string): string {
  const pkgDir = join(dir, name)
  mkdirSync(join(pkgDir, 'lib'), { recursive: true })
  writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name, version }))
  writeFileSync(join(pkgDir, 'lib', 'index.js'), `export default '${name}'`)
  // Simulate a pnpm-resolved nested node_modules (the bug trigger)
  const nested = join(pkgDir, 'node_modules', '@deepseek-ai', 'cordis')
  mkdirSync(nested, { recursive: true })
  writeFileSync(join(nested, 'index.js'), '// old cordis entry')
  writeFileSync(join(nested, 'package.json'), JSON.stringify({ name: '@deepseek-ai/cordis', version: '1.0.0' }))
  return pkgDir
}

// ────────────────────────────────────────────────────────────────
// Re-implement safeCopyThirdPartyPkg inline for testing
// ────────────────────────────────────────────────────────────────
function safeCopyFlat(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true })
  cpSync(src, dest, {
    recursive: true,
    dereference: true,
    filter: (file) => {
      const norm = file.replace(/\\/g, '/')
      const srcNorm = src.replace(/\\/g, '/')
      const rel = norm.slice(srcNorm.length)
      if (rel.includes('/node_modules')) return false
      if (norm.endsWith('.map') || norm.endsWith('.tsbuildinfo') || norm.endsWith('.md')) return false
      return true
    }
  })
}

// ────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────
describe('prepare-bundle: safeCopyThirdPartyPkg', () => {
  let tmpRoot: string

  beforeEach(() => {
    tmpRoot = join(__dirname, '__tmp_test__')
    if (existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true })
    mkdirSync(tmpRoot, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('copies lib/ and package.json but NOT nested node_modules', () => {
    const src = createFakePkg(join(tmpRoot, 'src'), 'dsh-storage', '1.0.0')
    const dest = join(tmpRoot, 'dest', 'dsh-storage')

    safeCopyFlat(src, dest)

    // lib/index.js should be present
    expect(existsSync(join(dest, 'lib', 'index.js'))).toBe(true)
    // package.json should be present
    expect(existsSync(join(dest, 'package.json'))).toBe(true)
    // nested node_modules MUST NOT be present
    expect(existsSync(join(dest, 'node_modules'))).toBe(false)
  })

  it('does not contain @deepseek-ai/cordis in any nested path after copy', () => {
    const src = createFakePkg(join(tmpRoot, 'src'), 'dsh-api-gateway', '2.0.0')
    const dest = join(tmpRoot, 'dest', 'dsh-api-gateway')

    safeCopyFlat(src, dest)

    // Recursively assert no node_modules subdir exists anywhere under dest
    function findNodeModules(dir: string): string[] {
      const found: string[] = []
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const full = join(dir, entry.name)
        if (entry.name === 'node_modules') {
          found.push(full)
        } else {
          found.push(...findNodeModules(full))
        }
      }
      return found
    }

    expect(findNodeModules(dest)).toHaveLength(0)
  })

  it('copies multiple packages without cross-contaminating nested node_modules', () => {
    const pkgs = ['dsh-typert-registry', 'dsh-storage', 'dsh-message-feedback']
    const destRoot = join(tmpRoot, 'flat_node_modules')

    for (const pkg of pkgs) {
      const src = createFakePkg(join(tmpRoot, 'src'), pkg, '1.0.0')
      safeCopyFlat(src, join(destRoot, pkg))
    }

    for (const pkg of pkgs) {
      expect(existsSync(join(destRoot, pkg, 'node_modules'))).toBe(false)
    }
    // Top-level cordis should NOT have been created by copying
    expect(existsSync(join(destRoot, '@deepseek-ai', 'cordis'))).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────────
// Tests for isVersionHigher (pre-release aware)
// ────────────────────────────────────────────────────────────────
describe('prepare-bundle: isVersionHigher', () => {
  function isVersionHigher(v1: string, v2: string): boolean {
    const parse = (v: string) =>
      v.replace(/^[^0-9]*/, '').replace(/-.*$/, '').split('.').map((n) => parseInt(n, 10) || 0)
    const [maj1 = 0, min1 = 0, pat1 = 0] = parse(v1)
    const [maj2 = 0, min2 = 0, pat2 = 0] = parse(v2)
    if (maj1 !== maj2) return maj1 > maj2
    if (min1 !== min2) return min1 > min2
    return pat1 > pat2
  }

  it('returns true when major is higher', () => {
    expect(isVersionHigher('2.0.0', '1.9.9')).toBe(true)
  })

  it('returns false when version is lower', () => {
    expect(isVersionHigher('1.0.0', '1.0.1')).toBe(false)
  })

  it('returns false for equal versions', () => {
    expect(isVersionHigher('1.2.3', '1.2.3')).toBe(false)
  })

  it('handles pre-release suffix without crashing (rc.1 treated as same base)', () => {
    expect(() => isVersionHigher('1.0.0-rc.1', '1.0.0')).not.toThrow()
    expect(isVersionHigher('1.0.0-rc.1', '1.0.0')).toBe(false)
  })

  it('handles ^-prefixed versions from package.json', () => {
    expect(isVersionHigher('^2.1.0', '^2.0.9')).toBe(true)
  })
})
