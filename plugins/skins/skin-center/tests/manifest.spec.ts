import { describe, expect, it } from 'vitest'
import { manifestHasSkin } from '../src/client/manifest.ts'

/** A served document with only the skin-center plugin enabled (stock look). */
const STOCK = '<html><script>window.__DSH_BOOT__={"entries":[{"id":"ui-skin-center","url":"/plugins/@linxin666/dsh-client-ui-skin-center/client.js?rev=abc"}]}</script></html>'

/** The same document with one skin entry enabled as well. */
const WITH_QQ98 = STOCK.replace(
  '</script>',
  ',{"id":"ui-skin-qq98","url":"/plugins/@linxin666/dsh-client-ui-skin-qq98/client.js?rev=def"}</script>',
)

describe('manifestHasSkin', () => {
  it('accepts the stock look when no skin bundle is enabled', () => {
    expect(manifestHasSkin(STOCK, null)).toBe(true)
  })

  it('rejects the stock look while a skin bundle is enabled', () => {
    expect(manifestHasSkin(WITH_QQ98, null)).toBe(false)
  })

  it('accepts the target skin once its bundle appears', () => {
    expect(manifestHasSkin(WITH_QQ98, 'qq98')).toBe(true)
  })

  it('rejects other skins while one is enabled', () => {
    expect(manifestHasSkin(WITH_QQ98, 'xp')).toBe(false)
  })

  it('ignores skin ids that are not enabled at all', () => {
    expect(manifestHasSkin(STOCK, 'qq98')).toBe(false)
  })

  it('does not treat the always-present skin-center plugin bundle as a skin', () => {
    expect(manifestHasSkin(STOCK, 'center')).toBe(true)
    expect(manifestHasSkin(WITH_QQ98, 'center')).toBe(true)
  })
})
