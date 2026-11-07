/**
 * Direct kernel command (`/dsh`) through real Chat and channel: from DSH itself
 * and from a plugin-shaped kernel, inline/fullscreen and narrow widths,
 * mid-turn gates, startup, and a host without a switch. No real backends.
 * Run: node --import tsx/esm scripts/verify-kernel-commands.tsx
 */
import './lib/fake-home.mjs'
import assert from 'node:assert/strict'
import type { AgentEvent, AgentEventMeta } from '../src/agent/events.js'
import type { AgentSession } from '../src/agent/session.js'
import type { KernelStatus } from '../src/components/kernelCatalog.js'
import type { PromptController } from '../src/components/PromptInput.js'

process.env.FORCE_COLOR = '3'
process.env.DSH_TUI_LANG = 'en'

const [{ Writable, PassThrough }, React, { Terminal: XTerm }, ui, { Chat }, { QuestionStore }, { PermissionStore }, { createChannel }, { createStartingSession }, { setLang, t }, { kernelEntriesOf }, registry, { isBootSafeCommand, localizedDescription, LOCAL_COMMANDS }, { settled, sleep, viewportLines }, { FIXTURE_SDK_ID, registerFixtureBackends }] = await Promise.all([
  import('node:stream'), import('react'), import('@xterm/headless'), import('../src/ui.js'),
  import('../src/screens/Chat.js'), import('../src/channel/questions.js'), import('../src/channel/permissions.js'),
  import('../src/dsh-adapter/channel.js'), import('../src/agent/starting-session.js'), import('../src/i18n.js'),
  import('../src/components/kernelCatalog.js'), import('../src/dsh-adapter/backend-registry.js'),
  import('../src/commands.js'), import('./lib/term-test.mjs'), import('./lib/fixture-backends.js'),
])
setLang('en')
// DSH is the only in-tree kernel; a plugin-shaped row stands in for "another kernel".
registerFixtureBackends(registry)
const { listBackends } = registry

const currents = ['dsh', FIXTURE_SDK_ID] as const
type Statuses = Record<string, KernelStatus>
let passed = 0
function check(label: string, ok: boolean, detail = ''): void {
  assert.ok(ok, `${label}\n${detail}`)
  passed += 1
  console.log(`PASS ${label}`)
}

async function boot(current: typeof currents[number], fullscreen = false, columns = 100, launchpad = false, starting = false, switchable = true) {
  const term = new XTerm({ cols: columns, rows: 32, scrollback: 200, allowProposedApi: true })
  class Out extends Writable {
    columns = columns
    rows = 32
    isTTY = true
    _write(chunk: unknown, _encoding: BufferEncoding, callback: () => void): void { term.write(String(chunk), callback) }
  }
  class In extends PassThrough {
    isTTY = true
    setRawMode() { return this }
    ref() { return this }
    unref() { return this }
  }
  const stdin = new In()
  const listeners = new Set<(events: readonly AgentEvent[], meta: AgentEventMeta) => void>()
  let submits = 0
  const session: AgentSession = {
    ...createStartingSession(current, process.cwd()),
    ref: { backendId: current, sessionId: '55555555-5555-4555-8555-555555555555' },
    status: 'idle',
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
    submit: () => { submits += 1; return Promise.resolve({ accepted: true }) },
  }
  const ctx = { on: () => () => undefined, get: () => undefined, logger: { warn: () => undefined, info: () => undefined, debug: () => undefined } } as never
  const channel = createChannel(ctx, session, {
    model: 'fixture', provider: '', cwd: process.cwd(), activity: false,
    ...(starting ? { startup: new Promise<never>(() => undefined) } : {}),
  })
  const switches: string[] = []
  let probeCalls = 0
  let resolveProbe!: (statuses: Statuses) => void
  let rejectProbe!: (error: Error) => void
  const probe = new Promise<Statuses>((resolve, reject) => { resolveProbe = resolve; rejectProbe = reject })
  const controller: { current: PromptController | null } = { current: null }
  const view = (): string => viewportLines(term).join('\n')
  const node = <Chat channel={channel as never} questionStore={new QuestionStore()} approvalStore={new PermissionStore()}
    onExit={() => undefined} fullscreen={fullscreen} trajectorySeen launchpadOnBoot={launchpad}
    promptControllerRef={controller} kernelEntries={kernelEntriesOf(listBackends())}
    onProbeKernels={() => { probeCalls += 1; return probe }}
    {...(switchable ? { onSwitchBackend: (id: string) => { switches.push(id) } } : {})}
  />
  const stdout = new Out()
  const app = await ui.render(fullscreen ? <ui.AlternateScreen>{node}</ui.AlternateScreen> : node, {
    stdout: stdout as never, stdin: stdin as never, stderr: stdout as never, exitOnCtrlC: false, patchConsole: false,
  })
  // 固定窗:pacing keyboard handlers attach after the first frame.
  await sleep(150)
  const command = async (name: string): Promise<void> => {
    if (controller.current !== null) controller.current.clear()
    stdin.write(`\x1b[200~/${name}\x1b[201~`)
    check(`/${name} enters the prompt`, await settled(() => view().includes(`/${name}`)), view())
    // 固定窗:墙钟 successive command confirmations cross the composer's 80ms Enter debounce.
    await sleep(90)
    stdin.write('\r')
  }
  const notice = async (key: Parameters<typeof t>[0], action: () => Promise<void>): Promise<void> => {
    const before = channel.notifications.length
    await action()
    check(key, await settled(() => channel.notifications.slice(before).some(item => item.text === t(key))), view())
  }
  const emit = (event: AgentEvent): void => { for (const listener of listeners) listener([event], { replay: false }) }
  return {
    channel, switches, command, notice, view, resolveProbe, rejectProbe,
    probeCalls: () => probeCalls, submits: () => submits,
    working: () => emit({ type: 'turn.start', turn: 1, origin: 'user', time: 1 }),
    idle: () => emit({ type: 'turn.end', turn: 1, reason: { kind: 'completed' }, time: 2 }),
    close: () => { app.unmount(); channel.releaseContributions(); term.dispose() },
  }
}

