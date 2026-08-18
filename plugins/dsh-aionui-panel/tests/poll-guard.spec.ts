/**
 * PollGuard contract tests: the bounded refresh loop the /aionui-panel SSE
 * stream drives for git-status polling. At most one run in flight, consecutive
 * failures back off (capped), the loop stops at its deadline, and stop() drops
 * the pending tick — the same guarantees the stream's disconnect relies on.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PollGuard, type PollTimers } from '../src/host/poll-guard.ts'

/** Deterministic manual clock: set() records the callback+delay, fire() runs it. */
class FakeTimers implements PollTimers {
  pending: Array<{ fn: () => void; ms: number }> = []
  set(fn: () => void, ms: number): unknown {
    const entry = { fn, ms }
    this.pending.push(entry)
    return entry
  }
  clear(handle: unknown): void {
    const index = this.pending.indexOf(handle as { fn: () => void; ms: number })
    if (index >= 0) this.pending.splice(index, 1)
  }
  nextDelay(): number {
    if (this.pending.length === 0) throw new Error('no pending tick')
    return this.pending[0].ms
  }
  async fire(): Promise<void> {
    const entry = this.pending.shift()
    if (entry === undefined) throw new Error('no pending tick')
    entry.fn()
    await new Promise<void>(resolve => { setTimeout(resolve, 0) })
  }
}

let nowSpy: ReturnType<typeof vi.spyOn> | undefined
afterEach(() => {
  nowSpy?.mockRestore()
  nowSpy = undefined
})

describe('PollGuard', () => {
  it('runs on schedule and stops at the deadline', async () => {
    const timers = new FakeTimers()
    const run = vi.fn(async () => {})
    const onDeadline = vi.fn()
    const guard = new PollGuard({ intervalMs: 30, deadlineMs: 100, maxBackoffMs: 200, timers, onRun: run, onDeadline })
    nowSpy = vi.spyOn(Date, 'now').mockReturnValue(0)
    guard.start()
    expect(timers.nextDelay()).toBe(30)
    await timers.fire()
    expect(run).toHaveBeenCalledTimes(1)
    vi.mocked(Date.now).mockReturnValue(200)
    await timers.fire()
    expect(run).toHaveBeenCalledTimes(1)
    expect(onDeadline).toHaveBeenCalledTimes(1)
  })

  it('never overlaps runs: the next tick is only scheduled after the run settles', async () => {
    const timers = new FakeTimers()
    let release: (() => void) | undefined
    const gate = new Promise<void>(resolve => { release = resolve })
    const run = vi.fn(async () => { await gate })
    const guard = new PollGuard({ intervalMs: 10, deadlineMs: 1000, maxBackoffMs: 100, timers, onRun: run })
    nowSpy = vi.spyOn(Date, 'now').mockReturnValue(0)
    guard.start()
    await timers.fire()
    expect(run).toHaveBeenCalledTimes(1)
    expect(timers.pending.length).toBe(0)
    release!()
    await new Promise<void>(resolve => { setTimeout(resolve, 0) })
    expect(timers.pending.length).toBe(1)
    await timers.fire()
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('backs off on consecutive failures and resets on success', async () => {
    const timers = new FakeTimers()
    let calls = 0
    const onSettled = vi.fn()
    const guard = new PollGuard({
      intervalMs: 10,
      deadlineMs: 1000,
      maxBackoffMs: 200,
      timers,
      onSettled,
      onRun: async () => {
        calls += 1
        if (calls <= 2) throw new Error('boom')
      },
    })
    nowSpy = vi.spyOn(Date, 'now').mockReturnValue(0)
    guard.start()
    expect(timers.nextDelay()).toBe(10)
    await timers.fire()
    expect(onSettled).toHaveBeenLastCalledWith(1)
    expect(timers.nextDelay()).toBe(20)
    await timers.fire()
    expect(timers.nextDelay()).toBe(40)
    await timers.fire()
    expect(timers.nextDelay()).toBe(10)
    expect(onSettled).toHaveBeenLastCalledWith(0)
  })

  it('stop() drops the pending tick', async () => {
    const timers = new FakeTimers()
    const guard = new PollGuard({ intervalMs: 10, deadlineMs: 1000, maxBackoffMs: 100, timers, onRun: async () => {} })
    nowSpy = vi.spyOn(Date, 'now').mockReturnValue(0)
    guard.start()
    expect(timers.pending.length).toBe(1)
    guard.stop()
    expect(timers.pending.length).toBe(0)
  })
})
