// @vitest-environment jsdom
/**
 * Incremental code-index cache spec — the 30s refresh used to re-derive
 * every workspace's delta from scratch each tick; now per-workspace deltas
 * are cached keyed by the candle's (close, open) pair so an unchanged candle
 * reuses the cached delta. These tests pin the behaviour equivalence: net is
 * always the sum of each current workspace's (last.close - last.open), and
 * only genuinely changed or new workspaces re-derive their delta.
 */
import { describe, expect, it } from 'vitest'
import { accumulateCodeIndex, type CodeIndexCache } from '../src/client/code-index.ts'

describe('accumulateCodeIndex', () => {
  it('sums deltas over valid candles like the full recompute', () => {
    const { net, cache, changed } = accumulateCodeIndex(
      [
        { workspaceId: 'a', last: { close: 110, open: 100 } }, // +10
        { workspaceId: 'b', last: { close: 90, open: 100 } },  // -10
        { workspaceId: 'c', last: { close: 105, open: 105 } }, // 0
      ],
      new Map(),
    )
    expect(net).toBe(0)
    expect(changed).toBe(3)
    expect(cache.get('a')?.delta).toBe(10)
    expect(cache.get('b')?.delta).toBe(-10)
    expect(cache.get('c')?.delta).toBe(0)
  })

  it('reuses cached deltas for unchanged candles', () => {
    const first = accumulateCodeIndex(
      [
        { workspaceId: 'a', last: { close: 110, open: 100 } }, // +10
        { workspaceId: 'b', last: { close: 90, open: 100 } },  // -10
      ],
      new Map(),
    )
    // Same candles again: nothing re-derived, cache entries reused.
    const second = accumulateCodeIndex(
      [
        { workspaceId: 'a', last: { close: 110, open: 100 } },
        { workspaceId: 'b', last: { close: 90, open: 100 } },
      ],
      first.cache,
    )
    expect(second.changed).toBe(0)
    expect(second.net).toBe(0)
    expect(second.cache.get('a')?.delta).toBe(10)
    expect(second.cache.get('b')?.delta).toBe(-10)
  })

  it('re-derives only the workspaces whose candle changed', () => {
    const first = accumulateCodeIndex(
      [
        { workspaceId: 'a', last: { close: 110, open: 100 } }, // +10
        { workspaceId: 'b', last: { close: 90, open: 100 } },  // -10
      ],
      new Map(),
    )
    // b moves to +5; a stays unchanged and is reused.
    const second = accumulateCodeIndex(
      [
        { workspaceId: 'a', last: { close: 110, open: 100 } },
        { workspaceId: 'b', last: { close: 105, open: 100 } }, // +5
      ],
      first.cache,
    )
    expect(second.changed).toBe(1)
    expect(second.net).toBe(15)
    expect(second.cache.get('b')?.delta).toBe(5)
  })

  it('drops workspaces absent from the frame and preserves equality with a fresh recompute', () => {
    const first = accumulateCodeIndex(
      [
        { workspaceId: 'a', last: { close: 110, open: 100 } },
        { workspaceId: 'b', last: { close: 90, open: 100 } },
      ],
      new Map(),
    )
    // Frame 2 drops a, keeps b (unchanged): b's delta is reused.
    const second = accumulateCodeIndex([{ workspaceId: 'b', last: { close: 90, open: 100 } }], first.cache)
    expect(second.net).toBe(-10)
    expect(second.changed).toBe(0)
    expect(second.cache.has('a')).toBe(false)
    expect(second.cache.get('b')?.delta).toBe(-10)

    // A fresh full recompute of the same frame yields the same net — behaviour
    // equivalence with the original always-rescan path.
    const fresh = accumulateCodeIndex([{ workspaceId: 'b', last: { close: 90, open: 100 } }], new Map())
    expect(fresh.net).toBe(second.net)
  })

  it('treats a workspace with no usable candle as a zero contribution', () => {
    const { net, cache } = accumulateCodeIndex(
      [
        { workspaceId: 'a', last: { close: 115, open: 100 } }, // +15
        { workspaceId: 'empty' },
      ],
      new Map(),
    )
    expect(net).toBe(15)
    expect(cache.has('empty')).toBe(false)
  })
});
