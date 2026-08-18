/**
 * Persistence contract tests: stored numbers must be range-validated (a
 * broken or hand-edited value falls back to the default — never a 0px or NaN
 * panel), and the preview-scope registry evicts beyond the 12-scope cap.
 */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createDebounced, PREVIEW_SCOPE_CAP, PREVIEW_SCOPE_PREFIX, evictPreviewScopes,
  listPreviewScopes, readJson, readStoredNumber, removeStoredByPrefix,
  writeJson, writeStoredNumber,
} from '../src/client/persist.ts'

beforeEach(() => {
  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const key = localStorage.key(i)
    if (key !== null) localStorage.removeItem(key)
  }
})

describe('readStoredNumber', () => {
  it('returns the fallback when nothing is stored', () => {
    expect(readStoredNumber('chat-workspace-width-px', 220, 500, 260)).toBe(260)
  })

  it('reads a valid stored value', () => {
    localStorage.setItem('chat-workspace-width-px', '330')
    expect(readStoredNumber('chat-workspace-width-px', 220, 500, 260)).toBe(330)
  })

  it('falls back on out-of-range, NaN, and garbage values', () => {
    localStorage.setItem('k', '0')
    expect(readStoredNumber('k', 220, 500, 260)).toBe(260)
    localStorage.setItem('k', '9999')
    expect(readStoredNumber('k', 220, 500, 260)).toBe(260)
    localStorage.setItem('k', 'abc')
    expect(readStoredNumber('k', 220, 500, 260)).toBe(260)
    localStorage.setItem('k', '')
    expect(readStoredNumber('k', 220, 500, 260)).toBe(260)
    localStorage.setItem('k', '260.7')
    expect(readStoredNumber('k', 220, 500, 260)).toBe(260.7)
  })
})

describe('writeStoredNumber', () => {
  it('rounds and writes', () => {
    writeStoredNumber('k', 260.4)
    expect(localStorage.getItem('k')).toBe('260')
  })
})

describe('preview scope registry', () => {
  it('lists scopes with savedAt', () => {
    writeJson('preview-ui:/a', { savedAt: 10, tabs: [] })
    writeJson('preview-ui:/b', { savedAt: 20, tabs: [] })
    const scopes = listPreviewScopes()
    expect(scopes).toEqual([{ root: '/a', savedAt: 10 }, { root: '/b', savedAt: 20 }])
  })

  it('evicts the oldest scopes beyond the cap', () => {
    for (let i = 0; i < PREVIEW_SCOPE_CAP + 3; i += 1) {
      writeJson(`${PREVIEW_SCOPE_PREFIX}/p${i}`, { savedAt: i, tabs: [] })
    }
    evictPreviewScopes(`/p${PREVIEW_SCOPE_CAP + 2}`)
    const scopes = listPreviewScopes()
    expect(scopes.length).toBe(PREVIEW_SCOPE_CAP)
    expect(scopes[0].root).toBe('/p3')
    expect(scopes.some((scope) => scope.root === '/p0')).toBe(false)
    expect(scopes.some((scope) => scope.root === `/p${PREVIEW_SCOPE_CAP + 2}`)).toBe(true)
  })
})

describe('readJson', () => {
  it('falls back on invalid JSON', () => {
    localStorage.setItem('k', '{broken')
    expect(readJson('k', { fallback: true })).toEqual({ fallback: true })
  })
})

describe('removeStoredByPrefix', () => {
  it('removes only prefixed keys, never foreign-application keys', () => {
    localStorage.setItem('preview-ui:/a', 'x')
    localStorage.setItem('preview-ui:/b', 'x')
    localStorage.setItem('explorer-ui:/w', 'x')
    localStorage.setItem('other-app:data', 'x')
    const removed = removeStoredByPrefix(PREVIEW_SCOPE_PREFIX)
    expect(removed).toBe(2)
    expect(localStorage.getItem('preview-ui:/a')).toBeNull()
    expect(localStorage.getItem('preview-ui:/b')).toBeNull()
    expect(localStorage.getItem('explorer-ui:/w')).toBe('x')
    expect(localStorage.getItem('other-app:data')).toBe('x')
  })

  it('returns 0 when the prefix matches nothing', () => {
    expect(removeStoredByPrefix('scm-ui:')).toBe(0)
  })

  it('listPreviewScopes stays exact for the shared preview-ui prefix', () => {
    writeJson('preview-ui:/a', { savedAt: 5, tabs: [] })
    writeJson('preview-ui:/b', { savedAt: 9, tabs: [] })
    // A foreign sibling key under a look-alike prefix is not collected.
    localStorage.setItem('preview-ui-extra:/z', 'x')
    const scopes = listPreviewScopes()
    expect(scopes.map((scope) => scope.root)).toEqual(['/a', '/b'])
  })
})

describe('createDebounced', () => {
  it('coalesces rapid schedules into one trailing run (latest wins)', async () => {
    const debounced = createDebounced(30)
    const seen: string[] = []
    debounced.schedule(() => { seen.push('a') })
    debounced.schedule(() => { seen.push('b') })
    debounced.schedule(() => { seen.push('c') })
    expect(seen).toEqual([])
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(seen).toEqual(['c'])
    debounced.dispose()
  })

  it('flush runs the pending fn immediately and reuse schedules again', () => {
    const debounced = createDebounced(1_000_000)
    const seen: string[] = []
    debounced.schedule(() => { seen.push('first') })
    debounced.flush()
    expect(seen).toEqual(['first'])
    debounced.schedule(() => { seen.push('second') })
    debounced.flush()
    expect(seen).toEqual(['first', 'second'])
    debounced.dispose()
  })

  it('dispose cancels a pending fn', async () => {
    const debounced = createDebounced(10)
    const seen: string[] = []
    debounced.schedule(() => { seen.push('nope') })
    debounced.dispose()
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(seen).toEqual([])
  })
})
