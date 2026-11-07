/**
 * Plugin-shaped backend rows for regressions that need a non-DSH kernel.
 *
 * DSH is the only backend that ships in-tree, so a picker, launchpad or boot
 * regression that has to exercise "another kernel" registers these through the
 * real `registerBackend()` gate (the same path a third-party bundle takes)
 * instead of relying on built-in rows. They cover the two shapes the host
 * distinguishes:
 *
 *  - `fixture-sdk`: declares an install recipe the host's executor runs, so its
 *    "not installed" row opens the install wizard (`installable`);
 *  - `fixture-cli`: declares nothing to install (the user's own binary is the
 *    dependency), so its row only carries detection's hint.
 *
 * The registry module is passed in so a regression registers on the same module
 * instance its code under test reads (`src/` through tsx, or `lib/types/`).
 * Registering twice is a no-op. Nothing here imports a vendor package.
 */
import type { BackendManifest } from '../../src/agent/backend-manifest.js'

export const FIXTURE_SDK_ID = 'fixture-sdk'
export const FIXTURE_CLI_ID = 'fixture-cli'
export const FIXTURE_SDK_SPECIFIER = '@verify/fixture-sdk@1.2.3'
export const FIXTURE_SDK_VERSION = '1.2.3'

export const fixtureSdkManifest: BackendManifest = {
  id: FIXTURE_SDK_ID,
  label: { kind: 'literal', text: 'Fixture SDK Agent' },
  shortLabel: 'FixtureSDK',
  product: 'fixture-sdk-cli',
  inTree: false,
  capabilities: [],
  grants: [],
  install: { executor: 'pnpm-profile-add', specifier: FIXTURE_SDK_SPECIFIER, version: FIXTURE_SDK_VERSION },
}

export const fixtureCliManifest: BackendManifest = {
  id: FIXTURE_CLI_ID,
  label: { kind: 'literal', text: 'Fixture CLI Agent' },
  shortLabel: 'FixtureCLI',
  product: 'fixture-cli',
  inTree: false,
  capabilities: [],
  grants: [],
}

interface RegistryLike {
  registerBackend(entry: { readonly manifest: BackendManifest; readonly load?: () => Promise<Record<string, unknown>> }): void
  getBackend(id: string): unknown
}

/** Register both fixture rows (after dsh, in this order) unless already present. */
export function registerFixtureBackends(registry: RegistryLike): void {
  for (const manifest of [fixtureSdkManifest, fixtureCliManifest]) {
    if (registry.getBackend(manifest.id) === undefined) registry.registerBackend({ manifest, load: async () => ({}) })
  }
}
