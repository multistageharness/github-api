# packages/ts — root CI aggregator
# Thin composition over the workspace npm scripts + the smoke gate.
# CI runs `make ci` then `make smoke`.

SHELL          := /bin/bash
.SHELLFLAGS    := -eu -o pipefail -c
.DEFAULT_GOAL  := help

# Public registry default, overridable; never assume a private mirror.
NPM_CONFIG_REGISTRY ?= https://registry.npmjs.org
export NPM_CONFIG_REGISTRY

.PHONY: help install ci-install typecheck lint test build clean ci smoke smoke-json

help: ## Show available targets
	@awk 'BEGIN{FS=":.*##"; printf "\nTargets (packages/ts):\n"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install all workspaces
	@npm install

ci-install: ## Deterministic install for CI (frozen lockfile; drift fails loudly)
	@npm ci

typecheck: ## Type-check every package (strict, no emit)
	@npm run typecheck

lint: ## Lint every package (eslint)
	@npm run lint

test: ## Run every package's Vitest suite
	@npm run test

build: ## Build every package (dual ESM+CJS)
	@npm run build

clean: ## Remove dist/ + tsbuildinfo across packages
	@npm run --workspaces --if-present clean || true
	@find . -maxdepth 2 -name dist -type d -prune -exec rm -rf {} + 2>/dev/null || true

ci: ci-install lint typecheck test build ## Full CI pipeline (install → lint → typecheck → test → build)

smoke: ## Network-free per-package import + bin --help gate
	@node scripts/smoke.mjs

smoke-json: ## Machine-readable smoke output
	@node scripts/smoke.mjs --json
