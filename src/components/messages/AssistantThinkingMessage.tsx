import React from 'react'
import chalk from 'chalk'
import { Box, Text } from '../../ui.js'
import { t } from '../../i18n.js'
import { StreamingMarkdown } from '../StreamingMarkdown.js'
import { formatDuration, formatTokens } from '../../terminal-utils/format.js'
import {
  THINKING_SPINNER_FRAMES,
  THINKING_SPINNER_INTERVAL_MS,
  THINKING_SETTLED_MARKER,
} from '../../terminal-utils/figures.js'
import { BRAND, ICE } from '../shimmer.js'
import { interpolateColor } from '../Spinner/spinnerUtils.js'
import { isMinimalUiMode } from '../../minimalUiMode.js'
import type { ClickEvent } from '../../ink/events/click-event.js'


type Props = {
  thinking: string
  /** The FULL un-revealed text (reasoning rows under smooth streaming):
   *  `thinking` carries the revealed slice the expanded body paints, while
   *  kept for callers; the folded header no longer previews text. */
  textFull?: string
  /** Adds the top margin between messages. */
  marginTopOnTurn: boolean
  /** Show the full text (Ctrl+O, per-row expansion, or live click toggle). */
  verbose: boolean
  /** True while the reasoning block is still streaming — the leading mark
   *  twinkles (the star) and settles to `∴` once the step ends. */
  streaming?: boolean
  /** Streaming folded mode (thinkingFold=preview): the one header line
   *  alone, compact style — the block never resizes mid-stream. */
  preview?: boolean
  /** Thinking wall-clock duration once the reasoning block settled (ms). */
  durationMs?: number
  /** Estimated thinking tokens when the backend reports thinking only as a
   *  count (no text). Renders a one-line `Thinking · ~N tokens` header while
   *  streaming and `Thought · ~N tokens` once settled; text, when present,
   *  still wins. */
  reasoningTokens?: number
  /** Message-selection mode highlight. */
  isSelected?: boolean
  onClick?(event: ClickEvent): void
}

/**
 * Thinking block in the compact visual language: settled rows fold to
 * `∴` + `thinking-settled` (with the recorded duration) + the ctrl+o expand
 * hint; streaming rows show one twinkling header line (`thinking-label`),
 * or the full reasoning text when expanded (click / Ctrl+O / thinkingFold
 * full).
 */
