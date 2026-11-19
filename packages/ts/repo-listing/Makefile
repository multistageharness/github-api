# packages/ts/repo-listing — CI + dev-server Makefile
# Standard targets are a thin wrapper over the package's npm scripts for local +
# CI parity (`make ci` is the single command CI runs per package); the dev-server
# targets run the Vite harness in dev/ in the background.

SHELL          := /bin/bash
.SHELLFLAGS    := -eu -o pipefail -c
.DEFAULT_GOAL  := help

PORT     ?= 5200
PID_FILE := .dev.pid
LOG_FILE := .dev.log

.PHONY: help install ci-install typecheck lint test build clean distclean ci \
        dev watch stop status logs up down

help: ## Show available targets
	@awk 'BEGIN{FS=":.*##"; printf "\nTargets (repo-listing):\n"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ---- standard workspace targets -------------------------------------------

install: ## Install workspace deps (hoisted at the ts/ root)
	@cd .. && npm install

ci-install: ## Frozen-lockfile workspace install, skipped when the ts/ root is already installed
	@if [ -d ../node_modules ]; then echo "workspace already installed (../node_modules) — skipping npm ci"; else cd .. && npm ci; fi

typecheck: ## Type-check without emit (strict)
	@npm run typecheck

lint: ## Static checks (eslint, .ts + .tsx)
	@npm run lint

test: ## Run the Vitest suite (jsdom)
	@npm run test

build: ## Dual ESM+CJS library build into ./dist/ (+ dist/style.css)
	@npm run build

clean: stop ## Remove generated artifacts and dev-server logs
	@rm -rf dist dev/dist .vite *.tsbuildinfo $(LOG_FILE) $(PID_FILE)

distclean: clean ## Also remove node_modules
	@rm -rf node_modules

ci: ci-install lint typecheck test build ## Full CI pipeline

# ---- dev server (Vite harness in dev/) -------------------------------------

dev: stop ## Start the vite dev server in the background
	@echo "starting vite on port $(PORT)..."
	@npm run dev > $(LOG_FILE) 2>&1 & echo $$! > $(PID_FILE)
	@sleep 1
	@echo "pid=$$(cat $(PID_FILE)) log=$(LOG_FILE)"
	@echo "host: http://localhost:$(PORT)"

watch: ## Start the vite dev server in the foreground
	@npm run dev

stop: ## Stop the dev server (PID file > lsof > pkill)
	@if [ -f $(PID_FILE) ]; then \
	  pid=$$(cat $(PID_FILE)); \
	  kill $$pid 2>/dev/null || true; \
	  rm -f $(PID_FILE); \
	fi
	@pid=$$(lsof -ti tcp:$(PORT) 2>/dev/null || true); \
	if [ -n "$$pid" ]; then kill $$pid 2>/dev/null || true; fi
	@pkill -f "vite.*$(PORT)" 2>/dev/null || true
	@true

status: ## Show whether the dev server is running
	@if [ -f $(PID_FILE) ] && kill -0 $$(cat $(PID_FILE)) 2>/dev/null; then \
	  echo "running pid=$$(cat $(PID_FILE)) port=$(PORT)"; \
	else \
	  echo "stopped"; \
	fi

logs: ## Tail the dev server log
	@tail -f $(LOG_FILE)

up: install dev ## Install + start (docker-compose-style)
	@echo "up: http://localhost:$(PORT)"

down: stop ## Stop (docker-compose-style)
	@echo "down."
