/** @vitest-environment jsdom */

/**
 * Compatibility scope state machine: the official scope stays authoritative
 * while it serves the namespace; the bridge controller takes over its
 * unavailable state on loopback; writes route to the active transport; and a
 * remote browser (no fetch) keeps the official process-local behavior.
 */

import { describe, expect, it, vi } from 'vitest'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { createCompatScope } from '../src/client/compat-settings-scope.ts'
import { WEB_UI_SETTINGS_BRIDGE_PREFIX } from '../src/protocol.ts'

// The rc.6 runtime client bundle registers itself through the GUI module
// loader, so importing its value under vitest yields no exports. Provide a
// minimal snapshot store with the same contract (getSnapshot / subscribe /
// set / draft-style update) for the bridge controller and the fake primary.
vi.mock('@deepseek-ai/dsh-client-runtime/client', () => ({
  createSnapshotStore: <T>(initial: T) => {
    let snapshot = { ...initial }
    const listeners = new Set<() => void>()
    const publish = (): void => {
      for (const listener of listeners) listener()
    }
    return {
      getSnapshot: (): T => snapshot,
      subscribe: (listener: () => void): (() => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      set: (next: T): void => {
        snapshot = { ...next }
        publish()
      },
      update: (mutator: (draft: T) => void): void => {
        const draft = { ...snapshot }
        mutator(draft)
        snapshot = { ...draft }
        publish()
      },
    }
  },
}))

import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** A manual primary scope: a snapshot store plus recorded writes. */
function fakePrimary<T>(initial: SettingsScopeSnapshot<T>) {
  const store = createSnapshotStore<SettingsScopeSnapshot<T>>(initial)
  const sets: Array<[string, unknown]> = []
  return {
    scope: {
      getSnapshot: () => store.getSnapshot(),
      subscribe: (listener: () => void) => store.subscribe(listener),
      set: async (field: string, value: unknown) => { sets.push([field, value]) },
      unset: async () => {},
    } satisfies SettingsScope<T>,
    update: (patch: Partial<SettingsScopeSnapshot<T>>) => { store.set({ ...store.getSnapshot(), ...patch }) },
    sets,
  }
}

/** A bridge describe payload for one namespace. */
function bridgeView(ns: string, value: unknown, revision: number) {
  return { ns, schema: {}, value, revision }
}

/** The describe result the fake host bridge answers. */
function describeResult(namespaces: ReturnType<typeof bridgeView>[]) {
  return { ok: true, value: { namespaces, writable: true } }
}

/** A fetch stub serving the bridge route pair (the spy counts calls). */
function fakeFetch(handler: (url: string, init: RequestInit) => Promise<unknown> | unknown) {
  const spy = vi.fn(handler)
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const payload = await spy(url, init ?? {})
    return { ok: true, status: 200, json: async () => payload } as unknown as Response
  }) as unknown as typeof fetch
  return { fetchFn, handler: spy }
}

const ready = <T>(value: T, revision = 1): SettingsScopeSnapshot<T> => ({
  status: 'ready',
  value,
  base: undefined,
  user: undefined,
  revision,
  writable: true,
  mode: 'host',
})

const unavailable = (): SettingsScopeSnapshot<never> => ({
  status: 'unavailable',
  value: undefined,
  base: undefined,
  user: undefined,
  revision: undefined,
  writable: false,
  mode: 'host',
})

