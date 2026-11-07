import type { ServiceLookup } from './channel-host.js'
import { t } from '../../i18n.js'
import type { ChannelState } from '../channel/types.js'
import { isReservedCredentialRef } from '../credentialRefGuard.js'
import { getPath, type SettingsHost } from '../settingsEditor.js'
import type { OAuthProviderStatus, OAuthSetupHost, SettingsNamespaceView, SettingsNamespaceWarning, TuiSettingsField, TuiSettingsSection } from '../../adapter/ports/channel-settings.js'
import { concreteService } from '../host-access.js'

// An opaque leaf survives the renderer's detached read projections. Plain
// metadata cannot forge it; writes still pass the Channel UI lifetime/policy gate.
class WebCredentialAuthorization {}
const webCredentialFields = new WeakMap<object, { store: object; owner: object; ns: string; ref: string }>()

/** The web-search forms share one settings page: provider, fetch route, API
 *  route and key are one topic and are edited together. */
const WEB_SETTINGS_PAGE: NonNullable<TuiSettingsSection['page']> = Object.freeze({
  id: 'search',
  title: 'Search',
  descriptions: Object.freeze({ zh: '搜索' }),
})

/** Forms over the host's web settings; provider selection remains owned by DSH. */
export function webSettingsSections(ctx: ServiceLookup, namespaces: readonly SettingsNamespaceView[]): TuiSettingsSection[] {
  const available = new Set(namespaces.map(view => view.ns))
  const loader = ctx.get('loader') as { entries(): Iterable<{
    options: { id: string }
    fiber?: { ctx?: { fiber: object }; runtime: { name?: string } | null }
  }> } | undefined
  const web = ctx.get('web') as { ctx: { fiber: object } } | undefined
  const webOwner = web === undefined ? undefined : concreteService(web).ctx.fiber
  let webNs: string | undefined
  let apiNs: string | undefined
  let messagesNs: string | undefined
  let apiOwner: object | undefined
  let messagesOwner: object | undefined
  // Settings namespaces belong to Config-owning fibers, not package or row names.
  for (const entry of loader?.entries() ?? []) {
    // entry.id includes an Include tree path; settings uses the raw Config owner ID.
    const ns = entry.options.id
    if (entry.fiber === undefined || !available.has(ns)) continue
    // Loader 1.1 retains the awaitable Fiber wrapper; its context still names
    // the canonical owner, as on older Loaders that stored that owner directly.
    const owner = concreteService(entry.fiber.ctx?.fiber ?? entry.fiber)
    if (webOwner !== undefined && owner === concreteService(webOwner)) webNs = ns
    if (entry.fiber.runtime?.name === 'web-deepseek-api') {
      apiNs = ns
      apiOwner = owner
    }
    if (entry.fiber.runtime?.name === 'web-search-deepseek') {
      messagesNs = ns
      messagesOwner = owner
    }
  }
  // This section is introduced together with live provider selection in rc.2.
  // Older hosts keep their existing search route without an ineffective picker.
  if (apiNs === undefined) return []
  const sections: TuiSettingsSection[] = []
  if (webNs !== undefined) sections.push({
    ns: webNs, title: 'Web search', descriptions: { zh: '网页搜索' }, page: WEB_SETTINGS_PAGE,
    fields: [
      {
        path: ['searchProvider'], label: 'Search', descriptions: { zh: '搜索' }, kind: 'text',
        hint: 'Select DeepSeek Search API or Messages search. Custom provider IDs are also accepted.',
        hintDescriptions: { zh: '选择 DeepSeek Search API 或 Messages 搜索，也可输入自定义提供者 ID。' },
        options: [
          { value: 'deepseek-search-api', label: 'Search API', descriptions: { zh: '搜索 API' } },
          { value: 'deepseek-official', label: 'Messages' },
        ],
      },
      {
        path: ['fetchProvider'], label: 'Fetch', descriptions: { zh: '抓取' }, kind: 'text',
        hint: 'Select DeepSeek Fetch API or local HTTP fetch. Changes apply to the next operation.',
        hintDescriptions: { zh: '选择 DeepSeek Fetch API 或本地 HTTP 抓取，保存后从下一次操作生效。' },
        options: [
          { value: 'deepseek-fetch-api', label: 'Fetch API', descriptions: { zh: '抓取 API' } },
          { value: 'http', label: 'HTTP' },
        ],
      },
      ...((): TuiSettingsField[] => {
        const searchApi = getPath(namespaces.find(view => view.ns === webNs)?.value, ['searchProvider']) === 'deepseek-search-api'
        const ns = searchApi ? apiNs : messagesNs ?? apiNs
        const owner = searchApi ? apiOwner : messagesOwner ?? apiOwner
        const ref = getPath(namespaces.find(view => view.ns === ns)?.value, ['apiKeyEnv']) ?? 'DEEPSEEK_API_KEY'
        const store = ctx.get('credentials') as object | undefined
        if (owner === undefined || store === undefined || typeof ref !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(ref)) return []
        const authorization = Object.freeze(new WebCredentialAuthorization())
        const field: TuiSettingsField = {
          path: ['apiKey'], label: 'API key', descriptions: { zh: 'API 密钥' }, kind: 'text', secret: { ref, authorization },
          hint: 'Paste a key for the selected search API. Saved keys are never displayed.',
          hintDescriptions: { zh: '粘贴当前搜索 API 的密钥，保存后不再显示原值。' },
        }
        webCredentialFields.set(authorization, { store: concreteService(store), owner, ns, ref })
        return [field]
      })(),
    ],
  })
  sections.push({
    ns: apiNs, title: 'DeepSeek Search / Fetch API',
    descriptions: { zh: 'DeepSeek 搜索 / 抓取 API' }, page: WEB_SETTINGS_PAGE,
    fields: [
      { path: ['baseURL'], label: 'API base URL', descriptions: { zh: 'API 基础地址' }, kind: 'text',
        hint: 'Include the path prefix, without /search or /fetch.',
        hintDescriptions: { zh: '包含路径前缀，不含末尾的 /search 或 /fetch。' } },
      { path: ['count'], label: 'Search result count', descriptions: { zh: '搜索结果数' }, kind: 'number',
        parse(text) {
          if (text.trim() === '') return { kind: 'clear' }
          const value = Number(text)
          return Number.isInteger(value) && value >= 1 && value <= 50 ? { kind: 'set', value } : undefined
        } },
      { path: ['sendOriginalQuestion'], label: 'Send original question', descriptions: { zh: '发送原始问题' }, kind: 'boolean',
        hint: 'Send up to 128 characters of the latest user prompt with the search query.',
        hintDescriptions: { zh: '搜索时附带最近一条用户提示，最多 128 个字符。' } },
    ],
  })
  if (messagesNs !== undefined) sections.push({
    ns: messagesNs, title: 'DeepSeek Messages search', descriptions: { zh: 'DeepSeek Messages 搜索' }, page: WEB_SETTINGS_PAGE,
    fields: [
      { path: ['baseURL'], label: 'Messages API base URL', descriptions: { zh: 'Messages API 基础地址' }, kind: 'text' },
      { path: ['maxUses'], label: 'Maximum searches per request', descriptions: { zh: '每次请求的最大搜索次数' }, kind: 'number',
        parse(text) {
          if (text.trim() === '') return { kind: 'clear' }
          const value = Number(text)
          return Number.isInteger(value) && value > 0 ? { kind: 'set', value } : undefined
        } },
    ],
  })
  return sections
}

