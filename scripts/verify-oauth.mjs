/**
 * Headless smoke for the built-in DeepSeek account sign-in entry — real
 * Cordis registration, but no Harness host, real credentials, or external
 * network. The legacy profile-update fixture binds the official webserver to
 * a loopback port.
 *
 * Covers: the public ./oauth export surface (retired pi-ai subscription
 * exports stay gone), the question bridge (auth_url auto-open, copy/reopen/
 * cancel actions, open/copy failure degradation, settle retiring the panel,
 * a repeated URL never stacking a second panel, Chinese locale actions), the
 * opener argv shape, the DeepSeek-only service api (status, empty without a
 * Host account service, unknown-provider refusal, login/logout through the
 * Host), the Host-owned DeepSeek account handoff (callback origin, client
 * metadata, browser panel, cancellation including logout during pending
 * callback resolution, login coupons), the public ./oauth entry's Cordis
 * mount (no llm route, /auth command + ctx.dshAuth, retired options refused,
 * lifecycle cleanup), and the profile-only update fallback listener.
 *
 * Run after build: `pnpm verify:oauth`.
 */
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { settled } from './lib/term-test.mjs'

process.env.DSH_TUI_LANG = 'en'
const oauthModule = await import('../lib/types/oauth.js')
const {
  QuestionBridge,
  createDshAuthApi,
  openerFor,
  DEEPSEEK_ACCOUNT_PROVIDER,
  deepSeekCallbackOrigin,
  deepSeekClientMetadata,
  loginDeepSeekAccount,
  WhaleCouponStore,
} = oauthModule
const { Context } = await import('@deepseek-ai/cordis')
const { QuestionStore } = await import('../lib/types/dsh-adapter/questions.js')
const { createDeepSeekCallbackOriginResolver } = await import('../lib/types/dsh-adapter/oauth/deepseek.js')
const { setLang } = await import('../lib/types/i18n.js')

let passed = 0
let failed = 0
const ok = (condition, label) => {
  if (condition) {
    passed += 1
    console.log(`  ok  ${label}`)
  } else {
    failed += 1
    console.error(`FAIL  ${label}`)
  }
}

/** Resolve to the rejection message, or '' when the promise fulfils. */
const rejection = promise => Promise.resolve(promise).then(
  () => '',
  error => error instanceof Error ? error.message : String(error),
)

/** A credential-free account state stream with the same attempt transitions as the Host. */
function fakeDeepSeekAccount() {
  const id = 'account-attempt-1'
  const links = { usageUrl: 'https://platform.deepseek.com/usage', topUpUrl: 'https://platform.deepseek.com/top-up' }
  let state = { status: 'signed-out', links, attempt: null }
  let revision = 0
  const wakes = new Set()
  const calls = { starts: [], cancels: [], signOuts: [] }
  const update = next => {
    state = next
    revision += 1
    for (const wake of [...wakes]) wake()
  }
  return {
    calls,
    current: () => state,
    update,
    getState: async () => state,
    startSignIn: async (client, origin, source) => {
      calls.starts.push({ client, origin, source })
      update({ status: 'signed-out', links, attempt: { id, phase: 'initializing' } })
      return state
    },
    cancelSignIn: async target => {
      calls.cancels.push(target)
      if (state.attempt?.id === target && !['succeeded', 'failed', 'cancelled', 'expired'].includes(state.attempt.phase)) {
        update({ status: 'signed-out', links, attempt: { id, phase: 'cancelled' } })
      }
      return state
    },
    signOut: async client => {
      calls.signOuts.push(client)
      update({ status: 'signed-out', links, attempt: null })
      return state
    },
    async *watch(signal) {
      let seen = -1
      while (!signal.aborted) {
        if (revision !== seen) {
          seen = revision
          yield state
          continue
        }
        await new Promise(resolve => {
          const wake = () => {
            wakes.delete(wake)
            signal.removeEventListener('abort', wake)
            resolve()
          }
          wakes.add(wake)
          signal.addEventListener('abort', wake, { once: true })
        })
      }
    },
  }
}

/** An account whose sign-in commits immediately (no browser panel). */
function instantDeepSeekAccount() {
  const account = fakeDeepSeekAccount()
  account.startSignIn = async (client, origin, source) => {
    account.calls.starts.push({ client, origin, source })
    account.update({ ...account.current(), status: 'credential-stored',
      attempt: { id: 'account-attempt-1', phase: 'succeeded' } })
    return account.current()
  }
  return account
}

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
ok(manifest.dependencies?.['@deepseek-harness-tui/dsh-auth'] === undefined
  && !(manifest.bundledDependencies ?? []).includes('@deepseek-harness-tui/dsh-auth'),
  'the TUI has no runtime or bundled dependency on the former auth package')

// ── public export surface ──────────────────────────────────────────────────
console.log('export surface')
const retiredExports = ['CredentialFile', 'defaultCredentialsFile', 'buildOAuthProfile', 'OAUTH_PROVIDER_IDS',
  'availableOAuthProviderIds', 'CredentialGatedAdapter', 'describeEvent']
