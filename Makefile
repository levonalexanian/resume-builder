COMPOSE ?= docker compose
DEV     := $(COMPOSE) run --rm -T dev
DEV_TTY := $(COMPOSE) run --rm dev

.PHONY: help image-build install typecheck test web sh down clean

help:
	@echo "Resume builder — host-side targets (all run inside the dev container)."
	@echo ""
	@echo "Setup:"
	@echo "  make image-build  Build the dev image from .devcontainer/Dockerfile"
	@echo "  make install      npm install in backend/ and frontend/"
	@echo ""
	@echo "Develop:"
	@echo "  make typecheck    tsc --noEmit on backend and frontend"
	@echo "  make test         vitest run (backend)"
	@echo "  make web          Build the frontend and serve the web app on :3001"
	@echo "  make sh           Interactive shell in the dev container"
	@echo ""
	@echo "Teardown:"
	@echo "  make down         Stop+remove any compose containers"
	@echo "  make clean        down + remove the local image"

image-build:
	$(COMPOSE) build dev

install:
	$(DEV) bash -c 'cd backend && npm install && cd ../frontend && npm install'

typecheck:
	$(DEV) bash -c 'cd backend && npm run typecheck && cd ../frontend && npm run typecheck'

test:
	$(DEV) bash -c 'cd backend && npm test'

web:
	$(DEV_TTY) bash -c 'cd frontend && npm run build && cd /home/vscode/workspace/backend && npm run web:serve'

sh:
	$(DEV_TTY) bash

down:
	$(COMPOSE) down --remove-orphans

clean:
	$(COMPOSE) down --rmi local --remove-orphans
