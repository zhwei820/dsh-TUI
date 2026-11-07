import type { BackendModesHost } from '../../adapter/ports/channel-ui.js'
import type { BackendModeOption } from '../../adapter/ports/channel-view.js'
import { t } from '../../i18n.js'
import type { ChatOverlay } from '../chatOverlay.js'

export function parseMcpCommand(rawInput: string):
  | { kind: 'status' }
  | { kind: 'usage' }
  | { kind: 'reconnect'; name: string }
  | { kind: 'toggle'; name: string; enabled: boolean } {
  const sub = /^(reconnect|toggle)(?:\s+([\s\S]*))?$/u.exec(rawInput.trim())
  if (sub === null) return { kind: 'status' }
  const rest = (sub[2] ?? '').trim()
  if (sub[1] === 'reconnect') return rest === '' ? { kind: 'usage' } : { kind: 'reconnect', name: rest }
  const toggle = /^([\s\S]+?)\s+(on|off)$/u.exec(rest)
  return toggle === null
    ? { kind: 'usage' }
    : { kind: 'toggle', name: toggle[1]!.trim(), enabled: toggle[2] === 'on' }
}

export function backendPermissionCommand(snapshot: ReturnType<BackendModesHost['snapshot']> | undefined, rawInput: string, fallbackName: string):
  | { kind: 'status'; lines: readonly string[] }
  | { kind: 'picker'; overlay: Extract<ChatOverlay, { kind: 'mode' }> }
  | { kind: 'set'; mode: BackendModeOption }
  | { kind: 'unknown'; id: string }
  | undefined {
  if (snapshot === undefined || snapshot.modes.length === 0) return undefined
  const parts = rawInput.trim().split(/\s+/).filter(Boolean)
  const current = snapshot.modes[snapshot.currentIndex]
  if (parts[0] === 'status') return { kind: 'status', lines: [
    t('permission-mode-current', { name: current?.name ?? fallbackName }),
    t('permission-mode-switch-hint'),
  ] }
  if (parts.length === 0) return { kind: 'picker', overlay: {
    kind: 'mode',
    index: Math.max(0, snapshot.currentIndex),
    modes: snapshot.modes,
    currentId: current?.id,
  } }
  const target = snapshot.modes.find(mode => mode.id === parts[0])
  return target === undefined ? { kind: 'unknown', id: parts[0]! } : { kind: 'set', mode: target }
}

export function backendModeStatus(snapshot: ReturnType<BackendModesHost['snapshot']> | undefined, onOpen: () => void) {
  const current = snapshot?.modes[snapshot.currentIndex]
  return current === undefined ? undefined : { id: current.id, name: current.name, onOpen }
}
