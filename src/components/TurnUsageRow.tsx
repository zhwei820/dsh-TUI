import React from 'react'
import { Text } from '../ui.js'
import { t } from '../i18n.js'
import { formatDuration, formatTokens } from '../terminal-utils/format.js'
import type { TurnUsageSummary } from '../adapter/ports/channel-view.js'

/**
 * The turn ledger as display segments: tokens in/out, the cache split (only
 * when the backend reported cache tokens — an unreported cache is absent,
 * not zero), duration, the model when asked for and noted, retries, and a
 * marker on an interrupted or failed turn whose ledger is partial. Shared by
 * the transcript row and the /tokens and /status reports so the three read
 * the same.
 */
export function turnUsageParts(usage: TurnUsageSummary, options: { readonly model?: boolean } = {}): string[] {
  const parts: string[] = [
    `↑${formatTokens(usage.input)}`,
    `↓${formatTokens(usage.output)}`,
  ]
  if (usage.cacheKnown && usage.cacheRead + usage.cacheWrite > 0) {
    const cacheParts: string[] = []
    if (usage.cacheRead > 0) cacheParts.push(t('usage-cache-read', { n: formatTokens(usage.cacheRead) }))
    if (usage.cacheWrite > 0) cacheParts.push(t('usage-cache-write', { n: formatTokens(usage.cacheWrite) }))
    parts.push(t('usage-cache-segment', { parts: cacheParts.join('/') }))
  }
  parts.push(formatDuration(usage.durationMs))
  if (options.model === true && usage.noteModel === true && usage.model !== undefined) parts.push(usage.model)
  if (usage.retries > 0) parts.push(t('usage-retry-segment', { n: usage.retries }))
  if (usage.outcome === 'interrupted') parts.push(t('usage-turn-outcome-interrupted'))
  else if (usage.outcome === 'error') parts.push(t('usage-turn-outcome-error'))
  return parts
}

/**
 * The quiet right-aligned line that closes a turn. It hugs the right margin
 * one notch dimmer than the thinking timer, and names the model only when it
 * changed since the previous turn (`noteModel`, decided at projection time).
 * Formatting happens at render time so a language switch relabels history;
 * the payload itself is immutable, which is what the per-row memo compares.
 */
export function TurnUsageRow({ usage }: { usage: TurnUsageSummary }): React.ReactNode {
  return (
    <Text color="subtle" wrap="truncate">{turnUsageParts(usage, { model: true }).join(' · ')}</Text>
  )
}

/** Shortest turn that earns the compact `✻ Worked for …` line: quick
 *  exchanges finish while the user is still reading, so a line per turn
 *  would be noise. */
export const WORKED_LINE_MIN_MS = 10_000

/** Whether a turn closes with the compact line (the detailed ledger off). */
export function workedLineEligible(usage: TurnUsageSummary | undefined): boolean {
  return usage !== undefined && usage.outcome === 'completed' && usage.durationMs >= WORKED_LINE_MIN_MS
}

/** `7:46 AM` / `07:46` in the active language; undefined without a stamp. */
export function formatTurnEnd(endedAt: number | undefined, lang: string): string | undefined {
  if (endedAt === undefined || !Number.isFinite(endedAt)) return undefined
  return new Date(endedAt).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour: 'numeric', minute: '2-digit' })
}

/**
 * The compact closing line of a long turn: `✻ Worked for 1m 14s · done
 * 7:46 AM`. Shown when the detailed ledger (`turnUsageRow`) is off; a quiet
 * left-aligned note of how long the work took and when it finished — the
 * useful part when the user looks back at the screen later.
 */
export function TurnWorkedRow({ usage, lang }: { usage: TurnUsageSummary; lang: string }): React.ReactNode {
  const end = formatTurnEnd(usage.endedAt, lang)
  const worked = t('turn-worked-for', { duration: formatDuration(usage.durationMs) })
  return (
    <Text color="subtle" wrap="truncate-end">
      <Text color="accent">✻ </Text>
      {end === undefined ? worked : `${worked} · ${t('turn-done-at', { time: end })}`}
    </Text>
  )
}
