/**
 * 对话流子代理卡片回归（简洁视觉语言，见 subagentCardModel.ts）。
 *
 *   M. 纯模型：token / 时长格式、可见工具调用与 `+N more`、状态行、行数预算、
 *      并行组判定（相邻 + 时间重叠才成组；先后委派不成组；无快照不成组）。
 *   S. 单卡：`● Agent(desc)` 头；运行中列最近 3 次工具调用 + `+N more tool uses
 *      (ctrl+o to expand)`；无工具时 `Initializing…`；完成后 `Done (N tool uses ·
 *      … tokens · …)`；失败显示 `Error: …`；Ctrl+O 列出全部工具调用。
 *   G. 并行组：组头 `Running N agents… (ctrl+o to expand)`，成员 `├─`/`└─`
 *      分支、成员间无空行；全部结束后 `N agents finished`，失败数留在组头；
 *      Ctrl+O 展开后每个成员列出全部工具调用。
 *
 * 渲染走真终端（headless xterm），断言读视口文本。
 * 画面预览：DSH_TUI_DUMP_FRAMES=1。
 *
 * 运行：node --import tsx/esm scripts/verify-subagent-card.tsx
 */
process.env.DSH_TUI_LANG = 'en'
process.env.FORCE_COLOR = '3'

const { mkdtempSync, mkdirSync } = await import('node:fs')
const { tmpdir } = await import('node:os')
const { join: joinPath } = await import('node:path')
const isolatedHome = mkdtempSync(joinPath(tmpdir(), 'dshtui-subagent-card-'))
process.env.HOME = isolatedHome
process.env.USERPROFILE = isolatedHome
mkdirSync(joinPath(isolatedHome, '.dsh-tui'), { recursive: true })

const assert = (await import('node:assert/strict')).default
const [React, uiMod, listMod, model, termTest] = await Promise.all([
  import('react'),
  import('../src/ui.js'),
  import('../src/components/MessageList.js'),
  import('../src/components/Chat/subagentCardModel.js'),
  import('./lib/term-test.mjs'),
])
const { Writable, PassThrough } = await import('node:stream')
const { Terminal: XTerm } = (await import('@xterm/headless')) as unknown as {
  Terminal: typeof import('@xterm/headless').Terminal
}
const { render } = uiMod as unknown as { render: typeof import('../src/ui.js').render }
const { MessageList } = listMod as unknown as { MessageList: React.ComponentType<Record<string, unknown>> }
const { settled, viewportLines } = termTest as unknown as {
  settled(pred: () => boolean, opts?: { timeoutMs?: number }): Promise<boolean>
  viewportLines(term: InstanceType<typeof XTerm>, rows?: number): string[]
}

let failed = 0
function check(name: string, ok: boolean, extra = ''): void {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  (' + extra + ')' : ''))
  if (!ok) failed += 1
}

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------
const NOW = Date.now()
type Status = 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown'
function tool(name: string, args?: string, status: 'running' | 'completed' | 'failed' = 'completed') {
  return { name, status, startedAt: NOW - 1000, ...(args === undefined ? {} : { argsPreview: args }) }
}
function sub(agentId: string, status: Status, extra: Record<string, unknown> = {}) {
  const settledRun = status !== 'running'
  return {
    agentId,
    description: 'task ' + agentId,
    status,
    startedAt: NOW - 72_000,
    ...(settledRun ? { completedAt: NOW, durationMs: 72_000 } : {}),
    outputLines: [],
    toolCalls: [] as ReturnType<typeof tool>[],
    tokens: { total: 41_234 },
    ...extra,
  }
}
const subRow = (id: number, s: ReturnType<typeof sub>) => ({ id, kind: 'subagent', text: s.description, subagent: s })
const noteRow = (id: number, text: string) => ({ id, kind: 'assistant', text, streaming: false })

