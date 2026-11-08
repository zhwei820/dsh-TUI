/**
 * One-shot welcome box state, at `~/.dsh-tui/welcome.json`.
 *
 * The compact welcome box greets the FIRST launch only; every later launch
 * opens straight onto the conversation. Same shape and best-effort rules as
 * `homePrefs`: a missing, unreadable or corrupt file means "not seen yet",
 * and the worst outcome of a broken file is one extra greeting.
 *
 * @module @deepseek-harness-tui/dsh-tui/welcomePrefs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR } from './utils/paths.js'

const FILE = 'welcome.json'

/** True once the welcome box has been shown on this installation. */
export function readWelcomeSeen(dir: string = DATA_DIR): boolean {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(dir, FILE), 'utf8'))
    return parsed !== null && typeof parsed === 'object' && (parsed as { seen?: unknown }).seen === true
  } catch {
    return false
  }
}

/** Record that the welcome box was shown (best effort). */
export function markWelcomeSeen(dir: string = DATA_DIR): boolean {
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, FILE), `${JSON.stringify({ seen: true }, null, 2)}\n`, 'utf8')
    return true
  } catch {
    return false
  }
}
