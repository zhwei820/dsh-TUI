/**
 * Decision notes (cordis config `decisionNotes`, on by default): one global
 * DSH system-prompt section that asks the model to surface the few things a
 * reader needs from its reasoning, in the visible reply.
 *
 * Why: the TUI folds thinking to a single `∴ Thought for Ns` line (Claude
 * Code style) and the todo panel is gone, so the reasoning trail and the
 * step list are no longer on screen. The instruction moves the useful part
 * of both — the rough plan and the key decisions — into short prose.
 *
 * Mirrors `thinking-language.ts`: the section text is read at every
 * assembly; `false` contributes empty text, which assembly drops.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'

export const DECISION_NOTES_SECTION = 'dsh-tui:decision-notes'
/** Just before the thinking-language section (10300). */
export const DECISION_NOTES_ORDER = 10250

const INSTRUCTION = [
  'Reasoning visibility: this terminal folds your internal reasoning away and most users never expand it, and there is no todo/checklist panel. So, in your visible reply:',
  '- Before multi-step work, state the rough plan in one or two short sentences of prose (no checklists).',
  '- When you make a key decision — choosing an approach, ruling one out, changing course, or relying on an assumption that matters — say it in one short sentence with the reason.',
  '- Do not narrate routine steps or restate your reasoning in full.',
].join('\n')

export function decisionNotesInstruction(enabled: boolean): string {
  return enabled ? INSTRUCTION : ''
}

/**
 * Register the section once the DSH `systemPrompt` service is available; a
 * kernel without it (non-DSH backends) never fires the inject.
 */
export function registerDecisionNotes(ctx: Context, enabled: () => boolean): void {
  ctx.inject(['systemPrompt'], promptCtx => {
    promptCtx.systemPrompt.section({
      name: DECISION_NOTES_SECTION,
      order: DECISION_NOTES_ORDER,
      text: () => decisionNotesInstruction(enabled()),
      interpolate: false,
    })
  })
}
