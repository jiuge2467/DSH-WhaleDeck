/**
 * Host half of the dsh-web-ui-settings group. Mounts the rc.6 compatibility
 * settings bridge: a loopback-only HTTP pair that serves the family plugins'
 * settings namespaces through the host settings seam, gated by the user's
 * web_settings_namespaces allowlist from settings.yaml (with the built-in
 * family fallback list). The browser half uses it only when the official
 * settings scope reports the namespace unavailable, so hosts whose apiproxy
 * already exposes the namespaces never touch the bridge.
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-settings'
import { makeBridgeRoutes } from './bridge.ts'

/** Required services before the bridge routes can mount. */
export const inject = ['webServer'] as const

/**
 * Mount the settings bridge when a settings seam exists (the seam is what the
 * bridge serves, so without one there is nothing to expose).
 * @param ctx - host plugin context.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (sctx) => {
    const settingsYamlPath = sctx.settings.documentPath ?? join(homedir(), '.dsh', 'settings.yaml')
    sctx.effect(() => {
      const disposers = makeBridgeRoutes({
        settings: sctx.settings,
        readSettingsYaml: () => {
          try {
            return readFileSync(settingsYamlPath, 'utf8')
          } catch {
            return ''
          }
        },
      }).map(route => sctx.webServer.register(route))
      return () => {
        for (const dispose of disposers) dispose()
      }
    }, 'web-ui-settings: settings bridge')
  })
}
