-- Retire the fire-safety preset while preserving saved views and custom rules.
UPDATE project_floor_plans
SET style = jsonb_set(style, '{preset}', '"architectural"'::jsonb),
    version = version + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE style->>'preset' = 'fire-safety';
