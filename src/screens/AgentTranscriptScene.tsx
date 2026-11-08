import React from 'react'
import { Box, Text, useInput, ScrollBox, type ScrollBoxHandle, useTerminalSize } from '../ui.js'
import type { SubagentOutputLine, SubagentState } from '../dsh-adapter/subagents.js'
import { AgentMessageLeafRow, AssistantTextLeafRow, PromptLeafRow, ThinkingLeafRow, ToolLeafRow } from '../components/messages/TranscriptLeaves.js'
import {
  mergeLiveWindow,
  withLiveMessages,
  OUTPUT_WINDOW_CAP,
  TRANSCRIPT_OLDER_CHUNK,
  useSubagentTranscript,
  type TranscriptLoader,
} from '../components/messages/subagentTranscript.js'
import { AgentMessageComposer } from '../components/AgentMessageComposer.js'
import { SubagentWorkingRow } from '../components/SubagentWorkingRow.js'
import { ExitButton, MainAgentButton } from '../components/SubagentDashboard.js'
import { t } from '../i18n.js'
import { decorColor, isMinimalUiMode } from '../minimalUiMode.js'
import { agentTitle, formatCny, formatSubagentSpend, formatTokenCount, subagentSpend, tildePath } from '../components/Chat/subagentCardModel.js'
import type { AgentComposeTarget, AgentMessageControl, AgentMessageView, AgentViewSource } from '../components/messages/agentTeam.js'
import { agentNeighbourhood, type AgentParentFact } from '../components/messages/agentTeam.js'

/** The workbench rail only appears on wide terminals; below this the view
 *  is the single transcript column. */
const WORKBENCH_MIN_COLUMNS = 96
const WORKBENCH_PANEL_COLUMNS = 30
const WORKBENCH_TOOL_ROWS = 5
const WORKBENCH_SIBLING_ROWS = 5

const panelStatusGlyph = (status: SubagentState['status']): { glyph: string; color?: 'warning' | 'success' | 'error' | 'subtle' } => {
  // The minimal UI keeps the plain glyph set and drops the tint (the same
  // vocabulary as SubagentDetailScene / SubagentCard).
  const minimalUi = isMinimalUiMode()
  const shown = status === 'running' || status === 'starting' ? { glyph: minimalUi ? '·' : '●', color: 'warning' as const }
    : status === 'failed' || status === 'cancelled' ? { glyph: '×', color: 'error' as const }
      : status === 'unknown' ? { glyph: minimalUi ? '·' : '○', color: 'subtle' as const }
        : { glyph: '✓', color: 'success' as const }
  return minimalUi ? { glyph: shown.glyph } : shown
}

const panelFormatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000)
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m${seconds % 60}s`
}

/** One switchable neighbourhood row (a sibling, or the parent when the
 *  roster still holds it): click or panel-Enter swaps the viewed agent in
 *  place — the source stack is NOT pushed (Esc still exits to the original
 *  entry point, never to the previously viewed agent). */
function AgentSwitchRow({ agent, selected, onSelect }: { readonly agent: SubagentState; readonly selected: boolean; onSelect(): void }): React.ReactNode {
  const [hovered, setHovered] = React.useState(false)
  const { glyph, color } = panelStatusGlyph(agent.status)
  return (
    <Box
      onClick={onSelect}
      onMouseEnter={(): void => setHovered(true)}
      onMouseLeave={(): void => setHovered(false)}
      backgroundColor={hovered && !selected ? 'userMessageBackgroundHover' : undefined}
    >
      <Text color={selected ? decorColor('accent' as const) : undefined} wrap="truncate-end">{` ${selected ? '▸' : ' '} ${glyph} `}</Text>
      <Text color={selected ? decorColor('accent' as const) : color} wrap="truncate-end">{agent.description}</Text>
    </Box>
  )
}

/** The parent line: a named parent, the main loop (depth 1), or unknown —
 *  never a guess. A parent the roster lost is named but not switchable. */
function AgentParentRow({ fact, rosterIds }: { readonly fact: AgentParentFact; readonly rosterIds: ReadonlySet<string> }): React.ReactNode {
  if (fact.kind === 'main') return <Text dimColor>{'  ' + t('agent-view-parent-main')}</Text>
  if (fact.kind === 'unknown') return <Text dimColor>{'  ' + t('agent-view-parent-unknown')}</Text>
  if (!rosterIds.has(fact.agentId)) return <Text dimColor wrap="truncate-end">{'  ' + t('agent-view-parent-not-in-roster', { id: fact.agentId.slice(0, 8) })}</Text>
  return <Text dimColor wrap="truncate-end">{'  ' + t('agent-view-parent-agent', { id: fact.agentId.slice(0, 8) })}</Text>
}

const sourceLabel = (source: AgentViewSource): string =>
  source.kind === 'chat' ? t('agent-view-source-chat')
    : source.kind === 'agents-dashboard' ? t('agent-view-source-dashboard')
      : source.kind === 'agent-detail' ? t('agent-view-source-detail')
        : t('agent-view-source-card')

export interface AgentTranscriptSceneProps {
  /** The child this view reads. Readonly by contract — the scene never
   *  mutates the roster, the Channel or the parent's queues. */
  readonly subagent: SubagentState
  /** Called when this failed child is shown, never for its siblings. */
  onFailureRead?: (subagent: SubagentState) => void
  /** Where Esc returns to. */
  readonly source: AgentViewSource
  onExit(): void
  /** The child's full transcript (`subagentControl.history`). Absent = no
   *  transcript source: the bounded live tail with its retained-range note,
   *  not an empty history. */
  loadTranscript?: TranscriptLoader
  /** The durable agent↔agent feed for this child (newest last), if any. */
  readonly messages?: readonly AgentMessageView[]
  /** The channel's message control + resolved target
   *  (`subagentControl.message`); absent = no composer. */
  readonly compose?: { readonly control: AgentMessageControl; readonly target: AgentComposeTarget }
  /** The session roster: drives the workbench rail (metadata, tools,
   *  parent, sibling switcher). Absent, or a narrow terminal = the single
   *  transcript column. */
  readonly roster?: readonly SubagentState[]
  /** Switch the viewed agent IN PLACE (sibling/parent navigation): the
   *  source stack is preserved — Esc still returns to the original entry
   *  point. Absent = the panel renders read-only rows without switching. */
  onSwitchAgent?: (agentId: string) => void
  /** Leave every agent scene straight to the main agent's chat (the header's
   *  「← 主代理」 button), skipping the source stack Esc/✕ walk back through.
   *  Absent = no button. */
  onReturnToMain?: () => void
}

/**
 * The main-screen read-only view of one subagent: a scene over the mounted
 * parent Chat, not a second Channel. The parent's rows, draft, pending
 * queue and usage keep living underneath; Esc returns to where the view
 * was opened from (chat, agents dashboard, agent detail, transcript card).
 * The body uses the same transcript pager as the Detail page, with the
 * live SubagentState tail merged in.
 */
export function AgentTranscriptScene({ subagent, onFailureRead, source, onExit, loadTranscript, messages = [], compose, roster, onSwitchAgent, onReturnToMain }: AgentTranscriptSceneProps): React.ReactNode {
  React.useEffect(() => {
    if (subagent.status === 'failed') onFailureRead?.(subagent)
  }, [subagent, onFailureRead])
  const scrollRef = React.useRef<ScrollBoxHandle | null>(null)
  const followRef = React.useRef(true)
  React.useEffect(() => {
    const handle = scrollRef.current
    if (handle === null) return undefined
    return handle.subscribe(() => { followRef.current = handle.isSticky() })
  }, [])
  const { rows, columns } = useTerminalSize()
  const isRunning = subagent.status === 'running' || subagent.status === 'starting'

  // ── workbench rail: only on wide terminals, and only with a roster ──────
  const panelEnabled = roster !== undefined && columns >= WORKBENCH_MIN_COLUMNS
  const [panelFocused, setPanelFocused] = React.useState(false)
  const [siblingCursor, setSiblingCursor] = React.useState(0)

  // ── history pages (the same pager the Detail transcript page uses) ──
  const [expandedLeaf, setExpandedLeaf] = React.useState<string | null>(null)
  const agentId = subagent.agentId
  // Settlement makes the disk copy final: the isRunning flip reloads once.
  const { transcript, loadOlder } = useSubagentTranscript(loadTranscript, agentId, true, isRunning, messages)
  React.useEffect(() => { setExpandedLeaf(null) }, [agentId, isRunning])

  // ── workbench neighbourhood: the loaded transcript's parent fact wins
  // (the disk copy); until it loads the roster's fields speak. ────────────
  const transcriptParent = transcript.status === 'ready' ? transcript.parentAgentId : undefined
  const neighbourhood = React.useMemo(
    () => roster === undefined ? { parent: { kind: 'unknown' } as const, siblings: [] as readonly SubagentState[] } : agentNeighbourhood(subagent, roster, transcriptParent),
    [roster, subagent, transcriptParent],
  )
  const rosterIds = React.useMemo(() => new Set((roster ?? []).map(row => row.agentId)), [roster])
  const parentFact = neighbourhood.parent
  const parentRow = parentFact.kind === 'agent'
    ? (roster ?? []).find(row => row.agentId === parentFact.agentId)
    : undefined
  // Switch targets in panel order: the parent (when still in the roster),
  // then the siblings — the keyboard cursor and clicks share this list.
  const switchTargets = React.useMemo(() => {
    const targets: SubagentState[] = []
    if (parentRow !== undefined) targets.push(parentRow)
    targets.push(...neighbourhood.siblings.slice(0, WORKBENCH_SIBLING_ROWS))
    return targets
  }, [neighbourhood, parentRow])
  const switchTo = (agentId: string): void => { onSwitchAgent?.(agentId) }
  // A switch re-targets the view: the transcript effect reloads per
  // agentId, and the sibling cursor + scroll origin reset so nothing from
  // the previously viewed agent lingers above the fold.
  React.useEffect(() => {
    setSiblingCursor(0)
    followRef.current = true
    scrollRef.current?.scrollTo(0)
  }, [agentId])

  // ── keyboard: the scene owns the whole screen while open ────────────────
  const [composerFocused, setComposerFocused] = React.useState(true)
  useInput((input, key, event) => {
    // The focused workbench rail owns every key: the arrows walk the switch
    // targets, Enter switches in place, Esc/Tab hand focus back. Esc here
    // does not exit the scene — that happens only when no inner layer
    // holds focus.
    if (panelFocused && panelEnabled) {
      event.stopImmediatePropagation()
      if (key.escape || key.tab) {
        setPanelFocused(false)
        setComposerFocused(compose !== undefined)
        return
      }
      if (key.upArrow || key.downArrow) {
        setSiblingCursor(cursor => Math.max(0, Math.min(switchTargets.length - 1, cursor + (key.downArrow ? 1 : -1))))
        return
      }
      if (input === '' && key.return) {
        const target = switchTargets[siblingCursor]
        if (target !== undefined) switchTo(target.agentId)
        return
      }
      return
    }
    // Tab enters the workbench rail when it exists (the composer editor has
    // no tab stops).
    if (key.tab && panelEnabled) {
      event.stopImmediatePropagation()
      setPanelFocused(true)
      setComposerFocused(false)
      return
    }
    // A focused composer owns plain typing; the scene still takes the
    // vertical arrows so the transcript keeps scrolling.
    if (composerFocused && compose !== undefined) {
      if (key.pageUp || key.pageDown) {
        event.stopImmediatePropagation()
        scrollRef.current?.scrollBy(key.pageUp ? -8 : 8)
        return
      }
      if (key.upArrow || key.downArrow) {
        event.stopImmediatePropagation()
        scrollRef.current?.scrollBy(key.upArrow ? -3 : 3)
      }
      return
    }
    if (key.escape || (key.ctrl && input === 'c')) {
      event.stopImmediatePropagation()
      onExit()
      return
    }
    if (key.upArrow) {
      event.stopImmediatePropagation()
      scrollRef.current?.scrollBy(-3)
      return
    }
    if (key.downArrow) {
      event.stopImmediatePropagation()
      scrollRef.current?.scrollBy(3)
      return
    }
    if (key.pageUp || key.pageDown) {
      event.stopImmediatePropagation()
      scrollRef.current?.scrollBy(key.pageUp ? -8 : 8)
      return
    }
    if (input.toLowerCase() === 'o') {
      event.stopImmediatePropagation()
      loadOlder()
      return
    }
    if (input === '' && key.return && compose !== undefined) {
      event.stopImmediatePropagation()
      setComposerFocused(true)
      return
    }
    event.stopImmediatePropagation()
  }, { isActive: true })

  // Follow the tail while the child runs, until the user scrolls away from
  // the bottom (wheel, arrows, page keys); back at the bottom it follows
  // again. The subscription reads the sticky bit when the scroll settles,
  // so the view's own scrollTo/scrollToBottom calls land correctly too.
  const tailLength = subagent.outputEvents.length
  React.useEffect(() => {
    const handle = scrollRef.current
    if (!isRunning || handle === null) return
    if (followRef.current || handle.isSticky()) handle.scrollToBottom()
  }, [isRunning, tailLength])
  // Sending jumps to the tail: the user's own prompt and the child's answer
  // to it land there, wherever the view was scrolled.
  const ownSent = messages.filter(message => message.from === 'user').length
  const ownSentRef = React.useRef(ownSent)
  React.useEffect(() => {
    if (ownSent > ownSentRef.current) {
      followRef.current = true
      scrollRef.current?.scrollToBottom()
    }
    ownSentRef.current = ownSent
  }, [ownSent])

  const headerWidth = Math.max(20, columns - 8)
  const headerLabel = agentTitle(subagent.description)
  // 没有 history 来源时不标 history（只剩有界 tail，由范围说明解释）。
  const liveBadge = isRunning ? t('agent-view-live') : loadTranscript === undefined ? '' : t('agent-view-history')
  const hasHistory = loadTranscript !== undefined && transcript.status === 'ready'
  // Narrow terminals keep the agent's name: read-only and the short id are
  // repeated below the header, so they are the first to go.
  // Cumulative tokens + price (the per-child ledger): a header badge on wide
  // terminals; narrow ones lead the hint line with it so the name survives.
  const spend = subagentSpend(subagent)
  const spendText = spend === undefined ? '' : formatSubagentSpend(spend)
  const headerBadges = headerWidth < 64
    ? (liveBadge === '' ? '' : ` · ${liveBadge}`)
    : `${liveBadge === '' ? '' : ` · ${liveBadge}`}${spendText === '' ? '' : ` · ${spendText}`}${compose === undefined ? ` · ${t('agent-view-readonly')}` : ''} · id ${agentId.slice(0, 8)}`
  const fallbackTail = subagent.outputEvents
  const retained = fallbackTail.length >= OUTPUT_WINDOW_CAP

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {/* Header: identity + live/history + read-only, one truncating line. */}
      <Box flexDirection="row" gap={1}>
        {/* Header decoration: the minimal UI drops the ⤢ mark. */}
        {!isMinimalUiMode() && <Box flexShrink={0}><Text color="accent" bold>⤢</Text></Box>}
        <Box flexShrink={1} minWidth={0}><Text bold wrap="truncate-end">{headerLabel}</Text></Box>
        <Box flexShrink={0}><Text dimColor>{headerBadges}</Text></Box>
        <Box flexGrow={1} />
        {onReturnToMain !== undefined && <Box flexShrink={0}><MainAgentButton onClick={onReturnToMain} compact={headerWidth < 44} /></Box>}
        <Box flexShrink={0}><ExitButton onClick={onExit} /></Box>
      </Box>
      {/* The `o` hint only when older records actually remain: an always-on
          "load 400 older" read as "the start (the task) is not here". */}
      <Text dimColor wrap="truncate-end">{`${headerWidth < 64 && spendText !== '' ? `${spendText} · ` : ''}${t('agent-view-title')} · ${sourceLabel(source)} · ${t('agent-view-back')}: Esc${headerWidth < 44 ? '' : ` · ↑/↓ ${t('subagent-hint-scroll')}${transcript.status === 'ready' && transcript.hasOlder ? ` · o ${t('subagent-transcript-load-older', { count: Math.min(TRANSCRIPT_OLDER_CHUNK, transcript.skippedFromStart) })}` : ''}`}`}</Text>

      {/* The child's working directory; truncated from the left so the
          deepest folders stay readable. */}
      {subagent.cwd !== undefined && (
        <Text dimColor wrap="truncate-start">{`${t('agent-view-field-cwd')} ${tildePath(subagent.cwd)}`}</Text>
      )}

      {/* Body: the transcript column, plus the workbench rail on wide
       * terminals. */}
      <Box flexDirection="row" paddingX={1} maxHeight={Math.max(10, rows - (compose !== undefined ? 12 : 6) - (subagent.cwd !== undefined ? 1 : 0) - (isRunning ? 1 : 0))}>
        <Box flexDirection="column" flexGrow={1} minWidth={panelEnabled ? 44 : 0}>
        <ScrollBox ref={scrollRef} flexDirection="column" flexGrow={1}>
          {loadTranscript === undefined ? (
            <Box flexDirection="column">
              {/* No transcript source: the bounded tail and its retained
               *  range note. */}
              <Text dimColor>{t('agent-view-no-transcript')}</Text>
              {retained && (
                <Text dimColor>{t('agent-view-retained-tail', { count: fallbackTail.length })}</Text>
              )}
              {fallbackTail.length === 0 && messages.length === 0 && (
                <Text dimColor>{t('subagent-no-output')}</Text>
              )}
              {/* Reasoning folds like the main agent's: a run of thinking
                  lines is one folded `∴` row; the main process stays visible. */}
              {foldTailThinking(fallbackTail).map((entry, index) => entry.kind === 'thinking' ? (
                <ThinkingLeafRow key={`tail-think-${index}`} thinking={entry.text} marginTopOnTurn={false} verbose={false} />
              ) : (
                <Text
                  key={`tail-${index}`}
                  wrap="wrap"
                  dimColor={entry.line.kind === 'system'}
                  color={entry.line.kind === 'error' ? 'error' : undefined}
                >
                  {entry.line.text}{!entry.line.settled && isRunning ? ' ▍' : ''}
                </Text>
              ))}
              {messages.map(message => (
                <AgentMessageLeafRow key={`am-${message.messageId}`} message={message} selfAgentId={agentId} marginTopOnTurn />
              ))}
            </Box>
          ) : (
            <Box flexDirection="column">
              <Text dimColor>{`${hasHistory ? t('agent-view-history') : t('agent-view-live')}${compose === undefined ? ` · ${t('agent-view-readonly')}` : ''}`}</Text>
              {transcript.status === 'ready' && transcript.parentAgentId !== null && (
                <Text dimColor>{t('subagent-transcript-parent', { id: transcript.parentAgentId.slice(0, 8) })}</Text>
              )}
              {transcript.status === 'ready' && transcript.parentAgentId === null && (subagent.depth ?? 1) >= 2 && (
                <Text dimColor>{t('subagent-transcript-old-format', { depth: subagent.depth ?? 2 })}</Text>
              )}
              {transcript.status === 'loading' && <Text dimColor>{`⏳ ${t('subagent-transcript-loading')}`}</Text>}
              {transcript.status === 'unavailable' && <Text color="error">{t('subagent-transcript-unavailable')}</Text>}
              {transcript.status === 'ready' && (() => {
                const merged = withLiveMessages(mergeLiveWindow(transcript.leaves, subagent, true), messages, transcript.messagesFrom, subagent.agentId)
                const liveStart = merged.findIndex(row => row.kind === 'live')
                // The delegating task is the first prompt of the WHOLE log; with
                // older pages still unloaded the first visible one is a follow-up.
                const firstPromptKey = transcript.hasOlder ? undefined : merged.find(row => row.kind === 'prompt')?.key
                if (merged.length === 0) return <Text dimColor>{t('subagent-transcript-empty')}</Text>
                return (
                  <>
                    {/* The task sits on the oldest page: pin it here until that
                        page is loaded and shows it in place. */}
                    {transcript.hasOlder && transcript.task !== undefined && (
                      <PromptLeafRow text={transcript.task} first marginTopOnTurn={false} />
                    )}
                    {transcript.hasOlder && (
                      <Box onClick={loadOlder} marginTop={1}>
                        <Text color={decorColor('accent' as const)}>{transcript.loadingOlder
                          ? `⏳ ${t('subagent-transcript-loading')}`
                          : `▸ ${t('subagent-transcript-load-older', { count: Math.min(TRANSCRIPT_OLDER_CHUNK, transcript.skippedFromStart) })}`}</Text>
                      </Box>
                    )}
                    {merged.map((row, index) => {
                      const margin = index > 0
                      if (row.kind === 'live') {
                        const line = row.line
                        const unsettled = !line.settled && isRunning ? ' ▍' : ''
                        return (
                          <React.Fragment key={`live-${index}`}>
                            {index === liveStart && <Text dimColor>{`── ${t('subagent-transcript-live')} ──`}</Text>}
                            <Text
                              wrap="wrap"
                              dimColor={line.kind === 'thinking' || line.kind === 'system'}
                              italic={line.kind === 'thinking'}
                              color={line.kind === 'error' ? 'error' : undefined}
                            >
                              {line.text}{unsettled}
                            </Text>
                          </React.Fragment>
                        )
                      }
                      if (row.kind === 'thinking') {
                        return <ThinkingLeafRow key={`think-${row.key}`} thinking={row.text} marginTopOnTurn={margin} verbose={false} />
                      }
                      if (row.kind === 'thinking-unavailable') {
                        return (
                          <Box key={`ua-${row.key}`} marginTop={margin ? 1 : 0}>
                            <Text dimColor italic>{row.tokens !== undefined ? t('subagent-thinking-count-only', { tokens: row.tokens }) : t('subagent-thinking-unavailable')}</Text>
                          </Box>
                        )
                      }
                      if (row.kind === 'text') {
                        return <AssistantTextLeafRow key={`text-${row.key}`} text={row.text} marginTopOnTurn={margin} />
                      }
                      if (row.kind === 'prompt') {
                        return <PromptLeafRow key={`prompt-${row.key}`} text={row.text} first={firstPromptKey === row.key} marginTopOnTurn={margin} />
                      }
                      if (row.kind === 'agent-message') {
                        return <AgentMessageLeafRow key={`am-${row.key}`} message={row.message} selfAgentId={agentId} marginTopOnTurn={margin} />
                      }
                      return (
                        <ToolLeafRow
                          key={`tool-${row.key}`}
                          tool={row.tool}
                          marginTopOnTurn={margin}
                          verbose={expandedLeaf === row.key}
                          isExpanded={expandedLeaf === row.key}
                          onClick={() => setExpandedLeaf(prev => prev === row.key ? null : row.key)}
                        />
                      )
                    })}
                  </>
                )
              })()}
            </Box>
          )}
        </ScrollBox>
        </Box>
        {panelEnabled && roster !== undefined && (
          <WorkbenchPanel
            subagent={subagent}
            parent={neighbourhood.parent}
            parentRow={parentRow}
            rosterIds={rosterIds}
            siblings={neighbourhood.siblings}
            switchTargets={switchTargets}
            cursor={siblingCursor}
            focused={panelFocused}
            onSwitch={switchTo}
          />
        )}
      </Box>

      {/* The main turn's working line while the child runs, so a child that
          is thinking or waiting on the model does not read as stuck. */}
      {isRunning && (
        <Box paddingX={1}>
          <SubagentWorkingRow subagent={subagent} />
        </Box>
      )}

      {/* Composer, when there is a send path. Keyed by the target agent: a
       *  sibling switch remounts the editor, so a draft never moves to
       *  another agent. */}
      {compose !== undefined && (
        <Box flexDirection="column" marginTop={1}>
          <AgentMessageComposer
            key={compose.target.agentId}
            target={compose.target}
            control={compose.control}
            messages={messages}
            targetRunning={isRunning}
            focused={composerFocused}
            onFocusChange={setComposerFocused}
          />
        </Box>
      )}
    </Box>
  )
}

/** The retained output tail with each run of thinking lines folded into one
 *  entry (rendered as a single collapsed thinking row). */
function foldTailThinking(lines: readonly SubagentOutputLine[]): Array<{ kind: 'thinking'; text: string } | { kind: 'line'; line: SubagentOutputLine }> {
  const out: Array<{ kind: 'thinking'; text: string } | { kind: 'line'; line: SubagentOutputLine }> = []
  for (const line of lines) {
    const last = out.at(-1)
    if (line.kind === 'thinking') {
      if (last !== undefined && last.kind === 'thinking') last.text = `${last.text}\n${line.text}`
      else out.push({ kind: 'thinking', text: line.text })
    } else {
      out.push({ kind: 'line', line })
    }
  }
  return out
}

/** One label/value metadata line of the workbench panel. */
function PanelMetaRow({ label, value }: { readonly label: string; readonly value: string | undefined }): React.ReactNode {
  if (value === undefined || value === '') return null
  return (
    <Box>
      <Box flexShrink={0} width={9}><Text dimColor>{label}</Text></Box>
      <Text wrap="truncate-end">{value}</Text>
    </Box>
  )
}

/**
 * The workbench rail: metadata, the tool records the roster kept (with the
 * backend's own count when it reported one), and the parent / sibling
 * neighbourhood. Switching goes through the caller's onSwitch; the rail
 * never touches the roster, the Channel or the source stack, and an
 * unknown parent stays unknown.
 */
function WorkbenchPanel({ subagent, parent, parentRow, rosterIds, siblings, switchTargets, cursor, focused, onSwitch }: {
  readonly subagent: SubagentState
  readonly parent: AgentParentFact
  readonly parentRow: SubagentState | undefined
  readonly rosterIds: ReadonlySet<string>
  readonly siblings: readonly SubagentState[]
  readonly switchTargets: readonly SubagentState[]
  readonly cursor: number
  readonly focused: boolean
  onSwitch(agentId: string): void
}): React.ReactNode {
  const running = subagent.status === 'running' || subagent.status === 'starting'
  const elapsed = running
    ? Date.now() - subagent.startedAt
    : subagent.completedAt !== undefined ? subagent.completedAt - subagent.startedAt : undefined
  const shownDuration = subagent.reportedDurationMs ?? elapsed
  const toolsCount = subagent.reportedToolUses ?? subagent.toolCalls.length
  const spend = subagentSpend(subagent)
  const keptTools = subagent.toolCalls.slice(-WORKBENCH_TOOL_ROWS)
  const hiddenTools = Math.max(0, subagent.toolCalls.length - keptTools.length)
  const shownSiblings = siblings.slice(0, WORKBENCH_SIBLING_ROWS)
  const hiddenSiblings = Math.max(0, siblings.length - shownSiblings.length)
  // The cursor indexes switchTargets (the parent first when it is still in
  // the roster, then the siblings); the rows below render in that same
  // order, so the marker lands on what Enter will switch to.
  const cursorOf = (agentId: string): boolean => focused && switchTargets[cursor]?.agentId === agentId
  return (
    <Box
      flexDirection="column"
      width={WORKBENCH_PANEL_COLUMNS}
      paddingLeft={1}
      borderStyle="single"
      borderLeft
      borderRight={false}
      borderTop={false}
      borderBottom={false}
      borderColor="inactive"
    >
      <Text bold color={focused ? decorColor('accent' as const) : undefined}>{t('agent-view-panel-title')}</Text>
      <Text dimColor>{' ' + t('agent-view-panel-metadata') + ' ─────'}</Text>
      <PanelMetaRow label={t('agent-view-field-status')} value={subagent.status} />
      <PanelMetaRow label={t('agent-view-field-mode')} value={subagent.mode} />
      <PanelMetaRow label={t('agent-view-field-model')} value={subagent.model ?? subagent.provider} />
      <PanelMetaRow label={t('agent-view-field-tokens')} value={spend !== undefined ? formatTokenCount(spend.tokens) : subagent.tokens === undefined ? undefined : String(subagent.tokens.total ?? ((subagent.tokens.input ?? 0) + (subagent.tokens.output ?? 0)))} />
      <PanelMetaRow label={t('agent-view-field-cost')} value={spend?.cny === undefined ? undefined : formatCny(spend.cny)} />
      <PanelMetaRow label={t('agent-view-field-duration')} value={shownDuration === undefined ? undefined : panelFormatDuration(shownDuration)} />
      <PanelMetaRow label={t('agent-view-field-run')} value={subagent.runId === undefined ? undefined : subagent.runId.slice(0, 8)} />
      <PanelMetaRow label={t('agent-view-field-session')} value={subagent.sessionId === undefined ? undefined : subagent.sessionId.slice(0, 8)} />
      <PanelMetaRow label={t('agent-view-field-depth')} value={subagent.depth === undefined ? undefined : String(subagent.depth)} />
      <Text dimColor>{' ' + t('agent-view-panel-tools') + ' ────────'}</Text>
      {subagent.toolCalls.length === 0 && subagent.reportedToolUses === undefined && (
        <Text dimColor>{'  ' + t('agent-view-tools-none')}</Text>
      )}
      {subagent.reportedToolUses !== undefined && subagent.reportedToolUses !== subagent.toolCalls.length && (
        <Text dimColor>{'  ' + t('agent-view-tools-reported', { reported: toolsCount, kept: subagent.toolCalls.length })}</Text>
      )}
      {keptTools.map(tool => (
        <Box key={tool.id ?? tool.name + tool.startedAt}>
          <Box flexShrink={0}><Text color={decorColor(tool.status === 'failed' ? 'error' as const : tool.status === 'running' ? 'warning' as const : 'success' as const)}>{tool.status === 'failed' ? '× ' : tool.status === 'running' ? (isMinimalUiMode() ? '· ' : '● ') : '✓ '}</Text></Box>
          <Text wrap="truncate-end" dimColor={tool.status === 'completed'}>{tool.name}</Text>
        </Box>
      ))}
      {hiddenTools > 0 && <Text dimColor>{'  ' + t('agent-view-tools-more', { count: hiddenTools })}</Text>}
      <Text dimColor>{' ' + t('agent-view-parent-context') + ' ──────'}</Text>
      {parentRow !== undefined
        ? <AgentSwitchRow agent={parentRow} selected={cursorOf(parentRow.agentId)} onSelect={(): void => onSwitch(parentRow.agentId)} />
        : <AgentParentRow fact={parent} rosterIds={rosterIds} />}
      {shownSiblings.map(agent => (
        <AgentSwitchRow key={agent.agentId} agent={agent} selected={cursorOf(agent.agentId)} onSelect={(): void => onSwitch(agent.agentId)} />
      ))}
      {hiddenSiblings > 0 && <Text dimColor>{'  ' + t('agent-view-siblings-more', { count: hiddenSiblings })}</Text>}
      {siblings.length === 0 && <Text dimColor>{'  ' + t('agent-view-siblings-none')}</Text>}
      <Box marginTop={1}>
        <Text dimColor>{focused ? t('agent-view-select-sibling-focused') : t('agent-view-select-sibling')}</Text>
      </Box>
    </Box>
  )
}
