/**
 * Boot-manifest readiness checks for the one-click apply flow.
 *
 * The host half writes the skin patch synchronously, but the web app's boot
 * graph (the `window.__DSH_BOOT__` JSON inside the served HTML) is
 * regenerated asynchronously by the config watcher. A page reloaded right
 * after the patch write can therefore boot into the previous skin. These
 * helpers let the frontend poll the served document until the manifest
 * actually reflects the target before reloading.
 * @module @linxin666/dsh-client-ui-skin-center/manifest
 */

/** Bundle URL pattern of any skin entry in the boot manifest. */
const SKIN_BUNDLE_URL = /\/plugins\/@linxin666\/dsh-client-ui-skin-(?!center)[a-z0-9-]+\/client\.js/

/**
 * Whether a served GUI document's boot manifest enables the given skin.
 * A `null` target means the stock look: no skin bundle URL may be present
 * (the skin-center plugin's own bundle always loads and is excluded).
 * @param documentHtml - the served GUI document (contains the boot JSON).
 * @param target - skin id, or `null` for the stock look.
 * @returns whether the manifest already enables the target.
 */
export function manifestHasSkin(documentHtml: string, target: string | null): boolean {
  if (target === null) return !SKIN_BUNDLE_URL.test(documentHtml)
  return documentHtml.includes(`/plugins/@linxin666/dsh-client-ui-skin-${target}/client.js`)
}
