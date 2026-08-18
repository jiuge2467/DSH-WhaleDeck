/**
 * @module dsh-mascot-pet/client/pricing-engine
 * @description Token 计费换算引擎：根据 DeepSeek 官方标准价格表，
 *   结合 TokenUsage 或节点级 Token 数据精确计算 CNY 费用，并维护全站历史累计总账本。
 */

export interface TokenUsageLike {
  uncachedInputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  outputTokens?: number
  reasoningTokens?: number
}

/** 模型费率配置（单位：元 / 百万 tokens） */
export interface ModelPricing {
  /** 未命中缓存的输入单价 (¥/1M) */
  promptUncachedPerMillion: number
  /** 命中缓存的输入单价 (¥/1M) */
  promptCacheReadPerMillion: number
  /** 输出/生成单价 (含思考过程) (¥/1M) */
  completionPerMillion: number
}

/** 官方标准模型定价表（CNY） */
export const PRICING_TABLE: Record<string, ModelPricing> = {
  'deepseek-chat': {
    promptUncachedPerMillion: 1.0,
    promptCacheReadPerMillion: 0.1,
    completionPerMillion: 2.0,
  },
  'deepseek-reasoner': {
    promptUncachedPerMillion: 4.0,
    promptCacheReadPerMillion: 1.0,
    completionPerMillion: 16.0,
  },
  'deepseek-v4-flash': {
    promptUncachedPerMillion: 1.5,
    promptCacheReadPerMillion: 0.15,
    completionPerMillion: 3.0,
  },
  'deepseek-v4-pro': {
    promptUncachedPerMillion: 4.0,
    promptCacheReadPerMillion: 1.0,
    completionPerMillion: 16.0,
  },
  'default': {
    promptUncachedPerMillion: 1.0,
    promptCacheReadPerMillion: 0.1,
    completionPerMillion: 2.0,
  },
}

/** 归一化模型标识符至标准模型 ID */
export function normalizeModelId(modelId?: string): string {
  if (!modelId) return 'deepseek-chat'
  const lower = modelId.toLowerCase().trim()
  if (lower.includes('reasoner') || lower.includes('r1') || lower.includes('thinking')) {
    return 'deepseek-reasoner'
  }
  if (lower.includes('v4-pro') || lower.includes('pro')) {
    return 'deepseek-v4-pro'
  }
  if (lower.includes('v4-flash') || lower.includes('flash')) {
    return 'deepseek-v4-flash'
  }
  if (lower.includes('chat') || lower.includes('v3')) {
    return 'deepseek-chat'
  }
  return PRICING_TABLE[lower] ? lower : 'deepseek-chat'
}

/** 判定当前请求是否处于北京时间 (UTC+8) 00:30~08:30 的闲时优惠时段 (享受 50% 折扣) */
export function isOffPeakHours(timestamp: number = Date.now()): boolean {
  const d = new Date(timestamp + 8 * 3600 * 1000)
  const hour = d.getUTCHours()
  const minute = d.getUTCMinutes()
  const timeInMinutes = hour * 60 + minute
  return timeInMinutes >= 30 && timeInMinutes < 510
}

export interface TokenCostResult {
  costCny: number
  costFormatted: string
  totalTokens: number
  uncachedCost: number
  cacheReadCost: number
  outputCost: number
  uncachedInput: number
  cacheRead: number
  outputTokens: number
  reasoningTokens: number
  cacheHitPercent: number | null
  modelId: string
  isOffPeak: boolean
}

export interface SessionBillingEntry {
  sessionId: string
  costCny: number
  totalTokens: number
  uncachedInput: number
  cacheRead: number
  outputTokens: number
  reasoningTokens?: number
  modelId?: string
  lastUpdated: number
}

export interface BillingLedger {
  allTimeTotalCostCny: number
  allTimeTotalTokens: number
  monthlyCostCny: number
  sessions: Record<string, SessionBillingEntry>
}

const LEDGER_STORAGE_KEY = 'dsh_billing_ledger_v2'

/** 计算 Token 使用的花费（CNY） */
export function calculateTokenCost(
  usage: TokenUsageLike | undefined,
  fallbackInput = 0,
  fallbackOutput = 0,
  fallbackCacheHit = 0,
  rawModelId = 'deepseek-chat',
  timestamp: number = Date.now(),
): TokenCostResult {
  const modelId = normalizeModelId(rawModelId)
  const pricing = PRICING_TABLE[modelId] ?? PRICING_TABLE['default']

  let uncachedInput = usage?.uncachedInputTokens ?? 0
  let cacheRead = usage?.cacheReadTokens ?? 0
  const cacheWrite = usage?.cacheWriteTokens ?? 0
  let output = usage?.outputTokens ?? 0
  const reasoning = usage?.reasoningTokens ?? 0

  // 若 usage 未就绪但存在 fallback 节点输入输出（如流式进行中）
  if (uncachedInput === 0 && cacheRead === 0 && output === 0 && (fallbackInput > 0 || fallbackOutput > 0)) {
    cacheRead = Math.round(fallbackInput * fallbackCacheHit)
    uncachedInput = fallbackInput - cacheRead
    output = fallbackOutput
  }

  const effectiveOutput = output + reasoning
  const offPeak = isOffPeakHours(timestamp)
  const discountMultiplier = offPeak ? 0.5 : 1.0

  const uncachedCost = (((uncachedInput + cacheWrite) / 1_000_000) * pricing.promptUncachedPerMillion) * discountMultiplier
  const cacheReadCost = ((cacheRead / 1_000_000) * pricing.promptCacheReadPerMillion) * discountMultiplier
  const outputCost = ((effectiveOutput / 1_000_000) * pricing.completionPerMillion) * discountMultiplier
  const costCny = uncachedCost + cacheReadCost + outputCost

  const totalTokens = uncachedInput + cacheRead + cacheWrite + effectiveOutput
  const totalInput = uncachedInput + cacheRead + cacheWrite
  const cacheHitPercent = totalInput > 0 ? Math.round((cacheRead / totalInput) * 100) : null

  return {
    costCny,
    costFormatted: costCny >= 1 ? `¥${costCny.toFixed(2)}` : `¥${costCny.toFixed(4)}`,
    totalTokens,
    uncachedCost,
    cacheReadCost,
    outputCost,
    uncachedInput,
    cacheRead,
    outputTokens: effectiveOutput,
    reasoningTokens: reasoning,
    cacheHitPercent,
    modelId,
    isOffPeak: offPeak,
  }
}

