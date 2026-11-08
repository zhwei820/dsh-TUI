/**
 * Pure model for the transcript subagent card (Claude Code visual language):
 *
 *   ● Agent(description)                 single card, running
 *     ⎿  Read(src/auth.ts)
 *        <subagent-more-tool-uses> <hint-expand-ctrl-o>
 *
 *   ● Agent(description)                 single card, settled
 *     ⎿  Done (14 tool uses · 41.2k tokens · 1m 12s)
 *
 *   ● <subagent-group-running> <hint-expand-ctrl-o>   parallel group (head row)
 *      ├─ description · 4 tool uses · 12.1k tokens
 *      │  ⎿  Read(src/auth.ts)
 *      └─ description · 6 tool uses · 15.3k tokens   (member rows)
 *         ⎿  Done
 *
 * Everything here is render-free so the line budget (and therefore the
 * virtualized row height) is decided in one place and testable headlessly.
 *
 * @module
 */
import type { ChatRow, SubagentRow, SubagentToolCall } from '../../adapter/ports/channel-view.js'

/** Tool calls a collapsed single card shows (the most recent ones). */
export const SUBAGENT_RECENT_TOOLS = 3
/** Upper bound on tool lines an expanded (Ctrl+O) card lays out. */
export const SUBAGENT_EXPANDED_TOOLS_MAX = 200

export function isSettledSubagent(row: Pick<SubagentRow, 'status'>): boolean {
  return row.status === 'completed' || row.status === 'failed' || row.status === 'cancelled' || row.status === 'unknown'
}

/** `950` → `950`, `41_234` → `41.2k`, `1_250_000` → `1.3m`. */
export function formatTokenCount(total: number): string {
  if (total < 1000) return String(Math.max(0, Math.round(total)))
  if (total < 1_000_000) return `${trimZero((total / 1000).toFixed(1))}k`
  return `${trimZero((total / 1_000_000).toFixed(1))}m`
}

function trimZero(text: string): string {
  return text.endsWith('.0') ? text.slice(0, -2) : text
}

/** `8_400` → `8s`, `72_000` → `1m 12s`, `3_780_000` → `1h 3m`. */
export function formatAgentDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

/** Total tokens of a run, or undefined when the backend reported none. */
export function subagentTokens(row: SubagentRow): number | undefined {
  const total = row.tokens?.total ?? ((row.tokens?.input ?? 0) + (row.tokens?.output ?? 0))
  return total > 0 ? total : undefined
}

/** The backend's own tool-use count wins over the locally kept records. */
export function subagentToolUses(row: SubagentRow): number {
  return Math.max(row.reportedToolUses ?? 0, row.toolCalls.length)
}

export function subagentElapsedMs(row: SubagentRow, now: number = Date.now()): number {
  if (row.durationMs !== undefined && isSettledSubagent(row)) return row.durationMs
  return Math.max(0, (row.completedAt ?? now) - row.startedAt)
}

/** One tool call as `Name(args)` parts; args are whitespace-collapsed. */
export function toolCallParts(tool: SubagentToolCall): { name: string; args: string | undefined } {
  const args = tool.argsPreview?.replace(/\s+/g, ' ').trim()
  return { name: tool.name, args: args === undefined || args === '' ? undefined : args }
}

/**
 * Which tool calls a card shows, and how many it hides behind the
 * `+N more tool uses` line. Collapsed: the latest {@link SUBAGENT_RECENT_TOOLS}
 * while running, none once settled (the Done line summarizes the run).
 * Expanded: every call, bounded by {@link SUBAGENT_EXPANDED_TOOLS_MAX}.
 */
export function visibleToolCalls(row: SubagentRow, expanded: boolean): { tools: readonly SubagentToolCall[]; hidden: number } {
  const all = row.toolCalls
  if (expanded) {
    const tools = all.length > SUBAGENT_EXPANDED_TOOLS_MAX ? all.slice(-SUBAGENT_EXPANDED_TOOLS_MAX) : all
    return { tools, hidden: all.length - tools.length }
  }
  if (isSettledSubagent(row)) return { tools: [], hidden: 0 }
  const tools = all.slice(-SUBAGENT_RECENT_TOOLS)
  return { tools, hidden: Math.max(0, subagentToolUses(row) - tools.length) }
}