export function createSettingsHosts(ctx: ServiceLookup, assertActive: () => void = () => undefined): Pick<ChannelState, 'settingsHost' | 'oauthSetup' | 'oauthProviderStatuses' | 'backendAuth'> {
  let settingsHostResolved = false
  let settingsHostCache: SettingsHost | undefined
  return {

    settingsHost(): SettingsHost | undefined {
      if (settingsHostResolved) return settingsHostCache
      settingsHostResolved = true
      // The `/settings` screen's runtime surface, over the dsh-base seams:
      // settings (namespace descriptors + revision-fenced mutate) and
      // credentials (secret writes). Structurally
      // typed like the other optional seams in this file.
      const settings = ctx.get('settings') as
        | {
          describe(options?: { redactSecrets?: boolean }): readonly {
            ns: string
            revision: number
            applies: 'live' | 'restart'
            value: unknown
            user?: unknown
            warning?: SettingsNamespaceWarning
          }[]
          mutate(
            ns: string,
            ops: readonly (
              | { op: 'set'; path: readonly string[]; value: unknown }
              | { op: 'unset'; path: readonly string[] }
            )[],
            expectedRevision?: number,
          ): Promise<void>
        }
        | undefined
      const credentials = () => ctx.get('credentials') as
        | {
          resolve(ref: string): Promise<{ value: string } | undefined>
          set(ref: string, value: string): Promise<void>
        }
        | undefined
      if (!settings) return undefined
      settingsHostCache = {
        listNamespaces() {
          // redactSecrets: the screen never renders a secret literal — secret
          // fields are write-only controls over the credentials seam.
          return settings.describe({ redactSecrets: true }).map(descriptor => ({
            ns: descriptor.ns,
            revision: descriptor.revision,
            applies: descriptor.applies,
            value: descriptor.value,
            user: descriptor.user,
            warning: descriptor.warning,
          }))
        },
        write(ns, ops, expectedRevision) {
          return settings.mutate(ns, ops, expectedRevision)
        },
        async credentialConfigured(ref) {
          // The environment shadows the store, so an env-provided key counts
          // as configured.
          if (process.env[ref] !== undefined) return true
          return (await credentials()?.resolve(ref)) !== undefined
        },
        async writeCredential(ref, value, authorization) {
          const store = credentials()
          if (!store) throw new Error('credentials service unavailable')
          const authorized = authorization === undefined ? undefined : webCredentialFields.get(authorization)
          if (authorized !== undefined) {
            const currentFields = webSettingsSections(ctx, settingsHostCache!.listNamespaces()).flatMap(section => section.fields)
            const current = currentFields.flatMap(candidate => {
              const binding = candidate.secret?.authorization === undefined ? undefined : webCredentialFields.get(candidate.secret.authorization)
              return binding === undefined ? [] : [binding]
            }).some(binding => binding.owner === authorized.owner && binding.ns === authorized.ns && binding.ref === ref)
            if (!current || authorized.ref !== ref || authorized.store !== concreteService(store)) {
              throw new Error(t('settings-web-key-changed'))
            }
            await store.set(ref, value)
            return
          }
          // Second layer of the secret-ref reservation guard: the
          // registration layer already rejects plugin sections with
          // host-owned refs, but this seam must not trust it — a stale
          // section (registered before the guard) or a direct call must not
          // reach the shared credentials.
          if (isReservedCredentialRef(ref)) throw new Error(t('settings-secret-ref-reserved', { ref }))
          await store.set(ref, value)
        },
      }
      return settingsHostCache
    },

    oauthSetup(): OAuthSetupHost | undefined {
      return (ctx.get('dshAuth') as { api?: OAuthSetupHost } | undefined)?.api
    },

    // The DSH session's sign-in is the DSH credentials `/login` reports; a
    // non-DSH composition overrides this with its backend's own.
    backendAuth: () => undefined,

    async oauthProviderStatuses(): Promise<readonly OAuthProviderStatus[] | undefined> {
      // Same optional seam as `oauthSetup`: absent plugin → undefined, and
      // `/login` renders exactly its pre-plugin lines.
      const api = (ctx.get('dshAuth') as { api?: OAuthSetupHost } | undefined)?.api
      return api === undefined ? undefined : api.providers()
    }
  }
}
