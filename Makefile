# Common developer commands for dsh-TUI. Thin wrappers over the pnpm scripts in
# package.json — see docs/getting-started.md («从源码开发») and docs/contributing.md.
#
#   make install          build this checkout and install it into the local dsh
#                         profile (`dsh plugin --profile dsh-tui add <tarball>`)
#                         and (re)install the global dsh-tui / dst launcher from the
#                         same tarball (through the npm/pnpm that owns the one on
#                         PATH); a missing dsh is installed first (make install-dsh)
#   make install DSH_HOME=/path/to/home   install into another DSH home
#   make uninstall        remove the profile plugin and the global launcher
#                         (dsh itself stays; make uninstall-dsh removes it)
#
# The repository has no root `test` or `lint` script; `make check` runs the
# TypeScript build plus the build gates, `make ci GROUP=<name>` a CI group.

SHELL := /bin/sh
.DEFAULT_GOAL := help

PNPM        ?= pnpm
NPM         ?= npm
DSH         ?= dsh
DSH_PROFILE ?= dsh-tui
PKG_NAME    := @deepseek-harness-tui/dsh-tui
PACK_DIR    ?= .tmp/pack
GROUP       ?= channel-ui
JOBS        ?= 6
# The DSH line this checkout is validated against (src/dsh-adapter/contract.ts).
DSH_VERSION ?= $(shell sed -n "s/^export const UPSTREAM_VALIDATED_VERSION = '\(.*\)'$$/\1/p" src/dsh-adapter/contract.ts)

.PHONY: help setup submodule submodule-init submodule-sync build check typecheck smoke package pack require-dsh \
	ensure-dsh install-dsh install install-launcher uninstall uninstall-dsh dev dev-config ci guide clean

help: ## List the targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  \033[36m%-17s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: submodule ## Put vendor/dsh-std on main (make submodule) and install dependencies
	$(PNPM) install

# ===== submodule =====
# Ported from innerloan's `make submodule`. vendor/dsh-std declares `branch = main` in
# .gitmodules; `make submodule` keeps it on that branch and fast-forwards it to origin.
# A bare `git submodule update --init` is avoided on purpose: it forces every submodule to
# the recorded commit on a detached HEAD, which silently drops the files of commits made
# inside the submodule. Here it is fetch + `merge --ff-only`, so git refuses anything that
# could overwrite work (unpushed commits, dirty tree, diverged history) and it stays as is.
#
# Only a detached HEAD is switched (to the declared branch, tracking origin/<branch> if no
# local one exists). If you are on a named branch, that branch wins: it is fast-forwarded
# instead, and .gitmodules' branch= is rewritten to it — after the fetch succeeded, so only
# a branch that exists on origin gets written. The edit stays in the working tree.
# A detached HEAD whose commit is on no ref is not switched (only the reflog would find it).
# Moving the submodule changes the commit this repo records; `git add vendor/dsh-std` if
# you want to keep it, and re-run `pnpm install` when its packages changed.
#
# Each line is "<name> <path> <branch>"; name is the .gitmodules key, not always the path.
# Use a real branch name for branch=, not git's special `.` (follow the superproject's
# branch): the write-back above would overwrite it on every run.
TRACKED_SUBMODULES = git config -f .gitmodules --get-regexp '^submodule\..*\.branch$$' \
	| sed 's/^submodule\.\(.*\)\.branch \(.*\)$$/\1 \2/' \
	| while read -r n b; do echo "$$n $$(git config -f .gitmodules --get submodule.$$n.path) $$b"; done

# Clones only what is missing (at the recorded commit); never moves an existing checkout.
submodule-init:
	@missing=$$(git submodule status | awk '/^-/ {print $$2}'); \
	 if [ -n "$$missing" ]; then \
	   echo "[submodule] cloning missing: $$missing"; \
	   git submodule update --init --recursive -- $$missing; \
	 fi