const lingering = retiredExports.filter(key => key in oauthModule)
ok(lingering.length === 0, `retired pi-ai subscription exports stay removed (lingering: ${lingering.join(', ') || 'none'})`)

// ── question bridge ────────────────────────────────────────────────────────
console.log('question bridge')
const asked = []
// Scripted answers for the waiting panel, consumed in order; an exhausted
// script parks like a human who has not answered yet — only the request's
// abort (settle / run cancel) resolves it.
let waitingScript = []
let waitingAsked = 0
const openedUrls = []
const copiedTexts = []
const helpers = {
  openUrl: url => { openedUrls.push(url); return true },
  copyText: async text => { copiedTexts.push(text); return true },
}
const fakeAsk = async request => {
  asked.push(request)
  const question = request.questions[0]
  if (question.id === 'dsh-auth-waiting') {
    waitingAsked += 1
    const pick = waitingScript[waitingAsked - 1]
    if (pick === undefined) {
      return new Promise((_resolve, reject) => {
        request.signal?.addEventListener('abort', () => reject(new Error('panel retired')), { once: true })
      })
    }
    return { answers: [{ id: question.id, selected: [pick] }] }
  }
  if (question.options !== undefined && question.options.length > 0) {
    return { answers: [{ id: question.id, selected: [question.options[0].label] }] }
  }
  return { answers: [{ id: question.id, selected: [] }] }
}
const waitingRequests = () => asked.filter(request => request.questions[0]?.id === 'dsh-auth-waiting')

// auth_url: browser opens automatically, panel offers copy/reopen/cancel,
// and each action re-asks once before the scripted cancel.
const longUrl = 'https://platform.deepseek.com/dsh/authorize?authorize_id=fixture&redirect_uri=http%3A%2F%2F127.0.0.1%3A43123%2Foauth%2Fcallback&state=s1'
const runAbort = new AbortController()
const qb = new QuestionBridge(fakeAsk, runAbort, helpers)
waitingScript = ['Copy authorization link', 'Open browser again', 'Cancel sign-in']
qb.notify({ type: 'auth_url', url: longUrl, instructions: 'A browser window should open.' })
const cancelled = await settled(() => runAbort.signal.aborted)
const firstPanel = waitingRequests()[0]?.questions[0]
ok(openedUrls[0] === longUrl, 'auth_url opens the browser automatically')
ok(JSON.stringify(firstPanel?.options?.map(option => option.label))
  === JSON.stringify(['Copy authorization link', 'Open browser again', 'Cancel sign-in']),
  'waiting panel offers copy, reopen, and cancel actions')
ok(firstPanel?.question === 'Waiting for authorization…'
  && firstPanel?.detail?.includes('Authorization page opened in your browser')
  && firstPanel?.detail?.includes('A browser window should open.')
  && firstPanel?.detail?.includes(longUrl),
  'waiting panel carries the opened note, flow instructions, and the complete URL')
ok(cancelled, 'cancel from the waiting panel aborts the run')
ok(JSON.stringify(copiedTexts) === JSON.stringify([longUrl]), 'copy action copies the exact, unbroken URL')
ok(openedUrls.length === 2 && openedUrls[1] === longUrl, 'reopen action opens the same URL again')
ok(waitingAsked === 3, `the panel re-asks after each action (asked ${waitingAsked})`)
const statusDetails = waitingRequests().slice(1, 3).map(request => request.questions[0]?.detail ?? '')
ok(statusDetails[0]?.startsWith('Copied') && statusDetails[1]?.startsWith('Reopened in your browser'),
  'each re-ask prefixes a one-line status for the previous action')
await qb.settle()

// settle retires a parked panel without cancelling the run.
const settleStore = new QuestionStore()
const settleAbort = new AbortController()
const settleBridge = new QuestionBridge(request => settleStore.ask(request), settleAbort, helpers)
settleBridge.notify({ type: 'auth_url', url: longUrl })
ok(await settled(() => settleStore.getSnapshot()?.question.id === 'dsh-auth-waiting'),
  'auth_url shows the waiting panel on the real question store')
await settleBridge.settle()
ok(settleStore.getSnapshot() === null && !settleAbort.signal.aborted,
  'settle retires the waiting panel without aborting the run')
const openedBeforeLate = openedUrls.length
settleBridge.notify({ type: 'auth_url', url: 'https://platform.deepseek.com/late' })
await new Promise(resolve => setTimeout(resolve, 20))
ok(settleStore.getSnapshot() === null && openedUrls.length === openedBeforeLate,
  'a URL arriving after settle opens nothing and shows no panel')

// A repeated (or replaced) auth_url never stacks a second panel.
const repeatAbort = new AbortController()
const repeatBridge = new QuestionBridge(fakeAsk, repeatAbort, helpers)
waitingScript = []
waitingAsked = 0
const openedBeforeRepeat = openedUrls.length
repeatBridge.notify({ type: 'auth_url', url: longUrl })
repeatBridge.notify({ type: 'auth_url', url: longUrl })
repeatBridge.notify({ type: 'auth_url', url: 'https://platform.deepseek.com/dsh/authorize?authorize_id=other' })
await settled(() => waitingAsked >= 1)
await new Promise(resolve => setTimeout(resolve, 20))
ok(waitingAsked === 1 && openedUrls.length === openedBeforeRepeat + 1,
  `repeated auth_url events show one panel and open the browser once (panels ${waitingAsked}, opens ${openedUrls.length - openedBeforeRepeat})`)
