# Première mise en ligne de Mnemo sur Scalingo

Cette étape prépare `mnemo-web` comme **préproduction à accès partagé**. Elle ne met pas en place de comptes utilisateurs : après la saisie du mot de passe, toutes les personnes utilisent encore l'acteur de développement. Ne pas y déposer de données sensibles avant une vraie authentification et une revue des droits.

## Accès à la webapp

Un fichier `.htaccess` n'a aucun effet sur Next.js. La protection temporaire est un HTTP Basic Auth dans le `proxy.ts` de l'application. Sur Scalingo, l'application répond `503` tant que `MNEMO_DEPLOYMENT_ENV=staging` et les deux identifiants ne sont pas définis. Avec ces variables, les requêtes non authentifiées reçoivent `401` sur les pages, l'API et les ressources statiques. Le mode `production` reste bloqué tant qu'une véritable authentification n'existe pas.

Dans les variables d'environnement de **`mnemo-web` uniquement** :

| Variable                                                                                        | Valeur attendue                                |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `MNEMO_DEPLOYMENT_ENV`                                                                          | `staging`                                      |
| `MNEMO_AUTH_MODE`                                                                               | `development` (temporaire)                     |
| `MNEMO_STAGING_USER`                                                                            | Identifiant choisi pour les testeurs           |
| `MNEMO_STAGING_PASSWORD`                                                                        | Mot de passe long, distinct des autres secrets |
| `DATABASE_URL`                                                                                  | URL de l'addon PostgreSQL déjà rattaché        |
| `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Configuration OVH S3 existante                 |

Saisir le mot de passe dans le tableau de bord Scalingo ; ne jamais le committer, le transmettre dans le chat ni le placer dans une ligne de commande conservée par l'historique shell. `S3_DOCKER_ENDPOINT` sert uniquement à Docker Compose, pas à cette application Scalingo. Vérifier que l'accès HTTPS forcé est activé.

### CORS du bucket S3

Le navigateur envoie les originaux directement à `S3_PUBLIC_ENDPOINT` avec une URL `PUT` présignée, puis lit les fichiers et les octrees par URL `GET` présignée. Le bucket doit donc autoriser l'origine de la webapp, y compris pour les préflights `OPTIONS`. En préproduction, le bucket OVH `mnemo` utilise la règle suivante (les origines locales servent à `make dev-s3`) :

```json
{
  "ID": "mnemo-web-browser-access",
  "AllowedOrigins": [
    "https://mnemo-web.osc-secnum-fr1.scalingo.io",
    "http://localhost:3200",
    "http://127.0.0.1:3200"
  ],
  "AllowedMethods": ["GET", "HEAD", "PUT"],
  "AllowedHeaders": ["content-type", "range", "x-amz-*"],
  "ExposeHeaders": ["ETag", "Accept-Ranges", "Content-Range", "Content-Length"],
  "MaxAgeSeconds": 3000
}
```

Cette règle doit être appliquée dans la configuration CORS **du bucket**, pas dans l'environnement Scalingo ni dans Next.js. La permission CORS seule ne donne pas accès aux objets : les requêtes utilisent toujours une URL présignée. Lors d'un changement de domaine, mettre à jour `AllowedOrigins` sans utiliser `*`, puis vérifier un préflight `PUT` avec `Origin` et `Access-Control-Request-Method`, ainsi qu'un petit upload signé. Un fichier correctement déposé restera au statut « Reçu » tant qu'aucun worker ne traite la tâche associée.

## Build et lancement

`mnemo-web` doit être construit depuis **la racine du monorepo** : ne pas définir `PROJECT_DIR=apps/web`, car les packages `@mnemo/*` frères ne seraient pas présents. Le buildpack Node.js détecte `pnpm-lock.yaml`. Son hook `scalingo-postbuild` ne construit que `@mnemo/web`, puis copie les ressources statiques dans la sortie Next standalone. Le `Procfile` racine lance `web` sur le port fourni par Scalingo. Le workflow local `make dev` reste indépendant.

Après avoir committé et validé la branche, déployer le même dépôt Git vers l'application `mnemo-web` (ou la relier au dépôt GitHub). Un dépôt séparé n'est pas nécessaire. Vérifier les logs de build et le statut du conteneur avant d'ouvrir l'URL publique.

La base doit recevoir les migrations Prisma et l'acteur de développement doit être initialisé avant de créer des projets : `pnpm db:migrate` puis `pnpm db:seed` dans un one-off `mnemo-web`, après le premier build. Le CLI Prisma et `tsx` sont des dépendances d'exécution de `@mnemo/database` pour rester disponibles dans ce conteneur. Ne pas afficher `DATABASE_URL` dans les logs. Ce guide ne déclenche pas de migration automatique : elle sera validée lors du premier déploiement réel.

```bash
scalingo --region osc-secnum-fr1 --app mnemo-web run 'pnpm db:migrate'
scalingo --region osc-secnum-fr1 --app mnemo-web run 'pnpm db:seed'
```

## Vérification d'accès

1. Sans identifiants : `/`, `/projets` et `/api/health` doivent répondre `401` avec `WWW-Authenticate`.
2. Avec les identifiants : l'accueil et `/api/health` doivent répondre `200`.
3. Sans `MNEMO_STAGING_PASSWORD` ou sans `MNEMO_DEPLOYMENT_ENV=staging` : la webapp doit répondre `503` (échec fermé).
4. Vérifier ensuite les accès S3 depuis le navigateur, la base, puis les services IFC/point cloud séparément.

Le mot de passe partagé ne protège **pas** directement les URL S3 présignées déjà émises ni les autres applications Scalingo (`mnemo-ifc-rust`, `mnemo-potree`). Garder le bucket privé, limiter la durée des URL et protéger les endpoints des services avant de les rendre publics.

## Serveur IFC-Lite Rust

`mnemo-ifc-rust` est une application Scalingo distincte, construite depuis `PROJECT_DIR=infrastructure/scalingo-ifc-rust`. Ce dossier contient seulement le paquet binaire IFC-Lite épinglé, son lockfile, un `Procfile` et un lancement qui **refuse de démarrer** sans `IFC_SERVER_API_TOKEN`. Configurer un jeton aléatoire long dans l'environnement de cette application uniquement, ainsi que `MAX_FILE_SIZE_MB` et `WORKER_THREADS` selon la mémoire disponible. Aucun accès PostgreSQL ni S3 n'est nécessaire au binaire IFC-Lite actuel. Son cache dans `/tmp/mnemo-ifc-lite-cache` est éphémère : S3 reste la source des fichiers originaux.

Après le déploiement, vérifier que `/api/v1/health` répond `200` et qu'une route de calcul ou de cache répond `401` sans jeton. Ne pas placer `IFC_SERVER_API_TOKEN` dans `NEXT_PUBLIC_*`, dans les props React, ni dans l'URL du viewer. Un navigateur ne doit pas appeler directement ce service protégé avec un jeton global.

**Limite du flux actuel :** le viewer envoie les octets IFC en multipart à IFC-Lite. [L'ingress Scalingo limite une requête à 75 Mo](https://doc.scalingo.com/platform/networking/public/ingress), quel que soit le nombre de conteneurs. Un simple proxy Next.js ne supprime pas cette limite et retransférerait le fichier par `mnemo-web`. Pour les gros IFC, il faut une étape de traitement qui lit l'original depuis S3 côté serveur, appelle IFC-Lite hors ingress public, puis met des artefacts consultables à disposition du viewer. Le déploiement du serveur seul ne rend **pas encore** ce parcours opérationnel. L'API publique du serveur doit rester protégée par Bearer tant que cette intégration n'est pas réalisée.

Références : [Proxy Next.js](https://nextjs.org/docs/app/api-reference/file-conventions/proxy), [sortie standalone Next.js](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), [buildpack Node.js Scalingo](https://github.com/Scalingo/nodejs-buildpack), [pare-feu applicatif Scalingo](https://doc.scalingo.com/platform/networking/public/application-firewall).
