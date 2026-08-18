/**
 * Pet affinity economy (ledger) — composes the pure affinity and treats
 * modules with the cooldown/dedup bookkeeping and emits updated persistence
 * snapshots, marking dirty so the owning facade decides when to flush. Read
 * paths (view) no longer settle the economy; settlements happen on explicit
 * economic events: completed-turn rewards (official or legacy) and feeds.
 * @module @linxin666/dsh-pet/ledger
 */

import {
  applyInteraction,
  affinityViewOf,
  applyTurnReward,
  defaultAffinityConfig,
  type AffinityConfig,
  type PetAffinityView,
  type PetInteraction,
} from './affinity.ts'
import {
  consumeTreat,
  defaultTreatConfig,
  settleTreatGrants,
  type TreatConfig,
} from './treats.ts'
import type { PetDisplayConfig, PetPersist } from './persist.ts'

/** Tuning overrides for the affinity economy. */
export interface LedgerConfig {
  affinity?: Partial<AffinityConfig>
  treats?: Partial<TreatConfig>
}

/** Result of one ledger interaction (the shape the pet RPC returns). */
export interface LedgerInteractionResult {
  /** Reaction copy bubble. */
  reaction: string
  /** Points gained (0 when inside the cooldown). */
  delta: number
  /** Full affinity snapshot (same shape as the state view). */
  affinity: PetAffinityView
}

/**
 * Holds the current persistence snapshot and all economy bookkeeping. Every
 * mutating call flags takeDirty so the facade persists exactly once per
 * batch of changes; read methods (snapshot, affinityView) never write.
 */
export class PetLedger {
  private readonly affinityConfig: AffinityConfig
  private readonly treatConfig: TreatConfig
  private current: PetPersist
  /** Completed turns already rewarded, per session (turn numbers are per-session). */
  private rewardedTurns = new Map<string, number>()
  private lastLegacyTurnRewardAt = 0
  private dirty = false

  constructor(persist: PetPersist, config: LedgerConfig = {}) {
    this.affinityConfig = { ...defaultAffinityConfig, ...(config.affinity ?? {}) }
    this.treatConfig = { ...defaultTreatConfig, ...(config.treats ?? {}) }
    this.current = persist
  }

  /** Affinity cooldown/rank tuning (read-only). */
  get affinity(): AffinityConfig {
    return this.affinityConfig
  }

  /** The current persistence snapshot (trade a copy when mutating). */
  get snapshot(): PetPersist {
    return this.current
  }

  /** Stock cap reported to clients. */
  get treatMax(): number {
    return this.treatConfig.maxTreats
  }

  /** Consume the pending-write flag if any mutation occurred. */
  takeDirty(): boolean {
    const was = this.dirty
    this.dirty = false
    return was
  }

  /** Replace the display block (clamping stays a caller concern). */
  setDisplay(display: PetDisplayConfig): void {
    this.current = { ...this.current, display }
    this.dirty = true
  }

  /** Replace the pet display name (validation stays a caller concern). */
  setName(name: string): void {
    this.current = { ...this.current, name }
    this.dirty = true
  }

  /**
   * Settle the treat economy (work + time output since the last settlement).
   * A zero-gain first settlement still starts the time clock (anchor write),
   * which is how the 30-minute time output can ever accrue. Returns true when
   * the in-memory ledger changed and should be persisted.
   */
  settleTreats(nowMs: number): boolean {
    const settlement = settleTreatGrants(
      this.current.treats,
      this.current.affinity.turns,
      nowMs,
      this.treatConfig,
    )
    if (settlement.ledger === this.current.treats) return false
    this.current = { ...this.current, treats: settlement.ledger }
    this.dirty = true
    return true
  }

  /**
   * Award the completed-turn reward once per session+turn (idempotent) and
   * run the treat settlement that work output feeds. Returns true when the
   * snapshot changed.
   */
  rewardTurn(sessionId: string, turn: number, nowMs: number): boolean {
    const last = this.rewardedTurns.get(sessionId) ?? 0
    if (turn <= last) return false
    this.rewardedTurns.set(sessionId, turn)
    let changed = this.applyTurnReward()
    if (this.settleTreats(nowMs)) changed = true
    return changed
  }

  /** Preserve turn rewards for installations that only emit legacy activity. */
  rewardLegacyTurn(nowMs: number): boolean {
    // A legacy done snapshot may repeat during the celebration window.
    if (nowMs - this.lastLegacyTurnRewardAt < 5_000) return false
    this.lastLegacyTurnRewardAt = nowMs
    let changed = this.applyTurnReward()
    if (this.settleTreats(nowMs)) changed = true
    return changed
  }

  private applyTurnReward(): boolean {
    this.current = {
      ...this.current,
      affinity: applyTurnReward(this.current.affinity, this.affinityConfig),
    }
    this.dirty = true
    return true
  }

  /**
   * Pet or feed the pet. Feeding settles first, then gates on the feed
   * cooldown before spending stock — a feed inside the cooldown must not burn
   * a treat for nothing.
   */
  interact(kind: PetInteraction, nowMs: number): LedgerInteractionResult {
    if (kind === 'feed') this.settleTreats(nowMs)
    const outcome = applyInteraction(this.current.affinity, kind, nowMs, this.affinityConfig)
    if (kind === 'feed' && !outcome.accepted) {
      return { reaction: outcome.reaction, delta: 0, affinity: this.affinityView(nowMs) }
    }
    if (kind === 'feed') {
      const consume = consumeTreat(this.current.treats)
      if (!consume.ok) {
        return {
          reaction: '没有小鱼干了，多陪鲸鱼娘工作一会儿吧～',
          delta: 0,
          affinity: this.affinityView(nowMs),
        }
      }
      this.current = { ...this.current, treats: consume.ledger }
      this.dirty = true
    }
    if (outcome.accepted) {
      this.current = { ...this.current, affinity: outcome.affinity }
      this.dirty = true
    }
    return { reaction: outcome.reaction, delta: outcome.delta, affinity: this.affinityView(nowMs) }
  }

  /** Current affinity view for the RPC snapshot. */
  affinityView(nowMs: number): PetAffinityView {
    return affinityViewOf(this.current.affinity, nowMs, this.affinityConfig)
  }
}
