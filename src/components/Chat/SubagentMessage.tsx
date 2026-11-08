import React from 'react'
import { Box, Text } from '../../ui.js'
import type { SubagentRow, SubagentToolCall } from '../../adapter/ports/channel-view.js'
import { t } from '../../i18n.js'
import { primaryComboString } from '../../utils/keymap.js'
import { ToolUseLoader } from '../ToolUseLoader.js'
import { toolNameColor } from '../messages/AssistantToolUseMessage.js'
import type { ClickEvent } from '../../ink/events/click-event.js'
import {
  AGENT_LABEL,
  formatAgentDuration,
  formatTokenCount,
  isSettledSubagent,
  statusLineOf,
  subagentElapsedMs,
  subagentTokens,
  subagentToolUses,
  toolCallParts,
  visibleToolCalls,
  type SubagentStatusLine,
} from './subagentCardModel.js'

/** Body gutter, aligned with the tool card's (`AssistantToolUseMessage`). */
const GUTTER_FIRST = ' ⎿ '
const GUTTER_REST = '   '

/** Position of a card inside a parallel run (see `detectSubagentGroups`). */
export interface SubagentGroupView {
  readonly index: number
  readonly count: number
  /** Head only: members still live / settled as failed. */
  readonly running: number
  readonly failed: number
}

function expandHint(): string {
  return t('hint-expand-ctrl-o', { key: primaryComboString('transcript') })
}

/** `14 tool uses · 41.2k tokens · 1m 12s` (parts the backend reported). */
function statsText(subagent: SubagentRow, withDuration: boolean): string {
  const parts = [t('subagent-tool-uses', { count: subagentToolUses(subagent) })]
  const tokens = subagentTokens(subagent)
  if (tokens !== undefined) parts.push(t('subagent-tokens', { count: formatTokenCount(tokens) }))
  if (withDuration) parts.push(formatAgentDuration(subagentElapsedMs(subagent)))
  return parts.join(' · ')
}

function ToolCallText({ tool }: { tool: SubagentToolCall }): React.ReactNode {
  const { name, args } = toolCallParts(tool)
  return (
    <Text wrap="truncate-end">
      <Text color={tool.status === 'failed' ? 'error' : toolNameColor(name)}>{name}</Text>
      {args !== undefined && <Text dimColor>{`(${args})`}</Text>}
    </Text>
  )
}

function StatusLineText({ line, subagent, withStats }: { line: SubagentStatusLine; subagent: SubagentRow; withStats: boolean }): React.ReactNode {
  switch (line.kind) {
    case 'initializing':
      return <Text dimColor wrap="truncate-end">{t('subagent-initializing')}</Text>
    case 'done':
      return (
        <Text wrap="truncate-end">
          {t('subagent-done')}
          {withStats && <Text dimColor>{` (${statsText(subagent, true)})`}</Text>}
        </Text>
      )
    case 'error':
      return <Text color="error" wrap="truncate-end">{line.message === '' ? t('subagent-status-failed') : t('subagent-error', { message: line.message })}</Text>
    case 'cancelled':
      return <Text color="error" wrap="truncate-end">{t('subagent-status-cancelled')}</Text>
    case 'unknown':
      return <Text dimColor wrap="truncate-end">{t('subagent-status-unknown')}</Text>
  }
}

/** One gutter-prefixed body row; `prefix` is the fixed-width left column. */
function BodyRow({ prefix, children }: { prefix: string; children: React.ReactNode }): React.ReactNode {
  return (
    <Box flexDirection="row">
      <Box width={prefix.length} flexShrink={0}><Text dimColor>{prefix}</Text></Box>
      <Box flexGrow={1} flexShrink={1}>{children}</Box>
    </Box>
  )
}

/**
 * Body lines under a card or group member: tool calls, the `+N more tool
 * uses` line, and the trailing status line. `first`/`rest` are the gutter
 * strings for the first and following rows. The line count must match
 * `singleCardBodyLines` / `groupMemberLines` (the virtualized row height).
 */
function bodyRows(subagent: SubagentRow, expanded: boolean, first: string, rest: string, withStats: boolean): React.ReactNode[] {
  const { tools, hidden } = visibleToolCalls(subagent, expanded)
  const status = statusLineOf(subagent, tools.length)
  const rows: React.ReactNode[] = []
  const prefix = () => (rows.length === 0 ? first : rest)
  const more = (): React.ReactNode => (
    <BodyRow key="more" prefix={prefix()}>
      <Text dimColor wrap="truncate-end">{`${t('subagent-more-tool-uses', { count: hidden })}${expanded ? '' : ` ${expandHint()}`}`}</Text>
    </BodyRow>
  )
  // Expanded (Ctrl+O) windows drop the OLDEST calls, so the count line goes
  // first; collapsed cards show the recent few with the count after them
  // (`subagent-more-tool-uses` + `hint-expand-ctrl-o`, the order).
  if (expanded && hidden > 0) rows.push(more())
  for (const tool of tools) {
    rows.push(<BodyRow key={`t${rows.length}`} prefix={prefix()}><ToolCallText tool={tool} /></BodyRow>)
  }
  if (!expanded && hidden > 0) rows.push(more())
  if (status !== undefined) {
    rows.push(<BodyRow key="status" prefix={prefix()}><StatusLineText line={status} subagent={subagent} withStats={withStats} /></BodyRow>)
  }
  return rows
}

