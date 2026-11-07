# Common developer commands for dsh-TUI. Thin wrappers over the pnpm scripts in
# package.json — see docs/getting-started.md («从源码开发») and docs/contributing.md.
#
#   make install          build this checkout and install it into the local dsh
#                         profile (`dsh plugin --profile dsh-tui add <tarball>`);
#                         a missing dsh is installed first (make install-dsh)
#   make install DSH_HOME=/path/to/home   install into another DSH home
#
# The repository has no root `test` or `lint` script; `make check` runs the
# TypeScript build plus the build gates, `make ci GROUP=<name>` a CI group.

SHELL := /bin/sh
.DEFAULT_GOAL := help

PNPM        ?= pnpm
NPM         ?= npm
DSH         ?= dsh
DSH_PROFILE ?= dsh-tui
PACK_DIR    ?= .tmp/pack
GROUP       ?= channel-ui
JOBS        ?= 6
# The DSH line this checkout is validated against (src/dsh-adapter/contract.ts).
DSH_VERSION ?= $(shell sed -n "s/^export const UPSTREAM_VALIDATED_VERSION = '\(.*\)'$$/\1/p" src/dsh-adapter/contract.ts)

.PHONY: help setup build check typecheck smoke package pack require-dsh ensure-dsh install-dsh \
	install install-launcher uninstall dev dev-config ci guide clean

help: ## List the targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  \033[36m%-17s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: ## Init the vendor/dsh-std submodule and install dependencies (frozen lockfile)
	git submodule update --init --recursive
	$(PNPM) install --frozen-lockfile

build: ## Clean compile src/ -> lib/types/ (no gates)
	$(PNPM) compile

check: ## Compile plus every build gate (pnpm build)
	$(PNPM) build

typecheck: ## Type-check without emitting
	$(PNPM) typecheck

smoke: ## Headless screen-assembly smoke (needs a build)
	$(PNPM) smoke

package: ## Verify the npm tarball surface and entry imports
	$(PNPM) verify:package

pack: build ## Build and pack the current checkout into $(PACK_DIR)
	rm -rf $(PACK_DIR)
	mkdir -p $(PACK_DIR)
	$(NPM) pack --ignore-scripts --pack-destination $(PACK_DIR)

require-dsh:
	@command -v $(DSH) >/dev/null 2>&1 || { \
		echo "make: '$(DSH)' not found; install DeepSeek Harness first: make install-dsh" >&2; exit 1; }

install-dsh: ## Install DeepSeek Harness globally at the validated version (npm install -g @deepseek-ai/dsh@$(DSH_VERSION))
	@test -n "$(DSH_VERSION)" || { echo "make: cannot read UPSTREAM_VALIDATED_VERSION from src/dsh-adapter/contract.ts" >&2; exit 1; }
	$(NPM) install -g @deepseek-ai/dsh@$(DSH_VERSION)

ensure-dsh:
	@command -v $(DSH) >/dev/null 2>&1 || { \
		echo "make: '$(DSH)' not found; installing @deepseek-ai/dsh@$(DSH_VERSION)"; \
		$(MAKE) --no-print-directory install-dsh; \
		command -v $(DSH) >/dev/null 2>&1 || { echo "make: '$(DSH)' still not on PATH after install; check npm's global bin directory" >&2; exit 1; }; }

install: ensure-dsh pack ## Install dsh if missing, then build, pack and install this checkout into the local dsh profile
	@set -e; tarball=$$(ls $(PACK_DIR)/*.tgz); \
		echo "Installing $$tarball into profile '$(DSH_PROFILE)' ($${DSH_HOME:-~/.dsh})"; \
		$(DSH) plugin --profile $(DSH_PROFILE) add "$$PWD/$$tarball"
	@echo "Done. Start it with: $(DSH) --profile $(DSH_PROFILE)  (or dsh-tui, see make install-launcher)"

install-launcher: pack ## Also install the dsh-tui / dst launcher globally from the same tarball
	@set -e; tarball=$$(ls $(PACK_DIR)/*.tgz); $(NPM) install -g "$$PWD/$$tarball"

uninstall: require-dsh ## Remove the TUI plugin from the local dsh profile
	$(DSH) plugin --profile $(DSH_PROFILE) remove @deepseek-harness-tui/dsh-tui

dev: ## Build, pack, install in an isolated home and launch (pnpm dev)
	$(PNPM) dev

dev-config: ## Copy model/key config into the isolated dev home (pnpm dev:copy-config)
	$(PNPM) dev:copy-config

ci: ## Run one CI regression group: make ci GROUP=render-scroll [JOBS=6]
	node scripts/run-ci-group.mjs $(GROUP) --jobs $(JOBS)

guide: ## Sync docs/ into guide/dsh-tui-guide/ and verify
	node scripts/build-guide.mjs
	node scripts/verify-guide.mjs

clean: ## Remove generated lib/ and packed tarballs
	$(PNPM) clean
	rm -rf $(PACK_DIR)
