/**
 * Built-in DeepSeek account sign-in.
 *
 * One internal Cordis module mounts the `ctx.dshAuth` service and the `/auth`
 * command over the Host-owned DeepSeek account service (`deepseekAccount`):
 * the Host owns the `deepseek-account` model route, its callback, and its
 * credential store; this module only drives the browser authorization through
 * the `userQuestions` seam, so it works on any interactive surface and
 * refuses cleanly where none exists (TUI-RUN-001).
 *
 * ```yaml
 * - id: dsh-tui-auth
 *   name: '@deepseek-harness-tui/dsh-tui/oauth'
 *   inject: [llm, commands]
 * ```
 *
 * Third-party subscription routes (ChatGPT/Codex, Claude, Grok via pi-ai) are
 * no longer mounted; the retired `providers` / `credentialsFile` /
 * `modelOverrides` options are refused at boot instead of being ignored.
 *
 * @module @deepseek-harness-tui/dsh-tui/oauth
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import { createDshAuthApi, DshAuthService } from './service.js'
import { createAuthCommandHandler } from './command.js'
import { createDeepSeekCallbackOriginResolver, deepSeekAccountFrom } from './deepseek.js'

export const name = 'dsh-auth'
/**
 * Deliberately empty. A hard code-level inject would deadlock any
 * composition lacking the `llm`/`commands` services at boot ("pending
 * (waiting for service: …)") — the failure mode dsh-tui documented for its
 * optional rows (#183). The commands service resolves through `ctx.get` in
 * {@link apply}; the profile patch declares the inject at the *entry* level,
 * where a stale patch cannot deadlock a newer boot.
 */
export const inject: readonly string[] = []

/** The slice of the commands registry this plugin uses (structural). */
interface CommandsLike {
  register(descriptor: {
    name: string
    description: string
    handler: (invocation: CommandInvocation) => Promise<CommandResult>
  }): () => void
}

/** Options earlier releases accepted for the retired third-party subscription routes. */
const RETIRED_OPTIONS = ['providers', 'credentialsFile', 'modelOverrides'] as const

/** Plugin configuration: no options remain; retired keys are kept only to refuse them. */
export type Config = Partial<Record<typeof RETIRED_OPTIONS[number], unknown>>

export const Config: z<Config> = z.object({
  providers: z.any(),
  credentialsFile: z.any(),
  modelOverrides: z.any(),
})

export type { DshAuthApi, DshAuthLoginResult, DshAuthSignInStatus, DshAuthService } from './service.js'
export { createDshAuthApi } from './service.js'
export { QuestionBridge } from './interaction.js'
export type { AskFn, AuthUrlEvent, QuestionBridgeHelpers } from './interaction.js'
export { copyToClipboard, openInBrowser, openerFor } from './opener.js'
export { DEEPSEEK_ACCOUNT_PROVIDER, deepSeekAccountFrom, deepSeekCallbackOrigin, deepSeekClientMetadata, loginDeepSeekAccount } from './deepseek.js'
export { WhaleCouponStore } from './bonus.js'

/** Mount the service and the command. */
export function apply(ctx: Context, config: Config = {}): void {
  const retired = RETIRED_OPTIONS.filter(key => config[key] !== undefined)
  if (retired.length > 0) {
    throw new Error(
      `dsh-auth: option(s) ${retired.join(', ')} configured third-party subscription routes, which are no longer supported; `
      + 'remove them from the dsh-tui-auth entry (only DeepSeek account sign-in remains)',
    )
  }
  // The service is a thin holder so UIs can find the api without importing
  // the plugin module; the defensive get-then-create matches how the TUI
  // mounts userQuestions.
  const service = (ctx.get('dshAuth') as DshAuthService | undefined) ?? new DshAuthService(ctx)
  const callbackOrigin = createDeepSeekCallbackOriginResolver(ctx)
  const api = createDshAuthApi({
    resolveDeepSeekAccount: () => deepSeekAccountFrom(ctx),
    coupons: service.coupons,
    resolveCallbackOrigin: callbackOrigin.resolve,
    resolveAsk: () => {
      const questions = ctx.get('userQuestions')
      return questions === undefined ? undefined : request => questions.ask(request)
    },
  })
  service.api = api

  ctx.effect(function* () {
    // LIFO disposal: release command registration, drain started logins, then
    // close a fallback callback listener only this module mounted.
    yield () => callbackOrigin.dispose()
    const releases: (() => void)[] = []
    // Runtime service resolution (never a code-level inject — see `inject`):
    // absent services keep this plugin inert and logged, not the whole boot
    // tree deadlocked.
    const commands = ctx.get('commands') as CommandsLike | undefined
    const active = new Set<Promise<unknown>>()
    if (commands === undefined) {
      ctx.logger.warn('dsh-auth: no commands service mounted — the /auth command stays unregistered')
    } else {
      const handler = createAuthCommandHandler(api)
      releases.push(commands.register({
        name: 'auth',
        description: 'DeepSeek account sign-in: status, login, logout',
        handler: invocation => {
          const operation = handler(invocation)
          active.add(operation)
          void operation.then(() => active.delete(operation), () => active.delete(operation))
          return operation
        },
      }))
    }
    // Drain before releasing: LIFO composite teardown lets no new invocation
    // enter while already-started logins finish their final write.
    yield async () => { await Promise.allSettled([...active]) }
    yield () => {
      for (const release of releases) release()
    }
  }, 'dsh-auth lifecycle')
}
