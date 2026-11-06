# RFC 0001 — Optimiser la génération des vues en plan

- Statut proposé, à discuter
- Date du 6 novembre 2026
- Périmètre de tous les modèles IFC pris en charge par Mnemo

## Objectif

Réduire fortement le délai entre la sélection d'un niveau et l'affichage de son
plan complet, y compris sur des IFC volumineux ou géométriquement complexes.
Cette RFC prépare une décision et une implémentation ultérieures.

Le problème concerne le pipeline général de génération. Les fenêtres lentes
observées dans un modèle constituent un cas de reproduction utile. Le traitement
devra aussi fonctionner pour les murs, dalles, escaliers, réseaux, équipements et
autres classes IFC, sans introduire de raccourci propre à une classe ou un fichier.

## Fonctionnement actuel

Le viewer sélectionne les maillages proches du niveau. Il transfère des copies de
leurs positions et indices à un worker navigateur annulable. IFC-Lite effectue la
coupe, construit les polygones, projette les objets, traite leur visibilité et
fusionne les lignes. La projection utilise le fournisseur WASM `meshOutline2d`.

Un cache mémoire borné conserve les plans pendant la vie du viewer. PostgreSQL
conserve les paramètres des vues enregistrées. La géométrie calculée peut donc
être régénérée lors d'une nouvelle consultation. Le rendu et les interactions
pan/zoom constituent une étape distincte du calcul de cette géométrie.

## Observations mesurées