/** Collapsed group member: the one `⎿` line (latest tool or status). */
function memberStatusRow(subagent: SubagentRow, prefix: string): React.ReactNode {
  const { tools } = visibleToolCalls(subagent, false)
  const latest = tools[tools.length - 1]
  const status = statusLineOf(subagent, tools.length)
  return (
    <BodyRow key="status" prefix={prefix}>
      {status !== undefined
        ? <StatusLineText line={status} subagent={subagent} withStats={false} />
        : latest !== undefined ? <ToolCallText tool={latest} /> : <Text> </Text>}
    </BodyRow>
  )
}

/** The `⤢` open-in-main-screen affordance on a card's first line. */
function OpenViewGlyph({ onOpenView }: { onOpenView: () => void }): React.ReactNode {
  const [hovered, setHovered] = React.useState(false)
  return (
    <Box
      flexShrink={0}
      marginLeft={1}
      onClick={(event: ClickEvent) => {
        // 拦截冒泡：这一格是「主屏查看」，不是卡片点击（→详情）。
        event.stopImmediatePropagation()
        onOpenView()
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Text color={hovered ? 'accent' : 'subtle'}>{'⤢'}</Text>
    </Box>
  )
}

/**
 * Transcript subagent card in the compact visual language (layout and
 * line budget: `subagentCardModel.ts`). A lone delegation renders as a tool
 * card — `● Agent(description)` with its recent tool calls under the `⎿`
 * gutter and a `Done (… tool uses · … tokens · …)` line once settled. A
 * parallel run renders as one tree: the head row carries the `Running N
 * agents…` line, every member (head included) a `├─`/`└─` branch. Ctrl+O
 * (`expanded`) lists every tool call. Clicking a card opens its detail.
 */
export function SubagentMessage({ subagent, marginTopOnTurn, expanded, group, onClick, onOpenView }: {
  subagent: SubagentRow
  marginTopOnTurn: boolean
  /** Ctrl+O transcript mode or this row's own expand toggle. */
  expanded: boolean
  group?: SubagentGroupView | undefined
  onClick?(event: ClickEvent): void
  /** 在主屏打开子代理转录：与卡片点击（→ 详情）并列的独立动作；拦截冒泡，
   *  普通正文点击与选区不受影响。 */
  onOpenView?(): void
}): React.ReactNode {
  const settled = isSettledSubagent(subagent)
  const failed = subagent.status === 'failed' || subagent.status === 'cancelled'
  const [hovered, setHovered] = React.useState(false)
  const clickable = onClick !== undefined
  const hoverProps = clickable
    ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
    : {}

  if (group === undefined) {
    return (
      <Box flexDirection="column" marginTop={marginTopOnTurn ? 1 : 0} onClick={onClick} {...hoverProps}>
        <Box flexDirection="row" flexWrap="nowrap">
          <ToolUseLoader shouldAnimate={!settled} isUnresolved={!settled} isError={failed} toolName="task" />
          <Box flexShrink={1}>
            <Text wrap="truncate-end">
              <Text bold color={hovered ? 'accent' : toolNameColor('task')}>{AGENT_LABEL}</Text>
              {`(${subagent.description})`}
            </Text>
          </Box>
          {onOpenView !== undefined && <OpenViewGlyph onOpenView={onOpenView} />}
        </Box>
        {bodyRows(subagent, expanded, GUTTER_FIRST, GUTTER_REST, true)}
      </Box>
    )
  }

  const head = group.index === 0
  const last = group.index === group.count - 1
  const branch = last ? '   └─ ' : '   ├─ '
  const under = last ? '      ' : '   │  '
  const groupSettled = group.running === 0
  return (
    <Box flexDirection="column" marginTop={head && marginTopOnTurn ? 1 : 0} onClick={onClick} {...hoverProps}>
      {head && (
        <Box flexDirection="row" flexWrap="nowrap">
          <ToolUseLoader shouldAnimate={!groupSettled} isUnresolved={!groupSettled} isError={groupSettled && group.failed === group.count} toolName="task" />
          <Text wrap="truncate-end">
            <Text bold>{groupSettled ? t('subagent-group-finished', { count: group.count }) : t('subagent-group-running', { count: group.count })}</Text>
            {group.failed > 0 && <Text color="error">{` · ${t('subagent-group-failed', { count: group.failed })}`}</Text>}
            {!expanded && <Text dimColor>{` ${expandHint()}`}</Text>}
          </Text>
        </Box>
      )}
      <Box flexDirection="row" flexWrap="nowrap">
        <Box width={branch.length} flexShrink={0}><Text dimColor>{branch}</Text></Box>
        <Box flexShrink={1}>
          <Text wrap="truncate-end">
            <Text bold={hovered} color={hovered ? 'accent' : undefined}>{subagent.description}</Text>
            <Text dimColor>{` · ${statsText(subagent, false)}`}</Text>
          </Text>
        </Box>
        {onOpenView !== undefined && <OpenViewGlyph onOpenView={onOpenView} />}
      </Box>
      {expanded
        ? bodyRows(subagent, true, `${under}⎿  `, `${under}   `, false)
        : memberStatusRow(subagent, `${under}⎿  `)}
    </Box>
  )
}
