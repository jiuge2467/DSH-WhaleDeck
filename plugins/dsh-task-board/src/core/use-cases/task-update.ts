/**
 * Update-task use case: apply an editable-field patch (title/description/
 * prompt) with a fresh updatedAt. Pure ledger transition (no persistence or
 * notify — the controller orchestrates those).
 */
import type { TaskRecord } from '../tasks.ts'

/** Editable fields on a task (the update patch surface). */
export type TaskUpdatePatch = Partial<Pick<TaskRecord, 'title' | 'description' | 'prompt'>>

/**
 * Apply an update across the ledger. Tasks that do not match the id are left
 * untouched; the matched task receives the patch plus a fresh updatedAt.
 * @param tasks - current ledger.
 * @param id - the task to update.
 * @param patch - editable-field changes.
 * @param now - clock instant (ms epoch).
 */
export function applyUpdateTask(
  tasks: readonly TaskRecord[],
  id: string,
  patch: TaskUpdatePatch,
  now: number,
): readonly TaskRecord[] {
  return tasks.map(task => task.id === id ? { ...task, ...patch, updatedAt: now } : task)
}
