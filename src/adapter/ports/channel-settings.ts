/** Host-owned in-process Channel contract. No runtime or upstream imports. */
import type { LocalizedDescriptions } from './channel-catalog.js'

/**
 * The `ctx.dshAuth` api, structural so this tree never imports the plugin:
 * mounting dsh-auth (or anything exporting this shape) lights up the
 * DeepSeek account sign-in; absent it, sign-in actions stay hidden.
 */
export interface OAuthSetupHost {
  providers(): Promise<readonly OAuthProviderStatus[]>
  login(provider?: string, signal?: AbortSignal): Promise<OAuthLoginResult>
  logout(provider: string): Promise<boolean>
}

/** One sign-in provider a dsh-auth-style plugin mounts (masked state only). */
export interface OAuthProviderStatus {
  readonly provider: string
  readonly label: string
  readonly oauthLabel: string
  readonly loginLabel: string | undefined
  readonly signedIn: boolean
  readonly expiresAt: number | undefined
  readonly expired: boolean
}

/** One successful OAuth login. */
export interface OAuthLoginResult {
  readonly provider: string
  readonly oauthLabel: string
  /** Undefined for Host-owned account grants without a token expiry. */
  readonly expiresAt: number | undefined
}

/**
 * Runtime capabilities the settings screen needs, implemented by the channel
 * over the dsh `settings` / `credentials` seams. `undefined` from
 * `channel.settingsHost()` means the composition lacks them (bare cordis.yml
 * start) and the screen shows namespaces read-only.
 */
export interface SettingsHost {
  /** Every registered namespace, secrets redacted, in registration order. */
  listNamespaces(): readonly SettingsNamespaceView[]
  /** Write path ops against a namespace, fenced by its current revision. */
  write(ns: string, ops: readonly SettingsPathOp[], expectedRevision?: number): Promise<void>
  /** Whether any layer supplies a credential under `ref`. */
  credentialConfigured(ref: string): Promise<boolean>
  /** Persist a credential; opaque host authorization is checked by identity. */
  writeCredential(ref: string, value: string, authorization?: object): Promise<void>
}

/** A recoverable fault in a namespace's persisted document (shown as a badge). */
export type SettingsNamespaceWarning =
  | { readonly id: 'unreadable' }
  | { readonly id: 'recovered'; readonly backup: string }

/** One settings namespace as the screen reads it (secrets redacted). */
export interface SettingsNamespaceView {
  readonly ns: string
  /** Monotonic revision of the raw user section; fences writes. */
  readonly revision: number
  /** 'live' applies immediately; 'restart' needs a relaunch. */
  readonly applies: 'live' | 'restart'
  /** Current resolved value (all layers composed). */
  readonly value: unknown
  /** Raw user layer; a path present here is a user override. */
  readonly user: unknown
  /** A fault in the namespace's own document, when there is one. */
  readonly warning?: SettingsNamespaceWarning
}

export type SettingsPathOp =
  | { op: 'set'; path: readonly string[]; value: unknown }
  | { op: 'unset'; path: readonly string[] }

/** One plugin's section inside the TUI settings screen. */
export interface TuiSettingsSection {
  /**
   * Settings namespace this section edits. Should match a namespace the
   * plugin registers on the dsh settings service; the screen marks the
   * section unavailable when the composition serves no such namespace.
   */
  ns: string
  /** Section title (English; also the fallback). */
  title: string
  /** Provider-owned translations for the title. */
  descriptions?: LocalizedDescriptions
  /**
   * Top-level page (tab) of the settings screen this section renders on.
   * Sections declaring the same `id` share one page; the first declaration
   * names it. Absent: the section joins the screen's default "general" page
   * together with every other paged-less section, and the tab strip only
   * appears once at least one section declares a page of its own.
   */
  page?: TuiSettingsPage
  /** Optional navigation groups, in display order. */
  groups?: readonly TuiSettingsGroup[]
  /** Editable fields, in display order. */
  fields: readonly TuiSettingsField[]
}

/** One top-level page (tab) of the settings screen. */
export interface TuiSettingsPage {
  /** Stable identifier; sections declaring the same id share the page. */
  id: string
  /** Page title (English; also the fallback). */
  title: string
  /** Provider-owned translations for the title. */
  descriptions?: LocalizedDescriptions
}

/** Optional navigation group inside one settings section. */
export interface TuiSettingsGroup {
  /** Stable identifier, unique inside the section. */
  id: string
  /** Group title (English; also the fallback). */
  title: string
  /** Provider-owned translations for the title. */
  descriptions?: LocalizedDescriptions
  /**
   * Root-page presentation. 'page' (the default) renders one navigation
   * row that opens the group's fields on a subpage — for deep, cohesive
   * domains. 'inline' renders the fields directly on the root page under
   * a small header — for shallow topics where a subpage round-trip costs
   * more clicks than the ordering buys. Subpage navigation (Esc back,
   * focus reset) only exists for 'page' groups.
   */
  mode?: 'inline' | 'page'
}

export interface TuiSettingsField {
  /**
   * Key path from the section root, in the settings service's `mutate` path
   * vocabulary (object keys; dict keys name their entry directly).
   */
  path: readonly string[]
  /** Short field label (English; also the fallback). */
  label: string
  /** Provider-owned translations for the label. */
  descriptions?: LocalizedDescriptions
  /** Optional one-line help rendered under the field. */
  hint?: string
  /** Provider-owned translations for the hint. */
  hintDescriptions?: LocalizedDescriptions
  /** Optional group id; grouped fields render on that group's subpage. */
  group?: string
  kind: TuiSettingsFieldKind
  /**
   * Choices for `kind: 'select'`; any options-bearing field (text hybrids
   * included — e.g. the page-margin presets) also cycles via ←/→ in the
   * settings list while Enter keeps the kind's own action (select cycles,
   * text opens the editor for a custom value).
   */
  options?: readonly TuiSettingsFieldOption[]
  /** Resolve select choices from the current route's read-only effort catalog.
   * Omitted fields keep their declared static options. */
  optionsSource?: 'effort'
  /** Input placeholder for `kind: 'text' | 'number'`. */
  placeholder?: string
  /**
   * Credential control (mirrors the web cards' CardSecretSpec): the literal
   * never rides the settings document — the draft starts blank on every
   * open, a blank draft writes nothing, and a typed draft writes through the
   * credentials seam under `ref`. The screen shows only whether a value is
   * configured. Optional authorization belongs to host controls and is omitted
   * from plugin-visible projections.
   */
  secret?: { ref: string; authorization?: object }
  /**
   * Render a stored value as draft text. Defaults to the kind's conversion
   * (strings verbatim, numbers via `String`, booleans/selects by value).
   */
  format?(value: unknown): string
  /**
   * The write this draft text stages, or `undefined` when the text is not a
   * value this field accepts — an invalid draft blocks the save rather than
   * being discarded. Defaults to the kind's conversion (an empty text/number
   * draft stages a clear, letting the field re-inherit the composition
   * layer).
   */
  parse?(text: string): TuiSettingsFieldWrite | undefined
}

/** Control kinds the TUI settings screen knows how to render. */
export type TuiSettingsFieldKind = 'text' | 'number' | 'boolean' | 'select'

export interface TuiSettingsFieldOption {
  /** Stored value. */
  value: string
  /** Display label (English; also the fallback). */
  label: string
  /** Provider-owned translations for the label. */
  descriptions?: LocalizedDescriptions
}

/** The write one field's draft stages when the section is saved. */
export type TuiSettingsFieldWrite =
  | { kind: 'set'; value: unknown }
  | { kind: 'clear' }
