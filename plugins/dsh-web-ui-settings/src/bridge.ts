/**
 * Host-side settings bridge for the Web UI plugin group.
 *
 * Serves the dsh-web-ui family settings namespaces over a same-origin,
 * loopback-only HTTP pair because rc.6 host-apiproxy refuses every
 * third-party namespace at the RPC boundary. The handlers ride the host
 * settings seam (ctx.settings), which keeps the official schema validation,
 * revision fencing, persistence, and event emission for free; the bridge only
 * adds the allowlist gate the apiproxy normally provides. Error codes mirror
 * the official RPC codes so the client controller treats refusals exactly
 * like an apiproxy answer.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { SettingsNamespace, SettingsDescriptor, SettingsPathOp, SettingsProvider } from '@deepseek-ai/dsh-settings'
import { SettingsConflictError, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { composeAllowlist, extractWebSettingsNamespaces } from './allowlist.ts'
import { WEB_UI_SETTINGS_BRIDGE_PREFIX } from './protocol.ts'
import type { BridgeDescribeResult, BridgeMutateRequest, BridgeMutateResult, BridgeNamespaceView } from './protocol.ts'

/** Cap on JSON request bodies (a single mutate is tiny). */
const MAX_JSON_BODY_BYTES = 64 * 1024

/** Loopback literal check plus browser same-origin markers (mirrors the dsh-ssh route fence). */
function isLoopbackRequest(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl: URL
  try {
    hostUrl = new URL('http://' + host)
  } catch {
    return false
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/** One JSON response. */
function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(payload)
}

/** Read a JSON request body (undefined when too large or unparseable). */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_JSON_BODY_BYTES) return undefined
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    return undefined
  }
}

/** Project one settings descriptor onto the bridge wire view. */
function toView(descriptor: SettingsDescriptor): BridgeNamespaceView {
  return {
    ns: String(descriptor.ns),
    schema: descriptor.schema,
    value: descriptor.value,
    ...descriptor.base === undefined ? {} : { base: descriptor.base },
    ...descriptor.user === undefined ? {} : { user: descriptor.user },
    ...descriptor.secrets === undefined ? {} : {
      secrets: descriptor.secrets.map(secret => ({ path: [...secret.path], set: secret.set })),
    },
    revision: descriptor.revision,
  }
}

/** Map a seam failure onto the official-shaped refusal envelope. */
function failureOf(error: unknown): { ok: false; code: string; message: string } {
  if (error instanceof SettingsConflictError) {
    return { ok: false, code: 'settings-conflict', message: error.message }
  }
  const message = error instanceof Error ? error.message : String(error)
  if (/is not registered/.test(message)) {
    return { ok: false, code: 'settings-rejected', message }
  }
  return { ok: false, code: 'settings-rejected', message }
}

/** Dependencies of the bridge handlers. */
export interface BridgeDeps {
  /** The host settings seam (already injected). */
  settings: SettingsProvider
  /** Read the raw settings.yaml text ('' when unreadable or absent). */
  readSettingsYaml: () => string
}

/** The describe and mutate handlers the routes wrap. */
export interface BridgeHandlers {
  describe(): Promise<BridgeDescribeResult>
  mutate(request: unknown): Promise<BridgeMutateResult>
}

/**
 * Build the bridge handlers. The allowlist is re-read on every call so edits
 * to settings.yaml take effect without a host restart.
 * @param deps - the settings seam and the settings.yaml reader.
 * @returns the handlers.
 */
export function makeBridgeHandlers(deps: BridgeDeps): BridgeHandlers {
  const allowlisted = (): string[] => {
    const descriptors = deps.settings.describe({ redactSecrets: true })
    const registered = descriptors.map(descriptor => String(descriptor.ns))
    return composeAllowlist(extractWebSettingsNamespaces(deps.readSettingsYaml()), registered)
  }
  return {
    async describe() {
      const descriptors = deps.settings.describe({ redactSecrets: true })
      const allowlist = allowlisted()
      const namespaces = allowlist
        .map(ns => descriptors.find(descriptor => String(descriptor.ns) === ns))
        .filter((descriptor): descriptor is SettingsDescriptor => descriptor !== undefined)
        .map(toView)
      return {
        ok: true,
        value: { namespaces, writable: deps.settings.writable !== false },
      }
    },
    async mutate(request) {
      const body = request as Partial<BridgeMutateRequest> | null
      if (body === null || typeof body !== 'object' || typeof body.ns !== 'string' || !Array.isArray(body.ops)) {
        return { ok: false, code: 'settings-rejected', message: 'malformed bridge settings request' }
      }
      const { ns } = body
      const allowlist = allowlisted()
      if (!allowlist.includes(ns)) {
        return { ok: false, code: 'settings-not-exposed', message: 'settings namespace "' + ns + '" is not exposed to configuration clients' }
      }
      const expectedRevision = typeof body.expectedRevision === 'number' ? body.expectedRevision : undefined
      try {
        await deps.settings.mutate(settingsNamespace(ns) as SettingsNamespace, body.ops as SettingsPathOp[], expectedRevision)
      } catch (error) {
        return failureOf(error)
      }
      const descriptor = deps.settings.describe({ redactSecrets: true }).find(candidate => String(candidate.ns) === ns)
      if (descriptor === undefined) {
        return { ok: false, code: 'internal', message: 'settings namespace "' + ns + '" was disposed after the mutate' }
      }
      return { ok: true, value: toView(descriptor) }
    },
  }
}

/**
 * Build the loopback-only bridge routes.
 * @param deps - handler dependencies.
 * @returns the exact-path route registrations.
 */
export function makeBridgeRoutes(deps: BridgeDeps): WebRoute[] {
  const handlers = makeBridgeHandlers(deps)
  const guard = (req: IncomingMessage, res: ServerResponse): boolean => {
    if (!isLoopbackRequest(req)) {
      writeJson(res, 403, { error: 'loopback requests only' })
      return false
    }
    if (req.method !== 'POST') {
      writeJson(res, 405, { error: 'method not allowed: ' + (req.method ?? '') })
      return false
    }
    return true
  }
  return [
    {
      kind: 'exact',
      path: WEB_UI_SETTINGS_BRIDGE_PREFIX + '/describe',
      handler: async (req, res) => {
        if (!guard(req, res)) return
        writeJson(res, 200, await handlers.describe())
      },
    },
    {
      kind: 'exact',
      path: WEB_UI_SETTINGS_BRIDGE_PREFIX + '/mutate',
      handler: async (req, res) => {
        if (!guard(req, res)) return
        const body = await readJsonBody(req)
        if (body === undefined) {
          writeJson(res, 400, { ok: false, code: 'settings-rejected', message: 'unreadable JSON body' })
          return
        }
        writeJson(res, 200, await handlers.mutate(body))
      },
    },
  ]
}
