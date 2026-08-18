// @vitest-environment jsdom
/**
 * Single-timer multi-cadence refresher spec — the merged-tick contract that
 * replaced the three independent setInterval loops in apply(). One interval
 * drives all jobs and each job fires only when its own period has elapsed,
 * preserving the per-panel cadences (quotes/workspaces 30s, sessions 60s)
 * while holding a single timer to own and dispose.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRefreshScheduler, type RefreshScheduler } from '../src/client/refresh-scheduler.ts'

const QUOTES_MS = 30_000
const SESSIONS_MS = 60_000

let scheduler: RefreshScheduler | undefined

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  scheduler?.stop()
  scheduler = undefined
  vi.useRealTimers()
})

describe('createRefreshScheduler', () => {
  it('runs each job once per its own period from a single tick', () => {
    let quotes = 0
    let sessions = 0
    let workspaces = 0
    scheduler = createRefreshScheduler([
      { periodMs: QUOTES_MS, run: () => { quotes += 1 } },
      { periodMs: SESSIONS_MS, run: () => { sessions += 1 } },
      { periodMs: QUOTES_MS, run: () => { workspaces += 1 } },
    ], QUOTES_MS)
    scheduler.start()

    // 30s tick: quotes + workspaces due, sessions (60s) not yet.
    vi.advanceTimersByTime(QUOTES_MS)
    expect(quotes).toBe(1)
    expect(sessions).toBe(0)
    expect(workspaces).toBe(1)

    // 60s mark: everything due again.
    vi.advanceTimersByTime(QUOTES_MS)
    expect(quotes).toBe(2)
    expect(sessions).toBe(1)
    expect(workspaces).toBe(2)

    // 90s mark: sessions still held to its 60s period (every 2nd tick).
    vi.advanceTimersByTime(QUOTES_MS)
    expect(quotes).toBe(3)
    expect(sessions).toBe(1)
    expect(workspaces).toBe(3)
  })

  it('stop() clears the interval and further ticks are no-ops', () => {
    let quotes = 0
    let sessions = 0
    scheduler = createRefreshScheduler([
      { periodMs: QUOTES_MS, run: () => { quotes += 1 } },
      { periodMs: SESSIONS_MS, run: () => { sessions += 1 } },
    ], QUOTES_MS)
    scheduler.start()
    vi.advanceTimersByTime(QUOTES_MS)
    expect(quotes).toBe(1)
    expect(sessions).toBe(0)

    scheduler.stop()
    vi.advanceTimersByTime(QUOTES_MS * 3)
    // No further ticks after stop — dispose keeps the timer from leaking.
    expect(quotes).toBe(1)
    expect(sessions).toBe(0)
  })

  it('start() is idempotent and stop() is idempotent', () => {
    let runs = 0
    scheduler = createRefreshScheduler([{ periodMs: QUOTES_MS, run: () => { runs += 1 } }], QUOTES_MS)
    scheduler.start()
    scheduler.start()
    vi.advanceTimersByTime(QUOTES_MS)
    expect(runs).toBe(1)

    scheduler.stop()
    scheduler.stop()
    vi.advanceTimersByTime(QUOTES_MS)
    expect(runs).toBe(1)
  })
})
