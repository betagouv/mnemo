# Déployer le staging sur Scalingo

Un seul dépôt, trois applications dans la région `osc-secnum-fr1` : `mnemo-web` (Next.js et orchestration), `mnemo-ifc-rust` (lecture des IFC) et `mnemo-potree` (nom historique, conversion **COPC** à la demande). Le développement local reste disponible avec `make dev`.

L'accès applicatif utilise un compte personnel Better Auth (e-mail et mot de passe). L'inscription est publique, mais la confirmation de l'adresse e-mail est obligatoire ; la réinitialisation du mot de passe passe par Brevo.

## 1. Configurer les applications

Renseigner les secrets dans **Environment** sur Scalingo, jamais dans Git. Les trois apps utilisent le même dépôt, mais pas les mêmes variables.

| App              | Configuration Scalingo                                             | Variables à renseigner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mnemo-web`      | Build depuis la racine ; `web` ≥ 1                                 | `BETTER_AUTH_URL` (URL HTTPS publique), `BETTER_AUTH_SECRET` (secret aléatoire d'au moins 32 caractères), `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` (expéditeur vérifié), `BREVO_SENDER_NAME`, `DATABASE_URL`, `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `IFC_SERVER_URL`, `IFC_SERVER_API_TOKEN`, `MNEMO_BACKGROUND_JOBS=1`, `POINT_CLOUD_PROCESSING_MODE=scalingo`, `SCALINGO_API_TOKEN`, `SCALINGO_APP=mnemo-potree`, `SCALINGO_REGION=osc-secnum-fr1` |
| `mnemo-ifc-rust` | `PROJECT_DIR=infrastructure/scalingo-ifc-rust` ; **un seul** `web` | `IFC_SERVER_API_TOKEN` (identique à celui de `mnemo-web`), `S3_ENDPOINT`, `S3_BUCKET`. Dimensionner `MAX_FILE_SIZE_MB` et le conteneur selon les IFC visés.                                                                                                                                                                                                                                                                                                                                                  |
| `mnemo-potree`   | `web=0` ; un one-off par conversion                                | `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`. Aucun accès PostgreSQL.                                                                                                                                                                                                                                                                                                                                                                                                           |

`mnemo-web` utilise son addon PostgreSQL. `IFC_SERVER_URL` pointe vers `mnemo-ifc-rust`. Le jeton `SCALINGO_API_TOKEN` doit pouvoir lancer des one-offs sur `mnemo-potree` ; régler au besoin `SCALINGO_ONE_OFF_SIZE` sur `mnemo-web` (un LAZ d'environ 2 Go a été testé en `3XL`). Rust reçoit une URL S3 présignée : il n'a besoin ni de clés S3 ni de `DATABASE_URL`.

Le bucket S3 doit rester privé. Configurer son **CORS** pour l'origine HTTPS de `mnemo-web` : méthodes `GET`, `HEAD`, `PUT`, en-têtes `content-type`, `range`, `x-amz-*`, et en-têtes exposés `ETag`, `Accept-Ranges`, `Content-Range`, `Content-Length`. Ajouter les origines `localhost` uniquement pour les tests locaux sur ce bucket. L'upload du navigateur et la lecture du COPC utilisent des URL présignées.

## 2. Déployer une révision

Avant de livrer la migration `20261015160000`, contrôler la base actuelle :

```sql
SELECT asset_id, format FROM point_cloud_processing_results
WHERE format <> 'copc-v1' OR copc_object_key IS NULL
   OR metadata_object_key IS NOT NULL OR hierarchy_object_key IS NOT NULL
   OR octree_object_key IS NOT NULL;
```

Si la requête retourne des lignes, supprimer ces actifs depuis **la version actuellement déployée**, attendre la fin de leurs tâches de suppression S3, puis vérifier à nouveau. Réenvoyer les originaux à conserver. La migration refuse de supprimer les anciennes colonnes tant qu'il reste des références ; ne pas la forcer.

Depuis la racine du dépôt, après avoir committé les changements à livrer. L'archive ci-dessous contient **uniquement `HEAD`** ; elle exclut les modifications non committées. Le dossier `master/` à sa racine est requis par le déploiement depuis une archive.

```bash
deploy_dir=$(mktemp -d)
revision=$(git rev-parse --short HEAD)
git archive --format=tar --prefix=master/ HEAD | gzip > "$deploy_dir/mnemo.tar.gz"

scalingo --region osc-secnum-fr1 --app mnemo-ifc-rust deploy "$deploy_dir/mnemo.tar.gz" "$revision"
scalingo --region osc-secnum-fr1 --app mnemo-web deploy "$deploy_dir/mnemo.tar.gz" "$revision"
```

Après le déploiement de `mnemo-web`, appliquer les migrations de base de données :

```bash
scalingo --region osc-secnum-fr1 --app mnemo-web run 'pnpm db:migrate'
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
- Ouvrir la webapp : l'accueil est public, les dossiers demandent une connexion. Créer un compte, confirmer l'adresse depuis le lien Brevo, se connecter, puis vérifier la déconnexion et la réinitialisation du mot de passe. Sans `BETTER_AUTH_URL` ou `BETTER_AUTH_SECRET`, l'application répond `503`. Sans clé Brevo ou expéditeur vérifié, les e-mails ne peuvent pas partir.
- Envoyer un IFC et un LAZ depuis l'interface. L'IFC doit devenir visualisable ; le LAZ doit déclencher un one-off `mnemo-potree`, produire un `cloud.copc.laz` sur S3, puis s'afficher dans le viewer.
- En cas d'échec, consulter les logs de l'app concernée et `scalingo --region osc-secnum-fr1 --app mnemo-potree ps` pendant la conversion. L'application attend la réponse de Brevo avant de terminer la demande d'e-mail ; cette réponse confirme la prise en charge, pas la livraison finale. Si un message n'arrive pas, vérifier les logs Brevo puis redemander un lien.

Les responsabilités et les choix techniques sont détaillés dans [l'ADR S3/traitement à la demande](../adr/0015-s3-native-ifc-and-oneoff-processing.md).
