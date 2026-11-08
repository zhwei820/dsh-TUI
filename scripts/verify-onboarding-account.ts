/**
 * verify-onboarding-account — 首启引导的"已配置账号就不在启动时弹"判定回归。
 *
 * Run: node --import tsx/esm scripts/verify-onboarding-account.ts
 *
 *   A. 环境变量里有 DEEPSEEK_API_KEY → 已配置（不读凭据库）。
 *   B. 凭据库 describe 报 configured → 已配置；报未配置 → 未配置。
 *   C. dshAuth 有已登录的 provider → 已配置；全部未登录 → 未配置。
 *   D. 服务缺席、读取抛错 → 未配置（保持旧行为：照常弹引导）。
 *   E. 读取卡住 → 超时后按未配置处理，不拖住首帧。
 */
import assert from 'node:assert/strict'
import { accountConfigured } from '../src/dsh-adapter/onboarding-account.js'

const lookup = (services: Record<string, unknown>) => ({ get: (name: string) => services[name] })
const credentials = (configured: boolean) => ({ describe: async () => ({ configured, writable: true }) })
const dshAuth = (...signedIn: boolean[]) => ({ api: { providers: async () => signedIn.map(value => ({ signedIn: value })) } })

const savedKey = process.env.DEEPSEEK_API_KEY
delete process.env.DEEPSEEK_API_KEY
try {
  // A
  process.env.DEEPSEEK_API_KEY = 'sk-test'
  assert.equal(await accountConfigured(lookup({})), true, 'A: env key counts as configured')
  delete process.env.DEEPSEEK_API_KEY

  // B
  assert.equal(await accountConfigured(lookup({ credentials: credentials(true) })), true, 'B: stored key')
  assert.equal(await accountConfigured(lookup({ credentials: credentials(false) })), false, 'B: no stored key')

  // C
  assert.equal(await accountConfigured(lookup({ dshAuth: dshAuth(false, true) })), true, 'C: one signed-in provider')
  assert.equal(await accountConfigured(lookup({ credentials: credentials(false), dshAuth: dshAuth(false, false) })), false,
    'C: no signed-in provider')

  // D
  assert.equal(await accountConfigured(lookup({})), false, 'D: services absent')
  const failing = { describe: async () => { throw new Error('store unreadable') } }
  assert.equal(await accountConfigured(lookup({ credentials: failing })), false, 'D: read failure')
  assert.equal(await accountConfigured(lookup({ credentials: failing, dshAuth: dshAuth(true) })), true,
    'D: one failing probe does not mask the other')

  // E
  const stuck = { describe: () => new Promise(() => {}) }
  const started = Date.now()
  assert.equal(await accountConfigured(lookup({ credentials: stuck }), 50), false, 'E: stuck store times out')
  assert.ok(Date.now() - started < 1000, 'E: bounded by the timeout')
} finally {
  if (savedKey === undefined) delete process.env.DEEPSEEK_API_KEY
  else process.env.DEEPSEEK_API_KEY = savedKey
}

console.log('onboarding account probe OK (env, store, oauth, absent/failing, timeout)')