describe('createCompatScope', () => {
  it('passes the official scope through while it serves the namespace', () => {
    const primary = fakePrimary<{ enabled: boolean }>(ready({ enabled: true }))
    const { fetchFn, handler } = fakeFetch(async () => describeResult([]))
    const scope = createCompatScope<{ enabled: boolean }>({ namespace: 'task-board', primary: primary.scope, fetchFn })
    expect(scope.getSnapshot().status).toBe('ready')
    expect(scope.getSnapshot().value).toEqual({ enabled: true })
    expect(handler).not.toHaveBeenCalled()
  })

  it('bridges the namespace when the official scope reports unavailable', async () => {
    const primary = fakePrimary<{ enabled: boolean }>(unavailable())
    const { fetchFn, handler } = fakeFetch(async () => describeResult([bridgeView('task-board', { enabled: true }, 3)]))
    const scope = createCompatScope<{ enabled: boolean }>({ namespace: 'task-board', primary: primary.scope, fetchFn })
    await vi.waitFor(() => { expect(scope.getSnapshot().status).toBe('ready') })
    expect(scope.getSnapshot().value).toEqual({ enabled: true })
    expect(scope.getSnapshot().revision).toBe(3)
    expect(scope.getSnapshot().writable).toBe(true)
    expect(handler).toHaveBeenCalled()
  })

  it('stays unavailable when the bridge does not serve the namespace', async () => {
    const primary = fakePrimary<{ enabled: boolean }>(unavailable())
    const { fetchFn } = fakeFetch(async () => describeResult([]))
    const scope = createCompatScope<{ enabled: boolean }>({ namespace: 'task-board', primary: primary.scope, fetchFn })
    await vi.waitFor(() => { expect(scope.getSnapshot().status).toBe('unavailable') })
    expect(scope.getSnapshot().status).toBe('unavailable')
  })

  it('never builds a bridge without a fetch (remote browser)', async () => {
    const primary = fakePrimary<{ enabled: boolean }>(unavailable())
    const scope = createCompatScope<{ enabled: boolean }>({ namespace: 'task-board', primary: primary.scope })
    await vi.waitFor(() => { expect(scope.getSnapshot().status).toBe('unavailable') })
    expect(scope.getSnapshot().status).toBe('unavailable')
  })

  it('routes writes to the official scope while it is ready', async () => {
    const primary = fakePrimary<{ enabled: boolean }>(ready({ enabled: true }))
    const { fetchFn } = fakeFetch(async () => describeResult([]))
    const scope = createCompatScope<{ enabled: boolean }>({ namespace: 'task-board', primary: primary.scope, fetchFn })
    await scope.set('enabled', false)
    expect(primary.sets).toEqual([['enabled', false]])
  })

  it('routes writes through the bridge when it took over', async () => {
    const primary = fakePrimary<{ enabled: boolean }>(unavailable())
    const mutateCalls: Array<{ url: string; body: Record<string, unknown> }> = []
    const { fetchFn } = fakeFetch(async (url, init) => {
      if (url === WEB_UI_SETTINGS_BRIDGE_PREFIX + '/describe') return describeResult([bridgeView('task-board', { enabled: true }, 3)])
      mutateCalls.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> })
      return { ok: true, value: bridgeView('task-board', { enabled: false }, 4) }
    })
    const scope = createCompatScope<{ enabled: boolean }>({ namespace: 'task-board', primary: primary.scope, fetchFn })
    await vi.waitFor(() => { expect(scope.getSnapshot().status).toBe('ready') })
    await scope.set('enabled', false)
    expect(mutateCalls).toHaveLength(1)
    expect(mutateCalls[0].url).toBe(WEB_UI_SETTINGS_BRIDGE_PREFIX + '/mutate')
    expect(mutateCalls[0].body.ns).toBe('task-board')
    expect(mutateCalls[0].body.expectedRevision).toBe(3)
  })

  it('turns a dropped bridge call into a quiet unavailable', async () => {
    const primary = fakePrimary<{ enabled: boolean }>(unavailable())
    const { fetchFn } = fakeFetch(async () => { throw new Error('network down') })
    const scope = createCompatScope<{ enabled: boolean }>({ namespace: 'task-board', primary: primary.scope, fetchFn })
    await vi.waitFor(() => { expect(scope.getSnapshot().status).toBe('unavailable') })
    expect(scope.getSnapshot().status).toBe('unavailable')
  })
})
