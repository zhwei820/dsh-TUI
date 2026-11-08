/**
 * Boot-time "is an account already configured?" probe for the first-run
 * guide. An install that already has a DeepSeek key (env or credentials
 * store) or a signed-in OAuth account has nothing left to set up in the
 * guide's first step, so the guide is not offered on boot — skipping it
 * (Esc) records nothing, and re-asking an already-configured install on
 * every launch is noise. `/setup` still opens it on demand.
 *
 * Best effort and bounded: a missing service, a read failure or a slow
 * store reads as "not configured", which keeps the previous behaviour
 * (the guide is offered).
 *
 * @module
 */
import type { ServiceLookup } from './channel/channel-host.js'

/** The credential ref the guide's first step configures. */
const DEEPSEEK_KEY_REF = 'DEEPSEEK_API_KEY'

/** Upper bound on the probe, so a stuck store cannot hold the first frame. */
const PROBE_TIMEOUT_MS = 1500

async function keyConfigured(ctx: ServiceLookup): Promise<boolean> {
  // The environment shadows the store (same rule as settingsHost.credentialConfigured).
  if (process.env[DEEPSEEK_KEY_REF] !== undefined && process.env[DEEPSEEK_KEY_REF] !== '') return true
  const credentials = ctx.get('credentials') as { describe?(ref: string): Promise<{ configured?: unknown }> } | undefined
  if (typeof credentials?.describe !== 'function') return false
  const status = await credentials.describe(DEEPSEEK_KEY_REF)
  return status?.configured === true
}

async function oauthSignedIn(ctx: ServiceLookup): Promise<boolean> {
  const api = (ctx.get('dshAuth') as { api?: { providers?(): Promise<readonly { signedIn?: unknown }[]> } } | undefined)?.api
  if (typeof api?.providers !== 'function') return false
  const rows = await api.providers()
  return rows.some(row => row.signedIn === true)
}

/**
 * Whether this machine already has a usable account (DeepSeek key or a
 * signed-in OAuth provider).
 *
 * @param ctx - Host service lookup (`credentials`, `dshAuth`).
 * @param timeoutMs - Probe bound; exceeding it reads as not configured.
 * @returns True only on positive evidence.
 */
export async function accountConfigured(ctx: ServiceLookup, timeoutMs: number = PROBE_TIMEOUT_MS): Promise<boolean> {
  const probe = (check: (ctx: ServiceLookup) => Promise<boolean>): Promise<boolean> =>
    check(ctx).catch(() => false)
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs)
  })
  try {
    const found = Promise.all([probe(keyConfigured), probe(oauthSignedIn)])
      .then(results => results.some(Boolean))
    return await Promise.race([found, timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
