# 0017 - Comptes Better Auth et droits par dossier

Statut : proposed

## Contexte

Mnemo doit identifier chaque personne et autoriser séparément la lecture, la modification des fichiers et les actions BCF. Brevo est disponible pour les e-mails transactionnels. Le produit est encore en développement : aucun mode de connexion historique ne doit être maintenu.

## Décision

- Better Auth gère uniquement les comptes e-mail/mot de passe et les sessions, avec ses tables dans PostgreSQL. L'inscription est publique. Pas de compte de développement partagé, de Basic Auth applicatif ni de ProConnect en V1.
- Better Auth exige la confirmation de l'adresse e-mail avant toute connexion et gère les liens temporaires de vérification et de réinitialisation du mot de passe. Les e-mails partent par l'API transactionnelle Brevo avec une clé serveur. Aucune clé n'est exposée au client.
- `project_members` reste la source de vérité de l'accès aux dossiers. Le propriétaire peut ajouter un compte **déjà inscrit** par e-mail, lui donner un rôle de base (lecture ou édition), puis lui attribuer des rôles personnalisés et des droits individuels cumulables.
- Les types de permissions sont déclarés dans le code et contrôlés par les services serveur. Créer un rôle dans l'interface ne crée pas une permission technique nouvelle.
- Les migrations d'authentification et de droits sont séparées. Aucune migration de transfert du compte de développement n'est conservée.

## Conséquences

- Les actions serveur et les routes de données vérifient la session et le droit requis ; masquer un bouton n'est pas une protection suffisante.
- Un compte non vérifié ne peut ni ouvrir une session exploitable ni devenir membre d'un dossier. Les anciens cookies de session non vérifiés restent refusés par le résolveur d'acteur.
- La récupération du mot de passe utilise un lien temporaire à usage unique ; elle invalide les sessions existantes. La demande répond de la même manière que l'adresse soit connue ou non.
