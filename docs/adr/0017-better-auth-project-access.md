# 0017 - Comptes Better Auth et droits par dossier

Statut : proposed

## Contexte

Mnemo doit identifier chaque personne et autoriser séparément la lecture, la modification des fichiers et les actions BCF. Brevo est disponible pour les e-mails transactionnels. Le produit est encore en développement : aucun mode de connexion historique ne doit être maintenu.

## Décision

- Better Auth gère uniquement les comptes e-mail/mot de passe et les sessions, avec ses tables dans PostgreSQL. L'inscription est publique. Pas de compte de développement partagé, de Basic Auth applicatif ni de ProConnect en V1.
- Better Auth exige la confirmation de l'adresse e-mail avant toute connexion et gère les liens temporaires de vérification et de réinitialisation du mot de passe. Les e-mails partent par l'API transactionnelle Brevo avec une clé serveur. Aucune clé n'est exposée au client.
- `project_members` reste la source de vérité de l'accès aux dossiers. Le propriétaire invite une adresse e-mail, même sans compte Mnemo. L'invitation en attente contient les droits proposés, mais ne donne aucun accès avant son acceptation par un compte connecté dont l'adresse est vérifiée. Le lien expire après sept jours, son jeton est conservé sous forme de hash et l'invitation est révocable. Le destinataire retrouve également ses invitations en attente dans « Mon compte », où il peut les accepter ou les refuser sans lien e-mail. Après acceptation, le membre reçoit un rôle de base (lecture ou édition), ainsi que les éventuels rôles personnalisés et droits individuels cumulables.
- Les types de permissions sont déclarés dans le code et contrôlés par les services serveur. Créer un rôle dans l'interface ne crée pas une permission technique nouvelle.
- Les migrations d'authentification et de droits sont séparées. Aucune migration de transfert du compte de développement n'est conservée.

## Conséquences

- Les actions serveur et les routes de données vérifient la session et le droit requis ; masquer un bouton n'est pas une protection suffisante.
- Un compte non vérifié ne peut ni ouvrir une session exploitable ni devenir membre d'un dossier. Les anciens cookies de session non vérifiés restent refusés par le résolveur d'acteur.
- Les invitations et les liens de vérification et de réinitialisation utilisent un modèle d'e-mail HTML commun, accompagné d'une version texte. Les liens sont envoyés uniquement par le serveur via Brevo.
- La récupération du mot de passe utilise un lien temporaire à usage unique ; elle invalide les sessions existantes. La demande répond de la même manière que l'adresse soit connue ou non.
