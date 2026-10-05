COMPOSE ?= docker compose

.DEFAULT_GOAL := help

.PHONY: help start start-detached stop down restart logs status config architecture architecture-validate

help: ## Afficher les commandes disponibles
	@awk 'BEGIN {FS = ":.*## "; printf "Commandes Mnemo :\n\n"} /^[a-zA-Z_-]+:.*## / {printf "  %-16s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

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