Mesures locales du 6 novembre 2026, sur des maillages déjà chargés et préparés.
Les durées excluent le téléchargement de l'IFC, son traitement initial côté
serveur, la préparation complète du viewer et l'affichage final du plan. Les
essais utilisent la correction des projections supérieures proposée dans la PR
[#53](https://github.com/betagouv/mnemo/pull/53).

| Cas                                                                            | Projection sous la coupe | Durée du calcul |
| ------------------------------------------------------------------------------ | ------------------------ | --------------- |
| HVAC, niveau `01_Kerros`, environ 4,07 millions de triangles sélectionnés      | 3 m                      | 6,9–7,1 s       |
| Même cas HVAC                                                                  | 1,20 m                   | 2,4–2,5 s       |
| ABM HUMA, niveau `R+2 - brut`, environ 2,62 millions de triangles sélectionnés | 3 m                      | 98,5 s          |
| Même cas ABM HUMA                                                              | 1,20 m                   | 95,3 s          |

Sur le cas ABM HUMA, la découpe prend environ 0,3 s. L'étape de projection prend
93 à 96 s. Dans l'essai à 1,20 m, les appels au fournisseur de contours cumulent
environ 92 s. Certains objets prennent plusieurs secondes individuellement.
L'utilisateur a constaté une attente de 3 min 49 s dans son environnement.
Cette durée complète reste à instrumenter et à réconcilier avec les mesures
isolées.

Un essai du découpeur GPU d'IFC-Lite sur le cas HVAC, avec une RTX 4060 et des lots
bornés, a pris 0,41–0,57 s contre 0,17 s pour la découpe CPU. Il a conservé les
mêmes nombres de segments et de polygones, avec un écart maximal mesuré d'environ
0,011 mm sur les segments. Cet essai porte sur la découpe, alors que le coût
dominant observé sur ABM HUMA se situe dans les contours projetés.

Ces résultats montrent que le poids du fichier et le nombre total de triangles
ne suffisent pas à prédire le coût du plan. Un gain observé sur un IFC doit être
vérifié sur un corpus varié.

## Sémantique de la vue en plan

La coupe attendue se situe à 1,20 m au-dessus du sol du niveau. La profondeur de
projection jusqu'au sol serait donc de 1,20 m. La configuration utilisée pour les mesures applique
une profondeur de 3 m sous la coupe et de 0 m au-dessus.

La profondeur retenue devra être explicitée et validée fonctionnellement, avec
les cas de niveaux décalés, de sous-faces et d'altitudes IFC atypiques. Réduire une
bande de projection change les éléments visibles. Conserver les polygones coupés
ne suffit pas à prouver l'équivalence de deux plans complets.

## Pistes à comparer

### Optimisation générale dans IFC-Lite

Profiler les objets coûteux et les opérations de projection, de découpage des
bandes, d'union et de visibilité. Évaluer la déduplication exacte des triangles
projetés, le regroupement spatial des unions et la réutilisation de géométries
réellement identiques. Vérifier les contours résultants et les trous pour chaque
optimisation. Les bénéfices de ces pistes restent à mesurer.

Une réutilisation devra prendre en compte la géométrie, son orientation et sa
position relative à la coupe. Deux objets de même classe IFC ou de même type ne
garantissent pas une projection identique.

### Calcul navigateur parallèle

Comparer le worker actuel à un nombre borné de workers pour les opérations
indépendantes par maillage. Mesurer le coût des transferts, les allocations et la
mémoire cumulée. Préserver l'annulation et le résultat final de visibilité et de
fusion. Le parallélisme peut réduire l'attente, mais son gain dépend du matériel
et des objets dominants.

### Calcul serveur à la demande avec cache durable

À la première demande d'un niveau, lancer un calcul durable et conserver sa
géométrie vectorielle dans un objet S3 privé. Les demandes concurrentes portant
sur le même calcul partagent le travail. Les consultations suivantes réutilisent
le résultat. Comparer le moteur Rust natif et le chemin WASM sur les mêmes données
pour mesurer le gain éventuel du premier calcul.

### Pré-calcul serveur après le téléversement

Après validation du dépôt sur S3 et disponibilité de la géométrie et des niveaux,
une tâche d'arrière-plan pourrait générer les plans standards du modèle. Chaque
niveau deviendrait consultable dès son résultat disponible. Le traitement aurait
une concurrence et des budgets mémoire bornés, ainsi qu'une reprise par niveau.

Cette approche anticipe le coût avant l'ouverture du plan. Elle consomme aussi
des ressources pour des niveaux qui peuvent ne jamais être consultés. Il faudra
comparer un pré-calcul de tous les niveaux, un calcul à la demande et une approche
hybride donnant priorité au niveau demandé. Le dépôt et l'accès à la 3D doivent
pouvoir aboutir indépendamment de la génération des plans.

## Contrats d'une éventuelle exécution serveur

- PostgreSQL conserve les états des tâches et les références aux résultats.
  S3 conserve les originaux et les géométries dérivées.
- La clé d'un résultat inclut l'identité du contenu IFC, le niveau, la hauteur de
  coupe, les profondeurs, les paramètres affectant la géométrie et la version du
  générateur. Les couleurs et les épaisseurs de rendu restent séparées quand elles
  ne modifient que la présentation.
- Les résultats gardent les identifiants nécessaires aux propriétés et aux règles
  de style. Ils conservent les unités et les conventions de coordonnées du viewer,
  notamment les origines décalées et le placement dans une scène fédérée.
- Les lectures, statuts et téléchargements appliquent les permissions du dossier.
  Les artefacts restent privés et les accès S3 temporaires restent limités aux
  objets autorisés. Une clé fondée sur le contenu ne donne aucun accès transversal
  entre dossiers.
- Les calculs sont idempotents, avec exclusion des doublons, reprises bornées et
  versionnement. Une suppression d'asset doit aussi empêcher la publication d'un
  résultat tardif et nettoyer ses dérivés S3.
- L'exécution s'intègre aux frontières de traitement existantes. Le choix entre
  service Rust existant et processus jetable dépendra des mesures de charge et
  des coûts. Une évolution de l'ADR 0015 devra accompagner la décision retenue.

## Expérience utilisateur

Évaluer un affichage précoce des contours coupés, suivi des projections complètes.
L'interface doit identifier explicitement cet état provisoire et annoncer quand
le plan est complet. Les mesures et exports devront avoir un comportement défini
pendant cette phase. Fournir des états compréhensibles pour l'attente, le calcul,
l'échec, la reprise et l'annulation selon le mode d'exécution retenu.

## Validation attendue avant décision

1. Instrumenter le parcours complet, du clic jusqu'au plan utilisable, avec les
   durées par étape, la mémoire maximale, les tailles transférées et les volumes
   de géométrie. Distinguer premier calcul, cache chaud et nouvelle consultation.
2. Constituer un corpus d'IFC de tailles, schémas et producteurs variés, avec BRep,
   géométries extrudées, répétitions, formes courbes, ouvertures, objets traversant
   plusieurs niveaux, unités et coordonnées différentes. Inclure plusieurs étages
   et disciplines. Garder les modèles privés dans un stockage autorisé.
3. Comparer chaque variante sur ce corpus et publier les médianes, les cas les plus
   lents et les régressions. Fixer ensuite des objectifs chiffrés de délai et de
   mémoire adaptés aux environnements client et serveur.
4. Vérifier la géométrie, les trous, les ouvertures, les occultations, les dimensions,
   l'accrochage et le PDF. Toute tolérance géométrique ou approximation proposée
   doit être explicite et validée.
5. Tester les calculs concurrents, les interruptions, les erreurs, l'invalidation,
   les suppressions pendant un calcul et les autorisations des résultats cachés.
6. Comparer le coût d'exploitation et le délai de disponibilité des variantes
   serveur après dépôt et à la demande. Retenir l'approche après ces mesures.

## Références

- [Suivi du chantier dans l'issue #52](https://github.com/betagouv/mnemo/issues/52)

- [ADR 0015 — Stockage S3 et traitements](../adr/0015-s3-native-ifc-and-oneoff-processing.md)
- [Génération actuelle des plans](../../packages/ifc-viewer-adapter/src/floor-plan-generator.ts)
- [Configuration du calcul IFC-Lite](../../packages/ifc-viewer-adapter/src/floor-plan-computation.ts)
- [Fournisseur de contours WASM](../../packages/ifc-viewer-adapter/src/floor-plan-outline.ts)
- [Algorithme de projection IFC-Lite](https://github.com/LTplus-AG/ifc-lite/blob/main/rust/geometry/src/projection_outline.rs)
