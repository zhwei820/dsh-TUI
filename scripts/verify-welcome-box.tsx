/**
 * Welcome box regression (compact chat header).
 *
 *   W1. Default LogoHeader → the rounded welcome box: greeting, help pointer,
 *       cwd and model/effort, every row inside the box (no wrap past it).
 *   W2. Narrow terminal: the box shrinks and long cwd values truncate with `…`.
 *   W3. classic → the classic splash path (no welcome box).
 *
 * Run: node --import tsx/esm scripts/verify-welcome-box.tsx
 */
process.env.DSH_TUI_LANG = 'en'
process.env.FORCE_COLOR = '0'

const { mkdtempSync, mkdirSync } = await import('node:fs')
const { tmpdir } = await import('node:os')
const { join } = await import('node:path')
const home = mkdtempSync(join(tmpdir(), 'dshtui-welcome-'))
process.env.HOME = home
process.env.USERPROFILE = home
mkdirSync(join(home, '.dsh-tui'), { recursive: true })

const [React, { render, ThemeProvider }, { LogoHeader }, { Terminal: XTerm }, { Writable, PassThrough }, { viewportLines, settled }, { stringWidth }] = await Promise.all([
  import('react'),
  import('../src/ui.js'),
  import('../src/components/MessageList.js'),
  import('@xterm/headless'),
  import('node:stream'),
  import('./lib/term-test.mjs'),
  import('../src/ink/stringWidth.js'),
])

let failed = 0
function check(name: string, ok: boolean, extra = ''): void {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  (' + extra + ')' : ''))
  if (!ok) failed += 1
}

async function renderHeader(columns: number, props: Record<string, unknown>): Promise<string[]> {
  const term = new XTerm({ cols: columns, rows: 30, scrollback: 0, allowProposedApi: true })
  class Out extends Writable {
    columns = columns
    rows = 30
    isTTY = true
    _write(chunk: unknown, _e: unknown, cb: () => void): void { term.write(String(chunk), cb) }
  }
  class In extends PassThrough {
    isTTY = true
    setRawMode(): this { return this }
    ref(): this { return this }
    unref(): this { return this }
  }
  const instance = await render(
    React.createElement(ThemeProvider, { theme: 'dark' }, React.createElement(LogoHeader, props as never)),
    { stdout: new Out() as never, stdin: new In() as never, exitOnCtrlC: false, patchConsole: false },
  )
  await settled(() => viewportLines(term, 30).some((line: string) => line.trim() !== ''))
  // Let the classic path finish its first paint too.
  await new Promise(resolve => setTimeout(resolve, 150)) // 固定窗:pacing 首帧落定
  const lines = viewportLines(term, 30) as string[]
  await instance.unmount()
  term.dispose()
  return lines
}

const base = { model: 'deepseek-v4', effort: 'high', cwd: '~/work/project', skipIntro: true }

// W1
{
  const lines = await renderHeader(100, base)
  const text = lines.join('\n')
  check('W1 greeting', text.includes('✻ Welcome to dsh-TUI!'), text)
  check('W1 help pointer', text.includes('/help for help, /status for your current setup'))
  check('W1 cwd line', text.includes('cwd: ~/work/project'))
  check('W1 model · effort line', text.includes('model: deepseek-v4 · high'))
  const top = lines.findIndex(line => line.includes('╭'))
  const bottom = lines.findIndex(line => line.includes('╰'))
  const body = lines.slice(top + 1, bottom)
  check('W1 rounded box closes around every row', top >= 0 && bottom > top && body.length === 6 && body.every(line => line.trimEnd().endsWith('│')),
    JSON.stringify(lines.slice(top, bottom + 1)))
  check('W1 compact width (≤ 64 cells)', stringWidth((lines[top] ?? '').trimEnd()) <= 64)
}

// W2
{
  const lines = await renderHeader(30, { ...base, cwd: '/a/very/long/path/that/does/not/fit/anywhere' })
  const top = lines.findIndex(line => line.includes('╭'))
  const bottom = lines.findIndex(line => line.includes('╰'))
  const cwdRow = lines.find(line => line.includes('cwd:')) ?? ''
  check('W2 narrow box still closes', top >= 0 && bottom - top === 7, `${top}..${bottom}`)
  check('W2 long cwd truncates with …', cwdRow.includes('…') && cwdRow.trimEnd().endsWith('│'), JSON.stringify(cwdRow))
  check('W2 rows stay within the terminal', lines.every(line => stringWidth(line.trimEnd()) <= 30))
}

// W3
{
  const lines = await renderHeader(100, { ...base, classic: true, whale: false })
  check('W3 classic splash has no welcome box', !lines.join('\n').includes('Welcome to dsh-TUI'))
}

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
