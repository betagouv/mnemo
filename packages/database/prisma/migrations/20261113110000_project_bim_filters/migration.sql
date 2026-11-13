CREATE TABLE "project_bim_filters" (
  "project_id" UUID NOT NULL,
  "settings" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_bim_filters_pkey" PRIMARY KEY ("project_id"),
  CONSTRAINT "project_bim_filters_project_id_fkey" FOREIGN KEY ("project_id")
    REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Reissue group/rule UUIDs so independent model documents can share one namespace.
-- The latest model settings supply the project's shared context preferences.
WITH converted AS (
  SELECT a.project_id, a.created_at, old.asset_id, old.updated_at,
    old.settings AS previous_settings, groups.ordinality AS position,
    groups.value || jsonb_build_object(
      'id', gen_random_uuid()::text,
      'assetIds', jsonb_build_array(old.asset_id::text),
      'rules', COALESCE((
        SELECT jsonb_agg(rule.value || jsonb_build_object(
          'id', gen_random_uuid()::text,
          'query', ((rule.value->'query') - 'storeyIds') || jsonb_build_object(
            'storeys', COALESCE((
              SELECT jsonb_agg(jsonb_build_object('assetId', old.asset_id::text, 'storeyId', level.value) ORDER BY level.ordinality)
              FROM jsonb_array_elements(rule.value->'query'->'storeyIds') WITH ORDINALITY AS level(value, ordinality)
            ), '[]'::jsonb)
          )
        ) ORDER BY rule.ordinality)
        FROM jsonb_array_elements(groups.value->'rules') WITH ORDINALITY AS rule(value, ordinality)
      ), '[]'::jsonb)
    ) AS filter_group
  FROM model_bim_filters old
  JOIN assets a ON a.id = old.asset_id
  LEFT JOIN LATERAL jsonb_array_elements(old.settings->'groups') WITH ORDINALITY AS groups(value, ordinality) ON true
  WHERE a.kind = 'ifc' AND a.status = 'ready'
)
INSERT INTO project_bim_filters (project_id, settings, updated_at)
SELECT project_id, jsonb_build_object(
  'groups', COALESCE(jsonb_agg(filter_group ORDER BY created_at, asset_id, position) FILTER (WHERE filter_group IS NOT NULL), '[]'::jsonb),
  'showContext', (array_agg(previous_settings->'showContext' ORDER BY updated_at DESC, asset_id))[1],
  'contextOpacity', (array_agg(previous_settings->'contextOpacity' ORDER BY updated_at DESC, asset_id))[1]
), max(updated_at)
FROM converted GROUP BY project_id;

DROP TABLE model_bim_filters;
