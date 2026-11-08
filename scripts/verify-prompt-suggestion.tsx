/**
 * Prompt suggestion regression (see Chat/PromptInput/StatusLine).
 *
 *   P. parseSuggestResponse: first line, quotes/bullets stripped; NONE /
 *      empty / overlong → no suggestion.
 *   C1. A turn settling (working → idle) asks the channel once; the answer
 *       shows on the hint row as `↹ Tab: …` (the input row stays blank — IME).
 *   C2. Tab on the empty input takes it into the input; the hint goes away.
 *   C3. A new turn drops a pending suggestion; typing drops a shown one.
 *   C4. NONE-style answers (undefined) show nothing.
 *
 * Run: node --import tsx/esm scripts/verify-prompt-suggestion.tsx
 */
process.env.FORCE_COLOR = '3'
process.env.DSH_TUI_LANG = 'en'
process.env.DSH_TUI_THEME = 'dark'

const { mkdtempSync, mkdirSync } = await import('node:fs')
const { tmpdir } = await import('node:os')
const { join } = await import('node:path')
const home = mkdtempSync(join(tmpdir(), 'dshtui-suggest-'))
process.env.HOME = home
process.env.USERPROFILE = home
mkdirSync(join(home, '.dsh-tui'), { recursive: true })

const [{ PassThrough, Writable }, React, { Terminal: XTerm }, { render, AlternateScreen }, { Chat }, { QuestionStore }, { settled, viewportLines }, { parseSuggestResponse }] = await Promise.all([
  import('node:stream'),
  import('react'),
  import('@xterm/headless'),
  import('../src/ui.js'),
  import('../src/screens/Chat.js'),
  import('../src/dsh-adapter/questions.js'),
  import('./lib/term-test.mjs'),
  import('../src/channel/side-prompts.js'),
])

let failed = 0
function check(name: string, ok: boolean, extra = ''): void {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  (' + extra + ')' : ''))
  if (!ok) failed += 1
}

// ── P ────────────────────────────────────────────────────────────────────
check('P plain line', parseSuggestResponse('Yes, go ahead\n') === 'Yes, go ahead')
check('P quotes stripped', parseSuggestResponse('"继续执行"') === '继续执行')
check('P bullet stripped', parseSuggestResponse('- run the tests') === 'run the tests')
check('P NONE', parseSuggestResponse('NONE') === undefined && parseSuggestResponse('none.') === undefined)
check('P empty', parseSuggestResponse('  \n ') === undefined)
check('P overlong', parseSuggestResponse('x'.repeat(200)) === undefined)
check('P first non-empty line only', parseSuggestResponse('\n\nok\nignored') === 'ok')

// ── C ────────────────────────────────────────────────────────────────────
const COLS = 100
const ROWS = 30
const term = new XTerm({ cols: COLS, rows: ROWS, scrollback: 0, allowProposedApi: true })
class Out extends Writable {
  columns = COLS
  rows = ROWS
  isTTY = true
  _write(chunk: unknown, _e: BufferEncoding, cb: () => void) { term.write(String(chunk), cb) }
}
class Err extends Writable { isTTY = true; _write(_c: unknown, _e: BufferEncoding, cb: () => void) { cb() } }
class In extends PassThrough { isTTY = true; setRawMode() { return this }; ref() { return this }; unref() { return this } }
const stdin = new In() as any

const listeners = new Set<() => void>()
let nextAnswer: string | undefined = 'Yes, run the tests'
const asks: AbortSignal[] = []
const channel: any = {
  version: 0, rows: [{ id: 1, kind: 'user', text: 'fix it' }, { id: 2, kind: 'assistant', text: 'Done. Want me to run the tests?', streaming: false }],
  status: 'idle', sessionTitle: 'suggest', agentId: 'x',
  model: 'deepseek-v4-flash', reasoningEffort: 'max',
  tokens: { input: 1, output: 1 }, cwd: '/tmp/demo', displayCwd: '/tmp/demo',
  gitBranch: 'main', working: true, spinnerMode: 'requesting', responseChars: 0,
  whaleIdle: false, activeToolCount: 0, turnStart: 0, lastUserText: 'fix it',
  pending: [], commandList: [], notifications: [], mode: { plan: false }, effortLevels: undefined,
  subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb) },
  submit: () => {}, cancel: () => {}, clear: () => {}, notify: () => {},
  listModels: () => Promise.resolve([]), listSessions: () => [],
  setResumeTarget: () => {}, loadOlder: () => {}, mcpStatus: () => [],
  commandCompletions: () => [],
  suggestNextPrompt(options?: { signal?: AbortSignal }) {
    if (options?.signal) asks.push(options.signal)
    return Promise.resolve(nextAnswer)
  },
}
const bump = () => { channel.version++; for (const cb of listeners) cb() }
const lines = () => viewportLines(term, ROWS) as string[]
const screen = () => lines().join('\n')

await render(
  <AlternateScreen>
    <Chat channel={channel} questionStore={new QuestionStore()} promptSuggestions />
  </AlternateScreen>,
  { stdout: new Out() as any, stdin, stderr: new Err() as any, exitOnCtrlC: false, patchConsole: false },
)
await settled(() => screen().includes('Want me to run the tests'))

// C1
channel.working = false
bump()
check('C1 the settled turn asks once', await settled(() => asks.length === 1), String(asks.length))
check('C1 the hint row shows the suggestion', await settled(() => screen().includes('↹ Tab: Yes, run the tests')), screen().split('\n').slice(-4).join(' | '))
const inputRow = lines().find(line => line.includes('❯') && !line.includes('Tab:')) ?? ''
check('C1 the input row stays blank (no in-box placeholder)', !inputRow.includes('Yes, run the tests'), JSON.stringify(inputRow))

// C2
stdin.write('\t')
check('C2 Tab takes the suggestion into the input', await settled(() => lines().some(line => line.includes('❯') && line.includes('Yes, run the tests') && !line.includes('Tab:'))))
check('C2 the hint goes away once taken', await settled(() => !screen().includes('↹ Tab:')))

// C3: clear the draft, run another turn; the new turn aborts the pending ask.
stdin.write('\x15') // Ctrl+U clears the line
await settled(() => !lines().some(line => line.includes('Yes, run the tests')))
channel.working = true
bump()
await settled(() => screen().includes('esc to interrupt'))
nextAnswer = 'Ship it'
channel.working = false
bump()
check('C3 a second turn asks again', await settled(() => asks.length === 2), String(asks.length))
check('C3 the new suggestion shows', await settled(() => screen().includes('↹ Tab: Ship it')))
stdin.write('h')
check('C3 typing drops the shown suggestion', await settled(() => !screen().includes('↹ Tab:')))
stdin.write('\x7f')

// C4
nextAnswer = undefined
channel.working = true
bump()
await settled(() => screen().includes('esc to interrupt'))
channel.working = false
bump()
check('C4 a third turn asks again', await settled(() => asks.length === 3), String(asks.length))
await new Promise(resolve => setTimeout(resolve, 200)) // 固定窗:探针 确认 undefined 答案不会冒出提示
check('C4 no suggestion → no hint', !screen().includes('↹ Tab:'))

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
