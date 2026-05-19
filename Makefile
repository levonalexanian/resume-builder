COMPOSE ?= docker compose
DEV     := $(COMPOSE) run --rm -T dev
DEV_TTY := $(COMPOSE) run --rm --service-ports dev

.PHONY: help image-build install typecheck test web sh down clean

help:
	@echo "Resume builder — host-side targets (all run inside the dev container)."
	@echo ""
	@echo "Setup:"
	@echo "  make image-build  Build the dev image from .devcontainer/Dockerfile"
	@echo "  make install      uv sync in backend/ and npm install in frontend/"
	@echo ""
	@echo "Develop:"
	@echo "  make typecheck    tsc --noEmit on the frontend"
	@echo "  make test         pytest (backend)"
	@echo "  make web          Build the frontend and serve the web app on :3001"
	@echo "  make sh           Interactive shell in the dev container"
	@echo ""
	@echo "Teardown:"
	@echo "  make down         Stop+remove any compose containers"
	@echo "  make clean        down + remove the local image"

image-build:
	$(COMPOSE) build dev

install:
	$(DEV) bash -c 'cd backend && uv sync --extra dev && cd ../frontend && npm install'

typecheck:
	$(DEV) bash -c 'cd frontend && npm run typecheck'

test:
	$(DEV) bash -c 'cd backend && uv run pytest'

web:
	$(DEV_TTY) bash -c 'cd frontend && npm run build && cd /home/vscode/workspace/backend && uv run resume-web'

sh:
	$(DEV_TTY) bash

down:
	$(COMPOSE) down --remove-orphans

clean:
	$(COMPOSE) down --rmi local --remove-orphans