export function AssistantThinkingMessage({
  thinking,
  textFull,
  marginTopOnTurn,
  verbose,
  streaming = false,
  preview = false,
  durationMs,
  reasoningTokens,
  isSelected = false,
  onClick,
}: Props): React.ReactNode {
  if (!thinking) {
    if (reasoningTokens === undefined) return null
    return (
      <ThinkingTokensHeader
        tokens={reasoningTokens}
        streaming={streaming}
        marginTopOnTurn={marginTopOnTurn}
        isSelected={isSelected}
        onClick={onClick}
      />
    )
  }

  // Spinner frame (80ms cadence, only while the reasoning is still
  // streaming — same pattern as BtwPanel's answering spinner).
  const [frame, setFrame] = React.useState(0)
  React.useEffect(() => {
    if (!streaming) return
    const interval = setInterval(() => setFrame(f => f + 1), THINKING_SPINNER_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [streaming])

  const durationText =
    durationMs !== undefined && durationMs >= 1000 ? formatDuration(durationMs) : undefined

  // The streaming glyph breathes along the header's brand→ice ladder —
  // lively without strobing. The minimal UI drops the color (plain glyph);
  // settled always keeps the plain dim `∴`.
  const label = streaming
    ? `${t('thinking-label')}${durationText === undefined ? '' : ` · ${durationText}`}…`
    : `${durationText === undefined ? t('thinking-settled-bare') : t('thinking-settled', { duration: durationText })}`
  const minimalUi = isMinimalUiMode()
  const pulse = (Math.sin(frame * 0.9) + 1) / 2
  const pulseColor = interpolateColor(BRAND, ICE, pulse)
  const frameText = THINKING_SPINNER_FRAMES[frame % THINKING_SPINNER_FRAMES.length]!
  // Hover 轻指示：可点击折叠时折叠头从 dim 提亮为正常色（不刷整行背景，
  // 转录视觉保持安静）。
  const [hovered, setHovered] = React.useState(false)
  const hoverProps = onClick !== undefined
    ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
    : {}
  const header =
    streaming ? (
      <Box flexDirection="row">
        <Text>{minimalUi ? frameText : chalk.rgb(pulseColor.r, pulseColor.g, pulseColor.b).bold(frameText)}</Text>
        {/* 流式行同样可点击折叠（hover 提亮标签给出指示，与落定态一致） */}
        <Text dimColor={!hovered} color={hovered ? 'text' : undefined} italic>{` ${label}`}</Text>
      </Box>
    ) : (
      <Text italic dimColor={!hovered} color={hovered ? 'text' : undefined}>{`${minimalUi ? '*' : THINKING_SETTLED_MARKER} ${label}`}</Text>
    )

  if (preview || !verbose) {
    return (
      <Box
        marginTop={marginTopOnTurn ? 1 : 0}
        backgroundColor={isSelected ? 'messageActionsBackground' : undefined}
        onClick={onClick}
        {...hoverProps}
      >
        {header}
      </Box>
    )
  }

  return (
    <Box
      flexDirection="column"
      gap={1}
      marginTop={marginTopOnTurn ? 1 : 0}
      width="100%"
      backgroundColor={isSelected ? 'messageActionsBackground' : undefined}
      onClick={onClick}
      {...hoverProps}
    >
      {header}
      <Box paddingLeft={2}>
        {/* StreamingMarkdown: the live thinking text grows per token — the
          incremental stable-prefix + tail budget keeps the per-frame layout
          cost at O(new content) instead of re-laying out the whole block. */}
        <StreamingMarkdown dimColor>{thinking}</StreamingMarkdown>
      </Box>
    </Box>
  )
}

/**
 * Count-only thinking: the backend streams an
 * estimated token count but no thinking text. One header line in the same
 * visual language as a text block — the pulsing braille spinner while live,
 * the settled anchor afterwards — with nothing to expand.
 */
function ThinkingTokensHeader({
  tokens,
  streaming,
  marginTopOnTurn,
  isSelected,
  onClick,
}: {
  tokens: number
  streaming: boolean
  marginTopOnTurn: boolean
  isSelected: boolean
  onClick?(event: ClickEvent): void
}): React.ReactNode {
  const [frame, setFrame] = React.useState(0)
  React.useEffect(() => {
    if (!streaming) return
    const interval = setInterval(() => setFrame(f => f + 1), THINKING_SPINNER_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [streaming])
  const minimalUi = isMinimalUiMode()
  const n = formatTokens(tokens)
  const pulse = (Math.sin(frame * 0.9) + 1) / 2
  const pulseColor = interpolateColor(BRAND, ICE, pulse)
  const frameText = THINKING_SPINNER_FRAMES[frame % THINKING_SPINNER_FRAMES.length]!
  return (
    <Box
      flexDirection="row"
      marginTop={marginTopOnTurn ? 1 : 0}
      backgroundColor={isSelected ? 'messageActionsBackground' : undefined}
      onClick={onClick}
    >
      {streaming ? (
        <>
          <Text>{minimalUi ? frameText : chalk.rgb(pulseColor.r, pulseColor.g, pulseColor.b).bold(frameText)}</Text>
          <Text dimColor italic>{` ${t('thinking-tokens-live', { n })}`}</Text>
        </>
      ) : (
        <Text dimColor italic>{`${minimalUi ? '*' : THINKING_SETTLED_MARKER} ${t('thinking-tokens-done', { n })}`}</Text>
      )}
    </Box>
  )
}