submodule: submodule-init ## Keep submodules on their .gitmodules branch (main) and fast-forward to origin (never discards work)
	@# Read the whole list first: the loop may rewrite .gitmodules, which TRACKED_SUBMODULES reads.
	@list=$$($(TRACKED_SUBMODULES)); \
	 echo "$$list" | while read -r n p b; do \
	   [ -n "$$p" ] || continue; \
	   printf "[submodule] %-16s " "$$p"; \
	   cur=$$(git -C "$$p" symbolic-ref -q --short HEAD || true); \
	   if [ -n "$$cur" ]; then t="$$cur"; else t="$$b"; fi; \
	   git -C "$$p" fetch -q origin "$$t" 2>/dev/null || { echo "fetch origin/$$t failed (no such remote branch / network / auth?); skipped"; continue; }; \
	   if [ -n "$$cur" ] && [ "$$cur" != "$$b" ]; then \
	     git config -f .gitmodules submodule."$$n".branch "$$cur" || { echo "on $$cur, but rewriting .gitmodules failed; skipped"; continue; }; \
	     printf "on %s, not switched; .gitmodules branch %s -> %s: " "$$cur" "$$b" "$$cur"; \
	   fi; \
	   if [ -z "$$cur" ]; then \
	     if [ -z "$$(git -C "$$p" for-each-ref --contains HEAD --count=1 --format='%(refname)' refs/heads refs/remotes)" ]; then \
	       echo "detached HEAD $$(git -C "$$p" rev-parse --short=8 HEAD) is on no branch (only the reflog would find it); left alone"; continue; \
	     fi; \
	     printf "detached HEAD, switching to %s: " "$$b"; \
	     if git -C "$$p" rev-parse -q --verify "refs/heads/$$b" >/dev/null; then \
	       git -C "$$p" checkout -q "$$b" 2>/dev/null || { echo "cannot switch (local changes would be overwritten); left as is"; continue; }; \
	     else \
	       git -C "$$p" checkout -q -b "$$b" --track "origin/$$b" 2>/dev/null || { echo "cannot switch (local changes would be overwritten / no origin/$$b); left as is"; continue; }; \
	     fi; \
	   fi; \
	   before=$$(git -C "$$p" rev-parse HEAD); \
	   if git -C "$$p" merge --ff-only -q FETCH_HEAD 2>/dev/null; then \
	     after=$$(git -C "$$p" rev-parse HEAD); \
	     if [ "$$before" != "$$after" ]; then \
	       echo "fast-forwarded $$(git -C "$$p" rev-parse --short=8 $$before) -> $$(git -C "$$p" rev-parse --short=8 $$after)"; \
	     else \
	       ahead=$$(git -C "$$p" rev-list --count FETCH_HEAD..HEAD 2>/dev/null || echo 0); \
	       if [ "$$ahead" -gt 0 ]; then echo "up to date, $$ahead local commit(s) not pushed to origin/$$t"; \
	       else echo "at origin/$$t"; fi; \
	     fi; \
	   else \
	     ahead=$$(git -C "$$p" rev-list --count FETCH_HEAD..HEAD 2>/dev/null || echo '?'); \
	     echo "cannot fast-forward ($$ahead local commit(s) or a dirty tree); left as is"; \
	   fi; \
	 done
	@# A leading + means the checkout differs from the recorded pointer; reported, not changed.
	@git submodule status | awk '/^\+/ {print "[submodule] " $$2 " differs from the recorded commit; git add " $$2 " to record it"}'

submodule-sync: ## Force submodules to the recorded commit (detaches, overwrites local changes)
	git submodule update --init --recursive --force

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

install: ensure-dsh pack ## Install dsh if missing, then build, pack and (re)install this checkout into the dsh profile and as the global dsh-tui launcher
	@set -e; tarball=$$(ls $(PACK_DIR)/*.tgz); \
		echo "Installing $$tarball into profile '$(DSH_PROFILE)' ($${DSH_HOME:-~/.dsh})"; \
		$(DSH) plugin --profile $(DSH_PROFILE) add "$$PWD/$$tarball"; \
		NPM="$(NPM)" PNPM="$(PNPM)" sh scripts/global-launcher.sh install "$$PWD/$$tarball"
	@echo "Done. Start it with: dsh-tui  (or $(DSH) --profile $(DSH_PROFILE))"

install-launcher: pack ## Reinstall only the global dsh-tui / dst launcher from the same tarball
	@set -e; tarball=$$(ls $(PACK_DIR)/*.tgz); NPM="$(NPM)" PNPM="$(PNPM)" sh scripts/global-launcher.sh install "$$PWD/$$tarball"

# Undoes `make install` and `make install-launcher`; each step is skipped when there is
# nothing to remove. DeepSeek Harness itself (make uninstall-dsh) and the user data under
# ~/.dsh-tui are kept.
uninstall: ## Remove the TUI plugin from the dsh profile and the global dsh-tui / dst launcher
	@# Same path the launcher reads (bin/dsh-tui.js profilePkgDir); dsh's own remove
	@# fails loudly (ERR_PNPM_CANNOT_REMOVE_MISSING_DEPS) on a profile without it.
	@home="$${DSH_HOME:-$$HOME/.dsh}"; \
	if [ ! -f "$$home/profiles/$(DSH_PROFILE)/node_modules/$(PKG_NAME)/package.json" ]; then \
		echo "$(PKG_NAME) is not installed in profile '$(DSH_PROFILE)' ($$home); nothing to remove"; \
	elif ! command -v $(DSH) >/dev/null 2>&1; then \
		echo "make: '$(DSH)' not found; cannot remove the plugin from profile '$(DSH_PROFILE)'" >&2; exit 1; \
	else \
		echo "Removing $(PKG_NAME) from profile '$(DSH_PROFILE)' ($$home)"; \
		$(DSH) plugin --profile $(DSH_PROFILE) remove $(PKG_NAME); \
	fi
	@NPM="$(NPM)" PNPM="$(PNPM)" sh scripts/global-launcher.sh remove

uninstall-dsh: ## Uninstall the global DeepSeek Harness (npm uninstall -g @deepseek-ai/dsh)
	$(NPM) uninstall -g @deepseek-ai/dsh

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