await repeatBridge.settle()
ok(!repeatAbort.signal.aborted, 'retiring the single repeated-URL panel leaves the run alive')

// Notify on an already-aborted run is a no-op.
const abortedRun = new AbortController()
abortedRun.abort()
const abortedBridge = new QuestionBridge(fakeAsk, abortedRun, helpers)
const openedBeforeAborted = openedUrls.length
waitingAsked = 0
abortedBridge.notify({ type: 'auth_url', url: longUrl })
await new Promise(resolve => setTimeout(resolve, 20))
ok(waitingAsked === 0 && openedUrls.length === openedBeforeAborted, 'an aborted run shows no panel and opens nothing')
await abortedBridge.settle()

// Auto-open / reopen / copy failure degrades to manual guidance, never a crash.
const failAbort = new AbortController()
const failBridge = new QuestionBridge(fakeAsk, failAbort, { openUrl: () => false, copyText: async () => false })
waitingScript = ['Copy authorization link', 'Open browser again', 'Cancel sign-in']
waitingAsked = 0
const failStart = asked.length
failBridge.notify({ type: 'auth_url', url: 'https://platform.deepseek.com/x' })
ok(await settled(() => failAbort.signal.aborted), 'failure fixture reaches its scripted cancel')
const failDetails = asked.slice(failStart)
  .filter(request => request.questions[0]?.id === 'dsh-auth-waiting')
  .map(request => request.questions[0]?.detail ?? '')
ok(failDetails[0]?.includes('Open this URL to authorize.') && failDetails[0]?.includes('too long')
  && failDetails[0]?.includes('https://platform.deepseek.com/x'),
  'failed auto-open degrades to manual-open and copy guidance with the URL')
ok(failDetails[1]?.startsWith('Copy failed') && failDetails[2]?.startsWith('Could not open the browser'),
  'failed copy and failed reopen each report a clear fallback note')
await failBridge.settle()

// Esc on the waiting panel cancels the whole login.
const dismissStore = new QuestionStore()
const dismissAbort = new AbortController()
const dismissBridge = new QuestionBridge(request => dismissStore.ask(request), dismissAbort, helpers)
dismissBridge.notify({ type: 'auth_url', url: longUrl })
ok(await settled(() => dismissStore.getSnapshot()?.question.id === 'dsh-auth-waiting'),
  'dismiss fixture exposes the waiting panel')
dismissStore.cancelCurrent()
ok(await settled(() => dismissAbort.signal.aborted && dismissStore.getSnapshot() === null),
  'dismissing the waiting panel cancels the login instead of waiting without UI')
await dismissBridge.settle()

setLang('zh')
const zhStore = new QuestionStore()
const zhBridge = new QuestionBridge(request => zhStore.ask(request), new AbortController(), helpers)
zhBridge.notify({ type: 'auth_url', url: longUrl })
ok(await settled(() => zhStore.getSnapshot()?.question.id === 'dsh-auth-waiting'), 'Chinese fixture exposes the waiting panel')
const zhQuestion = zhStore.getSnapshot()?.question
ok(JSON.stringify(zhQuestion?.options?.map(option => option.label))
  === JSON.stringify(['复制授权链接', '重新打开浏览器', '取消登录'])
  && zhQuestion?.question === '等待授权…'
  && zhQuestion?.detail?.includes('授权页面已在浏览器打开'),
  'bridge-owned sign-in actions and copy use the active Chinese locale')
await zhBridge.settle()
setLang('en')

// ── opener argv shape ──────────────────────────────────────────────────────
console.log('opener argv')
const authorizeLikeUrl = 'https://platform.deepseek.com/dsh/authorize?response_type=code&client_id=app_EMoamEEZ73f0CkXaXp7hrann&redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback&state=s1'
const opener = openerFor(authorizeLikeUrl)
if (process.platform === 'win32') {
  ok(opener?.verbatim === true, 'win32 opener uses verbatim argv (node would not quote a space-free URL)')
  const startToken = opener?.args[3]
  ok(typeof startToken === 'string' && startToken.startsWith('start "" "') && startToken.endsWith('"'),
    `the whole start command is one token with the URL double-quoted inside (got ${JSON.stringify(startToken?.slice(0, 32))}…)`)
  // Live round-trip through a real cmd.exe: `&` inside double quotes must
  // survive the shell that `start` will run under. Echo (not start) keeps
  // this side-effect free.
  const echo = await new Promise(resolve => {
    const child = spawn('cmd.exe', ['/d', '/c', `echo "${authorizeLikeUrl}"`], { windowsVerbatimArguments: true })
    let out = ''
    child.stdout.on('data', chunk => { out += String(chunk) })
    child.on('close', () => resolve(out.trim()))
    child.on('error', () => resolve(''))
  })
  ok(echo.includes('client_id=app_EMoamEEZ73f0CkXaXp7hrann') && echo.includes('redirect_uri=http%3A%2F%2Flocalhost%3A1455'),
    `a quoted URL survives cmd.exe parsing intact (echo returned ${echo.length} chars)`)
} else {
  ok(opener !== undefined && !opener.verbatim && opener.args[0] === authorizeLikeUrl,
    `${process.platform} opener passes the URL as a single exec argument (no shell)`)
}

