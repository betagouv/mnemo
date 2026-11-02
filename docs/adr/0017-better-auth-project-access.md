# 0017 - Comptes Better Auth et droits par dossier

Statut : proposed

## Contexte

Mnemo doit identifier chaque personne et autoriser séparément la lecture, la modification des fichiers et les actions BCF. La V1 n'a pas de service d'envoi d'e-mails. Le produit est encore en développement : aucun mode de connexion historique ne doit être maintenu.

## Décision

- Better Auth gère uniquement les comptes e-mail/mot de passe et les sessions, avec ses tables dans PostgreSQL. L'inscription est publique. Pas de compte de développement partagé, de Basic Auth applicatif ni de ProConnect en V1.
- `project_members` reste la source de vérité de l'accès aux dossiers. Le propriétaire peut ajouter un compte **déjà inscrit** par e-mail, lui donner un rôle de base (lecture ou édition), puis lui attribuer des rôles personnalisés et des droits individuels cumulables.
- Les types de permissions sont déclarés dans le code et contrôlés par les services serveur. Créer un rôle dans l'interface ne crée pas une permission technique nouvelle.
- Les migrations d'authentification et de droits sont séparées. Aucune migration de transfert du compte de développement n'est conservée.

## Conséquences

- Les actions serveur et les routes de données vérifient la session et le droit requis ; masquer un bouton n'est pas une protection suffisante.
- Sans vérification d'e-mail, l'adresse d'un compte ne prouve pas que son titulaire contrôle cette boîte. Le propriétaire doit confirmer l'identité du compte avant de lui accorder l'accès. L'ajout par lien ou par e-mail vérifié nécessitera un futur choix de produit et un système d'envoi.
- Il n'y a pas de récupération automatique du mot de passe en V1. Une procédure d'assistance devra être définie avant l'ouverture à des données sensibles.
