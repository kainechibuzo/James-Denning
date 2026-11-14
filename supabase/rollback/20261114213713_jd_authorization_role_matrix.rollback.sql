-- Restore the exact pre-migration definitions captured by 20261114213713_jd_authorization_role_matrix.
-- CREATE OR REPLACE preserves the existing function ACLs; all 15 were verified
-- as postgres + service_role only before and after the authorization migration.
do $$
declare
  v_backup record;
begin
  for v_backup in
    select function_definition
    from jd_private.authorization_function_backups
    where migration_name='20261114213713_jd_authorization_role_matrix'
    order by function_name, identity_arguments
  loop
    execute v_backup.function_definition;
  end loop;
end
$$;
