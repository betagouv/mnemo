COMPOSE ?= docker compose
MNEMO_DEV_MODEL_DIR := $(CURDIR)/.data/ifc-mcp-models
MNEMO_DEV_UID := $(shell id -u)
MNEMO_DEV_GID := $(shell id -g)

.DEFAULT_GOAL := help

.PHONY: help dev start start-detached stop down restart logs status config architecture architecture-validate

help: ## Afficher les commandes disponibles
	@awk 'BEGIN {FS = ":.*## "; printf "Commandes Mnemo :\n\n"} /^[a-zA-Z_-]+:.*## / {printf "  %-16s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

dev: ## Lancer Next.js avec hot reload et les services annexes dans Docker
	mkdir -p "$(MNEMO_DEV_MODEL_DIR)"
	MNEMO_DEV_MODEL_DIR="$(MNEMO_DEV_MODEL_DIR)" MNEMO_DEV_UID="$(MNEMO_DEV_UID)" MNEMO_DEV_GID="$(MNEMO_DEV_GID)" $(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml up --detach postgres minio create-bucket database-migrate ifc-lite-server ifc-mcp processing-worker
	$(COMPOSE) stop web
	MNEMO_DEV_MODEL_DIR="$(MNEMO_DEV_MODEL_DIR)" node --env-file-if-exists=.env scripts/dev-web.mjs

start: ## Construire et lancer le projet au premier plan
	$(COMPOSE) up --build

start-detached: ## Construire et lancer le projet en arrière-plan
	$(COMPOSE) up --build --detach

stop: ## Arrêter les services sans supprimer les conteneurs
	$(COMPOSE) stop

down: ## Arrêter et supprimer les conteneurs et le réseau, en conservant les volumes
	$(COMPOSE) down

restart: ## Redémarrer les services existants
	$(COMPOSE) restart

logs: ## Suivre les logs de tous les services
	$(COMPOSE) logs --follow

status: ## Afficher l'état des services
	$(COMPOSE) ps --all

config: ## Valider la configuration Docker Compose
	$(COMPOSE) config --quiet

architecture: ## Afficher l’architecture LikeC4 sur http://localhost:3202
	$(COMPOSE) --profile docs up --detach --force-recreate architecture

architecture-validate: ## Valider le modèle LikeC4
	$(COMPOSE) --profile docs run --rm --no-deps --entrypoint likec4 architecture validate
