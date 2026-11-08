/**
 * Thinking language (settings `dsh-tui.thinkingLanguage`): one global DSH
 * system-prompt section asking the model to reason and reply in a chosen
 * language. `off` (default) contributes empty text, which assembly drops, so
 * the prompt stays byte-identical to a build without this setting.
 *
 * The section text is read at every assembly, so a /settings edit applies
 * from the next model step without re-registering. DeepSeek exposes no API
 * parameter for the reasoning language; a prompt instruction is the only
 * lever and remains a soft constraint.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'

export type ThinkingLanguage = 'off' | 'zh' | 'en'

export const THINKING_LANGUAGE_SECTION = 'dsh-tui:thinking-language'
/** After the deployment persona suffix (10200): the last word on language. */
export const THINKING_LANGUAGE_ORDER = 10300

export function normalizeThinkingLanguage(value: unknown): ThinkingLanguage {
  return value === 'zh' || value === 'en' ? value : 'off'
}

const INSTRUCTIONS: Record<ThinkingLanguage, string> = {
  off: '',
  zh: 'Language: think (your internal reasoning) and reply in Simplified Chinese (简体中文), even when the user message, tool output, or code is in English. Keep code, commands, identifiers, file paths, and quoted error text in their original form.',
  en: 'Language: think (your internal reasoning) and reply in English, even when the user message, tool output, or code is in another language. Keep code, commands, identifiers, file paths, and quoted error text in their original form.',
}

export function thinkingLanguageInstruction(language: ThinkingLanguage): string {
  return INSTRUCTIONS[language]
}

/**
 * Register the section once the DSH `systemPrompt` service is available; a
 * kernel without it (non-DSH backends) never fires the inject and stays
 * untouched. The registration is disposed with the injecting fiber.
 */
export function registerThinkingLanguage(ctx: Context, current: () => ThinkingLanguage): void {
  ctx.inject(['systemPrompt'], promptCtx => {
    promptCtx.systemPrompt.section({
      name: THINKING_LANGUAGE_SECTION,
      order: THINKING_LANGUAGE_ORDER,
      text: () => thinkingLanguageInstruction(current()),
      interpolate: false,
    })
  })
}
