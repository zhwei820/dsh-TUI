import React from 'react'
import type { SubagentState } from '../dsh-adapter/subagents.js'
import type { SpinnerMode } from './Spinner/spinnerMode.js'
import { WorkingSpinner, useThinkingStatus } from './WorkingSpinner.js'

/**
 * The phase a running child is in, read from what it has streamed: a tool
 * still running → tool use; an unsettled reasoning / text line → thinking /
 * responding; otherwise it is waiting on the model (between steps, or before
 * the first token) — the same vocabulary the main turn's spinner uses.
 */
export function subagentSpinnerMode(subagent: Pick<SubagentState, 'toolCalls' | 'outputEvents'>): SpinnerMode {
  if (subagent.toolCalls.some(call => call.status === 'running')) return 'tool-use'
  const last = subagent.outputEvents.at(-1)
  if (last !== undefined && last.settled !== true) {
    if (last.kind === 'thinking') return 'thinking'
    if (last.kind === 'text') return 'responding'
  }
  return 'requesting'
}

/** Characters the child has produced this run plus its tool calls — the
 *  progress signal the spinner's stall detection watches. */
function progressOf(subagent: Pick<SubagentState, 'toolCalls' | 'outputEvents'>): number {
  let chars = subagent.toolCalls.length
  for (const line of subagent.outputEvents) chars += line.text.length
  return chars
}

/**
 * The main turn's working line, for a running subagent: the animated glyph,
 * a phase verb, elapsed time since this run started and the token counter.
 * Without it a child that is thinking (or waiting on a slow model) looks the
 * same as a stuck one. The shared stall animation is fed the child's own
 * output growth, so a genuinely silent child still reads as stalled.
 * Render only while the child runs.
 */
export function SubagentWorkingRow({ subagent }: { readonly subagent: SubagentState }): React.ReactNode {
  const mode = subagentSpinnerMode(subagent)
  const thinkingStatus = useThinkingStatus(mode === 'thinking')
  const responseLengthRef = React.useRef(0)
  responseLengthRef.current = progressOf(subagent)
  const uploadTokensRef = React.useRef(0)
  uploadTokensRef.current = subagent.tokens?.input ?? 0
  const loadingStartTimeRef = React.useRef(subagent.startedAt)
  loadingStartTimeRef.current = subagent.startedAt
  const totalPausedMsRef = React.useRef(0)
  const pauseStartTimeRef = React.useRef<number | null>(null)
  return (
    <WorkingSpinner
      mode={mode}
      hasActiveTools={mode === 'tool-use'}
      responseLengthRef={responseLengthRef}
      uploadTokensRef={uploadTokensRef}
      loadingStartTimeRef={loadingStartTimeRef}
      totalPausedMsRef={totalPausedMsRef}
      pauseStartTimeRef={pauseStartTimeRef}
      thinkingStatus={thinkingStatus}
    />
  )
}
