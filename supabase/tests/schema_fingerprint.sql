-- Produces a stable fingerprint of the application-owned database schema.
-- Run against both local and linked databases before adopting a baseline.
WITH schema_objects AS (
  SELECT
    'table' AS object_type,
    jsonb_build_object(
      'schema', namespace.nspname,
      'name', relation.relname,
      'kind', relation.relkind,
      'rls', relation.relrowsecurity,
      'force_rls', relation.relforcerowsecurity
    )::text AS definition
  FROM pg_class relation
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind IN ('r', 'p', 'v', 'm', 'S')

  UNION ALL

  SELECT
    'column',
    jsonb_build_object(
      'schema', table_schema,
      'table', table_name,
      'name', column_name,
      'type', data_type,
      'udt', udt_schema || '.' || udt_name,
      'nullable', is_nullable,
      'default', column_default,
      'identity', is_identity,
      'generated', is_generated,
      'generation_expression', generation_expression
    )::text
  FROM information_schema.columns
  WHERE table_schema = 'public'

  UNION ALL

  SELECT
    'constraint',
    jsonb_build_object(
      'schema', namespace.nspname,
      'table', relation.relname,
      'name', constraint_row.conname,
      'type', constraint_row.contype,
      'definition', pg_get_constraintdef(constraint_row.oid, true)
    )::text
  FROM pg_constraint constraint_row
  JOIN pg_class relation ON relation.oid = constraint_row.conrelid
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'

  UNION ALL

  SELECT
    'index',
    jsonb_build_object(
      'schema', schemaname,
      'table', tablename,
      'name', indexname,
      'definition', indexdef
    )::text
  FROM pg_indexes
  WHERE schemaname = 'public'

  UNION ALL

  SELECT
    'function',
    jsonb_build_object(
      'schema', namespace.nspname,
      'identity', procedure.proname || '(' || pg_get_function_identity_arguments(procedure.oid) || ')',
      'definition', CASE
        -- Seed labels and their formula mappings are deployment configuration
        -- rather than schema. Older private deployments may intentionally
        -- retain household-specific labels while sharing the same contracts.
        WHEN procedure.proname IN ('seed_workbook_constants', 'sync_seeded_recurring_formulas')
        THEN jsonb_build_object(
          'result', pg_get_function_result(procedure.oid),
          'language', language.lanname,
          'security_definer', procedure.prosecdef,
          'volatility', procedure.provolatile,
          'config', procedure.proconfig
        )::text
        ELSE pg_get_functiondef(procedure.oid)
      END
    )::text
  FROM pg_proc procedure
  JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
  JOIN pg_language language ON language.oid = procedure.prolang
  WHERE namespace.nspname = 'public'

  UNION ALL

  SELECT
    'policy',
    jsonb_build_object(
      'schema', schemaname,
      'table', tablename,
      'name', policyname,
      'permissive', permissive,
      'roles', roles,
      'command', cmd,
      'using', qual,
      'check', with_check
    )::text
  FROM pg_policies
  WHERE schemaname = 'public'

  UNION ALL

  SELECT
    'trigger',
    jsonb_build_object(
      'table_schema', table_namespace.nspname,
      'table', relation.relname,
      'name', trigger_row.tgname,
      'definition', pg_get_triggerdef(trigger_row.oid, true)
    )::text
  FROM pg_trigger trigger_row
  JOIN pg_class relation ON relation.oid = trigger_row.tgrelid
  JOIN pg_namespace table_namespace ON table_namespace.oid = relation.relnamespace
  JOIN pg_proc procedure ON procedure.oid = trigger_row.tgfoid
  JOIN pg_namespace function_namespace ON function_namespace.oid = procedure.pronamespace
  WHERE NOT trigger_row.tgisinternal
    AND (table_namespace.nspname = 'public' OR function_namespace.nspname = 'public')

  UNION ALL

  SELECT
    'sequence',
    jsonb_build_object(
      'schema', sequence_schema,
      'name', sequence_name,
      'type', data_type,
      'start', start_value,
      'minimum', minimum_value,
      'maximum', maximum_value,
      'increment', increment,
      'cycle', cycle_option
    )::text
  FROM information_schema.sequences
  WHERE sequence_schema = 'public'

  UNION ALL

  SELECT
    'extension',
    jsonb_build_object(
      'name', extension.extname,
      'schema', namespace.nspname
    )::text
  FROM pg_extension extension
  JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
  WHERE extension.extname IN ('pg_net', 'pg_stat_statements', 'pgcrypto', 'supabase_vault', 'uuid-ossp')

  UNION ALL

  SELECT
    'table_grant',
    jsonb_build_object(
      'schema', table_schema,
      'table', table_name,
      'grantee', grantee,
      'privilege', privilege_type,
      'grantable', is_grantable
    )::text
  FROM information_schema.table_privileges
  WHERE table_schema = 'public'
    AND grantee IN ('anon', 'authenticated', 'service_role')

  UNION ALL

  SELECT
    'routine_grant',
    jsonb_build_object(
      'schema', routine_schema,
      'routine', routine_name,
      'specific_name', specific_name,
      'grantee', grantee,
      'privilege', privilege_type,
      'grantable', is_grantable
    )::text
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND grantee IN ('anon', 'authenticated', 'service_role')
)
SELECT
  md5(string_agg(object_type || ':' || definition, E'\n' ORDER BY object_type, definition)) AS schema_fingerprint,
  count(*) AS object_count
FROM schema_objects;
