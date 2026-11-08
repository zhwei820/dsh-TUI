import React from 'react'
import { Box, Text, useTerminalSize } from '../ui.js'
import { t } from '../i18n.js'
import { stringWidth } from '../ink/stringWidth.js'
import { truncateToWidth } from '../ink/truncateToWidth.js'

/** Widest the box grows (the welcome box is a compact card). */
const MAX_WIDTH = 64

/**
 * compact welcome box above an empty transcript: one rounded card
 * with the greeting, the help pointer and the session's cwd / model. It is
 * the default header; the classic splash (pixel whale + wordmark, `LogoV2`)
 * comes back with the `launchpad` setting (see `LogoHeader`).
 */
export function WelcomeBox({ model, effort, cwd }: {
  model: string
  effort?: string | undefined
  cwd: string
}): React.ReactNode {
  const { columns } = useTerminalSize()
  const width = Math.max(24, Math.min(MAX_WIDTH, columns - 2))
  // Border (2) + paddingX (2) on each side of the text column.
  const inner = width - 4
  const fit = (text: string): string =>
    stringWidth(text) <= inner ? text : `${truncateToWidth(text, inner - 1)}…`
  const modelLine = effort === undefined || effort === '' ? model : `${model} · ${effort}`
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="accent" paddingX={1} width={width} marginBottom={1}>
      <Text>
        <Text color="accent">✻ </Text>
        <Text bold>{fit(t('welcome-title'))}</Text>
      </Text>
      <Text> </Text>
      <Text dimColor wrap="truncate-end">{fit(`  ${t('welcome-help')}`)}</Text>
      <Text> </Text>
      <Text dimColor wrap="truncate-end">{fit(`  ${t('welcome-cwd', { cwd })}`)}</Text>
      <Text dimColor wrap="truncate-end">{fit(`  ${t('welcome-model', { model: modelLine })}`)}</Text>
    </Box>
  )
}