// ── service api (DeepSeek-only) ────────────────────────────────────────────
console.log('service api')
const callbackOrigin = 'http://127.0.0.1:43123'

const bareApi = createDshAuthApi({ resolveAsk: () => fakeAsk, resolveDeepSeekAccount: () => undefined })
ok((await bareApi.providers()).length === 0, 'a Host without the account service lists no sign-in provider')
ok((await rejection(bareApi.login(DEEPSEEK_ACCOUNT_PROVIDER))).includes('unknown provider')
  && (await rejection(bareApi.login(DEEPSEEK_ACCOUNT_PROVIDER))).includes('mounted: none'),
  'login refuses deepseek-account when the Host mounts no account service')
ok((await rejection(bareApi.logout(DEEPSEEK_ACCOUNT_PROVIDER))).includes('unknown provider'),
  'logout refuses deepseek-account when the Host mounts no account service')
ok((await rejection(bareApi.login())).includes('no sign-in provider is mounted'),
  'interactive provider selection reports an empty host instead of an empty picker')

const serviceAccount = instantDeepSeekAccount()
const serviceApi = createDshAuthApi({
  resolveAsk: () => fakeAsk,
  resolveDeepSeekAccount: () => serviceAccount,
  resolveCallbackOrigin: () => callbackOrigin,
})
const serviceRows = await serviceApi.providers()
ok(serviceRows.length === 1 && serviceRows[0].provider === DEEPSEEK_ACCOUNT_PROVIDER
  && serviceRows[0].oauthLabel === 'DeepSeek' && serviceRows[0].signedIn === false
  && serviceRows[0].expiresAt === undefined && serviceRows[0].expired === false,
  'status lists exactly the Host DeepSeek account, unsigned, without a token expiry')
const unknownLogin = await rejection(serviceApi.login('openai-codex'))
ok(unknownLogin.includes('unknown provider "openai-codex"') && unknownLogin.includes(`mounted: ${DEEPSEEK_ACCOUNT_PROVIDER}`),
  'login refuses a retired third-party route and names the mounted set')
ok((await rejection(serviceApi.logout('anthropic'))).includes('unknown provider'),
  'logout refuses a retired third-party route')
ok(serviceAccount.calls.starts.length === 0 && serviceAccount.calls.signOuts.length === 0,
  'refused provider ids never reach the Host account service')

const headlessApi = createDshAuthApi({
  resolveAsk: () => undefined,
  resolveDeepSeekAccount: () => serviceAccount,
  resolveCallbackOrigin: () => callbackOrigin,
})
ok((await rejection(headlessApi.login(DEEPSEEK_ACCOUNT_PROVIDER))).includes('interactive surface')
  && (await rejection(headlessApi.login())).includes('name the provider')
  && serviceAccount.calls.starts.length === 0,
  'login without an interactive surface refuses before starting a Host attempt')

const noOriginApi = createDshAuthApi({ resolveAsk: () => fakeAsk, resolveDeepSeekAccount: () => serviceAccount })
ok((await rejection(noOriginApi.login(DEEPSEEK_ACCOUNT_PROVIDER))).includes('needs an active Host webServer')
  && serviceAccount.calls.starts.length === 0,
  'login without a callback origin refuses before starting a Host attempt')

const picked = await serviceApi.login()
ok(picked.provider === DEEPSEEK_ACCOUNT_PROVIDER && picked.expiresAt === undefined
  && asked.some(request => request.questions[0]?.id === 'dsh-auth-provider'
    && request.questions[0]?.options?.length === 1 && request.questions[0]?.options?.[0]?.label === 'DeepSeek'),
  'login without a provider offers only the DeepSeek account and signs in through the Host')
ok(serviceAccount.calls.starts.length === 1 && serviceAccount.calls.starts[0].origin === callbackOrigin
  && serviceAccount.calls.starts[0].source === 'desktop'
  && (await serviceApi.providers())[0].signedIn === true,
  'Host login uses the callback origin and the Desktop source and reports signed in')
ok((await rejection(serviceApi.login())).includes('already signed in'),
  'interactive selection refuses when the only provider is already signed in')
ok(await serviceApi.logout(DEEPSEEK_ACCOUNT_PROVIDER) && serviceAccount.calls.signOuts.length === 1
  && serviceAccount.calls.signOuts[0]?.locale === 'en-US'
  && (await serviceApi.providers())[0].signedIn === false,
  'logout signs out through the Host with client metadata and reports whether a grant existed')
