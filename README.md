<p align="center">
  <img src="docs/assets/readme/logo-en.svg" alt="dsh-TUI animated whale logo" width="560">
</p>

<p align="center">
  <strong>English</strong> | <a href="README_ZH.md">简体中文</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@deepseek-harness-tui/dsh-tui"><img alt="npm" src="https://img.shields.io/npm/v/@deepseek-harness-tui/dsh-tui?style=flat-square&color=4b6fff"></a>
  <a href="https://github.com/ccch1mneyyy/dsh-TUI/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/ccch1mneyyy/dsh-TUI/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-263146?style=flat-square"></a>
  <img alt="Public beta" src="https://img.shields.io/badge/status-public%20beta-7da1de?style=flat-square">
  <a href="https://github.com/ccch1mneyyy/dsh-TUI/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/ccch1mneyyy/dsh-TUI?style=flat-square&color=4b6fff"></a>
  <a href="https://www.npmjs.com/package/@deepseek-harness-tui/dsh-tui"><img alt="npm downloads" src="https://img.shields.io/npm/dm/@deepseek-harness-tui/dsh-tui?style=flat-square&color=4b6fff"></a>
</p>

# dsh-TUI

> An interactive terminal UI for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), the coding agent you drive from a terminal — built for people who want to stay in that terminal.
> It adds a pixel-whale header, live work status, streaming reasoning, double-`Esc` time rewind, a context progress bar and a TPS gauge on top of the official runtime, and supports DeepSeek models only. DSH is the built-in backend; installed plugin backends are experimental.
> Zero core changes: it consumes only DSH's public exports, so installing enables it and uninstalling leaves no patches behind.
> It is moving from a mounted plugin to an app with its own entry and composition root, with DSH loaded in process as the first-party backend.

