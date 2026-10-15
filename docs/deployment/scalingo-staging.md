# Déployer le staging sur Scalingo

Un seul dépôt, trois applications dans la région `osc-secnum-fr1` : `mnemo-web` (Next.js et orchestration), `mnemo-ifc-rust` (lecture des IFC) et `mnemo-potree` (nom historique, conversion **COPC** à la demande). Le développement local reste disponible avec `make dev`.

> Ce staging utilise un accès Basic Auth partagé et un utilisateur applicatif de développement. Ne pas y déposer de données sensibles avant la mise en place d'une véritable authentification.

## 1. Configurer les applications

Renseigner les secrets dans **Environment** sur Scalingo, jamais dans Git. Les trois apps utilisent le même dépôt, mais pas les mêmes variables.

| App              | Configuration Scalingo                                             | Variables à renseigner                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mnemo-web`      | Build depuis la racine ; `web` ≥ 1                                 | `MNEMO_DEPLOYMENT_ENV=staging`, `MNEMO_AUTH_MODE=development`, `MNEMO_STAGING_USER`, `MNEMO_STAGING_PASSWORD`, `DATABASE_URL`, `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `IFC_SERVER_URL`, `IFC_SERVER_API_TOKEN`, `MNEMO_BACKGROUND_JOBS=1`, `POINT_CLOUD_PROCESSING_MODE=scalingo`, `SCALINGO_API_TOKEN`, `SCALINGO_APP=mnemo-potree`, `SCALINGO_REGION=osc-secnum-fr1` |
| `mnemo-ifc-rust` | `PROJECT_DIR=infrastructure/scalingo-ifc-rust` ; **un seul** `web` | `IFC_SERVER_API_TOKEN` (identique à celui de `mnemo-web`), `S3_ENDPOINT`, `S3_BUCKET`. Dimensionner `MAX_FILE_SIZE_MB` et le conteneur selon les IFC visés.                                                                                                                                                                                                                                                                      |
| `mnemo-potree`   | `web=0` ; un one-off par conversion                                | `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`. Aucun accès PostgreSQL.                                                                                                                                                                                                                                                                                                                               |

`mnemo-web` utilise son addon PostgreSQL. `IFC_SERVER_URL` pointe vers `mnemo-ifc-rust`. Le jeton `SCALINGO_API_TOKEN` doit pouvoir lancer des one-offs sur `mnemo-potree` ; régler au besoin `SCALINGO_ONE_OFF_SIZE` sur `mnemo-web` (un LAZ d'environ 2 Go a été testé en `3XL`). Rust reçoit une URL S3 présignée : il n'a besoin ni de clés S3 ni de `DATABASE_URL`.

Le bucket S3 doit rester privé. Configurer son **CORS** pour l'origine HTTPS de `mnemo-web` : méthodes `GET`, `HEAD`, `PUT`, en-têtes `content-type`, `range`, `x-amz-*`, et en-têtes exposés `ETag`, `Accept-Ranges`, `Content-Range`, `Content-Length`. Ajouter les origines `localhost` uniquement pour les tests locaux sur ce bucket. L'upload du navigateur et la lecture du COPC utilisent des URL présignées.

## 2. Déployer une révision

Depuis la racine du dépôt, après avoir committé les changements à livrer. L'archive ci-dessous contient **uniquement `HEAD`** ; elle exclut les modifications non committées. Le dossier `master/` à sa racine est requis par le déploiement depuis une archive.

```bash
deploy_dir=$(mktemp -d)
revision=$(git rev-parse --short HEAD)
git archive --format=tar --prefix=master/ HEAD | gzip > "$deploy_dir/mnemo.tar.gz"

scalingo --region osc-secnum-fr1 --app mnemo-ifc-rust deploy "$deploy_dir/mnemo.tar.gz" "$revision"
scalingo --region osc-secnum-fr1 --app mnemo-web deploy "$deploy_dir/mnemo.tar.gz" "$revision"
```

Après le premier déploiement de `mnemo-web`, initialiser sa base. Relancer les migrations lors des évolutions du schéma ; le seed n'est nécessaire qu'à l'initialisation.

```bash
scalingo --region osc-secnum-fr1 --app mnemo-web run 'pnpm db:migrate'
scalingo --region osc-secnum-fr1 --app mnemo-web run 'pnpm db:seed'
```

Si le code de conversion COPC a changé, construire et déployer séparément son paquet. L'app n'a aucun conteneur permanent : conserver `web=0`.

```bash
deploy_dir=$(mktemp -d)
revision=$(git rev-parse --short HEAD)
pnpm --filter @mnemo/processing-worker build
pnpm --filter @mnemo/processing-worker package:scalingo "$deploy_dir/copc/master"
tar -C "$deploy_dir/copc" -czf "$deploy_dir/copc.tar.gz" master

scalingo --region osc-secnum-fr1 --app mnemo-potree scale web:0:M
scalingo --region osc-secnum-fr1 --app mnemo-potree deploy "$deploy_dir/copc.tar.gz" "$revision"
```

## 3. Vérifier

- Dans **Deploy** et **Logs**, confirmer que les builds ont réussi ; dans **Resources**, vérifier `web ≥ 1` pour `mnemo-web`, `web = 1` pour Rust et `web = 0` pour COPC.
- Ouvrir la webapp : `401` sans identifiants, accès avec le Basic Auth. Un staging sans identifiants configurés doit répondre `503`.
- Envoyer un IFC et un LAZ depuis l'interface. L'IFC doit devenir visualisable ; le LAZ doit déclencher un one-off `mnemo-potree`, produire un `cloud.copc.laz` sur S3, puis s'afficher dans le viewer.
- En cas d'échec, consulter les logs de l'app concernée et `scalingo --region osc-secnum-fr1 --app mnemo-potree ps` pendant la conversion.

Les responsabilités et les choix techniques sont détaillés dans [l'ADR S3/traitement à la demande](../adr/0015-s3-native-ifc-and-oneoff-processing.md).
