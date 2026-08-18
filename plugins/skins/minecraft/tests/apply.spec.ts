// @vitest-environment jsdom
/**
 * Minecraft skin apply spec — the template contract: the body
 * attribute the stylesheet is scoped on is set on apply and retracted on
 * dispose, and every injected chrome element (marked data-skin-chrome) is
 * removed. Extend with assertions specific to your surface.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { Context, type Fiber } from '@deepseek-ai/cordis'
import { apply, FACE_IMAGES } from '../src/client/index.ts'

let fiber: Fiber | undefined

async function mount(): Promise<Fiber> {
  const f = new Context().plugin({ apply })
  await f.await()
  return f
}

afterEach(async () => {
  await fiber?.dispose()
  fiber = undefined
  document.body.innerHTML = ''
  document.title = ''
})

describe('Minecraft skin apply', () => {
  it('sets the body attribute and retracts it on dispose', async () => {
    fiber = await mount()
    expect(document.body.hasAttribute('data-dsh-minecraft')).toBe(true)
    await fiber.dispose()
    expect(document.body.hasAttribute('data-dsh-minecraft')).toBe(false)
  })

  it('injects chrome and retracts every element on dispose', async () => {
    fiber = await mount()
    expect(document.body.querySelectorAll('[data-skin-chrome]').length).toBeGreaterThan(0)
    await fiber.dispose()
    expect(document.body.querySelectorAll('[data-skin-chrome]').length).toBe(0)
  })

  it('pins the skin title and restores the original on dispose', async () => {
    document.title = 'original'
    fiber = await mount()
    expect(document.title).not.toBe('original')
    await fiber.dispose()
    expect(document.title).toBe('original')
  })

  it('renders the six panorama faces from the module-level cached data URIs', async () => {
    expect(FACE_IMAGES).toHaveLength(6)
    for (const image of FACE_IMAGES) {
      expect(image.startsWith('url("data:image/svg+xml')).toBe(true)
    }
    fiber = await mount()
    const faces = document.body.querySelectorAll('[class*="mcFace"]')
    expect(faces.length).toBe(6)
    const applied = [...faces].map((face) => (face as HTMLElement).style.backgroundImage)
    // Each injected face uses exactly the cached, pre-rendered data URI — a
    // module-level render instead of re-deriving all six SVGs per apply.
    expect(applied).toEqual([...FACE_IMAGES])
  })
})
