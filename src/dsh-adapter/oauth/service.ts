/**
 * The `ctx.dshAuth` service: the programmatic surface over the Host-owned
 * DeepSeek account sign-in. UIs (the dsh-tui onboarding and sign-in panels, a
 * web settings page) read the masked sign-in state and drive login/logout
 * without touching the account grant; the `/auth` command in `command.ts` is
 * a thin textual veneer over the same api.
 *
 * @module @deepseek-harness-tui/dsh-tui/oauth/service
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { AskFn } from './interaction.js'
import {
  DEEPSEEK_ACCOUNT_PROVIDER,
  deepSeekClientMetadata,
  loginDeepSeekAccount,
  type DeepSeekAccountAuth,
} from './deepseek.js'
import { WhaleCouponStore } from './bonus.js'

/** One provider's sign-in state; never carries token material. */
export interface DshAuthSignInStatus {
  provider: string
  /** Route display name (selectors, pickers). */
  label: string
  /** The sign-in flow's own name, e.g. "DeepSeek". */
  oauthLabel: string
  /** The flow's login-call-to-action label, when it ships one. */
  loginLabel: string | undefined
  signedIn: boolean
  expiresAt: number | undefined
  /** Signed in, but the stored access token has expired (refresh may still work). */
  expired: boolean
}

/** The outcome of a successful login. */
export interface DshAuthLoginResult {
  provider: string
  oauthLabel: string
  /** The Host-owned DeepSeek account grant has no expiry. */
  expiresAt: number | undefined
}

/** The service api consumed by commands and UIs. */
export interface DshAuthApi {
  /** Every mounted provider with masked sign-in state. */
  providers(): Promise<readonly DshAuthSignInStatus[]>
  /**
   * Run one provider's sign-in. `provider` omitted asks the interactive
   * surface to choose among providers not currently signed in.
   * @throws Error when no interactive surface is present, the provider is
   *   unknown, a login is already running, or the flow itself fails.
   */
  login(provider?: string, signal?: AbortSignal): Promise<DshAuthLoginResult>
  /** Cancel an active sign-in and remove the stored credential; resolves whether one existed. */
  logout(provider: string): Promise<boolean>
}

/** Cordis service holder; `api` is set by the plugin's apply. */
export class DshAuthService extends Service {
  api: DshAuthApi | undefined
  readonly coupons = new WhaleCouponStore()

  constructor(ctx: Context) {
    super(ctx, 'dshAuth')
  }
}

/** Everything the api factory needs; all cordis surface is injected, so tests run without a host. */
export interface DshAuthApiDeps {
  /** The interactive ask surface, resolved per call so mounting order never matters. */
  resolveAsk: () => AskFn | undefined
  /** The Host account service; absent on hosts without DeepSeek account sign-in. */
  resolveDeepSeekAccount: () => DeepSeekAccountAuth | undefined
  /** The active Host callback listener's browser-accessible loopback origin. */
  resolveCallbackOrigin?: () => string | Promise<string>
  coupons?: WhaleCouponStore
}

/** Select a provider interactively among `candidates`. */
async function chooseProvider(ask: AskFn, candidates: readonly DshAuthSignInStatus[], signal: AbortSignal | undefined): Promise<string> {
  const answer = await ask({
    questions: [{
      id: 'dsh-auth-provider',
      header: 'dsh-auth',
      question: 'Sign in with which provider?',
      options: candidates.map(row => ({ label: row.oauthLabel, description: row.provider })),
    }],
    signal,
  })
  const row = answer.answers[0]
  const label = row?.selected[0]
  const chosen = candidates.find(candidate => candidate.oauthLabel === label)
  if (chosen === undefined) throw new Error('dsh-auth: no provider was chosen')
  return chosen.provider
}

/**
 * The api implementation. One login runs per provider at a time; a second
 * login attempt for the same provider fails fast instead of stacking two
 * flows.
 */
