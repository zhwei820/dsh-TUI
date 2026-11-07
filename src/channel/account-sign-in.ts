import type { OAuthSetupHost, OAuthProviderStatus } from '../adapter/ports/channel-settings.js'
import { t } from '../i18n.js'
import { isQuestionInterruption, type QuestionAnswer, type QuestionRequest } from './questions.js'

/**
 * The account sign-in flow behind onboarding's sign-in row (DeepSeek account
 * via the mounted dsh-auth api): sign in, or re-login / sign out when the
 * provider is already signed in. Driven by QuestionStore asks (the panel the
 * model-facing ask_user_question tool uses), so it holds no UI state; the
 * plugin's own question panels carry the browser authorization.
 *
 * React-free so a script can drive it headless with scripted answers.
 */

export interface AccountSignInDeps {
  readonly ask: (request: QuestionRequest) => Promise<QuestionAnswer>
  readonly notify: (
    text: string,
    options?: { color?: 'error' | 'warning' | 'success'; timeoutMs?: number },
  ) => void
  readonly pushLocal: (title: string, lines: readonly string[]) => void
}

export type AccountSignInOutcome = 'added' | 'signed-out' | 'cancelled' | 'failed'

const TITLE = '/auth'

function answerSelected(answer: QuestionAnswer, id: string): readonly string[] {
  return answer.answers.find(item => item.id === id)?.selected ?? []
}

/** Masked state line for one provider row in the pick question. */
function stateDescription(status: OAuthProviderStatus): string {
  if (status.signedIn) {
    return status.expiresAt === undefined
      ? t('provider-oauth-state-in-no-expiry')
      : t('provider-oauth-state-in', { time: new Date(status.expiresAt).toISOString() })
  }
  return status.expired
    ? t('provider-oauth-state-expired')
    : (status.loginLabel ?? status.oauthLabel)
}

/**
 * Sign in to `preselect` (or pick among the mounted providers when omitted).
 * No settings or credential writes happen here; the plugin owns its store.
 */
export async function runAccountSignIn(
  deps: AccountSignInDeps,
  oauth: OAuthSetupHost,
  preselect?: string,
): Promise<AccountSignInOutcome> {
  const { ask, notify, pushLocal } = deps
  try {
    const statuses = await oauth.providers()
    if (statuses.length === 0) {
      notify(t('provider-oauth-none'), { color: 'warning' })
      return 'failed'
    }
    let status: OAuthProviderStatus | undefined
    if (preselect !== undefined) {
      status = statuses.find(row => row.provider === preselect)
      if (status === undefined) {
        notify(t('provider-oauth-unmounted', { provider: preselect }), { color: 'warning', timeoutMs: 8000 })
        return 'failed'
      }
    } else {
      const pickAnswer = await ask({
        questions: [{
          id: 'oauth-provider',
          header: TITLE,
          question: t('provider-q-oauth'),
          options: statuses.map(row => ({ label: row.provider, description: stateDescription(row) })),
          hideCustomInput: true,
        }],
      })
      const providerId = answerSelected(pickAnswer, 'oauth-provider')[0]
      status = statuses.find(row => row.provider === providerId)
    }
    if (status === undefined) return 'cancelled'

    if (status.signedIn) {
      const actionAnswer = await ask({
        questions: [{
          id: 'oauth-signed-action',
          header: TITLE,
          question: t('provider-q-oauth-signed', { provider: status.provider }),
          options: [
            { label: t('provider-opt-oauth-relogin'), description: t('provider-opt-oauth-relogin-desc') },
            { label: t('provider-opt-oauth-logout'), description: t('provider-opt-oauth-logout-desc') },
            { label: t('provider-opt-confirm-cancel') },
          ],
          hideCustomInput: true,
        }],
      })
      const action = answerSelected(actionAnswer, 'oauth-signed-action')[0]
      if (action === t('provider-opt-oauth-logout')) {
        await oauth.logout(status.provider)
        pushLocal(TITLE, [
          t('provider-line-oauth-provider', { provider: status.provider }),
          t('provider-line-oauth-out'),
        ])
        notify(t('provider-oauth-logout-ok', { provider: status.provider }), { color: 'success' })
        return 'signed-out'
      }
      if (action !== t('provider-opt-oauth-relogin')) return 'cancelled'
    }

    const result = await oauth.login(status.provider)
    pushLocal(TITLE, [
      t('provider-line-oauth-provider', { provider: result.provider }),
      t('provider-line-oauth-flow', { flow: result.oauthLabel }),
      ...(result.expiresAt === undefined
        ? []
        : [t('provider-line-oauth-expires', { time: new Date(result.expiresAt).toISOString() })]),
      t('provider-switch-hint'),
    ])
    notify(t('provider-oauth-login-ok', { provider: result.provider }), { color: 'success' })
    return 'added'
  } catch (error) {
    if (isQuestionInterruption(error)) {
      notify(t('provider-cancelled'))
      return 'cancelled'
    }
    const err = error instanceof Error ? error.message : String(error)
    notify(t('provider-oauth-login-failed', { err }), { color: 'error', timeoutMs: 8000 })
    return 'failed'
  }
}
