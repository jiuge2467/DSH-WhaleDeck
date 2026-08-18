/**
 * Prepare bundle script for DSH Studio Desktop.
 * Prepares the bundled server files, frontend assets, studio plugins, and desktop resources before packaging.
 * @module @deepseek-ai/dsh-desktop/scripts/prepare-bundle
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(__dirname, '..')
const repoRoot = resolve(desktopRoot, '..', '..')
const bundledServerDir = join(desktopRoot, 'bundled-server')
const resourcesDir = join(desktopRoot, 'resources')

console.log('📦 [DSH Studio Desktop] Preparing clean, ultra-lean bundle assets...')

// 1. Ensure target directories exist & clean previous bundled-server
if (existsSync(bundledServerDir)) {
  rmSync(bundledServerDir, { recursive: true, force: true })
}
mkdirSync(bundledServerDir, { recursive: true })
mkdirSync(resourcesDir, { recursive: true })

// 2. Copy Web Frontend Dist assets
const webDistSrc = join(repoRoot, 'apps', 'web', 'dist')
const webDistDest = join(bundledServerDir, 'apps', 'web', 'dist')

if (existsSync(webDistSrc)) {
  console.log('  -> Copying frontend web dist...')
  mkdirSync(dirname(webDistDest), { recursive: true })
  cpSync(webDistSrc, webDistDest, { recursive: true })
} else {
  console.warn('  [WARN] apps/web/dist not found. Run `pnpm run build:web` before final packaging.')
}

// 3. Copy Built CLI and Configs
const cliSrc = join(repoRoot, 'apps', 'cli')
const cliDest = join(bundledServerDir, 'apps', 'cli')

if (existsSync(join(cliSrc, 'lib'))) {
  console.log('  -> Copying CLI runtime & presets...')
  mkdirSync(cliDest, { recursive: true })
  cpSync(join(cliSrc, 'lib'), join(cliDest, 'lib'), { recursive: true })
  if (existsSync(join(cliSrc, 'config'))) {
    cpSync(join(cliSrc, 'config'), join(cliDest, 'config'), { recursive: true })
  }
  cpSync(join(cliSrc, 'package.json'), join(cliDest, 'package.json'))
}

// 4. Helper: Copy only runtime assets of a workspace package (lib, dist, config, assets, json/yml)
function copyWorkspacePackage(srcPkgDir: string, destDir: string): void {
  const pkgJsonPath = join(srcPkgDir, 'package.json')
  if (!existsSync(pkgJsonPath)) return

  mkdirSync(destDir, { recursive: true })
  cpSync(pkgJsonPath, join(destDir, 'package.json'))

  for (const dirName of ['lib', 'dist', 'config', 'assets']) {
    const p = join(srcPkgDir, dirName)
    if (existsSync(p)) {
      cpSync(p, join(destDir, dirName), {
        recursive: true,
        filter: (file) => {
          const norm = file.replace(/\\/g, '/')
          if (norm.endsWith('.map') || norm.endsWith('.tsbuildinfo')) return false
          return true
        }
      })
    }
  }

  try {
    const entries = readdirSync(srcPkgDir, { withFileTypes: true })
    for (const e of entries) {
      if (e.isFile() && /\.(c?js|mjs|ya?ml|json)$/i.test(e.name) && e.name !== 'tsconfig.json') {
        cpSync(join(srcPkgDir, e.name), join(destDir, e.name))
      }
    }
  } catch {}
}

// 5. Copy Plugins structure for compatibility
const pluginsDir = join(repoRoot, 'plugins')
if (existsSync(pluginsDir)) {
  console.log('  -> Copying studio plugins...')
  const pluginEntries = readdirSync(pluginsDir, { withFileTypes: true })
  for (const pe of pluginEntries) {
    if (!pe.isDirectory() || pe.name.startsWith('.')) continue
    const pSrc = join(pluginsDir, pe.name)
    const pDest = join(bundledServerDir, 'plugins', pe.name)
    copyWorkspacePackage(pSrc, pDest)
  }
}

// 6. Materialize Flattened Standalone node_modules for Packaged Execution
console.log('  -> Materializing flattened standalone node_modules...')
const targetNodeModules = join(bundledServerDir, 'node_modules')
mkdirSync(targetNodeModules, { recursive: true })

function collectPackageDirs(dir: string): string[] {
  if (!existsSync(dir)) return []
  const entries = readdirSync(dir, { withFileTypes: true })
  const results: string[] = []
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue
    const full = join(dir, e.name)
    if (existsSync(join(full, 'package.json'))) {
      results.push(full)
    } else {
      const subEntries = readdirSync(full, { withFileTypes: true })
      for (const sub of subEntries) {
        if (sub.isDirectory() && existsSync(join(full, sub.name, 'package.json'))) {
          results.push(join(full, sub.name))
        }
      }
    }
  }
  return results
}

// 6a. Collect all workspace package directories
const allWorkspacePkgs = [
  ...collectPackageDirs(join(repoRoot, 'packages')),
  ...collectPackageDirs(join(repoRoot, 'vendor')),
  ...collectPackageDirs(join(repoRoot, 'plugins')),
  join(repoRoot, 'apps', 'web'),
  join(repoRoot, 'native', 'landlock-run'),
  ...collectPackageDirs(join(repoRoot, 'native', 'landlock-run', 'packages'))
].filter(p => existsSync(join(p, 'package.json')))

const DEV_PKG_BLACKLIST_PREFIXES = [
  '@types/',
  '@vitest/',
  '@playwright/',
  '@openai/',
  '@anthropic-ai/',
  '@oxlint/',
  '@istanbuljs/',
]

const DEV_PKG_BLACKLIST = new Set([
  'electron',
  'electron-builder',
  'app-builder-bin',
  '7zip-bin',
  'typescript',
  'vitest',
  'playwright',
  'playwright-core',
  'puppeteer',
  'puppeteer-core',
  'esbuild',
  'rollup',
  'vite',
  'tsdown',
  'tsx',
  'jscpd',
  'oxlint',
  'prettier',
  'eslint',
  'c8',
  'v8-to-istanbul',
  'dmg-builder',
  'app-builder-lib'
])

function isDevDependency(name: string): boolean {
  if (DEV_PKG_BLACKLIST.has(name)) return true
  for (const prefix of DEV_PKG_BLACKLIST_PREFIXES) {
    if (name.startsWith(prefix)) return true
  }
  return false
}

function isVersionHigher(v1: string, v2: string): boolean {
  const parse = (v: string) => v.replace(/^[^0-9]*/, '').replace(/-.*$/, '').split('.').map(n => parseInt(n, 10) || 0)
  const [maj1 = 0, min1 = 0, pat1 = 0] = parse(v1)
  const [maj2 = 0, min2 = 0, pat2 = 0] = parse(v2)
  if (maj1 !== maj2) return maj1 > maj2
  if (min1 !== min2) return min1 > min2
  return pat1 > pat2
}