export function createDshAuthApi(deps: DshAuthApiDeps): DshAuthApi {
  const inflight = new Map<string, AbortController>()
  const mountedIds = (): string[] => deps.resolveDeepSeekAccount() === undefined ? [] : [DEEPSEEK_ACCOUNT_PROVIDER]
  const unknownProvider = (provider: string): Error =>
    new Error(`dsh-auth: unknown provider "${provider}" (mounted: ${mountedIds().join(', ') || 'none'})`)

  const statusOf = async (): Promise<readonly DshAuthSignInStatus[]> => {
    const account = deps.resolveDeepSeekAccount()
    if (account === undefined) return []
    const state = await account.getState()
    return [{
      provider: DEEPSEEK_ACCOUNT_PROVIDER,
      label: 'DeepSeek Account',
      oauthLabel: 'DeepSeek',
      loginLabel: 'Sign in with DeepSeek',
      signedIn: state.status === 'credential-stored',
      expiresAt: undefined,
      expired: false,
    }]
  }

  return {
    providers: statusOf,
    login: async (provider, signal) => {
      const ask = deps.resolveAsk()
      let target = provider
      if (target === undefined) {
        if (ask === undefined) {
          throw new Error('dsh-auth: provider selection needs an interactive surface; name the provider: /auth login <provider>')
        }
        const statuses = await statusOf()
        if (statuses.length === 0) throw new Error('dsh-auth: no sign-in provider is mounted on this host')
        const candidates = statuses.filter(row => !row.signedIn)
        if (candidates.length === 0) throw new Error('dsh-auth: every mounted provider is already signed in')
        target = await chooseProvider(ask, candidates, signal)
      } else if (!mountedIds().includes(target)) {
        throw unknownProvider(target)
      }
      if (ask === undefined) {
        throw new Error(
          `dsh-auth: signing in to "${target}" needs an interactive surface (run inside dsh-tui or the web client); `
          + 'this plugin refuses to assume a browser on this machine',
        )
      }
      if (inflight.has(target)) {
        throw new Error(`dsh-auth: a login for "${target}" is already running`)
      }
      const account = deps.resolveDeepSeekAccount()
      if (account === undefined) {
        throw new Error(`dsh-auth: provider "${target}" is no longer mounted`)
      }
      const cancellation = new AbortController()
      const runSignal = signal === undefined ? cancellation.signal : AbortSignal.any([signal, cancellation.signal])
      inflight.set(target, cancellation)
      const loginTarget = target
      return (async (): Promise<DshAuthLoginResult> => {
        runSignal.throwIfAborted()
        const callbackOrigin = await deps.resolveCallbackOrigin?.()
        runSignal.throwIfAborted()
        if (callbackOrigin === undefined) {
          throw new Error('DeepSeek sign-in needs an active Host webServer for the browser callback')
        }
        await loginDeepSeekAccount(account, callbackOrigin, ask, runSignal)
        deps.coupons?.clear()
        const getUnnotifiedBonuses = account.getUnnotifiedBonuses?.bind(account)
        const ackBonusNotified = account.ackBonusNotified?.bind(account)
        if (getUnnotifiedBonuses !== undefined && ackBonusNotified !== undefined) {
          void deps.coupons?.refresh({ getUnnotifiedBonuses, ackBonusNotified })
        }
        return { provider: loginTarget, oauthLabel: 'DeepSeek', expiresAt: undefined }
      })().finally(() => { inflight.delete(loginTarget) })
    },
    logout: async provider => {
      // A DeepSeek login may still be awaiting its callback listener, before
      // the Host has an attempt to cancel. Abort it before Host sign-out.
      inflight.get(provider)?.abort(new Error('Login cancelled'))
      const account = provider === DEEPSEEK_ACCOUNT_PROVIDER ? deps.resolveDeepSeekAccount() : undefined
      if (account === undefined) throw unknownProvider(provider)
      const existed = (await account.getState()).status === 'credential-stored'
      await account.signOut(deepSeekClientMetadata())
      deps.coupons?.clear()
      return existed
    },
  }
}
