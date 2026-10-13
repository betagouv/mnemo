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
| `IFC_SERVER_URL`, `IFC_SERVER_API_TOKEN`                                                        | URL Rust et jeton privé partagé avec Rust      |
| `MNEMO_BACKGROUND_JOBS`                                                                         | `1` : tâches durables orchestrées dans Next    |
| `POINT_CLOUD_PROCESSING_MODE`                                                                   | `scalingo`                                     |
| `SCALINGO_API_TOKEN`, `SCALINGO_APP`, `SCALINGO_REGION`                                         | Jeton API, `mnemo-potree`, `osc-secnum-fr1`    |

Saisir les secrets dans le tableau de bord Scalingo ; ne jamais les committer, les transmettre dans le chat ni les placer dans une ligne de commande conservée par l'historique shell. `S3_DOCKER_ENDPOINT` et `S3_PROCESSING_ENDPOINT` servent uniquement au développement local avec MinIO, pas à cette application Scalingo. Vérifier que l'accès HTTPS forcé est activé.

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

Cette règle doit être appliquée dans la configuration CORS **du bucket**, pas dans l'environnement Scalingo ni dans Next.js. La permission CORS seule ne donne pas accès aux objets : les requêtes utilisent toujours une URL présignée. Lors d'un changement de domaine, mettre à jour `AllowedOrigins` sans utiliser `*`, puis vérifier un préflight `PUT` avec `Origin` et `Access-Control-Request-Method`, ainsi qu'un petit upload signé. Un IFC confirmé par `HeadObject` passe directement à « Prêt » ; son calcul géométrique démarre à l'ouverture du viewer. Un nuage de points entre dans la file durable de conversion.

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

`mnemo-ifc-rust` est une application Scalingo distincte, construite depuis `PROJECT_DIR=infrastructure/scalingo-ifc-rust`. Elle lance une passerelle Node légère avec le binaire IFC-Lite Rust dans le **même conteneur** : ce n'est pas une quatrième application ni un worker permanent. Configurer `IFC_SERVER_API_TOKEN`, `S3_ENDPOINT`, `S3_BUCKET`, `MAX_FILE_SIZE_MB` et `WORKER_THREADS`. La passerelle ne possède ni clé S3 ni accès PostgreSQL : elle reçoit de `mnemo-web` une URL GET présignée pour un seul objet, vérifie son origine et son préfixe, puis diffuse l'original vers le parseur Rust via le réseau interne du conteneur. `MAX_FILE_SIZE_MB` et la taille du conteneur doivent couvrir les modèles visés. `INITIAL_BATCH_SIZE=10` et `MAX_BATCH_SIZE=10` sont les valeurs par défaut pour limiter les pics mémoire côté navigateur, même si quelques maillages individuels sont très volumineux. Le cache Rust est éphémère ; S3 conserve les originaux.

Garder **un seul conteneur web** pour cette application tant que son cache IFC-Lite reste local au conteneur : le flux de géométrie et la requête suivante du modèle de données doivent atteindre le même cache. Une réplication future nécessite un cache partagé ou un protocole de réponse qui n'en dépend plus.

Après le déploiement, vérifier que `/api/v1/health` répond `200` et qu'une route de calcul ou de cache répond `401` sans jeton. Ne pas placer `IFC_SERVER_API_TOKEN` dans `NEXT_PUBLIC_*`, dans les props React, ni dans l'URL du viewer. Un navigateur ne doit pas appeler directement ce service protégé avec un jeton global.

Le navigateur dépose l'IFC **directement dans S3** avec un PUT signé ; il ne fait pas transiter l'original par Next.js, ce qui évite [la limite d'ingress Scalingo de 75 Mo par requête](https://doc.scalingo.com/platform/networking/public/ingress). À l'ouverture, `mnemo-web` vérifie les droits et remet l'URL GET courte à Rust. Le viewer consomme les lots Parquet et le modèle de données via les routes Next.js authentifiées, sans télécharger l'original pour les IFC au-dessus du seuil `IFC_BROWSER_PROCESSING_MAX_BYTES` (25 MiB par défaut ; `0` pour forcer Rust). Les lots de réponse et la mémoire du parseur restent à dimensionner et à éprouver avec les plus grands IFC réels.
La passerelle envoie des signaux SSE de maintien pendant la préparation et entre les lots complets ; [Scalingo impose un premier octet sous 30 s puis des données au moins toutes les 60 s](https://doc.scalingo.com/platform/networking/public/routing). Vérifier néanmoins ces délais de bout en bout avec de vrais fichiers stockés chez OVH.

## Conversion Potree à la demande

`mnemo-web` possède la file PostgreSQL durable, le contrôle d'accès et les reprises. Avec `MNEMO_BACKGROUND_JOBS=1`, sa boucle de fond orchestre les tâches de suppression et lance un one-off sur `mnemo-potree` pour chaque nuage LAS/LAZ. Le conteneur `web` de cette app est dimensionné à zéro hors one-off. Le job reçoit uniquement un message contenant les clés d'objets et lit/écrit dans S3 avec ses propres variables `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`. Il n'a ni `DATABASE_URL` ni accès à Rust. Le résultat est communiqué par un objet S3 ; Next met à jour PostgreSQL.

L'app Potree **ne peut pas** être déployée directement depuis `PROJECT_DIR=infrastructure/scalingo-octree` : ce dossier est un modèle de build et ne contient pas le bundle JavaScript. Depuis la racine du monorepo, construire `@mnemo/processing-worker`, puis exécuter `pnpm --filter @mnemo/processing-worker package:scalingo <répertoire-vide>`. Mettre le contenu produit dans un sous-dossier `master/` d'une archive `.tar.gz`, puis déployer cette archive avec `scalingo --region osc-secnum-fr1 --app mnemo-potree deploy <archive.tar.gz>`. [Scalingo documente ce format d'archive](https://doc.scalingo.com/platform/deployment/deploy-from-archive). Mettre `web` à zéro **avant** le déploiement ; le `Procfile` n'est qu'un point d'entrée pour les one-offs et ne doit pas démarrer comme serveur HTTP. Vérifier les droits S3 minimaux et tester un nuage avant d'ouvrir la plateforme aux utilisateurs.

Le paquet cherche automatiquement son convertisseur dans `bin/potree-converter` ; `POTREE_CONVERTER_PATH` n'est nécessaire que pour utiliser un autre binaire. Après le premier déploiement, lancer un vrai job de test : `bin/potree-converter --help` vérifie seulement le binaire, pas la configuration du point d'entrée ni l'écriture S3.

Références : [Proxy Next.js](https://nextjs.org/docs/app/api-reference/file-conventions/proxy), [sortie standalone Next.js](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), [buildpack Node.js Scalingo](https://github.com/Scalingo/nodejs-buildpack), [pare-feu applicatif Scalingo](https://doc.scalingo.com/platform/networking/public/application-firewall).