/** Status line kind under a card (the `⎿` line that ends the body). */
export type SubagentStatusLine =
  | { kind: 'initializing' }
  | { kind: 'done' }
  | { kind: 'error'; message: string }
  | { kind: 'cancelled' }
  | { kind: 'unknown' }

/**
 * The trailing status line, or undefined when a running card's tool lines
 * already say what it is doing.
 */
export function statusLineOf(row: SubagentRow, toolLines: number): SubagentStatusLine | undefined {
  switch (row.status) {
    case 'completed': return { kind: 'done' }
    case 'failed': return { kind: 'error', message: firstLine(row.error ?? row.stopReason ?? '') }
    case 'cancelled': return { kind: 'cancelled' }
    case 'unknown': return { kind: 'unknown' }
    default: return toolLines === 0 ? { kind: 'initializing' } : undefined
  }
}

function firstLine(text: string): string {
  const line = text.split('\n').find(part => part.trim() !== '')
  return (line ?? '').trim()
}

/**
 * Body lines of a SINGLE card (everything under the header): tool lines,
 * the `+N more` line, and the status line. The renderer and the height
 * signature both read this count.
 */
export function singleCardBodyLines(row: SubagentRow, expanded: boolean): number {
  const { tools, hidden } = visibleToolCalls(row, expanded)
  const status = statusLineOf(row, tools.length)
  return tools.length + (hidden > 0 ? 1 : 0) + (status === undefined ? 0 : 1)
}

/**
 * Lines of one GROUP member (its `├─` summary line plus what hangs under
 * it). Collapsed: always two — the summary and one `⎿` line (latest tool,
 * Initializing…, Done, or the error).
 */
export function groupMemberLines(row: SubagentRow, expanded: boolean): number {
  if (!expanded) return 2
  const { tools, hidden } = visibleToolCalls(row, true)
  const status = statusLineOf(row, tools.length)
  return 1 + tools.length + (hidden > 0 ? 1 : 0) + (status === undefined ? 0 : 1)
}

/** A row's place in a parallel run of subagent cards. */
export interface SubagentGroupSlot {
  /** Row ids of the run, in transcript order (≥ 2). */
  readonly memberIds: readonly number[]
  /** This row's position in {@link memberIds}. */
  readonly index: number
}

/**
 * Detect parallel runs: adjacent subagent rows where each one started
 * before every earlier member of the run had finished. Sequential
 * delegations (one ends, the next starts) stay single cards even when no
 * other row separates them. Rows without a snapshot never group.
 */
export function detectSubagentGroups(rows: readonly ChatRow[]): Map<number, SubagentGroupSlot> {
  const slots = new Map<number, SubagentGroupSlot>()
  let run: number[] = []
  let runEnd = Number.NEGATIVE_INFINITY
  const close = (): void => {
    if (run.length >= 2) {
      const memberIds = run
      memberIds.forEach((id, index) => slots.set(id, { memberIds, index }))
    }
    run = []
    runEnd = Number.NEGATIVE_INFINITY
  }
  for (const row of rows) {
    const sub = row.kind === 'subagent' ? row.subagent : undefined
    if (sub === undefined) {
      close()
      continue
    }
    if (run.length > 0 && !(sub.startedAt < runEnd)) close()
    run.push(row.id)
    const end = isSettledSubagent(sub) ? (sub.completedAt ?? sub.startedAt + (sub.durationMs ?? 0)) : Number.POSITIVE_INFINITY
    runEnd = Math.max(runEnd, end)
  }
  close()
  return slots
}

/** Aggregate state for a group header. */
export function groupSummary(members: readonly SubagentRow[]): { count: number; running: number; failed: number } {
  let running = 0
  let failed = 0
  for (const member of members) {
    if (!isSettledSubagent(member)) running++
    else if (member.status === 'failed') failed++
  }
  return { count: members.length, running, failed }
}
