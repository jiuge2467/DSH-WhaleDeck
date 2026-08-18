# PRD & 技术规格文档：DeepSeek 官方 Token 计费引擎校准与动态价格表

- **版本**: v1.0.0
- **创建时间**: 2026-08-17
- **状态**: 已评审锁定 (Spec Locked)
- **负责角色**: PM & ARCH & DEV & QA

---

## 1. 背景与问题定义

在 DSH Studio 客户端使用过程中，用户反馈 Token 换算金额显示为 `¥0.05`，但在 DeepSeek 开放平台后台实际扣费为 `¥0.11`。经排查，由于旧版计费算法未识别模型类型（默认按 Chat 价格计算，遗漏 Reasoner 4x~8x 费率）、默认写死 80% 缓存命中率（导致冷启动首轮全未命中输入价格被低估 10 倍）、以及未核算思考过程 Token，导致前端折算金额大幅偏低。

---

## 2. 官方最新定价模型规范 (2026 官方标准)

### 2.1 模型费率矩阵（单位：元 / 百万 tokens）
| 模型 ID | 模型名称 | 标准输入(未命中) | 缓存输入(命中) | 生成输出(含思考) | 闲时折扣 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `deepseek-chat` | DeepSeek-V3 | ¥1.00 | ¥0.10 | ¥2.00 | 50% 折扣 (00:30~08:30) |
| `deepseek-reasoner` | DeepSeek-R1 | ¥4.00 | ¥1.00 | ¥16.00 | 50% 折扣 (00:30~08:30) |
| `deepseek-v4-flash` | DeepSeek-V4 Flash | ¥1.50 | ¥0.15 | ¥3.00 | 50% 折扣 |
| `deepseek-v4-pro` | DeepSeek-V4 Pro | ¥4.00 | ¥1.00 | ¥16.00 | 50% 折扣 |

### 2.2 计费计算公式
$$\text{Cost} = \frac{(\text{UncachedInput} + \text{CacheWrite}) \times P_{\text{uncached}} + \text{CacheRead} \times P_{\text{cache\_read}} + (\text{Output} + \text{Reasoning}) \times P_{\text{output}}}{1,000,000} \times \text{Discount}$$

---

## 3. 架构与改动点规划

1. **`pricing-engine.ts`**：
   - 扩充 `PRICING_TABLE` 支持全部官方最新模型及别名。
   - 增加时段自动判定函数 `isOffPeakHours(timestamp?: number): boolean`（北京时间 00:30 - 08:30 为半价优惠时段）。
   - 修复 fallback 逻辑，移除 80% 命中率假设，在无缓存证据时按全未命中真实基准计算。
   - 支持 `reasoningTokens` 思考过程 Token 核算。
2. **`MascotTokenBridge.tsx`**：
   - 从 `useSession` 中提取会话绑定的实际 `model` 名称并透传给计费引擎。
3. **`MascotDashboard.tsx`**：
   - 金额明细增加模型名称、命中率与各部分费用分解。

---

## 4. EARS 验收标准 (Acceptance Criteria)

- **AC-1 (DeepSeek-Chat 标准计算)**: WHEN 1M 未命中输入 + 1M 缓存命中输入 + 1M 输出在白天运行 THEN 金额精确计算为 ¥3.10。
- **AC-2 (DeepSeek-Reasoner 深度思考计算)**: WHEN 1M 未命中输入 + 1M 缓存命中输入 + 1M 思考输出在白天运行 THEN 金额精确计算为 ¥21.00。
- **AC-3 (闲时半价折扣)**: WHEN 请求在北京时间 02:00（闲时）发生 THEN 最终结算金额自动享受 50% 优惠。
- **AC-4 (冷启动未命中防御)**: WHEN usage 尚未推送且首轮产生了 50,000 输入与 20,000 输出 THEN 默认按真实未命中基准计算，确保不再出现金额少算 50% 以上的偏差。