ok(await serviceApi.logout(DEEPSEEK_ACCOUNT_PROVIDER) === false && serviceAccount.calls.signOuts.length === 2,
  'logout of a signed-out account still asks the Host and resolves false')

let releaseConcurrentOrigin
const concurrentAccount = fakeDeepSeekAccount()
const concurrentApi = createDshAuthApi({
  resolveAsk: () => fakeAsk,
  resolveDeepSeekAccount: () => concurrentAccount,
  resolveCallbackOrigin: () => new Promise(resolve => { releaseConcurrentOrigin = resolve }),
})
const firstConcurrent = rejection(concurrentApi.login(DEEPSEEK_ACCOUNT_PROVIDER))
ok(await settled(() => releaseConcurrentOrigin !== undefined), 'concurrency fixture is awaiting its callback origin')
ok((await rejection(concurrentApi.login(DEEPSEEK_ACCOUNT_PROVIDER))).includes('already running'),
  'a second login for the same provider fails fast instead of stacking two flows')
await concurrentApi.logout(DEEPSEEK_ACCOUNT_PROVIDER)
releaseConcurrentOrigin(callbackOrigin)
ok((await firstConcurrent).includes('Login cancelled'), 'concurrency fixture drained through logout')

// ── Host-owned DeepSeek account ────────────────────────────────────────────
console.log('DeepSeek account handoff')
const callbackContext = new Context()
try {
  let noListener = ''
  try { deepSeekCallbackOrigin(callbackContext) } catch (error) { noListener = error.message }
  ok(noListener.includes('webServer'), 'a callback-origin lookup refuses without a Host listener')
  callbackContext.provide('webServer', { port: 43123 })
  ok(deepSeekCallbackOrigin(callbackContext) === callbackOrigin,
    'the callback origin uses the active Host port and loopback address')
} finally {
  await callbackContext.fiber.dispose()
}
const invalidCallbackContext = new Context()
const unreadyWebServer = { port: 0 }
invalidCallbackContext.provide('webServer', unreadyWebServer)
try {
  const resolver = createDeepSeekCallbackOriginResolver(invalidCallbackContext)
  let invalidListener = ''
  try { await resolver.resolve() } catch (error) { invalidListener = error.message }
  ok(invalidListener.includes('needs an active Host webServer')
    && invalidCallbackContext.get('webServer') === unreadyWebServer,
  'an existing but unready Host listener is not shadowed by a fallback')
  await resolver.dispose()
} finally {
  await invalidCallbackContext.fiber.dispose()
}
const declaredCallbackContext = new Context()
declaredCallbackContext.provide('loader', {
  entries: () => [{ options: { id: 'dsh-tui-webserver', name: '@deepseek-ai/dsh-host-webserver' }, disabled: true }],
})
try {
  const resolver = createDeepSeekCallbackOriginResolver(declaredCallbackContext)
  let missingDeclaredListener = ''
  try { await resolver.resolve() } catch (error) { missingDeclaredListener = error.message }
  ok(missingDeclaredListener.includes('needs an active Host webServer')
    && declaredCallbackContext.get('webServer') === undefined,
  'a declared but disabled Host listener is not bypassed by the legacy fallback')
  await resolver.dispose()
} finally {
  await declaredCallbackContext.fiber.dispose()
}
const englishClient = deepSeekClientMetadata()
setLang('zh')
const chineseClient = deepSeekClientMetadata()
setLang('en')
ok(englishClient.version === manifest.version && englishClient.locale === 'en-US'
  && chineseClient.locale === 'zh-CN'
  && englishClient.timezoneOffsetSeconds === -new Date().getTimezoneOffset() * 60,
'account requests identify the current TUI version, language, and timezone')

const account = fakeDeepSeekAccount()
const accountQuestions = new QuestionStore()
const accountOpened = []
const accountUrl = 'https://platform.deepseek.com/dsh/authorize?authorize_id=fixture'
const accountLogin = loginDeepSeekAccount(account, callbackOrigin,
  request => accountQuestions.ask(request), undefined, {
    openUrl: url => { accountOpened.push(url); return true },
    copyText: async () => true,
  })
ok(await settled(() => account.calls.starts.length === 1)
  && account.calls.starts[0].origin === callbackOrigin
  && account.calls.starts[0].source === 'desktop',
'DeepSeek authorization requests Desktop promotion through the Host with its loopback callback origin')
account.update({ ...account.current(), attempt: { id: 'account-attempt-1', phase: 'waiting-browser', authorizeUrl: accountUrl } })
ok(await settled(() => accountQuestions.getSnapshot()?.question.id === 'dsh-auth-waiting')
  && accountOpened[0] === accountUrl
  && accountQuestions.getSnapshot()?.question.detail?.includes(accountUrl),
'Host authorize URL opens through the existing question bridge and remains copyable')
account.update({ ...account.current(), status: 'credential-stored', attempt: { id: 'account-attempt-1', phase: 'succeeded' } })
await accountLogin
ok(account.calls.cancels.length === 0 && accountQuestions.getSnapshot() === null,
  'a committed Host credential completes sign-in and retires the waiting panel')

