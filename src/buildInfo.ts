/**
 * Which build is running: the git commit stamped into lib/build-info.json at
 * compile time (scripts/gen-build-info.mjs). The stamp is what identifies the
 * running code — a checkout whose source moved past the compiled lib still
 * reports the commit the lib was built from.
 *
 * Running straight from src/ (tsx) has no stamp next to the module; the
 * checkout's own HEAD is read from the .git files instead (no git process).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface BuildInfo {
  /** Full 40-hex commit id. */
  readonly commit: string
  /** Tracked changes were present when the lib was compiled. */
  readonly dirty?: boolean
}

const COMMIT = /^[0-9a-f]{40}$/

function readStamp(here: string): BuildInfo | undefined {
  // lib/types/buildInfo.js → lib/build-info.json
  try {
    const raw = JSON.parse(readFileSync(join(here, '..', 'build-info.json'), 'utf8')) as { commit?: unknown; dirty?: unknown }
    if (typeof raw.commit !== 'string' || !COMMIT.test(raw.commit)) return undefined
    return raw.dirty === true ? { commit: raw.commit, dirty: true } : { commit: raw.commit }
  } catch {
    return undefined
  }
}

function readCheckoutHead(root: string): BuildInfo | undefined {
  try {
    const gitDir = join(root, '.git')
    const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim()
    if (COMMIT.test(head)) return { commit: head }
    const ref = /^ref: (.+)$/.exec(head)?.[1]
    if (ref === undefined) return undefined
    try {
      const loose = readFileSync(join(gitDir, ref), 'utf8').trim()
      if (COMMIT.test(loose)) return { commit: loose }
    } catch { /* packed below */ }
    for (const line of readFileSync(join(gitDir, 'packed-refs'), 'utf8').split('\n')) {
      const [sha, name] = line.trim().split(' ')
      if (name === ref && sha !== undefined && COMMIT.test(sha)) return { commit: sha }
    }
    return undefined
  } catch {
    return undefined
  }
}

let cached: BuildInfo | null | undefined

/** The running build's commit, or undefined when nothing identifies it. */
export function buildInfo(): BuildInfo | undefined {
  if (cached !== undefined) return cached ?? undefined
  const here = dirname(fileURLToPath(import.meta.url))
  cached = readStamp(here) ?? (here.endsWith('src') ? readCheckoutHead(join(here, '..')) : undefined) ?? null
  return cached ?? undefined
}

/** `6605b81` / `6605b81+` (dirty build), or '' when unknown. */
export function buildCommitLabel(): string {
  const info = buildInfo()
  return info === undefined ? '' : `${info.commit.slice(0, 7)}${info.dirty === true ? '+' : ''}`
}
