/**
 * Web UI plugin group, browser half. Registers the `web-ui-plugins`
 * dictionaries and one group card into the plugin-configuration section. The
 * group card declares the `web-ui.plugin.item` child slot; the dsh-web-ui
 * family plugins register their per-plugin cards there, so the settings page
 * shows a single Web UI Plugins entry instead of one top-level card per
 * family plugin.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings-surface SlotMap merge (the 'settings.section'
// entry) and the ctx.settingsScope Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { WebUiSettingsBinder } from './compat-settings-scope.ts'
import { WebUIPluginsCard } from './WebUIPluginsCard.tsx'
import { CommunityPluginsCard } from './CommunityPluginsCard.tsx'
import { communityPluginsEn, communityPluginsZh, en, zh, type CommunityPluginKey, type WebUIPluginsKey } from './locales.ts'

export type { WebUIPluginsCardProps } from './WebUIPluginsCard.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Web UI plugin group card copy. */
    'web-ui-plugins': WebUIPluginsKey
    /** Community plugin index card copy. */
    'community-plugins': CommunityPluginKey
  }

  interface SlotMap {
    /**
     * The child slot one family plugin card registers into, declared by the
     * group card. Shape mirrors `settings.plugin.item` so the family plugins
     * can reuse their existing card implementations.
     */
    'web-ui.plugin.item': { kind: 'list'; scope: 'root'; owner: SettingsPluginItemOwnerProps }
    /**
     * The plugin configuration section's card seat, declared by
     * ui-plugin-config. Spelled here with the same shape so this package can
     * register its group card without depending on the sibling UI package.
     */
    'settings.plugin.item': { kind: 'list'; scope: 'root'; owner: SettingsPluginItemOwnerProps }
  }
}

/** Owner share of a plugin card (the group card supplies nothing). */
export interface SettingsPluginItemOwnerProps {
  /** Marker field: card owner props are intentionally empty. */
  children?: never
}

/** Required services. */
export const inject = ['slots', 'locale', 'connection', 'settingsScope', 'remote']

/**
 * Register the Web UI plugin group.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('web-ui-plugins', { zh, en }), 'web-ui-settings: dictionaries')

  // The rc.6 compatibility binder: family plugins read ctx.get('webUiSettings')
  // and fall back to the official settings scope on hosts that expose their
  // namespaces natively.
  new WebUiSettingsBinder(ctx)

  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    id: 'web-ui-plugins',
    order: 90,
    locale: 'web-ui-plugins',
    children: { 'web-ui.plugin.item': { kind: 'list', scope: 'root' } },
  }, WebUIPluginsCard))

  // Community plugin index: one card inside the group that lists contributor
  // plugins and links to their own repositories.
  ctx.effect(() => ctx.locale.register('community-plugins', { zh: communityPluginsZh, en: communityPluginsEn }), 'web-ui-settings: community-plugins dictionaries')
  ctx.slots.inject('web-ui.plugin.item', () => ctx.slots.register({
    name: 'web-ui.plugin.item',
    id: 'community-plugins',
    order: 120,
    locale: 'community-plugins',
    inject: () => ({}),
  }, CommunityPluginsCard))
}
