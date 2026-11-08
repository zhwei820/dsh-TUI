/**
 * Running-subagents roster under the main agent (RunningAgentsPanel).
 *
 *   A1. While subagents run, a `N agents running` header lists each running
 *       agent (settled ones are left out) with its latest tool and elapsed.
 *   A2. Clicking a row opens that agent's detail scene.
 *   A3. Nothing running → no roster.
 *
 * Run: node --import tsx/esm scripts/verify-running-agents.tsx
 */
process.env.DSH_TUI_LANG = 'en'
process.env.FORCE_COLOR = '3'
process.env.DSH_TUI_THEME = 'dark'

const { mkdtempSync, mkdirSync } = await import('node:fs')
const { tmpdir } = await import('node:os')
const { join } = await import('node:path')
const home = mkdtempSync(join(tmpdir(), 'dshtui-running-'))
process.env.HOME = home
process.env.USERPROFILE = home
mkdirSync(join(home, '.dsh-tui'), { recursive: true })

const [{ PassThrough, Writable }, React, { Terminal: XTerm }, { render, AlternateScreen }, { Chat }, { QuestionStore }, { settled, viewportLines }] = await Promise.all([
  import('node:stream'),
  import('react'),
  import('@xterm/headless'),
  import('../src/ui.js'),
  import('../src/screens/Chat.js'),
  import('../src/dsh-adapter/questions.js'),
  import('./lib/term-test.mjs'),
])

let failed = 0
function check(name: string, ok: boolean, extra = ''): void {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  (' + extra + ')' : ''))
  if (!ok) failed += 1
}

const COLS = 110
const ROWS = 34
const term = new XTerm({ cols: COLS, rows: ROWS, scrollback: 0, allowProposedApi: true })
class Out extends Writable {
  columns = COLS
  rows = ROWS
  isTTY = true
  _write(chunk: unknown, _e: BufferEncoding, cb: () => void) { term.write(String(chunk), cb) }
}
class In extends PassThrough { isTTY = true; setRawMode() { return this }; ref() { return this }; unref() { return this } }
class Err extends Writable { isTTY = true; _write(_c: unknown, _e: BufferEncoding, cb: () => void) { cb() } }
const stdin = new In() as any
const lines = () => viewportLines(term, ROWS) as string[]
const screen = () => lines().join('\n')

const NOW = Date.now()
const agent = (agentId: string, status: string, extra: Record<string, unknown> = {}) => ({
  agentId, description: 'task ' + agentId, status, startedAt: NOW - 32_000,
  output: [], outputEvents: [], toolCalls: [], ...extra,
})
const listeners = new Set<() => void>()
const channel: any = {
  version: 0, rows: [{ id: 1, kind: 'user', text: 'fan out' }], status: 'idle', sessionTitle: 'running', agentId: 'main',
  model: 'm', reasoningEffort: 'high', tokens: { input: 1, output: 1 }, cwd: '/tmp', displayCwd: '/tmp', gitBranch: 'main',
  working: true, spinnerMode: 'tool-use', responseChars: 0, whaleIdle: false, activeToolCount: 1, turnStart: 0,
  lastUserText: 'fan out', pending: [], commandList: [], notifications: [], mode: { plan: false },
  subagents: [
    agent('alpha', 'running', { toolCalls: [{ name: 'Read', status: 'running', startedAt: NOW, argsPreview: 'src/auth.ts' }], tokens: { total: 12_100 } }),
    agent('beta', 'starting'),
    agent('gamma', 'completed', { completedAt: NOW }),
  ],
  subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb) },
  submit() {}, cancel() {}, clear() {}, notify() {}, listModels: () => Promise.resolve([]), listSessions: () => [],
  setResumeTarget() {}, loadOlder() {}, mcpStatus: () => [], commandCompletions: () => [],
}
const bump = () => { channel.version++; for (const cb of listeners) cb() }

const app = await render(
  React.createElement(AlternateScreen, null, React.createElement(Chat, { channel, questionStore: new QuestionStore() })),
  { stdout: new Out() as any, stdin, stderr: new Err() as any, exitOnCtrlC: false, patchConsole: false },
)

// A1
check('A1 header counts the running agents', await settled(() => screen().includes('2 agents running (click to open)')), screen().split('\n').slice(-12).join(' | '))
const alphaRow = lines().findIndex(line => line.includes('├─ Agent(task alpha)'))
check('A1 a running agent shows its latest tool and elapsed', alphaRow >= 0 && lines()[alphaRow]!.includes('Read(src/auth.ts)') && lines()[alphaRow]!.includes('32s') && lines()[alphaRow]!.includes('12.1k tokens'), lines()[alphaRow] ?? '')
check('A1 a starting agent reads Initializing…', lines().some(line => line.includes('└─ Agent(task beta)') && line.includes('Initializing…')))
check('A1 settled agents are left out', !screen().includes('Agent(task gamma)'))

// A2
const row = lines().findIndex(line => line.includes('Agent(task beta)'))
const col = lines()[row]!.indexOf('Agent(task beta)') + 2
stdin.write(`\x1b[<0;${col};${row + 1}M\x1b[<0;${col};${row + 1}m`)
check('A2 clicking a row opens that agent\'s detail scene', await settled(() => screen().includes('Agent(task beta)') && screen().includes('Esc')
  && !screen().includes('agents running')), screen().split('\n').slice(0, 6).join(' | '))
stdin.write('\x1b')
await settled(() => screen().includes('agents running'))

// A3
for (const sub of channel.subagents) { sub.status = 'completed'; sub.completedAt = Date.now() }
channel.subagents = [...channel.subagents]
bump()
check('A3 nothing running → no roster', await settled(() => !screen().includes('agents running')))

await app.unmount()
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
