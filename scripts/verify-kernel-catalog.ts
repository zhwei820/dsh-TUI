/**
 * The kernel catalog with the registry behind it (P0 D1/D2/D5): the entry list
 * is the registry's, in declaration order; names come from the manifests; only a
 * backend whose detection says `stale` reads "too old"; and the two-stage parse
 * (syntax, then membership) keeps every unknown value on the dsh fallback.
 *
 * Run: node --import tsx/esm scripts/verify-kernel-catalog.ts
 */
import assert from 'node:assert/strict'
import { buildKernelCatalog, kernelEntriesOf, kernelSubtitle } from '../src/components/kernelCatalog.js'
import type { KernelOption } from '../src/components/kernelCatalog.js'
import { setLang, t } from '../src/i18n.js'
import { isBackendIdSyntax } from '../src/agent/backend-manifest.js'
import { BUILTIN_BACKEND_IDS, parseBackendId, resolveRememberedBackend, resolveResumeTarget } from '../src/kernelPrefs.js'
import { normalizeBackendChoice } from '../src/dsh-adapter/index.js'
import * as registry from '../src/dsh-adapter/backend-registry.js'
import { installSurfaceFor } from '../src/dsh-adapter/backends.js'
import { FIXTURE_CLI_ID, FIXTURE_SDK_ID, FIXTURE_SDK_SPECIFIER, registerFixtureBackends } from './lib/fixture-backends.js'

const { isRegisteredBackend, listBackends, parseBackendChoice } = registry
// DSH is the only in-tree backend: the non-DSH rows below are plugin-shaped
// fixtures registered through the real gate (see lib/fixture-backends.ts).
registerFixtureBackends(registry)

setLang('en')
let passed = 0
const check = (label: string, ok: boolean, detail?: unknown): void => {
  assert.ok(ok, detail === undefined ? label : `${label}: ${JSON.stringify(detail)}`)
  passed += 1
  console.log(`PASS ${label}`)
}

// ── The registry is the single source of "which backends exist" ──────────────
const backends = listBackends()
const backendOf = (id: string) => backends.find(entry => entry.id === id)
// Additive on purpose (P0 §1.2): every built-in is looked up **by id**, never by
// position, so adding `src/backends/<id>/` cannot red these labels. The seed's
// position and the exact registry/directory parity live in verify-backend-registry.
const dsh = backendOf('dsh')
const sdk = backendOf(FIXTURE_SDK_ID)
const cli = backendOf(FIXTURE_CLI_ID)
const cliLabel = cli?.manifest.label
check('the seed is dsh and every built-in manifest is registered',
  backends[0]?.id === 'dsh' && BUILTIN_BACKEND_IDS.every(id => backendOf(id) !== undefined), backends.map(entry => entry.id))
check('dsh: in-tree, always available, and not an AgentBackend (no loader)',
  dsh?.manifest.inTree === true && dsh.manifest.alwaysAvailable === true && dsh.load === undefined)
check('the only built-in is dsh', JSON.stringify(BUILTIN_BACKEND_IDS) === JSON.stringify(['dsh']) && backends.filter(entry => entry.manifest.inTree).map(entry => entry.id).join(',') === 'dsh')
check('a plugin row: label, product and short name come from its manifest',
  cliLabel?.kind === 'literal' && cliLabel.text === 'Fixture CLI Agent'
    && cli?.manifest.product === 'fixture-cli' && cli?.manifest.shortLabel === 'FixtureCLI')
// Whole-table, not name-by-name (review, scope note; B-1 restated it): the fact
// "this host can install me" is now derived — a declared recipe whose executor the
// host implements — so it is stated as a set. Another backend arriving installable
// reds here, and a recipe whose executor name drifts from the host's table reds here
// too (the entry would quietly stop being installable).
const installableIds = backends.filter(entry => entry.installable).map(entry => entry.id)
const recipeIds = backends.filter(entry => entry.manifest.install !== undefined).map(entry => entry.id)
check('only the SDK-shaped row is host-installable, and only it declares an install recipe',
  installableIds.join(',') === FIXTURE_SDK_ID && recipeIds.join(',') === FIXTURE_SDK_ID
    && sdk?.manifest.install?.specifier === FIXTURE_SDK_SPECIFIER)
const onlyInstallable = backends.find(entry => entry.installable)
check('the host wizard answers with the entry that declared it, executor and pin included',
  onlyInstallable !== undefined && installSurfaceFor(FIXTURE_SDK_ID)?.specifier === onlyInstallable.manifest.install?.specifier
    && installSurfaceFor(FIXTURE_SDK_ID)?.version === onlyInstallable.manifest.install?.version
    && installSurfaceFor(FIXTURE_SDK_ID)?.executor === onlyInstallable.manifest.install?.executor
    // the CLI row declares nothing: "no install surface" is an answer, not an error.
    && installSurfaceFor(FIXTURE_CLI_ID) === undefined
    // a removed former built-in is no longer a choice.
    && installSurfaceFor('claude') === undefined && !isRegisteredBackend('claude') && !isRegisteredBackend('codex'))

