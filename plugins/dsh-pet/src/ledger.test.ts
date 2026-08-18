import { describe, expect, it } from 'vitest'
import { defaultTreatConfig } from './treats.ts'
import { defaultAffinityConfig } from './affinity.ts'
import { emptyPersist } from './persist.ts'
import { PetLedger } from './ledger.ts'

describe('PetLedger', () => {
  it('settles the economy on completed turns (work treat per 3 turns)', () => {
    const ledger = new PetLedger(emptyPersist())
    const n = 1_000_000
    ledger.rewardTurn('s1', 1, n)
    ledger.rewardTurn('s1', 2, n + 1)
    ledger.rewardTurn('s1', 3, n + 2)
    expect(ledger.snapshot.affinity.turns).toBe(3)
    expect(ledger.snapshot.treats.treats).toBe(1)
    expect(ledger.takeDirty()).toBe(true)
  })

  it('rewards each completed turn once per session (idempotent)', () => {
    const ledger = new PetLedger(emptyPersist())
    const n = 1_000_000
    expect(ledger.rewardTurn('s1', 3, n)).toBe(true)
    // A duplicate delivery of the same turn must not double count.
    expect(ledger.rewardTurn('s1', 3, n + 1)).toBe(false)
    expect(ledger.snapshot.affinity.turns).toBe(1)
  })

  it('a read of the view does not mark dirty (no settle on read)', () => {
    const ledger = new PetLedger(emptyPersist())
    ledger.affinityView(1_000_000)
    expect(ledger.takeDirty()).toBe(false)
  })

  it('feed consumes a treat and applies the feed reward', () => {
    const ledger = new PetLedger(emptyPersist())
    const n = 1_000_000
    ledger.rewardTurn('s1', 1, n)
    ledger.rewardTurn('s1', 2, n + 1)
    ledger.rewardTurn('s1', 3, n + 2)
    expect(ledger.snapshot.treats.treats).toBe(1)
    const res = ledger.interact('feed', n + 10)
    expect(res.delta).toBe(defaultAffinityConfig.feedReward)
    expect(ledger.snapshot.treats.treats).toBe(0)
    expect(ledger.snapshot.affinity.feeds).toBe(1)
  })

  it('refuses a feed on an empty stock without burning anything', () => {
    const ledger = new PetLedger(emptyPersist())
    const res = ledger.interact('feed', 1_000_000)
    expect(res.delta).toBe(0)
    expect(res.reaction).toContain('没有小鱼干')
    expect(ledger.snapshot.affinity.feeds).toBe(0)
    // The empty-stock feed still marks dirty because the first settlement
    // starts the time clock, mirroring the service-level behavior.
    expect(ledger.takeDirty()).toBe(true)
  })

  it('exposes the treat stock cap and display/name setters', () => {
    const ledger = new PetLedger(emptyPersist())
    expect(ledger.treatMax).toBe(defaultTreatConfig.maxTreats)
    ledger.setDisplay({ ...ledger.snapshot.display, visible: false })
    ledger.setName('泡泡')
    expect(ledger.snapshot.display.visible).toBe(false)
    expect(ledger.snapshot.name).toBe('泡泡')
    expect(ledger.takeDirty()).toBe(true)
  })
})
