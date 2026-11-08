/**
 * Turn closing lines: `✻ Worked for … · done …` and the long-turn `※ recap:`.
 *
 *   W1. A long completed turn (≥ 10s) closes with the compact line, its end
 *       time from the turn's own stamp; short / interrupted turns stay quiet.
 *   W2. `turnUsageRow` on swaps in the detailed right-aligned ledger.
 *   R1. A turn of ≥ 60s settling launches the auto recap (`recapOnOpen`) and
 *       the row reads `※ recap: …`; a short turn does not.
 *
 * Run: node --import tsx/esm scripts/verify-turn-worked.tsx
 */
process.env.DSH_TUI_LANG = 'en'
process.env.FORCE_COLOR = '3'
process.env.DSH_TUI_THEME = 'dark'

const { mkdtempSync, mkdirSync } = await import('node:fs')
const { tmpdir } = await import('node:os')
const { join } = await import('node:path')
const home = mkdtempSync(join(tmpdir(), 'dshtui-worked-'))
process.env.HOME = home
process.env.USERPROFILE = home
mkdirSync(join(home, '.dsh-tui'), { recursive: true })

const [{ PassThrough, Writable }, React, { Terminal: XTerm }, { render, AlternateScreen }, { MessageList }, { Chat }, { QuestionStore }, { settled, viewportLines }, { formatTurnEnd, workedLineEligible }] = await Promise.all([
  import('node:stream'),
  import('react'),
  import('@xterm/headless'),
  import('../src/ui.js'),
  import('../src/components/MessageList.js'),
  import('../src/screens/Chat.js'),
  import('../src/dsh-adapter/questions.js'),
  import('./lib/term-test.mjs'),
  import('../src/components/TurnUsageRow.js'),
])

let failed = 0
function check(name: string, ok: boolean, extra = ''): void {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  (' + extra + ')' : ''))
  if (!ok) failed += 1
}

const COLS = 100
const ROWS = 30
function harness() {
  const term = new XTerm({ cols: COLS, rows: ROWS, scrollback: 0, allowProposedApi: true })
  class Out extends Writable {
    columns = COLS
    rows = ROWS
    isTTY = true
    _write(chunk: unknown, _e: BufferEncoding, cb: () => void) { term.write(String(chunk), cb) }
  }
  class In extends PassThrough { isTTY = true; setRawMode() { return this }; ref() { return this }; unref() { return this } }
  class Err extends Writable { isTTY = true; _write(_c: unknown, _e: BufferEncoding, cb: () => void) { cb() } }
  return { term, stdout: new Out() as any, stdin: new In() as any, stderr: new Err() as any, screen: () => (viewportLines(term, ROWS) as string[]).join('\n') }
}

const END = new Date(2026, 10, 8, 7, 46, 0).getTime()
const usage = (durationMs: number, outcome = 'completed') => ({
  input: 1000, output: 200, cacheRead: 0, cacheWrite: 0, cacheKnown: false, retries: 0,
  durationMs, endedAt: END, outcome,
})

// ── model ────────────────────────────────────────────────────────────────
check('eligible: long completed turn', workedLineEligible(usage(74_000) as never))
check('not eligible: short turn', !workedLineEligible(usage(4_000) as never))
check('not eligible: interrupted turn', !workedLineEligible(usage(90_000, 'interrupted') as never))
check('end time formats in en', formatTurnEnd(END, 'en') === '7:46 AM', String(formatTurnEnd(END, 'en')))