const cancelledAccount = fakeDeepSeekAccount()
const cancelledQuestions = new QuestionStore()
const cancelledLogin = rejection(loginDeepSeekAccount(cancelledAccount, callbackOrigin,
  request => cancelledQuestions.ask(request), undefined, { openUrl: () => false }))
ok(await settled(() => cancelledAccount.calls.starts.length === 1), 'cancel fixture started its Host attempt')
cancelledAccount.update({ ...cancelledAccount.current(), attempt: { id: 'account-attempt-1', phase: 'waiting-browser', authorizeUrl: accountUrl } })
ok(await settled(() => cancelledQuestions.getSnapshot()?.question.id === 'dsh-auth-waiting'),
  'cancel fixture exposes the waiting panel')
cancelledQuestions.cancelCurrent()
const cancelledReason = await cancelledLogin
ok(cancelledReason.includes('cancelled') && cancelledAccount.calls.cancels[0] === 'account-attempt-1'
  && cancelledQuestions.getSnapshot() === null,
'Esc cancels the exact upstream attempt and retires the panel')

const failedAccount = fakeDeepSeekAccount()
const failedLogin = rejection(loginDeepSeekAccount(failedAccount, callbackOrigin, fakeAsk, undefined,
  { openUrl: () => false }))
ok(await settled(() => failedAccount.calls.starts.length === 1), 'failure fixture started its Host attempt')
failedAccount.update({ ...failedAccount.current(), attempt: { id: 'account-attempt-1', phase: 'failed', errorCode: 'network' } })
ok((await failedLogin).includes('network') && failedAccount.calls.cancels.length === 0,
  'Host failure surfaces its safe code without cancelling a settled attempt')

const facadeAccount = instantDeepSeekAccount()
const coupons = new WhaleCouponStore()
const couponEvents = []
const stopCoupons = coupons.subscribe(() => couponEvents.push(coupons.getSnapshot()))
const granted = { orderId: 'coupon-order-1', campaign: 'dsh_login_bonus', amount: '5.00', currency: 'CNY', expiresAt: '2099-01-01T00:00:00Z' }
const acknowledgements = []
facadeAccount.getUnnotifiedBonuses = async () => ({ accountId: 'coupon-account-1', bonuses: [granted] })
facadeAccount.ackBonusNotified = async (...args) => { acknowledgements.push(args); return true }
const accountApi = createDshAuthApi({
  resolveAsk: () => fakeAsk,
  resolveDeepSeekAccount: () => facadeAccount,
  resolveCallbackOrigin: () => callbackOrigin,
  coupons,
})
const accountResult = await accountApi.login(DEEPSEEK_ACCOUNT_PROVIDER)
ok(accountResult.expiresAt === undefined && facadeAccount.calls.starts[0].origin === callbackOrigin
  && facadeAccount.calls.starts[0].source === 'desktop'
  && (await accountApi.providers())[0].signedIn === true,
'facade login delegates with the Desktop source and reports a non-expiring account grant')
ok(await settled(() => coupons.getSnapshot()?.orderId === granted.orderId)
  && coupons.getSnapshot()?.amount === '5.00' && acknowledgements.length === 0,
'a Platform-confirmed login bonus is offered without acknowledging an unseen card')
coupons.shown(granted.orderId)
coupons.shown(granted.orderId)
ok(await settled(() => acknowledgements.length === 1)
  && acknowledgements[0][0] === 'coupon-account-1' && acknowledgements[0][1] === granted.orderId,
'the displayed order is acknowledged once with its account identity')
coupons.dismiss(granted.orderId)
ok(await settled(() => coupons.getSnapshot() === null)
  && couponEvents.filter(event => event?.orderId === granted.orderId).length === 1,
'dismissing the card does not re-offer the same unnotified order')
ok(await accountApi.logout(DEEPSEEK_ACCOUNT_PROVIDER) && facadeAccount.calls.signOuts.length === 1,
  'facade logout calls Host signOut')
stopCoupons()

const pendingAccount = fakeDeepSeekAccount()
pendingAccount.startSignIn = async (...args) => {
  pendingAccount.calls.starts.push(args)
  throw new Error('late sign-in after logout')
}
let releaseCallbackOrigin
let callbackOriginRequested = false
const pendingCallbackOrigin = new Promise(resolve => { releaseCallbackOrigin = resolve })
const pendingAccountApi = createDshAuthApi({
  resolveAsk: () => fakeAsk,
  resolveDeepSeekAccount: () => pendingAccount,
  resolveCallbackOrigin: () => {
    callbackOriginRequested = true
    return pendingCallbackOrigin
  },
})
const pendingLogin = rejection(pendingAccountApi.login(DEEPSEEK_ACCOUNT_PROVIDER))
ok(await settled(() => callbackOriginRequested), 'DeepSeek login awaits callback listener startup')
await pendingAccountApi.logout(DEEPSEEK_ACCOUNT_PROVIDER)
releaseCallbackOrigin(callbackOrigin)
const pendingOutcome = await pendingLogin
ok(pendingAccount.calls.signOuts.length === 1
  && pendingAccount.calls.starts.length === 0
  && pendingOutcome.includes('Login cancelled'),
'logout completes before callback resolution and prevents a later Host sign-in attempt')