// ---------------------------------------------------------------------------
// M — pure model
// ---------------------------------------------------------------------------
console.log('--- M: model ---')
{
  assert.equal(model.formatTokenCount(950), '950')
  assert.equal(model.formatTokenCount(41_234), '41.2k')
  assert.equal(model.formatTokenCount(12_000), '12k')
  assert.equal(model.formatTokenCount(1_250_000), '1.3m')
  assert.equal(model.formatAgentDuration(8_400), '8s')
  assert.equal(model.formatAgentDuration(72_000), '1m 12s')
  assert.equal(model.formatAgentDuration(3_780_000), '1h 3m')

  const five = ['a', 'b', 'c', 'd', 'e'].map(n => tool('Read', n))
  const running = sub('r', 'running', { toolCalls: five }) as never
  const view = model.visibleToolCalls(running, false)
  assert.deepEqual(view.tools.map((t: { argsPreview?: string }) => t.argsPreview), ['c', 'd', 'e'], 'collapsed keeps the latest 3')
  assert.equal(view.hidden, 2)
  assert.equal(model.singleCardBodyLines(running, false), 4, '3 tools + more line')
  assert.equal(model.singleCardBodyLines(running, true), 5, 'expanded: every tool, no status while running')
  const reported = sub('rr', 'running', { toolCalls: five, reportedToolUses: 9 }) as never
  assert.equal(model.visibleToolCalls(reported, false).hidden, 6, 'backend count wins over local records')
  const fresh = sub('f', 'running') as never
  assert.deepEqual(model.statusLineOf(fresh, 0), { kind: 'initializing' })
  assert.equal(model.singleCardBodyLines(fresh, false), 1)
  const done = sub('d', 'completed', { toolCalls: five }) as never
  assert.equal(model.singleCardBodyLines(done, false), 1, 'settled collapsed: Done line only')
  assert.equal(model.singleCardBodyLines(done, true), 6, 'settled expanded: tools + Done')
  assert.deepEqual(model.statusLineOf(sub('x', 'failed', { error: '\nboom\nmore' }) as never, 0), { kind: 'error', message: 'boom' })
  assert.equal(model.groupMemberLines(done, false), 2)
  assert.equal(model.groupMemberLines(done, true), 7)

  // Parallel: overlapping + adjacent.
  const a = subRow(1, sub('a', 'running'))
  const b = subRow(2, sub('b', 'completed'))
  const groups = model.detectSubagentGroups([a, b] as never)
  assert.deepEqual(groups.get(1), { memberIds: [1, 2], index: 0 })
  assert.equal(groups.get(2)?.index, 1)
  // Sequential: the first ended before the second started.
  const s1 = subRow(3, sub('s1', 'completed', { startedAt: NOW - 50_000, completedAt: NOW - 40_000, durationMs: 10_000 }))
  const s2 = subRow(4, sub('s2', 'running', { startedAt: NOW - 30_000 }))
  assert.equal(model.detectSubagentGroups([s1, s2] as never).size, 0, 'sequential delegations stay single')
  // Not adjacent.
  assert.equal(model.detectSubagentGroups([a, noteRow(9, 'x'), b] as never).size, 0, 'a row between breaks the run')
  // Snapshot missing.
  assert.equal(model.detectSubagentGroups([a, { id: 5, kind: 'subagent', text: '' }] as never).size, 0)
  check('M model formatting, line budget and group detection', true)
}

// ---------------------------------------------------------------------------
// render harness
// ---------------------------------------------------------------------------
const COLS = 100
const ROWS = 40
const DUMP = process.env.DSH_TUI_DUMP_FRAMES === '1'
class FakeStdout extends Writable {
  columns = COLS
  rows = ROWS
  isTTY = true
  constructor(private term: InstanceType<typeof XTerm>) { super() }
  _write(chunk: unknown, _encoding: unknown, callback: () => void): void { this.term.write(String(chunk), callback) }
}
class Input extends PassThrough {
  isTTY = true
  setRawMode(): this { return this }
  ref(): this { return this }
  unref(): this { return this }
}
function listProps(rows: unknown[], expanded = false): Record<string, unknown> {
  return {
    rows,
    expanded,
    expandedRows: new Set<number>(),
    selectedId: null,
    onToggleRow(): void {},
    model: 'deepseek-chat',
    showAll: true,
    onToggleAll(): void {},
    onLoadOlder(): void {},
    jobGroupFold: 'auto',
  }
}
async function withList(rows: unknown[], run: (screen: () => string, lines: () => string[], rerender: (expanded: boolean) => void) => Promise<void>): Promise<void> {
  const term = new XTerm({ cols: COLS, rows: ROWS, scrollback: 0, allowProposedApi: true })
  const instance = await render(React.createElement(MessageList, listProps(rows)), {
    stdout: new FakeStdout(term) as unknown as NodeJS.WriteStream,
    stdin: new Input() as unknown as NodeJS.ReadStream,
    exitOnCtrlC: false,
    patchConsole: false,
  })
  const lines = (): string[] => viewportLines(term, ROWS)
  const screen = (): string => lines().join('\n')
  try {
    await run(screen, lines, expanded => instance.rerender(React.createElement(MessageList, listProps(rows, expanded))))
    if (DUMP) console.log('--- frame ---\n' + screen().replace(/\n+$/, '') + '\n-------------')
  } finally {
    await instance.unmount()
    term.dispose()
  }
}
const idx = (lines: string[], needle: string): number => lines.findIndex(line => line.includes(needle))

