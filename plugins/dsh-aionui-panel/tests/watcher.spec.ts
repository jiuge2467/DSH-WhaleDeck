/**
 * FsService.watch noise filter tests: a recursive fs.watch callback must drop
 * events whose changed path lies inside node_modules or .git (the dominant
 * event flood on large workspaces) while project-file events keep firing
 * through the existing debounce. The watcher is injected through the
 * constructor seam so the callback is driven deterministically.
 */
import { describe, expect, it, vi } from 'vitest'
import { FsService, type SpawnWatcher } from '../src/host/fs-service.ts'
import type { WorkspaceGate } from '../src/host/gate.ts'

const gate: WorkspaceGate = async (root) => ({ ok: true, canonical: root })

/** One captured watcher listener plus the fake FSWatcher. */
function capturedWatcher(): {
  spawn: SpawnWatcher
  emit: (event: string, filename: string | Buffer | null) => void
  close: ReturnType<typeof vi.fn>
} {
  let listener: ((event: string, filename: string | Buffer | null) => void) | undefined
  const close = vi.fn()
  const spawn = vi.fn(((_path: string, _options: { recursive: boolean }, next: (event: string, filename: string | Buffer | null) => void) => {
    listener = next
    return { on: vi.fn(), close } as never
  }) satisfies SpawnWatcher)
  return {
    spawn: spawn as SpawnWatcher,
    close,
    emit: (event, filename) => {
      if (listener === undefined) throw new Error('watcher listener not registered yet')
      listener(event, filename)
    },
  }
}

/** Wait for the async gate + watcher startup inside FsService.watch. */
async function started(captured: { spawn: SpawnWatcher }): Promise<void> {
  await vi.waitFor(() => expect(captured.spawn).toHaveBeenCalled())
}

describe('FsService.watch noise filter', () => {
  it('suppresses node_modules and .git events but keeps project files', async () => {
    const captured = capturedWatcher()
    const onChange = vi.fn()
    const service = new FsService(gate, captured.spawn)

    const dispose = service.watch('/w', onChange)
    await started(captured)

    captured.emit('change', 'node_modules/pkg/index.js')
    captured.emit('change', 'website/node_modules/x/y.js')
    captured.emit('change', '.git/objects/ab')
    captured.emit('change', 'src/.git/HEAD')
    captured.emit('change', Buffer.from('node_modules/pkg/package.json'))
    captured.emit('rename', Buffer.from('.git'))
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(onChange).not.toHaveBeenCalled()

    captured.emit('change', 'src/app.ts')
    captured.emit('change', 'README.md')
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(onChange).toHaveBeenCalledTimes(1)

    dispose()
    expect(captured.close).toHaveBeenCalled()
  })

  it('still fires for events without a filename (platform rename floods)', async () => {
    const captured = capturedWatcher()
    const onChange = vi.fn()
    const service = new FsService(gate, captured.spawn)

    const dispose = service.watch('/w', onChange)
    await started(captured)

    captured.emit('change', null)
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(onChange).toHaveBeenCalledTimes(1)

    dispose()
  })

  it.skipIf(process.platform === 'win32')('POSIX treats NODE_MODULES and .GIT as ordinary project paths', async () => {
    const captured = capturedWatcher()
    const onChange = vi.fn()
    const service = new FsService(gate, captured.spawn)

    const dispose = service.watch('/w', onChange)
    await started(captured)

    // On a case-sensitive POSIX filesystem these are not the noise dirs:
    // only the exact lower-case node_modules/.git names are suppressed.
    captured.emit('change', 'NODE_MODULES/x.ts')
    captured.emit('change', '.GIT/HEAD')
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(onChange).toHaveBeenCalledTimes(1)

    dispose()
  })

  it('still ignores node_modules paths written with backslash separators', async () => {
    const captured = capturedWatcher()
    const onChange = vi.fn()
    const service = new FsService(gate, captured.spawn)

    const dispose = service.watch('/w', onChange)
    await started(captured)

    captured.emit('change', 'node_modules\\pkg\\index.js')
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(onChange).not.toHaveBeenCalled()

    dispose()
  })
})