const otherCoupons = new WhaleCouponStore()
const stopOtherCoupons = otherCoupons.subscribe(() => undefined)
await otherCoupons.refresh({
  getUnnotifiedBonuses: async () => ({ accountId: 'coupon-account-2', bonuses: [{ ...granted, campaign: 'unrelated' }] }),
  ackBonusNotified: async () => true,
})
ok(otherCoupons.getSnapshot() === null, 'unrelated bonus campaigns do not masquerade as login coupons')
await otherCoupons.refresh({
  getUnnotifiedBonuses: async () => { throw new Error('offline') },
  ackBonusNotified: async () => true,
})
ok(otherCoupons.getSnapshot() === null, 'a failed bonus read does not fabricate a coupon')
stopOtherCoupons()

// ── public Cordis entry ────────────────────────────────────────────────────
console.log('Cordis mount')
const ctx = new Context()
const registeredRoutes = []
const registeredCommands = []
const released = []
// A Host llm registry is present but must stay untouched: the entry no
// longer registers any model route.
ctx.provide('llm', {
  registerAdapter(ids, adapter) {
    registeredRoutes.push({ ids, adapter })
    return () => { released.push('llm') }
  },
})
ctx.provide('commands', {
  register(descriptor) {
    registeredCommands.push(descriptor)
    return () => { released.push('commands') }
  },
})
const mountAccount = instantDeepSeekAccount()
ctx.provide('deepseekAccount', mountAccount)
const sharedWebServer = { port: 43123 }
ctx.provide('webServer', sharedWebServer)
try {
  const fiber = await ctx.plugin(oauthModule)
  ok(oauthModule.name === 'dsh-auth' && typeof oauthModule.apply === 'function',
    'the public ./oauth entry exposes the compatible Cordis plugin contract')
  ok(registeredRoutes.length === 0, 'the entry registers no llm route')
  ok(registeredCommands.length === 1 && registeredCommands[0].name === 'auth',
    'the entry registers /auth')
  const service = ctx.get('dshAuth')
  const mountedRows = await service?.api?.providers()
  ok(mountedRows?.length === 1 && mountedRows[0].provider === DEEPSEEK_ACCOUNT_PROVIDER,
    'the public entry exposes ctx.dshAuth over the Host account only')
  const status = await registeredCommands[0].handler({ rawInput: 'status', signal: new AbortController().signal })
  ok(status.kind === 'success' && status.text.split('\n')[1]?.includes('deepseek-account')
    && status.text.split('\n').length === 2
    && status.text.includes('not signed in') && !status.text.includes('access')
    && !status.text.includes('1970'),
  '/auth status returns masked account metadata without a fake token expiry')
  const retiredRoute = await registeredCommands[0].handler({ rawInput: 'login openai-codex', signal: new AbortController().signal })
  ok(retiredRoute.kind === 'error' && retiredRoute.text.includes('unknown provider'),
    '/auth login refuses a retired third-party route')
  const headless = await registeredCommands[0].handler({ rawInput: 'login deepseek-account', signal: new AbortController().signal })
  ok(headless.kind === 'error' && headless.text.includes('interactive surface'),
    '/auth login refuses clearly without an interactive question surface')
  ctx.provide('userQuestions', { ask: fakeAsk })
  const accountCommand = await registeredCommands[0].handler({ rawInput: 'login deepseek-account', signal: new AbortController().signal })
  ok(accountCommand.kind === 'success' && accountCommand.text.includes('DeepSeek')
    && !accountCommand.text.includes('token expires') && !accountCommand.text.includes('1970'),
  '/auth login deepseek-account uses the Host flow and omits token-expiry copy')
  ok(ctx.get('webServer') === sharedWebServer && mountAccount.calls.starts[0]?.origin === callbackOrigin,
    'DeepSeek sign-in reuses an existing Web callback listener')
  const logoutCommand = await registeredCommands[0].handler({ rawInput: 'logout deepseek-account', signal: new AbortController().signal })
  ok(logoutCommand.kind === 'success' && mountAccount.calls.signOuts.length === 1,
    '/auth logout deepseek-account signs out through the Host')
  await fiber.dispose()
  ok(JSON.stringify(released) === JSON.stringify(['commands']),
    'Cordis teardown unregisters /auth and leaves no route to release')
  ok(registeredRoutes.length === 0, 'no llm route was registered over the whole lifecycle')

  // Retired third-party options are refused at boot, not silently ignored.
  for (const [key, value] of [
    ['providers', ['openai-codex']],
    ['credentialsFile', '/tmp/dsh-auth/credentials.json'],
    ['modelOverrides', { 'openai-codex': { 'gpt-5.6-sol': { contextWindow: 1 } } }],
  ]) {
    const before = registeredCommands.length
    const message = await rejection(ctx.plugin(oauthModule, { [key]: value }))
    ok(message.includes(key) && message.includes('no longer supported')
      && registeredCommands.length === before && registeredRoutes.length === 0,
    `retired option ${key} fails the mount loudly without registering anything`)
  }
  const both = await rejection(ctx.plugin(oauthModule, { providers: [], credentialsFile: 'x' }))
  ok(both.includes('providers, credentialsFile'), 'every retired option present is named in one refusal')
} finally {
  await ctx.fiber.dispose()
}