// ── The two-stage parse: syntax, then membership (D1) ────────────────────────
check('syntax gate passes a plugin-shaped id, the registry gate does not',
  isBackendIdSyntax('acme-agent') && parseBackendId(' Acme-Agent ') === 'acme-agent'
    && !isRegisteredBackend('acme-agent') && parseBackendChoice('acme-agent') === undefined)
check('a registered plugin id; --backend / DSH_TUI_BACKEND accept it (case-insensitive)',
  isRegisteredBackend(FIXTURE_CLI_ID) && normalizeBackendChoice(' Fixture-CLI ') === FIXTURE_CLI_ID && resolveRememberedBackend({ envRaw: FIXTURE_CLI_ID }) === FIXTURE_CLI_ID)
check('a removed former built-in (codex, claude) parses but is not registered: dsh + a warning',
  parseBackendId('codex') === 'codex' && parseBackendChoice('codex') === undefined && parseBackendChoice('Claude') === undefined)
check('an uninstalled-but-well-formed DSH_TUI_BACKEND falls back to dsh, never the memory',
  resolveRememberedBackend({ envRaw: 'acme-agent', memory: FIXTURE_SDK_ID }) === 'acme-agent'
    && resolveRememberedBackend({ envRaw: 'acme-agent', envKnown: isRegisteredBackend, memory: FIXTURE_SDK_ID }) === 'dsh'
    && resolveRememberedBackend({ envRaw: 'Acme Agent', envKnown: isRegisteredBackend, memory: FIXTURE_SDK_ID }) === 'dsh')

// ── A derived resume target belongs to the backend it came from (review R2) ──
// The launcher marks what it read out of another backend's prefs
// (RESUME_BACKEND_ENV); this boot may land elsewhere — an unregistered plugin id
// falls back to dsh, an unset DSH_TUI_BACKEND follows the remembered kernel — and
// the id must not follow it there. Since B-2a the refusal is a boot failure, not a
// cold start, so the shape carries "which backend it came from" plus whether the
// refusal may be soft (safe-mode retry only); the deep matrix lives in
// scripts/verify-resume-target.ts.
const targetOf = (input: Parameters<typeof resolveResumeTarget>[0]) => resolveResumeTarget(input)
const usable = targetOf({ sessionId: 'sdk-1', sourceBackend: FIXTURE_SDK_ID, backendChoice: FIXTURE_SDK_ID })
check('R2: a marked target is usable when its source is the backend this boot landed on',
  usable.kind === 'usable' && usable.sessionId === 'sdk-1')
const revoked = targetOf({ sessionId: 'cli-1', sourceBackend: FIXTURE_CLI_ID, backendChoice: 'dsh' })
check('R2: a marked target from another backend is revoked with its source, never usable',
  revoked.kind === 'revoked' && revoked.from === FIXTURE_CLI_ID && revoked.fatal
    && targetOf({ sessionId: 'dsh-1', sourceBackend: 'dsh', backendChoice: FIXTURE_SDK_ID }).kind === 'revoked')
check('R2: an unmarked target (--resume <id>, a Config row) is never revoked here',
  targetOf({ sessionId: 'typed-1', backendChoice: 'dsh' }).kind === 'usable')
check('R2: a blank target is no target, marked or not',
  targetOf({ sessionId: '   ', sourceBackend: FIXTURE_SDK_ID, backendChoice: 'dsh' }).kind === 'none'
    && targetOf({ backendChoice: 'dsh' }).kind === 'none')

const entries = kernelEntriesOf(backends)
const entryOf = (id: string) => entries.find(entry => entry.id === id)
check('the projection carries the manifest names the picker paints',
  entryOf('dsh')?.shortLabel === 'DSH' && entryOf(FIXTURE_SDK_ID)?.shortLabel === 'FixtureSDK' && entryOf(FIXTURE_CLI_ID)?.shortLabel === 'FixtureCLI'
    && entryOf(FIXTURE_SDK_ID)?.label.kind === 'literal' && entryOf(FIXTURE_SDK_ID)?.alwaysAvailable === false && entryOf(FIXTURE_SDK_ID)?.installable === true)

// ── Rows ─────────────────────────────────────────────────────────────────────
const rowOf = (options: readonly KernelOption[], id: string) => options.find(option => option.id === id)
const probing = buildKernelCatalog({ current: 'dsh', entries, canInstallSdk: true })
check('probing: dsh selectable, the others dim and "checking"',
  rowOf(probing, 'dsh')?.selectable === true && probing.filter(option => option.id !== 'dsh').every(option => !option.selectable && option.reasonKey === 'kernel-probing'))

