/**
 * Decision-notes system-prompt section (src/dsh-adapter/decision-notes.ts).
 *
 *   D1. On: the section asks for the rough plan and key decisions in prose,
 *       and forbids checklists / routine narration.
 *   D2. Off: empty text (assembly drops it — the prompt is unchanged).
 *   D3. Registration: one section under the documented name/order, its text
 *       read live (a toggle lands on the next assembly), no interpolation.
 *
 * Run: node --import tsx/esm scripts/verify-decision-notes.ts
 */
import assert from 'node:assert/strict'
import {
  DECISION_NOTES_ORDER,
  DECISION_NOTES_SECTION,
  decisionNotesInstruction,
  registerDecisionNotes,
} from '../src/dsh-adapter/decision-notes.js'
import { THINKING_LANGUAGE_ORDER } from '../src/dsh-adapter/thinking-language.js'

const on = decisionNotesInstruction(true)
assert.match(on, /rough plan/)
assert.match(on, /key decision/)
assert.match(on, /no checklists/)
assert.match(on, /Do not narrate routine steps/)
assert.equal(decisionNotesInstruction(false), '')

let section: { name: string; order: number; text: () => string; interpolate: boolean } | undefined
const ctx = {
  inject(deps: string[], fn: (ctx: unknown) => void) {
    assert.deepEqual(deps, ['systemPrompt'])
    fn({ systemPrompt: { section(def: typeof section) { section = def } } })
  },
}
let enabled = true
registerDecisionNotes(ctx as never, () => enabled)
assert.ok(section, 'section registered')
assert.equal(section!.name, DECISION_NOTES_SECTION)
assert.equal(section!.order, DECISION_NOTES_ORDER)
assert.ok(DECISION_NOTES_ORDER < THINKING_LANGUAGE_ORDER, 'the language section keeps the last word')
assert.equal(section!.interpolate, false)
assert.equal(section!.text(), on)
enabled = false
assert.equal(section!.text(), '', 'text is read live')

console.log('decision notes OK (instruction, off switch, registration)')
