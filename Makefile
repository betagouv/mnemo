COMPOSE ?= docker compose
ENV_FILE ?= .env.local
PLAYWRIGHT_BASE_URL ?= http://localhost:3200
COMPOSE_WITH_ENV = node scripts/with-env-profile.mjs "$(ENV_FILE)" $(COMPOSE) --env-file "$(ENV_FILE)"
MNEMO_DEV_MODEL_DIR := $(CURDIR)/.data/ifc-mcp-models
MNEMO_DEV_UID := $(shell id -u)
MNEMO_DEV_GID := $(shell id -g)

.DEFAULT_GOAL := help

.PHONY: help dev dev-s3 test-e2e start start-detached stop down restart logs status config architecture architecture-validate

help: ## Afficher les commandes disponibles
	@awk 'BEGIN {FS = ":.*## "; printf "Commandes Mnemo :\n\n"} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-16s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

dev: ## Lancer Next.js avec hot reload et les services annexes dans Docker
	@test -f "$(ENV_FILE)" || { echo "Profil absent : $(ENV_FILE) (copiez le fichier .example correspondant)"; exit 1; }
	mkdir -p "$(MNEMO_DEV_MODEL_DIR)"
	MNEMO_DEV_MODEL_DIR="$(MNEMO_DEV_MODEL_DIR)" MNEMO_DEV_UID="$(MNEMO_DEV_UID)" MNEMO_DEV_GID="$(MNEMO_DEV_GID)" $(COMPOSE_WITH_ENV) -f docker-compose.yml -f docker-compose.dev.yml up --detach postgres minio create-bucket ifc-lite-server ifc-mcp
	$(COMPOSE_WITH_ENV) build processing-worker
	$(COMPOSE_WITH_ENV) stop web
	MNEMO_ENV_FILE="$(ENV_FILE)" MNEMO_DEV_MODEL_DIR="$(MNEMO_DEV_MODEL_DIR)" node scripts/with-env-profile.mjs "$(ENV_FILE)" node scripts/dev-web.mjs

dev-s3: ## Lancer le développement avec le profil S3 externe
	$(MAKE) dev ENV_FILE=.env.s3

test-e2e: ## Lancer les tests navigateur visibles contre make dev
	PLAYWRIGHT_BASE_URL="$(PLAYWRIGHT_BASE_URL)" node scripts/with-env-profile.mjs "$(ENV_FILE)" pnpm --filter @mnemo/web exec playwright test --headed --workers=1

start: ## Construire et lancer le projet au premier plan
	$(COMPOSE_WITH_ENV) up --build

start-detached: ## Construire et lancer le projet en arrière-plan
	$(COMPOSE_WITH_ENV) up --build --detach

stop: ## Arrêter les services sans supprimer les conteneurs
	$(COMPOSE_WITH_ENV) stop

down: ## Arrêter et supprimer les conteneurs et le réseau, en conservant les volumes
	$(COMPOSE_WITH_ENV) down

restart: ## Redémarrer les services existants
	$(COMPOSE_WITH_ENV) restart

logs: ## Suivre les logs de tous les services
	$(COMPOSE_WITH_ENV) logs --follow

status: ## Afficher l'état des services
	$(COMPOSE_WITH_ENV) ps --all

config: ## Valider la configuration Docker Compose
	$(COMPOSE_WITH_ENV) config --quiet

architecture: ## Afficher l’architecture LikeC4 sur http://localhost:3202
	$(COMPOSE_WITH_ENV) --profile docs up --detach --force-recreate architecture

architecture-validate: ## Valider le modèle LikeC4
	$(COMPOSE_WITH_ENV) --profile docs run --rm --no-deps --entrypoint likec4 architecture validate
