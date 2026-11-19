# packages/ts/activity — CI Makefile
# Thin wrapper over the package's npm scripts for local + CI parity.
# `make ci` is the single command CI runs per package.

SHELL          := /bin/bash
.SHELLFLAGS    := -eu -o pipefail -c
.DEFAULT_GOAL  := help

.PHONY: help install ci-install typecheck lint test build clean distclean ci \
        compose-up compose-down compose-logs workbench

# Workbench (atomic-design organism) dev harness — see ./workbench/GitHubActivityWorkbench.
COMPOSE        ?= docker compose
WORKBENCH_PORT ?= 5217

help: ## Show available targets
	@awk 'BEGIN{FS=":.*##"; printf "\nTargets (activity):\n"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install workspace deps (hoisted at the ts/ root)
	@cd .. && npm install

ci-install: ## Frozen-lockfile workspace install, skipped when the ts/ root is already installed
	@if [ -d ../node_modules ]; then echo "workspace already installed (../node_modules) — skipping npm ci"; else cd .. && npm ci; fi

typecheck: ## Type-check without emit (strict)
	@npm run typecheck

lint: ## Static checks (eslint)
	@npm run lint

test: ## Run the Vitest suite
	@npm run test

build: ## Dual ESM+CJS build into ./dist/
	@npm run build

clean: ## Remove generated artifacts
	@rm -rf dist *.tsbuildinfo

distclean: clean ## Also remove node_modules
	@rm -rf node_modules

ci: ci-install lint typecheck test build ## Full CI pipeline

# ----- Workbench / docker-compose ----------------------------------------------
compose-up: ## Start the GitHubActivityWorkbench dev harness (docker compose)
	@$(COMPOSE) up -d --build
	@echo "workbench: http://localhost:$(WORKBENCH_PORT)"

compose-down: ## Stop the workbench compose stack
	@$(COMPOSE) down

compose-logs: ## Tail the workbench container logs
	@$(COMPOSE) logs -f workbench

workbench: ## Run the workbench dev server directly (no Docker)
	@$(MAKE) -C workbench/GitHubActivityWorkbench up