const ready = buildKernelCatalog({ current: FIXTURE_CLI_ID, entries, dshVersion: '0.2.0', statuses: { [FIXTURE_SDK_ID]: { installed: true, auth: 'ok', version: '2.1.0' }, [FIXTURE_CLI_ID]: { installed: true, auth: 'ok', version: '0.160.1' } } })
const cliRow = rowOf(ready, FIXTURE_CLI_ID)!
check('ready: the CLI row selectable, current, product-prefixed version', cliRow.selectable && cliRow.current && cliRow.version === 'fixture-cli v0.160.1' && kernelSubtitle(cliRow, key => t(key)) === 'fixture-cli v0.160.1')

const missing = buildKernelCatalog({ current: 'dsh', entries, canInstallSdk: true, statuses: { [FIXTURE_SDK_ID]: { installed: false }, [FIXTURE_CLI_ID]: { installed: false } } })
check('not installed: the SDK row offers the install wizard, the CLI row only says not installed', rowOf(missing, FIXTURE_SDK_ID)?.installable === true && rowOf(missing, FIXTURE_SDK_ID)?.reasonKey === 'kernel-not-installed-installable'
  && rowOf(missing, FIXTURE_CLI_ID)?.installable === undefined && rowOf(missing, FIXTURE_CLI_ID)?.reasonKey === 'kernel-unavailable-not-installed' && rowOf(missing, FIXTURE_CLI_ID)?.selectable === false)

// Too old: the *detection* says so (`stale`), not an id comparison in the UI —
// a version without the flag is an ordinary install miss (D5-2).
const tooOld = buildKernelCatalog({ current: 'dsh', entries, canInstallSdk: true, statuses: { [FIXTURE_CLI_ID]: { installed: false, stale: true, version: '0.100.0', hint: 'upgrade fixture-cli' } } })
check('too old: dim, "too old" reason and the upgrade hint carried',
  rowOf(tooOld, FIXTURE_CLI_ID)?.selectable === false && rowOf(tooOld, FIXTURE_CLI_ID)?.reasonKey === 'kernel-unavailable-too-old' && rowOf(tooOld, FIXTURE_CLI_ID)?.hint === 'upgrade fixture-cli', rowOf(tooOld, FIXTURE_CLI_ID))
const versionOnly = buildKernelCatalog({ current: 'dsh', entries, canInstallSdk: true, statuses: { [FIXTURE_CLI_ID]: { installed: false, version: '0.100.0' } } })
check('a version without `stale` is not "too old"', rowOf(versionOnly, FIXTURE_CLI_ID)?.reasonKey === 'kernel-unavailable-not-installed', rowOf(versionOnly, FIXTURE_CLI_ID))

const signedOut = buildKernelCatalog({ current: 'dsh', entries, statuses: { [FIXTURE_SDK_ID]: { installed: true, auth: 'missing' }, [FIXTURE_CLI_ID]: { installed: true, auth: 'missing', loginInSession: true } } })
check('signed out: still selectable with no dim reason (credentials may live where detection cannot see)',
  rowOf(signedOut, FIXTURE_SDK_ID)?.selectable === true && rowOf(signedOut, FIXTURE_SDK_ID)?.reasonKey === undefined && rowOf(signedOut, FIXTURE_SDK_ID)?.noteKey === undefined)
check('signed out + loginInSession: selectable with a "sign in after start" note',
  rowOf(signedOut, FIXTURE_CLI_ID)?.selectable === true && rowOf(signedOut, FIXTURE_CLI_ID)?.reasonKey === undefined && rowOf(signedOut, FIXTURE_CLI_ID)?.noteKey === 'kernel-login-in-session'
    && kernelSubtitle(rowOf(signedOut, FIXTURE_CLI_ID)!, key => t(key)) === t('kernel-login-in-session'))
const sdkSignInLater = buildKernelCatalog({ current: 'dsh', entries, statuses: { [FIXTURE_SDK_ID]: { installed: true, auth: 'missing', loginInSession: true } } })
check('a detection that emits loginInSession: the note appears on that row too',
  rowOf(sdkSignInLater, FIXTURE_SDK_ID)?.selectable === true && rowOf(sdkSignInLater, FIXTURE_SDK_ID)?.noteKey === 'kernel-login-in-session'
    && kernelSubtitle(rowOf(sdkSignInLater, FIXTURE_SDK_ID)!, key => t(key)) === t('kernel-login-in-session'))

const unknownAuth = buildKernelCatalog({ current: 'dsh', entries, statuses: { [FIXTURE_CLI_ID]: { installed: true, auth: 'unknown', version: '0.170.0' } } })
check('auth unknown (a keychain): selectable, no note', rowOf(unknownAuth, FIXTURE_CLI_ID)?.selectable === true && rowOf(unknownAuth, FIXTURE_CLI_ID)?.noteKey === undefined)

console.log(`\nverify-kernel-catalog OK (${passed} checks)`)
