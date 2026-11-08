#!/usr/bin/env node
/**
 * Stamp lib/build-info.json with the git commit this lib/ was compiled from,
 * so the start screen can show WHICH build is running — source newer than
 * the compiled lib is exactly what the stamp exposes. Not committed (lib/ is
 * generated); ships in the npm package with the rest of lib/.
 *
 * Never fails the build: outside a git checkout (or without git) it writes
 * `{}` and the start screen simply shows no commit.
 *
 * Usage: node scripts/gen-build-info.mjs   (run after tsc, part of `pnpm compile`)
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const output = new URL('../lib/build-info.json', import.meta.url)

const git = args => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 5000 })
  return result.status === 0 ? result.stdout.trim() : undefined
}

const info = {}
const commit = git(['rev-parse', 'HEAD'])
if (commit !== undefined && /^[0-9a-f]{40}$/.test(commit)) {
  info.commit = commit
  // Tracked changes only: an untracked scratch file does not change the build.
  const status = git(['status', '--porcelain', '--untracked-files=no'])
  if (status !== undefined) info.dirty = status !== ''
  info.builtAt = new Date().toISOString()
}

mkdirSync(new URL('../lib/', import.meta.url), { recursive: true })
writeFileSync(output, `${JSON.stringify(info, null, 2)}\n`)
console.log(info.commit === undefined ? 'build-info: no git commit (stamp left empty)' : `build-info: ${info.commit.slice(0, 7)}${info.dirty === true ? ' (dirty)' : ''}`)