/** 读取全站历史账本数据 */
export function getBillingLedger(): BillingLedger {
  if (typeof window === 'undefined') {
    return { allTimeTotalCostCny: 0, allTimeTotalTokens: 0, monthlyCostCny: 0, sessions: {} }
  }

  try {
    const raw = localStorage.getItem(LEDGER_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as BillingLedger
      return {
        allTimeTotalCostCny: Number(parsed.allTimeTotalCostCny || 0),
        allTimeTotalTokens: Number(parsed.allTimeTotalTokens || 0),
        monthlyCostCny: Number(parsed.monthlyCostCny || 0),
        sessions: parsed.sessions || {},
      }
    }
  } catch { /* ignore */ }

  return { allTimeTotalCostCny: 0, allTimeTotalTokens: 0, monthlyCostCny: 0, sessions: {} }
}

/** 记录当前会话的 Token 用量与消费至全局账本 */
export function recordSessionCostToLedger(
  sessionId: string,
  usage: TokenUsageLike | undefined,
  fallbackCost?: number,
  rawModelId = 'deepseek-chat',
  timestamp: number = Date.now(),
): BillingLedger {
  if (typeof window === 'undefined' || !sessionId) {
    return getBillingLedger()
  }

  const modelId = normalizeModelId(rawModelId)
  const costRes = calculateTokenCost(usage, 0, 0, 0, modelId, timestamp)
  const currentCost = typeof fallbackCost === 'number' && fallbackCost > costRes.costCny ? fallbackCost : costRes.costCny
  const currentTokens = costRes.totalTokens

  const ledger = getBillingLedger()
  const prevSession = ledger.sessions[sessionId]
  const prevCost = prevSession?.costCny ?? 0
  const prevTokens = prevSession?.totalTokens ?? 0

  if (currentCost > prevCost || currentTokens > prevTokens || !prevSession) {
    const deltaCost = Math.max(0, currentCost - prevCost)
    const deltaTokens = Math.max(0, currentTokens - prevTokens)

    ledger.allTimeTotalCostCny = Number((ledger.allTimeTotalCostCny + deltaCost).toFixed(4))
    ledger.allTimeTotalTokens = Math.round(ledger.allTimeTotalTokens + deltaTokens)
    ledger.monthlyCostCny = Number((ledger.monthlyCostCny + deltaCost).toFixed(4))

    ledger.sessions[sessionId] = {
      sessionId,
      costCny: Number(currentCost.toFixed(4)),
      totalTokens: currentTokens,
      uncachedInput: costRes.uncachedInput,
      cacheRead: costRes.cacheRead,
      outputTokens: costRes.outputTokens,
      reasoningTokens: costRes.reasoningTokens,
      modelId,
      lastUpdated: Date.now(),
    }

    try {
      localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(ledger))
      // 同时维护旧版月度存储以保持兼容
      recordSessionCostToLocal(sessionId, currentCost)
    } catch { /* ignore */ }
  }

  return ledger
}

/** 同步当月消费到本地 storage（向后兼容接口） */
export function recordSessionCostToLocal(sessionId: string, costCny: number): number {
  if (typeof window === 'undefined') return 0
  const month = new Date().toISOString().slice(0, 7)
  const storageKey = `dsh_monthly_cost_${month}`
  try {
    const raw = localStorage.getItem(storageKey)
    const store: { total: number; sessions: Record<string, number> } = raw
      ? JSON.parse(raw)
      : { total: 0, sessions: {} }
    const prevSessionCost = store.sessions[sessionId] ?? 0
    if (costCny > prevSessionCost) {
      const delta = costCny - prevSessionCost
      store.total = (store.total || 0) + delta
      store.sessions[sessionId] = costCny
      localStorage.setItem(storageKey, JSON.stringify(store))
    }
    return Number(store.total.toFixed(4))
  } catch {
    return 0
  }
}

/** 获取当月本地累计消费（向后兼容接口） */
export function getLocalMonthlyCost(): number {
  if (typeof window === 'undefined') return 0
  const month = new Date().toISOString().slice(0, 7)
  const storageKey = `dsh_monthly_cost_${month}`
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return 0
    const store = JSON.parse(raw) as { total?: number }
    return Number((store.total || 0).toFixed(4))
  } catch {
    return 0
  }
}