function safeCopyThirdPartyPkg(src: string, dest: string): void {
  const srcPkgJson = join(src, 'package.json')
  const destPkgJson = join(dest, 'package.json')
  if (!existsSync(srcPkgJson)) return

  let shouldCopy = true
  if (existsSync(destPkgJson)) {
    try {
      const srcV = JSON.parse(readFileSync(srcPkgJson, 'utf8')).version || '0.0.0'
      const destV = JSON.parse(readFileSync(destPkgJson, 'utf8')).version || '0.0.0'
      shouldCopy = isVersionHigher(srcV, destV)
    } catch {
      shouldCopy = false
    }
  }

  if (shouldCopy) {
    mkdirSync(dirname(dest), { recursive: true })
    try {
      cpSync(src, dest, {
        recursive: true,
        dereference: true,
        filter: (file) => {
          const norm = file.replace(/\\/g, '/')
          const srcNorm = src.replace(/\\/g, '/')
          const rel = norm.slice(srcNorm.length)
          // Exclude nested node_modules to prevent duplicate singleton conflicts in the flat target tree
          if (rel.includes('/node_modules')) return false
          if (norm.includes('/.git') || norm.includes('/tests') || norm.includes('/test') || norm.includes('/docs')) return false
          if (norm.endsWith('.map') || norm.endsWith('.tsbuildinfo') || norm.endsWith('.md')) return false
          return true
        }
      })
    } catch {}
  }
}

// 6b. Flatten third-party production dependencies from .pnpm
const pnpmDir = join(repoRoot, 'node_modules', '.pnpm')
if (existsSync(pnpmDir)) {
  const pnpmEntries = readdirSync(pnpmDir, { withFileTypes: true })
  for (const entry of pnpmEntries) {
    if (!entry.isDirectory()) continue
    const nmDir = join(pnpmDir, entry.name, 'node_modules')
    if (!existsSync(nmDir)) continue
    
    const subEntries = readdirSync(nmDir, { withFileTypes: true })
    for (const sub of subEntries) {
      if (sub.name.startsWith('@')) {
        const scopeDir = join(nmDir, sub.name)
        const scopedPkgs = readdirSync(scopeDir, { withFileTypes: true })
        for (const sp of scopedPkgs) {
          const fullName = `${sub.name}/${sp.name}`
          if (isDevDependency(fullName)) continue
          safeCopyThirdPartyPkg(join(scopeDir, sp.name), join(targetNodeModules, sub.name, sp.name))
        }
      } else {
        if (isDevDependency(sub.name)) continue
        safeCopyThirdPartyPkg(join(nmDir, sub.name), join(targetNodeModules, sub.name))
      }
    }
  }
}

// 6c. Copy all local workspace packages to node_modules/<pkg-name>
for (const pkgDir of allWorkspacePkgs) {
  try {
    const pkgJson = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
    const pkgName = pkgJson.name
    if (!pkgName) continue
    const dest = join(targetNodeModules, pkgName)
    copyWorkspacePackage(pkgDir, dest)
  } catch {}
}

// 7. Ensure icon.png is present in resources
const iconPngPath = join(resourcesDir, 'icon.png')
const badgePngPath = join(repoRoot, 'packages', 'skill', 'skill-badge', 'assets', 'dsh-badge.png')
if (!existsSync(iconPngPath) && existsSync(badgePngPath)) {
  console.log('  -> Copying default icon.png from assets...')
  cpSync(badgePngPath, iconPngPath)
}

// 8. Post-copy integrity check: ensure no nested node_modules exist
function assertNoNestedNodeModules(dir: string, depth = 0): void {
  if (depth > 0) {
    const base = dir.split(/[/\\]/).pop()
    if (base === 'node_modules') {
      console.error(`[ASSERT FAIL] Nested node_modules detected: ${dir}`)
      process.exitCode = 1
      return
    }
  }
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      assertNoNestedNodeModules(join(dir, entry.name), depth + 1)
    }
  }
}

assertNoNestedNodeModules(targetNodeModules)
if (process.exitCode === 1) {
  throw new Error('[prepare-bundle] Nested node_modules found — packaging aborted.')
}

console.log('✅ [DSH Studio Desktop] Clean bundle assets prepared successfully!')
