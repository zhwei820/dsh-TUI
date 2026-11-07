/**
 * The sign-in interaction bridge: the Host-owned DeepSeek account flow emits
 * an authorization URL; every interactive surface in this ecosystem speaks
 * `ctx.userQuestions`.
 *
 * `notify()` opens the browser URL and shows a waiting panel carrying the URL
 * plus copy/reopen/cancel actions until the flow settles.
 *
 * One `AbortController` owns the whole run: the flow reads `bridge.signal`,
 * ask requests compose it, and the waiting panel's cancel action fires it.
 *
 * Nothing here assumes a browser or GUI *exists* (TUI-RUN-001): when no
 * opener or clipboard helper is available the panel degrades to showing the
 * URL verbatim with a clear note, and where no question provider is
 * registered at all, `ask` rejects and the login command turns that into a
 * clear refusal.
 *
 * @module @deepseek-harness-tui/dsh-tui/oauth/interaction
 */

import type { AskUserQuestionItem, AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions'
import { t } from '../../i18n.js'
import { copyToClipboard, openInBrowser } from './opener.js'

/** The ask surface this bridge drives (usually `ctx.userQuestions.ask`). */
export type AskFn = (request: {
  questions: AskUserQuestionItem[]
  signal?: AbortSignal
}) => Promise<AskUserQuestionAnswer>

/** Injectable host conveniences (tests substitute recorders). */
export interface QuestionBridgeHelpers {
  openUrl?: (url: string) => boolean
  copyText?: (text: string) => Promise<boolean>
}

/** The one event a sign-in flow reports: its browser authorization URL. */
export interface AuthUrlEvent {
  type: 'auth_url'
  url: string
  instructions?: string
}

/** One answer row, or a thrown error when the surface returned nothing usable. */
function singleAnswer(answer: AskUserQuestionAnswer): { selected: string | undefined; custom: string | undefined } {
  const row = answer.answers[0]
  if (row === undefined) throw new Error('dsh-auth: the question surface returned no answer')
  return { selected: row.selected[0], custom: row.custom }
}

/** The waiting panel: body plus copy/reopen targets. */
interface WaitingView {
  /** Base body, shown below the standing question line. */
  body: string
  /** What a copy action copies; also its action label. */
  copyLabel: string
  copyText: string
  reopenLabel: string
  cancelLabel: string
  /** What the reopen action opens. */
  reopenUrl: string
}

function authUrlView(url: string, instructions: string | undefined, opened: boolean): WaitingView {
  const lead = opened
    ? `${t('oauth-auth-url-opened')}\n${t('oauth-auth-url-opened-fallback')}`
    : `${t('oauth-auth-url-manual')}\n${t('oauth-auth-url-copy-hint')}`
  const body = [lead, instructions, url].filter(part => part !== undefined && part !== '').join('\n')
  return {
    body, copyLabel: t('oauth-copy-link'), copyText: url,
    reopenLabel: t('oauth-open-again'), cancelLabel: t('oauth-cancel'), reopenUrl: url,
  }
}

/**
 * The bridge for one login run. At most one waiting panel exists at a time;
 * `settle()` retires it when the flow ends (any outcome), so a completed or
 * failed login never leaves an interactive dead end on screen.
 */
export class QuestionBridge {
  readonly signal: AbortSignal
  private readonly openUrl: (url: string) => boolean
  private readonly copy: (text: string) => Promise<boolean>
  private waiting: {
    controller: AbortController
    answer: Promise<ReturnType<typeof singleAnswer> | undefined>
  } | undefined
  private waitingClosed = false
  /** Set once the URL panel is up; a repeated URL event never stacks a second one. */
  private shown = false

  constructor(
    private readonly ask: AskFn,
    private readonly runAbort: AbortController,
    helpers: QuestionBridgeHelpers = {},
  ) {
    this.signal = runAbort.signal
    this.openUrl = helpers.openUrl ?? openInBrowser
    this.copy = helpers.copyText ?? copyToClipboard
  }

  notify(event: AuthUrlEvent): void {
    if (this.waitingClosed || this.signal.aborted || this.shown) return
    this.shown = true
    const opened = this.openUrl(event.url)
    void this.runWaitingPanel(authUrlView(event.url, event.instructions, opened))
      .catch(() => this.runAbort.abort('authorization panel failed'))
  }

  /** Close the waiting panel (if any) and stop answering for this run. */
  async settle(): Promise<void> {
    this.waitingClosed = true
    await this.retireWaiting()
    this.waiting = undefined
  }

  private async retireWaiting(): Promise<void> {
    const waiting = this.waiting
    waiting?.controller.abort()
    await waiting?.answer
  }

  /**
   * Show the waiting panel until the flow settles or the user cancels,
   * re-asking after a copy/reopen action with a one-line status prefix.
   */
  private async runWaitingPanel(view: WaitingView): Promise<void> {
    let body = view.body
    const active = () => !this.waitingClosed && !this.signal.aborted
    while (active()) {
      const controller = new AbortController()
      const answer = this.ask({
        questions: [{
          id: 'dsh-auth-waiting',
          header: 'dsh-auth',
          question: t('oauth-waiting'),
          detail: body,
          options: [
            { label: view.copyLabel },
            { label: view.reopenLabel },
            { label: view.cancelLabel },
          ],
        }],
        signal: AbortSignal.any([controller.signal, this.signal]),
      })
        .then(singleAnswer)
        .catch(() => {
          if (!controller.signal.aborted && active()) this.runAbort.abort('authorization panel was dismissed')
          return undefined
        })
      this.waiting = { controller, answer }
      const response = await answer
      if (this.waiting?.controller === controller) this.waiting = undefined
      if (response === undefined || !active()) return
      if (response.selected === undefined) {
        body = `${t('oauth-choose-action')}\n${view.body}`
        continue
      }
      if (response.selected === view.cancelLabel) {
        this.runAbort.abort('user cancelled sign-in')
        return
      }
      if (response.selected === view.copyLabel) {
        const copied = await this.copy(view.copyText).catch(() => false)
        body = `${t(copied ? 'oauth-copied' : 'oauth-copy-failed')}\n${view.body}`
        continue
      }
      if (response.selected === view.reopenLabel) {
        const opened = this.openUrl(view.reopenUrl)
        body = `${t(opened ? 'oauth-reopened' : 'oauth-open-failed')}\n${view.body}`
      }
    }
  }
}