for (const fullscreen of [false, true]) for (const columns of [100, 42]) for (const current of currents) {
  const h = await boot(current, fullscreen, columns)
  const tag = `${current} ${fullscreen ? 'fullscreen' : 'inline'} ${columns}`
  try {
    check(`${tag}: /dsh offered in completion`, h.channel.commandCompletions('/dsh').some(command => command.name === 'dsh'))
    if (current === 'dsh') {
      await h.notice('kernel-already-current', () => h.command('dsh'))
      check(`${tag}: the current kernel is not switched`, h.switches.length === 0)
      continue
    }
    await h.command('dsh')
    check(`${tag}: /dsh uses host switch without optional detection`, await settled(() => h.switches.join() === 'dsh') && h.probeCalls() === 0, h.view())
    const before = h.switches.length
    h.working()
    await h.notice('kernel-switch-while-working', () => h.command('dsh'))
    check(`${tag}: running turn stays on its kernel and no command reaches the model`, h.channel.working && h.switches.length === before && h.submits() === 0)
  } finally { h.close() }
}

// Landing page + startup: the shortcut remains local and boot-safe.
for (const launchpad of [false, true]) {
  const h = await boot(FIXTURE_SDK_ID, true, 42, launchpad, true)
  try {
    check('startup channel is not ready', !h.channel.ready)
    await h.command('dsh')
    check('DSH switches from the startup screen without waiting for optional detection', await settled(() => h.switches.join() === 'dsh'), h.view())
  } finally { h.close() }
}

// A host without a switch reuses the picker guidance; nothing reaches the model.
{
  const h = await boot(FIXTURE_SDK_ID, false, 100, false, false, false)
  try {
    await h.notice('kernel-switch-unavailable', () => h.command('dsh'))
    check('no-host: no switch or model submission', h.switches.length === 0 && h.submits() === 0)
  } finally { h.close() }
}

check('/dsh is boot-safe', isBootSafeCommand('dsh'))
const dshCommand = LOCAL_COMMANDS.find(command => command.name === 'dsh')!
setLang('zh')
check('/dsh has a Chinese description', localizedDescription(dshCommand).includes('切换到'))
setLang('en')
check('/dsh has an English description', localizedDescription(dshCommand).startsWith('Switch to'))
for (const removed of ['claude', 'codex']) {
  check(`/${removed} is no longer a built-in command`, !LOCAL_COMMANDS.some(command => command.name === removed))
}
console.log(`verify-kernel-commands OK (${passed} checks)`)
