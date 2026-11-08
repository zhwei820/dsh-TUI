import React from 'react'
import { Box, Text, useAnimationFrame } from '../ui.js'
import { t } from '../i18n.js'
import type { SubagentState } from '../adapter/ports/channel-view.js'
import { ToolUseLoader } from './ToolUseLoader.js'
import { toolNameColor } from './messages/AssistantToolUseMessage.js'
import { agentTitle, formatAgentDuration, formatTokenCount, toolCallParts } from './Chat/subagentCardModel.js'

/** Rows the list shows before folding the rest into `… N more`. */
const MAX_ROWS = 5

function isRunning(state: Pick<SubagentState, 'status'>): boolean {
  return state.status === 'running' || state.status === 'starting'
}

/** The running subagents, oldest first (the order they were delegated). */
export function runningSubagents(subagents: readonly SubagentState[]): SubagentState[] {
  return subagents.filter(isRunning).sort((a, b) => a.startedAt - b.startedAt)
}

function AgentRow({ agent, last, onOpen }: { agent: SubagentState; last: boolean; onOpen(agentId: string): void }): React.ReactNode {
  const [hovered, setHovered] = React.useState(false)
  const tool = agent.toolCalls[agent.toolCalls.length - 1]
  const parts = tool === undefined ? undefined : toolCallParts(tool)
  const tokens = agent.tokens?.total ?? ((agent.tokens?.input ?? 0) + (agent.tokens?.output ?? 0))
  const meta = [
    formatAgentDuration(Date.now() - agent.startedAt),
    ...(tokens > 0 ? [t('subagent-tokens', { count: formatTokenCount(tokens) })] : []),
  ].join(' · ')
  return (
    <Box
      flexDirection="row"
      flexWrap="nowrap"
      onClick={() => onOpen(agent.agentId)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      backgroundColor={hovered ? 'userMessageBackgroundHover' : undefined}
    >
      <Box flexShrink={0}><Text dimColor>{last ? '   └─ ' : '   ├─ '}</Text></Box>
      <Box flexShrink={1}>
        <Text wrap="truncate-end">
          <Text bold={hovered} color={hovered ? 'accent' : undefined}>{agentTitle(agent.description)}</Text>
          <Text dimColor>{' · '}</Text>
          {parts === undefined
            ? <Text dimColor>{t('subagent-initializing')}</Text>
            : <><Text color={toolNameColor(parts.name)}>{parts.name}</Text>{parts.args !== undefined && <Text dimColor>{`(${parts.args})`}</Text>}</>}
          <Text dimColor>{` · ${meta}`}</Text>
        </Text>
      </Box>
    </Box>
  )
}

/**
 * The live roster of running subagents, pinned under the transcript (above
 * the input) while any of them runs: one header line and one clickable row
 * per agent — click opens that agent's detail scene, the same target as its
 * transcript card. Gone as soon as nothing runs.
 */
export function RunningAgentsPanel({ subagents, onOpen }: {
  subagents: readonly SubagentState[]
  onOpen(agentId: string): void
}): React.ReactNode {
  const running = runningSubagents(subagents)
  // A 1s clock keeps the elapsed times moving; idle when nothing runs.
  const [ref] = useAnimationFrame(running.length > 0 ? 1000 : null)
  if (running.length === 0) return null
  const shown = running.slice(0, MAX_ROWS)
  const hidden = running.length - shown.length
  return (
    <Box ref={ref} flexDirection="column" marginTop={1}>
      <Box flexDirection="row" flexWrap="nowrap">
        <ToolUseLoader shouldAnimate isUnresolved isError={false} toolName="task" />
        <Text bold>{t('subagent-running-list', { count: running.length })}</Text>
        <Text dimColor>{` ${t('subagent-running-list-hint')}`}</Text>
      </Box>
      {shown.map((agent, index) => (
        <AgentRow key={agent.agentId} agent={agent} last={index === shown.length - 1 && hidden === 0} onOpen={onOpen} />
      ))}
      {hidden > 0 && <Text dimColor>{`   └─ ${t('subagent-running-list-more', { count: hidden })}`}</Text>}
    </Box>
  )
}