// ---------------------------------------------------------------------------
// S — single cards
// ---------------------------------------------------------------------------
console.log('--- S: single cards ---')
{
  const five = [tool('Read', 'src/a.ts'), tool('Grep', 'pattern: "x"'), tool('Read', 'src/b.ts'), tool('Bash', 'ls -la'), tool('Read', 'src/e.ts', 'running')]
  const rows = [
    noteRow(1, 'note'),
    subRow(2, sub('run', 'running', { toolCalls: five, startedAt: NOW - 200_000 })),
    noteRow(3, 'between'),
    subRow(4, sub('done', 'completed', { toolCalls: five.slice(0, 4).map(t => ({ ...t, status: 'completed' as const })) })),
    noteRow(5, 'between again'),
    subRow(6, sub('init', 'running')),
    noteRow(7, 'and'),
    subRow(8, sub('bad', 'failed', { error: 'model refused the request' })),
  ]
  await withList(rows, async (screen, lines, rerender) => {
    check('S header is Agent(description)', await settled(() => screen().includes('Agent(task run)')), lines().slice(0, 12).join('|'))
    const l = lines()
    const h = idx(l, 'Agent(task run)')
    check('S first body line hangs under ⎿', (l[h + 1] ?? '').includes('⎿') && (l[h + 1] ?? '').includes('Read(src/b.ts)'), l[h + 1])
    check('S recent three tools, oldest hidden', (l[h + 2] ?? '').includes('Bash(ls -la)') && (l[h + 3] ?? '').includes('Read(src/e.ts)') && !screen().includes('Read(src/a.ts)'))
    check('S +N more tool uses (ctrl+o to expand)', (l[h + 4] ?? '').includes('+2 more tool uses (ctrl+o to expand)'), l[h + 4])
    const d = idx(l, 'Agent(task done)')
    check('S settled card folds to the Done line', (l[d + 1] ?? '').includes('⎿') && (l[d + 1] ?? '').includes('Done (4 tool uses · 41.2k tokens · 1m 12s)'), l[d + 1])
    const i = idx(l, 'Agent(task init)')
    check('S no tools yet → Initializing…', (l[i + 1] ?? '').includes('Initializing…'), l[i + 1])
    const f = idx(l, 'Agent(task bad)')
    check('S failure shows Error: message', (l[f + 1] ?? '').includes('Error: model refused the request'), l[f + 1])
    check('S old Kimi-style card is gone', !screen().includes('Subagent:') && !screen().includes('│ '))

    rerender(true)
    check('S Ctrl+O lists every tool call', await settled(() => screen().includes('Read(src/a.ts)')))
    const e = lines()
    const eh = idx(e, 'Agent(task run)')
    check('S expanded drops the more line', !(e[eh + 6] ?? '').includes('more tool uses') && !screen().includes('ctrl+o to expand'))
    const ed = idx(e, 'Agent(task done)')
    check('S expanded settled card keeps Done after its tools', (e[ed + 5] ?? '').includes('Done ('), e[ed + 5])
  })
}

// ---------------------------------------------------------------------------
// G — parallel group
// ---------------------------------------------------------------------------
console.log('--- G: parallel group ---')
{
  const members = [
    subRow(2, sub('p1', 'running', { toolCalls: [tool('Read', 'src/auth.ts', 'running')], tokens: { total: 12_100 } })),
    subRow(3, sub('p2', 'completed', { toolCalls: [tool('Grep', 'query'), tool('Read', 'db.ts')], tokens: { total: 8_000 } })),
    subRow(4, sub('p3', 'running')),
  ]
  const rows = [noteRow(1, 'note'), ...members]
  await withList(rows, async (screen, lines, rerender) => {
    check('G head summary with expand hint', await settled(() => screen().includes('Running 3 agents… (ctrl+o to expand)')), lines().slice(0, 10).join('|'))
    const l = lines()
    const h = idx(l, 'Running 3 agents')
    check('G first member branches ├─ right under the head', (l[h + 1] ?? '').includes('├─ task p1 · 1 tool use · 12.1k tokens'), l[h + 1])
    check('G running member shows its latest tool', (l[h + 2] ?? '').includes('│') && (l[h + 2] ?? '').includes('⎿') && (l[h + 2] ?? '').includes('Read(src/auth.ts)'), l[h + 2])
    check('G members flush (no blank line between)', (l[h + 3] ?? '').includes('├─ task p2'), l[h + 3])
    check('G settled member reads Done', (l[h + 4] ?? '').includes('⎿') && (l[h + 4] ?? '').includes('Done'), l[h + 4])
    check('G last member uses └─', (l[h + 5] ?? '').includes('└─ task p3'), l[h + 5])
    check('G member with no tools reads Initializing…', (l[h + 6] ?? '').includes('Initializing…'), l[h + 6])
    check('G no lone Agent(...) headers inside a group', !screen().includes('Agent(task p'))

    rerender(true)
    check('G Ctrl+O lists each member\'s tools', await settled(() => screen().includes('Grep(query)') && screen().includes('Read(db.ts)')))
    check('G expanded head drops the hint', !screen().includes('ctrl+o to expand'))
  })

  // All settled, one failed.
  const settledRows = [
    noteRow(1, 'note'),
    subRow(2, sub('q1', 'completed')),
    subRow(3, sub('q2', 'failed', { error: 'boom' })),
  ]
  await withList(settledRows, async (screen, lines) => {
    check('G settled run reads N agents finished', await settled(() => screen().includes('2 agents finished')), lines().slice(0, 8).join('|'))
    check('G failure count stays on the head', screen().includes('· 1 failed'))
    check('G failed member shows its error', screen().includes('Error: boom'))
  })
}

console.log(failed === 0 ? '\nALL PASS' : '\n' + failed + ' FAILED')
process.exit(failed === 0 ? 0 : 1)