**Contents** — [Highlights](#highlights) · [Preview](#preview) · [Featured & Listed](#featured--listed) · [Quick Start](#quick-start) · [Keybindings & Mouse](#keybindings--mouse) · [Built-in Commands](#built-in-commands) · [Configuration & Extensions](#configuration--extensions) · [How It Works](#how-it-works) · [Known Limitations](#known-limitations) · [Development](#development) · [Plugin Ecosystem](#plugin-ecosystem) · [Documentation](#documentation) · [Community](#community) · [Permissions and Security Boundary](#permissions-and-security-boundary) · [Acknowledgments](#acknowledgments)

## Highlights

### Terminal experience

- **Pixel whale pet** — three startup intros, click to wake; freezes after the first task.
- **Quiet defaults** — an ordinary launch goes straight into chat under a compact welcome box (shown once on the first run). `/` and `@` completions are a borderless list, the footer is quiet (context readout, `? for shortcuts`, or `⏸ plan mode on (shift+tab to cycle)`), and todos read as a `⎿ ☐/☒` checklist.
- **Quiet status lines** — while working, the line is `✻ Thinking… (12s · ↑ … tokens · esc to interrupt)`; finished thinking folds to `∴ Thought for 12s` (click or `Ctrl+O` to read it), an interruption reads `⎿ Interrupted · …`, and compaction reads `Compacting conversation…`. Approvals ask `Do you want to proceed?` with `Yes` / `Yes, and don't ask again` / `No, and tell the model what to do differently (esc)`. In narrow panes the compaction status stays on one line: phase and cancellation hints yield first, then the label shortens, and elapsed time only appears as a complete field.
- **Diffs** — Edit/Write diffs are unified with tinted `+`/`-` rows under an `Updated with N additions and M removals` line; `/settings` `diffLayout` switches to side by side, or automatic by terminal width. One-sided additions and deletions get the full body width without an empty opposite pane; ordinary edits stay side by side, and mixed files choose their layout separately before folding or streaming reveal.
- **Classic look** — the older presentation stays one switch away: `/settings` `launchpad` (landing page + whale header), `statusBar.*` (model, cwd and Git branch, cache, tokens, cost, segmented context bar and the other status-bar toggles), `diffLayout`, `promptSessionLabel` (session chip + ⌸ / ⛶), and cordis `activity: true` (live activity line).
- **Launchpad** — with `/settings` `launchpad` on, an ordinary launch lands on a landing page with a **real input box** (big text + whale + quick actions; short or narrow terminals drop whole blocks, and whale-girl images use a compact native-canvas footprint instead of leaving a large gap before the title; off by default). Command completion matches chat: `Tab` fills the input, `Enter` runs the command and clears it.
- **First-run guide** — the first run walks a four-step wizard (accounts & models / language + theme / model + workspace / shortcuts), re-runnable with `/setup`. It is not offered on launch once an account is configured (a `DEEPSEEK_API_KEY` or a signed-in account); its first step signs in to a DeepSeek account and catches the models it brings in (none → no question, one → that one, several → you choose); without any access it shows how to set `DEEPSEEK_API_KEY` by hand.
- **Native cursor** — focused text inputs inherit your terminal's cursor shape, color, blinking, and enabled animation or trail effects in both inline and fullscreen modes. The `/model` picker shows the same cursor while moving between provider tabs, model rows and effort levels, then hides it after **0.5 seconds at rest**; clipped regions fall back to the model row. The session manager also moves this cursor between the workspace rail, session rows and the search box; typing claims the search caret, and navigation returns it to the focused row. Configure animation and trail effects in your terminal.
- **Terminal-native UI** — streaming Markdown, tool cards, `/` and `@` completion, `#L12-14` ranges, history search, zh/en UI.

### Rendering

- **Images** — Kitty/Sixel thumbnails, centered preview with zoom and pan, paste-time fitting, and a text fallback. Kitty images scale to the reserved cells' physical pixels, including on HiDPI terminals. Images referenced with `@path` follow the same admission and resize/conversion policy as pasted images; notices report the stored dimensions and format, required animation conversion is refused rather than dropping frames, and mentioned and staged images share count and stored-byte limits in source order.
- **Mermaid diagrams** — `mermaid` fenced code blocks are drawn as Unicode diagrams.
- **LaTeX math** — `$…$` and `$$…$$` formulas render as Unicode text, with fractions and limits stacked in display blocks; `mathRendering: image` typesets block and one-row inline formulas as terminal images on graphics terminals.
- **Timeline rail** — every turn is clickable; timeline / scrollbar / hidden gutter.
- **Side panel** — `Ctrl+B` splits the chat with a panel column once the terminal is wide enough; drag the divider to resize. All eight built-in panels and later-registered plugin panels start enabled (`sidePanel.panels: '*'`; untick a row in `/settings` for an explicit list), the header shows each inactive panel's symbol, and narrow terminals and inline mode keep full-screen panels. Panel identity and settings rules: [Configuration](docs/configuration.en.md#tui-configuration).
  - **Workspace counts** — panel counts match the session manager: the current conversation counts; empty logs, subagents, fork ancestors and archived sessions do not. Registered workspaces with no visible conversations stay at zero; load and read errors are shown separately, and `r` refreshes.
- **Live state** — activity animation, context bar, TPS, cache hit rate, effort, tokens, session cost estimate (main + subagents), Git and session metadata. Title, trajectory-strip and session-state animations update independently of the transcript and pause when idle or unfocused.
  - TPS includes hidden reasoning time and excludes tool execution time; decode spans of 500ms or less are excluded from TPS samples, while token and cost totals still include all reported usage.
  - Context-bar fill follows backend occupancy, and colors estimate content composition; compaction clears obsolete estimates, and missing composition shows a single used block with a measured used count in both hover details.

### Sessions and workflow

- **One session manager** — `/resume` `/home` `/agentview` `/bg` `⌸` open the same manager: workspace rail, live state, filter, ★ pins.
- **Session workflow** — `/new` `/compact` `/export` `/btw`, model hot-switch, fork, rewind, vim, fullscreen draft editor.
  - `/btw` uses an overlay when its sidebar cannot render; main-task questionnaires and the fullscreen draft editor take priority while preserving the side question and draft.
- **Moving sessions** — when a DSH 0.2.1+ Agent moves its session to another directory (the `working_directory` tool or a Git worktree), the status line, Git branch, `@` completion, `!` commands, clicked paths, skill commands and loaded context follow it, including after `/resume`. The session stays registered under the project it started in. Relative paths in cards rendered before a move resolve against the session's current directory when clicked; absolute paths keep their target.
- **Reasoning effort** — the default effort setting offers the current backend/model's declared tiers, including custom IDs. Saved values absent from that catalog stay visible and stored; while loading or unavailable, only Auto is selectable. On DSH, Auto follows the saved `/effort` choice, then the configured effort, then the model default; plugin backends keep their own backend preference at startup and on resume, and explicitly choosing Auto resets the model default. Explicit changes affect the next request, unsupported preferences fall back with a notice and are never forced onto a route, and resuming a DSH session preserves its recorded effort (or its live selection when reattaching); the saved default seeds new sessions, and explicit `/effort` or effort-default changes still apply to the current session's next request.
- **Goals and todos** — the prompt footer hides completed goals once the turn is idle; the Todo side panel retains their history. `Ctrl+Q` folds todos while working and hides/restores the idle goal/todo footer; clicking the todo header also hides it while idle. Hiding changes only this display — a new goal/todo snapshot or session reveals it again, and `/goal clear` does not clear todos. The presets dsh-TUI registers disable the model's `todo_write` tool, so the agent states its rough steps in prose instead of a todo list.
  - In the `todo` panel a long goal wraps to the panel width with its phase on a separate row; when the content exceeds the viewport, focus the panel and scroll with `↑`/`↓` or the wheel. The compact goal row above the input stays a single truncated line with a hover tooltip.
- **Turn receipts and recaps** — a turn of 10s or more closes with `✻ Worked for 1m 14s · done 7:46 AM` (`/settings` `turnUsageRow` swaps in the detailed token ledger), and one of a minute or more is followed by a one-line `※ recap: …` (the `recapOnOpen` switch covers both automatic recaps).
- **Suggested next messages** — after each turn a suggested next message (when something is pending) appears under the input as `↹ Tab: …`; `Tab` on an empty input takes it, `Enter` sends (cordis `promptSuggestions: false` turns it off). The model is also asked to state its rough plan and key decisions in its reply (cordis `decisionNotes: false` turns that off).
- **IDE selection channel** — a VS Code selection lands in the prompt.

### DSH integration

- **DSH integrations** — presets, skills, MCP, goals, todos, subagents, questionnaires.
<<<<<<< HEAD
  - Subagents render as `● Agent(description)` cards with their recent tool calls and a `Done (N tool uses · tokens · time)` line; parallel runs read as one `Running N agents…` tree, and `Ctrl+O` lists every tool call. While any subagent runs, an `N agents running` list stays pinned above the input — one row per agent with its latest tool and elapsed time; click a row to open that agent. A subagent's detail opens on its full transcript: the task the delegating agent gave it (complete, never truncated), every step it took, and its final answer; follow-up prompts to a continuable agent appear in place.
- **DeepSeek account sign-in** — dsh-TUI supports DeepSeek models only. On DSH 0.2.0-rc.1+ the standard profile offers host-owned DeepSeek browser sign-in as `deepseek-account`; use `/auth` or the first-run guide without another plugin.
=======
  - Subagents render as `● Agent(description)` cards with their recent tool calls and a `Done (N tool uses · tokens · time)` line; parallel runs read as one `Running N agents…` tree, and `Ctrl+O` lists every tool call.
=======
- **DSH integrations** — presets, skills, MCP, goals, todos, subagents, questionnaires. Subagents render as `● Agent(description)` cards with their recent tool calls and a `Done (N tool uses · tokens · time)` line; parallel runs read as one `Running N agents…` tree, and `Ctrl+O` lists every tool call. While any subagent runs, a `N agents running` list stays pinned above the input — one row per agent with its latest tool and elapsed time; click a row to open that agent. Opening a subagent (from that list, its transcript card or the agents dashboard) shows its conversation the way the main agent's reads — one transcript, no tabs: the task the delegating agent gave it (complete, never truncated; pinned on top while older pages are still unloaded), every step, and its final answer — with an input at the bottom to send it follow-up prompts (DSH subagents are continuable). Esc returns to where you came from.
>>>>>>> 444f507c69651549071bcba07ae6ca45651b580f
- **DeepSeek account sign-in** — dsh-TUI supports DeepSeek models only. On DSH 0.2.0-rc.1+ the standard profile offers Host-owned DeepSeek browser sign-in as `deepseek-account`; use `/auth` or the first-run guide without another plugin.
>>>>>>> 431a9afa60a70cf47689a9b03745b8b2e053eb60
  - A profile-only update from a global TUI patch that already mounts `dsh-tui-auth` can still start the official loopback callback listener on demand; fixed-port SSH forwarding still requires the global package to be aligned.
- **Extensions** — browser interaction, computer use and more.

### Platform and performance

- **Task completion notifications** — sessions notify after successful live work settles, with no queued follow-up or active goal. The title is “dsh-TUI · Task complete”; the body shows the latest settled reply as a single-line plain-text preview (Markdown formatting removed, up to 200 characters). OSC 777/9 apply an additional 2048-byte sequence budget, including title and protocol bytes, preserving whole graphemes. No reply shows only the title; BEL only rings. Replay, cancellation and failures do not notify; works in inline and fullscreen modes.
  - **Settings** — `/settings` → Conversation: `taskNotifications` = `unfocused` (default), `always`, or `off`; `notificationMethod` = `auto` (default), `osc9`, `bel`, or `windows`.
  - **Delivery** — `auto` uses separate title/body fields on Ghostty/WezTerm (OSC 777) and Kitty (OSC 99); iTerm2/Warp and explicit `osc9` use a title prefix; other terminals ring the bell, and delivery follows your terminal's notification/bell settings. Terminals without focus reporting need `always`; tmux needs `set -g allow-passthrough on` for OSC notifications and `set -g focus-events on` for focus reporting.
  - **Windows** — on local Windows, `auto` resolves to `windows`, the system's native notifications. The first toast registers that user's AppUserModelID under HKCU; it appears about 3 seconds after the task ends (the PowerShell cold start that buys the no-extra-install route). For DSH sessions, an enabled, active external DSH notification plugin in the running profile makes dsh-TUI yield to it (no toast, no bell); an installed but disabled plugin does not suppress notifications. If the AppUserModelID cannot be written, the notification falls back to the bell instead of going silent.
  - **SSH** — SSH sessions keep the attached terminal's notification protocol in `auto` mode; explicit `windows` still selects the host's native transport.
- **Built for long sessions** — event-driven projection, virtualization, bounded caches.

Keys and commands: [Interaction and commands](docs/interaction.en.md). Everything else: [documentation index](docs/README.md).

## Preview

<div align="center">
  <picture>
    <source media="(max-width: 640px)" srcset="docs/assets/readme/preview-en-mobile.svg">
    <img src="docs/assets/readme/preview-en.svg" alt="Recorded dsh-TUI session: welcome, completion, help and typing, with animated pixel whale." width="78%">
  </picture>
</div>

## Featured & Listed

Among the community plugins recommended by the **official lead of DeepSeek
Harness**, dsh-TUI is the first.

Featured by the **DeepSeek Harness official WeChat account**, listed in the
[dshfind](https://dshfind.com/en/plugins/ccch1mneyyy/dsh-TUI) plugin
directory, and ranked **#7 on [GitHub Trending](https://trendshift.io/repositories/146168)
daily** (TypeScript).

<div align="center">
  <table>
    <tr>
      <td align="center" valign="middle" width="50%">
        <img src="screenshots/wechat-official.png" alt="dsh-TUI featured by the DeepSeek Harness official WeChat account" width="480">
        <br>
        <strong>Featured by the official WeChat account</strong>
      </td>
      <td align="center" valign="middle" width="50%">
        <a href="https://dshfind.com/en/plugins/ccch1mneyyy/dsh-TUI"><img src="https://dshfind.com/api/card/ccch1mneyyy/dsh-TUI?lang=en" alt="dsh-TUI on dshfind" width="420"></a>
        <br>
        <strong>Listed in the dshfind directory</strong>
        <br><br>
        <a href="https://trendshift.io/repositories/146168" title="GitHub Trending Daily #7 · TypeScript"><img alt="Trendshift" src="https://trendshift.io/api/badge/trendshift/repositories/146168/daily?language=TypeScript"></a>
        <br>
        <strong>GitHub Trending Daily #7</strong>
      </td>
    </tr>
  </table>
</div>

## Quick Start

### Command-line installation

Prerequisites: [Node.js](https://nodejs.org/en) and
[deepseek-harness](https://github.com/deepseek-ai/deepseek-harness).
The `deepseek-official` API-key route needs `DEEPSEEK_API_KEY`. On DSH
0.2.0-rc.1+, the standard profile can instead use `/auth login deepseek-account`
and select the separate account route through `/model`.

The primary compatibility target is DSH `0.2.2-rc.1`. This adapter supports its
Shell API, V4 session messages, declarative presets, and profile-backed settings;
older supported hosts retain their compatibility paths. See [configuration](docs/configuration.en.md).

On DSH 0.2.1-rc.5 and later, `/settings` also selects DeepSeek Search / Fetch APIs and edits their
endpoint and result limits, supporting custom Loader entry IDs and a masked API
key input saved through DSH's credential store.

`/settings` groups its sections into pages: the TUI's own settings sit under
**General**, and plugins that declare a page get their own tab (`Tab` / `Shift+Tab`, or a click on the strip in fullscreen, switches pages; the strip is hidden when only one page exists).

On DSH 0.1.7, `/settings` uses the TUI's actual Loader entry ID, including custom
IDs. It requires matching profile dependencies with `@deepseek-ai/schemastery`
3.18.3 or newer; an incompatible schema stops TUI startup with repair guidance
instead of showing an uneditable settings page. Older hosts keep their legacy settings scope.

The `dsh-tui` section of `/settings` is saved in `~/.dsh-tui/settings.json`, shared by
every kernel; the first launch imports it once from the profile's `cordis.patch.yml` (and an older host's `~/.dsh/settings.yaml`).
See [configuration](docs/configuration.en.md#tui-configuration).

```sh
# Install the CLI and this plugin globally (ships the dsh-tui command)
npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui

# Start (first run auto-initializes the profile; needs pnpm)
dsh-tui
# Both `dsh-tui` and the short `dst` alias start the same TUI.
dst
```

Manual alternative: `dsh plugin --profile dsh-tui add @deepseek-harness-tui/dsh-tui`.
The repo's `sh install.sh` runs that step and checks the required commands.
Afterwards `dsh-tui` and `dsh --profile dsh-tui` are equivalent.

> **New-user note**: pnpm ≥11 blocks dependencies with install scripts by
> default and reports `ERR_PNPM_IGNORED_BUILDS`. Updates skip foreign-platform
> natives (such as the `@img/sharp-*` packages), so only this machine's binaries
> are fetched. `/update` and `dsh-tui update` write both settings automatically.
> No manual step needed. Details:
> [Getting started](docs/getting-started.en.md#pnpm-install-script-blocks-and-foreign-platform-natives).

After startup the TUI checks for newer versions in the background. It never
blocks the first frame. Type `/update` for a one-shot upgrade of the whole set
— TUI, dsh engine and global launcher. It restarts automatically and resumes
the current session, and refuses instead of leaving an incompatible or
unbootable TUI/engine combination. Launcher alignment is normally best effort,
but a failure after the engine advances blocks the restart and prints a repair
command. If the registry has a newer dsh release outside the TUI's
validated line, it says so and waits for a TUI update rather than installing an
unvalidated engine. Launcher alignment only touches proven global installs;
local npm/npx packages, ambiguous aliases and multi-member pnpm groups stay
unchanged. See
[Getting started](docs/getting-started.en.md) for the profile lifecycle,
source builds, and troubleshooting, including migration from the former
`dsh-cc-tui` package.

### CLI

Automation: `dst -p "task"`, `dst run --json`, `dst session list --json`.
The independent engine does not load the TUI or inherit its profile/preferences;
it uses official DSH headless/services (validated on 0.2.0-rc.2, 0.2.1-rc.2, 0.2.1-rc.3, 0.2.1-rc.4 and 0.2.1-rc.5).
`dst cli --help` lists its commands; `dst dsh <argv...>` forwards native DSH.
See [Automation CLI](docs/cli.en.md) for protocol, limits, resume restrictions,
and Node/Python/PowerShell integration examples.

| Command | Purpose |
| --- | --- |
| `dsh-tui` / `dst` | Start the TUI; `dst` is a short alias for the same program |
| `dsh-tui --resume [id]` · `dsh-tui update` · `dsh-tui doctor` | Resume a session · align the TUI, dsh engine and global launcher as one set · pre-flight environment checks |
| `dsh-tui safe` | Read-only diagnostics, plugin inventory and repair guidance; `safe --rescue` builds a clean rescue profile |
| `dsh-tui version` · `dsh-tui help` | Launcher and profile versions and usage; both work even without a `dsh` install |

Leading DSH options such as `--dump-config` and `--patch <path>` are forwarded
unchanged; other arguments go to the app in `dsh --profile dsh-tui`. Use
`dsh-tui -- --resume=sid-1 ./notes` to send `--resume=sid-1 ./notes` as literal
prompt text, without selecting a session or workspace. When invoking DSH
directly, use `dsh --profile dsh-tui -- -- --resume=sid-1 ./notes`: the first
`--` belongs to DSH, the second to the app. Host options can precede a literal
prompt: `dsh-tui --patch ./overlay.yml -- --resume=sid-1` applies the overlay
and sends `--resume=sid-1` as prompt text without resuming that session.
Safe mode: [Getting started](docs/getting-started.en.md).

### Importing conversations from other agents (`dsh-tui migrate`)

Bring Claude Code, Codex, OMP, zcode, or Grok Build conversation histories into the DSH session store, then browse and resume them by their original working directory via `/resume`:

```sh
dsh-tui migrate                # list importable counts per agent (writes nothing)
dsh-tui migrate claude-code    # import every Claude Code conversation (likewise codex / omp / zcode / grok-build)
dsh-tui migrate codex --dry-run  # preview what would land, write nothing
```

- **Read-only source**: migration only reads the foreign agent's local store; artifacts are written through the official `JsonlSessionPersistence` backend, so imported sessions are first-class (openable, continuable).
- **Idempotent**: one deterministic UUID per source conversation — re-importing skips what is already present instead of stacking duplicates.
- **Structure preserved**: user/assistant messages, reasoning traces, tool calls with their results, and the source's context compactions (as native compaction checkpoints) are rebuilt turn by turn; harness-injected machine text opens no turn. An imported session can pick the work straight up.
- More agents (pi, opencode, …) extend the adapter registry as adapters land; grok-build reads `GROK_HOME` when set.

In-TUI browsing: the session screen (`/resume`) shows a tab per agent that has conversations; picking one imports just that conversation and opens it.
In-TUI: `/migrate` (optionally `/migrate <agent> [--dry-run]`) runs the same import in a child process and reports through the notification flow.
CLI alternative: `dsh-tui migrate ...` from any shell runs the same import.
Full guide: [Session migration](docs/migrate.en.md).

**VS Code**: use the integrated terminal or the `dsh-tui-vscode` extension. See [VS Code guide](docs/vscode.en.md). **Herdr**: run `dsh-tui` in a [Herdr](https://herdr.dev) pane; `idle` / `working` / `blocked` are reported through its local integration API. **Any terminal**: dsh-tui reports `idle` / `working` / `blocked` / `done` / `error` over the pty with [OSC 7501 (Program Status Protocol)](https://www.superlogical.com/rex/docs/build/program-status), so terminals and agentic inboxes that implement it can show what the session is doing; terminals that do not implement it ignore the sequence. Set `DSH_TUI_PROGRAM_STATUS=0` to turn it off.

Bare `--resume` (`-c`, `--continue`) reopens the last session of the backend this
launch selected. Startup recovery only ever targets that backend: a backend with no
last session, or a derived target that belongs to a different backend than the one
that actually booted (an unknown backend id falling back to DSH, `--backend` naming
a backend that is not installed, a remembered kernel that is not the marker's
source), refuses with a clear error and exit code 1 — never a silent cold start,
never another backend's session, never a new session. An explicit `--resume <id>`
passes that id to the selected backend as-is. The one exception is safe mode's
"retry normal startup": it retries the kernel and session recorded in
`last-run.json`, so a record whose backend is gone degrades to a warning plus a cold
start — that retry is the last way back.

### Experimental: DSH Agent Teams

DSH's experimental Agent Teams lets the session's agent (the Lead) create
named teammates that share the working directory, message each other and
coordinate on a shared task board. It ships with dsh, is off by default, and
`/plugin list` advertises it. Switch it on:

```sh
/plugin enable @deepseek-ai/dsh-experimental-agent-team-profile
```

The switch enables or disables the bundle in the profile, so it persists
across restarts, and on a `dsh --profile` launch it applies at once — running
sessions included: the model is told which tools came and went. `/team` appears
in Help and `/` completion only once the team service is mounted, and only
reports: `/team` (or `/team status`) shows the bundle, the service and this
session's teammates. `/team on|off` was removed; typing it points at
`/plugin enable|disable`. Turning the bundle off while teammates run asks
first, and switching off stops them: the team service releases the teammates
still running as it unloads. Inside a teammate session the other teammates'
runs are not visible, so the question counts them as possibly running. The
team record stays in the session and comes back when the bundle is enabled
again.

If the running DSH does not ship the bundle (`/plugin list` stays silent),
switch DSH to one of the supported lines first (`0.2.2-rc.1`, `0.2.1-rc.5`, `0.2.1-rc.4`, `0.2.1-rc.3`,
`0.2.1-rc.2`, `0.2.1-alpha.5`, `0.2.0-rc.1` or `0.2.0-rc.2`). To install it into the profile explicitly,
run `dsh plugin --profile dsh-tui add @deepseek-ai/dsh-experimental-agent-team-profile@<your-dsh-version>`:
the team packages ship in lockstep with DSH and pin their DSH peers exactly,
so the version must match.

While a request carries `spawn_teammate`, dsh-TUI drops `subagent` /
`subagent_fork` from it, and the team's `send_message` / `list_agents` /
`interrupt_agent` / `wait_agent` take the place of the legacy controls of the
same names, so `spawn_teammate` is the delegation tool; with the team off
the legacy tools are back. Subagents that are not team members (workflow,
ralph) keep `subagent`. A teammate shows up as a subagent row, a message between
members as a `✉ <sender>` bubble in the receiving session (a teammate's
received messages show on its subagent detail as agent messages), and the
other team tools as one-line cards (`send_message` with its target and
`sent`). The agents dashboard (Ctrl+A) and the agents side
panel switch to a team view: each teammate under its member name with
`running` / `idle` / `provisioning` / `failed` (a teammate whose turn ended
is idle — a message wakes it — not done), the Lead line, the remaining
subagents, a read-only task board (status, owner, `blocked`, write-scope
warnings) and a banner when the team record was rejected. A delegation
provider whose settled runs fail at least twice and at least half the time
gets one degraded-channel line above the list; the built-in `subagent` route,
workflow members and per-type Claude children are excluded because there is
no provider to switch to.

Limits: the switch covers the whole profile, not one session (a launch
without the profile plugin service, or without hot reload, needs `dsh plugin`
and a restart); there is no "enter teammate session" yet, and `/export` leaves team messages out. Upstream limits apply: teammates share one working directory, a
team lives in one process, and a task owner is never released automatically.
Subagent failure badges and the Companion error state share session-scoped unread
status. Opening that child’s detail or main view acknowledges only that failure;
a new run or failure alerts again. Acknowledgements survive panel remounts and
session switches during this process, but a cold restart starts unread. Opening
the dashboard alone does not acknowledge every child. Task status stays failed.

## Keybindings & Mouse

### Keys

| Key | Action |
| --- | --- |
| `Enter` | Send; while a turn runs, steer the text into it at the next step boundary |
| `Tab` | Complete `/` and `@`; while a turn runs, queue a follow-up |
| `Ctrl+Enter` | Interrupt the running turn and send |
| `Esc` | Close local layers, then interrupt; double-`Esc` on empty idle input rewinds |
| `Alt+Up` | Recall the last message |
| `Ctrl+B` / `Ctrl+O` | Side panel / details (reasoning, tool arguments and output) |
| `Ctrl+R` / `Ctrl+V` | History search / paste; history is scoped to the current project |
| `Ctrl+Shift+E` | Fullscreen draft editor |
| `?` / `←` | Shortcuts / session manager (`←` backgrounds the current DSH session first) |

`Ctrl+U` deletes from the caret to the current line start (preserving text to the right and whole image chips) in both the launchpad and chat, and `Alt/Option+←/→` / `Alt/Option+Backspace` move or delete by whitespace-delimited words; on macOS, configure your terminal to send Option as Meta. `Alt+Up` / `Alt+Down` also page through question text and approval previews without moving the choice focus, and are remappable in `/settings` → `Shortcuts`.

Text, cursor position and staged image attachments on the launchpad or in chat while the backend starts are preserved when the session becomes ready; press `Enter` after it is ready to send, and an earlier `Enter` keeps the draft without queueing it. Opening a new session while startup is pending clears the previous draft and its images. In the launchpad input, `Shift+Enter` (or `Option+Enter`) opens chat and inserts a newline at the caret, keeping the draft and staged images unsent. Fixed-action permission questions offer only the caller's choices; ordinary questionnaires still accept free text. When DSH ends a turn because its session was disposed, the transcript shows “Session stopped”; user interruption keeps its existing prompt for what to do next. This describes the reported stop reason and does not recover a stuck session or its queued inputs.

The complete key table (editing, vim mode, image preview, questionnaires, transcript navigation) and the delivery rules for steering, queued follow-ups and interrupts are in [Interaction and commands](docs/interaction.en.md#input-and-global-shortcuts).

### Mouse and selection

Fullscreen mouse selection stays in the pane where the gesture starts, including chat, sidebar and either diff column. Drag to select and copy, double/triple click to select a word or line, and click tool cards, timeline ticks, `[Image #N]` previews and file paths (which open a file-action menu; auto-detection does not extract a path from inside a slash-delimited token such as `working/idle/needs-input` or a date such as `2024/01/15`); diagonal, word and line selection copy that pane's text, soft wraps join independently, source newlines remain, and divider drags only resize.

Automatic copies keep the text selected; press `Esc` to clear it or start a new selection to replace it. Selection highlighting skips trailing padding and blank rows while preserving spaces within text and code indentation, and a fullscreen selection started in a code block joins soft-wrapped rows without adding frame padding or newlines; hard line breaks and their inset remain part of screen copying. During a fullscreen drag the native cursor follows the selected text's edge and returns to the focused input's caret on release; fullscreen drag-copy uses the final highlight (if a live row changes mid-drag, move the selection back to stable text to re-baseline), a stationary selection whose copied text changes is refused, and automatic scroll or resize does not clear that protection. Inline mode uses the terminal's native selection.

### Pasting and dropped files

The launchpad accepts clipboard images and pasted image paths as `[Image #N]` attachments, sent with the first message; commands that do not accept images preserve the draft and attachments, and pasted text is folded to one line. Image chips behave like chat: arrows step across them, Backspace at the end or Delete at the start removes one whole, and Ctrl+W never splits a chip. In chat, native and bracketed paste keeps ordinary text and newlines and never submits itself, while pasted CRLF collapses to a single newline. On Windows terminals that deliver a paste as win32-input-mode key records, a leaked record stream is decoded back into the characters its `Uc` field encodes (newlines included), with only character-less records stripped.

A native Windows desktop drop (Windows Terminal / OpenConsole) arrives as an OSC 8 hyperlink; the parser restores its `file://` URI to a decoded local path before paste hygiene runs, so the `]8;id=…;` parameter bytes never reach the draft. Image paths enter the existing image staging pipeline, other files are inserted as a referenceable path (quoted as a single `"…"` token when it contains whitespace), and only `file://` URIs are restored — a remote authority/UNC, several distinct URIs, or a URI with several tokens is refused and stays literal text.

### Terminal input

Windows Neovim/Vim terminals identified by `NVIM` or `VIM_TERMINAL` retain VT input instead of enabling ConPTY mode 9001. For another incompatible embedded host, set `DSH_TUI_DISABLE_WIN32_INPUT_MODE=1` before launch (PowerShell: `$env:DSH_TUI_DISABLE_WIN32_INPUT_MODE="1"`); the same gate applies at startup and after resume, and the opt-out can remove modified-Enter reporting. Native Windows Terminal, conhost and VS Code keep their existing mode unless disabled.

Extended key reporting (Kitty keyboard protocol and xterm `modifyOtherKeys`) is enabled for a fixed terminal list: iTerm2, kitty, WezTerm, Ghostty, rio, Orca, tmux, Warp and Windows Terminal. A terminal missing from that list can opt in with `DSH_TUI_FORCE_EXTENDED_KEYS=1`, and `DSH_TUI_DISABLE_EXTENDED_KEYS=1` opts an allowlisted terminal back out for SSH or nested xterm.js hosts (it wins when both are set). Outside native Windows, where win32-input-mode reports Enter's modifiers instead and is not touched by this switch, a terminal without extended keys cannot tell `Shift+Enter` from `Enter`, and `Ctrl+J` is the newline fallback.

Fragmented input is reassembled instead of leaking into the prompt. On native Windows, Win32 input records split across short input delays are rejoined (a bare `ESC[` fragment is held only after one record has actually been decoded, while a fragment whose own shape is already record-specific holds on its own); terminals that never enter the mode keep the classic VT path, so a lone `Esc` keeps its response time. Split terminal replies (DA1 / DA2 / DSR / DECRPM / XTVERSION) are held only while a query of the matching response type is outstanding, and fragmented SGR mouse reports only while fullscreen mouse tracking is active. Every hold is bounded (about 1 second from first capture, never extended by later input; 64 bytes max), after which input is handled as before — SGR bytes replay as ordinary keys in arrival order. Inside a window, literal input starting with `[digit;…` can be held or joined to a preceding `Esc`, so wait for the window to close or avoid that shape right after `Esc`. Unknown complete CSI sequences are not inserted as text, and after a damaged CSI prefix a bare ASCII letter can be consumed as its terminator; the very first record can still leave residue if split before its record-specific shape forms.

### Display and session ownership

The pixel whale, large title and context/TPS colors follow the same terminal color depth as other text: monochrome, 16-color, 256-color or truecolor. Apple Terminal and tmux use the shared fallback; `NO_COLOR` and `FORCE_COLOR` retain the existing shared color policy. If resume reports that another DSH process owns the writer, release the session in that process (for example, dsh web) and retry in the same TUI; the foreground session stays intact, and deleting session or lock files to bypass single-writer protection is not supported.

Full reference: [Interaction and commands](docs/interaction.en.md).

## Built-in Commands

`/resume` · `/home` · `/agentview` · `/bg` · `⌸` open the same session manager: workspace rail, live state, filter, ★ pins. Also `/model` `/new` `/compact` `/export` `/btw` `/tree` `/fork` `/rewind` `/settings` `/setup` `/status` `/cost` `/jobs` `/skills` `/mcp` `/auth` `/login` `/update`.

Plugin slash-command results, including errors, remain as local transcript blocks for scrolling and copying during the current session, with indentation and line breaks preserved. Each report retains at most 200 lines, 65,536 UTF-16 code units and 4,000 terminal cells per line, plus a visible truncation marker; the rows are not sent as model input or replayed as history, and older blocks are evicted within the shared 600-row budget. Explicit report layouts such as `/goal` keep their existing formatting.

### Sessions and kernels

On DSH, `/fork` keeps the current session open and creates a resumable copy; a copy with history records its parent and appears in the same session family.

`/dsh` switches directly to the DSH kernel, just like choosing it in `/kernel`: the choice is remembered and the process restarts into a new session. A running turn blocks switching; when DSH is already current the session is kept. Availability checks follow the same picker flow. DSH is the only built-in kernel; installed plugin backends appear in the same picker and can also be selected with `--backend <id>` (experimental).

### Model and effort

`/model` shows models and reasoning effort on one page. DSH has provider tabs with **Recently used** first, moving the current model to the top; `Tab` / `Shift+Tab` select the next / previous provider. `↑/↓` select a model, `←/→` adjust its effort, `Enter` applies the model and any explicit effort draft, and `Esc` cancels. Changing only the model preserves the backend's preference handling. Mouse users can click the available tabs, models, effort levels, and select/cancel hints; clicking an effort level immediately applies the focused model and that effort and closes the picker. The wheel moves through models.

Short terminals keep the focused model and select/cancel actions visible, hiding descriptions and neighboring models first, then the effort row when only two rows remain.
Shortcuts sit below the title and effort levels have their own section; the picker uses the terminal background while covering the text underneath.

### Session manager

The session manager focuses the most recently used session in the current workspace; if there is no history, it focuses the new-session card. Moving between the workspace rail and session list preserves the selected session, including when the mouse enters the list. Switching to another workspace selects its latest session; switching back also starts from its latest session instead of restoring an earlier selection. Press `←` to move to the workspace rail. DST preloads the session list in the background after startup and updates the cache on success. The manager paints the last successful list immediately. Opening `/resume` while that read is pending shares the request and receives results that have already arrived. This first-paint snapshot survives restarts and is isolated by backend and storage directory. With or without a snapshot, the current workspace loads first before other workspaces are filled in. Fresh sessions and titles merge into the list immediately; cached rows from other workspaces remain until the full read finishes. Background updates preserve a session the user has selected manually. The browser groups sessions by their own cwd. DSH resolves the current workspace's metadata first and publishes it before reading other workspaces' logs, even when it has fewer than 32 sessions. Titles that require a deeper DSH log scan appear first with a fallback name and update in place when recovery finishes.
The session manager shows the selected workspace's absolute path once, beneath the source tabs (wrapping when needed; hover reveals exceptionally long paths). Session rows show their title and essential status/time instead of repeating the directory; DSH size and model remain in the title tooltip.
With DSH's current JSONL backend, startup and `/new` keep initial permission events in memory until further session activity saves the complete log. Flushing a session that holds only initialization leaves it unstored. Restarting an unstored empty session starts fresh.
The project rail uses one line per directory on every backend and source tab; the selected project’s path appears once above the panes.

Removing a workspace registration keeps its sessions accessible under a "History only" directory in the rail.
History-only directories offer edit and new-session actions; rename and remove are available for registered workspaces.

If a `/resume` attempt fails or is cancelled before switching, it releases any session occupancy acquired by that attempt so the session can be retried.

On Linux, stale TUI occupancy and mount locks can be reclaimed when the old PID
has been reused by a non-leader thread. This requires readable `/proc` identity
data in the same PID namespace; uncertain identities remain occupied. Reuse by
another process can still retain a stale claim, so this is not a general fix for
PID reuse across platforms.

### Background work

**Background jobs**: card headers open the focused task panel. Click the card body or use `Ctrl+O` to toggle the command between its first statement and full script. Commands and output use separate colored edges with `❯` (`>` on Windows) and `≡` on their first rows; output always stays at the latest two visible rows. `/jobs` and the side panel keep the full output scrollable, while `e` toggles the focused command. Consecutive blank script lines collapse to one.

**Background sessions**: On the DSH backend, `/bg` or `←` on an empty prompt backgrounds the current session and opens the session manager; `Esc` returns to it. Background sessions run in this process and stop when the TUI exits. Logs survive. On plugin backends, those entries open the session manager without backgrounding the session.

Full commands: [Interaction and commands](docs/interaction.en.md).

## Configuration & Extensions

Agent presets, themes, MCP servers, environment variables: [Configuration](docs/configuration.en.md) · [Themes](docs/themes.en.md).

With the DeepSeek brand, Companion skins `deepy` and `whaleGirl` replace the maid portrait; choose `whale` and enable Maid portrait to use it. The Codex brand uses its own raster portrait or the maid character-art fallback and ignores these settings for splash artwork. See [Configuration](docs/configuration.en.md).

DSH profiles inherit official reporting defaults: DeepSeek API requests carry plugin package identities and incremental Session logs to the configured `baseURL`, including third-party gateways, while OpenTelemetry uploads a Session-log prefix only after explicit feedback. User overrides remain supported; see [reporting settings](docs/configuration.en.md#official-request-metadata-and-feedback-reporting).

## How It Works

```text
dsh profile → dsh-base → dsh-TUI Cordis patch → agent preset + DSH services
  → session/event → Channel projection → React components → Ink/Yoga renderer → terminal
```

The TUI handles interaction and presentation. The session log is the source of truth. DSH services own models, tools, and persistence. Long sessions render in O(visible window). A completed text-only assistant reply whose only line is a leading `⏵` status line stays in the conversation and can be selected for copying; live status lines and status lines followed by a real answer stay out of the transcript body.

Runtime path, module boundaries, performance notes and persistence locations: [Architecture and limitations](docs/architecture.en.md).

## Known Limitations

- Injected plugin context has no standalone display; it counts into the context segments.
- `/model` changes the next request’s route in the same session; history and session ID are preserved. The last used route is recorded when the next request starts. On DSH 0.2.2, API/plugin selections also update the next-model readout; late events from a previously fixed step do not overwrite the selected model's capacity metadata. DSH versions before `0.1.2-alpha.3` refuse switching and prompt an upgrade because their subagents inherit the original route.
- `Ctrl+V` needs platform clipboard tools; unsupported bitmap formats are rejected.
- Windows Terminal/ConPTY sixel frames check the last transmitted raster’s cursor position before parking, using measured cell geometry and encoded band controls. Detected drift uses the same physical clear and redraw as `Ctrl+L`. Probes allow one pending reply (500 ms), skip resize/handoff, and pause for 60 seconds after an unanswered query or three repairs within 10 seconds. Set `DSH_TUI_SIXEL_CURSOR_HEAL=0` to disable; `DSH_TUI_DEBUG` records probe/recovery decisions. This bounded mitigation cannot detect every kind of pixel corruption or repair ConPTY itself.
- Shutdown drains only the actual renderer-owned input after terminal cleanup and a 150-ms settle window. Embedders retaining only `unmount` keep that input lease; wrappers replacing the method must pass the renderer’s `shutdownInput` lease to `finishExit`. Custom input drains its own buffered bytes; a device-specific kernel drain can be supplied as the bounded synchronous `render({ drainStdin })` callback. Revoked/replaced owners and non-TTY input are not drained. The window does not guarantee arbitrary SSH latency.
- Local Windows copying uses PowerShell with UTF-8 stdin. Copies run in order; each PowerShell attempt has a two-second timeout (Windows PowerShell, then PowerShell 7). If both fail, OSC 52 remains the fallback and requires terminal support. SSH never writes the remote native clipboard.
- Catchable exits explicitly end synchronized output (DEC 2026) as part of terminal cleanup, even without a final frame. SIGKILL, native aborts and a fully blocked JavaScript event loop cannot guarantee in-process cleanup; recovery then requires the terminal or an external supervisor.
- While the TUI owns an active raw input, it reasserts OS raw mode on input-gap/focus recovery and every five seconds without waiting for a key. This repairs externally reset cooked/ECHO state even when Node still reports `isRaw=true`; recovery may take one interval while the event loop runs. The periodic check stops during editor pauses and shutdown/handoff and does not resend display protocols.
- A dropped file is restored from its OSC 8 `file://` URI alone: multi-file drops, non-Windows terminal drop encodings and terminator-less truncated frames are not covered, and the hyperlink's own display name is never used.
- A background session lives inside this process and stops when the TUI exits.
- `/thinking` is not persisted; the kernel `minimal` agent preset (极简模式, one persistent-shell tool) mounts no compaction and does not prune tool results — a long session can hit the context limit, oversized tool output stays in the context in full, and `/compact` plus the questionnaire are unavailable under it (Help and `/` completion mark the entry, and entering the preset says so once); that is a different thing from the `/settings → Minimal UI` (极简界面) display switch; `/update` needs a `dsh --profile` launch and is refused while a turn is running.
- The status-bar `≈¥` and `/cost` are session estimates that include subagent usage (priced per each agent's model × peak/idle × cache components); unofficial or unlisted models show tokens only and are marked unpriced. **The platform bill is authoritative.**
- Fragmented SGR mouse reports are covered at the mechanism level with controlled fixture comparisons; the reporter environments (macOS → SSH, WSL2 with `dsh web`) have not been re-tested.

Full list: [Architecture and limitations → Known limitations](docs/architecture.en.md#known-limitations).

## Development

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm smoke
```

`lib/types/` is ignored generated output; `pnpm build` recompiles it from a clean output directory and runs the build gates. **Git URL installs are not supported**: the source manifest keeps `@dsh-std/*` as workspace deps and `vendor/dsh-std` as a submodule, and pnpm ≥11 also refuses git-hosted `prepare` scripts by default. Install the registry package instead: `dsh plugin --profile dsh-tui add @deepseek-harness-tui/dsh-tui`. Rendering, questionnaire or tool-card changes also need the matching regression scripts.

- **Fast local iteration** — `pnpm dev` keeps the full install/build/pack checks by default; set `DSH_TUI_DEV_FAST=1` for explicit local iteration (for example, `DSH_TUI_DEV_FAST=1 pnpm dev -- --no-launch`). An unchanged hit skips frozen install, `compile`, pack and isolated profile installation only while source/config and compiler-loader contents, Node/pnpm/npm/dsh versions, compiled and vendor output, the tarball, and the installed package/profile all match; replacing pnpm/npm/dsh without changing its reported version needs one normal run. Failures invalidate the success stamp before work begins, and fast mode never changes release gates: run normal `pnpm build` and focused regressions before publishing.
- **Node versions** — CI uses Node 24 and pnpm 11; the package supports Node `^22.19 || >=24`. The launcher checks the manifest’s Node range before loading the application: known unsupported versions (including Node 23 and prereleases) stop with Node upgrade instructions, while missing or unrecognized ranges allow startup for compatibility with migrated launchers and `doctor` reports that compatibility cannot be determined. `help` and `version` remain available.
- **React builds** — TUI entry points use production React even when the workspace sets `NODE_ENV=development`; set `DSH_TUI_REACT_DEV=1` (for example, `DSH_TUI_REACT_DEV=1 pnpm dev`) to debug the renderer. Its render instrumentation can accumulate memory in long sessions.
- **Heap forensics** — the monorepo development host (`pnpm tui`, `scripts/run.ts`) enables heap forensics only with `DSH_TUI_HEAP_WATCH=1`. It samples every 15 seconds and takes one snapshot at each heap threshold of 1024, 1536, 2048, 2560 and 3072 MiB, keeping at most four 64-KiB logs and two snapshots totaling at most 1024 MiB under `$DSH_HOME`; `DSH_TUI_HEAP_MAX_MB` (integer 1–16384; invalid values use 1024) changes the snapshot budget. Files use a process-unique `dsh-tui-heap-watch-` prefix; manual and legacy files are untouched, an oversized snapshot is removed (so the latest diagnostic may be a log only), and incomplete `.writing` files are removed only after their owner PID is confirmed absent (live or uncheckable owners are preserved, and cleanup failures are nonfatal). Snapshot creation still blocks and uses extra memory and disk space, and this does not fix memory leaks.
- **Source checkout** — the root `Makefile` wraps the common commands (`make help`); `make install` installs a missing dsh at the validated version, then builds and packs the checkout and installs it into the local dsh's `dsh-tui` profile (see [getting started](docs/getting-started.en.md#develop-from-source)).

### Storage migration and read budgets

- The SQLite migration script uses the official `node:sqlite.backup()` API on supported Node 22.19+ and Node 24+ builds, probes that capability before opening the source read-only, and includes committed WAL data in a consistent snapshot; it never copies a live database/WAL pair by hand. A build missing the API reports a migration-specific prerequisite.
- Session-tree reads validate packed rows and check their entire member count against the remaining scan budget before expanding events. Oversized rows report truncation, malformed rows report failure, and the logical budget does not eliminate physical JSON/frame parsing or validation.
- Development `@deepseek-ai/*` release-age exceptions list only exact package versions in the current lockfile (including the legacy SQLite island); all other versions retain the 24-hour delay. Regenerate with `node scripts/verify-release-age-cohort.mjs --write` after an intentional lockfile update, then review the cohort diff.

### Bounded update installation

- `/update` and `dsh-tui update` give each installer invocation (profile and engine) a **30-minute wall-clock limit**. Set `DSH_TUI_UPDATE_TIMEOUT_MS` to a positive integer in milliseconds to change it (invalid values use the default). Output activity does not reset this deadline, only the final process exit code establishes success (a printed `Done` does not), and Ctrl+C cancels the owned installer.
- On POSIX, cancellation terminates its own process group, then force-kills remaining descendants after two seconds. Windows uses a dedicated PowerShell/native supervisor with a private Job Object: the installer joins that job atomically while suspended and verified membership is required before it runs, and the supervisor retains the job handle after the root exits so cancellation and timeout also terminate orphaned descendants holding output pipes. It does not enable job breakaway or kill processes by name or an exited root PID.
- Windows requires Windows 10 / Server 2016 or later and Windows PowerShell with `Add-Type`/native interop available. Startup or job-membership failures stop the installation before running an unowned installer, and a cleanup failure is reported as unconfirmed, never as proof that all writes stopped. Timeout, cancellation or unconfirmed cleanup returns nonzero and prevents retries, stale-file removal, repair and TUI replacement; a partial installation may remain, so check and repair that profile before using the recovery command printed at update start and on failure. `~/.dsh-tui/restart.log` records installer category, PID, termination reason and last output timestamp before any restart.
- The Windows installer process ownership workflow runs the real native regression on `windows-latest` with Node 24 and no dependency installation. To run it locally on Windows: `node scripts/verify-update-process-windows.mjs`. It covers orphan descendants, timeout/cancellation, nested jobs, failure diagnostics, streams, arguments and an unrelated process; a Linux run explicitly skips native acceptance.

## Plugin Ecosystem

Plugin development: [admission & development guide](tui-profile/docs/plugin-admission-and-development.md) · [plugin-template](https://github.com/dsh-tui-ecosystem/plugin-template) · [dsh-tui-ecosystem](https://github.com/dsh-tui-ecosystem). Reference implementation: `dsh-working-activity`.

Exported plugin subcomponents are admitted using the nearest package manifest of their ESM entry, including import-only and conditional exports; they do not inherit an outer package's identity.

A backend plugin (the `tui.dsh/v1alpha1` `Backend` contribution family) is in the kernel picker after a restart: the boot scans the bundles the profile declares, admits and registers each package-root `dsh-plugin.json` declaration, and reads the implementation from the package's `backend` export — importing that module only when the backend is actually selected.
Each bundle may declare one backend, and its handler id must match the declaration. Entries awaiting authorization are neither probed nor loaded, including when explicitly requested at startup.

Seam grading and API notes: [Plugin development](docs/plugins.en.md). The organization maintains the listing only; it does not endorse community plugins.

Installing a plugin from inside the TUI: `/plugin install <package | path | git url>`. It goes through the host's profile plugin manager — a pre-install notice, a trust confirmation, cancellable progress, build-script approval and exact-version exemptions. Packages on the first-party feed this package ships (`tui-profile/feed/first-party.json`, pinned per release and decided offline) skip the trust confirmation, and only a spec that names that exact version qualifies: a bare name, a tag or a range is resolved again at install time, so it is confirmed with the person instead. What was confirmed is what gets installed — the run pins the exact `name@version` the inspection read — and a turn that is still running refuses the install (finish it, or `/new`, first). The same actions remain available from the CLI (`dsh plugin --profile dsh-tui …`). The confirmation lists the permissions the package declares; `Enter` installs **and grants** — the grant is written to `~/.dsh-tui/extension-grants.json` before the install starts, and a failed install rolls that write back. A registry package's declaration cannot be read before it lands, so a `grant` step follows a successful install: `Enter` grants, `Esc` skips (the install stays). Declared permissions this host does not know are skipped and named. On a terminal too short for a permission row, the list folds to a count or the key hint carries the count; the package identity, the notice and the keys stay visible.

A spec names one of three things:

```sh
/plugin install /path/to/repo
/plugin install https://github.com/exam/ple.git
/plugin install @scope/package@1.2.3
```

Typing `/plugin install ` lists these three shapes in the completion popup, and the same shapes follow the installed names on `/plugin info `. They are examples, never candidates: `Tab` leaves the draft exactly as it is, and `Enter` runs the line you typed — the subcommand's usage line while the spec is still empty, your own spec once it is not. No example can therefore be inserted or installed by accident, and a real path that merely starts like one is never swallowed.

During installation, `esc` attempts cancellation and keeps the pane open until the write settles; if cancellation is too late, it waits for the installation to finish. During exemption registration, it waits for the current write and stops subsequent grants and the retry. Exemptions already written remain.

Failed installs show up to six redacted log lines; lines larger than 16 KiB are omitted with a notice.

Managing what is installed: `/plugin remove <bundle>`, `/plugin enable <name | row id>` and `/plugin disable <name | row id>`. A bundle is a composition layer and a row is one patch entry, so the two are separate actions, and a bundle name is matched before any row identity. A module name shared by multiple rows requires a specific row ID. **Gate 2 refuses the three ways this app could switch itself off** — removing or disabling the bundle that provides it, the host layer `dsh-base`, or one of its own rows — and says which rule it broke, without calling the service at all; that holds whether or not hot reload is live, which is the path the host's own guard misses. `enable` is never refused by gate 2 (it is the repair action). Every enable and removal asks first; `disable` asks only about a host-layer row. The host does not attest installed package sources, so even an exact feed match requires confirmation before enabling.

These three actions have no cancellation — the service offers none — so `esc` only closes the pane while the write finishes and reports itself into the transcript. Enable and disable have no CLI verb either (the service writes them into the profile's own files). **Grants follow the lifecycle**: `enable` enables and grants the declared permissions, `disable` disables and revokes the permissions that component declared, and `remove` **deletes the component's `grants`/`denies` entries** after the removal — grants are keyed by component id, so leaving them behind lets any later package reusing that id inherit them silently; a reinstall asks again. Backend data directories, storage namespaces and the effect ledger stay, and the residue report names each source by its path. A failed grant write never blocks an install or enable — it is reported instead. Grants are behavioural constraints, not a security boundary.

`/plugin list` also advertises the experimental features DSH ships, leaves off by default, and this app knows how to drive (currently Agent Teams, Auto review, Session search and Git worktrees), each with its switch and usage line. A DSH installation that does not ship one shows no such section.

## Documentation

- **Start** — [Getting started](docs/getting-started.en.md) · [VS Code](docs/vscode.en.md)
- **Use** — [Keys and commands](docs/interaction.en.md) · [User guide](docs/user-guide.en.md) · [Themes](docs/themes.en.md)
- **Configure** — [Configuration](docs/configuration.en.md)
- **Internals** — [Architecture and limitations](docs/architecture.en.md) · [Session mounting](docs/session-mount-runtime.en.md)
- **Plugins** — [Admission and development](tui-profile/docs/plugin-admission-and-development.md) · [Seams](docs/plugins.en.md)
- **Contribute** — [Contributing](docs/contributing.en.md) · [Roadmap](docs/roadmap.en.md) · [Community](docs/community-management.en.md)

Everything, bilingual: [docs/README.md](docs/README.md).

## Community

- **Ecosystem organization**: [dsh-tui-ecosystem](https://github.com/dsh-tui-ecosystem)
  hosts community plugins, templates, and the curated list. Come ship a
  plugin, pitch an idea, or just hang out 🐋
- **Chat groups** (Chinese-language): usage questions, plugin ideas, and
  feature wishes are all welcome.
- **Code of conduct**: please read the
  [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.en.md) before taking
  part.

| WeChat group (dsh-TUI community 4) | QQ group (ID 572549239) |
| :---: | :---: |
| <img src="screenshots/wechat-group.jpg" alt="dsh-TUI community WeChat group 4 QR code" width="200"> | <img src="screenshots/qq-group.png" alt="dsh-TUI community QQ group QR code" width="200"> |

> The WeChat QR code expires roughly every 7 days; if it stops working, use
> the QQ group (572549239) or open an issue to nudge us for a refresh.

## Permissions and Security Boundary

> **Windows security warning:** the Windows profile defaults to `danger-full-access` with approval set to `never`, so tools have unrestricted access. Inspect and tighten the profile before starting next to sensitive credentials or in an untrusted repository.

No sandbox of its own: dsh-TUI uses the active DSH profile's filesystem, shell, sandbox and approval policies. Permission presets come from the DSH `permissionPresets` registry.

**Permission persistence**: the DSH `/permission` pick is kept at `~/.dsh-tui/permission.json`. Every durable preset switch teaches it (picker, typed `/permission`, Shift+Tab static modes, or a switch the official command performed on its own), and a session that never customized its permission planes starts on the remembered preset — applied through the same official switch path. "Never customized" is about the user: the composition writes its own default preset into every fresh session at creation, and those events do not count. Plan-mode transients and the experimental Auto review preset (see below) are excluded, a `DSH_PERMISSION_MODE` launch pin (this run's initial permission plane) outranks the file, and an identity the mounted roster no longer offers is skipped.

**Auto review** (DSH, experimental): `/plugin list` advertises it; after `/plugin enable @deepseek-ai/dsh-experimental-auto-review`, the `auto` preset (shown as "Auto review", tagged `EXP`) appears in `/permission` and its completions live, and disappears when the plugin is removed. It is session-only: the model reviews every tool call before it runs, there is no file sandbox, and each call costs one extra model request; its approval prompts show the localized reason, and a subagent denial reads "Auto review denied; not executed". Picking it in the picker first shows a risk confirmation (`Enter` enables, `Esc` goes back; in fullscreen its Enable / Go back rows are clickable); a typed `/permission auto` switches directly. Once the current session has selected it, the picker skips the confirmation and Shift+Tab stops skipping it.

**Session search** (DSH, experimental): `/plugin list` advertises it; after `/plugin enable @deepseek-ai/dsh-experimental-session-search`, an agent gains five read-only tools (`session_search`, `session_event_search`, `session_trace`, `session_event_trace`, `session_event_read`) over earlier sessions in the same workspace — cross-session access requires an identical `cwd`. The index is in memory and is built on the first search; nothing is written to disk. This app keeps the kernel Minimal preset at its single persistent-shell tool, so Minimal never shows these five tools or their usage guidance.

**Git worktrees** (DSH, experimental): `/plugin list` advertises it; after `/plugin enable @deepseek-ai/dsh-experimental-tool-worktree`, an agent gains `create_worktree`, which creates a new Git branch and a checkout under `.agents/worktrees/<name>` of the current repository (from `HEAD` or a local revision; uncommitted files stay in the source checkout) and moves the session into it — the status line, Git branch and `@` completion follow, while the session stays registered under its project. Its card reads `Worktree("<branch>")` with the checkout path and base revision. Nothing is cleaned up: remove the checkout with `git worktree remove <path>` and the branch separately with `git branch -D <branch>` (the agent leaves with `working_directory`; once the checkout is gone, the next request returns the session to the project). A leftover branch makes a later `create_worktree` with the same name fail. Calling it from inside a worktree nests the new checkout under that worktree. Moving does not change file permissions or already-open terminals. This app hides `create_worktree` from the kernel Minimal preset and the bundled liangshen preset: their persistent shell (liangshen's on macOS and Linux) keeps the directory it started in, so after a move it would still edit the source checkout.

**Upstream auto-retry** (DSH): whenever a session binds (boot, `/model` switch, resume), the TUI seeds a retry policy — 5 attempts, transport-drop-aware failure codes including `STREAM_CLOSED` (a dropped upstream stream) — on **the provider route that session actually uses**, through the official `llm-pi-ai` settings section (the policy the kernel's `llm-retry` plugin executes). Only routes without an explicit `retryPolicy` are seeded — dormant channels are never written — and `upstreamRetry: false` in cordis.yml opts out.

Details: [Permissions and security boundary](docs/architecture.en.md#permissions-and-security-boundary).

## Acknowledgments

- The pixel whale's 22 hand-drawn frames and its idle behaviors are ported
  from **[dsh-ui-whale](https://github.com/lhh010/dsh-ui-whale)**. The frames
  were drawn cell by cell in Excel. The idle behaviors are fin flutters, tail
  thumps, sleep Z's, and click hearts. dsh-ui-whale is the DeepSeek Harness
  web whale-pet plugin by [@lhh010](https://github.com/lhh010), BSD-3-Clause.
  Thank you for the art and the inspiration 🐋💜

## Friends' Links

Community, related projects, and companion tools built by friends:
[see the links page](docs/links.md)

## Stars

[![Star History](https://raw.githubusercontent.com/ccch1mneyyy/dsh-TUI/bot-star-history/assets/star-history/star-history.png)](https://star-history.com/#ccch1mneyyy/dsh-TUI&Date)

---

## Maintainers

<table>
  <tbody>
    <tr>
      <td align="center" width="150"><a href="https://github.com/ccch1mneyyy"><img src="https://github.com/ccch1mneyyy.png?size=160" width="96" height="96" alt="ccch1mneyyy"></a><br><a href="https://github.com/ccch1mneyyy"><b>ccch1mneyyy</b></a><br><sub>Core development &amp; maintenance</sub></td>
      <td align="center" width="150"><a href="https://github.com/CikeSeven"><img src="https://github.com/CikeSeven.png?size=160" width="96" height="96" alt="CikeSeven"></a><br><a href="https://github.com/CikeSeven"><b>CikeSeven</b></a><br><sub>Performance &amp; stability</sub></td>
      <td align="center" width="150"><a href="https://github.com/T-Auto"><img src="https://github.com/T-Auto.png?size=160" width="96" height="96" alt="T-Auto"></a><br><a href="https://github.com/T-Auto"><b>T-Auto</b></a><br><sub>Architecture &amp; ecosystem adaptation</sub></td>
      <td align="center" width="150"><a href="https://github.com/AdamPlatin123"><img src="https://github.com/AdamPlatin123.png?size=160" width="96" height="96" alt="AdamPlatin123"></a><br><a href="https://github.com/AdamPlatin123"><b>AdamPlatin123</b></a><br><sub>Security &amp; interaction</sub></td>
      <td align="center" width="150"><a href="https://github.com/Nagi-ovo"><img src="https://github.com/Nagi-ovo.png?size=160" width="96" height="96" alt="Nagi-ovo"></a><br><a href="https://github.com/Nagi-ovo"><b>Nagi-ovo</b></a><br><sub>Test infrastructure &amp; terminal rendering</sub></td>
    </tr>
  </tbody>
</table>

※ In no particular order

---

## Contributors

[![Contributors](https://contrib.rocks/image?repo=ccch1mneyyy/dsh-TUI)](https://github.com/ccch1mneyyy/dsh-TUI)

## License

[MIT](LICENSE)