// ── W1 / W2 ──────────────────────────────────────────────────────────────
const rows = [
  { id: 1, kind: 'user', text: 'short one' },
  { id: 2, kind: 'assistant', text: 'quick answer', streaming: false },
  { id: 3, kind: 'turn-summary', text: '', turnUsage: usage(4_000) },
  { id: 4, kind: 'user', text: 'long one' },
  { id: 5, kind: 'assistant', text: 'long answer', streaming: false },
  { id: 6, kind: 'turn-summary', text: '', turnUsage: usage(74_000) },
  { id: 7, kind: 'user', text: 'stopped one' },
  { id: 8, kind: 'turn-summary', text: '', turnUsage: usage(90_000, 'interrupted') },
]
const listProps = (turnUsageRow: boolean) => ({
  rows, expanded: false, expandedRows: new Set(), selectedId: null, onToggleRow() {}, model: 'm',
  showAll: true, onToggleAll() {}, onLoadOlder() {}, jobGroupFold: 'auto', turnUsageRow,
})
{
  const h = harness()
  const app = await render(React.createElement(MessageList as never, listProps(false) as never), { stdout: h.stdout, stdin: h.stdin, exitOnCtrlC: false, patchConsole: false })
  check('W1 long turn closes with the worked-for line', await settled(() => h.screen().includes('✻ Worked for 1m 14s · done 7:46 AM')), h.screen())
  check('W1 exactly one worked-for line (short / interrupted turns stay quiet)', (h.screen().match(/Worked for/g) ?? []).length === 1)
  check('W1 no detailed ledger by default', !h.screen().includes('↑1k'))
  app.rerender(React.createElement(MessageList as never, listProps(true) as never))
  check('W2 turnUsageRow on shows the detailed ledger', await settled(() => h.screen().includes('↑1k · ↓200')), h.screen())
  check('W2 … instead of the compact line', !h.screen().includes('Worked for'))
  await app.unmount()
  h.term.dispose()
}

// ── R1 ───────────────────────────────────────────────────────────────────
{
  const h = harness()
  const listeners = new Set<() => void>()
  let recapCalls = 0
  const channel: any = {
    version: 0, rows: [{ id: 1, kind: 'user', text: 'do the long thing' }, { id: 2, kind: 'assistant', text: 'all done', streaming: false }],
    status: 'idle', sessionTitle: 'worked', agentId: 'x', model: 'm', reasoningEffort: 'high',
    tokens: { input: 1, output: 1 }, cwd: '/tmp', displayCwd: '/tmp', gitBranch: 'main',
    working: false, spinnerMode: 'requesting', responseChars: 0, whaleIdle: false, activeToolCount: 0,
    turnStart: 0, lastUserText: '', pending: [], commandList: [], notifications: [], mode: { plan: false },
    autoRecapOnOpen: true,
    subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb) },
    submit() {}, cancel() {}, clear() {}, notify() {}, listModels: () => Promise.resolve([]), listSessions: () => [],
    setResumeTarget() {}, loadOlder() {}, mcpStatus: () => [], commandCompletions: () => [],
    recapRecent() { recapCalls += 1; return Promise.resolve({ summary: 'shipped the long thing' }) },
  }
  const bump = () => { channel.version++; for (const cb of listeners) cb() }
  await render(React.createElement(AlternateScreen, null, React.createElement(Chat, { channel, questionStore: new QuestionStore() })), { stdout: h.stdout, stdin: h.stdin, stderr: h.stderr, exitOnCtrlC: false, patchConsole: false })
  await settled(() => h.screen().includes('all done'))
  const openCalls = recapCalls // the open-time recap
  const realNow = Date.now
  try {
    // A short turn: no recap.
    channel.working = true; bump()
    await settled(() => h.screen().includes('esc to interrupt'))
    channel.working = false; bump()
    await new Promise(resolve => setTimeout(resolve, 150)) // 固定窗:探针 短回合不得触发回顾
    check('R1 a short turn does not recap', recapCalls === openCalls, `${recapCalls - openCalls}`)
    // A 61s turn: Date.now jumps while it runs.
    channel.working = true; bump()
    await settled(() => h.screen().includes('esc to interrupt'))
    const base = realNow()
    Date.now = () => base + 61_000
    channel.working = false; bump()
    check('R1 a long turn launches the recap', await settled(() => recapCalls === openCalls + 1), `${recapCalls - openCalls}`)
    check('R1 the row reads ※ recap:', await settled(() => h.screen().includes('※ recap: shipped the long thing')), h.screen().split('\n').slice(-8).join(' | '))
  } finally {
    Date.now = realNow
  }
}

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
