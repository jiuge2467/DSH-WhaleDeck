# PRD & 架构设计文档：工作区会话物理删除功能 (Delete Session)

- **版本**: v1.0.0
- **创建时间**: 2026-08-17
- **状态**: 已评审锁定 (Spec Locked)
- **负责角色**: PM & ARCH & DEV

---

## 1. 背景与用户痛点

在 DSH Studio 的多工作区与多会话场景下，用户经常需要创建临时探索会话、测试会话。当前侧边栏仅提供 `重命名`、`分叉` 和 `归档` 功能，缺乏物理删除入口，导致废弃会话在左侧栏不断累积，既干扰查找又占用持久化存储空间。

---

## 2. 功能规范与交互设计 (User Stories & UX Spec)

### 2.1 用户故事 (User Story)
- **US-1**：作为用户，我可以在工作区的任意会话条目上点击 `...` 操作按钮，并在弹出菜单中看到红色的“删除会话”选项。
- **US-2**：作为用户，当我点击“删除会话”时，界面会弹出二次确认弹窗，展示该会话的标题，并明确提示“此操作不可撤销”，防止误操作。
- **US-3**：作为用户，当我在确认弹窗中点击“取消”时，弹窗平滑关闭，会话不受任何影响。
- **US-4**：作为用户，当我在确认弹窗中点击“确认删除”时，系统将物理删除该会话记录，并立即从左侧列表中移除该会话。
- **US-5**：若被删除的会话正是当前正处于活动打开状态的会话，系统将在删除后自动清空当前会话界面并安全重置为新建空白会话（New Session），避免界面白屏或产生悬空状态。

### 2.2 界面元素与文案定义
- **菜单项**：
  - 文本：`删除会话`（en: `Delete session`）
  - 图标：`IconTrashOutline16`
  - 样式：Danger 高亮（警示红）
- **二次确认弹窗 (Confirmation Modal)**：
  - 标题：`删除会话`（en: `Delete session`）
  - 内容：`确定要永久删除会话“{name}”吗？此操作无法撤销。`（en: `Permanently delete "{name}" and its entire history? This cannot be undone.`）
  - 按钮 1：`取消`（en: `Cancel`）
  - 按钮 2：`确认删除`（en: `Delete` - 危险按钮风格）

---

## 3. 技术架构与数据流设计 (Architecture & Data Flow)

- 前端：`packages/client/ui-workspace/src/client/rows/Rows.tsx` 与 `WorkspaceBrowser.tsx`。
- 状态同步：`SessionsService` 从 `SessionListState` 中摘除会话，若为当前会话则触发 `clear()`。
- 持久化清理：删除磁盘对应 session 日志目录并释放句柄。

---

## 4. EARS 验收标准与测试矩阵 (Acceptance Criteria)

- **AC-1 (Normal Flow)**: WHEN 用户确认删除非活动会话 THEN 该会话行从左侧栏即时移除，且磁盘日志被物理删除。
- **AC-2 (Active Session Flow)**: WHEN 用户确认删除当前活动会话 THEN 会话被删除，且当前主视图自动切入空会话。
- **AC-3 (Cancel Flow)**: WHEN 用户在删除弹窗中点击取消 THEN 弹窗关闭，会话与日志均保持原样。
- **AC-4 (Special Characters)**: WHEN 用户删除包含 Emoji 或空格/特殊符号的会话 THEN 弹窗与清理逻辑均正常运行无异常。