// Without a commands service the entry stays inert-but-mounted, never deadlocked.
const noCommandsCtx = new Context()
noCommandsCtx.provide('deepseekAccount', fakeDeepSeekAccount())
try {
  const fiber = await noCommandsCtx.plugin(oauthModule, {})
  const rows = await noCommandsCtx.get('dshAuth')?.api?.providers()
  ok(rows?.length === 1 && rows[0].provider === DEEPSEEK_ACCOUNT_PROVIDER,
    'a composition without commands still mounts ctx.dshAuth')
  await fiber.dispose()
} finally {
  await noCommandsCtx.fiber.dispose()
}

// The v0.11.2 global patch still mounts ./oauth but lacks its new
// dsh-tui-webserver row. After /update, this new module must provide the
// missing Host listener without relying on the stale patch being replaced.
console.log('legacy global patch fallback')
const legacyCtx = new Context()
const legacyAccount = fakeDeepSeekAccount()
legacyCtx.provide('loader', {
  entries: () => [{ options: { id: 'dsh-tui-auth', name: '@deepseek-harness-tui/dsh-tui/oauth' } }],
})
legacyCtx.provide('commands', { register: () => () => {} })
legacyCtx.provide('deepseekAccount', legacyAccount)
legacyCtx.provide('userQuestions', { ask: fakeAsk })
try {
  const fiber = await legacyCtx.plugin(oauthModule)
  const api = legacyCtx.get('dshAuth')?.api
  ok(legacyCtx.get('webServer') === undefined,
    'a stale patch does not open a callback listener before DeepSeek sign-in')
  const aborted = new AbortController()
  aborted.abort()
  let cancelledBeforeStart = false
  try { await api.login(DEEPSEEK_ACCOUNT_PROVIDER, aborted.signal) } catch { cancelledBeforeStart = true }
  ok(cancelledBeforeStart && legacyCtx.get('webServer') === undefined
    && legacyAccount.calls.starts.length === 0,
  'an already-cancelled login opens no fallback listener')
  const login = api.login(DEEPSEEK_ACCOUNT_PROVIDER)
  ok(await settled(() => legacyAccount.calls.starts.length === 1),
    'DeepSeek login starts through the built-in OAuth module without a webserver patch row')
  const fallback = legacyCtx.get('webServer')
  ok(fallback?.host === '127.0.0.1' && Number.isInteger(fallback.port) && fallback.port > 0
    && legacyAccount.calls.starts[0].origin === `http://127.0.0.1:${fallback.port}`,
  'the fallback mounts the official Host webServer on an assigned loopback port')
  let accountContext
  const accountFiber = await legacyCtx.plugin({
    name: 'account-callback-fixture',
    apply(ctx) { accountContext = ctx },
  })
  try {
    const releaseRoute = accountContext.get('webServer').register({
      kind: 'exact', path: '/oauth/callback',
      handler: (_request, response) => { response.writeHead(204); response.end() },
    })
    try {
      const response = await fetch(`http://127.0.0.1:${fallback.port}/oauth/callback`, {
        signal: AbortSignal.timeout(2000),
      })
      ok(response.status === 204,
        'the Host account context can serve its browser callback through the fallback listener')
    } finally {
      releaseRoute()
    }
  } finally {
    await accountFiber.dispose()
  }
  legacyAccount.update({ ...legacyAccount.current(), status: 'credential-stored',
    attempt: { id: 'account-attempt-1', phase: 'succeeded' } })
  await login

  const secondLogin = api.login(DEEPSEEK_ACCOUNT_PROVIDER)
  ok(await settled(() => legacyAccount.calls.starts.length === 2), 'a repeated account login starts')
  ok(legacyCtx.get('webServer')?.port === fallback.port
    && legacyAccount.calls.starts[1].origin === `http://127.0.0.1:${fallback.port}`,
    'repeated account login reuses the one fallback listener')
  legacyAccount.update({ ...legacyAccount.current(), status: 'credential-stored',
    attempt: { id: 'account-attempt-1', phase: 'succeeded' } })
  await secondLogin
  await fiber.dispose()
  ok(legacyCtx.get('webServer') === undefined,
    'disposing built-in OAuth closes its fallback listener')
} finally {
  await legacyCtx.fiber.dispose()
}

const oldHostCtx = new Context()
oldHostCtx.provide('commands', { register: () => () => {} })
try {
  const fiber = await oldHostCtx.plugin(oauthModule)
  const rows = await oldHostCtx.get('dshAuth')?.api?.providers()
  ok(rows?.length === 0 && oldHostCtx.get('webServer') === undefined,
    'an older Host without deepseekAccount lists no provider and opens no fallback callback listener')
  await fiber.dispose()
} finally {
  await oldHostCtx.fiber.dispose()
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
