COMPOSE ?= docker compose
DEV     := $(COMPOSE) run --rm -T dev
DEV_TTY := $(COMPOSE) run --rm dev
ORCH    := backend

ARGS ?=
TEX  ?=
PDF  ?=

.PHONY: help image-build install build typecheck test run pdf sh down clean frontend-build web

help:
	@echo "Resume builder — host-side targets (all run inside the dev container)."
	@echo ""
	@echo "Setup:"
	@echo "  make image-build    Build the dev image from .devcontainer/Dockerfile"
	@echo "  make install        npm install in $(ORCH)"
	@echo ""
	@echo "Develop:"
	@echo "  make build          Bundle the backend (tsup) into $(ORCH)/dist"
	@echo "  make typecheck      tsc --noEmit on the backend"
	@echo "  make test           vitest run"
	@echo "  make frontend-build npm install + vite build for the React frontend"
	@echo ""
	@echo "Use:"
	@echo "  make run ARGS='run --job path/to/job.md'"
	@echo "                      Invoke the backend CLI"
	@echo "  make pdf TEX=path/to/resume.tex [PDF=path/to/out.pdf]"
	@echo "                      Compile a .tex to .pdf via scripts/latex_to_pdf"
	@echo "  make web            Build the frontend and serve the web app on :3001"
	@echo "  make sh             Interactive shell in the dev container"
	@echo ""
	@echo "Teardown:"
	@echo "  make down           Stop+remove any compose containers"
	@echo "  make clean          down + remove the local image"

image-build:
	$(COMPOSE) build dev

install:
	$(DEV) bash -c 'cd $(ORCH) && npm install'

build:
	$(DEV) bash -c 'cd $(ORCH) && npm run build'

typecheck:
	$(DEV) bash -c 'cd $(ORCH) && npm run typecheck'

test:
	$(DEV) bash -c 'cd $(ORCH) && npm test'

run:
	@if [ -z "$(ARGS)" ]; then echo "Usage: make run ARGS='<cli args>'"; exit 2; fi
	$(DEV) bash -c 'node $(ORCH)/dist/cli.js $(ARGS)'

pdf:
	@if [ -z "$(TEX)" ]; then echo "Usage: make pdf TEX=<input.tex> [PDF=<output.pdf>]"; exit 2; fi
	$(DEV) bash -c './scripts/latex_to_pdf $(TEX) $(PDF)'

frontend-build:
	$(DEV) bash -c 'cd frontend && npm install && npm run build'

web:
	$(DEV_TTY) bash -c 'cd frontend && npm install && npm run build && cd /home/vscode/workspace/$(ORCH) && npm run web:serve'

sh:
	$(DEV_TTY) bash

down:
	$(COMPOSE) down --remove-orphans

clean:
	$(COMPOSE) down --rmi local --remove-orphans
